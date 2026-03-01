# Phase 29: Consignment Settlements - Context

**Gathered:** 2026-02-28
**Status:** Ready for planning

<domain>
## Phase Boundary

Admin manages consignment outlets (cafes, retail partners, events) with per-outlet revenue sharing percentages, enters settlement records per period, tracks payment status, and sees running totals per outlet. "Consignment" is a single channel (like GoFood or K3Mart) with multiple outlets underneath. All settlement entry is manual — this phase covers channels without automated data syncs. Lives as a tab in Sales Analytics, not a separate page.

</domain>

<decisions>
## Implementation Decisions

### Settlement Entry Flow
- Single form dialog: select outlet, pick date range, enter total revenue
- Auto-calculated preview of rev share amount and Frollie payment shown inline before save
- Manual entry only — admin enters revenue from their own records/forms (no pre-fill from synced data)
- Edit allowed on pending settlements; settlement locks once marked "Paid"
- Date period granularity: Claude's discretion — use consistent date picker patterns from existing app

### Outlet Architecture
- "Consignment" is a single channel with outlets underneath — same pattern as GoFood (one channel, multiple outlets)
- Merge `dispatchConsignmentOutlets` and `consignmentOutlets` into one unified consignment outlet table — one source of truth for both dispatch planning and settlement tracking
- Outlet types: `cafe`, `retail`, `event` (replaces `mode` field with `type`)
- Event-type outlets auto-archive (auto-deactivate) after their settlement is marked paid — reduces clutter from one-off bazaars/pop-ups
- Required fields for outlet creation: name, revSharePercent, type
- Optional fields: address, contactName, notes

### Tab Placement
- Consignment management lives as a tab within Sales Analytics (alongside BigSeller panel, GrabFood panel, Settings)
- Not a separate page — extends the unified channel management concept

### Running Totals & History Display
- Each outlet displayed as a card showing running totals: Total Revenue, Total Rev Share, Frollie Payment, Outstanding Balance
- Click/expand outlet card to see settlement history
- Settlement history uses timeline cards (vertical chronological, newest first) — not table rows
- Global summary banner at top of consignment tab: total consignment revenue, total outstanding, total paid across all outlets

### Revenue Bridge
- One `externalRevenue` record per settlement (total amount, no per-product breakdown)
- Source = `"consignment"`, outletId links to the consignment outlet's externalOutlet record
- Bridge on settlement creation — revenue appears in Sales Analytics immediately (always confirmed for manual consignment)
- Editing a settlement auto-syncs the linked externalRevenue record — analytics always current
- Deleting or voiding: update externalRevenue accordingly

### Claude's Discretion
- Date period picker implementation (arbitrary range vs month presets — choose best UX pattern matching existing app)
- Exact card layout and timeline card design
- Auto-archive timing for event outlets (immediate on paid, or end-of-day)
- Summary banner stat formatting and color scheme
- Use `/frontend-design` skill for all UI component design

</decisions>

<specifics>
## Specific Ideas

- Consignment should feel like another platform in the system — Legato Tamtem is an outlet within the Consignment channel, just as Crystal is an outlet within the GoFood channel
- Events (bazaars, pop-ups) should be easy to create, enter one settlement, and have them auto-archive — not cluttering active outlet lists forever
- Admin enters revenue from their own paper/POS forms — this is for outlets where we don't have API access
- The settlement form should show the math live: "Revenue: Rp 5,000,000 × 10% rev share = Rp 500,000 to outlet, Rp 4,500,000 to Frollie"

</specifics>

<code_context>
## Existing Code Insights

### Reusable Assets
- `EntityManager` + `FormBuilder` (src/components/shared/) — generic CRUD patterns, could be used for outlet management
- `IntegrationHealthCard` pattern — existing credential/platform cards in Sales Analytics Settings; similar card layout for outlet cards
- `externalSource` union in schema.ts already includes `"consignment"` — ready for revenue bridging
- Existing Sales Analytics tab structure — consignment tab follows same TabsList/TabsContent pattern

### Established Patterns
- `protectedMutation` wrapper — all new mutations must use this
- `useSessionMutation` in frontend hooks — matches protectedMutation backend
- Revenue bridge pattern from GrabFood (Phase 27) and BigSeller (Phase 28) — create externalRevenue on data insert
- On-demand action pattern for analytical queries (Phase 20) — no direct useQuery subscriptions for aggregates

### Integration Points
- Sales Analytics page: add "Consignment" tab alongside existing tabs
- `convex/consignment/` — new backend module (mutations.ts, queries.ts)
- Schema: merge `dispatchConsignmentOutlets` into unified consignment outlet table (requires dispatch planner updates)
- `convex/dispatchPlanner/queries.ts` — reads from `dispatchConsignmentOutlets`, needs migration to unified table
- `src/hooks/convex/useConsignment.ts` — new hook
- `src/hooks/convex/index.ts` — barrel export update
- `src/components/salesAnalytics/` — new ConsignmentTab component

</code_context>

<deferred>
## Deferred Ideas

- K3Mart confirmed/unconfirmed revenue classification — outlet inventory = unconfirmed sales, transaction data = confirmed. Noted for Phase 30 analytics enhancement.
- Per-product line items in settlement entry — allow admin to enter product breakdown (10x Original, 5x Bite) for granular per-product analytics across channels. Future enhancement after Phase 29 proves the flow.
- Automated consignment settlement generation from K3Mart sync data — if K3Mart outlets become consignment-like, auto-generate settlements from API data.

</deferred>

---

*Phase: 29-consignment-settlements*
*Context gathered: 2026-02-28*
