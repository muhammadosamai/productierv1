# Tenancy Contract: Org-First API

## Purpose

This is the canonical tenancy contract for Productier.

All tenant-owned reads and writes must be organization-scoped, with product
resources nested under organization scope. Legacy non-org tenant routes are
retired and return `410 Gone`.

## Tenant Zones

- Demo tenant
  - Organization slug: `novaforge-org`
  - Contains only curated demo personas and seeded history.
  - Must not include endpoint-test users/memberships.
- Endpoint-test tenant
  - Organization slug: `endpoint-test-org`
  - Dedicated for endpoint harness and permission matrix runs.
  - Must not share users/memberships with demo data.
- User-created tenants
  - Any non-demo, non-endpoint organization created by users.
  - Must remain isolated and untouched by demo/test cleanup jobs.

## Canonical API Patterns

- Organization-owned resources
  - `/api/organizations/:organizationId/users`
  - `/api/organizations/:organizationId/users-admin/*` (user-management mutations and admin detail)
  - `/api/organizations/:organizationId/teams`
  - `/api/organizations/:organizationId/products`
  - `/api/organizations/:organizationId/metrics/*`
  - `/api/organizations/:organizationId/dashboards/*`
- Product-owned resources
  - `/api/organizations/:organizationId/products/:productId/tasks/*`
  - `/api/organizations/:organizationId/products/:productId/stories/*`
  - `/api/organizations/:organizationId/products/:productId/initiatives/*`
  - `/api/organizations/:organizationId/products/:productId/deliveries/*`
  - `/api/organizations/:organizationId/products/:productId/search/*`
  - `/api/organizations/:organizationId/products/:productId/metrics/*`

## Retired Route Policy

The following direct tenant prefixes are retired and return `410 Gone`:

- `/api/products`
- `/api/tasks`
- `/api/stories`
- `/api/initiatives`
- `/api/deliveries`
- `/api/issues`
- `/api/test-cycles`
- `/api/search`
- `/api/activities`
- `/api/feature-requests`
- `/api/wiki`
- `/api/releases`
- `/api/servers`
- `/api/favorites`
- `/api/consumer-feedbacks`
- `/api/integrations`
- `/api/metrics`
- `/api/dashboards`
- `/api/auth/users` (direct client usage retired)
- `/api/users` (global user-admin path retired; use `/api/organizations/:organizationId/users-admin/*`)

## Authorization and Scope Invariants

- `organizationId` scope is mandatory for tenant-owned endpoints.
- Product access is valid only when `product.organizationId === :organizationId`.
- Org/product mismatch returns `404` to avoid cross-tenant information leakage.
- Access is enforced by organization membership and product membership.
- Global tenant bypass is retired for day-to-day operations.

## Seed and Cleanup Invariants

- `db:seed:full` seeds curated NovaForge demo data.
- `db:cleanup:novaforge` removes non-curated NovaForge memberships/invites and
  strips curated NovaForge personas from non-demo organizations/products.
- `db:seed:endpoint-test` seeds endpoint-test identities and removes those users
  from non-endpoint organizations/products.

## Validation Commands

Run before release:

```bash
cd server
npm run type-check
npm run test:integration

cd ..
npm run type-check
npm run endpoint:test
npm run endpoint:test:permissions
```
