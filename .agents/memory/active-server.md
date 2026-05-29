---
name: Active server is api-server, not root server.js
description: Which server actually runs the game site + WebSockets, and why server.js is misleading
---

The running web server is **`artifacts/api-server`** (`src/app.ts` + `src/index.ts`), started by the workflow `pnpm --filter @workspace/api-server run dev`. It serves `game-app/webSite/` statically and owns proxy path `/`.

The root **`server.js`** is NOT running. It contains its own HTTP + WebSocket implementation (online race matchmaking, plus a hand-rolled RFC6455 fallback for when `ws` is missing), but nothing launches it.

**Why this matters:** Features added only to `server.js` will silently do nothing in the live app. Two bugs traced to this:
- `/profile.html` 404'd to index.html — route existed only in server.js; had to add static dir + routes in app.ts.
- PvP online race WebSocket "closed before connection established" — WS server existed only in server.js; had to port matchmaking into `artifacts/api-server/src/online-race.ts` and create the http server via `createServer(app)` in index.ts so WS + HTTP share one port.

**How to apply:** When wiring up any new route, static file, or WebSocket behavior, edit the **api-server** artifact, not server.js. Client connects WS to same-origin `ws://host/`, which the proxy routes to api-server (path `/`).
