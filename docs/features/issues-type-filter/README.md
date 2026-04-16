# Issues List: Type Column Filter

## Goal
Add a value filter for the `type` column in `IssuesView` with parity to existing column filters (`status`, `severity`, `priority`).

## Implementation
- Added Type filter state (`typeColumnIncludedIds`) and menu state (`showTypeColumnFilter`) in `src/views/IssuesView.vue`.
- Added Type filter actions:
  - `isTypeIncludedForFilter()`
  - `toggleTypeColumnFilter()`
  - `selectAllTypeColumnFilters()`
  - `toggleTypeFilterPanel()`
- Added Type into shared filter controls:
  - `closeAllColumnFilterMenus()`
  - `resetAllColumnValueFilters()`
  - `anyColumnFilterMenuOpen`
  - `typeFilterInTableHeader`
- Added filtering step in `columnFilteredIssues` to apply selected type values.
- Added Type filter dropdown UI in:
  - toolbar filter group (for card mode or hidden Type column)
  - Type table header (when Type column is visible)

## Data Source
- Uses canonical `ISSUE_TYPES` from `shared/issueTypes.ts`.
- Uses `typeLabel()` for display text and `normalizeIssueFilterToken()` for matching.

## Validation
- `npm run type-check` passes.
