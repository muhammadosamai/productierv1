# Jira-like Search v1 — QA Manual Test Handover

## Scope Covered
- Header quick search integration in `src/components/layout/MainHeader.vue`
- Backend endpoint `GET /api/search/quick`
- Entity groups: stories, tasks, issues, initiatives, wiki assets
- Basic query tokens: `status:`, `type:`, `assignee:me`
- Suggestion dropdown with entity icons, metadata row, and timestamps

## Environment
- Frontend: `http://localhost:5173`
- Backend: `http://localhost:3001`

## Pre-Checks
1. Start backend and frontend.
2. Log in with a valid user account.
3. Ensure user has membership in at least one product with seeded data.

## Manual API Validation

### 1) Endpoint exists and requires auth
Request:
```bash
curl -i 'http://localhost:3001/api/search/quick?q=test'
```
Expected:
- `401 Unauthorized`

### 2) Authenticated request returns grouped payload
Request:
```bash
curl -s -H "Authorization: Bearer <TOKEN>" 'http://localhost:3001/api/search/quick?q=test' | jq .
```
Expected:
- `200 OK`
- JSON shape:
  - `query` — the raw search string
  - `groups.stories[]`
  - `groups.tasks[]`
  - `groups.issues[]`
  - `groups.initiatives[]`
  - `groups.wikiAssets[]`
  - `filters` — parsed token metadata (`text`, `status`, `type`, `assigneeMe`)
- Each item contains: `id`, `publicId` (or `null`), `title`, `subtitle`, `product`, `status`, `updatedAt`, `entityType`, `href`

### 3) Product scope guard
Request:
```bash
curl -i -H "Authorization: Bearer <TOKEN>" 'http://localhost:3001/api/search/quick?q=test&product=<UNAUTHORIZED_PRODUCT>'
```
Expected:
- `403 Forbidden` for non-member product

### 4) super_admin scope
Request (logged in as `super_admin`):
```bash
curl -s -H "Authorization: Bearer <ADMIN_TOKEN>" 'http://localhost:3001/api/search/quick?q=test' | jq '.groups'
```
Expected:
- Results from all products, not just membership products

### 5) Token parsing behavior
Requests:
```bash
curl -s -H "Authorization: Bearer <TOKEN>" 'http://localhost:3001/api/search/quick?q=status:open'
curl -s -H "Authorization: Bearer <TOKEN>" 'http://localhost:3001/api/search/quick?q=type:bug'
curl -s -H "Authorization: Bearer <TOKEN>" 'http://localhost:3001/api/search/quick?q=assignee:me'
```
Expected:
- `200 OK` for each
- `filters.status`, `filters.type`, or `filters.assigneeMe` set accordingly in response
- Results filtered by token value where applicable
- `assignee:me` for tasks matches by `ownerUserId` or `assigneeUserIds`, not by display name

### 6) Limit param
Request:
```bash
curl -s -H "Authorization: Bearer <TOKEN>" 'http://localhost:3001/api/search/quick?q=test&limit=2' | jq '.groups.stories | length'
```
Expected:
- At most `2` results per group
- Clamped to max `20` if higher value passed

## Manual UI Validation (Header)

### 1) Debounced network behavior
Steps:
1. Open app in browser and DevTools Network tab.
2. Focus header search input.
3. Type a query character by character.

Expected:
- Network requests sent to `/api/search/quick?q=...`
- Calls debounced at **300 ms** — not one per keystroke

### 2) Suggestion dropdown renders with sections
Steps:
1. Type a query that returns results.

Expected:
- Dropdown appears below input (`w-[156%]` width)
- Results grouped by entity type with section headers (e.g. "Stories", "Tasks")
- Each result shows:
  - Colored entity icon badge (blue=story, emerald=task, red=issue, violet=initiative, amber=wiki)
  - Result title
  - Metadata row: product name • status (formatted) • humanized updated time (e.g. `5m ago`, `Yesterday`)
- `publicId` badge is currently **hidden** (commented out) — no badge should appear before the title

### 3) Clicking a suggestion navigates correctly
Steps:
1. Click a suggestion in the dropdown.

Expected:
- Active product switches to match the result's product
- Route navigates to the entity `href` (e.g. `/stories?story=uuid`)
- Dropdown closes

### 4) Empty query behavior
Steps:
1. Type any query.
2. Clear input field.

Expected:
- No new search request on empty value
- Dropdown closes and `suggestions` state cleared

### 5) No results state
Steps:
1. Search for a query with no matching data.

Expected:
- Dropdown shows "No results found" message, not an empty dropdown

### 6) Click-outside closes dropdown
Steps:
1. Open the dropdown by typing.
2. Click anywhere outside the search input / dropdown.

Expected:
- Dropdown dismisses without navigating

### 7) Error resilience
Steps:
1. Stop backend temporarily.
2. Type in search input.

Expected:
- UI remains interactive
- No crash; errors only logged to console
- Dropdown shows "No results found" or is hidden

## Known Temporary Limitations
- `publicId` is present in the API response but the badge in the dropdown UI is **commented out** pending stable public ID generation across all entity types.
- Public ID generation for tasks is currently disabled (`null`) to avoid DB constraint conflicts.

## Handover Notes
- Suggestion dropdown is fully implemented in v1 (not deferred).
- `filters` field in response can be used by future UI to show active filter chips.
- `safeQueryRows` handles missing tables gracefully — issues table absence returns empty array rather than 500.
- Product name resolution is applied to tasks and wiki assets (stored as `productId`, displayed as name).
