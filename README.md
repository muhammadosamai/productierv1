## Productier

Vue 3 + Vite frontend with an Elysia (Bun) backend and PostgreSQL (Drizzle ORM).

### Local development (recommended)

Prereqs:
- Node \(>= 22\)
- Bun \(>= 1.3\)
- PostgreSQL \(local install\) **or** Docker Desktop

Start frontend + backend:

```sh
npm ci
cd server && bun install
cd .. && npm run dev:all
```

URLs:
- Frontend: `http://localhost:5173`
- Backend: `http://localhost:3001` \(health: `http://localhost:3001/api/health`\)

### Database setup

Set `DATABASE_URL` and `JWT_SECRET`:
- Copy `.env.example` to `.env` (repo root) and edit as needed
- Optionally copy `server/.env.example` to `server/.env` for server-only runs

Then run:

```sh
cd server
bun run db:push
bun run db:seed
```

### Run with Docker (frontend + backend + postgres)

Prereq: Docker Desktop.

```sh
copy .env.example .env
docker compose up --build
```

This exposes:
- Frontend: `http://localhost:5173`
- Backend: `http://localhost:3001`
- Postgres: `localhost:5432` \(user/pass/db: `productier`/`productier`/`productier`\)

## Recommended IDE Setup

[VS Code](https://code.visualstudio.com/) + [Vue (Official)](https://marketplace.visualstudio.com/items?itemName=Vue.volar) (and disable Vetur).

## Recommended Browser Setup

- Chromium-based browsers (Chrome, Edge, Brave, etc.):
  - [Vue.js devtools](https://chromewebstore.google.com/detail/vuejs-devtools/nhdogjmejiglipccpnnnanhbledajbpd)
  - [Turn on Custom Object Formatter in Chrome DevTools](http://bit.ly/object-formatters)
- Firefox:
  - [Vue.js devtools](https://addons.mozilla.org/en-US/firefox/addon/vue-js-devtools/)
  - [Turn on Custom Object Formatter in Firefox DevTools](https://fxdx.dev/firefox-devtools-custom-object-formatters/)

## Type Support for `.vue` Imports in TS

TypeScript cannot handle type information for `.vue` imports by default, so we replace the `tsc` CLI with `vue-tsc` for type checking. In editors, we need [Volar](https://marketplace.visualstudio.com/items?itemName=Vue.volar) to make the TypeScript language service aware of `.vue` types.

## Customize configuration

See [Vite Configuration Reference](https://vite.dev/config/).

## Project Setup

```sh
npm install
```

### Compile and Hot-Reload for Development

```sh
npm run dev
```

### Type-Check, Compile and Minify for Production

```sh
npm run build
```
