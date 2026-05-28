# Staff Review: Telegram self-registration & multi-chat routing

**Date:** 2026-05-27
**Plan:** `docs/superpowers/specs/2026-05-27-telegram-self-register-design.md`
**Reviewers:** Staff Developer (Implementation) + Principal Developer (Architecture)
**Plan Structure:** ⚠️ Sections added — see §0

---

## 0. Plan Structure Additions

This artifact is a **design spec**, not an implementation plan — the Implementation Waves / Git Workflow / Commit Checkpoint sections are intentionally deferred to the next step (`superpowers:writing-plans`). The spec covers the equivalent of: Scope, File Changes, Testing strategy, Rollout sequence, Success Criteria.

| Required by /staffreview | Present in spec? | Notes |
|---|---|---|
| Scope / Goal | ✅ "Why" + "Goals" sections | |
| File Changes | ✅ "New files (5)" + "Touched files (4)" | |
| Implementation Phases / Waves | ❌ — deferred to writing-plans | Spec-only artifact; flagged but not blocking |
| Testing | ✅ "Testing strategy" section | Insufficient coverage — see §10 |
| Success Criteria | ✅ Final section | |
| Rollback / Deployment | ✅ "Migration & rollout" section | One missing precondition — see §8 |

---

## 1. Summary

**Overall Assessment: Revise (Critical issues must be addressed before writing-plans)**

The spec is structurally sound and the architecture is the right shape — webhook command-dispatch + role-keyed registry + soft fallback to env var is a clean separation. The brainstorming arc resolved the key forks well (open registration, TS-level role allowlist, soft fallback + seed mutation, Tier 2 admin UI).

**However, two codebase-fact errors and four design-completeness gaps block approval as-is.** Both errors are misalignments with established Frollie patterns that would surface as runtime errors or pattern-divergence findings in code review. Each is a small surgical fix to the spec.

---

## 2. Critical Issues (Must Fix)

| # | Issue | Category | Location in spec |
|---|---|---|---|
| 1 | **Permission model uses non-existent string-based syntax** | Architecture / pattern | "Permissions (`src/lib/types.ts`)" + "Gating" sections |
| 2 | **Admin page path doesn't match codebase convention** | Pattern consistency | "New files (5)" + "Touched files (4)" |
| 3 | **`seedChatFromEnv` behavior undefined when row already exists** | Logic / edge case | "`seedChatFromEnv` internal action" |
| 4 | **No backend validation of role string on `assignRole`** | Security / input validation | "Convex API surface" table |
| 5 | **No backend existence check of chatId on `assignRole` / `archiveChat`** | Security / input validation | "Convex API surface" table |
| 6 | **Test coverage missing for non-trivial state transitions** | Testing | "Testing strategy" section |

### Issue 1: Permission model uses non-existent string-based syntax

The spec proposes adding a permission `"telegram_chats:read"` and gating the route with:

```tsx
<ProtectedRoute requiredPermission="telegram_chats:read">
```

But Frollie's permission model is a **boolean-field lookup table**, not string-based. From `src/components/auth/ProtectedRoute.tsx:8`:

```ts
requiredPermission?: keyof typeof ROLE_PERMISSIONS.admin;
```

And `ROLE_PERMISSIONS` in `src/lib/types.ts:710+` enumerates boolean fields:

```ts
export const ROLE_PERMISSIONS: Record<UserRole, {
  canAccessDashboard: boolean;
  canAccessKitchen: boolean;
  // ...
  canAccessInvoices: boolean;
  canAccessAssets: boolean;
}>
```

The string `"telegram_chats:read"` is not a valid `keyof typeof ROLE_PERMISSIONS.admin` — TypeScript would reject it at compile time, the spec is unbuildable as written.

**Recommendation:**
- Rename the permission to `canAccessTelegramChats: boolean` (matching the `canAccess<Feature>` convention used by 13 of 22 existing permissions).
- Add the field to all four role rows in `ROLE_PERMISSIONS`: `kitchen: false`, `order_staff: false`, `manager: true`, `admin: true`.
- Route gate becomes: `<ProtectedRoute requiredPermission="canAccessTelegramChats">`.
- Backend `requireRole(ctx, args.token, ["manager", "admin"])` stays the same (the role-set matching pattern from Common Pitfall #19 is correct).

### Issue 2: Admin page path doesn't match codebase convention

Spec lists: `src/pages/admin/TelegramChats.tsx`

There is **no `src/pages/admin/` subdirectory** in the codebase. Admin pages live directly in `src/pages/` with `<Name>Manager.tsx` naming — e.g. `src/pages/ChannelRoutingManager.tsx` (the one the spec references as a pattern reference).

**Recommendation:**
- Move to `src/pages/TelegramChatsManager.tsx`.
- Route remains `/admin/telegram-chats` (route paths and file paths don't have to mirror).
- Updates the spec's "New files" table + the pattern-reference table in §4 (where it says "Match `src/pages/admin/ChannelRouting.tsx`" — correct path is `src/pages/ChannelRoutingManager.tsx`).

### Issue 3: `seedChatFromEnv` behavior undefined when row already exists

Spec says:

> Returns `{ status: "inserted" | "already-exists", chatId, title, role }`.

But doesn't define the `"already-exists"` semantics for the three relevant sub-cases:

1. Row exists with same `chatId` and **no role** — should the action assign the role from args?
2. Row exists with same `chatId` and **the SAME role** as args.role — no-op, idempotent?
3. Row exists with same `chatId` and a **DIFFERENT role** as args.role — overwrite? Refuse? Patch and warn?

Each has different operational consequences. Without an explicit decision, the implementer will pick one and there's no spec to validate against.

**Recommendation:** spec the behavior explicitly. Recommended semantics (least surprising):

| Pre-existing row state | Action |
|---|---|
| No row exists | INSERT new row with args.role |
| Exists, role === undefined | PATCH role = args.role (graduate dormant row) |
| Exists, role === args.role | No-op, return `"already-exists-same-role"` |
| Exists, role !== args.role | **THROW** with clear error message `"Chat <id> already registered with role '<other>'. Use /admin/telegram-chats to reassign."` — explicit reassignment beats silent overwrite. |

### Issue 4: No backend validation of role string on `assignRole`

The spec says role allowlist validation lives "in app code" but doesn't specify where. Critical because:

- The role field is `v.optional(v.string())` in schema (per Decision 3 — chosen for OSS portability).
- Without backend validation, a direct API call from the Convex dashboard or any authenticated client could write any string, e.g. `assignRole({ chatId: "...", role: "rm -rf /" })`.
- The lookup helper `getChatIdByRole` matches exactly, so an invalid role string would just sit dormant — but it'd pollute the registry, break the admin UI dropdown, and break the OSS-port assumption that "if you see a role in the table, it's valid".

**Recommendation:** specify in §"Backend behavior" that `assignRole` mutation validates:

```ts
if (args.role !== null && !isKnownTelegramRole(args.role)) {
  throw new ConvexError(`Unknown telegram role: '${args.role}'. Must be one of: ${KNOWN_TELEGRAM_ROLES.join(", ")}`);
}
```

### Issue 5: No backend existence check of chatId on `assignRole` / `archiveChat` / `sendTestMessage`

All three operations take a `chatId: v.string()` arg and operate on the existing row. Spec doesn't say what happens if no row matches — silent no-op? Throw?

Frollie's `requireRole`-gated mutations elsewhere typically validate input existence (e.g. order mutations check the order exists before transitioning). Following that pattern:

**Recommendation:** specify in §"Backend behavior":

```ts
// At the top of assignRole, archiveChat, restoreChat, sendTestMessage:
const row = await ctx.db.query("telegramChats")
  .withIndex("by_chatId", q => q.eq("chatId", args.chatId))
  .unique();
if (!row) {
  throw new ConvexError(`No registered Telegram chat with id '${args.chatId}'`);
}
```

This prevents direct API calls with fabricated chatIds from silently no-op-ing (which would look like success to the caller).

### Issue 6: Test coverage missing for non-trivial state transitions

Spec lists three test files but several non-trivial paths are uncovered. Per the staffreview rubric, missing tests on logic that handles edge cases / concurrent access is a Critical, not Refinement.

**Missing tests:**

| Untested path | Why it matters | Recommended approach |
|---|---|---|
| `assignRole` reassignment atomicity | One of the few multi-row state transitions in the build. Two-row mutation (unset on holder, set on new) must be atomic. | Test: pre-seed two rows, one holds role "pack-list"; call assignRole with `{forceReassign: true}` on the second; assert old row has `role: undefined` AND new row has `role: "pack-list"` in the same tick. |
| `assignRole` with invalid role string (Issue 4 fix) | Validation must throw, not silently succeed | Test: call with `role: "evil-string"`, assert ConvexError thrown, assert no DB write. |
| `seedChatFromEnv` error paths | Three branches: env vars missing, getChat API failure, row-already-exists conflict (Issue 3 fix) | Three unit tests with mocked fetch + mocked env. |
| `archiveChat` clears role behavior | Spec says it clears role on archive, but doesn't say it's atomic. If a get-then-set sequence is used, race between concurrent archive + assign could leave inconsistent state. | Test: pre-seed row with role; call archiveChat; assert `archivedAt` set AND `role: undefined` in one tick. |
| `touchChatLastSeen` no-op for unregistered chat | Pollution prevention is a key design choice; regression risk if someone "fixes" it to upsert later | Test: call with chatId not in table; assert no row created, no error. |
| Webhook `/register` dedupe | If the same `update_id` arrives twice, `recordIfNew` returns false the second time and `registerChat` should NOT fire. This is the QRIS lesson from MEMORY (`lessons_telegram_pack_list_triple_review.md` lesson #2). | Test: call decideWebhookOutcome twice with same update_id, assert registerChat scheduled exactly once. |

These should be added to the existing test plan as named entries in §"Testing strategy".

---

## 3. Improvements (Recommended)

| # | Improvement | Impact | Effort |
|---|---|---|---|
| 1 | Compound index `by_role_archived` for O(log n) lookup | M | L |
| 2 | Handle Telegram group→supergroup migration (`migrate_to_chat_id`) | M | M |
| 3 | Decide and document `/start` + unknown-command behavior | L | L |
| 4 | Collapse the two API shapes of `getChatIdByRole` to one internal query | L | L |
| 5 | Make env-var fallback role configurable (not hardcoded "pack-list") | L | L |

### Improvement 1: Compound index `by_role_archived`

Current spec:

```ts
.index("by_role", ["role"])
.index("by_archivedAt", ["archivedAt"])
```

And the lookup:

```ts
.withIndex("by_role", q => q.eq("role", role))
.filter(q => q.eq(q.field("archivedAt"), undefined))
```

Per the MEMORY lesson `Convex index range bounds: both bounds MUST be inside .withIndex() — .filter() is post-scan`, this is the same anti-pattern: `archivedAt = undefined` is filtered post-scan, not via the index.

For a registry table with <100 rows ever, performance is irrelevant. But pattern-consistency matters — code review will flag it. Also, the OSS-starter port should ship the idiomatic version.

**Recommendation:** Replace the two indexes with a compound one:

```ts
.index("by_chatId", ["chatId"])
.index("by_role_archived", ["role", "archivedAt"])  // covers active-role lookups AND active-list queries
```

Lookup becomes:

```ts
.withIndex("by_role_archived", q =>
  q.eq("role", role).eq("archivedAt", undefined)
)
```

`listChats({ includeArchived: false })` similarly benefits — can iterate by archived state directly.

### Improvement 2: Handle Telegram group→supergroup migration

When a Telegram basic group is upgraded to a supergroup (Telegram does this automatically when features are enabled), the `chat.id` format changes from `-NNN` to `-100NNN`. Telegram delivers a `message.migrate_to_chat_id` field in the last message before migration, and subsequent messages have the new chat_id.

Phase 167 doesn't handle this either, but adding the registry makes it more visible — admins would see a "Dormant" row appear with the new chat_id while the old "Live" row no longer receives messages.

**Recommendation:** Don't implement in v1, but **document the manual recovery** in the porting checklist + integration doc: "If your Live chat suddenly stops receiving messages and a new Dormant row appears with a similar title, your group migrated to a supergroup. Archive the old row, assign the role to the new one." Add this to `docs/telegram/self-register-porting.md` and `docs/telegram/telegram-bot-integration.md`.

Optionally schedule a follow-up phase to handle `migrate_to_chat_id` automatically (one-line patch in the webhook handler).

### Improvement 3: `/start` and unknown-command behavior

Current spec's `parseCommand` returns `null` for anything that isn't `/pack` or `/register`. Webhook then ACK 200 silently. This means:

- User adds bot to a DM and clicks Start → bot is silent → user thinks bot is broken.
- User sends `/help` → bot is silent.
- User sends `/register foo bar` (with args) → bot is silent (strict mode rejects).

**Recommendation:** Decide and document. Three options:

1. **Silent ack (current spec)** — simplest, no surprise on the bot's side.
2. **Reply to `/start` only** with a one-line intro: `"Hi! I'm FrollieProBot. Send /register@FrollieProBot to register this chat."`
3. **Reply to any non-matching command** with the same intro.

Recommend (2) — minimal noise, helpful only where it matters (the explicit "Start" action). Note in §"Backend behavior".

### Improvement 4: Collapse two API shapes of `getChatIdByRole`

Spec proposes:

```ts
getChatIdByRole(db, role)            // queries/mutations
getChatIdByRoleForAction(ctx, role)  // actions
```

These do the same work. Cleaner: one `internalQuery` that takes a role and returns a chatId. Queries can call it directly; mutations can call it directly (queries are callable from mutations); actions call it via `ctx.runQuery(...)`. Single source of truth.

**Recommendation:** revise §"Backend behavior" to specify one `internalQuery` export. The action-side wrapper becomes a one-liner that calls `ctx.runQuery(internal.telegram.chatRegistry.getChatIdByRole, { role })`.

### Improvement 5: Env-var fallback hardcoded to "pack-list"

Current spec:

```
2. If role === "pack-list", fall back to process.env.TELEGRAM_CHAT_ID
```

This is the one Frollie-specific bit in the otherwise generic `chatRegistry.ts`. For the OSS-starter port, it's an awkward special case.

**Recommendation:** drive the fallback role from an env var:

```ts
const fallbackRole = process.env.TELEGRAM_FALLBACK_ROLE;  // Frollie sets to "pack-list" during migration
if (fallbackRole && role === fallbackRole) {
  const envChatId = process.env.TELEGRAM_CHAT_ID;
  if (envChatId) return envChatId;
}
```

This makes `chatRegistry.ts` fully generic. Frollie sets `TELEGRAM_FALLBACK_ROLE=pack-list` for the migration window; OSS-starter users can set any role they want; both sets can be unset post-migration with identical effect.

---

## 4. Refinements (Optional)

- **`lastError.message` truncation explicit:** "~200 chars" → "exactly 200 chars, append `…` if truncated". Use a `truncate(s, 200)` helper.
- **Clipboard fallback for empty state:** when `navigator.clipboard.writeText` is unavailable (older browsers, insecure contexts), use the `<input>` + `document.execCommand("copy")` fallback OR hide the copy icon and rely on selection.
- **Test-send timestamp staleness:** if the user opens the preview popover and then waits 30 seconds before clicking Send, the displayed time in the preview becomes a lie. Either compute the timestamp at send-time and don't show it in the preview, or show "will be sent at <future time>" and update it live.
- **`registeredBy` display:** the field is a raw Telegram user_id integer; admin UI can't resolve it without another `getChatMember` API call. Either persist the `from.username` at registration time (one extra field), or note in spec that the field is purely diagnostic / not surfaced in UI.
- **Rollout step 8 hard precondition:** step 8 currently reads "after confirming pack-list row exists and the morning cron has succeeded once". Reword as a hard precondition with verifiable steps: `Run query: listChats({ includeArchived: false }). Confirm one row with role='pack-list'. Check Convex logs: cron "telegram morning pack list" succeeded at least once after seed. ONLY THEN: npx convex env remove --prod TELEGRAM_CHAT_ID.`
- **CHANGELOG draft missing:** staffreview template requests a CHANGELOG entry draft. Add to spec:
  ```markdown
  ## 2026-XX-XX - Telegram self-registration
  - Add `/register@FrollieProBot` command for self-registration of new Telegram chats.
  - New admin UI `/admin/telegram-chats` for role assignment, test-send, archive/restore.
  - Send-actions now resolve chat IDs by role; existing pack-list cron migrated to registry (env var retained as fallback).
  ```

---

## 5. Duplication Analysis

### Existing code to leverage

| Code | Location | How to use |
|---|---|---|
| `decideWebhookOutcome` pure-handler / dep-injection pattern | `convex/telegram/webhook.ts:46` | Already referenced — extend with command dispatch |
| `recordIfNew` R5 atomic dedupe | `convex/telegram/webhook.ts:101` | Already referenced |
| `sendTelegramHtml` | `convex/lib/telegramHtml.ts:22` | Already referenced |
| `escapeHtml` | `convex/lib/telegramHtml.ts:10` | Use in `registerChat` confirmation messages (title can contain `<>&`) — spec mentions but not explicitly cited |
| `formatRelativeTime` | `src/lib/dateUtils.ts` | For `lastSeenAt` column |
| `requireRole(ctx, token, [...])` | `convex/lib/auth.ts` | All `manager+admin` gated mutations/actions |
| shadcn `Table`, `Badge`, `Select`, `AlertDialog`, `Popover`, `DropdownMenu`, `Switch`, `Input` | `src/components/ui/` | Per spec |
| `PageHeader` component | `src/components/layout/PageHeader.tsx` | Used by `ChannelRoutingManager.tsx:23` — should be referenced explicitly in spec §"Reuse" |
| `useAuth` hook + `Skeleton` loading state | per `ChannelRoutingManager.tsx` | Standard admin-page pattern |

### Potential duplication risks

- None significant. The build introduces one new namespace (`telegram/chatRegistry.ts`) that doesn't overlap with existing modules.

---

## 6. Phase / Wave Accuracy

Spec is a design doc — implementation waves are deferred to `superpowers:writing-plans`. No assessment yet.

For the future plan, suggested wave structure (per CLAUDE.md template):

| Wave | Tasks | Parallel? |
|---|---|---|
| Wave 1: Schema + config | `convex/schema.ts` patch, `convex/telegram/config.ts` new, `src/lib/types.ts` permission addition | PARALLEL |
| Wave 2: Backend (chatRegistry) | `convex/telegram/chatRegistry.ts` new (registerChat, seedChatFromEnv, getChatIdByRole, assignRole, archiveChat, restoreChat, sendTestMessage, touchChatLastSeen, listChats) | SEQUENTIAL after W1 |
| Wave 3: Webhook routing | Generalize `decideWebhookOutcome`, dispatch on /pack vs /register, route non-command to touchChatLastSeen | SEQUENTIAL after W2 |
| Wave 4: sendPackList refactor | Swap env-var read for `getChatIdByRoleForAction` | PARALLEL with W5 |
| Wave 5: Admin UI | `src/pages/TelegramChatsManager.tsx`, router entry, NavMenu entry (if applicable) | PARALLEL with W4 |
| Wave 6: Tests | All new test files + extension of webhookHandler.test.ts | SEQUENTIAL after W2-W5 |
| Wave 7: Verification | npm run type-check, npm run build, npm run test | SEQUENTIAL after W6 |

---

## 7. Specialist Agent Recommendations

| Wave | Recommended Agent | Rationale |
|---|---|---|
| W1 (schema) | `schema-architect` | Schema design for new table + index decision (Improvement 1) |
| W2 (backend) | `convex-backend` | Convex mutation/query/action implementation, helper extraction |
| W3 (webhook) | `convex-backend` | Single-file extension, generalizing existing handler |
| W4 (sendPackList refactor) | `convex-backend` | Drop-in lookup helper swap |
| W5 (admin UI) | `react-ui-builder` (build) + `frontend-integrator` (wiring) | Page build + Convex hook integration |
| W6 (tests) | `tdd-test-architect` | Vitest + convex-test patterns |
| W7 (verification) | `code-auditor` + `Bash` | Type check + pattern compliance + build |

These agents all exist in the Frollie roster per the system prompt.

---

## 8. Git Workflow Assessment

### Branch & merge strategy

| Check | Status |
|---|---|
| Feature branch specified | ❌ — spec is a design doc; will be in writing-plans output |
| Branch naming follows convention | n/a |
| Merge strategy documented | ❌ — same; deferred to writing-plans |

For writing-plans: suggest `feature/telegram-self-register` per CLAUDE.md convention. Phase number unassigned — recommend Phase 85 (next sequential after v2.0 archive).

### Commit checkpoints

To be specified in writing-plans. Natural boundaries:
1. Schema + config + permissions → `feat(schema): add telegramChats table and KNOWN_TELEGRAM_ROLES config`
2. chatRegistry backend → `feat(telegram): chat registry with /register, role assignment, soft delete`
3. Webhook dispatch generalization → `feat(telegram): generalize webhook command dispatch`
4. sendPackList refactor → `refactor(telegram): pack list reads chat via registry lookup`
5. Admin UI → `feat(admin): /admin/telegram-chats page (Tier 2: test-send, archive, error display)`
6. Tests → `test(telegram): chat registry + webhook routing + UI smoke`
7. Docs → `docs(telegram): self-register integration + porting checklist`

### Pre-push verification

To be added in writing-plans:
- [ ] `npm run type-check` (would have caught Issue 1 — string permission is not `keyof typeof ROLE_PERMISSIONS.admin`)
- [ ] `npm run build` (vendor bundle stays under 600 kB cap per Pitfall #16)
- [ ] `npm run test` (must include new test files from §10 below)
- [ ] Manual test of /register flow in a new Telegram group (rollout step 5)

### CI/CD & rollback

| Concern | Status |
|---|---|
| Rollback strategy | ✅ documented (each rollout step is reversible) |
| Deployment order | ✅ correct (additive schema + code first; seed mutation runs after; env var removed last) |
| Data backup needed | No — additive table only, no destructive migration |
| Migration safety | ✅ safe (env var fallback means no downtime risk) |
| Webhook re-registration needed | No — current registration already has `["message"]` allowed_updates |

---

## 9. Documentation Checkpoints

Already well-covered in §"Documentation deliverables" of the spec. Adding one missing entry below.

| Phase | Docs to update |
|---|---|
| Pre-implementation | `docs/superpowers/specs/2026-05-27-telegram-self-register-design.md` (this spec; revise per Critical issues 1-6) |
| Post-merge | `docs/CHANGELOG.md`, `docs/SCHEMA.md`, `docs/FILE_MAP.md`, `docs/telegram/telegram-bot-integration.md` (new Variant C section), `docs/telegram/self-register-porting.md` (new), `docs/superpowers/plans/2026-05-27-convex-telegram-bot-starter-oss-draft.md` |
| **Missing from spec** | `CLAUDE.md` — add a new Common Pitfall for the **role-by-registry pattern** (so future devs adding a 3rd Telegram flow know to add to `KNOWN_TELEGRAM_ROLES` + assign via admin UI, not by hardcoding env vars). Per the CLAUDE.md rule "Pitfalls go where the agent reads them at invocation time, not in memory the agent has proven it skips." |

### CHANGELOG draft

```markdown
## 2026-XX-XX - Telegram self-registration

- New `/register@FrollieProBot` command for self-registering Telegram chats.
- New admin UI `/admin/telegram-chats` for role assignment, test-send, archive/restore, last-seen + error visibility.
- Send-actions now resolve chat IDs by semantic role (`pack-list`, `sales-updates`) instead of hardcoded env var.
- Existing pack-list cron migrated to registry; `TELEGRAM_CHAT_ID` env var retained as fallback during migration window.
- Self-registration design portable to OSS Convex Telegram Bot Starter (see `docs/telegram/self-register-porting.md`).
```

---

## 10. Testing Plan Assessment

**Verdict: Insufficient** (per Critical Issue 6 above)

### Planned tests (per spec)

| Layer | What | Test type | Status |
|---|---|---|---|
| Backend | `parseCommand` regex | vitest unit | ✅ planned |
| Backend | `getChatIdByRole` lookup chain | vitest unit | ✅ planned |
| Backend | `assignRole` uniqueness | vitest + convex-test | ✅ planned |
| Backend | Webhook routing `/register` | vitest + convex-test | ✅ planned |
| Backend | `touchChatLastSeen` no-op | vitest + convex-test | ⚠️ partially — needs explicit test |
| Backend | `registerChat` HTML escape correctness | vitest unit | ✅ planned |
| Frontend | Role-reassignment dialog | RTL | ⚠️ "defer unless writing-plans flags it" — flag it |

### Missing test coverage (must add)

| # | Missing test | Why it matters | Approach |
|---|---|---|---|
| 1 | `assignRole` reassignment atomicity | Two-row mutation atomicity is the riskiest concurrent operation in the build | Pre-seed two rows, call assignRole with forceReassign, assert both roles in one tick |
| 2 | `assignRole` invalid role string rejection (Critical 4) | Without it, validation gap | Call with role="bad", assert ConvexError thrown, no DB write |
| 3 | `assignRole` missing chatId rejection (Critical 5) | Without it, silent no-op | Call with chatId="fake", assert ConvexError thrown |
| 4 | `seedChatFromEnv` missing env vars | Three error branches | Three tests with env stubbed empty |
| 5 | `seedChatFromEnv` Telegram getChat API failure | Network/auth error path | Mock fetch to return 401, assert thrown |
| 6 | `seedChatFromEnv` row already exists conflict (Critical 3) | Each sub-case (no role / same role / different role) | Three pre-seeded scenarios |
| 7 | `archiveChat` clears role atomically | Soft-delete invariant | Pre-seed row with role, archive, assert archivedAt set AND role cleared |
| 8 | `touchChatLastSeen` no-op for unregistered chat | Pollution prevention is a design choice | Call with chatId not in table, assert no insert, no error |
| 9 | Webhook `/register` dedupe (same update_id twice) | Idempotency on retries — known QRIS lesson from MEMORY | Two calls same update_id, assert registerChat scheduled once |
| 10 | `sendTestMessage` failure populates lastError | Operational visibility depends on this | Mock Telegram 403, assert lastError row patched |
| 11 | RTL: role-reassignment dialog renders + dispatches forceReassign on confirm | Critical interactive flow | RTL render, assert dialog visible, click Reassign, assert mutation called with forceReassign:true |
| 12 | RTL: status badge derives correctly from (archivedAt, role, lastError) tuple | Derived view correctness | Four render scenarios |

### Test execution checkpoints

1. After Wave 2 (chatRegistry backend) — backend tests
2. After Wave 5 (admin UI) — RTL component tests
3. Before merge — full `npm run test` + `npm run build` + manual smoke per rollout steps 4, 5

### Regression risk

- **Existing**: `webhookHandler.test.ts` — adding `/register` and non-command routing changes the test setup. Verify the existing `/pack` test cases still pass.
- **Existing**: `packListFormat.test.ts` and `packListQuery.test.ts` — should be unaffected (no changes to formatting or query).
- **Manual smoke**: existing pack-list crons (07:00 + 13:00 WIB) — verify they continue to fire after deploy with no row seeded (fallback path) AND after seed (registry path).

---

## 11. Edge Cases to Address

- [ ] `seedChatFromEnv` called when row already exists with different role (Critical 3)
- [ ] `/register` with trailing args (`/register foo bar`) — strict mode rejects, but should that be an error reply or silent? (Improvement 3)
- [ ] Telegram migrate_to_chat_id when supergroup conversion happens (Improvement 2)
- [ ] Chat title with HTML special chars `<>&` — must use existing `escapeHtml` in confirmation message body (already in spec but worth a test — covered by `registerChatReply.test.ts` ✅)
- [ ] Admin sends `assignRole` request while another admin is also assigning the same role (Convex serializes — covered, but worth a comment in §"Logic correctness")
- [ ] Telegram `chat.title` is `undefined` for private chats — fallback to `"DM with <username>"` or `"Direct message"` (spec mentions `"DM"` placeholder)
- [ ] Admin archives the row that holds the pack-list role — the next pack-list cron falls back to env var (if still set) or throws. Acceptable? Document.
- [ ] Empty `KNOWN_TELEGRAM_ROLES` (OSS starter scenario) — UI dropdown should show only "None"; spec implicitly handles this but worth confirming.

---

## 12. Approval Conditions

**To approve, address:**

1. **Critical 1** — Change permission from `"telegram_chats:read"` to `canAccessTelegramChats` (boolean field in ROLE_PERMISSIONS).
2. **Critical 2** — Change admin page path from `src/pages/admin/TelegramChats.tsx` to `src/pages/TelegramChatsManager.tsx`. Fix pattern-reference path in §4.
3. **Critical 3** — Spec the four sub-cases of `seedChatFromEnv` when row already exists. Recommended semantics: graduate dormant, no-op on same role, throw on different role.
4. **Critical 4** — Add explicit `isKnownTelegramRole` validation step in `assignRole` mutation.
5. **Critical 5** — Add explicit chatId existence check in `assignRole`, `archiveChat`, `restoreChat`, `sendTestMessage`.
6. **Critical 6** — Add 12 missing test cases (§10) to the "Testing strategy" section of the spec.

**Recommended before implementation:**

1. Improvement 1 — Compound index `by_role_archived`.
2. Improvement 5 — Configurable fallback role via `TELEGRAM_FALLBACK_ROLE` env var (better OSS-starter port).
3. Improvement 3 — Decide on `/start` reply behavior.

**At implementer's discretion:**

- All Refinements in §4.
- Improvement 2 (migrate_to_chat_id) — manual recovery documented; automatic handling can be a follow-up phase.
- Improvement 4 (collapse two API shapes) — minor cleanup.

---

*Generated by /staffreview*
