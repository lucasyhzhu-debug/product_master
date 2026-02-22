# Feature Landscape

**Domain:** Consignment Sales Upload + Reconciliation + Lifetime Sales Analytics (FMCG F&B)
**Milestone:** v1.3 — CON-01/02/03 + ANLY-01/02 (Phases 21–22)
**Researched:** 2026-02-22
**Confidence:** MEDIUM-HIGH — Upload/import UX patterns well-documented; analytics extension is additive to proven existing architecture.

---

## Scope

This document covers the four feature clusters for Phases 21–22 only:

- **CON-01:** Manual consignment sales upload — bulk summary format (product + qty sold + qty returned + revenue per outlet per date range)
- **CON-02:** Manual consignment sales upload — transaction detail format (transaction ID + line items with product, qty, price)
- **CON-03:** Downloadable pre-formatted Excel template for consignment data entry (summary + detail sheets)
- **ANLY-01:** Consignment channel added to existing Recharts charts in Sales Analytics (alongside GoFood, K3Mart, Direct)
- **ANLY-02:** Lifetime totals dashboard — headline units sold counter + per-product breakdown table

**Already built (do not re-research or re-architect):**
- GoFood/K3Mart/Direct channels in Sales Analytics
- Recharts stacked charts, PlatformFilter pattern, period presets
- productMappings table for cross-channel product name normalization
- externalRevenue table with dataOrigin field
- productInventory table (not to be touched by consignment uploads)

---

## Table Stakes

Features users expect. Missing any of these = the feature is not shippable.

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| Excel file upload (browse + drag-drop) | Outlets send Excel files; any other format creates friction for non-technical outlet staff | Low | Accept .xlsx; .csv is a nice-to-have |
| Outlet selector before upload | Multiple outlets will eventually upload; data must be tagged to the right outlet | Low | Dropdown of known consignment outlets; can start with hardcoded Legato |
| Row preview table before committing | Upload without preview causes silent bad data ingestion; industry-standard pattern | Medium | Show first 10–20 rows parsed, highlight detected columns |
| Per-row validation errors with row numbers | "Import failed" with no specifics is unusable; users cannot fix what they cannot locate | Medium | Show row N, column name, error type (missing, wrong type, implausible value) |
| Duplicate upload detection with warning | Re-uploading the same period is a common mistake; data doubles silently without detection | Medium | Hash or match on (outlet + period start + period end); warn, allow override |
| Upload history / audit log | Admin must know what was uploaded when, by whom, and how many rows | Low | Table: timestamp, outlet, format, row count, uploader name |
| Delete upload (with confirmation) | Mistakes happen; admin must be able to remove bad uploads and re-upload | Low | Soft-delete or hard-delete with cascade to consignmentSales rows |
| Downloadable template — both sheets | Outlets need a starting point; blank Excel leads to wrong column names every time | Low | .xlsx with "Summary" and "Detail" sheets, headers, data types, example row, column notes |
| Consignment visible in Sales Analytics charts | The entire point of uploading is to see consignment data alongside other channels | Medium | Additive change to existing OverviewTab + SalesChart; new "consignment" PlatformFilter value |
| Lifetime total units sold counter | Managers ask "how many units have we sold ever?" — this is the number they want first | Low | Single large stat card; placed in Overview or as a new "Lifetime" section |
| Per-product lifetime breakdown table | Counter alone is not actionable; need product-level breakdown to understand mix | Low | Table: product name, total units, % of lifetime total; sortable |

---

## Differentiators

Features that provide high value at low cost for this specific context (small FMCG producer, 2–5 consignment outlets, monthly/weekly reconciliation cycle).

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| Net units auto-calculated on upload (sold − returned) | Returns are a real consignment reality; manual subtraction is error-prone | Low | `qtyNet = qtySold - qtyReturned` computed at parse time; display net in analytics |
| Revenue per unit derived on upload | Outlet may send total revenue without unit price; system derives it automatically | Low | `revenuePerUnit = revenueGross / qtyNet`; flag if implausible (< Rp 1k or > Rp 500k) |
| Consignment upload tab directly on Sales Analytics page | Unified entry point; uploading and viewing data in the same page reduces context switching | Low | Add "Uploads" tab to existing SalesAnalytics tabs (Overview, Mappings, Settings, Uploads) |
| Format auto-detection from column headers | Bulk vs detail format differ by presence of transactionId column; auto-detect removes a selector | Low | Check column names on parse; fall back to manual selection if ambiguous |
| Lifetime totals per channel (not just grand total) | "How many units via GoFood vs K3Mart vs consignment" is actionable for channel strategy | Low | Channel breakdown row beneath headline counter; pure aggregation, no new data |
| Period gap indicator per outlet | If October data is missing for Legato but Nov is uploaded, flag the gap | Medium | Compare uploaded date ranges per outlet; visual warning on upload history |

---

## Anti-Features

Features to explicitly NOT build for Phases 21–22. These are common requests or natural-seeming extensions that add complexity without value at this scale.

| Anti-Feature | Why Avoid | What to Do Instead |
|--------------|-----------|-------------------|
| Automated settlement reconciliation (match revenue to bank statements) | Out of scope per PROJECT.md decision: "Automated settlement reconciliation — Metric flagging sufficient at this scale; CON-04 simplified" | Show net revenue in analytics; admin compares to bank statement manually |
| Full double-entry accounting journal entries | Production system, not accounting system; adds massive complexity | Export revenue summaries for accountant; keep system focused on units and gross revenue |
| AI/ML column mapping inference | Overkill when 2–3 outlets with stable file formats; template download solves the problem at the root | Downloadable template + clear error messages for wrong column names |
| Inline cell editing in upload preview | Useful for power users, but adds significant state management complexity for an MVP | Fix-in-Excel-and-reupload is acceptable; clear per-row error messages make this fast |
| Consignment inventory deduction from productInventory | Consignment is a separate domain; PROJECT.md decision: "Per-unit consignment serialization — Batch tracking sufficient" | Track sales units and revenue only; do not touch productInventory table |
| Return-to-sender / GRN workflow for unsold goods | Out of scope; returns management is the outlet's process | Record returned qty as a numeric field in upload; no fulfillment workflow |
| Consignment payout calculation (commission splits) | Out of scope per PROJECT.md | Show gross revenue; accountant handles payout |
| Per-unit lot/batch/serialization tracking | Rp 40–120k snack product; no customer or partner expects serial tracking | Track at qty-per-upload-row level |
| Custom formula builder for outlet-specific mappings | 2–3 outlets do not need a formula engine | Fixed template + column name enforcement |
| Lifetime revenue chart (not just table) | Revenue normalization across channels is complex (GoFood net vs consignment gross); a chart would mislead | Table only for lifetime view; charts use the standard time-series view |
| Date-range filtering on lifetime counter | Lifetime means all-time; adding a filter defeats the semantic meaning | Keep as all-time total; existing period-filtered charts handle time-bounded views |
| Consignment outlet management page (full CRUD) | At 2–5 outlets, hardcoded or simple string is sufficient | Outlet name as string initially; add a lookup table only when outlets need configuration (commission rate, contact, etc.) — defer to a later phase |

---

## Feature Dependencies

```
CON-03 (Template download)
  → Should exist BEFORE outlets start using CON-01/02
  → No backend dependency; pure client-side ExcelJS generation
  → Ships in Phase 21 Wave 1 (backend) alongside schema; can go earlier

CON-01 (Bulk summary upload)
CON-02 (Transaction detail upload)
  → Both write to new Convex tables: consignmentUploads + consignmentSales
  → Both share the same parse-preview-validate-commit UI flow
  → CON-02 adds transactionId field; otherwise same schema
  → Phase 21 backend (Wave 1) must create tables before Phase 21 frontend (Wave 2)

ANLY-01 (Consignment in charts)
  → Depends on consignmentSales table existing (CON-01/02 prerequisite)
  → Additive change to OverviewTab.tsx PlatformFilter type
  → Additive change to SalesChart.tsx (new <Bar> data key + legend entry)
  → New Convex query to aggregate consignmentSales by date + channel

ANLY-02 (Lifetime totals)
  → Depends on consignmentSales (new) + existing orders/orderItems + externalRevenue
  → New Convex query: cross-table aggregation of ALL sales across all sources
  → Product name normalization via existing productMappings table
  → Two new UI components: LifetimeTotalsCard + LifetimeProductTable
  → Place in OverviewTab.tsx below or alongside existing period-filtered cards

Normalization dependency:
  → consignmentSales.productName (raw from Excel) must resolve to menuProductId
  → Use existing productMappings table (add "consignment" as a platform value)
  → ANLY-02 lifetime table must use normalized product names or it shows duplicates
```

---

## Data Model — Two New Tables

### `consignmentUploads` (audit log)

| Field | Type | Required | Notes |
|-------|------|----------|-------|
| outletName | string | yes | "Legato Goldfinch", "Legato Tamtem", etc. |
| uploadFormat | "bulk_summary" \| "transaction_detail" | yes | Which format was parsed |
| uploadedAt | number | yes | Epoch ms; auto-set on insert |
| uploadedBy | string | yes | User display name from session token |
| rowCount | number | yes | Successfully imported rows |
| periodStart | string | yes | YYYY-MM-DD — earliest sale date in upload |
| periodEnd | string | yes | YYYY-MM-DD — latest sale date in upload |
| notes | string | no | Admin free-text note |
| isDeleted | boolean | no | Soft-delete flag for audit trail |

### `consignmentSales` (line items)

| Field | Type | Required | Notes |
|-------|------|----------|-------|
| uploadId | Id<"consignmentUploads"> | yes | Parent upload (for delete cascade) |
| outletName | string | yes | Denormalized from upload for query performance |
| productName | string | yes | Raw name as received from outlet |
| menuProductId | Id<"menuProducts"> | no | Resolved via productMappings; null if unmapped |
| saleDate | string | yes | YYYY-MM-DD |
| qtySold | number | yes | Units sold |
| qtyReturned | number | yes | Units returned (default 0) |
| qtyNet | number | yes | qtySold − qtyReturned (computed on insert) |
| revenueGross | number | yes | Total gross revenue in IDR |
| transactionId | string | no | Detail format only; null for bulk summary |

**No `consignmentOutlets` table needed yet.** Outlet name as string is sufficient for 2–3 outlets. Add a table when outlets need per-outlet configuration (commission rates, contacts).

---

## Excel Library Recommendation

**Use ExcelJS for both template generation (CON-03) and file parsing (CON-01/02).**

Rationale:
- CON-03 requires styled output: column widths, header background color, bold headers, data validation dropdowns for product names, example data row, column notes in row 2. SheetJS community edition has no styling API.
- ExcelJS handles both read (parse uploaded .xlsx) and write (generate template .xlsx). One library for all three features.
- Works in browser (Vite bundle) — no server round-trip needed for either template download or file parsing.
- Template download pattern: generate in-browser with ExcelJS + `URL.createObjectURL(blob)` + `<a>` click trigger. No file storage, no backend call.
- Upload parsing pattern: read .xlsx in browser with ExcelJS, validate rows, send structured JSON rows to Convex mutation. Keeps Convex mutations simple (receive validated rows, not raw bytes).
- ExcelJS is actively maintained (2024–2025 releases), higher weekly npm downloads than xlsx-js-style alternatives.
- Confidence: MEDIUM — ExcelJS browser bundle adds ~500KB. Worth it; CON-03 is a user-facing feature with clear value. Verify bundle impact during implementation.

---

## Upload UX Flow (Standard Pattern)

Based on industry patterns from Smashing Magazine and ImportCSV research:

```
Step 1: Select outlet (dropdown)
Step 2: Choose or drag-drop file (.xlsx)
Step 3: Parse + auto-detect format (bulk vs detail)
Step 4: Preview table (first 20 rows, column headers mapped, errors highlighted per cell)
Step 5: Validation summary ("18 rows OK, 2 rows have errors in column X")
Step 6: Duplicate warning if (outlet + period start + period end) matches existing upload
Step 7: Confirm import → Convex mutation → success toast + row count
Step 8: Upload appears in history table
```

**Error handling rules (per importcsv.com research):**
- Always show row number + column name + reason (not just "error in row 5")
- "Show only rows with errors" toggle for large files
- Do not block import on warnings (implausible revenue per unit = warning, not error)
- Block import on hard errors (missing required column, non-numeric quantity)

---

## Analytics Integration Pattern

### ANLY-01: Adding Consignment to Charts

The existing `PlatformFilter` type in `OverviewTab.tsx` is:
```typescript
type PlatformFilter = "all" | "k3mart" | "gobiz" | "internal";
```
Extend to:
```typescript
type PlatformFilter = "all" | "k3mart" | "gobiz" | "internal" | "consignment";
```

The existing `SalesChart.tsx` uses declarative Recharts `<Bar>` components per channel. Add one `<Bar dataKey="consignment">` with a distinct color (suggested: amber/orange to contrast with existing teal/blue/green palette).

New Convex query needed: aggregate `consignmentSales` by `saleDate` grouped by the existing period logic. Return in the same shape as existing channel data. Plug into existing `useSalesAnalytics` hook or add a parallel `useConsignmentSales` hook.

### ANLY-02: Lifetime Totals

**Headline stat card design (based on Shopify/Tableau/Smashing research):**
- Large number, prominent placement, upper-left or top of overview section
- Label: "Units Sold (All Time)"
- Subtext: "Across all channels, all dates"
- No filter control on this card — lifetime is lifetime

**Per-product breakdown table:**
- Columns: Product | GoFood | K3Mart | Direct | Consignment | Total
- Sorted by Total descending
- Percentage column (optional, low priority)
- Uses normalized product names via productMappings — raw names from consignment uploads must be mapped before appearing in this table

**Convex query strategy:**
- Single `getLifetimeSalesByProduct` query joining: `orderItems` (direct), `externalRevenue` (GoFood + K3Mart), `consignmentSales` (consignment)
- Group by `menuProductId` (normalized) with fallback bucket for unmapped products
- Return as array sorted by total units descending
- This is a potentially expensive query — consider pagination or a cap at top-20 products for the initial render

---

## Phase Sequencing Recommendation

### Phase 21: Upload + Template (CON-01/02/03)

**Wave 1 (backend, parallel):**
- Agent A: Convex schema — add `consignmentUploads` + `consignmentSales` tables
- Agent B: ExcelJS template generation (CON-03) — client-side utility function, no backend needed
- Agent C: Convex mutations — `importBulkSummary`, `importTransactionDetail`, `deleteUpload`
- Agent D: Convex queries — `listUploads`, `getUploadRows`

**Wave 2 (frontend, parallel, after Wave 1):**
- Agent A: Upload UI — outlet selector, drag-drop, preview table, error display
- Agent B: Upload history tab + delete confirmation
- Agent C: Template download button (calls CON-03 utility)

**Wave 3 (verification, sequential):**
- TypeScript check + `npm run build` must pass

### Phase 22: Analytics Extension (ANLY-01/02)

**Wave 1 (backend):**
- Convex query: `getConsignmentSalesByDate` (for ANLY-01 charts)
- Convex query: `getLifetimeSalesByProduct` (for ANLY-02 table)

**Wave 2 (frontend):**
- Extend `PlatformFilter` + add consignment `<Bar>` to SalesChart
- Add `LifetimeTotalsCard` + `LifetimeProductTable` components to OverviewTab

---

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Upload UX pattern (import flow) | HIGH | Well-documented industry standard; multiple authoritative sources |
| ExcelJS for generation + parsing | MEDIUM | Library is proven; browser bundle size impact needs verification during implementation |
| Table/column schema | HIGH | Derived from PROJECT.md requirements; simple, unambiguous |
| Analytics integration (ANLY-01) | HIGH | Additive to proven existing pattern; low risk |
| Lifetime aggregation query (ANLY-02) | MEDIUM | Cross-table join is straightforward; productMappings normalization may have gaps for consignment product names |
| No productInventory connection | HIGH | Explicit decision in PROJECT.md; confirmed correct |
| Anti-features (what to exclude) | HIGH | Derived from PROJECT.md explicit out-of-scope decisions |

---

## Sources

- [Data import UX: designing spreadsheet imports users don't hate — ImportCSV](https://www.importcsv.com/blog/data-import-ux)
- [Designing An Attractive And Usable Data Importer — Smashing Magazine](https://www.smashingmagazine.com/2020/12/designing-attractive-usable-data-importer-app/)
- [How To Design Bulk Import UX — Smart Interface Design Patterns](https://smart-interface-design-patterns.com/articles/bulk-ux/)
- [Best UI patterns for file uploads — CSVBox Blog](https://blog.csvbox.io/file-upload-patterns/)
- [ExcelJS GitHub — Excel Workbook Manager](https://github.com/exceljs/exceljs)
- [ExcelJS npm package](https://www.npmjs.com/package/exceljs)
- [Store Performance Dashboard: Essential Reports — Shopify](https://www.shopify.com/retail/store-performance-dashboard)
- [From Data To Decisions: UX Strategies For Real-Time Dashboards — Smashing Magazine](https://www.smashingmagazine.com/2025/09/ux-strategies-real-time-dashboards/)
- [Recharts for Analytics Dashboards — Embeddable](https://embeddable.com/blog/what-is-recharts)
- [Consignment Inventory Accounting — Finale Inventory](https://www.finaleinventory.com/accounting-and-inventory-software/consignment-inventory-accounting)
- [Consignment Sales Accounting — AccountingTools](https://www.accountingtools.com/articles/consignment-accounting)
- [Top 6 FMCG Sales Metrics — FieldAssist](https://www.fieldassist.com/blog/6-fmcg-sales-metrics-to-track)
- [Best Consignment Software for 2026 — Technology Advice](https://technologyadvice.com/blog/sales/consignment-software/)

---

*Previous v1.3 feature research (2026-02-16) is archived above this file's history — covered multi-channel dispatch planning, consignment lifecycle (3 layers), and cross-channel analytics at a higher level. This document supersedes it for Phases 21–22 scope.*
