# Phase 1000: Unified Channel Integration Architecture

**Status:** Pre-planned (spec + implementation plan already written via superpowers brainstorming + writing-plans on 2026-04-17).

## Load-bearing references

Read these in order before executing:

1. **Roadmap entry:** `.planning/ROADMAP.md` § Phase 1000
2. **Design spec:** `docs/superpowers/specs/2026-04-17-unified-channel-integration-architecture-design.md`
   - 15 sections — problem, goal, scope, 5-layer architecture, data model, mutation contract, routing resolution, audit+curation, backfill migration, admin UI, error handling, auth matrix, testing strategy, implementation plan skeleton, risks, success criteria.
3. **Implementation plan:** `docs/superpowers/plans/2026-04-17-unified-channel-integration.md`
   - 12 tasks, TDD rhythm, ~4 weeks, full file paths + code snippets per step.

## Scope summary

- **In scope (999.4 α + 999.5 folded in):** `ChannelAdapter` contract, `ChannelSaleEvent` canonical type, `channelRouting` table with 3-tier precedence, `saveRevenueItems` becomes atomic revenue+deduction entry, audit+curation workbench gates historical backfill, refactor all 5 adapters (gobiz, bigseller, internal, k3mart, grabfood), two new admin pages.
- **Deferred (future phases):** Pricing consolidation (999.6), SKU resolver auto-match service (999.7), channel onboarding recipe (999.8).

## Dependencies

- Phase 78: substitution plan + stock tracker helpers (reuse, do not reinvent)
- Phase 79: Shopee item pipeline with `linkedMenuProductId` populated
- Phase 80: `externalSourceToDisplayChannel` + `channelTaxonomy.ts` (reuse read-side mapping)

## Execution options

**Option A — GSD workflow:** Run `/gsd-plan-phase 1000` to decompose the implementation plan's 12 tasks into GSD wave-parallelized `PLAN-NN.md` files, then `/gsd-execute-phase 1000`.

**Option B — Superpowers workflow:** Use `superpowers:subagent-driven-development` or `superpowers:executing-plans` directly against the implementation plan. Subagent-driven is recommended because the plan is 12 tasks with heavy TDD rhythm; fresh context per task avoids degradation.

Either option produces the same outcome; Option A integrates with GSD's phase-manifest tracking, Option B runs the skill-native TDD rhythm straight from the plan doc.

## Branch

Work is pre-started on `feature/999.4-channel-integration-spec` (spec + plan already committed). Implementation commits should continue on this branch.
