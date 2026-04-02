# Jira-like Search v1 — QA Manual Test Handover

## Scope Covered
- Header quick search integration in `src/components/layout/MainHeader.vue`
- Backend endpoint `GET /api/search/quick`
- Entity groups: stories, tasks, issues, initiatives, wiki assets
- Basic query tokens: `status:`, `type:`, `assignee:me`

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
	- `query`
	- `groups.stories[]`
	- `groups.tasks[]`
	- `groups.issues[]`
	- `groups.initiatives[]`
	- `groups.wikiAssets[]`

### 3) Product scope guard
Request:
```bash
curl -i -H "Authorization: Bearer <TOKEN>" 'http://localhost:3001/api/search/quick?q=test&product=<UNAUTHORIZED_PRODUCT>'
```
Expected:
- `403 Forbidden` for non-member product

### 4) Token parsing behavior
Requests:
```bash
curl -s -H "Authorization: Bearer <TOKEN>" 'http://localhost:3001/api/search/quick?q=status:open'
curl -s -H "Authorization: Bearer <TOKEN>" 'http://localhost:3001/api/search/quick?q=type:bug'
curl -s -H "Authorization: Bearer <TOKEN>" 'http://localhost:3001/api/search/quick?q=assignee:me'
```
Expected:
- `200 OK` for each
- Results filtered according to token where applicable

## Manual UI Validation (Header)

### 1) Debounced network behavior
Steps:
1. Open app in browser and DevTools Network tab.
2. Focus header search input.
3. Type a query slowly.

Expected:
- Requests sent to `/api/search/quick?q=...`
- Calls are debounced (not one per keystroke instantly)

### 2) Empty query behavior
Steps:
1. Type any query.
2. Clear input.

Expected:
- No new search request on empty value.
- Frontend clears cached suggestion groups.

### 3) Error resilience
Steps:
1. Stop backend temporarily.
2. Type in search input.

Expected:
- UI remains interactive.
- No crash; errors only logged to console.

## Handover Notes
- Current v1 integrates data fetching and typed suggestion state in header.
- Suggestion dropdown rendering is out of this scope and can be added as v1.1 using the existing `groups` payload.
