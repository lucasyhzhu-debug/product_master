# Telegram `/sales` Command + Command Authorization Policy — Design

**Date:** 2026-05-30
**Status:** Approved (brainstorming) — pending spec review
**Scope:** Single phase (builds on Phase 85 self-register + the sales-updates bot)

---

## Problem

The sales-summary bot already posts a daily round-up to the `sales-updates` group at
23:00 WIB (and weekly/monthly) via a cron. The operator wants an **on-demand** trigger:
typing `/sales` should run that same process now and deliver the report — with an
**immediate acknowledgement** so it's visibly "doing something" during the ~seconds of
syncing.

A second, broader problem surfaced during design: the Telegram webhook is **public**, and
today **any chat can trigger `/pack`** (which sends to the pack-list group) — "any group can
spam another group using the bot." Adding `/sales` (which would echo revenue) makes an
authorization gate non-negotiable. So this phase also hardens command dispatch with a
**central, default-deny authorization policy** applied to `/pack` and all future commands.

---

## Decisions (locked during brainstorming)

| # | Decision | Choice |
|---|----------|--------|
| D1 | Report/ack destination | Reply in the chat that sent `/sales` |
| D2 | Who may run gated commands | Registered **and role-assigned** chats only |
| D3 | Apply to `/pack` too + default for future | Yes — central policy, deny-by-default |
| D4 | Auth granularity | **Per-command role match** (`/pack`→`pack-list`, `/sales`→`sales-updates`) |
| D5 | Unauthorized UX | One-line nudge to the sender (no dispatch) |
| D6 | Owner/DM bypass role | **No** — strict per-command only |

**Consequence of D4 + D6 + single-holder roles:** the only chat that can authorize `/sales`
is the `sales-updates` role-holder (the group the 23:00 cron already targets). Therefore
reply-to-sender (D1) and the existing role-based delivery target are the **same chat**.
The summary-sending code needs **no destination parameterization** — `/sales` reuses
`sendSalesSummary({cadence:"daily"})` unchanged and only adds an ack + auth gate around it.

---

## Architecture

### Unit 1 — Command authorization policy (in the pure webhook core)

`decideWebhookOutcome` in `convex/telegram/webhook.ts` is already a pure, dependency-injected
function. The gate lives here so it is unit-testable without Convex and impossible to bypass
per-handler.

```ts
// Policy is exhaustive over TelegramCommand → a new command WITHOUT a policy
// entry is a compile error. This enforces "secure by default for future commands."
type CommandPolicy = "open" | { requiresRole: TelegramRole };

const COMMAND_POLICY: Record<TelegramCommand, CommandPolicy> = {
  register: "open",                              // bootstrap: chat has no role yet
  start:    "open",                              // intro/help must reach unregistered chats
  pack:     { requiresRole: "pack-list" },       // CHANGED: was implicitly open
  sales:    { requiresRole: "sales-updates" },   // NEW
};
```

**Authorization check** (runs after `parseCommand`, before `recordIfNew`/dispatch):

- `policy === "open"` → proceed (existing behavior).
- `policy.requiresRole` → look up the **sender's** chat via a new dep `getChatAuth(chatId)`:
  - returns `{ registered: boolean, role?: string, archived: boolean }`.
  - Authorized iff `registered && !archived && role === policy.requiresRole`.
  - Unauthorized → send the **nudge** to the sender and return `200` **without dispatch**
    (and without recording the `update_id` — see "Dedupe ordering" below).

**Nudge text** (sent to the requesting chat only — never another group, so it cannot become a
cross-group spam vector):

> `⚠️ This chat isn't authorized for /{command}. Register with /register@FrollieProBot and ask an admin to assign the '{requiredRole}' role at https://recipe.frollie.com/admin/telegram-chats`

### Unit 2 — `getChatAuth` registry query

New `internalQuery` in `convex/telegram/chatRegistry.ts`:

```ts
export const getChatAuth = internalQuery({
  args: { chatId: v.string() },
  handler: async (ctx, { chatId }) => {
    const row = await ctx.db.query("telegramChats")
      .withIndex("by_chatId", q => q.eq("chatId", chatId)).unique();
    if (!row) return { registered: false, archived: false };
    return { registered: true, role: row.role, archived: row.archivedAt !== undefined };
  },
});
```

Single `by_chatId` point read. No schema change.

### Unit 3 — `parseCommand` gains `sales`

`convex/telegram/chatRegistry.ts`:
- `TelegramCommand` union: `"pack" | "register" | "start" | "sales"`.
- Regex: `/^\/(pack|register|start|sales)(@[A-Za-z0-9_]+)?$/`.
- Strict-match policy preserved (no trailing args).

### Unit 4 — `runSalesOnDemand` action

New `internalAction` (co-located in `convex/telegram/salesSummary/sendSalesSummary.ts`):

```ts
export const runSalesOnDemand = internalAction({
  args: { chatId: v.string() },
  handler: async (ctx, { chatId }) => {
    const token = process.env.TELEGRAM_BOT_TOKEN;
    if (!token) throw new Error("TELEGRAM_BOT_TOKEN missing");

    // 1. Immediate ack — user-visible "doing something" signal.
    await sendTelegramHtml(token, chatId,
      "✅ Acknowledged — updating sales channels, then coming back with your report…");

    // 2. Reuse the EXACT daily process (3 syncs + summary → sales-updates group).
    try {
      await ctx.runAction(
        internal.telegram.salesSummary.sendSalesSummary.sendSalesSummary,
        { cadence: "daily" },
      );
    } catch (err) {
      // 3. Never leave the operator hanging after the ack.
      await sendTelegramHtml(token, chatId,
        "⚠️ Sales update failed — check Convex logs.");
      throw err; // surface in Convex dashboard
    }
  },
});
```

Direct (non-resilient) call: on-demand UX favors fast failure + retry-by-re-typing over
multi-minute silent retry loops. The cron path keeps using `sendSalesSummaryResilient`.

### Unit 5 — Webhook wiring

In `handleTelegramWebhook` deps:
- Add `getChatAuth: (chatId) => ctx.runQuery(internal.telegram.chatRegistry.getChatAuth, {chatId})`.
- Add `runSales: (chatId) => ctx.scheduler.runAfter(0, internal...runSalesOnDemand, {chatId})`.
- Add `sendNudge: (chatId, html) => sendTelegramHtml(process.env.TELEGRAM_BOT_TOKEN!, chatId, html)`.

`sendNudge` is sent **synchronously** from the httpAction (the httpAction runs in an action
runtime, so `fetch`/`sendTelegramHtml` is allowed inline). This is deliberate: the reject path
is rare and off the hot dispatch path, so it needs no new scheduled action — unlike
register/start/pack/sales which schedule because they're the main flow. The pure
`decideWebhookOutcome` stays side-effect-free; it only calls the injected `deps.sendNudge`.

In `decideWebhookOutcome` deps interface: add `getChatAuth`, `runSales`, `sendNudge`.
Dispatch switch gains a `sales` arm calling `deps.runSales(chatIdStr)`.

---

## Data flow

```
Telegram → POST webhook
  → constant-time secret check (existing)
  → parseCommand(text)
      ├─ null + "/..."        → silent 200 (existing)
      ├─ null (plain text)    → touchLastSeen, 200 (existing)
      └─ command
           → COMMAND_POLICY[command]
               ├─ "open"                → recordIfNew → dispatch (register/start)
               └─ {requiresRole}
                    → getChatAuth(chatId)
                        ├─ authorized   → recordIfNew → dispatch (pack/sales)
                        └─ unauthorized → sendNudge(sender) → 200, NO dispatch
  /sales dispatch → scheduler.runAfter(0, runSalesOnDemand{chatId})
       → ack to chatId
       → sendSalesSummary{daily}: GoFood+K3Mart+Direct syncs → query → format → send report
       → (on error) failure breadcrumb to chatId
```

### Dedupe ordering

`recordIfNew` (the `update_id` idempotency insert) runs **only on the authorized path**, after
the auth check passes — same position relative to dispatch as today. The nudge path does **not**
record the `update_id`: a retried delivery of an unauthorized command simply re-nudges, which is
harmless and avoids coupling the dedupe table to rejected traffic. (If duplicate nudges on
Telegram retries prove noisy in practice, record-before-nudge is a one-line change; deferred —
YAGNI.)

---

## Error handling

| Failure | Behavior |
|---------|----------|
| Missing `TELEGRAM_BOT_TOKEN` | `runSalesOnDemand` throws before ack → surfaced in Convex logs (matches existing actions) |
| Ack send fails | Throws; no report attempted (operator never saw an ack, so no "hanging" promise) |
| Sync fails (GoFood/K3Mart/Direct) | Already best-effort inside `sendSalesSummary` — report still sends with per-channel `fail` status (unchanged) |
| Summary query/send fails | Caught in `runSalesOnDemand` → "⚠️ failed" breadcrumb to sender + rethrow |
| Unauthorized sender | Nudge to sender, no dispatch, 200 |

---

## Testing

`decideWebhookOutcome` is pure → drive the **policy matrix** with fake deps:

| Sender state | `/pack` | `/sales` | `/register` | `/start` |
|---|---|---|---|---|
| holds `pack-list` | dispatch | nudge | dispatch | dispatch |
| holds `sales-updates` | nudge | dispatch | dispatch | dispatch |
| registered, no role | nudge | nudge | dispatch | dispatch |
| archived | nudge | nudge | dispatch | dispatch |
| unregistered | nudge | nudge | dispatch | dispatch |

Plus:
- `parseCommand` accepts `/sales`, `/sales@FrollieProBot`; rejects `/sales now`.
- `runSalesOnDemand` ordering: ack sent **before** summary; failure path sends breadcrumb.
- Regression: `/pack` from the pack-list holder still dispatches (no behavior break for the
  existing flow).

---

## Files touched

| File | Change |
|------|--------|
| `convex/telegram/chatRegistry.ts` | `parseCommand` +`sales`; new `getChatAuth` internalQuery; `TelegramCommand` union |
| `convex/telegram/webhook.ts` | `COMMAND_POLICY` map; auth gate in `decideWebhookOutcome`; `getChatAuth`/`runSales`/`sendNudge` deps + `sales` dispatch arm |
| `convex/telegram/salesSummary/sendSalesSummary.ts` | new `runSalesOnDemand` internalAction (ack → reuse daily → breadcrumb) |
| `convex/telegram/__tests__/webhookHandler.test.ts` | policy matrix + sales dispatch |
| `convex/telegram/__tests__/chatRegistry.test.ts` | `parseCommand` sales cases; `getChatAuth` |
| (no schema change; no `sendSalesSummary` send-logic change; no new env var) |

---

## Out of scope (YAGNI)

- Owner/admin bypass role (D6: explicitly rejected — strict per-command).
- Destination parameterization of `sendSalesSummary` (unnecessary under D4+D6).
- `/sales weekly|monthly` arguments — `/sales` = daily only.
- "Already running" concurrency guard for rapid double `/sales` (incremental syncs are
  idempotent; two runs are harmless).
- BotFather command-menu registration (visibility only; can be added operationally later).

---

## Operational note

No new env vars, no schema migration, no new `KNOWN_TELEGRAM_ROLES` entry. The `sales-updates`
and `pack-list` roles already exist and are assigned. After deploy, `/sales` works immediately
from the `sales-updates` group; `/pack` continues working from the pack-list group.
