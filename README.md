# Money Quiz (MERN)
Host screen: `/host` (projector). Players: `/` (phones).

## Local run
```
cd server && cp .env.example .env   # fill MONGODB_URI, then:
npm install && npm run dev
cd client && cp .env.example .env && npm install && npm run dev
```
## Deploy
- MongoDB Atlas (free M0) -> Network Access: allow 0.0.0.0/0 -> copy connection string.
- Render (Web Service): Root Directory `server`, Build `npm install`, Start `npm start`,
  Env: `MONGODB_URI`, `CLIENT_ORIGIN` (your Vercel URL, no trailing slash). Health check path `/health`.
- Vercel: Root Directory `client`, Framework Vite, Env: `VITE_API_URL` = Render URL.

## Rules map
1. Answers: `correct` only added in the `reveal` phase (server/index.js, host-state and /me). `/answer` replies only `{ok:true}`.
2. 10 players: stateless server, 1s polling, atomic Mongo updates.
3. Refresh: player token in localStorage; `/me` restores name + score. Host token likewise.
4. Frozen screens: 15s fetch timeout, error box + "Try again", banner when polling fails.
5. Secrets: only in env vars. `.env` is gitignored. `.env.example` has placeholders only.
6. Scores private: no list endpoint. Every read needs room code + private token.
