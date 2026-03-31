# Production Config Hardening

This guide documents what to disable, keep, and enforce when promoting Productier server config to production.

## Config Sources

- Keep **secrets** in secret storage (`server/.env` in local dev, secret manager in production).
- Keep **non-secret runtime settings** in `server/config/runtime.public.yaml`.
- During migration, legacy non-secret env vars are still honored but logged as deprecated.

## Turn Off / Remove In Production

- Seed/runtime helper values that are only needed locally:
  - `SEED_DEMO_PASSWORD`
  - `SEED_PROFILE_PATH`, `SEED_FULL_PACK_PATH`, `SEED_USERS_PACK_PATH`
- Local-only CORS origins (for example `http://localhost:5173`).
- `STORAGE_BACKEND=local` in multi-instance deployments (prefer object storage).
- Notification outbound channels until hooks are configured:
  - `NOTIFICATIONS_EMAIL_CHANNEL_ENABLED`
  - `NOTIFICATIONS_SLACK_CHANNEL_ENABLED`

## Must Keep / Enforce In Production

- `NODE_ENV=production`.
- `AUTH_SECRET_MODE=required`.
- Valid JWT key-ring setup:
  - `JWT_ACTIVE_KID`
  - private signing key (`JWT_PRIVATE_KEY_PEM` or `JWT_PRIVATE_KEY_PATH`)
  - matching public key ring (`JWT_PUBLIC_KEYS_JSON` or `JWT_PUBLIC_KEYS_PATH`).
- `INTEGRATIONS_SECRET_MODE=required` and `INTEGRATIONS_SECRET_KEY` present.
- Strict `CORS_ORIGINS` for real app domains only.
- All secret values supplied by secret manager (never committed).

## Conditional Rules

- Keep semantic search enabled only when embedding credentials are present:
  - If `SEARCH_EMBEDDING_PROVIDER=openai`, provide `SEARCH_EMBEDDING_API_KEY`.
  - If the API key is unavailable, disable semantic search (`GLOBAL_SEARCH_SEMANTIC_ENABLED=false`) and rely on lexical search.

## Suggested Pre-Deploy Validation

- Verify a restorable DB snapshot exists, then run `SAFE_MIGRATION_BACKUP_CONFIRMED=true bun run db:migrate:safe`.
- Start server with production config and verify startup passes all required checks.
- Validate auth token issue/verify path with current `JWT_ACTIVE_KID`.
- Validate integrations encryption/decryption using `INTEGRATIONS_SECRET_KEY`.
- Run notification and search smoke tests with production-like config values.
