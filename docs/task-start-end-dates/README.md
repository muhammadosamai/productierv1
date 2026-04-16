# Task start and end dates

Parent tasks use nullable **`start_date`** and **`end_date`** (calendar dates). The legacy **`due_at`** column remains; API still accepts **`dueAt`** on create/update when **`endDate`** is not used. Responses normalize **`startDate`**, **`endDate`**, and derive **`dueAt`** for older clients when only `end_date` is set.

- Migration: [server/drizzle/0015_task_start_end_dates.sql](server/drizzle/0015_task_start_end_dates.sql) (includes backfill `end_date` from `due_at`)
- API helpers: [server/src/lib/taskDates.ts](server/src/lib/taskDates.ts)
- Tasks route: [server/src/routes/tasks.ts](server/src/routes/tasks.ts)

Run DB migrate/push as you usually do for the server before relying on the new columns.

On startup the server also runs [server/src/lib/ensureTaskScheduleColumns.ts](server/src/lib/ensureTaskScheduleColumns.ts) (same `ALTER` / backfill as the migration) so local databases that skipped `drizzle-kit migrate` still get the columns and deadline checks do not fail with “column start_date does not exist”. Failures are logged but do not stop the process (e.g. if the DB user cannot `ALTER TABLE`).
