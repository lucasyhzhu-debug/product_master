# Telegram self-registration & multi-chat routing — design spec

**Status:** Approved (brainstorming + staffreview complete) — ready for implementation plan
**Date:** 2026-05-27 (staffreview revisions applied same day)
**Owner:** Lucas
**Context:** Frollie Recipe Master Phase 85 (proposed) — extending Phase 167's pack-list bot
**Staffreview:** `docs/reviews/staffreview-telegram-self-register-2026-05-27.md` (all Critical findings folded in below)
**Companion docs to update post-merge:**
- `docs/telegram/telegram-bot-integration.md` (new Variant C section)
- `docs/telegram/self-register-porting.md` (new — OSS-starter porting checklist)
- `docs/superpowers/plans/2026-05-27-convex-telegram-bot-starter-oss-draft.md` (reference the new capability)
- `docs/CHANGELOG.md`, `docs/SCHEMA.md`, `docs/FILE_MAP.md` (per CLAUDE.md post-merge rules)

---

## Why

FrollieProBot currently delivers two pack-list messages a day to one hardcoded Telegram chat (`-1003850448517`). The chat ID lives in a single `TELEGRAM_CHAT_ID` env var, so adding a second group — for sales updates, delivery alerts, or any future flow — would require either repurposing the env var (breaks pack-list) or adding parallel env vars + manual chat-ID discovery for every new group (operational friction, no audit trail, easy to misconfigure).

This spec replaces the single-chat env-var model with a **self-registration registry**: any group the bot is added to can register itself with one `/register@FrollieProBot` command, after which a Frollie admin assigns it a semantic role (e.g. `pack-list`, `sales-updates`) in a gated admin UI. Send-actions look up chat IDs by role at send time, decoupling Telegram identity from application semantics.

The design is built **portably from day one** so the same code can be lifted into the OSS Convex Telegram Bot Starter (currently a draft at `docs/superpowers/plans/2026-05-27-convex-telegram-bot-starter-oss-draft.md`) as a generic capability — every Frollie-specific bit lives in one config module.

---

## Goals

1. **Zero-effort chat capture.** Add bot to a group, send `/register@FrollieProBot`, done. No `curl getUpdates`, no env var edits, no PowerShell.
2. **Role-based routing.** Code refers to chats by semantic role (`"pack-list"`, `"sales-updates"`) — never raw chat IDs.
3. **Operational visibility.** Admin UI shows which chats are registered, which are dormant vs live, when each was last seen, what error (if any) the bot last hit.
4. **Reusable for the OSS starter.** Mechanics module is generic; Frollie-specific concerns isolated in `config.ts`.
5. **Backward-compatible migration.** Existing pack-list cron must not break during rollout.

## Non-goals

- **Content of sales-update messages.** Out of scope. This spec ships the registry infrastructure; the sales-update action + cron is a separate future phase.
- **`my_chat_member` auto-detection.** Considered and deferred. Explicit `/register` is more legible and avoids broader Telegram API permissions. Can be added as a polish layer later.
- **Multi-chat-per-role.** Each role maps to exactly one active chat. Multi-fanout (e.g. send pack-list to two groups) is out of scope.
- **Per-chat send log table.** Tier-3 admin UI premium feature. Deferred until there's a concrete operational need.
- **Telegram-admin-only access on `/register`.** Considered and deferred. Registration is inert without role assignment, which is itself gated by the (auth-protected) Frollie admin UI. Three locked doors already.

---

## Decisions (the 5 forks from brainstorming)

| # | Question | Decision | Reasoning |
|---|---|---|---|
| 1 | Scope: registry only, or registry + sales-update cron? | **Registry only** | Registry is the harder/more reusable infrastructure. Sales-update content is its own product question deserving a focused round. |
| 2 | `/register` access control: open, Telegram-admin, or allowlist? | **Open** | Registration is inert; role assignment is gated in the manager+admin UI. Webhook is forgery-proof via secret token. |
| 3 | Role taxonomy in schema: literal union or open string? | **Open string + TS-level allowlist const** | OSS-portable (downstream consumers don't fork the schema). Same compile-time safety in app code via const-asserted array. Lower migration cost forever (no `_generated/api.d.ts` staleness — see Phase 76/81 lessons). |
| 4 | Migration from `TELEGRAM_CHAT_ID` env var: hard cutover, soft fallback, bootstrap-on-first-call, or soft fallback + seed mutation? | **Soft fallback in lookup helper + one-time `seedChatFromEnv` mutation** | No magic in the read path. Queries can call the lookup safely (no surprise writes). Env var still works if not promoted (good OSS starting state). Explicit, audit-trail-visible promotion event. |
| 5 | Admin UI scope: minimum / solid / premium? | **Tier 2 (solid) + one-chat-per-role uniqueness** | Test-send, status badges, soft-delete, lastSeenAt + lastError columns all earn their keep. Uniqueness-on-role prevents accidental dual-routing. |

### Frontend-design refinements (applied to §4)

- **First-run empty state** with personality — speech-bubble visual + numbered registration steps + click-to-copy command block. Teaches the registration workflow to first-time admins.
- **Test-send confirmation** preview — shows the exact message that will be sent in a Telegram-style mock bubble before dispatch. Reduces "wait, what am I about to send?" hesitation.
- **Inline error treatment** — when `lastError` is set, an indented subordinate row renders beneath the chat row with muted red background and full error text. Always-visible (not behind a hover).
- **Kebab menu for row actions** — replaces `[Test send][Archive]` with a single `⋯` dropdown. Frees table width.
- **Colored-dot status badges** — `●Live` / `○Dormant` / `⚠Error` / `▣Archived` — lighter visual weight than full pills.

Deliberately NOT applied: display fonts, page-load orchestration, hero treatment, custom cursors, dark-mode-only treatments. The page must match existing `/admin/channel-routing` aesthetic.

---

## Architecture

```
┌────────────────────────┐
│ Telegram (any chat)    │
└──────────┬─────────────┘
           │ /register@FrollieProBot
           ▼
┌────────────────────────────────────────────┐
│ httpAction: handleTelegramWebhook          │
│   ├─ secret-token check (existing)         │
│   ├─ dedupe via telegramUpdates (existing) │
│   └─ command dispatch (NEW)                │
│        ├─ /pack    → sendPackList          │
│        └─ /register → registerChat         │
│   plus: non-command messages → touchChatLastSeen (UPDATE-only) │
└──────────┬─────────────────────────────────┘
           │ insert/upsert
           ▼
┌────────────────────────┐         ┌──────────────────────────────┐
│ telegramChats          │◄────────┤ Admin UI                     │
│  chatId, type, title,  │ assign  │ /admin/telegram-chats        │
│  role, lastSeenAt,     │ role    │   - list, filter, search     │
│  archivedAt, lastError │         │   - role dropdown            │
└──────────┬─────────────┘         │   - test-send preview        │
           │ resolve               │   - archive / restore        │
           │                       └──────────────────────────────┘
           ▼
┌────────────────────────┐
│ getChatIdByRole(role)  │ ──► table → env var fallback → throw
└──────────┬─────────────┘
           ▼
┌────────────────────────┐
│ sendPackList action    │ (and future sendSalesUpdate, etc.)
│ sendTelegramHtml(...)  │
└────────────────────────┘
```

### New files (5)

| Path | Purpose |
|---|---|
| `convex/telegram/chatRegistry.ts` | `registerChat` action, `seedChatFromEnv` action, `getChatIdByRole` helper, `listChats` query, `assignRole` / `archiveChat` / `restoreChat` mutations, `sendTestMessage` action, `touchChatLastSeen` mutation |
| `convex/telegram/config.ts` | `KNOWN_TELEGRAM_ROLES` const, `TELEGRAM_ADMIN_URL` const, `isKnownTelegramRole` type guard |
| `convex/telegram/__tests__/chatRegistry.test.ts` | Unit tests for parseCommand, getChatIdByRole, assignRole |
| `src/pages/TelegramChatsManager.tsx` | Admin UI page (follows `ChannelRoutingManager.tsx` naming convention) |
| `docs/telegram/self-register-porting.md` | OSS-starter porting checklist (created post-implementation) |

### Touched files (4)

| Path | Change |
|---|---|
| `convex/schema.ts` | Add `telegramChats` table + 3 indexes |
| `convex/telegram/webhook.ts` | Generalize `parseCommand`, dispatch on `/pack` vs `/register`, route non-command messages to `touchChatLastSeen` |
| `convex/telegram/sendPackList.ts` | Swap `process.env.TELEGRAM_CHAT_ID` for `ctx.runQuery(internal.telegram.chatRegistry.getChatIdByRole, { role: "pack-list" })` |
| `src/App.tsx` (router) | Register `/admin/telegram-chats` route with `<ProtectedRoute requiredPermission="canAccessTelegramChats">` |
| `src/lib/types.ts` | Add `canAccessTelegramChats: boolean` field to `ROLE_PERMISSIONS` (true for `manager` + `admin`, false elsewhere). Permission type is `keyof typeof ROLE_PERMISSIONS.admin` per `ProtectedRoute.tsx:8` — string-based permissions are not supported by this codebase. |

### Reused components

- `decideWebhookOutcome` pure-handler / dep-injection pattern
- `sendTelegramHtml` from `convex/lib/telegramHtml.ts` (already chat-agnostic)
- `recordIfNew` R5 atomic dedupe
- shadcn `Table`, `Badge`, `Select`, `AlertDialog`, `Popover`, `DropdownMenu`, `Switch`, `Input`
- `useSessionQuery` / `useSessionMutation` / `useSessionAction` hooks
- `formatRelativeTime` from `src/lib/dateUtils.ts`

---

## Schema

```ts
// convex/schema.ts
telegramChats: defineTable({
  // identity (immutable post-registration)
  chatId: v.string(),
  chatType: v.union(
    v.literal("private"),
    v.literal("group"),
    v.literal("supergroup"),
  ),
  title: v.string(),

  // role assignment (mutable via admin UI)
  role: v.optional(v.string()), // validated against KNOWN_TELEGRAM_ROLES in app code

  // provenance
  registeredBy: v.optional(v.number()),
  registeredAt: v.number(),
  lastSeenAt: v.number(),

  // operational state
  archivedAt: v.optional(v.number()),
  lastError: v.optional(v.object({
    at: v.number(),
    message: v.string(), // truncated to exactly 200 chars; append "…" if truncated
  })),
})
  .index("by_chatId", ["chatId"])
  .index("by_role_archived", ["role", "archivedAt"]),
```

**Index design note** (staffreview Improvement 1): a single compound index `by_role_archived` covers both lookup patterns:
- `getChatIdByRole(role)` — `q.eq("role", role).eq("archivedAt", undefined)` (O(log n), index-only)
- `listChats({ includeArchived: false })` — iterate by `archivedAt = undefined` rows for active-list

Per the MEMORY lesson "Convex index range bounds: both bounds MUST be inside `.withIndex()` — `.filter()` is post-scan", a separate `by_role` index would force `archivedAt = undefined` into post-scan filter (anti-pattern). Compound index avoids it. For a <100-row table the perf impact is irrelevant, but pattern-consistency matters for code review and the OSS-starter port.

### Schema decisions

- **`chatId` as `v.string()`** — Telegram's API accepts string-or-number; string sidesteps the `-100NNNNNNNNNN` 13-digit range that's near `Number.MAX_SAFE_INTEGER`. Also matches the existing `TELEGRAM_CHAT_ID` env var shape.
- **`role` as `v.optional(v.string())`** — see Decision 3 above. Validation lives in app code via the `isKnownTelegramRole` type guard.
- **`lastError` as nested object** — `{ at, message }` prevents readers from accidentally consuming the timestamp without the message. Matches the QRIS integration error-logging pattern (`convex/integrations/qris/`).
- **`registeredBy` as optional `v.number()`** — Telegram user IDs are integers safely within JS number range.

---

## Config module (`convex/telegram/config.ts`)

```ts
// Single source of truth for app-level role allowlist.
// OSS starter: ships with KNOWN_TELEGRAM_ROLES = [] and a "// add your roles here" comment.

export const KNOWN_TELEGRAM_ROLES = [
  "pack-list",
  "sales-updates",
] as const;

export type TelegramRole = (typeof KNOWN_TELEGRAM_ROLES)[number];

export function isKnownTelegramRole(s: string): s is TelegramRole {
  return (KNOWN_TELEGRAM_ROLES as readonly string[]).includes(s);
}

// URL the bot includes in /register reply — points to the admin UI page.
// OSS starter: reads from process.env.TELEGRAM_ADMIN_URL with a placeholder default.
export const TELEGRAM_ADMIN_URL = "https://recipe.frollie.com/admin/telegram-chats";
```

---

## Backend behavior

### Webhook command dispatch (`convex/telegram/webhook.ts`)

Generalize the existing `/pack` regex:

```ts
function parseCommand(text: string): "pack" | "register" | "start" | null {
  const m = /^\/(pack|register|start)(@[A-Za-z0-9_]+)?$/.exec(text.trim());
  return m ? (m[1] as "pack" | "register" | "start") : null;
}
```

Strict-mode preserved — no trailing args (typo protection from the original `/pack` rationale applies equally to `/register` and `/start`).

Webhook dispatches via `ctx.scheduler.runAfter(0, …)`:

| Command | Effect |
|---|---|
| `/pack` | Existing `sendPackList({ reason: "command" })` |
| `/register` | NEW `registerChat({ chatId, chatType, title, registeredBy })` |
| `/start` | NEW `replyStartHelp({ chatId })` — one-line reply: `"Hi! I'm FrollieProBot. Send /register@FrollieProBot to register this chat."` |
| (other unknown command) | Silent ack (200, no effect) |
| (non-command) | `touchChatLastSeen({ chatId })` — UPDATE-only, no insert |

The `/start` reply is the only response to an "unknown intent" — chosen because `/start` is the default Telegram intro action when a user adds a bot to a DM or clicks the Start button. All other unknown slash-commands are silently acked (low noise, no false discovery of unimplemented commands).

`recordIfNew` (R5 atomic dedupe) runs before any scheduled work — applies to both commands. Non-command messages are NOT deduplicated by `update_id` (lastSeenAt updates are idempotent by `chatId`).

### `registerChat` action

Internal action. Three behaviors based on existing row state:

| Existing row | Effect | Confirmation message |
|---|---|---|
| None | Insert row with `role: undefined` | `✅ Chat registered as "<title>" (supergroup). Assign a role at <admin URL>` |
| Exists, no role | Patch `lastSeenAt` | `ℹ️ Already registered (no role assigned yet). Assign at <admin URL>` |
| Exists, has role | Patch `lastSeenAt` | `ℹ️ Already registered as role <b>sales-updates</b>. Change at <admin URL>` |

All three responses use the existing `sendTelegramHtml` helper, HTML-escape the chat title, and reply to the chat that ran `/register` (not the pack-list chat).

### `getChatIdByRole` lookup helper

The core indirection that every send-action goes through. Three-step fallback chain:

```
1. Query telegramChats by_role_archived (active rows only)
   ├─ Match? → return row.chatId
   └─ No match ↓
2. If process.env.TELEGRAM_FALLBACK_ROLE is set AND equals role,
   fall back to process.env.TELEGRAM_CHAT_ID
   ├─ Set? → return env value
   └─ Unset ↓
3. Throw Error("No Telegram chat assigned to role X")
```

Single API shape (staffreview Improvement 4): one `internalQuery` exported as `getChatIdByRole({ role: string })`. Mutations can call it directly via the underlying db (queries are read-only siblings); actions call it via `ctx.runQuery(internal.telegram.chatRegistry.getChatIdByRole, { role })`. Single source of truth — no `getChatIdByRoleForAction` parallel export.

**Fallback configuration** (staffreview Improvement 5): the env-fallback target role is driven by `TELEGRAM_FALLBACK_ROLE` env var rather than hardcoded `"pack-list"`. Frollie sets `TELEGRAM_FALLBACK_ROLE=pack-list` during the migration window; OSS-starter consumers can set any role they want; both populations can unset post-migration with identical effect. Makes `chatRegistry.ts` fully generic with zero Frollie-specific branches.

### `seedChatFromEnv` internal action

One-time bootstrap. Admin runs it from the Convex dashboard once per deployment.

**Signature:** `seedChatFromEnv({ role: string })`

**Behavior:**
1. Validate `args.role` against `isKnownTelegramRole` (throw `ConvexError` with the allowed-roles list if invalid).
2. Read `TELEGRAM_BOT_TOKEN` + `TELEGRAM_CHAT_ID` from env (throw clear error if either missing).
3. Call `GET https://api.telegram.org/bot<token>/getChat?chat_id=<id>` to discover `title` + `type`. If the call fails (non-2xx, ok=false, network error), throw with the Telegram error description — do NOT proceed to insert with garbage data.
4. Branch on existing-row state:

| Pre-existing row (lookup by `chatId`) | Action | Return |
|---|---|---|
| None | INSERT new row with `role: args.role`, `lastSeenAt: now`, `registeredAt: now` | `{ status: "inserted", chatId, title, role }` |
| Exists, `role === undefined` | PATCH `role: args.role` (graduate the dormant row) | `{ status: "graduated-dormant", chatId, title, role }` |
| Exists, `role === args.role` | No-op (idempotent re-run) | `{ status: "already-exists-same-role", chatId, title, role }` |
| Exists, `role !== args.role` | **THROW** `ConvexError("Chat <id> already registered with role '<existing>'. Use /admin/telegram-chats to reassign.")` | (error) |

After running successfully, `TELEGRAM_CHAT_ID` env var becomes harmless cruft — table lookup hits first.

The "throw on different role" branch is **intentional and non-idempotent** — it forces the admin to make an explicit reassignment decision in the gated UI rather than letting a dashboard mutation silently overwrite role state.

### `touchChatLastSeen` mutation

Tiny update-only mutation, called from the webhook on every non-command message.

```
WHERE chatId = X AND archivedAt IS NULL
  IF found: SET lastSeenAt = now()
  IF not found: no-op (do NOT insert — pollution prevention)
```

Triggers on `@FrollieProBot` mentions + replies to bot messages (the only non-command updates the bot receives under privacy mode).

---

## Admin UI (`/admin/telegram-chats`)

### Gating

```
<ProtectedRoute requiredPermission="canAccessTelegramChats">
  <TelegramChatsManager />
</ProtectedRoute>
```

`canAccessTelegramChats` is a new boolean field added to `ROLE_PERMISSIONS` at `src/lib/types.ts:710` — set `true` for `manager` and `admin`, `false` for `kitchen` and `order_staff`. The permission system is boolean-field-based (`keyof typeof ROLE_PERMISSIONS.admin` per `src/components/auth/ProtectedRoute.tsx:8`), NOT string-based — `"<entity>:<action>"` strings are not supported and would fail type-check.

All backend mutations / actions guarding writes use `requireRole(ctx, args.token, ["manager", "admin"])` — symmetric with the gate per Common Pitfall #19.

### Page layout

```
┌─────────────────────────────────────────────────────────────────────────┐
│ Telegram Chats                              [ ] Show archived           │
│ Manage chats where FrollieProBot delivers messages.                     │
│ Add the bot to a group and send /register@FrollieProBot to begin.       │
├─────────────────────────────────────────────────────────────────────────┤
│ [🔍 Search by title or role...                                  ]       │
├─────────────────────────────────────────────────────────────────────────┤
│ Title                  Type    Chat ID    Role          Status   Seen   Actions │
│ ──────────────────────────────────────────────────────────────────────────────  │
│ Frollie · Operations   group   -100…517   [pack-list ▾] ●Live    2m ago  ⋯     │
│ Frollie · Sales        super   -100…203   [None       ▾] ○Dormant 1h ago ⋯     │
│ Dev test chat          group   -100…891   [None       ▾] ⚠Error   3d ago ⋯     │
│   ⚠ 2d ago — Forbidden: bot was kicked from the group                           │
└─────────────────────────────────────────────────────────────────────────┘
```

### Empty state (first-run)

```
┌─────────────────────────────────────────────────────────────────────────┐
│        ╭──────────────────────╮                                         │
│        │  ✈                   │   ← CSS-only speech bubble              │
│        │  Hi! I'm @FrollieProBot │                                       │
│        ╰──────────╲───────────╯                                          │
│                                                                         │
│         No chats registered yet                                         │
│                                                                         │
│         1.  Add @FrollieProBot to your Telegram group                  │
│         2.  Send  ┌─────────────────────────────┐  📋 copy             │
│                   │ /register@FrollieProBot     │                       │
│                   └─────────────────────────────┘                       │
│         3.  Come back here and assign a role                           │
└─────────────────────────────────────────────────────────────────────────┘
```

### Convex API surface

| Function | Type | Auth | Purpose |
|---|---|---|---|
| `listChats({ includeArchived })` | query | session via `useSessionQuery` | Page data |
| `assignRole({ token, chatId, role \| null, forceReassign })` | mutation | manager+admin | Set / clear role; uniqueness enforced |
| `archiveChat({ token, chatId })` | mutation | manager+admin | Set `archivedAt = Date.now()`; clear `role` in one atomic patch |
| `restoreChat({ token, chatId })` | mutation | manager+admin | Clear `archivedAt` |
| `sendTestMessage({ token, chatId })` | action | manager+admin | Send "🧪 Test from FrollieProBot — wiring works! Sent at HH:MM:SS WIB."; populates `lastError` on failure |

#### Backend validation invariants (apply to ALL write functions above)

Every write must perform **two guards** at the top of the handler, before any DB write, after `requireRole`:

1. **`chatId` existence check** — load the row by index `by_chatId`. If `unique()` returns `null`, throw `ConvexError("No registered Telegram chat with id '<chatId>'")`. Prevents direct-API calls from silently no-op-ing with fabricated chatIds.
2. **`role` allowlist check** (assignRole only) — if `args.role !== null`, validate via `isKnownTelegramRole(args.role)`. If false, throw `ConvexError("Unknown telegram role: '<role>'. Must be one of: <KNOWN_TELEGRAM_ROLES.join(", ")>")`. Prevents a bypass of the OSS-portable string-typed schema by writing arbitrary role strings (per the schema-vs-app-validation tradeoff in Decision 3).

`seedChatFromEnv` performs the same role allowlist check (step 1 in its behavior block above). `sendTestMessage` performs only the existence check (no role arg).

#### Reassignment atomicity (assignRole with `forceReassign: true`)

When called with `forceReassign: true` and another chat already holds the requested role, the mutation performs both writes in a single handler — `db.patch(oldHolder._id, { role: undefined })` AND `db.patch(targetRow._id, { role: args.role })` — within the same Convex mutation transaction. Convex serializes mutations on the read set, so no other admin can observe a state where neither chat OR both chats hold the role. This is the riskiest concurrent operation in the build and is explicitly tested (see Testing strategy).

### Component behaviors

**Role dropdown** — options = `KNOWN_TELEGRAM_ROLES` + "None":
- Pick role → frontend checks `listChats` data for current holder.
  - Unassigned or this row already holds it: dispatch `assignRole({ chatId, role })`.
  - Another chat holds it: open `<AlertDialog>` — *"<role> is currently delivered to '<current chat>'. Reassign to this chat?"* with [Cancel] / [Reassign].
  - Confirm: dispatch `assignRole({ chatId, role, forceReassign: true })`. Backend unsets old holder + sets new in one atomic mutation.
- Pick "None": dispatch `assignRole({ chatId, role: null })`. No prompt.
- Toast on success/error.

**Test-send button** — opens preview popover showing exact message (`"🧪 Test from FrollieProBot — wiring works! Sent at 14:32:01 WIB."`) in a Telegram-style mock bubble + [Cancel] / [Send to Telegram]. On confirm: dispatch action; spinner; success toast. On failure: `lastError` patched, inline error row appears.

**Archive button** — `<AlertDialog>` confirm — *"Archive this chat? Cron jobs and tests will stop delivering here. You can restore later."* — then `archiveChat({ chatId })`.

**Restore button** — visible only when `archivedAt` set AND `showArchived === true`. One click, no prompt.

**Status badge** — computed inline:

| Condition | Badge |
|---|---|
| `archivedAt` set | gray dot `▣ Archived` |
| `lastError` exists, age < 24h | red dot `⚠ Error` |
| `role` set | green dot `● Live` |
| otherwise | amber dot `○ Dormant` |

**Search filter** — client-side `.filter()` on the chat list. Matches `title` (case-insensitive substring) OR `role` (exact). No debounce, no backend round-trip.

**Show archived toggle** — flips `includeArchived` query arg. Convex re-subscribes automatically (reactive).

**Code estimate:** ~280 LOC for page + ~30 LOC backend API surface = ~310 LOC.

---

## Migration & rollout

| Step | Action | Risk | Reversible? |
|---|---|---|---|
| 1 | Deploy schema + new code (additive only — `sendPackList` still hits env-var-fallback path because no table rows exist yet) | None — identical behavior | Yes (git revert) |
| 2 | Webhook already registered with `message` updates — no change needed | None | n/a |
| 3 | Run `seedChatFromEnv({ role: "pack-list" })` from Convex dashboard | Creates one row | Yes (delete row in dashboard) |
| 4 | Verify: open `/admin/telegram-chats`, see pack-list row as "Live", click "Test send", confirm message lands in group | None | n/a |
| 5 | Add `@FrollieProBot` to new sales group, send `/register@FrollieProBot` | Adds a Dormant row | Yes (archive in admin UI) |
| 6 | Assign `sales-updates` role to the new row | None — role is dormant until a future cron uses it | Yes (set role to None) |
| 7 | (Future phase) Build sales-update content + cron — out of scope | n/a | n/a |
| 8 | (Optional, later) Delete `TELEGRAM_CHAT_ID` env var — hard preconditions below | Very low — fallback is gone, table is authoritative | Yes (re-set env var) |

**Step 8 hard preconditions (all must hold before running `npx convex env remove --prod TELEGRAM_CHAT_ID`):**

1. `listChats({ includeArchived: false })` returns at least one row with `role: "pack-list"` and `archivedAt: undefined`.
2. Convex logs show cron `"telegram morning pack list"` succeeded at least once after the seed mutation ran.
3. Convex logs show cron `"telegram midday pack list"` succeeded at least once after the seed mutation ran.
4. `TELEGRAM_FALLBACK_ROLE` env var is also unset (otherwise the fallback chain still tries to resolve env-driven role and just silently fails to find `TELEGRAM_CHAT_ID`).

---

## Testing strategy

Mirror existing `convex/telegram/__tests__/` pattern. All test cases listed below are MANDATORY — staffreview promoted role-reassignment, dedupe-idempotency, and validation-rejection cases from "optional" to Critical because they cover the non-trivial state transitions in the build.

### Test files

| Test file | Coverage |
|---|---|
| `chatRegistry.test.ts` (new) | `parseCommand` regex + all `chatRegistry.ts` exports — see exhaustive list below |
| `webhookHandler.test.ts` (extend existing) | Webhook routing extensions for `/register` + non-command updates |
| `registerChatReply.test.ts` (new) | Confirmation message format: HTML escape correctness for chat titles with `<>&`, three states (new / dormant / live) |
| `TelegramChatsManager.test.tsx` (new RTL) | Role-reassignment dialog + status badge derivation |

### Exhaustive case list (12 mandatory, beyond the headline file table)

| # | Case | File | Why it matters |
|---|---|---|---|
| 1 | `parseCommand` good inputs (`/pack`, `/register`, `/pack@FrollieProBot`, `/register@FrollieProBot`) | chatRegistry | regression on existing /pack |
| 2 | `parseCommand` bad inputs (trailing args, wrong slash, empty, whitespace, case variants) | chatRegistry | strict-mode protection |
| 3 | `getChatIdByRole` lookup chain — table hit, env fallback, throw on neither | chatRegistry | three branches of the fallback |
| 4 | `assignRole` reassignment atomicity (two-row mutation in one tick) | chatRegistry | riskiest concurrent operation in the build |
| 5 | `assignRole` rejects invalid role string (Critical 4 fix) | chatRegistry | validation gap blocked at backend |
| 6 | `assignRole` rejects missing chatId (Critical 5 fix) | chatRegistry | existence guard |
| 7 | `assignRole` clears role (role=null) without forceReassign | chatRegistry | "None" path |
| 8 | `seedChatFromEnv` missing env vars (BOT_TOKEN or CHAT_ID unset) | chatRegistry | three error branches |
| 9 | `seedChatFromEnv` Telegram getChat API failure (mocked 401) | chatRegistry | external-call error path |
| 10 | `seedChatFromEnv` four row-existence sub-cases (none / dormant / same role / different role) | chatRegistry | Critical 3 fix — each branch tested |
| 11 | `archiveChat` clears role atomically (archivedAt set AND role undefined in one tick) | chatRegistry | soft-delete invariant |
| 12 | `archiveChat` / `restoreChat` reject missing chatId (Critical 5 fix) | chatRegistry | existence guard |
| 13 | `touchChatLastSeen` no-op for unregistered chat (pollution prevention) | chatRegistry | design choice; regression risk if "fixed" later |
| 14 | `touchChatLastSeen` no-op for archived chat | chatRegistry | archived rows are inert |
| 15 | Webhook `/register` routes to `registerChat` (extends existing test) | webhookHandler | routing correctness |
| 16 | Webhook `/register` dedupe — same `update_id` twice scheduled once | webhookHandler | known QRIS retry-loop lesson (MEMORY) |
| 17 | Webhook non-command message routes to `touchChatLastSeen` | webhookHandler | last-seen tracking |
| 18 | `sendTestMessage` populates `lastError` on Telegram 403 (mocked) | chatRegistry | operational visibility |
| 19 | `registerChat` HTML-escapes chat title with `<>&` chars in confirmation message | registerChatReply | XSS-via-HTML-parse-mode prevention |
| 20 | `registerChat` confirmation message text for three states (new / dormant / live) | registerChatReply | UX correctness |
| 21 | RTL: role-reassignment AlertDialog renders + dispatches `assignRole({forceReassign: true})` on confirm | TelegramChatsManager.test.tsx | non-trivial interactive flow |
| 22 | RTL: status badge derivation — four states (archivedAt / lastError fresh / role set / dormant) | TelegramChatsManager.test.tsx | derived-view correctness |

### Test execution checkpoints

1. **After Wave 2 (chatRegistry backend)** — run cases #1–#14, #16, #18, #19, #20.
2. **After Wave 5 (admin UI)** — run cases #21, #22.
3. **Before merge** — full `npm run test` + `npm run build` + manual smoke per rollout steps 4 + 5.

### Manual smoke

Covered by rollout steps 4 (test-send button against existing pack-list group) + 5 (real `/register` in a freshly-created group). No Playwright — Frollie admin pages don't have E2E coverage (consistent with `/admin/channel-routing` etc.).

### Regression risk

- Existing `webhookHandler.test.ts` test cases must continue to pass after the routing extension — verify in CI.
- Existing pack-list crons (07:00 + 13:00 WIB) — manual smoke after deploy WITHOUT seeded row (fallback path) AND after seed (registry path).

---

## Documentation deliverables

| File | Action | Reader |
|---|---|---|
| `docs/superpowers/specs/2026-05-27-telegram-self-register-design.md` | **CREATE** — this spec, committed as brainstorming step 6 | Anyone reading the brainstorm trail later |
| `docs/telegram/telegram-bot-integration.md` | **UPDATE** post-merge — add new "Variant C: Multi-chat with self-registration" section after the existing two-way variant. Includes registration flow, schema sketch, role-to-action lookup pattern | Future devs setting up Telegram in any Convex project |
| `docs/telegram/self-register-porting.md` | **CREATE** post-merge — porting checklist for the OSS starter | Anyone porting to a new Convex repo |
| `docs/superpowers/plans/2026-05-27-convex-telegram-bot-starter-oss-draft.md` | **UPDATE** post-merge — note that self-registration has been built in Frollie and should be backported when the starter is extracted | Future you maintaining the OSS starter draft |
| `docs/CHANGELOG.md` | **UPDATE** post-merge — record the feature (per CLAUDE.md rule). See draft below. | All readers |
| `docs/SCHEMA.md` | **UPDATE** post-merge — add `telegramChats` table to schema docs | Backend developers |
| `docs/FILE_MAP.md` | **UPDATE** post-merge — add the new admin route + permission to the role/route table | Access control |
| `CLAUDE.md` | **UPDATE** post-merge — add a new Common Pitfall for the role-by-registry pattern (so future devs adding a 3rd Telegram flow add to `KNOWN_TELEGRAM_ROLES` + assign via admin UI, not hardcode env vars). Per CLAUDE.md's "Workflow-discipline feedback retired into SKILLs" lesson — discipline rules live where the agent reads them at invocation time. | Future Telegram contributors |

### CHANGELOG draft

```markdown
## 2026-XX-XX - Telegram self-registration & multi-chat routing

- New `/register@FrollieProBot` command to self-register Telegram chats — no manual `getUpdates`/curl required.
- New admin UI `/admin/telegram-chats` for role assignment, test-send preview, archive/restore, last-seen + error visibility.
- Send-actions now resolve chat IDs by semantic role (`pack-list`, `sales-updates`) via the new `telegramChats` registry.
- Existing pack-list cron migrated to registry seamlessly; `TELEGRAM_CHAT_ID` env var retained as fallback during migration window (controlled by new `TELEGRAM_FALLBACK_ROLE` env var).
- New permission `canAccessTelegramChats` (manager + admin).
- Self-registration design portable to OSS Convex Telegram Bot Starter — see `docs/telegram/self-register-porting.md`.
```

---

## OSS starter porting checklist (preview of `self-register-porting.md`)

When the OSS starter is extracted (or backported to today, when ready), the lift is:

| Generic — copy verbatim | Adapt per consumer |
|---|---|
| `convex/telegram/chatRegistry.ts` — registry mechanics | `convex/telegram/config.ts` — `KNOWN_TELEGRAM_ROLES = []`, `TELEGRAM_ADMIN_URL = process.env.TELEGRAM_ADMIN_URL` |
| `convex/telegram/webhook.ts` — `decideWebhookOutcome` command dispatch | `parseCommand` regex — extend with project-specific commands beyond `/pack` |
| `convex/lib/telegramHtml.ts` — already generic | Auth model — `requireRole(ctx, token, ["manager", "admin"])` becomes whatever the consumer's auth pattern is |
| `convex/schema.ts` `telegramChats` table definition | Permission gating — Frollie uses `canAccessTelegramChats` (boolean keyof `ROLE_PERMISSIONS`); OSS consumers adapt to their permission taxonomy (string-based, role-based, etc.) |
| `src/pages/TelegramChatsManager.tsx` UI shell + structure | Role dropdown options — driven by consumer's `KNOWN_TELEGRAM_ROLES` |
| Tests for pure handlers (regex, lookup chain) | E2E / smoke test against the consumer's actual deployed webhook |

---

## Success criteria

- [ ] Admin can add `@FrollieProBot` to a new Telegram group, send `/register@FrollieProBot`, and see the chat appear in `/admin/telegram-chats` as "Dormant"
- [ ] Admin can assign a role from the dropdown; if another chat holds the role, the reassignment dialog appears and works
- [ ] `/admin/telegram-chats` shows accurate `lastSeenAt` (relative time) and `lastError` (when applicable) per row
- [ ] "Send test message" button delivers the test message to the selected chat and surfaces success/failure
- [ ] Archive + restore flow works; archived chats are excluded from `getChatIdByRole` lookups
- [ ] After `seedChatFromEnv({ role: "pack-list" })` runs once, the existing pack-list cron continues to fire at 07:00 + 13:00 WIB without interruption
- [ ] `npm run type-check` passes
- [ ] `npm run build` succeeds (vendor bundle under 600 kB cap)
- [ ] Backend tests pass: `parseCommand`, `getChatIdByRole`, `assignRole`, webhook routing
- [ ] Documentation deliverables (table above) all created/updated post-merge
- [ ] `canAccessTelegramChats` boolean field present in all four role rows of `ROLE_PERMISSIONS`
- [ ] Compound index `by_role_archived` used (no `by_role` or `by_archivedAt` orphans)
- [ ] `assignRole` rejects unknown role strings AND missing chatIds with `ConvexError`
- [ ] `archiveChat` / `restoreChat` / `sendTestMessage` all enforce chatId existence
- [ ] `seedChatFromEnv` documented behavior matches the 4-row-state table in spec (none / dormant / same role / different role)
- [ ] All 22 mandatory test cases in §"Testing strategy" pass

---

## Staffreview revisions log (2026-05-27)

Staffreview report at `docs/reviews/staffreview-telegram-self-register-2026-05-27.md` raised 6 Critical, 5 Improvement, 6 Refinement findings. Applied to this spec:

**All 6 Critical findings — folded in:**
1. ✅ Permission model — corrected from string `"telegram_chats:read"` to boolean `canAccessTelegramChats` (matches `keyof typeof ROLE_PERMISSIONS.admin`).
2. ✅ Admin page path — corrected from `src/pages/admin/TelegramChats.tsx` to `src/pages/TelegramChatsManager.tsx` (matches `ChannelRoutingManager.tsx` convention).
3. ✅ `seedChatFromEnv` — explicit 4-row-state behavior table added with named return statuses.
4. ✅ `assignRole` role-string validation — added `isKnownTelegramRole` guard requirement with `ConvexError` on miss.
5. ✅ chatId existence check — added as backend-validation-invariant for all 4 write functions.
6. ✅ Testing — expanded from 3 test files to 4, from ~7 implicit cases to 22 explicit mandatory cases.

**3 of 5 Improvements — folded in:**
- ✅ Improvement 1 (compound index `by_role_archived`) — applied.
- ✅ Improvement 3 (`/start` reply behavior) — applied with explicit "silent ack for other unknowns" policy.
- ✅ Improvement 4 (collapse two API shapes to one `internalQuery`) — applied.
- ✅ Improvement 5 (configurable `TELEGRAM_FALLBACK_ROLE` env var) — applied.

**1 of 5 Improvements — deferred** (with manual recovery documented):
- Improvement 2 (Telegram group→supergroup `migrate_to_chat_id` automatic handling) — deferred to follow-up phase. Manual recovery (archive old row, re-register new chat) will be documented in `docs/telegram/self-register-porting.md` post-merge.

**3 of 6 Refinements — folded in:**
- ✅ `lastError.message` truncation — made exact: "200 chars + ellipsis if truncated".
- ✅ Rollout step 8 — converted to 4 hard preconditions.
- ✅ CHANGELOG draft — added.

**3 of 6 Refinements — at implementer's discretion** (low impact, can land in writing-plans or implementation):
- Clipboard API fallback for empty state.
- Test-send timestamp staleness (compute at send vs preview).
- `registeredBy` display strategy (resolve username vs leave diagnostic-only).
