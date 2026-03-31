# Frontend Issue Ledger

Source: `FRONTEND_ARCHITECT_REVIEW.md`  
Scoring model: Critical=`4`, High=`3`, Medium=`2`, Low=`1`  
Total weighted backlog: `74` points

## Closure Rules

- An issue is **Closed** only when:
  - Code change is merged in frontend scope.
  - Relevant tests were added/updated (or explicitly N/A with rationale).
  - `npm run type-check`, `npm run test`, and `npm run build-only` remain green.
  - Behavior is manually validated on affected screens.
- Report hygiene rule:
  - Remove issue bullet from `FRONTEND_ARCHITECT_REVIEW.md` only after all closure rules pass.

## Critical (24 points)

| ID | Issue | Weight | Acceptance Criteria |
| --- | --- | ---: | --- |
| C1 | Type-check broken in shipping frontend | 4 | `npm run type-check` passes with zero TS errors in current frontend sources |
| C2 | Permission/session leak across user switches | 4 | Roles/permission state resets on logout and user-switch; regression test added |
| C3 | Activities endpoints missing auth token | 4 | Auth token is passed on activity calls in key list views; verified no 401 regressions |
| C4 | Initial bundle/shared chunking too heavy | 4 | Bundle split strategy introduced and measured size reduction documented |
| C5 | Monolith UI components too large/coupled | 4 | At least one bounded extraction per target monolith + coverage on extracted boundary |
| C6 | API God-module in `apiClient.ts` | 4 | Domain API surface extracted into modules; `apiClient.ts` reduced to compatibility facade |

## High (33 points)

| ID | Issue | Weight | Acceptance Criteria |
| --- | --- | ---: | --- |
| H1 | Copy/paste architecture across list views | 3 | Shared composables/utilities introduced and consumed by multiple list views |
| H2 | Full refetch mutation flow inefficiency | 3 | At least key mutation paths use local optimistic patching or targeted refresh |
| H3 | Sidebar over-fetches on product switch | 3 | Data fetch becomes route-aware/lazy and avoids non-needed domain calls |
| H4 | Search requests not debounced/cancelled | 3 | Debounce + cancellation added for high-frequency search views |
| H5 | Silent catches hide failures | 3 | High-risk silent catches replaced with typed/user-visible error handling |
| H6 | Hybrid settings debounce drops writes | 3 | Per-key write queue/debounce implemented; regression tests prove no cross-key loss |
| H7 | Type/model migration drift (`homeScope`) | 3 | Scope types and callsites are consistent; no unreachable comparisons remain |
| H8 | Unused legacy views remain | 3 | Dead legacy views removed/archived after usage proof |
| H9 | Test suite brittle/red | 3 | Existing failing tests are fixed and stabilized |
| H10 | JWT in localStorage | 3 | Selected security path implemented with explicit mitigation and tests |
| H11 | Raw HTML trust boundary weak | 3 | Frontend adds sanitation/guardrails at `v-html` boundaries |

## Medium (14 points)

| ID | Issue | Weight | Acceptance Criteria |
| --- | --- | ---: | --- |
| M1 | Inconsistent persistence abstraction | 2 | Direct `localStorage` callsites are migrated to shared storage abstraction in priority views |
| M2 | Duplicated route mapping logic | 2 | Route mapping canonicalized/reused to reduce duplicate fallback maps |
| M3 | Hardcoded locale formatting | 2 | Central locale formatter utility introduced and adopted in priority screens |
| M4 | Hardcoded color literals bypass tokens | 2 | Token-driven palette usage increased in touched surfaces |
| M5 | Accessibility gaps in recurring patterns | 2 | Icon-only buttons and non-semantic interactive patterns remediated in priority flows |
| M6 | Frontend lint guardrails missing | 2 | Frontend ESLint config + script established and runnable |
| M7 | Vitest env defaults not ideal | 2 | Vitest default env aligned for component testing and existing specs updated |

## Low (3 points)

| ID | Issue | Weight | Acceptance Criteria |
| --- | --- | ---: | --- |
| L1 | `console.error` in production-facing paths | 1 | Replaced with centralized user-safe/reporting strategy in touched modules |
| L2 | Inconsistent API access style | 1 | Domain access pattern documented and applied to newly touched modules |
| L3 | Narrow test breadth | 1 | Additional targeted tests added for high-risk changed flows |

## Progress Tracker

- Closed weighted points: `0 / 74`
- Target for 50%: `>= 37`
- Recommended first closure batch: `C1 + C2 + C3 + H6 + H7 + H9` (`21` points), then `H1/H5/H4` (`+9`) and one medium (`+2`) to surpass threshold safely.
