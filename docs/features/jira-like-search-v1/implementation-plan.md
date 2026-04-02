# Jira-like Search v1 — Implementation Plan

## Goal
Implement Jira-style global quick search suggestions from the header, scoped to authorized product data, with basic query tokens.

## Scope (v1)
- Suggestions only in header (no dedicated `/search` results page)
- Entities: stories, tasks, issues, initiatives, wiki assets
- Query syntax: plain text + basic tokens (`status:`, `assignee:me`, `type:`)
- Secure scoping by authenticated user and product membership

## Deliverables
1. Backend quick search endpoint: `GET /api/search/quick`
2. Frontend header integration to consume grouped suggestions
3. Shared frontend search response typings
4. QA manual test handover document

## Implementation Steps
1. Create `server/src/routes/search.ts` with `searchRoutes`
2. Parse query (`q`, optional `product`, optional `limit`) and auth token
3. Resolve allowed product scope from memberships
4. Query each entity (stories/tasks/issues/initiatives/wiki) using safe filters and limits
5. Return grouped JSON payload for quick suggestions
6. Register route in `server/src/index.ts`
7. Add `src/types/search.ts` response typings
8. Update `src/components/layout/MainHeader.vue` integration to typed response
9. Verify with manual endpoint tests + UI typing checks

## API Contract (v1)
`GET /api/search/quick?q=<query>&product=<optional>&limit=<optional>`

### Success 200
```json
{
  "query": "auth bug",
  "groups": {
    "stories": [],
    "tasks": [],
    "issues": [],
    "initiatives": [],
    "wikiAssets": []
  }
}
```

### Error cases
- `401` when auth token is missing/invalid
- `403` when requested product is not in user membership scope
- `400` when `q` is empty after trim

## Non-goals (v1)
- Full JQL parser
- Ranking ML/personalization
- Dedicated global search page
- Cross-tenant search outside membership scope
