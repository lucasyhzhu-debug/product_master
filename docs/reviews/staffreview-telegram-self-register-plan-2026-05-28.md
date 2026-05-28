# Staff Review: Telegram self-registration & multi-chat routing — Implementation Plan

**Date:** 2026-05-28
**Plan:** `docs/superpowers/plans/2026-05-27-telegram-self-register.md`
**Spec:** `docs/superpowers/specs/2026-05-27-telegram-self-register-design.md`
**Reviewers:** Staff Developer (Implementation) + Principal Developer (Architecture)
**Plan Structure:** ✅ Validated (Goal / Architecture / Tech Stack / Git Workflow / Implementation Waves with PARALLEL+SEQUENTIAL marked / Tasks / Testing / Documentation / Success Criteria / Self-Review / Wave-level execution notes all present)
**User-requested focus:** task-split quality for subagent-driven execution

---

## 1. Summary

**Overall Assessment:** **Revise** — 3 Critical issues (all in test stubs / deployment ordering), 7 Improvements, 3 Refinements.

The plan's **wave structure and task granularity for subagent dispatch are sound** — every PARALLEL boundary maps to truly independent files, every SEQUENTIAL boundary reflects real coupling. No hidden coupling between supposedly-parallel tasks. The plan's own Wave-level notes accurately flag the Wave 2 "4 sequential tasks in one file" tradeoff against OSS-portability, with the right verdict (keep single file).

Where it falls short: **the test stubs are broken in ways that will surface immediately on first dispatch** — fabricated `users` schema fields, an introspection-based mock that won't fire correctly, and a missing pre-deploy env-var step that will permanently break the pack-list cron on first deploy until manually patched.

These are all easy to fix in-plan before any subagent runs.

---

## 2. Critical Issues (Must Fix)

| # | Issue | Category | Location |
|---|-------|----------|----------|
| 1 | Test stubs insert into `users` with non-existent `pin` field; schema requires `pinHash` + `failedAttempts` | Testing | Tasks 6, 7 — `chatRegistry.test.ts` test setup blocks |
| 2 | Wave 4 RTL mock distinguishes mutations via `String(fn).includes("assignRole")` — won't work; Convex api refs are objects | Testing | Task 12 — `vi.mock("convex-helpers/react/sessions", ...)` |
| 3 | Plan deploys Task 9 (`sendPackList` migrated to `getChatIdByRole`) WITHOUT first setting `TELEGRAM_FALLBACK_ROLE=pack-list` in prod env | Deployment | Task 15 / missing pre-deploy step |

### Issue 1: Fabricated `users` schema in test stubs

Task 6 (Step 1) and Task 7 (Step 1) both seed an admin session via:
```ts
await ctx.db.insert("users", {
  pin: "0000", name: "Admin", role: "admin", isActive: true,
} as any);
```

Actual schema (`convex/schema.ts:460-484`):
- Field is `pinHash: v.string()`, NOT `pin`. (`pin` is the form-input name, never persisted plaintext.)
- `failedAttempts: v.number()` is REQUIRED — omitted in my stub.
- `as any` hides BOTH problems at compile time; `convexTest` will reject at runtime with `ValidationError: Object is missing required field 'pinHash'`.

Every test that needs an admin session will fail on the first `npm run test` in Task 6 Step 4.

**Recommendation:**

Replace the inline ad-hoc seed with a shared test helper. Locate any existing pattern first (`grep -rn "ctx.db.insert.*users" convex/**/__tests__/`); if none exists, add a colocated helper:

```ts
// convex/telegram/__tests__/testHelpers.ts
import type { GenericMutationCtx } from "convex/server";
import type { DataModel } from "../../_generated/dataModel";

export async function seedAdminSession(
  ctx: GenericMutationCtx<DataModel>,
): Promise<string> {
  const userId = await ctx.db.insert("users", {
    name: "Test Admin",
    pinHash: "test:test",      // fake — auth path bypassed via direct token
    role: "admin",
    isActive: true,
    failedAttempts: 0,
  });
  const token = "tok-test";
  await ctx.db.insert("sessions", {
    userId,
    token,
    createdAt: Date.now(),
    expiresAt: Date.now() + 8 * 60 * 60 * 1000,
  });
  return token;
}
```

Then test bodies call `const token = await t.run((ctx) => seedAdminSession(ctx));` — no `as any`, schema validation enforced.

Verify against the codebase: there may already be a similar helper used by `convex/qrisPayments/__tests__/`. Look there first.

### Issue 2: RTL mock arg-introspection won't work

Task 12 mocks `useSessionMutation` like this:

```ts
vi.mock("convex-helpers/react/sessions", () => ({
  useSessionQuery: () => mockChats(),
  useSessionMutation: (fn: any) => {
    if (String(fn).includes("assignRole")) return mockAssignRole;
    if (String(fn).includes("archiveChat")) return mockArchive;
    ...
  },
}));
```

But the page calls `useSessionMutation(api.telegram.chatRegistry.assignRole)` where `api.telegram.chatRegistry.assignRole` is a Convex **api reference object**, not a function. `String(<object>)` yields `[object Object]`, so every branch evaluates to false and every mutation collapses to the fallback `vi.fn()`. The reassignment-dialog test will fire `mockAssignRole` from outside the mock — but the mock returns a different `vi.fn()` to the page, so the assertion `expect(mockAssignRole).toHaveBeenCalledWith(...)` always fails.

**Recommendation:**

Use the existing project pattern. `src/components/orders/__tests__/QrisChargeDialog.test.tsx` mocks the wrapping app-level hook module instead of `convex-helpers` directly:

```ts
vi.mock("@/hooks/convex/useQris", () => ({
  useActiveQrisPayment: (...args) => activeQrisMock(...args),
  useQrisConfig: () => qrisConfigMock(),
}));
```

To apply the same pattern here: introduce a wrapping hook module (Phase 85 doesn't need this for production, but it makes tests trivial), OR keep the page importing `convex-helpers` directly and mock by **inspecting the args passed to the returned function at assertion time** rather than at hook-call time:

```ts
const assignRoleFn = vi.fn();
const archiveFn = vi.fn();
const restoreFn = vi.fn();
let mutationCallIndex = 0;
vi.mock("convex-helpers/react/sessions", () => ({
  useSessionQuery: () => mockChats(),
  useSessionMutation: () => {
    // Order matches the order useSessionMutation is called in the component body.
    const fns = [assignRoleFn, archiveFn, restoreFn];
    return fns[mutationCallIndex++ % fns.length];
  },
}));
```

This is brittle in a different way (depends on hook-call order in the component). The robust fix is the wrapping hook module — recommended.

### Issue 3: Pre-deploy env-var step missing for `TELEGRAM_FALLBACK_ROLE`

Task 9 (`sendPackList.ts`) replaces `process.env.TELEGRAM_CHAT_ID` with `getChatIdByRole("pack-list")`. The lookup helper's fallback chain only fires if **both** `TELEGRAM_FALLBACK_ROLE === "pack-list"` AND `TELEGRAM_CHAT_ID` is set. The spec §"Migration & rollout" Step 1 assumes this, but **the plan's Task 15 deploys without first verifying / setting `TELEGRAM_FALLBACK_ROLE`**.

Failure mode if `TELEGRAM_FALLBACK_ROLE` is unset at deploy time:
1. Deploy lands at 02:00 UTC.
2. 07:00 WIB cron fires → `getChatIdByRole("pack-list")` → no table row → no env fallback → `throw Error("No Telegram chat assigned")`.
3. Cron failure shows in Convex dashboard. Pack list NOT delivered. Operator panics.

`seedChatFromEnv` doesn't fix this because it runs AFTER deploy.

**Recommendation:**

Insert a new step `Task 14.5` (or as Step 0.5 of Task 15) before the PR/merge:

```markdown
- [ ] **Task 14.5: Set TELEGRAM_FALLBACK_ROLE env var in prod BEFORE merging**

Run BEFORE `gh pr merge`:
```bash
npx convex env set --prod TELEGRAM_FALLBACK_ROLE pack-list
npx convex env list --prod | grep TELEGRAM
```
Expected: `TELEGRAM_FALLBACK_ROLE=pack-list` and `TELEGRAM_CHAT_ID=<existing>` both present.

Why: when Task 9's code lands without this env var, the cron's first fire will throw because no table rows exist yet (seedChatFromEnv only runs in Task 15 Step 5, AFTER merge). Setting the fallback role makes the env-var path active during the migration window.
```

Mirror this for `dev` environment (Task 13c Step 5 manual smoke also depends on it).

---

## 3. Improvements (Recommended)

| # | Improvement | Impact | Effort |
|---|-------------|--------|--------|
| 1 | Extract `defaultDeps()` test helper for `webhookHandler.test.ts` instead of bloating every existing case | M | L |
| 2 | Mark internal-only helper functions (`upsertChatRow`, `seedFromEnvWrite`, `requireChatRow`, `recordLastError`) with JSDoc `@internal` or `_` prefix | M | L |
| 3 | Add explicit rollback section to plan | M | L |
| 4 | Task 4 should also regen codegen (currently skipped — inconsistent with Tasks 5/6/7) | L | L |
| 5 | Verify `npx convex codegen` works offline (dev deployment not required) before using as a non-server gate | M | L |
| 6 | Tighten Task 8 Step 4 (rename instruction) — provide explicit full rewrite of existing webhook tests rather than relying on subagent search-and-replace | M | L |
| 7 | Add post-merge soak step — watch first 3 cron firings + first 24h `lastError` writes before considering Phase 85 shipped | L | L |

### Improvement 1: Extract `defaultDeps()` test helper

Task 8 changes the `WebhookDeps` interface from `{ recordIfNew, runAction }` to `{ recordIfNew, runPack, runRegister, runStart, touchLastSeen }`. Every existing test now needs to declare all 5 fields even if it only cares about `runPack`. This adds noise to ~10 existing test cases and increases the chance of subagent mistakes.

**Recommendation:** Add to top of `webhookHandler.test.ts`:

```ts
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

Then existing tests become `deps: defaultDeps({ runPack })` — minimal diff, full coverage.

### Improvement 2: Mark internal-only helpers

`upsertChatRow`, `seedFromEnvWrite`, `requireChatRow`, `recordLastError` are exported as `internalMutation` / `internalQuery` but are only called by the same module's actions. They appear in `internal.telegram.chatRegistry.*` but should not be called from outside. The OSS-starter port may unintentionally export these as "API surface" if they look indistinguishable from public-facing entries.

**Recommendation:** Add to each:
```ts
/** @internal Implementation detail of {parentFunction} — do not call externally. */
```

Or rename with `_` prefix. The Convex `internal.*` namespace doesn't enforce this; convention does.

### Improvement 3: Explicit rollback section

The plan's Self-Review claims spec coverage but the spec §"Migration & rollout" rollback notes never made it into a dedicated rollback subsection in the plan. The plan only mentions rollback implicitly via "Yes (git revert)" in spec table — but the plan itself doesn't tell a subagent what to revert IF Task 9 breaks the cron and Tasks 10-15 are already merged.

**Recommendation:** Add to plan after "Success Criteria":

```markdown
## Rollback strategy

If the cron breaks after deploy (most-likely failure: `getChatIdByRole` throws because `TELEGRAM_FALLBACK_ROLE` not set):

1. **Fast fix (no revert):** `npx convex env set --prod TELEGRAM_FALLBACK_ROLE pack-list`. The next cron fires correctly.
2. **Revert Task 9 only:** `git revert <task-9-commit-sha>` then redeploy. `sendPackList` returns to the env-var read; everything else stays.
3. **Full phase revert:** revert the squash-merge commit on main. `telegramChats` table rows persist in DB (harmless — no callers).

The schema is additive — never rolled back. Existing pack-list cron is the only production-critical path.
```

### Improvement 4: Codegen consistency

Task 4 ends with `git commit` but doesn't run `npx convex codegen` first. Tasks 5, 6, 7 all do. Task 4's `getChatIdByRole` is an `internalQuery` — its addition changes `api.d.ts`. So Task 4 needs codegen too. (Functional impact: minor — next task's codegen catches it — but the inconsistency invites subagent confusion.)

Add to Task 4 Step 9, before the commit:
```bash
npx convex codegen
git add convex/_generated/
```

### Improvement 5: Codegen offline-mode

`npx convex codegen` historically required either a running `npx convex dev` deployment or `--typecheck=disable`. The plan uses the bare command in Task 3.5. Verify this is the project's standard invocation (check `package.json` scripts) — otherwise Task 3.5 may hang or fail in subagent context.

**Recommendation:** Match whatever `package.json` does. If unclear: `npx convex codegen --typecheck=disable` is the safe form that works without a running dev deployment.

### Improvement 6: Tighten Task 8 Step 4

Step 4 reads:
> "find every `runAction:` and rename to `runPack:`"

For a subagent this is search-and-replace via tool. Easy to miss occurrences in:
- Variable names (`const runAction = vi.fn()`)
- Function-call sites (`expect(runAction).toHaveBeenCalled`)
- Object-property keys (`deps: { recordIfNew, runAction }`)

**Recommendation:** Replace Step 4 with a full rewrite of the existing test file. Yes, it's longer in the plan — but it eliminates an entire class of "subagent missed one occurrence" bugs.

### Improvement 7: Post-merge soak step

Task 15 Step 5 says "wait for next pack-list cron → confirm Telegram message arrives". Good. But it stops there. The whole `lastError` design surfaces failures asynchronously via the admin UI — give it time to manifest.

Add Step 6:
```markdown
- [ ] **Step 6: 24h soak**

Watch Convex prod logs for 24h after first successful cron. Specifically:
- Any `[telegram]` warn or error
- Any `recordLastError` mutation firing
- Both 07:00 WIB and 13:00 WIB crons in the same day (catches reset / re-deploy interactions)

If clean for 24h, mark Phase 85 fully shipped in MEMORY.md.
```

---

## 4. Refinements (Optional)

- **R1:** Total dispatch count in plan's Wave-level execution notes says "≈ 15" — actual count is ~17-18 (Tasks 1, 2, 3, 3.5, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13a, 13b, 13c, 14, 15). Trivial. Just fix the number.
- **R2:** RTL test file colocation — plan creates `src/pages/__tests__/TelegramChatsManager.test.tsx`. Confirmed match for project convention (see `src/pages/__tests__/FinancialExportPage.test.tsx`). OK.
- **R3:** `seedFromEnvWrite` test "graduated-dormant" sub-case implicitly relies on `process.env.TELEGRAM_CHAT_ID === "-100SEED"` (set in `beforeEach`) AND the existing-row's `chatId === "-100SEED"`. Add an inline comment to the existing-row insertion explaining the binding, or extract a constant `const SEED_CHAT_ID = "-100SEED"` at the top of the describe block.

---

## 5. Duplication Analysis

### Existing code to leverage
| Code | Location | How to use |
|------|----------|------------|
| `decideWebhookOutcome` + `recordIfNew` (R5 atomic dedupe) | `convex/telegram/webhook.ts` | Already reused by plan — verified. |
| `sendTelegramHtml` + `escapeHtml` | `convex/lib/telegramHtml.ts` | Already reused by plan — verified. |
| `requireRole` | `convex/lib/auth.ts` | Already reused by plan — verified. |
| QRIS action pattern (raw `action` + internal-query auth gate) | `convex/qrisPayments/actions.ts:21-65` | Plan's `sendTestMessage` mirrors this correctly. |
| `formatRelativeTime` | `src/lib/dateUtils.ts` | Used by plan (Task 10) — verified. |
| Hook-mock pattern for RTL | `src/components/orders/__tests__/QrisChargeDialog.test.tsx` | **Should be used by Task 12 — see Critical Issue 2.** |

### Potential duplication risks
- The plan introduces a NEW `defaultDeps()` test helper (Improvement 1). Check if an equivalent webhook-test-deps helper exists in `convex/telegram/__tests__/`. Currently no (`webhookHandler.test.ts` inlines deps everywhere).
- `seedAdminSession` test helper (Critical Issue 1 fix) — check `convex/qrisPayments/__tests__/` and `convex/staffAttendance/__tests__/` for prior art; reuse if available, otherwise create new.

---

## 6. Phase / Wave Accuracy

> **User's stated focus area** — graded most-stringently.

| Wave | Tasks | Boundary type | Assessment |
|------|-------|---------------|------------|
| 1 | 1, 2, 3 | PARALLEL | ✅ **Clean.** Three different files (`schema.ts`, `config.ts`, `types.ts`), no cross-references. Subagents cannot collide. |
| 1.5 | 3.5 (codegen) | SEQUENTIAL gate | ✅ **Correct.** Codegen MUST run before Wave 2 references `_generated/api.*`. Plan calls this out explicitly (Pitfall #18). |
| 2 | 4, 5, 6, 7 | SEQUENTIAL (same file) | ✅ **Correct as labeled.** All four append to `chatRegistry.ts`. Cannot truly parallelize without merge conflicts. Plan's own Wave-notes flag the OSS-portability tradeoff vs splitting into multiple files. Decision to keep single file is defensible. |
| 3 | 8, 9 | PARALLEL | ✅ **Clean.** Task 8 = `webhook.ts` + `webhookHandler.test.ts`. Task 9 = `sendPackList.ts`. Both depend on Wave 2 outputs (read-only via `_generated/api`); neither modifies the other's files. No hidden coupling. |
| 4 | 10 → (11, 12) | SEQUENTIAL → PARALLEL | ✅ **Correct.** Task 10 creates `TelegramChatsManager.tsx`; Task 11 imports it (`App.tsx`); Task 12 imports it (test file). 11 and 12 don't touch each other. |
| 5 | 13a, 13b, 13c | SEQUENTIAL | ✅ **Correct.** Type-check → tests → build → audit → manual smoke. Each depends on the previous passing. |
| 6 | 14, 15 | SEQUENTIAL | ✅ **Correct.** Docs land in main before PR; merge is final. |

**Ordering issues:** none identified.
**Missing phases:** see Critical Issue 3 (pre-deploy env-var setup needs its own task).
**Hidden coupling check (PARALLEL tasks only):**
- Wave 1 (1, 2, 3): files `convex/schema.ts`, `convex/telegram/config.ts`, `src/lib/types.ts`. Verified zero cross-file imports between them. **No hidden coupling.**
- Wave 3 (8, 9): files `convex/telegram/webhook.ts` (+ test), `convex/telegram/sendPackList.ts`. Both import from `convex/telegram/chatRegistry.ts` (Wave 2 output, read-only). Task 9 doesn't touch webhook.ts or its test. Task 8 doesn't touch sendPackList. **No hidden coupling.**
- Wave 4 (11, 12): files `src/App.tsx`, `src/pages/__tests__/TelegramChatsManager.test.tsx`. Both import the page (Task 10 output, read-only). No mutual writes. **No hidden coupling.**

**Conclusion on user's focus:** wave structure and granularity are correct. The plan accurately reflects which tasks can dispatch in parallel and which must serialize. The only structural gap is the missing pre-deploy env-var task (Critical 3) and the optional refactor to merge Tasks 6+7 (not recommended — keep them separate for review surface size).

---

## 7. Specialist Agent Recommendations

| Task | Recommended Agent | Rationale |
|------|-------------------|-----------|
| 1 (schema) | `convex-backend` | Existing project agent specialized in schema/index work. |
| 2 (config) | `convex-backend` or `general-purpose` | Trivial 25-line file; either works. |
| 3 (permissions) | `frontend-integrator` | Types.ts is frontend-leaning; matches their description. |
| 3.5 (codegen) | inline Bash | One-shot command; no need for an agent. |
| 4-7 (chatRegistry) | `convex-backend` | All four tasks heavily Convex-backend. Same agent for continuity across same-file edits. |
| 8 (webhook) | `convex-backend` | Same agent. Pattern reuse from Task 4-7. |
| 9 (sendPackList) | `convex-backend` | Same agent. |
| 10 (admin page) | `react-ui-builder` | Project's specialist for shadcn + Tailwind + Convex hooks. |
| 11 (route) | `frontend-integrator` | Trivial wiring task. |
| 12 (RTL) | `tdd-test-architect` | Project's RTL specialist. |
| 13a (audit) | `code-auditor` | Existing read-only agent. |
| 13b (test+build) | inline Bash | Verification commands. |
| 13c (smoke) | manual / inline | Human-in-the-loop required (Telegram delivery confirmation). |
| 14 (docs) | inline Edit + Bash | Mechanical doc updates. |
| 15 (PR + merge) | inline Bash + `gh` | Mechanical. |

All recommended agents exist in this project's roster (verified against system-prompt agent list).

---

## 8. Git Workflow Assessment

### Branch & merge strategy
| Check | Status |
|-------|--------|
| Feature branch specified | ✅ `feature/85-telegram-self-register` |
| Branch naming follows convention | ✅ Matches CLAUDE.md "feature/{name}" pattern |
| Merge strategy documented | ✅ `gh pr merge --squash --delete-branch` |
| Branched from main + pulled first | ✅ Step 0.1 mandates `git switch main && git pull` |

### Commit checkpoints
Each task ends with a commit step. Per-task commit messages are pre-templated with conventional `feat(85):` / `test(85):` / `docs(85):` prefixes. ✅

### Pre-push verification
- ✅ `npm run build` (Task 13b)
- ✅ `npm run type-check` (Task 13b)
- ✅ `npm run test` (Task 13b)
- ✅ Local manual smoke (Task 13c)
- ✅ Code-auditor pass (Task 13a)

### CI/CD & rollback
| Concern | Status |
|---------|--------|
| Rollback strategy | ⚠️ Implicit only — see Improvement 3 |
| Deployment order | ⚠️ Missing pre-deploy env-var step — see Critical 3 |
| Data backup needed | No (additive schema only) |
| Migration safety | ✅ Schema additive; existing crons keep working during migration window IF env-var set |

---

## 9. Documentation Checkpoints

| Task | Docs to update |
|------|----------------|
| 14 | CHANGELOG.md, SCHEMA.md, FILE_MAP.md, telegram-bot-integration.md, self-register-porting.md (new), CLAUDE.md (Pitfall #21), OSS-starter draft, MEMORY.md |

Plan's Task 14 covers ALL spec §"Documentation deliverables" items. ✅

### CHANGELOG draft
Already in spec, copied verbatim by Task 14 Step 1. ✅

---

## 10. Testing Plan Assessment

**Verdict:** **Adequate IF Critical Issues 1 + 2 are fixed.** Without fixes: Insufficient (tests will fail on first run).

### Planned tests
| Layer | What | Test type | Status |
|-------|------|-----------|--------|
| Backend | parseCommand | Vitest unit | ✅ Planned (Task 4) |
| Backend | getChatIdByRole (3 branches) | convex-test integration | ✅ Planned (Task 4) |
| Backend | touchChatLastSeen (3 cases) | convex-test | ✅ Planned (Task 5) |
| Backend | registerChat (XSS + 3 states) | convex-test + fetch mock | ✅ Planned (Task 5) |
| Backend | listChats | convex-test | ✅ Planned (Task 6) |
| Backend | assignRole (4 cases) | convex-test | ✅ Planned (Task 6) — broken seed |
| Backend | archive/restoreChat (3 cases) | convex-test | ✅ Planned (Task 6) — broken seed |
| Backend | sendTestMessage (2 cases) | convex-test + fetch mock | ✅ Planned (Task 7) — broken seed |
| Backend | seedChatFromEnv (8 cases) | convex-test + fetch mock | ✅ Planned (Task 7) |
| Backend | webhook routing (5 cases) | Vitest pure-function | ✅ Planned (Task 8) |
| Frontend | StatusBadge derivation (4 states) | RTL | ✅ Planned (Task 12) — broken mock |
| Frontend | Reassignment dialog | RTL | ✅ Planned (Task 12) — broken mock |
| Frontend | Empty state | RTL | ✅ Planned (Task 12) |
| Manual | Migration & rollout steps 1-5 | Human smoke | ✅ Planned (Task 13c) |

22 mandatory cases from spec all present. ✅

### Missing test coverage (must add)
None for code paths. The Critical Issues are about test INFRASTRUCTURE (seed helpers, mock pattern), not missing assertions.

### Test execution checkpoints
1. After Task 4: parseCommand + getChatIdByRole tests run.
2. After Task 5: registerChat/replyStartHelp tests run.
3. After Task 6: assignRole/archive/restore tests run.
4. After Task 7: full chatRegistry test file runs.
5. After Task 8: webhook tests run.
6. After Task 12: RTL tests run.
7. Task 13b: full `npm run test` + `npm run build`.

Spec §"Testing strategy" §"Test execution checkpoints" maps cleanly to these. ✅

### Regression risk
- `webhookHandler.test.ts` existing cases must continue to pass after Task 8 refactor — Task 8 Step 4 addresses this (see Improvement 6 for tightening).
- `packListFormat.test.ts` / `packListQuery.test.ts` should be unaffected — Task 9 only swaps the chatId source.

---

## 11. Edge Cases to Address

- [ ] **Cron fires DURING deploy window** — Task 9's code goes live mid-cron-fire. Convex's deploy is atomic per function; new code starts on next invocation. Pre-deploy env-var (Critical 3) makes this safe.
- [ ] **Concurrent `/register` from two users in same group** — Telegram delivers as two webhook updates with different `update_id`. Both pass dedupe (different IDs). Both call `upsertChatRow`. Convex serializes mutations on read-set → second call sees the first's insert → returns "dormant" or "live" status, no duplicate row. ✅ Already handled by Task 5's existence check.
- [ ] **`/register` in a private DM (`chatType: "private"`)** — schema allows it; admin UI shows it as `private`. Spec doesn't forbid. OK (and useful for testing).
- [ ] **`lastError.message` is non-ASCII** — `slice(0, 199)` operates on UTF-16 code units, can truncate a surrogate pair. Low risk (Telegram error messages are typically ASCII), but a code review nit. Refinement.
- [ ] **Admin archives the active pack-list chat** — `archiveChat` clears role atomically; next cron throws `getChatIdByRole` error; cron failure visible in dashboard. ⚠️ No UI warning before archive. The Archive AlertDialog text in Task 10 says "Cron jobs and tests will stop delivering here" — this is the warning. ✅ OK.
- [ ] **Admin reassigns the role TO an ARCHIVED chat** — `assignRole` only checks active rows for current-holder; if target row is archived, the existence check in Step 2 passes but `getChatIdByRole` will still skip it (archivedAt set). Result: role is "assigned" but never resolves. **Add to backend: reject assignRole when target is archived.** This is an Improvement.

---

## 12. Approval Conditions

**To approve, address all 3 Critical:**
1. Fix test seed helpers (users `pinHash` + `failedAttempts`) — write a `seedAdminSession` shared helper.
2. Fix Wave 4 RTL mock pattern — use the project's existing wrapping-hook-module pattern from `QrisChargeDialog.test.tsx`, or arg-introspect at assertion time not at hook-call time.
3. Add Task 14.5: set `TELEGRAM_FALLBACK_ROLE=pack-list` in prod env BEFORE merging Task 9.

**Recommended before implementation (Improvements 1-7):**
1. `defaultDeps()` helper in `webhookHandler.test.ts` — reduces noise in existing tests.
2. JSDoc `@internal` on `upsertChatRow` / `seedFromEnvWrite` / `requireChatRow` / `recordLastError`.
3. Explicit rollback section in plan.
4. Task 4 codegen + commit consistency.
5. Verify codegen offline-mode flag.
6. Replace Task 8 Step 4 "rename" instruction with full file rewrite.
7. Post-merge 24h soak step.

**Subagent task-split verdict (user's stated focus):** ✅ **Approved as-is.** Wave boundaries are correct, parallel/sequential labels match real coupling, no hidden coupling between supposedly-parallel tasks. The Wave 2 same-file sequential leg is the right call given the spec's single-file OSS-portability mandate; the plan's own notes flag the tradeoff.

---

*Generated by /staffreview*
