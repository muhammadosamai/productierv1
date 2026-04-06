# Task sub-tasks

First-class **sub-tasks** break a top-level task into smaller items. They are stored in `task_subtasks`, linked to a parent row in `tasks`, and support the same core work fields as tasks **except** owner, story, and reviewers.

## Goals

- One level of nesting only: sub-tasks belong to a **task**, not to other sub-tasks.
- Sub-tasks are **assignable** (multiple assignees via `assignee_user_ids`, same idea as tasks).
- Sub-tasks have **status**, **priority**, **type**, **due date**, **estimate**, **blocked reason**, **dependencies** (other **task** UUIDs), and optional **delivery** link.
- **Story** and **delivery** progress rollups still use **top-level tasks only**; sub-task status does not move story or delivery metrics.

## Data model

**Table:** `task_subtasks` (Drizzle: [`server/src/db/schema.ts`](../../../server/src/db/schema.ts) — `taskSubtasks`)

| Column | Notes |
|--------|--------|
| `id` | UUID PK |
| `parent_task_id` | FK → `tasks.id`, `ON DELETE CASCADE` |
| `title` | Required |
| `description` | Optional |
| `status`, `priority` | Reuse `task_status` / `task_priority` enums |
| `type` | Optional; `task_type` enum |
| `assignee_user_ids` | UUID array; replaces legacy single `assignee_user_id` |
| `estimate_value` | `double precision`, optional |
| `dependent` | UUID array; IDs of **tasks** (same semantics as parent task dependencies) |
| `blocked_reason` | Optional text |
| `due_at` | Optional timestamptz |
| `delivery_id` | Optional FK → `deliveries.id` |
| `started_at`, `completed_at` | Set/cleared on status transitions via API (see below) |
| `sort_order` | Stable ordering in UI |
| `created_at`, `updated_at` | Standard |

**Relations:** `taskSubtasks.parentTask`, `taskSubtasks.delivery`; `tasks.subtasks`; `deliveries.taskSubtasks`. There is **no** Drizzle relation from `users` to sub-tasks by assignee (arrays are not a single FK).

### Migrations

- **`0005_task_subtasks`** — initial `task_subtasks` + single `assignee_user_id`.
- **`0006_subtask_task_parity`** — adds parity columns, backfills `assignee_user_ids` from `assignee_user_id`, drops `assignee_user_id`.

Apply migrations in order (e.g. `drizzle-kit migrate` or your deployment pipeline). The app expects the schema after **0006**.

## API

Base prefix: `/api/tasks` ([`server/src/routes/tasks.ts`](../../../server/src/routes/tasks.ts)).

### Nested create (parent + sub-tasks)

`POST /api/tasks/by-story/:storyId` — body includes optional `subtasks[]` with the same shape as `POST .../subtasks` (see below). Sub-tasks are inserted after the parent task.

### Sub-task CRUD

| Method | Path | Purpose |
|--------|------|---------|
| `POST` | `/:id/subtasks` | Create sub-task on parent task `:id` |
| `PUT` | `/:id/subtasks/:subtaskId` | Partial update; `:subtaskId` must belong to `:id` |
| `DELETE` | `/:id/subtasks/:subtaskId` | Delete sub-task |

**Auth:** Same JWT rules as other task mutations; mutating routes verify `subtask.parent_task_id === :id`.

**Default status:** If `status` is omitted but `assigneeUserIds` is non-empty, effective status defaults to `assigned`; otherwise `created`.

**Lifecycle timestamps (PUT):** When `body.status` is provided, behavior mirrors parent task update: entering `in_progress` sets `started_at`; entering `done` sets `completed_at`; moving off `done` clears `completed_at`. Creating a sub-task with `status: in_progress` / `done` on **POST** does not currently set these timestamps (only **PUT** does).

**Responses:** JSON includes scalar/array columns and optional nested `delivery: { id, title }`. Assignees are **not** expanded to user objects; clients resolve IDs via team/product members.

### Read paths that include `tasks.subtasks`

Sub-tasks are loaded with consistent ordering (`sort_order`, `created_at`) and `delivery` columns where queries use Drizzle `with`:

- `GET /api/stories` and `GET /api/stories/:id` — `tasks.subtasks`
- `GET /api/deliveries/:id` — `tasks.subtasks`
- `GET /api/tasks/by-story/:storyId`

There is no `GET /api/tasks/:id`; the UI relies on these embedded graphs or refetch after mutations.

## Rollups and automation

These continue to consider **only** rows in `tasks`, **not** `task_subtasks`:

- Story status recompute (`recomputeStoryStatus` in `tasks.ts`)
- Story estimate / delivery string from tasks (`autoUpdateStoryFromTasks`)
- Delivery `progress` / `completedTasks` from delivery payload (`deliveries.ts`)

Deleting a parent task **cascades** and deletes its sub-tasks.

## Frontend

### Types

[`src/types/backlog.ts`](../../../src/types/backlog.ts): `TaskSubtask`, `CreateTaskSubtaskPayload`, `UpdateTaskSubtaskPayload`, `SubtaskDraftRow` (create-flow drafts before the parent exists).

### Store

[`src/stores/backlog.ts`](../../../src/stores/backlog.ts): `createSubtask`, `updateSubtask`, `deleteSubtask` (and `createTask` with optional `subtasks` in the JSON body).

### UI

| Surface | Behavior |
|---------|----------|
| [`SubtaskDetailDialog.vue`](../../../src/components/delivery/SubtaskDetailDialog.vue) | Shared modal: **draft** mode (edits in-memory row) or **saved** mode (`updateSubtask` + `@saved`). Fields: title, description, status, priority, type, assignees, due date, estimate, delivery, blocked reason, dependencies (tasks in the same story; create flow uses a placeholder parent task id so the real parent is not listed as a dependency). |
| [`CreateTaskDialog.vue`](../../../src/components/delivery/CreateTaskDialog.vue) | Sub-task **preview rows** (click to open modal). Loads product **members** for assignee pickers. Submit sends full `subtasks` payload on parent create. |
| [`TaskDetailPanel.vue`](../../../src/components/delivery/TaskDetailPanel.vue) | Sub-task **preview rows** open the modal in **saved** mode; delete remains on the row; `emit('updated')` after saves so delivery/tasks views refetch. |

**Note:** `PUT /api/tasks/:id` returns the updated task row **without** `subtasks`. Parents should **refetch** or merge carefully so local `subtasks` are not dropped (the panel uses `@updated` refetch patterns).

## Explicitly out of scope (current)

- Sub-task comments or attachments (would need new tables or polymorphic design).
- Multi-level sub-tasks (sub-sub-tasks).
- Global search indexing of sub-tasks.
- Activity log entries per sub-task field change.
- Server validation that `dependent` IDs are tasks in the same story/product, or that `delivery_id` matches product (FK only enforces valid delivery row).

## Related files (quick index)

| Area | Path |
|------|------|
| Schema | `server/src/db/schema.ts` (`taskSubtasks`) |
| Routes | `server/src/routes/tasks.ts` |
| Story/delivery reads | `server/src/routes/stories.ts`, `server/src/routes/deliveries.ts` |
| Migrations | `server/drizzle/0005_task_subtasks.sql`, `server/drizzle/0006_subtask_task_parity.sql` |
