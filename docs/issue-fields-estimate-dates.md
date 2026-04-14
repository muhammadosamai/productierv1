# Issue fields: estimate, start date, end date

## Summary

Issues gained three optional built-in fields:

- **Estimate (hours)** — `estimateValue` (`double precision`), same UX and rounding as tasks (non-negative, 0.5-hour steps).
- **Start date** / **End date** — `startDate` and `endDate` (`date`), calendar-only values as `YYYY-MM-DD`.

They appear in the issue form defaults (form builder merge), **Create issue** (wizard step 2), and the **issue detail** sidebar.

## Backward compatibility

- Database columns are **nullable** with **no backfill**. Existing issues keep working; new columns are `NULL` until set.
- **POST /api/issues** — all three fields are optional. Omitting them leaves `NULL` in the database.
- **PUT /api/issues/:id** — partial updates: only keys present in the JSON body are applied (`pickIssueUpdatePayload`). Old clients that do not send these keys do not clear them.
- **Validation** runs only when a value is sent: invalid estimate or malformed date returns `400`. If both dates are set, **end date must be >= start date** (create and update).

## API

| Field           | Type   | Notes                                      |
|----------------|--------|--------------------------------------------|
| `estimateValue`| number | `null` clears; rounded to nearest 0.5 hour |
| `startDate`    | string | `YYYY-MM-DD` or `null`                     |
| `endDate`      | string | `YYYY-MM-DD` or `null`                     |

## Migration

Apply Drizzle migration `server/drizzle/0013_issue_estimate_dates.sql` (or rely on server bootstrap: `ensureIssueSchema` runs `ALTER TABLE ... ADD COLUMN IF NOT EXISTS` for the same columns).

## Related code

- Schema: `server/src/db/schema.ts` (`issues` table)
- Routes: `server/src/routes/issues.ts`
- Built-in form definitions: `server/src/lib/builtInFields.ts`, `src/lib/builtInFields.ts`
- Types: `src/types/issue.ts`
- UI: `src/components/issue/CreateIssueDialog.vue`, `src/components/issue/IssueDetailPanel.vue`
