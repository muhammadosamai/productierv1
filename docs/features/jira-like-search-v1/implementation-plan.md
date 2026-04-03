# Jira-like Search v1 — Implementation Plan

## Goal
Implement Jira-style global quick search suggestions from the header, scoped to authorized product data, with basic query tokens.

## Scope (v1)
- Suggestions dropdown rendered in header (expandable to dedicated `/search` page later)
- Entities: stories, tasks, issues, initiatives, wiki assets
- Query syntax: plain text + basic tokens (`status:`, `assignee:me`, `type:`)
- Secure scoping by authenticated user and product membership
- `super_admin` users can search across all products

## Deliverables
1. Backend quick search endpoint: `GET /api/search/quick`
2. Frontend header integration to consume grouped suggestions
3. Shared frontend search response typings
4. QA manual test handover document

## Implementation Steps
1. Create `server/src/routes/search.ts` with `searchRoutes`
2. Parse query (`q`, optional `product`, optional `limit`) and auth token
3. Resolve allowed product scope from memberships; `super_admin` bypasses membership check
4. Query each entity (stories/tasks/issues/initiatives/wiki) using safe filters and limits
   - `safeQueryRows` wrapper handles missing tables (e.g. issues not yet migrated) gracefully
   - Product ID → name resolution for task and wiki rows (stored as `productId`, returned as `product` name)
5. Return grouped JSON payload including `filters` parsed metadata
6. Register route in `server/src/index.ts`
7. Add `src/types/search.ts` response typings (`SearchQuickItem`, `SearchQuickResponse`)
8. Update `src/components/layout/MainHeader.vue` integration:
   - 300 ms debounce on input watcher
   - Typed `suggestions` state driven from `SearchQuickResponse['groups']`
   - Computed `suggestionSections` filters out empty entity groups
   - Suggestion dropdown (width `w-[156%]`) with section headers and per-item entity icons
   - Entity icon + colored badge per entity type via `entityIconTheme` record and `iconBadgeBaseClass`
   - Metadata row: product name • status • humanized `updatedAt` timestamp
   - `publicId` badge in item row (currently commented out — temporary)
   - Click-outside handler to dismiss dropdown
   - Clicking a suggestion switches active product and navigates to entity `href`
9. Verify with manual endpoint tests + UI typing checks

## API Contract (v1)
`GET /api/search/quick?q=<query>&product=<optional>&limit=<optional>`

### Query params
| Param | Required | Default | Notes |
|---|---|---|---|
| `q` | Yes | — | Min 1 char; supports `status:`, `type:`, `assignee:me` tokens |
| `product` | No | all membership products | Filtered to user's memberships; `super_admin` unrestricted |
| `limit` | No | `5` | Clamped 1–20, applied per entity group |

### Success 200
```json
{
  "query": "auth bug",
  "groups": {
    "stories": [
      {
        "id": "uuid",
        "publicId": "PRD-12",
        "title": "...",
        "subtitle": "...",
        "product": "Product Name",
        "status": "in_progress",
        "updatedAt": "2026-04-02T10:00:00Z",
        "entityType": "story",
        "href": "/stories?story=uuid"
      }
    ],
    "tasks": [],
    "issues": [],
    "initiatives": [],
    "wikiAssets": []
  },
  "filters": {
    "text": "auth bug",
    "status": null,
    "type": null,
    "assigneeMe": false
  }
}
```

### Item `entityType` values
`story` | `task` | `issue` | `initiative` | `wiki`

### `publicId` note
Present in API response for stories, tasks, and issues. Initiatives and wiki assets return `null`. Currently commented out in the UI — to be re-enabled once public ID generation is stable.

### Error cases
- `401` when auth token is missing/invalid
- `403` when requested product is not in user membership scope
- `400` when `q` is empty after trim

## Non-goals (v1)
- Full JQL parser
- Ranking ML/personalization
- Dedicated global search page
- Cross-tenant search outside membership scope
