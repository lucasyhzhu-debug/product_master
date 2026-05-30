# Staff Review: Telegram `/sales` Command + Command-Auth Policy

**Date:** 2026-05-30
**Plan:** `docs/superpowers/plans/2026-05-30-telegram-sales-command.md`
**Reviewers:** Staff Developer (Implementation) + Principal Developer (Architecture)
**Plan Structure:** ⚠️ Sections added — see §0

---

## 0. Plan Structure Additions

The plan is otherwise complete (Goal ✓, File Structure ✓, ordered Tasks ✓, per-task Testing ✓, Task 5 Success Criteria ✓, Manual E2E ✓). Two sections were missing and are added here:

- **Git Workflow / branch:** code work → must run on `feature/telegram-sales-command` off fresh `main` (CLAUDE.md: no direct-to-main for code). Commit-per-task already specified.
- **Rollback / Deployment ordering:** see §8 — this is **load-bearing** here because gating `/pack` couples deploy success to prod registry state.

---

## 1. Summary

**Overall Assessment: Revise** (1 Critical, 1 Critical-test-bug, 3 Improvements)

The plan is well-decomposed, TDD-faithful, and reuses the existing webhook/registry/summary code cleanly — `/sales` touches `sendSalesSummary` zero times, exactly as the spec promised. But it ships a **silent `/pack` regression risk in prod**: the new authorization gate reads `getChatAuth` (DB-only), while the existing `/pack` *delivery* resolves via `getChatIdByRole`, which also honors an **env fallback** the gate ignores. Per MEMORY, prod's `seedChatFromEnv({role:"pack-list"})` is still pending — so a prod pack-list chat may hold no DB role row and `/pack` would start nudging instead of working. Plus one broken test (uses `arguments` in an arrow fn). Both are fixable with small, specific changes.

---

## 2. Critical Issues (Must Fix)

| # | Issue | Category | Location |
|---|-------|----------|----------|
| 1 | Auth gate (`getChatAuth`, DB-only) ignores the env fallback that `/pack` delivery relies on → `/pack` regresses in prod if pack-list role isn't DB-assigned | Logic / Deployment / Security | Task 2, Task 4 |
| 2 | `runSalesOnDemand` test fetch-stub reads `arguments` inside an arrow function → body never captured, test is invalid | Testing | Task 3, Step 1 |

### Issue 1: `/pack` gate vs delivery asymmetry — prod regression risk

`sendPackList` resolves its destination via `getChatIdByRole("pack-list")`, which has a **three-step chain** (`chatRegistry.ts:71-91`): DB row → **env fallback** (`TELEGRAM_FALLBACK_ROLE === "pack-list" && TELEGRAM_CHAT_ID`) → throw. MEMORY confirms `TELEGRAM_FALLBACK_ROLE=pack-list` is set on prod+dev, and that **prod `seedChatFromEnv({role:"pack-list"})` is still PENDING** — i.e. prod currently delivers pack lists via the *env fallback*, not a DB role row.

The new gate authorizes with `getChatAuth(chatId)` (Task 2) which is **DB-only** — no env fallback. So the moment `/pack` gating deploys to prod, the pack-list group sends `/pack` → `getChatAuth` finds `role: undefined` (or `registered: false`) → **nudge, no pack list**. A working staff command silently breaks.

This is the classic "two resolvers disagree" trap (cf. MEMORY: K3Mart retroactive-mapping per-source branches; the Phase-80.2 freshness-guard lesson). Delivery and authorization must resolve identity the **same way**.

**Recommendation (preferred — makes it correct regardless of seed state):** teach `getChatAuth` the same env fallback, so the env-fallback chat authorizes for its fallback role:

```ts
export const getChatAuth = internalQuery({
  args: { chatId: v.string() },
  handler: async (ctx, args): Promise<{ registered: boolean; role?: string; archived: boolean }> => {
    const row = await ctx.db.query("telegramChats")
      .withIndex("by_chatId", (q) => q.eq("chatId", args.chatId)).unique();
    if (row) {
      return { registered: true, role: row.role, archived: row.archivedAt !== undefined };
    }
    // Env-fallback parity with getChatIdByRole: the single fallback chat is
    // authorized for its fallback role even before it's seeded into the table.
    if (
      process.env.TELEGRAM_FALLBACK_ROLE &&
      process.env.TELEGRAM_CHAT_ID === args.chatId
    ) {
      return { registered: true, role: process.env.TELEGRAM_FALLBACK_ROLE, archived: false };
    }
    return { registered: false, archived: false };
  },
});
```

Add a `getChatAuth` test for this branch (set `TELEGRAM_FALLBACK_ROLE=pack-list`, `TELEGRAM_CHAT_ID="-100"`, assert `getChatAuth("-100")` → `{registered:true, role:"pack-list", archived:false}`).

**Operational alternative (do this too, belt-and-suspenders):** before merge, confirm the prod pack-list chat is registered AND role-assigned in the DB (`/admin/telegram-chats` or `seedChatFromEnv`). Add to the Manual E2E gate: "verify `/pack` still delivers in prod immediately post-deploy."

### Issue 2: `arguments` in an arrow-function fetch stub

Task 3, Step 1 captures the request body with `(arguments as any)[1]?.body`. Arrow functions have **no own `arguments`** binding — this references an outer/undefined `arguments` and won't capture the Telegram payload. The existing harness (`registerChatReply.test.ts:14-16`) uses named params; match it:

```ts
global.fetch = vi.fn(async (input: RequestInfo, init?: RequestInit) => {
  const url = typeof input === "string" ? input : input.toString();
  const body = init?.body as string;
  captured.push({ url, body });
  return new Response(JSON.stringify({ ok: true, result: { message_id: 1 } }), { status: 200 });
}) as unknown as typeof fetch;
```

Delete the `arguments`-based block and its accompanying note (the note hedged a bug that should just not exist in the primary code).

---

## 3. Improvements (Recommended)

| # | Improvement | Impact | Effort |
|---|-------------|--------|--------|
| 1 | No CHANGELOG.md entry task | M | L |
| 2 | No CLAUDE.md doc of the new default-deny COMMAND_POLICY pattern | M | L |
| 3 | Fold `npx convex codegen` commits into their tasks; drop the `--allow-empty` catch-all | L | L |

### Improvement 1: CHANGELOG entry
CLAUDE.md: "CHANGELOG is ALWAYS required after merging to main — no exceptions." Add a Task 5 step (or a merge-time step) appending to `docs/CHANGELOG.md`:
```markdown
## 2026-05-30 — Telegram /sales command + command authorization
- /sales runs the daily sales summary on demand (ack → report) from the sales-updates group.
- Command dispatch now enforces per-command role authorization (default-deny); /pack is gated to the pack-list role.
```

### Improvement 2: Document the COMMAND_POLICY pattern
The spec's whole point is "secure-by-default for future commands," but nothing tells the next command author. Add a short CLAUDE.md note (sibling to Pitfall #21): "New Telegram commands MUST add a `COMMAND_POLICY` entry in `webhook.ts` — the `Record<TelegramCommand, …>` type enforces it; choose `requiresRole` unless it's a bootstrap/help command." This converts the type-enforcement into discoverable guidance.

### Improvement 3: Codegen commit hygiene
Tasks 2 and 3 already `git add convex/_generated/api.d.ts` in their commits — good. Task 5 Step 4's `git commit --allow-empty` for codegen drift is then redundant/awkward. Drop it; if `npx convex codegen` produces drift at Task 5, fold it into the Task 5 verification commit normally.

---

## 4. Refinements (Optional)

- **Nudge only registered-but-wrong-role chats; stay silent for fully-unregistered chats.** Reduces the bot replying to random strangers who probe `/sales`. You explicitly chose "nudge," so this is discretionary — but silent-for-unregistered + nudge-for-wrong-role is a reasonable middle ground (a stranger can still only make the bot reply to their own chat, so the abuse surface is low either way).
- **Bot username drift (pre-existing):** tests use `/pack@FrolliePackBot`; `config.ts` has `FrollieProBot`; MEMORY notes the prod `@username` is still pending verification. Not introduced by this plan, but the nudge text embeds `TELEGRAM_BOT_USERNAME` — confirm it's correct before users see it.
- `getChatAuth` runs on Telegram retries of *authorized* commands too (before `recordIfNew` dedupes). One extra indexed point read per retry — acceptable, noting it for completeness.

---

## 5. Duplication Analysis

### Existing code leveraged (good)
| Code | Location | How used |
|------|----------|----------|
| `decideWebhookOutcome` pure core + injected deps | `webhook.ts:62` | Gate added here, unit-testable |
| `sendSalesSummary({cadence:"daily"})` | `sendSalesSummary.ts:13` | Reused unchanged by `runSalesOnDemand` |
| `sendTelegramHtml` | `lib/telegramHtml` | Ack + nudge + breadcrumb |
| convex-test + fetch-capture harness | `registerChatReply.test.ts` | Model for new tests |

### Duplication risks
- None introduced. **Anti-duplication caveat:** do NOT re-implement role resolution inside `getChatAuth` divergently from `getChatIdByRole` — Issue 1 is exactly that divergence. Keep them in lockstep.

## 6. Phase / Wave Accuracy

| Task | Assessment | Notes |
|------|------------|-------|
| 1 parseCommand | Good | Pure, isolated |
| 2 getChatAuth | Needs adjustment | Add env-fallback branch (Issue 1) + its test |
| 3 runSalesOnDemand | Needs adjustment | Fix fetch stub (Issue 2) |
| 4 policy gate + wiring | Good | Correct gate placement (after `if(!command)`, before `recordIfNew`); depends on 2,3 ✓ |
| 5 verification | Good | Drop `--allow-empty` (Imp 3) |

**Ordering:** correct — 2 and 3 land before 4 wires them. **Missing:** CHANGELOG + CLAUDE.md doc tasks (Imps 1-2).

## 7. Specialist Agent Recommendations

| Task | Recommended Agent | Rationale |
|------|-------------------|-----------|
| 1-4 implementation | `convex-backend` | All-Convex backend work in `convex/telegram/` |
| Post-impl gate | `tdd-test-architect` | Verify the convex-test matrix + fetch-capture wiring runs green |
| Pre-merge | `/triple-review` | User's standing gate before merge |

## 8. Git Workflow Assessment

### Branch & merge
| Check | Status |
|-------|--------|
| Feature branch specified | ⚠️ Added in §0 (`feature/telegram-sales-command`) |
| Branch naming convention | ✅ `feature/{slug}` |
| Merge strategy | ⚠️ squash PR → main, after triple-review |

### Commit checkpoints — per task (✅ good)
1. parseCommand → `feat(telegram): parseCommand accepts /sales`
2. getChatAuth (+codegen) → `feat(telegram): getChatAuth …`
3. runSalesOnDemand (+codegen) → `feat(telegram): runSalesOnDemand …`
4. policy gate → `feat(telegram): COMMAND_POLICY auth gate …`

### Pre-push verification
- [x] `npm run build` (Task 5 Step 3)
- [x] `npm run type-check` (Task 5 Step 1)
- [x] `npm run test -- telegram` (Task 5 Step 2)

### Rollback & deployment (ADDED — §0)
| Concern | Status |
|---------|--------|
| Rollback | ✅ Pure additive backend on a branch — revert branch / don't merge. No schema change, no data migration. |
| Deployment order | ⚠️ **Gating `/pack` is the risk.** Either land Issue-1's env-fallback fix (makes deploy safe regardless), OR assign the prod pack-list DB role BEFORE this deploys. |
| Data backup | No |
| CI | Convex deploy + Vercel on push to main — but note MEMORY lesson: local build gate does NOT run convex tests; ensure `npm run test` is green locally before merge (split-brain deploy risk). |

## 9. Documentation Checkpoints

| Phase | Docs to update |
|-------|----------------|
| Merge | `docs/CHANGELOG.md` (REQUIRED) |
| Merge | `CLAUDE.md` — COMMAND_POLICY default-deny note (Imp 2) |
| — | No SCHEMA.md change (no schema delta); API_REFERENCE optional (internal fns) |

### CHANGELOG draft
~~~markdown
## 2026-05-30 — Telegram /sales command + command authorization
- /sales: on-demand daily sales summary (ack → 3 syncs → report) from the sales-updates group.
- Per-command role authorization (default-deny) on the bot webhook; /pack now gated to pack-list.
~~~

## 10. Testing Plan Assessment

**Verdict: Adequate** (once Issues 1-2 fixed)

| Layer | What | Test type | Status |
|-------|------|-----------|--------|
| Pure | `parseCommand` /sales | vitest | planned ✓ |
| Backend | `getChatAuth` (4 states) | convex-test | planned ✓ — **add env-fallback state (Issue 1)** |
| Backend | `runSalesOnDemand` ack+breadcrumb | convex-test | planned — **fix stub (Issue 2)** |
| Pure | webhook policy matrix (sales×roles, /pack gating, register open) | vitest | planned ✓ (strong) |
| Manual | happy-path report (real syncs) | E2E | planned ✓ |

### Missing coverage (add)
| # | Missing test | Why | Approach |
|---|--------------|-----|----------|
| 1 | `getChatAuth` env-fallback branch | Prevents the Issue-1 regression from recurring | set env vars, assert authorize |
| 2 | Regression: `/pack` from pack-list still dispatches | Confirms no break to the shipped flow | already implicitly via default-deps; make it explicit |

### Regression risk
- `/pack` behavior change is the headline risk → §8 deployment gate + the explicit pack-list dispatch test.

## 11. Edge Cases to Address

- [ ] Env-fallback pack-list chat (no DB row) sends `/pack` → must authorize (Issue 1).
- [ ] `/sales` before any sales-updates chat assigned → `runSalesOnDemand` acks, then breadcrumb on `getChatIdByRole` throw (covered by Task 3 test).
- [ ] Archived sales-updates chat sends `/sales` → nudge (covered).
- [ ] Telegram retry of an authorized `/sales` → second `getChatAuth` read, `recordIfNew` dedupes, no double report (covered by dedupe).

## 12. Approval Conditions

**To approve, address:**
1. Issue 1 — env-fallback parity in `getChatAuth` (+ test), and/or confirm prod pack-list DB role before deploy.
2. Issue 2 — fix the `arguments` fetch stub in the runSalesOnDemand test.

**Recommended before implementation:**
1. Add CHANGELOG + CLAUDE.md doc tasks (Imps 1-2).
2. Drop the `--allow-empty` codegen commit (Imp 3).

---

*Generated by /staffreview*
