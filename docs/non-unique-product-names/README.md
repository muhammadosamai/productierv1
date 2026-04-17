# Non-unique product display names

## Summary

Products can share the same **display name** (`products.name`). All relationships that were keyed only by name now use **`product_id`** (UUID FK). The API resolves `?product=` and path segments as **UUID**, then **`project_key`**, then **name** (ambiguous names return **409** with candidates).

## Database

- Migration: `server/drizzle/0016_duplicate_product_names.sql`
- Run: `cd server && bun run db:migrate` (back up production first).
- After migration: `products.name` is not globally unique; `products.project_key` is unique.

### Journal note

`0015_task_start_end_dates.sql` may exist on disk but is not listed in `server/drizzle/meta/_journal.json`. Confirm whether any environment applied `0015` manually before relying on Drizzle history alone.

## Frontend

- Active product is stored by **id** in `localStorage` (`productier_active_product_id`).
- Legacy key `productier_active_product` (name only) is migrated once when unambiguous.
- Use **`activeProductApiRef`** from `useProductStore()` for API calls (`?product=`, `/api/products/:ref/...`). It prefers **id** over display name.

## Rollback

Restore from backup and revert migration application; do not run the down migration in production without a tested plan.

## QA checklist

- [ ] Create two products with the same display name; confirm members, stories, issues, favorites, and metrics stay scoped per product.
- [ ] Switch between them via the sidebar; lists and metrics reload for the correct product.
- [ ] Logo upload and product settings save against the intended product.
- [ ] API returns 409 when passing a duplicate name without UUID/`project_key` (if the resolver is exercised that way).
