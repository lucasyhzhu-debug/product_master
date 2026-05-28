# Telegram self-registration & multi-chat routing — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the single hardcoded `TELEGRAM_CHAT_ID` env var with a self-registration registry — any group the bot is added to can register itself via `/register@FrollieProBot`, then a Frollie admin assigns a semantic role (`pack-list`, `sales-updates`) in a gated admin UI. Send-actions look up chat IDs by role.

**Architecture:** New `telegramChats` table (1 table + 1 compound index) + new module `convex/telegram/chatRegistry.ts` housing all registry mechanics + new admin page `/admin/telegram-chats`. Existing `webhook.ts` generalizes from `/pack`-only to multi-command dispatch. `sendPackList.ts` swaps `process.env.TELEGRAM_CHAT_ID` for `getChatIdByRole("pack-list")` with env-var soft fallback driven by `TELEGRAM_FALLBACK_ROLE`. Designed portable for the OSS Convex Telegram Bot Starter — every Frollie-specific bit isolated in `convex/telegram/config.ts`.

**Tech Stack:** Convex (schema, queries/mutations/actions, internal scheduler), React 19, shadcn/ui (Table, Badge, Select, AlertDialog, Popover, DropdownMenu, Switch, Input), TypeScript, Vitest (backend), React Testing Library (frontend).

**Source spec:** `docs/superpowers/specs/2026-05-27-telegram-self-register-design.md` (Approved 2026-05-27).

---

## Git Workflow

**Branch:** `feature/85-telegram-self-register`
**Checkpoints:** End of Wave 2 (backend core), End of Wave 4 (UI), After Wave 5 verify (ready to merge).

### Branch setup (DO BEFORE ANY TASK)

- [ ] **Step 0.1: Sync main and branch from it**

Run:
```bash
git switch main
git pull
git switch -c feature/85-telegram-self-register
git branch --show-current
```
Expected: `feature/85-telegram-self-register` printed.

(Per CLAUDE.md Pitfall #12 — ALWAYS `git switch main && git pull` first.)

---

## Implementation Waves

### Wave 1: Foundations [PARALLEL — 3 independent files]

| Agent | Task | Files |
|-------|------|-------|
| convex-backend | Task 1: Schema — add `telegramChats` table + compound index | `convex/schema.ts` |
| convex-backend | Task 2: Config module — `KNOWN_TELEGRAM_ROLES`, `isKnownTelegramRole`, `TELEGRAM_ADMIN_URL` | `convex/telegram/config.ts` (new) |
| frontend-integrator | Task 3: Permission field — `canAccessTelegramChats` boolean on all 4 role rows | `src/lib/types.ts` |

### Codegen Gate [SEQUENTIAL, after Wave 1]

| Agent | Task |
|-------|------|
| Bash | Task 3.5: `npx convex codegen` — regenerate `_generated/api.d.ts` for the new schema (per CLAUDE.md Pitfall #18 / Phase 76 + 81 lesson) |

### Wave 2: chatRegistry mechanics [SEQUENTIAL — shared file `convex/telegram/chatRegistry.ts`]

| Agent | Task | Files |
|-------|------|-------|
| convex-backend | Task 4: `parseCommand` (pure) + `getChatIdByRole` internalQuery + unit tests | `convex/telegram/chatRegistry.ts`, `convex/telegram/__tests__/chatRegistry.test.ts` |
| convex-backend | Task 5: `touchChatLastSeen` mutation + `registerChat` action + `replyStartHelp` action + tests | same files |
| convex-backend | Task 6: `listChats` query + `assignRole` mutation (with reassignment atomicity) + `archiveChat` + `restoreChat` mutations + tests | same files |
| convex-backend | Task 7: `sendTestMessage` action + `seedChatFromEnv` action + tests | same files |

### Wave 3: Webhook routing + send-action migration [PARALLEL — different files]

| Agent | Task | Files |
|-------|------|-------|
| convex-backend | Task 8: Generalize `webhook.ts` — multi-command dispatch + non-command `touchChatLastSeen` routing + extend test file | `convex/telegram/webhook.ts`, `convex/telegram/__tests__/webhookHandler.test.ts` |
| convex-backend | Task 9: `sendPackList.ts` — replace `process.env.TELEGRAM_CHAT_ID` with `getChatIdByRole("pack-list")` | `convex/telegram/sendPackList.ts` |

### Wave 4: Admin UI [SEQUENTIAL → PARALLEL]

| Agent | Task | Files |
|-------|------|-------|
| react-ui-builder | Task 10: registry hook module + `TelegramChatsManager.tsx` page (table, dialogs, search, empty state, status badges, inline error row) | `src/hooks/convex/useTelegramChats.ts` (new), `src/pages/TelegramChatsManager.tsx` (new) |
| react-ui-builder | Task 11 [PARALLEL with 12]: Register route in `App.tsx` with `<ProtectedRoute requiredPermission="canAccessTelegramChats">` | `src/App.tsx` |
| tdd-test-architect | Task 12 [PARALLEL with 11]: RTL tests for status badge derivation + role-reassignment dialog | `src/pages/__tests__/TelegramChatsManager.test.tsx` (new) |

### Wave 5: Verification [SEQUENTIAL]

| Agent | Task |
|-------|------|
| code-auditor | Task 13a: Type-check + pattern compliance review |
| Bash | Task 13b: `npm run type-check && npm run lint && npm run test && npm run build` |
| (manual) | Task 13c: Manual smoke per Migration & rollout — steps 1-5 (seed + verify cron + add new group + register + assign role) |

### Wave 6: Documentation + Merge [SEQUENTIAL]

| Agent | Task |
|-------|------|
| Bash + Edit | Task 14: Docs sweep — CHANGELOG, SCHEMA, FILE_MAP, telegram-bot-integration, self-register-porting (new), CLAUDE.md pitfall, OSS-starter draft, spec ref |
| Bash | Task 15: PR + squash-merge to main + post-merge sanity check (cron still fires after seed) |

## Documentation Updates

- [ ] `docs/CHANGELOG.md` — add entry per spec §"CHANGELOG draft"
- [ ] `docs/SCHEMA.md` — add `telegramChats` table
- [ ] `docs/FILE_MAP.md` — add `/admin/telegram-chats` route + permission
- [ ] `docs/telegram/telegram-bot-integration.md` — add Variant C section
- [ ] `docs/telegram/self-register-porting.md` — NEW, OSS porting checklist
- [ ] `docs/superpowers/plans/2026-05-27-convex-telegram-bot-starter-oss-draft.md` — note backport candidate
- [ ] `CLAUDE.md` — new Common Pitfall for "add to registry, not env var"
- [ ] `MEMORY.md` — log Phase 85 ship in Active Work + Milestones table

## Success Criteria

Mirrors spec §"Success criteria":
- [ ] `/admin/telegram-chats` exists, manager+admin gated, shows registered chats with status badges
- [ ] `/register@FrollieProBot` in a new group adds a Dormant row visible in admin UI
- [ ] Role dropdown assigns roles; reassignment AlertDialog appears when role already held; force-reassign atomically clears old + sets new
- [ ] Test-send button delivers the test message + on failure populates `lastError` shown as inline indented red row
- [ ] Archive/restore: `getChatIdByRole` skips archived rows; `restoreChat` clears `archivedAt`
- [ ] After `seedChatFromEnv({ role: "pack-list" })`, both crons (07:00 + 13:00 WIB) continue to fire
- [ ] `npm run type-check && npm run lint && npm run test && npm run build` all pass
- [ ] Vendor bundle stays under 600 kB cap (CLAUDE.md Pitfall #16)
- [ ] All 22 mandatory test cases from spec §"Testing strategy" present and passing
- [ ] Compound index `by_role_archived` used; no orphaned `by_role`/`by_archivedAt` indexes
- [ ] `assignRole` rejects unknown role strings AND missing chatIds with `ConvexError`
- [ ] `assignRole` rejects assigning a role to an archived chat (silent dead-end guard)
- [ ] `archiveChat`/`restoreChat`/`sendTestMessage` all enforce chatId existence

---

## Rollback strategy

The schema is **additive** (new `telegramChats` table, no column changes to existing tables) and never rolled back — orphan rows are harmless because nothing else reads the table. Existing pack-list crons are the only production-critical path. Failure modes and recovery, in increasing order of severity:

1. **Cron throws `No Telegram chat assigned` (most likely — `TELEGRAM_FALLBACK_ROLE` not set):** FAST FIX, no revert — `npx convex env set TELEGRAM_FALLBACK_ROLE pack-list --prod`. The next cron fires correctly. (Task 14.5 should have prevented this; this is the recovery if it slipped.)
2. **Task 9 (`sendPackList`) misbehaves but rest is fine:** `git revert <task-9-commit-sha>` then redeploy. `sendPackList` returns to the direct env-var read; registry, admin UI, and webhook stay live.
3. **Webhook routing regression (`/pack` stopped working after Task 8):** `git revert <task-8-commit-sha>`. The webhook returns to `/pack`-only dispatch. `/register` stops working but pack-list delivery is restored.
4. **Full phase revert:** revert the squash-merge commit on main, redeploy. `telegramChats` rows persist in the DB (harmless — no callers after revert). Re-set `TELEGRAM_CHAT_ID` if it was removed (it should NOT have been — see spec §"Step 8 hard preconditions").

CI (`npm run build` + `npm run test`) gates every merge; a green CI means the type-level + unit-level contracts hold. The residual risk is runtime Telegram-delivery behavior, which the Task 13c manual smoke + Task 15 Step 6 24h soak cover.

---

# Tasks

---

### Task 1: Schema — `telegramChats` table

**Files:**
- Modify: `convex/schema.ts` (insert table near existing `telegramUpdates` at line ~454)

- [ ] **Step 1: Add the table definition**

Open `convex/schema.ts` and add this block immediately after the `telegramUpdates` table definition (around line 455, before the `users` table comment):

```ts
  // Phase 85: registry of Telegram chats the bot can deliver to. One row per chat;
  // role assignment is gated in /admin/telegram-chats. See chatRegistry.ts.
  telegramChats: defineTable({
    chatId: v.string(),
    chatType: v.union(
      v.literal("private"),
      v.literal("group"),
      v.literal("supergroup"),
    ),
    title: v.string(),
    // Role is open string at schema level; validated against KNOWN_TELEGRAM_ROLES
    // in app code via isKnownTelegramRole (see convex/telegram/config.ts).
    role: v.optional(v.string()),
    registeredBy: v.optional(v.number()),
    registeredAt: v.number(),
    lastSeenAt: v.number(),
    archivedAt: v.optional(v.number()),
    lastError: v.optional(v.object({
      at: v.number(),
      message: v.string(), // truncated to 200 chars; trailing "…" if truncated
    })),
  })
    .index("by_chatId", ["chatId"])
    .index("by_role_archived", ["role", "archivedAt"]),
```

Why two indexes:
- `by_chatId` — every write needs an existence check by chatId (spec §"Backend validation invariants").
- `by_role_archived` — `getChatIdByRole` does `eq("role", role).eq("archivedAt", undefined)` as a point lookup. Per CLAUDE.md MEMORY lesson "Convex index range bounds: both bounds MUST be inside `.withIndex()` — `.filter()` is post-scan", a `by_role`-only index would force `archivedAt = undefined` into post-scan filter (anti-pattern).
- `listChats` does NOT use an index for "all active rows" — it does `.collect()` + JS filter on `archivedAt` (table is bounded <100 rows; CLAUDE.md MEMORY lesson "undefined sorts BEFORE numbers in indexes" makes range filters on optional fields unsafe).

- [ ] **Step 2: Verify schema parses**

Run:
```bash
npx convex codegen --typecheck=disable
```
Expected: no errors. (The fuller codegen runs in Task 3.5.)

- [ ] **Step 3: Commit**

```bash
git add convex/schema.ts
git commit -m "feat(85): add telegramChats table + indexes"
```

---

### Task 2: Config module

**Files:**
- Create: `convex/telegram/config.ts`

- [ ] **Step 1: Write the file**

```ts
/**
 * Phase 85 — single source of truth for app-level Telegram role allowlist
 * and admin-UI URL. Designed portable: when extracted to the OSS Convex
 * Telegram Bot Starter, only this file's contents change (roles become [],
 * URL reads from env). See docs/telegram/self-register-porting.md.
 */

export const KNOWN_TELEGRAM_ROLES = [
  "pack-list",
  "sales-updates",
] as const;

export type TelegramRole = (typeof KNOWN_TELEGRAM_ROLES)[number];

export function isKnownTelegramRole(s: string): s is TelegramRole {
  return (KNOWN_TELEGRAM_ROLES as readonly string[]).includes(s);
}

/**
 * URL the bot includes in `/register` reply — points to the admin UI page.
 * Frollie hardcodes the prod URL; OSS-starter consumers read from env.
 */
export const TELEGRAM_ADMIN_URL = "https://recipe.frollie.com/admin/telegram-chats";
```

- [ ] **Step 2: Commit**

```bash
git add convex/telegram/config.ts
git commit -m "feat(85): add telegram role config module"
```

---

### Task 3: Permission field — `canAccessTelegramChats`

**Files:**
- Modify: `src/lib/types.ts:710-825`

- [ ] **Step 1: Add the field to the `ROLE_PERMISSIONS` type signature**

Open `src/lib/types.ts:710-732`. Within the type signature object (lines 711-731), add immediately after `canAccessAssets: boolean;`:

```ts
  canAccessTelegramChats: boolean;  // Phase 85: Telegram chats registry (manager + admin)
```

- [ ] **Step 2: Add the field to all FOUR role rows**

In each role block (`kitchen`, `order_staff`, `manager`, `admin`), immediately after `canAccessAssets: <value>,`, add:

- `kitchen`: `canAccessTelegramChats: false,`
- `order_staff`: `canAccessTelegramChats: false,`
- `manager`: `canAccessTelegramChats: true,`
- `admin`: `canAccessTelegramChats: true,`

Per spec §"Gating" and CLAUDE.md Pitfall #19: keep the route's permission set symmetric with backend roles (every backend `requireRole(ctx, token, ["manager", "admin"])` in Phase 85 matches this permission).

- [ ] **Step 3: Verify TS still compiles**

Run:
```bash
npm run type-check
```
Expected: no errors. (If errors, you forgot a role row — `Record<UserRole, {...}>` requires all 4.)

- [ ] **Step 4: Commit**

```bash
git add src/lib/types.ts
git commit -m "feat(85): add canAccessTelegramChats permission (manager+admin)"
```

---

### Task 3.5: Codegen gate

**Files:**
- Modify (auto): `convex/_generated/api.d.ts`, `convex/_generated/dataModel.d.ts`

- [ ] **Step 1: Regenerate Convex types**

Run:
```bash
npx convex codegen --typecheck=disable
```
Expected: completes, no errors. `_generated/api.d.ts` should now include nothing new yet (chatRegistry.ts comes in Wave 2) but `dataModel.d.ts` reflects the schema.

**Why `--typecheck=disable`:** there is no `codegen` script in `package.json` and no guaranteed running `npx convex dev` deployment in a subagent context. The bare `npx convex codegen` attempts a typecheck pass that can fail or hang without a live deployment; `--typecheck=disable` regenerates types offline (the dedicated `npm run type-check` step in each task covers type safety separately). Use this flag for EVERY codegen invocation in this plan.

Per CLAUDE.md Pitfall #18 and Phase 76/81 lesson: ANY plan that adds a Convex file or schema MUST regenerate codegen explicitly — `npm run build` doesn't run codegen, so stale `api.d.ts` ships silently.

- [ ] **Step 2: Commit ONLY if `_generated` actually changed**

```bash
git status convex/_generated/
git add convex/_generated/
git commit -m "chore(85): regen convex types after schema change" --allow-empty-message
```
If `git status` shows no changes (the schema may not have surfaced anything yet — config.ts has no Convex bindings), skip the commit.

---

### Task 4: `parseCommand` + `getChatIdByRole`

**Files:**
- Create: `convex/telegram/chatRegistry.ts`
- Create: `convex/telegram/__tests__/chatRegistry.test.ts`

- [ ] **Step 1: Write the failing parseCommand test first**

Create `convex/telegram/__tests__/chatRegistry.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { parseCommand } from "../chatRegistry";

describe("parseCommand — good inputs (spec case #1)", () => {
  it.each([
    ["/pack", "pack"],
    ["/pack@FrolliePackBot", "pack"],
    ["/register", "register"],
    ["/register@FrolliePackBot", "register"],
    ["/start", "start"],
    ["/start@FrolliePackBot", "start"],
    ["  /pack  ", "pack"], // whitespace trim
  ])("parses %s as %s", (input, expected) => {
    expect(parseCommand(input)).toBe(expected);
  });
});

describe("parseCommand — bad inputs (spec case #2)", () => {
  it.each([
    ["/pack now please"],   // trailing args
    ["/PACK"],              // case
    ["/packlist"],          // not exact
    ["pack"],               // missing slash
    [""],                   // empty
    ["   "],                // whitespace only
    ["/Foo"],               // unknown command
    ["/pack@"],             // empty bot suffix
    ["/pack @Bot"],         // space before @
  ])("rejects %s", (input) => {
    expect(parseCommand(input)).toBeNull();
  });
});
```

- [ ] **Step 2: Run the test, confirm failure**

```bash
npm run test -- convex/telegram/__tests__/chatRegistry.test.ts
```
Expected: FAIL — module not found.

- [ ] **Step 3: Create chatRegistry.ts with parseCommand only**

```ts
/**
 * Phase 85 — Telegram chat registry mechanics.
 *
 * Houses ALL primitives the registry needs: command parsing, role-to-chatId
 * lookup with env fallback, registerChat / replyStartHelp / touchChatLastSeen
 * webhook handlers, listChats / assignRole / archive / restore / sendTestMessage
 * admin-UI surface, seedChatFromEnv one-shot bootstrap.
 *
 * The OSS Convex Telegram Bot Starter ships this file verbatim — the only
 * Frollie-specific surface is convex/telegram/config.ts (role allowlist + URL).
 *
 * See docs/superpowers/specs/2026-05-27-telegram-self-register-design.md.
 */

import { v, ConvexError } from "convex/values";
import {
  internalQuery,
  internalMutation,
  internalAction,
  query,
  mutation,
  action,
} from "../_generated/server";
import { internal } from "../_generated/api";
import { requireRole } from "../lib/auth";
import { sendTelegramHtml, escapeHtml } from "../lib/telegramHtml";
import {
  KNOWN_TELEGRAM_ROLES,
  isKnownTelegramRole,
  TELEGRAM_ADMIN_URL,
} from "./config";
import type { Doc } from "../_generated/dataModel";

// ─── parseCommand ────────────────────────────────────────────────────────────

export type TelegramCommand = "pack" | "register" | "start";

/**
 * Strict-mode command parse. Accepts /pack /register /start with optional
 * @BotName suffix and surrounding whitespace. Rejects trailing args (typo
 * protection inherited from the original /pack strict-match policy).
 */
export function parseCommand(text: string): TelegramCommand | null {
  const m = /^\/(pack|register|start)(@[A-Za-z0-9_]+)?$/.exec(text.trim());
  return m ? (m[1] as TelegramCommand) : null;
}
```

- [ ] **Step 4: Run parseCommand tests, confirm PASS**

```bash
npm run test -- convex/telegram/__tests__/chatRegistry.test.ts
```
Expected: PASS (all `parseCommand` cases green).

- [ ] **Step 5: Write the failing getChatIdByRole tests**

Append to the test file:

```ts
import { convexTest } from "convex-test";
import schema from "../../schema";
import { api, internal } from "../../_generated/api";

describe("getChatIdByRole (spec case #3)", () => {
  it("returns the active row's chatId when matching role exists", async () => {
    const t = convexTest(schema);
    await t.run(async (ctx) => {
      await ctx.db.insert("telegramChats", {
        chatId: "-100111",
        chatType: "supergroup",
        title: "Ops",
        role: "pack-list",
        registeredAt: 0,
        lastSeenAt: 0,
      });
    });
    const id = await t.query(internal.telegram.chatRegistry.getChatIdByRole, {
      role: "pack-list",
    });
    expect(id).toBe("-100111");
  });

  it("ignores archived rows even if role matches", async () => {
    const t = convexTest(schema);
    await t.run(async (ctx) => {
      await ctx.db.insert("telegramChats", {
        chatId: "-100222",
        chatType: "group",
        title: "Old Ops",
        role: "pack-list",
        archivedAt: 999,
        registeredAt: 0,
        lastSeenAt: 0,
      });
    });
    // No active row + no env fallback configured → throws.
    await expect(
      t.query(internal.telegram.chatRegistry.getChatIdByRole, { role: "pack-list" }),
    ).rejects.toThrow(/No Telegram chat assigned/);
  });

  it("falls back to TELEGRAM_CHAT_ID env when TELEGRAM_FALLBACK_ROLE matches", async () => {
    const t = convexTest(schema);
    const prev = { fb: process.env.TELEGRAM_FALLBACK_ROLE, cid: process.env.TELEGRAM_CHAT_ID };
    process.env.TELEGRAM_FALLBACK_ROLE = "pack-list";
    process.env.TELEGRAM_CHAT_ID = "-100ENV";
    try {
      const id = await t.query(internal.telegram.chatRegistry.getChatIdByRole, {
        role: "pack-list",
      });
      expect(id).toBe("-100ENV");
    } finally {
      process.env.TELEGRAM_FALLBACK_ROLE = prev.fb;
      process.env.TELEGRAM_CHAT_ID = prev.cid;
    }
  });

  it("throws when neither table row nor env fallback configured", async () => {
    const t = convexTest(schema);
    const prev = process.env.TELEGRAM_FALLBACK_ROLE;
    delete process.env.TELEGRAM_FALLBACK_ROLE;
    try {
      await expect(
        t.query(internal.telegram.chatRegistry.getChatIdByRole, { role: "pack-list" }),
      ).rejects.toThrow(/No Telegram chat assigned/);
    } finally {
      process.env.TELEGRAM_FALLBACK_ROLE = prev;
    }
  });
});
```

- [ ] **Step 6: Run, confirm FAIL** (`getChatIdByRole` not exported yet)

```bash
npm run test -- convex/telegram/__tests__/chatRegistry.test.ts
```
Expected: FAIL on the 4 new cases.

- [ ] **Step 7: Implement `getChatIdByRole`**

Append to `convex/telegram/chatRegistry.ts`:

```ts
// ─── getChatIdByRole ─────────────────────────────────────────────────────────

/**
 * Three-step lookup chain (spec §"getChatIdByRole lookup helper"):
 *   1. Active table row (role match, archivedAt undefined)
 *   2. Env fallback IF TELEGRAM_FALLBACK_ROLE === role AND TELEGRAM_CHAT_ID set
 *   3. Throw
 */
export const getChatIdByRole = internalQuery({
  args: { role: v.string() },
  handler: async (ctx, args): Promise<string> => {
    const row = await ctx.db
      .query("telegramChats")
      .withIndex("by_role_archived", (q) =>
        q.eq("role", args.role).eq("archivedAt", undefined),
      )
      .first();
    if (row) return row.chatId;

    if (
      process.env.TELEGRAM_FALLBACK_ROLE === args.role &&
      process.env.TELEGRAM_CHAT_ID
    ) {
      return process.env.TELEGRAM_CHAT_ID;
    }

    throw new Error(`No Telegram chat assigned to role '${args.role}'`);
  },
});
```

- [ ] **Step 8: Run tests, confirm all PASS**

```bash
npm run test -- convex/telegram/__tests__/chatRegistry.test.ts
```
Expected: all 4 `getChatIdByRole` cases + 16 `parseCommand` cases PASS.

- [ ] **Step 9: Regenerate codegen + commit**

`getChatIdByRole` is a new `internalQuery` — it changes `_generated/api.d.ts`, so regen before committing (consistency with Tasks 5/6/7; CLAUDE.md Pitfall #18).

```bash
npx convex codegen --typecheck=disable
git add convex/telegram/chatRegistry.ts convex/telegram/__tests__/chatRegistry.test.ts convex/_generated/
git commit -m "feat(85): chatRegistry — parseCommand + getChatIdByRole"
```

---

### Task 5: `touchChatLastSeen` + `registerChat` + `replyStartHelp`

**Files:**
- Modify: `convex/telegram/chatRegistry.ts`
- Modify: `convex/telegram/__tests__/chatRegistry.test.ts`
- Create: `convex/telegram/__tests__/registerChatReply.test.ts` (HTML escape + 3-state confirmation message)

- [ ] **Step 1: Write the failing `touchChatLastSeen` tests** (spec cases #13, #14)

Append to `chatRegistry.test.ts`:

```ts
describe("touchChatLastSeen (spec cases #13, #14)", () => {
  it("no-ops for unregistered chat (pollution prevention)", async () => {
    const t = convexTest(schema);
    await t.mutation(internal.telegram.chatRegistry.touchChatLastSeen, {
      chatId: "-100999",
    });
    const rows = await t.run(async (ctx) =>
      ctx.db.query("telegramChats").collect(),
    );
    expect(rows).toHaveLength(0);
  });

  it("no-ops for archived chat", async () => {
    const t = convexTest(schema);
    let id: string;
    await t.run(async (ctx) => {
      id = await ctx.db.insert("telegramChats", {
        chatId: "-100333",
        chatType: "group",
        title: "Archived",
        archivedAt: 100,
        registeredAt: 0,
        lastSeenAt: 50,
      });
    });
    await t.mutation(internal.telegram.chatRegistry.touchChatLastSeen, {
      chatId: "-100333",
    });
    const row = await t.run(async (ctx) =>
      ctx.db
        .query("telegramChats")
        .withIndex("by_chatId", (q) => q.eq("chatId", "-100333"))
        .unique(),
    );
    expect(row?.lastSeenAt).toBe(50);  // unchanged
  });

  it("patches lastSeenAt for active registered chat", async () => {
    const t = convexTest(schema);
    await t.run(async (ctx) => {
      await ctx.db.insert("telegramChats", {
        chatId: "-100444",
        chatType: "supergroup",
        title: "Live",
        registeredAt: 0,
        lastSeenAt: 50,
      });
    });
    await t.mutation(internal.telegram.chatRegistry.touchChatLastSeen, {
      chatId: "-100444",
    });
    const row = await t.run(async (ctx) =>
      ctx.db
        .query("telegramChats")
        .withIndex("by_chatId", (q) => q.eq("chatId", "-100444"))
        .unique(),
    );
    expect(row?.lastSeenAt).toBeGreaterThan(50);
  });
});
```

- [ ] **Step 2: Run, confirm FAIL**

- [ ] **Step 3: Implement `touchChatLastSeen`**

Append to `chatRegistry.ts`:

```ts
// ─── touchChatLastSeen ───────────────────────────────────────────────────────

/**
 * UPDATE-only "last seen" stamp. Webhook calls this for every non-command
 * message. Pollution prevention: no insert on unknown chatId (only registered
 * chats should appear in the table; an unknown chatId from a privacy-mode
 * mention is not registration intent).
 */
export const touchChatLastSeen = internalMutation({
  args: { chatId: v.string() },
  handler: async (ctx, args) => {
    const row = await ctx.db
      .query("telegramChats")
      .withIndex("by_chatId", (q) => q.eq("chatId", args.chatId))
      .unique();
    if (!row) return;                  // never seen this chat — ignore
    if (row.archivedAt !== undefined) return; // archived rows are inert
    await ctx.db.patch(row._id, { lastSeenAt: Date.now() });
  },
});
```

- [ ] **Step 4: Run, confirm PASS**

- [ ] **Step 5: Write the failing `registerChat` tests** (spec cases #19, #20)

Create `convex/telegram/__tests__/registerChatReply.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { convexTest } from "convex-test";
import schema from "../../schema";
import { internal } from "../../_generated/api";

// Capture the sendTelegramHtml HTTP call by stubbing global.fetch.
let captured: Array<{ url: string; body: string }>;

beforeEach(() => {
  captured = [];
  process.env.TELEGRAM_BOT_TOKEN = "test-token";
  global.fetch = vi.fn(async (input: RequestInfo, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input.toString();
    const body = init?.body as string;
    captured.push({ url, body });
    return new Response(JSON.stringify({ ok: true, result: { message_id: 1 } }), {
      status: 200,
    });
  }) as unknown as typeof fetch;
});

afterEach(() => {
  vi.restoreAllMocks();
  delete process.env.TELEGRAM_BOT_TOKEN;
});

describe("registerChat confirmation messages (spec cases #19, #20)", () => {
  it("HTML-escapes <>& in chat title (XSS prevention)", async () => {
    const t = convexTest(schema);
    await t.action(internal.telegram.chatRegistry.registerChat, {
      chatId: "-100555",
      chatType: "group",
      title: "Frollie & <Friends>",
      registeredBy: 42,
    });
    expect(captured).toHaveLength(1);
    const body = JSON.parse(captured[0].body);
    expect(body.text).toContain("Frollie &amp; &lt;Friends&gt;");
    expect(body.text).not.toContain("<Friends>");
  });

  it("new row → 'Chat registered as ... Assign a role at <URL>' confirmation", async () => {
    const t = convexTest(schema);
    await t.action(internal.telegram.chatRegistry.registerChat, {
      chatId: "-100666", chatType: "supergroup", title: "New", registeredBy: 42,
    });
    expect(JSON.parse(captured[0].body).text).toMatch(/registered as.*New.*Assign a role at/);
  });

  it("existing dormant row → 'Already registered (no role assigned yet)' confirmation", async () => {
    const t = convexTest(schema);
    await t.run(async (ctx) => {
      await ctx.db.insert("telegramChats", {
        chatId: "-100777", chatType: "group", title: "Dormant",
        registeredAt: 0, lastSeenAt: 0,
      });
    });
    await t.action(internal.telegram.chatRegistry.registerChat, {
      chatId: "-100777", chatType: "group", title: "Dormant", registeredBy: 42,
    });
    expect(JSON.parse(captured[0].body).text).toMatch(/Already registered.*no role assigned/);
  });

  it("existing live row → 'Already registered as role <role>' confirmation", async () => {
    const t = convexTest(schema);
    await t.run(async (ctx) => {
      await ctx.db.insert("telegramChats", {
        chatId: "-100888", chatType: "group", title: "Live", role: "sales-updates",
        registeredAt: 0, lastSeenAt: 0,
      });
    });
    await t.action(internal.telegram.chatRegistry.registerChat, {
      chatId: "-100888", chatType: "group", title: "Live", registeredBy: 42,
    });
    expect(JSON.parse(captured[0].body).text).toMatch(/Already registered as role.*sales-updates/);
  });
});
```

- [ ] **Step 6: Run, confirm FAIL**

- [ ] **Step 7: Implement `registerChat` + `replyStartHelp`**

Append to `chatRegistry.ts`:

```ts
// ─── registerChat ────────────────────────────────────────────────────────────

/**
 * Three-state behavior driven by existing row (spec §"registerChat action"):
 *   none           → insert + "Chat registered as <title> ..."
 *   dormant        → patch lastSeenAt + "Already registered (no role)"
 *   live           → patch lastSeenAt + "Already registered as role <role>"
 * All three responses HTML-escape the title (parse_mode HTML XSS prevention).
 */
export const registerChat = internalAction({
  args: {
    chatId: v.string(),
    chatType: v.union(
      v.literal("private"),
      v.literal("group"),
      v.literal("supergroup"),
    ),
    title: v.string(),
    registeredBy: v.optional(v.number()),
  },
  handler: async (ctx, args): Promise<void> => {
    const token = process.env.TELEGRAM_BOT_TOKEN;
    if (!token) throw new Error("TELEGRAM_BOT_TOKEN missing");

    const result = await ctx.runMutation(
      internal.telegram.chatRegistry.upsertChatRow,
      args,
    );

    const safeTitle = escapeHtml(args.title);
    let html: string;
    if (result.status === "inserted") {
      html = `✅ Chat registered as <b>${safeTitle}</b> (${args.chatType}). Assign a role at ${TELEGRAM_ADMIN_URL}`;
    } else if (result.status === "dormant") {
      html = `ℹ️ Already registered (no role assigned yet). Assign at ${TELEGRAM_ADMIN_URL}`;
    } else {
      const safeRole = escapeHtml(result.role!);
      html = `ℹ️ Already registered as role <b>${safeRole}</b>. Change at ${TELEGRAM_ADMIN_URL}`;
    }

    await sendTelegramHtml(token, args.chatId, html);
  },
});

/**
 * @internal Implementation detail of `registerChat` — do not call externally.
 * The actual DB write for registerChat. Internal mutation so the action's
 * three-state branch is driven by a single atomic read+write.
 */
export const upsertChatRow = internalMutation({
  args: {
    chatId: v.string(),
    chatType: v.union(
      v.literal("private"),
      v.literal("group"),
      v.literal("supergroup"),
    ),
    title: v.string(),
    registeredBy: v.optional(v.number()),
  },
  handler: async (ctx, args): Promise<
    { status: "inserted" } | { status: "dormant" } | { status: "live"; role: string }
  > => {
    const existing = await ctx.db
      .query("telegramChats")
      .withIndex("by_chatId", (q) => q.eq("chatId", args.chatId))
      .unique();
    const now = Date.now();
    if (!existing) {
      await ctx.db.insert("telegramChats", {
        chatId: args.chatId,
        chatType: args.chatType,
        title: args.title,
        registeredBy: args.registeredBy,
        registeredAt: now,
        lastSeenAt: now,
      });
      return { status: "inserted" };
    }
    // Patch lastSeenAt regardless of role state.
    await ctx.db.patch(existing._id, { lastSeenAt: now });
    if (existing.role) {
      return { status: "live", role: existing.role };
    }
    return { status: "dormant" };
  },
});

// ─── replyStartHelp ──────────────────────────────────────────────────────────

/**
 * Reply to /start with a one-line intro pointing at /register. /start is
 * Telegram's default intro action; all OTHER unknown commands get a silent
 * 200-ack (no noise; no false discovery of unimplemented commands).
 */
export const replyStartHelp = internalAction({
  args: { chatId: v.string() },
  handler: async (ctx, args): Promise<void> => {
    const token = process.env.TELEGRAM_BOT_TOKEN;
    if (!token) throw new Error("TELEGRAM_BOT_TOKEN missing");
    await sendTelegramHtml(
      token,
      args.chatId,
      `Hi! I'm FrollieProBot. Send /register@FrollieProBot to register this chat.`,
    );
  },
});
```

- [ ] **Step 8: Run all chatRegistry tests, confirm PASS**

```bash
npm run test -- convex/telegram/__tests__/
```
Expected: all chatRegistry + registerChatReply tests PASS.

- [ ] **Step 9: Regenerate codegen + commit**

```bash
npx convex codegen --typecheck=disable
git add convex/telegram/chatRegistry.ts convex/telegram/__tests__/ convex/_generated/
git commit -m "feat(85): chatRegistry — touchChatLastSeen + registerChat + replyStartHelp"
```

---

### Task 6: `listChats` + `assignRole` + `archiveChat` + `restoreChat`

**Files:**
- Create: `convex/telegram/__tests__/testHelpers.ts`
- Modify: `convex/telegram/chatRegistry.ts`
- Modify: `convex/telegram/__tests__/chatRegistry.test.ts`

- [ ] **Step 0: Create the shared `seedAdminSession` test helper**

This is the FIRST task that needs an authenticated session. Create a shared helper that matches the REAL `users` + `sessions` schema (`convex/schema.ts:460-496`). The `users` table field is `pinHash` (NOT `pin`), and `failedAttempts` + `createdAt` are required — fabricating `{ pin, isActive }` and relying on `as any` will fail `convexTest` runtime validation. This mirrors the established pattern in `convex/consignment/__tests__/getSettlementItems.test.ts:36-50` and ~10 other test files.

Create `convex/telegram/__tests__/testHelpers.ts`:

```ts
import type { TestConvex } from "convex-test";
import type schema from "../../schema";

/**
 * Insert an admin user + session and return the session token. The token is
 * accepted by every Phase 85 protected function via requireRole(ctx, token,
 * ["manager", "admin"]). pinHash is a fake "salt:hash" — the auth path is
 * bypassed because we pass the token directly, never the PIN.
 */
export async function seedAdminSession(
  t: TestConvex<typeof schema>,
  token = "tok-admin",
  role: "manager" | "admin" = "admin",
): Promise<string> {
  await t.run(async (ctx) => {
    const userId = await ctx.db.insert("users", {
      name: `Test ${role}`,
      pinHash: "salt:hash",
      role,
      isActive: true,
      failedAttempts: 0,
      createdAt: Date.now(),
    });
    await ctx.db.insert("sessions", {
      userId,
      token,
      expiresAt: Date.now() + 8 * 3600 * 1000,
      createdAt: Date.now(),
    });
  });
  return token;
}
```

If `npm run type-check` flags the `users` insert shape, open `convex/schema.ts:460` and match the current required fields exactly — do NOT add `as any`.

- [ ] **Step 1: Write failing tests** (spec cases #4, #5, #6, #7, #11, #12)

Add this import near the top of `chatRegistry.test.ts` (alongside the existing `convex-test` / `api` imports from Task 4):

```ts
import { seedAdminSession } from "./testHelpers";
```

Then append the test blocks below. NOTE: do NOT redefine `seedAdminSession` inline — use the shared helper. `listChats` is a PUBLIC `query` taking a `token` arg (not internal, not `withIdentity`).

```ts

```ts
describe("listChats", () => {
  it("returns active rows only when includeArchived false", async () => {
    const t = convexTest(schema);
    const token = await seedAdminSession(t);
    await t.run(async (ctx) => {
      await ctx.db.insert("telegramChats", {
        chatId: "A", chatType: "group", title: "Active", registeredAt: 0, lastSeenAt: 0,
      });
      await ctx.db.insert("telegramChats", {
        chatId: "B", chatType: "group", title: "Archived", archivedAt: 1,
        registeredAt: 0, lastSeenAt: 0,
      });
    });
    const active = await t.query(api.telegram.chatRegistry.listChats, {
      token, includeArchived: false,
    });
    expect(active.map((r) => r.chatId)).toEqual(["A"]);
    const all = await t.query(api.telegram.chatRegistry.listChats, {
      token, includeArchived: true,
    });
    expect(all.map((r) => r.chatId).sort()).toEqual(["A", "B"]);
  });

  it("rejects a non-manager/admin token", async () => {
    const t = convexTest(schema);
    // Seed a session for a kitchen user (not in the manager+admin set).
    const token = await t.run(async (ctx) => {
      const userId = await ctx.db.insert("users", {
        name: "Kitchen", pinHash: "salt:hash", role: "kitchen",
        isActive: true, failedAttempts: 0, createdAt: Date.now(),
      });
      await ctx.db.insert("sessions", {
        userId, token: "tok-kitchen", expiresAt: Date.now() + 1e9, createdAt: Date.now(),
      });
      return "tok-kitchen";
    });
    await expect(
      t.query(api.telegram.chatRegistry.listChats, { token, includeArchived: false }),
    ).rejects.toThrow();
  });
});

describe("assignRole (spec cases #4, #5, #6, #7)", () => {
  it("rejects unknown role string (case #5 — validation gap)", async () => {
    const t = convexTest(schema);
    const token = await seedAdminSession(t);
    await t.run(async (ctx) => {
      await ctx.db.insert("telegramChats", {
        chatId: "X", chatType: "group", title: "X", registeredAt: 0, lastSeenAt: 0,
      });
    });
    await expect(
      t.mutation(api.telegram.chatRegistry.assignRole, {
        token, chatId: "X", role: "not-a-real-role",
      } as any),
    ).rejects.toThrow(/Unknown telegram role/);
  });

  it("rejects missing chatId (case #6 — existence guard)", async () => {
    const t = convexTest(schema);
    const token = await seedAdminSession(t);
    await expect(
      t.mutation(api.telegram.chatRegistry.assignRole, {
        token, chatId: "GHOST", role: "pack-list",
      } as any),
    ).rejects.toThrow(/No registered Telegram chat/);
  });

  it("clears role when role=null without forceReassign (case #7)", async () => {
    const t = convexTest(schema);
    const token = await seedAdminSession(t);
    await t.run(async (ctx) => {
      await ctx.db.insert("telegramChats", {
        chatId: "C", chatType: "group", title: "C",
        role: "pack-list", registeredAt: 0, lastSeenAt: 0,
      });
    });
    await t.mutation(api.telegram.chatRegistry.assignRole, {
      token, chatId: "C", role: null,
    } as any);
    const row = await t.run(async (ctx) =>
      ctx.db.query("telegramChats").withIndex("by_chatId", (q) => q.eq("chatId", "C")).unique());
    expect(row?.role).toBeUndefined();
  });

  it("reassigns atomically when forceReassign=true (case #4 — atomicity)", async () => {
    const t = convexTest(schema);
    const token = await seedAdminSession(t);
    await t.run(async (ctx) => {
      await ctx.db.insert("telegramChats", {
        chatId: "OLD", chatType: "group", title: "Old",
        role: "pack-list", registeredAt: 0, lastSeenAt: 0,
      });
      await ctx.db.insert("telegramChats", {
        chatId: "NEW", chatType: "group", title: "New",
        registeredAt: 0, lastSeenAt: 0,
      });
    });
    await t.mutation(api.telegram.chatRegistry.assignRole, {
      token, chatId: "NEW", role: "pack-list", forceReassign: true,
    } as any);
    const [oldRow, newRow] = await t.run(async (ctx) => [
      await ctx.db.query("telegramChats").withIndex("by_chatId", (q) => q.eq("chatId", "OLD")).unique(),
      await ctx.db.query("telegramChats").withIndex("by_chatId", (q) => q.eq("chatId", "NEW")).unique(),
    ]);
    expect(oldRow?.role).toBeUndefined();
    expect(newRow?.role).toBe("pack-list");
  });

  it("rejects assignment when role already held without forceReassign", async () => {
    const t = convexTest(schema);
    const token = await seedAdminSession(t);
    await t.run(async (ctx) => {
      await ctx.db.insert("telegramChats", {
        chatId: "HOLDER", chatType: "group", title: "Holder",
        role: "pack-list", registeredAt: 0, lastSeenAt: 0,
      });
      await ctx.db.insert("telegramChats", {
        chatId: "OTHER", chatType: "group", title: "Other",
        registeredAt: 0, lastSeenAt: 0,
      });
    });
    await expect(
      t.mutation(api.telegram.chatRegistry.assignRole, {
        token, chatId: "OTHER", role: "pack-list",
      } as any),
    ).rejects.toThrow(/already held/);
  });

  it("rejects assigning a role to an ARCHIVED chat (edge case — silent dead-end guard)", async () => {
    const t = convexTest(schema);
    const token = await seedAdminSession(t);
    await t.run(async (ctx) => {
      await ctx.db.insert("telegramChats", {
        chatId: "ARCH", chatType: "group", title: "Archived",
        archivedAt: 100, registeredAt: 0, lastSeenAt: 0,
      });
    });
    await expect(
      t.mutation(api.telegram.chatRegistry.assignRole, {
        token, chatId: "ARCH", role: "pack-list",
      } as any),
    ).rejects.toThrow(/archived chat/);
  });
});

describe("archiveChat / restoreChat (spec cases #11, #12)", () => {
  it("archives sets archivedAt AND clears role in one atomic patch (case #11)", async () => {
    const t = convexTest(schema);
    const token = await seedAdminSession(t);
    await t.run(async (ctx) => {
      await ctx.db.insert("telegramChats", {
        chatId: "A1", chatType: "group", title: "A1",
        role: "pack-list", registeredAt: 0, lastSeenAt: 0,
      });
    });
    await t.mutation(api.telegram.chatRegistry.archiveChat, {
      token, chatId: "A1",
    } as any);
    const row = await t.run(async (ctx) =>
      ctx.db.query("telegramChats").withIndex("by_chatId", (q) => q.eq("chatId", "A1")).unique());
    expect(row?.archivedAt).toBeGreaterThan(0);
    expect(row?.role).toBeUndefined();
  });

  it("archiveChat rejects missing chatId (case #12)", async () => {
    const t = convexTest(schema);
    const token = await seedAdminSession(t);
    await expect(
      t.mutation(api.telegram.chatRegistry.archiveChat, {
        token, chatId: "GHOST",
      } as any),
    ).rejects.toThrow(/No registered Telegram chat/);
  });

  it("restoreChat clears archivedAt", async () => {
    const t = convexTest(schema);
    const token = await seedAdminSession(t);
    await t.run(async (ctx) => {
      await ctx.db.insert("telegramChats", {
        chatId: "R1", chatType: "group", title: "R1",
        archivedAt: 100, registeredAt: 0, lastSeenAt: 0,
      });
    });
    await t.mutation(api.telegram.chatRegistry.restoreChat, {
      token, chatId: "R1",
    } as any);
    const row = await t.run(async (ctx) =>
      ctx.db.query("telegramChats").withIndex("by_chatId", (q) => q.eq("chatId", "R1")).unique());
    expect(row?.archivedAt).toBeUndefined();
  });

  it("restoreChat rejects missing chatId (case #12)", async () => {
    const t = convexTest(schema);
    const token = await seedAdminSession(t);
    await expect(
      t.mutation(api.telegram.chatRegistry.restoreChat, {
        token, chatId: "GHOST",
      } as any),
    ).rejects.toThrow(/No registered Telegram chat/);
  });
});
```

- [ ] **Step 2: Run tests, confirm FAIL**

- [ ] **Step 3: Implement `listChats` + `assignRole` + `archiveChat` + `restoreChat`**

Append to `chatRegistry.ts`:

```ts
// ─── listChats ───────────────────────────────────────────────────────────────

/**
 * Public-protected query for the admin UI. Returns all rows (filtered client
 * side by includeArchived flag); table is bounded <100 rows so .collect() is
 * cheap. Index lookup on archivedAt alone is unsafe (undefined sorts BEFORE
 * defined values — CLAUDE.md MEMORY).
 */
export const listChats = query({
  args: { token: v.string(), includeArchived: v.boolean() },
  handler: async (ctx, args): Promise<Doc<"telegramChats">[]> => {
    await requireRole(ctx, args.token, ["manager", "admin"]);
    const all = await ctx.db.query("telegramChats").collect();
    if (args.includeArchived) return all;
    return all.filter((r) => r.archivedAt === undefined);
  },
});

// ─── assignRole ──────────────────────────────────────────────────────────────

/**
 * Set, clear, or reassign a chat's role. Two backend guards (spec
 * §"Backend validation invariants"):
 *   1. chatId existence — throws if no row.
 *   2. role allowlist — throws if role not in KNOWN_TELEGRAM_ROLES.
 *
 * Reassignment atomicity: if `forceReassign === true` AND another chat already
 * holds the requested role, BOTH writes happen in this single mutation (Convex
 * serializes on the read set, so no observer sees neither-holder or both-holder).
 */
export const assignRole = mutation({
  args: {
    token: v.string(),
    chatId: v.string(),
    role: v.union(v.string(), v.null()),
    forceReassign: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    await requireRole(ctx, args.token, ["manager", "admin"]);

    // Guard 2: role allowlist (only when assigning, not clearing)
    if (args.role !== null) {
      if (!isKnownTelegramRole(args.role)) {
        throw new ConvexError(
          `Unknown telegram role: '${args.role}'. Must be one of: ${KNOWN_TELEGRAM_ROLES.join(", ")}`,
        );
      }
    }

    // Guard 1: target chat exists
    const target = await ctx.db
      .query("telegramChats")
      .withIndex("by_chatId", (q) => q.eq("chatId", args.chatId))
      .unique();
    if (!target) {
      throw new ConvexError(`No registered Telegram chat with id '${args.chatId}'`);
    }

    // Clearing path — allowed even on archived rows (idempotent no-op cleanup).
    if (args.role === null) {
      await ctx.db.patch(target._id, { role: undefined });
      return;
    }

    // Guard 3 (edge case): never ASSIGN a role to an archived chat. getChatIdByRole
    // skips archived rows, so the role would be "assigned" but never resolve —
    // a silent dead-end. Force the admin to restore first.
    if (target.archivedAt !== undefined) {
      throw new ConvexError(
        `Cannot assign a role to an archived chat ('${args.chatId}'). Restore it first.`,
      );
    }

    // Find current holder (if any) of this role (active rows only)
    const currentHolder = await ctx.db
      .query("telegramChats")
      .withIndex("by_role_archived", (q) =>
        q.eq("role", args.role!).eq("archivedAt", undefined),
      )
      .first();

    if (currentHolder && currentHolder._id !== target._id) {
      if (!args.forceReassign) {
        throw new ConvexError(
          `Role '${args.role}' already held by chat '${currentHolder.chatId}'. Pass forceReassign: true to override.`,
        );
      }
      // Atomic reassignment in one mutation
      await ctx.db.patch(currentHolder._id, { role: undefined });
    }
    await ctx.db.patch(target._id, { role: args.role });
  },
});

// ─── archiveChat ─────────────────────────────────────────────────────────────

/**
 * Soft delete: set archivedAt AND clear role atomically. Clearing role
 * prevents archived rows from holding role uniqueness slots, so a new chat
 * can claim the role immediately after archive.
 */
export const archiveChat = mutation({
  args: { token: v.string(), chatId: v.string() },
  handler: async (ctx, args) => {
    await requireRole(ctx, args.token, ["manager", "admin"]);
    const row = await ctx.db
      .query("telegramChats")
      .withIndex("by_chatId", (q) => q.eq("chatId", args.chatId))
      .unique();
    if (!row) {
      throw new ConvexError(`No registered Telegram chat with id '${args.chatId}'`);
    }
    await ctx.db.patch(row._id, { archivedAt: Date.now(), role: undefined });
  },
});

// ─── restoreChat ─────────────────────────────────────────────────────────────

export const restoreChat = mutation({
  args: { token: v.string(), chatId: v.string() },
  handler: async (ctx, args) => {
    await requireRole(ctx, args.token, ["manager", "admin"]);
    const row = await ctx.db
      .query("telegramChats")
      .withIndex("by_chatId", (q) => q.eq("chatId", args.chatId))
      .unique();
    if (!row) {
      throw new ConvexError(`No registered Telegram chat with id '${args.chatId}'`);
    }
    await ctx.db.patch(row._id, { archivedAt: undefined });
  },
});
```

- [ ] **Step 4: Run tests, confirm PASS**

```bash
npm run test -- convex/telegram/__tests__/chatRegistry.test.ts
```
Expected: all assignRole, archiveChat, restoreChat cases PASS.

- [ ] **Step 5: Regenerate codegen + commit**

```bash
npx convex codegen --typecheck=disable
git add convex/telegram/chatRegistry.ts convex/telegram/__tests__/chatRegistry.test.ts convex/_generated/
git commit -m "feat(85): chatRegistry — listChats + assignRole + archive/restore"
```

---

### Task 7: `sendTestMessage` + `seedChatFromEnv`

**Files:**
- Modify: `convex/telegram/chatRegistry.ts`
- Modify: `convex/telegram/__tests__/chatRegistry.test.ts`

- [ ] **Step 1: Write failing tests** (spec cases #8, #9, #10, #18)

Append to `chatRegistry.test.ts`. `seedAdminSession` is already imported from `./testHelpers` (Task 6 Step 1) — reuse it, do NOT seed sessions inline.

```ts
describe("sendTestMessage (spec case #18)", () => {
  beforeEach(() => {
    process.env.TELEGRAM_BOT_TOKEN = "test-token";
  });
  afterEach(() => {
    vi.restoreAllMocks();
    delete process.env.TELEGRAM_BOT_TOKEN;
  });

  it("populates lastError on Telegram 403", async () => {
    const t = convexTest(schema);
    const token = await seedAdminSession(t);
    await t.run(async (ctx) => {
      await ctx.db.insert("telegramChats", {
        chatId: "T1", chatType: "group", title: "Test",
        registeredAt: 0, lastSeenAt: 0,
      });
    });
    global.fetch = vi.fn(async () =>
      new Response(JSON.stringify({ ok: false, description: "Forbidden: bot was kicked" }), {
        status: 403,
      }),
    ) as unknown as typeof fetch;
    await expect(
      t.action(api.telegram.chatRegistry.sendTestMessage, {
        token, chatId: "T1",
      } as any),
    ).rejects.toThrow();
    const row = await t.run(async (ctx) =>
      ctx.db.query("telegramChats").withIndex("by_chatId", (q) => q.eq("chatId", "T1")).unique());
    expect(row?.lastError?.message).toContain("Forbidden");
    expect(row?.lastError?.at).toBeGreaterThan(0);
  });

  it("truncates lastError.message to 200 chars with trailing ellipsis", async () => {
    const t = convexTest(schema);
    const token = await seedAdminSession(t);
    await t.run(async (ctx) => {
      await ctx.db.insert("telegramChats", {
        chatId: "T2", chatType: "group", title: "Test",
        registeredAt: 0, lastSeenAt: 0,
      });
    });
    const longMsg = "x".repeat(500);
    global.fetch = vi.fn(async () =>
      new Response(JSON.stringify({ ok: false, description: longMsg }), {
        status: 500,
      }),
    ) as unknown as typeof fetch;
    await expect(
      t.action(api.telegram.chatRegistry.sendTestMessage, {
        token, chatId: "T2",
      } as any),
    ).rejects.toThrow();
    const row = await t.run(async (ctx) =>
      ctx.db.query("telegramChats").withIndex("by_chatId", (q) => q.eq("chatId", "T2")).unique());
    expect(row?.lastError?.message.length).toBe(200);
    expect(row?.lastError?.message.endsWith("…")).toBe(true);
  });
});

describe("seedChatFromEnv (spec cases #8, #9, #10)", () => {
  beforeEach(() => {
    process.env.TELEGRAM_BOT_TOKEN = "test-token";
    process.env.TELEGRAM_CHAT_ID = "-100SEED";
    global.fetch = vi.fn(async () =>
      new Response(JSON.stringify({
        ok: true,
        result: { id: -100, type: "supergroup", title: "Seeded Title" },
      }), { status: 200 }),
    ) as unknown as typeof fetch;
  });
  afterEach(() => {
    vi.restoreAllMocks();
    delete process.env.TELEGRAM_BOT_TOKEN;
    delete process.env.TELEGRAM_CHAT_ID;
  });

  it("throws on invalid role string", async () => {
    const t = convexTest(schema);
    await expect(
      t.action(internal.telegram.chatRegistry.seedChatFromEnv, { role: "bogus" }),
    ).rejects.toThrow(/Unknown telegram role/);
  });

  it("throws when TELEGRAM_BOT_TOKEN missing (case #8)", async () => {
    delete process.env.TELEGRAM_BOT_TOKEN;
    const t = convexTest(schema);
    await expect(
      t.action(internal.telegram.chatRegistry.seedChatFromEnv, { role: "pack-list" }),
    ).rejects.toThrow(/TELEGRAM_BOT_TOKEN/);
  });

  it("throws when TELEGRAM_CHAT_ID missing (case #8)", async () => {
    delete process.env.TELEGRAM_CHAT_ID;
    const t = convexTest(schema);
    await expect(
      t.action(internal.telegram.chatRegistry.seedChatFromEnv, { role: "pack-list" }),
    ).rejects.toThrow(/TELEGRAM_CHAT_ID/);
  });

  it("throws on Telegram getChat API failure (case #9)", async () => {
    global.fetch = vi.fn(async () =>
      new Response(JSON.stringify({ ok: false, description: "Unauthorized" }), {
        status: 401,
      }),
    ) as unknown as typeof fetch;
    const t = convexTest(schema);
    await expect(
      t.action(internal.telegram.chatRegistry.seedChatFromEnv, { role: "pack-list" }),
    ).rejects.toThrow(/Unauthorized/);
  });

  // Case #10: four row-existence sub-cases
  it("status='inserted' when no pre-existing row (case #10a)", async () => {
    const t = convexTest(schema);
    const result = await t.action(internal.telegram.chatRegistry.seedChatFromEnv, {
      role: "pack-list",
    });
    expect(result).toMatchObject({ status: "inserted", role: "pack-list" });
  });

  it("status='graduated-dormant' when existing row has no role (case #10b)", async () => {
    const t = convexTest(schema);
    await t.run(async (ctx) => {
      await ctx.db.insert("telegramChats", {
        chatId: "-100SEED", chatType: "supergroup", title: "Existing",
        registeredAt: 0, lastSeenAt: 0,
      });
    });
    const result = await t.action(internal.telegram.chatRegistry.seedChatFromEnv, {
      role: "pack-list",
    });
    expect(result).toMatchObject({ status: "graduated-dormant", role: "pack-list" });
  });

  it("status='already-exists-same-role' when existing row has same role (case #10c)", async () => {
    const t = convexTest(schema);
    await t.run(async (ctx) => {
      await ctx.db.insert("telegramChats", {
        chatId: "-100SEED", chatType: "supergroup", title: "Existing",
        role: "pack-list", registeredAt: 0, lastSeenAt: 0,
      });
    });
    const result = await t.action(internal.telegram.chatRegistry.seedChatFromEnv, {
      role: "pack-list",
    });
    expect(result).toMatchObject({ status: "already-exists-same-role" });
  });

  it("throws when existing row has DIFFERENT role (case #10d — intentional non-idempotent)", async () => {
    const t = convexTest(schema);
    await t.run(async (ctx) => {
      await ctx.db.insert("telegramChats", {
        chatId: "-100SEED", chatType: "supergroup", title: "Existing",
        role: "sales-updates", registeredAt: 0, lastSeenAt: 0,
      });
    });
    await expect(
      t.action(internal.telegram.chatRegistry.seedChatFromEnv, { role: "pack-list" }),
    ).rejects.toThrow(/already registered with role/);
  });
});
```

- [ ] **Step 2: Run tests, confirm FAIL**

- [ ] **Step 3: Implement `sendTestMessage` + `seedChatFromEnv`**

Append to `chatRegistry.ts`:

```ts
// ─── sendTestMessage ─────────────────────────────────────────────────────────

/**
 * Diagnostic test-send from admin UI. Populates `lastError` on failure so the
 * UI can render the inline error row. Truncates error message to 200 chars +
 * ellipsis (spec §"Backend behavior", staffreview refinement).
 */
export const sendTestMessage = action({
  args: { token: v.string(), chatId: v.string() },
  handler: async (ctx, args): Promise<void> => {
    // Step 1: auth + existence check via internal query (mirror QRIS pattern).
    await ctx.runQuery(internal.telegram.chatRegistry.requireChatRow, {
      token: args.token,
      chatId: args.chatId,
    });
    const botToken = process.env.TELEGRAM_BOT_TOKEN;
    if (!botToken) throw new Error("TELEGRAM_BOT_TOKEN missing");

    const wibTime = new Date(Date.now() + 7 * 60 * 60 * 1000)
      .toISOString().slice(11, 19); // HH:MM:SS in WIB
    const text = `🧪 Test from FrollieProBot — wiring works! Sent at ${wibTime} WIB.`;

    try {
      await sendTelegramHtml(botToken, args.chatId, text);
    } catch (err) {
      const raw = err instanceof Error ? err.message : String(err);
      const message = raw.length > 200 ? raw.slice(0, 199) + "…" : raw;
      await ctx.runMutation(internal.telegram.chatRegistry.recordLastError, {
        chatId: args.chatId,
        message,
      });
      throw err;
    }
  },
});

/**
 * @internal Implementation detail of `sendTestMessage` — do not call externally.
 * Auth-gated existence check (mirror QRIS: the action is a raw `action`, so we
 * gate via an internal query that runs requireRole + the existence check in one
 * place).
 */
export const requireChatRow = internalQuery({
  args: { token: v.string(), chatId: v.string() },
  handler: async (ctx, args) => {
    await requireRole(ctx, args.token, ["manager", "admin"]);
    const row = await ctx.db
      .query("telegramChats")
      .withIndex("by_chatId", (q) => q.eq("chatId", args.chatId))
      .unique();
    if (!row) {
      throw new ConvexError(`No registered Telegram chat with id '${args.chatId}'`);
    }
    return row;
  },
});

/**
 * @internal Implementation detail of `sendTestMessage` — do not call externally.
 * Writes `lastError`; the action calls this on caught failure.
 */
export const recordLastError = internalMutation({
  args: { chatId: v.string(), message: v.string() },
  handler: async (ctx, args) => {
    const row = await ctx.db
      .query("telegramChats")
      .withIndex("by_chatId", (q) => q.eq("chatId", args.chatId))
      .unique();
    if (!row) return;
    await ctx.db.patch(row._id, {
      lastError: { at: Date.now(), message: args.message },
    });
  },
});

// ─── seedChatFromEnv ─────────────────────────────────────────────────────────

type SeedResult =
  | { status: "inserted"; chatId: string; title: string; role: string }
  | { status: "graduated-dormant"; chatId: string; title: string; role: string }
  | { status: "already-exists-same-role"; chatId: string; title: string; role: string };

/**
 * One-time bootstrap (Convex dashboard → Functions tab). Reads TELEGRAM_CHAT_ID
 * env, calls Telegram getChat to discover title+type, then INSERT / GRADUATE /
 * NO-OP / THROW per spec §"seedChatFromEnv" 4-row-state table.
 */
export const seedChatFromEnv = internalAction({
  args: { role: v.string() },
  handler: async (ctx, args): Promise<SeedResult> => {
    // 1. Validate role
    if (!isKnownTelegramRole(args.role)) {
      throw new ConvexError(
        `Unknown telegram role: '${args.role}'. Must be one of: ${KNOWN_TELEGRAM_ROLES.join(", ")}`,
      );
    }
    // 2. Env presence
    const token = process.env.TELEGRAM_BOT_TOKEN;
    const chatId = process.env.TELEGRAM_CHAT_ID;
    if (!token) throw new Error("TELEGRAM_BOT_TOKEN env var missing");
    if (!chatId) throw new Error("TELEGRAM_CHAT_ID env var missing");

    // 3. Discover title + type via Telegram getChat
    const res = await fetch(
      `https://api.telegram.org/bot${token}/getChat?chat_id=${encodeURIComponent(chatId)}`,
    );
    const json = (await res.json()) as {
      ok: boolean;
      result?: { type: string; title?: string };
      description?: string;
    };
    if (!res.ok || !json.ok || !json.result) {
      throw new Error(
        `Telegram getChat failed: ${res.status} ${json.description ?? "unknown"}`,
      );
    }
    const rawType = json.result.type;
    if (rawType !== "private" && rawType !== "group" && rawType !== "supergroup") {
      throw new Error(`Unsupported chat type from Telegram: ${rawType}`);
    }
    const title = json.result.title ?? "(untitled)";

    // 4. Branch on row state
    return await ctx.runMutation(
      internal.telegram.chatRegistry.seedFromEnvWrite,
      { chatId, chatType: rawType, title, role: args.role },
    );
  },
});

/**
 * @internal Implementation detail of `seedChatFromEnv` — do not call externally.
 * Performs the 4-row-state branch (insert / graduate / no-op / throw) in one
 * atomic mutation after the action discovers title+type from Telegram getChat.
 */
export const seedFromEnvWrite = internalMutation({
  args: {
    chatId: v.string(),
    chatType: v.union(v.literal("private"), v.literal("group"), v.literal("supergroup")),
    title: v.string(),
    role: v.string(),
  },
  handler: async (ctx, args): Promise<SeedResult> => {
    const now = Date.now();
    const existing = await ctx.db
      .query("telegramChats")
      .withIndex("by_chatId", (q) => q.eq("chatId", args.chatId))
      .unique();

    if (!existing) {
      await ctx.db.insert("telegramChats", {
        chatId: args.chatId,
        chatType: args.chatType,
        title: args.title,
        role: args.role,
        registeredAt: now,
        lastSeenAt: now,
      });
      return { status: "inserted", chatId: args.chatId, title: args.title, role: args.role };
    }

    if (existing.role === undefined) {
      await ctx.db.patch(existing._id, { role: args.role, lastSeenAt: now });
      return {
        status: "graduated-dormant",
        chatId: args.chatId,
        title: existing.title,
        role: args.role,
      };
    }

    if (existing.role === args.role) {
      return {
        status: "already-exists-same-role",
        chatId: args.chatId,
        title: existing.title,
        role: args.role,
      };
    }

    throw new ConvexError(
      `Chat ${args.chatId} already registered with role '${existing.role}'. Use /admin/telegram-chats to reassign.`,
    );
  },
});
```

- [ ] **Step 4: Run all chatRegistry tests, confirm PASS**

```bash
npm run test -- convex/telegram/__tests__/
```
Expected: all chatRegistry + registerChatReply tests PASS. Total cases ≥ 22.

- [ ] **Step 5: Type-check the registry**

```bash
npm run type-check
```
Expected: no errors.

- [ ] **Step 6: Regenerate codegen + commit**

```bash
npx convex codegen --typecheck=disable
git add convex/telegram/chatRegistry.ts convex/telegram/__tests__/ convex/_generated/
git commit -m "feat(85): chatRegistry — sendTestMessage + seedChatFromEnv"
```

---

### Task 8: Webhook routing extension

**Files:**
- Modify: `convex/telegram/webhook.ts`
- Modify: `convex/telegram/__tests__/webhookHandler.test.ts`

- [ ] **Step 1a: Add a `defaultDeps()` helper at the TOP of `webhookHandler.test.ts`** (Improvement 1)

The `WebhookDeps` interface grows from `{ recordIfNew, runAction }` (2 fields) to `{ recordIfNew, runPack, runRegister, runStart, touchLastSeen }` (5 fields). Without a helper, every test must declare all 5 even when it only cares about one. Add this helper + the type import once, near the top of the file (after the existing `import { decideWebhookOutcome } from "../webhook";`):

```ts
import type { WebhookDeps } from "../webhook";

function defaultDeps(over: Partial<WebhookDeps> = {}): WebhookDeps {
  return {
    recordIfNew: async () => true,
    runPack: async () => {},
    runRegister: async () => {},
    runStart: async () => {},
    touchLastSeen: async () => {},
    ...over,
  };
}
```

- [ ] **Step 1b: Rewrite EVERY existing `/pack` test to use `defaultDeps`** (Improvement 6 — explicit, not a fragile rename)

The original file (Task baseline) declares `deps: { recordIfNew, runAction }` in ~10 cases. `runAction` no longer exists — the `/pack` path is now `runPack`. Do a full, deliberate rewrite of each existing case rather than a blind search-replace:

For each existing `/pack` test, change the deps object to `deps: defaultDeps({ recordIfNew, runPack })` and rename the local `const runAction = vi.fn()` → `const runPack = vi.fn()` plus every `expect(runAction)...` → `expect(runPack)...`. Concretely, the existing cases map as:

| Existing test (by description) | New deps | Assertion change |
|---|---|---|
| "triggers sendPackList for /pack" | `defaultDeps({ runPack })` | `expect(runPack).toHaveBeenCalledTimes(1)` |
| "triggers sendPackList for /pack@BotName" | `defaultDeps({ runPack })` | same |
| "ignores non-/pack text…" | `defaultDeps({ runPack })` | `expect(runPack).not.toHaveBeenCalled()` |
| "ignores updates with no message field" | `defaultDeps({ runPack })` | `expect(runPack).not.toHaveBeenCalled()` |
| "ignores /pack with trailing args…" | `defaultDeps({ recordIfNew, runPack })` | `expect(runPack).not.toHaveBeenCalled()`; `expect(recordIfNew).not.toHaveBeenCalled()` |
| "does not re-fire when recordIfNew reports duplicate" | `defaultDeps({ recordIfNew: async () => false, runPack })` | `expect(runPack).not.toHaveBeenCalled()` |
| "records the update_id BEFORE running the action" | `defaultDeps({ recordIfNew, runPack })` (push to `calls` array as before; rename `run` → push "pack") | `expect(calls).toEqual(["record", "pack"])` |
| "does not call runAction when recordIfNew returns false…" | `defaultDeps({ recordIfNew, runPack })` | `expect(runPack).not.toHaveBeenCalled()` |
| "C3: still returns 200 if runAction throws" | `defaultDeps({ recordIfNew, runPack: () => Promise.reject(new Error("scheduler hiccup")) })` | `expect(runPack).toHaveBeenCalledTimes(1)`; `expect(warn).toHaveBeenCalled()` |

The auth tests (401 cases) don't reference `runAction` — leave their deps as `defaultDeps()`.

- [ ] **Step 1c: Append the new routing tests** (spec cases #15, #16, #17 + /start + unknown)

```ts
describe("decideWebhookOutcome — /register routing (spec case #15)", () => {
  it("dispatches /register to runRegister with chat metadata", async () => {
    const runRegister = vi.fn().mockResolvedValue(undefined);
    const result = await decideWebhookOutcome({
      providedSecret: SECRET,
      expectedSecret: SECRET,
      body: {
        update_id: 1001,
        message: {
          message_id: 1, text: "/register",
          chat: { id: -100123, type: "supergroup", title: "New Group" },
          from: { id: 42, is_bot: false, first_name: "User" },
        },
      } as any,
      deps: defaultDeps({ runRegister }),
    });
    expect(result.status).toBe(200);
    expect(runRegister).toHaveBeenCalledWith({
      chatId: "-100123",
      chatType: "supergroup",
      title: "New Group",
      registeredBy: 42,
    });
  });
});

describe("decideWebhookOutcome — /register dedupe (spec case #16)", () => {
  it("does not re-fire runRegister when update_id duplicates", async () => {
    const runRegister = vi.fn();
    const result = await decideWebhookOutcome({
      providedSecret: SECRET,
      expectedSecret: SECRET,
      body: {
        update_id: 2002,
        message: { message_id: 1, text: "/register", chat: { id: -100, type: "group", title: "X" } },
      } as any,
      deps: defaultDeps({ recordIfNew: async () => false, runRegister }),
    });
    expect(result.status).toBe(200);
    expect(runRegister).not.toHaveBeenCalled();
  });
});

describe("decideWebhookOutcome — non-command messages (spec case #17)", () => {
  it("dispatches non-command text to touchLastSeen (no dedupe by update_id)", async () => {
    const touchLastSeen = vi.fn().mockResolvedValue(undefined);
    const recordIfNew = vi.fn();
    const result = await decideWebhookOutcome({
      providedSecret: SECRET,
      expectedSecret: SECRET,
      body: {
        update_id: 3003,
        message: { message_id: 1, text: "hello @FrolliePackBot", chat: { id: -100, type: "group" } },
      } as any,
      deps: defaultDeps({ recordIfNew, touchLastSeen }),
    });
    expect(result.status).toBe(200);
    expect(recordIfNew).not.toHaveBeenCalled();
    expect(touchLastSeen).toHaveBeenCalledWith("-100");
  });
});

describe("decideWebhookOutcome — /start (spec §webhook dispatch)", () => {
  it("dispatches /start to runStart", async () => {
    const runStart = vi.fn().mockResolvedValue(undefined);
    const result = await decideWebhookOutcome({
      providedSecret: SECRET,
      expectedSecret: SECRET,
      body: {
        update_id: 4004,
        message: { message_id: 1, text: "/start", chat: { id: -100, type: "private" } },
      } as any,
      deps: defaultDeps({ runStart }),
    });
    expect(result.status).toBe(200);
    expect(runStart).toHaveBeenCalledWith("-100");
  });
});

describe("decideWebhookOutcome — unknown slash command", () => {
  it("silently 200-acks unknown slash command without dedupe or dispatch", async () => {
    const recordIfNew = vi.fn();
    const runPack = vi.fn();
    const touchLastSeen = vi.fn();
    const result = await decideWebhookOutcome({
      providedSecret: SECRET,
      expectedSecret: SECRET,
      body: {
        update_id: 5005,
        message: { message_id: 1, text: "/foobar", chat: { id: -100, type: "group" } },
      } as any,
      deps: defaultDeps({ recordIfNew, runPack, touchLastSeen }),
    });
    expect(result.status).toBe(200);
    expect(recordIfNew).not.toHaveBeenCalled();
    expect(runPack).not.toHaveBeenCalled();
    expect(touchLastSeen).not.toHaveBeenCalled(); // unknown slash ≠ non-command; no touch
  });
});
```

- [ ] **Step 2: Run, confirm FAIL**

- [ ] **Step 3: Refactor `webhook.ts` for multi-command dispatch**

Replace `convex/telegram/webhook.ts` contents:

```ts
import { v } from "convex/values";
import { httpAction, internalMutation } from "../_generated/server";
import { internal } from "../_generated/api";
import { parseCommand } from "./chatRegistry";

interface WebhookResult { status: number; body: string; }

export interface WebhookDeps {
  recordIfNew: (updateId: number) => Promise<boolean>;
  /** Dispatch /pack — schedule sendPackList. */
  runPack: () => Promise<void>;
  /** Dispatch /register — schedule registerChat. */
  runRegister: (args: {
    chatId: string;
    chatType: "private" | "group" | "supergroup";
    title: string;
    registeredBy: number | undefined;
  }) => Promise<void>;
  /** Dispatch /start — schedule replyStartHelp. */
  runStart: (chatId: string) => Promise<void>;
  /** Dispatch non-command messages — fire-and-forget touchChatLastSeen. */
  touchLastSeen: (chatId: string) => Promise<void>;
}

interface TelegramUpdate {
  update_id?: number;
  message?: {
    message_id?: number;
    text?: string;
    chat?: { id?: number; type?: string; title?: string };
    from?: { id?: number };
  };
}

function constantTimeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let mismatch = 0;
  for (let i = 0; i < a.length; i++) mismatch |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return mismatch === 0;
}

export async function decideWebhookOutcome(input: {
  providedSecret: string | null;
  expectedSecret: string | undefined;
  body: TelegramUpdate;
  deps: WebhookDeps;
}): Promise<WebhookResult> {
  if (!input.expectedSecret || !input.providedSecret) return { status: 401, body: "unauthorized" };
  if (!constantTimeEqual(input.providedSecret, input.expectedSecret)) {
    return { status: 401, body: "unauthorized" };
  }

  const updateId = input.body.update_id;
  const msg = input.body.message;
  if (typeof updateId !== "number") return { status: 200, body: "ok" };
  if (!msg) return { status: 200, body: "ok" };

  const chatIdNum = msg.chat?.id;
  if (typeof chatIdNum !== "number") return { status: 200, body: "ok" };
  const chatIdStr = String(chatIdNum);

  const text = msg.text;
  if (typeof text !== "string") {
    // Non-text update (sticker, photo, etc.) — best-effort touch, no dedupe.
    try { await input.deps.touchLastSeen(chatIdStr); } catch {}
    return { status: 200, body: "ok" };
  }

  const command = parseCommand(text);

  // Non-command text → touchLastSeen (NOT deduped by update_id; idempotent by chatId)
  if (!command) {
    if (text.trim().startsWith("/")) {
      // Unknown slash command — silent 200-ack, no touch.
      return { status: 200, body: "ok" };
    }
    try { await input.deps.touchLastSeen(chatIdStr); } catch {}
    return { status: 200, body: "ok" };
  }

  // Command path — atomic R5 dedupe, then dispatch.
  const isNew = await input.deps.recordIfNew(updateId);
  if (!isNew) return { status: 200, body: "ok" };

  try {
    if (command === "pack") {
      await input.deps.runPack();
    } else if (command === "register") {
      const rawType = msg.chat?.type;
      const chatType: "private" | "group" | "supergroup" =
        rawType === "private" || rawType === "group" || rawType === "supergroup"
          ? rawType
          : "group";
      await input.deps.runRegister({
        chatId: chatIdStr,
        chatType,
        title: msg.chat?.title ?? "(untitled)",
        registeredBy: msg.from?.id,
      });
    } else {
      await input.deps.runStart(chatIdStr);
    }
  } catch (err) {
    // C3 (existing lesson): never return non-200 once recordIfNew committed.
    console.warn("[telegram] command dispatch failed after recordIfNew", err);
  }
  return { status: 200, body: "ok" };
}

// ─── Convex glue ─────────────────────────────────────────────────────────────

export const recordIfNew = internalMutation({
  args: { updateId: v.number() },
  handler: async (ctx, args): Promise<boolean> => {
    const existing = await ctx.db
      .query("telegramUpdates")
      .withIndex("by_update_id", (q) => q.eq("updateId", args.updateId))
      .unique();
    if (existing) return false;
    await ctx.db.insert("telegramUpdates", {
      updateId: args.updateId,
      receivedAt: Date.now(),
    });
    return true;
  },
});

export const handleTelegramWebhook = httpAction(async (ctx, request) => {
  let body: TelegramUpdate;
  try {
    body = (await request.json()) as TelegramUpdate;
  } catch {
    return new Response("bad request", { status: 400 });
  }

  const outcome = await decideWebhookOutcome({
    providedSecret: request.headers.get("X-Telegram-Bot-Api-Secret-Token"),
    expectedSecret: process.env.TELEGRAM_WEBHOOK_SECRET,
    body,
    deps: {
      recordIfNew: (updateId) =>
        ctx.runMutation(internal.telegram.webhook.recordIfNew, { updateId }),
      runPack: async () => {
        await ctx.scheduler.runAfter(0, internal.telegram.sendPackList.sendPackList, {
          reason: "command",
        });
      },
      runRegister: async (args) => {
        await ctx.scheduler.runAfter(0, internal.telegram.chatRegistry.registerChat, args);
      },
      runStart: async (chatId) => {
        await ctx.scheduler.runAfter(0, internal.telegram.chatRegistry.replyStartHelp, { chatId });
      },
      touchLastSeen: async (chatId) => {
        // NOT scheduled — direct mutation (no dedupe necessary).
        await ctx.runMutation(internal.telegram.chatRegistry.touchChatLastSeen, { chatId });
      },
    },
  });
  return new Response(outcome.body, { status: outcome.status });
});
```

- [ ] **Step 4: Confirm existing tests already updated**

The existing `/pack` test rewrite was done in Step 1b (using `defaultDeps`). Verify no `runAction` reference remains anywhere in `webhookHandler.test.ts` (it's no longer a `WebhookDeps` field):

```powershell
Select-String -Path convex/telegram/__tests__/webhookHandler.test.ts -Pattern "runAction"
```
Expected: zero matches. If any remain, finish the Step 1b rewrite for that case.

- [ ] **Step 5: Run all webhook tests, confirm PASS**

```bash
npm run test -- convex/telegram/__tests__/webhookHandler.test.ts
```
Expected: all PASS (existing + new).

- [ ] **Step 6: Commit**

```bash
git add convex/telegram/webhook.ts convex/telegram/__tests__/webhookHandler.test.ts
git commit -m "feat(85): generalize webhook for /register + /start + non-command lastSeen"
```

---

### Task 9: `sendPackList` — wire `getChatIdByRole`

**Files:**
- Modify: `convex/telegram/sendPackList.ts`

- [ ] **Step 1: Replace env-var read with role lookup**

Edit `convex/telegram/sendPackList.ts`. Replace the lines that read `process.env.TELEGRAM_CHAT_ID`:

OLD (lines 19-24):
```ts
    const token = process.env.TELEGRAM_BOT_TOKEN;
    const chatId = process.env.TELEGRAM_CHAT_ID;
    if (!token || !chatId) {
      throw new Error("Telegram env vars missing (TELEGRAM_BOT_TOKEN / TELEGRAM_CHAT_ID)");
    }
```

NEW:
```ts
    const token = process.env.TELEGRAM_BOT_TOKEN;
    if (!token) {
      throw new Error("Telegram env var missing (TELEGRAM_BOT_TOKEN)");
    }
    // Resolve chatId by role — table first, env fallback (if TELEGRAM_FALLBACK_ROLE=pack-list).
    const chatId = await ctx.runQuery(
      internal.telegram.chatRegistry.getChatIdByRole,
      { role: "pack-list" },
    );
```

- [ ] **Step 2: Verify no other env reads remain**

Run:
```bash
npm run -- grep -n "TELEGRAM_CHAT_ID" convex/telegram/sendPackList.ts
```

If using PowerShell directly:
```powershell
Select-String -Path convex/telegram/sendPackList.ts -Pattern "TELEGRAM_CHAT_ID"
```
Expected: zero matches.

- [ ] **Step 3: Type-check**

```bash
npm run type-check
```
Expected: no errors.

- [ ] **Step 4: Run existing pack-list tests**

```bash
npm run test -- convex/telegram/__tests__/packListFormat.test.ts convex/telegram/__tests__/packListQuery.test.ts
```
Expected: PASS — pure-function tests don't reference the env chatId.

- [ ] **Step 5: Commit**

```bash
git add convex/telegram/sendPackList.ts
git commit -m "feat(85): sendPackList — resolve chatId via role registry"
```

---

### Task 10: Admin UI page `TelegramChatsManager.tsx`

**Files:**
- Create: `src/hooks/convex/useTelegramChats.ts`
- Create: `src/pages/TelegramChatsManager.tsx`

- [ ] **Step 0: Create the wrapping hook module** (named hooks — keeps the page + its RTL test decoupled from `convex/react`)

Every Phase 85 registry function takes an explicit `token` arg (raw `query`/`mutation`/`action` + `requireRole`, the QRIS pattern — there is no `protectedAction`, and the backend uses explicit-token throughout for consistency with the action; the spec API table shows the `token` args). So the frontend uses plain `useQuery`/`useMutation` + the convex client's `.action()`, reading the token from the auth user — exactly mirroring `src/hooks/convex/useQrisCreate.ts:20-28`. Named wrapping hooks make the RTL mock trivial (mock this one module by name — see Task 12).

> **Why NOT `useSessionQuery`/`useSessionMutation`:** those auto-inject a `sessionId` field (for `protectedQuery`/`protectedMutation` wrappers), NOT a `token` field. The backend here expects an explicit `token` arg, so a session hook would send `sessionId` and the `requireRole(ctx, args.token, …)` call would receive `undefined` and throw. Use plain `useQuery`/`useMutation` + explicit token.

Create `src/hooks/convex/useTelegramChats.ts`:

```ts
/**
 * Phase 85 — Telegram chat registry hooks.
 *
 * All registry functions take an explicit `token` arg (raw query/mutation/action
 * + requireRole — the QRIS pattern; there is no protectedAction/useSessionAction
 * in this project, see useQrisCreate.ts). The token is read from the auth user.
 * Wrapping in named hooks keeps TelegramChatsManager + its RTL test decoupled
 * from convex/react (the test mocks THIS module by name).
 *
 * `useTelegramChats` returns `undefined` while the subscription resolves
 * (Convex pitfall #2) — the consumer must handle it.
 */
import { useQuery, useMutation, useConvex } from "convex/react";
import { useAuth } from "../../contexts/AuthContext";
import { api } from "../../../convex/_generated/api";

export function useTelegramChats(includeArchived: boolean) {
  const { user } = useAuth();
  const token = user?.token ?? "";
  return useQuery(
    api.telegram.chatRegistry.listChats,
    token ? { token, includeArchived } : "skip",
  );
}

export function useAssignRole() {
  const { user } = useAuth();
  const token = user?.token ?? "";
  const fn = useMutation(api.telegram.chatRegistry.assignRole);
  return (args: { chatId: string; role: string | null; forceReassign?: boolean }) =>
    fn({ ...args, token });
}

export function useArchiveChat() {
  const { user } = useAuth();
  const token = user?.token ?? "";
  const fn = useMutation(api.telegram.chatRegistry.archiveChat);
  return (chatId: string) => fn({ chatId, token });
}

export function useRestoreChat() {
  const { user } = useAuth();
  const token = user?.token ?? "";
  const fn = useMutation(api.telegram.chatRegistry.restoreChat);
  return (chatId: string) => fn({ chatId, token });
}

export function useSendTestMessage() {
  const convex = useConvex();
  const { user } = useAuth();
  const token = user?.token ?? "";
  return (chatId: string) => {
    if (!convex) return Promise.resolve(undefined); // provider-tolerant for RTL
    return convex.action(api.telegram.chatRegistry.sendTestMessage, { chatId, token });
  };
}
```

- [ ] **Step 1: Create the page file**

The page is ~280 LOC. The skeleton below shows the structure; the full implementation is what gets written by react-ui-builder (use existing `src/pages/ChannelRoutingManager.tsx` as the pattern reference for PageHeader/Card/Table/AlertDialog). It consumes the named hooks from Step 0 — NOT `useSessionQuery`/`useSessionMutation`/`useAction` directly.

```tsx
/**
 * Phase 85 — Telegram chat registry admin page.
 *
 * Route:        /admin/telegram-chats
 * Gating:       <ProtectedRoute requiredPermission="canAccessTelegramChats">
 * Backend:      api.telegram.chatRegistry.{listChats, assignRole, archiveChat,
 *               restoreChat, sendTestMessage}
 *
 * Visual reference: spec §"Page layout" + §"Empty state (first-run)".
 * Pattern reference: src/pages/ChannelRoutingManager.tsx (admin Manager convention).
 */

import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Send, Archive, RotateCcw, Copy, MoreHorizontal } from "lucide-react";

import { PageHeader } from "@/components/layout/PageHeader";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import {
  useTelegramChats, useAssignRole, useArchiveChat, useRestoreChat, useSendTestMessage,
} from "@/hooks/convex/useTelegramChats";
import { formatRelativeTime } from "@/lib/dateUtils";
import { KNOWN_TELEGRAM_ROLES } from "../../convex/telegram/config";

const TEST_MESSAGE_PREVIEW = (wibTime: string) =>
  `🧪 Test from FrollieProBot — wiring works! Sent at ${wibTime} WIB.`;

type ChatRow = {
  _id: string;
  chatId: string;
  chatType: "private" | "group" | "supergroup";
  title: string;
  role?: string;
  registeredBy?: number;
  registeredAt: number;
  lastSeenAt: number;
  archivedAt?: number;
  lastError?: { at: number; message: string };
};

type StatusKey = "archived" | "error" | "live" | "dormant";

function deriveStatus(row: ChatRow, nowMs: number): StatusKey {
  if (row.archivedAt !== undefined) return "archived";
  if (row.lastError && nowMs - row.lastError.at < 24 * 60 * 60 * 1000) return "error";
  if (row.role) return "live";
  return "dormant";
}

function StatusBadge({ status }: { status: StatusKey }) {
  const map: Record<StatusKey, { dot: string; label: string; cls: string }> = {
    live:     { dot: "●", label: "Live",     cls: "text-green-600" },
    dormant:  { dot: "○", label: "Dormant",  cls: "text-amber-600" },
    error:    { dot: "⚠", label: "Error",    cls: "text-red-600" },
    archived: { dot: "▣", label: "Archived", cls: "text-muted-foreground" },
  };
  const { dot, label, cls } = map[status];
  return (
    <span className={`inline-flex items-center gap-1 text-sm ${cls}`}>
      <span aria-hidden>{dot}</span>{label}
    </span>
  );
}

export function TelegramChatsManager() {
  const [showArchived, setShowArchived] = useState(false);
  const [search, setSearch] = useState("");
  const [reassignTarget, setReassignTarget] = useState<{
    chatId: string; role: string; currentHolderTitle: string;
  } | null>(null);
  const [testPreviewChatId, setTestPreviewChatId] = useState<string | null>(null);

  const chats = useTelegramChats(showArchived);
  const assignRole = useAssignRole();
  const archiveChat = useArchiveChat();
  const restoreChat = useRestoreChat();
  const sendTest = useSendTestMessage();

  const filtered = useMemo(() => {
    if (!chats) return undefined;
    const q = search.trim().toLowerCase();
    if (!q) return chats;
    return chats.filter(
      (c) =>
        c.title.toLowerCase().includes(q) ||
        (c.role && c.role.toLowerCase() === q),
    );
  }, [chats, search]);

  const now = Date.now();

  if (chats === undefined) {
    return (
      <div className="container mx-auto p-6">
        <PageHeader title="Telegram Chats" description="Loading..." />
        <Skeleton className="h-32 w-full" />
      </div>
    );
  }

  if (chats.length === 0) {
    return <EmptyState />;
  }

  return (
    <div className="container mx-auto p-6 space-y-6">
      <PageHeader
        title="Telegram Chats"
        description="Manage chats where FrollieProBot delivers messages."
        rightSlot={
          <div className="flex items-center gap-2">
            <Switch checked={showArchived} onCheckedChange={setShowArchived} id="show-archived" />
            <label htmlFor="show-archived" className="text-sm">Show archived</label>
          </div>
        }
      />

      <Card>
        <CardContent className="p-0">
          <div className="p-4">
            <Input
              placeholder="Search by title or role..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Title</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Chat ID</TableHead>
                <TableHead>Role</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Seen</TableHead>
                <TableHead className="w-12"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered?.map((row) => {
                const status = deriveStatus(row, now);
                return (
                  <>
                    <TableRow key={row._id}>
                      <TableCell>{row.title}</TableCell>
                      <TableCell className="text-muted-foreground">{row.chatType}</TableCell>
                      <TableCell className="font-mono text-xs">{row.chatId}</TableCell>
                      <TableCell>
                        <Select
                          value={row.role ?? "_none"}
                          onValueChange={(value) => {
                            void handleRoleChange(row, value);
                          }}
                        >
                          <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="_none">None</SelectItem>
                            {KNOWN_TELEGRAM_ROLES.map((r) => (
                              <SelectItem key={r} value={r}>{r}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </TableCell>
                      <TableCell><StatusBadge status={status} /></TableCell>
                      <TableCell className="text-muted-foreground text-sm">
                        {formatRelativeTime(row.lastSeenAt)}
                      </TableCell>
                      <TableCell>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon"><MoreHorizontal /></Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem onSelect={() => setTestPreviewChatId(row.chatId)}>
                              <Send className="mr-2 h-4 w-4" /> Test send
                            </DropdownMenuItem>
                            {row.archivedAt === undefined ? (
                              <DropdownMenuItem onSelect={() => void handleArchive(row.chatId)}>
                                <Archive className="mr-2 h-4 w-4" /> Archive
                              </DropdownMenuItem>
                            ) : (
                              <DropdownMenuItem onSelect={() => void handleRestore(row.chatId)}>
                                <RotateCcw className="mr-2 h-4 w-4" /> Restore
                              </DropdownMenuItem>
                            )}
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </TableCell>
                    </TableRow>
                    {row.lastError && status === "error" && (
                      <TableRow key={`${row._id}-err`}>
                        <TableCell
                          colSpan={7}
                          className="bg-red-50 dark:bg-red-950/30 pl-12 text-sm text-red-700 dark:text-red-300"
                        >
                          ⚠ {formatRelativeTime(row.lastError.at)} — {row.lastError.message}
                        </TableCell>
                      </TableRow>
                    )}
                  </>
                );
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Reassignment AlertDialog */}
      <AlertDialog open={reassignTarget !== null} onOpenChange={(o) => !o && setReassignTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Reassign role?</AlertDialogTitle>
            <AlertDialogDescription>
              {reassignTarget && (
                <>
                  <b>{reassignTarget.role}</b> is currently delivered to{" "}
                  <i>'{reassignTarget.currentHolderTitle}'</i>. Reassign to this chat?
                </>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => void confirmReassign()}>
              Reassign
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Test-send preview Popover (mounted as Dialog-style overlay) */}
      <AlertDialog open={testPreviewChatId !== null} onOpenChange={(o) => !o && setTestPreviewChatId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Send test message?</AlertDialogTitle>
            <AlertDialogDescription>This message will be sent to the Telegram chat:</AlertDialogDescription>
          </AlertDialogHeader>
          <div className="rounded-lg bg-blue-50 dark:bg-blue-950/30 p-4 text-sm">
            {TEST_MESSAGE_PREVIEW(
              new Date(now + 7 * 60 * 60 * 1000).toISOString().slice(11, 19),
            )}
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => void confirmTestSend()}>
              Send to Telegram
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );

  // ─── handlers ──────────────────────────────────────────────────────────────

  async function handleRoleChange(row: ChatRow, value: string) {
    const newRole = value === "_none" ? null : value;
    if (newRole === null || newRole === row.role) {
      try {
        await assignRole({ chatId: row.chatId, role: newRole });
        toast.success("Role updated");
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Failed to update role");
      }
      return;
    }
    // Check for existing holder client-side (chats data is already fetched)
    const holder = chats?.find(
      (c) => c.role === newRole && c.archivedAt === undefined && c.chatId !== row.chatId,
    );
    if (holder) {
      setReassignTarget({
        chatId: row.chatId,
        role: newRole,
        currentHolderTitle: holder.title,
      });
      return;
    }
    try {
      await assignRole({ chatId: row.chatId, role: newRole });
      toast.success("Role assigned");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to assign");
    }
  }

  async function confirmReassign() {
    if (!reassignTarget) return;
    const { chatId, role } = reassignTarget;
    setReassignTarget(null);
    try {
      await assignRole({ chatId, role, forceReassign: true });
      toast.success("Role reassigned");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to reassign");
    }
  }

  async function handleArchive(chatId: string) {
    try {
      await archiveChat(chatId);
      toast.success("Chat archived");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to archive");
    }
  }

  async function handleRestore(chatId: string) {
    try {
      await restoreChat(chatId);
      toast.success("Chat restored");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to restore");
    }
  }

  async function confirmTestSend() {
    if (!testPreviewChatId) return;
    const chatId = testPreviewChatId;
    setTestPreviewChatId(null);
    try {
      await sendTest(chatId);
      toast.success("Test message sent");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Test send failed");
    }
  }
}

// ─── EmptyState ────────────────────────────────────────────────────────────

function EmptyState() {
  const REGISTER_CMD = "/register@FrollieProBot";
  return (
    <div className="container mx-auto p-6 max-w-2xl">
      <PageHeader
        title="Telegram Chats"
        description="Manage chats where FrollieProBot delivers messages."
      />
      <Card>
        <CardContent className="py-12 text-center space-y-6">
          <div className="inline-block rounded-2xl bg-blue-100 dark:bg-blue-950 p-4 text-2xl">
            ✈ <span className="text-base">Hi! I'm @FrollieProBot</span>
          </div>
          <div>
            <h3 className="text-lg font-medium">No chats registered yet</h3>
          </div>
          <ol className="text-left max-w-md mx-auto space-y-4">
            <li>
              <span className="font-medium">1.</span> Add @FrollieProBot to your Telegram group
            </li>
            <li>
              <span className="font-medium">2.</span> Send{" "}
              <code className="rounded bg-muted px-2 py-1 font-mono text-sm">{REGISTER_CMD}</code>{" "}
              <Button
                size="sm" variant="ghost"
                onClick={() => {
                  // Clipboard API fallback (spec staffreview refinement — at implementer's discretion)
                  if (navigator.clipboard?.writeText) {
                    void navigator.clipboard.writeText(REGISTER_CMD);
                    toast.success("Copied");
                  } else {
                    toast.error("Copy not supported — select and copy manually");
                  }
                }}
              >
                <Copy className="h-4 w-4" />
              </Button>
            </li>
            <li>
              <span className="font-medium">3.</span> Come back here and assign a role
            </li>
          </ol>
        </CardContent>
      </Card>
    </div>
  );
}
```

- [ ] **Step 2: Type-check the page + hook module in isolation**

```bash
npm run type-check
```
Expected: no errors. Common gotchas — the page imports the named hooks from `@/hooks/convex/useTelegramChats` (NOT `useSessionQuery`/`useSessionMutation` directly); the hook module reads `user?.token` (NOT `sessionToken`) from `useAuth`, matching `useQrisCreate.ts:23`.

- [ ] **Step 3: Commit**

```bash
git add src/hooks/convex/useTelegramChats.ts src/pages/TelegramChatsManager.tsx
git commit -m "feat(85): admin UI — TelegramChatsManager page + registry hooks"
```

---

### Task 11: Register route in `App.tsx`

**Files:**
- Modify: `src/App.tsx` (insert near existing `admin/channel-routing` route at ~line 500)

- [ ] **Step 1: Add the import**

At the top of the file with other lazy/eager page imports, add:
```ts
import { TelegramChatsManager } from "@/pages/TelegramChatsManager";
```

- [ ] **Step 2: Add the route**

After the existing `admin/channel-routing` route (`src/App.tsx:500-507`), insert:

```tsx
{/* Phase 85: /admin/telegram-chats — Telegram chat registry */}
<Route
  path="admin/telegram-chats"
  element={
    <ProtectedRoute requiredPermission="canAccessTelegramChats">
      <TelegramChatsManager />
    </ProtectedRoute>
  }
/>
```

- [ ] **Step 3: Type-check + verify routes**

```bash
npm run type-check
```
Expected: no errors.

Manually start dev:
```bash
npm run dev
```
Visit `http://localhost:5173/admin/telegram-chats` while logged in as manager+admin → should render (empty state).

Stop the dev server (Ctrl+C).

- [ ] **Step 4: Commit**

```bash
git add src/App.tsx
git commit -m "feat(85): route admin/telegram-chats with manager+admin gate"
```

---

### Task 12: RTL tests for TelegramChatsManager

**Files:**
- Create: `src/pages/__tests__/TelegramChatsManager.test.tsx`

- [ ] **Step 1: Write failing RTL tests** (spec cases #21, #22)

```tsx
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

// Mock the named wrapping-hook module by name — the QRIS pattern
// (src/components/orders/__tests__/QrisChargeDialog.test.tsx). Each hook is a
// distinct named export, so there is NO need to introspect a function reference
// (the broken `String(fn).includes(...)` anti-pattern — Convex api refs are
// objects, not named functions). This isolates the page from convex/react.
const mockChats = vi.fn();
const mockAssignRole = vi.fn();
const mockArchive = vi.fn();
const mockRestore = vi.fn();
const mockSendTest = vi.fn();

vi.mock("@/hooks/convex/useTelegramChats", () => ({
  useTelegramChats: (...a: unknown[]) => mockChats(...a),
  useAssignRole: () => mockAssignRole,
  useArchiveChat: () => mockArchive,
  useRestoreChat: () => mockRestore,
  useSendTestMessage: () => mockSendTest,
}));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

import { TelegramChatsManager } from "../TelegramChatsManager";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("TelegramChatsManager status badge derivation (spec case #22)", () => {
  it.each([
    ["archived row", { archivedAt: 100, role: undefined }, "Archived"],
    ["error row (fresh)",
      { lastError: { at: Date.now() - 1000, message: "Forbidden" }, role: undefined },
      "Error"],
    ["live row", { role: "pack-list" }, "Live"],
    ["dormant row", { role: undefined }, "Dormant"],
  ])("renders %s as %s", (_label, overrides, expectedLabel) => {
    mockChats.mockReturnValue([{
      _id: "x", chatId: "-100X", chatType: "group", title: "X",
      registeredAt: 0, lastSeenAt: 0,
      ...overrides,
    }]);
    render(<TelegramChatsManager />);
    expect(screen.getByText(expectedLabel)).toBeInTheDocument();
  });
});

describe("TelegramChatsManager reassignment dialog (spec case #21)", () => {
  it("opens AlertDialog when role already held by another chat", async () => {
    mockChats.mockReturnValue([
      { _id: "1", chatId: "-100A", chatType: "group", title: "Holder",
        role: "pack-list", registeredAt: 0, lastSeenAt: 0 },
      { _id: "2", chatId: "-100B", chatType: "group", title: "Candidate",
        registeredAt: 0, lastSeenAt: 0 },
    ]);
    render(<TelegramChatsManager />);
    // Change Candidate's role from None → pack-list
    const trigger = screen.getAllByRole("combobox")[1]; // Candidate row's dropdown
    fireEvent.click(trigger);
    const option = screen.getByText("pack-list");
    fireEvent.click(option);
    await waitFor(() => {
      expect(screen.getByText(/Reassign role\?/)).toBeInTheDocument();
      expect(screen.getByText(/currently delivered to/)).toBeInTheDocument();
    });
    fireEvent.click(screen.getByText("Reassign"));
    await waitFor(() => {
      expect(mockAssignRole).toHaveBeenCalledWith(
        expect.objectContaining({ forceReassign: true, role: "pack-list" }),
      );
    });
  });
});

describe("TelegramChatsManager empty state", () => {
  it("renders empty state when no chats", () => {
    mockChats.mockReturnValue([]);
    render(<TelegramChatsManager />);
    expect(screen.getByText(/No chats registered yet/)).toBeInTheDocument();
    expect(screen.getByText("/register@FrollieProBot")).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run tests, confirm PASS**

```bash
npm run test -- src/pages/__tests__/TelegramChatsManager.test.tsx
```
Expected: PASS (badge derivation × 4, reassignment dialog, empty state).

- [ ] **Step 3: Commit**

```bash
git add src/pages/__tests__/TelegramChatsManager.test.tsx
git commit -m "test(85): RTL coverage for TelegramChatsManager"
```

---

### Task 13: Verification

**Files:** none modified.

- [ ] **Step 1: Type-check + lint**

```bash
npm run type-check
npm run lint
```
Expected: no errors.

- [ ] **Step 2: Full test suite**

```bash
npm run test
```
Expected: all tests pass (existing + 22+ new cases from spec).

- [ ] **Step 3: Build**

```bash
npm run build
```
Expected: builds; vendor bundle under 600 kB cap (CLAUDE.md Pitfall #16).

- [ ] **Step 4: Code-auditor sweep**

Dispatch the `code-auditor` agent (read-only) with this brief: *"Audit Phase 85 changes for type safety, pattern compliance (compare to `convex/qrisPayments/` and `src/pages/ChannelRoutingManager.tsx`), and Convex pitfalls #1, #4, #11, #18, #19 from CLAUDE.md. Read `convex/telegram/chatRegistry.ts`, `convex/telegram/webhook.ts`, `convex/telegram/sendPackList.ts`, `src/hooks/convex/useTelegramChats.ts`, `src/pages/TelegramChatsManager.tsx`, `src/lib/types.ts:710-825`, `convex/schema.ts` telegramChats block. Report ONLY High-severity findings."*

If High-severity findings exist → fix them in a follow-up commit and re-run Step 1-3 before proceeding.

- [ ] **Step 5: Manual smoke — dev environment**

Start dev:
```bash
npx convex dev
# In a second terminal:
npm run dev
```

Workflow (mirrors spec §"Migration & rollout" steps 3-5):
1. Open Convex dashboard → Functions → run `telegram.chatRegistry.seedChatFromEnv` with arg `{ "role": "pack-list" }`. Expect `{ status: "inserted" | "graduated-dormant" | "already-exists-same-role" }`.
2. Visit `http://localhost:5173/admin/telegram-chats` as admin user → confirm the seeded row appears with role `pack-list` and badge `Live`.
3. Click ⋯ → Test send → confirm popover preview → "Send to Telegram" → expect toast success + Telegram message in real chat.
4. Add `@FrollieProBot` to a new group → send `/register@FrollieProBot` → expect Telegram confirmation message + new row in admin UI as `Dormant`.
5. Assign role `sales-updates` from dropdown → no AlertDialog (role unheld) → toast success.
6. Archive the new row → row disappears → toggle "Show archived" → row reappears with `Archived` badge → restore → archivedAt cleared.

Stop both servers.

- [ ] **Step 6: Commit any audit fixes** (only if step 4 found anything)

---

### Task 14: Documentation sweep

**Files:**
- Modify: `docs/CHANGELOG.md`, `docs/SCHEMA.md`, `docs/FILE_MAP.md`, `docs/telegram/telegram-bot-integration.md`, `CLAUDE.md`, `docs/superpowers/plans/2026-05-27-convex-telegram-bot-starter-oss-draft.md`
- Create: `docs/telegram/self-register-porting.md`
- Update memory: `MEMORY.md`

- [ ] **Step 1: CHANGELOG entry**

Append to `docs/CHANGELOG.md` per spec §"CHANGELOG draft" (use today's date). Verify the entry mentions `TELEGRAM_FALLBACK_ROLE`, `canAccessTelegramChats`, and the new admin route.

- [ ] **Step 2: SCHEMA entry**

In `docs/SCHEMA.md`, add `telegramChats` table to the schema docs (columns + indexes + business purpose).

- [ ] **Step 3: FILE_MAP entry**

In `docs/FILE_MAP.md`:
- Add a feature row for "Telegram chat registry": backend files (`convex/telegram/chatRegistry.ts`, `convex/telegram/config.ts`), frontend files (`src/hooks/convex/useTelegramChats.ts`, `src/pages/TelegramChatsManager.tsx`), permission (`canAccessTelegramChats`), roles (manager+admin).
- Add `/admin/telegram-chats` to the full permission table.

- [ ] **Step 4: Integration doc — Variant C**

In `docs/telegram/telegram-bot-integration.md`, add a new section after the existing variants:

```markdown
## Variant C: Multi-chat with self-registration

Adds a `telegramChats` registry table + `/register@<bot>` command. Send-actions
resolve chat IDs by semantic role at send time. See spec
`docs/superpowers/specs/2026-05-27-telegram-self-register-design.md` and
porting checklist `docs/telegram/self-register-porting.md`.

### When to use
- 2+ semantic delivery destinations (pack-list, sales-updates, ...)
- Want self-service group onboarding without `curl getUpdates`/env-var edits

### Schema sketch
[copy from spec §"Schema"]

### Role-to-action lookup pattern
[copy from spec §"getChatIdByRole lookup helper"]
```

- [ ] **Step 5: Create porting checklist**

Create `docs/telegram/self-register-porting.md` using spec §"OSS starter porting checklist" verbatim, then add a section "Manual recovery for group→supergroup migration" (deferred from spec staffreview Improvement 2):

```markdown
### Manual recovery for group→supergroup migration

Telegram may upgrade a group to a supergroup, which creates a new chatId (the
old one becomes inert). The current registry does NOT auto-handle
`migrate_to_chat_id` updates (deferred). Manual recovery:

1. In `/admin/telegram-chats`, archive the old chatId row.
2. Add the bot to the new supergroup (it inherits members).
3. Send `/register@<bot>` in the new supergroup.
4. Assign the same role to the new row.
```

- [ ] **Step 6: CLAUDE.md pitfall**

Append to `CLAUDE.md` Common Pitfalls (per spec §"Documentation deliverables", per CLAUDE.md's own meta-rule "discipline rules live where the agent reads them at invocation time"):

```markdown
21. **Adding a 3rd+ Telegram flow — extend `KNOWN_TELEGRAM_ROLES`, do NOT hardcode env vars** — Phase 85 replaced the single `TELEGRAM_CHAT_ID` env var with a `telegramChats` registry. To add a new bot-delivery destination (e.g. `delivery-alerts`):
   1. Add `"delivery-alerts"` to `KNOWN_TELEGRAM_ROLES` in `convex/telegram/config.ts`.
   2. Write the send-action using `getChatIdByRole({ role: "delivery-alerts" })`.
   3. Operator adds bot to the new group + sends `/register@FrollieProBot`.
   4. Operator assigns role in `/admin/telegram-chats`.
   No code change needed for the chatId lookup, no new env var, no `seedChatFromEnv` call (those are for the legacy pack-list migration only).
```

- [ ] **Step 7: OSS-starter draft note**

In `docs/superpowers/plans/2026-05-27-convex-telegram-bot-starter-oss-draft.md`, add a note (at the top of the relevant section, or in a dedicated "Updates" section):

```markdown
> **Update 2026-05-28:** Self-registration mechanics shipped in Frollie as Phase 85.
> When this OSS starter is extracted, backport `convex/telegram/chatRegistry.ts`
> (verbatim), `convex/telegram/config.ts` (consumer-adapted), and
> `src/pages/TelegramChatsManager.tsx` (UI shell). See porting checklist
> `docs/telegram/self-register-porting.md`.
```

- [ ] **Step 8: MEMORY.md update**

Add to `MEMORY.md` "Active Work" + "Milestones Shipped" sections (per project memory conventions — terse, factual). If Phase 85 lands as part of v2.1, update the milestone table; if it's a standalone phase, add to the active milestone's phase log.

- [ ] **Step 9: Final commit**

```bash
git add docs/ CLAUDE.md
git commit -m "docs(85): self-register changelog + schema + porting + integration"
```

(MEMORY.md updates go in a separate commit if the user wants — memory is project-local and not always committed.)

---

### Task 14.5: Set `TELEGRAM_FALLBACK_ROLE` env var BEFORE merge (CRITICAL deploy-ordering gate)

**Files:** none modified — Convex env config only.

> **Why this is its own task and must run BEFORE merge:** Task 9 swaps `sendPackList`'s `process.env.TELEGRAM_CHAT_ID` read for `getChatIdByRole("pack-list")`. The lookup chain's env fallback ONLY fires when `TELEGRAM_FALLBACK_ROLE === "pack-list"` AND `TELEGRAM_CHAT_ID` is set. At merge time there are NO table rows yet (`seedChatFromEnv` runs in Task 15 Step 5, AFTER deploy). If `TELEGRAM_FALLBACK_ROLE` is unset when Task 9's code goes live, the FIRST cron (07:00 or 13:00 WIB) throws `Error("No Telegram chat assigned to role 'pack-list'")` and the pack list silently fails to deliver. This is the single most likely production break in the whole phase.

- [ ] **Step 1: Set the prod env var (do BEFORE `gh pr merge`)**

```bash
npx convex env set TELEGRAM_FALLBACK_ROLE pack-list --prod
npx convex env list --prod
```
Expected in the list output: BOTH `TELEGRAM_FALLBACK_ROLE=pack-list` AND the existing `TELEGRAM_CHAT_ID=<value>` present. If `TELEGRAM_CHAT_ID` is somehow missing, STOP — do not merge until it's confirmed (the fallback has nothing to resolve to otherwise).

- [ ] **Step 2: Set the dev env var too (for the Task 13c manual smoke)**

```bash
npx convex env set TELEGRAM_FALLBACK_ROLE pack-list
npx convex env list
```
(No `--prod` = dev deployment `dev:exciting-fennec-671`.) Do this before the Task 13c smoke if not already done — otherwise the dev `/pack` command + cron throw the same error pre-seed.

This env var is removed only later, under the spec §"Step 8 hard preconditions" (all 4 must hold). Until then it is the safety net for the migration window.

---

### Task 15: PR + merge

**Files:** none modified.

**Precondition:** Task 14.5 Step 1 (prod `TELEGRAM_FALLBACK_ROLE=pack-list`) MUST be done before Step 4 (merge).

- [ ] **Step 1: Push branch**

```bash
git push origin feature/85-telegram-self-register
```

- [ ] **Step 2: Open PR**

```bash
gh pr create --title "feat(85): Telegram self-registration & multi-chat routing" --body "$(cat <<'EOF'
## Summary
- New `telegramChats` registry replacing single hardcoded `TELEGRAM_CHAT_ID`
- `/register@FrollieProBot` self-registration command + admin UI at `/admin/telegram-chats`
- `sendPackList` migrated to `getChatIdByRole("pack-list")` with `TELEGRAM_FALLBACK_ROLE` env-var soft fallback for safe migration

## Test plan
- [ ] `npm run test` — all green (22+ new cases per spec §Testing strategy)
- [ ] `npm run build` — passes; vendor bundle under cap
- [ ] Manual smoke per spec §Migration & rollout steps 1-6 (see Task 13 Step 5)
- [ ] After-merge: run `seedChatFromEnv({ role: "pack-list" })` in prod Convex dashboard, verify next cron fires

Spec: `docs/superpowers/specs/2026-05-27-telegram-self-register-design.md`
Plan: `docs/superpowers/plans/2026-05-27-telegram-self-register.md`
EOF
)"
```

- [ ] **Step 3: Wait for CI green, request review (optional triple-review per CLAUDE.md `gsd-execute-phase` triple_review_gate if this is run as a GSD phase)**

- [ ] **Step 4: Squash-merge to main**

After CI green:
```bash
gh pr merge --squash --delete-branch
```

- [ ] **Step 5: Post-merge verification**

```bash
git switch main && git pull
npx convex deploy --prod  # if CI doesn't auto-deploy
```

In production Convex dashboard:
1. Run `seedChatFromEnv({ role: "pack-list" })` ONCE. Confirm result is `inserted` / `graduated-dormant` / `already-exists-same-role` (NOT a thrown different-role error).
2. Open `/admin/telegram-chats` in prod → confirm the pack-list row shows badge `● Live`.

- [ ] **Step 6: 24h soak (Improvement 7)**

Phase 85 is NOT "shipped" until it has survived a full day of crons. The `lastError` design surfaces failures asynchronously — give them time to manifest. Watch Convex prod logs (`npx convex logs --prod`) for 24h after the seed and confirm:

- [ ] 07:00 WIB cron `"telegram morning pack list"` fired successfully (Telegram message landed in the group).
- [ ] 13:00 WIB cron `"telegram midday pack list"` fired successfully.
- [ ] No `[telegram]` warn/error log lines.
- [ ] No `recordLastError` mutation fired (no row picked up a `lastError`).
- [ ] Both crons in the SAME calendar day succeeded (catches any re-deploy / reset interaction).

If clean for 24h: mark Phase 85 fully shipped in `MEMORY.md`. The `TELEGRAM_CHAT_ID` env var stays set during the soak; remove it (and `TELEGRAM_FALLBACK_ROLE`) only when ALL four spec §"Step 8 hard preconditions" hold.

---

## Self-Review

The plan was checked against the spec on 2026-05-28, then revised on 2026-05-28 to fold in the staffreview report (`docs/reviews/staffreview-telegram-self-register-plan-2026-05-28.md`).

1. **Spec coverage:** All 22 mandatory test cases mapped to specific tasks (4=cases 1-3, 5=cases 13/14/19/20, 6=cases 4-7/11/12, 7=cases 8-10/18, 8=cases 15-17, 12=cases 21-22), plus 2 added during revision (Task 6 `listChats` non-manager/admin rejection; Task 6 `assignRole`-to-archived-chat rejection). All 5 spec "Decisions" reflected: registry-only scope (no sales-update cron), open `/register` access, string-typed `role` with TS allowlist, soft-fallback + seed mutation migration, Tier-2 admin UI.
2. **Placeholder scan:** No "TBD", "implement later", "fill in details" present. Every code step shows the actual code.
3. **Type consistency:** `KNOWN_TELEGRAM_ROLES` / `isKnownTelegramRole` / `TELEGRAM_ADMIN_URL` names match between Task 2 (config.ts), Tasks 4-7 (chatRegistry.ts), and Task 10 (admin UI). `getChatIdByRole`, `registerChat`, `replyStartHelp`, `touchChatLastSeen`, `assignRole`, `archiveChat`, `restoreChat`, `sendTestMessage`, `seedChatFromEnv`, `listChats` names consistent across schema, backend, and UI. `canAccessTelegramChats` consistent in `types.ts` (Task 3), `App.tsx` (Task 11). `TelegramChatsManager` filename matches `ChannelRoutingManager` convention.
4. **Auth pattern (resolved during revision):** Backend uses explicit-`token` args + `requireRole` on raw `query`/`mutation`/`action` (matches the spec's API table and the QRIS Phase-84 precedent). The frontend consumes named wrapping hooks (`src/hooks/convex/useTelegramChats.ts`) built on plain `useQuery`/`useMutation` + token-from-`useAuth` (mirroring `useQrisCreate.ts`), NOT `useSessionQuery`/`useSessionMutation` (which would inject `sessionId` and break the `token`-expecting backend). This also makes the RTL mock trivial (mock the named module).

### Staffreview findings folded in (2026-05-28)

- **C1 (test seed):** shared `seedAdminSession` helper in `convex/telegram/__tests__/testHelpers.ts` using the real `users` schema (`pinHash`, `failedAttempts`, `createdAt`) — no fabricated `pin`, no `as any` masking. Created in Task 6 Step 0.
- **C2 (RTL mock):** wrapping hook module + mock-by-name (replaces the broken `String(fn).includes(...)` introspection). Tasks 10 + 12.
- **C3 (deploy ordering):** new Task 14.5 sets `TELEGRAM_FALLBACK_ROLE=pack-list` in prod+dev BEFORE merge.
- **I1:** `defaultDeps()` helper in `webhookHandler.test.ts` (Task 8 Step 1a).
- **I2:** `@internal` JSDoc on `upsertChatRow` / `requireChatRow` / `recordLastError` / `seedFromEnvWrite`.
- **I3:** Rollback strategy section (above `# Tasks`).
- **I4:** Task 4 now regenerates codegen before its commit (consistency with Tasks 5-7).
- **I5:** all `npx convex codegen` invocations use `--typecheck=disable` (no `codegen` npm script; offline-safe in subagent context).
- **I6:** Task 8 Step 1b replaces the fragile "rename `runAction`→`runPack`" instruction with an explicit per-case rewrite table.
- **I7:** Task 15 Step 6 24h soak before declaring "shipped".
- **Edge case (§11):** `assignRole` rejects assigning a role to an archived chat (silent dead-end guard) + test.

---

## Wave-level execution notes for subagent dispatch

| Wave | Tasks | Parallelism | Why this boundary |
|------|-------|-------------|---|
| 1 | 1, 2, 3 | 3 parallel | Three different files, no cross-file dependencies. |
| 1.5 | 3.5 | Sequential gate | `npx convex codegen --typecheck=disable` MUST run before Wave 2 imports `_generated/api` for the new schema. |
| 2 | 4, 5, 6, 7 | Sequential (same file) | All four append to `chatRegistry.ts` (+ co-located tests; Task 6 also creates `testHelpers.ts`) — one subagent per task, ordered. Splitting parallel would conflict. |
| 3 | 8, 9 | 2 parallel | Different files (`webhook.ts` vs `sendPackList.ts`); both depend on Wave 2 outputs but not each other. |
| 4 | 10 then (11, 12) | Sequential, then 2 parallel | Task 10 creates the hook module + page; Task 11 imports the page (route), Task 12 imports the page (RTL) — 11 and 12 don't touch each other. |
| 5 | 13a, 13b, 13c | Sequential | Type-check → tests → build → audit → manual smoke. Each step needs the previous to pass. |
| 6 | 14, 14.5, 15 | Sequential | Docs → set prod `TELEGRAM_FALLBACK_ROLE` env (Task 14.5) → merge. Task 14.5 MUST precede the merge in Task 15. |

Total ≈ 18 subagent/inline dispatches across 6 waves (Tasks 1, 2, 3, 3.5, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13a, 13b, 13c, 14, 14.5, 15 — several are inline Bash/Edit, not full subagent dispatches). Wave 2 is the longest leg (4 sequential tasks in one file); consider splitting `chatRegistry.ts` into 2-3 sub-modules if Wave 2 ergonomics matter more than the OSS-portability guideline of "one mechanics file".
