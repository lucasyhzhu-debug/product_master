# Project State

## Project Reference
See: .planning/PROJECT.md (updated 2026-02-15)
**Core value:** Production reliability -- single source of truth for recipes, orders, kitchen production, and inventory
**Current focus:** Milestone v1.1 "Stabilization & QoL" -- Phase 14.1: Draft Order Update

## Current Position

Phase: 14.1 (Draft Order Update) -- inserted after Phase 14
Plan: 01 of 02 -- Plan 01 complete
Status: Plan 01 backend mutations complete, Plan 02 frontend integration next
Last activity: 2026-02-16 -- Completed 14.1-01 backend mutations (createDraft, updateDraft, Kanban sort fix)

Progress (v1.1): [########..] 80% (Phase 12 + 13 + 14 complete, Phase 14.1 plan 01/02 done)

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

### Roadmap Evolution

- Phase 14.1 inserted after Phase 14: draft orderupdate (URGENT)

### Pending Todos

None yet.

### Blockers/Concerns

- [Pitfall]: GoBiz token cascade can silently fail -- Phase 13 adds sync health monitoring
- [Pitfall]: WIB timezone bugs from fragmented date logic -- centralize in convex/lib/wibDate.ts
- [Pitfall]: K3Mart cockpit stubs have production data -- never change getWeekNumber() algorithm

## Session Continuity

Last session: 2026-02-16
Stopped at: Completed 14.1-01-PLAN.md
Resume file: None
Resume notes: Phase 14.1 Plan 02 (frontend integration) next

---
*Last updated: 2026-02-16*
