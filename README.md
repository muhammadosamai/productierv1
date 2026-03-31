# productierv1

This template should help get you started developing with Vue 3 in Vite.

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

## Server Runtime Environment

Use a split configuration model:

- **Secrets**: copy `server/.env.example` to `server/.env` and store credentials/private keys there (or in a secret manager).
- **Non-secret runtime settings**: copy `server/config/runtime.public.example.yaml` to `server/config/runtime.public.yaml` and tune operational flags/limits there.

Required/important secret env vars:

- `DATABASE_URL` (runtime and DB tooling).
- JWT private signing key via `JWT_PRIVATE_KEY_PEM` or `JWT_PRIVATE_KEY_PATH`.
- `SEARCH_EMBEDDING_API_KEY` when semantic search uses OpenAI embeddings.
- `INTEGRATIONS_SECRET_KEY` for integrations credentials encryption outside test mode.
- `SEED_DEMO_PASSWORD` for local/demo seed scripts.
- Optional secret webhooks: `NOTIFICATIONS_EMAIL_WEBHOOK_URL`, `NOTIFICATIONS_SLACK_WEBHOOK_URL`.

Runtime/public YAML covers non-secret settings such as:

- Network/runtime (`NODE_ENV`, `PORT`, `CORS_ORIGINS`).
- Auth metadata and policy (`AUTH_SECRET_MODE`, `JWT_ACCESS_TTL`, `JWT_ISSUER`, `JWT_AUDIENCE`, `JWT_ACTIVE_KID`, public-key ring settings).
- API/list limits, notifications rollout/tuning, global search tuning, storage backend selection, integrations mode, and optional seed profile path overrides.

### Local auth 401 troubleshooting

If you see `401 Unauthorized` for `/api/auth/me` or `/api/auth/login` in local development:

1. Set `SEED_DEMO_PASSWORD` in `server/.env`, then seed full demo data:

   ```env
   SEED_DEMO_PASSWORD=change-me-local
   ```

   ```sh
   cd server
   bun run db:seed:full
   ```

2. Use full-seed credentials:
   - Email: `nora@novaforge.io`
   - Password: the value in `SEED_DEMO_PASSWORD`

3. If you still get `401` on `/api/auth/me`, your local auth keys likely changed across restarts.
   Configure stable key-ring settings in `server/config/runtime.public.yaml` (`JWT_ACTIVE_KID` + public key ring)
   and keep the private key in `server/.env`, then re-login.

### Alternate minimal seed profile (non-default)

If you intentionally use the lightweight seed profile instead of full demo data:

```sh
cd server
bun run db:seed-users
```

Use:
- Email: `sarim@productier.com`
- Password: the value in `SEED_DEMO_PASSWORD`

### JWT rotation and migration policy

Productier signs access tokens with RS256 using an active `kid` and verifies tokens against a public-key ring.

Recommended rotation procedure:

1. Generate a new RSA key pair and assign a new `kid`.
2. Add the new public key to `JWT_PUBLIC_KEYS_JSON` (or `JWT_PUBLIC_KEYS_PATH`) while keeping previous public keys present.
3. Switch signing to the new key by updating:
   - `JWT_ACTIVE_KID`
   - `JWT_PRIVATE_KEY_PEM` or `JWT_PRIVATE_KEY_PATH`
4. Deploy and wait at least one full `JWT_ACCESS_TTL` window.
5. Remove retired public keys from the verification ring.

Migration policy:
- Tokens without `kid`, with non-RS256 algorithms, or with unknown `kid` are rejected by design.
- Existing clients must re-authenticate once after migration to the RS256 key-ring model.

### Compile and Hot-Reload for Development

```sh
npm run dev
```

### Type-Check, Compile and Minify for Production

```sh
npm run build
```
