# Project State

## Project Reference
See: .planning/PROJECT.md (updated 2026-02-15)
**Core value:** Production reliability -- single source of truth for recipes, orders, kitchen production, and inventory
**Current focus:** Milestone v1.1 "Stabilization & QoL" -- Phase 16: K3Mart Cockpit

## Current Position

Phase: 16 (K3Mart Cockpit) -- COMPLETE
Plan: 06/06 complete
Status: All 6 plans executed. Phase 16 feature-complete, ready for verification and merge.
Last activity: 2026-02-16 - Completed quick task 4: K3Mart cockpit dark mode token replacement (9 components)

Progress (v1.1): [##########] 100% (Phase 12 + 13 + 14 + 14.1 + 15 + 16 complete)

## Performance Metrics

**Velocity (v1.0):**
- Total plans completed: 36
- Average duration: 6.3 min
- Total execution time: ~3.8 hours

**v1.1:**
| Phase | Plan | Duration | Tasks | Files |
|-------|------|----------|-------|-------|
| 12 | 01 | 1 min | 1 | 1 |
| 13 | 01 | 6 min | 2 | 6 |
| 13 | 02 | 3 min | 1 | 1 |
| 13 | 03 | 4 min | 2 | 5 |
| 13 | 04 | 8 min | 2 | 11 |
| 13 | 05 | 5 min | 3 | 8 |
| 14 | 01 | 45 min | 2 | 40 |
| 14 | 02 | 2 min | 2 | 3 |
| 14 | 03 | 4 min | 2 | 4 |
| 14 | 04 | 8 min | 2 | 9 |
| 14 | 05 | 6 min | 1 | 8 |
| 14 | 06 | 10 min | 2 | 7 |
| 14 | 07 | 2 min | 1 | 5 |
| 14 | 08 | 25 min | 3 | 11 |
| 14.1 | 01 | 3 min | 2 | 2 |
| 14.1 | 02 | 5 min | 2 | 10 |
| 14.1 | 03 | 1 min | 2 | 2 |
| 15 | 01 | 4 min | 2 | 7 |
| 15 | 02 | 5 min | 2 | 5 |
| 15 | 03 | 6 min | 2 | 7 |
| 15 | 04 | 6 min | 1 | 9 |
| 16 | 01 | 7 min | 2 | 6 |
| 16 | 02 | 7 min | 2 | 9 |
| 16 | 03 | 9 min | 2 | 9 |
| 16 | 04 | 4 min | 1 | 5 |
| 16 | 05 | 3 min | 1 | 3 |
| 16 | 06 | 8 min | 2 | 9 |

*Updated after each plan completion*

## Accumulated Context

### Decisions

Decisions are logged in PROJECT.md Key Decisions table.
Recent decisions affecting current work:

- [v1.1 planning]: All 5 phases skip research-phase (internal system, patterns proven in v1.0)
- [v1.1 planning]: Phase ordering: UIB verification -> API audit -> Order QoL -> Kitchen overhaul -> K3Mart cockpit
- [v1.1 planning]: Single new dependency: date-fns ^4.1.0 for date arithmetic across Order/Kitchen/K3Mart phases
- [Phase 12]: text-white on today badge acceptable (contrast on bg-brand); holiday cells use amber as only non-semantic color
- [Phase 13-02]: All 3 integrations documented in single reference file for discoverability; multi-merchant gap noted (POC vs production)
- [Phase 13-01]: resolveGoBizToken fixed to use getCredentialsInternal (refreshToken was always null); outlet map built once per sync run
- [Phase 13-03]: IntegrationHealthCard replaces Accordion layout; manager sees read-only health, admin gets full controls; 30s countdown interval for token expiry
- [Phase 13-04]: SyncHealthBanner gated by canAccessSalesAnalytics; raw Convex query used for menu products to preserve Id types; countMappingImpact uses skip pattern for lazy loading
- [Phase 13-05]: Recharts added for stacked charts; BarChart for daily/weekly, AreaChart for monthly; platform colors: GoFood=teal, K3Mart=blue, Direct=amber; allTime preset from Jan 2020 with no comparison
- [Phase 14-01]: 7-status model replaces 12+; getDisplayStatus() removed; STATUS_CATEGORIES has 6 Kanban columns; inventory consolidated to PaymentReceived (reserve) + BeingPrepared (consume all)
- [Phase 14-02]: shouldAutoEnterKitchen is pure function (no Convex ctx) for testability; canCancelOrder uses string param matching Plan 01 impl
- [Phase 14-03]: Customer search reused from customers/queries.ts; updateStatus retained as escape hatch; moveForward/moveBackward pattern with FORWARD_TRANSITIONS/BACKWARD_TRANSITIONS maps; token-to-userId via getSessionUser for audit trail
- [Phase 14-04]: shadcn Sheet for slide-over (not Framer Motion); PaymentReceived uses expediteOrder for manual kitchen entry; BeingPrepared has no forward button (kitchen completes); Copy to New Order placeholder pending Plan 05
- [Phase 14-05]: Reused existing ProductButtons/DeliveryToggle/VoucherInput; Submit creates Draft then AwaitingPayment; date-fns installed for DueDatePills; customer-first form layout pattern established
- [Phase 14-06]: OrderDetail replaced accordion with StatusActionButtons + AuditTrail; Kitchen view unchanged (production workflow, not status-driven); WhatsApp modal on submit callback
- [Phase 14-07]: WIB timezone via UTC+7 offset for auto-expedite date check; auto-expedite skips PaymentReceived to BeingPrepared with material consumption; AuditTrail expanded for created/auto_expedited events
- [Phase 14-08]: WhatsApp auto-trigger cancelled → replaced with auto-open slide-over; Kanban card redesigned (price top-right, creator merged); finalTotal preferred over manual discount calc; updateStatus now logs audit trail
- [Phase 14.1-01]: createDraft is minimal (customer only, zero totals); updateDraft handles voucher lifecycle; Draft Kanban column sorted newest-first; WhatsApp language fix is frontend-only (Plan 02)
- [Phase 14.1-02]: Edit mode uses ?draft=orderId query param; Draft auto-create on customer select; status-aware Kanban click routing; WhatsApp language param fix is one-line
- [Phase 14.1-03]: Removed AnimatePresence entirely (0.15s fade adds no UX value, causes blank page bugs); Save as Draft reuses updateDraft + replaceItems (no backend changes)
- [Phase 15-01]: kitchenConfig is single-row table with .first() (no indexes); WIB date boundaries as UTC timestamps for due-today filtering; sendBackToOrderDesk does not touch confirmedAt (revenue recognition boundary)
- [Phase 15-02]: StatCard value-above-label layout for quick scanning; TargetConfigPopover ratio-preserving auto-calc; Remaining balls urgency: red=overdue, green=on track, amber=behind
- [Phase 15-03]: DueDateGroup made generic to preserve PackingOrder type; K3Mart checkmarks visual-only local state (no mutation until Phase 16); K3Mart card placed at top of Due Today group
- [Phase 15-04]: DashboardHeader self-manages TargetConfigPopover (no parent state); manager override reuses togglePackOrderLineItem with forceOverride+overrideReason; override logged in productionLog note; DueDateOrderList on both mobile and desktop
- [Phase 16-01]: Holiday data duplicated in convex helpers (Convex can't import src/); getDayTypeForDate mirrors getDayType; auto-suggest uses baseline/5 weekday rate with 2.5x multiplier; price priority: customPrice > snapshot > 0; copyLastWeek skips existing plans
- [Phase 16-02]: WeeklyPlannerGrid is self-contained (owns queries/mutations/state); auto-save on blur with 300ms debounce; per-day confirm in PlannerGridHeader not PlannerActionBar; collapsible toggle removed (planner always visible); BACKLOG K3MART-01 through K3MART-05 resolved
- [Phase 16-03]: Rotation is two sequential API calls (stock-out then stock-in); price sanity check at form AND dialog level; StockMovementHistory uses inline expandable detail; OutletSettingsModal imported directly (not barrel) for admin-only access
- [Phase 16-04]: Inlined setProductTarget logic in confirmDayPlan (Convex mutations can't call mutations); production bump uses setProductTarget directly; OutletSettingsModal moved to barrel export for consistency
- [Phase 16-05]: Re-confirm uses same confirmDayPlan mutation with isReconfirm detection (no new endpoint); default prices from externalStockSnapshots (mapping table has no price field); externalProductName added alongside productName for backward compatibility
- [Phase 16-06]: Past day greying uses string comparison (date < todayStr) for YYYY-MM-DD; collapsible planner with ChevronDown toggle; K3Mart->POS name display with ArrowRight icon

### Roadmap Evolution

- Phase 14.1 inserted after Phase 14: draft orderupdate (URGENT)
- Phase 16.1 inserted after Phase 16: GoBiz OpenAPI audit and official API migration (URGENT)

### Pending Todos

None yet.

### Quick Tasks Completed

| # | Description | Date | Commit | Status | Directory |
|---|-------------|------|--------|--------|-----------|
| 1 | Fix GoBiz sync: auto-seed outlets, product mappings, Customer/Store column, CHANGELOG | 2026-02-16 | 72f302b | Verified | [1-fix-gobiz-sync-register-goldfinch-outlet](./quick/1-fix-gobiz-sync-register-goldfinch-outlet/) |
| 2 | Admin force-complete mutation and UI button for stuck orders | 2026-02-16 | 91768e3 | Verified | [2-admin-force-complete-mutation-and-ui-but](./quick/2-admin-force-complete-mutation-and-ui-but/) |
| 3 | Dashboard revenue chart: hourly granularity + smart defaults | 2026-02-16 | eca447b | Verified | [3-dashboard-revenue-chart-smart-default-gr](./quick/3-dashboard-revenue-chart-smart-default-gr/) |
| 4 | K3Mart cockpit dark mode: replace hardcoded light tokens in 9 components | 2026-02-16 | b10272e | Complete | [4-fix-k3mart-cockpit-dark-mode-replace-rem](./quick/4-fix-k3mart-cockpit-dark-mode-replace-rem/) |

### Blockers/Concerns

- [Pitfall]: GoBiz token cascade can silently fail -- Phase 13 adds sync health monitoring
- [Pitfall]: WIB timezone bugs from fragmented date logic -- centralize in convex/lib/wibDate.ts
- [Pitfall]: K3Mart cockpit stubs have production data -- never change getWeekNumber() algorithm

## Session Continuity

Last session: 2026-02-16
Stopped at: Phase 16.1 context gathered
Resume file: .planning/phases/16.1-gobiz-openapi-audit-and-official-api-migration/16.1-CONTEXT.md
Resume notes: Phase 16.1 context captured. Firecrawl MCP available. Next: /gsd:plan-phase 16.1.

---
*Last updated: 2026-02-16*
