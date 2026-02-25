# Phase 26: E2E Playwright Tests - Context

**Gathered:** 2026-02-23
**Status:** Deferred to later milestone (context captured for when revisited)

<domain>
## Phase Boundary

Add browser-level Playwright E2E tests for 4 critical user flows: login, order creation (with inventory fulfillment), kitchen shift submission (production log + wastage), and restock planner. Includes CI integration via GitHub Actions manual dispatch, and a prod-to-dev snapshot script.

**Note:** Existing Playwright infrastructure is already in place (config, global setup with PIN reset, helpers for login/navigation/screenshots, and some spec files for sales analytics and entity verification). This phase extends that foundation.

</domain>

<decisions>
## Implementation Decisions

### Test data strategy
- Use a **prod-to-dev database snapshot** as the data foundation (dev data is stale)
- Include a **reusable snapshot script** (Convex export/import) as a phase deliverable so it can be run on demand
- Global setup **verifies essential entities exist** after snapshot (customer, product with BOM, etc.) and creates them only if missing
- Test-created entities use **`[E2E]` prefix** naming convention for easy identification and bulk cleanup
- On test failure, **leave `[E2E]` data in place** and move on — next run creates fresh entities

### Flow coverage depth
- **Happy path + 1-2 error cases** per flow (good coverage/effort balance)
- **Login flow:** Success + wrong PIN error
- **Order creation:** Full lifecycle — create -> confirm -> fulfill from inventory -> verify completion. Note: orders are now inventory-based, NOT kitchen-driven. Orders pick up available inventory from locations; admin can force complete if inventory exists but isn't up to date
- **Kitchen shift submission:** Simple flow — log balls produced + wastage. Also test manager path for updating targets/defaults. **IMPORTANT: Researcher must review Phases 23-24 to understand current kitchen flow — it has changed significantly**
- **Restock planner:** Happy path save + validation error
- Tests can form a **sequential chain** (login -> order creates data -> kitchen uses it) since config already has `fullyParallel: false` and `workers: 1`

### CI integration
- **Manual dispatch only** (workflow_dispatch) — no automatic triggers
- Run against **dev environment** (dev:exciting-fennec-671)
- **Start Vite dev server in CI** (npm run dev) — tests run against localhost:5173
- **Dispatch with input options:** which suite to run (all/login/orders/kitchen/restock), headed/headless toggle

### Test isolation
- **Dedicated test entities** created by global setup: `[E2E] Test Customer`, `[E2E] Test User` — all test actions use these
- Each test can depend on prior tests in the chain (sequential execution)
- No automatic cleanup on failure — `[E2E]` tagged data stays; can be bulk-deleted later or wiped by next prod snapshot

### Claude's Discretion
- Inventory seeding approach for fulfillment tests (seed test batches vs. rely on snapshot — recommend seeding for reliability)
- Exact error cases to test per flow (1-2 per flow, pick the most valuable)
- Test file organization and naming conventions
- Playwright test utilities and shared fixtures beyond existing helpers.ts
- Exact GitHub Actions workflow YAML structure

</decisions>

<specifics>
## Specific Ideas

- Orders no longer flow through kitchen — they're inventory-based (pick from location, or admin force-complete)
- Kitchen flow is now simplified: input is balls produced + wastage, plus a manager path for targets/defaults
- Existing infrastructure to build on: `playwright.config.ts`, `tests/e2e/global-setup.ts`, `tests/e2e/helpers.ts` (loginAsManager, navigateTo, waitForDataLoad, screenshot utilities)
- Prod-to-dev snapshot script should be simple enough to run standalone (not just as part of test setup)

</specifics>

<deferred>
## Deferred Ideas

- **Entire phase deferred** to a later milestone — context captured here so decisions don't need to be re-discussed
- Visual regression testing (screenshot comparison) — could be a future enhancement
- Performance testing / load testing — separate concern entirely

</deferred>

---

*Phase: 26-e2e-playwright-tests*
*Context gathered: 2026-02-23*
*Status: Deferred to later milestone*
