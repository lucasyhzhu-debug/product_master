# Telegram Bot Integration — Portable Setup Pattern

This is the reusable process for wiring a Telegram bot into a Convex-backed app. It distills what the Frollie POS Telegram POC proved out, and is **portable** — copy it into another repo (e.g., Frollie Pro) when you need bot messaging there.

**Time investment:** ~30 minutes for one-way notifications, ~90 minutes for two-way (with inline buttons + webhook).

**See also:**
- [`docs/RUNBOOK-telegram.md`](../RUNBOOK-telegram.md) — diagnostics when something breaks
- Reference implementation in this repo: `convex/telegram/`, `convex/lib/telegramHtml.ts`, `convex/http.ts`

---

## Decide: one-way or two-way?

| Use case | Shape | Convex code needed | Example |
|----------|-------|--------------------|---------|
| **One-way notification** | Convex → Telegram | Action only | Daily delivery report, end-of-shift summary, error alerts, payout notifications |
| **Two-way with buttons** | Convex → Telegram → user taps → Convex | Action + `httpAction` webhook | Manager approval request, refund confirmation, inline polls |

**Rule of thumb:** if the bot only TALKS to people, you need just an action. If the bot needs to LISTEN to button taps or commands, you need an action + a webhook.

The daily delivery report is one-way. Manager approvals are two-way.

---

## Step 1 — Create the bot in BotFather (~3 min)

1. Open `@BotFather` in Telegram on any account.
2. Send `/newbot` and follow prompts:
   - **Name** (shown in chats): e.g., `Frollie Delivery Bot`
   - **Username** (must end in `bot`): e.g., `FrollieDeliveryBot`
3. BotFather replies with the **bot token** — a string like `123456789:AAExample-DummyTokenReplaceWithYourOwn0000`. **This is the only credential you'll ever need.** Save it to a secrets store immediately — never paste a real token into docs or source.
4. **(Optional polish)** Set the bot description and about-text via `/setdescription` and `/setabouttext`. Useful for distinguishing dev vs prod bots in a search.

**Sanity test the token:**

```powershell
curl.exe "https://api.telegram.org/bot<TOKEN>/getMe"
```

Expected: `{"ok":true,"result":{"id":<bot_id>,"is_bot":true,"first_name":"...","username":"..."}}`. If this returns `Unauthorized`, the token is wrong.

---

## Step 2 — Pick a destination chat

### Option A: A group (most common)

1. Create a Telegram group (or use an existing one). Name it clearly — e.g., `Frollie · Operations`.
2. Add your bot to the group as a **member** (admin not required for basic `sendMessage`).
3. **In the group, send a message that mentions the bot:**
   ```
   @YourBot_username hello
   ```
   You MUST use Telegram's autocomplete to make this a real mention (the username turns blue/highlighted). If you just type the @ as plain text, the bot won't see the message because privacy mode is ON by default.

### Option B: A DM with the bot (good for personal alerts)

1. Search for your bot in Telegram (`@YourBot_username`).
2. Open a private chat, tap **Start** (or send `/start`).
3. Send any message like `hello`.

---

## Step 3 — Discover the chat_id

This is the step everyone gets stuck on. There is **one known gotcha**: the `allowed_updates` filter (see [RUNBOOK §allowed_updates trap](../RUNBOOK-telegram.md#the-allowed_updates-trap)). The safe approach is to pass `allowed_updates` explicitly so message updates aren't silently filtered:

```powershell
curl.exe "https://api.telegram.org/bot<TOKEN>/getUpdates?allowed_updates=%5B%22message%22%2C%22callback_query%22%5D&timeout=10"
```

URL-encoded blob is `["message","callback_query"]`. The `timeout=10` long-polls for 10 seconds so updates that arrive after your call still get returned.

In the response, find the most recent `"message"` entry and copy:

```json
"chat": {
  "id": -5247663806,        // ← the chat_id, COPY THIS VERBATIM
  "title": "...",
  "type": "group"           // ← also note this; affects future id format
}
```

**Important about chat types:**
- `"type": "private"` — DM. id is the user's positive id (e.g., `6507689714`).
- `"type": "group"` — basic group. id is `-NNN` (just a minus prefix).
- `"type": "supergroup"` — id is `-100NNN` (with `-100` prefix). Telegram silently migrates basic groups to supergroups when features are enabled — if your bot stops finding the chat months later, the group probably migrated and the id changed format.

---

## Step 4 — Convex env vars

Set the secrets on the Convex deployment where the code runs:

```powershell
npx convex env set TELEGRAM_BOT_TOKEN "<token>"

# Note the `--` separator — required because the value starts with a minus
npx convex env set TELEGRAM_CHAT_ID -- <chat_id>
```

For two-way (webhook) setups, also generate and set a webhook secret:

```powershell
# Generate a 64-char hex secret
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"

# Set it
npx convex env set TELEGRAM_WEBHOOK_SECRET "<generated_hex>"
```

Verify all are set:

```powershell
npx convex env list
```

---

## Step 5 — Convex code

### Variant A: One-way action (simplest case)

Minimal Convex action that sends a message. No webhook, no buttons.

```ts
// convex/notifications/sendTelegram.ts
import { action } from "../_generated/server";
import { v } from "convex/values";

export const sendTelegramMessage = action({
  args: { text: v.string() },
  handler: async (_ctx, args) => {
    const token = process.env.TELEGRAM_BOT_TOKEN;
    const chatId = process.env.TELEGRAM_CHAT_ID;
    if (!token || !chatId) {
      throw new Error("Telegram env vars missing");
    }

    const response = await fetch(
      `https://api.telegram.org/bot${token}/sendMessage`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chat_id: chatId,
          text: args.text,
          parse_mode: "HTML",  // use HTML, NOT MarkdownV2 — fewer escape footguns
        }),
      },
    );
    const json = await response.json();
    if (!response.ok || !json?.ok) {
      throw new Error(`Telegram sendMessage failed: ${response.status} ${JSON.stringify(json)}`);
    }
    return { ok: true, message_id: json.result.message_id };
  },
});
```

**HTML formatting reminder:** Only `&`, `<`, `>` need escaping. Allowed tags: `<b>`, `<i>`, `<u>`, `<s>`, `<code>`, `<pre>`, `<a href>`. Always escape user-supplied content before interpolation:

```ts
function escapeHtml(s: string): string {
  return s.replace(/[&<>]/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[ch]!));
}
```

### Variant B: Two-way with inline buttons + webhook

Reuse the Frollie POS POC code as a starting point — see:
- `convex/telegram/send.ts` — action with template renderers + inline keyboards
- `convex/telegram/webhook.ts` — `httpAction` with secret verification + dedupe
- `convex/http.ts` — HTTP router that mounts the webhook
- `convex/lib/telegramHtml.ts` — pure HTML escape + template functions

Critical bits to copy:

1. **Secret-token verification** at the very top of the webhook handler:
   ```ts
   const expectedSecret = process.env.TELEGRAM_WEBHOOK_SECRET;
   const providedSecret = request.headers.get("X-Telegram-Bot-Api-Secret-Token");
   if (!expectedSecret || providedSecret !== expectedSecret) {
     return new Response("unauthorized", { status: 401 });
   }
   ```
2. **Idempotency dedupe** by `update_id` in the mutation that records the callback (Telegram retries on non-200 for ~24h).
3. **Always call `answerCallbackQuery`** after handling a button press — otherwise the spinner on the user's button never stops.
4. **Register the webhook URL** (one-time setup):
   ```powershell
   curl.exe -X POST "https://api.telegram.org/bot<TOKEN>/setWebhook" `
     -d "url=https://<your-deployment>.convex.site/telegram-webhook" `
     -d "secret_token=<SECRET>" `
     -d 'allowed_updates=["callback_query"]'
   ```
   **The URL must be `.convex.site`, not `.convex.cloud`.** `httpAction`s live on `.site`. Wrong subdomain = silent retries forever.

---

## Variant C: Multi-chat with self-registration

Adds a `telegramChats` registry table + `/register@<bot>` command. Send-actions
resolve chat IDs by semantic role at send time. See spec
`docs/superpowers/specs/2026-05-27-telegram-self-register-design.md` and
porting checklist `docs/telegram/self-register-porting.md`.

### When to use
- 2+ semantic delivery destinations (pack-list, sales-updates, ...)
- Want self-service group onboarding without `curl getUpdates`/env-var edits

### Schema sketch

A single `telegramChats` table holds one row per registered chat:

```ts
// convex/schema.ts
telegramChats: defineTable({
  // identity (immutable post-registration)
  chatId: v.string(),          // string sidesteps the -100… supergroup number range
  chatType: v.union(v.literal("private"), v.literal("group"), v.literal("supergroup")),
  title: v.string(),
  // role assignment (mutable via admin UI; validated in app code, not schema)
  role: v.optional(v.string()),
  // provenance
  registeredBy: v.optional(v.number()),
  registeredAt: v.number(),
  lastSeenAt: v.number(),
  // operational state
  archivedAt: v.optional(v.number()),
  lastError: v.optional(v.object({ at: v.number(), message: v.string() })),
})
  .index("by_chatId", ["chatId"])            // unique lookup for upsert + existence guards
  .index("by_role_archived", ["role", "archivedAt"]), // role lookup + active-list, index-only
```

`by_role_archived` is a single compound index covering both access paths
(`getChatIdByRole` and the active-chat list). A separate `by_role` index would
push `archivedAt = undefined` into a post-scan `.filter()` — avoid it.

### Role-to-action lookup pattern

Every send-action goes through `getChatIdByRole({ role })` (an `internalQuery`)
instead of reading `process.env.TELEGRAM_CHAT_ID`. Three-step chain:

1. **Table** — query `telegramChats` `by_role_archived` for an active row
   (`role === role`, `archivedAt === undefined`). Match → return `row.chatId`.
2. **Env fallback** — if no row AND `process.env.TELEGRAM_FALLBACK_ROLE` is set
   AND equals the requested role, return `process.env.TELEGRAM_CHAT_ID`. This
   keeps the legacy env-var path working during migration; unset it post-cutover.
3. **Throw** — otherwise `Error("No Telegram chat assigned to role X")`.

So `sendPackList` calls
`ctx.runQuery(internal.telegram.chatRegistry.getChatIdByRole, { role: "pack-list" })`
rather than reading the env var directly. Adding a new destination is then just:
add the role to `KNOWN_TELEGRAM_ROLES`, write the send-action against
`getChatIdByRole`, and `/register` the group + assign the role in the admin UI —
no new env var.

---

## Worked example: daily delivery report (one-way)

Use case: at the end of each business day, Convex aggregates delivery metrics and posts a structured summary to a Telegram operations group.

### Code

```ts
// convex/notifications/dailyDeliveryReport.ts
import { internalAction } from "../_generated/server";
import { internal } from "../_generated/api";

const escapeHtml = (s: string) =>
  s.replace(/[&<>]/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[ch]!));

const formatIdr = (n: number) =>
  new Intl.NumberFormat("id-ID").format(Math.round(n));

export const sendDailyDeliveryReport = internalAction({
  args: {},
  handler: async (ctx) => {
    const token = process.env.TELEGRAM_BOT_TOKEN;
    const chatId = process.env.TELEGRAM_CHAT_ID;
    if (!token || !chatId) throw new Error("Telegram env vars missing");

    // Aggregate today's metrics via a query
    const stats = await ctx.runQuery(internal.deliveries.todayStats, {});
    //   stats: { date, deliveriesCompleted, deliveriesFailed, revenueIdr, avgMinutes }

    const text =
      `<b>Daily delivery report — ${escapeHtml(stats.date)}</b>\n` +
      `<b>Completed:</b> ${stats.deliveriesCompleted}\n` +
      `<b>Failed:</b> ${stats.deliveriesFailed}\n` +
      `<b>Revenue:</b> Rp ${formatIdr(stats.revenueIdr)}\n` +
      `<b>Avg time:</b> ${stats.avgMinutes.toFixed(0)} min`;

    const response = await fetch(
      `https://api.telegram.org/bot${token}/sendMessage`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ chat_id: chatId, text, parse_mode: "HTML" }),
      },
    );
    const json = await response.json();
    if (!response.ok || !json?.ok) {
      throw new Error(`Telegram sendMessage failed: ${response.status} ${JSON.stringify(json)}`);
    }
  },
});
```

### Schedule it (Convex cron)

```ts
// convex/crons.ts
import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";

const crons = cronJobs();

crons.daily(
  "daily delivery report",
  { hourUTC: 14, minuteUTC: 0 },  // 21:00 Jakarta (UTC+7)
  internal.notifications.dailyDeliveryReport.sendDailyDeliveryReport,
);

export default crons;
```

That's the full one-way pattern. About 50 lines total. No webhook, no buttons, no DB logging needed (Convex's own logs capture the action runs).

---

## Resilience: cron-triggered sends MUST be retry-wrapped

**Convex crons fire a function exactly once with NO auto-retry.** A send-action's
first step is a `getChatIdByRole` runQuery (or, in the env-var variant, reading
config). If a transient Convex capacity error — `There are no available workers
to process the request` — coincides with the firing time, that runQuery throws
*before any message is sent* and the post is **silently dropped**. There is no
error in the chat, just a missing message.

This is not hypothetical: it dropped Frollie's midday pack-list post on
2026-05-29 at 13:00 WIB. Production log:

```
1:00:01 pm [CONVEX Q(telegram/chatRegistry:getChatIdByRole)] There are no available workers to process the request
1:00:01 pm [CONVEX A(telegram/sendPackList:sendPackList)] Uncaught Error: There are no available workers to process the request
```

### The pattern

Every **cron-triggered** send gets a thin `*Resilient` wrapper internalAction.
The crons point at the wrapper; the raw send-action stays the on-demand
entrypoint (`/pack` command, admin test-send), where a human can just re-issue
it. Shared policy lives in `convex/telegram/cronRetry.ts`:

```ts
// convex/telegram/cronRetry.ts
export const RESILIENT_MAX_ATTEMPTS = 3;                       // initial + 2 retries
export function resilientRetryDelayMs(a: number) { return 60_000 * (a + 1); } // 60s, 120s
const TRANSIENT_ERROR_SUBSTRINGS = ["no available workers"];
export function isTransientError(err: unknown): boolean {
  const msg = (err instanceof Error ? err.message : String(err)).toLowerCase();
  return TRANSIENT_ERROR_SUBSTRINGS.some((s) => msg.includes(s));
}
```

```ts
// the wrapper — one per cron send-action
export const sendThingResilient = internalAction({
  args: { /* same args as sendThing */ ...baseArgs, attempt: v.optional(v.number()) },
  handler: async (ctx, args): Promise<void> => {
    const attempt = args.attempt ?? 0;
    try {
      await ctx.runAction(internal.telegram.sendThing.sendThing, baseArgs);
    } catch (err) {
      if (isTransientError(err) && attempt + 1 < RESILIENT_MAX_ATTEMPTS) {
        await ctx.scheduler.runAfter(
          resilientRetryDelayMs(attempt),
          internal.telegram.sendThing.sendThingResilient,   // reschedules ITSELF
          { ...baseArgs, attempt: attempt + 1 },
        );
        return;
      }
      throw err;   // non-transient → fail loudly (shows in cron dashboard)
    }
  },
});
```

```ts
// convex/crons.ts — point the cron at the wrapper, not the raw action
crons.daily("thing", { hourUTC, minuteUTC }, internal.telegram.sendThing.sendThingResilient, baseArgs);
```

### Three rules that keep retries safe

1. **Retry transient errors ONLY.** A mid-chunk Telegram `sendMessage` failure
   is *not* transient — retrying it would re-post earlier chunks. `isTransientError`
   matches only the Convex overload message, which can only occur *before* the
   send loop. Everything else rethrows.
2. **Pre-send work that re-runs on retry must be idempotent.** If the action does
   data refreshes before sending (e.g. the sales-summary best-effort syncs), they
   re-run on each retry — incremental syncs are fine; non-idempotent writes are not.
3. **Per-action wrapper, not one generic action.** `scheduler.runAfter` needs a
   concrete function reference to reschedule, and references aren't serialisable
   as args — so each wrapper must name itself. Only the *policy* (classification +
   backoff) is shared via `cronRetry.ts`.

**Checklist when adding any new cron-triggered Telegram send:** write `sendX`, then
`sendXResilient` wrapping it, point the cron at the wrapper, and confirm rule #2
(idempotent pre-send work). The on-demand path keeps calling `sendX` directly.

---

## Porting this to a new project

To set up Telegram in another repo (e.g., Frollie Pro):

1. **Create a separate bot** in BotFather (don't reuse the POS bot — separate identity per app makes log noise easier to filter).
2. **Decide one-way or two-way** for your first use case.
3. **Pick a chat** (group or DM) and discover its chat_id following Step 3.
4. **Set the three Convex env vars** on that repo's Convex deployment (using its own `npx convex env set` against its own deployment URL).
5. **Copy the code:**
   - For one-way: the ~50-line action template from the worked example above. Adapt the message body to your domain.
   - For two-way: copy `convex/lib/telegramHtml.ts`, `convex/telegram/{send,webhook}.ts`, and `convex/http.ts` from the Frollie POS repo. Rename the template kinds, adapt the schema's `telegram_log` table, and update the import paths. The shape is reusable verbatim.
6. **If two-way**, register the webhook against the new project's `.convex.site` URL.
7. **Smoke-test** end to end before adding the cron / wiring it into real flows.

---

## Gotchas (cross-referenced to RUNBOOK)

| Symptom | Where to look |
|---------|---------------|
| `getUpdates` returns empty | [RUNBOOK §allowed_updates trap](../RUNBOOK-telegram.md#the-allowed_updates-trap) |
| `Bad Request: chat not found` | [RUNBOOK §wrong chat_id](../RUNBOOK-telegram.md#wrong-chat_id) |
| Webhook never fires | [RUNBOOK §webhook not firing](../RUNBOOK-telegram.md#webhook-not-firing) |
| Wrong Convex deployment | [RUNBOOK §wrong Convex deployment](../RUNBOOK-telegram.md#wrong-convex-deployment) |
| Promoting dev → prod | [RUNBOOK §Promoting Telegram from dev to prod — checklist](../RUNBOOK-telegram.md#promoting-telegram-from-dev-to-prod--checklist) |

---

## When to NOT use this pattern

- **Customer-facing notifications.** Telegram requires the recipient to `/start` your bot first (opt-in). Customers won't do this. Use WhatsApp (wa.me), SMS (Twilio), or email instead.
- **Direct messages to arbitrary users.** Same constraint — they must opt in first.
- **Bulk broadcasts.** Telegram rate-limits bots aggressively. For broadcast-style use cases, look at channels (one-way subscribe model) instead of bots, or use a real notification platform.
