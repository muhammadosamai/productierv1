# Notifications UX and Relevance Review (Plan Only)

Date: 2026-03-30
Status: Analysis complete, no product code changes made.

## Scope Reviewed

- `src/components/layout/MainHeader.vue`
- `src/components/settings/NotificationPreferencesSettings.vue`
- `src/stores/notifications.ts`
- `src/stores/products.ts`
- `src/types/notification.ts`
- `server/src/lib/notificationContracts.ts`
- `server/src/lib/notifications.ts`
- `server/src/lib/logActivity.ts`
- `server/src/routes/notifications.ts`
- `server/src/routes/tasks.ts`
- `server/src/routes/stories.ts`
- `server/src/routes/releases.ts`
- `server/src/routes/roles.ts`
- `server/src/routes/users.ts`
- `server/src/routes/favorites.ts`
- `server/src/routes/auth.ts` (task risk and overdue computation)

## Main Issues and Improvements

### 1) Product filter in the inbox is too limited for real work triage

**Observed**
- Inbox scope only supports `all_products` or `active_product` in `MainHeader.vue`.
- Users cannot select a specific product unless it is currently the active product.
- The product store already has all products (`productsStore.products`) but inbox filter does not use that list.

**Why this hurts**
- Teams that switch context often cannot triage notifications for a specific product quickly.
- It forces product switching just to inspect notifications.

**Improve**
- Replace scope toggle with:
  - `All products`
  - `Specific product` selector (product name list)
  - Optional `My current product` shortcut
- Keep unread-only as is (it is useful).

---

### 2) Quick filters are category-centric, not user-intent-centric

**Observed**
- Current quick chips are: `Needs action`, `Assignments`, `Workflow`, `Releases`, `Admin`.
- Backend categories also include `risk`, `quality`, `integration`, `digest`, but these are not represented in quick chips.
- Filter design reflects internal taxonomy, not user jobs-to-be-done.

**Why this hurts**
- Users think in intent: "what needs me now?" not "show workflow category."
- Important classes (risk/quality/integration) are effectively hidden in quick navigation.

**Improve**
- Make top-level quick views intent-first:
  - `Needs my action`
  - `Assigned to me`
  - `Needs my review`
  - `At risk / behind schedule`
  - `Releases`
  - `Admin / org`
- Keep technical category and type filters in an "Advanced filters" panel only.

---

### 3) Notification message copy is generic and often low-value

**Observed**
- Default message template is generic (`formatNotificationMessage`): `"Actor action entityType[: title]"`.
- Many route updates create generic events (`created/updated/deleted`) for routine actions (for example title updates, release notes edits, role updates).
- This produces messages like "X updated release" without context on why user should care.

**Why this hurts**
- High volume of low-context updates causes notification fatigue.
- Important notifications are buried under routine CRUD noise.

**Improve**
- Add event-specific templates with explicit impact:
  - "You were assigned to task X"
  - "Release X failed in staging on server Y"
  - "Task X is 3 days overdue"
- Include concise actionable metadata in payload (reason, deadline delta, owner, next action).
- Demote or suppress non-actionable lifecycle events by default.

---

### 4) Missing proactive time-based signals (overdue, due soon, stale)

**Observed**
- Notification publishing is primarily activity-driven (`logActivity -> publishNotificationsFromActivity`).
- There is no scheduled publisher for overdue/stale work reminders.
- System already computes rich risk signals in auth metrics payload (`overdue`, `dueSoon`, `staleInProgress`, review SLA), but these are not turned into notifications.

**Why this hurts**
- Users only see what someone changed, not what they should act on next.
- "You are X days behind" and "pending task" scenarios are not covered.

**Improve**
- Add a scheduled notification producer (hourly/daily) for:
  - Overdue assigned tasks
  - Due in 24h/48h tasks with low progress
  - Blocked tasks in my scope
  - Review queue SLA breaches
  - Stale in-progress work
- Use dedupe + cooldown windows to avoid repeated spam.
- Include reminder cadence controls in preferences.

---

### 5) Recipient targeting is broad in some event types

**Observed**
- Candidate recipients are derived from subject users + stakeholders.
- For some updates (for example favorites, generic task updates), stakeholder fan-out can notify users who do not need the event.
- Task comment/attachment events in `tasks.ts` do not use normalized comment fields used elsewhere.

**Why this hurts**
- "Informational" activity can still fan out to multiple stakeholders.
- Users receive updates that are not actionable for them.

**Improve**
- Move to event-specific recipient policies:
  - Assignment -> assignee + owner (+ optional watchers)
  - Review request -> reviewer(s)
  - Mention -> mentioned users
  - Admin governance -> scoped admin audience
- Keep stakeholder fan-out only for clearly high-risk categories.

---

### 6) Event normalization is inconsistent across routes

**Observed**
- Story comments use `commentId/commentPreview` (recognized by contracts).
- Task comments/attachments use fields like `comment` and `attachment` (not normalized in contract mapping), often collapsing to generic workflow informational notifications.

**Why this hurts**
- Similar user actions produce different quality notifications.
- Hard to build coherent filters and meaningful type labels.

**Improve**
- Define a strict event contract shared by all route producers:
  - Canonical change keys (comment_added/comment_removed, attachment_added/attachment_removed, assignment_changed, deadline_changed, etc.)
  - Required context fields for each event class
- Validate event payload shape before publish.

---

### 7) Type filter and unread count UX can mislead users

**Observed**
- Type filter displays raw internal type strings.
- Type options are derived from currently loaded items only.
- Filtered unread count in header is calculated from currently loaded page items, not guaranteed full filtered unread total.

**Why this hurts**
- Internal keys are not understandable for business users.
- Count can appear inconsistent in larger inboxes.

**Improve**
- Provide server-side facets:
  - Human labels for types
  - Accurate filtered unread totals
  - Available types for current filter scope (not only loaded page)
- Keep raw type IDs hidden from default UI.

---

### 8) Inbox interaction model is constrained to a popover

**Observed**
- Notifications are presented only in the header popover; no dedicated inbox page.
- Polling is lightweight (30s unread count), with list refresh mainly when popover is open.

**Why this hurts**
- Hard to triage high-volume notification streams.
- No durable "work queue" experience.

**Improve**
- Add a full `/notifications` page with:
  - Saved views
  - Bulk actions
  - Rich grouping (today, overdue, awaiting review, blocked)
  - Search and advanced filters
- Keep popover as a compact preview surface.

---

### 9) Org-level governance notifications are tied to product scope in a fragile way

**Observed**
- Some user/title governance events use `resolveAuditProductId` (first membership product fallback).
- Org-level changes can be routed under an arbitrary product context.

**Why this hurts**
- Users may see governance notifications in an unexpected product scope.
- In multi-product orgs, scope semantics become confusing.

**Improve**
- Introduce org-scoped notifications (`scope = org` vs `scope = product`).
- Route governance notifications to org/admin inbox views, not arbitrary product fallback.

---

### 10) Backend lifecycle controls (mute/snooze) are underexposed in UI

**Observed**
- Backend supports mute/snooze/includeMuted/includeSnoozed, but inbox UI mostly exposes read/archive only.

**Why this hurts**
- Users cannot tune noise quickly from the inbox.

**Improve**
- Expose per-notification and bulk actions:
  - Snooze until tomorrow / next week / custom
  - Mute similar notifications (same type/entity)
  - Undo archive/read actions where practical

## Proposed GR-Style Notification Framework

### A) User-facing notification buckets (replace current quick chips)

- Needs my action
- Assigned to me
- Needs my review
- At risk / behind schedule
- Releases and deployments
- Team and admin governance

### B) Signal classes

- **Activity signals**: explicit user actions (assignment, review request, deployment failed)
- **Health signals**: time/risk derived (overdue, blocked > N days, stale in-progress)
- **Digest signals**: controlled summary rollups (daily/weekly), not event spam

### C) Relevance rule

Only notify by default if at least one is true:
- The user is directly responsible (assignee/owner/reviewer)
- The user is explicitly referenced (subject/mention)
- The event is high severity in the user’s admin scope

## Phased Implementation Plan

### Phase 1 - UX quick wins (low risk)

1. Replace product filter with product selector (`All products` + named product options).
2. Replace quick chips with intent-first labels.
3. Hide raw type filter in default mode; keep in advanced mode.
4. Add readable type labels and reason snippets in card body.

### Phase 2 - Event quality and targeting

1. Standardize event contract keys across routes.
2. Add event-specific templates and richer payload context.
3. Tighten recipient policies by event class.
4. Reduce non-actionable default notifications (or downgrade to digest-only).

### Phase 3 - Proactive task health notifications

1. Add scheduled publisher for overdue/due-soon/stale/review-SLA signals.
2. Reuse existing risk calculations already available in auth/metrics data.
3. Add cadence and threshold preferences (daily digest, immediate for critical).
4. Add dedupe/cooldown strategy to prevent reminder spam.

### Phase 4 - Full notification center

1. Introduce dedicated notifications page for heavy triage.
2. Add saved views and bulk workflows.
3. Add real-time delivery (SSE/WebSocket) for critical events.

## Success Criteria

- Users can filter by any specific product without changing active context.
- At least 70% of notifications are action-oriented or clearly useful.
- "Overdue/pending" personal reminder signals are available and configurable.
- Notification open-to-action rate improves, while archive-without-open rate decreases.
- Support tickets/complaints about noisy or irrelevant notifications materially drop.

