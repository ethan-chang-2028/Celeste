# [Project name]

_Replace the heading above with the project's name, and this line with one sentence describing what this app does for users._

## Run & Operate

- `node server.js` — run the web game + online-race server (port 3000, mapped to
  external port 80). Serves `game-app/webSite/*` and the WebSocket used by 1v1
  online races on the **same** origin/port.
- Online race needs the `ws` package (`pnpm install`). Without it the game still
  loads, but online race is disabled — the server prints a warning on startup.
- `pnpm --filter @workspace/api-server run dev` — run the API server (port 5000)
- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from the OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- Required env: `DATABASE_URL` — Postgres connection string

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- API: Express 5
- DB: PostgreSQL + Drizzle ORM
- Validation: Zod (`zod/v4`), `drizzle-zod`
- API codegen: Orval (from OpenAPI spec)
- Build: esbuild (CJS bundle)

## Where things live

_Populate as you build — short repo map plus pointers to the source-of-truth file for DB schema, API contracts, theme files, etc._

## Architecture decisions

_Populate as you build — non-obvious choices a reader couldn't infer from the code (3-5 bullets)._

## Product

_Describe the high-level user-facing capabilities of this app once they exist._

## User preferences

_Populate as you build — explicit user instructions worth remembering across sessions._

## Gotchas

- Online race matchmaking + room state lives in-memory in `server.js` (Maps).
  This requires a single, always-on instance. The `.replit` `deploymentTarget`
  is `autoscale`, which can run multiple stateless instances and may not hold
  persistent WebSocket connections — if online race "never connects" in a
  *deployed* build, switch the deployment to a Reserved VM (single instance).
  The dev Run button (one process on port 3000) works fine.

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details
