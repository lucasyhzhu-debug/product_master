# Sales-Updates Telegram Bot — Design Spec

**Date:** 2026-05-28
**Author:** brainstormed with Claude (superpowers:brainstorming)
**Status:** Approved design — pending implementation plan
**Telegram role:** `sales-updates` (already present in `KNOWN_TELEGRAM_ROLES`, `convex/telegram/config.ts:10`)

---

## 1. Purpose

Deliver automated sales round-ups to the sales team's Telegram group on three cadences:

- **Daily** — end-of-day summary for the current WIB day, sent *after* a nightly channel refresh at **23:00 WIB**.
- **Weekly** — Monday **07:00 WIB**, covering the prior complete week (Mon–Sun).
- **Monthly** — 1st of month **08:00 WIB**, covering the prior complete calendar month.

Each message reports **gross revenue per channel** plus a **per-SKU quantity-sold breakdown** of the top products, grouped into channel totals. GoFood is additionally broken out **by outlet**. Weekly and monthly messages add **period-over-period deltas** (▲/▼ % vs the prior period).

This builds directly on the Phase 85 multi-chat Telegram routing infrastructure (registry, self-register, admin assignment) — no new Telegram plumbing is required.

---

## 2. Scope

### In scope (channels reported)
- **GoFood** — broken down **by outlet** (Crystal, Tamtem, Goldfinch, etc.).
- **K3Mart** — shown only if it has sales for the period ("if any").
- **Direct** — internal orders (WhatsApp, Instagram, etc.).

### Out of scope (this version)
- **BigSeller** (Shopee / TikTok marketplaces) — de-scoped from both the refresh and the summary. The operator will update BigSeller manually.
- **GrabFood** — not set up yet (`orders:read` scope not granted).
- **Consignment** — manual entry, no API.
- **FrolliePOS** — future channel; add to the summary once it exists.

### Explicit consequence of de-scoping BigSeller
The existing **`bigseller nightly 7d resync` cron (03:00 WIB)** is **DELETED**. This removes the trailing-7-day backfill that healed same-day Shopee `--` rows. The user has accepted this tradeoff and will refresh BigSeller manually. (This reverses the original "11pm refresh replaces the 3am resync" plan, because the 11pm refresh no longer touches BigSeller.)

---

## 3. Key decisions (resolved during brainstorming)

| # | Decision | Choice |
|---|----------|--------|
| D1 | Headline metric | **Gross** revenue (`revenueGross`) per channel + order count |
| D2 | Grain | Channel totals + top products; GoFood additionally by outlet |
| D3 | Product breakdown | Per-SKU **quantity sold** (product-level qty, e.g. `12× Jumbo`), resolved to internal product name via `linkedMenuProductId`, fallback raw `productName` |
| D4 | Daily trigger | New **23:00 WIB orchestrator** awaits the channel syncs, then queries + sends (linear — no watchdog needed, see §5) |
| D5 | Weekly/monthly trigger | Plain `crons.weekly` / `crons.monthly` reading already-synced data (no refresh step) |
| D6 | Refresh scope (daily) | Pull **GoFood + K3Mart + Internal**; each in its own try/catch (best-effort) |
| D7 | Daily window | **Today, WIB** (00:00 → send time; an 11pm send misses the final hour — acceptable for "end of day") |
| D8 | Weekly window | Prior complete week, **Mon–Sun** |
| D9 | Monthly window | Prior complete **calendar month** |
| D10 | Deltas | **Weekly & monthly only** (▲/▼ % vs prior period); daily is a clean snapshot |
| D11 | 3am BigSeller resync | **Deleted** (see §2) |
| D12 | Schema | **No change** — reads existing `externalRevenue` + `externalOutlets`. No migration. |
| D13 | "Units" labelling | Never print an aggregate "units sold" number (CLAUDE.md rule #13 reserves that for BOM-resolved balls). Per-SKU product quantity is labelled as a product list. |

---

## 4. Data model (reused, no changes)

- **`externalRevenue`** (`convex/schema.ts:1181`) — per-row fields used: `source`, `outletId`, `externalProductCode`, `productName`, `quantitySold`, `transactionCount`, `revenueGross`, `transactionDate`, `periodStart`/`periodEnd`, `linkedMenuProductId`. Indexed `by_period` (both bounds inside `.withIndex` — IRB-01 compliant).
- **`externalOutlets`** (`convex/schema.ts:1138`) — `name`, `source`, `isActive`; resolves `outletId → outlet name`.
- **Channel grouping** — canonical `resolvePlatform({ source, ... })` from `convex/reports/platform.ts` maps raw `source` → `Platform` literal. Filter to `{ GoFood, K3Mart, Direct }`.
- **Period ranges** — `calculatePeriodRange(preset)` + `PeriodPreset` from `convex/lib/periodRange.ts`. Already returns `previousStart`/`previousEnd`/`comparisonLabel`, so deltas are essentially free once the new presets exist.

### Reference query
`getRevenueByOutletInternal` (`convex/externalData/queries.ts:1515`) already does period-windowed `source → outletId` grouping with outlet-name resolution and internal-order special-casing. The new summary query is modeled on it, extended with the **top-N per-SKU product breakdown** it lacks.

---

## 5. Architecture & data flow

New directory: **`convex/telegram/salesSummary/`**

### 5.1 `salesSummaryQuery.ts` (`internalQuery`)
- **Args:** `{ cadence: "daily" | "weekly" | "monthly" }`. Maps internally to a `PeriodPreset` (`daily→today`, `weekly→lastWeek`, `monthly→lastMonth`) — keeps the two shared `periodPresetValidator` unions untouched.
- Queries `externalRevenue` `by_period` for the current range (and, for weekly/monthly, the previous range for deltas).
- Groups via `resolvePlatform()` into `{ GoFood, K3Mart, Direct }`; sub-groups GoFood by `outletId`.
- Per group, aggregates: `grossRevenue` (sum `revenueGross`; for internal use order totals as `getRevenueByOutletInternal` does), `orderCount` (sum `transactionCount`), and a **top-N product list** (sum `quantitySold` keyed by `linkedMenuProductId`→name, fallback `productName`, sorted desc).
- Returns structured data (not formatted text) so the formatter stays pure & testable.

### 5.2 `salesSummaryFormat.ts` (pure function)
- Mirrors `packListFormat.ts`. Input = query output + cadence + generatedAt + per-source refresh status. Output = array of Telegram HTML chunks.
- **Chunking:** ≤4000-char budget with a per-item truncation cap (reusing pack-list chunking lessons — single oversized items must be capped, not just accumulation).
- Top **3** products/group for daily, top **5** for weekly/monthly (one configurable constant).

### 5.3 `sendSalesSummary.ts` (`internalAction`)
```
handler({ cadence }):
  token = process.env.TELEGRAM_BOT_TOKEN            // throw if missing
  refreshStatus = { gofood: "skip", k3mart: "skip", direct: "skip" }
  if cadence === "daily":
    for each of [GoFood sync, K3Mart sync, Internal sync]:
      try { await runAction(...) ; status = "ok" }
      catch { status = "fail" }   // best-effort: one failure must not block the others
  data   = runQuery(internal...salesSummaryQuery, { cadence })
  chatId = runQuery(internal...chatRegistry.getChatIdByRole, { role: "sales-updates" })
  chunks = salesSummaryFormat({ cadence, data, generatedAt: Date.now(), refreshStatus })
  send chunks sequentially via sendTelegramHtml   // breadcrumb on mid-send failure (pack-list pattern)
```
Weekly/monthly skip the refresh block entirely (prior night's 23:00 run already settled the data).

**Sync entry points** (all already cron-invoked elsewhere, so callable from the orchestrator):
- GoFood: `internal.integrations.gobiz.adapter.autoSyncGoBizRevenue` (internalAction — cron-ready)
- K3Mart: `api.integrations.k3mart.adapter.syncK3MartSales`
- Internal: `api.integrations.internal.adapter.syncInternalOrders` (`{ triggeredBy: "cron" }`)

> **Planning note:** confirm whether the K3Mart / internal **public** actions require a session token when called from an `internalAction`. If so, add internal/credential-resolved variants. The existing crons call `syncInternalOrders` directly, so internal is known-safe; K3Mart needs a check.

### 5.4 Crons (`convex/crons.ts`)
| Cron name | UTC schedule | WIB | Target |
|-----------|-------------|-----|--------|
| `sales summary daily` | `daily { hourUTC: 16, minuteUTC: 0 }` | 23:00 | `sendSalesSummary { cadence: "daily" }` |
| `sales summary weekly` | `weekly { dayOfWeek: "monday", hourUTC: 0, minuteUTC: 0 }` | Mon 07:00 | `sendSalesSummary { cadence: "weekly" }` |
| `sales summary monthly` | `monthly { day: 1, hourUTC: 1, minuteUTC: 0 }` | 1st 08:00 | `sendSalesSummary { cadence: "monthly" }` |
| ~~`bigseller nightly 7d resync`~~ | — | — | **DELETE** |

### 5.5 New period presets (`convex/lib/periodRange.ts`)
Add `"lastWeek"` and `"lastMonth"` to the `PeriodPreset` type and `calculatePeriodRange` switch:
- `lastWeek` — current = prior Mon 00:00 WIB → Sun 23:59:59 WIB; previous = the week before that.
- `lastMonth` — current = first→last day of prior calendar month (WIB); previous = the month before that.

Do **not** add these to the shared `periodPresetValidator` v.unions (the summary query uses its own `cadence` arg). This avoids forcing other call-sites to handle the new literals.

`★ Why linear, not chained:` the daily orchestrator is a single awaitable function because GoFood/K3Mart/Internal syncs all complete inline. The watchdog/scheduler-chain pattern was only needed for BigSeller's async poll-state-machine, which is now out of scope. Best-effort per-sync try/catch means partial data still ships with a status footer rather than failing the whole send.

---

## 6. Message format

### Daily
```
📊 Sales — Wed 28 May 2026 (end of day)
Total: Rp 8.4M · 142 orders

🛵 GoFood — Rp 5.1M (84 orders)
  • Crystal — Rp 2.3M
      12× Jumbo · 8× Original Triple · 6× Bite Double
  • Tamtem — Rp 1.8M
      9× Jumbo · 7× Original
  • Goldfinch — Rp 1.0M
      5× Original Triple · 4× Bite Single

🏪 K3Mart — Rp 1.2M (18 orders)
      7× Original · 5× Jumbo · 3× Bite Double

🏠 Direct — Rp 2.1M (40 orders)
      15× Jumbo · 10× Original Triple · 6× Bite Double

Refreshed 23:02 WIB · GoFood ✓ K3Mart ✓ Direct ✓
```

### Weekly / Monthly
Same shape; header carries the date range; each total carries a delta:
```
📊 Weekly Sales — 19–25 May 2026
Total: Rp 58.2M · 980 orders  ▲ 12% vs prior week

🛵 GoFood — Rp 34.1M ▲ 8%
  • Crystal — Rp 15.2M ▲ 5%
  ...
```

---

## 7. Edge cases

- **Daily sync failure:** summary still sends; footer marks the source `✗`. No retry loop.
- **Zero-sales channel:** omitted (satisfies K3Mart "if any"). If all three are empty → single line "No sales recorded {period}."
- **GoFood outlet without a name:** falls back to "Unknown" (existing `getRevenueByOutletInternal` behavior).
- **No `sales-updates` chat assigned:** `getChatIdByRole` throws a clear error → Convex logs. Operator must assign a group via `/admin/telegram-chats` (Phase 85 self-register flow). This is the one required operator step.
- **Mid-send chunk failure:** best-effort breadcrumb ("send failed after N/M chunks") so the team knows to check, mirroring `sendPackList`.

---

## 8. Files

**New (`convex/telegram/salesSummary/`):**
- `salesSummaryQuery.ts` — `internalQuery`, per-channel/per-outlet aggregation + top-N products + deltas.
- `salesSummaryFormat.ts` — pure formatter → Telegram HTML chunks.
- `sendSalesSummary.ts` — `internalAction` orchestrator.
- `__tests__/salesSummaryFormat.test.ts` — format snapshots (daily/weekly/monthly, deltas, empty).
- `__tests__/salesSummaryQuery.test.ts` — aggregation: GoFood per-outlet, top-N ordering, zero-sales omission, delta math, internal-order total handling.

**Edited:**
- `convex/crons.ts` — add 3 crons, delete `bigseller nightly 7d resync`.
- `convex/lib/periodRange.ts` — add `lastWeek` / `lastMonth` presets (+ pure-function unit tests).

**Reused (no change):** `convex/lib/telegramHtml.ts` (`sendTelegramHtml`), `convex/telegram/chatRegistry.ts` (`getChatIdByRole`), `convex/reports/platform.ts` (`resolvePlatform`), `convex/externalData/queries.ts` (reference pattern).

**Docs:** `docs/CHANGELOG.md` (always), `docs/FILE_MAP.md` (Telegram section). **No** `docs/SCHEMA.md` change.

---

## 9. Testing

- **Unit (pure):** `salesSummaryFormat` snapshots; `periodRange` `lastWeek`/`lastMonth` boundary math (WIB, month-length edges, year boundary).
- **Backend integration (convex-test):** `salesSummaryQuery` aggregation across the three channels, GoFood multi-outlet, top-N ordering & cap, zero-sales omission, delta computation, internal-order revenue path.
- **Resilience:** orchestrator continues + sets correct footer status when one sync throws.
- **Build gate:** `npm run type-check`, `npm run build`, `npm run test` all pass.

---

## 10. Operator runbook (post-deploy)

1. Add the bot (`@FrollieProBot`) to the sales Telegram group; send `/register@FrollieProBot`.
2. In `/admin/telegram-chats`, assign the registered chat the **`sales-updates`** role.
3. Confirm the next daily cron (23:00 WIB) posts; verify the refresh footer shows `✓` for GoFood/K3Mart/Direct.
4. (Manual, ongoing) refresh BigSeller via the admin UI as needed — no longer auto-resynced nightly.

---

## 11. Out-of-scope / future

- BigSeller, GrabFood, Consignment, FrolliePOS channels.
- Per-channel charts / image rendering (text-only for now).
- Configurable send times / on-demand `/sales` command (could mirror the pack-list `/pack` command later).
