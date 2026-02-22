# Stack Research: v1.3 Consignment Excel Upload and Analytics Extension

**Domain:** Excel file parsing/generation in a browser-based Convex + React 19 app
**Researched:** 2026-02-22
**Confidence:** HIGH

---

## Summary

v1.3 requires exactly **one new npm dependency**: SheetJS (xlsx 0.20.3). Everything else — file upload architecture, charting, UI — is handled by the existing stack. This document explains the how and why for each decision, and what to explicitly avoid.

---

## New Dependency Required

### SheetJS (xlsx 0.20.3)

The only stack addition for v1.3.

| Technology | Version | Purpose | Why Recommended |
|------------|---------|---------|-----------------|
| xlsx (SheetJS Community Edition) | 0.20.3 | Parse uploaded `.xlsx` files from consignment outlets; generate downloadable template `.xlsx` files | The dominant browser-compatible Excel library. Handles read + write in one package, works in Vite (ESM, named imports, tree-shaking), no server-side component needed. The only library that does both parsing and generation well in-browser. |

**Install command (CDN tarball — do not use npm registry):**

```bash
npm install --save https://cdn.sheetjs.com/xlsx-0.20.3/xlsx-0.20.3.tgz
```

**Why the CDN tarball, not `npm install xlsx`:**
The `xlsx` package on the public npm registry is version 0.18.5, which is outdated and unmaintained. SheetJS stopped publishing to npm. Version 0.20.3 (current as of April 2024) is only available from `cdn.sheetjs.com`. The CDN tarball installs identically to a registry package — it saves into `node_modules/xlsx` and appears in `package.json` as `"xlsx": "https://cdn.sheetjs.com/xlsx-0.20.3/xlsx-0.20.3.tgz"`.

**Import pattern for Vite + React (named imports, tree-shakeable):**

```typescript
// Parsing only (upload path)
import { read, utils } from 'xlsx';

// Generation only (template download path)
import { utils, writeFileXLSX } from 'xlsx';
```

Using `writeFileXLSX` instead of the generic `writeFile` significantly reduces bundle size — it only includes the XLSX serializer, not all format serializers.

---

## Existing Stack — What's Already There

All of these are sufficient as-is. Do not add alternatives.

### Core Technologies (Unchanged)

| Technology | Version | v1.3 Use | Status |
|------------|---------|----------|--------|
| Convex | ^1.31.7 | Storage for parsed data (new `consignmentSales` table). `generateUploadUrl` for file uploads if needed. | Already installed |
| React | ^19.2.0 | File input `<input type="file">`, `onChange` handler, `FileReader` for `.arrayBuffer()` | Already installed |
| TypeScript | ~5.9.3 | Type the parsed row shape for both bulk-summary and transaction-detail formats | Already installed |
| Vite | ^7.2.4 | No config changes needed for xlsx 0.20.3 (SheetJS added Vite-compatible metadata in 0.18.10) | Already installed |
| Tailwind CSS + shadcn/ui | ^4.1.18 | Upload dropzone, progress states, error display, table display of imported rows | Already installed |
| Recharts | ^3.7.0 | Extend existing `SalesChart.tsx` stacked bar — add `"Consignment"` as a new platform color/series. No new chart types needed. | Already installed |
| Sonner | ^2.0.7 | Toast on upload success/failure, row count feedback | Already installed |
| Lucide React | ^0.564.0 | `Upload`, `Download`, `FileSpreadsheet` icons for upload UI | Already installed |

---

## Architecture: File Upload Without Convex Storage

**Decision: Parse Excel client-side in the browser. Store only the structured data in Convex, not the file.**

For consignment uploads, there is no reason to store the raw `.xlsx` file. The workflow is:

1. User selects `.xlsx` file via `<input type="file">`
2. Browser reads it as `ArrayBuffer` using `FileReader.readAsArrayBuffer()`
3. SheetJS parses the `ArrayBuffer` into rows of structured data
4. React renders a preview table for the user to confirm
5. On confirm, a Convex mutation saves the parsed rows to `consignmentSales` table

This is entirely client-side parsing — no HTTP upload endpoint, no Convex `generateUploadUrl`, no `_storage` table involvement. The file never leaves the browser.

**Why this is correct:**
- The file is transient input data; the rows are the durable record
- Avoids 20MB HTTP action limit (irrelevant, but avoid complexity)
- No storage costs, no cleanup cron needed
- Standard pattern for structured data import in internal tools

**File upload code pattern:**

```typescript
import { read, utils } from 'xlsx';

async function parseExcelFile(file: File): Promise<ConsignmentRow[]> {
  const buffer = await file.arrayBuffer();
  const wb = read(buffer, { type: 'array' });
  const ws = wb.Sheets[wb.SheetNames[0]];
  const rows = utils.sheet_to_json<RawConsignmentRow>(ws, { header: 1 });
  // validate and transform rows...
  return rows;
}
```

**Template download code pattern:**

```typescript
import { utils, writeFileXLSX } from 'xlsx';

function downloadTemplate() {
  const summarySheet = utils.aoa_to_sheet([
    ['Date From', 'Date To', 'Outlet', 'Product', 'Qty Sold', 'Qty Returned', 'Revenue (Rp)'],
    ['2026-01-01', '2026-01-15', 'Legato BSD', 'Frollie Original', 0, 0, 0],
  ]);
  const detailSheet = utils.aoa_to_sheet([
    ['Transaction ID', 'Date', 'Outlet', 'Product', 'Qty', 'Unit Price (Rp)', 'Total (Rp)'],
    ['TXN-001', '2026-01-05', 'Legato BSD', 'Frollie Original', 2, 45000, 90000],
  ]);
  const wb = utils.book_new();
  utils.book_append_sheet(wb, summarySheet, 'Bulk Summary');
  utils.book_append_sheet(wb, detailSheet, 'Transaction Detail');
  writeFileXLSX(wb, 'consignment_template.xlsx');
}
```

---

## Analytics Extension: No New Libraries

The ANLY-01 and ANLY-02 requirements (consignment channel in charts, lifetime totals) extend existing Recharts patterns.

**ANLY-01 — Add consignment channel to stacked bar charts:**

`SalesChart.tsx` already has a `PLATFORM_COLORS` map and renders one `<Bar>` per channel. Adding consignment is:
1. Add `"Consignment": "#8b5cf6"` (violet-500) to `PLATFORM_COLORS`
2. Include consignment data in the time-series query result
3. Add a `<Bar dataKey="Consignment" ... />` in the chart JSX

No new Recharts components, no new chart types.

**ANLY-02 — Lifetime totals counter + per-product table:**

This is a Convex aggregate query (sum across all time, no date filter) plus a simple HTML table rendered with Tailwind. Recharts is not needed for a number counter or a text table. Use shadcn `<Table>` components already in the codebase.

---

## What NOT to Add

| Avoid | Why | Use Instead |
|-------|-----|-------------|
| `xlsx` from npm registry (`npm install xlsx`) | npm registry version is 0.18.5 — outdated, unmaintained, security vulnerabilities. Missing Vite metadata. | CDN tarball: `https://cdn.sheetjs.com/xlsx-0.20.3/xlsx-0.20.3.tgz` |
| `exceljs` (npm) | Last major update 2 years ago. Literally doubles Vite bundle size (no tree-shaking, ~200KB minified). Browser support is secondary use case. TypeScript types are inaccurate in some cases. | SheetJS 0.20.3 — smaller, tree-shakeable, active CDN distribution |
| `papaparse` | CSV only. The consignment outlets use `.xlsx`, not `.csv`. Wrong tool. | SheetJS handles both .xlsx and .csv if needed |
| `node-xlsx` | Node.js-only. Cannot run in browser. Would require a Convex action with `"use node"` just to parse the file, adding unnecessary round-trip. | SheetJS client-side parsing |
| `FileSaver.js` | ExcelJS dependency. Not needed with SheetJS — `writeFileXLSX()` handles browser download natively via `<a>` tag + Blob URL. | SheetJS `writeFileXLSX` built-in download |
| Convex `generateUploadUrl` + file storage | Would store the raw `.xlsx` bytes durably, requiring cleanup cron and storage cost. The rows are the data we care about, not the file. | Client-side parsing — store structured rows only |
| `react-dropzone` | Adds ~30KB for a styled dropzone. The upload UI for this internal tool is a simple `<input type="file" accept=".xlsx">` button. | Native HTML `<input type="file">` + shadcn `Button` |
| `@tanstack/react-table` | Not needed for the lifetime per-product table. It's a static read-only table with ~10 rows. | shadcn `<Table>` components |
| New charting library (`nivo`, `victory`, `chart.js`) | Recharts already handles all chart types needed. Adding a second charting library fragments the visual language. | Recharts ^3.7.0 (already installed) |
| Recharts upgrade | Currently on ^3.7.0 which is the current major version. Mid-milestone upgrades risk type breaks. | Stay on ^3.7.0 |

---

## Version Compatibility

| Package | Version | Compatibility Notes |
|---------|---------|---------------------|
| xlsx (SheetJS) | 0.20.3 | Compatible with Vite 7.x — SheetJS added required package.json metadata in 0.18.10. Named ESM imports work. No config changes to `vite.config.ts` needed. |
| xlsx (SheetJS) | 0.20.3 | Compatible with React 19 — SheetJS is UI-framework agnostic. No peer dependency conflicts. |
| xlsx (SheetJS) | 0.20.3 | Compatible with TypeScript ~5.9 — types are bundled in the package. No `@types/xlsx` needed (that's for the old 0.18.5 version). |
| recharts | ^3.7.0 | No changes. Adding a new `<Bar>` to existing charts is backward-compatible. |

---

## Bundle Size Impact

The project already has a 1.8MB JS bundle (noted as technical debt in PROJECT.md). SheetJS adds approximately:

- Full library: ~340KB minified + gzipped
- With tree-shaking (named imports + `writeFileXLSX`): ~180–220KB for parse + generate

**Mitigation:** Lazy-load the consignment upload component. Since Excel upload is an infrequent admin action (not on any hot path), wrap the upload page/modal in `React.lazy()`:

```typescript
const ConsignmentUpload = React.lazy(() => import('./ConsignmentUpload'));
```

This keeps SheetJS out of the initial bundle and only loads it when a manager navigates to the upload page. This is the recommended pattern for heavy upload libraries.

---

## Installation

```bash
# The only new package
npm install --save https://cdn.sheetjs.com/xlsx-0.20.3/xlsx-0.20.3.tgz

# Verify nothing broke
npm run type-check
npm run build
```

After install, `package.json` will show:
```json
"xlsx": "https://cdn.sheetjs.com/xlsx-0.20.3/xlsx-0.20.3.tgz"
```

---

## Alternatives Considered

| Recommended | Alternative | When to Use Alternative |
|-------------|-------------|-------------------------|
| SheetJS 0.20.3 (CDN tarball) | ExcelJS 4.4.0 (npm) | Only if you need pixel-perfect Excel formatting (cell colors, merged cells, print layout). For data import/export templates, SheetJS is simpler and smaller. |
| Client-side parsing only | Convex action with `"use node"` + `xlsx` | Only if parsing logic is too complex for browser (e.g., password-protected files, macro-enabled .xlsm). Not the case here. |
| `React.lazy()` for upload component | Include in main bundle | Only if consignment upload is used so frequently that lazy load flicker is unacceptable. For infrequent admin uploads, lazy loading is always preferable. |

---

## Sources

- SheetJS official docs (current): [Installation for Frameworks/Bundlers](https://docs.sheetjs.com/docs/getting-started/installation/frameworks/) — HIGH confidence
- SheetJS official docs: [Vite integration guide](https://docs.sheetjs.com/docs/demos/frontend/bundler/vitejs/) — HIGH confidence
- SheetJS official docs: [React integration](https://docs.sheetjs.com/docs/demos/frontend/react/) — HIGH confidence
- SheetJS CDN: [Version 0.20.3 tarball](https://cdn.sheetjs.com/xlsx-0.20.3/xlsx-0.20.3.tgz) — HIGH confidence
- Convex official docs: [File Storage - Upload Files](https://docs.convex.dev/file-storage/upload-files) — HIGH confidence (verified; not used for this feature but architecture decision documented)
- Codebase analysis: `src/components/salesAnalytics/SalesChart.tsx`, `package.json`, `convex/http.ts` — HIGH confidence
- ExcelJS bundle size: [GitHub Issue #1236](https://github.com/exceljs/exceljs/issues/1236), [Bundlephobia](https://bundlephobia.com/package/exceljs) — MEDIUM confidence (community reports, consistent across multiple sources)

---
*Stack research for: v1.3 Consignment Excel Upload and Analytics Extension*
*Researched: 2026-02-22*
