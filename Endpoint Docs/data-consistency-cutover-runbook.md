# Data Consistency Cutover Runbook

## Scope

This runbook covers the P0/P1 data consistency cutover for:

- canonical status vocabulary alignment (`initiatives`, `deliveries`, `stories/tasks` flows),
- ownership normalization to user IDs (`ownerUserId`, `leaderUserId`),
- product scoping normalization to UUID product IDs (`productId`) across API, DB, and frontend.

It also enforces the org-first tenancy model:

- canonical org-first routes (`/api/organizations/:organizationId/...`),
- strict separation of demo, endpoint-test, and user-created tenant zones,
- retirement of direct non-org tenant routes (`410 Gone`).

## Verification Snapshot

- Frontend type-check: `npm run type-check` ✅
- Backend type-check: `bun run type-check` ✅
- DB schema docs regeneration: `bun run db:docs` ✅ (`server/database-docs/database-schema.md`)
- Endpoint regression (clean verification DB): `npm run endpoint:test` ⚠️ (`total=138`, `passed=127`, `failed=11`)
- Post-cutover integrity check (clean verification DB): `bun run db:integrity:post-cutover` ✅ (`ok: true`)
- Legacy preflight script note: `bun run db:preflight:cutover` is pre-migration oriented and fails on cutover schema (expects legacy columns like `leader`)

### Remaining Regression Gaps

After running against a clean migrated+seeded verification DB with endpoint-test admin credentials, remaining failures are concentrated in:

- org-first metrics reads (`/api/organizations/:organizationId/metrics/*`) returning `500`,
- org-first user home (`GET /api/organizations/:organizationId/users/:id/home`) returning `500`,
- `PUT /api/roles/permissions` returning `422` with current test payload,
- unauthorized security cases that intentionally return `401` plus `error` payload (the harness currently marks any `error` field as a failure).

These should be triaged and either fixed in implementation or reflected in endpoint test expectations before final production sign-off.

## Pre-Go-Live Checklist

- [ ] Confirm production DB backup/snapshot is created and restorable.
- [ ] Confirm schema migration package includes `0009_data_consistency_cutover.sql`.
- [ ] Confirm backend artifact includes updated UUID/status contracts.
- [ ] Confirm frontend artifact includes product ID-only API usage.
- [ ] Confirm frontend/backend use org-first tenant routes only.
- [ ] Confirm legacy non-org tenant routes are retired (`410`) and not used by clients.
- [ ] Confirm endpoint-test users are isolated to `endpoint-test-org`.
- [ ] Confirm NovaForge curated users are isolated to `novaforge-org`.
- [ ] Confirm seed scripts are updated to resolve product UUID by product name.
- [ ] Confirm regenerated DB docs are reviewed for expected column/enum definitions.
- [ ] Confirm preflight has no unmatched owner/product references (including stale `EndpointDocs-*` values).
- [ ] Confirm endpoint regression environment points to a fully migrated DB.

## Safe Migration Execution (Stage / Production)

Use the safe migration wrapper to avoid partial rollouts and silent schema drift.

1. Create a fresh database backup/snapshot and record the restore point.
2. Run migration status precheck:

   ```bash
   cd server
   DATABASE_URL=postgresql://sarimalavi@postgres:5432/productier bun run db:migration:status
   ```

3. Apply safe migration flow (includes migrate + strict verify + post-cutover integrity checks):

   ```bash
   cd server
   SAFE_MIGRATION_BACKUP_CONFIRMED=true DATABASE_URL=postgresql://sarimalavi@postgres:5432/productier bun run db:migrate:safe
   ```

4. If any step fails, stop rollout and follow the rollback procedure before promoting traffic.

## Cutover Steps (One-Pass)

1. Put write-heavy jobs into maintenance-safe mode (pause schedulers/background sync).
2. Run migration prechecks in target environment (data quality + referential readiness).
3. Run `bun run db:migrate:safe` with backup confirmation in the target environment.
4. Deploy backend with updated request/response contracts.
5. Deploy frontend that sends/reads `productId`, `ownerUserId`, and `leaderUserId`.
6. Resume schedulers/background jobs.
7. Execute post-deploy integrity checks and endpoint regression.
8. Execute tenancy partition checks:
   - endpoint-test users have no memberships outside `endpoint-test-org`,
   - curated NovaForge users have no memberships outside `novaforge-org`.

## Post-Deploy Integrity Checks

Run these checks on the target DB after migration:

```sql
-- 1) Initiative enum contains archived
select enumlabel
from pg_enum e
join pg_type t on t.oid = e.enumtypid
where t.typname = 'initiative_status'
order by enumsortorder;
```

```sql
-- 2) No legacy delivery statuses
select status::text as status, count(*) as count
from deliveries
group by status
having status::text in ('active', 'pending');
```

```sql
-- 3) Product-scoped FK integrity spot checks
select count(*) as orphaned_stories
from backlog_items s
left join products p on p.id = s.product
where p.id is null;
```

```sql
-- 4) Owner/leader reference integrity
select count(*) as orphaned_story_owners
from backlog_items s
left join users u on u.id = s.owner_user_id
where s.owner_user_id is not null and u.id is null;

select count(*) as orphaned_initiative_leaders
from initiatives i
left join users u on u.id = i.leader_user_id
where i.leader_user_id is not null and u.id is null;
```

```sql
-- 5) Product membership integrity
select count(*) as orphaned_product_members
from product_members pm
left join products p on p.id = pm.product
where p.id is null;
```

Expected result for orphan checks: `0`.

## Post-Migration Smoke Checks

Run smoke checks immediately after safe migration and deployment:

- `GET /api/health` returns `200`.
- Home endpoints for key roles return `200` and no `INTERNAL_ERROR` payloads.
- Metrics endpoints return `200` for at least one organization/product scope.
- Notifications list and preferences endpoints return `200`.
- Server logs contain no `42P01`, `42703`, or `42704` errors after traffic resumes.

## Rollback Runbook

Use rollback if any of the following occurs:

- repeated 5xx responses on product-scoped endpoints,
- authorization failures tied to product membership resolution,
- widespread data access failures caused by missing UUID mappings,
- integrity checks return non-zero orphan counts after attempted remediation,
- safe migration flow (`db:migrate:safe`) fails strict status or post-cutover integrity checks.

### Rollback Procedure

1. Freeze writes (maintenance mode; stop background workers/sync jobs).
2. Roll back application deploy:
   - backend: redeploy previous stable artifact,
   - frontend: redeploy previous stable artifact.
3. Restore database from pre-cutover snapshot (point-in-time restore or full snapshot restore).
4. Re-run smoke checks on previous release endpoints.
5. Re-enable traffic and background jobs only after smoke checks pass.
6. Open incident log with:
   - failure trigger,
   - timestamp and environment,
   - migration/app versions,
   - restoration confirmation.

### Partial Mitigation (If Full Rollback Is Deferred)

- Keep rollout in degraded-safe mode (read-only for affected pages).
- Disable optional performance/caching rollout flags if relevant.
- Restrict integrations/sync jobs that depend on mutated entities until data consistency is restored.

## Go-Live Sign-Off

- [ ] Backend owner sign-off
- [ ] Frontend owner sign-off
- [ ] DBA/Platform sign-off
- [ ] QA sign-off on endpoint regression
- [ ] Incident commander identified for first 24h monitoring

