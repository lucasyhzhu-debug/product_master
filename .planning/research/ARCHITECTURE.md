# Architecture Research

**Domain:** FMCG sales tracking — consignment upload + multi-channel lifetime analytics extension
**Researched:** 2026-02-22
**Confidence:** HIGH — based on direct inspection of existing schema, queries, and page code

---

## Standard Architecture

### System Overview

```
┌────────────────────────────────────────────────────────────────────┐
│                         React 19 Frontend                           │
│  ┌────────────────┐  ┌────────────────┐  ┌──────────────────────┐  │
│  │ SalesAnalytics │  │ ConsignmentMgr │  │   Existing Pages…    │  │
│  │ (extend tabs)  │  │ (new upload UI)│  │                      │  │
│  └───────┬────────┘  └──────┬─────────┘  └──────────────────────┘  │
│          │                  │                                        │
│  ┌───────▼──────────────────▼──────────────────────────────────┐   │
│  │   Convex React Hooks (useQuery / useMutation / useAction)    │   │
│  └───────────────────────────┬──────────────────────────────────┘   │
└──────────────────────────────│────────────────────────────────────--┘
                               │  Convex WebSocket (real-time)
┌──────────────────────────────▼─────────────────────────────────────┐
│                        Convex Serverless                            │
│  ┌──────────────────────────────────────────────────────────────┐  │
│  │                 externalData/queries.ts                       │  │
│  │   getRevenueTimeSeries   getDashboardSummaryByPeriod          │  │
│  │   (extend: add "consignment" to platform buckets)             │  │
│  └──────────────────────────────────────────────────────────────┘  │
│  ┌───────────────────────────────────────────────────────────────┐  │
│  │                 consignment/mutations.ts  (NEW)               │  │
│  │   uploadBulkSummary   uploadDetailFormat   deleteUpload        │  │
│  └───────────────────────────────────────────────────────────────┘  │
│  ┌───────────────────────────────────────────────────────────────┐  │
│  │                 http.ts (extend)                              │  │
│  │   POST /api/consignment-upload  (file receive → action)       │  │
│  │   GET  /api/consignment-template  (template download)         │  │
│  └───────────────────────────────────────────────────────────────┘  │
│                                                                      │
│  ┌──────────┐  ┌────────────────┐  ┌──────────────────────────────┐ │
│  │externalRev│  │externalRevItems│  │consignmentUploads (NEW table)│ │
│  │(add source│  │(add source     │  │+ externalOutlets (reuse)     │ │
│  │="consign")│  │="consignment") │  │+ dispatchConsignmentOutlets  │ │
│  └──────────┘  └────────────────┘  └──────────────────────────────┘ │
└────────────────────────────────────────────────────────────────────-┘
```

### Component Responsibilities

| Component | Responsibility | Implementation |
|-----------|---------------|----------------|
| `consignmentUploads` table | Audit log of every upload batch | New Convex table |
| `externalRevenue` (extended) | Unified revenue store for all channels including consignment | Existing table, new source value |
| `externalRevenueItems` (extended) | Line-item sales rows for detail-format uploads | Existing table, new source value |
| `dispatchConsignmentOutlets` | Already stores consignment outlet definitions (Legato Tamtem, etc.) | Existing table — reuse as outlet reference |
| `consignment/mutations.ts` | Parse and insert uploaded consignment data rows | New Convex module |
| `http.ts` (extended) | POST endpoint to receive Excel bytes via httpAction | Extend existing file |
| `externalData/queries.ts` (extended) | Aggregate consignment into time-series and dashboard queries | Extend existing queries |
| `SalesAnalytics.tsx` (extended) | Add consignment series to Recharts charts + Lifetime tab | Extend existing page |

---

## New vs Modified Tables

### Decision: Extend `externalRevenue`, Not a New Table

**Verdict:** Store consignment transactions in the existing `externalRevenue` table with `source = "consignment"`.

**Rationale:**
- `externalRevenue` already has all needed fields: `source`, `outletId`, `linkedMenuProductId`, `quantitySold`, `revenueGross`, `revenueNet`, `transactionDate`, `periodStart`, `periodEnd`, `dataOrigin`, `confidence`
- Every analytics query (`getRevenueTimeSeries`, `getDashboardSummaryByPeriod`, `getRevenueByOutlet`) already groups by `source` — adding `"consignment"` to those buckets requires minimal changes
- The `by_source_period` index already supports efficient consignment queries
- `externalRevenueItems` already handles line-item detail (GoFood uses it); consignment detail format maps directly

**Required schema change:** Add `v.literal("consignment")` to the `source` union in both `externalRevenue` and `externalRevenueItems` tables. Also extend `externalOutlets.source` union.

**Outlet FK strategy:** The `externalRevenue.outletId` field is typed as `v.optional(v.id("externalOutlets"))`. Consignment outlets are stored in `dispatchConsignmentOutlets`, a separate table. Two options:

| Option | Pros | Cons |
|--------|------|------|
| A: Add consignment outlet records to `externalOutlets` with `source="consignment"` | Single FK type, reuses outlet lookup in all queries | Adds a 4th source value to `externalOutlets.source` union |
| B: Store outlet name as string snapshot in `externalRevenue` (no FK) | No schema change to `externalOutlets` | Loses relational link; harder to rename outlets |
| C: Add `consignmentOutletId` optional field to `externalRevenue` | Preserves existing FK types | Every query needs extra branch logic |

**Recommendation: Option A.** Add `v.literal("consignment")` to `externalOutlets.source` union. Create one `externalOutlets` row per consignment outlet at upload time (idempotent: lookup by name before insert). This keeps the outlet FK uniform across all `externalRevenue` rows and all existing outlet-enrichment query logic works unchanged.

### New Table: `consignmentUploads`

A separate audit table tracking every upload batch (not individual rows) is necessary because:
- Users need to see upload history and delete/undo a batch
- `externalRevenue` has no batch grouping concept (GoFood uses `syncLogId` → `externalSyncLogs`; consignment should follow the same pattern but needs its own table since it's manual not a cron)

```typescript
// convex/schema.ts — new table
consignmentUploads: defineTable({
  outletId: v.id("externalOutlets"),    // Which consignment outlet
  uploadedBy: v.string(),               // User who uploaded
  uploadedAt: v.number(),               // Timestamp
  fileName: v.string(),                 // Original file name for display
  format: v.union(                      // Which Excel format
    v.literal("bulk_summary"),          // Product + qty + revenue per date range
    v.literal("detail")                 // Per-transaction with line items
  ),
  periodStart: v.number(),              // Date range covered
  periodEnd: v.number(),
  rowCount: v.number(),                 // How many revenue rows inserted
  status: v.union(
    v.literal("processing"),
    v.literal("complete"),
    v.literal("error"),
    v.literal("deleted")                // Soft delete (revenue rows also removed)
  ),
  errorMessage: v.optional(v.string()),
  storageId: v.optional(v.id("_storage")), // Convex file storage ref (for re-parse if needed)
})
  .index("by_outlet", ["outletId"])
  .index("by_uploaded_at", ["uploadedAt"]),
```

This mirrors how `externalSyncLogs` tracks GoFood/K3Mart sync batches. Revenue rows link back via a `consignmentUploadId` field added to `externalRevenue`. This requires adding `consignmentUploadId: v.optional(v.id("consignmentUploads"))` to `externalRevenue`.

---

## Excel Upload Architecture in Convex

### Pattern: HTTP Action + Convex Action

Convex does not support streaming multipart file uploads in mutations. The correct pattern is:

```
Browser                          Convex HTTP Router           Convex Action
   |                                     |                          |
   |-- POST /api/consignment-upload ----->|                          |
   |   (multipart/form-data, xlsx bytes) |                          |
   |                                     |-- ctx.runAction() ------->|
   |                                     |   (passes file bytes)    |-- parse Excel
   |                                     |                          |-- validate rows
   |                                     |                          |-- ctx.runMutation()
   |                                     |                          |   insertRevenue rows
   |                                     |<-- JSON result -----------|
   |<-- { uploadId, rowCount, errors } --|
```

**HTTP Action in `convex/http.ts`:**
```typescript
http.route({
  path: "/api/consignment-upload",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    const formData = await request.formData();
    const file = formData.get("file") as File;
    const bytes = await file.arrayBuffer();
    const result = await ctx.runAction(api.consignment.actions.processUpload, {
      fileBytes: Array.from(new Uint8Array(bytes)),
      fileName: file.name,
      outletId: formData.get("outletId") as string,
      token: formData.get("token") as string,
    });
    return new Response(JSON.stringify(result), {
      headers: { "Content-Type": "application/json" },
    });
  }),
});
```

**Why not Convex Storage first?** Convex file storage (`ctx.storage.store()`) is an alternative where the frontend uploads directly to Convex storage and then calls a mutation with the `storageId`. This adds latency and complexity. For files up to a few MB (typical Excel: < 500KB), passing bytes as an array through an HTTP action is simpler and avoids the two-step upload flow.

**Constraint:** Convex actions have a 4MB argument size limit. A 500-row Excel file is well under this. Flag: if file sizes regularly exceed 1MB, switch to Convex Storage upload pattern.

### Excel Parsing Library

Excel parsing must happen in a Convex action (Node.js runtime, not V8 isolate). Use `xlsx` (SheetJS community edition):

```typescript
// In convex/consignment/actions.ts
import * as XLSX from "xlsx";
```

**Constraint:** SheetJS is a heavy dependency (~600KB). It works in Convex actions (Node.js runtime) but cannot be used in Convex queries or mutations (V8 isolate environment). All parsing must live in an `action`, not a `mutation`. The action then calls a mutation to write the parsed data.

**Template Download:** Use a GET HTTP endpoint in `http.ts` that constructs an XLSX buffer in the handler and returns it with `Content-Disposition: attachment`. No storage needed — template is generated programmatically on each request.

---

## Lifetime Totals Architecture

### Problem: Cross-Source Aggregation

Sales data lives in four places:
1. `orders` + `orderItems` — Direct channel (canonical source, also mirrored to `externalRevenue` with `source = "internal"` on order completion)
2. `externalRevenue` with `source = "gobiz"` — GoFood (auto-synced)
3. `externalRevenue` with `source = "k3mart"` — K3Mart (auto-synced)
4. `externalRevenue` with `source = "consignment"` (NEW) — Consignment (manual upload)

Note: Direct orders are mirrored to `externalRevenue` with `source = "internal"` when orders complete. This means `externalRevenue` already contains all channels except consignment — the lifetime total query can be built on `externalRevenue` alone once consignment is added.

### Pattern: Single Aggregation Query on `externalRevenue`

```typescript
// convex/externalData/queries.ts — new query
export const getLifetimeTotals = query({
  args: {},
  handler: async (ctx) => {
    const allRevenue = await ctx.db.query("externalRevenue").collect();

    const bySource: Record<string, { gross: number; net: number; units: number }> = {};

    for (const r of allRevenue) {
      if (!bySource[r.source]) {
        bySource[r.source] = { gross: 0, net: 0, units: 0 };
      }
      bySource[r.source].gross += r.revenueGross ?? 0;
      bySource[r.source].net += r.revenueNet ?? 0;
      bySource[r.source].units += r.quantitySold ?? r.transactionCount ?? 0;
    }

    // Per-product totals ...
  }
});
```

**Scalability note:** A full `collect()` on `externalRevenue` is fine now (< 10K rows estimated) but will become slow at 100K+ rows. Mitigation: add a pre-aggregated cache table in a future phase. Do not prematurely optimize for v1.3.

### Per-Product Lifetime Units

The `externalRevenue` table stores `quantitySold` and `linkedMenuProductId`. However, sources differ:
- GoFood stores line items in `externalRevenueItems` — parent row has no per-product breakdown for multi-item orders
- K3Mart stores `quantitySold` and `linkedMenuProductId` directly on `externalRevenue`
- Internal (Direct) requires joining `orderItems` for per-product counts (the mirrored revenue rows do not store per-product quantities)
- Consignment bulk format: product + qty per row — direct `linkedMenuProductId` + `quantitySold`
- Consignment detail format: line items go to `externalRevenueItems`

**Recommendation for ANLY-02 per-product table:**
1. K3Mart: `externalRevenue.quantitySold` grouped by `linkedMenuProductId`
2. GoFood: `externalRevenueItems.quantity` grouped by `linkedMenuProductId`
3. Consignment bulk: `externalRevenue.quantitySold` grouped by `linkedMenuProductId`
4. Consignment detail: `externalRevenueItems.quantity` grouped by `linkedMenuProductId`
5. Direct: query `orderItems` directly for product-level accuracy

---

## Data Flow

### Consignment Upload Flow

```
User selects Excel file in ConsignmentUploadTab
    ↓
Frontend reads file (FileReader API) → ArrayBuffer
    ↓
POST /api/consignment-upload (multipart: file bytes + outletId + token)
    ↓
httpAction in convex/http.ts
    ↓
ctx.runAction(api.consignment.actions.processUpload, { fileBytes, format, outletId, token })
    ↓
Convex Action (Node.js runtime):
  1. Parse Excel with SheetJS
  2. Detect format (bulk_summary or detail) from sheet structure
  3. Validate required columns (product name, qty, revenue, date)
  4. Map product names → menuProductId via externalProductMappings (source="consignment")
  5. ctx.runMutation(api.consignment.mutations.insertBatch, { rows, uploadMeta })
    ↓
Convex Mutation:
  1. Upsert externalOutlets row (source="consignment", name=outletName)
  2. Insert consignmentUploads audit row (status="processing")
  3. Insert externalRevenue rows (source="consignment", consignmentUploadId, ...)
  4. For detail format: insert externalRevenueItems rows
  5. Update consignmentUploads status to "complete", rowCount=N
    ↓
HTTP action returns { uploadId, rowCount, errors[] } to frontend
    ↓
Frontend shows success toast with row count, refreshes upload history list
```

### Lifetime Totals Data Flow

```
User navigates to Sales Analytics → Lifetime tab (NEW)
    ↓
useQuery(api.externalData.queries.getLifetimeTotals)
    ↓
Query aggregates externalRevenue (all sources) + orderItems (for direct per-product)
    ↓
Returns: {
  totalGross, totalNet, totalUnits,
  byChannel: { gobiz, k3mart, internal, consignment },
  byProduct: [{ menuProductId, name, totalUnits, totalGross }]
}
    ↓
LifetimeTab renders:
  - Headline counters (total units sold lifetime, total gross revenue)
  - Per-channel breakdown cards
  - Per-product table with all-time totals
```

### Recharts Chart Extension Flow

```
Existing getRevenueTimeSeries query:
  - platforms = ["gobiz", "k3mart", "internal"]   → ADD "consignment"
  - buckets.set(key, { gobiz: 0, k3mart: 0, internal: 0, consignment: 0 })
  - series includes consignment series
    ↓
Frontend OverviewTab:
  - Existing stacked bar chart gets 4th series (consignment, distinct color)
  - Legend adds "Consignment" entry
  - sourceToPlatform("consignment") → "Consignment"
```

---

## Recommended File Structure (new files only)

```
convex/
└── consignment/
    ├── actions.ts          # processUpload action (Excel parsing, calls mutations)
    ├── mutations.ts        # insertBatch, deleteBatch mutations
    └── queries.ts          # listUploads, getUploadById

src/
├── components/
│   └── salesAnalytics/
│       ├── ConsignmentUploadTab.tsx   # New tab: file picker + upload history
│       └── LifetimeTab.tsx            # New tab: headline counters + per-product table
└── hooks/
    └── convex/
        └── useConsignment.ts          # Upload mutation + query hooks
```

**Modified files:**
- `convex/schema.ts` — add `consignmentUploads` table, extend source unions, add `consignmentUploadId` to `externalRevenue`
- `convex/http.ts` — add POST `/api/consignment-upload`, GET `/api/consignment-template`
- `convex/externalData/queries.ts` — extend `getRevenueTimeSeries`, `getDashboardSummaryByPeriod`, `getRevenueByOutlet` for consignment; add `getLifetimeTotals`
- `src/pages/SalesAnalytics.tsx` — add ConsignmentUpload and Lifetime tabs
- `src/components/salesAnalytics/OverviewTab.tsx` — add consignment series to Recharts charts

---

## Architectural Patterns

### Pattern 1: Revenue Source Union Extension

**What:** Add `v.literal("consignment")` to every `source` union in the schema and queries that currently enumerate `["gobiz", "k3mart", "internal"]`.
**When to use:** Any new sales channel that needs to flow through the unified analytics.
**Trade-offs:** Requires auditing all queries that hardcode the source list; missing one creates silent gaps in analytics.

**Checklist for source extension:**
- `externalRevenue.source` union
- `externalRevenueItems.source` union
- `externalOutlets.source` union
- `externalData/queries.ts` — `sourceToPlatform()` mapping function
- `externalData/queries.ts` — `platforms` arrays in time-series and dashboard queries
- `externalData/queries.ts` — `getDashboardSummaryByPeriod` `aggregate()` function channel breakdown

### Pattern 2: Batch Upload Audit Table

**What:** Every upload creates one `consignmentUploads` row as an audit anchor. Revenue rows link back via `consignmentUploadId`. Deletion removes the upload row (soft-delete) and all linked revenue rows.
**When to use:** Any manual bulk data entry where undo/history is needed.
**Trade-offs:** Requires filtering `externalRevenue` by `consignmentUploadId` for batch deletion. Acceptable for small batches (< 1K rows per upload).

### Pattern 3: Action → Mutation Separation for File Processing

**What:** HTTP action receives raw bytes and calls an action for CPU-bound parsing. Action calls a mutation for database writes. Mutations are transactional; actions are not.
**When to use:** Any file upload or external API call that modifies the database.
**Trade-offs:** Actions cannot be automatically retried by Convex on failure (unlike mutations). Error handling must be explicit in the action.

**Example:**
```typescript
// convex/consignment/actions.ts
export const processUpload = action({
  args: { fileBytes: v.array(v.number()), outletId: v.string(), token: v.string() },
  handler: async (ctx, args) => {
    // 1. Parse (CPU-bound, not transactional)
    const workbook = XLSX.read(new Uint8Array(args.fileBytes), { type: "array" });
    const rows = parseSheet(workbook);

    // 2. Write (transactional)
    return await ctx.runMutation(api.consignment.mutations.insertBatch, {
      rows,
      outletId: args.outletId as Id<"externalOutlets">,
      token: args.token,
    });
  },
});
```

### Pattern 4: Idempotent Outlet Upsert

**What:** Before inserting revenue rows, check if an `externalOutlets` row for the consignment outlet already exists. If not, create it.
**When to use:** Any upload that references an entity that may or may not exist.
**Trade-offs:** Must be done in the mutation (transactional context) to avoid race conditions. Use `withIndex("by_source_external_id", ...)` for the lookup.

---

## Integration Points

### Existing Tables Touched

| Table | Change | Impact |
|-------|--------|--------|
| `externalRevenue` | Add `source = "consignment"`, add `consignmentUploadId` optional field | All existing queries work unchanged; new source only appears when consignment data is uploaded |
| `externalRevenueItems` | Add `source = "consignment"` | Detail-format uploads write here; existing GoFood logic unaffected |
| `externalOutlets` | Add `source = "consignment"` to union | Consignment outlets become first-class outlets; outlet enrichment in queries works automatically |
| `externalProductMappings` | Add `source = "consignment"` mappings | Product name → menuProductId mapping reuses existing infrastructure |
| `dispatchConsignmentOutlets` | READ ONLY — used to pre-populate outlet selector in upload UI | No schema change; provides outlet name list for the picker |

### Existing Queries Extended

| Query | Extension | Risk |
|-------|-----------|------|
| `getRevenueTimeSeries` | Add `"consignment"` to platforms array and buckets | LOW — purely additive |
| `getDashboardSummaryByPeriod` | Add consignment to `channels` breakdown | LOW — additive; existing channel totals unaffected |
| `getRevenueByOutlet` | Consignment outlet rows appear automatically via outlet FK | LOW — no code change needed if outlet FK is set |
| `getRestockOverview` | Not affected — consignment not in restock logic | None |

### New Queries Needed

| Query | Location | Description |
|-------|----------|-------------|
| `getLifetimeTotals` | `externalData/queries.ts` | All-time aggregation by channel + by product |
| `listUploads` | `consignment/queries.ts` | Upload history for a given outlet |
| `getUploadById` | `consignment/queries.ts` | Detail view of one upload batch |

---

## Build Order and Phase Dependencies

### Phase 21: Consignment Upload (CON-01, CON-02, CON-03)

**Dependency:** None on Phase 22. Can be built independently.

**Order within Phase 21:**
1. Schema: add `consignmentUploads` table, extend source unions, add `consignmentUploadId` to `externalRevenue` (no migration needed — purely additive)
2. Backend action + mutation: `convex/consignment/` module with SheetJS parsing
3. HTTP endpoints: extend `convex/http.ts` with upload + template routes
4. Product mapping: extend `externalProductMappings` to accept `source="consignment"`
5. Frontend: `ConsignmentUploadTab` in Sales Analytics + `useConsignment` hook
6. Template download: GET endpoint + client-side download trigger

**Risk:** SheetJS import. Convex actions run in Node.js but the bundler must resolve `xlsx` at build time. Use static import at top of `actions.ts` (never dynamic import — see CLAUDE.md pitfall #8). Verify with `npx convex deploy --dry-run` after adding the dependency to `package.json`.

### Phase 22: Sales Analytics Extension (ANLY-01, ANLY-02)

**Dependency:** Phase 21 must be complete for consignment data to exist. However, ANLY-01 (chart extension) can be built in parallel — the consignment series shows zero values gracefully until data is uploaded.

**Order within Phase 22:**
1. Extend `getRevenueTimeSeries` and `getDashboardSummaryByPeriod` for consignment source
2. Extend Recharts charts in `OverviewTab` with consignment series
3. New `getLifetimeTotals` query covering all four channels
4. New `LifetimeTab` component with headline counters + per-product table
5. Add Lifetime tab to `SalesAnalytics.tsx`

---

## Anti-Patterns

### Anti-Pattern 1: New Table for Consignment Revenue

**What people do:** Create a `consignmentRevenue` table separate from `externalRevenue`.
**Why it's wrong:** Doubles the number of queries needed in analytics; `getRevenueTimeSeries` and all dashboard aggregations would need to join two tables. All existing channel comparison logic would need duplication.
**Do this instead:** Extend `externalRevenue` with `source = "consignment"`. The table was designed for multi-source revenue from the start.

### Anti-Pattern 2: Parsing Excel in a Convex Mutation

**What people do:** Pass file bytes directly to a mutation and parse there.
**Why it's wrong:** Convex mutations run in V8 isolate environment — Node.js modules like `xlsx` do not work. The mutation will fail silently in production (known pitfall documented in CLAUDE.md: "No dynamic imports in Convex").
**Do this instead:** Parse in a Convex `action` (Node.js runtime), then call a mutation for the database write.

### Anti-Pattern 3: Storing Consignment Outlet Reference as String

**What people do:** Store outlet name as a plain string field instead of an FK to `externalOutlets`.
**Why it's wrong:** All existing query enrichment logic (outlet name lookup in `getRevenue`, `getRevenueByOutlet`) relies on `outletId` FK. Without it, consignment rows show no outlet name in existing views.
**Do this instead:** Create `externalOutlets` rows for consignment outlets (source="consignment") and store the FK.

### Anti-Pattern 4: Full Scan for Lifetime Totals Without Acknowledging Scale

**What people do:** `getLifetimeTotals` does a full `collect()` on `externalRevenue` but no one flags it as a future scaling concern.
**Why it's wrong:** Works fine now but becomes a performance issue as the table grows. The issue is unexpected because Convex's real-time reactive queries re-run on every change.
**Do this instead:** Accept the full scan for v1.3 (acceptable at current scale, < 10K rows), document a pre-aggregated cache table as the v1.4 optimization path.

---

## Scaling Considerations

| Scale | Architecture Adjustments |
|-------|--------------------------|
| Current (~5K externalRevenue rows) | Full `collect()` for lifetime totals is fine; no optimization needed |
| ~50K rows | Add `lifetimeTotalsCache` single-row table updated on mutation; query reads cache |
| ~500K rows | Consider time-bucketed aggregates; separate hot (recent) from cold (historical) storage |

---

## Sources

- Direct inspection of `convex/schema.ts` (all 62 tables, 1472 lines) — HIGH confidence
- Direct inspection of `convex/externalData/queries.ts` (1622 lines, complete analytics query layer) — HIGH confidence
- Direct inspection of `convex/http.ts` — HIGH confidence
- Direct inspection of `src/pages/SalesAnalytics.tsx` — HIGH confidence
- Direct inspection of `.planning/PROJECT.md` (requirements CON-01 to ANLY-02) — HIGH confidence
- CLAUDE.md pitfall #8: "No dynamic imports in Convex — fails silently in production" — HIGH confidence
- Convex action/mutation separation pattern for file processing — HIGH confidence (established Convex architecture)

---
*Architecture research for: Frollie Recipe Master v1.3 — Consignment Upload + Lifetime Sales Analytics*
*Researched: 2026-02-22*
