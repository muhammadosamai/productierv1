# Endpoint Docs

This folder contains an automated API probe suite that exercises backend endpoints and writes a report showing:

- Which endpoints pass or fail
- Which endpoints are slow (`>1s` and `>2s`)
- Which responses are `null` or empty
- Required parameters for each endpoint (path/query/body)

## Canonical Tenancy Contract

- Org-first routing is canonical:
  - `/api/organizations/:organizationId/...`
  - `/api/organizations/:organizationId/products/:productId/...`
- Direct non-org tenant routes are retired and return `410 Gone`.
- Tenant zones are strict:
  - Demo (`novaforge-org`)
  - Endpoint test (`endpoint-test-org`)
  - User-created organizations

## Files

- `run-endpoint-tests.ts`: main runner
- `check-scalability-rollout.ts`: performance gate for scalability rollout
- `endpoint-cases.ts`: endpoint coverage matrix and request builders
- `fixtures.ts`: auth/bootstrap fixtures and cleanup helpers
- `endpoint-report.md`: generated markdown report (created after running)
- `endpoint-results.json`: generated raw execution output (created after running)

## Run

1. (Recommended) ensure demo and endpoint-test partitions are clean:

```bash
# Optional, but recommended when preparing a fresh verification database
npm run db:seed:full
cd server && npm run db:cleanup:novaforge && cd ..
```

2. Seed a dedicated endpoint-test workspace (same local DB, isolated users/product):

```bash
npm run db:seed:endpoint-test
```

3. Configure endpoint credentials in root `.env.endpoint-tests` (already wired by npm scripts):

```bash
# If needed, edit .env.endpoint-tests to match your local
# SEED_ENDPOINT_TEST_PASSWORD (or SEED_DEMO_PASSWORD fallback).
npm run endpoint:test
```

4. Optional runs:

```bash
# Permission boundary matrix
npm run endpoint:test:permissions

# Scalability rollout gate (tests + thresholds)
npm run endpoint:test:scalability
```

Or directly:

```bash
bun "Endpoint Docs/run-endpoint-tests.ts"
bun "Endpoint Docs/run-permission-matrix.ts"
```

## Environment overrides

- `API_BASE_URL` (default: `http://127.0.0.1:3001`)
- `API_EMAIL` (required; endpoint-test admin-level account, not demo credentials)
- `API_PASSWORD` (required)
- `API_REGULAR_EMAIL` (required)
- `API_REGULAR_PASSWORD` (required)
- `API_MATRIX_VIEWER_EMAIL` (optional; defaults to `endpoint.matrix.viewer@productier.test`)
- `API_MATRIX_VIEWER_PASSWORD` (optional; defaults to `API_REGULAR_PASSWORD`)
- `API_ENDPOINT_PRODUCT_NAME` (optional; defaults to `Endpoint Test Workspace`)
- `API_ENDPOINT_CASE_PRODUCT_NAME` (optional; defaults to `Endpoint Case Product`)
- `API_ENDPOINT_REGISTERED_EMAIL` (optional; defaults to `endpoint.runner@productier.test`)
- `API_ENDPOINT_REGISTERED_PASSWORD` (optional; defaults to `EndpointRunner-Shared-Secret!`)
- `API_ENDPOINT_WIKI_TYPE_NAME` (optional; defaults to `Endpoint Fixture Type`)
- `ALLOW_ENDPOINT_DEMO_CREDENTIALS` (default: `false`; set `true` only if you intentionally want to run against demo users)
- `FAIL_ON_ENDPOINT_FAILURE` (default: `false`)
- `LIST_PAGING_ROLLOUT` (default: `on`; set to `off` for rollback to legacy list payloads)
- `SCALABILITY_ROLLOUT_MODE` (`on` | `shadow` | `off`, default: `on`)
- `SCALABILITY_PERF_MAX_FAILURES` (default: `0`)
- `SCALABILITY_PERF_MAX_P95_MS` (default: `1500`)
- `SCALABILITY_PERF_MAX_SLOW_OVER_1S` (default: `4`)
- `SCALABILITY_NOTIFICATIONS_MAX_P95_MS` (default: `900`)
- `SCALABILITY_NOTIFICATIONS_MAX_SLOW_OVER_500MS` (default: `3`)

Example with explicit credentials:

```bash
API_EMAIL=endpoint.admin@productier.test API_PASSWORD=your-password API_REGULAR_EMAIL=endpoint.regular@productier.test API_REGULAR_PASSWORD=your-password npm run endpoint:test
```

## Notes

- Use `npm run db:seed:endpoint-test` before endpoint tooling to avoid polluting demo datasets.
- Endpoint probes target org-first paths; any legacy non-org tenant path should be expected to return `410`.
- Endpoint-test seed users support `SEED_ENDPOINT_TEST_PASSWORD` and fall back to `SEED_DEMO_PASSWORD`.
- Endpoint scripts auto-load root `.env.endpoint-tests` via `bun --env-file`.
- Endpoint tooling rejects `@novaforge.io` credentials by default; set `ALLOW_ENDPOINT_DEMO_CREDENTIALS=true` only for intentional override.
- CI and local runs both require explicit admin + regular endpoint credentials.
- Fixture naming is now deterministic for entities without delete endpoints (for example products, titles, wiki types) to prevent unbounded data growth.
- If fixture setup partially fails, the suite still runs and records endpoint failures in the report.
- Rollback switch: `LIST_PAGING_ROLLOUT=off` forces legacy (array) list responses even if clients request `paged=1`.
- Coverage includes P1 capability APIs: users admin, standalone issues, initiative insights, integrations lifecycle foundation, and wiki revision history/diff/restore.
