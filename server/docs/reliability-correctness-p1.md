# Reliability and Correctness P1

## Canonical API error contract

All API errors now normalize to a shared shape:

```json
{
  "error": "Human readable message",
  "code": "MACHINE_READABLE_CODE",
  "details": {}
}
```

- `error`: stable user-facing message.
- `code`: machine-readable classification for client logic.
- `details`: optional debugging/validation context.

### Status and code mapping

- `400` -> `BAD_REQUEST` (manual/business validation branches)
- `401` -> `UNAUTHORIZED`
- `403` -> `FORBIDDEN`
- `404` -> `NOT_FOUND`
- `409` -> `CONFLICT`
- `500` -> `INTERNAL_ERROR`
- `422` -> framework validation payload for typed route schema mismatches (Elysia default)

Global fallback normalization is applied in `server/src/index.ts` to ensure
consistent payloads even when handlers return legacy `{ error: ... }` objects.

## Auth centralization

Route authentication now uses shared guard utilities in `server/src/lib/authz.ts`:

- `requireAuth()`
- `requireProductAccess()`
- `requireProductPageAction()`

This removes route-local token parsing drift and ensures consistent `401/403` behavior.

## Integration test stack

Dedicated backend integration tests are located under `server/tests/` and use Vitest.

- Setup files:
  - `server/tests/setup/testDb.ts`
  - `server/tests/setup/testApp.ts`
  - `server/tests/setup/vitest.setup.ts`
- Main workflow suite:
  - `server/tests/integration/workflow-chain.spec.ts`

### Required environment

Integration tests require a dedicated test database:

- `TEST_DATABASE_URL`
- (or `DATABASE_URL`, which is mirrored into `TEST_DATABASE_URL`)

Safety guard: tests refuse to run against URLs that do not contain `"test"`.

When the configured test database does not exist yet, the setup attempts to create it
automatically before tests run. This uses:

- `TEST_DATABASE_ADMIN_URL` (optional full admin connection URL), or
- `TEST_DATABASE_ADMIN_DB` (optional admin database name, default: `postgres`).

If the configured credentials cannot create databases, tests fail with an explicit
configuration error message.

## CI quality gates

PR quality checks are defined in `.github/workflows/pr-quality.yml`:

- Frontend: lint, type-check, and tests.
- Backend: DB migrate, strict migration status, lint, type-check, integration tests.

Frontend and backend quality steps are blocking in PR checks.

The backend job provisions PostgreSQL and runs tests against an isolated
`productier_test` database.

## Rollout notes

- Error payload compatibility is preserved via `error` string while adding `code`.
- Success payloads for existing endpoints are intentionally unchanged.
- Integration tests specifically protect the `story -> task -> delivery -> release -> deployment`
  flow and unauthorized branch behavior for critical write endpoints.
