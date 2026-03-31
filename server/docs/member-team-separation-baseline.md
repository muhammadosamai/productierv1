# Member And Team Baseline (Pre-Separation)

> Historical baseline only. This document is retained for migration context and
> is not the canonical runtime contract.
>
> Canonical tenancy contract:
> `server/docs/tenancy-org-first-contract.md`

## Purpose

This document freezes the pre-separation semantics so migrations and rollout
changes can be validated against a known baseline.

## Canonical Terms

- Organization Member: a user row linked through `organization_members`.
- Workspace Member: a user row linked through `product_members`.
- Team (legacy): UI label mapped to workspace members, not a dedicated entity.
- Assignment (legacy): user-centric assignment fields on tasks/issues.

## Current Data Model Snapshot

- Organization scope:
  - `organizations`
  - `organization_members`
  - `organization_invites`
- Workspace scope:
  - `products`
  - `product_members`
- Assignment scope:
  - `tasks.owner_user_id`
  - `tasks.assignee_user_ids`
  - `tasks.reviewer_user_ids`
  - `issues.assigned_to_user_id`
  - `test_cycle_issues.assigned_to_user_id`

## Current API Surface Snapshot

The routes below describe the frozen pre-separation baseline. In current
runtime, tenant-owned calls are org-first and the non-org tenant routes are
retired (`410 Gone`).

- Organization onboarding + member/invite lifecycle:
  - `/api/onboarding/*`
- Workspace member management:
  - `/api/products/:productId/members`
  - `/api/users/:id/memberships`
- User directory and work profile:
  - `/api/auth/users`
  - `/api/auth/users/:id/work`
  - `/api/users/*`
- Assignment writes:
  - `/api/tasks/*`
  - `/api/issues/*`
  - `/api/test-cycles/:id/issues/*`

## Current Frontend Surface Snapshot

- Organization member admin:
  - `src/components/settings/OrganizationMembersSettings.vue`
  - `src/views/UsersView.vue`
- Team-labeled product area:
  - `src/views/TeamListView.vue`
  - `src/components/layout/SubProductSidebar.vue`
  - `src/stores/productMembers.ts`
- Assignment pickers:
  - `src/components/delivery/TaskDetailPanel.vue`
  - `src/components/delivery/CreateTaskDialog.vue`
  - `src/views/IssuesView.vue`

## Frozen Compatibility Assumptions

- Existing user-only assignment fields remain readable during migration.
- Existing `product_members` data remains valid as workspace access scope.
- Existing `organization_members` remains the sole organization membership source.
- Rollout introduces new team structures without deleting old fields first.

