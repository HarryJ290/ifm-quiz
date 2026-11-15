import { useEffect, useState } from 'react';
import { api, usePoll } from './api.js';

const store = (k) => ({
  get: () => { try { return JSON.parse(localStorage.getItem(k)); } catch { return null; } },
  set: (v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} },
  clear: () => { try { localStorage.removeItem(k); } catch {} },
});
const hostStore = store('quiz_host');
const playerStore = store('quiz_player');
const LETTERS = ['A', 'B', 'C', 'D'];

export default function App() {
  return location.pathname.startsWith('/host') ? <Host /> : <Player />;
}

/* ---------- shared bits ---------- */
function Countdown({ data }) {
  const [, force] = useState(0);
  useEffect(() => { const i = setInterval(() => force((x) => x + 1), 250); return () => clearInterval(i); }, []);
  const left = Math.max(0, Math.ceil((data.msLeft - (Date.now() - data._at)) / 1000));
  return <div className="timer">{left}</div>;
}
function ErrorBox({ error, retry, children }) {
  return (
    <div className="err" role="alert">
      <p>{error.message}</p>
      <button onClick={retry}>Try again</button>
      {children}
    </div>
  );
}
function Banner({ error, retry }) {
  return <div className="banner" role="alert">Connection problem. <button onClick={retry}>Retry</button></div>;
}
function Board({ rows }) {
  return (
    <ol className="board">
      {rows.map((r) => (
        <li key={r.name}><span>{r.rank}. {r.name}</span><b>{r.score}</b></li>
      ))}
    </ol>
  );
}

/* ---------- HOST (projector) at /host ---------- */
function Host() {
  const [s, setS] = useState(hostStore.get());
  const [err, setErr] = useState(null);
  const [busy, setBusy] = useState(false);
  const create = async () => {
    setBusy(true); setErr(null);
    try { const d = await api('/api/games', { method: 'POST' }); hostStore.set(d); setS(d); }
    catch (e) { setErr(e); }
    setBusy(false);
  };
  if (!s) {
    return (
      <main className="host">
        <h1>Money Quiz</h1>
        <button className="big" onClick={create} disabled={busy}>{busy ? 'Creating room…' : 'Create game'}</button>
        {err && <ErrorBox error={err} retry={create} />}
      </main>
    );
  }
  return <HostGame s={s} onExit={() => { hostStore.clear(); setS(null); }} />;
}

function HostGame({ s, onExit }) {
  const { data, error, retry } = usePoll(`/api/games/${s.code}/host-state`, { 'x-host-token': s.hostToken });
  const [startErr, setStartErr] = useState(null);
  const start = async () => {
    setStartErr(null);
    try { await api(`/api/games/${s.code}/start`, { method: 'POST', headers: { 'x-host-token': s.hostToken } }); }
    catch (e) { setStartErr(e.message); }
  };
  if (error && [401, 404].includes(error.status))
    return <main className="host"><p>This game no longer exists.</p><button className="big" onClick={onExit}>New game</button></main>;
  if (!data) return <main className="host">{error ? <ErrorBox error={error} retry={retry} /> : <p>Loading…</p>}</main>;

  const { phase: ph } = data;
  return (
    <main className="host">
      {error && <Banner error={error} retry={retry} />}
      {(ph === 'lobby' || ph === 'starting') && (
        <>
          <p>Join at <b>{location.host}</b> with code</p>
          <div className="code">{s.code}</div>
          <p>{data.playerCount} player(s) in</p>
          <div className="chips">{(data.players || []).map((n) => <span key={n}>{n}</span>)}</div>
          {ph === 'lobby'
            ? <button className="big" onClick={start} disabled={data.playerCount === 0}>Start quiz</button>
            : <><p>Starting…</p><Countdown data={data} /></>}
          {startErr && <p className="errtext">{startErr}</p>}
        </>
      )}
      {ph === 'question' && (
        <>
          <p>Question {data.q + 1} of {data.total} · {data.answered}/{data.playerCount} answered</p>
          <Countdown data={data} />
          <h2>{data.question.text}</h2>
          <div className="opts">{data.question.options.map((o, i) => <div key={i} className="opt"><b>{LETTERS[i]}</b> {o}</div>)}</div>
        </>
      )}
      {ph === 'reveal' && (
        <>
          <p>Question {data.q + 1} of {data.total}</p>
          <h2>{data.question.text}</h2>
          <div className="opts">{data.question.options.map((o, i) => <div key={i} className={'opt ' + (i === data.correct ? 'right' : 'dim')}><b>{LETTERS[i]}</b> {o}</div>)}</div>
          <h3>Leaderboard</h3>
          <Board rows={data.leaderboard} />
        </>
      )}
      {ph === 'finished' && (
        <>
          <h1>Final ranking</h1>
          <Board rows={data.leaderboard} />
          <button className="big" onClick={onExit}>New game</button>
        </>
      )}
    </main>
  );
}

/* ---------- PLAYER (phone) at / ---------- */
function Player() {
  const [s, setS] = useState(playerStore.get());
  if (!s) return <Join onJoined={(v) => { playerStore.set(v); setS(v); }} />;
  return <PlayGame s={s} onLeave={() => { playerStore.clear(); setS(null); }} />;
}

function Join({ onJoined }) {
  const [code, setCode] = useState('');
  const [name, setName] = useState('');
  const [err, setErr] = useState(null);
  const [busy, setBusy] = useState(false);
  const join = async (e) => {
    e.preventDefault();
    setBusy(true); setErr(null);
    const c = code.trim().toUpperCase();
    try {
      const d = await api(`/api/games/${c}/join`, { method: 'POST', body: { name } });
      onJoined({ code: c, token: d.token, name: d.name });
    } catch (e2) { setErr(e2); }
    setBusy(false);
  };
  return (
    <main>
      <h1>Money Quiz</h1>
      <form onSubmit={join}>
        <input value={code} onChange={(e) => setCode(e.target.value)} placeholder="Room code" maxLength={4} autoCapitalize="characters" autoComplete="off" />
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Your name" maxLength={20} />
        <button className="big" disabled={busy || code.length < 4 || !name.trim()}>{busy ? 'Joining…' : 'Join game'}</button>
      </form>
      {err && <p className="errtext" role="alert">{err.message}</p>}
    </main>
  );
}

function PlayGame({ s, onLeave }) {
  const { data, error, retry } = usePoll(`/api/games/${s.code}/me`, { 'x-player-token': s.token });
  const [picked, setPicked] = useState({});
  const [sendErr, setSendErr] = useState(null);
  const [sending, setSending] = useState(false);

  if (error && [401, 404].includes(error.status))
    return <main><p>{error.message}</p><button className="big" onClick={onLeave}>Join another game</button></main>;
  if (!data) return <main>{error ? <ErrorBox error={error} retry={retry}><button onClick={onLeave}>Leave</button></ErrorBox> : <p>Loading…</p>}</main>;

  const answer = async (i) => {
    setSending(true); setSendErr(null);
    try {
      await api(`/api/games/${s.code}/answer`, { method: 'POST', body: { choice: i }, headers: { 'x-player-token': s.token } });
      setPicked((p) => ({ ...p, [data.q]: i }));
    } catch (e) { setSendErr(e); }
    setSending(false);
  };
  const mine = data.myChoice ?? picked[data.q];
  const { phase: ph } = data;

  return (
    <main>
      {error && <Banner error={error} retry={retry} />}
      <p className="who">{data.name} · {data.score} pts</p>
      {ph === 'lobby' && <h2>You’re in. Waiting for the host to start…</h2>}
      {ph === 'starting' && <><h2>Get ready…</h2><Countdown data={data} /></>}
      {ph === 'question' && (
        <>
          <p>Question {data.q + 1} of {data.total}</p>
          <Countdown data={data} />
          <h2>{data.question.text}</h2>
          {mine !== undefined ? (
            <p className="locked">Answer locked in: {LETTERS[mine]}. Wait for the others…</p>
          ) : (
            <div className="opts">
              {data.question.options.map((o, i) => (
                <button key={i} className="opt" disabled={sending} onClick={() => answer(i)}><b>{LETTERS[i]}</b> {o}</button>
              ))}
            </div>
          )}
          {sendErr && <ErrorBox error={sendErr} retry={() => setSendErr(null)} />}
        </>
      )}
      {ph === 'reveal' && (
        <>
          <h2>{mine === undefined ? 'No answer' : mine === data.correct ? 'Correct!' : 'Not quite'}</h2>
          <p>Right answer: <b>{LETTERS[data.correct]}. {data.question.options[data.correct]}</b></p>
          <p>+{data.points} points · Rank {data.rank}</p>
        </>
      )}
      {ph === 'finished' && (
        <>
          <h1>Finished!</h1>
          <p>You came <b>#{data.rank}</b> with <b>{data.score}</b> points.</p>
          <button onClick={onLeave}>Leave game</button>
        </>
      )}
    </main>
  );
}
