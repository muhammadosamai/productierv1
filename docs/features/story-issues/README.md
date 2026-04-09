# Story ↔ Issues Connection

First-class linking between **Stories** and **Issues**. An issue can be linked to a story (via `story_id` FK that already existed on the `issues` table), and a story panel shows all its linked issues in a dedicated **Issues tab** — mirroring how stories already surface their tasks.

## Goals

- Let issues be attached to a story so that reproduction bugs and quality concerns can be tracked in the backlog context.
- Surface linked issues inside the Story detail panel (Issues tab: list, create inline, link existing, unlink).
- Surface the linked story inside the Issue detail panel as an editable sidebar field.
- Open issues **block story completion**: `recomputeStoryStatus` considers issue statuses alongside task statuses when deciding whether a story is `completed`.
- No new database migration needed — `issues.story_id` FK with `ON DELETE SET NULL` already existed.

## Data model

No schema changes were required. The relevant column was already in place:

**Table:** `issues`

| Column | Notes |
|--------|-------|
| `story_id` | Optional FK → `stories.id`, `ON DELETE SET NULL` |

**Drizzle relations added:**

- `storiesRelations` in [`server/src/db/schema.ts`](../../../server/src/db/schema.ts): added `issues: many(issues)` so Drizzle relational queries can traverse `story → issues`.
- `issuesRelations` already contained `story: one(stories, ...)` — no change needed.

### Migrations

**No migration required.** The `story_id` column was already present in the production schema. All changes are application-level only.

## Story status recompute

`recomputeStoryStatus` was **extracted** from `tasks.ts` into a new shared library file and extended to include issue statuses.

**File:** [`server/src/lib/storyStatus.ts`](../../../server/src/lib/storyStatus.ts)

Logic (in priority order):

| Condition | Resulting story status |
|-----------|----------------------|
| Zero tasks **and** zero linked issues | `backlog` |
| All tasks `done`/`archived` **and** all issues `resolved`/`closed` | `completed` |
| Any task `in_progress`/`in_review` **or** any issue `in_progress` | `in_progress` |
| Any task `assigned` (but none in progress) | `initialized` |
| Otherwise | `drafted` |

`tasks.ts` was updated to import from the shared lib instead of keeping its own copy.

## API

### Stories routes — [`server/src/routes/stories.ts`](../../../server/src/routes/stories.ts)

Both `GET /api/stories` (list) and `GET /api/stories/:id` now include linked issues in the Drizzle `with` block:

```ts
issues: {
  where: (i, { eq }) => eq(i.archived, false),
  columns: { id, title, type, severity, priority, status, createdAt, updatedAt },
  with: {
    reportedBy: { columns: { id, name, avatar } },
    assignedTo:  { columns: { id, name, avatar } },
  },
}
```

### Issues routes — [`server/src/routes/issues.ts`](../../../server/src/routes/issues.ts)

| Change | Detail |
|--------|--------|
| `story` include | Added `story: { columns: { id, title, status } }` to all query `with` blocks (`GET` list, `GET /:id`, `POST` return, `PUT` return) |
| New endpoint | `GET /api/issues/by-story/:storyId` — returns all non-archived issues for a story, ordered by `createdAt DESC`. **Must be registered before `/:id`** to avoid Elysia treating `by-story` as an ID. |
| `recomputeStoryStatus` on create | Called (fire-and-forget) with the new `storyId` when an issue is created with a story link. |
| `recomputeStoryStatus` on update | Called for both the new `storyId` (if set) and the previous `storyId` (if the story link changed or was removed). |
| `recomputeStoryStatus` on delete | Called with `deleted.storyId` after deletion. |

#### `GET /api/issues/by-story/:storyId`

Returns `Issue[]` — same shape as the list endpoint but filtered to one story. No authentication beyond the existing middleware.

## Frontend

### Types

[`src/types/backlog.ts`](../../../src/types/backlog.ts): added `issues?: Issue[]` to the `Story` interface (after `tasks`).

[`src/types/issue.ts`](../../../src/types/issue.ts): added `story?: { id: string; title: string; status: string } | null` to the `Issue` interface.

### Store

[`src/stores/issues.ts`](../../../src/stores/issues.ts): added `fetchIssuesByStory(storyId: string): Promise<Issue[]>` — calls `GET /api/issues/by-story/${storyId}` and returns the result without storing it in global state (the caller manages local state).

### UI components

#### `StoryDetailPanel.vue` — Issues tab

[`src/components/backlog/StoryDetailPanel.vue`](../../../src/components/backlog/StoryDetailPanel.vue)

| Surface | Behavior |
|---------|----------|
| **Issues tab** (after Tasks tab) | Shows count badge from `story.issues?.length`. Activating the tab lazy-loads via `fetchIssuesByStory`. |
| **Issue row** | Severity colour dot · title · type badge · status badge · unlink (×) button. |
| **Link existing** | Search input (debounced 300 ms) filtering the product's issues store; selecting an issue calls `updateIssue({ storyId })` then refreshes. |
| **Create new** | Opens `CreateIssueDialog` with `:story-id="story.id"` pre-filled (read-only inside the dialog). |
| **Unlink** | Calls `updateIssue({ storyId: null })` then removes from local list. |

#### `CreateIssueDialog.vue` — `storyId` prop

[`src/components/issue/CreateIssueDialog.vue`](../../../src/components/issue/CreateIssueDialog.vue)

- Accepts optional `storyId?: string | null` prop.
- On mount / prop change: fetches story title from `GET /api/stories/:id` and pre-fills the linked story field.
- Story link field is **read-only** (X button and search input hidden) when the prop is set — prevents accidental unlinking when creating from the story context.
- `clearForm()` preserves `linkedStoryId`/`linkedStoryTitle` when the prop is set so the link survives step navigation.
- Issue type selector was already present on Step 1; no change needed.

#### `IssueDetailPanel.vue` — Story sidebar field

[`src/components/issue/IssueDetailPanel.vue`](../../../src/components/issue/IssueDetailPanel.vue)

The linked story is shown as an **editable sidebar field** above Assigned To, matching the Type dropdown design (pill badge trigger → dropdown):

| State | Appearance |
|-------|-----------|
| Linked | `bg-indigo-50 text-indigo-700` pill with story title (truncated) + ChevronDown |
| Not linked | `bg-gray-100 text-gray-400` pill showing "Not linked" + ChevronDown |

Dropdown content:
- Search input (filters `backlogStore.stories` client-side; stories are lazy-fetched on first open if not already loaded).
- Story list with checkmark on the currently linked story.
- **"Open story"** shortcut at the top (when linked) — closes the panel and navigates to `/stories?story=<id>`.
- **"Remove story link"** at the bottom (when linked) — calls `updateField('storyId', null)`.

`startStoryEdit()` triggers `backlogStore.fetchStories(issue.product)` lazily when the store is empty.

## Related files (quick index)

| Area | Path |
|------|------|
| Schema / relations | `server/src/db/schema.ts` |
| Shared story status lib | `server/src/lib/storyStatus.ts` |
| Tasks routes (uses shared lib) | `server/src/routes/tasks.ts` |
| Stories routes | `server/src/routes/stories.ts` |
| Issues routes | `server/src/routes/issues.ts` |
| Frontend types | `src/types/backlog.ts`, `src/types/issue.ts` |
| Issues store | `src/stores/issues.ts` |
| Story detail panel | `src/components/backlog/StoryDetailPanel.vue` |
| Create issue dialog | `src/components/issue/CreateIssueDialog.vue` |
| Issue detail panel | `src/components/issue/IssueDetailPanel.vue` |

## Explicitly out of scope (current)

- Story link on **Task** detail panel (tasks already connect to stories structurally; separate concern).
- Bulk linking / unlinking issues to a story.
- Story link shown in the Issues list table columns.
- Activity log entries for `story_id` changes on issues.
- Global search indexing of the story↔issue relationship.
