# Roadmap: Frollie Recipe Master

## Milestones

- ✅ **v1.0 Concerns Cleanup & Refactor** — Phases 1-11 (shipped 2026-02-15)
- ✅ **v1.1 Stabilization & QoL** — Phases 12-16 (shipped 2026-02-16)
- ✅ **v1.2 Unified Planning & Revenue** — Phases 17-18 (shipped 2026-02-21)
- 📋 **v1.3 GoFood, Kitchen & Consignment** — Phases 19-22 (planned)

## Phases

<details>
<summary>✅ v1.0 Concerns Cleanup & Refactor (Phases 1-11) — SHIPPED 2026-02-15</summary>

- [x] Phase 1: Test Infrastructure (4/4 plans) — completed 2026-02-13
- [x] Phase 2: Quick Fixes — Security & Docs (2/2 plans) — completed 2026-02-13
- [x] Phase 3: Quick Fixes — Tech Debt (4/4 plans) — completed 2026-02-13
- [x] Phase 4: Quick Fixes — Bugs (2/2 plans) — completed 2026-02-13
- [x] Phase 5: Backend Factories (3/3 plans) — completed 2026-02-13
- [x] Phase 6: BOM Migration (3/3 plans) — completed 2026-02-14
- [x] Phase 7: Query Optimization (3/3 plans) — completed 2026-02-14
- [x] Phase 8: Schema Cleanup (4/4 plans) — completed 2026-02-14
- [x] Phase 9: UI Brand Consolidation (5/5 plans) — completed 2026-02-14
- [x] Phase 10: Frontend Factories (3/3 plans) — completed 2026-02-14
- [x] Phase 11: Infrastructure & Consolidation (3/3 plans) — completed 2026-02-14

Full details: `.planning/milestones/v1.0-ROADMAP.md`

</details>

<details>
<summary>✅ v1.1 Stabilization & QoL (Phases 12-16) — SHIPPED 2026-02-16</summary>

- [x] Phase 12: UI Brand Verification (1/1 plan) — completed 2026-02-15
- [x] Phase 13: API Audit & Auth Architecture (5/5 plans) — completed 2026-02-15
- [x] Phase 14: Order QoL (8/8 plans) — completed 2026-02-16
- [x] Phase 14.1: Draft Order Update (3/3 plans) — completed 2026-02-16
- [x] Phase 15: Kitchen Overhaul (4/4 plans) — completed 2026-02-16
- [x] Phase 16: K3Mart Cockpit (6/6 plans) — completed 2026-02-16
- ~~Phase 16.1: GoBiz OpenAPI Audit~~ — DROPPED (GoBiz stopped issuing OAuth2 keys)

Full details: `.planning/milestones/v1.1-ROADMAP.md`

</details>

<details>
<summary>✅ v1.2 Unified Planning & Revenue (Phases 17-18) — SHIPPED 2026-02-21</summary>

- [x] Phase 17: Unified Dispatch Planner & 3rd Outlet (6/6 plans) — completed 2026-02-17
- [x] Phase 17.1: Product Inventory Tracker (5/5 plans) — completed 2026-02-21 (inserted)
- [x] Phase 18: Production Ingredient Tracking & COGS (9/9 plans) — completed 2026-02-21

**Known gaps (deferred to v1.3):** GF-02, GF-03, GF-04 (GoFood depot management), KIT-09, KIT-12 (kitchen targets)

Full details: `.planning/milestones/v1.2-ROADMAP.md`

</details>

### 📋 v1.3 GoFood, Kitchen & Consignment (Planned)

**Milestone Goal:** Close GoFood depot management gaps, link dispatch planning to kitchen production targets, and add consignment sales tracking with manual Excel upload and unified lifetime sales analytics.

- [ ] **Phase 19: GoFood Depot Management** — Per-outlet product mapping, per-depot stock tracking with alerts, restock suggestion algorithm, Tamtem silent-skip fix (GF-02, GF-03, GF-04, GF-05)
- [ ] **Phase 20: Kitchen Production Targets & Overhaul** — Simplified kitchen UI, targets from dispatch plan/defaults, end-of-shift production recording → Finished Goods, waste logging, shift history (KIT-09, KIT-12, KIT-13–18)
- [ ] **Phase 21: Consignment Upload** — Excel template download, bulk and detail upload with row validation, audit log, batch delete (CON-01, CON-02, CON-03, CON-04, CON-05)
- [ ] **Phase 22: Sales Analytics Extension** — Consignment channel in stacked charts, lifetime units sold headline counter with per-product and per-channel breakdown (ANLY-01, ANLY-02, ANLY-03)

## Phase Details

### Phase 19: GoFood Depot Management

**Goal:** Admin can configure per-outlet product mappings for each GoFood depot, track per-depot stock levels with low-stock alerts, receive daily restock suggestions, and see an explicit warning when the finished goods seed has not been run
**Depends on:** Phase 17.1 (builds on finished goods inventory + GoFood deduction infrastructure)
**Requirements:** GF-02, GF-03, GF-04, GF-05
**Implementation Notes:**
- `gofoodDepotStock` table must gain `outletId` field + composite index `(outletId, productId, date)` before any other work — this is the blocking schema dependency for per-depot tracking
- Use `/frontend-design` skill for holistic UI definition before implementation waves
**Success Criteria** (what must be TRUE):
  1. Mapping tab has an outlet selector — admin can view and edit product mappings per GoFood depot; a new depot defaults its mapping to the previous depot's configuration
  2. Each GoFood depot page shows current stock level; system auto-deducts based on synced GoFood sales after the admin sets starting stock
  3. Alert fires and is visible on the depot page when any depot drops below 5 total products remaining
  4. Restock suggestion is shown per depot: n+1 average of last 3 days; n+2 on Friday and Saturday; Monday resets to the previous Thursday total
  5. When `seedFinishedGoodsLocations` has not been run, an admin-visible warning appears on the GoFood depot page instead of a silent skip
**Plans:** 5 plans

Plans:
- [ ] 19-01-PLAN.md — Schema migration + core backend (transferStock, isSeedRequired, per-outlet queries)
- [ ] 19-02-PLAN.md — Restock suggestion algorithm + product mapping CRUD
- [ ] 19-03-PLAN.md — GoFood Depot page (cockpit table, mapping section, stock transfers, seed warning)
- [ ] 19-04-PLAN.md — Finished Goods tab redesign (hero, grouping toggle, transfer actions)
- [ ] 19-05-PLAN.md — Dispatch Planner GoFood restock extension

### Phase 20: Kitchen Production Targets & Overhaul

**Goal:** Full kitchen view redesign — simplified production-focused UI (remove boxing/stickering), display today's targets (ball totals + packaging breakdown from dispatch plan or defaults), end-of-shift recording that updates Finished Goods Inventory, optional waste logging by reason, shift history with manager edit capability, and manager daily override
**Depends on:** Phase 17 (dispatch planner), Phase 17.1 (finished goods inventory), Phase 19 (depot management)
**Requirements:** KIT-09, KIT-12, KIT-13, KIT-14, KIT-15, KIT-16, KIT-17, KIT-18
**Implementation Notes:**
- Use `/frontend-design` skill for holistic UI definition before implementation waves
- Target derivation: (1) ball totals from BOM quantities via dispatch plan; (2) packaging breakdown from menu products + BOM linkage
- Priority order for targets: per-day override > dispatch plan > configured defaults
- End-of-shift submission triggers Finished Goods Inventory update at Kitchen storage location
- Waste categories: QA/testing, spoilage, waste (all optional)
- Past shift editing requires inventory impact confirmation dialog
**Success Criteria** (what must be TRUE):
  1. Kitchen view is simplified: no boxing/stickering columns; full-screen production focus; targets at top-center; collapsible order context toggle
  2. Today's targets show ball totals by type (Original/Jumbo) + packaging breakdown (singles, triples, cafe-singles, etc.) derived from dispatch plan via BOM or configured defaults
  3. Manager can configure default targets on the kitchen page; manager can also override today's targets (per-day, does not affect defaults)
  4. End-of-shift input at middle-bottom accepts produced quantities by product type + optional waste by reason (QA/testing, spoilage, waste); two-step confirmation (review → success screen)
  5. Submitting end-of-shift adds produced quantities to Finished Goods Inventory at Kitchen location; waste quantities are deducted
  6. Shift production records are stored and viewable by managers; manager can edit past shifts with inventory impact warning
**Plans:** TBD (run /gsd:plan-phase 20 to break down)

Plans:
- [ ] TBD

### Phase 21: Consignment Upload

**Goal:** User can download a pre-formatted Excel template, upload consignment sales in bulk or detail format with row-level validation and preview before committing, view the upload history per outlet, and delete a past batch to reverse its revenue rows
**Depends on:** Phase 20 (all v1.3 backend infrastructure in place)
**Requirements:** CON-01, CON-02, CON-03, CON-04, CON-05
**Implementation Notes:**
- SheetJS 0.20.3 must be installed from CDN tarball: `npm install --save https://cdn.sheetjs.com/xlsx-0.20.3/xlsx-0.20.3.tgz` — NOT from npm registry (registry version is abandoned 0.18.5)
- CON-03 template download must be Wave 1 alongside schema — outlets need the template before they upload
- Use static import only at top of Convex action file (`import * as XLSX from "xlsx"`) — never dynamic import (CLAUDE.md Pitfall #8)
- Chunk mutation writes at 100-200 rows maximum; add 5 MB file size guard in UI before parsing begins
- `convex/lib/dateUtils.ts` WIB utility must be created in this phase and imported by Phase 22
- Inspect `dispatchConsignmentOutlets` data before Phase 21 Wave 1 to decide outlet FK strategy (reuse existing IDs vs. create parallel `externalOutlets` rows with `source = "consignment"`)
- Validate merged-cell detection in parser before `sheet_to_json`; template must have zero merged cells
- Use `/frontend-design` skill for holistic UI definition before implementation waves
**Success Criteria** (what must be TRUE):
  1. User can download a pre-formatted Excel template with two sheets (Bulk Summary and Transaction Detail), example rows, no merged cells, and a note warning not to merge cells
  2. User selects an outlet and uploads a Bulk Summary Excel file; system validates rows with row number and column name on error, shows a preview table, warns on duplicate outlet + date range, and only commits after confirmation
  3. User uploads a Transaction Detail Excel file; system applies the same row-level validation and preview flow, auto-detects the format from the presence of a `transactionId` column header
  4. User can view upload history per outlet showing status, row count, and upload date
  5. User can delete a past upload batch; system reverses all associated revenue rows and removes the batch from history
**Plans:** TBD (run /gsd:plan-phase 21 to break down)

Plans:
- [ ] TBD

### Phase 22: Sales Analytics Extension

**Goal:** Sales Analytics shows consignment outlets as distinct segments in stacked bar charts and displays a lifetime units sold headline counter with per-product and per-channel breakdown table across all channels
**Depends on:** Phase 21 (consignment rows must exist in `externalRevenue` for lifetime aggregation; `convex/lib/dateUtils.ts` created in Phase 21)
**Requirements:** ANLY-01, ANLY-02, ANLY-03
**Implementation Notes:**
- Fix `getDailySalesSummary` channel filter to `channel = "direct"` BEFORE writing `getLifetimeTotals` — building aggregation on a broken foundation guarantees wrong numbers
- All aggregation date boundaries must use `convex/lib/dateUtils.ts` WIB utility from Phase 21
- Per-channel source of truth: Direct = `orders` filtered to `channel = "direct"`; GoFood/K3Mart/Consignment = `externalRevenue` by source
- `getLifetimeTotals` per-product join for Direct channel requires joining `orderItems` (not `externalRevenue`) — plan a design review to avoid N+1 patterns
- Lifetime total must not exceed total balls from production log (physical upper bound validation)
- Research flag: `getLifetimeTotals` per-product join complexity should be reviewed before assigning to executor
- Use `/frontend-design` skill for holistic UI definition before implementation waves
**Success Criteria** (what must be TRUE):
  1. Each consignment outlet that has revenue data appears as its own color segment in the Sales Analytics stacked bar charts; outlets with no data are not shown
  2. Sales Analytics has a Lifetime tab showing a headline counter of total units sold across all channels and all time
  3. The Lifetime tab shows a per-product breakdown table (sortable by total units descending) aggregated across all channels
  4. The Lifetime tab shows a per-channel breakdown (GoFood, K3Mart, Direct, and each consignment outlet separately) contributing to the grand total
**Plans:** TBD (run /gsd:plan-phase 22 to break down)

Plans:
- [ ] TBD

## Progress

| Phase | Milestone | Plans Complete | Status | Completed |
|-------|-----------|----------------|--------|-----------|
| 1-11. Foundation → Infrastructure | v1.0 | 36/36 | Complete | 2026-02-15 |
| 12-16. UI → K3Mart Cockpit | v1.1 | 27/27 | Complete | 2026-02-16 |
| 17. Unified Dispatch Planner & 3rd Outlet | v1.2 | 6/6 | Complete | 2026-02-17 |
| 17.1. Product Inventory Tracker | v1.2 | 5/5 | Complete | 2026-02-21 |
| 18. Production Ingredient Tracking & COGS | v1.2 | 9/9 | Complete | 2026-02-21 |
| 19. GoFood Depot Management | v1.3 | 0/5 | Planned | - |
| 20. Kitchen Production Targets | v1.3 | 0/TBD | Not started | - |
| 21. Consignment Upload | v1.3 | 0/TBD | Not started | - |
| 22. Sales Analytics Extension | v1.3 | 0/TBD | Not started | - |

### Phase 23: Optimize top Convex query reads to reduce production bandwidth

**Goal:** [To be planned]
**Depends on:** Phase 22
**Plans:** 0 plans

Plans:
- [ ] TBD (run /gsd:plan-phase 23 to break down)
