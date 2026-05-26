# Telegram Morning Packing Report — Design

**Date:** 2026-05-26
**Status:** Approved, ready for implementation plan
**Estimated size:** ~280 LOC across 6 new files + 3 edits. ~1 dev day.

---

## Purpose

A Telegram bot that automatically posts the day's order pack list to a dedicated Frollie operations group every morning, with a midday follow-up for any orders still pending, plus an on-demand `/pack` command for ad-hoc regeneration.

The bot mirrors what's already on the Orders kanban board (PaymentReceived + BeingPrepared columns) so kitchen and ops staff can see what's owed for the day without opening the app.

## Scope and definitions

**"Needs to be packed"** = `orders.status ∈ {PaymentReceived, BeingPrepared}` AND `dueDate` is set AND `dueDate <= endOfTodayWibMs`, where:

- `endOfTodayWibMs = wibMidnightToUtc(year, month, day + 1) - 1` (one millisecond before next WIB midnight). `wibMidnightToUtc` is the existing helper at `convex/lib/periodRange.ts:46`.
- `year/month/day` come from `getWibComponents(Date.now())` so the boundary always reflects the current WIB date, not UTC.

This catches today's orders + anything that slipped from prior days.

**Orders without a `dueDate`** (field is optional in schema) are **excluded** from all three reports. An order with no scheduled date is neither "due today" nor "overdue" by definition; including it would require a separate triage flow the bot doesn't own.

**Destination:** a new dedicated Telegram group, `Frollie · Morning Pack List`. Separate from any existing chat to avoid noise mixing.

**Audience:** kitchen + ops + manager (whoever you add to the group). Read-only — no auth mapping, no per-user gating. The `/pack` command can be run by anyone in the group; it produces no side effects beyond posting another message.

**Interactivity:** one-way notifications + a single `/pack` text command. No inline buttons in v1.

## Schedule

| Trigger | Time (WIB) | Cron (UTC) | Header text |
|---|---|---|---|
| Morning cron | 07:00 | `hourUTC: 0, minuteUTC: 0` | `Pack List — Mon 27 May 2026` |
| Midday cron | 13:00 | `hourUTC: 6, minuteUTC: 0` | `Still Pending — Mon 27 May 2026 · 13:00` |
| `/pack` command | on demand | — | `Pack List (on-demand) — Mon 27 May 2026 · 14:35` |

All times in 24h format. Dates use the device's `Asia/Jakarta` interpretation derived from `getWibComponents(utcMs)` in `convex/lib/periodRange.ts`.

All three callers run the same query against the same definition. The only difference is the header.

## Message format

Mirrors the existing Orders kanban card shape. No BOM resolution, no ball/box counts — uses `orderItems.productName` + `quantity` directly.

```
Pack List — Mon 27 May 2026

11 orders to pack today · 7 delivery · 4 pickup

0526-003 — Sarah K.  [rush]
  2× Jumbo
  1× Bite Triple
  Delivery → Jl. Kemang Raya 12
  📝 leave at lobby

0526-007 — Andi L.
  1× Original
  Pickup → Office

…
```

**Empty day:** `Pack List — Mon 27 May\n\nNothing to pack today. ✅` (single line, no list).

**Header:** date + total count + delivery/pickup split.

**Sort within list:** `expedited` flag first (rush at top), then `dueDate` ascending.

**HTML escape:** all user-supplied fields (customer name, address, notes, item names) must run through `escapeHtml` before interpolation into the HTML message. Notes especially — they're free text from customers/staff and commonly contain `<`, `>`, `&`.

**Telegram 4096-char limit:** the formatter chunks output into ≤4000-char messages (safety margin). When the next order would push the current chunk over the limit, finalize the chunk and start a new one with continuation header `…continued (2/N)`. Chunks are sent sequentially to preserve order.

## Architecture

```
convex/
  telegram/
    sendPackList.ts            // internalAction — fetch + format + send
    webhook.ts                 // httpAction — handles /pack command + dedupe
    packListFormat.ts          // PURE function: KanbanCard[] → HTML string(s)
    queries/
      packListQuery.ts         // internalQuery — reuses KanbanOrderCard shape
  lib/
    telegramHtml.ts            // escapeHtml + safe template helpers
  http.ts                      // EDIT: route POST /telegram-webhook → webhook
  crons.ts                     // EDIT: morning + midday cron entries
  schema.ts                    // EDIT: telegramUpdates table for dedupe
```

**Single source of truth:** `packListFormat.ts` is a pure function with no Convex deps. The morning cron, midday cron, and `/pack` command all consume it. No parallel formatter that can drift (cf. Common Pitfall #20 on dual-surface order features).

**Query reuse:** `packListQuery.ts` consumes `buildKanbanCard` from `convex/orders/helpers/kanbanBuilders.ts` so the bot sees the same shape the kanban frontend sees. If the kanban card adds a field later, the bot picks it up automatically.

### Query

```ts
internal.telegram.packListQuery.getOrdersForPackList({}) →
  {
    date: string;             // "Mon 27 May 2026" in WIB
    totalCount: number;
    deliveryCount: number;
    pickupCount: number;
    orders: KanbanOrderCard[];
  }
```

Implementation:
- Two index scans on `orders` via `by_status_due_date`: one for `status: "PaymentReceived"` with `dueDate <= endOfTodayWibMs`, one for `status: "BeingPrepared"` with the same bound. Merge results.
- `endOfTodayWibMs` computed from `wibMidnightToUtc` + `getWibComponents` as described in Scope.
- `withIndex` upper bound on `dueDate` automatically excludes documents where `dueDate` is undefined (range queries skip undefined values), so the "no dueDate = excluded" rule is enforced by the index, not by post-filter.
- For each surviving order, fetch `orderItems` via `by_order` index and build a `KanbanOrderCard`.
- Sort: `expedited` desc, then `dueDate` asc, then `_creationTime` asc.

### Action

```ts
export const sendPackList = internalAction({
  args: {
    reason: v.union(
      v.literal("morning"),
      v.literal("midday"),
      v.literal("command"),
    ),
  },
  handler: async (ctx, args) => {
    const data = await ctx.runQuery(
      internal.telegram.packListQuery.getOrdersForPackList, {},
    );
    const chunks = formatPackList({
      reason: args.reason,
      cards: data.orders,
      counts: {
        total: data.totalCount,
        delivery: data.deliveryCount,
        pickup: data.pickupCount,
      },
      generatedAt: Date.now(),
    });
    for (const chunk of chunks) {
      await sendTelegramHtml(chunk);  // sequential to preserve order
    }
  },
});
```

Called by both crons and by the `/pack` webhook handler.

### Crons (`convex/crons.ts`)

```ts
crons.daily(
  "morning pack list",
  { hourUTC: 0, minuteUTC: 0 },
  internal.telegram.sendPackList.sendPackList,
  { reason: "morning" },
);

crons.daily(
  "midday pack list",
  { hourUTC: 6, minuteUTC: 0 },
  internal.telegram.sendPackList.sendPackList,
  { reason: "midday" },
);
```

### `/pack` command (`convex/telegram/webhook.ts`)

httpAction at `POST /telegram-webhook` on the `.convex.site` domain (NOT `.convex.cloud` — httpActions live on `.site`; wrong subdomain = silent webhook retries forever, per RUNBOOK).

Handler steps:
1. Verify `X-Telegram-Bot-Api-Secret-Token` header equals `TELEGRAM_WEBHOOK_SECRET`. Return 401 if mismatch.
2. Parse `update.message.text`. If not `/pack` (or `/pack@<bot_username>` when sent in a group), return 200 noop.
3. Insert into `telegramUpdates` keyed by `update.update_id`. If duplicate (Telegram retries on non-200 for ~24h), return 200 noop.
4. `await ctx.scheduler.runAfter(0, internal.telegram.sendPackList.sendPackList, { reason: "command" })`.
5. Return 200.

Setup (per environment, one-time):
- BotFather: `/setcommands` → `pack - Generate pack list now`. Required so the bot sees `/pack` despite privacy mode being ON.
- Telegram API `setWebhook` with `allowed_updates: ["message"]` (not `callback_query` — no buttons in v1).

### Schema add (`convex/schema.ts`)

```ts
telegramUpdates: defineTable({
  updateId: v.number(),    // Telegram update.update_id, for dedupe
  receivedAt: v.number(),
})
  .index("by_update_id", ["updateId"]),
```

Used only for `/pack` idempotency. Low volume — no pruning needed initially.

## Env vars

Set on prod and dev deployments separately (per the RUNBOOK's "wrong Convex deployment" gotcha):

| Var | Source | Notes |
|---|---|---|
| `TELEGRAM_BOT_TOKEN` | BotFather output of `/newbot` | Separate dev bot and prod bot. |
| `TELEGRAM_CHAT_ID` | Discovered via `getUpdates` after sending `@bot hello` in the group | Supergroup id format: `-100NNN`. Use `--` separator in `convex env set` because it starts with `-`. |
| `TELEGRAM_WEBHOOK_SECRET` | `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"` | 64 hex chars. Different secret per environment. |

**When the user needs to provide these:** after the code lands on the feature branch and passes `npm run build`, before the smoke test. The implementation plan will pause at that step with an explicit prompt requesting the dev bot token, dev chat id, and webhook secret.

## Error handling

- **Telegram API failure (non-200, network error):** action throws; Convex logs surface it; cron failure is visible in Convex dashboard. No retry from our side — Telegram's own delivery is reliable and a missed daily report is acceptable.
- **Env vars missing:** action throws `"Telegram env vars missing"` immediately. Caught by Convex logs.
- **Empty result set:** post the "Nothing to pack today" message instead of skipping. Confirms the bot ran (silent skip = ambiguity with broken bot).
- **Webhook secret mismatch:** return 401, log nothing of substance (avoid leaking which header was wrong).
- **Webhook receives `/pack` from outside the configured chat:** still serves it (any group member can run it). No chat-id gating in v1.
- **`editMessageText` failure:** N/A in v1 — no buttons, no message editing.

## Testing

- **Unit (Vitest)** — `packListFormat.test.ts` covers:
  - empty day → single "Nothing to pack today" chunk
  - 1 order
  - 30 orders forcing chunk split into 2+ messages
  - HTML escape on notes containing `<`, `>`, `&`
  - rush sort: expedited orders appear first
  - header variants per `reason` (morning/midday/command)
  - header counts: delivery/pickup split matches order data
- **Backend integration (convex-test)** — `packListQuery.test.ts` covers:
  - status filter excludes Draft, AwaitingPayment, AwaitingDelivery, Complete
  - dueDate filter includes overdue
  - dueDate filter excludes future orders
  - sort by expedited desc, then dueDate asc
- **Smoke (manual, dev bot)** — `npx convex run telegram/sendPackList:sendPackList '{"reason":"morning"}'` against dev deployment, verify message lands in test group with correct format.
- **No E2E** — Telegram round-trip is external API. Smoke test is the gate.

## Rollout

1. Feature branch `feature/telegram-pack-list-bot` per branch-per-phase rule (CLAUDE.md).
2. Dev bot first: `@FrolliePackListBotDev`, dev Convex deployment (`exciting-fennec-671`), dev group with user + bot.
3. Code lands. `npm run build` passes. Triple-review per execute-phase gate.
4. **Pause for user to provide dev tokens/env vars.** Set on dev deployment. Smoke test all 3 paths (morning via direct action call, midday via direct call, `/pack` via Telegram).
5. Prod cutover: separate prod bot, prod chat id, env vars set with `--prod`, register prod webhook against `decisive-wombat-7.convex.site`. Smoke test once.
6. Document in CHANGELOG (CLAUDE.md "after every merge" rule).

## Out of scope (v1)

- Per-order "Mark packed" inline buttons (Approach C in brainstorming — defer to v2)
- Telegram-user → Convex-user auth mapping (no auth needed when there are no write actions)
- Photo / attachment delivery (e.g., labels)
- Localization (English only; rush badge as `[rush]`)
- Pruning `telegramUpdates` (low volume; revisit if table grows past ~10k rows)
- Posting to multiple groups (single group only)
