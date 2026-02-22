# Domain Pitfalls: v1.3 GoFood, Kitchen & Consignment

**Domain:** Excel upload + per-outlet GoFood depot management + lifetime analytics in Convex + React 19
**Researched:** 2026-02-22
**Confidence:** HIGH (based on direct codebase analysis of 62-table schema, existing integration code, prior v1.2 pitfalls review, and verified against Convex official documentation + SheetJS docs)

---

## Critical Pitfalls

Mistakes that cause data corruption, revenue misreporting, or a rewrite of a complete phase.

---

### Pitfall 1: Excel Parsing Parsed on the Client, Then Bulk-Inserted via Mutation — Hits 16 MiB Argument Limit

**What goes wrong:**
The natural Excel upload pattern in a Convex app is: parse the `.xlsx` file in the browser (using SheetJS/ExcelJS), build a JSON array of rows, then call a Convex mutation with that array as the argument. For small files (20–100 rows) this is fine. A bulk consignment summary file with 6 months of transaction history across 5 products and 3 outlets could be hundreds or thousands of rows. At Convex's verified 16 MiB mutation argument cap (5 MiB for Node.js actions), a large parsed payload will hit the limit and fail with an opaque error.

**Why it happens:**
Developers test with small sample files and never hit the limit. The edge case surfaces only when a user tries to upload their first real file after months of accumulated data entry.

**How to avoid:**
1. Parse the Excel file on the client. Chunk the resulting rows into batches of 100–200 rows maximum. Call the mutation iteratively per batch, not once with all rows.
2. Show progress: "Uploading batch 3 of 7…" so users are not staring at a frozen UI.
3. Alternatively, use Convex file storage (`generateUploadUrl`): upload the raw `.xlsx` binary to Convex storage (no 16 MiB limit on file storage uploads, only a 2-minute upload timeout), then trigger a Convex action to parse the stored file server-side via `ctx.storage.get(storageId)`. For a consignment upload that runs manually at most once per week, the simpler client-side batch approach is sufficient and avoids storing raw Excel files permanently.
4. Set an explicit file size guard in the UI: reject files larger than 5 MB with a clear error message.

**Warning signs:**
- Upload appears to start, then fails with "NetworkError" or a 413 status
- Works on small test files, fails on real data
- No error visible in UI because the Convex client swallows the oversized argument error silently in some versions

**Phase to address:** Phase 21 (CON-01, CON-02 — Consignment Excel Upload)

---

### Pitfall 2: Excel Date Cells Return Serial Numbers Instead of Date Strings

**What goes wrong:**
Excel stores dates internally as floating-point serial numbers (days since 1900-01-00). When SheetJS parses an `.xlsx` file with default options, date cells come back as JavaScript `Date` objects only if the cell's format code is detected as a date format. If the Legato staff who fills in the consignment spreadsheet uses a custom format (e.g., `dd/mm/yyyy` as text or `dd-mmm-yy`), SheetJS returns a number like `45678` instead of a Date. If the cell was typed as a plain string ("01/02/26"), it comes back as a raw string with no Date object. The parser then tries to insert `45678` or `"01/02/26"` as a date into Convex, and the `periodStart` field (which expects a Unix timestamp in milliseconds) gets wrong values — specifically, records land in 1900 or are rejected.

**Why it happens:**
Developers test with files they create themselves in Excel using a consistent format. Real-world spreadsheets filled by non-technical staff in Indonesia frequently mix date formats, use custom locale formats (dd/mm vs mm/dd), or type dates as plain text. ExcelJS has a known bug (issue #2695) where Strict Mode xlsx files treat date cells as raw floats and parse them as circa-1904 dates.

**How to avoid:**
1. Use SheetJS with `{ cellDates: true, dateNF: "yyyy-mm-dd" }` parse options. This instructs SheetJS to convert numeric date serials to Date objects.
2. After parsing, still validate: check if the value is a valid Date object (`!isNaN(date.getTime())`), a numeric serial (>40000 = plausible Excel date since 2009), or a string that matches known patterns (`dd/mm/yyyy`, `dd-mmm-yy`, `mm/dd/yyyy`).
3. Write a `parseConsignmentDate(raw: unknown): number | null` helper that handles all three cases and returns a WIB-midnight UTC timestamp in milliseconds, or `null` for unrecognizable input.
4. If `null`, surface a row-level error: "Row 5: Date '01/02/26' not recognized — expected DD/MM/YYYY format." Do not silently skip the row or insert a fallback date.
5. Include the date format expected in the downloadable template (CON-03): lock the date column format in the template to `yyyy-mm-dd` or `dd/mm/yyyy` with cell format enforcement.

**Warning signs:**
- Uploaded data shows dates in 1900 or 1904
- Date-grouped analytics show a spike on a single old date with all uploaded records
- `periodStart` values are all identical (parser silently defaulted to a fallback)

**Phase to address:** Phase 21 (CON-01, CON-02) — must be in the date parsing utility written before any insertion logic

---

### Pitfall 3: Merged Cells in Excel Cause Silent Data Loss for Repeated Header Rows

**What goes wrong:**
Consignment files from outlets like Legato frequently use merged header cells for date ranges (e.g., "February 2026" merged across 6 product columns). When SheetJS reads merged cells in a worksheet, only the top-left cell of the merge range holds the value; all other cells in the range return `undefined`. If the summary format uses merged cells for outlet names across multiple rows (e.g., "Legato Tamtem" merged across 10 product rows), and the parser tries to read the outlet name from each row, rows 2–10 have `undefined` for the outlet field. The parser silently inserts rows with `outletId: undefined`, bypassing the Convex validator (if the field is `v.optional`) or crashing (if required).

**Why it happens:**
Legato's current manual spreadsheet (which CON-03 aims to replace) almost certainly uses merged cells for visual grouping. Developers testing against the new template (which will not use merged cells) never hit this. Users who deviate from the template or upload their own format get silent data loss.

**How to avoid:**
1. Design the downloadable template (CON-03) with NO merged cells. Repeat outlet name, date, and period values on every data row. Include a comment in the template header: "Do not merge cells — required for import."
2. In the parser, detect and unmerge before extracting data. SheetJS exposes `ws['!merges']` — iterate this array and propagate the top-left cell value to all covered cells before calling `XLSX.utils.sheet_to_json`.
3. Add a validation step that rejects files containing merged cells in the data area with a user-facing message: "This file contains merged cells in columns A–F. Please use the Frollie template or unmerge before uploading."
4. Provide a clear template download link (CON-03) directly above the upload button so staff reach for it first.

**Warning signs:**
- Upload shows "X rows imported" but some rows are missing from the analytics view
- Some outlet or product entries show as blank/Unknown after upload
- Debug: `console.log(parsed rows)` shows `undefined` in expected string fields

**Phase to address:** Phase 21 (CON-01, CON-02) — parser must unmerge before `sheet_to_json`; Phase 21 also owns CON-03 template design

---

### Pitfall 4: GoFood Depot Stock Table Has No `outletId` — GF-03 Requires Per-Outlet Tracking

**What goes wrong:**
The existing `gofoodDepotStock` table (Phase 19 target: GF-03) is keyed only by `menuProductId`:

```
gofoodDepotStock: { menuProductId, quantity, stickerDeficit, lastUpdated }
```

There is no `outletId` or `depotId` field. This was flagged as a known pitfall in v1.2 (Pitfall 5 and the Technical Debt table). GF-03 requires "per-outlet GoFood depot stock tracking with alert when any depot < 5 products remaining." There are three GoFood outlets: Goldfinch, Crystal, and Tamtem. Each is a separate physical depot. Implementing GF-03 without a schema migration means all three outlets share a single stock counter — every GoFood sale from any outlet deducts from the same pool, and "any depot < 5" becomes impossible to compute.

**Why it happens:**
The table was originally designed for Goldfinch only (Phase 12). Adding Crystal and Tamtem incrementally made the single-depot assumption load-bearing across `getDepotStock`, `getGoFoodDailyOrder`, `getDepotFreshness`, `addShipment`, and the `seedFinishedGoodsLocations` seed function. All of these assume one depot per menuProduct row.

**How to avoid:**
1. Add `outletId: v.optional(v.id("externalOutlets"))` to `gofoodDepotStock` (optional first for backward compat with existing Goldfinch rows).
2. Add a composite index `by_outlet_product: ["outletId", "menuProductId"]` to `gofoodDepotStock`.
3. Migrate existing rows: run a one-time mutation that sets `outletId` to the Goldfinch outlet's `_id` for all current `gofoodDepotStock` rows.
4. After migration, update all queries/mutations that read or write `gofoodDepotStock` to filter by `outletId`.
5. `gofoodDepotShipments` already has no `outletId` either — add it there too (same pattern).
6. Do NOT skip this schema migration and try to infer the outlet from some other field — there is no reliable proxy.

**Warning signs:**
- Stock alert "depot < 5" fires for the wrong outlet
- Crystal or Tamtem shipment confirmations silently update Goldfinch's stock counter
- `getDepotStock` returns one row per product instead of three (one per outlet)

**Phase to address:** Phase 19 (GF-03) — must be the FIRST change in Phase 19 before any GF-03 UI is built; all subsequent GF-03/GF-04 query logic depends on this

---

### Pitfall 5: Lifetime Totals Double-Count Consignment Sales Already Present as GoFood/K3Mart Revenue

**What goes wrong:**
ANLY-02 requires "lifetime totals: headline units sold counter + per-product breakdown table" combining all channels. The existing `externalRevenue` table already contains K3Mart stock-delta-inferred sales (`source: "k3mart"`, `dataOrigin: "stock_delta"`) and GoBiz API revenue (`source: "gobiz"`, `dataOrigin: "api_revenue"`). Phase 21 will add consignment upload records for Legato outlets. If Legato uploads cover a period that overlaps with data already in `externalRevenue` from another path (e.g., a Legato outlet that was previously tracked via manual entry or by the dispatch planner), the lifetime total query counts the same units twice.

Additionally, the `orders` table contains direct sales (channel = "direct"). `getDailySalesSummary` (the existing report) aggregates ALL non-cancelled orders regardless of channel. If a "GoFood" or "k3mart" order was created in the orders table for tracking purposes, it also appears in the direct sales aggregate — adding it again to lifetime totals alongside the `externalRevenue` records gives a third count.

**Why it happens:**
`getDailySalesSummary` was written when only direct orders existed. The schema has evolved to track GoFood/K3Mart via `externalRevenue`, but `getDailySalesSummary` was never updated to exclude API-sourced channels from the orders table query. With consignment now added as a 4th channel via manual Excel upload to `externalRevenue`, the aggregation problem becomes more severe.

**How to avoid:**
1. Define a canonical source-of-truth per channel for "units sold":
   - **Direct orders:** `orders` table (channel = "direct" or null), status != Draft/Cancelled
   - **GoFood:** `externalRevenue` + `externalRevenueItems` (source = "gobiz")
   - **K3Mart:** `externalRevenue` (source = "k3mart", dataOrigin = "stock_delta")
   - **Consignment (Legato etc.):** `externalRevenue` (source = new literal, e.g., "consignment", dataOrigin = "csv_upload")
2. Update `getDailySalesSummary` to filter `orders` to channel = "direct" only. Currently it collects all non-cancelled orders with no channel filter.
3. For ANLY-02 lifetime totals, write a dedicated `getLifetimeTotals` query that sums across all four sources with explicit `UNION ALL` logic and a per-source attribution field. Never sum `orders` + `externalRevenue` for the same channel.
4. Add a uniqueness guard before consignment upload: query `externalRevenue` for existing records with `source: "consignment"` in the same date range and outlet. Surface a warning: "X records already exist for Legato Tamtem in Feb 2026 — uploading will add duplicates. Delete existing first?"
5. Consider adding `dataOrigin: "csv_upload"` as a literal in `externalRevenue.dataOrigin` (it already exists as a valid value but is not used by any current code path).

**Warning signs:**
- Lifetime units sold > total production log units ever made (production is the physical upper bound)
- Channel breakdown sums to more than the lifetime total (double-counted rows)
- Same product appears with identical quantities in both GoFood and Consignment channels for the same week

**Phase to address:** Phase 22 (ANLY-01, ANLY-02) must define source-of-truth map before writing any aggregation query; Phase 21 must add the consignment upload dedup guard

---

### Pitfall 6: WIB Timezone Conversion Produces Off-By-One Dates in Lifetime Aggregates

**What goes wrong:**
The codebase has WIB timezone handling in at least 5+ places with inconsistent implementations. `getDailySalesSummary` converts timestamps with `new Date(order.orderDate + 7 * 60 * 60 * 1000)` (WIB offset applied to UTC timestamp). `getGoFoodDailyOrder` uses `new Date(args.date + "T00:00:00+07:00").getTime()`. `getDepotFreshness` uses `new Date(Date.now() + 7 * 60 * 60 * 1000)`. These approaches are equivalent but if any future aggregation query forgets the +7h offset, orders created between 17:00 UTC and 23:59 UTC (midnight to 06:59 WIB next day) land on the wrong calendar date. For lifetime totals, this is a persistent error that silently accumulates.

Consignment Excel uploads introduce a new vector: the uploaded date cells represent WIB dates (Jakarta time), but the parser converts them to UTC midnight. If `parseConsignmentDate` produces midnight UTC for "2026-02-15", that timestamp in WIB is 07:00 WIB — correct for daily attribution. But if it produces midnight WIB (i.e., UTC-7h = 2026-02-14T17:00:00Z), the record lands on Feb 14 in any UTC-based query.

**Why it happens:**
JavaScript `new Date("2026-02-15")` (date-only string, ISO 8601) is parsed as UTC midnight, not local or WIB midnight. Developers test in Jakarta, where the system timezone is WIB, so local-time-based `toLocaleDateString()` returns the correct date. In production on Vercel/Convex (UTC), the same code produces dates one day behind.

**How to avoid:**
1. Establish a project-wide convention: all timestamps stored in Convex are Unix milliseconds in UTC. All date strings in query args and display are `YYYY-MM-DD` in WIB.
2. Write one canonical `toWibDateString(timestamp: number): string` utility and use it everywhere. Centralize in `convex/lib/dateUtils.ts`.
3. For consignment date parsing: interpret uploaded date cells as WIB dates. Convert to UTC by appending `T00:00:00+07:00` before creating a Date object: `new Date("2026-02-15T00:00:00+07:00").getTime()` gives the correct WIB midnight in UTC.
4. In the lifetime totals query, always pass a WIB date string for range boundaries, not a raw timestamp from `new Date("YYYY-MM-DD")`.

**Warning signs:**
- Analytics "today" shows no data until after 7 AM WIB (cutoff missed)
- Uploaded consignment records for Feb 15 appear under Feb 14 in the analytics chart
- Date ranges in the UI show mismatches between GoFood data and consignment data for boundary dates

**Phase to address:** Phase 21 (consignment date parsing must use WIB-aware conversion); Phase 22 (lifetime totals query must use the shared utility)

---

## Technical Debt Patterns

Shortcuts that seem reasonable but create long-term problems.

| Shortcut | Immediate Benefit | Long-term Cost | When Acceptable |
|----------|-------------------|----------------|-----------------|
| Parse Excel entirely client-side and send as one mutation call | Simple single-step upload | Fails silently on real data files >2–5 MB | Never — always batch or chunk |
| Reuse existing `externalRevenue.source` union without adding "consignment" literal | No schema change needed | Consignment records stored as `"internal"` break source-based filtering for lifetime aggregates | Never — add the literal properly |
| Skip outlet dedup check on upload | Simpler upload flow | Repeat uploads double-count lifetime totals permanently (no easy cleanup) | Never — always show "records already exist" warning |
| Use one global `gofoodDepotStock` row per product for all 3 outlets | No migration needed | GF-03 per-outlet alert and GF-04 restock algorithm become impossible | Never — migration is mandatory for Phase 19 |
| Derive lifetime totals from `getDailySalesSummary` by summing its output | Reuse existing query | `getDailySalesSummary` does not filter by channel, missing GoFood/K3Mart `externalRevenue` records | Only for direct-orders-only scope; not for cross-channel lifetime |
| Hard-code the 200 default production target in the kitchen view component | Quick fix | Target becomes stale when `kitchenConfig` row is updated via manager UI (KIT-09) | Never — always read from `kitchenConfig` table |

---

## Integration Gotchas

Common mistakes when connecting the new v1.3 features to existing systems.

| Integration | Common Mistake | Correct Approach |
|-------------|----------------|------------------|
| Consignment upload → `externalRevenue` | Using `source: "internal"` for uploaded records | Add `v.literal("consignment")` to the `externalRevenue.source` union; deploy schema first |
| GoFood depot → per-outlet stock | Reading `gofoodDepotStock` without filtering by `outletId` | Migrate table to add `outletId`, then always filter by outlet in queries |
| Dispatch planner → kitchen targets (KIT-12) | Overwriting `kitchenConfig.bigBallTarget`/`midBallTarget` on every dispatch confirmation | Write to a separate `productionProductTargets` row (source="dispatch") instead; kitchen reads both and shows totals |
| Lifetime totals → existing `orders` table | Summing all `orders` including GoFood/K3Mart channel orders | Filter `orders` to `channel = "direct"` only before counting; GoFood/K3Mart counted via `externalRevenue` |
| Excel date → Convex timestamp | `new Date("2026-02-15").getTime()` (UTC midnight) | `new Date("2026-02-15T00:00:00+07:00").getTime()` (WIB midnight) |
| Consignment outlet → `dispatchConsignmentOutlets` ID | Creating a separate `externalOutlets` row for Legato | Legato is already a `dispatchConsignmentOutlets` row; link consignment revenue to this table's ID, not `externalOutlets` |
| `externalRevenue.outletId` polymorphic union | Passing a `dispatchConsignmentOutlets` ID where an `externalOutlets` ID is expected | The schema already uses `v.optional(v.union(v.id("externalOutlets"), v.id("dispatchConsignmentOutlets")))` for `dispatchPlans.outletId` — follow the same pattern for new consignment revenue records |

---

## Performance Traps

Patterns that work at small scale but fail as historical data grows.

| Trap | Symptoms | Prevention | When It Breaks |
|------|----------|------------|----------------|
| `getLifetimeTotals` does `.collect()` on full `orders` + full `externalRevenue` in one query | Query times out (1-second Convex query limit) | Use indexed range scans with date boundaries; paginate if needed; consider a pre-aggregated `lifetimeSalesSummary` table updated on write | ~500+ orders + 1000+ externalRevenue rows (within 6–12 months of operation) |
| Upload 500 consignment rows in one batch to Convex mutation | 413 / argument-too-large error | Chunk into 100-row batches with progress indicator | Any file with >200 rows parsed to objects |
| `getDailySalesSummary` scans all orders on every page load of Analytics | Slow initial render; no visible issue at <200 orders | Add date range filter argument; default to last 90 days; allow user to extend to "all time" | ~300+ orders (currently approaching this threshold) |
| Per-outlet depot stock queries N+1 pattern in `getDepotStock` (loops over each product to get `menuProduct.name`) | Slow depot view on pages with 10+ menu products | Batch fetch all menu products at once, build a map, enrich without per-row DB calls | 15+ active menu products |

---

## Security Mistakes

| Mistake | Risk | Prevention |
|---------|------|------------|
| Accepting any file type in the upload input | Malicious file execution; server-side parse errors | Validate `file.type === "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"` and file extension `.xlsx` before parsing |
| Storing raw uploaded Excel file in Convex `_storage` permanently | Storage accumulation; files may contain personally identifiable supplier data | If storing for audit purposes, delete after successful parse (call `ctx.storage.delete(storageId)` in the same mutation that confirms import success); or store only metadata |
| Consignment upload mutation is not protected by `requireRole` | Any logged-in user including `kitchen` role can upload and corrupt revenue data | Wrap in `requireRole(ctx, args.token, ["manager", "admin"])` — consignment revenue is manager-level data |
| No row-count validation on uploaded data | Attacker can upload a 50,000-row file to exhaust Convex document write quota | Reject files that parse to more than N rows (recommend 2,000 as ceiling for a weekly consignment file) |

---

## UX Pitfalls

| Pitfall | User Impact | Better Approach |
|---------|-------------|-----------------|
| Upload succeeds but shows no confirmation of what was imported | Staff re-upload the same file, thinking the first upload failed, creating duplicates | Show a post-upload summary: "Imported 47 rows: Legato Tamtem Feb 1–15, 5 products. 2 rows skipped (see details)." |
| Template (CON-03) has no example data | Staff guess the format, enter wrong column order, upload fails | Include 2–3 rows of example data in the template with a "DELETE BEFORE UPLOADING" note in the first row |
| Lifetime totals headline shows "all time" with no date range context | Staff don't know if the counter includes old test data from seeding | Show "since YYYY-MM-DD" beneath the headline — use the earliest `order.createdAt` as the start anchor |
| Per-outlet depot alert shows absolute stock number without context | "3 boxes remaining" is alarming or fine depending on daily sales velocity | Show as "3 boxes (≈0.5 days at current 6/day rate)" using the GF-04 algorithm's own avg calculation |
| Upload button active even before an outlet is selected | Users upload a file with no outlet context; all rows go to "Unknown outlet" | Require outlet selection before the upload button becomes active; grey it out with tooltip "Select outlet first" |

---

## "Looks Done But Isn't" Checklist

Things that appear complete during demo but are missing critical pieces in production.

- [ ] **Excel Upload (CON-01/CON-02):** Works on the test file but not on Legato's actual format — verify against a real Legato Excel export, not a synthetic test file
- [ ] **Consignment Revenue (CON-01/CON-02):** Rows appear in the DB but lifetime totals (ANLY-02) do not include them — verify the `getLifetimeTotals` query reads from `source: "consignment"` entries
- [ ] **Per-Outlet Depot Stock (GF-03):** Depot stock page shows 3 outlet columns but all show the same number — verify that the `gofoodDepotStock` migration ran and `outletId` is populated on all rows
- [ ] **GF-04 Restock Suggestion:** Algorithm returns "n+1 avg last 3 days" but Mon reset to prev Thu is not triggering — verify the day-of-week branch is reading WIB date, not UTC date
- [ ] **Kitchen Targets (KIT-09/KIT-12):** Kitchen view shows 200/200 hardcoded — verify it reads from `kitchenConfig` table, not the default constant
- [ ] **Lifetime Analytics (ANLY-02):** Headline counter shows all units — verify it is NOT double-counting by running total against the production log's historical ball count
- [ ] **Consignment Upload Dedup:** Upload the same file twice — verify a warning appears on the second upload, no duplicates are created
- [ ] **Role Protection:** Consignment upload is accessible from kitchen role — verify `requireRole(["manager", "admin"])` is enforced on the mutation

---

## Recovery Strategies

| Pitfall | Recovery Cost | Recovery Steps |
|---------|---------------|----------------|
| Consignment revenue double-counted via duplicate upload | MEDIUM | Query `externalRevenue` for `source: "consignment"` duplicates (same outlet + date + product + quantity). Delete the later-inserted duplicates. Re-run lifetime totals. Add dedup guard before next release. |
| Lifetime totals double-counting direct orders + GoFood/K3Mart | MEDIUM | Update `getDailySalesSummary` to filter by `channel = "direct"`. Verify `getLifetimeTotals` sums from correct tables per channel. Test against production log as upper bound. |
| Dates imported off-by-one (WIB vs UTC) | MEDIUM | Identify all `externalRevenue` records with `source: "consignment"` and `dataOrigin: "csv_upload"`. Shift their `periodStart`/`periodEnd` by +7 hours (25200000 ms) via a one-time migration mutation. Fix the parser before the next upload. |
| `gofoodDepotStock` per-outlet migration skipped | HIGH | Every depot stock query now returns wrong per-outlet numbers. Must add `outletId` field, run migration to backfill existing rows to Goldfinch outlet ID, and verify all three outlet rows exist per product. Blocks GF-03 delivery until done. |
| Excel file with merged cells uploaded silently drops rows | LOW | User re-uploads using the CON-03 template. No DB corruption since dropped rows were never inserted. Add merge detection to parser and retry. |
| Consignment upload mutation unprotected | LOW-to-HIGH depending on when caught | Add `requireRole` immediately. Audit `externalRevenue` for any records inserted by non-manager users. Delete if clearly test/junk entries. |

---

## Pitfall-to-Phase Mapping

How v1.3 roadmap phases should address these pitfalls.

| Pitfall | Prevention Phase | Verification |
|---------|------------------|--------------|
| Excel argument size limit (Pitfall 1) | Phase 21 — chunk mutation calls, add file size guard | Upload a test file >500 rows; verify no 413 errors, progress shown |
| Excel date serial number parsing (Pitfall 2) | Phase 21 — `parseConsignmentDate()` utility with `cellDates: true` | Upload file with 3 date formats (ISO, dd/mm/yyyy, serial number); all must resolve correctly |
| Merged cells silent data loss (Pitfall 3) | Phase 21 — unmerge before `sheet_to_json`, CON-03 template has no merges | Upload file with merged outlet header; verify error message or auto-unmerge |
| `gofoodDepotStock` missing `outletId` (Pitfall 4) | Phase 19 — schema migration BEFORE GF-03 UI | Query `gofoodDepotStock` with `withIndex("by_outlet_product")` — must return 3 rows per product |
| Lifetime totals double-counting (Pitfall 5) | Phase 22 — define per-channel source-of-truth before writing aggregation | Lifetime units sold <= total balls produced (production log upper bound) |
| WIB timezone off-by-one in aggregates (Pitfall 6) | Phase 21 (date parsing) + Phase 22 (lifetime query) | Upload records for Feb 15; verify they appear on Feb 15 in analytics, not Feb 14 |
| `gofoodDepotStock` N+1 query pattern | Phase 19 — batch fetch menu products in `getDepotStock` | Depot stock query executes in <200ms with 15 products across 3 outlets |
| Consignment mutation unprotected | Phase 21 — add `requireRole` in mutation | Login as `kitchen` role; upload endpoint returns 403/unauthorized |

---

## Existing Technical Debt That Amplifies v1.3 Risks

Pre-existing issues from v1.2 that become more dangerous with v1.3 features.

| Debt Item | v1.2 Impact | v1.3 Amplification |
|-----------|-------------|---------------------|
| `gofoodDepotStock` has no `outletId` field | Implicitly Goldfinch-only; tolerable for single depot | GF-03 per-outlet alerts and GF-04 per-outlet algorithm are physically impossible without migration; blocks entire Phase 19 GF-03 |
| `getDailySalesSummary` collects all non-cancelled orders without channel filter | Minor inaccuracy for GoFood orders entered as orders | Lifetime totals built on top of this query will double-count GoFood/K3Mart channels that also appear in `externalRevenue` |
| Ingredient simulation uses name string matching | Fragile; breaks when names diverge | Not directly related to v1.3 features; but Phase 22 analytics must NOT use this pattern for product matching in consignment uploads — use `menuProductId` linkage via product mappings |
| Tamtem depot deduction silently skips when `seedFinishedGoodsLocations` not run | Known workaround; acceptable with manual seed | Adding per-outlet depot stock makes seed order more critical; document as Phase 19 deployment prerequisite |
| `productionProductTargets.source` is `v.string()` not union | Any string accepted | KIT-12 dispatch-driven targets must use a consistent source literal; without type enforcement, future queries filtering by source silently miss rows |
| WIB timezone implementations scattered across 5+ files | Occasional off-by-one bugs | Consignment upload adds a 6th implementation site; each new implementation multiplies the risk |

---

## Sources

- Codebase analysis: `convex/schema.ts` (62 tables, specifically `gofoodDepotStock`, `externalRevenue`, `externalRevenueItems`, `dispatchConsignmentOutlets`, `productInventory`), `convex/gofoodDepot/queries.ts`, `convex/gofoodDepot/mutations.ts`, `convex/reports/dailySales.ts` — HIGH confidence (direct code review)
- v1.2 PITFALLS.md (`.planning/research/PITFALLS.md`) — Pitfall 5 (3rd GoFood outlet) and the Technical Debt table confirmed `gofoodDepotStock` missing `outletId` — HIGH confidence (prior research)
- PROJECT.md Known Technical Debt section — confirmed 6 specific debt items carried to v1.3 — HIGH confidence (project document)
- SheetJS official docs: [Dates and Times](https://docs.sheetjs.com/docs/csf/features/dates/), [Merged Cells](https://docs.sheetjs.com/docs/csf/features/merges/), [Parse Options](https://docs.sheetjs.com/docs/api/parse-options/) — HIGH confidence (official docs)
- ExcelJS GitHub issue #2695 — Strict Mode xlsx files return date cells as floats (1904 dates) — MEDIUM confidence (GitHub issue, not official release note)
- Convex official limits: [docs.convex.dev/production/state/limits](https://docs.convex.dev/production/state/limits) — Mutation argument cap 16 MiB (5 MiB for Node.js actions); HTTP action response cap 20 MiB; 2-minute upload timeout via `generateUploadUrl` — HIGH confidence (official docs, fetched directly)
- Convex file storage docs: [docs.convex.dev/file-storage/upload-files](https://docs.convex.dev/file-storage/upload-files) — `generateUploadUrl` pattern, 1-hour URL expiry — HIGH confidence (official docs)

---
*Pitfalls research for: v1.3 GoFood Depot, Kitchen Targets, Consignment Upload, Lifetime Analytics*
*Researched: 2026-02-22*
