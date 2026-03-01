# Project Retrospective

*A living document updated after each milestone. Lessons feed forward into future planning.*

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

## Cross-Milestone Trends

### Process Evolution

| Milestone | Phases | Plans | Timeline | Key Change |
|-----------|--------|-------|----------|------------|
| v1.0 | 11 | 36 | 3 days | Established GSD workflow, factories pattern |
| v1.1 | 6 | 27 | 2 days | Kanban order system, API integrations started |
| v1.2 | 3 | 20 | 5 days | Dispatch planner, ingredient tracking, BOM patterns |
| v1.3 | 8 | 49 | 3 days | GoFood depot, kitchen overhaul, legacy cleanup |
| v1.4 | 9 | 20 | 5 days | Multi-platform integration, unified analytics, milestone audit |

### Cumulative Quality

| Milestone | Tests | Key Quality Metric |
|-----------|-------|--------------------|
| v1.0 | ~200 | Ball distribution + FIFO coverage |
| v1.1 | ~350 | Order lifecycle + voucher tests |
| v1.2 | ~450 | Ingredient tracking + dispatch planner |
| v1.3 | ~636 | Full suite, kitchen + codebase cleanup |
| v1.4 | 643 | ExternalSource contract tests, sourceToPlatform coverage |

### Top Lessons (Verified Across Milestones)

1. **Run full test suite after large refactors** — Orphaned tests accumulate silently (v1.3 Phase 22 → v1.4 Phase 29.1: 56 failures discovered)
2. **Single source of truth for shared data** — Color maps (v1.4), BOM composition (v1.0), production counts (v1.0) — duplication always drifts
3. **API discovery gate before integration phases** — v1.1 GoBiz paste-fix, v1.4 GrabFood scope gap — always validate endpoints before building
4. **Milestone audit catches what phase verification misses** — Cross-phase integration, tech debt accumulation, requirement coverage gaps
5. **Branch-per-phase discipline** — Never branch from another feature branch; always from main after merge
