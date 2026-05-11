# Project Retrospective

*A living document updated after each milestone. Lessons feed forward into future planning.*

## Milestone: v2.0 — Financial Management & Data Quality

**Shipped:** 2026-05-11
**Phases:** 17 (70-81 incl. 70.1, 74.5.1, 74.5.2, 74.5.2.1, 80.1, 80.2, 80.3 inserted) | **Plans:** 79 | **Timeline:** 32 days (2026-04-10 to 2026-05-11)

### What Was Built
- **Revenue accuracy** (70/70.1): Direct sales bridged to externalRevenue with historical backfill, COGS override per product, employee profile fields, admin all-expenses query
- **Full P&L + CSV exports** (75/76): Canonical EBITDA-first layout (Revenue → CM → EBITDA → EBIT → NI → CapEx → FCF), raw transaction CSV, multi-period summary CSV (weekly/monthly/custom), three-layer role gates
- **Bulk expense + bank reconciliation** (71/72/73): CSV expense upload (auto-approve + submit modes), reclassify-to-expense disposal type, BCA statement parser + auto-match engine, manual split-view UI
- **Staff attendance** (74): PIN clock in/out, per-staff production tracking, monthly summaries, manager corrections
- **Channel routing spine + cutover** (74.5.1/74.5.2/74.5.2.1): typed `ChannelSaleEvent`, `ChannelAdapter` interface, K3Mart parent+child shape change, gated cutover via flag map, six historical-backfill admin buttons, K3Mart bundle composite-toggle UI, retired legacy paths
- **Analytics + unit economics dashboard** (78/79/80/80.1/80.2/80.3): product inventory substitution, Shopee/TikTok per-item revenue + BigSeller cron, `/analytics` page with 13 widgets, perf consolidation 11→3 subscriptions, Unlinked Products fix (737 K3Mart + 219 Direct parents), R5 internal-mirror dedup
- **Domain vocabulary deepening** (81): typed `Platform` literal union with `resolvePlatform()` (forward-compatible per ADR-0001), `isProductionUnit(ct)` BOM predicate, canonical `getWibDateStr(ms)` WIB helper, ESLint rule banning 10 legacy exports, Tokopedia → TikTok + K3 Mart → K3Mart user-visible renames
- **Triple-review applied to high-risk plans**: Phase 81-03 platform resolver caught 4 Critical regressions (orderChannel literal coverage gap silently bucketing native consignment as Direct, stale `_generated/api.d.ts` 3rd recurrence, undefined-source fallback, K3 Mart sweep gap) — all fixed pre-merge plus a post-merge K3Mart sweep hotfix (PR #158)

### What Worked
- **Branch-per-phase + squash merge**: Every phase ran on `feature/{N}-{slug}`, squash-merged after CI green. Clean main history with one commit per shipped phase. Made `git log` readable as a milestone narrative.
- **Triple-review on type-cascade plans**: Frontmatter-gated triple-review (`triple_review: true`) for the highest-risk plans (74.5.1, 74.5.2, 81-03) caught regressions that all other gates missed. Without this gate, Phase 81 would have shipped a silent native-orders-bucketing-as-Direct regression that all 1825 tests + type-check + Vercel build passed clean.
- **Post-merge bundle-grep smoke test**: For "user-visible everywhere" renames (Phase 81 D-02 Tokopedia/K3 Mart), running `grep -c "<old>" dist/assets/*.js` after Vercel deploy was the canonical final gate. Caught 11 surviving K3 Mart surfaces that triple-review listed but the fix executor undershot. Same-day hotfix shipped.
- **Architectural deepening informed by graph report**: Phase 81 was scoped from `graphify-out/GRAPH_REPORT.md` (god nodes + community structure). Three duplicated rule clusters identified mechanically, not by reviewer vigilance. Closed 4 flagged ambiguities in CONTEXT.md.
- **Pre-staffreview gate before plans land**: `gsd-plan-phase` step 12.5 mandates `Skill(skill="staffreview")` before completion. For Phase 81-03, this caught the deferred `linkedMenuProductId` lookup branch (staffreview I1) and led to a clean Test 10 skip with TODO marker rather than shipping broken behavior.
- **Pattern of inserting decimal phases for gap closure**: 70.1, 74.5.1, 74.5.2, 74.5.2.1, 80.1, 80.2, 80.3 all inserted mid-milestone to close gaps surfaced by execution. The decimal numbering kept history coherent without resequencing the parent phase.
- **Splitting umbrella phases**: Phase 74.5 (Unified Channel Integration Architecture) was split into 74.5.1 (additive spine, flag-OFF) + 74.5.2 (cutover + retire) on day 1 of execution per researcher verdict. Allowed shipping the spine independently and de-risked the cutover.

### What Was Inefficient
- **REQUIREMENTS.md bookkeeping drift**: 14 of 25 v2.0 requirements remained `[ ]` even though the corresponding phases shipped. Caught at milestone close (20/25 actually complete; 5 deferred). Fix forward: tie checkbox flip to phase-merge step in `gsd-execute-phase` document_and_merge_gate.
- **STATE.md status field staleness**: After every merge, STATE.md status remained "Ready to push + PR + merge to main" until the next session updated it. Should auto-update during the merge ceremony.
- **`docs/ROADMAP.md` (the project doc) and `.planning/ROADMAP.md` (the GSD planning doc) are duplicates with separate update cycles**: Phase 81-04 docs sweep updated `docs/ROADMAP.md`; v2.0 close updated `.planning/ROADMAP.md`. Two sources of truth = drift risk.
- **D-02 scope mis-calibration**: PATTERNS.md narrowed CONTEXT.md's "everywhere user-visible" to "C1 caller migration table" for Phase 81's K3 Mart rename. Plan inherited the narrower scope, leaving 11 surfaces unfixed. Required hotfix PR #158. Lesson recorded in `lessons_phase_81_triple_review.md` Lesson 3.
- **Phase 77 Data Health Dashboard never received a phase directory** despite being in the original v2.0 scope. The placeholder bumped through the milestone but never got planned. Eventually deferred to v2.1 at closeout. Should have been deferred earlier or replaced with a concrete spike.
- **No phase-level WIP limits** meant 17 phases compressed into 32 days with overlapping work streams (74.5.1 + 80.x running in parallel; 81 inserted late). Impressive throughput but not sustainable; v2.1 should consider WIP=2 max.

### Patterns Established
- **`triple_review: true` plan frontmatter** as the binding gate for type-cascade and high-risk plans, mandating `Skill(skill="triple-review")` between execution and merge regardless of config defaults
- **Bundle-grep as final gate** for "user-visible everywhere" renames: `grep -c "<old>" dist/assets/*.js` after Vercel deploy proves the rename actually shipped
- **Pre-staffreview before plan completion** (`gsd-plan-phase` step 12.5): catches deferred-branch design issues before the executor commits to them
- **Dual-source-of-truth ESLint guard for renamed exports**: `no-restricted-imports` rule with deletion-list prevents "shim eternal" anti-pattern; combined with the actual deletion this enforces "no shims per D-10"
- **Confidence-tagged resolvers**: Functions returning `{value, confidence}` instead of just `value` so downstream data-health dashboards (Phase 77 future) can grep for `confidence === "inferred"` to surface low-trust data without re-doing the inference
- **Channel-source pattern**: ChannelAdapter interface + ChannelSaleEvent canonical type + per-channel routing table replaces per-source bespoke logic (5 adapters refactored to one interface in 74.5.1)

### Key Lessons
1. **Type-cascade refactors need EXHAUSTIVE schema-literal coverage tests, not just import-grep** — the C1 orderChannel literal coverage gap was invisible to type-check + 1825 tests because the `?? "Direct"` fallback both caused and camouflaged the bug. (See `lessons_phase_81_triple_review.md` Lesson 1.)
2. **Delete-a-file plans must include explicit `npx convex codegen` task** — `convex/_generated/api.d.ts` is generated but checked in; tsconfig excludes `_generated/`, so stale imports there silently rot. THIRD recurrence in v2.0 (Phase 76, Phase 81). (See Lesson 2.)
3. **CONTEXT.md absolute-scope language must not be narrowed by PATTERNS.md** — D-02 said "everywhere user-visible"; PATTERNS.md scoped to C1 caller table; result: 11 user-visible K3 Mart surfaces missed, hotfix PR #158 required. (See Lesson 3.)
4. **`confidence: "exact"` must be EARNED, not defaulted on `??` fallbacks** — wrongly-routed orders carrying false "exact" confidence into income statements would have made Phase 77's data-health dashboard miss exactly the rows it most needs to surface. (See Lesson 4.)
5. **Pre-staffreview Refinements need explicit adoption/drop log** — Phase 81-03 silently dropped pre-staffreview R2 (make `source` optional) and shipped `source: "internal"` placeholder anti-pattern 3× in unitEconomics.ts. (See Lesson 5.)
6. **Retroactive mapping cascades need per-source branches** — Phase 80.2 K3Mart fix; when adding a new source to a platform-aware cascade, audit EVERY `if (args.source === X)` branch. (See `lessons_phase_80_2_triple_review.md`.)
7. **Soft-delete needs guards on every write branch** — Phase 74 lesson: not just delete branches but EVERY mutation that reads-then-writes. (See `lessons_phase_74_triple_review.md`.)
8. **Splitting umbrella phases on day 1 is cheaper than mid-execution** — Phase 74.5 → 74.5.1/74.5.2 split per researcher verdict avoided a halfway-cutover trap.

### Cost Observations
- **Model mix:** Predominantly Opus 4.6/4.7 for orchestration + planning; Sonnet for executor agents in some plans; Haiku for noise tasks (commits, doc summaries)
- **Sessions:** ~25-30 sessions across the 32-day milestone (rough estimate from STATE.md last_updated trail)
- **Notable:** Phase 81's triple-review wave was particularly cost-effective — three reviewer agents in parallel + a single fix-executor agent caught what would have been a Critical production regression. The post-merge bundle-grep smoke-test was nearly free (one bash command) and caught a hotfix-worthy gap.
- **Worktree isolation** (per Phase 81-01 setup): worth the marginal cost for parallel-safe execution; without it, Plan 81-01 + 81-02 + 81-03 would have serialized.

---

## Milestone: v1.7 — Expense & Accounting

**Shipped:** 2026-03-16
**Phases:** 15 (41-54, including 53.1) | **Plans:** 32 | **Timeline:** 7 days (2026-03-12 to 2026-03-16)

### What Was Built
- Journal engine: double-entry with balance validation, reversal-only correction, atomic daily counters (EXP/JE/RMB-MMDD-NNN)
- Chart of Accounts: 39 PSAK-aligned GL accounts with admin UI for managing accounts
- Expense lifecycle: Draft → Submitted → Approved → Reimbursed/Voided with receipt upload (SHA-256 dedup)
- Approval workflow: DoA routing (<=500K manager, >500K admin), self-exclusion, rejection chain with resubmit
- Fraud detection: duplicate, late submission, split, approver concentration, unfamiliar vendor
- Reimbursement batching: per-employee grouping, bank transfer tracking, batch confirm/void with JE
- Payroll entry: staff/contractor with auto-generated journal entries
- P&L extension: Gross Profit → OpEx → EBIT → Other → Net Income via journal aggregation
- Expense Analytics: spend breakdowns, monthly trends, fraud flags dashboard
- Bulk CSV import: 350+ historical expense records as journal entries with progress indication
- Code simplification: 3-agent review found 17 findings, 14 fixed (zero behavior changes)
- E2E testing: 4 Playwright test suites covering 9 expense pages with multi-role auth
- Bug fixes: GoBiz promo discount inflation, 6 BigSeller schema mismatches

### What Worked
- **Double-entry journal engine as foundation**: Building the journal engine (Phase 42) before any expense mutations meant every downstream consumer (approval, reimbursement, payroll, void) used a single validated helper. Zero duplicate JE creation code.
- **TDD for pure helpers**: DoA thresholds, fraud detection, and counter formatting were all TDD'd as pure functions before integration. Caught edge cases (e.g., `finalTotal < 0` blocking, `_creationTime` vs `completedAt` for period filtering) early.
- **3-agent simplification review**: Running 3 parallel review agents after Phase 50 identified 17 findings before refactoring. Phase 52 fixed 14 of them in 3 plans with zero behavior changes. All existing tests passed unchanged.
- **Multi-role E2E auth**: Global-setup creating 4 test users with different roles let E2E tests verify permission guards (9 routes x 4 roles) and full lifecycle across role boundaries.
- **Decimal phase for urgent bug fix**: Phase 53.1 (GoBiz promo discount) was inserted cleanly after E2E testing revealed the issue. Decimal numbering kept the roadmap coherent.

### What Was Inefficient
- **SUMMARY frontmatter one_liners empty**: The `summary-extract --fields one_liner --pick one_liner` CLI command returned empty for all 32 SUMMARY.md files — suggests the one_liner field wasn't being populated during execution. MILESTONES.md entry was written manually instead of from automated extraction.
- **Phase 51 scope creep**: Originally 1 plan, expanded to 4 plans. CSV import validation, batched mutations, and wizard UI were all underestimated. Should have scoped as 2 plans minimum from the start.
- **v1.7 ROADMAP never properly collapsed**: The milestones section marked v1.7 as shipped, but the expanded phase details were left in place for months until manual cleanup during archive.
- **REQUIREMENTS.md replaced before archival**: The `/gsd:new-milestone` for v1.8 replaced REQUIREMENTS.md before v1.7 was formally completed, requiring reconstruction of v1.7 requirements from ROADMAP phase references during archival.

### Patterns Established
- **Journal engine helper pattern**: `createJournalEntryWithLines` validates debits == credits, creates entry + lines atomically. All JE consumers use this — no direct `ctx.db.insert` on journalEntryLines.
- **Audit trail helper**: `addExpenseAuditEntry()` shared across all expense status transitions. Actor + timestamp + optional comment on every change.
- **Fraud detection as pure functions**: All fraud checks (split, duplicate, concentration, unfamiliar vendor) are pure functions tested independently, then composed in the analytics query.
- **DoA as pure helper**: `getRequiredApprovalRole(amount, thresholds)` returns the minimum role needed. Easy to adjust thresholds without mutation changes.
- **SHA-256 dedup pattern**: Receipt files hashed on upload, checked against existing hashes. Hard-blocks at backend, not just UI warning.

### Key Lessons
1. **Foundation phases compound**: The journal engine (Phase 42) was only 1 plan, but it eliminated entire categories of bugs in the 13 subsequent phases. Investing in the right foundation pays exponential dividends.
2. **3-agent review before refactoring is efficient**: The simplification review found issues that individual developers miss — code duplication across files, unused imports, inconsistent patterns. Worth the ~10 min of agent time.
3. **Archive milestones promptly**: Leaving v1.7 details expanded in ROADMAP.md while starting v1.8 created confusion (contradictory status markers, wrong phase counts). Complete-milestone should run immediately after the last phase ships.
4. **Populate SUMMARY frontmatter consistently**: The `one_liner` field was empty across all summaries, breaking automated milestone reporting. Execution workflow should enforce this field.
5. **`_creationTime` is insertion time, not business date**: Journal entry period queries must use `entryDate` (business date), not Convex's `_creationTime`. This caught us in P&L aggregation.

### Cost Observations
- Model mix: primarily opus (quality profile)
- 32 plans across 15 phases in 7 days — ~4.6 plans/day average
- Notable: Heaviest feature milestone yet. 10 new schema tables, 9 new pages, 59 requirements all satisfied.

---

## Milestone: v1.6 — Tech Debt & Resilience

**Shipped:** 2026-03-09
**Phases:** 6 (35-40) | **Plans:** 16 | **Timeline:** 7 days

### What Was Built
- Schema audit: 42 findings across 65 tables, 20 unused indexes removed, 5 compound indexes added, 10 range bound fixes
- Backend helper extraction: 5 files from 6,348 to 4,358 LOC (-31.3%) via shared confidence, WIB timezone, and pure function modules
- Frontend file splits: 4 components from 5,518 to 1,450 LOC (-74%) via sub-component extraction with shared dateUtils.ts
- E2E Playwright tests for 3 critical paths (order lifecycle, kitchen production, sales analytics)
- Tamtem depot auto-seed: eliminates silent failures when depot storage locations don't exist
- Retroactive verification: 3 VERIFICATION.md files created, all 20 requirements 3-source verified

### What Worked
- **Schema audit before refactoring**: Phase 35's expert audit identified exactly which indexes to remove and add before Phases 36-37 started extracting helpers. The compound indexes eliminated post-scan filters at 19+ call sites.
- **Pure function extraction pattern**: Keeping Convex function registrations in original files while extracting logic into helpers/ achieved significant LOC reduction with zero API path changes. dispatchPlanner achieved -74.5% because simulation was almost entirely ctx-independent.
- **Parallel frontend file splits**: 4 agents splitting 4 independent component files ran cleanly in ~10 min total. No merge conflicts because each agent touched different files.
- **Triple review on every phase**: Caught real bugs (completedAt filter, cancelled record filtering) during code review that would have shipped as silent production issues.
- **Milestone audit -> gap closure pipeline**: `/gsd:audit-milestone` identified 12 documentation gaps. Phase 40 closed all of them before milestone completion. Clean exit.

### What Was Inefficient
- **LOC target overestimation**: Plans consistently claimed larger reductions than achievable. BFS-04 target was <800 but delivered 940; BFS-05 target was <700 but delivered 958. Ctx-dependent code limits pure extraction. Planners must sum `lines_removed - lines_added_back` per candidate.
- **Stale audit after gap closure**: The v1.6 audit file still says `status: gaps_found` even after Phase 40 closed all gaps. No mechanism to re-run or update the audit status. Future milestones should either re-audit or annotate the file.
- **Phase 38 plan checkbox inconsistency**: ROADMAP showed `- [ ]` (unchecked) for Phase 38 and 39 plan items despite all being complete. Cosmetic but confusing during audit.
- **Phase 40 added late**: 6th phase was unplanned — created by `/gsd:plan-milestone-gaps` to close audit-identified documentation gaps. Verification should be built into execution, not retrofitted.

### Patterns Established
- **queryHelpers/ directory pattern**: Use `queryHelpers/` (not `helpers/`) when a `helpers.ts` file already exists in the same directory — avoids Windows case-insensitive collision
- **Auto-seed on first use**: DEPOT_CONFIG array pattern for auto-creating infrastructure (depot locations) when first accessed rather than requiring manual migration
- **Retroactive verification**: When phases ship without VERIFICATION.md, create them from codebase evidence (wc -l, grep imports, build results) before milestone completion
- **Shared dateUtils.ts**: Frontend WIB timezone helpers in `src/lib/dateUtils.ts` — single source of truth for date formatting across all analytics components
- **formatCurrency(amount ?? 0)**: Replaces `formatCurrencyIDR` — null amounts render as "Rp 0" instead of "-"

### Key Lessons
1. **Ctx-dependency ratio predicts extraction ROI** — dispatchPlanner (95% self-contained) achieved -74.5%, while orderCrud (interleaved DB inserts) only achieved -11.7%. Plan LOC targets based on how much code depends on Convex ctx, not total function length.
2. **Build verification into execution, not after** — 3/6 phases shipped without VERIFICATION.md, requiring Phase 40 to retrofit. The audit→gap closure pipeline works, but verifying during execution is cheaper.
3. **Review findings must be fixed before re-review** — Phase 37 plans were reviewed twice with zero fixes between reviews. All 3 reviewers flagged the same stale issues both times.
4. **Compound indexes eliminate post-scan filters** — `.withIndex("idx", q => q.gte(start))` + `.filter(q => q.lt(end))` is a post-scan filter. Both bounds must be inside `.withIndex()` for true index-level filtering.
5. **Fragment keys on list wrappers** — When extracting components from `.map()` callbacks, the outermost element needs a `key`. Bare `<>...</>` fragments need `<Fragment key={...}>` for React reconciliation.

### Cost Observations
- Model mix: primarily opus (quality profile)
- Notable: Pure refactoring milestone — no new features, no schema additions. Focus on maintainability and test coverage.

---

## Milestone: v1.4 — Sales & Channel Integration

**Shipped:** 2026-03-01
**Phases:** 9 (26-31 including 27.1, 27.2, 29.1) | **Plans:** 20 | **Timeline:** 5 days

### What Was Built
- Multi-platform auth with unified credential health panel (GoBiz, GrabFood, BigSeller)
- GrabFood POS: order sync, store control, menu simulator with webhooks and push-to-GrabFood
- BigSeller marketplace integration: scheduler-chain sync for Shopee + Tokopedia with SKU mapping
- Consignment settlement system: outlet CRUD, auto-calculated payments, revenue bridge
- Unified 8-channel Sales Analytics: dynamic discovery, lifetime totals, legend-as-filter
- ExternalSource type guard pattern, test suite repair (56→0 failures), tech debt cleanup

### What Worked
- **externalRevenue bridge pattern**: Single table for all revenue sources made analytics aggregation trivial — dynamic channel discovery emerged naturally from this design
- **Milestone audit before completion**: Running `/gsd:audit-milestone` caught 7 tech debt items that Phase 31 addressed before shipping — cleaner release
- **Staff review before execution**: The `/staffreview` skill found a third `as any` cast and recommended contract tests — both incorporated into the plan before any code was written
- **GSD research phase**: Phase 27-01 API discovery gate prevented building on untested assumptions — confirmed single-credential model, discovered orders 401 scope gap early
- **Scheduler-chain pattern**: Convex-idiomatic polling for BigSeller eliminated while-loop anti-pattern in serverless actions
- **platformColors.ts single source of truth**: Extracting colors to shared module eliminated 3-way color map divergence discovered during code review

### What Was Inefficient
- **Decimal phase proliferation**: 3 inserted phases (27.1, 27.2, 29.1) suggest the original scope estimates for Phases 27 and 29 were too optimistic — webhooks and test repair should have been scoped upfront
- **SUMMARY frontmatter gap**: `requirements_completed` empty across all v1.4 plans — the field exists in the template but was never populated during execution. Metadata discipline needs improvement
- **Empty duplicate directory**: `27.1-grabfood-menu-simulator/` was created with wrong name alongside correct `27.1-grabfood-webhooks-partner-configuration/` — naming conflicts in decimal phases
- **v1.3 Phase Details still in ROADMAP.md**: Phases 19-25 details remained in ROADMAP.md even though v1.3 was archived — ROADMAP grew unnecessarily large

### Patterns Established
- **ExternalSource type guard**: `convex/lib/externalSource.ts` — runtime `isExternalSource()` narrows string→union for Convex index queries. Contract test validates array/schema sync.
- **Revenue bridge**: All external data sources write to `externalRevenue` with `source` field. Analytics queries dynamically discover channels from data.
- **Dynamic channel discovery**: Charts iterate sources from data, not hardcoded lists. New platforms auto-appear.
- **Scheduler-chain polling**: `ctx.scheduler.runAfter(60s)` replaces while-loops for async API polling in Convex actions
- **Legend-as-filter**: Chart legend doubles as interactive filter — no separate filter widget needed
- **Single platform color source**: `src/lib/platformColors.ts` → `getPlatformPalette(source)` for all color needs

### Key Lessons
1. **Scope webhooks and partner config upfront** — GrabFood required 3 phases (27, 27.1, 27.2) when 2 were planned. Webhook handling, HMAC validation, and menu simulation are always bigger than expected.
2. **Run milestone audit BEFORE marking complete** — The audit→gap closure→review pipeline (audit → Phase 31 → staffreview → execute) caught issues that would have shipped as permanent debt.
3. **Contract tests for hardcoded arrays that mirror schema** — `EXTERNAL_SOURCES` must match `externalSource` union. A simple `expect(array).toHaveLength(N)` test catches drift at CI time.
4. **Staff review catches what plan-checker misses** — Plan verification checks structure; staff review reads the actual codebase and finds related patterns (third `as any` cast) the planner didn't know about.
5. **Revenue source = actual platform, not aggregator** — BigSeller orders use `source: "shopee"/"tiktok"`, not `"bigseller"`. The pipe is not the source.

### Cost Observations
- Model mix: primarily opus (quality profile)
- Notable: 20 plans across 9 phases in 5 days — high throughput maintained despite API integration complexity

---

## Milestone: v1.5 — Financial Statements

**Shipped:** 2026-03-03
**Phases:** 3 (32-34) | **Plans:** 9 | **Timeline:** 2 days

### What Was Built
- Weekly income statement query with per-channel Revenue -> Deductions -> COGS -> Gross Profit aggregation
- Full BOM COGS resolution (production + packaging) via `buildProductCOGSMap` in-memory preloading
- `/financials` page with week navigation, confidence indicators, comparison deltas, data quality panel
- Flat-format CSV export with formula injection sanitization
- 22 income statement tests (12 integration + 10 unit) with sentinel-value dual-path verification

### What Worked
- **Design doc before coding**: `docs/plans/2026-03-01-income-statement-design.md` + staff review caught scope issues before Phase 32 started — no rework
- **Triple review on every phase**: 3 independent review agents (requirements, code-quality, staffreview) found more issues than any single reviewer. Consensus items highest-confidence fixes.
- **Sentinel-value testing pattern**: Seeding deliberately wrong value (99999) in the unused data path proved the query reads from the correct source — mechanical proof, not hope
- **No schema changes**: Purely read-only feature built on v1.4 data infrastructure. Safe `git revert` rollback at any point.
- **In-memory BOM map preloading**: Following `getLifetimeTotalsInternal` pattern avoided N+1 queries in COGS resolution

### What Was Inefficient
- **Phase 33 grew to 5 plans**: Original estimate was 3-4 plans, but review fixes (dark mode tokens, component extraction, dedup) added 2 more. Review-driven rework should be budgeted upfront.
- **No milestone audit**: Skipped `/gsd:audit-milestone` because all phases were individually verified and triple-reviewed. Acceptable for a 3-phase milestone but wouldn't scale.
- **Duplicate frontmatter in STATE.md**: GSD CLI appended extra frontmatter blocks instead of replacing — required manual cleanup during milestone completion.

### Patterns Established
- **Confidence classification**: Every financial figure tagged exact/calculated/inferred/missing — transparent data quality
- **In-memory BOM map**: `buildProductCOGSMap` preloads all BOM data into Maps for O(1) per-item COGS lookup
- **Sentinel-value dual-path testing**: Seed wrong values in unused data paths to mechanically prove correct source selection
- **CSS variable tokens for dark mode**: `--color-status-success/error/warning` replace raw `dark:` Tailwind overrides
- **financialHelpers.tsx**: Shared helpers for WIB timezone, delta computation, confidence formatting

### Key Lessons
1. **Budget review-driven rework as 20% of plan count** — 5/9 plans were implementation, 4 were reviews and fixes. Reviews always generate work.
2. **Sentinel values are mechanical proofs** — When two data sources can provide the same field, seed the wrong one with a sentinel. If the test passes, the correct source is proven.
3. **Design doc + staff review before Phase 1** — Catches scope issues, API contract questions, and edge cases before a single line of code. v1.5 had zero rework from design issues.
4. **Triple review consensus** — When 2+ of 3 independent reviewers flag the same issue, it's a high-confidence fix. Single-reviewer items need more judgment.
5. **Assert gap analysis even on happy paths** — Empty gap analysis fields should be explicitly asserted, not just skipped. Catches silent regressions.

### Cost Observations
- Model mix: primarily opus (quality profile)
- Notable: 9 plans across 3 phases in 2 days — fastest milestone yet per plan count (41 min total execution)

---

## Cross-Milestone Trends

### Process Evolution

| Milestone | Phases | Plans | Timeline | Key Change |
|-----------|--------|-------|----------|------------|
| v1.0 | 11 | 36 | 3 days | Established GSD workflow, factories pattern |
| v1.1 | 6 | 27 | 2 days | Kanban order system, API integrations started |
| v1.2 | 3 | 20 | 5 days | Dispatch planner, ingredient tracking, BOM patterns |
| v1.3 | 8 | 49 | 3 days | GoFood depot, kitchen overhaul, legacy cleanup |
| v1.4 | 9 | 20 | 5 days | Multi-platform integration, unified analytics, milestone audit |
| v1.5 | 3 | 9 | 2 days | Financial statements, design-doc-first, triple review on every phase |
| v1.6 | 6 | 16 | 7 days | Schema audit, backend/frontend LOC reduction, E2E tests, retroactive verification |

### Cumulative Quality

| Milestone | Tests | Key Quality Metric |
|-----------|-------|--------------------|
| v1.0 | ~200 | Ball distribution + FIFO coverage |
| v1.1 | ~350 | Order lifecycle + voucher tests |
| v1.2 | ~450 | Ingredient tracking + dispatch planner |
| v1.3 | ~636 | Full suite, kitchen + codebase cleanup |
| v1.4 | 643 | ExternalSource contract tests, sourceToPlatform coverage |
| v1.5 | 684 | Income statement tests (22), sentinel-value dual-path verification |
| v1.6 | 690 | Schema index audit, depot auto-seed tests (6), E2E Playwright tests (3) |

### Top Lessons (Verified Across Milestones)

1. **Run full test suite after large refactors** — Orphaned tests accumulate silently (v1.3 Phase 22 → v1.4 Phase 29.1: 56 failures discovered)
2. **Single source of truth for shared data** — Color maps (v1.4), BOM composition (v1.0), production counts (v1.0) — duplication always drifts
3. **API discovery gate before integration phases** — v1.1 GoBiz paste-fix, v1.4 GrabFood scope gap — always validate endpoints before building
4. **Milestone audit catches what phase verification misses** — Cross-phase integration, tech debt accumulation, requirement coverage gaps
5. **Branch-per-phase discipline** — Never branch from another feature branch; always from main after merge
6. **Build verification into execution** — v1.6 required Phase 40 to retrofit 3 missing VERIFICATION.md files. Cheaper to verify during execution than after audit.
