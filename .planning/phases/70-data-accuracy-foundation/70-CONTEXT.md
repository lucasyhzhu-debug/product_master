# Phase 70: Data Accuracy Foundation - Context

**Gathered:** 2026-04-09
**Status:** Ready for planning

<domain>
## Phase Boundary

Fix revenue recognition so direct sales orders appear in Sales Analytics and Income Statement. Add flat COGS override per menu product. Extend employee profiles with financial metadata (hire date, base rate, bank account holder name).

**Requirements:** DA-01 (revenue recognition fix), DA-02 (historical backfill), DA-03 (COGS override), DA-04 (employee profile fields)

</domain>

<decisions>
## Implementation Decisions

### Revenue Recognition (DA-01)
- **D-01:** Internal order sync runs on an **hourly cron job** (`convex/crons.ts`) AND is manually triggerable from Sales Analytics page.
- **D-02:** Revenue-countable statuses remain: `PaymentReceived`, `BeingPrepared`, `AwaitingDelivery`, `Complete`. Do NOT add `Confirmed`.
- **D-03:** Existing `syncInternalOrders` action (`convex/integrations/internal/adapter.ts`) is the mechanism. Debug why Bali order 0330-002 is stuck at "Confirmed" instead of "Complete" — this is likely a status transition bug from order edits. **Research must investigate**: how many orders are currently in "Confirmed" status, and trace their `orderEvents` logs to determine if status transitions were lost during edits.

### Historical Backfill (DA-02)
- **D-04:** Backfill uses the same `syncInternalOrders` action called with no `sinceTimestamp` (full scan path). No separate backfill action needed.
- **D-05:** Backfilled records are **not tagged differently** from live-synced records. Revenue is revenue regardless of when synced. Dedup by `orderNumber` handles overlap.
- **D-06:** Triggered as a one-time manual action (from Convex dashboard or Sales Analytics button). After backfill, hourly cron handles incremental.

### COGS Override (DA-03)
- **D-07:** Override is a **flat total COGS per unit sold** in IDR — covers production + packaging combined. Single field: `cogsOverrideIdr` on `menuProducts` table (optional number).
- **D-08:** **Override always wins.** If `cogsOverrideIdr` is set (non-null), BOM calculation is ignored entirely for that product. Manager clears override to revert to BOM.
- **D-09:** Override is set via **inline editing on MenuProductsManager** table — same pattern as `defaultPrice` inline editing.
- **D-10:** Income Statement uses override: `buildProductCOGSMap` in `convex/lib/costCalculator.ts` checks `cogsOverrideIdr` first, falls back to BOM summation when null.

### Employee Profile (DA-04)
- **D-11:** Add three fields to `users` table: `hireDate` (optional number, epoch ms), `baseSalaryIdr` (optional number, monthly salary in IDR), `bankAccountHolderName` (optional string).
- **D-12:** Base rate stored as **monthly salary** in IDR. Phase 74 (Staff Attendance) can derive daily/hourly from this.
- **D-13:** `bankAccountHolderName` is a **separate field** from `users.name` — legal name for bank transfers often differs from display nickname.
- **D-14:** New fields edited in **expanded UsersManager edit dialog** — add an "Employment" or "Profile" section to existing dialog. Admin-only access already enforced.

### Claude's Discretion
- Field validation rules (date ranges, salary min/max) — use sensible defaults
- COGS override display format in MenuProductsManager (currency formatting, placeholder text)
- Error handling for sync failures (existing pattern in adapter is sufficient)

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Revenue Sync
- `convex/integrations/internal/adapter.ts` — `syncInternalOrders` action, the revenue sync mechanism
- `convex/integrations/internal/queries.ts` — `getRevenueOrders` query with incremental sync support
- `convex/integrations/internal/config.ts` — `REVENUE_COUNTABLE_STATUSES` definition
- `convex/externalData/mutations.ts` — `saveRevenue` mutation with dedup by `externalTransactionId`
- `convex/reports/incomeStatement.ts` — Income Statement consuming `externalRevenue` with `source === "internal"` channel handling
- `convex/crons.ts` — Existing cron jobs (add hourly internal sync here)

### COGS Calculation
- `convex/lib/costCalculator.ts` — `buildProductCOGSMap` function to modify for override support
- `convex/schema.ts` — `menuProducts` table definition (add `cogsOverrideIdr` field)

### Employee Profile
- `convex/schema.ts` — `users` table (lines ~441-462), already has `bankAccountNumber` + `bankName` from Phase 41
- `src/pages/UsersManager.tsx` — Admin user management page (expand edit dialog)
- `convex/auth/mutations.ts` — User CRUD mutations (add new fields)

### Debugging (Order Status Bug)
- `convex/orders/helpers/statusTransitions.ts` — Order status transition logic
- `convex/orders/mutations/` — Order CRUD mutations (check edit flow)
- Use `/graphify` knowledge graph for tracing order status flow — read `graphify-out/GRAPH_REPORT.md` for god nodes and community structure before searching raw files

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `syncInternalOrders` action: Full sync pipeline already built — just needs cron registration and bug fix
- `buildProductCOGSMap`: Single function drives all COGS in Income Statement — clean insertion point for override
- `UsersManager` edit dialog: Existing form pattern with role/name/PIN — extend with employment section
- Inline editing pattern on MenuProductsManager: `defaultPrice` column already editable inline

### Established Patterns
- External sync: cron + manual trigger pattern used for GoFood/BigSeller syncs
- Revenue dedup: `saveRevenue` deduplicates by `source` + `externalTransactionId` (orderNumber for internal)
- Schema fields: Optional fields (v.optional) for backward compatibility with existing documents
- Cache fields: `unitCost` on menuProducts is a cached BOM value — `cogsOverrideIdr` is user-set, not cached

### Integration Points
- `convex/crons.ts` — Register hourly internal sync
- `convex/lib/costCalculator.ts` — `buildProductCOGSMap` checks override before BOM
- `convex/reports/incomeStatement.ts` — Already handles `source === "internal"` channel
- `src/pages/SalesAnalytics.tsx` — Add manual sync trigger button
- `src/pages/MenuProductsManager.tsx` — Add COGS override inline column
- `src/pages/UsersManager.tsx` — Expand edit dialog with employment fields

</code_context>

<specifics>
## Specific Ideas

- **Order status bug**: Bali order 0330-002 is reportedly "Confirmed" when it should be "Complete". Order was edited multiple times. Investigate if order edits reset or lose status transitions. Check all orders currently in "Confirmed" status and trace their `orderEvents` logs. This is a prerequisite for DA-01 success criteria.
- **Graphify tracing**: Use `/graphify` knowledge graph when investigating the order status bug and tracing revenue flow — `graphify-out/GRAPH_REPORT.md` contains community structure for navigating the codebase.

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 70-data-accuracy-foundation*
*Context gathered: 2026-04-09*
