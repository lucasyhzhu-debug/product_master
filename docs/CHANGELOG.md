# Changelog

> **Purpose:** Version history for Frollie Recipe Master.
> **When to update:** After ANY code change is merged to main.

## Update Instructions

After merging any code change, add a new entry with:
- Date and descriptive title
- 1 or 2 liner for humans to understand that is none-techinical - how does it benefit them
- Summary of what changed
- Files modified (if significant)
- Any migration steps or breaking changes

---

## [Unreleased]

### Phase 80.3 — Analytics Internal-Mirror Dedup (R5 Skip) -- 2026-04-19

**For the team:** The `/analytics` Unit Economics dashboard was double-counting every Direct-channel order (WhatsApp, Instagram, walk-in). Direct-channel revenue, units, and orders now match the Sales Aggregation page (K3Mart Cockpit Overview) on equivalent date ranges. **If you set revenue or unit targets from the Analytics page before this fix, those targets were inflated ~2x for the Direct channel; the corrected numbers are the real figures.**

**Expected All Time impact at the time of the fix:**
- Revenue (Net) drops from ~Rp 517M → ~Rp 387M
- Units sold drops from 9,493 → 8,876 (delta 617 BOM-expanded balls)
- Orders drops from 2,629 → 2,364 (delta 265 duplicate Direct orders)

Other channels (GoFood, Shopee, Tokopedia, K3Mart, TikTok, Consignment) are unaffected.

**Root cause:** `loadExternalStream` in `convex/reports/unitEconomics.ts` was unioning native `orders` + `orderItems` rows with the `externalRevenue[source="internal"]` mirror that `syncInternalOrders` writes for the Sales Aggregation pipeline. Every Direct order therefore appeared twice — once via the native path, once via the internal-mirror path. The R5 dedup rule was specified in the Phase 80 Task 4b staff-review addendum (2026-04-14) but the production code change was never shipped — commit `59069988` only modified plan documents.

**Fix:** One line inside `loadExternalStream` skips externalRevenue rows where `source === "internal"`. The internal mirror remains in `externalRevenue` for the Sales Aggregation pipeline (which only reads `externalRevenue` and never unions `orders`).

**Tests:** New file `convex/reports/__tests__/unitEconomics.test.ts` with 13 regression tests across 11 analytics reducers (kpiSummary, channelEconomics, channelMomentum, byWeekday, byWeekdayRolling, rollingTrend, dayHourHeatmap, volumeByType, typeMixOverTime, skuTop, skuChannelMatrix). Includes a hard negative-regression guard that the GoFood (`gobiz`) channel is NOT skipped — preventing a future over-aggressive widen of R5 that would zero out GoFood revenue.

**Files modified:** `convex/reports/unitEconomics.ts`, `convex/reports/__tests__/unitEconomics-unlinked.test.ts` (re-seeded an existing test to use a native order instead of the internal mirror), `convex/reports/__tests__/unitEconomics.test.ts` (new).

---

### Phase 80.2 — Unlinked Products Fix (K3Mart + Direct) -- 2026-04-19

**For the team:** The `(Unlinked)` bucket on the `/analytics` SKU Pareto and SKU Channel Matrix reports will collapse for K3Mart and Direct channels — every K3Mart SKU mapped in the admin UI now retroactively attaches to its historical revenue, and every Direct order (historical + future) now carries the line-item detail the reports need. Only Consignment (expected) remains in the unlinked bucket.

**Two independent bugs producing the same symptom:**
1. K3Mart mapping cascade never ran for `source === "k3mart"`. Admin UI mappings saved but never patched `externalRevenue` parents — 737/737 K3Mart parents were unlinked.
2. `syncInternalOrders` skipped child-item creation for any parent that already existed (`if (!isNew) continue;`), leaving 219/262 Direct parents synced before 2026-04-10 permanently orphaned (no children) and falling through to the reports' synthesis-path "Unlinked" bucket.

**Fixes:**
- **K3Mart retroactive cascade** — `applyRetroactiveProductMappingImpl` extended with a K3Mart branch (after Shopee/TikTok) that scans `externalRevenue` by `[source, externalProductCode]` and patches `linkedMenuProductId` with a 4000-row safety cap + idempotency guard.
- **K3Mart sync-time linking** — `syncK3MartSales` pre-fetches the SKU→menuProduct map once per sync and attaches `linkedMenuProductId` per record before `saveRevenue` (no more "new unlinked rows every sync").
- **Direct historical backfill** — new admin-only paginated-WRITE mutation `backfillInternalRevenueItems` rebuilds `externalRevenueItems` for orphan Direct parents from the native `orders` + `orderItems` tables. Idempotent via `saveRevenueItems`' existing `(revenueId, externalItemId)` dedup.
- **Direct re-sync heal** — `syncInternalOrders` guard at `adapter.ts:126` now checks child-existence instead of `if (!isNew) continue;`. Re-syncs now self-heal orphan parents.

**Schema:**
- Added index `by_source_productCode` on `externalRevenue` (composite `[source, externalProductCode]`) for efficient K3Mart cascade lookup.
- Added optional `summary: string` field on `externalSyncLogs` — holds audit counter JSON for backfill runs without polluting `errorMessage` (which would corrupt existing monitoring filters).

**API:**
- New admin mutation: `externalData.mutations.backfillInternalRevenueItems` — paginated, idempotent, writes one audit row to `externalSyncLogs.summary` per invocation. NOVEL PATTERN for this codebase — first paginated-WRITE mutation.
- `applyRetroactiveProductMappingImpl` return type widened additively with new `externalRevenueUpdated: number` field. All 3 existing call sites continue to work unchanged.
- New shared helpers: `getK3MartMappingBySku` + `attachLinkedMenuProductId` (K3Mart) and `hasExternalRevenueItems` (externalData).

**Tests:** 5 new test files / 19 new tests — cascade, pure helper attach, backfill counters, Direct adapter self-heal (novel `t.action(...)` pattern), unitEconomics attribution regression. All green.

**Prod data run:** ~219 Direct parents backfilled, ~737 K3Mart parents linked (pending user-gated execution). Convex export captured as rollback insurance before any prod mutation.

**Files modified:** `convex/schema.ts`, `convex/integrations/k3mart/adapter.ts`, `convex/integrations/k3mart/helpers.ts`, `convex/integrations/k3mart/queries.ts` (new), `convex/externalData/mutations.ts`, `convex/externalData/queries.ts`, `convex/externalData/helpers/revenueItemsHelpers.ts` (new), `convex/integrations/internal/adapter.ts`, 5 new test files under `convex/integrations/k3mart/__tests__/`, `convex/externalData/__tests__/`, `convex/integrations/internal/__tests__/`, `convex/reports/__tests__/`. Docs updated: CHANGELOG.md, SCHEMA.md, API_REFERENCE.md.

---

### Phase 80.1 — Analytics Dashboard Perf & Chart Primitives Consolidation -- 2026-04-18

**For the team:** `/analytics` now loads faster and is visually consistent. Filter changes (date range, channel, product) trigger 3 backend queries instead of 12 — roughly 75% less write-invalidation traffic. Chart axis labels never silently hide, every truncated label reveals its full text on hover, and every tooltip has dark-background / light-text (WCAG-AA) with category colors rendered as small swatches instead of colored value text.

**Performance:**
- `/analytics` consolidated 12 per-widget Convex queries into 3 grouped snapshot queries (`kpiAndChannelSnapshot`, `timeSeriesSnapshot`, `skuSnapshot`). Filter changes trigger 3 subscriptions, not 12. `orders`-write re-invalidation surface cut by ~75%. Call-counter regression test locks the invariant (kpiAndChannel=2 loads, time=1, sku=1, precomputeBomMaps=1 per invocation).
- `/analytics` route is lazy-loaded (existing `lazyWithPreload` wrap preserved) — Nivo chunk (`vendor-nivo-*.js`) only loads when the page is visited. Verified via build output + DevTools Network.

**UX (R1 — no-clip + hover-reveal):** Shared `ChartFrame` / `CHART_MARGIN` / `X_AXIS_STRING_LABEL_PROPS` / `truncateWithTooltip` primitives in `src/lib/chartPrimitives.tsx` enforce non-clipping axis labels across 8 Recharts widgets. Every truncated label (e.g. long SKU name in SkuPareto or SkuChannelHeatmap) now reveals the full text via tooltip hover.

**UX (R2 — WCAG-AA tooltips):** Shared `ChartTooltip` primitive enforces dark-popover + light-text contrast (≥4.5:1 verified by inline luminance test). Category colors render as small swatches only — never as value text color.

**UX (R3 — heatmaps transposed + contrast-adaptive labels):** `DayHourHeatmap` now displays days (Mon–Sun) across the top axis and hour bins as rows; cell values show % share of that day's revenue (raw IDR in tooltip). `SkuChannelHeatmap` channels axis moved to top. Both heatmaps use contrast-adaptive `labelTextColor` (white text on dark cells, dark text on light cells) — `hsl(var(...))` CSS variables replaced with plain hex so react-spring animation doesn't crash. `SkuParetoChart` x-axis labels no longer clip at chart edges (SVG `overflow-visible` + wider left margin).

**Library:** Added pinned `@nivo/core` + `@nivo/heatmap` (0.99.0, no caret). `manualChunks` splits `@nivo/*` + `@react-spring/*` into `vendor-nivo` chunk (~111 kB uncompressed) so the main vendor bundle stays under the 600 kB cap.

**Cleanup:** Deleted 12 deprecated per-widget query wrappers from `convex/reports/unitEconomics.ts` (`kpiSummary`, `channelEconomics`, `channelMomentum`, `byWeekday`, `rollingTrend`, `dayHourHeatmap`, `volumeByType`, `typeMixOverTime`, `unitsPerTxnByChannel`, `aovByChannel`, `skuPareto`, `skuChannelMatrix`). All 25 tests in `tests/convex/unitEconomics.test.ts` ported to call the 3 snapshot queries. Safety grep (src/ + tests/ + convex/) confirmed zero remaining references before deletion.

**Files modified:** `convex/reports/unitEconomics.ts`, `src/components/analytics/DayHourHeatmap.tsx`, `src/components/analytics/SkuChannelHeatmap.tsx`, `src/lib/chartPrimitives.tsx` (existing from Wave B), `src/hooks/convex/useAnalytics.ts` (existing from Wave B), 8 migrated chart widgets (existing from Wave B), `tests/convex/unitEconomics.test.ts`, `tests/convex/unitEconomicsSnapshots.test.ts`, `package.json`, `package-lock.json`, `vite.config.ts`.

**Breaking change:** External Convex clients calling the 12 deprecated paths must migrate to the 3 snapshot paths. Frollie Recipe Master has no external clients — internal impact only.

---

### Chore: GSD — extend quad_review consolidation to /gsd:quick --full -- 2026-04-17

**For the team:** The quad_review consolidation applied to phase execution earlier today also applies to `/gsd:quick --full` — that workflow also had a sequential code-review-then-triple-review pattern (Step 6.25 followed by Step 6.3). Collapsed them into a single `Step 6.3: Quad review` that writes REVIEW.md via `gsd-code-reviewer` and then feeds it into triple-review's synthesis as a 4th reviewer.

**What shipped:**
- `get-shit-done/workflows/quick.md` — deleted old `Step 6.25: Code review (auto)` and old `Step 6.3: Triple review` blocks; replaced with a single `Step 6.3: Quad review` step that runs both skills and wires REVIEW.md into triple-review via `--external-review=${QUICK_DIR}/${quick_id}-REVIEW.md`. Same config-matrix degradation as execute-phase: supports full quad, code-only, triple-only, and both-disabled. Fix commits renamed from `fix(quick-N): address triple-review findings` to `fix(quick-N): address quad-review findings`.
- `gsd-local-patches/PATCHES.md` — Patch 2 entry rewritten from "Triple-review, simplify, document & merge" to "Quad review, simplify, document & merge". Verification greps tightened to confirm the old step headers are gone and the new consolidated step is present.

**Scope of consolidation:**
- `execute-phase.md` — done in previous commit (`quad_review` step before `verify_phase_goal`)
- `quick.md` — done in this commit (`Step 6.3: Quad review` before verification)
- `debug.md` — NOT applicable (no upstream code-review step before our triple review)
- `plan-phase.md` — NOT applicable (uses `staffreview` on plans, a different skill targeting different artifacts)

### Chore: GSD — consolidate code_review_gate + triple_review into quad_review -- 2026-04-17

**For the team:** Phase execution used to run two overlapping review passes — first the upstream `gsd:code-review` skill (producing `REVIEW.md`), then later our triple-review — both reading the same changed files and reporting against the same codebase. Now they run as one consolidated `quad_review` step that fires before verification: `gsd:code-review` runs first to produce REVIEW.md, then triple-review consumes that file as a 4th reviewer perspective alongside its three live agents, and the synthesis produces a single unified tiered report covering all four perspectives.

**What shipped:**
- `get-shit-done/workflows/execute-phase.md` — deleted upstream `code_review_gate` step; replaced with new `quad_review` step positioned where `code_review_gate` used to be (before `close_parent_artifacts` → `verify_phase_goal`), so review fixes get verified. Removed the late-position `triple_review` step I added last patch cycle — it's now consolidated into `quad_review`. `simplify` and `document_and_merge` stay late (after verification passes).
- `.claude/commands/triple-review.md` — accepts new `--external-review=PATH` argument. When set, parses the referenced review file (handling YAML frontmatter + section-based finding lists with severity-vocabulary mapping for formats that use "blocker"/"warning"/"suggestion"/etc.) and folds its findings into the synthesis as a 4th reviewer vote. Report header reads "Quad Review" and names `gsd-code-reviewer` alongside the three live agents. Graceful fallback: if the external file is missing or unparseable, the skill runs as a standard 3-reviewer triple review without blocking.
- `gsd-local-patches/PATCHES.md` — Patch 1 entry rewritten to document the consolidation; verification greps tightened to match step tags specifically rather than narrative mentions.

**Config matrix (all three supported):**
- `workflow.code_review=true` + `workflow.triple_review=true` → full quad review (recommended)
- `workflow.code_review=true` + `workflow.triple_review=false` → code review only (upstream behavior)
- `workflow.code_review=false` + `workflow.triple_review=true` → 3-reviewer synthesis only
- both false → skipped entirely

**Why better:** (1) Eliminates redundant work — one pass reads changed files, not two. (2) Triple-review synthesis now benefits from the gsd-code-reviewer's structured finding output as a 4th vote when applying the "flagged by 2+ reviewers → bump tier" consensus rule. (3) Moving the review step BEFORE verification means fixes get verified — the verifier sees post-fix code, not pre-fix. (4) Failure of either skill is non-blocking and degrades gracefully to the other.

### Chore: GSD — remove startup hook that scans for broken hooks -- 2026-04-17

**For the team:** The `gsd-hooks-health.js` SessionStart hook printed a "BROKEN HOOKS DETECTED" banner at every session start while settings.json referenced hook files that didn't exist. The 1.36.0 clean install restored all referenced hook files so the banner no longer fires — and the scanner itself is now vestigial. Removed both the script and its SessionStart entry.

### Chore: GSD — reapply local patches 1-5 against v1.36.0 -- 2026-04-17

**For the team:** The GSD 1.34.2 → 1.36.0 clean install yesterday wiped all local workflow customizations (11 patches). Five of those have been reapplied against v1.36.0 so automated quality gates and PR-merge ceremony are back in every GSD workflow that produces code changes. The other six were evaluated as obsolete or no longer wanted and dropped from `PATCHES.md`.

**What shipped:**
- `get-shit-done/workflows/execute-phase.md` — new `triple_review`, `simplify`, and `document_and_merge` steps between `update_project_md` and `offer_next`. Phase merges now auto-update `CHANGELOG.md`, open a PR, squash-merge, and sync `main`.
- `get-shit-done/workflows/quick.md` — new Steps 6.3 (triple review), 6.4 (simplify), and 9 (document & merge) for `--full` mode quick tasks.
- `commands/gsd/debug.md` — new Steps 5 (quality gates: triple review + simplify) and 6 (document & merge) after a debug session applies a fix. Skipped on `--diagnose` and `ABANDONED` sessions.
- `get-shit-done/workflows/plan-phase.md` — new Step 12.6 "Staff Review Gate" after Plan Bounce. Routes the COMPLETE tiered findings list (Critical + Important + Refinements + Minor + Nitpick) back through the revision loop — not just Critical. Step 11 and Step 12 exits renumbered accordingly.
- `gsd-local-patches/PATCHES.md` — rewritten to document only the 5 surviving patches. Dropped entries retained in a traceability table.

**Config gates added (all opt-in, default `false` where marked):**
- `workflow.triple_review` — runs `/triple-review` skill after code changes
- `workflow.simplify` — runs `/simplify` skill after code changes
- `workflow.staffreview` (default `true`) — runs `/staffreview` skill on plan-phase output

**Dropped patches:** `--quick` default inversion, parallel `/gsd-progress`, auto-reapply on update, auto-run Convex seeds, explicit TaskCreate task tree. See `PATCHES.md` traceability table.

### Chore: CI — run Deploy workflow on PRs for pre-merge gating -- 2026-04-17

**For the team:** Broken TypeScript (or any build failure) now blocks the PR merge button, not just the post-merge deploy. PRs targeting `main` will show a red "Deploy" check if lint or `npm run build` fails.

**What shipped:** Added `pull_request: branches: [main]` trigger to `.github/workflows/deploy.yml`. The `lint-convex` and `build-frontend` jobs run on every PR. Deploy jobs (`check-convex-changes`, `deploy-convex`, `trigger-vercel`) are gated on `github.event_name != 'pull_request'` so nothing deploys from a PR context.

**To fully enforce:** Add the "Deploy / build-frontend" and "Deploy / lint-convex" checks as **required status checks** in GitHub branch protection rules for `main`. Without branch protection, the red check is advisory.

### Chore: CI — add `npm run build` gate before Convex deploy -- 2026-04-17

**For the team:** Prevents split-brain deploys where Convex ships but Vercel can't. If the frontend won't compile, neither system deploys — you'll see a red build on the PR merge commit and main stays on the last good deploy.

**What shipped:** New `build-frontend` job in `.github/workflows/deploy.yml` runs `npm run build` (`tsc -b && vite build`) on every push to `main` and every manual dispatch. Both `deploy-convex` and `trigger-vercel` now depend on it — a failed frontend build blocks both.

**Background:** Phase 74 merge ship-blocked prod because 18 TS errors passed local `tsc --noEmit` but failed Vercel's `tsc -b` (project-reference mode is stricter). GitHub Actions "Deploy" only ran `npx convex deploy`, so the frontend regression wasn't caught until Vercel's deploy hook fired — by which time Convex had already deployed, creating a backend/frontend schema mismatch.

### Fix: Phase 74 prod build — restore per-unit component split + botched-merge residue -- 2026-04-17

**For the team:** Vercel production build was failing with 18 TypeScript errors after Phase 74 merged. Staff Performance page now builds and deploys. No user-visible behavior change — the page already showed grams correctly in dev; prod was blocked from deploying at all.

**Root cause:** Three drifts from the merge commit `2031e615`:
1. `EndOfShiftForm.tsx` kept two copies of `selectedChefId` useState (kept both sides of merge).
2. `aggregateStaffPerformance` helper, when lifted out of `kitchenShiftRecords/queries.ts` in Phase 74, dropped the per-unit split (`totalComponentPieces`, `totalComponentWastePieces`, breakdown `unit` tag) added earlier in the kitchen-dedupe round 2. Frontend (`staffPerformanceExport.ts` + `StaffPerformance.tsx`) was still reading those fields, silently breaking.
3. `ClockOutNudgeDialog` renamed its prop `onClose` → `onOpenChange`; `KitchenViewV2.tsx:451` was still passing the stale name.

**Why CI missed it:** GitHub Actions "Deploy" workflow only runs `npx convex deploy` (backend). Vercel is the only pipeline running `npm run build` (`tsc -b && vite build`). `tsc --noEmit` (local type-check) is looser than `tsc -b` project-reference mode.

**What shipped:**
- `convex/staffAttendance/aggregation.ts` — restored per-unit split; uses shared `ComponentUnit` / `resolveUnit` from new `convex/lib/componentUnit.ts` (mirrors frontend `src/lib/componentUnit.ts`).
- `convex/lib/componentUnit.ts` — new backend helper (type + resolveUnit + sumByUnit).
- `src/components/kitchen/EndOfShiftForm.tsx` — removed duplicate useState.
- `src/pages/KitchenViewV2.tsx` — `onClose` → `onOpenChange`.

**Follow-up tech debt:** aggregation uses per-record `c.unit` with silent last-write-wins on conflict. Should trust `unitByCode` config as source of truth (same pattern already in per-day loop). Same issue mirrored in `kitchenShiftRecords/queries.ts`. Separate refactor.

### Quick task 260417-hyv -- Nav bar simplification -- 2026-04-17

**For the team:** The top nav bar is now much less cluttered. Collapsed from 8 top-level items + 5 dropdowns to just **Dashboards ▾ Orders Ops ▾ Finance ▾ Config ▾**. Sales/Analytics now live under Dashboards; Kitchen/Inventory/Planner/My Perf/K3 Mart/GoFood/GrabFood under Ops; Financials+Accounting merged into Finance; Help and Admin folded into Config. Every page you could reach before is still reachable — just one extra click for items that moved into a dropdown.

**What shipped:** `src/components/layout/Header.tsx` 688 → 519 lines (−169). NavItem restructured as a discriminated union; `navGroups[]` drives both desktop and mobile rendering. All 35 routes preserved, permissions unchanged.

### Feat: Phase 74 -- Staff Attendance -- 2026-04-17

**For the team:** Kitchen staff now clock in/out with one tap. Gate screen at `/kitchen/clock`, running timer, clock-out nudge after shift submission. Managers see hours, flagged shifts, per-day breakdowns on `/staff-performance`. Staff view own data at `/my-performance`. Manager correction dialog with audit trail.

**What shipped:** `staffAttendance` table + 3 mutations + 4 queries + flag engine (missing_clockout, over_16h, overlapping, before_hire) + 7 frontend components + `aggregateStaffPerformance` extension + 57 tests.

**UAT fixes:** Aggregation join fallback (submittedByUserId), hours as h:mm, component grams summary, chef dropdown in ShiftEditDialog, chef selector hidden when clocked in, My Performance link on kitchen page.

**Requirements:** ATT-01, ATT-02, ATT-03, ATT-04.

---

### Fix: Unblock Convex Deploy (19 TS errors in bank-statement tests) -- 2026-04-16

**For the team:** Prod Convex backend was stuck on the pre-kitchen-fix code since 2026-04-16 05:35 UTC because CI deploy failed on TS18048/TS2769 errors in `convex/bankStatements/__tests__/`. The failed deploy meant the new `componentTracking` / `otherBallTargets` fields sent by the updated kitchen UI were rejected by the stale backend (`ArgumentValidationError`), which manifested as "left components not visible in kitchen" and "Server Error when submitting Nutella production target".

**Fix:** Added `!` non-null assertions after `.find()` calls where tests already guard with `expect(x).toBeDefined()`, and corrected one predicate type on `result.rows` that was using `{ channel: string }` instead of the actual `{ channels: string[] }` shape.

**Files:** `convex/bankStatements/__tests__/revenueGap.test.ts`, `convex/bankStatements/__tests__/listCandidates.test.ts`

### Fix: Kitchen UI Component Dedup + Unified Tracking Config -- 2026-04-16

**For the team:** Manager Settings now shows ONE "Component Tracking" table listing every production component (grouped by Tier 1 and Leaf) with a Track? toggle AND a g/pcs unit selector per row. The kitchen shift form automatically reflects what's tracked and records each component in its configured unit. Ball targets, dispatch-plan dropdown, and packaging-mix sections all scale to any tier-1 production code (no more Original+Jumbo hardcoding). Historical shift records preserve the unit they were entered with — switching a component's unit later doesn't corrupt old data.

**Bugs fixed (4 reported + 4 triple-review critical):**
- Soft-deactivated duplicate componentTypes were leaking into Kitchen toggles, End-of-Shift rows, and the codeMap — causing ghost duplicates where toggling one flipped both, and submit handlers writing each component twice (Pistachio Spread 7528g doubled).
- Ball target editor was hardcoded to Original (MID_BALL) + Jumbo (BIG_BALL); new production codes (HAZELNUT_REGULAR / Nutella-Regular) were invisible.
- Dispatch plan dropdown filtered menu products to BIG/MID codes only, hiding Nutella Sea Salt.
- Kitchen Components source filter `tier === 0 && unit === "g"` dropped pcs-unit sub-components (Filling Pistachio 28g, Outer Marshmallow 15g, Nutella Filling 45g). Replaced with the canonical "referenced as child in productionComponentLinks" definition.
- Shift records didn't persist unit — ShiftHistoryList, ShiftEditDialog, DailySummaryWidget, KitchenViewV2 all hardcoded "g" → pcs entries rendered as grams. Staff performance aggregation summed pcs + g homogeneously.
- Daily overrides silently dropped otherBallTargets — HAZELNUT_REGULAR override values lost on save.
- Convex pushes during editing reset unsaved form state in ManagerTargetSettings.
- ShiftEditDialog read legacy `enabledKitchenComponents` only — components toggled off via new unified table stayed visible in edit flow.

**Schema changes (additive, no migration needed):**
- `kitchenConfig.componentTracking: Array<{ code, tracked, unit }>` — single source of truth for kitchen-form visibility + unit per component
- `kitchenConfig.otherBallTargets: Array<{ code, target }>` — per-code ball target for non-BIG/MID production codes
- `kitchenDailyOverrides.otherBallOverrides: Array<{ code, target }>` — same for daily overrides
- `kitchenShiftRecords.componentProduced/componentWaste[].unit: "g" | "pcs"` — per-entry unit (optional; absent = grams for historical records)

**Architectural notes:**
- `getComponentsWithTiers` now returns `isRecipeChild: boolean` — canonical definition for "is this a kitchen-producible sub-component?"
- Extracted shared helpers: `src/lib/componentFilters.ts` (dedupeByCode, getKitchenLeafComponents, getProductionTier1Components) and `src/lib/componentUnit.ts` (ComponentUnit type, resolveUnit, sumByUnit)
- Backward compat: when `componentTracking` is absent, legacy `enabledProductionComponents`/`enabledKitchenComponents` are the fallback source; writes sync both sides until a future migration phase can drop legacy fields.
- Legacy `bigBallTarget`/`midBallTarget` fields preserved; `componentTracking`-derived rows project onto them on save.
- ManagerTargetSettings state collapsed: three separate ball-target useStates → one `ballTargetsByCode: Record<string, number>`.
- `ShiftEditDialog` now delegates to `useKitchenTargets` hook (removes ~60 LOC of re-derivation + closes a C4-fallback divergence).

**Files changed:** 23 files, net +975 LOC (feature + tests-mdfiles + helpers).

**Migration:** None required. On first load of Manager Settings, componentTracking hydrates from existing legacy fields; first Save materializes the new config shape.

**Verification steps (manager/admin):**
1. Kitchen page → Manager Settings → Component Tracking table shows all active production components grouped by tier.
2. Toggle any Track?/unit; save → settings persist.
3. End of Shift form shows only tracked components with their configured unit; submit records unit alongside quantity.
4. History + edit dialog display entries in the unit they were entered with.
5. Ball Targets + Packaging Mix scale to any active tier-1 production code.

---

### Feat: Phase 80 — Unit Economics Analytics Dashboard -- 2026-04-15

**For the team:** Managers and admins can open `/analytics` to see 13 widgets across 6 lenses (headline KPIs, time patterns, channel economics, volume/mix, SKU concentration, momentum). Filterable by date range (7d/30d/90d presets or custom), display channel (Shopee, Tokopedia, GoFood, K3Mart, Direct, Consignment, TikTok, Other), and menu product. All filter state syncs to the URL so views are bookmarkable.

**Critical fixes baked in:**
- Dynamic BOM iteration for production-unit counting — Big Ball + Mid Ball + Hazelnut (+ future production types) are counted automatically. No hardcoded BIG_BALL/MID_BALL checks anywhere in the new code. `convex/dispatchPlanner/queries.ts` migrated off its hardcoded accumulator (Pitfall #11 closure). Return shape preserves `bigBalls`/`midBalls` for backward compat and adds `unitsByType` record for new callers.
- Indexed `by_completed_at` + `by_order_date` bounded scans on orders (eliminates 11x full-table-scan footprint from naive loaders).
- Denormalized `lineTotal` used throughout (via `itemNetRevenue`/`itemGrossRevenue`/`itemDiscount` helpers — no manual revenue recomputation).

**Files added:**
- Backend: `convex/reports/unitEconomics.ts` (11 queries), `convex/reports/productionUnitHelpers.ts`, `convex/reports/revenueHelpers.ts`, `convex/reports/channelTaxonomy.ts`
- Frontend: `src/pages/AnalyticsDashboard.tsx`, 14 widgets in `src/components/analytics/`, `src/contexts/AnalyticsFilterContext.tsx`, `src/hooks/convex/useAnalytics.ts`
- Tests: `tests/convex/unitEconomics.test.ts` (9 cases), `tests/frontend/analytics/*.tsx` (3 smoke tests, 5 test cases)
- Schema: `orders.by_completed_at` + `orders.by_order_date` indexes; `src/lib/platformColors.ts` extended with display-channel aggregates.

**Post-review polish (same phase):**
- Code review (6 warnings WR-01..WR-06): WIB-aware date-picker parsing; rolling-trend now iterates every calendar day (zero-revenue days no longer inflate averages); functional `setFilters` update against URLSearchParams; `DisplayChannel` union deduplicated; SKU analytics aggregate by `menuProductId` (not display name); documented primary/legacy loader split.
- Triple review (3 Critical + 6 Important + 3 Minor): `menuProductIds` filter now constrains the order set (fixed AOV/orderCount/unitsPerTxn lie); `rollingTrend` test rewrite + gap-day regression; `toDateInput` WIB-aware round-trip; product multi-select UI wired to `menuProducts.queries.list`; new `tests/convex/dispatchPlanner.test.ts` (Hazelnut regression); `SkuChannelHeatmap` + `SkuParetoChart` now key by `productKey`; per-order item fetch parallelized via `Promise.all`; `channelEconomics` collapsed `revPerUnit`/`netPerUnit` to a single field; 6-query coverage gap closed; `TYPE_COLORS` consolidated to `src/lib/productionTypeColors.ts`; `jakartaHour` delegates to `getWibComponents.hour`; `unitsPerProduct` hoisted out of double-load paths.
- UAT session iterations: unified `externalRevenue` + `externalRevenueItems` into `loadFilteredData` so GoFood / Shopee / K3Mart / TikTok channel analytics populate (previously invisible); K3Mart `bomUnresolvedUnits` fallback for parent-only `externalRevenue` rows without itemized breakdown; active filter summary line above the filter bar; SKU Pareto tooltip formatter split (currency vs %); X-axis labels rotated + visible; WeekdayDualAxisChart gains a Units/Order line + Rolling-vs-Weekday mode toggle (backend `byWeekday` now accepts `mode` arg); DayHourHeatmap transposed (days = columns, hours = rows) and 0-9am collapsed into a single "Overnight" row; weekday axes swapped so Orders + Units share the left axis and Units/Txn owns the right axis; custom hover tooltips across weekday / rolling trend / heatmap / rev-per-unit / SKU Pareto; active preset button highlights when its range matches the current filter.
- Build: `vendor-*.js` bundle cap raised from 500 kB to 600 kB to accommodate recharts + analytics vendor footprint.

**Migration:** None. Read-only additive changes. Route protected by `canAccessDashboard` (manager + admin).

---

### Feat: Phase 73 -- Bank Reconciliation UI & Workflow -- 2026-04-16

**For the team:** The bank reconciliation module graduates from "imported statements + auto-classified lines" to a full reviewer workspace. Managers (not just admins) can now open `/bank-reconciliation`, pick a statement, review every line in a two-pane split view, link each to the right expense/revenue/reimbursement/payroll record, and confirm with a single click — which posts a balanced journal entry. Unmatch of a confirmed line automatically posts a reversal JE so the books stay in sync. Batch confirm handles all exact-tier matches in one preview + post. When no existing record fits, reviewers can inline-create an expense, revenue entry, or reimbursement shell without leaving the page. A new Revenue Gap dashboard tab surfaces bank credits vs external-platform revenue side-by-side so discrepancies become visible per channel per period.

**What shipped:**
- Split-view workspace at `/bank-reconciliation` (Review tab): bank lines pane (left) with direction + confirmed filters, candidates pane (right) with 4 typed groups (expense / revenue / reimbursement / payroll), sticky action bar with Match / Unmatch / Confirm / Confirm-all-exact-tier / inline-create / search-all-records / route-to-asset-register CTAs.
- Live per-statement reconciliation progress: Progress bar + 4 badge chips (matched / suggested / unmatched / confirmed), per-row live progress column on the Statements tab history list (single bulk query, no per-row `useQuery` storm).
- Batch Confirm preview modal: groups by (DR, CR), grand-total row, `Ledger imbalance` destructive alert when DR ≠ CR, Post button disabled on imbalance, surfaces skipped count when lines lack JE accounts.
- Learn-from-Override dialog: pre-fills a keyword-rule form from the line's parsed counterparty + description + chosen category. Saving calls the new manager+admin `createFromOverride` mutation (admin-only CRUD stays admin-only on the dedicated /bank-rules page).
- Inline record creation from unmatched bank lines:
  - Expense (D-17 critical: status hard-coded `submitted`, NEVER `approved`; receipt required; reviewer is often not the person who incurred the expense).
  - Revenue (strict 8-literal `externalSource` validator, not `v.string()`).
  - Reimbursement (batch shell + deep-link to /reimbursements/{batchId} for multi-item picker).
- Search-all-records dialog: 4 tabs widening the default ±3-day / exact-amount candidate window.
- CapEx round-trip: bank lines flagged `capex_needs_asset_register` show [Route to Asset Register]. AssetRegister intake auto-opens CreateAssetDialog with URL prefill, surfaces duplicate detection (vendor + cost + ±3 day acquisition date), and on save the backend creates the asset + acquisition JE + companion expense + patches the bank line in one transaction.
- Revenue Gap dashboard tab: per-period table of channel × bank credits × external revenue × diff × diff%. Period picker (last-12 WIB months or custom range, capped at 366 days). Mapped channels render with colored dot; unmapped channels surface in a separate "Channels not tracked" group; row click drills into Review tab with channel + period filter applied.
- Unmatch with reversal: destructive AlertDialog precedes reversal; reversal JE posted via direct `createJournalEntryWithLines` call with new `journalEntries.sourceType = "bank_statement_reversal"` literal (bypasses NON_REVERSIBLE_TYPES guard). Reversal JE date preserved from original JE (JE-03 — keeps accounting period intact).
- Permission widening (D-23): `/bank-reconciliation` route + sidebar entry + all `bankStatements.*` queries and mutations now manager + admin. `/bank-rules` + `bankKeywordRules.{create,update,deactivate}` stay admin-only.

**Schema (D-25 / D-26):**
- `bankStatementLines` gains 9 optional audit fields: `confirmedAt / confirmedBy / confirmedJournalEntryId`, `reversedAt / reversedBy / reversalJournalEntryId`, `createdExpenseId / createdRevenueId / createdReimbursementId`.
- `journalEntries.sourceType` union gains `"bank_statement_reversal"` literal. `"bank_statement"` stays in `NON_REVERSIBLE_TYPES` — reversal is a fresh JE through the bank-specific direct call, not the generic void path.

**Backend:** 12 new exports across `convex/bankStatements/*` and `convex/bankKeywordRules/mutations.ts`:
- Mutations (manager + admin): `manualMatch`, `unmatch`, `confirmLine`, `batchConfirmExactTier`, `inlineCreateExpense`, `inlineCreateRevenue`, `inlineCreateReimbursement`, `markAssetLinked`, `createFromOverride`.
- Queries (manager + admin): `getStatementProgress`, `getStatementProgressBulk`, `listCandidatesForLine`, `searchExpenses`, `searchRevenue`, `searchReimbursements`, `searchPayroll`, `revenueGapByPeriod`, `getLine`.
- Existing P72 queries widened manager+admin: `listStatements`, `getStatement`, `findByFileHash`, `listLines`.
- `convex/fixedAssets/mutations.ts::create` extended with optional `sourceBankLineId` — creates companion expense + patches bank line in the same transaction when supplied.

**Frontend:** 17 new components under `src/components/bankReconciliation/` (split-view panes, dialogs, progress header, revenue gap tab, etc.), 16 new hooks in `src/hooks/convex/useBankReconciliation.ts`, refactored `src/pages/ExpenseSubmit.tsx` with extracted shared `src/components/expense/ExpenseSubmitForm.tsx` so the page and the inline dialog share the exact same field/validation/receipt-upload logic (I4 mandate).

**Tests:** 79+ new tests across 3 surfaces. 8 backend vitest files (Plan 01: manualMatch / unmatch / confirmLine / batchConfirm — 24 tests; Plan 02: channelMapping / progress / revenueGap / listCandidates / createFromOverride — 55 tests). 3 frontend component tests (StatementHistoryList / StatementProgressHeader / ReconciliationActionBar — 11 tests). 6 Playwright E2E specs covering inline-expense / batch-confirm / capex-roundtrip / split-view / learn-from-override / role-gating.

**Files modified:** Dozens. Canonical source-of-truth files: `convex/schema.ts`, `convex/lib/journalEngine.ts`, `convex/bankStatements/{mutations,queries}.ts`, `convex/bankKeywordRules/mutations.ts`, `convex/fixedAssets/mutations.ts`, `src/pages/BankReconciliationPage.tsx`, `src/pages/AssetRegister.tsx`, `src/App.tsx`, `src/components/layout/Header.tsx`, `src/hooks/convex/useBankReconciliation.ts`, 17 new components under `src/components/bankReconciliation/`.

---

### Fix: Shopee SKU Preserve + Query-time Mapping + Per-Platform Fees -- 2026-04-14

**For the team:** The BigSeller sync table on Sales Analytics had three issues: (1) recent Shopee orders showed `--` in the SKUs column and all previously-known SKU mappings appeared to vanish after re-sync; (2) there was no way to see which Frollie product each BigSeller SKU maps to, or to fix an unmapped SKU without leaving the page; (3) the Buyer Shipping column was stuck at Rp 0 for Shopee rows despite BigSeller's API returning the fee. All three are now fixed and mappings are preserved across re-syncs.

**Root causes:**
- `upsertOrders` was unconditionally overwriting `bigsellerOrders.skuVoList`. When BigSeller's `/shopee/pageList.json` returned an empty `skuVoList` on a re-sync (upstream data-freshness glitch), our DB overwrote good data with empty.
- The sync table only rendered raw BigSeller SKU strings — it never joined against `externalProductMappings` to show the mapped Frollie product, so users could not diagnose mapping gaps inline.
- `buyerPaidShippingFee` was present on BigSeller's Shopee payload but absent from our `BigSellerOrderRow` type and extractor — a regression vs the Phase 54 fee-mapping intent. The field was silently dropped during Shopee normalization.

**Fix:**
- `convex/bigsellerOrders/mutations.ts` — pure helper `resolveSkuVoListOnUpdate(incoming, existing)` returns `existing` when `incoming` is empty and `existing` has entries; otherwise returns `incoming`. Used by `upsertOrders` so empty upstream responses no longer erase known SKUs. Dead `applyRetroactiveMapping` internalMutation removed.
- `convex/bigsellerOrders/queries.ts` — `listOrders` now joins each `skuVoList[].sku` against `externalProductMappings` (by `source` + `externalProductCode`) → `menuProducts` and returns per-SKU `resolvedSkus: [{ sku, mappedMenuProductName, mappedMenuProductId, externalProductMappingId }]`. No schema change; reactive to mapping edits. New `diagnoseSkuState` internalQuery for Convex Dashboard triage.
- `convex/externalData/mutations.ts` — new `setMenuProductForSku` mutation lets the "Map Manually" UI affordance upsert a mapping by `(source, externalProductCode)` directly from the sync table row. Role guard `["admin", "manager"]` matches the query that drives the table. Shared helper `applyRetroactiveProductMapping` consolidates the retro-link logic (externalRevenueItems patch + BigSeller `linkedRevenueId` patch) that was previously duplicated across `updateProductMapping` and `setMenuProductForSku`.
- `convex/integrations/bigseller/helpers.ts` — `BigSellerOrderRow` now carries optional `buyerPaidShippingFee` and the Shopee branch maps it into `buyerShippingFee` so the sync UI shows the full fee breakdown.
- `src/components/salesAnalytics/BigSellerOrdersTable.tsx` — dual columns "BigSeller SKU" (raw) and "Frollie Product" (resolved name, inline `Map manually…` Select for unmapped SKUs). Pending-SKU tooltip when BigSeller returned `allSkuNum > 0` but `skuVoList` is empty. Toast surfaces `updatedItems + bigsellerUpdated` count so users see how many past orders were relinked.
- `src/components/salesAnalytics/BigSellerSyncPanel.tsx` + `OverviewTab.tsx` — "Profit = Revenue" warning copy clarified with actionable next steps (enter COGS in BigSeller dashboard, or map SKUs to Frollie products for BOM-based margin in Sales Analytics).

**Tests:** 6 new unit tests for the preserve-non-empty helper, 6 new tests for Shopee fee mapping (`buyerPaidShippingFee` → `buyerShippingFee`). `npm run type-check`, `npm run build`, and the affected Vitest suites all pass.

**Backfill:** Not required. Re-syncing the affected Shopee date range once BigSeller's upstream catalog catches up will repopulate `skuVoList`, and the new preserve-guard ensures any future empty response from BigSeller no longer erases known SKUs.

**Files modified:** `convex/bigsellerOrders/mutations.ts`, `convex/bigsellerOrders/queries.ts`, `convex/bigsellerOrders/__tests__/mutations.test.ts`, `convex/externalData/mutations.ts`, `convex/integrations/bigseller/helpers.ts`, `convex/integrations/bigseller/__tests__/normalization.test.ts`, `src/components/salesAnalytics/BigSellerOrdersTable.tsx`, `src/components/salesAnalytics/BigSellerSyncPanel.tsx`, `src/components/salesAnalytics/OverviewTab.tsx`, `src/hooks/convex/useExternalData.ts`, `src/hooks/convex/index.ts`.

### Fix: Vercel Build — Vendor Bundle Cap Bumped to 600 kB -- 2026-04-13

**For the team:** Vercel deploys had been failing for ~21 hours with `vendor-*.js (542.9 / 500 kB) limit exceeded`. Phase 72's `xlsx` library landed in the generic vendor chunk and pushed it past the 500 kB cap. Bumped the cap to 600 kB so deploys go green again. If vendor keeps growing we should split `xlsx` into its own chunk (it's only used by the bank reconciliation page) — TODO captured inline in `vite.config.ts`.

**Files modified:** `vite.config.ts` (bundlesize limit only).

### Fix: Consignment Revenue Recognition on Cash-Receipt Date -- 2026-04-13

**For the team:** Consignment settlement revenue was showing up on the daily channel chart on the *first* day of the consignment period (e.g. Mar 30 for a Mar 30–Apr 5 settlement paid Apr 11). It now lands on the cash-receipt date — either the `paidAt` entered via the SettlementTimeline date picker (Apr 11 in that example) or the consignment period end for pending settlements. Both the time-series chart and the period summary tiles agree on the same date.

**Root cause:** `consignmentSettlements.paidAt` was never propagated to the linked `externalRevenue` row. The daily aggregation bucketing fell back to `periodStart`, and the `by_period` index range filter also scanned by `periodStart`, so settlements were bucketed on their consignment start. Without syncing all three externalRevenue date fields to the recognition date, the time-series view and the period summary view would disagree when `paidAt` ≠ `periodEnd`.

**Fix:**
- `createSettlement`, `updateSettlement`, and `markAsPaid` now write the recognition date to all three externalRevenue period fields together (`periodStart = periodEnd = transactionDate = recognitionDate`) via a shared `collapseRevenuePeriod(target)` helper in `convex/consignment/helpers.ts`. Recognition date = `paidAt` for paid settlements, `periodEnd` for pending.
- `markAsPaid` honours caller-supplied `paidAt` (the date picker) and falls back to `settlement.periodEnd` when omitted. Future-date guard applies only to caller-supplied values, allowing settlements whose `periodEnd` is still in the future to be marked paid.
- `createSettlement` now also seeds `externalRevenue.productName = outlet.name` so bank-reconciliation fuzzy text matching (`convex/bankStatements/matchEngine.ts`) has a descriptor to score against — closes a pre-existing gap noted in the debug session.

Income statement is unaffected: it queries `consignmentSettlements` directly by `periodStart` and stays on accrual for PT statutory P&L.

**Backfill:** `convex/migrations/consignmentRecognitionDate.ts` — `inspectConsignmentRecognition` (dry-run, parallel reads) and `backfillConsignmentRecognition` (idempotent apply). For each consignment settlement, computes `target = paidAt ?? periodEnd` and patches the linked `externalRevenue` row's three period fields to match. **Does NOT modify `consignmentSettlements.paidAt`** — user-captured cash-receipt dates are preserved. Both functions surface orphaned paid settlements (no `linkedRevenueId`) for audit. Run once via Convex dashboard Functions tab post-deploy.

**Files modified:** `convex/consignment/mutations.ts` (createSettlement + updateSettlement + markAsPaid), `convex/consignment/helpers.ts` (new `collapseRevenuePeriod` + `consignmentRecognitionDate` helpers). New file `convex/migrations/consignmentRecognitionDate.ts`.

### Feat: Phase 72 — Bank Statement Parser & Auto-Match -- 2026-04-13

**For the team:** Admins can now import BCA bank statements (XLSX or CSV), automatically classify each transaction against a 26-rule engine, and review the results in a read-only 17-column table. A separate `/bank-rules` page lets admins seed the canonical rules, create new rules, edit priority/flags/patterns, or deactivate rules they no longer want. Reconciliation checksums are verified twice (client + server) so a tampered file is rejected before any data hits the database. Journal posting is deliberately NOT part of this phase (that is Phase 73) — the bank data is imported and classified, and proposal JE account IDs are persisted per line, but no `journalEntries` rows are written.

**Requirements delivered:** BANK-01 (import BCA statements end-to-end), BANK-02 (auto-classify via editable rule engine).

#### Plan-by-plan summary

- **Plan 01 — Foundations:** Installed `xlsx@0.20.3` from the SheetJS CDN tarball (avoids CVE-2023-30533 / CVE-2024-22363 on the frozen npm 0.18.5) plus `fastest-levenshtein@1.0.16`. Added schema tables `bankStatements`, `bankStatementLines`, `bankKeywordRules`. Extended `journalEntries.sourceType` with `"bank_statement"` (11th literal) and `NON_REVERSIBLE_TYPES`. Added `accounts.by_name` index plus three amount-first compound indexes on `externalRevenue`, `reimbursementBatches`, `payrollEntries` for Plan 03 Layer B scanning. Appended 20 new PSAK-coded accounts (1110, 1510, 3400, 4110/4210/4310/4320/4330/4810/4820/4910, 5110/5210/5500, 6110/6310/6410/6420/6710/6810) to `DEFAULT_ACCOUNTS`. Shipped a no-PII synthetic BCA fixture generator (5 exports).
- **Plan 02 — Parser & libraries:** BCA XLSX parser (`parseBcaXlsx`) + CSV fallback (`parseBcaCsv`) sharing a `_parseBcaRows` helper. EXACT-integer reconciliation checksum (abort on any non-zero diff). Indonesian date parser with year-rollover handling (`resolveYearForRollover` implements Dec→Jan carry). Fuzzy similarity wrapper (`similarityScore` — asymmetric `max(Levenshtein, containment)`). SHA-256 file hash helper (`computeSha256`). All mitigations for T-72-06/07/10 in place (MAX_ROWS=5000, bounded counterparty regex, error messages never leak PII).
- **Plan 03 — Match engine:** Two-layer matcher. Layer A keyword/counterparty classification with catch-all segregation BEFORE priority sort (T-72-14 mitigation) and direction-first predicate (T-72-16). Layer B record linkage across expenses / externalRevenue / reimbursementBatches / payrollEntries using amount-first indexes, fuzzy threshold ≥ 0.8, and ±3 day window (payroll gets ±14 day window + recipient substring match). `related_party` flag skips payroll scan entirely. 48 green tests covering all 26 rule fixtures + ordering + direction + hint + linkage.
- **Plan 04 — Convex API:** `bankKeywordRules.seedDefaults` (idempotent upsert-by-ruleCode, fail-loud ConvexError on unresolved account refs with zero partial-seed risk). Admin CRUD for rules via `protectedMutation`. `bankStatements.createFromParsedStatement` — admin-gated atomic ingest that (a) re-validates reconciliation server-side (T-72-19), (b) dedups by fileHash + by accountNumber+period (secondary error masks accountNumber to last 4 digits — T-72-21), (c) runs the match engine inline per line, (d) persists full classification + proposal JE fields. MAX_LINES=5000 cap. Does NOT post journal entries. Added `resolveSeederUserId` helper in `convex/lib/auth.ts` for system-seed reusability. 75 green tests.
- **Plan 05 — UI:** `/bank-reconciliation` admin page with upload wizard (discriminated-union state machine: upload → validating → review → importing → complete → error) and statement history. 10 MB size cap enforced BEFORE parse (T-72-25). SHA-256 computed client-side for dedup. `/bank-rules` admin CRUD page with Seed Defaults button and inactive toggle. All routes wrapped in `ProtectedRoute allowedRoles={["admin"]}` (defense in depth with server gates). No `dangerouslySetInnerHTML`, no `readAsText` anywhere — all XLSX via `file.arrayBuffer()`. Nav wired into `Header.tsx` Accounting dropdown via new `rolesAllowed` filter (no new permission key).
- **Plan 06 — Verification & docs:** Phase boundary audit clean — 9 targeted greps confirm no P73 scope leaked (no `createJournalEntryWithLines`, no split-view UI, no inline expense creation, no revenue aggregation, no learn-from-override, no line-level state mutations, no `"suggested"`/`"confirmed"` status literals in mutations). Full test suite: 1317 passing (19 unrelated pre-existing failures in `csvImportValidation`, `gobizAdapter`, `k3martCockpit`, `bigsellerOrders` — documented in Plan 02 SUMMARY). Refreshed `convex/accounts/__tests__/seed.test.ts` to match the new 74-account total. `npm run type-check` + `npm run build` both green.

#### Added
- Schema: `bankStatements`, `bankStatementLines`, `bankKeywordRules` tables.
- Indexes: `accounts.by_name`, `externalRevenue.by_amount_transactionDate`, `reimbursementBatches.by_amount_createdAt`, `payrollEntries.by_amount_period`.
- Journal source literal: `"bank_statement"` added to `journalEntries.sourceType` (non-reversible — corrections via manual JE).
- 20 new CoA accounts in `DEFAULT_ACCOUNTS` (1110, 1510, 3400, 4110, 4210, 4310, 4320, 4330, 4810, 4820, 4910, 5110, 5210, 5500, 6110, 6310, 6410, 6420, 6710, 6810).
- Convex API: `convex/bankStatements/{mutations,queries,matchEngine}.ts`, `convex/bankKeywordRules/{mutations,queries,defaultRules}.ts`.
- Frontend: `src/pages/BankReconciliationPage.tsx`, `src/pages/BankRulesManager.tsx`, `src/components/bankReconciliation/` (4 components), `src/hooks/convex/useBankReconciliation.ts`.
- Parser library: `src/lib/bankStatement/` (parseBcaXlsx, parseBcaCsv, reconciliation, fuzzyMatch, fileHash, types, _parseBcaRows).
- Shared utilities: `convex/lib/indonesianDate.ts` (INDONESIAN_MONTHS, parseIndonesianDate, resolveYearForRollover), `convex/lib/auth.ts::resolveSeederUserId`.

#### Changed
- `src/App.tsx` — two new admin-only nested routes (`/bank-reconciliation`, `/bank-rules`).
- `src/components/layout/Header.tsx` — Accounting dropdown includes both entries (gated via new `rolesAllowed` NavItem filter).
- `convex/lib/journalEngine.ts` — `JournalSourceType` union extended with `"bank_statement"`, added to `NON_REVERSIBLE_TYPES`.
- `docs/SCHEMA.md`, `docs/API_REFERENCE.md`, `CLAUDE.md` — documentation updated for new tables, endpoints, and the xlsx CDN install pitfall.

#### Post-review hardening (after triple-review + live BCA UAT)
- Moved `similarityScore` to `convex/lib/fuzzyMatch.ts` (CR-01 — was importing across the Convex bundler boundary from `src/`; silent prod failure risk).
- Direction-gated `findLinkedRecord` so debit lines only match expense/reimbursement/payroll and credit lines only match `externalRevenue` — prior code could fuzzy-match a credit line to an expense of the same amount.
- BOM strip in `parseBcaCsv` — BCA portal CSV exports are UTF-8 BOM-prefixed; previously every portal download threw "BCA metadata missing: account number".
- Server-side `Number.isInteger` + non-negative guards on `amountIdr` and header totals so a malformed client payload fails with a precise validator error instead of a confusing "reconciliation failed".
- Catch-all uniqueness: `bankKeywordRules.create` rejects a second active catch-all with overlapping direction (would otherwise silently shadow R01).
- `parseAmount` rejects negative values with a clear error (BCA mobile CSV variant has signed amounts; XLSX e-statement never does).
- Skip-guard on `accounts.queries.list` in both bank pages — matches the pattern every other hook already uses.
- Early dedup probe: new admin-only `findByFileHash` query fires during the review step so re-uploads show a destructive "Already imported on {date}" banner with Confirm disabled — no round-trip to hit the server-side dedup.
- `humanizeError()` strips the `[CONVEX M(...)] [Request ID: ...] Uncaught ConvexError: ... Called by client` wrapper before display.
- Refactored error step into an `ErrorSection` that classifies the failure (reconciliation / duplicate / validation / generic) with a plain-language title + detail. Reconciliation diff now renders as labeled rows with inline hints and prints "matches" for zero rows so the one actually off stands out.

#### Out of scope (deferred to Phase 73)
- Split-view UI (one bank line ↔ multiple expenses/revenue rows)
- Manual match / unmatch mutations and UI
- Inline "Create expense from this bank line" flow
- Revenue aggregation dashboard
- Learn-from-override (auto-generate rules from manual overrides)
- Journal entry POSTING from bank statement lines (only PROPOSAL account IDs are stored in Phase 72)

#### Production deployment runbook

1. Merge Phase 72 PR to main → Convex auto-deploys → schema tables + 3 new indexes + 20-account DEFAULT_ACCOUNTS land (compiled, not inserted).
2. Admin runs `accounts:seedDefaults` in PROD Convex dashboard Functions tab → 20 new accounts inserted via upsert-by-code (idempotent).
3. Admin runs `bankKeywordRules:seedDefaults` in PROD Convex dashboard Functions tab → 26 rules inserted. If any account ref is unresolved (e.g. step 2 was skipped), fails loudly with ConvexError listing missing refs — no partial seed.
4. Admin navigates to `/bank-reconciliation` and uploads the reference sample `Mutasi - BCA - 2511.xlsx` → verify full end-to-end: parse → reconciliation → import → review table shows expected rows with classification + auto-matches.

SCHEMA.md schema table count moves from 70 → 73 tables after this phase (`bankStatements`, `bankStatementLines`, `bankKeywordRules`).

### Fix: Kitchen Components Duplication & Reporting Gap -- 2026-04-12

**For the team:** Fixes three issues visible on the Components page and Kitchen reporting: (1) Kitchen reporting now shows every production ball type (including Hazelnut) instead of only Dubai/BIG+MID. (2) Components page duplicates (e.g. `KUNAFA` + `ING_KUNAFA`) can be cleaned up via a new admin dedupe mutation that preserves whichever row holds real pricing and renames the code back to canonical form. (3) `createIngredientComponentType` now refuses to create a second row for an ingredient that already has a matching canonical entry.

#### Added
- `convex/componentTypes/dedupe.ts` — `reportDuplicatesByName` (admin query) surfaces duplicate groups, expected canonical code presence (`HAZELNUT_REGULAR`, `FILLING_PISTACHIO`, etc.), and missing codes; `mergeDuplicatesByName` (admin mutation, `dryRun` flag) repoints all 9 FK-like references (`menuProductComponents`, `productionComponentLinks`, `productionComponentIngredients`, `ingredients.ingredientComponentTypeId`, `inventoryBatches`, `componentStock` with merge-by-location, `componentTransactions`, `orderComponentReservations`), copies meaningful field values (unitCost, gramsPerUnit, consumptionStage, etc.) from duplicates onto the survivor, and optionally renames the survivor code from `ING_X` → `X` with collision guard.
- `convex/componentTypes/helpers.ts` — shared `normalizeName` + `EXPECTED_CANONICAL_CODES` constant.
- `getKitchenTargetsForDate` now returns `otherBalls: { code, name, quantity }[]` alongside `bigBalls`/`midBalls` so any production `pcs` ball type surfaces on kitchen StatCards.

#### Changed
- `src/pages/KitchenViewV2.tsx` — `enabledComponents` default derived from active production `pcs` componentTypes instead of hardcoded `['BIG_BALL', 'MID_BALL']`. Returns `undefined` during load to avoid loading flicker.
- `src/components/kitchen/ProductionTargetsBar.tsx` — renders a StatCard per `otherBalls` entry (responsive `grid-cols-2 sm:grid-cols-3`).
- `convex/componentTypes/mutations.ts::createIngredientComponentType` — now admin/manager gated, checks for an existing production componentType with matching normalized name before creating a new `ING_*` row.

#### Post-deploy runbook (BOTH dev and prod, admin token, Convex dashboard Functions tab)
1. `componentTypes/seed:seedLeafKitchenComponents { token }` — idempotent
2. `componentTypes/dedupe:reportDuplicatesByName { token }` — preview duplicates and canonical presence
3. `componentTypes/dedupe:mergeDuplicatesByName { token, dryRun: true }` — preview plan
4. `componentTypes/dedupe:mergeDuplicatesByName { token, dryRun: false }` — apply

---

### Feature: Product Inventory Substitution -- 2026-04-12

**For the team:** Triple products (like Dubai Triple) can now automatically draw from single product inventory when direct triple stock runs out. Admins configure this from the product edit form. The fulfillment screen shows exactly where stock will come from (direct vs substitute) before you confirm, and the success toast breaks down each deduction clearly.

#### Added
- `fulfillFromProductId` and `fulfillMultiplier` fields on menuProducts schema
- `resolveSubstitutionPlan()` pure helper for direct/substitute stock splitting
- `createStockTracker()` shared helper for substitution-aware deductions (aggregates
  running quantities across items sharing direct/substitute sources)
- Validation: no self-reference, no chaining, multiplier integer >= 2, active target only,
  both-or-neither (cannot set multiplier without source)
- FK protection: deleting or deactivating a product used as a substitution source is blocked
- Substitution-aware `fulfillFromInventory` mutation with aggregate sufficiency check
  across items sharing the same source (prevents silent negative stock)
- Substitution-aware `processGofoodSales` mutation with cumulative deduction tracking
  and low-stock alerts for substitute products
- `getStockForOrder` query returns substitution availability details for UI
- ProductForm "Inventory Fulfillment" section (food products, edit mode only)
- AvailabilityPanel split sub-rows: direct stock / substitute source / overall verdict
- Enhanced fulfillment toast with per-source deduction breakdown
- Comprehensive test suite (24 tests) covering pure helper, validation, FK guards,
  integration paths, and cumulative deduction regressions

#### Files Modified
- `convex/schema.ts`, `convex/productInventory/substitution.ts` (new)
- `convex/productInventory/stockTracker.ts` (new — shared cumulative-deduction helper)
- `convex/menuProducts/mutations.ts`, `convex/productInventory/mutations.ts`, `convex/productInventory/queries.ts`
- `src/hooks/convex/useMenuProducts.ts`, `src/components/menuProducts/ProductForm.tsx`
- `src/components/inventory/InventoryAvailabilityPanel.tsx`, `src/components/inventory/FulfillFromInventoryButton.tsx`
- `tests/convex/productSubstitution.test.ts` (new)

### Quick Task 260411-ovn: Editable Paid Date for Consignment Settlements -- 2026-04-11

**For the team:** When marking a consignment settlement as "Paid", you can now pick the actual payment date instead of it always recording today. This means if you record a payment a few days late, the paid date will still be accurate for your records.

#### Changed
- Mark as Paid dialog now shows a date picker (defaults to today, allows past dates)
- Backend validates paid date is not in the future and rejects invalid dates

### Feature: Bulk Expense Upload & Asset Reclassification -- 2026-04-11

**For the team:** You can now import dozens of expenses at once from a CSV file instead of entering them one by one. The import page shows a live preview table where you can fix mistakes inline before submitting. Managers/admins can mark batches as "already paid" to skip the approval queue. Also, assets that were accidentally capitalized can now be reclassified as expenses directly from the Asset Register's dispose dialog.

#### Added
- Bulk expense CSV import with name-based matching (category by account name, owner by user name)
- Editable preview table with inline SearchableSelect dropdowns for fixing unmatched fields
- Batch and per-row trust mode toggle (admin/manager only)
- "Reclassify to Expense" disposal option in Asset Register with auto-mapped expense account
- Shared `resolveAccount` utility in `convex/lib/accountUtils.ts`
- Duplicate detection for bulk-imported expenses (same amount + date within 7 days)

#### Changed
- `AccountRef` type now includes `_id` field for proper typed ID propagation
- `useDisposeAsset` hook suppresses generic toast — dialog shows contextual messages

### Fix: Inventory Transaction Type Filters -- 2026-04-10

**For the team:** Production entries in inventory were hard to find because GoFood sync entries dominated the list. The Recent Transactions panel now has filter pills (Production, GoFood, Orders, etc.) so you can quickly isolate the transactions you care about.

#### Changed
- Added type filter pills to inventory transaction log (Production / GoFood / Orders / Transfers / Adjustments / Counts)
- Added missing display config for Transfer and Stock Count transaction types
- Renamed "Added" label to "Production" for clarity

### Feature: Admin All-Expenses Visibility + Void from Queue -- 2026-04-09

**For the team:** Admins now see ALL company expenses (across all users) on the My Expenses page, with their own expenses highlighted at the top. Click any expense to open the timeline panel, where you can void stuck expenses directly -- no more needing the approval queue to fix accidental approvals.

#### Changed
- My Expenses page upgrades to "All Expenses" for admin users
- Admin's own expenses pinned to top with blue ring highlight (toggle on/off)
- Submitter name shown on each expense card in admin view
- Void/approve/reject actions available in the timeline panel for admin
- Non-admin users see no changes

### Improvement: Unified Production & Kitchen Components -- 2026-04-09

**For the team:** Production Targets now consistently reflect what's in the Production Components page. Tier-1 components (Dubai-Regular, Nutella-Regular, Jumbo) show as "Production Components" tracked in pieces. Leaf components (Outer-Marshmallow, Filling-Pistachio, Nutella Filling, etc.) show as "Kitchen Components" tracked in grams. Both sections now come from a single source — no more separate lists getting out of sync.

#### Changed
- Manager Settings toggles split by component tier: tier-1+ = Production Components (pieces), tier-0 = Kitchen Components (grams)
- Kitchen components now derived from `componentTypes` (unified BOM) instead of separate `kitchenComponents` table
- Added `seedLeafKitchenComponents` mutation to populate leaf components in componentTypes

#### Post-deploy
- Run `componentTypes/seed:seedLeafKitchenComponents` from Convex dashboard Functions tab (requires admin token)

### Feature: Pieces Sold Hero Card -- 2026-04-07

**For the team:** The Sales Analytics overview now shows a "Pieces Sold" card that counts individual production pieces (balls) sold in the selected date range. A triple counts as 3 pieces, a single as 1 -- matching how "Balls Sold" works for all-time, but filtered to the period you pick. Includes growth comparison vs the previous period.

#### Added
- `computePiecesSold` helper with BOM-resolved ball counting per period
- `buildBallCountMap` shared helper extracted from lifetime + period calculations
- `totalPiecesSold` field in period dashboard summary query
- "Pieces Sold" hero card with `GrowthIndicator` in Sales Analytics overview
- 4 unit tests for pieces sold calculation (linked, unlinked, mixed, empty)

### Feature: Staff Performance Report -- 2026-04-07

**For the team:** New "Staff Perf." page under Financials lets managers see each kitchen staff member's monthly production at a glance -- how many balls they made, how much component (marshmallow/pistachio) they prepared, waste, shifts worked, and days active. Pick any month, expand a row to see the full breakdown, then export to CSV for payment calculations in Excel. Two export formats: a quick summary (one row per person) and a detailed version you can pivot in a spreadsheet.

#### Added
- Staff Performance page at `/staff-performance` (Financials dropdown, manager + admin only)
- `getStaffPerformanceSummary` backend query with BOM-resolved ball counting
- Month picker defaulting to current WIB month
- Summary cards: staff count, total balls, total shifts, total waste
- Expandable per-staff table with product, component, and waste breakdowns
- Two CSV export formats: Summary (one row per staff) and Detailed (pivot-ready)
- Component waste tracking (grams wasted per component per staff)

#### Technical
- Ball counts follow Business Rule 10/13: resolved via `menuProductComponents` + `componentTypes`
- Pre-fetches `componentTypes` table once to avoid N+1 reads
- Extracted `escapeCell` as shared export from `csvExport.ts`
- Reuses `MONTH_NAMES` from `financialHelpers` and `getCurrentWibMonth` from `dateUtils`

---

## [Unreleased] - v1.9 Bugs & Quality of Life

### Fix: Component Production Section Missing from End of Shift Form -- 2026-04-01

**For the team:** The "Components Produced" section (for logging grams of Outer-Marshmallow, Filling-Pistachio, etc.) now actually appears in the End of Shift form when you toggle components ON in Manager Settings. Previously it was hidden behind a guard that blocked the entire form when there were no ball targets.

#### Fixed
- End of Shift form now shows Component Production Section independently of ball targets
- Component-only shifts (no ball targets, only gram inputs) are now possible
- Updated empty-state message to mention kitchen component settings

### Fix: Component Units in Shift History -- 2026-04-01

**For the team:** Shift history now shows component production/waste data in grams (e.g., "Outer-Marshmallow: 500g produced, 20g waste"). You can also edit component grams when correcting past shift records. Includes validation that waste can't exceed produced amount, and a confirmation dialog showing what changed before saving.

#### Fixed
- ShiftHistoryList displays component grams alongside ball production data
- ShiftEditDialog supports editing component produced grams and waste entries
- Regenerated Convex API types that were stale after Phase 69 merge (missing `kitchenComponents` module)

#### Improved
- Client-side validation: component waste cannot exceed produced amount
- Confirmation dialog shows component changes before saving
- Performance: extracted memos and O(1) lookups for component validation (was O(n²))
- Fixed React key warnings on waste rows

### Bug Fix: Income Statement Margins & EBITDA -- 2026-03-29

**For the team:** Profit margins on the Income Statement now use gross revenue (before platform commissions) as the denominator, giving you a more accurate picture of profitability. A new EBITDA line shows earnings before depreciation and amortization — useful for understanding operating cash flow.

#### Fixed
- All margin calculations (Gross Margin %, EBIT Margin %, Net Margin %) now use gross revenue as denominator instead of net revenue
- Per-channel gross margins also corrected to use channel gross revenue

#### Added
- EBITDA row and EBITDA Margin % in the Income Statement (between EBIT and Other Income/Expense)
- EBITDA included in CSV export
- Magic string account codes replaced with shared constants (DEPRECIATION_EXPENSE_CODE, AMORTIZATION_EXPENSE_CODE)

### Phase 69: Kitchen Component Reporting -- 2026-03-28

**For the team:** Kitchen staff can now log pre-cursor ingredient production in grams (e.g., Outer-Marshmallow 500g, Filling-Pistachio 200g) alongside the normal ball production. The End of Shift form has two sections: "Balls Produced" (as before, with targets) and "Components Produced" (new, gram-based, no targets). Managers can toggle which components appear in the form via Manager Settings. Today's Summary shows a component breakdown with per-person attribution so you can see who made what.

#### Added
- `convex/kitchenComponents/`: New table + CRUD for kitchen pre-cursor ingredients (mutations + queries)
- `convex/schema.ts`: `kitchenComponents` table with `by_active` and `by_code` indexes; `componentProduced` and `componentWaste` optional arrays on `kitchenShiftRecords`; `enabledKitchenComponents` on `kitchenConfig`
- `src/components/kitchen/ComponentProductionSection.tsx`: Gram-based input section with per-component waste tracking
- `convex/kitchenShiftRecords/queries.ts`: `getDailyComponentSummary` query with per-person attribution
- Component production data in ShiftReviewModal and ShiftSuccessScreen
- Component gram totals on shift record cards in KitchenViewV2
- DailySummaryWidget: component breakdown and ball production per-person sections
- Kitchen component toggles in ManagerTargetSettings

#### Changed
- `src/components/kitchen/EndOfShiftForm.tsx`: "Produced" renamed to "Balls Produced"; new "Components Produced" section
- `src/hooks/convex/useKitchenTargets.ts`: Now fetches `kitchenComponents` and `dailyComponentSummary`
- `convex/kitchenShiftRecords/mutations.ts`: `submitShiftRecord` and `updateShiftRecord` accept optional component data with waste validation

### Phase 68: COGS Bulk Price Update -- 2026-03-28

**For the team:** You can now update ingredient and material costs in bulk from a single screen instead of editing them one by one. Go to Inventory & Supply on the Hub and click "Bulk Prices". The page shows two tabs -- Ingredients and Materials -- where you can change Volume, Price, and Shipping for multiple items at once, see the new cost-per-unit previewed live, and save all changes with one button. COGS recalculates automatically.

#### Added
- `src/pages/BulkPriceUpdate.tsx`: Tabbed bulk price editor with inline editing, change highlighting, and live cost preview
- `convex/ingredients/mutations.ts`: `bulkUpdatePrices` mutation with cost recalculation and invalidation cascade
- `convex/materials/mutations.ts`: `bulkUpdatePrices` mutation with cost recalculation
- `src/hooks/convex/useBulkPriceUpdate.ts`: Frontend hooks for bulk update mutations
- Route `/bulk-price-update` with `canAccessIngredients` permission guard
- "Bulk Prices" link in Hub's Inventory & Supply section

### Phase 67: Inventory Drift & Daily Stock Update -- 2026-03-28

**For the team:** Staff can now do a daily stock count to keep inventory numbers accurate. Go to Inventory, click "Count Stock", pick a location, and enter the actual quantities on the shelf. The system automatically calculates and records the difference. This fixes the problem where stock numbers drift at locations with untracked sales (cafes, walk-ins, direct POS).

#### Added
- `src/pages/StockCount.tsx`: Daily stock count page with location selector, product grid, and bulk submit
- `convex/productInventory/mutations.ts`: `bulkStockCount` mutation with full audit logging
- `convex/productInventory/queries.ts`: `getLastStockCount` query for "last counted" timestamps
- `convex/schema.ts`: `stock_count` transaction type in productInventoryTransactions
- Route `/inventory/stock-count` with `canAccessInventory` permission guard
- "Count Stock" button on Finished Goods tab
- `useBulkStockCount` and `useLastStockCount` hooks

#### Changed
- `src/pages/StockCount.tsx`: Deduplicated `formatRelativeTime` to use shared `src/lib/formatters.ts`

### Bug Fix: Intangible Asset Conversion -- 2026-03-28

**For the team:** Converting expenses to intangible assets (brands, trademarks, patents, software licenses) now works correctly. Previously, clicking "Confirm Conversion" on a branding expense would fail with a server error, and the journal entry preview always showed "Fixed Assets" even for intangible items. Now the preview correctly shows "Intangible Assets" with the right account codes, and the conversion completes successfully.

#### Fixed
- Server error when converting expenses to intangible asset categories (missing account 1700 in database)
- Journal entry preview hardcoded "DR 1500 Fixed Assets" -- now dynamically shows correct account (1700 for intangibles)
- `resolveAccount` now returns meaningful error messages instead of generic "Server Error"
- Added intangible keyword detection (branding, trademark, patent, software) in auto-category detection
- Pre-existing type errors in journalImport test fixtures

#### Migration
- Run `accounts:seedDefaults` on production to create accounts 1700, 1710, 1720, 1730, 6160 (already done)

### Phase 64: UI Polish & Data Quality -- 2026-03-28

**For the team:** The navigation bar is now cleaner -- the Frollie Pro logo takes you home (no separate Home button), and Financial pages are split into two menus: Financials (income, expenses, payroll) and Accounting (journal, accounts, assets). On mobile, scrolling through products when creating orders no longer accidentally adds items, and you can now swipe left on a line item to delete it. Behind the scenes, BigSeller fee data is now stored consistently as positive numbers, fixing display inconsistencies in analytics.

#### Changed
- Navbar: logo links to /home, Home button removed, Financials split into Financials + Accounting dropdowns
- Mobile bottom nav: 4 tabs (Sales, Orders, Kitchen, Inventory) + accounting pages in More sheet
- Order creation: touch-scroll guard, always-visible delete button, swipe-to-delete, minus-to-zero removal
- BigSeller: all platform fees (Shopee, TikTok, common) normalized to positive at sync time
- BigSeller: Math.abs removed from mapOrderToRevenue (redundant after normalization)

#### Added
- `SwipeableLineItem` component (Framer Motion swipe-to-delete gesture)
- `bigsellerFeeSignFix` migration (48 records patched in production)

---

## [Unreleased] - v1.8 Support & Quality of Life

### Bulk Import: CapEx & Intangible Asset Support (Quick Task 260327-sin) -- 2026-03-27

**For the team:** The CSV bulk import page now supports importing asset purchases (equipment, trademarks, software) alongside regular expenses. Asset rows automatically create fixed asset records with depreciation schedules. The template also now matches the regular expense form fields -- every row requires the submitter name and payment method.

#### Changed
- CSV template extended with paymentMethod, submitterName, assetCategory, assetName columns
- Asset-type account codes (1500/1700) create fixedAssets records + acquisition journal entries
- Review step shows asset vs expense breakdown before confirming import
- Page renamed from "Historical Expense Import" to "Bulk Expense & Asset Import"

### Asset Acquisition JE + Intangible Assets (Quick Task 260327-p5x) -- 2026-03-27

**For the team:** Creating a new asset now automatically generates the matching journal entry (no more manual double-entry). You can also register intangible assets like the Frollie trademark, patents, and software licenses -- amortization is calculated automatically just like depreciation. If you already have assets without journal entries, a yellow banner on the Asset Register page lets you batch-create them in one click.

#### Added
- Acquisition journal entry created atomically when registering any asset (DR Fixed Assets/Intangibles, CR Cash or Employee Payable)
- Payment method selector (Company Paid / Employee Paid) with real-time JE preview
- 3 intangible asset categories: Trademarks/Brands (10yr), Patents (10yr), Software (4yr)
- 5 new GL accounts: 1700 Intangible Assets, 1710-1730 Accumulated Amortization, 6160 Amortization Expense
- Orphan asset backfill banner + batch JE creation for existing assets
- Category dropdown grouped into Tangible and Intangible sections

#### Changed
- `runDepreciation` routes expense to 6160 (Amortization) for intangible assets, 6150 (Depreciation) for tangible
- `disposeAsset` uses dynamic asset account (1700 for intangibles, 1500 for tangibles)

### Deprecate Feedback Overlay (Quick Task 35) — 2026-03-27

**For the team:** The feedback/bug report overlay (floating button + sidebar panel) has been removed from the app. Nobody was using it. The backend data is preserved if we ever need it again.

#### Removed
- Feedback floating button, sidebar panel, capture mode, and export functionality
- 1,718 lines of unused UI code across 10 deleted files

### Expense-to-CapEx Conversion (Quick Task 260327-iv9) -- 2026-03-27

**For the team:** If an expense was mistakenly submitted as operating expense (Repairs & Maintenance) but is actually an equipment purchase, admins can now convert it directly from the Expense Approvals page. Click "Convert to CapEx" on any pending expense to open a modal that auto-detects the asset category, shows the depreciation schedule, previews the journal entries, and lets you confirm. The system atomically voids the original expense, creates a fixed asset record, and posts the correct accounting entries -- all in one click.

#### Added
- "Convert to CapEx" button on expense approval cards (admin only)
- Conversion modal with category auto-detection from description keywords
- Real-time depreciation preview (monthly amount, useful life, salvage value)
- Journal entries preview (reversal JE + acquisition JE)
- Receipt/invoice automatically carried over to the new asset record
- `asset_acquisition` journal entry source type for audit trail
- `sourceExpenseId` field on fixed assets for traceability
- `detectAssetCategory` helper for keyword-based category suggestion
- `getNextAssetNumber` and `resolveAccount` refactored as shared exports

### Asset Register & Depreciation (Phase 60) -- 2026-03-18

**For the team:** You can now track all company assets (kitchen equipment, office furniture, vehicles, etc.) in a dedicated Asset Register page. Each asset gets a proper PSAK-compliant category with automatic depreciation calculation. Click "Catch Up to Now" to generate all missing depreciation journal entries at once with a preview before posting. You can also dispose of assets (sell, scrap, or write off) and the system automatically calculates the gain or loss. The Income Statement now shows a reminder when depreciation hasn't been posted for the current month.

#### Added
- Fixed asset register with 8 PSAK-aligned categories (Tanah, Bangunan, Kendaraan, etc.)
- Straight-line depreciation with auto-calculated monthly amounts and final-month remainder handling
- "Catch Up to Now" batch JE generation with preview summary
- Per-asset disposal workflow (sold/scrapped/written_off) with gain/loss JE
- One-click void for entire month's depreciation JEs
- Depreciation reminder on Income Statement (yellow banner + inline note when current month not posted)
- 10 new GL accounts (6150 Depreciation Expense, 1610-1670 per-category Accum. Depr., 7300/7400 disposal gain/loss)
- Asset number format: FA-{CATEGORY}-YYMM-NNN (e.g., FA-KIT-2603-001)
- Table/card view toggle on asset register page
- Photo and document attachments per asset
- Flexible key-value characteristics with CSV paste
- `canAccessAssets` permission (manager + admin)

#### Changed
- Extended journalEntries sourceType with "depreciation" and "depreciation_void"
- Added by_sourceType_date compound index to journalEntries for efficient month-based queries
- Deactivated legacy 1600 Accumulated Depreciation account (replaced by 1610-1670 per-category)
- Renamed GL 6600 from generic depreciation to clarify its role (now superseded by 6150 Depreciation Expense)
- Income Statement shows inline "(current month not posted)" next to Depreciation Expense line when applicable

### Bug Fix: BigSeller Auth Error Detection — 2026-03-18

**For the team:** BigSeller sync was failing with a confusing "API error code 401006" message instead of telling you to paste a new token. Now it correctly detects expired tokens and shows "Token expired — paste new token in Settings" so you know exactly what to do.

#### Fixed
- BigSeller changed their expired-token response from an HTML page to a JSON error (code 401006). Our sync only recognized the old HTML format, so the new JSON format was mishandled — causing silent 8-minute timeouts and zero-data syncs instead of a clear "paste new token" prompt.
- Added `isJsonAuthError()` detection at all 3 sync stages (trigger, poll, fetch) alongside existing HTML detection.

#### Tests
- 13 new tests covering auth error code detection (401006, 401001, 401003) and edge cases.

### Manual Journal Entry (Phase 62) — 2026-03-18

**For the team:** You can now record balance sheet transactions like equipment purchases, loan repayments, dividend payments, capital injections, received loans, and tax payments through 6 pre-wired templates. No more asking the accountant to create manual journal entries via CSV import.

#### Added
- `convex/manualJournal/mutations.ts`: Template-based create mutation with 6 pre-wired templates (equipment purchase, loan repayment, dividend payment, capital injection, receive loan, tax payment)
- `convex/manualJournal/queries.ts`: Period-filtered list query using `by_date` index with range bounds
- `src/hooks/convex/useManualJournal.ts`: Frontend hooks for query + mutation
- `templateType` field added to `journalEntries.metadata` schema object
- New route: `/journal` (admin + manager access)
- Hub navigation restructured: Financials + Accounting sections

### Help File Indexing Architecture (Phase 61) — 2026-03-18

**For the team:** Tutorial guides can now be checked for staleness automatically. When source code changes, two new commands (`/gsd:check-docs` and `/gsd:update-docs`) detect which tutorial sections need updating and help fix them — no more outdated help pages.

#### Added
- `.planning/docs-manifest.json`: Maps source file globs to tutorial section files with `lastReviewedCommit` tracking
- `scripts/validate-docs-manifest.cjs`: Validates manifest structure, section coverage, and file existence
- `npm run validate:docs-manifest` script
- `.agent/skills/check-docs/SKILL.md`: Detects stale tutorial sections via git history comparison
- `.agent/skills/update-docs/SKILL.md`: Proposes section-level edits or acknowledges sections as reviewed (`--ack` flag)

#### Changed
- `src/pages/guides/ExpenseGuide.tsx` refactored into 6 section files in `src/pages/guides/ExpenseGuide/` directory
- Old monolithic `ExpenseGuide.tsx` deleted
- Deep-link backward compatibility preserved via anchor divs for old section IDs

### Expense Photo Sharing, Receipt Viewer & Approval UX — 2026-03-17

**For the team:** When you have one receipt covering multiple expenses (e.g., different categories from the same store trip), you can now reuse the same photo across expenses instead of getting blocked by an error. The system will ask you to confirm it's intentional, then group those expenses together for the approver. Approvers can now actually *view* receipt photos directly in the approval queue (click "View Receipt"), and the Void vs Reject buttons now clearly explain when to use each.

#### Fixed
- Duplicate receipt photo now shows a confirmation flow with the linked expense number instead of a hard error
- FRAUD-02 check excludes voided/rejected/draft expenses, so legitimate resubmissions after a void are no longer blocked
- Shared receipt bypass now writes `flaggedForReview: true` for approver audit trail
- `checkReceiptHash` query masks other users' expense metadata (information disclosure fix)
- `updateDraft` only accepts `sharedReceiptAcknowledged: true`, preventing silent revocation
- Receipt viewer handles image/PDF gracefully with img-first + onError fallback (Convex storage URLs have no file extension)
- Editing a draft with a previously acknowledged shared receipt restores the acknowledgment

#### Added
- `src/components/expenses/ReceiptViewer.tsx`: Clickable receipt badge that opens a lightbox dialog with the receipt photo, "Open in New Tab" button, and PDF fallback
- `convex/expenses/queries.ts` `checkReceiptHash`: Early duplicate detection query that warns users at upload time, before form submission
- `src/hooks/convex/useExpenses.ts` `useCheckReceiptHash`: Frontend hook for reactive duplicate detection
- `convex/schema.ts`: `sharedReceiptAcknowledged` field on expenses table
- Shared-receipt expenses grouped together in approval queue with sky-blue border and shared receipt viewer
- `FraudFlags` component shows "Shared Receipt" badge for approver awareness
- `RECEIPT_HASH_EXCLUDED_STATUSES` shared constant in `convex/expenses/helpers.ts`

#### Changed
- Reject dialog: "Reject so the submitter can correct and resubmit. They will see the rejection reason."
- Void dialog: "Permanently cancel. Cannot be resubmitted. Journal entries reversed. Use when expense should never have existed."
- Void button now has a tooltip explaining the action
- `listPendingForApproval` and `getById` queries resolve receipt storage URLs via `ctx.storage.getUrl()`
- Page header shows "N expenses in M items" when shared-receipt grouping collapses cards

### Interactive Visual Expense Tutorials (Phase 63) — 2026-03-17

**For the team:** The Expense guide now has interactive click-through walkthroughs! Instead of reading walls of text, you can visually step through Submit, Approve, and Reimburse workflows with mock panels that highlight exactly where to click. Switch between the three workflows using tabs, navigate with arrow keys or by clicking any step. Works on mobile too.

#### Added
- `src/components/help/WalkthroughPlayer.tsx`: Generic walkthrough engine with tabbed workflows, step navigation, mock panel viewport with crossfade animation, and annotation area
- `src/components/help/walkthrough/types.ts`: WalkthroughStep, WalkthroughWorkflow, MockPanelProps type definitions
- `src/components/help/walkthrough/MockElements.tsx`: 11 mock UI primitives (MockFrame, MockInput, MockSelect, MockButton, MockTable, MockBadge, MockUploadZone, MockNavDropdown, etc.) with indigo highlight styling
- `src/components/help/walkthrough/SubmitMocks.tsx`: 4-step Submit Expense mock panels
- `src/components/help/walkthrough/ApproveMocks.tsx`: 3-step Approve Expense mock panels
- `src/components/help/walkthrough/ReimburseMocks.tsx`: 6-step Reimburse mock panels
- `src/components/help/__tests__/WalkthroughPlayer.test.tsx`: 8 unit tests for the walkthrough engine

#### Changed
- `src/pages/guides/ExpenseGuide.tsx`: Replaced 3 text-heavy sections (Submit, Approve, Reimburse) with single WalkthroughPlayer section; 2 FAQ items migrated to FULL_FAQ; old deep link anchors preserved as hidden redirect divs
- `src/lib/helpGuides.ts`: Sections reduced from 8 to 6, readTimeMinutes 15 to 10, POPULAR_QUESTIONS anchors updated to "walkthrough"
- `src/lib/__tests__/helpGuides.test.ts`: Updated assertions for new section structure

---

### Invoice Form, Print View & Order Integration (Phase 58) — 2026-03-17

**For the team:** You can now generate invoices directly from any order! On the Order Detail page, managers and admins will see an Invoice card in the right sidebar. Click "Generate Invoice" to open a WYSIWYG form that auto-fills seller info, buyer details, and order items. Edit any field, preview the invoice, then finalize to assign an official INV-YYMM-NNN number. Print it clean from the browser -- no extra software needed.

#### Added
- `src/components/invoice/InvoiceForm.tsx`: WYSIWYG invoice form with 9-section layout, field color coding (blue=auto-filled, yellow=needs-input, white=edited), and debounced 2-second auto-save
- `src/components/invoice/InvoiceSidebarCard.tsx`: 3-state sidebar card (no invoice, draft, finalized) with role/status gating
- `src/pages/InvoicePage.tsx`: Route handler for form, preview, and print view modes with orderId validation and browser tab title
- `src/components/invoice/__tests__/InvoiceForm.test.ts`: 5 debounce auto-save unit tests

#### Changed
- `src/App.tsx`: 2 new lazy-loaded routes (`/orders/:orderId/invoice`, `/orders/:orderId/invoice/:invoiceNumber`) with `canAccessInvoices` guard
- `src/pages/OrderDetail.tsx`: InvoiceSidebarCard inserted in right sidebar above OrderItems

### Expense Training Guide (Phase 56) — 2026-03-16

**For the team:** The Help Center now has its first live guide! Navigate to `/help/expenses` to find a complete walkthrough of the expense, reimbursement, and payroll systems. It covers all 8 topics -- from submitting your first expense to understanding how it shows up on the P&L -- with visual flowcharts, numbered step cards, callout tips, and a 16-question FAQ.

#### Added
- `src/pages/guides/ExpenseGuide.tsx`: Complete 8-section expense guide with 4 workflow diagrams (lifecycle, DoA, reimbursement batch, P&L journal flow), ~25 step cards, ~14 callout boxes, and 2 mini FAQs + 1 full FAQ (5 groups, 16 questions)

#### Changed
- `src/lib/helpGuides.ts`: Expenses guide status set to "live" with component wired
- `src/lib/__tests__/helpGuides.test.ts`: Updated registry tests for live status

### Invoice Backend & Business Settings (Phase 57) — 2026-03-17

**For the team:** Admins can now configure the company's seller identity (business name, logo, address, NPWP, default bank account) in a new Settings page. This is the foundation for invoice generation — the system now stores invoice data and knows who the seller is. Invoices will be available in Phase 58.

#### Added
- `convex/schema.ts`: 3 new tables (businessSettings, invoiceCounters, invoices) + customer extension (companyName, npwp, billingAddress)
- `convex/businessSettings/`: Settings singleton with logo upload support and bank account resolution
- `convex/invoices/`: Full invoice CRUD — createDraft, updateDraft, discardDraft, finalize with auto-incrementing numbers (INV-YYMM-NNN)
- `src/pages/BusinessSettings.tsx`: Admin settings page with 5 sections (brand, contact, tax, bank account, live invoice header preview)
- `src/components/settings/`: LogoUploader, BankAccountSelector, InvoiceHeaderPreview components
- `src/hooks/convex/useBusinessSettings.ts`: 3 hook exports for settings management
- `src/hooks/convex/useInvoice.ts`: 6 hook exports ready for Phase 58

#### Changed
- `src/App.tsx`: New `/settings/business` route with admin permission guard
- `src/components/layout/Header.tsx`: Settings link in Admin dropdown
- `src/lib/types.ts`: canAccessBusinessSettings + canAccessInvoices permission flags
- `convex/customers/mutations.ts`: Extended update to accept companyName, npwp, billingAddress

#### Tests
- 51 unit tests (44 invoice mutations + 7 business settings) — all green

### Expense Payment Method Overhaul (Phase 59) — 2026-03-17

**For the team:** Expenses now support 3 payment methods instead of the old system. When submitting an expense, choose "Reimburse Employee" (you paid, company pays you back), "Paid by Company" (company bank was already charged, e.g. direct debit or linked Shopee/BCA), or "Payment Request" (you need the company to pay a vendor). Each flow has its own approval path — company-paid expenses get acknowledged instead of approved, and payment requests need a "Mark as Paid" step with a bank reference number.

#### Added
- `convex/expenses/mutations.ts`: 3 new mutations — `acknowledgeExpense`, `flagExpense`, `markAsPaid`
- `src/components/expenses/ApprovalActions.tsx`: Context-aware action buttons per payment type
- `src/components/expenses/FraudFlags.tsx`: Flagged-for-review badge
- `src/components/expenses/ExpenseCard.tsx`: Payment type badges (Company Paid, Payment Request)

#### Changed
- `convex/schema.ts`: Expenses table — 3 new payment literals, 2 new statuses (recorded, paid), 7 new fields
- `convex/expenses/mutations.ts`: `submitExpense` auto-creates JE for company_paid; `approveExpense` skips JE for payment_request
- `convex/expenses/queries.ts`: Approval queue unified — submitted + recorded + approved-payment_request
- `convex/expenses/helpers.ts`: `requiresReceipt` now payment-method-aware
- `src/pages/ExpenseSubmit.tsx`: 3-option payment dropdown with descriptions, conditional transaction reference field
- `src/pages/MyExpenses.tsx`: Filter tabs expanded to 10 statuses
- `src/pages/ExpenseApproval.tsx`: Payment type badges and multi-action support

#### Tests
- 53 helper tests covering all payment method semantics; 1006 total tests passing

## [Unreleased] - v1.7 Expense & Accounting

### Quick Task 34: Fix GL Codes & Cascading Expense Dropdowns — 2026-03-16

**For the team:** The GL Category dropdown on the New Expense form was empty because accounts hadn't been seeded yet. After seeding, the flat list of 18 GL codes has been replaced with two easy-to-use cascading dropdowns — first pick the expense type (COGS, Operating Expenses, or Other), then pick the specific GL account. Much easier than memorizing GL codes!

#### Fixed
- GL Category dropdown now shows accounts after running `accounts:seedDefaults` from Convex dashboard

#### Changed
- Replaced single flat GL Category dropdown with cascading Tier 1 (Expense Type) → Tier 2 (GL Account) selects
- GL Account dropdown filters by selected expense type and resets when type changes
- Edit mode correctly pre-fills both dropdowns from the existing account
- `expenseType` field uses strict TypeScript union type for compile-time safety

### Help Center Infrastructure & Landing Page (Phase 55) — 2026-03-16

**For the team:** There's now a Help Center at `/help` accessible from the top navigation bar. It has a search bar (Ctrl+K shortcut), guide cards organized by workflow, and a Popular Questions section with quick links. All 6 guides show "Coming Soon" for now — the Expenses guide goes live in the next update.

#### Added
- `src/lib/helpGuides.ts`: Guide data registry with 6 guides, section metadata, and `searchGuides()` function
- `src/components/help/`: 7 reusable help components (RoleTag, CalloutBox, StepCard, GuideSection, FaqAccordion, WorkflowDiagram, GuideLayout)
- `src/hooks/useActiveSection.ts`: Intersection Observer hook for scroll-aware sidebar TOC
- `src/pages/HelpCenter.tsx`: Landing page with search, category grid, and Popular Questions
- `src/pages/guides/GuideRouter.tsx`: Dynamic guide routing at `/help/:guideId`

#### Changed
- `src/App.tsx`: Added `/help` and `/help/:guideId` routes (auth-only, no permission restriction)
- `src/components/layout/Header.tsx`: "Help" link added to main navigation (all authenticated users)
- `src/pages/HubPage.tsx`: "Help & Training" card with links to Help Center

#### Tests
- 13 new unit tests for `searchGuides()` (query matching, empty input, FAQ results, case insensitivity)

### Fix Sales Analytics Responsive Layout & Demote Balls Sold — 2026-03-16

**For the team:** The top-line metric cards (Gross Sales, Net Sales, etc.) on the Sales Analytics page no longer overflow or squeeze together on narrow screens. They now wrap into multiple rows automatically — just like the Channel Breakdown section already did. The "Balls Sold" metric has been moved from its own large banner card into the regular metrics grid alongside Gross Sales, Net Sales, Lifetime Revenue, and Lifetime Transactions.

#### Fixed
- Hero cards grid changed from forced 5-column layout to responsive `2 → 3 → 4` column grid (matches Channel Breakdown pattern)
- Period filter badges now wrap on narrow screens instead of overflowing
- Loading skeleton updated to match new grid layout (8 placeholders)

#### Changed
- Balls Sold, Lifetime Revenue, and Lifetime Transactions demoted from standalone `LifetimeHero` banner to regular metric cards in the HeroCards grid
- `HeroCards` component now accepts optional `lifetime` prop for all-time metrics

#### Removed
- `LifetimeHero.tsx` — standalone lifetime banner component (functionality merged into HeroCards)

### Consolidate Sync Actions into Platform Health Cards (Quick Task 33) — 2026-03-16

**For the team:** The Settings tab no longer has a separate "Sync Actions" section at the bottom. Instead, each platform card (K3 Mart, GoBiz, Internal Orders) now has its own expand button — click the chevron to see date filters and sync buttons right inside the platform's health card. This matches how BigSeller already worked. GoBiz shows "to today" since it only supports syncing from a start date to the current day.

#### Added
- `src/components/salesAnalytics/PlatformSyncPanel.tsx` — Reusable sync panel with date range inputs, sync button, and optional secondary action
- K3 Mart card expands to show date range + "Sync Now" + "Refresh Stores" buttons
- GoBiz card expands to show start date + "to today" + "Sync Now" button
- Internal Orders card expands to show "Sync Now" button (no date filter)
- Sync history log visible inside each expanded platform section

#### Removed
- Standalone "Sync Actions" section (4 buttons) from Settings tab bottom

#### Changed
- `IntegrationHealthCard` gains `hideExpandToggle` prop to prevent double-chevron when parent manages expansion

### Fix BigSeller Platform-Specific Schema Mismatches (Phase 54) — 2026-03-15

**For the team:** BigSeller order sync now handles the different data formats from Shopee, TikTok, Tokopedia, and Lazada correctly. Previously, fee breakdowns and profit calculations were wrong because each platform returns fields in different structures. Profit numbers in Sales Analytics now match what BigSeller shows. The orders table also shows a new "Gross Revenue" column (total buyer paid including shipping) and "Buyer Shipping" column.

#### Fixed (Backend)
- `convex/integrations/bigseller/helpers.ts` — Rewrote `normalizePlatformFees` with explicit platform parameter; handles Shopee (5 fields), TikTok (5 fields), Tokopedia (2 fields), Lazada (1 field) fee mappings with correct sign conventions
- `convex/integrations/bigseller/sync.ts` — Platform injected from config map (`BIGSELLER_SHOP_PLATFORM_MAP`), not from API response (which is null on platform-specific endpoints)
- `convex/bigsellerOrders/queries.ts` — Profit uses BigSeller's authoritative `order.profit` instead of recalculating (which double-subtracted fees)
- `convex/bigsellerOrders/mutations.ts` — Added `orderAmount` to upsert validator

#### Added
- `convex/schema.ts` — `orderAmount` field on `bigsellerOrders` table
- `convex/integrations/bigseller/__tests__/normalization.test.ts` — 22 HAR-confirmed unit tests for fee normalization
- `src/components/salesAnalytics/BigSellerOrdersTable.tsx` — Gross Revenue and Buyer Shipping columns
- `docs/BIGSELLER_PROFIT_API.md` — Platform-specific field availability matrix and sign conventions

#### Tests
- 981 tests passing, zero regressions

### Financials Navigation Dropdown (Quick Task 32) — 2026-03-15

**For the team:** The top navigation bar now has a single "Financials" dropdown that groups all money-related pages together: Income Statement, Expenses, Expense Analytics, Reimburse, Bank Accounts, and Payroll. The Home page also has a new Financials card for quick access. Previously these were scattered across different menus.

#### Changed
- `src/components/layout/Header.tsx` — Created Financials dropdown (desktop + mobile), removed items from main nav and Admin dropdown
- `src/components/layout/MobileBottomNav.tsx` — Added all 6 financial items to the More sheet
- `src/pages/HubPage.tsx` — Added Financials area card with links to all 6 pages

### GoFood Promo Discount Fix (Phase 53.1) — 2026-03-15

**For the team:** GoFood orders with promo/campaign discounts (e.g., "Diskon 50%") were showing inflated net revenue in Sales Analytics — sometimes 29-66% higher than the real amount we received. This is now fixed. The channel breakdown cards also show a new "Promo Discount" line so you can see exactly how much GoFood subsidized on each channel.

#### Fixed (Backend)
- `convex/externalData/helpers/dashboardHelpers.ts` — Net revenue aggregation now uses the stored `revenueNet` from the platform API instead of recalculating it (which double-counted promo discounts)
- `convex/integrations/gobiz/helpers.ts` — GoBiz journal sync now extracts `voucher_amount` as `promoDiscount` from the API response
- `convex/integrations/gobiz/adapter.ts` — Wires extracted `promoDiscount` through to `promoBurn` field on revenue records

#### Added (Frontend)
- `src/components/salesAnalytics/ChannelSummary.tsx` — Promo discount line (orange, negative amount) shown between Gross and Net for channels with promo data
- `src/components/salesAnalytics/overviewUtils.ts` — `PeriodData.channels` type extended with required `commission` and `promoBurn` fields
- `src/hooks/convex/useExternalData.ts` — `ChannelBreakdown` type aligned with backend shape

#### Tests
- 8 unit tests for `aggregatePeriodRevenue` including `revenueNet: 0` edge case (prevents `??` → `||` regression)
- 3 unit tests for GoBiz promo discount extraction from journal metrics

### Expense E2E Testing Suite (Phase 53) — 2026-03-15

**For the team:** We now have automated end-to-end tests that verify the entire expense system works correctly — from submitting an expense, through approval and reimbursement, to showing up on the P&L. These tests also check that each user role (kitchen, order staff, manager, admin) can only access the pages they're supposed to. If anything breaks in the future, these tests will catch it automatically.

#### Added
- `tests/e2e/expense-access.spec.ts` — 36 permission guard tests across 9 expense routes × 4 roles (kitchen, order_staff, manager, admin)
- `tests/e2e/expense-lifecycle.spec.ts` — Full expense lifecycle test: create → submit → approve → reimburse → verify P&L journal entry
- `tests/e2e/expense-csv-import.spec.ts` — CSV import validation (rejects invalid rows, accepts valid ones) with P&L verification
- `tests/e2e/expense-approval.spec.ts` — 5 approval edge case tests (DoA thresholds, reject/void with reason, batch approval)
- `tests/e2e/expense-analytics.spec.ts` — 4 analytics dashboard assertion tests (charts render, filters work, fraud flags display)
- `tests/e2e/fixtures/test-expenses.csv` — CSV fixture data for import testing
- `tests/e2e/helpers.ts` — `loginAsRole()`, `logout()`, `fillExpenseForm()` E2E helper functions
- `tests/e2e/global-setup.ts` — Extended with multi-role E2E test user creation (E2E-Kitchen, E2E-OrderStaff, E2E-Manager, E2E-Admin)

#### Bug Fixes (found during testing)
- Fixed receipt validation blocking expense submission for amounts under 50K IDR threshold
- Fixed "Select all" checkbox batching stale test data from previous E2E runs
- Fixed Radix Select overlay blocking Cancel button in ConfirmBatchDialog
- Documented: bank account `isActive` migration needed for dev environment (BUG-04 in `53-BUG-REPORT.md`)

### Expense System Simplification (Phase 52) — 2026-03-15

**For the team:** No visible changes — the expense system works exactly the same. Under the hood, we cleaned up code that was written quickly across phases 41-50: removed duplicate functions, made database queries run in parallel instead of one-at-a-time, and extracted reusable UI components. This makes the expense code faster and easier to maintain going forward.

#### Changed (Backend)
- `convex/expenses/analyticsQueries.ts` — fraud flag queries consolidated from 10 sequential reads to 4 parallel reads (single `Promise.all`), with `toExpenseForFraud` helper and in-memory date slicing
- `convex/lib/validation.ts` — `validateRequiredReason` now accepts optional `label` parameter for contextual error messages
- `convex/expenses/helpers.ts` — unified `EXPENSE_HIGH_VALUE_THRESHOLD` (500K IDR) as single source with `DOA_ADMIN_ONLY_THRESHOLD` and `COMMENT_REQUIRED_THRESHOLD` aliases
- `convex/expenses/mutations.ts` — `rejectExpense` and `voidExpense` use shared `validateRequiredReason`
- `convex/payroll/mutations.ts`, `convex/payroll/queries.ts` — sequential `for...of + await` loops replaced with `Promise.all`
- `convex/reimbursements/mutations.ts`, `convex/reimbursements/queries.ts` — sequential DB reads parallelized
- `convex/bankAccounts/mutations.ts` — sequential account lookups parallelized

#### Changed (Frontend)
- `src/components/shared/VoidReasonDialog.tsx` — new shared component extracted from PayrollManager and ReimbursementManager (~65 lines removed from each)
- `src/components/expenses/ApprovalActions.tsx` — 3 duplicate dialog blocks consolidated into single `ActionDialog` sub-component
- `src/components/expenses/ExpenseCard.tsx` — `className` prop with `cn()` merging
- `src/pages/ReimbursementManager.tsx` — eliminated `any` types with proper Convex `Doc<>` typing
- `src/lib/dateUtils.ts` — canonical `wibMidnightToUtc` and `getCurrentWibMonth` exports (3 local copies removed)
- `src/lib/csvExport.ts` — `fmtDelta` renamed to `formatPrecomputedDelta` for clarity
- `src/pages/FinancialStatement.tsx` — extracted `MarginRow` component, deleted local WIB helpers
- `src/pages/ExpenseAnalytics.tsx` — 4 redundant `getCurrentWibMonth()` calls deduplicated via `useMemo`
- `src/pages/ExpenseApproval.tsx` — `accountMap` wrapped in `useMemo`
- `src/hooks/convex/useFinancials.ts` — WIB month init deduplicated (single computation for 4 useState calls)

#### Added
- `convex/lib/__tests__/validation.test.ts` — 11 tests for `validateRequiredReason` custom label parameter

### Historical Expense Journal Import (Phase 51) — 2026-03-15

**For the team:** You can now bulk-import historical expenses that were reimbursed before the system existed. Upload a CSV file with dates, amounts, descriptions, vendor names, and GL account codes, and the system creates proper double-entry journal entries for each row. This backfills the P&L so financial statements reflect the full picture, not just post-launch expenses.

#### Added
- `convex/schema.ts` — `metadata` optional field on `journalEntries` table (receiptUrl support)
- `convex/lib/journalEngine.ts` — extended `CreateJournalEntryParams` to accept optional metadata
- `convex/journalImport/mutations.ts` — `bulkCreateJournalEntries` mutation with batched processing (50 rows/batch)
- `src/lib/csvImportValidation.ts` — client-side CSV row validation helpers
- `src/pages/HistoricalImportPage.tsx` — import wizard at `/import` (admin only) with 5-step flow
- `src/hooks/convex/useJournalImport.ts` — hook for batched mutation calls
- CSV template download with proper headers (date, amount, description, vendorName, accountCode, receiptUrl)
- Chart of Accounts reference CSV download for looking up valid account codes
- Client-side validation with row-level error reporting and warning detection
- Progress indicator for batched import (handles 350+ rows)
- Navigation link from Accounts Manager page to import wizard

#### Dependencies
- `papaparse` — runtime dependency for CSV parsing

### Expense Analytics Dashboard (Phase 50) — 2026-03-14

**For the team:** Managers and admins now have a dedicated Expense Analytics dashboard showing a bird's-eye view of operating expenses. See total OpEx broken down by GL category (pie chart), which employees are spending the most, a 6-month spending trend, pending reimbursement totals, and average approval turnaround time. The dashboard also surfaces fraud warning flags: potential expense splitting, approver concentration, and unfamiliar vendors.

#### Added
- `src/pages/ExpenseAnalytics.tsx` — full dashboard replacing the Phase 48 stub, with month/custom period picker
- `src/components/expenseAnalytics/` — 5 sub-components (OpExSummaryCard with PieChart, SpendByEmployeeCard, MonthlyTrendChart with LineChart, PendingMetricsCard, FraudFlagsCard)
- `src/hooks/convex/useExpenseAnalytics.ts` — 3 hook wrappers (useOpExAnalytics, useExpenseMetrics, useFraudFlags)
- `convex/expenses/analyticsQueries.ts` — 3 protectedQuery endpoints (getOpExAnalytics, getExpenseMetrics, getFraudFlags)
- `convex/expenses/fraudHelpers.ts` — 3 pure fraud detection functions (detectSplits, detectApproverConcentration, detectUnfamiliarVendors)
- `src/lib/expenseAnalyticsPeriod.ts` — pure period calculation helpers for WIB-aligned date math
- `convex/schema.ts` — new `by_status_expenseDate` compound index on expenses table
- `tests/convex/expenseAnalytics.test.ts` — 8 integration tests for analytics queries
- `convex/expenses/__tests__/fraudHelpers.test.ts` — 25 unit tests for fraud detection
- `src/lib/__tests__/expenseAnalyticsPeriod.test.ts` — 20 unit tests for period calculations

#### Fraud Detection Rules
- **FRAUD-06 (Split Detection):** Flags when same employee submits 2+ expenses to same GL account within 48 hours totaling > Rp 500K
- **FRAUD-07 (Approver Concentration):** Flags when one approver handles >80% of a single employee's expenses in 30 days
- **FRAUD-08 (Unfamiliar Vendor):** Flags vendor names not seen in the system in the last 90 days

### P&L Integration — Full Income Statement (Phase 49) — 2026-03-14

**For the team:** The Financial Statement page now shows a complete Profit & Loss — not just gross profit, but also operating expenses (OpEx), EBIT, other income/expenses, and the bottom-line net income. You can also export the full P&L to CSV for use in spreadsheets or reporting.

#### Added
- `convex/lib/journalHelpers.ts` — shared `aggregateJournalLines` helper (extracted from incomeStatement.ts)
- `src/lib/csvExport.ts` — generic CSV export utility
- `tests/convex/incomeStatement.test.ts` — 403 integration tests for income statement

#### Changed
- `convex/reports/incomeStatement.ts` — extended with OpEx breakdown by GL category, EBIT, Other Income/Expense, and Net Income sections
- `src/pages/FinancialStatement.tsx` — expanded P&L display with collapsible OpEx/Other sections + CSV download button

### Frontend Permissions & Routes (Phase 48) — 2026-03-14

**For the team:** Finance pages now use permission-based access instead of role-based. This means access can be fine-tuned per role (who can submit expenses, who can approve, who manages reimbursements, who sees analytics). Navigation menus automatically show only the pages each user has permission to access.

#### Added
- 4 permission flags: `canSubmitExpenses`, `canApproveExpenses`, `canManageReimbursements`, `canAccessExpenseAnalytics`
- `src/pages/ExpenseAnalytics.tsx` — stub page for future analytics dashboard
- Expense & Expense Analytics links in Header and mobile navigation
- `tests/unit/permissions.test.ts` — 16 permission assertions across all roles

#### Changed
- 7 finance routes (`/expenses`, `/expenses/new`, `/expenses/approve`, `/reimbursements`, `/bank-accounts`, `/payroll`, `/accounts`) migrated from `allowedRoles` to `requiredPermission` guards
- Reimbursements navigation icon changed from Receipt to HandCoins for visual clarity

### Payroll Management (Phase 47) — 2026-03-14

**For the team:** You can now record payroll entries for staff and contractors. Each entry tracks the payment period, amount, employee type, and optional file attachments. Entries can be voided with a reason if needed. The system auto-generates payroll numbers (PAY-YYYYMM-NNN) for easy reference.

#### Added
- `src/pages/PayrollManager.tsx` — full payroll management page with filters, summary cards, create/edit/void dialogs
- `src/hooks/convex/usePayroll.ts` — 5 hooks for payroll CRUD operations
- `convex/payroll/mutations.ts` — create, update, void payroll entries with auth
- `convex/payroll/queries.ts` — list (with filters), getById, summary queries
- `convex/payroll/helpers.ts` — payroll number generation
- `convex/lib/validation.ts` — shared validators extracted from expenses/reimbursements/payroll
- `tests/convex/payroll.test.ts` — 345-line integration test suite
- `convex/payroll/__tests__/helpers.test.ts` — unit tests for payroll number generation

### Reimbursement Batches (Phase 46) — 2026-03-14

**For the team:** Approved expenses paid from personal funds can now be grouped into reimbursement batches per employee. Finance confirms each batch, marks it as paid once the transfer is done, and the system tracks the full lifecycle with audit trails. Employees can also register their bank account details for faster payouts.

#### Added
- `src/pages/ReimbursementManager.tsx` — main page at `/reimbursements` showing pending expenses grouped by submitter and batch history with status cards
- `src/pages/BankAccountsManager.tsx` — employee bank account management at `/bank-accounts`
- `src/components/reimbursements/` — BatchCard (status workflow display), ConfirmBatchDialog (review before confirming), PendingExpensesGroup (group pending expenses by submitter)
- `src/hooks/convex/useReimbursements.ts` — 6 hooks (usePendingForReimbursement, useReimbursementBatches, useBatchDetail, useCreateBatch, useConfirmBatch, useMarkBatchPaid, useVoidBatch)
- `src/hooks/convex/useBankAccounts.ts` — 4 hooks for bank account CRUD
- `convex/reimbursements/mutations.ts` — createBatch, confirmBatch, markBatchPaid, voidBatch with full audit trail
- `convex/reimbursements/queries.ts` — listPendingForReimbursement (groups by submitter), listBatches, getBatchDetail
- `convex/bankAccounts/` — bank account CRUD mutations and queries
- `convex/expenses/auditTrail.ts` — extracted shared audit trail helper (used by both expenses and reimbursements)
- `convex/auth/mutations.ts` — updateBankDetails mutation for user self-service bank info
- `tests/convex/reimbursementBatch.test.ts` — 591-line integration test suite covering full batch lifecycle

#### Batch Workflow
- REIMB-01: Group approved personal-payment expenses by submitter into batches
- REIMB-02: Confirm batch (locks expenses, records total)
- REIMB-03: Mark batch as paid (records payment reference and date)
- REIMB-04: Void batch (returns expenses to pending pool)

### Expense Approval & Void (Phase 45) — 2026-03-13

**For the team:** Managers and admins can now review and approve expense claims from a dedicated approval queue. The system enforces approval limits (managers up to Rp 500K, admins unlimited), blocks self-approval, and shows fraud warnings. Rejected expenses include a reason that the submitter sees, and admins can void any non-terminal expense. Previously rejected resubmissions show the full rejection history.

#### Added
- `src/pages/ExpenseApproval.tsx` — approval queue page at `/expenses/approve` with fraud flag badges and submitter names
- `src/components/expenses/FraudFlags.tsx` — duplicate, late submission, and rejection count warning badges
- `src/components/expenses/ApprovalActions.tsx` — approve/reject/void buttons with confirmation dialogs
- `src/components/expenses/RejectionChain.tsx` — timeline display of prior rejection reasons
- `src/hooks/convex/useExpenses.ts` — 5 new hooks (usePendingForApproval, useRejectionChain, useApproveExpense, useRejectExpense, useVoidExpense)
- `convex/expenses/mutations.ts` — approveExpense, rejectExpense, voidExpense with DoA enforcement
- `convex/expenses/queries.ts` — listPendingForApproval (FIFO queue with DoA filtering), getRejectionChain (walks previousExpenseId chain)
- `convex/expenses/helpers.ts` — canApproveExpense, requiresApproverComment, getTargetStatusAfterApproval, isVoidableStatus (24 new tests, 46 total)

#### Approval Rules (Delegation of Authority)
- EXP-07/08: Manager approves up to Rp 500K, admin approves any amount
- EXP-10: Self-approval blocked for all roles
- EXP-11: Comment required for approvals >= Rp 500K
- EXP-14: Company card expenses go to "approved" (no reimbursement needed)
- EXP-15: Personal payment expenses go to "awaiting_payment"
- EXP-16/17: Void available for non-terminal expenses (admin only)
- FRAUD-04/05: Rejection count badge and rejection chain timeline

#### Triple Review Fixes
- Fixed rejection count badge never rendering (no-op ternary → actual count from useRejectionChain)
- Consolidated APPROVER_ROLES to single source in constants.ts
- Used CSS variable tokens for FraudFlags dark mode
- Fixed stale closure in approval click handler
- Added submitter name display to approval queue cards
- Fixed rejection chain off-by-one (starts from previousExpenseId)

### Expense Submission (Phase 44) — 2026-03-13

**For the team:** Any staff member can now submit expense claims through the app. Fill in the details, attach a receipt photo, save as draft, and submit for approval — all from your phone. The system automatically flags late submissions and warns about possible duplicates to prevent mistakes.

#### Added
- `src/pages/ExpenseSubmit.tsx` — expense creation form at `/expenses/new` with draft save and submit workflow
- `src/pages/MyExpenses.tsx` — personal expense list at `/expenses` with status filter tabs (All, Drafts, Pending, Approved, Rejected) and chronological audit trail timeline
- `src/components/expenses/StatusBadge.tsx` — color-coded badge for 7 expense statuses
- `src/components/expenses/ReceiptUpload.tsx` — receipt upload with client-side SHA-256 hashing (5MB limit, JPEG/PNG/WebP/PDF)
- `src/components/expenses/ExpenseCard.tsx` — expense list card with fraud warning icons
- `src/hooks/convex/useExpenses.ts` — typed query/mutation hooks with `ExpenseStatus` union type
- `convex/expenses/helpers.ts` — pure validation functions (requiresReceipt, validateExpenseAmount, isLateSubmission, checkDuplicateExpense)
- `convex/expenses/__tests__/helpers.test.ts` — 22 unit tests covering all helper functions
- `convex/expenses/mutations.ts` — createDraft, updateDraft, submitExpense, generateUploadUrl with protectedMutation
- `convex/expenses/queries.ts` — listMyExpenses, getById, getStatusHistory with owner-only access

#### Fraud Controls
- FRAUD-01: Soft duplicate warning when same amount + date within 7-day window
- FRAUD-02: Hard block on reused receipt images (SHA-256 hash match)
- FRAUD-03: Late submission flag when expense date > 14 days before submission
- EXP-03: Receipt required for expenses over Rp 50,000

#### Triple Review Fixes
- Fixed stale `duplicateWarning` never being cleared when condition resolves
- Added ownership check to `getStatusHistory` query (security fix)
- Switched to WIB timezone helpers (`utcToWibDateStr`/`wibDateStrToUtcMs`) for correct Indonesian date handling
- Filtered GL dropdown to expense-relevant account types only (opex, cogs, other)

### Chart of Accounts Management (Phase 43) — 2026-03-13

**For the team:** Admins can now view, create, and manage GL accounts directly in the app. The 39 default Indonesian accounting categories (PSAK-aligned) are seeded automatically, and custom accounts can be added with automatic type/category derivation from the account code prefix.

#### Added
- `src/pages/AccountsManager.tsx` — admin-only Chart of Accounts page at `/accounts` with table/card views, search, and bulk operations
- `convex/accounts/queries.ts` — list (with optional active-only filter) and getById queries
- `convex/accounts/mutations.ts` — create (with PSAK code validation), update, remove (with system account and dependency protection), seedDefaults (with optional auth)
- `src/hooks/convex/useAccounts.ts` — Convex hooks for accounts CRUD
- Enhanced `EntityManager` with `canDelete` prop — hides delete button and disables checkbox per-row (backward-compatible, reusable for all entity pages)
- `by_account` index on `expenses` table for efficient dependency checking

#### Triple Review Fixes (2 rounds)
- Round 1: Fixed route path (relative), code field hidden on edit, typed AccountType, expense dependency check, toast suppression
- Round 2: Fixed description clearing (use `ctx.db.replace()` instead of patch with undefined), added auth guard to seedDefaults, added `by_account` index, defense-in-depth bulk delete filtering

### Double-Entry Journal Engine (Phase 42) — 2026-03-13

**For the team:** The accounting backbone is now in place. Every expense, reimbursement, and payroll entry will flow through a single journal engine that guarantees debits always equal credits — no more manual spreadsheet balancing.

#### Added
- `convex/lib/journalEngine.ts` (347 lines) — single entry point for all journal creation with 7 exported functions and 3 type exports
- `createJournalEntryWithLines` — validates balance (debits = credits), enforces IDR integer amounts, generates JE-MMDD-NNN numbers, denormalizes entry dates to lines
- `createReversalEntry` — void workflow that swaps debits/credits, validates sourceType pairing, uses original entry date (not current date) for correct accounting period
- `validateJournalLines`, `validateVoidPairing`, `buildDebitLine`, `buildCreditLine`, `buildReversedLines` — pure exported functions for downstream use
- 27 unit tests for all validation and builder logic
- Staffreview report: `docs/reviews/staffreview-gsd-phase-42-journal-engine-2026-03-13.md`

#### Design Decisions
- No direct `ctx.db.insert` on journalEntries/journalEntryLines allowed outside journalEngine.ts
- No update/patch on journal data fields — entries are immutable, only reversals allowed
- Negative amount check fires before integer check (so -50000.5 says "non-negative", not "whole numbers")
- `Promise.all` for parallel line inserts (performance for large payroll batches)

### Accounting Schema, Seed & Counters (Phase 41) — 2026-03-13

**For the team:** The database foundation for expense tracking and accounting is ready. 10 new tables, a Chart of Accounts with 39 standard Indonesian accounting categories, and an automatic numbering system for journal entries, expenses, and reimbursements.

#### Added
- 10 new accounting tables in Convex schema (accounts, expenses, expenseStatusHistory, reimbursementBatches, reimbursementBatchItems, journalEntries, journalEntryLines, bankAccounts, payrollEntries, counters) — schema now at 75 tables
- `convex/accounts/mutations.ts` — Chart of Accounts seed function with 39 PSAK-aligned default accounts (1xxx Assets through 7xxx Other Income/Expense)
- `convex/lib/counter.ts` — atomic daily counter helper generating PREFIX-MMDD-NNN sequential numbers (e.g., JE-0313-001) using WIB timezone
- Bank account fields added to users table (bankAccountNumber, bankName) for reimbursement payouts
- 12 unit tests for counter formatting and WIB date logic, 6 seed tests

---

## [Unreleased] - v1.6 Tech Debt & Resilience

### Retroactive Verification Gap Closure (Phase 40)

**For the team:** No code changes -- this closes a documentation gap identified during the v1.6 milestone audit. All phases now have proper verification reports for traceability.

#### Added
- VERIFICATION.md for Phase 35 (Schema Review & Audit) covering SCH-01/02/03
- VERIFICATION.md for Phase 36 (Sales Analytics Backend Simplification) covering BSH-01/02/03, BFS-01/02/03
- VERIFICATION.md for Phase 37 (Order & Dispatch Simplification) covering BFS-04/05/06
- `requirements-completed` frontmatter added to Phase 37 SUMMARY files

#### Fixed
- REQUIREMENTS.md traceability: BFS-04/05/06 correctly mapped to Phase 37 (was incorrectly mapped to Phase 40)

### Sales Analytics Cleanup (Quick Task 31)

**For the team:** The Sales Analytics overview page is now faster and less cluttered -- the detailed transactions table has been removed since the chart, hero cards, and channel summary already cover all analytics needs.

#### Removed
- Sales Details (RevenueTable) card from Sales Analytics overview -- eliminates a Convex query that fetched thousands of individual revenue records
- 7 orphaned component files (RevenueTable, RevenueItemDetails, InternalOrderDetails, StoreGroupHeader, PlatformBadge, ConfidenceBadge, MatchStatusBadge) -- 742 LOC eliminated
- 4 dead type/constant exports from overviewUtils.ts (RevenueRecord, ConfidenceLevel, MatchConfidence, SOURCE_DISPLAY_NAMES)
- 3 dead hooks from useExternalData.ts (useExternalRevenue, useOrderDetailsByOrderNumber, useRevenueItems)

### E2E Test Foundation & Resilience (Phase 39)

**For the team:** GoFood sales at Tamtem and Goldfinch now automatically set up their depot inventory when first encountered — no more manual configuration needed. New automated browser tests cover the order lifecycle, kitchen production, and sales analytics pages to catch regressions early.

#### Bug Fixes
- `processGofoodSales` no longer silently skips inventory deductions when an outlet has no linked storage location — it auto-creates the depot and links it
- Low-stock alerts now only fire when stock crosses the threshold from above (not on every deduction into already-negative inventory)

#### Added
- `convex/productInventory/depotAutoSeed.ts` — shared `ensureDepotLocation` helper for auto-creating depot storage locations (Tamtem Depot, Legato Goldfinch)
- E2E test: order lifecycle (create order → status transitions through BeingPrepared)
- E2E test: kitchen production (page load, production targets, End-of-Shift 3-step flow)
- E2E test: sales analytics (period selector switching, channel breakdown, tab navigation)
- 6 unit tests for depot auto-seed logic (idempotency, unknown outlet handling, zero-stock seeding)

#### Improved
- Auto-seed uses `Promise.all` for parallel DB queries instead of serial N+1 pattern
- `componentTypes` query uses `.withIndex("by_category")` instead of full table scan

### Frontend Giant File Splits (Phase 38)

**For the team:** No visible changes -- the same pages and features work exactly as before. Four large frontend files have been split into smaller, focused components for easier maintenance and faster development.

#### Refactored
- Split `OverviewTab.tsx` into 14 sub-components (1,273 → 283 LOC, -78%)
- Split `GrabFoodManager.tsx` into 6 tab components (1,486 → 173 LOC, -88%)
- Split `FinishedGoodsTab.tsx` into 6 view/settings components (1,474 → 488 LOC, -67%)
- Split `VouchersManager.tsx` into 5 components in new `src/components/vouchers/` directory (1,285 → 506 LOC, -61%)
- Created shared `src/lib/dateUtils.ts` with 6 WIB timezone helpers
- Eliminated duplicate `formatCurrencyIDR` (replaced with shared `formatCurrency`)
- Total: 5,518 → 1,450 LOC across 4 parent files (-74%), 32 new focused component files

### Order & Dispatch Backend Simplification (Phase 37)

**For the team:** No visible changes -- backend code cleanup. Three large files in the orders and dispatch planner modules have been split into smaller, testable helper modules. Bug fixes included: completed-today filter now correctly uses completion time instead of creation time, and cancelled production records are no longer counted in kitchen stats.

#### Bug Fixes
- `getKitchenStats` and `getCompletedToday` now filter by `completedAt` instead of `_creationTime` (orders completed on a different day than created were missed)
- `aggregateKitchenStats` production-by-type loops now exclude cancelled items and cancelled production records
- `assembleDirectChannel` date range fixed from inclusive `T23:59:59` to exclusive upper bound (consistent with codebase convention)

#### Refactored
- Extracted `kitchenEnrichment.ts` (6 functions) and `kanbanBuilders.ts` (4 exports) from `orders/queries.ts` (1,279 -> 940 LOC, -26.5%)
- Extracted `customerResolution.ts` (2 functions) and `orderItemProcessing.ts` (4 functions) from `orders/mutations/orderCrud.ts` (1,085 -> 958 LOC, -11.7%)
- Extracted `types.ts` (5 interfaces), `weeklyPlanBuilder.ts` (5 functions), and `inventorySimulation.ts` (1 function) from `dispatchPlanner/queries.ts` (1,226 -> 313 LOC, -74.5%)
- Replaced `ctx: { db: any }` with proper `QueryCtx` typing in all dispatch planner helpers
- Removed dead `enrichBomComponents` function (68 LOC unused code)
- Zero Convex API path changes -- all query/mutation registrations unchanged
- Total: 3,590 -> 2,211 LOC across 3 target files (-38.4%)

### Sales & Analytics Backend Simplification (Phase 36)

**For the team:** No visible changes -- this is a backend code cleanup. Large query files have been split into smaller, testable helper modules. Makes future bug fixes and feature additions faster and less risky.

#### Bug Fix
- `autoMatchMenuProduct` now checks `externalProductMappings` before falling back to name matching (prevents stale mappings)

#### Refactored
- Extracted confidence types to `convex/lib/confidence.ts` (shared by income statement + dashboard)
- Consolidated WIB timezone helpers into `convex/lib/periodRange.ts` (5 functions)
- Moved `sourceToPlatform()` to `convex/lib/externalSource.ts` (single source of truth)
- Extracted dashboard, time-series, lifetime, sell-through, and restock helpers from `externalData/queries.ts` into `helpers/` directory (1,832 -> 1,387 LOC, -24.3%)
- Extracted stock and dispatch helpers from `k3martCockpit/queries.ts` into `queryHelpers/` directory (985 -> 760 LOC, -22.8%)
- Updated `incomeStatement.ts` to import from shared lib modules (no local duplicates)
- Zero Convex API path changes -- all query/mutation registrations unchanged

### Schema Audit & Quick-Wins (Phase 35)

**For the team:** Database has been cleaned up -- removed 20 unused indexes and added 5 smarter ones. Queries are faster, and the cleanup fixed a session cleanup function that was scanning all sessions instead of using its index.

- **Schema audit report** produced at `docs/SCHEMA_AUDIT.md` -- 42 findings across 65 tables (1 critical, 20 moderate, 21 low)
- **21 unused indexes removed** from schema.ts -- eliminates unnecessary write overhead on every insert/update
- **5 compound indexes added** for `externalOutlets`, `storageLocations`, `productionLog`, `orderComponentReservations`, `externalStockSnapshots` -- eliminates post-scan filters on 30+ query sites
- **Critical fix (MIS-01):** `cleanupExpiredSessions` now uses `by_expiry` index instead of full table scan
- **Range bound anti-pattern fixes (IRB-01, IRB-02):** 10 query sites updated to chain both period bounds at the index level instead of using post-scan `.filter()`
- **Query pattern improvements (MIS-02, MIS-03, IRB-04-06):** 18 query call sites updated to use new compound indexes
- **Unused field removed:** `dispatchChannelConfig.commissionRate` (explicitly marked unused in code comment)
- **Annotation updated:** `productionCounts` table header now says "ARCHIVED: Read-only since Phase 21"
- **Net index change:** 166 → 150 indexes (21 removed, 5 added)

### Monthly View & Custom Date Filter (Quick-30)

**For the team:** Income Statement now supports **monthly view** and **custom date range** -- not just weekly. Switch modes using the new dropdown. Monthly view lets you navigate month-by-month. Custom range lets you pick any two dates.

- Period mode selector (Weekly / Monthly / Custom Range) on Income Statement page
- Monthly view with month-by-month navigation and full calendar month boundaries (WIB)
- Custom date range picker with two native date inputs and equal-length prior period comparison
- New generalized `getIncomeStatement` query accepting arbitrary `periodStart`/`periodEnd`
- Shared `fetchAndAggregate` helper eliminates ~80 lines of duplication in backend
- CSV export works for all modes with appropriate period label

---

## [Unreleased] - v1.5 Financial Statements

### Added
- **Income Statement Backend (Phase 32)**: Weekly income statement query (`reports.incomeStatement.getWeeklyIncomeStatement`) that computes Revenue -> COGS -> Gross Profit with per-channel breakdown
  - Revenue aggregation from `externalRevenue` (6 channels) + `consignmentSettlements`
  - Revenue deductions: customer discounts, platform commissions, GoFood ad/promo burn, consignment rev share
  - Full BOM COGS resolution (production + packaging) via `buildProductCOGSMap` helper
  - Confidence classification on every figure (exact/calculated/inferred/missing)
  - Data quality gap analysis: unmapped products, zero-cost components, missing channels
  - Previous week comparison with delta amounts and percentages
  - New helper: `buildProductCOGSMap` in `convex/lib/costCalculator.ts`
  - New helper: `calculateWeekRange` in `convex/lib/periodRange.ts`
  - Exported `fetchInternalOrderDataMap` from `convex/externalData/queries.ts`
  - Backend tests for BOM COGS accuracy and income statement query edge cases (18 new tests, 680 total)
- **Income Statement Frontend (Phase 33)**: Standalone `/financials` page for weekly P&L visualization
  - P&L table with Revenue -> Deductions -> COGS -> Gross Profit structure
  - Per-channel breakdown with colored dots from platform color system
  - Week navigation (prev/next) with WIB timezone Monday-start boundaries
  - Previous week comparison with delta amounts and percentages
  - Confidence indicators: calc icon (calculated), ~ (inferred), -- with warning (missing)
  - Data quality panel: unmapped products, zero-cost components, missing channels, shipping fee gap warning
  - Coverage stat showing BOM-linked product mapping percentage
  - CSV export with flat-format output (period, section, channel, line item, amount, confidence, comparison)
  - Mobile responsive: comparison columns hidden by default with toggle
  - Route: `/financials` with `canAccessDashboard` permission (Manager, Admin)
- **Income Statement Testing (Phase 34)**: Multi-channel revenue aggregation integration test
  - Multi-channel test combining gobiz + consignment + internal in a single test case with known-value assertions
  - Sentinel value (99999) on consignment externalRevenue.revenueGross proves no double-counting from settlement path
  - All 4 Phase 34 success criteria verified and mapped to 22 specific tests (12 integration + 10 unit)
  - Tests: 684 passing, 0 failures

---

## 2026-03-02 - Hotfix: Force Complete shows "Server Error" instead of real message

Force Complete (and other order status mutations) showed an opaque "Server Error" instead of the actual error message. Now you'll see clear messages like "Order is already Complete" or "Order not found" when something goes wrong.

- **Root cause:** `statusUpdates.ts` used `throw new Error(...)` (hidden from client) instead of `throw new ConvexError(...)` (user-facing)
- **Fix:** Replaced 9 occurrences of `Error` with `ConvexError` across all order status mutations: `updateStatus`, `updatePayment`, `updateShipping`, `updateDetails`, `moveForward`, `moveBackward`, `expediteOrder`, `forceComplete`
- **Files:** `convex/orders/mutations/statusUpdates.ts`

---

## 2026-03-01 - Fix: Sales Analytics counts balls, not product units

Previously, the "units sold" metric counted each product as 1 regardless of how many balls it contained. Now it correctly counts actual Big Ball and Mid Ball components — a hamper with 3 balls shows as 3 balls sold, not 1 unit.

- **Backend:** `getLifetimeTotalsInternal` now resolves BOM via `menuProductComponents` + `componentTypes` to count production balls per product
- **Estimation:** Unmapped historical products use `estimateBallsFromName()` — infers from name patterns (Triple=3, Double=2, 6 Pack=6, default=1)
- **UI:** Label changed from "units sold" to "balls sold"
- **Tests:** 25 new tests covering BOM resolution, name estimation, aggregation, and edge cases (671 total passing)
- **Docs:** Added pitfall #13 and business rule #13 to CLAUDE.md to prevent this class of mistake

---

## [v1.4] - 2026-03-01 - Milestone v1.4: Sales & Channel Integration

All sales channels now flow into one unified view. GrabFood, BigSeller (Shopee + Tokopedia), and Consignment outlets are integrated with one-click platform auth and manual-trigger syncs. The Sales Analytics page shows all 8 channels in a single interactive chart.

### Highlights
- **Multi-platform auth:** One-click GoBiz refresh, BigSeller paste-once JWT, GrabFood auto-resolve
- **GrabFood POS:** Order sync, store pause/unpause, menu toggle, 6 webhook endpoints, menu simulator
- **BigSeller:** Scheduler-chain sync for Shopee + Tokopedia orders with SKU mapping
- **Consignment:** Outlet management with rev share %, settlement tracking, payment status
- **Unified Analytics:** 8-channel stacked bar chart, lifetime units sold, multi-select filter
- **Quality:** Test suite repaired (56→0 failures), ExternalSource type guard, tech debt cleanup

### Phases
- Phase 26: Platform Auth & Schema Foundation (5 plans)
- Phase 27: GrabFood POS Integration (3 plans)
- Phase 27.1: GrabFood Webhooks & Partner Config (2 plans, inserted)
- Phase 27.2: GrabFood Menu Simulator (2 plans, inserted)
- Phase 28: BigSeller Integration (2 plans)
- Phase 29: Consignment Settlements (2 plans)
- Phase 29.1: Test Suite Repair (1 plan, inserted)
- Phase 30: Unified Sales Analytics (2 plans)
- Phase 31: Tech Debt Cleanup (1 plan, gap closure)

### Stats
- 9 phases, 20 plans, 211 commits, 242 files changed, +43,799/-4,990 lines
- Requirements: 22/22 satisfied
- Timeline: 2026-02-25 to 2026-03-01 (5 days)

---

## [v1.4.6-test] - 2026-02-28 - Test Suite Repair (Phase 29.1)

All automated tests now pass again after accumulating failures across Phases 22-29. No production code was changed.

### Fixed
- Removed 3 orphaned test files (recipes, tags, products) testing modules deleted in Phase 22
- Excluded E2E specs from Vitest runner (Playwright-only)
- Removed stale cron assertion blocks (crons emptied in Phase 25)
- Updated K3Mart cockpit tests for internalQuery migration and changed error messages
- Fixed getWeeklyDispatchPlans assertions for Record return type (was array)
- Updated voucher tests: 100% discount is now a valid business case

### Metrics
- **Before:** 15 failed files, 56 failed tests, 636 passed
- **After:** 0 failed files, 0 failed tests, 633 passed (dead tests removed, remaining fixed)

---

## [v1.4.5] - 2026-02-28 - GrabFood POS Integration Complete (Phase 27)

GrabFood is now fully integrated. Admins can sync order history, managers can pause/unpause stores and control menu item availability — all from a single GrabFood Manager page.

### Completed
- Phase 27 GrabFood POS Integration (3/3 plans, 5/5 success criteria verified)
- GrabFood Manager page at `/grabfood` with 5 tabs: Orders, Store Status, Menu, Settings, Webhooks
- Order sync with auto-resume from last sync timestamp and custom date range
- Store status display with OPEN/PAUSED/CLOSED badges and pause controls (30/60/120 min)
- Menu availability toggles with batch "Publish Changes" button
- Webhook endpoints for order push and menu sync with HMAC-SHA256 validation
- `useGrabFood.ts` hook with barrel exports for all GrabFood queries and actions

### Known Limitations
- Orders endpoint returns 401 until GrabFood grants `orders:read` OAuth2 scope (code handles gracefully)
- Order webhook is log-only by design (writes deferred until order schema validated against real data)

### Files Modified
- `src/hooks/convex/index.ts` (barrel exports for GrabFood hooks)
- `.planning/` (phase completion docs)

---

## [v1.4.4] - 2026-02-28 - BigSeller Platform-Specific Fee Fix

Synced BigSeller orders now show real commission, shipping, and other fees instead of Rp 0. Previously all fees showed as zero because the sync used BigSeller's common endpoint which doesn't return platform-specific fee breakdowns.

### Fixed
- BigSeller sync now calls platform-specific endpoints (`shopee/pageList.json`, `tiktok/pageList.json`) instead of the common `pageList.json` which returns 0 for all fee fields
- Added `normalizePlatformFees()` to aggregate Shopee-specific fields (`sellerTransactionFee`, `orderAmsCommissionFee`, `campaignFee`, etc.) and TikTok-specific fields (`platformCommissionAmount`, `transactionFeeAmount`, `referralFeeAmount`, etc.) into standard `commissionFee`/`sellerShippingFee`/`otherFee`
- Added shop-to-platform mapping (`BIGSELLER_SHOP_PLATFORM_MAP`) so each shop uses its correct platform endpoint

### Files Modified
- `convex/integrations/bigseller/config.ts` (shop-platform map, platform endpoints)
- `convex/integrations/bigseller/helpers.ts` (fee normalization, platform-specific field interfaces)
- `convex/integrations/bigseller/sync.ts` (per-platform fetch loop)
- `docs/BIGSELLER_PROFIT_API.md` (fee mapping documentation)
- `docs/API_REFERENCE.md` (sync action documentation)

### Migration
- Re-sync BigSeller to update existing orders with real fee data (upsert patches in place)

---

## [v1.4.3] - 2026-02-28 - GrabFood Menu Simulator (Phase 27.2)

Admin can now preview and manage the GrabFood menu from a dedicated simulator page that mirrors how items appear on the GrabFood app. Edit names, prices, and photos inline, toggle availability, and push changes to GrabFood with a single click.

### Added
- GrabFood Menu Simulator page at `/grabfood-menu` with GrabFood-app-like card grid
- Inline editing for item name, price, and description (click to edit, blur to save)
- Per-item availability toggle with visual gray-out overlay for unavailable items
- Photo upload per menu item (5MB limit, Convex file storage, writes back to internal menuProducts)
- "Add Item" dialog to select from internal menu products with search and auto-fill
- "Populate from Mappings" button to seed the simulator from existing GrabFood product mappings
- "Push to GrabFood" with confirmation dialog showing price changes, availability changes, and new items
- Persistent diff tracking via `lastPushedPrice`/`lastPushedAvailability`/`lastPushedAt` fields (survives page reloads)
- Sync status badge showing latest menu sync result with relative time
- `pushMenuChanges` action replacing `batchUpdateAvailability` — batch price + availability updates with menu notification
- Updated GET /menu webhook to serve from `grabfoodMenuItems` with fallback to legacy `externalProductMappings`

### Schema Changes
- `grabfoodMenuItems` table added with 3 indexes (`by_menu_product`, `by_sequence`, `by_grabfood_item_id`)
- `photoStorageId` field added to `menuProducts` table

### Files Modified
- `convex/schema.ts`, `convex/grabfoodMenu/` (queries.ts, mutations.ts)
- `convex/integrations/grabfood/adapter.ts`, `convex/integrations/grabfood/webhooks.ts`
- `src/pages/GrabFoodMenuSimulator.tsx`, `src/components/grabfoodMenu/` (6 components)
- `src/hooks/convex/useGrabFoodMenu.ts`, `src/App.tsx`, `src/index.css`

---

## [v1.4.2] - 2026-02-27 - BigSeller Integration (Phase 28)

Admin can manually trigger BigSeller sync to pull Shopee/TikTok order data with SKU breakdowns and revenue bridge. Synced orders are browsable in a filterable table with transparent fee breakdown. Unmapped SKUs can be mapped to menu products via inline dropdown.

### Added
- BigSeller scheduler-chain sync: manual trigger -> poll every 60s (8 retries, auto-retry once) -> fetch paginated orders -> store with dedup
- Per-order data stored in `bigsellerOrders` table with full fee breakdown (commission, shipping, other fees, raw negative values)
- Revenue bridged to `externalRevenue` with actual platform source (shopee/tiktok), NOT "bigseller"
- `bigsellerSyncState` table tracks sync lifecycle with reactive stage field (idle/triggering/polling/fetching/storing/complete/failed/retrying)
- Sync progress shown step-by-step in BigSeller Settings row expansion (checkmarks per stage)
- Browsable orders table with platform badge, SKU list, and transparent fee breakdown
- SKU mapping via inline dropdown in Product Mapping tab -- Shopee and TikTok sub-tabs added
- Retroactive mapping applies to all historical orders when a SKU is mapped
- JWT expiry warning inline in Settings; sync button disabled when token expired
- COGS caveat banner when BigSeller costFee data is zero ("Profit = Revenue")

### Schema Changes
- `externalSource` union extended with `"shopee"` and `"tiktok"` literals
- `bigsellerSyncState` table added (singleton, stage-tracked)
- `bigsellerOrders` table added with full fee and SKU breakdown

### Files Modified
- `convex/schema.ts`, `convex/integrations/bigseller/` (sync.ts, helpers.ts, helpers.test.ts, queries.ts, config.ts)
- `convex/bigsellerOrders/` (mutations.ts, mutations.test.ts, queries.ts)
- `src/components/salesAnalytics/` (BigSellerSyncPanel.tsx, BigSellerOrdersTable.tsx, SettingsTab.tsx, ProductMappingTab.tsx)
- `src/hooks/convex/useBigSeller.ts`

---

## [v1.4.1] - 2026-02-27 - GrabFood Webhooks & Partner Configuration (Phase 27.1)

GrabFood can now send order notifications and menu requests directly to Frollie. Admin can configure webhook authentication and control which products appear on GrabFood with custom pricing — all from the GrabFood page.

### Added
- 6 GrabFood webhook endpoints: menu (GET), order, order state, menu sync, integration status, menu push
- HMAC signature validation sourced from database (not environment variables)
- Shared `handleWebhookCommon` helper — consistent logging and error handling across all POST webhooks
- Shared `syncType` validator exported from schema — prevents drift between schema, mutations, and TypeScript types
- "Webhooks" tab in GrabFood page with HMAC secret management and 6 copyable webhook URLs
- Per-product GrabFood price override and availability toggle in Settings tab
- Sync error banner in Webhooks tab — shows recent menu sync errors (last 24h)
- `getHmacSecret` internal query and `saveHmacSecret` admin mutation in platformCredentials
- `updateProductMappingFields` mutation for per-mapping price and availability
- `getLatestWebhookError` query for sync error monitoring
- 5 unit tests for HMAC validation (valid sig, invalid sig, missing secret, missing header, empty body)
- `hmacSecret` field on `platformCredentials` table
- `grabfoodPrice` and `isAvailable` fields on `externalProductMappings` table

### Changed
- `externalSyncLogs.syncType` now includes `"webhook"` (via shared validator)
- `SyncLogEntry` type updated with `"webhook"` sync type
- GET /menu endpoint builds GrabFood Section-based menu JSON from `externalProductMappings`
- Order webhook is observe-only (logs to syncLogs, no writes to grabfoodOrders)
- Clipboard copy wrapped in try/catch for non-HTTPS fallback

---

## [v1.4.0] - 2026-02-25 - Platform Auth & Schema Foundation (Phase 26)

Admin can now manage all 6 platform integrations from one Settings panel — refresh GoBiz tokens with one click, paste and preview BigSeller JWT expiry, and see sync history logs for every token refresh and data sync at a glance.

### Added
- Platform registry extended to 6 platforms: K3Mart, GoBiz, Internal, GrabFood, BigSeller, Consignment
- Registry-driven credential health dashboard in Sales Analytics Settings tab
- GoBiz one-click token refresh using 2-step GoID auth (request + password grant)
- BigSeller paste-token flow with JWT expiry preview — "X days remaining" before confirming
- Expandable sync history on platform cards — click to see last 5 sync/refresh entries
- Token refresh sync log entries — blue "Token" badge distinguishes refreshes from gray "Sync" data syncs
- Sync log entries created for all token refreshes: K3Mart, GoBiz (success + error paths), BigSeller (on paste), GrabFood (on OAuth refresh)
- 4 new schema tables: `grabfoodOrders`, `bigsellerOrders`, `consignmentOutlets`, `consignmentSettlements`
- Shared `externalSource` union (6 literals) across all 5 external tables
- Shared `decodeJwtPayload` utility in `convex/lib/jwt.ts`
- Shared `formatCountdown` utility in `src/lib/formatters.ts`
- `getHealthStatusAll` query — single call returns health + sync history for all 6 platforms
- `syncType: "token_refresh"` added to `externalSyncLogs` schema

### Changed
- `saveDirectToken` converted to `internalMutation` with optional `tokenExpiresAt` parameter
- `IntegrationHealthCard` refactored to registry-driven rendering (single `PlatformHealthStatus` prop)
- `SettingsTab` renders all 6 platforms via `getHealthStatusAll` query loop
- All 5 external tables now use shared exported `externalSource` validator from `schema.ts`
- `GoBizTokenDialog` now has one-click refresh as primary button; manual paste as collapsible fallback
- GoBiz auth flow corrected: 2-step GoID login (request endpoint + token endpoint with flat credential body)
- GoBiz error messages now surface actual API response (not generic errors)
- BigSeller UID extraction handles numeric JWT claims and filters generic role strings
- `createSyncLog` mutation `sourceValidator` widened to shared `externalSource` (was missing bigseller/grabfood/consignment)

---

## [v1.3.15] - 2026-02-24 - Restore: Sales Analytics and K3Mart Cockpit Navigation

Sales Analytics and K3Mart Cockpit navigation links are back. These were temporarily hidden on February 22nd to conserve Convex bandwidth before the monthly quota reset — that period is now over.

### Restored
- **Sales Analytics** now appears in the desktop header after "Home" and as the 5th tab in mobile bottom nav
- **K3Mart Cockpit** now appears in the desktop Depots dropdown and in the mobile More sheet as the first item

### Files Modified
- `src/components/layout/Header.tsx` — TrendingUp + Store icons restored; Sales entry in mainNavItems; K3Mart entry in depotItems
- `src/components/layout/MobileBottomNav.tsx` — TrendingUp + Store icons restored; Sales entry in primaryTabs; K3Mart entry in moreItems

---

## [v1.3.14] - 2026-02-23 - Fix: WhatsApp Messages Now Show Correct Payment Status

WhatsApp messages were always showing "Payment: Unpaid" even for paid orders. This is now fixed — confirmed, in-production, shipped, and completed orders will correctly show "Payment: Paid".

### Fixed
- **Payment status always showing Unpaid**: `paymentStatus` on orders is a manual field only updated by the admin `forceComplete` path. Normal payment flow (`AwaitingPayment` → `PaymentReceived`) never flipped it. A `deriveEffectivePaymentStatus()` helper now infers `"Paid"` from `order.status` when the stored value is stale.
- **All 17 template variables audited** — only `{payment_info}` had a bug; all others confirmed correct.

### Files Modified
- `convex/orders/whatsapp.ts` — added `deriveEffectivePaymentStatus()` helper; both `buildTemplateVariables()` and `generateReceipt()` now use it

---

## [v1.3.13] - 2026-02-23 - Fix: WhatsApp Buttons Now Available for All Message Types

You can now send all 6 WhatsApp message types directly from the order slide-out panel — not just Payment Requests. Production Started, Shipping Confirmation, Pickup Ready, Delivery Complete, and Receipt messages each have their own button, shown automatically when the order reaches the right status.

### Fixed
- **Missing WhatsApp buttons**: `OrderSlideOver.tsx` only ever had a hardcoded single button for `payment_request`. The other 5 templates were never wired up.
- **Status-aware buttons**: Each button now appears only when relevant — e.g. "Shipping Confirmation" shows when status is `AwaitingDelivery` with delivery type, "Pickup Ready" when pickup type, "Delivery Complete" when `Complete`, etc.
- **Receipt always available**: The receipt button appears on any active order (not Draft or Cancelled), matching expected behavior.

### Files Modified
- `src/components/orders/OrderSlideOver.tsx` — replaced hardcoded `showWhatsAppModal: boolean` with `activeWhatsAppTemplate: WhatsAppTemplateType | null`; added status/delivery-type logic to compute visible buttons

---

## [v1.3.12] - 2026-02-23 - Fix: Brochure No Longer Blocks Order Fulfillment

"Brochure - How to eat" was blocking orders from being fulfilled — it showed up as a product needing stock, but there was never any stock to give it. Orders would permanently show "2 items short — cannot fulfill". This is now fixed: packaging/marketing items like brochures are silently skipped during the fulfillment stock check and drawdown, so they no longer hold up real orders.

### Fixed
- **Brochure blocks fulfillment**: `getStockForOrder` query now skips `productType="packaging"` menu products — they are not finished goods and have no finished-goods inventory to check against
- **Fulfillment mutation aligned**: `fulfillFromInventory` mutation applies the same filter so packaging items are ignored during stock drawdown

### Root Cause
The `productInventory` system tracks finished goods (boxes of snacks) at storage locations. The brochure (`productType="packaging"`) is a marketing item tracked via the BOM/component system — a separate path with no finished-goods inventory. The fulfillment query was listing all order items regardless of product type, returning 0 stock for brochures and blocking fulfillment permanently.

### Files Modified
- `convex/productInventory/queries.ts` — skip `productType="packaging"` in stock availability check
- `convex/productInventory/mutations.ts` — same filter applied to stock drawdown loop

---

## [v1.3.11] - 2026-02-23 - Feature: Ingredient Cost Simulation & Dispatch Planner Upgrades

You can now simulate "what if ingredient X costs more?" directly from the Ingredients page — instantly see how price changes ripple through recipes, products, and margins before committing. The Dispatch Planner got a major usability upgrade: the date grid now anchors on yesterday so today is always visible, each column header has a "Save to Kitchen" button, and a new Balls footer row shows the total ball count per day expanded from BOM. Direct Sales orders are now included in ball totals so nothing is missed. Finished Goods inventory can be adjusted inline with a new Adjust dialog.

### Added
- **Ingredient cost simulation**: simulate price changes on any ingredient and see real-time impact on recipe costs, product COGS, and margins via BOM expansion
- **Balls footer row**: PlannerGrid shows BOM-expanded ball count (Big Ball / Mid Ball) per day at the bottom
- **Direct Sales in ball totals**: `getBallTotalsForDispatchPlanDate` now includes direct sales orders alongside regular dispatch orders
- **FG Adjust dialog**: new `FGAdjustDialog` component + Adjust button in `FinishedGoodsTab` for inline inventory corrections
- **Untrack button**: ingredients can be untracked directly from the Ingredients page

### Changed
- **Dispatch Planner date grid**: anchored on yesterday so today's column is always visible without scrolling
- **Save to Kitchen**: moved from a single page button to per-column headers in the Planner grid
- **Planner renamed**: page title updated from "Dispatch Plan" to "Planner"

### Fixed
- **Direct-manual save bug**: fixed save logic that was incorrectly persisting manual overrides
- **Blur-save removed**: eliminated accidental saves triggered by clicking away from cells
- **Double toast on ingredient edit**: prevented duplicate success notifications
- **Nav fixes**: corrected Hub page navigation links

### Files Modified
- `convex/dispatchPlanner/queries.ts`, `helpers.ts` — ball totals, direct sales aggregation
- `convex/ingredients/mutations.ts` — simulation endpoint
- `src/pages/DispatchPlanner.tsx` — date grid, save-to-kitchen, planner rename
- `src/pages/IngredientsManager.tsx` — simulation UI, untrack button
- `src/components/dispatchPlanner/PlannerGrid.tsx`, `PlannerCell.tsx`, `WeekNav.tsx` — balls footer, UX polish
- `src/components/inventory/FGAdjustDialog.tsx`, `FinishedGoodsTab.tsx` — new adjust flow

---

## [v1.3.10] - 2026-02-23 - Fix: Dark Mode Colors Now Consistent Across All Pages

Dark mode rendering has been cleaned up across the entire app. Status banners, badges, alert boxes, and card backgrounds (low stock warnings, order urgency indicators, K3Mart/GoFood domain colors, etc.) now correctly adapt to dark mode using the project's central color token system instead of fragile per-component overrides. Also: managers can now force-complete stuck orders without needing admin access.

### Fixed
- **Dark mode token refactor**: 35 components and pages migrated from per-component `dark:` Tailwind patches to CSS variable tokens — dark mode now handled by the central cascade in `index.css`
- Inventory, Orders, K3Mart Cockpit, GoFood Depot, Menu Products, and 5 page files all covered
- **Force-complete orders**: Manager role can now force-complete orders (was admin-only)

### Docs
- `docs/CODE_STYLE.md` — new "Dark Mode" section with token usage guide
- `docs/UI_BRAND_REFERENCE.md` — full semantic token replacement table and cascade explanation

---

## [v1.3.9] - 2026-02-23 - Fix: Default Packaging Mix Product Dropdown

The "Add product" dropdown in Kitchen Manager Settings → Default Packaging Mix now only shows real food products (e.g. Original Single, Jumbo Single) instead of every active product including brochures and packaging-only items.

### Fixed
- **PackagingMixEditor product dropdown**: switched from `list` (all active products) to `listPosProducts` query — filters server-side to food POS products only (`posSlot` defined, `productType ≠ "packaging"`)

### Files
- `src/components/kitchen/PackagingMixEditor.tsx`

---

## [v1.3.8] - 2026-02-23 - Performance: Bundle Splitting & Lazy Route Loading

The app now loads significantly faster on first visit. Instead of downloading all page code upfront (~1.4 MB), the browser only downloads the code for the page you're actually visiting. Vendor libraries (React, icons, charts) are split into stable cached chunks so returning users skip those downloads entirely. Hovering over a nav link pre-fetches the next page's code before you click — making navigation feel instant.

### Changed
- **Lazy route loading**: All pages (except Login and Hub) are now loaded on-demand via React.lazy — initial JS bundle drops from ~1.4 MB to well under 500 kB
- **Vendor chunk splitting**: `recharts/d3`, `framer-motion`, `react-dom/router`, `lucide-react`, `@radix-ui`, `convex`, and `@dnd-kit` each get their own cached chunk — stable hashes mean returning users skip these downloads
- **Hover prefetching**: Hovering or focusing a nav link (desktop header + mobile bottom nav) pre-fetches the destination page chunk before the user clicks
- **Route loading spinner**: A 200ms-delayed UtensilsCrossed spinner appears if a chunk takes time to load — invisible on fast connections, graceful on slow ones
- **Chunk error boundary**: Automatically retries failed chunk loads once; detects deploy-drift (stale chunk hash) and reloads; shows "Please reload" prompt after two failures
- **Bundle size CI guard**: `npm run build` now fails if the main index chunk exceeds 500 kB — prevents future regressions
- **Bundle visualizer**: `dist/bundle-stats.html` generated on every build for interactive treemap analysis
- **WhatsApp Templates**: Removed page-level fade-in animation (pages now snap in immediately per design decision)

### Files Modified
- `src/lib/lazyWithPreload.ts` — new utility: wraps React.lazy with `.preload()` method
- `src/components/shared/RouteLoadingFallback.tsx` — new: 200ms delayed spinner component
- `src/components/shared/ChunkErrorBoundary.tsx` — new: class-based error boundary for chunk load failures
- `src/App.tsx` — all routes converted to lazy imports; Suspense + ChunkErrorBoundary added
- `src/components/layout/Header.tsx` — onMouseEnter/onFocus prefetch wired to nav links
- `src/components/layout/MobileBottomNav.tsx` — onMouseEnter/onFocus prefetch wired to primary tabs
- `src/pages/WhatsAppTemplatesManager.tsx` — page-level AnimatePresence/motion.div wrapper removed
- `vite.config.ts` — manualChunks, bundlesize plugin, visualizer plugin added
- `package.json` — `vite-plugin-bundlesize`, `rollup-plugin-visualizer` added as devDependencies

---

## [v1.3.7] - 2026-02-23 - Legacy Cleanup: Remove Old Editors & Rebrand to Frollie Pro

The app has been cleaned up significantly — all legacy recipe, packaging, product editor pages, the tags system, and the old dashboard have been removed. What used to be 70 database tables is now 59. The app is also rebranded from "Frollie Recipe Master" to **Frollie Pro**, and managers/admins now land on a clean hub page at `/home` with navigation cards organized by functional area.

### Changed
- **Removed legacy editor pages**: RecipeEditor, PackagingEditor, ProductEditor, TagsManager, Dashboard, and MaterialsManager pages are gone — along with their routes, hooks, and components
- **11 schema tables dropped**: `recipes`, `recipeVersions`, `recipeComponents`, `componentIngredients`, `packagingRecipes`, `packagingVersions`, `packagingComponents`, `packagingComponentMaterials`, `products`, `productVersions`, `tags` — all were empty in production
- **costInvalidation.ts cleaned**: Now only contains `invalidateMenuProductCosts` and `invalidateProductionComponentCosts`; legacy recipe/packaging invalidation removed
- **Hub page at `/home`**: Role-filtered navigation hub with Frollie Pro branding, time-of-day greeting, and 5 functional area sections (Operations, Inventory & Supply, Sales & Distribution, Configuration, Admin). Cards hidden when user lacks access. Zero live data queries
- **Role redirects**: Manager/admin → `/home`; kitchen → `/kitchen`; order_staff → `/orders`
- **Rebranded to Frollie Pro**: All "Frollie Recipe Master" references updated across header, footer, login page, document title hook, and `index.html`
- **Home nav link added**: Desktop header and mobile bottom nav now include a Home link pointing to `/home` for manager/admin

### Files Modified
- `convex/schema.ts` — 11 legacy tables removed (70 → 59)
- `convex/lib/costInvalidation.ts` — stripped to 2 active functions
- `convex/ingredients/mutations.ts`, `convex/materials/mutations.ts` — legacy scheduler calls removed
- `src/pages/HubPage.tsx` — new hub page (251 lines)
- `src/App.tsx` — routes updated, `RoleBasedRedirect` added
- `src/components/layout/Header.tsx`, `Footer.tsx`, `MobileBottomNav.tsx` — branding + nav updates
- `src/pages/Login.tsx`, `src/hooks/useDocumentTitle.ts`, `index.html` — branding updates
- ~60 files deleted (legacy pages, hooks, components)

---

## [v1.3.6] - 2026-02-23 - Kitchen: EoS Form Gap Closure — Waste Filter, Inline Error, Live Delta

Three quality-of-life fixes for the End of Shift form. Waste entries now respect which ball types are enabled — if you turn off Jumbo in Manager Settings, Jumbo waste rows disappear and aren't submitted. If the shift submission fails (e.g. network error), the error now shows as an amber banner right on the review screen instead of a fleeting toast. And each produced row now shows the target next to the input with a live over/under delta so you can see at a glance whether you've hit the day's goal.

### Changed
- **Waste filter by enabled components**: Waste entries are filtered by the same enabled-component logic as produced rows. Disabled ball-type products are hidden from the waste section and excluded from submission.
- **Inline confirm error**: Mutation errors on the review screen now render as an inline amber banner above the Back/Confirm buttons instead of a toast notification. Input validation errors still use toasts.
- **Per-product live delta**: Each produced row shows `target: X` inline next to the product name, and a live `+/-N over/under` delta to the right of the input. Delta is invisible until a quantity is entered. Amber = under target, emerald = on target or over.

### Files Modified
- `src/components/kitchen/EndOfShiftForm.tsx` — `visibleWasteEntries` filter, `confirmError` state, produced row layout redesign with inline target + delta
- `src/components/kitchen/ShiftReviewModal.tsx` — `error` prop + inline amber banner above action buttons

---

## [v1.3.5] - 2026-02-23 - Kitchen: Shift Review Deltas, Success Screen Animation, Chef History

The shift review step now shows each product's produced count vs. its target — including a +/- variance so staff know at a glance if they hit the day's goal. Waste counts toward the total made in the review summary. The success screen has been redesigned from a plain text summary into a card list with a sequential checkmark animation per product row. Shift history now shows the chef name on each record when one was set, and managers can update the chef field when editing a past record.

### Changed
- **Shift review target deltas**: Each product row in the review step shows produced count, optional waste count, and a +/- variance vs. the target. Green = met or exceeded; amber = fell short.
- **Waste toward target total**: The totals section in the review step shows produced, waste, and combined total made (produced + waste) so nothing is hidden.
- **Success screen redesign**: Card list layout with Framer Motion stagger animation — each produced item animates in sequentially with a checkmark icon. Waste shown separately below.
- **Chef name in shift history**: History cards show "(chef: Name)" next to the submitter when the chef differs from who submitted.
- **Chef edit in ShiftEditDialog**: Manager edit dialog now includes a chef name input field, pre-populated from the existing record and saved back on confirm.

### Files Modified
- `src/components/kitchen/ShiftReviewModal.tsx` — card-style rows, target deltas, waste-toward-target totals summary
- `src/components/kitchen/ShiftSuccessScreen.tsx` — card list layout, Framer Motion stagger animation, separate waste section
- `src/components/kitchen/ShiftHistoryList.tsx` — chefName + chefUserId fields on ShiftRecord; chef display in record card
- `src/components/kitchen/ShiftEditDialog.tsx` — chefName state, input field, included in updateShiftRecord call
- `src/components/kitchen/EndOfShiftForm.tsx` — passes packagingItems as targets to ShiftReviewModal and ShiftSuccessScreen

---

## [v1.3.4] - 2026-02-23 - Kitchen: Per-Component Toggle Cascade, Target Display, Chef Selector, Order Notes

Kitchen production tracking is now fully toggle-aware — turning off a ball type (e.g. Jumbo) hides it from stat cards, packaging breakdown badges, and the End of Shift input rows. Each product row now shows its target quantity right next to the input for at-a-glance comparison. The End of Shift form has a chef selector so you can record who actually cooked. The read-only order summary cards now show order notes. The page header shows the chef name when one has been assigned for the current shift.

### Changed
- **Per-component toggle cascade**: Disabling Original or Jumbo in Manager Settings now hides the stat card, packaging breakdown badge, and End of Shift input row for that ball type — consistently throughout the kitchen view.
- **Target display in EoS form**: Each product row in End of Shift now shows "target: N" next to the product name so staff can compare what was planned vs. what to enter.
- **Chef selector in End of Shift**: A dropdown lets you select the actual cook before submitting. Chef name is recorded alongside the submitter in the shift record.
- **Chef name in header**: When a shift record with a chef has been submitted today, "Shift for: [Chef Name]" appears next to the date in the page header.
- **Order notes on order cards**: Read-only order summary cards in the collapsible orders section now display order notes below the item list.
- **Mixed ball type warning**: Products that use both Original and Jumbo balls get an amber warning flag in EoS when one type is toggled off, so staff know it's partially disabled.

### Files Modified
- `src/components/kitchen/ProductionTargetsBar.tsx` — per-component visibility via enabledComponents prop; packaging badges filtered and styled by ball type
- `src/components/kitchen/EndOfShiftForm.tsx` — target display per row, row filtering, mixed-type warning flag, chef selector
- `src/components/kitchen/KitchenOrderSummary.tsx` — order notes displayed on cards
- `src/pages/KitchenViewV2.tsx` — BOM lookup for productBallTypes map, enabledComponents derivation, prop threading, chef header, users query
- `convex/menuProductComponents/queries.ts` — added `listAll` query for BOM map building

---

## [v1.3.3] - 2026-02-23 - Kitchen: Unified Manager Settings + Smart Packaging Mix Editor

The Manager Settings panel has been redesigned into a single, cleaner form. Instead of juggling two separate cards (Defaults and Today's Override), there's now one set of inputs with two save actions. The packaging mix editor now shows exactly what's in the BOM for each product — including which ball type it uses and how many balls per unit — with running allocation counters that update live as you adjust quantities. The whole section is now collapsible so kitchen staff don't see it cluttering their view. Setting a daily override no longer clears the packaging breakdown badges on the main targets bar.

### Changed
- **Unified Manager Settings form**: Single card replaces the two-card Default + Override layout. Max Capacity field removed — ball targets (Original + Jumbo) are the ceiling.
- **Two save actions**: "Save as Default Daily Targets" persists to config; "Apply Override for Today Only" sets a daily override without touching defaults.
- **Per-component toggles**: Individual enable/disable toggles per production component (Original 45g / Jumbo 80g) replace the single Show Jumbo toggle. Loaded dynamically from componentTypes.
- **Packaging mix with BOM info**: Each product row now shows BOM component badges, balls-per-unit count, subtotal, and a running allocation counter per ball type. Products grouped by ball type. Soft warning when mix total doesn't match ball target.
- **Food POS product filter**: Packaging mix dropdown now only shows products that are food type, active, and assigned to a POS slot — the ~3 products actually available for ordering.
- **Collapsible Manager Settings**: The section starts collapsed, keeping the kitchen view clean for production staff.
- **Override preserves packaging breakdown**: When a daily override is active without explicit packaging overrides, the target query now falls through to the default packaging mix so breakdown badges remain visible.

### Files Modified
- `src/components/kitchen/PackagingMixEditor.tsx` — new component: BOM-aware packaging mix editor with ball allocation counters
- `src/components/kitchen/ManagerTargetSettings.tsx` — rewritten: unified form with per-component toggles and two save actions
- `src/pages/KitchenViewV2.tsx` — Manager Settings section now collapsible (default: collapsed)
- `convex/kitchenConfig/queries.ts` — `getKitchenTargetsForDate` override path now falls through to `defaultPackagingMix` when no packaging overrides set

---

## [v1.3.2] - 2026-02-23 - Kitchen: Chef Accountability + Per-Component Production Toggles (Schema)

Shift records can now track who actually cooked — separate from whoever submitted the record. This lets a manager or senior staff submit on behalf of a team member while crediting the right person. Additionally, production component visibility is now configurable per component type (Original/Jumbo independently) instead of just a single Jumbo on/off toggle — the groundwork for full independent toggle controls in the kitchen view.

### Added
- **Chef attribution on shift records**: `chefName` and `chefUserId` fields on `kitchenShiftRecords`. Submission accepts optional chef info; managers can correct it on edit.
- **Per-component production toggles**: `enabledProductionComponents` string array on `kitchenConfig` (e.g. `["BIG_BALL", "MID_BALL"]`). `null` means all enabled. When set, `showJumbo` is automatically derived for backward compatibility.

### Files Modified
- `convex/schema.ts` — `chefName`/`chefUserId` on `kitchenShiftRecords`; `enabledProductionComponents` on `kitchenConfig`
- `convex/kitchenShiftRecords/mutations.ts` — `submitShiftRecord` and `updateShiftRecord` accept chef fields
- `convex/kitchenShiftRecords/queries.ts` — `getShiftRecordsByDate` and `getShiftHistory` return chef fields
- `convex/kitchenConfig/mutations.ts` — `updateConfig` accepts `enabledProductionComponents`; auto-syncs `showJumbo`
- `convex/kitchenConfig/queries.ts` — `getConfig` returns `enabledProductionComponents` (null = all); derives `showJumbo` from new field when set

---

## [v1.3.1] - 2026-02-22 - Kitchen Shift Records: Raw Ingredient Deduction at Shift End

When kitchen staff submit an end-of-shift production record, the system now automatically deducts the raw ingredients that were consumed to make those balls from ingredient inventory — closing the ingredient loop so stock levels stay accurate without any manual adjustments.

### Added
- **Automatic ingredient deduction on shift submit**: When a shift record is submitted, each produced ball quantity is traced through the production BOM (Big Ball / Mid Ball → ingredient hierarchy) and the corresponding raw ingredient quantities are deducted from inventory using FIFO (oldest batches consumed first).
- **Soft failure with warnings**: If ingredient stock is insufficient, the shift submission is never blocked — the system deducts whatever is available and records a negative adjustment for the shortfall, returning warnings for optional display.
- **Ingredient adjustment on shift edits**: Manager edits to shift records now also adjust raw ingredient stock for the production diff (more production = additional deduction; less production = ingredients restored to latest active batch).

### Files Modified
- `convex/kitchenShiftRecords/ingredientDeduction.ts` — new helper: `deductIngredientsForShift`, `restoreIngredientsForShift`, `buildIngredientNeeds`
- `convex/kitchenShiftRecords/mutations.ts` — `submitShiftRecord` step 7 (deduct ingredients); `updateShiftRecord` step 5 (diff-based deduct/restore)

---

## [v1.2.16] - 2026-02-22 - WhatsApp Template Editor: Delivery Fee Preview & Tooltips

The template editor now correctly shows the delivery fee in the live preview (instead of the raw `{delivery_fee}` placeholder), the variable chip appears in the Delivery section so you can click to insert it, and hovering any variable now shows a small description of what it does.

### Fixed
- **Live preview now renders `{delivery_fee}`**: The preview uses sample data (`🚚 Ongkir: Rp 15.000`) so you can see exactly how the message will look with a delivery fee.

### Added
- **`{delivery_fee}` in the Variables panel**: Appears under the Delivery category — click to insert at cursor like any other variable.
- **Hover tooltips on all variable chips**: Each variable now shows a styled tooltip describing what it inserts (e.g. *"Delivery/shipping fee. Empty when no fee."*).

### Files Modified
- `src/components/whatsappTemplates/TemplateEditor.tsx` — added `{delivery_fee}` sample data
- `src/components/whatsappTemplates/VariableReference.tsx` — added variable to Delivery category, description, and shadcn Tooltip on all chips

---

## [v1.2.15] - 2026-02-22 - Delivery Fee in WhatsApp Payment Messages

WhatsApp payment requests and receipts now show the delivery fee as a separate line above the total, so customers can see exactly what they're paying for — items, ongkir, and any discount all adding up to the final amount.

### Added
- **`{delivery_fee}` variable in WhatsApp templates**: Payment Request and Receipt templates (Indonesian + English) now include a `🚚 Ongkir: Rp X.XXX` line directly above the Total line. The line disappears cleanly when there's no delivery fee — no blank lines.
- **Variable available in template editor**: `{delivery_fee}` now appears in the Variables panel in WhatsApp Templates Manager and can be inserted at cursor.

### How to activate
Go to **WhatsApp Templates Manager** → click **"Reset to Default"** on both the Payment Request and Receipt templates to pull in the updated layout.

### Files Modified
- `convex/orders/whatsapp.ts` — `buildTemplateVariables()` now emits full ongkir line with emoji when fee > 0, empty string when zero
- `convex/whatsappTemplates/mutations.ts` — default template bodies and `availableVariables` updated for both templates

---

## [v1.2.14] - 2026-02-22 - GoFood Depot Management & Inventory Overhaul

The GoFood depot workflow is now fully operational: stock transfers to depots work for all outlets, the Inventory page has a new "By Platform" view that splits stock across Internal / GoFood / K3Mart, and the Restock Planner now clearly explains what the numbers mean and how to act on them.

### Added
- **By Platform grouping in Inventory**: Finished Goods tab now has three sort modes — By Product, By Location, and By Platform. Platform view shows flat product lists under Internal Inventory, GoFood, and K3Mart sections.
- **Location type editor in Inventory Settings**: Admins can tag each storage location as Internal Inventory, GoFood, or K3Mart directly from the Inventory settings panel — no separate config page needed.
- **GoFood Depot stock transfers now work**: The "Move Here" transfer dialog correctly wires the outlet's linked storage location — the amber "no linked storage location" warning no longer appears for outlets that have been properly set up.
- **Restock Planner usage guidance**: A always-visible guidance block in the GoFood Depot Restock section explains the 3-day average calculation and provides a direct "Transfer →" link per product row to the Inventory page.
- **GoBiz sync info note on GoFood Depot page**: A visible note explains why stock may not decrease after a sync (missing product mapping or storage location link), reducing user confusion.

### Improved
- **Inventory labels**: Location type badges throughout Inventory now read "Internal Inventory", "GoFood", "K3Mart" instead of the raw database values "Internal", "Depot", "Venue".
- **Dark mode Alerts card**: The orange Alerts stat card in Inventory hero is now readable in dark mode.
- **Depot cockpit usability**: Hover the stock count in the depot cockpit to see a pencil icon indicating it's editable. Restock suggestion tooltip text is now readable in both light and dark mode.
- **Move / Receive buttons**: Color-coded — blue for Move, green for Receive — making them easier to spot at a glance in the inline transfer form.
- **Restock Planner renamed**: Page title, navigation link, and route are now consistently "Restock Planner" at `/restock-planner`. Redundant "Simulate Inventory" button removed from the page header.

### Files Modified
- `src/pages/GoFoodDepotManager.tsx` — destinationLocationId prop + GoBiz sync info note
- `src/components/gofoodDepot/DepotCockpitTable.tsx` — destinationLocationId threading, tooltip contrast, pencil affordance
- `src/components/gofoodDepot/DepotStockTransferDialog.tsx` — no changes needed (prop already accepted)
- `src/components/inventory/FinishedGoodsTab.tsx` — By Platform mode, location type editor, Move/Receive button styling
- `src/components/inventory/FinishedGoodsHero.tsx` — dark mode Alerts card, "Internal Inventory" label
- `src/components/restockPlanner/GoFoodRestockSection.tsx` — usage guidance block, Transfer → links
- `src/pages/DispatchPlanner.tsx` — Simulate Inventory button removed
- `src/App.tsx` — route updated to `/restock-planner`
- `src/components/layout/Header.tsx` — nav label updated to "Restock"
- `src/components/dispatchPlanner/ChannelSettingsDialog.tsx` — dialog title updated

## [v1.2.13] - 2026-02-22 - Delivery Fee on Orders

Orders can now include a manually-entered GoSend delivery fee, recorded directly on the order detail page. Staff enter the fee once and it appears as a separate line item below the order total — customers see the full cost breakdown in both the order view and WhatsApp receipt messages.

### Added
- **Delivery fee field on orders**: A "🚚 Delivery Fee" row appears below discounts on the Order Detail page for all non-completed, non-cancelled orders.
- **Inline edit**: Click "Edit" next to the delivery fee row to enter a fee amount. Enter 0 to clear. Press Save or Enter to confirm.
- **Final Total updates automatically**: The Final Total displayed on the page and stored on the order reflects `(product total - discounts) + delivery fee`.
- **WhatsApp messages show delivery fee**: Payment request and receipt templates include a `🚚 Ongkir: Rp X` line when a delivery fee is set.
- **Persists across refresh**: Delivery fee is stored on the order in the database.

### Files Modified
- `convex/schema.ts` — `deliveryFee: v.optional(v.number())` added to orders table
- `convex/orders/mutations/orderCrud.ts` — `updateDeliveryFee` mutation
- `convex/orders/mutations/index.ts` — export `updateDeliveryFee`
- `convex/orders/whatsapp.ts` — delivery fee line in payment request and receipt templates
- `src/lib/types.ts` — `delivery_fee` field on `OrderDetail` interface
- `src/hooks/convex/useOrders.ts` — `deliveryFee` in transform, `useConvexUpdateOrderDeliveryFee` hook
- `src/hooks/convex/index.ts` — export `useConvexUpdateOrderDeliveryFee`
- `src/components/orders/OrderItems.tsx` — delivery fee row with inline edit UI
- `src/pages/OrderDetail.tsx` — pass delivery fee props to OrderItems

## [v1.2.12] - 2026-02-22 - Customer Address Auto-Fill in New Orders

When creating a new order for a repeat customer, their saved delivery address now automatically fills in the address field — no more re-typing the same address every time. If you change the address for a specific order, a checkbox lets you optionally update the customer's saved default too. New customers get their delivery address saved automatically for future orders.

### Added
- **Address auto-fill**: Selecting an existing customer in the order form pre-populates the delivery address with their saved default.
- **Save as default checkbox**: When the entered address differs from the customer's saved default (or when they have no default yet), a checkbox "Save as customer's default address" appears below the address field (checked by default).
- **Address indicator in customer selector**: The selected customer card now shows a small MapPin icon and their saved address for quick reference.
- **Auto-save for new customers**: New customers created through the order form automatically get their delivery address saved as their default.

### Files Modified
- `convex/schema.ts` — `defaultAddress` optional field added to customers table
- `convex/customers/mutations.ts` — `defaultAddress` in create/update args
- `convex/orders/mutations/orderCrud.ts` — `updateCustomerAddress` arg in updateDraft; auto-save for new customers in create
- `src/components/orders/CustomerSearch.tsx` — pass defaultAddress via onCustomerSelect; show address in selected state
- `src/pages/OrderCreate.tsx` — address pre-populate, sync checkbox, edit mode comparison

---

## [v1.2.11] - 2026-02-22 - Use Available Inventory on Kitchen Orders

Staff can now use the "Use Available Inventory" drawdown on orders that are already in the kitchen queue (Being Prepared status). Previously this was only available before the order entered the kitchen. This lets staff quickly fulfill an order from finished goods stock even after it's been sent to production, skipping kitchen work and advancing directly to Awaiting Delivery.

### Added
- **Inventory drawdown for Being Prepared orders**: The "Use Available Inventory" card now appears on orders in Being Prepared status (in addition to Payment Received). Confirming the drawdown clears the order from the kitchen view and advances it to Awaiting Delivery.

### Fixed
- **Audit log fromStatus**: The status transition audit log now records the actual order status at the time of drawdown (PaymentReceived or BeingPrepared) instead of always logging "PaymentReceived".

### Files Modified
- `convex/productInventory/mutations.ts` — status guard, dynamic audit log fromStatus
- `src/components/inventory/FulfillFromInventoryButton.tsx` — visibility guard updated

---

## [v1.2.10] - 2026-02-22 - WhatsApp Template: Correct Delivery Info & Date

WhatsApp payment requests now correctly show "Delivery to: [address]" for delivery orders instead of always showing pickup info. Target dates also display correctly — they were showing 1 day behind due to a timezone issue.

### Fixed
- **Delivery vs Pickup info**: Delivery orders now show the delivery address instead of "Pickup at: [location]". The template now prioritizes the actual address content over the `deliveryType` field.
- **Target date off by 1 day**: All date formatting in WhatsApp templates now uses `Asia/Jakarta` timezone. Previously UTC formatting caused dates to appear 1 day behind for WIB users.

### Files Modified
- `convex/orders/whatsapp.ts` — delivery logic reordered, timezone added to date formatting
- `convex/orders/whatsappHelpers.ts` — timezone added to date formatting
- `src/lib/whatsappTemplates.ts` — timezone added to frontend date formatting

---

## [v1.2.9] - 2026-02-22 - Fix Draft Order Save Error with Vouchers

Saving changes on an edited order that had a voucher applied no longer crashes. Previously you'd get a server error when pressing "Save Changes" — now it saves cleanly.

### Fixed
- **Draft order save with voucher**: A race condition between two save steps caused the system to re-validate an already-cleared voucher, which failed for manager override vouchers and expired/usage-limited vouchers. Voucher handling is now left to the first save step only.

### Files Modified
- `src/pages/OrderCreate.tsx` — removed redundant voucher code from save calls, cleared voucher UI state after item replacement

---

## [v1.2.9] - 2026-02-22 - Fix Customer Creation in Draft Orders

Creating a new customer from the order form now actually saves the customer AND automatically selects them — no more having to search again after creating.

### Fixed
- **Customer not created**: When creating a new customer in a draft order, the customer was being saved to the database but the frontend never received the new customer's ID, leaving the order in an inconsistent state (`customerId = null`, `isNewCustomer = true`).
- **Customer not auto-selected**: After creating a new customer, `CustomerSearch` immediately reset to an empty search bar. The user had to search for the just-created customer manually. Now the created customer's name/phone chip appears immediately.

### Changed
- `createDraft` mutation now returns `{ orderId, customerId }` instead of just `orderId`
- `OrderCreate.handleNewCustomer` now captures and applies the real customer ID after draft creation
- `CustomerSearch.onNewCustomer` prop is now async, returning the new customer's ID for auto-selection

### Files Modified
- `convex/orders/mutations/orderCrud.ts`
- `src/pages/OrderCreate.tsx`
- `src/components/orders/CustomerSearch.tsx`

---

## [v1.2.8] - 2026-02-22 - Edit Order Items Fix + Phone Editing in Order Form

"Edit Order Items" button now actually works — previously it silently closed the dialog without doing anything. Also, you can now see and edit the customer's phone number directly in the order form, and the Customers page is accessible from the Config menu.

### Fixed
- **Edit Order Items button**: Was navigating to a dead URL (`/orders?edit=`). Now correctly opens the order editing page for both Draft and AwaitingPayment orders.
- **AwaitingPayment orders editable**: Orders waiting for payment can now be edited — previously only Draft orders could be modified.

### Added
- **Inline phone editing in order form**: Customer phone number is displayed and editable directly in the order form without leaving the page.
- **Customers in Config nav**: Added Customers link to the Config dropdown in the header.

### Changed
- `updateDraft` mutation now accepts AwaitingPayment orders (was Draft-only)
- Order edit page shows "Save Changes" instead of "Submit Order" when editing AwaitingPayment orders
- "Delete Draft" and "Save as Draft" buttons hidden for AwaitingPayment edits

### Files Modified
- `convex/orders/mutations/orderCrud.ts` — relaxed status guard
- `src/pages/OrderDetail.tsx` — fixed navigation URL
- `src/components/orders/OrderSlideOver.tsx` — fixed navigation URL
- `src/pages/OrderCreate.tsx` — AwaitingPayment support, adapted UI labels
- `src/components/orders/OrderForm.tsx` — inline phone display and editing
- `src/components/layout/Header.tsx` — Customers nav link

---

## [v1.2.7] - 2026-02-22 - Address-Driven Pickup/Delivery Detection

Orders now automatically detect whether an address is a pickup or delivery — no more manual dropdown. Pickup locations get a purple badge; delivery addresses get a blue badge live as you type. Quick-address buttons ("Crystal", "Goldfinch") pre-fill the correct "Pick up: …" format. If the address looks incomplete or empty, a soft-block modal asks you to confirm before saving.

### Added
- **Live delivery inference badge**: As you type in the address field, a coloured badge instantly shows `📍 Pickup at: [location]` (purple) or `🚚 Delivery to: [address]` (blue) — no manual type selection needed
- **Soft-block confirm modal**: If the address is empty or a single word, a modal asks "This doesn't look like an address — save anyway?" before submitting
- **QuickAddressButtons updated**: Crystal button now emits `"Pick up: Crystal"`, Goldfinch emits `"Pick up: Legato Gelato - Goldfinch"` — matching the auto-detection format
- **`parseDeliveryAddress` utility**: Shared pure function (frontend + backend) that derives `deliveryType` and `pickupLocation` from the raw address string; "Pick up: …" → Pickup, everything else → Delivery

### Changed
- `createOrder` and `updateDraft` mutations no longer accept `deliveryType`/`pickupLocation` from callers — these are derived automatically from `deliveryAddress`
- New drafts default to `deliveryType: "Delivery"` (was "Pickup") — safer default when no address has been entered yet

### Files Modified
- `convex/orders/helpers.ts` — added `parseDeliveryAddress`
- `convex/orders/mutations/orderCrud.ts` — wired parser into `createOrder`, `createDraft`, `updateDraft`
- `src/lib/deliveryUtils.ts` — frontend version of `parseDeliveryAddress` (with `suspicious` flag)
- `src/lib/__tests__/deliveryUtils.test.ts` — 7 unit tests
- `src/components/orders/QuickAddressButtons.tsx` — updated button addresses
- `src/pages/OrderCreate.tsx` — badge + confirm modal

---

## [v1.2.6] - 2026-02-21 - Phase 17.1 Plan 05: UAT Gap Closure

Fixed 7 issues found during user acceptance testing of the Finished Goods inventory feature. The "Use Available Inventory" button now appears in the correct sidebar on order pages, the product pickers show only active POS items, and drawdown toasts summarise exactly how much stock was used and how much remains.

### Fixed
- **Button placement**: "Use Available Inventory" card moved to the right sidebar in Order Detail, above the order items list — visible on desktop without scrolling
- **Product filter**: Add Stock and Adjust Stock dialogs now show only POS-assigned products (posSlot not null) — excludes Brochure and other non-product entries
- **Current stock display**: Adjust Stock dialog shows "Current stock at this location: N units" when product + location are selected
- **Location toggle UX**: Add Stock and Adjust Stock location selectors replaced with 3 horizontal toggle buttons (Office, Kitchen, Legato Goldfinch) instead of a dropdown
- **Drawdown toast**: Success toast now shows per-product "X used, Y remaining" breakdown via Sonner description field (6-second duration)
- **Settings labels**: Auto-advance and Alert Mode settings have plain-language helper text explaining what each setting does in non-technical terms
- **Category toggle**: Production Components Manager Edit dialog now has Production / Packaging category toggle; backend mutation accepts optional category arg

### Technical
- `convex/productInventory/mutations.ts`: fulfillFromInventory returns `deductions[]` array
- `convex/componentTypes/mutations.ts`: update mutation accepts optional `category` arg
- `src/pages/OrderDetail.tsx`: FulfillFromInventoryButton moved to lg:col-span-1 right column
- `src/components/inventory/FGAddStockDialog.tsx`: posSlot filter + location toggle buttons
- `src/components/inventory/FGAdjustStockDialog.tsx`: posSlot filter + getStockOverview current stock + location toggle buttons
- `src/components/inventory/FulfillFromInventoryButton.tsx`: per-product toast from deductions array
- `src/components/inventory/FinishedGoodsTab.tsx`: plain-language settings helper text
- `src/pages/ProductionComponentsManager.tsx`: category toggle in Edit dialog

---

## [v1.2.5] - 2026-02-20 - Phase 17.1: Finished Goods Inventory Tracker

Staff can now track finished goods (boxes of ready-to-sell product) by location, add stock after production runs, and fulfill orders directly from inventory — skipping kitchen production entirely when stock is available. GoFood sales automatically deduct from the linked depot location.

### Added
- **Finished Goods Inventory tab** in Inventory Manager (third tab alongside Packaging and Ingredients)
- **ProductStockCard**: per-product stock card showing quantity by location with low-stock highlighting
- **AddStockDialog**: simple dialog for kitchen/staff to record finished goods added to a location
- **FGAdjustStockDialog**: manager-only dialog for corrections/spoilage/transfers (requires reason)
- **TransactionLogPanel**: scrollable paginated audit log of all stock movements per product
- **FulfillFromInventoryButton**: appears on PaymentReceived orders — location selector + per-item availability check + atomic drawdown; advances order to AwaitingDelivery on success
- **InventoryAvailabilityPanel**: real-time per-item availability table (Needed / Available / Status) shown before confirming drawdown
- **GoFood auto-deduct**: processGofoodSales internal mutation deducts finished goods from outlet-linked depot locations during GoBiz sync
- **Low-stock alerts**: configurable global threshold; visual highlighting when stock at or below threshold
- **Settings panel**: admin-only globalLowStockThreshold, defaultAddLocationId, autoAdvanceOnDrawdown, alertMode configuration

### Changed
- InventoryManager page: 3-tab layout (Packaging | Ingredients | Finished Goods); category filter now derived from active tab
- Order fulfillment flow: "Fulfill from Inventory" card visible on Confirmed orders for order_staff/manager/admin

### Schema
- New table: `productInventory` (finished goods stock per product per location)
- New table: `productInventoryTransactions` (full audit log of all stock movements)
- New table: `productInventorySettings` (global low-stock threshold and config)

---

## [v1.3.0] - 2026-02-17 - Phase 20: Production Ingredient Tracking & COGS

Now you can build recipes for production components (like Mid Ball or Big Ball) with sub-components and ingredients, see exactly how much each one costs to make, and the dispatch planner checks whether you have enough ingredients for the week ahead -- not just packaging materials.

### Added
- Hierarchical production component recipes (sub-components + direct ingredients, up to 3 tiers deep)
- Recipe editor modal on ProductionComponentsManager (click row to open)
- COGS toggle per-component: Manual vs Calculated (with manual value preserved as fallback)
- Live COGS preview in recipe editor with partial calculation warnings
- COGS breakdown tooltip showing full ingredient hierarchy
- Food ingredient FIFO inventory tracking (same as packaging -- batches, receive dialog, low-stock alerts)
- Ingredient deduction on order fulfillment (full hierarchy trace, warn-but-allow for insufficient stock)
- Negative stock display with red highlight and warning icon
- Combined Materials Check panel in dispatch planner (packaging + ingredients)
- 7-day ingredient resupply forecast with projected depletion dates

### Changed
- ProductionComponentsManager: tier-based sorting (highest first), batchSize and cogsMode fields in create/edit dialogs
- Inventory Production tab: includes ingredient rows with type badges
- Dispatch planner: simulateInventory returns both packaging and ingredient sufficiency data
- componentTypes: relaxed production+trackInventory restriction for ingredient tracking
- Cost invalidation: cascades ingredient price changes through production component hierarchy to menu products

### Schema
- New table: productionComponentLinks (hierarchical sub-component links)
- New table: productionComponentIngredients (direct ingredient links)
- Extended: componentTypes (+batchSize, batchSizeUnit, cogsMode, manualUnitCostIdr, cachedCalculatedCogs, cogsCacheUpdatedAt, cogsMissingCount)
- Extended: ingredients (+ingredientComponentTypeId for inventory tracking link)

---

## [v1.2.0-fix1] - 2026-02-17 - Phase 17 UAT Fixes (Plan 17-06)

Seven bug fixes and improvements discovered during user acceptance testing of the Dispatch Planner. Week navigation now always shows correct Jakarta dates, the capacity bar tooltip is fully visible, Direct Sales cells can be edited for planning, and the Simulate Inventory button works properly with toast feedback.

### Fixed
- **Week navigation timezone bug**: Dates now always use Jakarta timezone for day-of-week calculation, preventing misaligned columns when accessed from different timezones
- **Capacity bar tooltip clipping**: Tooltip now renders above channel section borders with proper z-index
- **Direct Sales cells not editable**: Added "Planned (Manual)" outlet in Direct Sales channel with editable future cells for ad-hoc planning
- **Packaging-only products in grid**: Products like "Brochure-How to Eat" (productType=packaging) are now excluded from the dispatch planner grid
- **Simulate Inventory button broken**: Fixed render-time setState violation; button now shows toast feedback with shortage count or success message

### Changed
- **Settings dialog reduced from 4 tabs to 3**: Merged "Priorities" and "Channels" tabs into a single "Channels" tab with priority reorder + enable/disable toggle + name editing in one unified row
- **Commission rate removed**: Removed `commissionRate` from `dispatchChannelConfig` and `dispatchConsignmentOutlets` schema, mutations, and all UI (unused -- net/gross tracked from external APIs instead)

---

## [v1.2.0] - 2026-02-17 - Phase 17: Unified Dispatch Planner & 3rd Outlet

Plan production across all sales channels from one screen. The Dispatch Planner shows a rolling 7-day grid where managers can allocate ball production to Direct Sales, GoFood, K3Mart, and consignment outlets -- with a capacity bar that shows how each day's 200-ball limit is divided. A third GoFood outlet (Tamtem) now syncs automatically alongside Goldfinch and Crystal.

### Added
- **Unified Dispatch Planner** (`/dispatch-planner`): Multi-channel weekly production planning page combining Direct Sales, GoFood, K3Mart, and Other Consignment channels into a single rolling 7-day grid
  - Channel configuration with arrow-based priority reorder and enable/disable toggle
  - Segmented capacity bar per day showing demand waterfall across channels (default 200 balls/day, configurable)
  - Direct orders auto-populate at due date with production window visualization (due date - 2 days)
  - Editable cells with auto-save on blur for future days; read-only past days with actual sales data
  - Collapsible channel groups with subtotals
  - Consignment outlet management with product mapping (name + price)
  - Inventory simulation: manual BOM walk checking packaging and production components against current stock
  - 3-tab settings dialog (channels, outlets, capacity)
- **3rd GoFood outlet (Tamtem)**: Merchant ID G958262444 syncs automatically on existing cron schedule alongside Goldfinch and Crystal

### Schema Changes
- Added `dispatchPlans` table -- multi-channel dispatch plan cells with date/channel/product indexes
- Added `dispatchChannelConfig` table -- channel priority, colors, enable/disable
- Added `dispatchConsignmentOutlets` table -- configurable consignment outlets with product mapping
- Added `dispatchPlannerSettings` table -- daily capacity and planner configuration

### Backend
- `convex/dispatchPlanner/queries.ts` -- 5 queries (unified weekly plan, channel config, settings, consignment outlets, inventory simulation)
- `convex/dispatchPlanner/mutations.ts` -- 8 mutations (seed, save cell, channel config CRUD, settings, consignment CRUD)
- `convex/dispatchPlanner/helpers.ts` -- Pure business logic (redistribution, pre-fill, date helpers)

### Frontend
- `src/pages/DispatchPlanner.tsx` -- Main page with PlannerGrid orchestrator
- `src/hooks/convex/useDispatchPlanner.ts` -- Query/mutation hooks
- `src/components/dispatch/` -- CapacityBar, ChannelGroup, DayColumn, PlannerGrid, SettingsDialog
- Navigation entry added to Header for Manager/Admin roles

---

## 2026-02-16 - Phase 16: K3Mart Cockpit

The K3Mart page now shows a full weekly planning grid organized by outlet, with color-coded columns for weekends and holidays. Managers can plan dispatch quantities per product per outlet, copy last week's plan, confirm day-by-day, and have those confirmed quantities automatically pushed to the kitchen as production targets. Stock flow operations (stock-in, stock-out, rotation) go through a confirmation dialog with price sanity checks, and admins can configure per-outlet product visibility and custom pricing.

### Added
- Outlet-first weekly planning grid with product sub-rows per outlet
- Three-row column headers showing day name, date, and holiday/commercial event name
- Week navigation with prev/next arrows and "Today" button
- Copy-last-week button duplicates previous week's plan as draft
- Auto-suggest quantities based on weekday/weekend/holiday demand patterns
- Current stock column showing K3Mart stock per product per outlet
- Per-day confirm buttons (day-by-day granularity, not whole week)
- "Update Kitchen" button when editing already-confirmed plans
- Confirmed plans push production targets to kitchen via setProductTarget (source="consignment")
- Production bump approval wired to setProductTarget (source="consignment")
- Rotation stock shortcut (stock-out remaining + stock-in fresh in one action)
- Confirmation dialog before every K3Mart API call with price sanity check
- Stock movement history from K3Mart API with status badges
- Outlet settings modal: active/inactive toggle, per-outlet product selection, custom pricing
- Commercial/sales dates (Valentine's, 11/11, sequential dates) in holiday system
- Daily column totals as production targets
- Per-outlet product hiding (isHidden) and custom pricing (customPrice) on restockTargets

### Changed
- Weekly planner reorganized from product-first to outlet-first layout
- Planner always visible (removed collapsible toggle)
- Outlet cards show average daily sales from last week
- Active outlets only shown in planning grid

### Technical
- Extended indonesianHolidays.ts with commercial dates and day-type classifier
- Extended restockTargets schema with customPrice and isHidden fields
- Auto-save on blur replaces batch save for planning cells
- confirmDayPlan now pushes kitchen production targets (inline setProductTarget logic)

---

## 2026-02-16 - Phase 15: Kitchen Overhaul

The kitchen page now opens with a dashboard summary showing how many balls to make today, the max target, how many are left, and outstanding orders at a glance. Orders are grouped by due date so the team always knows what to work on first, and managers can override stock shortages when needed.

### Added
- KIT-01: Dashboard summary header with 4 stat cards (Min Target, Max Target, Remaining, Orders Left) sticky below the page header
- KIT-02: Min target auto-calculated from orders due today, showing ball count and order count
- KIT-03: Max target defaults to 200, configurable by manager via gear icon popover with auto-adjusting ball composition
- KIT-04: Remaining balls shown with green/amber/red color urgency (red = overdue orders, amber = behind, green = on track)
- KIT-05: Orders left to complete counter
- KIT-06: K3Mart synthetic card with purple dashed border, outlet breakdown, and inline-editable consignment quantity
- KIT-07: Due-date grouped order list with per-item checklists, OVERDUE pinned at top, EXPEDITED badge on fast-tracked orders
- KIT-08: Manager/admin can override stock shortages with a required reason (logged in production audit trail)
- Send Back button to return an order from kitchen to order desk

### Changed
- Kitchen page structure: dashboard header + order list above existing 4-panel swipeable layout
- Desktop layout: order list visible below the 4-panel grid
- ConfirmDialog now supports children content and disabled confirm button

---

## 2026-02-16 - GoBiz Sync Fixes

GoBiz (GoFood) revenue sync now properly registers outlets and populates product mappings automatically. The Sales Analytics table shows the actual outlet name (Legato Goldfinch / GoFood Crystal) instead of a blank dash.

### Fixed
- GoBiz outlets (Goldfinch, Crystal) now auto-register on every sync run (no manual seed required)
- Product mappings from GoFood transactions now saved to externalProductMappings table
- Customer/Store column in Sales Analytics now shows outlet name for GoBiz revenue records

---

## 2026-02-16 - Phase 14.1: Draft Order Fixes

Draft orders now save automatically the moment you pick a customer, so you never lose work. Clicking a draft in the Kanban board opens the full edit form (not the read-only slide-over), and the WhatsApp language toggle now correctly switches both the title and message.

### Added
- Draft auto-creation: selecting a customer in the new order form immediately persists a Draft order
- Draft editing: clicking a Draft card in Kanban opens the full edit form with all fields pre-filled
- Delete Draft button in edit mode for easy cleanup of unwanted drafts

### Changed
- Draft Kanban column sorted by creation date (newest first) instead of due date
- Draft column click opens edit form instead of read-only slide-over
- Reverted orders (AwaitingPayment -> Draft) behave identically to new Drafts

### Fixed
- WhatsApp translate toggle now switches both title AND message body content between languages
- Removed AnimatePresence fade transitions that caused blank page on navigation
- Save as Draft button now persists all order fields (items, delivery, notes) without requiring status change

---

## 2026-02-15 - Phase 14: Order QoL

### Overview
Order management redesigned from the ground up. Orders now flow through a visual Kanban board, with a dedicated creation page, simplified statuses, and a full audit trail -- making it faster to create, track, and manage orders.

### Added
- Kanban board with 6 columns (Draft, Awaiting Payment, Payment Received, Being Prepared, Awaiting Delivery, Complete)
- Dedicated order creation page (/orders/new) with customer-first layout
- Quick-tap due date pills (next 7 days with day names)
- Customer search with autocomplete
- Crystal and Goldfinch quick-add address buttons
- Order audit trail (status change timeline with who/when/reason)
- Creator attribution on all order cards
- Expedited order badges and manual expedite action
- Copy-to-new-order from cancelled orders
- Forward/backward status transition buttons with validation
- WhatsApp payment request modal on order submission

### Changed
- Order statuses simplified from 12 to 7 (Draft, AwaitingPayment, PaymentReceived, BeingPrepared, AwaitingDelivery, Complete, Cancelled)
- Order creation starts as Draft (was AwaitingPayment)
- Kitchen view uses BeingPrepared status (replaces InProduction/Boxed/Labeled)
- Sales channel and payment method fields removed from order creation
- OrderDetail page redesigned with status action buttons replacing accordion workflow

### Migration
- Existing orders migrated: Confirmed->PaymentReceived, InProduction/Boxed/Labeled->BeingPrepared, WaitingShipment/WaitingPickup->AwaitingDelivery, CompleteShipped/PickedUp->Complete

---

## 2026-02-14 - Phase 11: Infrastructure & Consolidation

### Overview
Production tracking simplified: all kitchen counts now come from a single source (the production log), replacing the old dual-write system. Dependencies audited and upgraded where safe.

### INFRA-02: Dependency Audit
- Full dependency compatibility audit completed
- All safe upgrades applied; breaking upgrades documented with rationale
- React 19 + Vite 7 + Convex 1.31 + TypeScript 5.9 compatibility verified

### INFRA-03: Production Counts Consolidation
- All production count reads now derived from `productionLog` aggregation
- `productionCounts` table archived (read-only, no longer written to)
- `productionResets` table tracks reset timestamps for aggregation filtering
- New `productionLog` action types: `ship_goldfinch`, `return_goldfinch` for GoFood depot tracking
- Weekly integrity check compares archived counts against log-derived aggregation
- Kitchen UI, K3Mart cockpit, and GoFood depot all use single source of truth

### Files Modified
- `convex/productionLog/helpers.ts` -- Shared aggregation logic
- `convex/productionLog/queries.ts` -- Aggregation queries replacing productionCounts reads
- `convex/integrityChecks/mutations.ts` -- Full weekly integrity check
- `convex/integrityChecks/queries.ts` -- Admin review query
- `src/hooks/convex/useKitchenProduction.ts` -- Switched to productionLog aggregation
- 6 mutation files updated to write only to productionLog

---

## 2026-02-13 - Phase 02-03: Security Docs & Tech Debt Cleanup

### Overview
Major cleanup release: removes 1,700+ lines of dead code, deprecated components, and unused indexes. Kitchen View V1 is gone, deprecated order statuses now display correctly, and mutation paths are cleaned up.

### Changes
- **KitchenView V1 removed** -- Deleted KitchenView.tsx and 11 orphaned components (BallCompletionButtons, FlyingBall, InventoryTray, KitchenDashboard, KitchenHelpPanel, KitchenOrderCard, OrderBox, ProductPackage, SoundToggle, kitchenSounds.ts, usePendingBallStats.ts). KitchenViewV2 is now the only kitchen page.
- **Deprecated status display** -- Added `getDisplayStatus()` helper that maps `ProductionComplete` to `Boxed` and `Packaging` to `InProduction` for UI display. Applied across OrderHeader, OrderStatusPanel, OrderDetail, and ProductionQueueTable.
- **Status color cleanup** -- Consolidated scattered `STATUS_COLORS` maps into shared `getStatusColor()` in `orderConstants.ts`. Removed duplicate maps from OrderHeader.
- **Schema index cleanup** -- Removed 12 unused indexes from `convex/schema.ts` (ingredients.by_brand, orderItems.by_product_name, orderItems.by_production_type, orderItemProduction.by_remaining, orderItemProduction.by_completion, dailySales.by_date_product, productionCountAdjustments.by_date_timestamp, productionLog.by_menu_product_timestamp, productionLog.by_action, inventoryBatches.by_status, componentTransactions.by_batch, componentTransactions.by_order).
- **Orders mutation shim removed** -- Deleted deprecated `convex/orders/mutations.ts` re-export file. All callers updated from `api.orders.mutations.X` to `api.orders.mutations.index.X`.
- **Stock shortage override** -- OrderDetail now shows a dialog when packaging stock is insufficient on order confirmation. Managers/admins can override to confirm anyway.
- **OrderStatusPanel** -- Added missing `Boxed` and `Labeled` statuses to the status dropdown.
- **Git history scrub** -- Phase 02: scrubbed env files from git history, created SECURITY.md.

### Files Modified
- `convex/schema.ts` -- 12 indexes removed
- `convex/orders/mutations.ts` -- Deleted (shim)
- `src/lib/orderConstants.ts` -- Added `getDisplayStatus()`, `getStatusColor()`, cleaned STATUS_CATEGORIES
- `src/pages/OrderDetail.tsx` -- Stock shortage override dialog, display status helpers
- `src/components/orders/OrderHeader.tsx`, `OrderStatusPanel.tsx` -- Use shared helpers
- `src/components/dashboard/ProductionQueueTable.tsx` -- Use `getDisplayStatus()`
- `src/hooks/convex/useOrders.ts`, `useKitchenStats.ts` -- Updated mutation paths
- `src/pages/KitchenViewV2.tsx`, `PackagingView.tsx` -- Updated mutation paths
- 10 deleted component/page files, 4 test files updated

---

## 2026-02-11 - Hotfix: Orders + K3Mart Cockpit Issues

### Overview
Fixes five issues: revenue sync now captures all qualifying orders (not just recently created ones), order cards show NET amounts prominently, completed/cancelled orders are visually distinct, kitchen filter no longer crashes on Boxed/Labeled statuses, K3Mart outlet selection no longer crashes on empty product IDs, and weekly planner now shows products from restock targets instead of being empty.

### Changes
- **Revenue sync** — Removed `_creationTime` filter so orders that transition to revenue-countable status after initial sync are captured. Dedup by `orderNumber` already exists downstream.
- **Order cards** — NET amount (total - discount) shown bold in terracotta; gross amount in small strikethrough when discounted. Cancelled orders display muted strikethrough.
- **Status categories** — Split `completed` (green) from `cancelled` (red) in order filter dropdown.
- **Kitchen filter** — Added `Boxed` and `Labeled` to order list query validator (was causing server error).
- **K3Mart Select crash** — Backend now returns `menuProductId` in outlet stock summary. Frontend filters out products with empty IDs from Select components.
- **Weekly planner** — Backend query now returns enriched products/outlets from `restockTargets` table. Frontend uses backend data instead of extracting from plans (which was empty for new weeks).
- **Sync button** — Added "Refresh Data" button to K3Mart Cockpit header that syncs both K3Mart sales and stock data.

### Files Modified
- `convex/orders/queries.ts` — Added Boxed/Labeled to status validator
- `convex/integrations/internal/queries.ts` — Removed sinceTimestamp filter
- `convex/integrations/internal/adapter.ts` — Removed incremental sync logic
- `convex/k3martCockpit/queries.ts` — Added menuProductId to stock summary, enriched weekly planner
- `src/lib/orderConstants.ts` — Split completed/cancelled categories
- `src/hooks/convex/useOrders.ts` — Added Boxed/Labeled/InProduction to OrderStatusType
- `src/pages/OrderManager.tsx` — NET amount display, cancelled category in dropdown
- `src/components/k3martCockpit/StockFlowForm.tsx` — Filter empty menuProductId from Select
- `src/pages/K3MartCockpit.tsx` — Use backend products/outlets, sync button, menuProductId mapping

---

## 2026-02-11 - K3 Mart Kitchen Tracker + Kitchen QoL Improvements

### Overview
Kitchen staff can now see K3 Mart outlet stock, sales, and consignment readiness directly in the Kitchen View — no more switching to the Sales Analytics page to check "do we have enough at outlets?"

Also improves kitchen workflow with non-fatal packaging warnings and cumulative ball production tracking.

### K3 Mart Kitchen Integration

**New Backend Module:** `convex/k3martKitchen/queries.ts`
- `getK3MartKitchenSummary({ date })` — Combines consignment targets, outlet stock snapshots, today's K3 Mart sales, and product mappings into a per-product summary with outlet breakdown

**New Frontend Components:**
- `K3MartStockCard` — Read-only outlet stock info card (Sticker panel): aggregate outlet stock, sold today, target, gap-to-target, collapsible per-outlet breakdown, Sync Stock button
- `K3MartPackingCard` — Consignment readiness summary (Pack panel): target/boxed/stickered per product with ready/warning icons

**New CSS Variables:** Amber K3 Mart color set (`--color-k3mart`, `-light`, `-medium`, `-accent`, `-badge`)

**Updated Panels:**
- **ProductionLogPanel** — New "Stk" column showing aggregate K3 Mart outlet stock per product
- **BoxingPanel** — "Outlets: X" metric in product card headers
- **StickeringPanel** — K3MartStockCard rendered above manual sticker cards for products with consignment targets
- **PackingPanel** — K3MartPackingCard rendered between GoFood and regular order cards

### Kitchen QoL Improvements
- **Non-fatal packaging:** Boxing and stickering now succeed even when packaging stock is short — returns a warning instead of blocking
- **Cumulative ball counters:** `totalProducedOriginal` / `totalProducedBiteSized` track total balls produced today (never decremented on boxing)
- **ActionToast types:** `actionToast()` now supports `error` and `warning` types with color-coded styling and longer duration for errors

### Files Created
- `convex/k3martKitchen/queries.ts`
- `src/components/kitchen/K3MartStockCard.tsx`, `src/components/kitchen/K3MartPackingCard.tsx`

### Files Modified
- `convex/schema.ts` (cumulative ball fields), `convex/orders/mutations/kitchen.ts` (non-fatal packaging), `convex/orders/queries.ts` (cumulative fields)
- `src/index.css`, `src/pages/KitchenViewV2.tsx`, `src/hooks/convex/useKitchenProduction.ts`
- `src/components/kitchen/ProductionLogPanel.tsx`, `src/components/kitchen/BoxingPanel.tsx`
- `src/components/kitchen/StickeringPanel.tsx`, `src/components/kitchen/PackingPanel.tsx`
- `src/components/kitchen/index.ts`, `src/lib/actionToast.ts`

---

## 2026-02-11 - GoFood Kitchen + Goldfinch Depot Integration

### Overview
Full integration for tracking GoFood depot stock at Legato Goldfinch, ship-to-depot workflows, and automatic sticker deduction on GoBiz sales. GoFood now appears as a virtual "order" in the Kitchen View alongside regular orders.

### New Tables
- **`gofoodDepotStock`** -- Per-product running stock at Goldfinch (quantity, stickerDeficit, lastUpdated). Index: `by_menuProduct`
- **`gofoodDepotShipments`** -- Audit log of every shipment from Office to Goldfinch (date, quantity, stickers, who). Indexes: `by_date`, `by_product_date`

### Modified Tables
- **`productionCounts`** -- Added `shippedToGoldfinch: v.optional(v.number())` field

### New Backend Module: `convex/gofoodDepot/`
- **Mutations:** `recordShipment` (auth-protected, FIFO sticker transfer), `processSyncSales` (internalMutation, batch sale processing), `recordSale` (internalMutation, single sale), `adjustDepotStock` (manager/admin manual correction)
- **Queries:** `getDepotStock`, `getGoFoodDailyOrder` (virtual order assembly), `getTodayShipments`, `getGoldfinchStickerInventory`, `getDepotFreshness`

### GoBiz Integration
- **Phase C** added to GoBiz sync: after saving revenue items, auto-consumes stickers from Goldfinch FIFO via `processSyncSales`
- **Auto-sync cron** added: `autoSyncGoBizRevenue` runs at WIB business hours (8, 10, 12, 14, 16, 18, 20)

### Frontend Changes
- **New CSS variables:** Jade green GoFood color set (`--color-gofood`, `-light`, `-medium`, `-accent`, `-badge`)
- **New components:** `GoFoodStickerCard` (read-only depot info for Sticker panel), `GoFoodPackingCard` (ship-to-depot for Pack panel with double-tap confirm)
- **Updated panels:** StickeringPanel (GoFood cards above manual cards, removed Undo button), PackingPanel (GoFoodPackingCard at top), BoxingPanel (removed Undo button), ProductionLogPanel (jade "GF depot: N" annotation)
- **Updated hooks:** `useKitchenProduction` now fetches GoFood depot data
- **Updated page:** `KitchenViewV2.tsx` wires all depot data, shipment mutations, and sync actions

### Tests
- 53 new backend tests across `gofoodDepot.test.ts` (35) and `gofoodDepot-edge.test.ts` (18)
- Fixed `gobizAdapter.test.ts` cron assertion (now validates GoBiz cron exists)

### Files Created
- `convex/gofoodDepot/mutations.ts`, `convex/gofoodDepot/queries.ts`
- `src/components/kitchen/GoFoodStickerCard.tsx`, `src/components/kitchen/GoFoodPackingCard.tsx`
- `tests/convex/gofoodDepot.test.ts`, `tests/convex/gofoodDepot-edge.test.ts`

### Files Modified
- `convex/schema.ts`, `convex/crons.ts`, `convex/productionCounts/queries.ts`
- `convex/integrations/gobiz/adapter.ts`
- `src/index.css`, `src/pages/KitchenViewV2.tsx`, `src/hooks/convex/useKitchenProduction.ts`
- `src/components/kitchen/StickeringPanel.tsx`, `src/components/kitchen/PackingPanel.tsx`
- `src/components/kitchen/BoxingPanel.tsx`, `src/components/kitchen/ProductionLogPanel.tsx`
- `src/components/kitchen/index.ts`
- `tests/convex/gobizAdapter.test.ts`

---

## 2026-02-10 - Inventory: Component Rename & Delete Actions

### Overview
Added Rename and Delete actions to the component type kebab menu on the Inventory page, allowing the catalog to be reshaped without requiring direct database access.

### Changes
- **New file**: `src/components/inventory/RenameComponentDialog.tsx` — Lightweight dialog with pre-filled name input
- **Modified**: `src/components/inventory/ComponentRow.tsx` — Added Rename, Delete items to kebab dropdown menu with separator; wired up `RenameComponentDialog` and `ConfirmDialog` (destructive variant)

### Behavior
- **Rename**: Opens dialog pre-filled with current name. Saves via existing `componentTypes.mutations.update`
- **Delete**: Shows destructive confirmation dialog. Backend `componentTypes.mutations.remove` blocks deletion if the component has BOM links, inventory batches, or stock records — the error message is surfaced in a toast
- **Existing**: Archive/Restore action unchanged

### Files Modified
- `src/components/inventory/ComponentRow.tsx`
- `src/components/inventory/RenameComponentDialog.tsx` (new)

---

## 2026-02-10 - Fix: Production Convex Connection Restored

### Overview
Production site (`frollie-product.vercel.app`) was not connecting to the Convex backend since the CI/CD migration on 2026-02-03. The `VITE_CONVEX_URL` environment variable was missing from `.env`, causing `ConvexReactClient` to be `null` and the app to run without a backend.

### Changes
- **PR #46** (`fix/production-convex-url`): Added `VITE_CONVEX_URL` and `VITE_CONVEX_SITE_URL` to `.env` file. Also set in Vercel dashboard env vars.
- **PR #47** (`fix/env-quoted-values`): Wrapped `VITE_*` values in double quotes for clean Vite string inlining.
- **RCA report**: Full root cause analysis at `docs/reports/RCA-2026-02-10-production-no-convex-connection.md`.

### Root Cause
Commit `bcfb0da` (CI/CD migration) replaced `VITE_API_URL` with `CONVEX_DEPLOYMENT` in `.env` but omitted the `VITE_CONVEX_URL` that Vite needs at build time. The `null` client fallback in `main.tsx` silently degraded the app instead of failing.

### Files Modified
- `.env` — Added `VITE_CONVEX_URL` and `VITE_CONVEX_SITE_URL` (quoted)
- `docs/reports/RCA-2026-02-10-production-no-convex-connection.md` — NEW: Full RCA report

---

## 2026-02-10 - Kitchen V3.3: BOM Source of Truth + Action Toast Positioning

### Overview
Eliminated `productionType`/`productionUnits` tech debt — ball composition is now derived exclusively from BOM (menuProductComponents + componentTypes). Toast notifications repositioned to appear near the clicked button for better mobile UX.

### Changes
- **BOM as sole source of truth**: `productionCounts.getAll()` no longer falls back to deprecated `menuProducts.productionType`/`productionUnits` fields. Ball type and count are derived exclusively from the BOM (menuProductComponents + componentTypes tables). Products without BOM entries default to 0 ball count.
- **Action Toast utility**: New `actionToast()` function shows lightweight floating feedback near the clicked button instead of a fixed corner. Dark pill UI, auto-positioned above/below the button, fades out after 1.2s.
- **Sonner position**: Global Sonner moved from `bottom-right` to `top-center` for better visibility as fallback.
- **Event threading**: All kitchen handler signatures updated to accept `React.MouseEvent` — threaded from button onClick through panel components to KitchenViewV2 handlers.
- **Documentation**: New decision doc (`docs/decisions/bom-source-of-truth.md`), updated CLAUDE.md pitfall #11 (never use productionType), updated CODE_STYLE.md toast pattern section.

### Files Modified
- `convex/productionCounts/queries.ts` — removed productionType fallback, BOM-only derivation
- `convex/schema.ts` — enhanced deprecation comments on menuProducts and orderItems productionType/productionUnits
- `src/lib/actionToast.ts` — NEW: position-aware inline toast utility
- `src/index.css` — action-toast-in/out CSS animations
- `src/components/ui/sonner.tsx` — position changed to top-center
- `src/pages/KitchenViewV2.tsx` — handlers accept events, use actionToast for success
- `src/components/kitchen/ProductionLogPanel.tsx` — removed unused imports (Info, FlowChevrons), updated comment, event threading
- `src/components/kitchen/BoxingPanel.tsx` — event threading on submit/undo
- `src/components/kitchen/StickeringPanel.tsx` — event threading on submit/undo
- `src/components/kitchen/PackingPanel.tsx` — event threading on toggle/mark ready
- `CLAUDE.md` — updated business rule #10, added pitfall #11
- `docs/CODE_STYLE.md` — new "Toast & Action Feedback" section
- `docs/decisions/bom-source-of-truth.md` — NEW: decision record

---

## 2026-02-10 - Kitchen V3.2: Animations, Target Logging, and Reactive Fixes

### Overview
Split-flap display animations for all kitchen counters, target change logging, ball tray delta indicators, and reactive target computation fix.

### Changes
- **Split-flap number animation**: All numeric counters use a Solari/airport board animation (`FlipNumber` component). Each digit sits on a dark panel and scrolls vertically when the value changes, with staggered timing from right to left. Applied to: ball tray counts, ball target totals, boxing "Awaiting Sticker" counts, stickering "Stickered" counts, order summary counts.
- **Flow chevrons on action buttons**: "Add", "Box", and "Sticker" buttons show animated flowing chevrons (›››) when a valid quantity is entered, suggesting material flows to the next station.
- **Target change logging**: New `productionTargetLogs` table records every target change (date, source, product, previous/new quantity, timestamp). Automatically logged in `setProductTarget` mutation.
- **Ball tray delta indicators**: Each ball tray counter shows a color-coded delta vs target:
  - Amber: "Need X more (target: Y)" when under target
  - Green: "On target (Y)" when exactly matching
  - Blue: "+X surplus (target: Y)" when over target
- **3-source target system**: Split product targets by source ("consignment" for K3 Mart, "gofood" for GoFood). Table shows Ord (auto from orders) | K3M (editable) | GoF (editable) | Tot columns with ball totals.
- **Reactive target fix**: Removed `useMemo` for ball total computation. Now computed inline on every render to guarantee Convex reactive updates propagate immediately when K3M/GoF targets are edited.
- **Animated pipeline arrows**: Hover/touch on any section triggers flowing dots on the arrow below it, showing material flow direction.
- **StickeringPanel POS filter**: Only shows food POS products sorted by POS slot (matching BoxingPanel).

### Files Modified
- `convex/schema.ts` — new `productionTargetLogs` table with by_date and by_date_timestamp indexes; `productionProductTargets` gained source field + by_date_source and by_date_source_product indexes
- `convex/productionTargets/mutations.ts` — target change logging in setProductTarget; source parameter for per-product targets
- `convex/productionTargets/queries.ts` — getProductTargets returns source; new getOrderProductDemand query
- `src/components/kitchen/FlipNumber.tsx` — NEW: FlipNumber split-flap component + FlowChevrons button animation
- `src/components/kitchen/ProductionLogPanel.tsx` — 3-source target table, inline ball computation, FlipNumber, delta display, FlowChevrons, animated arrows
- `src/components/kitchen/BoxingPanel.tsx` — FlipNumber on counts, FlowChevrons on Box button
- `src/components/kitchen/StickeringPanel.tsx` — FlipNumber on counts, FlowChevrons on Sticker button, POS filter fix
- `src/components/kitchen/index.ts` — export FlipNumber, FlowChevrons
- `src/hooks/convex/useKitchenProduction.ts` — added orderProductDemand query, updated types
- `src/pages/KitchenViewV2.tsx` — wired 3-source targets, orderProductDemand, fixed desktop panel props

---

## 2026-02-10 - Kitchen V3.1: UI Refinements + Per-Product Targets

### Overview
UX improvements to Kitchen V3 panels based on production testing. Fixed layout overflow on narrow desktop panels, added order demand visibility, improved undo flow, negative-number tooltip, and per-product manual production targets with automatic ball conversion.

### Changes
- **Per-product production targets**: Tap a product in Today's Targets to set a manual target (e.g., 20 Singles). Automatically converts to ball totals via `menuProductComponents` lookup and upserts into `productionTargets.manualOverride`. Shows ball conversion inline (e.g., "20 mid").
- **New table**: `productionProductTargets` stores per-product manual targets keyed by date + menuProductId.
- **New query**: `productionTargets.queries.getProductTargets` returns per-product targets for a date.
- **New mutation**: `productionTargets.mutations.setProductTarget` saves per-product target and recomputes ball totals from all product targets for that date.
- **Compact layout**: Reduced element sizes (h-11 inputs, h-9 undo buttons) to fit within 4-column desktop grid (~230px per panel). Input + action button on row 1, full-width undo on row 2.
- **Text input controls**: All quantity controls accept any number (including negatives for revert). Placeholder shows "Qty to add".
- **Negative number tooltip**: Info icon on each input with tooltip: "If you want to revert, you can also use negative numbers"
- **Undo simplified**: Single-tap undo button (removed double-tap confirmation). Clearly labeled "Undo last (-1)" / "Undo last (+1)".
- **Packages needed from orders**: Boxing and Stickering cards show "Need: X" from pending orders (aggregated from packingOrders per menuProductId).
- **Boxing panel filter**: Only shows food POS products (posSlot set), sorted by POS slot number. Header shows "Awaiting Sticker" count.
- **Production Log pipeline**: 4-section dashboard with flow arrows (Targets → Ball Tray → Finished Products → Orders). All sections always render.
- **Backend**: Added `posSlot` and `productType` fields to `productionCounts.getAll()` query.

### Files Modified
- `convex/schema.ts` — new `productionProductTargets` table with by_date and by_date_product indexes
- `convex/productionTargets/queries.ts` — new `getProductTargets` query
- `convex/productionTargets/mutations.ts` — new `setProductTarget` mutation with ball recomputation
- `convex/productionCounts/queries.ts` — added posSlot/productType to return
- `src/components/kitchen/ProductionLogPanel.tsx` — per-product target inputs with ball conversion, pipeline dashboard
- `src/components/kitchen/BoxingPanel.tsx` — stacked layout, text input, POS filter, order demand, undo
- `src/components/kitchen/StickeringPanel.tsx` — stacked layout, text input, order demand, undo
- `src/pages/KitchenViewV2.tsx` — wired setProductTarget mutation, compute neededFromOrders, pass new props
- `src/hooks/convex/useKitchenProduction.ts` — added productTargets query, today date, updated types

---

## 2026-02-10 - Kitchen Production Page: Complete Redesign (V3)

### Overview
Complete rewrite of the kitchen production workflow from a kanban-style per-order view to a batch-oriented 4-panel swipeable interface optimized for mobile use in production environments.

### New Features
- **4 swipeable panels** with station pill bar navigation (Production Log, To Box, To Sticker, To Pack)
- **Batch production model**: Boxing and stickering are product-aggregated (not per-order)
- **Production targets**: Auto-calculated from confirmed orders, with manager overrides
- **Production counts**: Running tallies per menu product (boxed, stickered, packed)
- **Production audit log**: Every action tracked (box/unbox/sticker/unsticker/pack/unpack)
- **Batch FIFO consumption**: Boxing deducts packaging at `consumptionStage="boxing"`, stickering at `"labeling"`, ORDER READY at `"none"`
- **Undo support**: Negative quantities reverse boxing/stickering/packing operations
- **Wake lock**: Prevents phone sleep during kitchen use
- **Brand-derived station colors**: Sage green, peach amber, chocolate brown, terracotta

### Bug Fixes
- **Ball type normalization**: Fixed reversed mapping. "Original" is now correctly 45g (MID_BALL), "Jumbo" (formerly "Bite-Sized") is 80g (BIG_BALL)
- **Per-product consumptionStage override**: `consumeMaterialsByStageInternal()` now resolves `menuProductComponents.consumptionStage ?? componentTypes.consumptionStage`

### Schema Changes
- **New table: `productionTargets`** — Daily production goals per production unit type
- **New table: `productionCounts`** — Running production tallies per menu product (boxed, stickered, packed) with manager reset
- **New table: `productionLog`** — Audit trail for all production actions

### New Backend Functions
- **Queries**: `productionCounts.getAll`, `productionTargets.getByDate`, `productionTargets.getProductionSummary`, `orders.kitchenQueries.getKitchenPackingOrders`, `productionLog.getRecent`, `productionLog.getByMenuProduct`, `productionLog.getDailySummary`
- **Mutations**: `boxProducts`, `stickerProducts`, `togglePackOrderLineItem`, `markOrderReady`, `productionTargets.upsert`, `productionTargets.autoCalculate`, `productionCounts.resetCounts`
- **Helper**: `consumeBatchMaterials()` — Batch FIFO consumption not tied to orders

### New Frontend Components
- `SwipeableKitchenLayout.tsx` — Framer Motion horizontal swipe with station pills
- `ProductionLogPanel.tsx` — Ball counters, target gauges, order summary
- `BoxingPanel.tsx` — Per-product boxing with increment buttons
- `StickeringPanel.tsx` — Per-product stickering with available counts
- `PackingPanel.tsx` — Per-order packing checklist with ORDER READY
- `useKitchenProduction.ts` — Combined hook for all kitchen data

### Files Modified
- `convex/schema.ts` — 3 new tables
- `convex/orders/mutations/kitchen.ts` — 4 new mutations + jumbo alias
- `convex/orders/mutations/inventoryIntegration.ts` — `consumeBatchMaterials()` + bug fix
- `convex/orders/helpers/ballDistribution.ts` — Normalization fix
- `convex/orders/queries.ts` — Ball type mapping fix
- `src/pages/KitchenViewV2.tsx` — Complete rewrite
- `src/App.tsx` — Route cleanup (`/kitchen-legacy` now redirects)
- `src/index.css` — Kitchen station CSS variables
- `src/lib/ballTypes.ts` — New shared ball type config
- 6 frontend components updated for ball type labels

---

## 2026-02-10 - Fix: Replace K3 Mart Stock Sync with Product Detail API

### Performance Improvement
- **Before:** Stock sync made 7 API calls (one per outlet, 300ms rate limiting, ~3s). Discovery scanned 200 outlets (~60s).
- **After:** Both use `/vendor-stock/detail/{productId}` which returns ALL outlets per product. With 1 product ID = 1 API call total (<1s).

### Changes
- **`config.ts`:** Added `productDetail` endpoint, `products.ids` array (47068 Jumbo, 47069 Original), `K3MartProductDetailEntry`/`K3MartProductDetailResponse` types, `K3MART_OUTLET_NAME_TO_ID` reverse map. Removed `dashboard` endpoint, `pagination`, `rateLimit`, `discovery` blocks, `K3MartProduct`/`K3MartDashboardResponse` types.
- **`helpers.ts`:** Added `resolveOutletExternalId()` and `transformProductDetailEntry()` pure functions.
- **`adapter.ts`:** Rewrote `syncK3MartStock` and `discoverK3MartOutlets` to use product detail API. Removed dead code: `sleep`, `getProductName`, `getProductCode`, `getProductCapital`, `transformProduct`.
- **`platformCredentials/actions.ts`:** Updated token validation test call to use product detail endpoint.
- **`useExternalData.ts`:** Updated hook comments to reflect new performance.
- **DB migration:** Linked K3 Mart product mappings to menu products: F03131-P00001 (Dubai Chewy Cookie Big) -> Jumbo Size (80g), F03131-P00002 (Dubai Chewy Cookie) -> Original - Single (45g).

### Files Modified
- `convex/integrations/k3mart/config.ts`
- `convex/integrations/k3mart/helpers.ts`
- `convex/integrations/k3mart/adapter.ts`
- `convex/platformCredentials/actions.ts`
- `src/hooks/convex/useExternalData.ts`

---

## 2026-02-09 - Fix: Navigation Restructure, Order Sorting & Role-Based Landing Pages

### Navigation Restructure
- Reorganized nav into three tiers:
  - **Main nav**: Sales, Orders, Kitchen, Inventory, Restock (permission-based visibility)
  - **Config dropdown** (Manager + Admin): Production, WhatsApp
  - **Admin dropdown** (Admin only): Products, Vouchers, Users
- Dashboard page hidden from nav (temporarily disabled)
- Mobile sidebar uses section headers for the same grouping

### Role-Based Landing Pages
- Kitchen staff → `/kitchen`
- Order staff → `/orders`
- Manager / Admin → `/sales`

### Order List Sorting
- Orders now sort by `orderDate` ascending (earliest transaction first) instead of newest-first by creation time

### Files Modified
- `src/components/layout/Header.tsx` — Full nav restructure with DropdownMenu components
- `src/App.tsx` — Role-based redirect component, removed Dashboard import
- `convex/orders/queries.ts` — Added orderDate ascending sort to list query

---

## 2026-02-09 - Feat: Restock Planner (Stock Dashboard + Dispatch Planning)

### New Feature: Restock Planner (`/restock`)
Full stock dashboard and dispatch planning page for managing inventory across all sales channels.

**Three channels supported:**
- **K3 Mart** (7 retail outlets) — Real API stock data from `consapi.k3mart.id`, auto-synced
- **GoBiz** (GoFood) — Manual stock entry, sales synced from GoBiz API
- **Internal** (Direct orders) — Manual stock entry, sales synced from own orders

**Key capabilities:**
- Flat, scrollable layout: Channel → Store → Products (no click-to-expand)
- Per-product view: current stock, avg daily sales, weekday/weekend split, trend indicator
- Editable "Prep Tomorrow" restock targets (weekday vs weekend aware) with save/reset
- K3 Mart stock status badges: critical (< 1 day), warning (< 2 days), ok (>= 2 days)
- Manual stock entry for GoBiz/Internal channels (click to edit inline)
- Summary strip: total outlets, low stock alerts, total daily demand
- Sync All button triggers K3 Mart stock + sales, GoBiz, and Internal syncs

### Backend: New Tables
- `restockTargets` — Persisted user-edited restock quantities per channel/outlet/product
- `manualStockEntries` — Manual stock entries for GoBiz/Internal channels

### Backend: New Queries & Mutations
- `getRestockOverview` — Aggregates stock + 14-day demand across all channels
- `getChannelSellThrough` — 30-day sell-through with weekday/weekend split, suggestions, trends
- `saveRestockTarget` — Upsert restock target (Manager/Admin)
- `updateManualStock` — Upsert manual stock entry (Manager/Admin)
- `syncK3MartStock` — Fast stock refresh for active K3 Mart outlets only

### Bug Fixes
- **K3 Mart API flat dotted keys**: API returns `"product.product_name"` as flat keys instead of nested `product.product_name`. Added defensive helpers (`getProductName`, `getProductCode`, `getProductCapital`) that handle both formats.
- **Cross-outlet stock contamination**: Batch queries for stock snapshots now filter by outletId (previously returned products from ALL outlets sharing a batchId)
- **Stock-only products missing**: Products with stock but no recent sales now appear in the detail view
- **Silent sync failures**: `Promise.allSettled` now reports individual sync failures via toast

### Files Modified
- `convex/schema.ts` — Added `restockTargets` + `manualStockEntries` tables
- `convex/externalData/queries.ts` — Added `getRestockOverview`, `getChannelSellThrough` + batch query fixes
- `convex/restock/queries.ts` — New: `getRestockTargets`
- `convex/restock/mutations.ts` — New: `saveRestockTarget`, `updateManualStock`
- `convex/integrations/k3mart/adapter.ts` — New: `syncK3MartStock` action + flat-dotted key parsing
- `src/pages/RestockPlanner.tsx` — New page with flat layout design
- `src/components/restock/` — `SummaryCards.tsx`, `StockStatusBadge.tsx`
- `src/hooks/convex/useExternalData.ts` — Added restock hooks
- `src/hooks/convex/index.ts` — Added exports
- `src/App.tsx` — Added `/restock` route
- `src/components/layout/Header.tsx` — Added "Restock" nav item
- `docs/API_REFERENCE.md` — K3 Mart API format + restock queries/mutations
- `docs/SCHEMA.md` — `restockTargets` + `manualStockEntries` tables

---

## 2026-02-09 - Fix: Order QoL Improvements (5 Fixes)

### Subtotal Display (Fix 1)
- "Subtotal" and "Discount" rows only appear when a manual discount exists
- Voucher-only orders no longer show a redundant subtotal line

### WA Templates & Payment in Completed Steps (Fix 2)
- WhatsApp templates (payment request, shipping, pickup ready) now remain visible when revisiting completed accordion steps
- Payment step accordion can be expanded after moving past it (to view/change payment method)
- Action buttons (mark as shipped, confirm payment, etc.) still only show for the current status

### Edit Order Items (Fix 3)
- "Edit Order Items" button on order detail for Draft/AwaitingPayment orders
- Navigates to the order form pre-filled with existing items, customer, delivery info, and voucher
- Title shows "Editing - Order for {customer} {order_number}" for clarity
- Customer pre-fills as existing customer (not new), preserving the link
- "Save Order" replaces all items atomically via new `replaceItems` backend mutation
- After saving, navigates back to order detail

### Channel Buttons (Fix 4)
- Removed custom channel input from the dropdown
- Only predefined channels are available for selection

### Navigate After Create (Fix 5)
- Creating a new order now navigates directly to the order detail page

### Files Modified
- `src/components/orders/OrderItems.tsx` — subtotal condition
- `src/components/orders/ChannelButtons.tsx` — removed custom input
- `src/components/orders/OrderFormPOS.tsx` — edit mode support
- `src/pages/OrderDetail.tsx` — WA templates + edit button
- `src/pages/OrderManager.tsx` — navigate after create + edit param
- `src/hooks/convex/useOrders.ts` — `useConvexReplaceOrderItems` hook
- `convex/orders/mutations/itemCrud.ts` — `replaceItems` mutation

---

## 2026-02-09 - Feature: Sales Analytics Quick Filters & Channel Breakdown

### Period Presets & Growth Indicators
- **Period filter bar** with 5 presets: Today, Yesterday, Last 7 Days, Last 30 Days, This Month
- Period stored in URL `?period=` param (default Last 7 Days omits param for clean URLs)
- **Growth indicators** on all summary cards comparing current vs previous period (green/red arrows with %)
- **Inverted colors** for Commissions Paid and Discounts Given (lower = green = good)
- **AOV card** added (Average Order Value = gross / transactions)

### Channel Breakdown (Driver Tree)
- New second row showing per-channel metrics: All Channels, K3 Mart, GoBiz, Local/Direct
- Each channel shows Gross Sales, Net Sales (with % of gross), Transactions, AOV in a vertical driver tree
- Growth indicators per metric per channel
- Active outlet count next to channel name (derived from actual sales in period, not static flags)
- Share-of-gross percentage on each non-All channel

### Revenue Fixes
- **Internal orders gross/net bug**: Fixed adapter storing `finalTotal` as gross and `totalMargin` as net. Now correctly stores `totalAmount` as gross and `finalTotal` as net
- **WIB timezone filtering**: "Today" filter now correctly uses WIB midnight boundaries, not UTC
- **Commission/Discount denominators**: Commissions use platform-only gross, discounts use internal-only gross
- **Data migration**: `fixInternalRevenueValues` corrected existing records (5 dev, 9 production)
- **Safety net**: `getRevenue` query overrides internal order gross/net from real order data

### Sales Details Table Enhancements
- **Time column** (HH:MM WIB) added next to Date column
- **Expandable internal orders**: Click to see customer, items, discounts, vouchers, and "View Full Order" link
- **K3 Mart store grouping**: Collapsible groups by outlet when K3 Mart filter active
- **Platform color scheme**: K3 Mart = purple, GoBiz = red, Local = blue (consistent across badges, filters, channel summary)
- Platform filter badges use colored outlines with filled state when active

### Backend
- **New query**: `getDashboardSummaryByPeriod(preset)` - aggregates revenue with current/previous period comparison, per-channel breakdowns, platform vs internal gross split
- **New query**: `getOrderDetailsByOrderNumber(orderNumber)` - returns order header + items for expanded internal rows
- **New pure function**: `calculatePeriodRange(preset)` in `convex/lib/periodRange.ts` with WIB timezone support
- **Active outlets** now derived from distinct outlet IDs with sales in the selected period (not static `isActive` flag)

### Modified Files
- `convex/lib/periodRange.ts` (NEW) - Period range calculation with WIB timezone
- `convex/lib/__tests__/periodRange.test.ts` (NEW) - Unit tests for all 5 presets
- `convex/externalData/queries.ts` - 2 new queries + per-channel aggregation + period-aware active outlets
- `convex/externalData/mutations.ts` - `fixInternalRevenueValues` migration
- `convex/integrations/internal/adapter.ts` - Fixed gross/net field mapping
- `src/hooks/convex/useExternalData.ts` - 3 new hooks + PeriodPreset type
- `src/hooks/convex/index.ts` - New exports
- `src/components/salesAnalytics/OverviewTab.tsx` - Complete enhancement (~+900 lines)

---

## 2026-02-09 - Fix: Kitchen V2 Bug Fixes + Route Swap

### Bug Fixes (6 total, 2 critical)
- **CRITICAL: Columns 2 & 3 always empty** — `getKitchenOrders` now fetches Boxed and Labeled statuses, populating the Stickering and Ready to Ship columns
- **CRITICAL: No "Mark Boxed" button** — BoxingOrderCard now shows a "Mark as Boxed" button when all packages are filled and order is in Packaging status
- **Bite-sized ball stats always 0** — Replaced inline calculation with `usePendingBallStats` hook that supports both original and bite-sized production types
- **BatchConfirmDialog mock data** — Now shows real packaging inventory from `getPackagingStockSummary` instead of hardcoded values
- **DailySummaryWidget all zeros** — Connected to `getKitchenStats` query for real balls produced and orders completed counts
- **"Mark Shipped" skipped intermediate status** — Now correctly transitions to WaitingShipment (delivery) or WaitingPickup (pickup) instead of jumping to CompleteShipped

### Improvements
- Batch sticker operation now reports partial failures (e.g., "3 of 5 orders labeled. Failed: #0209-003")
- `usePendingBallStats` hook updated to accept both snake_case (V1) and camelCase (V2) field names
- Sort priorities updated: Active → Boxed/Labeled → Draft → Waiting

### Route Swap
- `/kitchen` now serves KitchenViewV2 (primary)
- `/kitchen-legacy` serves KitchenView V1 (rollback safety)

### Modified Files
- `convex/orders/queries.ts` — Added Boxed/Labeled to fetched statuses + updated sort priorities
- `src/components/kitchen/BoxingOrderCard.tsx` — Added onMarkBoxed + orderStatus props
- `src/hooks/convex/usePendingBallStats.ts` — Dual field name support (snake_case + camelCase)
- `src/pages/KitchenViewV2.tsx` — All 6 bug fixes + batch error recovery
- `src/App.tsx` — Route swap (V2 → /kitchen, V1 → /kitchen-legacy)

---

## 2026-02-09 - Feature: Customer/Store Column + GoBiz API Validation

### Revenue Table: Customer/Store Column
- **New column** "Customer/Store" added after "Platform" in the Revenue Details table
- **K3Mart**: shows outlet location name (e.g., "JKT-SCBD", "JKT-BINTARO")
- **Internal**: shows customer name from the linked order
- **GoBiz**: shows dash (no store concept)
- Backend `getRevenue` query enriches records with `customerStoreName` via outlet + order lookups

### GoBiz Adapter: Real API Validation
- Rewrote `helpers.ts` (11 pure functions) to match real GoBiz API format validated against live responses
- Journal API uses `clauses/op/field/value` query format (not Elasticsearch DSL)
- Journal amounts are centesimal IDR (÷100), Order API amounts are raw IDR
- Updated all 35 helper tests to match real API response structures

### Legacy Data Cleanup
- **New migration:** `convex/migrations/gobizCleanupLegacySummaries.ts` - removes old daily aggregate GoBiz rows (those lacking `externalTransactionId` and `gobizOrderNumber`)
- Includes `preview` (dry run) and `cleanup` (delete) functions
- Successfully cleaned 21 legacy rows, preserved 24 journal rows and 48 K3Mart rows

### Modified Files
- `convex/externalData/queries.ts` - `getRevenue` enriched with customerStoreName
- `convex/integrations/gobiz/helpers.ts` - rewritten to match real API format
- `convex/integrations/gobiz/adapter.ts` - rewritten to match real API format
- `convex/integrations/gobiz/__tests__/helpers.test.ts` - 35 tests updated
- `convex/migrations/gobizCleanupLegacySummaries.ts` (NEW)
- `src/components/salesAnalytics/OverviewTab.tsx` - Customer/Store column

---

## 2026-02-09 - Feature: GoBiz Journal-Level Integration (5-Metric Revenue + Item Details)

**GoBiz adapter previously only fetched daily aggregate net/gross via two Elasticsearch proxies. No per-transaction data, no commission/ad/promo tracking, no refresh token support.**

### Changes

**Phase 1 - Backend Foundation:**
- **New table:** `externalRevenueItems` - stores per-order item details (product name, qty, unit price, total, linked menu product, match confidence)
- **New fields:** `externalRevenue` gains `adBurn`, `promoBurn`, `gobizOrderNumber` (all optional)
- **New field:** `platformCredentials` gains `refreshToken` (optional)
- **New index:** `menuProducts.by_default_price` for auto-matching
- **New mutations:** `saveRevenueItems` (batch insert with dedup), `autoMatchMenuProduct` (3-tier: exact/price_only/name_only/none)
- **New query:** `getRevenueItems` (enriches items with menu product names)
- **Updated query:** `getDashboardSummary` now aggregates commission, ad burn, promo burn
- **Updated mutations:** `saveDirectToken` accepts `refreshToken`, `getCredentialStatus` returns `hasRefreshToken`

**Phase 2 - Adapter Rewrite:**
- **New file:** `convex/integrations/gobiz/helpers.ts` - 7 pure functions (WIB date conversion, dashboard headers, journal/order body builders, dedup keys, metric extraction)
- **Rewritten:** `convex/integrations/gobiz/config.ts` - 3-API config (dashboard, journal, order) + token refresh endpoints
- **Rewritten:** `convex/integrations/gobiz/adapter.ts` - Dashboard-based 5-metric sync per WIB day, 3-method token refresh cascade (cookie, rotate, API)
- **Removed:** GoBiz cron from `convex/crons.ts` (K3Mart token refresh cron kept)
- **Updated:** GoBiz registry entry with 5-metric description and manual sync instructions

**Phase 3 - Frontend Integration:**
- **Updated:** GoBiz token dialog - now accepts both access token and refresh token
- **New:** Commission stats card in Overview (visible when commission > 0, shows ad/promo burn sub-metrics)
- **New:** Expandable revenue rows - click chevron to see item details with match status badges
- **New:** Match status badges (Matched/Price Match/Name Match/Unmatched)
- **Updated:** Settings tab - GoBiz sync button says "Sync Journals", shows refresh token status badge
- **New hook:** `useConvexRevenueItems` with skip pattern for conditional fetching

### Test Coverage
- 14 new Phase 1 tests (saveRevenueItems, autoMatchMenuProduct, getRevenueItems, getDashboardSummary)
- 17 new Phase 2 helper unit tests (all 7 pure functions)
- 5 new Phase 2 adapter integration tests
- All 334 existing tests pass (no regressions)

### Modified Files
- `convex/schema.ts` - new table + field additions
- `convex/externalData/mutations.ts` - saveRevenueItems, autoMatchMenuProduct
- `convex/externalData/queries.ts` - getRevenueItems, updated getDashboardSummary
- `convex/platformCredentials/mutations.ts` - refreshToken support
- `convex/platformCredentials/queries.ts` - hasRefreshToken
- `convex/integrations/gobiz/helpers.ts` (NEW)
- `convex/integrations/gobiz/config.ts` (REWRITTEN)
- `convex/integrations/gobiz/adapter.ts` (REWRITTEN)
- `convex/crons.ts` - GoBiz cron removed
- `convex/integrations/registry.ts` - updated GoBiz metadata
- `src/components/salesAnalytics/GoBizTokenDialog.tsx` - refresh token field
- `src/components/salesAnalytics/OverviewTab.tsx` - commission card + expandable rows
- `src/components/salesAnalytics/SettingsTab.tsx` - sync label + refresh token badge
- `src/components/salesAnalytics/ConnectionGuide.tsx` - syncLabel + hasRefreshToken props
- `src/hooks/convex/useExternalData.ts` - useConvexRevenueItems hook
- `src/hooks/convex/index.ts` - barrel export

---

## 2026-02-08 - Feature: K3Mart Outlet Name Resolution + Sales Location Linking

**K3Mart outlets previously saved as "K3 Mart #44" (placeholders). Sales transactions had no outlet link, making location-based analysis impossible.**

### Changes
- **Outlet name mapping**: 7 known K3Mart outlets mapped to real location names (JKT-SCBD, JKT-GADING SERPONG, etc.) via `K3MART_OUTLET_NAMES` config constant.
- **Discover uses real names**: `discoverK3MartOutlets` now saves outlets with actual location names instead of `"K3 Mart #N"` placeholders.
- **Sales linked to outlets**: `syncK3MartSales` now attaches `outletId` to each revenue record by looking up outlet name in DB, enabling per-location sales analysis.
- **Migration mutations**: `seedK3MartOutletNames` (updates existing outlet placeholders to real names) and `backfillRevenueOutletIds` (patches existing revenue records with outlet links). Run from Convex dashboard in that order.
- **New internal query**: `getOutletNameToIdMap` returns outlet name -> doc ID mapping for a platform source.

### Modified Files
- `convex/integrations/k3mart/config.ts` - added `K3MART_OUTLET_NAMES` map
- `convex/integrations/k3mart/helpers.ts` - added `resolveOutletName()` pure function
- `convex/integrations/k3mart/adapter.ts` - wired real names into discover + outlet linking into sync
- `convex/externalData/queries.ts` - added `getOutletNameToIdMap` internal query
- `convex/externalData/mutations.ts` - added `seedK3MartOutletNames` + `backfillRevenueOutletIds` migrations
- `convex/integrations/k3mart/__tests__/helpers.test.ts` - added `resolveOutletName` tests

### Post-Deploy Steps
1. Run `externalData:seedK3MartOutletNames` from Convex dashboard Functions tab
2. Run `externalData:backfillRevenueOutletIds` from Convex dashboard Functions tab

---

## 2026-02-08 - Feature: GoBiz Token UI + K3Mart Auto-Credentials

**GoBiz tokens required manual env var updates in Convex Dashboard. K3Mart required a Configure step before syncing.**

### Changes
- **GoBiz token dialog**: Admin can paste Bearer token from browser DevTools into a UI dialog in Settings. Token stored in DB, adapter reads from DB first (falls back to env var).
- **GoBiz auto-sync cron**: Revenue syncs every 3 hours while token is valid. On 401, marks token as expired in DB so UI shows status.
- **K3Mart auto-seed**: Default credentials (`malostudio.id@gmail.com`) auto-seed on first sync attempt. No manual Configure step needed.
- **Schema**: `platformCredentials.email` and `password` now optional (supports token-only platforms).
- **New mutations**: `saveDirectToken` (paste token), `seedDefaultCredentials` (internal auto-seed).

### Modified Files
- `convex/schema.ts` - optional email/password on platformCredentials
- `convex/platformCredentials/mutations.ts` - saveDirectToken, seedDefaultCredentials
- `convex/platformCredentials/queries.ts` - hasToken field
- `convex/platformCredentials/actions.ts` - K3Mart auto-seed defaults
- `convex/integrations/gobiz/adapter.ts` - DB-first token, shared logic, cron action
- `convex/integrations/registry.ts` - updated reconnect steps
- `convex/crons.ts` - GoBiz 3h revenue sync cron
- `src/components/salesAnalytics/GoBizTokenDialog.tsx` (new)
- `src/components/salesAnalytics/SettingsTab.tsx` - GoBiz Configure button + credential status

---

## 2026-02-08 - Fix: Revenue Details sort newest-first + date filter

**Revenue Details table showed rows in insertion order (oldest first) and had no way to filter by date range.**

### Changes
- Backend: Added `.order("desc")` to all three query branches in `getRevenue` so results return newest-first
- Frontend: Added From/To date inputs with a Clear button for client-side date range filtering
- Extracted `RevenueTable` component for cleaner separation of filtering logic
- Empty date-filter state shows a friendly "No records match" message

### Modified Files
- `convex/externalData/queries.ts` - `.order("desc")` on all `getRevenue` branches
- `src/components/salesAnalytics/OverviewTab.tsx` - Date filter UI + `RevenueTable` component

---

## 2026-02-08 - Fix: "Go to Settings & Sync" button not switching tabs

**The button in the Sales Analytics empty state navigated to `/sales?tab=settings` but the Tabs component ignored the URL parameter, always showing the Overview tab.**

### Fix
- Made Tabs controlled via `useSearchParams` so `?tab=settings` switches to the Settings tab
- Tab changes now sync back to the URL for bookmarkability

### Modified Files
- `src/pages/SalesAnalytics.tsx` - Controlled Tabs with URL param support

---

## 2026-02-08 - Fix: K3Mart Token Refresh Wrong Login Endpoint

**Clicking "Save & Refresh Now" in K3Mart credentials dialog failed with `Unexpected token '<', "<!DOCTYPE "... is not valid JSON`.**

### Root Cause
Login URL pointed at the Next.js frontend SPA (`umkm.k3mart.id/api/auth/login`) which returns HTML for all routes. The actual backend login endpoint is `consapi.k3mart.id/api/v1/vendor/login`.

### Fix
- Changed login URL to use `K3MART_CONFIG.baseUrl + endpoints.login` (correct `consapi` backend)
- Added `login` endpoint to K3Mart config for consistency with other endpoints
- Added Content-Type validation before JSON parsing to prevent raw parse errors
- Added try-catch around `.json()` with user-friendly error messages

### Modified Files
- `convex/integrations/k3mart/config.ts` - Added `login: "/vendor/login"` endpoint
- `convex/platformCredentials/actions.ts` - Fixed login URL, added JSON response guards

---

## 2026-02-08 - Fix: Guard K3Mart Credential Queries for Admin-Only Access

**The `getCredentialStatus` query requires admin role, but the Sales Analytics page is accessible to managers too. Managers opening the Settings tab triggered an auth error crash.**

### Bug Fix
- Skip credential status query for non-admin users (pass `undefined` token to trigger Convex `"skip"`)
- Hide credential UI (Configure button, auto-refresh badge, token expiry) for non-admin users
- Guard `K3MartCredentialsDialog` render behind `isAdmin` check

### Modified Files
- `src/components/salesAnalytics/SettingsTab.tsx` - Added `isAdmin` guard for credential queries and UI

---

## 2026-02-08 - Feat: K3Mart Token Auto-Refresh System

**K3Mart JWT tokens expire in ~24 hours (not ~1 year as documented). Added a self-contained auto-refresh system: admin enters K3Mart login credentials once via Settings UI, and a 12-hour cron job automatically refreshes the token.**

### New Features
- **Credentials UI**: Admin-only dialog in Settings > K3 Mart > Configure for entering K3Mart login email/password
- **Auto Token Refresh**: Convex action performs HTTP login to K3Mart, captures JWT, decodes expiry, validates via test API call, stores in DB
- **12-Hour Cron Job**: `convex/crons.ts` runs `refreshK3MartTokenCron` every 12 hours to keep token fresh
- **DB Token Fallback**: K3Mart adapter reads token from `platformCredentials` table first, falls back to `K3MART_API_TOKEN` env var
- **Token Status Display**: ConnectionGuide shows auto-refresh badge (Active/Not configured), token expiry date, and Configure button
- **Playwright Fallback**: Browser-based token capture script for cases where HTTP login doesn't work
- **GitHub Actions Cron**: Daily workflow at 03:00 WIB for Playwright-based token refresh as backup

### Schema Changes
- New table: `platformCredentials` (stores platform login credentials, current token, expiry, refresh status)
  - Fields: `platformId`, `email`, `password`, `currentToken`, `tokenExpiresAt`, `lastRefreshAt`, `lastRefreshStatus`, `lastRefreshError`, `updatedBy`, `updatedAt`
  - Index: `by_platform`

### New Backend Files
- `convex/platformCredentials/queries.ts` - `getCredentialStatus` (admin), `getTokenInternal`, `getCredentialsInternal`, `validateAdminToken`
- `convex/platformCredentials/mutations.ts` - `saveCredentials` (admin upsert), `updateToken` (internal)
- `convex/platformCredentials/actions.ts` - `refreshK3MartToken` (public, admin), `refreshK3MartTokenCron` (internal)
- `convex/crons.ts` - 12-hour interval cron for token refresh

### New Frontend Files
- `src/components/salesAnalytics/K3MartCredentialsDialog.tsx` - Email/password form with "Save & Refresh Now"

### Modified Files
- `convex/schema.ts` - Added `platformCredentials` table
- `convex/integrations/k3mart/adapter.ts` - DB token lookup with env var fallback in both `discoverK3MartOutlets` and `syncK3MartSales`
- `convex/integrations/registry.ts` - Updated `tokenLifespan` to `"~24h (auto-refreshed every 12h)"`, simplified reconnect steps
- `src/components/salesAnalytics/ConnectionGuide.tsx` - Added Configure button, auto-refresh badge, token expiry display
- `src/components/salesAnalytics/SettingsTab.tsx` - Wired credential status query and dialog
- `src/hooks/convex/useExternalData.ts` - Added `useConvexCredentialStatus`, `useConvexRefreshK3MartToken`
- `src/hooks/convex/index.ts` - Barrel exports for new hooks
- `package.json` - Added `refresh-k3mart-token` script
- `.gitignore` - Added `scripts/debug-screenshots/`

### New CI/Scripts
- `scripts/refresh-k3mart-token.ts` - Playwright browser-based token capture fallback
- `.github/workflows/refresh-k3mart-token.yml` - Daily cron + manual dispatch workflow

### Security Notes
- Credentials protected by `requireRole(ctx, token, ["admin"])`
- Password never returned in any query response
- Token validated before storage via test API call
- Playwright script pipes token via stdin (not in process args)

---

## 2026-02-08 - Feat: Internal Orders Integration + E2E Visual Tests + UX Improvements

**Added third sales platform "Internal Orders" that pulls revenue from our own Convex orders database, plus comprehensive E2E visual tests and UX polish across the Sales Analytics module.**

### New Features
- **Internal Orders Integration**: Third sales platform that queries the Convex `orders` table directly. Syncs revenue from confirmed/shipped/picked-up orders with `confidence: "exact"` and `dataOrigin: "db_query"`. No external API calls or tokens required
- **Incremental Sync**: Only fetches orders created since the last successful sync, using `getLatestSyncTimestamp` internal query. Deduplicates by `orderNumber` via `by_source_txn` index
- **Error Boundary on SalesWidget**: Dashboard widget now catches render errors gracefully instead of crashing the entire dashboard
- **3-Column Revenue Grid**: Overview tab revenue cards now display in a responsive 3-column grid (K3Mart, GoBiz, Internal Orders)
- **Internal Orders Settings Card**: New platform connection card in Settings tab with sync button and status display
- **Actionable Empty States**: Empty state cards now include primary-variant "Sync Now" buttons to encourage first sync
- **Amber "Not Synced" Status**: Platforms that have never been synced show amber status instead of neutral gray
- **44px Touch Targets**: All sync buttons meet 44px minimum touch target for mobile usability

### Schema Changes
- `externalOutlets.source`: Added `"internal"` to union (`"k3mart" | "gobiz" | "internal"`)
- `externalRevenue.source`: Added `"internal"` to union
- `externalRevenue.dataOrigin`: Added `"db_query"` to union (for database-queried revenue)
- `externalSyncLogs.source`: Added `"internal"` to union
- `externalProductMappings.source`: Added `"internal"` to union
- `externalRevenue`: Added `externalTransactionId`, `transactionDate`, `transactionType`, `commission` fields
- `externalRevenue`: Added `by_source_txn` index for deduplication

### New Backend Files
- `convex/integrations/internal/adapter.ts` - `syncInternalOrders` action (batch-processes orders into revenue records)
- `convex/integrations/internal/config.ts` - Revenue-countable statuses and batch size config
- `convex/integrations/internal/queries.ts` - `getRevenueOrders` internalQuery (filters orders by status and timestamp)

### New Frontend Changes
- `src/components/dashboard/SalesWidget.tsx` - Added error boundary wrapper
- `src/components/salesAnalytics/ConnectionGuide.tsx` - Updated for 3-platform support
- `src/components/salesAnalytics/SettingsTab.tsx` - Added Internal Orders card, amber status, 44px touch targets

### New Test Files
- `tests/e2e/` - 19 Playwright E2E tests for cofounder persona visual testing

### Modified Files
- `convex/schema.ts` - Updated 4 external integration tables with `"internal"` source
- `convex/externalData/mutations.ts` - Updated source validators to include `"internal"`
- `convex/externalData/queries.ts` - Updated source validators to include `"internal"`
- `convex/integrations/registry.ts` - Registered Internal Orders platform metadata
- `src/hooks/convex/index.ts` - Updated barrel exports
- `src/hooks/convex/useExternalData.ts` - Added `useSyncInternalOrders` hook

---

## 2026-02-07 - Feat: Multi-Platform Sales Integration (K3Mart + GoBiz)

**Added external platform integration for stock tracking and revenue analytics across K3 Mart and GoBiz (GoFood).**

### New Features
- **K3Mart Stock Sync**: Fetches real-time stock snapshots from K3 Mart consignment outlets, calculates stock deltas to infer sales with `confidence: "inferred"`
- **GoBiz Revenue Sync**: Queries GoBiz/GoFood analytics for gross (proxy/44) and net (proxy/4) revenue with `confidence: "exact"` and transaction counts
- **Sales Analytics Page** (`/sales`): 2-tab page with Overview (stats cards + revenue data table with confidence badges) and Settings (platform connections, outlet management, sync history)
- **Dashboard Sales Widget**: Compact card showing per-platform sync status, last sync time, and "Sync Now" buttons. Permission-gated to `canAccessSalesAnalytics`
- **ConnectionGuide Component**: Step-by-step API token reconnection instructions per platform. Auto-expands accordion when token errors are detected. Numbered steps with clickable URLs
- **Modular Adapter Pattern**: Static registry (`convex/integrations/registry.ts`) with platform metadata. Adding a new platform = add to registry, add schema literal, create adapter files

### Schema Changes (5 new tables)
- `externalOutlets` - Platform outlet/store definitions with sync status
- `externalStockSnapshots` - Raw stock data snapshots per outlet per product
- `externalRevenue` - Unified revenue records from all platforms with confidence tracking
- `externalSyncLogs` - Sync operation logs with timing and error details
- `externalProductMappings` - Maps external product codes to internal menu products

### New Backend Files
- `convex/integrations/registry.ts` - Platform metadata and reconnection step definitions
- `convex/integrations/k3mart/adapter.ts` + `config.ts` - K3Mart `"use node"` action
- `convex/integrations/gobiz/adapter.ts` + `config.ts` - GoBiz `"use node"` action
- `convex/externalData/mutations.ts` - Internal + public mutations for external data
- `convex/externalData/queries.ts` - Internal + public queries for external data
- `convex/lib/stockDelta.ts` - Pure stock delta calculation functions

### New Frontend Files
- `src/pages/SalesAnalytics.tsx` - Sales Analytics page
- `src/components/salesAnalytics/` - OverviewTab, SettingsTab, ConnectionGuide, barrel export
- `src/components/dashboard/SalesWidget.tsx` - Dashboard widget
- `src/hooks/convex/useExternalData.ts` - Query/action hooks for external data

### Modified Files
- `convex/schema.ts` - Added 5 new external integration tables
- `src/lib/types.ts` - Added `canAccessSalesAnalytics` permission (manager + admin)
- `src/App.tsx` - Added `/sales` route
- `src/components/layout/Header.tsx` - Added Sales nav item
- `src/pages/index.ts` + `src/hooks/convex/index.ts` + `src/components/dashboard/index.ts` - Barrel exports

### Environment Variables
- `K3MART_API_TOKEN` - K3 Mart JWT token (~1yr lifespan)
- `GOBIZ_API_TOKEN` - GoBiz access token (~hours lifespan)

---

## 2026-02-07 - Fix: ProductForm Crash on Undefined posSlot (Hotfix)

**Fixed production crash when editing menu products with undefined `posSlot` values.**

### Root Cause
In `ProductForm.tsx`, the slot initialization logic used the `in` operator to check for `posSlot`, which returns `true` even when the value is `undefined` (since the key exists). Calling `.toString()` on `undefined` caused a TypeError crash.

Additionally, the truthiness check for `packagingPosSlot` would incorrectly treat slot `0` as `'none'`.

### Fix
- Changed both slot checks to use `!= null` (nullish check) which correctly handles `undefined` while preserving valid slot `0`
- Added missing `DialogDescription` for accessibility compliance

### Files Modified
- `src/components/menuProducts/ProductForm.tsx` - Fixed slot initialization logic, added DialogDescription

---

## 2026-02-07 - Feat: Consumption Stage Selector + Production Stage

**Added consumption stage selector UI and new "production" stage for components consumed at InProduction transition.**

### Changes
- **New "production" consumption stage**: Components like tulip paper are auto-consumed when order enters InProduction. Added `consumeProductionMaterialsInternal` helper and InProduction trigger in `statusUpdates.ts`.
- **Consumption stage selector in ComponentTypeDialog**: 3-button selector (Production / Packaging / Labelling) when creating new component types. Default = Packaging (boxing).
- **Consumption stage selector in ReceiveStockDialog**: Same 3-button selector appears in create-new-component mode.
- **PackagingComponentsSection updated**: Stage buttons now show 3 options (Production / Packaging / Labelling) instead of old (Boxing / Labeling / None). Labels fixed ("labeling" displays as "Labelling", "boxing" as "Packaging").
- **Shared constants**: `CONSUMPTION_STAGE_LABELS` and `SELECTABLE_STAGES` added to `src/lib/utils.ts` for consistent label mapping across UI.
- **"none" hidden from UI**: Legacy `none` value kept in DB for backwards compat but no longer selectable in any UI.

### Files Modified
- `convex/schema.ts` - Added `production` to consumptionStage union (componentTypes + menuProductComponents)
- `convex/componentTypes/mutations.ts` - Added `production` to 3 validators
- `convex/menuProducts/mutations.ts` - Added `production` to 2 validators
- `convex/inventory/mutations.ts` - Added `consumptionStage` passthrough in createComponentAndReceiveStock
- `convex/orders/mutations/inventoryIntegration.ts` - Added `consumeProductionMaterialsInternal`
- `convex/orders/mutations/statusUpdates.ts` - Added InProduction consumption trigger
- `src/lib/utils.ts` - Added stage label constants
- `src/components/inventory/ComponentTypeDialog.tsx` - Added stage selector
- `src/components/inventory/ReceiveStockDialog.tsx` - Added stage selector in create mode
- `src/components/menuProducts/PackagingComponentsSection.tsx` - Updated stage options + labels
- `src/components/menuProducts/ProductForm.tsx` - Updated ComponentRow type
- `src/hooks/convex/useComponentTypes.ts` - Added "production" to types
- `src/hooks/convex/useMenuProducts.ts` - Added "production" to types
- `tests/convex/componentTypes.test.ts` - Added production stage test
- `tests/convex/inventory.test.ts` - Updated type

---

## 2026-02-07 - Fix: Legacy Category Validator (Hotfix)

**Fixed production crash when stale browser clients send legacy `direct_packaging`/`indirect_packaging` category values.**

### Root Cause
After the category simplification migration (commit `2fdf009`), backend validators were tightened to only accept `"production" | "packaging"`. Users with cached browser tabs still had old JS sending the pre-migration values, causing validator rejection errors.

### Fix
Expanded argument validators on all 4 affected Convex functions to accept legacy values, then map them to canonical `"packaging"` at the top of each handler. No schema changes -- only query/mutation arg validators were widened.

### Files Modified
- `convex/componentTypes/queries.ts` - `getByCategory` accepts legacy categories
- `convex/componentTypes/mutations.ts` - `create` and `createPackagingQuick` accept legacy categories
- `convex/inventory/mutations.ts` - `createComponentAndReceiveStock` accepts legacy categories
- `CLAUDE.md` - Updated business rule #10 (two categories, not three)

---

## 2026-02-07 - Inventory Dialogs (PR #28)

**Added stock adjustment and inter-location transfer dialogs to the inventory system.**

### New Components
- **`AdjustStockDialog.tsx`**: Stock adjustment dialog with two modes -- wastage recording (categorized reasons: Expired, Damaged, Quality Issue, Shrinkage, Other) and count correction. Updates batch quantities via existing `adjustStock` mutation.
- **`TransferStockDialog.tsx`**: FIFO-based inter-location stock transfer. Selects source location, destination location, and quantity. Respects batch ordering for correct FIFO consumption.
- **Barrel exports**: Both dialogs exported from `src/components/inventory/index.ts`

### Files Added
- `src/components/inventory/AdjustStockDialog.tsx`
- `src/components/inventory/TransferStockDialog.tsx`

### Files Modified
- `src/components/inventory/index.ts` - Added barrel exports for new dialogs

---

## 2026-02-07 - POS Preview Panel + Drag-and-Drop Slot Management (PR #27)

**POS preview panel with drag-and-drop reordering for food and packaging product slots.**

### Summary
Added a live POS preview panel to the Menu Products Manager page. Food and packaging slots can be reordered via drag-and-drop with sortable behavior. During rebase onto the code-simplified main branch, two reorder hooks (`useConvexReorderSlots`, `useConvexReorderPackagingSlots`) were refactored from raw `useMutation`/`useAuth` to the `useProtectedMutation` pattern established in the code simplification work.

### Notes
- Merged as PR #27 after rebasing onto post-code-simplification main
- Rebase conflict fix: reorder hooks migrated to `useProtectedMutation`

---

## 2026-02-07 - Production Deployments

**Two Convex production deploys to `decisive-wombat-7` covering code simplification and POS preview changes.**

- All 256 tests passing
- Build clean with zero errors

---

## 2026-02-07 - Code Simplification (PR #26)

**Removed ~830 lines of duplication across backend and frontend. Zero behavior changes.**

### Backend (Waves 1-2)
- **Shared validators** (`convex/orders/validators.ts`): Extracted `orderItemInput`, `channelValidator`, `statusValidator` used across 5 order files
- **Shared types** (`convex/orders/types.ts`): Unified `OrderWithItems` for queries.ts and whatsapp.ts
- **Merged inventory consumption**: `consumeBoxingMaterialsInternal` + `consumeStickerMaterialsInternal` → parameterized `consumeMaterialsByStageInternal(ctx, args, stage)`
- **Extracted `calculatePackageStatus()`**: Pure function replacing 5 inline status calculations in packaging.ts
- **Extracted helpers in componentTypes/queries.ts**: `sortBySortOrderThenName` comparator + `enrichWithCostInsights` helper
- **Deduplicated `listLegacyProducts`**: Now delegates to `listAvailableProducts`

### Frontend (Waves 3-5)
- **Deduplicated 56 mutation hooks**: Applied `const execute = ...; return { mutate: execute, mutateAsync: execute }` pattern across 12 hook files
- **Standardized error handling**: Replaced inline `error instanceof Error` patterns with `getErrorMessage()` utility
- **Improved `useProtectedMutation`**: Added proper `FunctionReference` generics for automatic type inference
- **Adopted `useProtectedMutation`**: 13 hooks in useMenuProducts.ts and useVouchers.ts now use it (removes manual auth check + token injection)
- **Extracted shared transforms** (`src/lib/transforms.ts`): `transformToOrderSummary()`, `calculateTotalDiscount()`, `ConvexOrderBase` type
- **Merged kitchen transforms**: `transformKitchenOrder` + `transformCompletedOrder` → unified `transformOrderToKitchenOrder`
- **Fixed latent bug**: Dashboard percentage discounts were displayed as raw numbers instead of formatted percentages (discovered during transform extraction)
- **Removed stale comments**: "React Query" references cleaned from 10 hook files
- **Removed deprecated aliases**: `useConvexLegacyProducts`, `LegacyProduct`

### Files Changed
- 32 files changed, 1,063 insertions, 1,869 deletions (net -806 lines)
- 3 new shared files: `convex/orders/validators.ts`, `convex/orders/types.ts`, `src/lib/transforms.ts`

---

## 2026-02-06 - Inventory Overhaul v2

**Backend fixes, thermometer bars, sorting controls, and per-component receive.**

### Backend Fixes
- `adjustStock`: Now updates `quantityPurchased` and recalculates `totalCostIdr` when adjusting up (fixes "150/100" display showing negative consumed%)
- `transferStock`: Creates per-source-batch copies at destination preserving original supplier name, brand, purchase URL, expiry date, and unit cost (previously merged into one batch)
- `getInventoryReport`: Enriched with `latestSupplierName`, `latestPurchaseUrl`, `latestUnitCostIdr` per location

### Frontend Changes
- **StatCard**: Clean dark background (`bg-slate-900`) with white text and colored borders per variant (replaces gradient backgrounds)
- **BatchCard**: Fixed negative consumed% using `Math.max(quantityPurchased, quantityRemaining)` guard; removed Expire button (use Adjust/Wastage with "Expired" reason instead)
- **ComponentRow**: Always-visible thermometer bar (h-4 capsule) with reorder point marker at 50%, color gradient (red/amber/emerald/blue); supplier info + weighted avg cost on collapsed row; per-component "Receive" button
- **ReceiveStockDialog**: Added `preselectedComponentId` (skips component grid) and `forceCreateMode` (starts in create-new mode) props; `lowStockComponents` now optional
- **InventoryManager**: Top button renamed to "Receive New Stock Type" with `forceCreateMode`; sorting controls (Name, % Lowest, # Lowest, Priciest) with `Infinity` fallback for missing reorder points

### Files Modified
- `convex/inventory/mutations.ts` - adjustStock fix, transferStock per-batch split
- `convex/inventory/queries.ts` - Supplier fields in inventory report
- `src/components/inventory/StatCard.tsx` - Dark bg + white text
- `src/components/inventory/BatchCard.tsx` - Consumed% fix, expire button removed
- `src/components/inventory/ComponentRow.tsx` - Thermometer, supplier info, receive button
- `src/components/inventory/ReceiveStockDialog.tsx` - Preselected + force-create props
- `src/pages/InventoryManager.tsx` - Sorting, button rename

---

## 2026-02-06 - BOM Improvements: 25 Issues Across 7 Waves

**Major UX overhaul of the unified BOM system based on manual testing and live user feedback.**

### Summary
Implemented 25 BOM improvements across 7 waves: critical bug fixes, category migration (3-deployment), dynamic POS slots, ProductForm redesign, Menu Products page overhaul, page deletions, inventory UI improvements, order form packaging section, and summary UX.

### Wave 0: Critical Bug Fixes
- Fixed `Array.some(async)` bug in menu product CREATE mutation (always returned "food")
- Removed duplicate "Voucher" label in OrderFormPOS
- Fixed POS card production summary to use `cachedProductionSummary`
- Replaced Kitchen V2 mock packaging inventory with real Convex query

### Wave 1A: Category Simplification (3-deployment migration)
- Merged `direct_packaging` + `indirect_packaging` into single `packaging` category
- `costCalculator.ts` now returns `{production, packaging, total}` (total = production + packaging)
- Added `consumptionStage` field to `menuProductComponents` and `orderComponentReservations`
- Updated all backend and frontend files (17 files total)
- All 7+ COGS test cases updated

### Wave 1B: Dynamic POS Slots
- Changed `posSlot`/`packagingPosSlot` from `v.union(v.literal(1)..4)` to `v.optional(v.number())`
- Runtime validation (positive integer) in mutations
- No hardcoded upper limit

### Wave 2A: ProductForm Structural Changes
- Converted Sheet to Dialog (`max-w-2xl max-h-[90vh]`)
- Added Food/Packaging type toggle at top
- Added active/inactive Switch
- Food path: production + packaging components + weight + food POS
- Packaging path: only packaging components + packaging POS

### Wave 2B: ProductForm Behavioral Changes
- Auto-generate product code from name
- Duplicate name warning with amber highlight
- Consumption stage selector (Boxing/Labeling/None) per packaging component
- Auto-inherit consumption stage from componentType default
- Quick-create dialog for new packaging components

### Wave 3: Menu Products Page Overhaul
- Dynamic slot rendering (occupied slots + "+" card)
- Packaging empty slots now clickable
- Renamed "Legacy Products" to "Available Products"
- `listAvailableProducts` query excludes both food and packaging POS products
- Type-aware "Add to POS" buttons

### Wave 4: Production Components + Page Deletions
- Auto-generate code from name, native color picker
- Removed `ComponentTypesManager.tsx` and `PackagingComponentsManager.tsx` pages
- Added URL redirects for bookmarked links
- Removed nav links for deleted pages

### Wave 5: Inventory UI + Receive Stock Redesign
- Improved stat card readability
- Stock level progress bars (color-coded by threshold)
- Category filter pills (All/Production/Packaging)
- Receive Stock: button grid for ALL components (sorted by low stock)
- Auto-populate supplier info from latest batch

### Wave 6: Order Form Packaging + Summary UX
- Added packaging products section below food products in OrderFormPOS
- ProductButtons component generalized (optional label, flexible columns, generic product type)
- Unit price shown for qty > 1 items (e.g., "@ Rp 80.000")
- Subtotal row hidden when no voucher (shows only Total)

### Wave 7: Verification + Documentation
- Fixed stale `direct_packaging`/`indirect_packaging` type in `useInventory.ts`
- Updated `SCHEMA.md` (menuProducts section with dynamic POS slots, product types)
- All 256 tests passing, build clean

### Files Modified (significant)
- `convex/schema.ts` - Category simplification, dynamic POS slots, consumptionStage
- `convex/lib/costCalculator.ts` - New return shape `{production, packaging, total}`
- `convex/menuProducts/mutations.ts` - Fixed async bug, dynamic slots, consumptionStage
- `convex/menuProducts/queries.ts` - `listAvailableProducts`, `listPackagingPosProducts`
- `src/components/menuProducts/ProductForm.tsx` - Full redesign (Dialog, type toggle, BOM)
- `src/components/menuProducts/PackagingComponentsSection.tsx` - Consumption stage, quick-create
- `src/pages/MenuProductsManager.tsx` - Dynamic slots, available products
- `src/pages/ProductionComponentsManager.tsx` - Auto-code, color picker
- `src/pages/InventoryManager.tsx` - Category filter, stat cards
- `src/components/inventory/ReceiveStockDialog.tsx` - Button grid, auto-supplier
- `src/components/orders/OrderFormPOS.tsx` - Packaging section, summary UX
- `src/components/orders/ProductButtons.tsx` - Generalized interface

### Pages Removed
- `ComponentTypesManager.tsx` (redirects to `/components/production`)
- `PackagingComponentsManager.tsx` (redirects to `/inventory`)

---

## 2026-02-06 - Cleanup: Make componentTypeId Required, Remove Legacy productionUnitTypeId

**Post-migration cleanup: Removed optional/legacy workarounds from menuProductComponents after FK migration completed in production.**

### Summary
The `componentTypeId` field on `menuProductComponents` was temporarily made optional to support a live production migration. With all records now migrated, this cleanup makes the field required again and removes the legacy `productionUnitTypeId` field and all associated null-check workarounds.

### Changes

**Schema (`convex/schema.ts`):**
- `menuProductComponents.componentTypeId`: `v.optional(v.id)` reverted to `v.id("componentTypes")` (required)
- `menuProductComponents.productionUnitTypeId`: Removed (legacy field, no longer needed)

**Backend (5 files):**
- `convex/menuProductComponents/queries.ts` - Removed 3 ternary null-check workarounds
- `convex/menuProductComponents/mutations.ts` - Removed 1 ternary null-check in `updateCachedProductionSummary`
- `convex/orders/helpers/productionRecords.ts` - Removed 2 `if (!componentTypeId) continue` guards
- `convex/orders/mutations/orderCrud.ts` - Removed legacy `productionUnitTypeId` fallback, always uses componentType code-bridge
- `convex/orders/queries.ts` - `getPackagingOrders`: Changed from `productionUnitType` to `componentType` enrichment
- `convex/productionUnitTypes/mutations.ts` - Removed dead `menuProductComponents` scan

**Frontend (1 file):**
- `src/pages/PackagingView.tsx` - Updated `ProductionComponent` interface from `productionUnitType` to `componentType`

**Deleted:**
- `convex/migrations/updateMenuProductComponentsFK.ts` - Migration already ran on production

### Notes
- `orderItemProduction.productionUnitTypeId` is unchanged (still required, kitchen bridge intact)
- No data migration needed (all records already have `componentTypeId` set)
- Net: 28 insertions, 237 deletions

---

## 2026-02-06 - BOM Refactor V3: Unified Component System

**Major refactor: Full unified BOM with componentTypeId, packaging products, and clean slate migration.**

### Summary
Completed the BOM (Bill of Materials) refactor V3. All product components now use `componentTypeId` exclusively (not `productionUnitTypeId`). Added packaging product support, packaging POS slots, `consumptionStage` for inventory consumption, and percentage-based stock alerts.

### Schema Changes
- `componentTypes`: Added `description`, `consumptionStage` ("boxing"|"labeling"|"none"), `alarmPercentage`
- `menuProducts`: Added `packagingPosSlot` (1-4), `productType` ("food"|"packaging"), index `by_packaging_pos_slot`
- `componentStock`: Added `lastRestockTotalStock` (baseline for % alerts)

### Backend Changes
- `componentTypes/mutations.ts`: Accept new fields, added `createPackagingQuick` (name-only create)
- `componentTypes/queries.ts`: Added `priceChangePercent` to cost insights
- `menuProducts/mutations.ts`: Components now `{componentTypeId, quantity}`, auto-derives `productType`, added `assignToPackagingSlot`/`removeFromPackagingSlot`
- `menuProducts/queries.ts`: Added `listPackagingPosProducts`, `listPosProducts` excludes packaging
- `menuProductComponents/mutations.ts`: Simplified to use `componentTypeId` only
- `menuProductComponents/queries.ts`: Returns `componentType` (not `productionUnitType`)
- `orders/helpers/productionRecords.ts`: Simplified code-bridge (always lookup by code)
- `orders/mutations/inventoryIntegration.ts`: Uses `consumptionStage` instead of hardcoded material arrays
- `inventory/queries.ts`: Dual-threshold alerts (units + percentage), added `getLatestBatch`
- `inventory/mutations.ts`: `receiveStock` sets `lastRestockTotalStock`, supports `copyFromBatchId`

### Frontend Changes
- `ProductForm.tsx`: Rewritten with `ProductionComponentsSection` + `PackagingComponentsSection` sub-components
- `MenuProductsManager.tsx`: Renamed "Product Manager", added Packaging POS section, product type badges
- New pages: `ProductionComponentsManager.tsx`, `PackagingComponentsManager.tsx`
- Navigation reordered: Products first, Dashboard in admin section
- New routes: `/components/production`, `/components/packaging`
- Hooks updated for new backend APIs

### Migration
Run: `npm run migrate:bom-v2` (or `npx convex run migrations/bomRefactorV2:cleanSlateAndSeed`)
- Wipes all test inventory data (batches, stock, transactions, reservations, BOM links)
- Keeps only BIG_BALL + MID_BALL production components
- Seeds `productType: "food"` on all existing menu products

---

## 2026-02-05 - Inventory System FK Migration Complete

**Completed Wave 1.5: Migrated menuProductComponents from productionUnitTypes to componentTypes.**

### Summary
Successfully migrated the Bill of Materials (BOM) system to use the unified `componentTypes` table instead of the legacy `productionUnitTypes` table. This enables the full inventory management system with FIFO tracking for both production components (balls) and packaging materials (boxes, stickers).

### Migration Results
- ✅ 7 menuProductComponents records migrated successfully
- ✅ All records now reference componentTypes via `componentTypeId`
- ✅ Legacy `productionUnitTypeId` field retained for backward compatibility
- ✅ Schema validation passing with required `componentTypeId`

### Technical Changes

**Schema Updates:**
- `menuProductComponents.componentTypeId` - Now REQUIRED (was optional during migration)
- `menuProductComponents.productionUnitTypeId` - Now optional/legacy (was required)
- New index: `by_component_type` on componentTypeId
- Removed index: `by_production_type` on productionUnitTypeId

**Code Updates (8 files modified):**
- `convex/menuProductComponents/mutations.ts` - Create/update now looks up componentType from productionUnitType
- `convex/menuProductComponents/queries.ts` - Queries return both componentType and productionUnitType
- `convex/menuProducts/mutations.ts` - Menu product creation maps to componentTypes
- `convex/orders/helpers/productionRecords.ts` - Production record creation uses componentTypes
- `convex/orders/mutations/orderCrud.ts` - Order creation enriches with componentTypes
- `convex/orders/mutations/inventoryIntegration.ts` - Inventory bridge uses componentTypeId
- `convex/orders/queries.ts` - Type definitions updated for optional fields
- `convex/productionUnitTypes/mutations.ts` - Deletion checks scan all records (no index)

**Migration Scripts:**
- `convex/migrations/updateMenuProductComponentsFK.ts` - Migration script with dry-run, rollback, and verification
- `convex/migrations/inventorySetup.ts` - Base data migration (already completed)

### What This Enables
- ✅ Unified BOM system for production + packaging components
- ✅ FIFO inventory consumption tracking
- ✅ Multi-location stock management (Kitchen, Office, Legato Goldfinch)
- ✅ Automatic stock reservation on order confirmation
- ✅ Automatic stock consumption on boxing/labeling
- ✅ Low stock alerts for packaging materials
- ✅ Enhanced COGS calculation from component costs

### Backward Compatibility
- Legacy `productionUnitTypeId` field maintained for existing code that hasn't been updated
- All queries return both `componentType` and `productionUnitType` (legacy)
- Production records still use `productionUnitTypeId` (separate migration needed later)

### Next Steps (Future Work)
- Consider migrating `orderItemProduction` table to use componentTypes (optional)
- Remove legacy `productionUnitTypeId` field after full system verification (6-12 months)
- Update frontend to show componentType details in order views

**Migration Audit:** See `docs/AUDIT_REPORT_2026-02-05.md` for complete pre-migration verification

---

## 2026-02-05 - Fix Kitchen Ball Filling for New Menu Products

**Critical bug fix: Ball distribution now works correctly for all menu products with components.**

### Root Cause
The ball distribution algorithm was using the OLD production system (`orderItems.productionType` field) to filter which items receive balls, but then applying balls using the NEW system (`orderItemProduction` records). When these two systems were out of sync (which happened for all new menu products with `menuProductComponents`), balls failed to distribute.

### Changes
- Updated item filter in `distributeBallsToOrders()` to check for presence of matching production records instead of `productionType` field
- Updated completion check filter to use production records instead of `productionType` field

### Impact
- All new menu products with components (combo packs, etc.) now fill correctly in Kitchen View
- Legacy products continue to work unchanged
- Order completion workflow is restored

**Files Modified:**
- `convex/orders/helpers/ballDistribution.ts` - Lines 201-209 (item filter), Line 290 (completion check)

**Technical Details:**
- Old filter: `item.productionType === productionTypeFilter`
- New filter: `item.productionRecords.some(r => r.productionUnitCode === productionUnitCode && r.unitsRemaining > 0 && !r.isCancelled)`

**Full RCA:** See `docs/reviews/staffreview-ball-filling-bug-2026-02-05.md`

---

## 2026-02-05 - Manager Override One-Time Use Enforcement

**Manager overrides now automatically deactivate after first use and link to the consuming order.**

- Manager overrides are now true one-time use vouchers
- Auto-deactivate (`isActive: false`) immediately on first use
- Link to specific order via `overrideOrderId` field
- VouchersManager shows "Used by Order #XXXX" link (or "Order Deleted" if removed)
- Cancelled orders do NOT reactivate overrides (maintains audit trail)
- Enhanced error message: "This manager override has already been used and cannot be reused"

**Files Modified:**
- convex/orders/helpers/voucherHandling.ts
- convex/vouchers/queries.ts
- src/pages/VouchersManager.tsx

**Commits:**
- 5bedadf - feat(vouchers): auto-deactivate manager overrides on first use
- 3f869b0 - feat(vouchers): add override-specific error messaging
- 9d446dc - feat(vouchers): display order linkage and deletion status

**Breaking Changes:** None (backwards compatible)

**Migration Notes:** Existing consumed overrides continue to block reuse via `usageCount` check. New overrides benefit from explicit deactivation and order linking.

---

## 2026-02-05 - WhatsApp Template Format Updates

**Currency and discount display improvements for WhatsApp messages**

- Changed currency format from `IDR` to `Rp` throughout all WhatsApp templates
- Simplified discount display: now shows `(Includes Rp XX.XXX discount!)` instead of voucher codes
- Consistent formatting across payment request, receipt, and DB template system

**Files Modified:**
- `convex/orders/whatsapp.ts` - formatCurrency + 3 discount note locations
- `convex/orders/whatsappHelpers.ts` - formatCurrency (for testability)
- `convex/orders/__tests__/whatsapp.test.ts` - updated test assertions
- `src/lib/whatsappTemplates.ts` - frontend preview formatCurrency

**Commits:**
- fix: change currency format from IDR to Rp in WhatsApp helpers
- fix: update WhatsApp templates - Rp currency + simplified discount
- fix: update frontend WhatsApp preview currency format

---

## 2026-02-05 - Orders Page Complete Redesign - Terracotta Theme & Golden Ratio Layout

**Complete visual and structural redesign of the Orders page with terracotta design language**

### Design Philosophy
- Extends warm terracotta palette from OrderFormPOS_Redesign to entire Orders ecosystem
- Golden ratio layout (61.8% / 38.2%) for optimal visual balance
- Form AND function - easy eye scanning with unified visual hierarchy
- Terracotta (#E07856) as primary accent color throughout

### Major Changes

**1. Theme Infrastructure (Phase 1)**
- Added terracotta CSS variables to `src/index.css`:
  - `--color-terracotta`, `--color-terracotta-dark`, `--color-terracotta-darker`
  - `--color-terracotta-light`, `--color-terracotta-muted`
  - Text colors and dark gradient variables
- Added Playfair Display font for headings (already in HTML)
- Created utility classes: `.text-terracotta`, `.bg-terracotta`, `.order-heading`
- Added order-specific styles: `.order-card-hover`, `.order-queue-scroll`, `.status-dot`

**2. Shared Order Constants (Phase 1)**
- Created `src/lib/orderConstants.ts`:
  - Extracted `STATUS_COLORS` and `PAYMENT_COLORS` maps
  - Added `STATUS_CATEGORIES` for grouping (awaiting, paidReady, kitchen, ready, completed)
  - Added `CATEGORY_INFO` with labels, colors, emojis, descriptions
  - Helper functions: `getStatusCategory()`, `getStatusDotColor()`, `getWaitingTimeInfo()`, `formatOrderDate()`

**3. Backend Multi-Status Filtering (Phase 2)**
- Updated `src/hooks/convex/useOrders.ts`:
  - `OrderFilters.status` now supports `OrderStatus | OrderStatus[]`
- Updated `convex/orders/queries.ts`:
  - `list()` query handles array of statuses
  - When array provided, fetches all and filters in memory
  - Enables category-based filtering (e.g., all kitchen statuses at once)

**4. Orders Page Layout (Phases 3-5)**
- Complete redesign of `src/pages/OrderManager.tsx`:
  - **Golden ratio flex layout**: 61.8% form / 38.2% queue sidebar
  - **Form always visible** (no toggle button or empty state)
  - **Queue always visible** in sticky sidebar
  - **Page header** with Playfair Display font, terracotta underline accent
  - **Search bar** integrated into header with terracotta focus ring

**5. Action-Oriented Filter Buttons**
- Replaced dropdown with category pill buttons:
  - **All**: Show all active orders (default)
  - **Awaiting Payment** 🟡: Draft, AwaitingPayment
  - **Paid & Ready** 🔵: Confirmed (waiting for kitchen)
  - **In Kitchen** 🟣: InProduction, Packaging
  - **Ready Ship/Pick** 🟢: WaitingShipment, WaitingPickup
  - **More** (dropdown): Completed, PickedUp, Cancelled
- Buttons show real-time count badges
- Active button has terracotta background and shadow
- Inactive buttons have terracotta hover state

**6. Compact Order Cards**
- Horizontal 72px cards with:
  - **Status dot** (12px circle, category color) on left
  - **Order info**: number (mono font), customer name, item count, due date
  - **Waiting badge**: Shows time since AwaitingPayment
  - **Amount**: Terracotta color, bold
  - **Payment progress bar** (4px) at bottom for Partial payments
  - **Hover effect**: Lift animation + terracotta left border

**7. Grouped Queue Sidebar**
- Orders grouped by status category
- **Sticky section headers** with:
  - Category emoji + label
  - Count badge (category color)
  - Description text (muted)
- **Custom scrollbar** (8px, terracotta thumb on hover)
- **Today's stats footer** (dark gradient):
  - Shows count and total amount for today's orders
  - Fixed at bottom of sidebar

**8. Animations**
- Framer Motion for smooth transitions:
  - Order cards: fade + slide in
  - Section changes: stagger animation
  - Filter changes: AnimatePresence with exit animations

### Files Modified
- `src/index.css` - Theme variables, utility classes
- `src/lib/orderConstants.ts` - **NEW** - Shared constants
- `src/hooks/convex/useOrders.ts` - Multi-status filter type
- `convex/orders/queries.ts` - Array status handling
- `src/pages/OrderManager.tsx` - Complete redesign

### Visual Tokens
| Token | Value | Usage |
|-------|-------|-------|
| Primary Accent | `#E07856` | Buttons, links, highlights |
| Dark Accent | `#D66A4A` | Hover states |
| Heading Font | Playfair Display | Page titles |
| Body Font | Inter | All other text |
| Card Radius | 16px (rounded-xl) | Cards, buttons |
| Golden Ratio | 61.8% / 38.2% | Main layout split |

### Breaking Changes
None - backward compatible with existing data

### Migration Notes
- Feature flag `ff_order_form_redesign` continues to control which form variant is used
- No database changes required
- Playfair Display font already loaded in `index.html`

---

## 2026-02-04 - Voucher Code Feature - Complete Discount System

**Implemented comprehensive voucher code system with manager overrides and POS integration**

### Feature Overview
- Full CRUD voucher management (admin-only interface)
- Voucher code validation with usage limits and per-customer restrictions
- Manager override vouchers for ad-hoc discounts (single-use, 24hr expiry)
- POS checkout integration with real-time validation
- Low price warning dialog for orders < Rp 20,000
- Automatic voucher release on order edit (prevents stale discounts)
- Historical snapshots (voucher code/value saved on orders)

### Business Rules Implemented
1. **Voucher Types**:
   - Regular vouchers: Reusable codes with configurable usage limits
   - Manager overrides: Auto-generated single-use codes for special discounts
2. **Validation**:
   - Active status check (`isActive === true`)
   - Date range validation (`validFrom` to `validUntil`)
   - Total usage limit check (`usageCount < usageLimit`)
   - Per-customer limit check (tracked via `voucherUsage` table)
   - Minimum order amount enforcement
3. **Final Price Rules**:
   - Hard block: Final price ≤ 0 (backend validation)
   - Warning dialog: Final price < Rp 20,000 (requires confirmation)
4. **Order Integration**:
   - Voucher auto-release on order modification (user must re-apply)
   - Usage count decrements on order cancellation
   - Voucher snapshots preserved on orders for historical accuracy

### Backend Changes (Convex)

**Schema (Phase 1)**:
- Added `vouchers` table (14 fields including discount config, validity, usage limits)
- Added `voucherUsage` table (tracking per-customer voucher usage)
- Added voucher fields to `orders` table:
  - `voucherId: v.optional(v.id("vouchers"))`
  - `voucherCode: v.optional(v.string())` (snapshot)
  - `voucherDiscountValue: v.optional(v.number())` (snapshot)
  - `lowPriceConfirmed: v.optional(v.boolean())`
- Added indexes: `by_code`, `by_active`, `by_active_valid` on vouchers
- Added indexes: `by_voucher`, `by_customer`, `by_voucher_customer`, `by_order` on voucherUsage

**Queries (Phase 2)**:
- Created `convex/vouchers/queries.ts`:
  - `list()` - List all vouchers with metadata
  - `getById({ id })` - Get single voucher
  - `validateVoucher({ code, customerId?, orderTotal })` - Validate and calculate discount

**Mutations (Phase 2)**:
- Created `convex/vouchers/mutations.ts`:
  - `create({ code, name, description, discountType, discountValue, ... })` - Admin creates voucher
  - `update({ id, ... })` - Admin edits voucher
  - `deactivate({ id })` - Admin deactivates voucher
  - `createManagerOverride({ discountType, discountValue, reason, orderId })` - Generate single-use override
- All mutations require admin role via `requireRole(ctx, args.token, ["admin"])`
- Manager override allowed for managers and admins (but only during checkout)

**Order Integration (Phase 3)**:
- Modified `convex/orders/mutations/orderCrud.ts`:
  - Added voucher application logic in `create()`
  - Added voucher validation (calls `validateVoucher` query)
  - Added `voucherUsage` record creation on order creation
  - Added usage count increment/decrement logic
  - Added voucher auto-release on order edit (decrements usage, deletes voucherUsage record)
  - Added final price validation (hard block if ≤ 0)
- Updated `convex/orders/whatsapp.ts` to include voucher in receipt template

### Frontend Changes (React)

**Access Control (Phase 4)**:
- Added `canAccessVouchers` permission to `src/lib/types.ts` (admin: true, others: false)
- Added `/vouchers` protected route in `src/App.tsx`
- Added "Vouchers" navigation link in `src/components/layout/Header.tsx` (admin only)
- Imported Space Grotesk font for voucher codes
- Added brand colors to Tailwind config: `#2A5C4D` (Forest Green), `#FF6B35` (Terracotta Orange)

**VouchersManager Page (Phase 5)**:
- Created `src/pages/VouchersManager.tsx`:
  - Two-column layout (voucher list + detail/form panel)
  - Tabbed interface: Active / Scheduled / Inactive / Manager Overrides
  - VoucherCard component with usage progress bar animation
  - VoucherForm with validation
  - Staggered list rendering with Framer Motion
  - "Generate Code" button with shuffle animation
- Created `src/hooks/convex/useVouchers.ts`:
  - `useConvexVouchers()` - List all vouchers
  - `useConvexVoucherById({ id })` - Get single voucher
  - `useConvexCreateVoucher()` - Create mutation hook
  - `useConvexUpdateVoucher()` - Update mutation hook
  - `useConvexDeactivateVoucher()` - Deactivate mutation hook

**POS Integration (Phase 6)**:
- Created `src/components/orders/VoucherInput.tsx`:
  - State machine (idle/validating/valid/applied/error)
  - Real-time validation with 300ms debounce
  - Success/error animations (slide-down, shake)
  - Applied state with emerald background transition
  - Clear button with fade transition
- Created `src/components/orders/ManagerOverrideDialog.tsx`:
  - Discount type selector (percentage/flat amount)
  - Value slider with gradient thumb and real-time preview
  - Final price calculation with color transitions
  - Reason textarea (required for audit)
  - Confirmation checkbox for low prices
  - Gradient button with disabled state handling
- Created `src/components/orders/LowPriceWarningDialog.tsx`:
  - Large final price display (5xl font size)
  - Order breakdown in calculator-style box
  - Explicit confirmation checkbox
  - "Proceed" button disabled until confirmed
- Modified `src/components/orders/OrderFormPOS.tsx`:
  - Integrated VoucherInput component
  - Integrated ManagerOverrideDialog (manager + admin only)
  - Integrated LowPriceWarningDialog
  - Toast notification on voucher auto-release: "Order modified - voucher removed"
- Created shadcn/ui components:
  - `src/components/ui/switch.tsx` - Switch component for active toggle
  - `src/components/ui/alert-dialog.tsx` - AlertDialog for confirmations

### Design System

**Aesthetic Direction**: "Refined Brutalism with Warm Accents"
- **Colors**: Indonesian earth tones (Forest Green #2A5C4D, Terracotta Orange #FF6B35)
- **Typography**: Space Grotesk (voucher codes/emphasis), Inter (body)
- **Spatial Design**: Dense grids with luxurious individual components
- **Motion**: Snappy (200ms) state changes, smooth (400ms) modal transitions, playful success states

### Documentation Updates

- **docs/SCHEMA.md**:
  - Updated table count: 19 → 22 tables
  - Added Section 19: `vouchers` table with full schema
  - Added Section 20: `voucherUsage` table with usage flow
  - Updated Section 16: `orders` table with voucher fields
  - Updated Visual Schema Diagram to include voucher relationships
- **docs/API_REFERENCE.md**:
  - Added voucher queries section (`list`, `getById`, `validateVoucher`)
  - Added voucher mutations section (`create`, `update`, `deactivate`, `createManagerOverride`)
  - Documented validation rules and response formats
- **CLAUDE.md**:
  - Updated Access Control Status table (added VouchersManager)
  - Updated Quick File Finder (added voucher tasks)
  - Updated table count in Critical File Paths: 19 → 22 tables

### Files Created

**Backend**:
- `convex/vouchers/queries.ts` - Voucher read operations
- `convex/vouchers/mutations.ts` - Voucher write operations

**Frontend**:
- `src/pages/VouchersManager.tsx` - Admin voucher management interface
- `src/hooks/convex/useVouchers.ts` - Voucher query/mutation hooks
- `src/components/orders/VoucherInput.tsx` - POS voucher code input
- `src/components/orders/ManagerOverrideDialog.tsx` - Manager override creation
- `src/components/orders/LowPriceWarningDialog.tsx` - Low price confirmation
- `src/components/ui/switch.tsx` - shadcn/ui Switch component
- `src/components/ui/alert-dialog.tsx` - shadcn/ui AlertDialog component

### Files Modified

**Backend**:
- `convex/schema.ts` - Added vouchers, voucherUsage tables; updated orders table
- `convex/orders/mutations/orderCrud.ts` - Voucher application and auto-release logic
- `convex/orders/whatsapp.ts` - Include voucher in receipt template

**Frontend**:
- `src/lib/types.ts` - Added `canAccessVouchers` permission
- `src/App.tsx` - Added `/vouchers` route
- `src/components/layout/Header.tsx` - Added Vouchers nav item
- `src/pages/index.ts` - Export VouchersManager
- `src/hooks/convex/useOrders.ts` - Added voucherCode/lowPriceConfirmed fields
- `src/components/orders/OrderFormPOS.tsx` - Integrated voucher system
- `tailwind.config.js` - Added brand colors and Space Grotesk font

**Documentation**:
- `docs/SCHEMA.md` - Added voucher tables, updated orders table
- `docs/API_REFERENCE.md` - Added voucher functions documentation
- `CLAUDE.md` - Updated access control, quick file finder, table count
- `docs/CHANGELOG.md` - This entry

### Commits (feature/voucher-system branch)

1. `2d1331c` - feat(schema): add vouchers and voucherUsage tables for discount system
2. `afa4496` - feat(vouchers): add CRUD queries and mutations for voucher system
3. `9f36237` - feat(orders): integrate voucher system with order mutations
4. `346e96a` - feat(vouchers): add access control and route for VouchersManager
5. `f099811` - feat(vouchers): implement VouchersManager page with full CRUD
6. `12c10d8` - feat(vouchers): integrate voucher system into POS checkout

### Testing Checklist

Before production deployment, verify:
- [ ] Admin can create/edit/delete vouchers via VouchersManager
- [ ] Voucher codes validate correctly (active, date range, usage limits)
- [ ] Per-customer usage limits enforced
- [ ] Manager can create override vouchers during checkout
- [ ] Low price warning shows when final < Rp 20,000
- [ ] Final price ≤ 0 blocked by backend
- [ ] Voucher auto-releases when order is edited
- [ ] Usage count decrements on order cancellation
- [ ] WhatsApp receipt includes voucher details
- [ ] Voucher history preserved on completed orders

### Migration Notes

No migration needed. Tables will auto-create on deployment. Existing orders unaffected (voucher fields optional).

---

## 2026-02-04 - Admin-Only Access for MenuProductsManager

**Implemented defense-in-depth security for Menu Products Manager**

### Security Features
- **Frontend Route Protection**: Added `canAccessMenuProducts` permission (admin-only)
- **Backend Mutation Authorization**: All 6 menuProducts mutations now require admin role via `requireRole()`
- **Session Handling**: Frontend hooks check for valid session before mutations
- **Dashboard Button Visibility**: Menu Products buttons hidden for non-admin users

### Permission Matrix Update
| Role | canAccessMenuProducts |
|------|----------------------|
| kitchen | false |
| order_staff | false |
| manager | false |
| admin | true |

### Backend Changes (Convex)
- **Mutations**: Added `token: v.string()` arg to `create`, `update`, `remove`, `toggleActive`, `assignToSlot`, `removeFromSlot`
- **Mutations**: Added `requireRole(ctx, args.token, ["admin"])` authorization check

### Frontend Changes (React)
- **Types**: Added `canAccessMenuProducts` to `ROLE_PERMISSIONS` matrix in `src/lib/types.ts`
- **Route**: Updated `ProtectedRoute` to use `canAccessMenuProducts` instead of `canAccessProducts`
- **Hooks**: Updated all mutation hooks in `useMenuProducts.ts` to pass auth token
- **Hooks**: Created reusable `useProtectedMutation.ts` wrapper for future use

### Documentation
- Updated Access Control Status table in CLAUDE.md
- Added Backend Authorization Pattern section in CODE_STYLE.md

### Files Modified
- `src/lib/types.ts` - Added canAccessMenuProducts permission
- `src/App.tsx` - Updated route protection
- `src/pages/Dashboard.tsx` - Hide Menu Products buttons for non-admin
- `src/hooks/convex/useMenuProducts.ts` - Added token to all mutations
- `src/hooks/convex/useProtectedMutation.ts` - NEW: Reusable auth wrapper
- `convex/menuProducts/mutations.ts` - Added requireRole checks
- `CLAUDE.md` - Updated access control table
- `docs/CODE_STYLE.md` - Added authorization pattern docs

### Commits
- feat: add admin-only access for MenuProductsManager
- fix: hide Menu Products buttons from non-admin users in Dashboard

---

## 2026-02-03 - Menu Products Manager with POS Slot System

**Created full CRUD interface for menu products with POS slot management**

### Feature Overview
- New manager page to view, create, edit, and delete menu products
- POS slot system (1-4) to control which products appear on POS interface
- Component-based COGS auto-calculation from production unit types
- Slot swap confirmation to prevent accidental reassignments
- Delete protection for fixed products
- Empty slot placeholders with visual indicators
- Mobile responsive design (280px minimum)

### Backend Changes (Convex)
- **Schema**: Added `posSlot` field (union type 1-4) to menuProducts table
- **Schema**: Added `by_pos_slot` index for efficient queries
- **Queries**: Added `listPosProducts()` and `listLegacyProducts()`
- **Mutations**: Added `assignToSlot()`, `removeFromSlot()`, `migrateFixedProductsToSlots()`
- **Mutations**: Added `calculateUnitCostFromComponents()` helper for COGS calculation
- **Mutations**: Updated `create` and `update` to accept components array and auto-calculate unitCost/grams
- **Mutations**: Added `updateCachedProductionSummary()` helper

### Frontend Changes (React)
- **Page**: Created `src/pages/MenuProductsManager.tsx` with card-based layout
- **Component**: Created `src/components/menuProducts/ProductForm.tsx` (Sheet-based form)
- **Hooks**: Added `useConvexPosProducts()`, `useConvexLegacyProducts()`, `useConvexAssignToSlot()`, `useConvexRemoveFromSlot()`
- **Hooks**: Created `src/hooks/convex/useProductionUnitTypes.ts` for unit type queries
- **Hooks**: Created `src/hooks/convex/useMenuProductComponents.ts` for component queries
- **Integration**: Updated `OrderFormPOS.tsx` to use `useConvexPosProducts()` instead of `useConvexFixedProducts()`
- **Integration**: Updated `ProductButtons.tsx` interface to accept `posSlot` field
- **Navigation**: Added "Menu Products" button in Dashboard Orders section
- **Route**: Added `/menu-products` route in App.tsx

### Key Features
1. **POS Slot Management**: Only slotted products (1-4) appear on POS interface
2. **Slot Swap Confirmation**: Dialog confirms when reassigning occupied slots
3. **Component Editor**: Add production unit types with auto-calculated COGS and weight
4. **Delete Protection**: Fixed products cannot be deleted (show lock icon)
5. **Empty Slot Placeholders**: Visual indicators for unassigned slots
6. **Mobile Responsive**: Fully tested at 280px viewport width

### Files Modified (Backend)
- `convex/schema.ts` - Added posSlot field and index
- `convex/menuProducts/queries.ts` - Added slot-based queries
- `convex/menuProducts/mutations.ts` - Added slot management and component calculation

### Files Created (Frontend)
- `src/pages/MenuProductsManager.tsx`
- `src/components/menuProducts/ProductForm.tsx`
- `src/hooks/convex/useProductionUnitTypes.ts`
- `src/hooks/convex/useMenuProductComponents.ts`

### Files Modified (Frontend)
- `src/hooks/convex/useMenuProducts.ts` - Added POS product hooks and types
- `src/hooks/convex/index.ts` - Added barrel exports
- `src/components/orders/OrderFormPOS.tsx` - Updated to use POS products
- `src/components/orders/ProductButtons.tsx` - Updated interface
- `src/pages/Dashboard.tsx` - Added navigation button
- `src/App.tsx` - Added route

### Documentation Updates
- `docs/SCHEMA.md` - Documented posSlot field and by_pos_slot index
- `docs/API_REFERENCE.md` - Documented new queries and mutations
- `CLAUDE.md` - Added Menu Products to Quick File Finder

### Migration Steps
Run migration to assign existing fixed products to slots:
```
1. Open Convex dashboard: npx convex dashboard
2. Go to Functions tab
3. Run: menuProducts:migrateFixedProductsToSlots
4. Verify: ORIGINAL→slot 1, BITE_SINGLE→slot 2, BITE_DOUBLE→slot 3, BITE_TRIPLE→slot 4
```

### Commits
- 8bbe88a - feat: add posSlot field and slot management mutations
- a6bdfac - feat: add POS product hooks and update OrderFormPOS
- 7a1acfb - feat: add MenuProductsManager page with card-based UI
- 2afe28a - fix: resolve build blockers in MenuProductsManager
- d4b9aa7 - feat: add component-based COGS calculation backend
- d921dfa - feat: add component editor UI with auto-calculation
- 1b3e538 - fix: resolve build blockers in Phase 4
- 831e2ea - feat: add polish and edge case handling
- 4d8497a - fix: add missing toast import

---

## 2026-02-03 - Production Environment Migration + CI/CD Pipeline

**Migrated from single-environment to proper dev/prod separation with automated CI/CD**

### Environment Migration
- **Production**: `prod:decisive-wombat-7` (Vercel + GitHub Actions)
- **Development**: `dev:exciting-fennec-671` (local development)
- Data exported from dev, deployed to prod, verified counts match
- Vercel environment variables updated to point to production

### CI/CD Pipeline
- Created `.github/workflows/deploy.yml`:
  - Lint check for dynamic imports (`await import(`)
  - Convex deploy to production (conditional on `convex/` changes)
  - Vercel webhook trigger (ensures Convex deploys before frontend)
- Path filters: Only triggers on code changes, not docs
- Added `npm run lint:convex` script

### Documentation Updates
- **CODE_STYLE.md**: Added "Convex Runtime Restrictions" section
- **WORKFLOW.md**: Added "Convex Deployment Checklist" + "Branch Discipline"
- **CLAUDE.md**: Updated environment variables section
- **TESTING_GUIDE.md**: Updated for dual-environment setup
- **RCA report**: Marked all action items complete

### Configuration Updates
- `scripts/deploy-check.js`: Updated to check for prod:decisive-wombat-7
- `.env`: Updated to prod:decisive-wombat-7
- `.env.local.production`: Updated URLs
- `package.json`: Added lint:convex script

### Files Modified
- `.github/workflows/deploy.yml` (created)
- `scripts/deploy-check.js`
- `.env`, `.env.local.production`
- `package.json`
- `docs/CODE_STYLE.md`
- `docs/WORKFLOW.md`
- `docs/TESTING_GUIDE.md`
- `docs/reports/RCA-2026-02-03-kitchen-dynamic-import.md`
- `CLAUDE.md`

---

## 2026-02-03 - Documentation Consolidation: README + ONBOARDING

**Consolidated README.md from 453 to 118 lines; ONBOARDING.md from 532 to 153 lines**

Eliminated duplicate content across README.md, CLAUDE.md, and ONBOARDING.md per documentation best practices.

### README.md Changes (453 → 118 lines, -74%):

**Removed (now link to other docs):**
- Detailed project structure → Link to CLAUDE.md
- Business rules → Link to CLAUDE.md
- Environment variables → Link to docs/ENVIRONMENTS.md
- Git workflow details → Link to docs/WORKFLOW.md
- Common tasks examples → Already in CODE_STYLE.md
- Troubleshooting → Link to TESTING_GUIDE.md
- Architecture diagram → Link to SCHEMA.md
- Database schema details → Link to SCHEMA.md
- Testing section → Link to TESTING_GUIDE.md

**Kept (essential for GitHub visitors):**
- Project description (1 paragraph)
- Quick Start (3 commands)
- Key Features (5 bullets)
- Documentation links table
- Essential commands
- Simplified project structure
- Contributing summary
- Tech Stack (simplified)
- License

### Documentation Hierarchy (clarified):

| File | Audience | Purpose |
|------|----------|---------|
| **README.md** | GitHub visitors | First impression, quick start, links to docs |
| **CLAUDE.md** | AI agents | Complete context for code generation |
| **ONBOARDING.md** | New developers | First-day guide, doc routing |

**Files Modified:**
- `README.md` - Rewritten as lean link-heavy intro (118 lines)
- `docs/ONBOARDING.md` - Rewritten as getting-started guide (153 lines)
- `docs/CODE_STYLE.md` - Added Common Implementation Tasks section
- `docs/SCHEMA.md` - Added Ball Distribution Priority section
- `docs/CHANGELOG.md` - This entry

---

## 2026-02-03 - Documentation Restructure: ONBOARDING.md Consolidation

**Redistributed ONBOARDING.md content to appropriate documentation files per CLAUDE.md guidance**

ONBOARDING.md was 532 lines containing duplicated content. Consolidated into a lean ~150-line getting-started guide.

### Changes Made:

**1. Moved to CODE_STYLE.md:**
- "Common Implementation Tasks" section with examples:
  - Adding a New Order Field
  - Creating a New Mutation
  - Adding a WhatsApp Template

**2. Moved to CHANGELOG.md (this entry):**
- "Post-Refactor Changes (Feb 2026)" historical information

**3. Removed from ONBOARDING.md (duplicates):**
- Architecture Overview (duplicated SCHEMA.md)
- Order System Patterns (duplicated CODE_STYLE.md)
- Testing & Debugging details (duplicated TESTING_GUIDE.md)
- Key Documentation Files table (duplicated CLAUDE.md)

**4. Added to ONBOARDING.md:**
- Clear "Where to Find Information" routing section
- "First Task Checklist" for new developers

**Post-Refactor Changes (Feb 2026) - Historical Reference:**

The February 2026 refactor included:
1. **Removed `ballsRemaining` field** - Use `orderItemProduction.unitsRemaining` instead
2. **Two-tier helper system** - Pure helpers in `helpers.ts`, ctx helpers in `helpers/`
3. **Consolidated WhatsApp templates** - Single parameterized function
4. **Added indexes** - `by_completion`, `by_production_type` for performance
5. **Auto-transitions** - Confirmed → InProduction → Packaging

Migration notes for existing orders:
- Existing orders with old data continue to work
- Production records backfill available via `backfillProductionRecords` mutation
- No frontend changes needed (types auto-generate)

**Files Modified:**
- `docs/ONBOARDING.md` - Rewritten as lean getting-started guide
- `docs/CODE_STYLE.md` - Added Common Implementation Tasks section
- `docs/CHANGELOG.md` - Added this entry with historical reference

---

## 2026-02-03 - Phase 4: Polish & Complete OLD System Removal

**COMPLETE REMOVAL of deprecated ballsRemaining field + consolidation improvements**

This is the final phase of the Orders & Kitchen refactor. The dual-write system has been completely removed in favor of the NEW production tracking system.

### Breaking Changes:

**1. Removed `ballsRemaining` Field (BREAKING)**
- **DELETED** `orderItems.ballsRemaining` field from schema
- All production tracking now uses `orderItemProduction.unitsRemaining` exclusively
- Migration: Existing orders will continue to work (production records were backfilled in Phase 2)
- Any custom queries reading `ballsRemaining` will break - use `orderItemProduction` instead

**Files Modified:**
- `convex/schema.ts` - Removed field definition
- `convex/orders/mutations.ts` - Removed all writes to ballsRemaining
- `convex/orders/helpers/ballDistribution.ts` - Removed dual-write comment
- `src/hooks/convex/useKitchenStats.ts` - Removed interface field and mapping
- `src/components/orders/PackageStatusDisplay.tsx` - Removed fallback calculation
- `CLAUDE.md` - Updated business rule #9
- `docs/CODE_STYLE.md` - Updated dual-write section
- `docs/SCHEMA.md` - Updated kitchen tracking documentation

### Features Added:

**2. WhatsApp Template Consolidation**
- Consolidated 6 template functions into 1 parameterized `generateTemplate()` function
- Cleaner switch-case pattern for template selection
- No breaking changes (API remains the same)

**Files Modified:**
- `convex/orders/whatsapp.ts` - Added TemplateType union and consolidated generator

**3. Performance Indexes Added**
- `orderItemProduction.by_completion` - Composite index for faster completion checks
- `orderItems.by_production_type` - Composite index for kitchen queries

**Files Modified:**
- `convex/schema.ts` - Added indexes

**4. Developer Onboarding Guide**
- NEW: `docs/ONBOARDING.md` - Comprehensive guide for new developers
- Documents post-refactor architecture and patterns
- Explains two-tier helper system
- Kitchen workflow and common tasks

**Files Created:**
- `docs/ONBOARDING.md`

**Files Modified:**
- `CLAUDE.md` - Added onboarding guide to documentation index

### Verification:

```bash
# TypeScript passes with zero errors
npm run type-check

# Search confirms zero references to ballsRemaining in active code
grep -r "ballsRemaining" --include="*.ts" --include="*.tsx" convex/ src/
# Only returns documentation comments (expected)
```

### Migration Notes:

**For Developers:**
- Update any custom queries to use `orderItemProduction.unitsRemaining` instead of `ballsRemaining`
- Review `docs/ONBOARDING.md` for new patterns and conventions
- Use two-tier helper system for new order mutations (pure vs ctx-dependent)

**For Database:**
- No migration needed - production records already backfilled in Phase 2
- Old `ballsRemaining` data is ignored (field no longer exists in schema)

### Performance Impact:

**Positive:**
- Removed dual-write overhead in ball distribution (2x faster writes)
- Added indexes improve query performance by ~40% (composite lookups)
- Single source of truth eliminates data inconsistency bugs

**Commits:**
- See branch: `refactor/phase4-polish`

---

## 2026-02-02 - Order UX Improvements & WhatsApp Template Fixes

**Multiple small improvements to order management and WhatsApp messaging**

### Features Added:

**1. Product Names in Production Progress**
- Replaced generic "Big Ball/Mid Ball" labels with actual product names
- Production progress now shows specific products: "Original", "Bite Sized Triple", etc.
- Added "Go to Kitchen" button in Production step for quick navigation
- Improved visibility of what's being produced

**Files Modified:**
- `src/pages/OrderDetail.tsx` - Production progress display

### Bug Fixes:

**2. Multi-line Customer Info Parsing**
- Fixed order template parser to handle WhatsApp messages where customer info appears on line after label
- Now correctly parses: `"Alamat:\nJl Green Garden..."` format
- Handles phone, name, and address fields with line breaks

**Files Modified:**
- `src/lib/orderTemplateParser.ts` - Parser logic

**3. WhatsApp Template Cleanup**
- Removed placeholder BCA bank details from order template customers fill in
- Payment request message still includes real bank info
- Updated greeting for Dubai Chewy Cookie product

**Files Modified:**
- `convex/orders/whatsapp.ts` - WhatsApp templates

**4. Kitchen View Completion Flow**
- Added `markAllItemPackagesPacked` mutation for batch marking packages as packed
- Added "Mark all (X) as packaged" button per product row in Kitchen View
- Fixed order completion flow - orders stay visible after completion for better tracking
- Removed redundant `isCompleted` prop, derive status from `order.status`
- Replaced exit animation with layout-based reordering for smoother transitions
- Renamed "Undo Complete" button to "Return to Packaging" for clarity
- Improved due date display: "Today", "Tomorrow", or "Fri 09:00 (4d)"
- Fixed dark mode opacity for package cards and draft orders (30%)
- Changed payment button text to "Confirmation invoice sent..." for accuracy

**Files Modified:**
- `convex/orders/mutations.ts` - New mutation for batch packaging
- `src/pages/KitchenView.tsx` - Improved completion flow
- `src/components/orders/OrderBox.tsx` - Batch packaging UI
- `src/components/orders/ProductPackage.tsx` - Dark mode fixes

**Commits:**
- `a83360e` - feat(orders): show product names in production progress and add kitchen link
- `8da9504` - fix(orders): handle multi-line customer info in order parser
- `6307541` - fix(whatsapp): update order template greeting for Dubai Chewy Cookie
- `7f8d575` - feat(kitchen): improve order completion flow and add batch packaging
- `e8f9761` - fix(whatsapp): remove template BCA details from order template

---

## 2026-02-02 - Dual-Write System Removal: NEW Production Tracking

**Migrated Kitchen View production tracking from OLD system (`ballsRemaining`) to NEW system (`orderItemProduction`).**

The ball distribution algorithm now uses `orderItemProduction.unitsRemaining` as the source of truth instead of `orderItems.ballsRemaining`. This eliminates the dual-write overhead and simplifies the codebase.

**Summary:**
- **Database writes reduced**: ~50% fewer writes during ball operations
- **Source of truth**: `orderItemProduction` table
- **Deprecated**: `ballsRemaining` field (kept for backward compatibility)

**Key Changes:**

1. **Phase A - Verification**: Audited all `ballsRemaining` references (42 across 8 files)
2. **Phase B - Completion Logic**: Switched order completion check to use NEW system
3. **Phase C - Write Migration**:
   - Rewrote `distributeBallsToOrders()` to use NEW system as source of truth
   - Removed deprecated writes from `completeOrder` and `revertToConfirmed`
   - Updated frontend types to use `productionUnits` and `ballsFilled`
4. **Phase D - Documentation**: Updated schema, SCHEMA.md, marked deprecations

**Files Modified:**
- `convex/orders/helpers/ballDistribution.ts` - Complete rewrite using NEW system
- `convex/orders/mutations.ts` - Removed deprecated ballsRemaining writes
- `convex/schema.ts` - Marked ballsRemaining as deprecated
- `src/components/orders/PackageStatusDisplay.tsx` - Use productionUnits for total
- `src/hooks/convex/useKitchenStats.ts` - Added ballsFilled transform
- `src/lib/types.ts` - Added balls_filled, marked balls_remaining deprecated

**Migration Notes:**
- Existing orders with `ballsRemaining` data will continue to display correctly
- New orders use only `orderItemProduction` for tracking
- No data migration required - both systems coexist
- `backfillOrderItemProduction` mutation available if needed

**Branch:** `refactor/remove-dual-write`

---

## 2026-02-02 - Orders Mutations Refactoring: Helper Extraction

**Major refactoring of `convex/orders/mutations.ts` to improve maintainability and reduce duplication.**

The 2,010-line mutations file was refactored by extracting repeated patterns into a new `convex/orders/helpers/` directory. This creates a two-tier helper system: pure functions (no ctx) in `helpers.ts` and ctx-dependent database operations in `helpers/*.ts`.

**Summary:**
- **mutations.ts**: 2,010 → 1,405 lines (30% reduction)
- **New helper modules**: 820 lines across 5 files
- **Net change**: +243 lines of well-organized, documented code

**New Helper Modules Created:**

| File | Lines | Purpose |
|------|-------|---------|
| `helpers/ballDistribution.ts` | 309 | Core ball distribution algorithm (dual-write) |
| `helpers/statusTransitions.ts` | 164 | Status constants, audit logging, transitions |
| `helpers/usageTracking.ts` | 105 | Channel/agency usage tracking |
| `helpers/productionRecords.ts` | 237 | Production record CRUD operations |
| `helpers/index.ts` | 5 | Barrel export |

**Key Changes:**

1. **Phase 1**: Consolidated `calculateLineTotals` and `recalculateFinalTotal` into existing `helpers.ts`
2. **Phase 2**: Extracted `distributeBallsToOrders()` consolidating `completeBalls` and `addBallsToTray` (~430 lines of duplication eliminated)
3. **Phase 3**: Created `statusTransitions.ts` with `TERMINAL_STATUSES`, `isTerminalStatus()`, `logOrderEvent()`, and transition helpers
4. **Phase 4**: Consolidated 4 usage tracking functions into generic `updateUsageCount()` pattern
5. **Phase 5**: Extracted production record helpers for CRUD operations

**Files Modified:**
- `convex/orders/mutations.ts` - Imports from helpers, thin mutation wrappers
- `convex/orders/helpers.ts` - Added `recalculateFinalTotal()`
- `convex/orders/helpers/` - New directory with 5 helper modules

**Benefits:**
- Single source of truth for ball distribution logic
- Type-safe status checks with `isTerminalStatus()`
- Reusable production record operations
- Easier testing of isolated helper functions
- Clearer separation of concerns

**Branch:** `refactor/orders-mutations-helpers`

---

## 2026-02-02 - Kitchen View UI Fixes & Flying Ball Animation

**Bug Fixes & UI Improvements for Kitchen View**

Fixed critical ball accumulation bug and improved visual feedback with flying ball animations and UI polish.

**CRITICAL FIX - Ball Accumulation Bug:**

The `addBallsToTray` mutation had a bug where balls would reset instead of accumulating. Root cause: the NEW system dual-write loop used `args.count` instead of the already-decremented `remainingBalls` from the OLD system.

```typescript
// BUG (3 locations in mutations.ts):
let remainingForNewSystem = args.count;  // Wrong - ignores OLD system decrements

// FIX:
let remainingForNewSystem = remainingBalls;  // Correct - uses what remains after OLD system
```

**UI Improvements:**

1. **ProductPackage Styling** - White backgrounds with thick (3px) colored status borders:
   - Empty: gray border
   - Filling: orange border (was red)
   - Filled: yellow border
   - Packed: green border

2. **Package Grouping** - Packages now grouped by product name with row headers in OrderBox

3. **KitchenHelpPanel Contrast** - Improved background from `bg-blue-50` to `bg-blue-100`

4. **InventoryTray Layout** - Refactored to 5x5 egg tray grid layout (25 max visible balls)

**New Feature - Flying Ball Animation:**

When balls are added to the tray and allocated to orders, animated balls fly from the tray to the orders section with:
- Arc trajectory using Framer Motion keyframes
- Staggered delays for multiple balls
- 3D ball rendering matching design spec (pistachio green #93C572, chocolate brown #7B3F00 stroke)

**New Component:**

| File | Purpose |
|------|---------|
| `src/components/orders/FlyingBall.tsx` | Flying ball animation from tray to orders |

**Files Modified:**

- `convex/orders/mutations.ts` - Fixed ball accumulation bug (lines 1260, 1623, 1683, 1747)
- `src/components/orders/ProductPackage.tsx` - White backgrounds, 3px borders, optional product name
- `src/components/orders/OrderBox.tsx` - Added `groupPackagesByProduct()`, row headers
- `src/components/orders/KitchenHelpPanel.tsx` - Better contrast
- `src/components/orders/InventoryTray.tsx` - 5x5 grid layout, forwardRef
- `src/components/orders/index.ts` - Added FlyingBall export
- `src/pages/KitchenView.tsx` - Flying ball animation integration

**Branch:** `fix/kitchen-view-ui-issues`

---

## 2026-02-02 - PRD-7: OrderDetail Accordion Stepper Redesign

**Feature: Accordion-Style Vertical Stepper for Order Management**

Complete redesign of the OrderDetail page with an accordion-style vertical stepper UI, replacing the previous dropdown-based status management.

**Key Changes:**

1. **New Accordion Stepper UI** - Left 2/3 shows order progress as expandable steps, right 1/3 shows order info
2. **Automatic Status Transitions** - Kitchen View triggers status changes automatically:
   - Confirmed → InProduction (first ball filled)
   - InProduction → Packaging (all balls complete)
   - Packaging → WaitingShipment/WaitingPickup (all items packed)
3. **New `InProduction` Status** - Tracks when kitchen actively starts production (now 11 statuses total)
4. **Usage-Based Button Selectors** - Channel and shipping agency buttons show top 4 most-used options
5. **Enhanced Cancellation Dialog** - 3-step flow with reason selection, impact review, and safety confirmation
6. **9 New Order Components** - Modular accordion step components with Framer Motion animations

**New Backend Tables (3 tables):**

- `channelUsage` - Tracks channel usage count per user for smart button ordering
- `shippingAgencyUsage` - Tracks shipping agency usage count per user
- `orderEvents` - Audit log for order status changes with timestamps

**Schema Changes:**

```typescript
// New status added to union
status: v.union(
  ...,
  v.literal("InProduction"),  // NEW - between Confirmed and Packaging
)

// New cancellation fields on orders
cancellationReason: v.optional(v.string()),
cancellationCategory: v.optional(v.string()),  // CustomerRequest, OutOfStock, etc.
cancelledAt: v.optional(v.number()),
cancelledBy: v.optional(v.string()),

// New tables
channelUsage: defineTable({
  channel: v.string(),
  userId: v.string(),
  usageCount: v.number(),
}).index("by_user_channel", ["userId", "channel"])
  .index("by_user_count", ["userId", "usageCount"])

shippingAgencyUsage: defineTable({
  agency: v.string(),
  userId: v.string(),
  usageCount: v.number(),
}).index("by_user_agency", ["userId", "agency"])
  .index("by_user_count", ["userId", "usageCount"])

orderEvents: defineTable({
  orderId: v.id("orders"),
  eventType: v.string(),
  fromStatus: v.optional(v.string()),
  toStatus: v.optional(v.string()),
  metadata: v.optional(v.any()),
  createdAt: v.number(),
  createdBy: v.string(),
}).index("by_order", ["orderId"])
  .index("by_type", ["eventType"])
```

**New Backend Functions:**

```typescript
// Channel usage tracking
channels.getTopChannels({ userId, limit })    // Returns top N channels by usage
channels.incrementUsage({ channel, userId })  // Increment usage count

// Shipping agency usage tracking
shipping.getTopAgencies({ userId, limit })    // Returns top N agencies by usage
shipping.incrementUsage({ agency, userId })   // Increment usage count

// Order mutations (updated)
orders.updateStatus()     // Now logs to orderEvents, triggers auto-transitions
orders.cancelOrder()      // Enhanced with category, notes, impact calculation
```

**New Frontend Components (9 files in `src/components/orders/`):**

| Component | Purpose | Lines |
|-----------|---------|-------|
| `OrderStatusAccordion.tsx` | Main accordion with step rendering | 261 |
| `AccordionStepItem.tsx` | Individual step with expand/collapse | 186 |
| `StepWhatsAppTemplate.tsx` | WhatsApp template in step content | 179 |
| `ChannelButtons.tsx` | Usage-based channel selector | 208 |
| `ShippingAgencyButtons.tsx` | Usage-based agency selector | 174 |
| `PaymentMethodButtons.tsx` | Payment method buttons | 133 |
| `ProductionProgress.tsx` | Ball completion progress display | 162 |
| `PackageStatusDisplay.tsx` | Package status checklist | 240 |
| `EnhancedCancellationDialog.tsx` | 3-step cancellation flow | 400 |

**New UI Components (3 shadcn/ui components):**

- `src/components/ui/dropdown-menu.tsx` - For "show all" channel/agency dropdown
- `src/components/ui/progress.tsx` - For production progress bars
- `src/components/ui/radio-group.tsx` - For cancellation reason selection

**Files Modified:**

- `convex/schema.ts` - InProduction status, 3 new tables, cancellation fields (+59 lines)
- `convex/orders/mutations.ts` - Auto-transitions, audit logging (+374 lines)
- `convex/channels/queries.ts` & `mutations.ts` - Channel usage tracking (NEW)
- `convex/shipping/queries.ts` & `mutations.ts` - Shipping usage tracking (NEW)
- `src/pages/OrderDetail.tsx` - Complete rebuild with accordion stepper (+497 lines, -237 lines)
- `src/hooks/convex/useOrders.ts` - Added usage tracking hooks

**Total: 29 files changed, +3,596 additions, -237 deletions**

**Visual Testing Verified:**

- ✅ Accordion expands/collapses correctly with animations
- ✅ Status indicators show completed (green), current (blue), pending (gray) states
- ✅ Package status displays in expanded Packaging step
- ✅ Channel selector with usage-based buttons + dropdown for all options
- ✅ 3-step cancellation dialog with impact review
- ✅ Mobile responsive layout with 44px touch targets

**Branch:** `feature/order-detail-accordion-stepper`

---

## 2026-02-01 - Schema Review & Critical Bug Fixes

**Comprehensive Convex Schema Audit & Fixes**

Performed full schema review before Monday deployment. Found and fixed 7 issues including 2 critical bugs.

**CRITICAL FIXES:**

1. **Dashboard Status Mismatch** - Dashboard was checking for `"Complete"` and `"Delivered"` statuses that DON'T EXIST in schema. Active order counts were WRONG.
   - Fixed: Now correctly uses `"CompleteShipped"`, `"PickedUp"`, `"Cancelled"` as terminal statuses
   - Files: `convex/dashboard/queries.ts` (lines 45, 133)

2. **Order Number Race Condition** - `generateOrderNumber()` could create duplicate order numbers under concurrent load.
   - Fixed: Now uses max sequence tracking, uniqueness verification, and retry logic
   - File: `convex/orders/mutations.ts` (lines 23-62)

**HIGH PRIORITY FIXES:**

3. **WhatsApp Status Labels** - Status label maps had wrong values (`"Production"`, `"Ready"`, `"Shipped"`, `"Delivered"` instead of actual schema statuses).
   - Fixed: Updated both files to use all 10 correct schema statuses
   - Files: `convex/orders/whatsapp.ts`, `convex/orders/whatsappHelpers.ts`

4. **Missing menuProductId Index** - Kitchen View was doing full table scans for ball tracking.
   - Fixed: Added `.index("by_menu_product", ["menuProductId"])` to orderItems
   - File: `convex/schema.ts`

5. **N+1 Query Pattern in Kitchen Stats** - `getKitchenStats()` and `getCompletedToday()` were making 50+ queries for 50 orders.
   - Fixed: Batch fetch all orderItems first, group by orderId for O(1) lookup
   - File: `convex/orders/queries.ts` (reduced from N+1 to 2-3 queries)

**MEDIUM PRIORITY FIXES:**

6. **Feedback Hook Exports** - Verified already in place (false positive from exploration).

7. **Redundant Index Removed** - Removed `by_due_date` index (covered by `by_status_due_date`).
   - File: `convex/schema.ts`

**Files Modified:**
- `convex/schema.ts` - Added index, removed redundant index
- `convex/dashboard/queries.ts` - Fixed terminal status array
- `convex/orders/mutations.ts` - Fixed order number generation
- `convex/orders/queries.ts` - Optimized N+1 queries
- `convex/orders/whatsapp.ts` - Fixed status labels
- `convex/orders/whatsappHelpers.ts` - Fixed status labels

**Verification:**
- TypeScript type-check: Passed
- Production build: Passed
- All changes backwards compatible

**Deployment:**
```bash
npx convex deploy  # Apply schema changes including new index
```

---

## 2026-02-01 - PRD-3: Order Form POS (Order System V2 Complete)

**Feature: POS-Style Order Form with Template Parsing**

Final phase of Order System V2. Replaces the old order form with a POS-style interface optimized for the WhatsApp copy/paste workflow used by the Frollie team.

**New Components (6 files):**
- `src/components/orders/ProductButtons.tsx` - 2x2 grid of fixed products (tap = +1, long-press = qty dialog)
- `src/components/orders/PasteTemplateBox.tsx` - Textarea with Paste + Parse buttons for WhatsApp templates
- `src/components/orders/DiscountInput.tsx` - Linked Rp/% inputs with >30% warning
- `src/components/orders/DeliveryToggle.tsx` - Pickup/Delivery segmented control
- `src/components/orders/OrderFormPOS.tsx` - 9-section composite form
- `src/components/ui/alert.tsx` - shadcn/ui Alert component for feedback

**Template Parser:**
- `src/lib/orderTemplateParser.ts` - WhatsApp template parsing utility
- Bracket format: `1. Original (80g) - Rp 50.000 [2]`
- Keyword fallback: `2x Original`, `Original: 2`
- Extracts customer info (phone, name, address)
- Returns ParseResult with items, customer, warnings

**Backend Changes:**
- `convex/schema.ts` - Added `finalTotal` field to orders
- `convex/orders/mutations.ts` - Added discount support to `create` mutation, added `updateOrderDiscount` mutation with terminal state protection

**Hook Updates:**
- `src/hooks/convex/useMenuProducts.ts` - Added `FixedProduct` interface and `useConvexFixedProducts` hook
- `src/hooks/convex/useOrders.ts` - Added `useConvexUpdateOrderDiscount` hook
- `src/hooks/convex/index.ts` - New exports

**Type Updates:**
- `src/lib/types.ts` - Added `OrderLineItem`, `OrderFormData` interfaces

**Integration:**
- `src/pages/OrderManager.tsx` - Replaced old `OrderForm` with `OrderFormPOS` in all three responsive layouts

**Order Form POS Sections:**
1. Template (copy/paste workflow with feedback alerts)
2. Products (2x2 buttons + line items with qty controls)
3. Customer (search/create)
4. Delivery (toggle + address input)
5. Dates (order date readonly, due date picker)
6. Notes (textarea)
7. Discount (linked Rp/% with warning)
8. Totals (subtotal, discount, final)
9. Submit (Cancel + Create Order buttons)

**Multi-Agent Implementation:**
- `cto-orchestrator` - Strategic coordination
- `convex-backend` - Backend mutations
- `general-purpose` - Template parser utility
- `react-ui-builder` (x5) - UI components

**Order System V2 Complete:**
- [x] PRD-0: Schema Foundation (unions, fixed products, message tracking)
- [x] PRD-1: Kitchen Core (dashboard, order cards, basic completion)
- [x] PRD-2: Kitchen Gamification (ball buttons, sounds, confetti)
- [x] PRD-3: Order Form POS (product buttons, template parser, discount input)

**Branch:** `feature/order-form-pos`

---

## 2026-02-01 - PRD-2: Kitchen Gamification

**Order System V2 - Ball Completion Buttons, Sounds, Confetti**

Added gamification to Kitchen View: hold-to-activate ball completion buttons, Web Audio synthesized sounds, and confetti celebration on order completion.

**Backend Mutation:**
- `completeBalls({ ballType, count })` - Batch ball completion with overflow logic
  - Applies balls to highest-priority order first
  - Auto-completes orders when all items reach 0
  - Returns: `{ completedOrderIds, ballsUsed, overflow }`

**Sound Effects (Web Audio API - no external files):**
- `playDing()` - Ball landing sound (800Hz, 100ms)
- `playCompletionFanfare()` - Three-tone celebration
- `getSoundsEnabled()` / `setSoundsEnabled()` - LocalStorage persistence

**Frontend Components:**
- `BallCompletionButtons.tsx` - 4 hold-buttons (+1/+5 Big, +1/+5 Mid) with progress indicators
- `SoundToggle.tsx` - Speaker icon mute/unmute toggle

**Celebration Effects:**
- Confetti animation via canvas-confetti library
- Staggered ding sounds during ball completion
- Toast notifications with completion summary

**Dependencies Added:**
- `canvas-confetti` (production)
- `@types/canvas-confetti` (dev)

**Files Created:**
- `src/lib/kitchenSounds.ts`
- `src/components/orders/BallCompletionButtons.tsx`
- `src/components/orders/SoundToggle.tsx`

**Files Modified:**
- `convex/orders/mutations.ts` - completeBalls mutation (+137 lines)
- `src/hooks/convex/useKitchenStats.ts` - useConvexCompleteBalls hook
- `src/pages/KitchenView.tsx` - Full gamification integration

---

## 2026-01-31 - PRD-1: Kitchen Core

**Order System V2 - Production Dashboard & Order Cards**

Built the Kitchen View with production dashboard showing ball counts, order cards with urgency indicators, and hold-to-complete functionality.

**Backend Queries:**
- `getKitchenOrders()` - Confirmed orders with calculated ball needs, sorted by priority
- `getKitchenStats()` - Aggregated ball counts (big/mid needed/completed), order counts
- `getCompletedToday()` - Orders completed since midnight

**Backend Mutations:**
- `completeOrder(orderId)` - Mark order ProductionComplete, zero all ballsRemaining
- `revertToConfirmed(orderId)` - Undo completion, restore ballsRemaining

**Frontend Components:**
- `KitchenDashboard.tsx` - 3-column stats (Big Balls, Mid Balls, Orders) with progress bars
- `KitchenOrderCard.tsx` - Order card with large ball counts, urgency states, hold-to-complete

**Urgency States:**
- **Overdue** (dueTime < now): Red pulsing border, "OVERDUE" badge
- **Urgent** (due within 2 hours): Amber pulsing border, "URGENT" badge

**Priority Sorting:** dueDate ASC → totalUnits DESC → orderDate ASC

**Files Created:**
- `src/components/orders/KitchenDashboard.tsx`
- `src/components/orders/KitchenOrderCard.tsx`
- `src/hooks/convex/useKitchenStats.ts`

**Files Modified:**
- `convex/orders/queries.ts` - 3 new queries
- `convex/orders/mutations.ts` - 2 new mutations
- `src/pages/KitchenView.tsx` - Complete refactor
- `src/lib/types.ts` - KitchenStats, KitchenOrder interfaces

---

## 2026-01-30 - PRD-0: Schema Foundation

**Order System V2 - Database Schema Hardening**

Hardened the database schema with proper type enforcement, added fields for Kitchen View features, and seeded fixed products with COGS values.

**Schema Changes:**
- Order status union (10 statuses): Draft, AwaitingPayment, Confirmed, ProductionComplete, Packaging, WaitingShipment, CompleteShipped, WaitingPickup, PickedUp, Cancelled
- Payment status union: Unpaid, Partial, Paid
- Order-level discount fields: `orderLevelDiscount`, `orderLevelDiscountType`
- MenuProducts fixed product support: `isFixed`, `unitCost`
- OrderItems ball tracking: `productionType`, `productionUnits`, `ballsRemaining`
- New `orderMessages` table for WhatsApp deduplication

**Fixed Products Seeded (menuProducts:seedFixedProducts):**

| Code | Name | Grams | Price | COGS |
|------|------|-------|-------|------|
| ORIGINAL | Original | 80g | Rp 50k | Rp 19,231 |
| BITE_SINGLE | Bite Sized Single | 45g | Rp 35k | Rp 12,422 |
| BITE_DOUBLE | Bite Sized Double | 90g | Rp 70k | Rp 24,843 |
| BITE_TRIPLE | Bite Sized Triple | 135g | Rp 99k | Rp 36,765 |

**WhatsApp Message Tracking:**
- `markMessageSent()` - Deduplication with 5-minute window
- `getMessageHistory()` - Sent message audit trail
- `getOrderTemplate()` - Clean template with product list + bank info

**Files Modified:**
- `convex/schema.ts` - Status unions, discount fields, ball tracking, orderMessages table
- `convex/menuProducts/mutations.ts` - seedFixedProducts mutation
- `convex/orders/whatsapp.ts` - Message tracking functions

---

## 2026-01-31 - WhatsApp Template Tabs with Bilingual Support

**Feature: Tabbed WhatsApp Message Templates**

Refactored WhatsApp Messages panel with a tabbed interface for different workflow stages and added Bahasa/English language toggle.

**New Tabs (mapped to order workflow):**
1. **Order Confirmation** (Konfirmasi) - Always visible, for Draft -> AwaitingPayment
2. **Payment Received** (Pembayaran) - Visible after Draft status
3. **Delivery Confirmation** (Pengiriman) - Visible at delivery/pickup stages
4. **Thank You** (Terima Kasih) - Visible at completion, includes social media links

**Features:**
- Language toggle (Bahasa/English) in panel header - Bahasa is default
- Templates auto-generate with order data (customer name, items, totals, etc.)
- Editable text before copying with Reset button
- Conditional tab visibility based on order status
- Clickable social media links in Thank You template:
  - Instagram/TikTok: @Frollie.id
  - Founder journey: @EtengandTJ

**Architecture:** Frontend generation for instant preview and language switching (no API calls)

**Files Modified:**
- `src/lib/types.ts` - Added WhatsAppTemplateTab, WhatsAppLanguage types
- `src/lib/whatsappTemplates.ts` - NEW: Template strings and generator functions
- `src/components/orders/OrderWhatsAppPanel.tsx` - Refactored with tabs and language toggle
- `src/pages/OrderDetail.tsx` - Simplified props to pass order object

---

## 2026-01-31 - Comprehensive Test Suite Implementation

**Multi-Agent Test Implementation (184 tests across 11 files)**

Implemented a complete test suite using a parallel multi-agent approach for maximum efficiency.

**Backend Unit Tests (51 tests):**
- `convex/lib/__tests__/costCalculator.test.ts` - Unit conversion, cost calculations (24 tests)
- `convex/orders/__tests__/orderHelpers.test.ts` - Order number generation, line totals (14 tests)
- `convex/orders/__tests__/whatsapp.test.ts` - Message formatting functions (13 tests)

**Convex Integration Tests (70 tests):**
- `tests/convex/recipes.test.ts` - Creation, versioning, deletion rules, linked costs (28 tests)
- `tests/convex/products.test.ts` - COGS calculation, version pinning (14 tests)
- `tests/convex/orders.test.ts` - Order creation, status transitions (16 tests)
- `tests/convex/tags.test.ts` - Default tag seeding, idempotency (12 tests)

**Frontend Tests (63 tests):**
- `src/lib/__tests__/utils.test.ts` - cn, formatCurrency, formatNumber, formatPercent (25 tests)
- `src/components/shared/__tests__/CostTooltip.test.tsx` - Tooltip rendering, null handling (8 tests)
- `src/components/shared/__tests__/ConfirmDialog.test.tsx` - Dialog interactions, loading states (10 tests)
- `src/hooks/__tests__/useConvexHooks.test.tsx` - Hook behavior, loading states (20 tests)

**Coverage Results:**
- `costCalculator.ts`: 100%
- `utils.ts`: 100%
- `helpers.ts`: 100%

**Business Rules Coverage:**
All 8 business rules from CLAUDE.md have explicit test coverage:
1. Unit conversion (kg→g, l→ml, m→cm)
2. Version immutability
3. Linked components cost inheritance
4. Product pinning to versions
5. Reusable = single component only
6. Deletion blocking rules
7. Default tag seeding
8. Order number MMDD-NNN format

**Infrastructure Added:**
- `vitest.config.ts` - Vitest configuration with jsdom environment
- `tests/setup.ts` - Test setup with jest-dom matchers
- `tests/fixtures/` - Shared test fixtures for ingredients and orders
- `convex/orders/helpers.ts` - Extracted pure functions for testability
- `convex/orders/whatsappHelpers.ts` - Extracted WhatsApp formatting functions

**Dependencies Added:**
- vitest, @vitest/coverage-v8
- @testing-library/react, @testing-library/jest-dom, @testing-library/user-event
- convex-test, jsdom

**Scripts Added:**
- `npm test` - Run all tests
- `npm run test:watch` - Watch mode
- `npm run test:coverage` - Coverage report
- `npm run test:ui` - Vitest UI

---

## 2026-01-30 - Complete Convex Migration & Documentation Update

**Full Backend Migration to Convex**

Migrated the entire backend from FastAPI + PostgreSQL to Convex, a real-time serverless database platform.

**Architecture Changes:**
- Removed FastAPI backend (`api/` directory)
- Removed PostgreSQL/SQLite database dependencies
- Removed React Query for data fetching
- Added Convex as the sole backend (queries, mutations, database)
- Frontend now uses Convex React hooks (`useQuery`, `useMutation`)

**Backend Implementation (convex/):**
- `schema.ts` - 19 tables with indexes and validators
- `lib/costCalculator.ts` - Cost calculation helper functions
- 10 entity folders with queries and mutations:
  - `ingredients/`, `materials/`, `tags/`, `menuProducts/`
  - `recipes/`, `packaging/`, `products/`
  - `customers/`, `orders/`, `dashboard/`
- `orders/whatsapp.ts` - WhatsApp message templates

**Frontend Migration:**
- Replaced all React Query hooks with Convex hooks
- Updated 11 hook files in `src/hooks/convex/`
- Updated all page components to use Convex API
- Removed axios and react-query dependencies

**Documentation Overhaul:**
- Updated `CLAUDE.md` for Convex architecture
- Rewrote `docs/SCHEMA.md` with Convex schema definitions
- Rewrote `docs/CODE_STYLE.md` with Convex patterns (removed Python)
- Rewrote `docs/API_REFERENCE.md` as Convex Functions Reference
- Rewrote `docs/DEPLOYMENT.md` for Convex deployment
- Updated `docs/WORKFLOW.md` for Convex development
- Updated `docs/ROADMAP.md` with Phase 5 (Convex Migration)

**Benefits:**
- Real-time data sync across all connected clients
- Simplified architecture (no separate API server)
- Type-safe database operations end-to-end
- Automatic scaling without server management
- Reduced deployment complexity

**Files Removed:**
- `api/` directory (FastAPI backend)
- `api/scripts/migrate_sqlite_to_pg.py`
- All SQLAlchemy models and Pydantic schemas

**Dependencies Changed:**
- Added: `convex` (^1.31.7)
- Removed: `@tanstack/react-query`, `axios`

**Migration Steps (for existing deployments):**
1. Deploy Convex backend: `npx convex deploy`
2. Set `VITE_CONVEX_URL` environment variable
3. Build and deploy frontend
4. Seed data via Convex dashboard

---

## 2026-01-30 - Production Database Seeding Endpoints

**Admin Endpoints for Vercel/Neon.tech Database Management**

Added three admin endpoints to fix production database seeding issues on Vercel serverless:
- `GET /api/admin/db-check?secret=<ADMIN_SECRET>` - Diagnose database connection and check seed status
- `POST /api/admin/seed-only?secret=<ADMIN_SECRET>` - Seed menu products and tags (for when tables exist but are empty)
- Enhanced `POST /api/admin/init-db?secret=<ADMIN_SECRET>` - Create tables and seed data with detailed error reporting

**Security Improvements:**
- All admin endpoints secured with `ADMIN_SECRET` environment variable (must be set in Vercel)
- Proper HTTP status codes: 403 Forbidden, 503 Service Unavailable, 500 Internal Server Error
- Database credential masking in error responses
- Audit logging for all admin actions

**Code Quality:**
- Extracted reusable `seed_default_data()` function in `api/app/database.py`
- Eliminated code duplication between `init_db()` and admin endpoints
- Added type hints to all admin endpoints
- Consistent FastAPI dependency injection patterns

**Files Modified:**
- `api/app/main.py` - Added 3 admin endpoints (+109 lines)
- `api/app/database.py` - Refactored seeding logic into reusable function
- `.env.example` - Documented `ADMIN_SECRET` configuration

**Why This Was Needed:**
- Vercel serverless uses `lifespan="off"` in `api/index.py`, preventing automatic database seeding on cold starts
- Manual endpoints allow operators to seed production database after deployment

**Migration Steps:**
1. Set `ADMIN_SECRET` environment variable in Vercel dashboard (generate a strong random string)
2. After deployment, call `https://your-app.vercel.app/api/admin/init-db?secret=<your-secret>`
3. Verify seeding with `https://your-app.vercel.app/api/admin/db-check?secret=<your-secret>`

---

## 2026-01-30 - Documentation Refactor

**CLAUDE.md Split into Modular Documentation**
- Refactored monolithic CLAUDE.md (~2,230 lines) into focused documentation files
- Created `docs/` directory with 7 specialized documents:
  - `SCHEMA.md` - Database schema and data flows
  - `API_REFERENCE.md` - API endpoints and response formats
  - `CODE_STYLE.md` - Coding conventions and patterns
  - `WORKFLOW.md` - Git workflow and code review process
  - `DEPLOYMENT.md` - Production deployment guide
  - `CHANGELOG.md` - Version history (this file)
  - `ROADMAP.md` - Future plans and backlog
- CLAUDE.md now serves as concise entry point (~450 lines)

**Benefits:**
- Reduced main documentation from ~25,000 to ~5,000 tokens
- Agents can load only relevant documentation for their task
- Changelog can grow independently without bloating main file
- Clearer organization by concern type

---

## 2026-01-30 - Production Deployment & Migration Infrastructure

**Monolithic Restructure for Vercel Deployment**
- Restructured project from separate frontend/backend to monolithic layout
- Moved `backend/` → `api/` for Vercel serverless functions compatibility
- Moved `frontend/src/` → `src/` and `frontend/` root files to project root
- All imports and paths updated across the codebase
- Benefits: Single deployment, simplified CORS, better cold start performance

**Vercel Configuration**
- Added `vercel.json` with rewrites for SPA routing and API routes
- Added `api/index.py` with Mangum ASGI adapter for FastAPI on Vercel
- Build configuration: `vite build` outputs to `dist/`
- API routes: `/api/*` → serverless functions in `api/`
- SPA fallback: all other routes → `index.html`

**PostgreSQL Support (Dual Database)**
- Added PostgreSQL database support alongside SQLite for production
- Uses `NullPool` for serverless environments (no connection pooling)
- Environment variables:
  - `DATABASE_URL` - PostgreSQL connection string (production)
  - `SQLITE_PATH` - SQLite file path (local dev, default: `api/data/malo_recipes.db`)
- Auto-detects database type from `DATABASE_URL` prefix (`postgresql://`)
- SQLite remains default for local development

**Migration Script (SQLite → PostgreSQL)**
- Created `api/scripts/migrate_sqlite_to_pg.py` - Full data migration tool
- Features:
  - Preserves all data, relationships, and constraints
  - Handles foreign key dependencies with correct insertion order
  - Validates data integrity after migration
  - Dry-run mode for testing
  - Detailed progress logging
- Usage: `python api/scripts/migrate_sqlite_to_pg.py --sqlite-path <path> --postgres-url <url>`
- Documentation: `api/scripts/MIGRATION_README.md`

**Environment Configuration Updates**
- Added `.env.example` with all required variables for production
- Updated `api/database.py` to support both SQLite and PostgreSQL
- Updated `api/main.py` CORS configuration for production domains
- Added production-ready logging configuration

**Files Modified:**
- Project structure: 144 files moved/renamed
- Backend: `api/database.py`, `api/main.py`, `api/requirements.txt` (+3 dependencies)
- Frontend: `vite.config.ts` (proxy configuration), `package.json` (build scripts)
- New files: `vercel.json`, `api/index.py`, `api/scripts/migrate_sqlite_to_pg.py`, `api/scripts/MIGRATION_README.md`

---

## 2026-01-30 - UI/UX Enhancements for Order Management

**OrderDetail Component Refactor (906 → 363 lines)**
- Split monolithic OrderDetail.tsx into focused, reusable components
- Created `components/orders/` directory with 7 specialized components:
  - `OrderHeader.tsx` - Order number, status badge, timestamps (200 lines)
  - `OrderStatusPanel.tsx` - Status transitions with confirmation dialogs (103 lines)
  - `OrderWhatsAppPanel.tsx` - WhatsApp templates with copy buttons (107 lines)
  - `ShippingDialog.tsx` - Shipping info form (agency, tracking) (102 lines)
  - `CancellationDialog.tsx` - Cancellation reason input (60 lines)
  - `ConfirmationDialog.tsx` - Status transition confirmations (187 lines)
  - `OrderItems.tsx` - Order line items table (79 lines)
  - `index.ts` - Barrel export for clean imports

**Component Architecture Improvements**
- Separation of concerns: Each component handles one responsibility
- Reusable confirmation dialogs for all status transitions
- Dedicated shipping dialog with agency dropdown and tracking input
- WhatsApp panel with collapsible sections for each template type
- Empty state component added to `components/shared/EmptyState.tsx`

**UI/UX Enhancements**
- Added accordion component (`components/ui/accordion.tsx`) for collapsible sections
- Improved order items table with better spacing and readability
- Better visual hierarchy with consistent badge colors and spacing
- Simplified OrderDetail main component for better maintainability

**Files Modified:**
- Frontend: `pages/OrderDetail.tsx` (refactored), `pages/OrderManager.tsx` (enhanced), `pages/KitchenView.tsx` (refined)
- New components: 7 files in `components/orders/`
- New shared component: `components/shared/EmptyState.tsx`
- New UI component: `components/ui/accordion.tsx`

---

## 2026-01-30 - Order Workflow Enhancements (3-Phase Implementation)

**Phase 1: WhatsApp Confirmation Prompts**
- Added confirmation dialog for Draft → AwaitingPayment transition
- Requires "WhatsApp sent" checkbox before advancing
- Added contextual WhatsApp templates for each status transition:
  - `format_payment_request()` - Payment request with bank details
  - `format_production_started()` - Production notification
  - `format_delivery_complete()` - Delivery confirmation
- OrderDetail response now includes all template texts

**Phase 2: Kitchen View**
- Created `KitchenView.tsx` - Production-focused order management page
- Status-grouped order cards: To Produce, Production Complete, Packaging, Ready
- Quick-action buttons to advance orders to next status
- Date filter with overdue order highlighting (red)
- Added `GET /api/orders/kitchen` endpoint
- Added navigation link in Header

**Phase 3: AwaitingPayment Status**
- Added AwaitingPayment status between Draft and Confirmed (now 10-status workflow)
- Added `awaiting_payment_since` timestamp column to Order model
- Split confirmation flow:
  - Draft → AwaitingPayment: Only requires "WhatsApp sent" checkbox
  - AwaitingPayment → Confirmed: Only requires "Payment confirmed" checkbox
- Added waiting time indicator with color-coded badges:
  - Green: < 24 hours
  - Yellow: 1-2 days
  - Red: > 2 days
- Kitchen View excludes AwaitingPayment orders (only production-relevant)
- Updated OrderManager.tsx with AwaitingPayment filter and badge

**Files Modified:**
- Backend: `models/order.py`, `schemas/order.py`, `crud/orders.py`, `routers/orders.py`, `services/whatsapp_formatter.py`
- Frontend: `lib/types.ts`, `pages/OrderDetail.tsx`, `pages/OrderManager.tsx`, `pages/KitchenView.tsx` (new), `App.tsx`, `components/layout/Header.tsx`

---

## 2026-01-30 - Order Status Workflow Migration

**Changed:**
- Migrated order statuses from old 9-status workflow to new 9-status workflow
- Old: Draft, Confirmed, Processing, Ready for Pickup, Waiting for Courier, In Transit, Shipped, Completed, Cancelled
- New: Draft, Confirmed, ProductionComplete, Packaging, WaitingShipment, CompleteShipped, WaitingPickup, PickedUp, Cancelled

**Backend:**
- Updated `backend/app/schemas/order.py` - OrderStatusUpdate pattern regex
- Updated `backend/app/crud/orders.py` - Production report active_statuses list (removed "Processing")

**Frontend:**
- Updated `frontend/src/lib/types.ts` - OrderStatus type definition
- Updated `frontend/src/pages/OrderDetail.tsx`:
  - STATUS_COLORS for all 9 new statuses
  - STATUS_OPTIONS array
  - Auto-trigger shipping dialog when selecting WaitingShipment status
  - Updated WhatsApp section visibility conditions
  - Fixed shipping agency list: Grab → GrabSend, added AnterAja
- Updated `frontend/src/pages/OrderManager.tsx`:
  - STATUS_COLORS for all 9 new statuses
  - Status filter dropdown with all 9 statuses

**Shipping Agencies:**
Gojek, GrabSend, JNE, J&T, SiCepat, AnterAja, Paxel, Lalamove, Other

---

## 2026-01-29 - Order Management Module (Complete Implementation)

**Added:**
- Complete Order Management module (standalone, no ProductVersion dependency)
- Customer entity with phone, source, notes tracking
- Order entity with MMDD-NNN format order numbers for bank transfer reference
- Order items with product_name text fields and combobox autocomplete
- WhatsApp receipt generation with bank details (BCA PT Malo Group Bahagia)
- CSV export endpoints for orders and order items
- Product and seller suggestion endpoints for autocomplete
- Sales channel tracking (IG, WA, Shopee, Tokopedia, etc.)
- Sold by field with autocomplete from previous orders

**Backend Implementation (9 files):**
- `backend/app/models/customer.py` (39 lines) - Customer model with relationships
- `backend/app/models/order.py` (104 lines) - Order and OrderItem models with cascade delete
- `backend/app/schemas/customer.py` - Customer Pydantic schemas
- `backend/app/schemas/order.py` (151 lines) - Order/OrderItem schemas with validation
- `backend/app/crud/customers.py` - Customer CRUD (list, get, create, update)
- `backend/app/crud/orders.py` (309 lines) - Order CRUD with totals calculation, suggestions, export
- `backend/app/routers/customers.py` - 4 customer endpoints
- `backend/app/routers/orders.py` (200+ lines) - 10 order endpoints + CSV export + suggestions
- `backend/app/services/whatsapp_formatter.py` - WhatsApp receipt generator

**Frontend Implementation (5 files):**
- `frontend/src/pages/OrderManager.tsx` - Order list with filters + create form
- `frontend/src/pages/OrderDetail.tsx` - Order detail page with WhatsApp copy button
- `frontend/src/components/orders/OrderForm.tsx` (300+ lines) - Complex order form
- `frontend/src/hooks/useOrders.ts` - Order React Query hooks (7 functions)
- `frontend/src/hooks/useCustomers.ts` - Customer React Query hooks

**Key Features:**
- Order number format: `MMDD-NNN` (e.g., 0129-001) for easy bank transfer reference
- Real-time totals calculation (amount, cost, margin)
- Status workflow: Draft → Confirmed → Completed → Cancelled
- Payment tracking: Unpaid → Partial → Paid with method (BCA, QRIS, Cash)
- WhatsApp-ready receipt with bank details for customer communication

---

## 2025-01-28 - Ingredient & Material Management Enhancements

**Added:**
- Edit functionality for ingredients and packaging materials
- Navigation links in header for Ingredients and Materials pages
- Edit buttons on ingredient and material cards
- Form mode switching (create vs. edit) with dynamic UI

**Updated:**
- IngredientsManager.tsx: Added edit mode with cancel button
- MaterialsManager.tsx: Added edit mode with cancel button
- Header.tsx: Added Ingredients and Materials navigation links
- Both managers now use PUT endpoints for updates

---

## 2025-01-27 - Phase 2 Frontend Complete

**Added:**
- Complete React frontend with TypeScript
- Dashboard with carousel navigation
- Recipe/Packaging/Product editors
- Version navigation and copying
- COGS calculations display
- shadcn/ui component library

**Components:**
- 13 UI components (shadcn/ui)
- 3 layout components
- 5 shared utility components
- 3 entity card components
- 4 page components
- 7 React Query hooks

**Technical:**
- React 19.2.0, Tailwind CSS 4.1.18, React Router 7.13.0
- TanStack Query 5.90.20 for server state
- Axios for HTTP client
- Lucide React for icons

---

## 2025-01-27 - Phase 1 Backend Complete

**Added:**
- FastAPI backend with SQLite database
- Full CRUD operations for all entities
- Cost calculator service
- Versioning system for recipes, packaging, products
- 41 API endpoints across 7 routers

**Models:**
- Ingredient, PackagingMaterial, Tag
- Recipe, RecipeVersion, RecipeComponent, ComponentIngredient
- PackagingRecipe, PackagingVersion, PackagingComponent, PackagingComponentMaterial
- Product, ProductVersion
