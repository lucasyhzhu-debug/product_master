# Stack Research

**Domain:** Multi-channel sales integration — GrabFood POS API (OAuth2), BigSeller profit analytics (cookie auth, async sync), consignment Excel upload, unified Sales Analytics
**Researched:** 2026-02-25
**Confidence:** HIGH — verified against existing codebase, official API docs, and official library documentation

---

## What This Document Covers

v1.4 (Sales & Channel Integration) adds four new capability areas to the existing Convex + React 19 stack:

1. **GrabFood POS API** — OAuth2 client credentials, order polling, store control, inventory read/write
2. **BigSeller profit sync** — JWT cookie auth, async sync-first workflow (1–10 min), order-level data
3. **Consignment Excel upload** — `.xlsx` parse in browser, structured rows to Convex
4. **Unified Sales Analytics** — multi-channel charts combining GoFood, BigSeller (Shopee + TikTok), consignment, direct

---

## Existing Stack — What's Already There (DO NOT Re-Add)

| Already Have | Version | Relevant Capability |
|---|---|---|
| Convex | ^1.31.7 | serverless backend, HTTP actions (webhooks), cron jobs, `ctx.scheduler`, `platformCredentials` table |
| React | ^19.2.0 | file input, hooks, lazy loading |
| TypeScript | ~5.9.3 | type safety |
| Vite | ^7.2.4 | build tool, code splitting |
| Recharts | ^3.7.0 | stacked bar charts, line charts — already in `SalesAnalytics.tsx` |
| date-fns | ^4.1.0 | date arithmetic |
| Tailwind CSS | ^4.1.18 | styling |
| shadcn/ui (Radix UI) | various | UI primitives including `<Table>`, `<Dialog>`, `<Progress>` |
| Sonner | ^2.0.7 | toast notifications |
| Lucide React | ^0.564.0 | icons including `Upload`, `FileSpreadsheet` |

**GrabFood partial infrastructure already built:**
- `convex/integrations/grabfood/config.ts` — OAuth2 config, all endpoint paths, typed interfaces
- `convex/integrations/grabfood/adapter.ts` — token management, `testConnection`, `respondToOrder`, `markOrderReady`, `getStoreStatus`, `pauseStore`, `notifyMenuUpdate`, `autoRefreshToken`, webhook HTTP handlers
- `convex/http.ts` — HTTP router exists, grabfood webhook routes need registration
- `platformCredentials` table — stores `client_id`, `client_secret`, token, expiry

**No BigSeller infrastructure exists yet.** No consignment upload infrastructure exists yet.

---

## Recommended Stack Additions

### New Dependencies Required

| Library | Version | Purpose | Why |
|---|---|---|---|
| `xlsx` (SheetJS Community Edition) | 0.20.3 (CDN tarball) | Parse `.xlsx` consignment Excel uploads in-browser | Only maintained browser-compatible Excel parser. Reads `ArrayBuffer` from `<input type="file">` with no server round-trip. Named ESM imports are tree-shakeable. Apache 2.0 license. |

**That is the only new dependency.** All other v1.4 requirements are satisfied by existing stack.

### Decision Matrix — Why No Other New Libraries

| Requirement | How to Solve | New Library? |
|---|---|---|
| GrabFood OAuth2 token exchange | Native `fetch` with `URLSearchParams` body — already in `adapter.ts` | No |
| GrabFood API calls (list orders, pause store, etc.) | Native `fetch` with Bearer header — already in `adapter.ts` | No |
| GrabFood webhook receive | Convex `httpAction` — already in `adapter.ts`, register in `http.ts` | No |
| GrabFood token cron refresh | `internalAction` + `cronJobs()` — `autoRefreshToken` exists, `crons.ts` empty | No |
| BigSeller cookie-based API calls | Native `fetch` with `Cookie` header in `"use node"` action — same pattern as GoBiz | No |
| BigSeller async sync polling (1–10 min) | `ctx.scheduler.runAfter(60000, ...)` chain — Convex native async workflow | No |
| BigSeller daily sync cron | `cronJobs()` in `crons.ts` | No |
| BigSeller token storage | `platformCredentials` table — already supports any platform | No |
| Consignment Excel parse | SheetJS `XLSX.read(arrayBuffer)` | **YES — add SheetJS** |
| Multi-channel analytics charts | Recharts (already ^3.7.0 in `SalesAnalytics.tsx`) — add new data series | No |
| Date range filtering | date-fns (already ^4.1.0) | No |
| Registry extension (new platforms) | Edit `convex/integrations/registry.ts` | No |

---

## SheetJS Installation

The npm registry `xlsx` package (version 0.18.5) is **stale and unmaintained**. SheetJS stopped publishing to the npm registry. The current version (0.20.3) is only available from the SheetJS CDN:

```bash
npm install --save https://cdn.sheetjs.com/xlsx-0.20.3/xlsx-0.20.3.tgz
```

The tarball installs identically to a registry package — saves to `node_modules/xlsx`, appears in `package.json` as the tarball URL. All imports like `import { read, utils } from 'xlsx'` work unchanged.

**Post-install `package.json` entry:**
```json
"xlsx": "https://cdn.sheetjs.com/xlsx-0.20.3/xlsx-0.20.3.tgz"
```

Types are bundled in the package — no `@types/xlsx` needed.

---

## Integration Patterns by Feature

### GrabFood: Complete the Existing Module

The `adapter.ts` already has token management and most actions. What v1.4 adds on top:

1. **`grabfoodOrders` table** — persist incoming webhook orders and polled history. The `handleOrderWebhook` handler has a TODO comment explicitly for this.
2. **`listOrders` action** — call `GET /partner/v1/orders` to backfill historical order data (pagination via `more: boolean` flag)
3. **Store control UI** — surface `getStoreStatus` and `pauseStore` to frontend. Per merchant ID (3 outlets: Crystal, Goldfinch, Tamtem).
4. **Register webhooks in `http.ts`** — `handleOrderWebhook` and `handleMenuSyncWebhook` exist but are not registered in the HTTP router
5. **Activate cron** — `autoRefreshToken` exists but `crons.ts` is empty. Token expires every 1h — cron every 45min.

**No new libraries.** Pattern extension of existing module.

### BigSeller: New Module Following GoBiz Pattern

BigSeller uses **JWT cookie auth** (`muc_token`, 30-day expiry). This is the same pattern as GoBiz — manual cookie paste, store in `platformCredentials`, use on every API call.

**The sync-first async workflow requires a scheduler chain, not a polling loop:**

```
Daily cron (11pm) → triggerBigSellerSync action
  → POST sync/task/create.json
  → scheduler.runAfter(60000, checkBigSellerSyncStatus)
    → GET sync/task/detail/new/get.json
    → if taskStatus === "complete" → scheduler.runAfter(0, fetchBigSellerData)
    → if taskStatus === "progress" → scheduler.runAfter(60000, checkBigSellerSyncStatus)  // repeat
    → if taskStatus === "fail" → log error, alert dashboard health
  → fetchBigSellerData action
    → POST listStatsData.json (daily aggregates)
    → POST pageList.json (paginate all pages, pageSize: 50)
    → upsert to Convex by platformOrderId (idempotent)
```

**Critical constraint:** A single Convex action cannot run for 10 minutes. The scheduler chain pattern (each action schedules the next) is the correct Convex approach for async external workflows that take longer than a single action timeout. This is documented in Convex best practices.

**31-day max range** — BigSeller enforces this server-side. For sync ranges > 31 days, trigger multiple syncs sequentially. For daily incremental sync (recommended), this is never an issue.

### Consignment Excel: Client-Side Parse Only

Parse the Excel file entirely in the browser. Send structured JSON rows to a Convex mutation. The file never leaves the browser — no Convex `generateUploadUrl`, no `_storage` table.

```typescript
import { read, utils } from 'xlsx';

async function parseConsignmentFile(file: File): Promise<ConsignmentRow[]> {
  const buffer = await file.arrayBuffer();
  const wb = read(buffer, { type: 'array' });
  const ws = wb.Sheets[wb.SheetNames[0]];
  return utils.sheet_to_json<ConsignmentRow>(ws);
}
```

Lazy-load the upload component — SheetJS adds ~180KB to the chunk it's in:
```typescript
const ConsignmentUploadPage = React.lazy(() => import('./pages/ConsignmentUploadPage'));
```

### Unified Analytics: Extend Existing Recharts Patterns

`SalesAnalytics.tsx` already has `PLATFORM_COLORS`, stacked `<Bar>` charts, and period presets. Adding BigSeller/consignment channels is:

1. Extend `externalRevenue` table with `source` literals: add `"shopee"`, `"tiktok"` (currently only `"k3mart"`, `"gobiz"`, `"internal"`)
2. Add corresponding color entries to `PLATFORM_COLORS`
3. Add new `<Bar dataKey="..." />` for each new channel
4. Update `SalesAnalytics` Convex query to aggregate new sources

No new chart types, no new charting library.

---

## Registry Extension Required

`convex/integrations/registry.ts` `PlatformId` type is `"k3mart" | "gobiz" | "internal"`. Two additions:

```typescript
export type PlatformId = "k3mart" | "gobiz" | "internal" | "grabfood" | "bigseller";
```

GrabFood already uses `platformId: "grabfood"` in its config but is not in the registry type union or `PLATFORMS` object. BigSeller is entirely new.

---

## What NOT to Add

| Avoid | Why | Use Instead |
|---|---|---|
| `xlsx` from npm registry (`npm install xlsx`) | npm version 0.18.5 is 2+ years stale, missing bug fixes, security-unfixed issues | CDN tarball `https://cdn.sheetjs.com/xlsx-0.20.3/xlsx-0.20.3.tgz` |
| `exceljs` | No browser build — Node.js only. Would require server-side parse, adding unnecessary round-trip + `"use node"` action | SheetJS 0.20.3 — native browser support |
| `papaparse` | CSV only — cannot parse `.xlsx` binary format | SheetJS handles both formats |
| `axios` | Not in codebase by design; `fetch` with `Cookie` header handles BigSeller auth identically | Native `fetch` |
| Official GrabFood JS SDK | No JS/TypeScript SDK exists — only Go, Java, Python | Native `fetch` (already implemented in `adapter.ts`) |
| `node-cron` or external cron service | Convex provides native `cronJobs()` | `crons.ts` with `cronJobs()` |
| Any polling helper library | Convex scheduler chain (`ctx.scheduler.runAfter`) handles async polling natively | `ctx.scheduler.runAfter` |
| New charting library (nivo, Victory, Chart.js) | Recharts ^3.7.0 is already installed and handles all needed chart types | Recharts existing install |
| Recharts upgrade | Currently on ^3.7.0 (current major). Mid-milestone upgrades risk type breakage | Stay on ^3.7.0 |
| `react-dropzone` | ~30KB for a styled dropzone not needed — this is an infrequent admin action | Native `<input type="file" accept=".xlsx">` |
| `FileSaver.js` | Not needed — SheetJS `writeFileXLSX()` handles browser download natively | SheetJS built-in download |
| `@tanstack/react-table` | Tables in analytics are simple read-only — no sorting/filtering complexity | shadcn `<Table>` components (already installed) |
| Convex file storage for Excel uploads | Raw file bytes are not the durable record — structured rows are | Client-side parse, store rows only |

---

## Alternatives Considered

| Recommended | Alternative | When Alternative Makes Sense |
|---|---|---|
| SheetJS 0.20.3 (CDN tarball) | ExcelJS 4.x | Only if pixel-perfect Excel formatting is needed (cell colors, merged cells, print areas). For data import/export, SheetJS is simpler. |
| Client-side Excel parse | Server-side via Convex `"use node"` action | Only for password-protected files or complex VBA macros — not applicable here |
| Convex scheduler chain for BigSeller polling | External webhook from BigSeller | BigSeller does not provide webhooks — poll-only API |
| Manual cookie paste for BigSeller (GoBiz pattern) | Full OAuth2 authorization code flow | BigSeller has no OAuth2 — cookie-based session is the only supported auth method |
| React.lazy() for consignment upload page | Including SheetJS in main bundle | Only if upload is used so frequently that lazy-load flicker is unacceptable. Admin-only, infrequent — lazy load always preferred |

---

## Version Compatibility

| Package | Version | Compatibility Notes |
|---|---|---|
| xlsx (SheetJS) | 0.20.3 | Vite 7.x compatible — SheetJS added required `package.json` metadata in 0.18.10. Named ESM imports tree-shake correctly. No `vite.config.ts` changes needed. |
| xlsx (SheetJS) | 0.20.3 | React 19 compatible — UI-framework agnostic. No peer dependency conflicts. |
| xlsx (SheetJS) | 0.20.3 | TypeScript ~5.9 compatible — types bundled in package. No `@types/xlsx` needed. |
| Recharts | ^3.7.0 | Adding new `<Bar>` data keys to existing chart is backward-compatible. No API changes. |
| Convex | ^1.31.7 | `ctx.scheduler.runAfter` available since Convex 0.x — fully supported. `"use node"` fetch with `Cookie` header — verified via GoBiz integration pattern. |

---

## Installation

```bash
# The only new dependency for v1.4
npm install --save https://cdn.sheetjs.com/xlsx-0.20.3/xlsx-0.20.3.tgz

# Verify installation
npm run type-check
npm run build
```

No dev dependencies needed.

---

## Sources

- SheetJS installation (frameworks/bundlers): [https://docs.sheetjs.com/docs/getting-started/installation/frameworks/](https://docs.sheetjs.com/docs/getting-started/installation/frameworks/) — version 0.20.3, CDN tarball method confirmed — HIGH confidence
- SheetJS React integration: [https://docs.sheetjs.com/docs/demos/frontend/react/](https://docs.sheetjs.com/docs/demos/frontend/react/) — `ArrayBuffer` read pattern confirmed — HIGH confidence
- Convex actions + Node runtime: [https://docs.convex.dev/functions/actions](https://docs.convex.dev/functions/actions) — `"use node"` + `fetch` with headers confirmed — HIGH confidence
- Convex cron jobs: [https://docs.convex.dev/scheduling/cron-jobs](https://docs.convex.dev/scheduling/cron-jobs) — `internalAction` scheduling confirmed — HIGH confidence
- Convex best practices: [https://docs.convex.dev/understanding/best-practices/](https://docs.convex.dev/understanding/best-practices/) — scheduler chain pattern for long-running async work confirmed — HIGH confidence
- Existing codebase: `convex/integrations/grabfood/adapter.ts`, `convex/integrations/gobiz/config.ts`, `convex/integrations/registry.ts`, `convex/http.ts`, `convex/crons.ts`, `package.json` — verified directly — HIGH confidence
- GrabFood API reference: `docs/GRABFOOD_API.md` — OAuth2 client credentials, endpoint paths, 1h token expiry confirmed — HIGH confidence
- BigSeller API reference: `docs/BIGSELLER_PROFIT_API.md` — cookie auth, sync-first workflow, 31-day limit, async duration confirmed — HIGH confidence

---

*Stack research for: Frollie Recipe Master v1.4 — Sales & Channel Integration*
*Researched: 2026-02-25*
