# Task / Issue Delete Permissions

Current behavior for **archive**, **restore**, and **delete** on tasks and issues.

This document reflects the implementation state as of **April 10, 2026** and is intended as a temporary reference until permissions are revisited.

## Summary

| Entity | Archive | Restore | Delete |
|--------|---------|---------|--------|
| Task | Available in UI | Available in UI | Available in UI |
| Issue | Admin-gated in some UI surfaces | Admin-gated in some UI surfaces | Mixed: UI differs from backend |

## Tasks

### Current behavior

- Tasks can be archived from the task detail panel.
- Archived tasks can be restored from the tasks list archived tab.
- Tasks can now also be deleted from:
  - the tasks list row actions
  - the task detail panel header

### Backend rule

Task deletion is **not admin-only**.

The server delete route does not enforce a product-admin check before deleting a task.

**Reference:** [`server/src/routes/tasks.ts`](../../../server/src/routes/tasks.ts)

Relevant route:
- `DELETE /api/tasks/:id`

### Frontend surfaces

- Tasks list: [`src/views/TasksListView.vue`](../../../src/views/TasksListView.vue)
- Task detail panel: [`src/components/delivery/TaskDetailPanel.vue`](../../../src/components/delivery/TaskDetailPanel.vue)

## Issues

### Current behavior

- Issue archive / restore in the issue detail panel is restricted to product issue admins.
- Issues can be deleted from:
  - the issues list row actions
  - the issue detail panel header

### Backend rule

Issue deletion is **not fully admin-only**.

Current server behavior:
- **Non-archived issues:** any authenticated user can delete
- **Archived issues:** only product admins can delete archived issues

**Reference:** [`server/src/routes/issues.ts`](../../../server/src/routes/issues.ts)

Relevant route:
- `DELETE /api/issues/:id`

### Frontend surfaces

- Issues list: [`src/views/IssuesView.vue`](../../../src/views/IssuesView.vue)
- Issue detail panel: [`src/components/issue/IssueDetailPanel.vue`](../../../src/components/issue/IssueDetailPanel.vue)

## Known inconsistency

There is currently a **UI / backend mismatch for issues**:

- In the **issue detail panel**, delete is shown only for admins, matching archive controls.
- In the **issues list**, delete is available without the same admin gating.
- On the backend, delete is only restricted for **archived** issues, not for all issues.

This means the effective rules differ depending on:
- where the user initiates the delete
- whether the issue is archived

## Confirmation behavior

Delete actions currently show a native confirmation prompt:

- `Delete this task? This cannot be undone.`
- `Delete this issue? This cannot be undone.`

This confirmation is implemented in both list-level and detail-panel delete entry points.

## Suggested future direction

When permissions are revisited, choose one model and align both UI and backend:

1. **Admin-only delete for both tasks and issues**
   - strictest option
   - requires backend enforcement and UI gating

2. **Any editor can delete, admin-only archive management**
   - closest to current backend behavior for issues
   - still needs UI consistency cleanup

3. **Soft-delete/archive only, no hard delete from normal UI**
   - safest for auditability
   - most product-friendly if accidental deletion is a concern

## Related implementation files

| Area | Path |
|------|------|
| Task delete backend | `server/src/routes/tasks.ts` |
| Issue delete backend | `server/src/routes/issues.ts` |
| Tasks list UI | `src/views/TasksListView.vue` |
| Issues list UI | `src/views/IssuesView.vue` |
| Task detail UI | `src/components/delivery/TaskDetailPanel.vue` |
| Issue detail UI | `src/components/issue/IssueDetailPanel.vue` |
