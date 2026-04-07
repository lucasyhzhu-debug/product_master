# Architecture Patterns

**Domain:** Financial management & data quality features for existing Convex FMCG application
**Researched:** 2026-04-07
**Confidence:** HIGH (all recommendations based on direct codebase analysis of 70-table Convex schema)

---

## System Overview

```
                          EXISTING SYSTEM
  +----------------------------------------------------------+
  |  Frontend (React 19 + Vite)                              |
  |  +-- FinancialStatement.tsx (weekly P&L)                 |
  |  +-- SalesAnalytics.tsx (8-channel charts)               |
  |  +-- KitchenViewV2.tsx (production + shift records)      |
  |  +-- [NEW] DataHealthPage.tsx                            |
  |  +-- [NEW] BankReconciliationPage.tsx                    |
  |  +-- [NEW] StaffAttendancePage.tsx                       |
  +----------------------------------------------------------+
                          |
                    Convex Reactive Queries + Mutations
                          |
  +----------------------------------------------------------+
  |  Backend (Convex Serverless)                             |
  |                                                          |
  |  EXISTING DATA LAYER:                                    |
  |  +-- externalRevenue (8-source bridge)                   |
  |  +-- externalRevenueItems (per-item breakdown)           |
  |  +-- consignmentSettlements (rev share)                  |
  |  +-- journalEntries + journalEntryLines (double-entry)   |
  |  +-- expenses + reimbursementBatches                     |
  |  +-- payrollEntries                                      |
  |  +-- accounts (39 GL accounts, PSAK-aligned)             |
  |  +-- kitchenShiftRecords (production + waste per shift)  |
  |  +-- users (4 roles, PIN auth)                           |
  |  +-- bankAccounts (company bank accounts)                |
  |  +-- menuProducts + componentTypes + BOM                 |
  |                                                          |
  |  [MODIFIED]:                                             |
  |  +-- reports/incomeStatement.ts (full P&L query)         |
  |  +-- lib/costCalculator.ts (COGS override support)       |
  |  +-- menuProducts schema (cogsOverrideIdr field)         |
  |  +-- users schema (employee profile fields)              |
  |  +-- integrations/internal/queries.ts (revenue fix)      |
  |                                                          |
  |  [NEW TABLES]:                                           |
  |  +-- bankStatements (uploaded CSV records)               |
  |  +-- bankStatementLines (parsed transactions)            |
  |  +-- bankReconciliationMatches (matched pairs)           |
  |  +-- staffAttendance (clock-in/out records)              |
  |                                                          |
  |  [NEW QUERY FILES]:                                      |
  |  +-- reports/dataHealth.ts (cross-table integrity)       |
  |  +-- bankReconciliation/queries.ts + mutations.ts        |
  |  +-- staffAttendance/queries.ts + mutations.ts           |
  +----------------------------------------------------------+
```

---

## Feature-by-Feature Architecture

### 1. COGS Override (Simplest -- Schema + Calculator Modification)

**What changes:** Add `cogsOverrideIdr` field to `menuProducts` table. Modify `buildProductCOGSMap` to prefer override when set.

**Modified files:**
- `convex/schema.ts` -- Add field to menuProducts table
- `convex/lib/costCalculator.ts` -- Modify `buildProductCOGSMap` to accept override data
- `convex/reports/incomeStatement.ts` -- Pass override data to COGS map builder
- `src/pages/MenuProductsManager.tsx` or `ProductEditor.tsx` -- Input field for override

**Schema change:**
```typescript
// In menuProducts table definition, add:
cogsOverrideIdr: v.optional(v.number()), // Flat COGS override (bypasses BOM calculation)
```

**Cost calculator modification:**
```typescript
// buildProductCOGSMap signature change:
export function buildProductCOGSMap(
  bomComponents: Array<{ menuProductId: string; componentTypeId: string; quantity: number }>,
  componentTypes: Array<{ _id: string; unitCostIdr: number; category: string }>,
  overrides: Map<string, number> // menuProductId -> cogsOverrideIdr
): Map<string, { production: number; packaging: number; total: number }>
```

When `overrides.has(menuProductId)`, return `{ production: override, packaging: 0, total: override }` instead of computing from BOM. The production/packaging split is meaningless for overrides -- total is what matters for P&L.

**Data flow:**
```
menuProducts.cogsOverrideIdr (set by admin)
  --> buildProductCOGSMap (checked FIRST, before BOM resolution)
    --> incomeStatement aggregateWeek (uses COGS map for per-item costing)
    --> externalData queries (lifetime totals, analytics)
```

**Confidence signal integration:** When override is active, the product's COGS confidence should be `"manual"` instead of `"calculated"`. Add to gap analysis: products with override set are flagged as "manual COGS" so admins know BOM is bypassed.

---

### 2. Employee Profile (Schema Extension Only)

**What changes:** Add fields to existing `users` table. No new tables.

**Modified files:**
- `convex/schema.ts` -- Add fields to users table
- `convex/auth/` or `convex/users/` -- Mutation to update employee fields
- `src/pages/UsersManager.tsx` -- Edit form extension

**Schema change:**
```typescript
// In users table, add:
hireDate: v.optional(v.number()),     // Epoch ms
baseRate: v.optional(v.number()),     // IDR per month
```

Note: `bankAccountNumber` and `bankName` already exist on the `users` table (added in Phase 41 for reimbursement payments). No new bank fields needed.

**Integration points:**
- `payrollEntries` -- base rate can pre-fill payroll amount
- `staffAttendance` -- hire date used for attendance reports (filter to active employees)
- `getStaffPerformanceSummary` in `kitchenShiftRecords/queries.ts` -- can enrich with hire date

---

### 3. Revenue Recognition Fix (Bug Fix -- Internal Adapter)

**What changes:** Fix the gap where direct sales orders don't consistently flow into `externalRevenue` bridge table. This is a data pipeline issue, not a schema issue.

**Root cause analysis from codebase:**

The `syncInternalOrders` action in `convex/integrations/internal/adapter.ts`:
1. Fetches orders with `REVENUE_COUNTABLE_STATUSES` = `["PaymentReceived", "BeingPrepared", "AwaitingDelivery", "Complete"]`
2. Uses incremental sync: `sinceTimestamp` with 24-hour buffer using `_creationTime`
3. Deduplicates by `externalTransactionId` (= orderNumber)

**Likely failure modes:**
- **Manual sync required**: Internal sync is trigger-only (`"manual"` syncType), no cron job. If admin forgets to sync, orders are missed until next manual trigger.
- **`_creationTime` vs `confirmedAt` mismatch**: The incremental query uses `_creationTime >= cutoff` but revenue recognition uses `confirmedAt`. An order created before the last sync but confirmed after could be caught by the 24-hour buffer, but orders confirmed much later (e.g., multi-day draft) could be missed.
- **No auto-bridge on status transition**: Unlike GoBiz/K3Mart which have webhook or sync-based bridges, internal orders only enter `externalRevenue` via manual "Sync Internal" button click.

**Fix approach -- Two options (recommend Option A):**

**Option A: Auto-bridge on order status transition (recommended)**
Add a mutation trigger in `statusTransitions.ts` that writes to `externalRevenue` when an order reaches `PaymentReceived` status. This is the most reliable approach because it happens at the moment of revenue recognition.

```
Order reaches PaymentReceived
  --> statusTransitions.ts calls bridgeToExternalRevenue()
    --> Creates externalRevenue record + externalRevenueItems
    --> Dedup by orderNumber (skip if already bridged)
```

**Modified files:**
- `convex/orders/helpers/statusTransitions.ts` -- Add bridge call on PaymentReceived
- `convex/externalData/mutations.ts` -- New `bridgeInternalOrder` mutation (or extend `saveRevenue`)
- `convex/integrations/internal/adapter.ts` -- Keep as backfill/historical sync tool

**Option B: Add cron job for periodic sync**
Schedule `syncInternalOrders` via cron every 30 minutes. Lower effort but introduces lag and unnecessary processing.

**Revenue items gap:** The current internal adapter creates externalRevenue records but does NOT create `externalRevenueItems` (per-product line items). This means COGS resolution for internal orders falls back to the `fetchInternalOrderDataMap` path which uses order-level totals, not per-item BOM resolution. For proper per-channel COGS, the bridge should also write `externalRevenueItems` with linked `menuProductId` for each order item.

**Modified data flow (Option A):**
```
BEFORE:
  Order -> Complete -> (admin clicks "Sync Internal") -> externalRevenue

AFTER:
  Order -> PaymentReceived -> auto-bridge -> externalRevenue + externalRevenueItems
  Order -> (manual sync still works as backfill)
```

---

### 4. Full P&L per Channel (Query Extension)

**What changes:** Extend the existing `incomeStatement.ts` to include per-channel P&L breakdown through to Net Income, not just Gross Profit.

**Current state:** The income statement query already computes:
- Per-channel: Revenue -> Deductions -> Net Revenue -> COGS -> Gross Profit
- Aggregate: OpEx (from journal lines) -> EBIT -> EBITDA -> Other -> Net Income

**Gap:** OpEx and below are aggregate-only. No per-channel allocation.

**Architecture decision: Aggregate OpEx is correct.**

OpEx (salaries, rent, utilities) is NOT channel-attributable in a small FMCG business. Attempting to allocate 6100 Salaries proportionally by channel revenue would be misleading. The P&L should show:

```
Per Channel:
  Revenue -> Deductions -> Net Revenue -> COGS -> Gross Profit -> Gross Margin %

Aggregate:
  Total Gross Profit
  - Operating Expenses (itemized from journal)
  = EBIT
  + Depreciation/Amortization
  = EBITDA
  - Other Income/Expense
  = Net Income
  = FCF (Net Income + Depreciation - CapEx)
```

**New line items to add:**

The current P&L stops at Net Income. Add:
- **CapEx**: Sum of `fixedAssets.cost` acquired in period (from `acquisitionDate` index)
- **FCF (Free Cash Flow)**: Net Income + Depreciation + Amortization - CapEx

**Modified files:**
- `convex/reports/incomeStatement.ts` -- Add CapEx query + FCF computation
- `src/pages/FinancialStatement.tsx` -- Add FCF row to display

**Data source for CapEx:**
```typescript
// In fetchAndAggregate, add to parallel fetch:
ctx.db.query("fixedAssets")
  .filter((q) => q.and(
    q.gte(q.field("acquisitionDate"), currentStart),
    q.lt(q.field("acquisitionDate"), currentEnd)
  ))
  .collect(),
```

**Financial data export:** Add CSV export button on the FinancialStatement page. Use the existing `csvExport.ts` pattern from v1.5.

---

### 5. Bank Statement Reconciliation (New Feature -- 3 New Tables)

**Architecture:** CSV upload via Convex action (file processing) -> parsed lines stored in DB -> matching algorithm runs as query/mutation.

#### New Tables

```typescript
// Bank statement upload records (header)
bankStatements: defineTable({
  bankAccountId: v.id("bankAccounts"),  // Which company bank account
  fileName: v.string(),                  // Original file name
  storageId: v.id("_storage"),          // Convex storage for original CSV
  bankFormat: v.union(
    v.literal("bca"),
    v.literal("mandiri"),
    v.literal("bni"),
    v.literal("other")
  ),
  periodStart: v.number(),              // Earliest transaction date
  periodEnd: v.number(),                // Latest transaction date
  totalLines: v.number(),               // Count of parsed transactions
  totalCredits: v.number(),             // Sum of credits (inflows)
  totalDebits: v.number(),              // Sum of debits (outflows)
  reconciliationStatus: v.union(
    v.literal("pending"),               // Just uploaded, not reconciled
    v.literal("in_progress"),           // Some matches made
    v.literal("complete")               // All lines matched or marked as ignored
  ),
  uploadedBy: v.id("users"),
  uploadedAt: v.number(),
})
  .index("by_bank_account", ["bankAccountId"])
  .index("by_status", ["reconciliationStatus"])
  .index("by_period", ["periodStart"]),

// Individual bank transactions (parsed from CSV)
bankStatementLines: defineTable({
  statementId: v.id("bankStatements"),
  lineNumber: v.number(),               // Row number in CSV
  transactionDate: v.number(),          // Epoch ms
  description: v.string(),              // Bank description text
  referenceNumber: v.optional(v.string()), // Bank reference/check number
  amount: v.number(),                   // Positive = credit, negative = debit
  runningBalance: v.optional(v.number()), // Balance after transaction
  matchStatus: v.union(
    v.literal("unmatched"),
    v.literal("auto_matched"),          // Algorithm matched
    v.literal("manual_matched"),        // User matched
    v.literal("ignored")               // Marked as no-match needed
  ),
  matchedReconciliationId: v.optional(v.id("bankReconciliationMatches")),
})
  .index("by_statement", ["statementId"])
  .index("by_status", ["matchStatus"])
  .index("by_date_amount", ["transactionDate", "amount"]),

// Match records linking bank lines to system records
bankReconciliationMatches: defineTable({
  bankStatementLineId: v.id("bankStatementLines"),
  matchedEntity: v.union(
    v.literal("journal_entry"),        // JE (expense, payroll, reimbursement, etc.)
    v.literal("external_revenue"),     // Revenue from any channel
    v.literal("order"),                // Direct order payment
    v.literal("reimbursement_batch"),  // Reimbursement transfer
    v.literal("payroll_entry"),        // Payroll payment
    v.literal("other")                 // Manual categorization
  ),
  matchedEntityId: v.string(),         // ID of the matched record
  matchConfidence: v.union(
    v.literal("exact"),                // Amount + date + description match
    v.literal("probable"),             // Amount + date match
    v.literal("manual")                // User-confirmed
  ),
  matchedAmount: v.number(),
  matchNote: v.optional(v.string()),
  matchedBy: v.union(
    v.literal("system"),
    v.literal("user")
  ),
  matchedByUserId: v.optional(v.id("users")),
  matchedAt: v.number(),
})
  .index("by_bank_line", ["bankStatementLineId"])
  .index("by_entity", ["matchedEntity", "matchedEntityId"]),
```

#### Data Flow: CSV Upload

```
User uploads CSV on BankReconciliationPage
  --> File stored via Convex storage API (ctx.storage.store())
  --> Convex ACTION parses CSV (actions can do I/O, CPU work)
    --> Detects bank format (BCA vs Mandiri by header shape)
    --> Parses each row: date, description, debit/credit, balance
    --> Calls mutation to create bankStatements header
    --> Calls mutation to batch-insert bankStatementLines (batches of 100)
```

**Why action, not mutation:** CSV parsing is CPU-intensive and may exceed Convex mutation time limits for large files. Actions have longer timeouts and can call mutations in batches for the actual database writes.

#### Data Flow: Auto-Matching Algorithm

```
After CSV upload, run matching mutation:
  1. Fetch unmatched bankStatementLines for this statement
  2. For each line, attempt matches in priority order:
     a. Order payments: match amount against orders.finalTotal
        where order.orderNumber appears in line.description
     b. Reimbursement batches: match amount against
        reimbursementBatches.totalAmount where status="confirmed"
     c. Payroll: match amount against payrollEntries.amount
     d. Revenue: match by date + approximate amount against
        externalRevenue records
     e. Expenses: match amount against expenses.amount
        where status in ["approved", "paid", "recorded"]
  3. Create bankReconciliationMatches for confident matches
  4. Update bankStatementLines.matchStatus
  5. Update bankStatements.reconciliationStatus
```

**Matching heuristics (ordered by reliability):**
1. **Order number in description** + amount match = `exact`
2. **Amount + date (same day)** + entity type match = `probable`
3. **Amount only** within 3-day window = `probable` (requires manual confirmation)

#### Integration Points

| System Record | Bank Line Type | Match Key |
|---------------|---------------|-----------|
| `orders` (PaymentReceived) | Credit | `orderNumber` in description + `finalTotal` |
| `reimbursementBatches` (confirmed) | Debit | `totalAmount` + `bankReference` |
| `payrollEntries` (active) | Debit | `amount` + `periodEnd` proximity |
| `externalRevenue` (gobiz, shopee) | Credit | `revenueNet` + `transactionDate` |
| `expenses` (company_paid) | Debit | `amount` + `expenseDate` |

---

### 6. Staff Attendance (New Feature -- 1 New Table)

**Architecture:** Simple clock-in/out table with mutations accessible from kitchen app. Integrates with existing `kitchenShiftRecords` for production correlation.

#### New Table

```typescript
staffAttendance: defineTable({
  userId: v.id("users"),
  date: v.string(),                    // YYYY-MM-DD (WIB)
  clockIn: v.number(),                 // Epoch ms
  clockOut: v.optional(v.number()),    // Epoch ms (null = still working)
  breakMinutes: v.optional(v.number()), // Total break time
  hoursWorked: v.optional(v.number()), // Computed on clock-out
  notes: v.optional(v.string()),
  // Override support for late entries
  isManualEntry: v.boolean(),          // True if entered by manager, not self
  enteredBy: v.id("users"),           // Who created this record
})
  .index("by_user_date", ["userId", "date"])
  .index("by_date", ["date"]),
```

#### Data Flow: Clock-In/Out

```
Kitchen staff opens kitchen app
  --> "Clock In" button visible if no attendance record for today
  --> clockIn mutation: creates staffAttendance with clockIn timestamp
  --> "Clock Out" button visible if clocked in, no clockOut
  --> clockOut mutation: patches clockOut + computes hoursWorked
```

**Auth pattern:** Clock-in uses `requireRole(ctx, token, ["kitchen", "order_staff", "manager", "admin"])`. All roles can clock themselves in. Managers can create manual entries for others.

#### Integration with Kitchen Shift Records

The `kitchenShiftRecords` table already tracks:
- `submittedByUserId` -- who submitted the EoS record
- `chefUserId` -- actual cook (may differ from submitter)
- `produced[]` -- products with quantities
- `componentProduced[]` -- component grams

The `getStaffPerformanceSummary` query already aggregates production per staff member over a date range, resolving BOM balls. Staff attendance adds **hours worked** to this data, enabling:
- Production per hour metrics
- Attendance report independent of production

**Monthly summary query pattern:**
```typescript
// New query: getMonthlyAttendanceSummary
// Fetches all staffAttendance records for date range
// Joins with users table for name/role
// Computes: days worked, total hours, average hours/day
// Cross-references with kitchenShiftRecords for production/hour
```

#### Frontend Integration

- Add "Clock In/Out" button to KitchenViewV2.tsx header (where kitchen staff already work)
- New StaffAttendancePage.tsx for manager/admin view with calendar + per-staff details
- Extend existing Staff Performance Report with attendance hours

---

### 7. Data Health Page (New Feature -- Query Only, No New Tables)

**Architecture:** A single reactive query that runs cross-table integrity checks and returns a health dashboard. Uses existing `integrityCheckLogs` table for historical results.

#### Health Check Categories

```typescript
interface DataHealthReport {
  checks: Array<{
    category: string;        // "Revenue", "COGS", "Journal", "Bank", "Attendance"
    name: string;            // "Revenue Completeness"
    status: "pass" | "warn" | "fail";
    detail: string;          // "3 orders missing from revenue bridge"
    affectedCount: number;
    lastChecked: number;
  }>;
  overallStatus: "healthy" | "attention" | "critical";
}
```

#### Checks to Implement

| Check | Tables Scanned | Logic |
|-------|---------------|-------|
| **Revenue completeness** | `orders` + `externalRevenue` | Orders with PaymentReceived+ status not in externalRevenue bridge |
| **COGS coverage** | `menuProducts` + `componentTypes` + `menuProductComponents` | Products with zero BOM cost and no cogsOverrideIdr |
| **Journal balance** | `journalEntryLines` | Sum(debits) != Sum(credits) for any entry |
| **Expense receipt coverage** | `expenses` | Approved expenses without receiptFileId |
| **Bank reconciliation status** | `bankStatements` | Statements with unmatched lines |
| **Attendance gaps** | `staffAttendance` + `users` | Active kitchen staff with no attendance record today |
| **Stale COGS cache** | `menuProducts` | Products where unitCostStaleAt is set |
| **Unmapped external products** | `externalProductMappings` | Mappings where menuProductId is null |
| **Sync freshness** | `externalSyncLogs` | Last successful sync > 48 hours ago per source |

**Performance consideration:** This query scans multiple tables. Use `ctx.db.query(...).collect()` with parallel Promise.all, same pattern as `incomeStatement.ts`. For expensive checks (revenue completeness), limit to last 30 days.

**Modified files:**
- New: `convex/reports/dataHealth.ts` -- Health check query
- New: `src/pages/DataHealthPage.tsx` -- Dashboard UI
- New: `src/hooks/convex/useDataHealth.ts` -- Hook
- Modified: `src/App.tsx` -- Add route

---

## Component Boundaries

| Component | Responsibility | Communicates With |
|-----------|---------------|-------------------|
| `reports/incomeStatement.ts` | P&L aggregation | `externalRevenue`, `consignmentSettlements`, `journalEntryLines`, `accounts`, `menuProductComponents`, `componentTypes`, `fixedAssets` |
| `reports/dataHealth.ts` (NEW) | Cross-table integrity | ALL financial tables (read-only) |
| `bankReconciliation/` (NEW) | CSV upload, parsing, matching | `bankStatements`, `bankStatementLines`, `bankReconciliationMatches`, `orders`, `expenses`, `payrollEntries`, `reimbursementBatches`, `externalRevenue` |
| `staffAttendance/` (NEW) | Clock-in/out, attendance queries | `staffAttendance`, `users`, `kitchenShiftRecords` |
| `lib/costCalculator.ts` | COGS computation | `menuProducts` (override field), `menuProductComponents`, `componentTypes` |
| `integrations/internal/` | Direct sales -> revenue bridge | `orders`, `orderItems`, `externalRevenue`, `externalRevenueItems` |

---

## Suggested Build Order

Build order is driven by **dependency chains** and **risk profile**.

```
Phase 1: COGS Override + Employee Profile
  (Schema changes only, zero risk, unblocks P&L accuracy)
  |
Phase 2: Revenue Recognition Fix
  (Bug fix, unblocks accurate P&L data, prerequisite for Data Health)
  |
Phase 3: Full P&L Extension (FCF line items)
  (Extends existing query, depends on accurate COGS + revenue)
  |
Phase 4: Staff Attendance
  (New table, independent of financial features, can parallelize)
  |
Phase 5: Bank Statement Reconciliation
  (Most complex -- new tables, CSV parsing action, matching algorithm)
  |
Phase 6: Data Health Page
  (Reads ALL tables -- must be built LAST so all tables exist)
  |
Phase 7: Financial Data Export
  (CSV export of P&L -- trivial after P&L is complete)
```

**Rationale:**
1. **Phases 1-2 first** because every subsequent feature depends on accurate COGS and complete revenue data. Building P&L or Data Health on top of broken data wastes effort.
2. **Phase 3 after 1-2** because FCF computation requires accurate P&L inputs.
3. **Phase 4 (Attendance) is independent** -- no dependency on financial features. Could run in parallel with Phase 3 if desired.
4. **Phase 5 (Bank Recon) is highest complexity** -- 3 new tables, CSV parsing action, matching algorithm. Needs dedicated attention.
5. **Phase 6 (Data Health) last** because it checks ALL other features' data. Building it before bank recon means you'd need to update it again.
6. **Phase 7 (Export) last** because it serializes the P&L output, which must be final.

---

## New Tables Summary

| Table | Purpose | Indexes | Est. Row Volume |
|-------|---------|---------|-----------------|
| `bankStatements` | CSV upload header records | `by_bank_account`, `by_status`, `by_period` | ~10/month |
| `bankStatementLines` | Parsed transaction rows | `by_statement`, `by_status`, `by_date_amount` | ~500/month |
| `bankReconciliationMatches` | Matched bank line <-> system record | `by_bank_line`, `by_entity` | ~500/month |
| `staffAttendance` | Clock-in/out records | `by_user_date`, `by_date` | ~150/month (5 staff x 30 days) |

**Total new tables: 4** (schema grows from 70 to 74 tables)

---

## Modified Tables Summary

| Table | Field Change | Migration Needed? |
|-------|-------------|-------------------|
| `menuProducts` | Add `cogsOverrideIdr: v.optional(v.number())` | No (optional field, existing docs unaffected) |
| `users` | Add `hireDate: v.optional(v.number())`, `baseRate: v.optional(v.number())` | No (optional fields) |

**No destructive schema changes. No migrations needed.** All new fields are optional, all new tables are additive.

---

## Anti-Patterns to Avoid

### Anti-Pattern 1: Snapshot Tables for P&L
**What:** Creating a `pnlSnapshots` table to store computed P&L results
**Why bad:** Convex reactive queries are the strength of this architecture. Snapshot tables introduce staleness, dual-source-of-truth issues, and cache invalidation complexity. The income statement already computes from live data.
**Instead:** Keep computing from live data. The existing parallel-fetch + in-memory aggregation pattern handles this well.

### Anti-Pattern 2: CSV Parsing in Mutations
**What:** Parsing bank statement CSV inside a Convex mutation
**Why bad:** Mutations have strict time limits. A 500-row BCA CSV with date parsing could timeout. Mutations should be fast database writes.
**Instead:** Use a Convex action for CSV parsing. Actions have longer timeouts and can call mutations in batches for the actual database writes.

### Anti-Pattern 3: Real-Time Matching Query
**What:** Running the bank reconciliation matching algorithm as a reactive query
**Why bad:** Matching requires scanning orders, expenses, payroll, reimbursements -- potentially thousands of records. Running this reactively on every data change would be expensive and slow.
**Instead:** Run matching as a one-time mutation triggered by button click. Store results in `bankReconciliationMatches`. Display matches via simple indexed query.

### Anti-Pattern 4: Per-Channel OpEx Allocation
**What:** Attempting to split Operating Expenses by sales channel
**Why bad:** A 10-person snack company has shared OpEx (rent, salaries, utilities). Arbitrary allocation (e.g., by revenue share) is misleading. Standard FMCG P&L shows per-channel Gross Profit, then aggregate OpEx below.
**Instead:** Per-channel breakdown stops at Gross Profit. Everything below is aggregate.

### Anti-Pattern 5: Attendance as Kitchen Component
**What:** Embedding clock-in/out into `kitchenShiftRecords`
**Why bad:** Attendance is per-user per-day. Shift records are per-submission with produced/waste arrays. Different lifecycle, different access patterns. Kitchen staff clock in once; they may submit multiple shift records.
**Instead:** Separate `staffAttendance` table with its own CRUD. Join at query time for production-per-hour metrics.

### Anti-Pattern 6: Dynamic Import in Convex Backend
**What:** Using `import()` dynamically in Convex functions for bank format parsers
**Why bad:** Dynamic imports work locally but fail silently in Convex production (204 No Content). This is a known Convex limitation documented in the project's pitfalls.
**Instead:** Static imports for all bank format parsers. Use a `switch` statement on `bankFormat` to select the right parser function.

### Anti-Pattern 7: N+1 in Revenue Completeness Check
**What:** For each order, querying `externalRevenue.withIndex("by_source_txn")` one at a time
**Why bad:** With hundreds of orders, this creates hundreds of individual reads. Data Health page would be slow.
**Instead:** Fetch all `externalRevenue` records for the period, build a Set of `externalTransactionId` values, then check which order numbers are missing. Single scan, O(1) lookups.

---

## Convex-Specific Patterns to Follow

### Pattern: Action for File Processing, Mutation for Writes
```
action(parseCSV) {
  // 1. Read file from storage
  // 2. Parse CSV (CPU-intensive, OK in action)
  // 3. Call mutation in batches of 100 for DB writes
  await ctx.runMutation(internal.bankReconciliation.mutations.saveBatch, { lines: batch });
}
```

### Pattern: Parallel Fetch + In-Memory Aggregation
Already established by `incomeStatement.ts`. Data Health should follow the same pattern:
```typescript
const [orders, revenue, expenses, ...] = await Promise.all([
  ctx.db.query("orders").collect(),
  ctx.db.query("externalRevenue").collect(),
  // ...
]);
// Then run all checks in-memory
```

### Pattern: Atomic Counter for Sequential IDs
Use existing `counters` table for any new sequential numbering (e.g., bank statement batch numbers). Pattern: `getOrCreateCounter(ctx, prefix, date)`.

### Pattern: Index-Scoped Queries
All new queries MUST use `withIndex()` for range bounds. `.filter()` after `.collect()` is acceptable for small result sets, but date-range queries must use indexes (lesson from schema audit in v1.6).

---

## Sources

- Direct codebase analysis of `convex/schema.ts` (70 tables, 2005 lines)
- `convex/reports/incomeStatement.ts` -- existing P&L architecture
- `convex/lib/costCalculator.ts` -- COGS computation, `buildProductCOGSMap`
- `convex/integrations/internal/adapter.ts` -- internal revenue sync
- `convex/integrations/internal/config.ts` -- `REVENUE_COUNTABLE_STATUSES`
- `convex/kitchenShiftRecords/queries.ts` -- staff performance summary pattern
- `convex/integrityChecks/mutations.ts` -- existing weekly integrity check pattern
- `convex/accounts/mutations.ts` -- GL account numbering (39 PSAK accounts)
- `convex/lib/journalHelpers.ts` -- journal line aggregation pattern
- PROJECT.md -- v2.0 milestone requirements
- MEMORY.md -- architectural decisions and lessons learned
