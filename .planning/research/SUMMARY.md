# Project Research Summary

**Project:** Frollie Recipe Master — v1.3 Consignment Excel Upload and Analytics Extension
**Domain:** Excel file import/export, multi-channel sales analytics (FMCG F&B, Indonesian market)
**Researched:** 2026-02-22
**Confidence:** HIGH

## Executive Summary

Frollie v1.3 extends an existing Convex + React 19 + TypeScript production system with two new capability clusters: manual consignment sales upload (CON-01/02/03, Phase 21) and lifetime multi-channel analytics (ANLY-01/02, Phase 22). Both features are additive extensions to an already mature codebase — no architectural rethinking is needed. The dominant pattern is to extend the existing `externalRevenue` table with a new `source = "consignment"` literal, reuse existing query shapes, and add two new Convex modules (`consignment/actions.ts`, `consignment/mutations.ts`, `consignment/queries.ts`) plus two new frontend components (`ConsignmentUploadTab`, `LifetimeTab`).

The single most important architecture decision is to parse Excel files inside a Convex action (Node.js runtime) rather than in a mutation (V8 isolate). Mutations cannot run Node.js modules such as SheetJS. The correct flow is: browser posts raw bytes to an HTTP action endpoint, which passes them to a Convex action for parsing, which then calls a mutation for the transactional database write. For the Excel library, **SheetJS 0.20.3 (CDN tarball) is the single library for both parsing and template generation.** FEATURES.md initially recommended ExcelJS for template generation due to richer styling, but ExcelJS has a confirmed date-parsing bug (issue #2695) in Strict Mode xlsx files — a non-trivial risk given that outlet staff upload files with varied date formats. SheetJS 0.20.3 supports column widths, frozen header rows, bold headers, and cell number formats via cell styles — sufficient for the CON-03 template requirement without the ExcelJS risk. Use SheetJS exclusively; one library, one install.

The primary risks are data-quality and aggregation correctness rather than technical difficulty. Three risks dominate: (1) Excel date cells from non-technical outlet staff using mixed formats must be parsed with `cellDates: true` and a WIB-aware conversion utility (`new Date("YYYY-MM-DD T00:00:00+07:00").getTime()`), not raw `new Date("YYYY-MM-DD")` which treats dates as UTC midnight; (2) lifetime totals (ANLY-02) must not double-count channels — the `orders` table must be filtered to `channel = "direct"` only, with GoFood/K3Mart/Consignment sourced exclusively from `externalRevenue`; (3) duplicate upload detection (same outlet + date range) must warn before inserting to prevent permanent double-counting in lifetime analytics.

---

## Key Findings

### Recommended Stack

v1.3 requires exactly one new npm dependency. The existing stack (Convex, React 19, TypeScript 5.9, Vite 7, Tailwind + shadcn/ui, Recharts, Sonner, Lucide React) handles everything else without additions or upgrades.

**Core technologies:**

- **SheetJS 0.20.3 (CDN tarball)** — Excel parsing (CON-01/02) AND template generation (CON-03) — the only option that is actively maintained, Vite-compatible via named ESM imports, tree-shakeable to ~180–220KB, and free of the ExcelJS Strict Mode date bug. Install via `npm install --save https://cdn.sheetjs.com/xlsx-0.20.3/xlsx-0.20.3.tgz`. Do NOT use `npm install xlsx` (npm registry is stuck at 0.18.5, outdated and unmaintained).
- **Recharts ^3.7.0 (already installed)** — add one `<Bar dataKey="consignment">` to existing stacked charts; no new chart types, no library version changes needed.
- **shadcn `<Table>` (already installed)** — per-product lifetime breakdown table (ANLY-02); no TanStack Table or new table library needed.
- **`React.lazy()`** — lazy-load the ConsignmentUpload component to keep SheetJS out of the initial bundle; consignment upload is an infrequent admin action.

**Critical install note:** The CDN tarball path must be followed exactly. `npm install xlsx` silently installs the abandoned 0.18.5 version. Always verify `package.json` shows `"xlsx": "https://cdn.sheetjs.com/xlsx-0.20.3/xlsx-0.20.3.tgz"` after install. Run `npm run type-check` and `npm run build` immediately after to confirm no breakage.

### Expected Features

**Must have (table stakes — Phase 21):**
- Excel file upload (.xlsx), outlet selector before upload, row preview before commit — industry-standard import UX; missing any of these means data is uploaded silently without staff trust
- Per-row validation errors with row number and column name — "import failed" with no specifics is unusable
- Duplicate upload detection with warning — re-uploading the same outlet + period creates permanent double-counting in lifetime analytics
- Upload history / audit log with delete capability — admin must be able to undo batch mistakes
- Downloadable template (CON-03) — both Bulk Summary and Transaction Detail sheets, with example rows and no merged cells

**Must have (table stakes — Phase 22):**
- Consignment channel visible in existing Sales Analytics stacked bar charts (ANLY-01) — the entire point of uploading data is to see it alongside other channels
- Lifetime units sold headline counter + per-product breakdown table (ANLY-02)

**Should have (differentiators — low cost, high value):**
- Net units auto-calculated on upload (`qtySold - qtyReturned`) — returns are a real consignment reality; manual subtraction is error-prone
- Revenue per unit derived on upload with implausibility flag (< Rp 1k or > Rp 500k)
- Format auto-detection (bulk vs detail) from presence of `transactionId` column header
- Consignment Upload tab placed directly on the SalesAnalytics page — unified entry point, reduces context switching
- Lifetime totals shown per channel alongside grand total (GoFood / K3Mart / Direct / Consignment)

**Defer (v2+):**
- Consignment outlet CRUD page — string name is sufficient for 2–3 outlets; build when commission rates or contacts need per-outlet configuration
- Automated settlement reconciliation — explicitly out of scope per PROJECT.md
- Period gap indicator per outlet — medium complexity; useful but not blocking
- Pre-aggregated `lifetimeSalesSummary` cache table — not needed at current scale; add at ~50K `externalRevenue` rows

### Architecture Approach

The architecture extends the existing `externalRevenue` unified revenue store rather than creating a separate `consignmentRevenue` table. Adding `v.literal("consignment")` to the `source` union means all existing analytics queries (`getRevenueTimeSeries`, `getDashboardSummaryByPeriod`, `getRevenueByOutlet`) gain consignment data with minimal changes. A new `consignmentUploads` audit table tracks batch-level upload metadata (parallel to how `externalSyncLogs` tracks GoFood/K3Mart sync batches), and individual revenue rows link back via `consignmentUploadId` for batch-level deletion. All schema changes for Phase 21 are additive — no existing data migration required.

**Major components:**

1. **`convex/consignment/actions.ts`** — receives raw Excel bytes (as `number[]` array passed from HTTP action), parses with SheetJS in Node.js runtime, validates rows, calls mutation. Must use static import at top of file (`import * as XLSX from "xlsx"`) — never dynamic import, which fails silently in production per CLAUDE.md Pitfall #8.
2. **`convex/consignment/mutations.ts`** — transactional writes: upsert `externalOutlets` row for consignment outlet (idempotent), insert `consignmentUploads` audit row at `status: "processing"`, bulk-insert `externalRevenue` rows in chunks (and `externalRevenueItems` for detail format), update audit row to `status: "complete"`.
3. **`convex/consignment/queries.ts`** — `listUploads`, `getUploadById` for the upload history UI.
4. **HTTP action in `convex/http.ts`** — POST `/api/consignment-upload` receives multipart file, calls `ctx.runAction`. GET `/api/consignment-template` returns a programmatically generated SheetJS XLSX buffer with `Content-Disposition: attachment` header.
5. **Extended `convex/externalData/queries.ts`** — extend `getRevenueTimeSeries` and `getDashboardSummaryByPeriod` for `"consignment"` source; add new `getLifetimeTotals` query covering all four channels.
6. **`src/components/salesAnalytics/ConsignmentUploadTab.tsx`** — outlet picker, file input (`<input type="file" accept=".xlsx">`), preview table, validation error display, upload history list, delete confirmation dialog.
7. **`src/components/salesAnalytics/LifetimeTab.tsx`** — headline counter ("Units Sold All Time"), per-channel breakdown cards, per-product table (sortable by total units descending).

**Source union extension checklist** — all of the following must be updated when adding `"consignment"`:
- `externalRevenue.source` union in schema
- `externalRevenueItems.source` union in schema
- `externalOutlets.source` union in schema
- `sourceToPlatform()` mapping function in `externalData/queries.ts`
- `platforms` arrays in `getRevenueTimeSeries` and `getDashboardSummaryByPeriod`
- `aggregate()` channel breakdown in `getDashboardSummaryByPeriod`

Missing even one of these creates silent gaps in analytics — no error, just absent data.

### Critical Pitfalls

1. **Mutation argument size limit (16 MiB) hit by large Excel files.** Parse client-side or in action, but chunk mutation write calls at 100–200 rows maximum. Show progress ("Uploading batch 3 of 7"). Add a 5 MB file size guard in the UI before parsing begins. Do not pass all parsed rows as a single mutation argument.

2. **Excel date cells returned as serial numbers or wrong-format strings.** Parse with SheetJS `{ cellDates: true, dateNF: "yyyy-mm-dd" }`. Write a single `parseConsignmentDate(raw: unknown): number | null` utility that handles Date objects, numeric serials (>40000 = plausible Excel date since 2009), and string patterns (`dd/mm/yyyy`, `dd-mmm-yy`, etc.). Always convert to WIB-midnight UTC via `new Date("2026-02-15T00:00:00+07:00").getTime()`. Surface `null` as a per-row error with row number + column name; never silently skip or insert a fallback date. Note: ExcelJS issue #2695 — Strict Mode xlsx files return date cells as floats; this is another reason to use SheetJS with `cellDates: true` instead.

3. **Merged cells in outlet-provided files cause silent data loss.** The CON-03 template must have zero merged cells and include a note: "Do not merge cells — required for import." The parser must call `ws['!merges']` detection before `utils.sheet_to_json` and either auto-propagate the top-left cell value to covered cells, or reject with a user-facing message.

4. **Lifetime totals double-counting channels.** Define a canonical source-of-truth per channel before writing any ANLY-02 aggregation code: Direct = `orders` table filtered to `channel = "direct"` only; GoFood/K3Mart/Consignment = `externalRevenue` by source. The existing `getDailySalesSummary` query collects all non-cancelled orders without a channel filter — this must be fixed before ANLY-02 is built. Validate: lifetime units sold must never exceed total balls produced (production log is the physical upper bound).

5. **WIB timezone off-by-one in aggregates.** `new Date("YYYY-MM-DD")` is UTC midnight, not WIB midnight. Orders placed between 17:00 UTC and 23:59 UTC (midnight to 06:59 WIB next day) land on the wrong calendar date. Consignment upload adds a 6th timezone implementation site in the codebase. Centralize in `convex/lib/dateUtils.ts` — create this utility in Phase 21 and import it from Phase 22.

---

## Implications for Roadmap

Based on combined research, the two-phase structure already identified in PROJECT.md is correct and well-supported. No restructuring is recommended. The main contribution of this research is the ordering of steps within phases, identifying specific implementation guards, and resolving the ExcelJS vs SheetJS conflict in favor of SheetJS.

### Phase 21: Consignment Upload (CON-01, CON-02, CON-03)

**Rationale:** CON-03 (template download) must exist before outlets are asked to submit data via CON-01/02. The backend schema and mutation layer must be in place before the frontend. This phase has no dependency on Phase 22 and can be built independently.

**Delivers:** Complete consignment upload capability — template download, file upload with validation, preview table, dedup warning, audit history, and delete. Consignment data exists in `externalRevenue` ready for Phase 22 to aggregate.

**Addresses features:** CON-01 (bulk summary upload), CON-02 (transaction detail upload), CON-03 (downloadable template), outlet selector, row preview, per-row validation, duplicate detection, upload history with delete.

**Avoids pitfalls:**
- Pitfall 1: Chunk mutation calls at 100–200 rows; 5 MB file size guard
- Pitfall 2: `parseConsignmentDate()` utility with SheetJS `cellDates: true` and WIB-aware conversion
- Pitfall 3: Merged cell detection before `sheet_to_json`; template has no merged cells
- Pitfall 5 (partial): `convex/lib/dateUtils.ts` created here, consumed in Phase 22

**Wave structure:**
- Wave 1 (parallel backend): Schema additions — `consignmentUploads` table + all source union extensions; Convex action + mutation module in `convex/consignment/`; HTTP endpoints (POST upload + GET template) in `convex/http.ts`; SheetJS template generation function; `convex/lib/dateUtils.ts` WIB utility
- Wave 2 (parallel frontend, after Wave 1): `ConsignmentUploadTab.tsx` (outlet picker, file input, preview, validation errors, dedup warning, upload history, delete); template download trigger button
- Wave 3 (sequential): `npm run type-check` + `npm run build` must pass; upload a 200-row test file to verify chunked batch behavior

### Phase 22: Analytics Extension (ANLY-01, ANLY-02)

**Rationale:** Requires consignment data in `externalRevenue` (Phase 21 prerequisite). However, ANLY-01 chart extension can be coded while Phase 21 is still underway — the consignment series shows zero values gracefully until data is uploaded. ANLY-02 needs the source-of-truth map defined before any aggregation code is written.

**Delivers:** Consignment channel visible in all existing Sales Analytics stacked bar charts + lifetime units sold headline counter with per-product, per-channel breakdown table.

**Addresses features:** ANLY-01 (consignment in stacked bar charts), ANLY-02 (lifetime totals dashboard), per-channel lifetime breakdown.

**Avoids pitfalls:**
- Pitfall 4: Per-channel source-of-truth defined first; `getDailySalesSummary` fixed to filter `channel = "direct"`; validate lifetime total against production log upper bound
- Pitfall 5 (full): All aggregation query date boundaries use `convex/lib/dateUtils.ts` from Phase 21

**Wave structure:**
- Wave 1 (backend): Extend `getRevenueTimeSeries` + `getDashboardSummaryByPeriod` for `"consignment"` source; fix `getDailySalesSummary` channel filter; new `getLifetimeTotals` query with documented per-source join strategy
- Wave 2 (parallel frontend, after Wave 1): Extend `OverviewTab.tsx` with consignment `<Bar>` entry + legend; new `LifetimeTab.tsx` with headline card + per-product table; add Lifetime tab to `SalesAnalytics.tsx`
- Wave 3 (sequential): `npm run build` must pass; validate lifetime total does not exceed production log ball count

### Phase Ordering Rationale

- Phase 21 before Phase 22: consignment rows must exist in `externalRevenue` for ANLY-02 to aggregate; ANLY-01 chart extension can be developed in parallel but schema must be in place.
- Template (CON-03) must be built in Phase 21 Wave 1 alongside schema — outlets need it before they upload any data; building it after upload UI is backwards.
- Schema changes are all additive (no existing data migration required for Phase 21) — schema can be deployed independently and verified before frontend work begins.
- `convex/lib/dateUtils.ts` WIB utility created in Phase 21 Wave 1 and imported in Phase 22 Wave 1 — this dependency must be explicit in Wave plans.
- Fix `getDailySalesSummary` channel filter in Phase 22 Wave 1 before writing `getLifetimeTotals` — building the aggregation on a broken foundation guarantees wrong numbers.

### Research Flags

Phases likely needing deeper research during planning:

- **Phase 22 — `getLifetimeTotals` per-product join strategy:** The per-product breakdown requires different join strategies per source (GoFood: `externalRevenueItems`; K3Mart: `externalRevenue.quantitySold`; Direct: `orderItems` directly for per-product accuracy; Consignment bulk: `externalRevenue.quantitySold`; Consignment detail: `externalRevenueItems`). The aggregation logic is non-trivial and could create N+1 query patterns if implemented without a design review. A targeted query design pass before assigning to executor is recommended.
- **Phase 21 — chunked batch upload UX:** The exact UX for multi-batch uploads (progress state, per-batch error handling, partial success when batch 3 of 7 fails) is not fully specified in research. During planning, define exact user-facing states before assigning to executor.

Phases with standard patterns (skip research-phase):
- **Phase 21 — Schema changes:** All additive union extensions to well-understood tables; established Convex pattern with no migration needed.
- **Phase 21 — HTTP action + action + mutation separation:** Well-documented Convex file upload pattern; ARCHITECTURE.md has working code examples for the full flow.
- **Phase 21 — CON-03 template download:** SheetJS `aoa_to_sheet` + `writeFileXLSX` pattern is fully specified in STACK.md with working code samples.
- **Phase 22 — ANLY-01 chart extension:** One new `<Bar>` entry in an existing declarative Recharts chart; no design uncertainty, purely additive.

---

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | HIGH | SheetJS 0.20.3 verified via official CDN docs; Vite + React 19 + TypeScript 5.9 compatibility confirmed. ExcelJS conflict resolved in favor of SheetJS — avoids date bug #2695, smaller bundle, tree-shakeable. Basic styling (column widths, frozen row, bold headers) achievable in SheetJS without ExcelJS. |
| Features | MEDIUM-HIGH | Upload UX patterns documented from multiple authoritative sources. CON-03 styling scope achievable with SheetJS cell styles. Anti-feature decisions (no settlement reconciliation, no outlet CRUD page, no inventory connection) are explicit in PROJECT.md. Per-product lifetime join complexity requires implementation-time verification. |
| Architecture | HIGH | Based on direct codebase inspection of 62-table schema, existing query layer (1622 lines), and `convex/http.ts`. All architectural decisions verified against actual code. SheetJS confirmed to work in Convex actions (Node.js runtime). Source union extension checklist derived from auditing every query that enumerates the source field. |
| Pitfalls | HIGH | Six critical pitfalls identified from direct code analysis (schema, queries, reports), Convex official limit documentation, and SheetJS official docs for date/merge handling. ExcelJS date bug confirmed via GitHub issue #2695. WIB timezone scatter confirmed by counting 5+ existing implementations. |

**Overall confidence:** HIGH

### Gaps to Address

- **SheetJS cell styling for CON-03 template:** FEATURES.md assumed ExcelJS was needed for "pretty template" styling. Resolution: SheetJS supports column widths (`!cols`), frozen rows (`!freeze`), and cell styles (`s` property on cell objects) via the xlsxs format. During Phase 21 planning, the executor should verify SheetJS cell styling produces the required visual output before Wave 1 begins. If SheetJS cell styles prove insufficient for the specific design requirements, the acceptable fallback is a structurally correct template without color styling (headers bold, columns wide, example rows present — but no fill colors), which is still a significant improvement over a blank file.

- **`getLifetimeTotals` per-product join complexity:** Direct channel per-product counts require joining `orderItems`, not `externalRevenue` (the mirrored revenue rows do not store per-product quantities for multi-item orders). This join logic needs a design review during Phase 22 planning to avoid N+1 query patterns at scale. Specifically: batch-fetch all `orderItems` for completed direct orders, build a product-keyed map, then merge with `externalRevenue` aggregates.

- **Outlet FK strategy for `externalRevenue.outletId`:** ARCHITECTURE.md recommends Option A — add consignment outlets to `externalOutlets` table with `source = "consignment"`. However, PITFALLS.md notes that `dispatchConsignmentOutlets` already holds Legato outlet data, and some schema fields use a polymorphic union. The executor must inspect current `dispatchConsignmentOutlets` data during Phase 21 planning and decide: reuse those IDs or create parallel `externalOutlets` rows. This decision must be made before schema migration starts to avoid a second migration.

- **Real Legato Excel file format:** All upload parsing must be validated against an actual Legato outlet Excel file, not a synthetic test file. Staff formatting habits (date cells, merged headers, custom column names) will differ from the template. Request a real sample file before Phase 21 Wave 2 frontend work begins.

---

## Sources

### Primary (HIGH confidence)

- SheetJS official docs — Installation for Frameworks/Bundlers, Vite integration guide, React integration, Dates and Times, Merged Cells, Parse Options (`https://docs.sheetjs.com/`)
- SheetJS CDN version 0.20.3 — `https://cdn.sheetjs.com/xlsx-0.20.3/xlsx-0.20.3.tgz`
- Convex official docs — Production limits (16 MiB mutation arg cap, 5 MiB action cap), File Storage upload pattern, action/mutation separation for file processing (`https://docs.convex.dev/production/state/limits`)
- Direct codebase analysis — `convex/schema.ts` (62 tables, 1472 lines), `convex/externalData/queries.ts` (1622 lines), `convex/http.ts`, `src/pages/SalesAnalytics.tsx`, `convex/reports/dailySales.ts`
- `.planning/PROJECT.md` — CON-01 to ANLY-02 requirements, explicit out-of-scope decisions, Known Technical Debt section
- `CLAUDE.md` — Pitfall #8 (no dynamic imports in Convex), project-wide conventions, file path map

### Secondary (MEDIUM confidence)

- ExcelJS GitHub issue #2695 — Strict Mode xlsx date cells parsed as 1904-era floats (confirmed from GitHub issue thread, not an official release note)
- Smashing Magazine — Designing An Attractive And Usable Data Importer (import UX patterns)
- ImportCSV.com — Data import UX: designing spreadsheet imports users don't hate (per-row error pattern, step-by-step flow)
- Smart Interface Design Patterns — How To Design Bulk Import UX
- Bundlephobia / community reports — ExcelJS bundle size ~500KB unshaken, SheetJS tree-shaken to ~180–220KB

### Tertiary (LOW confidence)

- FieldAssist — Top 6 FMCG Sales Metrics (context for what analytics metrics managers need)
- AccountingTools — Consignment Sales Accounting (context for net vs gross revenue distinction and returns handling)

---
*Research completed: 2026-02-22*
*Ready for roadmap: yes*
