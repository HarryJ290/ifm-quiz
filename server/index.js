import express from 'express';
import cors from 'cors';
import mongoose from 'mongoose';
import crypto from 'crypto';
import { QUESTIONS } from './questions.js';

// ---------- Config (walkthrough: change the timer here) ----------
const QUESTION_SECONDS = Number(process.env.QUESTION_SECONDS) || 20;
const REVEAL_SECONDS = Number(process.env.REVEAL_SECONDS) || 8;
const START_DELAY_MS = 3000;
const MAX_PLAYERS = 50;
const Q_MS = QUESTION_SECONDS * 1000;
const R_MS = REVEAL_SECONDS * 1000;

if (!process.env.MONGODB_URI) {
  console.error('MONGODB_URI is not set');
  process.exit(1);
}

// ---------- Data ----------
const PlayerSchema = new mongoose.Schema(
  {
    token: String, // private seat key, kept in the player's browser
    name: String,
    nameKey: String,
    score: { type: Number, default: 0 },
    answers: [{ q: Number, choice: Number, points: Number, _id: false }],
  },
  { _id: false }
);
const Game = mongoose.model(
  'Game',
  new mongoose.Schema({
    code: { type: String, unique: true },
    hostToken: String,
    startedAt: { type: Date, default: null },
    players: [PlayerSchema],
    createdAt: { type: Date, default: Date.now, expires: 60 * 60 * 24 }, // auto-delete after 24h
  })
);

// ---------- Helpers ----------
const rand = (n) => crypto.randomBytes(n).toString('hex');
const CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const makeCode = () => Array.from({ length: 4 }, () => CHARS[crypto.randomInt(CHARS.length)]).join('');
const safeEq = (a, b) => a.length === b.length && crypto.timingSafeEqual(Buffer.from(a), Buffer.from(b));
const publicQ = (q) => ({ text: q.text, options: q.options }); // NO correct answer, NO source
const ranked = (g) =>
  [...g.players].sort((a, b) => b.score - a.score).map((p, i) => ({ rank: i + 1, name: p.name, score: p.score }));

// The whole game clock is derived from startedAt. No timers, so restarts can't break it.
function phase(g, now = Date.now()) {
  if (!g.startedAt) return { phase: 'lobby' };
  const el = now - new Date(g.startedAt).getTime();
  if (el < 0) return { phase: 'starting', msLeft: -el };
  const cycle = Q_MS + R_MS;
  if (el >= cycle * QUESTIONS.length) return { phase: 'finished' };
  const q = Math.floor(el / cycle);
  const within = el % cycle;
  return within < Q_MS
    ? { phase: 'question', q, msLeft: Q_MS - within }
    : { phase: 'reveal', q, msLeft: cycle - within };
}

const wrap = (fn) => (req, res, next) => fn(req, res).catch(next);
const codeOf = (req) => String(req.params.code || '').toUpperCase();

async function hostGame(req, res) {
  const g = await Game.findOne({ code: codeOf(req) }).lean();
  if (!g) return res.status(404).json({ error: 'Room not found.' }), null;
  if (!safeEq(req.get('x-host-token') || '', g.hostToken)) return res.status(401).json({ error: 'Not allowed.' }), null;
  return g;
}
async function playerGame(req, res) {
  const g = await Game.findOne({ code: codeOf(req) }).lean();
  if (!g) return res.status(404).json({ error: 'This game has ended or does not exist.' }), {};
  const tok = req.get('x-player-token') || '';
  const me = g.players.find((p) => safeEq(tok, p.token));
  if (!me) return res.status(401).json({ error: 'We could not find your seat in this game.' }), {};
  return { g, me };
}

// ---------- App ----------
const app = express();
app.disable('x-powered-by');
app.use(express.json({ limit: '10kb' }));
app.use(cors({ origin: process.env.CLIENT_ORIGIN ? process.env.CLIENT_ORIGIN.split(',') : true }));

// No endpoint lists games or players. Every read needs a room code AND a private token (rule 6).
app.get('/health', (_req, res) => res.json({ ok: true }));

app.post('/api/games', wrap(async (_req, res) => {
  for (let i = 0; i < 8; i++) {
    const code = makeCode();
    const hostToken = rand(24);
    try {
      await Game.create({ code, hostToken });
      return res.json({ code, hostToken });
    } catch (e) {
      if (e.code !== 11000) throw e; // duplicate code -> try another
    }
  }
  res.status(503).json({ error: 'Could not create a room. Try again.' });
}));

app.post('/api/games/:code/join', wrap(async (req, res) => {
  const name = String(req.body?.name || '').trim().slice(0, 20);
  if (!name) return res.status(400).json({ error: 'Enter a name.' });
  const nameKey = name.toLowerCase();
  const g = await Game.findOne({ code: codeOf(req) }).lean();
  if (!g) return res.status(404).json({ error: 'Room not found. Check the code.' });
  if (g.startedAt) return res.status(409).json({ error: 'This game has already started.' });
  if (g.players.length >= MAX_PLAYERS) return res.status(409).json({ error: 'This room is full.' });
  const token = rand(24);
  const r = await Game.updateOne(
    { code: g.code, startedAt: null, 'players.nameKey': { $ne: nameKey } },
    { $push: { players: { token, name, nameKey, score: 0, answers: [] } } }
  );
  if (r.modifiedCount !== 1) return res.status(409).json({ error: 'That name is taken. Pick another.' });
  res.json({ token, name });
}));

app.post('/api/games/:code/start', wrap(async (req, res) => {
  const g = await hostGame(req, res);
  if (!g) return;
  if (g.startedAt) return res.status(409).json({ error: 'Already started.' });
  if (g.players.length === 0) return res.status(409).json({ error: 'Wait for at least one player.' });
  await Game.updateOne({ code: g.code, startedAt: null }, { startedAt: new Date(Date.now() + START_DELAY_MS) });
  res.json({ ok: true });
}));

// Host screen state
app.get('/api/games/:code/host-state', wrap(async (req, res) => {
  const g = await hostGame(req, res);
  if (!g) return;
  const ph = phase(g);
  const out = { ...ph, total: QUESTIONS.length, playerCount: g.players.length };
  if (ph.phase === 'lobby' || ph.phase === 'starting') out.players = g.players.map((p) => p.name);
  if (ph.q !== undefined) {
    const Q = QUESTIONS[ph.q];
    out.question = publicQ(Q);
    out.answered = g.players.filter((p) => p.answers.some((a) => a.q === ph.q)).length;
    if (ph.phase === 'reveal') out.correct = Q.correct; // only after the question closes
  }
  if (ph.phase === 'reveal') out.leaderboard = ranked(g).slice(0, 10);
  if (ph.phase === 'finished') out.leaderboard = ranked(g);
  res.json(out);
}));

// Player phone state: only that player's own data
app.get('/api/games/:code/me', wrap(async (req, res) => {
  const { g, me } = await playerGame(req, res);
  if (!g) return;
  const ph = phase(g);
  const out = { ...ph, total: QUESTIONS.length, name: me.name, score: me.score };
  if (ph.q !== undefined) {
    const Q = QUESTIONS[ph.q];
    out.question = publicQ(Q);
    const a = me.answers.find((x) => x.q === ph.q);
    if (a) out.myChoice = a.choice;
    if (ph.phase === 'reveal') {
      out.correct = Q.correct; // only after the question closes
      out.points = a ? a.points : 0;
    }
  }
  if (ph.phase === 'reveal' || ph.phase === 'finished') out.rank = ranked(g).find((r) => r.name === me.name)?.rank;
  res.json(out);
}));

app.post('/api/games/:code/answer', wrap(async (req, res) => {
  const { g, me } = await playerGame(req, res);
  if (!g) return;
  const ph = phase(g);
  if (ph.phase !== 'question') return res.status(409).json({ error: 'This question is closed.' });
  const choice = req.body?.choice;
  if (!Number.isInteger(choice) || choice < 0 || choice >= 4) return res.status(400).json({ error: 'Pick one of the options.' });
  const points = choice === QUESTIONS[ph.q].correct ? Math.round(500 + (500 * ph.msLeft) / Q_MS) : 0;
  // Atomic: only succeeds if this player has not answered this question yet
  const r = await Game.updateOne(
    { code: g.code, players: { $elemMatch: { token: me.token, 'answers.q': { $ne: ph.q } } } },
    { $push: { 'players.$.answers': { q: ph.q, choice, points } }, $inc: { 'players.$.score': points } }
  );
  if (r.modifiedCount !== 1) return res.status(409).json({ error: 'You already answered this one.' });
  res.json({ ok: true }); // deliberately says nothing about right/wrong
}));

app.use((err, _req, res, _next) => {
  console.error(err);
  res.status(500).json({ error: 'Server error. Please retry.' });
});

await mongoose.connect(process.env.MONGODB_URI);
const port = process.env.PORT || 4000;
app.listen(port, () => console.log('API listening on', port));
