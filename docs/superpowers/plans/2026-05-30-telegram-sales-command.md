# Telegram `/sales` Command + Command-Auth Policy — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an on-demand `/sales` Telegram command that acks immediately then runs the existing daily sales-summary, and harden command dispatch with a central per-command authorization policy applied to `/pack` and all future commands.

**Architecture:** All logic lands in the existing `convex/telegram/` module. The pure `decideWebhookOutcome` function gains a typed `COMMAND_POLICY` gate (deny-by-default for role-gated commands) checked via a new `getChatAuth` registry query. `/sales` reuses `sendSalesSummary({cadence:"daily"})` unchanged, wrapped by a new `runSalesOnDemand` action that sends the ack and a failure breadcrumb. No schema change, no new env var, no new role.

**Tech Stack:** Convex (TypeScript serverless), Vitest + convex-test, Telegram Bot API.

**Spec:** `docs/superpowers/specs/2026-05-30-telegram-sales-command-design.md`

---

## File Structure

| File | Responsibility | Change |
|------|----------------|--------|
| `convex/telegram/chatRegistry.ts` | command parse + registry primitives | `parseCommand` +`sales`; `TelegramCommand` +`"sales"`; new `getChatAuth` internalQuery |
| `convex/telegram/webhook.ts` | webhook decision core + httpAction glue | `COMMAND_POLICY` map; auth gate; `getChatAuth`/`runSales`/`sendNudge` deps; `sales` dispatch arm; httpAction wiring |
| `convex/telegram/salesSummary/sendSalesSummary.ts` | sales-summary send actions | new `runSalesOnDemand` internalAction |
| `convex/telegram/__tests__/chatRegistry.test.ts` | parse tests | +`/sales` cases |
| `convex/telegram/__tests__/getChatAuth.test.ts` | registry auth lookup | NEW (convex-test) |
| `convex/telegram/__tests__/webhookHandler.test.ts` | webhook decision tests | + policy matrix + sales dispatch |
| `convex/telegram/salesSummary/__tests__/runSalesOnDemand.test.ts` | on-demand ack/breadcrumb | NEW (convex-test) |

---

## Task 1: `parseCommand` accepts `/sales`

**Files:**
- Modify: `convex/telegram/chatRegistry.ts:51-61`
- Test: `convex/telegram/__tests__/chatRegistry.test.ts`

- [ ] **Step 1: Write the failing test**

Append to `convex/telegram/__tests__/chatRegistry.test.ts`:

```ts
describe("parseCommand — /sales (2026-05-30 sales command)", () => {
  it.each([
    ["/sales", "sales"],
    ["/sales@FrollieProBot", "sales"],
    ["  /sales  ", "sales"],
  ])("parses %j → %j", (input, expected) => {
    expect(parseCommand(input)).toBe(expected);
  });

  it("rejects /sales with trailing args (strict match)", () => {
    expect(parseCommand("/sales now")).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test -- chatRegistry`
Expected: FAIL — `parseCommand("/sales")` returns `null` (regex doesn't include `sales`).

- [ ] **Step 3: Implement**

In `convex/telegram/chatRegistry.ts`, update the union and regex:

```ts
export type TelegramCommand = "pack" | "register" | "start" | "sales";

/**
 * Strict-mode command parse. Accepts /pack /register /start /sales with optional
 * @BotName suffix and surrounding whitespace. Rejects trailing args (typo
 * protection inherited from the original /pack strict-match policy).
 */
export function parseCommand(text: string): TelegramCommand | null {
  const m = /^\/(pack|register|start|sales)(@[A-Za-z0-9_]+)?$/.exec(text.trim());
  return m ? (m[1] as TelegramCommand) : null;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test -- chatRegistry`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add convex/telegram/chatRegistry.ts convex/telegram/__tests__/chatRegistry.test.ts
git commit -m "feat(telegram): parseCommand accepts /sales"
```

---

## Task 2: `getChatAuth` registry query

**Files:**
- Modify: `convex/telegram/chatRegistry.ts` (add after `getChatIdByRole`, ~line 91)
- Test: `convex/telegram/__tests__/getChatAuth.test.ts` (CREATE)

- [ ] **Step 1: Write the failing test**

Create `convex/telegram/__tests__/getChatAuth.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { convexTest } from "convex-test";
import schema from "../../schema";
import { internal } from "../../_generated/api";

const modules = import.meta.glob("/convex/**/*.ts");

describe("getChatAuth", () => {
  it("unregistered chat → {registered:false, archived:false}", async () => {
    const t = convexTest(schema, modules);
    const r = await t.query(internal.telegram.chatRegistry.getChatAuth, { chatId: "-1" });
    expect(r).toEqual({ registered: false, archived: false });
  });

  it("registered with role → returns role, not archived", async () => {
    const t = convexTest(schema, modules);
    await t.run(async (ctx) => {
      await ctx.db.insert("telegramChats", {
        chatId: "-100", chatType: "group", title: "Sales", role: "sales-updates",
        registeredAt: 0, lastSeenAt: 0,
      });
    });
    const r = await t.query(internal.telegram.chatRegistry.getChatAuth, { chatId: "-100" });
    expect(r).toEqual({ registered: true, role: "sales-updates", archived: false });
  });

  it("registered without role → role undefined", async () => {
    const t = convexTest(schema, modules);
    await t.run(async (ctx) => {
      await ctx.db.insert("telegramChats", {
        chatId: "-200", chatType: "group", title: "Dormant", registeredAt: 0, lastSeenAt: 0,
      });
    });
    const r = await t.query(internal.telegram.chatRegistry.getChatAuth, { chatId: "-200" });
    expect(r).toEqual({ registered: true, role: undefined, archived: false });
  });

  it("archived chat → archived:true", async () => {
    const t = convexTest(schema, modules);
    await t.run(async (ctx) => {
      await ctx.db.insert("telegramChats", {
        chatId: "-300", chatType: "group", title: "Archived",
        registeredAt: 0, lastSeenAt: 0, archivedAt: 123,
      });
    });
    const r = await t.query(internal.telegram.chatRegistry.getChatAuth, { chatId: "-300" });
    expect(r).toEqual({ registered: true, role: undefined, archived: true });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test -- getChatAuth`
Expected: FAIL — `internal.telegram.chatRegistry.getChatAuth` does not exist.

- [ ] **Step 3: Implement**

In `convex/telegram/chatRegistry.ts`, add after the `getChatIdByRole` block:

```ts
// ─── getChatAuth ─────────────────────────────────────────────────────────────

/**
 * Authorization lookup for the webhook command gate. One point read on by_chatId.
 * Returns the chat's registration + role + archived state so decideWebhookOutcome
 * can enforce COMMAND_POLICY. Never throws (unknown chat → registered:false).
 */
export const getChatAuth = internalQuery({
  args: { chatId: v.string() },
  handler: async (
    ctx,
    args,
  ): Promise<{ registered: boolean; role?: string; archived: boolean }> => {
    const row = await ctx.db
      .query("telegramChats")
      .withIndex("by_chatId", (q) => q.eq("chatId", args.chatId))
      .unique();
    if (!row) return { registered: false, archived: false };
    return {
      registered: true,
      role: row.role,
      archived: row.archivedAt !== undefined,
    };
  },
});
```

- [ ] **Step 4: Regenerate Convex API types**

Run: `npx convex codegen`
Expected: `convex/_generated/api.d.ts` updated to include `getChatAuth` (recurring lesson — new Convex functions need codegen or downstream `internal.*` refs fail typecheck).

- [ ] **Step 5: Run test to verify it passes**

Run: `npm run test -- getChatAuth`
Expected: PASS (4 tests).

- [ ] **Step 6: Commit**

```bash
git add convex/telegram/chatRegistry.ts convex/telegram/__tests__/getChatAuth.test.ts convex/_generated/api.d.ts
git commit -m "feat(telegram): getChatAuth registry lookup for command authorization"
```

---

## Task 3: `runSalesOnDemand` action (ack → daily summary → breadcrumb)

**Files:**
- Modify: `convex/telegram/salesSummary/sendSalesSummary.ts` (append new action)
- Test: `convex/telegram/salesSummary/__tests__/runSalesOnDemand.test.ts` (CREATE)

- [ ] **Step 1: Write the failing test**

Create `convex/telegram/salesSummary/__tests__/runSalesOnDemand.test.ts`. The failure
path is the clean seam: with NO `sales-updates` chat assigned and no env fallback,
`sendSalesSummary` throws at `getChatIdByRole` *before* any sync runs — so this one
test proves both the ack-first ordering AND the failure breadcrumb without executing the
heavy GoFood/K3Mart/Direct syncs.

```ts
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { convexTest } from "convex-test";
import schema from "../../../schema";
import { internal } from "../../../_generated/api";

const modules = import.meta.glob("/convex/**/*.ts");

let captured: Array<{ url: string; body: string }>;

beforeEach(() => {
  captured = [];
  process.env.TELEGRAM_BOT_TOKEN = "test-token";
  // Ensure getChatIdByRole has no env fallback so it throws (drives the failure path).
  delete process.env.TELEGRAM_FALLBACK_ROLE;
  delete process.env.TELEGRAM_CHAT_ID;
  global.fetch = vi.fn(async (input: RequestInfo) => {
    const url = typeof input === "string" ? input : input.toString();
    const body = (arguments as any)[1]?.body as string;
    captured.push({ url, body });
    return new Response(JSON.stringify({ ok: true, result: { message_id: 1 } }), { status: 200 });
  }) as unknown as typeof fetch;
});

afterEach(() => {
  vi.restoreAllMocks();
  delete process.env.TELEGRAM_BOT_TOKEN;
});

describe("runSalesOnDemand", () => {
  it("sends ack first, then a failure breadcrumb when the summary throws", async () => {
    const t = convexTest(schema, modules);
    // No sales-updates chat assigned → getChatIdByRole throws inside sendSalesSummary.
    await expect(
      t.action(internal.telegram.salesSummary.sendSalesSummary.runSalesOnDemand, {
        chatId: "-555",
      }),
    ).rejects.toThrow();

    const texts = captured.map((c) => JSON.parse(c.body).text as string);
    // First message is the ack.
    expect(texts[0]).toContain("Acknowledged");
    // A breadcrumb follows after the failure.
    expect(texts.some((x) => x.includes("Sales update failed"))).toBe(true);
  });
});
```

> Note: the stub reads the request body via `arguments` to match the existing
> `registerChatReply.test.ts` capture style; if your lint config disallows `arguments`
> in arrow functions, switch the mock to `vi.fn(async (input, init) => { const body = init?.body; ... })`.

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test -- runSalesOnDemand`
Expected: FAIL — `runSalesOnDemand` does not exist on the module.

- [ ] **Step 3: Implement**

Append to `convex/telegram/salesSummary/sendSalesSummary.ts` (it already imports
`sendTelegramHtml` and `internal`):

```ts
// ─── runSalesOnDemand ────────────────────────────────────────────────────────

/**
 * On-demand entrypoint for the /sales command. Sends an immediate ack to the
 * requesting chat (so the operator sees it working), then reuses the EXACT daily
 * process (3 best-effort syncs + summary → sales-updates group). On failure after
 * the ack, sends a breadcrumb so the operator is never left hanging, then rethrows
 * so the failure surfaces in the Convex dashboard.
 *
 * Direct (non-resilient) call: on-demand favors fast failure + retry-by-re-typing
 * over multi-minute silent retry loops. Crons keep using sendSalesSummaryResilient.
 */
export const runSalesOnDemand = internalAction({
  args: { chatId: v.string() },
  handler: async (ctx, args): Promise<void> => {
    const token = process.env.TELEGRAM_BOT_TOKEN;
    if (!token) throw new Error("Telegram env var missing (TELEGRAM_BOT_TOKEN)");

    await sendTelegramHtml(
      token,
      args.chatId,
      "✅ Acknowledged — updating sales channels, then coming back with your report…",
    );

    try {
      await ctx.runAction(
        internal.telegram.salesSummary.sendSalesSummary.sendSalesSummary,
        { cadence: "daily" },
      );
    } catch (err) {
      try {
        await sendTelegramHtml(
          token,
          args.chatId,
          "⚠️ Sales update failed — check Convex logs.",
        );
      } catch {
        /* best-effort breadcrumb — ignore secondary failure */
      }
      throw err;
    }
  },
});
```

- [ ] **Step 4: Regenerate Convex API types**

Run: `npx convex codegen`
Expected: `api.d.ts` includes `runSalesOnDemand`.

- [ ] **Step 5: Run test to verify it passes**

Run: `npm run test -- runSalesOnDemand`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add convex/telegram/salesSummary/sendSalesSummary.ts convex/telegram/salesSummary/__tests__/runSalesOnDemand.test.ts convex/_generated/api.d.ts
git commit -m "feat(telegram): runSalesOnDemand — ack + daily summary + failure breadcrumb"
```

---

## Task 4: `COMMAND_POLICY` gate + `/sales` dispatch + httpAction wiring

**Files:**
- Modify: `convex/telegram/webhook.ts`
- Test: `convex/telegram/__tests__/webhookHandler.test.ts`

- [ ] **Step 1: Write the failing tests**

In `convex/telegram/__tests__/webhookHandler.test.ts`, update `defaultDeps` to supply the
three new deps (default `getChatAuth` authorizes `pack-list` so existing `/pack` tests keep
passing) and append a policy-matrix describe block:

```ts
// --- update defaultDeps() to include the new deps ---
function defaultDeps(over: Partial<WebhookDeps> = {}): WebhookDeps {
  return {
    recordIfNew: async () => true,
    runPack: async () => {},
    runRegister: async () => {},
    runStart: async () => {},
    touchLastSeen: async () => {},
    getChatAuth: async () => ({ registered: true, role: "pack-list", archived: false }),
    runSales: async () => {},
    sendNudge: async () => {},
    ...over,
  };
}

// --- append new tests ---
describe("decideWebhookOutcome — command authorization policy (2026-05-30)", () => {
  const SECRET2 = "a".repeat(64);
  const auth = (over: { registered?: boolean; role?: string; archived?: boolean }) =>
    async () => ({ registered: true, archived: false, ...over });

  it("/sales from a sales-updates chat → dispatches runSales with chatId", async () => {
    const runSales = vi.fn().mockResolvedValue(undefined);
    const result = await decideWebhookOutcome({
      providedSecret: SECRET2, expectedSecret: SECRET2,
      body: makeUpdate({ text: "/sales" }),
      deps: defaultDeps({ getChatAuth: auth({ role: "sales-updates" }), runSales }),
    });
    expect(result.status).toBe(200);
    expect(runSales).toHaveBeenCalledWith("-1001234567890");
  });

  it("/sales from a pack-list chat → nudge, no dispatch (per-command match)", async () => {
    const runSales = vi.fn();
    const sendNudge = vi.fn().mockResolvedValue(undefined);
    const recordIfNew = vi.fn();
    const result = await decideWebhookOutcome({
      providedSecret: SECRET2, expectedSecret: SECRET2,
      body: makeUpdate({ text: "/sales" }),
      deps: defaultDeps({ getChatAuth: auth({ role: "pack-list" }), runSales, sendNudge, recordIfNew }),
    });
    expect(result.status).toBe(200);
    expect(runSales).not.toHaveBeenCalled();
    expect(recordIfNew).not.toHaveBeenCalled(); // no update_id burned on reject
    expect(sendNudge).toHaveBeenCalledTimes(1);
    expect(sendNudge.mock.calls[0][1]).toContain("sales-updates");
  });

  it("/sales from a registered chat with no role → nudge", async () => {
    const runSales = vi.fn();
    const sendNudge = vi.fn().mockResolvedValue(undefined);
    await decideWebhookOutcome({
      providedSecret: SECRET2, expectedSecret: SECRET2,
      body: makeUpdate({ text: "/sales" }),
      deps: defaultDeps({ getChatAuth: auth({ role: undefined }), runSales, sendNudge }),
    });
    expect(runSales).not.toHaveBeenCalled();
    expect(sendNudge).toHaveBeenCalledTimes(1);
  });

  it("/sales from an archived sales-updates chat → nudge", async () => {
    const runSales = vi.fn();
    const sendNudge = vi.fn().mockResolvedValue(undefined);
    await decideWebhookOutcome({
      providedSecret: SECRET2, expectedSecret: SECRET2,
      body: makeUpdate({ text: "/sales" }),
      deps: defaultDeps({ getChatAuth: auth({ role: "sales-updates", archived: true }), runSales, sendNudge }),
    });
    expect(runSales).not.toHaveBeenCalled();
    expect(sendNudge).toHaveBeenCalledTimes(1);
  });

  it("/sales from an unregistered chat → nudge", async () => {
    const runSales = vi.fn();
    const sendNudge = vi.fn().mockResolvedValue(undefined);
    await decideWebhookOutcome({
      providedSecret: SECRET2, expectedSecret: SECRET2,
      body: makeUpdate({ text: "/sales" }),
      deps: defaultDeps({ getChatAuth: async () => ({ registered: false, archived: false }), runSales, sendNudge }),
    });
    expect(runSales).not.toHaveBeenCalled();
    expect(sendNudge).toHaveBeenCalledTimes(1);
  });

  it("/pack from a sales-updates chat → nudge (pack now gated, was open)", async () => {
    const runPack = vi.fn();
    const sendNudge = vi.fn().mockResolvedValue(undefined);
    await decideWebhookOutcome({
      providedSecret: SECRET2, expectedSecret: SECRET2,
      body: makeUpdate({ text: "/pack" }),
      deps: defaultDeps({ getChatAuth: auth({ role: "sales-updates" }), runPack, sendNudge }),
    });
    expect(runPack).not.toHaveBeenCalled();
    expect(sendNudge).toHaveBeenCalledTimes(1);
    expect(sendNudge.mock.calls[0][1]).toContain("pack-list");
  });

  it("/register is open — dispatches without consulting getChatAuth", async () => {
    const getChatAuth = vi.fn();
    const runRegister = vi.fn().mockResolvedValue(undefined);
    await decideWebhookOutcome({
      providedSecret: SECRET2, expectedSecret: SECRET2,
      body: { update_id: 9, message: { message_id: 1, text: "/register", chat: { id: -7, type: "group", title: "X" } } } as any,
      deps: defaultDeps({ getChatAuth, runRegister }),
    });
    expect(getChatAuth).not.toHaveBeenCalled();
    expect(runRegister).toHaveBeenCalledTimes(1);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm run test -- webhookHandler`
Expected: FAIL — `WebhookDeps` has no `getChatAuth`/`runSales`/`sendNudge`; no `sales` arm; `/pack` from sales-updates still dispatches.

- [ ] **Step 3: Implement the deps, policy, and gate**

In `convex/telegram/webhook.ts`:

(a) Update imports at the top:

```ts
import { parseCommand, type TelegramCommand } from "./chatRegistry";
import { sendTelegramHtml } from "../lib/telegramHtml";
import { TELEGRAM_ADMIN_URL, TELEGRAM_BOT_USERNAME, type TelegramRole } from "./config";
```

(b) Add the policy map below the imports:

```ts
/**
 * Per-command authorization policy. Exhaustive over TelegramCommand: adding a new
 * command to the union forces a policy entry here (compile error otherwise) — so
 * new commands are secure-by-default, not accidentally open.
 *   "open"          → no role required (bootstrap/help commands)
 *   {requiresRole}  → sender's chat must hold exactly this role (active, non-archived)
 */
type CommandPolicy = "open" | { requiresRole: TelegramRole };

const COMMAND_POLICY: Record<TelegramCommand, CommandPolicy> = {
  register: "open",
  start: "open",
  pack: { requiresRole: "pack-list" },
  sales: { requiresRole: "sales-updates" },
};
```

(c) Extend the `WebhookDeps` interface (add three members):

```ts
  /** Authorization lookup for role-gated commands. */
  getChatAuth: (chatId: string) => Promise<{ registered: boolean; role?: string; archived: boolean }>;
  /** Dispatch /sales — schedule runSalesOnDemand for the requesting chat. */
  runSales: (chatId: string) => Promise<void>;
  /** Send a one-line reject nudge to the requesting chat (best-effort). */
  sendNudge: (chatId: string, html: string) => Promise<void>;
```

(d) Insert the gate in `decideWebhookOutcome`, immediately AFTER `const command = parseCommand(text);` and the existing non-command `if (!command) {...}` block, and BEFORE the `recordIfNew` line:

```ts
  // Authorization gate (deny-by-default for role-gated commands). Runs before
  // recordIfNew so a rejected command never burns an update_id slot.
  const policy = COMMAND_POLICY[command];
  if (policy !== "open") {
    const chatAuth = await input.deps.getChatAuth(chatIdStr);
    const authorized =
      chatAuth.registered && !chatAuth.archived && chatAuth.role === policy.requiresRole;
    if (!authorized) {
      const nudge =
        `⚠️ This chat isn't authorized for /${command}. ` +
        `Register with /register@${TELEGRAM_BOT_USERNAME} and ask an admin to assign the ` +
        `'${policy.requiresRole}' role at ${TELEGRAM_ADMIN_URL}`;
      try {
        await input.deps.sendNudge(chatIdStr, nudge);
      } catch {
        /* best-effort — nudge delivery is non-critical */
      }
      return { status: 200, body: "ok" };
    }
  }
```

(e) Add the `sales` arm in the dispatch try-block (between the `pack` and `register` branches):

```ts
    if (command === "pack") {
      await input.deps.runPack();
    } else if (command === "sales") {
      await input.deps.runSales(chatIdStr);
    } else if (command === "register") {
```

- [ ] **Step 4: Wire the new deps into the httpAction**

In `handleTelegramWebhook`'s `deps` object, add:

```ts
      getChatAuth: (chatId) =>
        ctx.runQuery(internal.telegram.chatRegistry.getChatAuth, { chatId }),
      runSales: async (chatId) => {
        await ctx.scheduler.runAfter(
          0,
          internal.telegram.salesSummary.sendSalesSummary.runSalesOnDemand,
          { chatId },
        );
      },
      sendNudge: async (chatId, html) => {
        const token = process.env.TELEGRAM_BOT_TOKEN;
        if (!token) return; // best-effort; nothing to send without a token
        await sendTelegramHtml(token, chatId, html);
      },
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npm run test -- webhookHandler`
Expected: PASS — new matrix green AND all pre-existing `/pack`, `/register`, `/start`, dedupe, and C3 tests still green (default `getChatAuth` returns `pack-list`, so default-`/pack` tests authorize).

- [ ] **Step 6: Commit**

```bash
git add convex/telegram/webhook.ts convex/telegram/__tests__/webhookHandler.test.ts
git commit -m "feat(telegram): COMMAND_POLICY auth gate + /sales dispatch; gate /pack"
```

---

## Task 5: Full verification

**Files:** none (verification only)

- [ ] **Step 1: Regenerate + typecheck**

Run: `npx convex codegen && npm run type-check`
Expected: no errors. (Confirms `Record<TelegramCommand, CommandPolicy>` is exhaustive and all `internal.*` refs resolve.)

- [ ] **Step 2: Full telegram test suite**

Run: `npm run test -- telegram`
Expected: PASS — parse, getChatAuth, runSalesOnDemand, webhookHandler all green.

- [ ] **Step 3: Build gate**

Run: `npm run build`
Expected: succeeds (tsc + vite).

- [ ] **Step 4: Commit any codegen drift**

```bash
git add convex/_generated/api.d.ts
git commit -m "chore(telegram): regen api.d.ts for /sales command" --allow-empty
```

---

## Manual E2E (after deploy to dev/prod)

Not automated — the happy path triggers real GoFood/K3Mart/Direct syncs.

- [ ] From the **sales-updates group**, send `/sales`. Expect: ack within ~1s ("Acknowledged — updating sales channels…"), then the full daily report (same content as the 23:00 cron).
- [ ] From the **pack-list group**, send `/sales`. Expect: nudge ("not authorized for /sales … assign the 'sales-updates' role"), no report.
- [ ] From the **pack-list group**, send `/pack`. Expect: pack list still delivered (no regression).
- [ ] From an **unregistered DM**, send `/sales`. Expect: nudge, no report, no data leak.

---

## Self-Review

**Spec coverage:**
- Auth model / COMMAND_POLICY → Task 4 ✓
- `getChatAuth` query → Task 2 ✓
- `parseCommand` +sales → Task 1 ✓
- `runSalesOnDemand` (ack + reuse daily + breadcrumb) → Task 3 ✓
- Webhook wiring (getChatAuth/runSales/sendNudge deps, sales arm) → Task 4 ✓
- `/pack` migration to gated → Task 4 (test + default-deps change) ✓
- Dedupe ordering (no update_id on nudge path) → Task 4 gate placement + test assertion ✓
- Testing matrix → Tasks 1–4 ✓
- No schema change / no `sendSalesSummary` send-logic change → respected (Task 3 only appends) ✓

**Type consistency:** `getChatAuth` return shape `{registered, role?, archived}` identical across the query (Task 2), the `WebhookDeps` member (Task 4c), and every test mock. `runSalesOnDemand({chatId})` signature matches the scheduler call (Task 4d) and test (Task 3). `CommandPolicy`/`TelegramCommand`/`TelegramRole` imported, not redefined.

**Placeholder scan:** none — every code step is complete.
