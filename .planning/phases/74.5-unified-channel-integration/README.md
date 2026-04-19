# Phase 74.5: Unified Channel Integration Architecture

**Status:** Pre-planned (spec + implementation plan already written via superpowers brainstorming + writing-plans on 2026-04-17).

**Renumbered 2026-04-19:** Promoted from Phase 1000 → Phase 74.5 to run inside milestone v2.0, immediately after Phase 80.3 merges and before Phase 75. Dependencies (Phases 78, 79, 80) are all complete, so the phase is ready to spec/discuss/plan.

**Sequencing:** `74 ✓ → 80.3 🟡 (merge first) → 74.5 (this phase) → 75 → 76 → 77 → v2.0 close`

## Load-bearing references

Read these in order before executing:

1. **Roadmap entry:** `.planning/ROADMAP.md` § Phase 74.5
2. **Design spec:** `docs/superpowers/specs/2026-04-17-unified-channel-integration-architecture-design.md`
   - 15 sections — problem, goal, scope, 5-layer architecture, data model, mutation contract, routing resolution, audit+curation, backfill migration, admin UI, error handling, auth matrix, testing strategy, implementation plan skeleton, risks, success criteria.
3. **Implementation plan:** `docs/superpowers/plans/2026-04-17-unified-channel-integration.md`
   - 12 tasks, TDD rhythm, ~4 weeks, full file paths + code snippets per step.

## Scope summary

- **In scope (999.4 α + 999.5 folded in):** `ChannelAdapter` contract, `ChannelSaleEvent` canonical type, `channelRouting` table with 3-tier precedence, `saveRevenueItems` becomes atomic revenue+deduction entry, audit+curation workbench gates historical backfill, refactor all 5 adapters (gobiz, bigseller, internal, k3mart, grabfood), two new admin pages.
- **Deferred (future phases):** Pricing consolidation (999.6), SKU resolver auto-match service (999.7), channel onboarding recipe (999.8).

## Dependencies

- Phase 78: substitution plan + stock tracker helpers (reuse, do not reinvent) — ✓ complete
- Phase 79: Shopee item pipeline with `linkedMenuProductId` populated — ✓ complete
- Phase 80: `externalSourceToDisplayChannel` + `channelTaxonomy.ts` (reuse read-side mapping) — ✓ complete

## Recommended execution pipeline

Because this is the highest-risk integration phase in v2.0 (refactors the hot path for every order), give it the full GSD treatment rather than going straight to plan:

1. **`/gsd-spec-phase 74.5`** — lock falsifiable success criteria with ambiguity scoring.
2. **`/gsd-discuss-phase 74.5`** — gray-area advisor on routing-table schema, backfill window, feature-flag rollout per channel, coexistence with `processGofoodSales` during transition.
3. **`/gsd-research-phase 74.5`** — codify the four current paths as a migration matrix (`processGofoodSales` outlet-keyed, order-fulfilment direct GoJek, K3Mart custom, missing Shopee/TikTok).
4. **Split into sub-phases** (recommended, mirrors Phase 80 → 80.1/80.2/80.3 pattern):
   - `74.5.1` — routing-table schema + admin UI (read-only correctness gate)
   - `74.5.2` — centralised `deductInventory` mutation + per-adapter refactor (behind feature flag)
   - `74.5.3` — historical backfill + retire legacy paths
5. **`/gsd-plan-phase 74.5.x`** per sub-phase, with `/triple-review` before executing each plan.

## Alternative: superpowers workflow (pre-existing plan)

The superpowers plan at `docs/superpowers/plans/2026-04-17-unified-channel-integration.md` already decomposes work into 12 TDD tasks. If the split-into-sub-phases approach is rejected, use `superpowers:subagent-driven-development` or `superpowers:executing-plans` against that plan directly. Fresh context per task avoids degradation on the 12-task run.

## Branch

Prior work exists on `feature/999.4-channel-integration-spec` (spec + plan already committed). Implementation branch for 74.5 should be `feature/74.5-unified-channel-integration` (branched fresh from main post-80.3 merge) — cherry-pick the spec + plan commits over if needed, or reference them via doc-path.
