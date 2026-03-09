# Phase 39: E2E Test Foundation & Resilience - Context

**Gathered:** 2026-03-06
**Status:** Ready for planning

<domain>
## Phase Boundary

Establish Playwright E2E tests for 3 critical user paths (order lifecycle, kitchen production, sales analytics) and fix the Tamtem depot silent deduction failure. Infrastructure already exists (playwright.config.ts, global-setup.ts, helpers.ts, 8 existing specs) -- this phase adds mutation-level test coverage for the 3 most critical flows and fixes a data integrity gap.

</domain>

<decisions>
## Implementation Decisions

### Test scope & depth
- **Order lifecycle:** Full mutation flow via UI. Create a real order through the form, confirm it, trigger production, box it, and complete. Core path: Draft -> Confirmed -> InProduction -> Boxed -> CompleteShipped (skip AwaitingPayment and WaitingShipment/Labeled steps). ~25s per run.
- **Kitchen production:** Full production flow via UI. Navigate to KitchenViewV2, trigger ball production via UI buttons, verify tray counts update, and do an EoS recording. Requires a confirmed order with production items already in the system (seed via the order lifecycle test or ConvexHttpClient).
- **Sales analytics:** Period navigation + channel breakdown verification. Navigate to Sales Analytics, verify period selector works (switch weeks), verify channel breakdown table renders with correct columns. Matches RES-03 scope -- no deep data verification needed.

### Test infrastructure reuse
- Extend existing `tests/e2e/helpers.ts` (loginAsManager, navigateTo, waitForDataLoad, screenshot utilities)
- Extend existing `tests/e2e/global-setup.ts` (ConvexHttpClient pattern for data seeding)
- Keep existing `playwright.config.ts` settings (Chromium-only, serial, 60s timeout, reuseExistingServer)
- Follow existing screenshot-per-step pattern for debugging failed tests

### Tamtem depot fix approach
- **Auto-seed on first use:** When depot deduction logic can't find the Tamtem depot storage location, create it automatically (same config as seedFinishedGoodsLocations migration). Zero manual intervention required.
- **Both depots:** Auto-seed covers both Tamtem AND Goldfinch depot locations when either is missing. Both are static consignment outlets with the same risk.
- **Seed depth:** Create the storage location AND seed zero-stock inventory batches for all active packaging component types. The FIFO deduction logic needs batches to exist for tracking.

### Claude's Discretion
- Test data seeding strategy (whether kitchen test depends on order test output or seeds independently)
- Exact DOM selectors for order form fields and kitchen buttons
- Whether to add a shared test fixture for "order with production items"
- Placement of auto-seed logic (inline in deduction path vs. shared helper)

</decisions>

<specifics>
## Specific Ideas

- Order test should exercise the real UI forms, not seed via API -- this catches form validation bugs and React state issues
- Kitchen test needs a confirmed order with BOM-resolved production items before it can test ball production
- Sales analytics test only needs to verify UI navigation and table structure, not exact revenue numbers
- Auto-seed should follow the same pattern as the existing seedFinishedGoodsLocations migration for consistency

</specifics>

<code_context>
## Existing Code Insights

### Reusable Assets
- `playwright.config.ts`: Fully configured (Chromium, serial, webServer, screenshots on)
- `tests/e2e/global-setup.ts`: ConvexHttpClient pattern for pre-test mutations (PIN reset, user unlock)
- `tests/e2e/helpers.ts`: `loginAsManager`, `navigateTo`, `waitForDataLoad`, `screenshot`, `screenshotElement`
- `convex/migrations/seedFinishedGoodsLocations.ts`: Existing migration with Tamtem/Goldfinch depot creation logic -- reuse config values
- 8 existing spec files provide patterns for page navigation, DOM assertions, and screenshot capture

### Established Patterns
- E2E specs are screenshot-heavy (screenshot per step, stored in `tests/e2e/screenshots/`)
- Global setup uses ConvexHttpClient to call mutations directly (no HTTP API wrapper)
- Tests run against the dev Convex instance (`exciting-fennec-671`)
- Serial execution (workers: 1, fullyParallel: false) -- tests can depend on shared state
- Existing helpers handle Convex reactive query settle time (3s waitForTimeout after navigation)

### Integration Points
- Order creation: `src/pages/OrderCreate.tsx` form -> `convex/orders/mutations/orderCrud.ts`
- Status transitions: `src/pages/OrderDetail.tsx` buttons -> `convex/orders/mutations/statusUpdates.ts`
- Kitchen production: `src/pages/KitchenViewV2.tsx` -> `convex/orders/mutations/` (ball production, EoS)
- Sales analytics: `src/pages/SalesAnalytics.tsx` -> `convex/externalData/queries.ts`, `convex/reports/queries.ts`
- Tamtem depot deduction: triggered during order dispatch/completion flow in status transitions
- GoBiz outlet config: `convex/integrations/gobiz/config.ts` maps G958262444 to "Legato Tamtem"

</code_context>

<deferred>
## Deferred Ideas

None -- discussion stayed within phase scope.

</deferred>

---

*Phase: 39-e2e-test-foundation-resilience*
*Context gathered: 2026-03-06*
