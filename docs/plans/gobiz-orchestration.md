# GoBiz Journal-Level Integration: CTO Orchestration Plan

## Overview

Replace GoBiz daily-aggregate revenue sync (proxy 4/44) with **transaction-level journal sync** using 3 GoBiz APIs. This enables per-transaction item details, auto-matching to menu products, and 5-metric tracking (gross, net, commission, ad burn, promo burn).

## Git Workflow

**Branch:** `feature/gobiz-journal-sync` (from `main` after merging `feature/gobiz-token-management`)
**Checkpoints:** One commit per phase, verified with `npm run build && npm run test`

| Phase | Commit Message |
|-------|---------------|
| Phase 1 | `feat: GoBiz journal sync backend foundation (schema + config + mutations)` |
| Phase 2 | `feat: GoBiz adapter rewrite (journal sync + order details + token refresh)` |
| Phase 3 | `feat: GoBiz frontend integration (token dialog + revenue items + verification)` |

## Agent Routing

| Phase | Primary Agent | Supporting | Verification |
|-------|--------------|------------|-------------|
| Phase 1 | `convex-backend` | -- | `code-auditor` |
| Phase 2 | `convex-backend` | -- | `code-auditor` |
| Phase 3 | `react-ui-builder` | `convex-backend` (hooks) | `code-auditor` |

## Phase Execution Flow

```
[CTO reads orchestration plan]
        |
        v
[Phase 1: Backend Foundation]
  - Schema: externalRevenueItems table, new fields on externalRevenue + platformCredentials
  - Mutations: saveRevenueItems, autoMatchMenuProduct
  - Queries: getRevenueItems, updated getDashboardSummary
  - Tests: 10+ new tests
  - Docs: SCHEMA.md
        |
  [Phase Gate 1] --> FAIL? Fix and retry (max 3)
        |
        v
[Phase 2: Adapter Rewrite]
  - Pure helpers: 7 functions in gobiz/helpers.ts
  - Config: 3 APIs + token refresh
  - Adapter: 2-phase journal+order sync with validation
  - Cron: Remove GoBiz cron (keep K3Mart)
  - Tests: 11+ helper + 5+ adapter tests
  - Docs: API_REFERENCE.md
        |
  [Phase Gate 2] --> FAIL? Fix and retry (max 3)
        |
        v
[Phase 3: Frontend + Final Verification]
  - Token dialog: refresh token field
  - Commission card in dashboard
  - Expandable revenue rows with item details + match badges
  - Settings tab updates
  - Hooks: useConvexRevenueItems
  - Full verification: type-check + build + test + lint
  - Docs: CHANGELOG, GOBIZ_SALES_SCRIPT, ROADMAP
        |
  [Phase Gate 3] --> FAIL? Fix and retry (max 3)
        |
        v
[PR to main]
```

## Phase Gate Criteria

### Phase Gate 1 (Backend Foundation)
- [ ] `externalRevenueItems` table exists in schema
- [ ] `externalRevenue` has `adBurn`, `promoBurn`, `gobizOrderNumber`
- [ ] `platformCredentials` has `refreshToken`
- [ ] `menuProducts` has `by_default_price` index
- [ ] `saveRevenueItems` mutation exists and tested
- [ ] `autoMatchMenuProduct` helper exists and tested
- [ ] `getRevenueItems` query exists and tested
- [ ] 10+ new tests pass in `externalData.test.ts`
- [ ] `npm run build` passes
- [ ] `npm run test` passes (full suite)

### Phase Gate 2 (Adapter Rewrite)
- [ ] `gobiz/helpers.ts` has 7 pure functions, all tested
- [ ] `gobiz/config.ts` defines 3 APIs + token refresh
- [ ] `gobiz/adapter.ts` implements journal sync + order details
- [ ] Token refresh via cookie-based flow implemented
- [ ] GoBiz cron removed from `crons.ts` (K3Mart cron kept)
- [ ] Registry metadata updated
- [ ] 11+ helper unit tests pass
- [ ] 5+ adapter integration tests pass
- [ ] `npm run build` passes
- [ ] `npm run test` passes (full suite)

### Phase Gate 3 (Frontend + Verification)
- [ ] Token dialog has refresh token field
- [ ] Commission card in dashboard (manager/admin only)
- [ ] Expandable revenue rows with item details
- [ ] Match status badges (4 states)
- [ ] All hooks exported
- [ ] `npm run type-check && npm run build && npm run test && npm run lint` all pass
- [ ] All docs updated (CHANGELOG, SCHEMA, API_REFERENCE, GOBIZ_SALES_SCRIPT, ROADMAP)

## File Change Map (no file touched in >1 phase)

| File | Ph1 | Ph2 | Ph3 |
|------|-----|-----|-----|
| `convex/schema.ts` | MODIFY | -- | -- |
| `convex/externalData/mutations.ts` | MODIFY | -- | -- |
| `convex/externalData/queries.ts` | MODIFY | -- | -- |
| `convex/platformCredentials/mutations.ts` | MODIFY | -- | -- |
| `convex/platformCredentials/queries.ts` | MODIFY | -- | -- |
| `convex/integrations/gobiz/helpers.ts` | -- | CREATE | -- |
| `convex/integrations/gobiz/config.ts` | -- | REWRITE | -- |
| `convex/integrations/gobiz/adapter.ts` | -- | REWRITE | -- |
| `convex/integrations/registry.ts` | -- | MODIFY | -- |
| `convex/crons.ts` | -- | MODIFY | -- |
| `src/components/salesAnalytics/GoBizTokenDialog.tsx` | -- | -- | MODIFY |
| `src/components/salesAnalytics/OverviewTab.tsx` | -- | -- | MODIFY |
| `src/components/salesAnalytics/SettingsTab.tsx` | -- | -- | MODIFY |
| `src/hooks/convex/useExternalData.ts` | -- | -- | MODIFY |
| `src/hooks/convex/index.ts` | -- | -- | MODIFY |
| `tests/convex/externalData.test.ts` | MODIFY | -- | -- |
| `tests/convex/helpers.ts` | MODIFY | -- | -- |
| `convex/integrations/gobiz/__tests__/helpers.test.ts` | -- | CREATE | -- |
| `tests/convex/gobizAdapter.test.ts` | -- | CREATE | -- |
| `docs/SCHEMA.md` | MODIFY | -- | -- |
| `docs/API_REFERENCE.md` | -- | MODIFY | -- |
| `docs/CHANGELOG.md` | -- | -- | MODIFY |
| `docs/GOBIZ_SALES_SCRIPT.md` | -- | -- | MODIFY |
| `docs/ROADMAP.md` | -- | -- | MODIFY |

## Escalation Triggers
- Schema conflict with `main` branch --> rebase before Phase 1
- Journal API response differs from POC --> pause Phase 2, document actual format
- Build failure after 3 retries --> escalate to human
- Test failure in unrelated code --> isolate with `test.skip`, note in commit

## Context Compaction Between Phases

After each phase completes, record:
1. Phase gate results (pass/fail per criterion)
2. Last commit hash (`git log -1 --oneline`)
3. Any deviations or decisions made
4. Carryover state for next phase
