# Frontend Architect Forensic Review (Unresolved Items)

Date: 2026-03-30  
Scope: `productierv1/src` (Vue frontend only)

## Executive Findings (Current Health Signals)

- `npm run lint:frontend` passes.
- `npm run type-check` passes.
- `npm run test` passes (`22` files, `70` tests).
- `npm run build-only` passes and chunk-size warning is no longer emitted.

## Critical Issues

- **Monolith UI components still exceed maintainable boundaries.**
  - Remaining large surfaces include:
    - `src/components/delivery/TaskDetailPanel.vue`
    - `src/views/TasksListView.vue`
    - `src/views/InitiativeView.vue`
    - `src/components/layout/MainHeader.vue`
    - `src/components/layout/SubProductSidebar.vue`
  - Risk: high regression surface and slow delivery for cross-cutting changes.

- **Legacy API compatibility surface still exists and requires final cleanup.**
  - Domain APIs were split into `src/lib/api/*` modules and core transport was extracted, but a temporary compatibility bridge remains in `src/lib/apiClient.ts`.
  - Risk: accidental re-coupling if new work keeps targeting legacy entry points.

## High Issues

- **List-view architecture is still partially duplicated.**
  - Shared activity dropdown behavior is now deduplicated, but filtering/sorting/column orchestration remains repeated across major views.

- **Mutation flow still relies on broad list refetches in key stores.**
  - Hot paths in `src/stores/backlog.ts` and `src/stores/deliveries.ts` still over-refresh after single-record updates.

- **Sidebar product switch still triggers wide eager fetches.**
  - `src/components/layout/SubProductSidebar.vue` refresh path remains broad instead of route-aware lazy loading.

- **Search-triggered API requests are still inconsistently debounced/cancelled.**
  - Some screens still issue direct refresh calls from watch handlers.

- **Silent/low-signal error handling still exists outside remediated paths.**
  - Several `catch {}` and "ignore" flows remain in older components/stores.

## Medium Issues

- **Persistence abstraction remains inconsistent in non-remediated views.**
  - Direct storage usage still exists alongside composable-based persistence.

- **Route mapping/fallback logic is still duplicated across layers.**
  - Router, navigation registry, and notification route-fallback maps remain separately maintained.

- **Locale formatting is still partially hardcoded.**
  - Central locale helpers were introduced and adopted in priority paths, but broad adoption is incomplete.

- **Design tokens are still bypassed by hardcoded color literals in many screens.**

- **Accessibility still has broad cleanup work remaining.**
  - Priority icon-button labels were improved, but full keyboard/semantic/accessibility normalization is not complete.

## Low Issues

- **`console.error` remains in some production-facing paths.**
- **API access style is still mixed between direct fetch usage, stores, wrappers, and compatibility layer.**
- **Coverage breadth improved but remains shallow relative to total frontend surface.**

## Architectural Summary

The frontend is now materially healthier at the gate level (lint/type/test/build all green), and major stability/security/performance blockers were removed. Remaining risk is primarily structural: large coupled components, residual duplication, and unfinished normalization of shared patterns and standards across the long tail of screens.
<!-- # Frontend Architect Forensic Review

Date: 2026-03-30
Scope: `productierv1/src` (Vue frontend only)

## Executive Findings (Health Signals)

- `npm run type-check` fails with multiple compile-time TypeScript errors in active frontend paths.
- `npm run test` fails (`2` failing tests in `HomeDashboardView.spec.ts`).
- `npm run build-only` succeeds but emits a large-chunk warning with a very large initial bundle (`index` chunk about `1.13 MB`, gzip about `356 KB`).
- Frontend surface is broad (`~214` source files), but behavior is concentrated in very large view/components and a few oversized shared modules.

## Critical Issues

- **Type-check is currently broken in shipping frontend code.**
  - Evidence: `src/views/DeliveryView.vue`, `src/views/home/ExecutiveHomeView.vue`, `src/views/home/TeamHomeView.vue`, `src/components/dashboard/DashboardPageActionsMenu.vue`, `src/composables/useTeamsViewModel.ts`, `src/views/InitiativeView.vue`.
  - Impact: static guarantees are not trustworthy; CI quality gates are weakened; regressions become easier to ship.

- **Permission/session state can leak across user switches in the same SPA session.**
  - `roles` store has no reset path while auth logout only clears auth token/user.
  - Evidence: `src/stores/roles.ts` (no reset), `src/stores/auth.ts` (`logout()` only clears auth), `src/App.vue` (only metadata reset on logout).
  - Risk: stale authorization decisions and stale route-access state after logout/login as another user.

- **Activities endpoints are called without auth token in key list views.**
  - Evidence:
    - `src/views/StoriesListView.vue` (`apiFetch('/activities', { query: ... })` no token)
    - `src/views/DeliveriesListView.vue` (same pattern)
    - `src/views/TasksListView.vue` (same pattern)
  - Risk: 401 behavior, noisy failures, and inconsistent UX under authenticated API expectations.

- **Initial bundle and shared chunking are too heavy for enterprise scale UX targets.**
  - Build output: `dist/assets/index-*.js` about `1,131 KB` uncompressed with Vite warning for chunk size.
  - Impact: slower first-load, worse TTI/LCP, higher bandwidth cost for authenticated shell.

- **Monolith UI components exceed maintainable bounds and couple many concerns.**
  - Examples:
    - `src/components/delivery/TaskDetailPanel.vue` (`~1921` lines)
    - `src/views/TasksListView.vue` (`~1806` lines)
    - `src/views/DashboardView.vue` (`~1400` lines)
    - `src/views/InitiativeView.vue` (`~1347` lines)
    - `src/views/StoriesListView.vue` (`~1334` lines)
    - `src/components/layout/MainHeader.vue` (`~1138` lines)
    - `src/components/layout/SubProductSidebar.vue` (`~921` lines)
  - Impact: high regression risk, low testability, slow onboarding, and hard refactoring.

- **API layer is centralized into a God-module with broad domain coupling.**
  - Evidence: `src/lib/apiClient.ts` (`~971` lines) mixes transport, auth, metadata, roles, onboarding, products, settings, notifications, org teams.
  - Impact: poor domain isolation, larger shared bundles, and harder ownership boundaries.

## High Issues

- **Large-scale copy/paste architecture across major list views.**
  - Similar patterns duplicated in `StoriesListView`, `TasksListView`, `DeliveriesListView`, `FeatureRequestsView`, `FeedbacksView`.
  - Repeated concerns: inline editing, column persistence, activity dropdowns, filtering, sorting, local state orchestration.
  - Impact: inconsistent behavior drift and expensive parallel fixes.

- **Inefficient mutation flow: full refetch after many single-record updates.**
  - Evidence:
    - `src/stores/backlog.ts`: most task/story mutations end with `fetchStories()`.
    - `src/stores/deliveries.ts`: update/create triggers `fetchDeliveries()`.
    - `src/views/DeliveriesListView.vue`: calls `updateDelivery()` then triggers additional refresh flow.
  - Impact: avoidable network load and latency spikes on common edit operations.

- **Sidebar eagerly loads many domains on product switch regardless of active page.**
  - Evidence: `src/components/layout/SubProductSidebar.vue` `refreshForActiveProduct()` calls initiatives, stories, deliveries, releases, test cycles, issues, org teams, favorites.
  - Impact: over-fetching and slow product-context switches.

- **Search-triggered API calls are often not debounced/cancelled.**
  - Evidence:
    - `src/views/FeatureRequestsView.vue` (`watch(searchQuery, refreshFeatureRequests)`)
    - `src/views/FeedbacksView.vue` (`watch(searchQuery, refreshFeedbacks)`)
    - `src/views/DeliveriesListView.vue` (`watch(searchQuery, refreshDeliveries)`)
  - Impact: request storms, race conditions, and unnecessary backend pressure.

- **Silent catch blocks hide failures and suppress forensic visibility.**
  - Many `catch {}` and `catch { /* ignore */ }` patterns in critical user flows.
  - Evidence includes `src/stores/products.ts`, `src/composables/useHybridSettings.ts`, `src/components/delivery/TaskDetailPanel.vue`, `src/components/backlog/StoryDetailPanel.vue`, `src/views/*`.
  - Impact: support/debugging difficulty and undetected user-facing faults.

- **Hybrid settings persistence can drop writes across different keys.**
  - Evidence: `src/composables/useHybridSettings.ts` uses a single shared debounce timer for all `saveSetting()` calls.
  - Impact: rapid multi-setting updates can overwrite pending saves.

- **Type/model drift indicates partial migrations not fully completed.**
  - Evidence:
    - `src/composables/useHomeScope.ts` `HomeScopeMode` excludes `team`, while views still compare against `'team'`.
    - Compile failures in `ExecutiveHomeView`/`TeamHomeView` confirm this drift.
  - Impact: dead paths, brittle behavior, and migration residue in production code.

- **Unused legacy views remain as maintenance ballast.**
  - `src/views/DashboardView.vue` and `src/views/OverviewView.vue` are large but not referenced by current router or imports.
  - Impact: cognitive overhead and unclear source of truth.

- **Test suite is brittle and currently red after dependency evolution.**
  - `HomeDashboardView.spec.ts` fails because store setup assumptions no longer match component dependencies (Pinia usage path changed).
  - Impact: reduced confidence in changes to home/dashboard behavior.

- **JWT stored in localStorage for primary session token.**
  - Evidence: `src/stores/auth.ts` + `src/lib/browserStorage.ts`.
  - Risk: higher blast radius under XSS compared with hardened cookie-based strategies.

- **Raw HTML rendering (`v-html`) depends on server sanitization discipline.**
  - Evidence:
    - `src/views/WikiView.vue` (`renderContent` returns content directly)
    - `src/views/InitiativeView.vue` (description rendering)
    - `src/views/ReleaseView.vue` (release notes rendering)
  - Impact: frontend trust boundary depends on backend sanitization never regressing.

## Medium Issues

- **Persistence abstraction is inconsistently applied.**
  - Some views use `browserStorage` helpers/composables; others call `localStorage` directly with `as any`.
  - Evidence: `FeatureRequestsView.vue`, `FeedbacksView.vue`, `DashboardView.vue`, `InitiativesListView.vue`, `ReleasesView.vue`, `TestCyclesListView.vue`.
  - Impact: inconsistent error handling, SSR safety assumptions, and migration difficulty.

- **Navigation and route mapping logic is duplicated across layers.**
  - Evidence: `src/router/index.ts`, `src/registry/navigation.ts`, `src/stores/notifications.ts` (fallback route maps), `src/registry/navigationUi.ts`.
  - Impact: route drift risk and duplicated maintenance effort.

- **Locale formatting is hardcoded to `en-US` in many places.**
  - Found across numerous views/components using `toLocaleDateString('en-US', ...)`.
  - Impact: weak i18n readiness and inconsistent locale behavior.

- **Design tokens are bypassed by widespread hardcoded color literals.**
  - Extensive inline color usage (`#4857FE`, etc.) across many views/components.
  - Impact: theme inconsistency and expensive visual refactors.

- **Accessibility gaps appear in recurring patterns.**
  - Icon-only buttons without explicit accessible names in several places (example: back/edit icon buttons in detail pages).
  - Clickable non-semantic containers used for interactions (example: overlay dismiss and expandable card rows).
  - Impact: keyboard/screen-reader quality gaps.

- **Frontend linting guardrails are weak/missing.**
  - No dedicated frontend ESLint config found in app root; only server lint config present.
  - Impact: style and quality regressions pass unnoticed.

- **Vitest global config uses `node` environment for a component-heavy UI codebase.**
  - Evidence: `vitest.config.ts` sets `environment: 'node'`; some specs override with jsdom manually.
  - Impact: uneven test environments and hidden DOM-related regressions.

## Low Issues

- **`console.error` remains in production-facing paths.**
  - Examples in metrics tabs and list activity loaders.
  - Impact: noisy telemetry and unmanaged error reporting strategy.

- **Inconsistent API access styles increase coupling.**
  - Coexistence of:
    - direct `apiFetch` in components,
    - domain stores,
    - `src/lib/api/*.ts` wrappers,
    - giant `apiClient.ts`.
  - Impact: unclear ownership and inconsistent error/typing behavior.

- **Test coverage breadth is narrow relative to frontend surface.**
  - `~13` spec files for a broad and complex UI footprint.
  - Impact: low regression containment on core workflows.

## Architectural Summary

The frontend currently behaves like a single, tightly coupled SPA shell with domain logic spread across very large view components and a few oversized shared modules. The main risk profile is not one isolated bug; it is systemic: codebase scale and coupling have overtaken current modularity, test guardrails, and performance budgets. The type-check and test failures confirm this is already affecting delivery reliability, not just future maintainability.
-->
