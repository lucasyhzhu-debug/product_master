# Staff Review: Telegram Morning Packing Report Implementation Plan

**Date:** 2026-05-26
**Plan:** `docs/superpowers/plans/2026-05-26-telegram-morning-packing-report.md`
**Spec:** `docs/superpowers/specs/2026-05-26-telegram-morning-packing-report-design.md`
**Reviewers:** Staff Developer (Implementation) + Principal Developer (Architecture)
**Plan Structure:** ✅ Validated — Scope, File Changes, Phases (15 tasks), Testing, Success Criteria, Rollback all present

---

## 1. Summary

**Overall Assessment:** **Revise** — fix 2 Criticals before execution, address 4 Improvements during implementation.

The plan is well-structured, follows project patterns (TDD red-green, QRIS-style pure-core webhook handler, dual-deployment rollout), and matches the spec section-by-section. However, two implementation errors would cause the TDD red-green loop to break on Task 4: a month off-by-one in the WIB end-of-day calculation, and a missing required field in the test seed for `customers`. Both are local fixes (≤5 lines each) but would derail an agent halfway through Task 4 with confusing failure modes.

## 2. Critical Issues (Must Fix)

| # | Issue | Category | Location |
|---|-------|----------|----------|
| C1 | Month off-by-one in `endOfTodayMs` calculation | Logic | Task 4, Step 4.3 |
| C2 | Test seed for `customers` missing required `createdBy` field | Testing | Task 4, Step 4.1 |

### Critical C1: Month off-by-one in `endOfTodayMs` calculation

The plan's Task 4 implementation has:

```ts
const wib = getWibComponents(now);
const endOfTodayMs = wibMidnightToUtc(wib.year, wib.month - 1, wib.day + 1) - 1;
```

**This is wrong.** `convex/lib/periodRange.ts:35` shows `getWibComponents` returns month **0-indexed** (with the explicit `// 0-indexed` comment). `wibMidnightToUtc(year, month, day)` at line 46 also expects **0-indexed** month (it forwards to `Date.UTC(year, month, day, ...)`, which is 0-indexed). The existing `calculatePeriodRange` function at line 70-75 passes them through directly: `wibMidnightToUtc(year, month, day)` — no `-1` conversion.

The `-1` in the plan would compute the end of **April 27** when called on May 27, returning zero orders for every test case in Step 4.4. The TDD loop would fail without an obvious cause, and an agent might "fix" tests by changing expectations instead of the impl.

The plan's "If any fail, check..." note in Step 4.4 actually mentions this exact trap, but reverses the direction: it says `getWibComponents` returns month 1-indexed and `wibMidnightToUtc` takes month 0-indexed. Both are wrong — both functions use 0-indexed.

**Recommendation:** Change Task 4 Step 4.3 implementation to:

```ts
const endOfTodayMs = wibMidnightToUtc(wib.year, wib.month, wib.day + 1) - 1;
```

And update the Step 4.4 troubleshooting note to:

> If any fail, check: (a) the `by_status_due_date` index range bound on `dueDate` — both must be inside `withIndex`, not `.filter()`; (b) both `getWibComponents` and `wibMidnightToUtc` use 0-indexed month — pass `wib.month` directly, NOT `wib.month - 1`. Day-of-month overflow (e.g., `day + 1 = 32`) is safe because `Date.UTC` normalizes it.

### Critical C2: Test seed for `customers` missing required `createdBy` field

`convex/schema.ts:177-188` declares `customers.createdBy: v.string()` as **required** (not optional). The plan's Task 4 test (Step 4.1) seeds customers as:

```ts
const customerId = await ctx.db.insert("customers", {
  name: "Test Customer",
  phone: "0812",
});
```

This will fail convex-test's schema validator at runtime with `ArgumentValidationError: Object is missing the required field "createdBy"`. All 8 tests in Step 4.1 would fail before they even reach the query, with an error that doesn't point at the query under test.

This is the exact issue the QRIS test factory documents in `convex/qrisPayments/__tests__/_factory.ts:149-152` — it always passes `createdBy: "test"` for that reason.

**Recommendation:** Update Task 4 Step 4.1 `seedOrder` to include `createdBy` on the customer insert:

```ts
const customerId = await ctx.db.insert("customers", {
  name: "Test Customer",
  phone: "0812",
  createdBy: "test",
});
```

## 3. Improvements (Recommended)

| # | Improvement | Impact | Effort |
|---|-------------|--------|--------|
| I1 | Use `TestConvex<typeof schema>` typing for `seedOrder` instead of `ReturnType<typeof convexTest>` | M | L |
| I2 | Formatter empty-day check should use `cards.length`, not `counts.total` | M | L |
| I3 | Smoke test Step 10.4 conflates two dedupe scenarios — split into clear sub-steps | M | L |
| I4 | Document `/pack` works from any group the bot is in, not just `TELEGRAM_CHAT_ID` | L | L |

### Improvement I1: Schema-aware test context

The QRIS factory pattern (`convex/qrisPayments/__tests__/_factory.ts:22-29`) uses:

```ts
import type { TestConvex } from "convex-test";
import type schema from "../../schema";

type TestContext = TestConvex<typeof schema>;
```

This is the staffreview C5 requirement they documented: without `TestConvex<typeof schema>`, `t.run((ctx) => ctx.db.query(...).withIndex(...))` falls back to system-only indexes and silently mistypes the index name. The plan's `t: ReturnType<typeof convexTest>` will compile but loses schema-aware index typing on `by_status_due_date`. A rename or removal of the index in the future would not surface as a tsc error in this test.

**Recommendation:** Update Task 4 Step 4.1 to:

```ts
import { convexTest, type TestConvex } from "convex-test";
import schema from "../../schema";

type TestContext = TestConvex<typeof schema>;

async function seedOrder(t: TestContext, override: ...) { ... }
```

### Improvement I2: Formatter empty-day check uses wrong signal

`packListFormat.ts` in Task 3 Step 3.3:

```ts
function buildHeader(reason, generatedAt, counts) {
  // ...
  if (counts.total === 0) return `${title}\n\nNothing to pack today. ✅`;
  // ...
}

export function formatPackList(input) {
  const header = buildHeader(input.reason, input.generatedAt, input.counts);
  if (input.cards.length === 0) return [header];
  // ...
}
```

Two different signals are used for "empty": `counts.total` for the header text, `cards.length` for the early return. The query enforces `counts.total === cards.length` so in practice they're equal, but defensive coding should make the formatter contract robust to a caller passing inconsistent counts (e.g., a future caller that fetches counts and cards separately).

**Recommendation:** Use `cards.length` consistently:

```ts
function buildHeader(reason, generatedAt, counts, isEmpty: boolean) {
  // ...
  if (isEmpty) return `${title}\n\nNothing to pack today. ✅`;
  // ...
}

export function formatPackList(input) {
  const isEmpty = input.cards.length === 0;
  const header = buildHeader(input.reason, input.generatedAt, input.counts, isEmpty);
  if (isEmpty) return [header];
  // ...
}
```

### Improvement I3: Smoke test Step 10.4 dedupe instructions are self-contradictory

Step 10.4 says:

> Send `/pack` again immediately to test dedupe — second response should NOT generate a second pack list message (the bot will still produce one if the update_id is different, which it will be for a brand-new send; dedupe only kicks in on Telegram retries of the SAME update_id). To force-test the dedupe path: pull the update_id from the first webhook call's logs and re-POST to the route with the same payload.

A second `/pack` IS expected to produce a second message (different update_id from Telegram). Saying "should NOT generate a second message" then immediately walking it back to "actually it will" leaves the agent ambiguous about what to assert.

**Recommendation:** Split into two clearly-scoped steps:

> **Step 10.4a — `/pack` happy path.** In the dev Telegram group, send `/pack`. Expected: within ~3 seconds a message appears with the on-demand header. Convex logs (dashboard → Logs) show `handleTelegramWebhook` → `recordUpdate` → scheduled `sendPackList` → action ran.
>
> **Step 10.4b — `/pack` dedupe path.** From Convex logs of Step 10.4a, pull the `update_id` and the raw POST body Telegram sent. Re-POST it to `https://exciting-fennec-671.convex.site/telegram-webhook` with the SAME `update_id` and the `X-Telegram-Bot-Api-Secret-Token` header set to the webhook secret. Expected: HTTP 200, NO second message in Telegram, NO new row in `telegramUpdates` (it should already exist from 10.4a).

### Improvement I4: `/pack` is not chat-scoped

The webhook handler accepts `/pack` from any chat the bot is in, not only the configured `TELEGRAM_CHAT_ID`. If staff later add the bot to another group (e.g., a personal DM), `/pack` will produce the report there too — and the report will be sent to the configured TELEGRAM_CHAT_ID group, not the chat the command came from. That's confusing.

The spec calls this "no chat-id gating in v1" explicitly, but it deserves a callout in the plan + in the deploy ceremony so the user doesn't accidentally cross-wire bots.

**Recommendation:** Add to Task 15 (prod cutover) a final step:

> **Step 15.11 — Single-group invariant.** Verify the prod bot is a member of EXACTLY ONE group (`Frollie · Morning Pack List`). Open Telegram, search the bot username, check the "groups in common" list. If multiple, remove the bot from extras. `/pack` accepts from any group the bot is in; the report always lands in `TELEGRAM_CHAT_ID`. Until v2 chat-gating, keep the bot single-group.

## 4. Refinements (Optional)

- **R1 — Delivery order with missing `deliveryAddress`:** The formatter's `else if (card.deliveryType)` branch silently renders `  Delivery` with no address. For an order that legitimately requires delivery but has no address (data integrity issue), staff would receive a "Delivery →" line with nothing after. Consider rendering `Delivery → (no address — check order)` to make the data gap visible.

- **R2 — Phase number naming:** The plan and schema comments use "Phase 85" but no milestone is active (MEMORY.md: "between milestones, v2.0 archived 2026-05-11"). Either claim the phase via `/gsd-new-milestone` + `/gsd-phase` first, or use a placeholder ("Telegram Bot v1") in comments until a milestone is established.

- **R3 — Convex log breadcrumb on Telegram failure:** `sendTelegramHtml` throws on non-2xx. Convex logs the throw, but a defensive `console.warn` immediately before the throw (with the response status + body) would give operators a faster signal in the dashboard. Pattern matches `convex/integrations/qris/webhooks.ts` retry-semantics comment style.

- **R4 — `telegramUpdates` retention policy:** Spec says "low volume, no pruning needed initially" — fine for now, but worth documenting a threshold (e.g., "revisit at 10k rows") in the schema comment so future-you knows when to add a cron prune.

- **R5 — Webhook idempotency race window:** The two-step `isDuplicate` → `recordUpdate` flow has a microsecond race between the read and the insert. Convex serializes mutations on the same read set, so this is *mostly* safe, but for defensive design consider collapsing both into a single mutation (`recordIfNew` returning `true`/`false`). Acceptable for v1; revisit if duplicate sends are observed.

## 5. Duplication Analysis

### Existing code to leverage

| Code | Location | How to use |
|------|----------|------------|
| `KanbanOrderCard` interface + `buildKanbanCard` | `convex/orders/helpers/kanbanBuilders.ts:25-114` | Plan correctly imports & reuses ✓ |
| `WIB_OFFSET_MS`, `getWibComponents`, `wibMidnightToUtc` | `convex/lib/periodRange.ts:26-48` | Plan correctly reuses ✓ (but C1 misuses month indexing) |
| Constant-time secret compare pattern | `convex/integrations/qris/webhooks.ts:18-24` | Plan reimplements; could `import { verifyCallbackToken }` directly, but the QRIS version is named after Xendit and the rename cost outweighs the LOC saved. Inline copy with a `// Pattern from ...` comment is fine. |
| Pure-core + httpAction wrapper pattern | `convex/integrations/qris/webhooks.ts:40-80` | Plan correctly mirrors ✓ |
| `TestConvex<typeof schema>` test typing | `convex/qrisPayments/__tests__/_factory.ts:22-29` | Plan does NOT use — see Improvement I1 |
| Schema-validated `customers` insert with `createdBy` | `convex/qrisPayments/__tests__/_factory.ts:149-152` | Plan does NOT mirror — see Critical C2 |

### Potential duplication risks

- **None of substance.** The formatter, query, action, and webhook are all genuinely new — no existing pack-list/notification surface to deduplicate against. The plan correctly extracts pure functions (formatter, decide outcome) so future Telegram features can layer in without rewriting.

## 6. Phase / Wave Accuracy

| Task | Assessment | Notes |
|------|------------|-------|
| 0 — Branch setup | Good | |
| 1 — Schema add | Good | Smallest first, no logic |
| 2 — HTML helper | Good | Pure TDD red-green |
| 3 — Pure formatter | Good | 11 tests, comprehensive coverage |
| 4 — Query | **Needs fix** | C1 + C2 both land here |
| 5 — Action | Good | Thin orchestrator, no isolated tests needed |
| 6 — Crons | Good | Direct addition to existing file |
| 7 — Webhook | Good | Pure core extraction is correct |
| 8 — HTTP route | Good | Single route add |
| 9 — Env var collection | Good | Explicit user-prompt step |
| 10 — Smoke test | **Needs fix** | I3 affects 10.4 |
| 11 — Triple-review gate | Good | Per CLAUDE.md execute-phase gate |
| 12 — Code review + build | Good | |
| 13 — Docs | Good | CHANGELOG + SCHEMA + FILE_MAP all named |
| 14 — PR + merge | Good | |
| 15 — Prod cutover | Good | I4 adds Step 15.11 |

**Ordering issues:** None. Schema → pure helpers → query → action → cron+webhook+route → smoke → review → docs → PR → cutover is correct.

**Missing phases:** None. Spec coverage is complete (see plan's own self-review checklist at the bottom).

## 7. Specialist Agent Recommendations

Per the `.claude/agents/` roster in this project:

| Task | Recommended Agent | Rationale |
|------|-------------------|-----------|
| Task 1 (schema) | `convex-backend` | Schema additions to a 70-table base, knows the project's table-numbering conventions |
| Task 2-3 (pure helpers + tests) | `convex-backend` or `tdd-test-architect` | Both fit; `tdd-test-architect` is better for the 11-case formatter test suite |
| Task 4 (query + integration tests) | `convex-backend` | Touches `by_status_due_date` index, reuses `buildKanbanCard`, schema-aware tests |
| Task 5-6 (action + crons) | `convex-backend` | |
| Task 7-8 (webhook + http) | `convex-backend` | Mirrors existing QRIS webhook pattern in the same dir family |
| Task 11 (triple-review) | Skill, not agent — `Skill(skill="triple-review")` | Per CLAUDE.md execute-phase gate |
| Task 12 (code review) | `code-auditor` then `Skill(skill="code-review")` | Auditor for pattern compliance, skill for diff review |
| Task 13 (docs) | inline (no specialist) | Standard CHANGELOG/SCHEMA/FILE_MAP edits |

No frontend tasks → no `react-ui-builder` / `frontend-integrator`.

## 8. Git Workflow Assessment

### Branch & merge strategy

| Check | Status |
|-------|--------|
| Feature branch specified | ✅ `feature/telegram-pack-list-bot` (Task 0) |
| Branch naming follows convention | ✅ matches `feature/{name}` from CLAUDE.md |
| Merge strategy documented | ✅ Task 14 specifies squash-merge via GitHub UI |
| Branch-from-main rule honored | ✅ Step 0.1 does `git switch main && git pull` first |

### Commit checkpoints

The plan commits at these natural boundaries (15 commits total):

1. After schema → `feat(telegram): add telegramUpdates table for webhook idempotency`
2. After HTML helper → `feat(telegram): add escapeHtml + sendTelegramHtml helpers`
3. After formatter → `feat(telegram): add pure pack-list formatter with chunking + HTML escape`
4. After query → `feat(telegram): add getOrdersForPackList internal query`
5. After action → `feat(telegram): add sendPackList internal action`
6. After crons → `feat(telegram): register morning + midday pack list crons`
7. After webhook → `feat(telegram): add /pack command webhook handler with idempotency`
8. After HTTP route → `feat(telegram): wire POST /telegram-webhook route`
9. After docs → `docs: telegram pack list bot — CHANGELOG + SCHEMA + FILE_MAP`

Atomic and `/gsd-undo`-friendly. ✓

### Pre-push verification

- [x] `npm run build` in Step 12.3
- [x] `npm run type-check` in Step 1.2, 5.2, 6.2, 8.2
- [x] Test suite in Step 12.2
- [x] Local smoke test (dev) before merge — Task 10

### CI/CD & rollback

| Concern | Status |
|---------|--------|
| Rollback strategy | ⚠️ Only implicit — see below |
| Deployment order | ✅ Schema lands first (Task 1), then code in subsequent tasks, then env vars before smoke (Task 9), then prod cutover (Task 15) |
| Data backup needed | ❌ No (additive feature, no data migration) |
| Migration safety | ✅ Additive table only |
| Split-brain CI risk (lesson_convex_vercel_splitbrain.md) | ⚠️ Plan doesn't explicitly mention checking `gh run list` before declaring prod success, but Task 15.4 does `gh run list --limit 1` — partial mitigation |

**Rollback gap:** the plan doesn't document how to roll back. For this feature it's straightforward (disable the crons + delete the webhook + unset env vars), but it should be explicit. Add to Task 15:

> **Step 15.12 — Rollback runbook.** If the cron is misbehaving in prod:
> 1. `curl.exe -X POST "https://api.telegram.org/bot<PROD_TOKEN>/deleteWebhook"` — stops `/pack` from firing
> 2. Revert the `crons.ts` commit and `npx convex deploy --prod` — stops the daily posts
> 3. Optional: `npx convex env unset TELEGRAM_*` to fully disable
>
> The `telegramUpdates` table can stay (no consumers).

## 9. Documentation Checkpoints

| Phase | Docs to update |
|-------|----------------|
| Task 13 | CHANGELOG.md, SCHEMA.md, FILE_MAP.md — all named in plan |
| Task 15 (prod cutover) | CHANGELOG.md updated with prod cutover date |
| Memory | MEMORY.md add prod bot username + chat id ref (Step 15.10) |

### CHANGELOG draft (per plan Step 13.1)

```markdown
### Added
- **Telegram morning pack list bot** — posts the day's pack list (orders in
  `PaymentReceived` or `BeingPrepared` with `dueDate <= end of today WIB`) to
  a dedicated Telegram group at 07:00 WIB, with a 13:00 WIB "still pending"
  reminder and an on-demand `/pack` command. One-way notifications + a single
  text command; no inline buttons in v1. Uses the existing `KanbanOrderCard`
  shape so the bot mirrors what the kanban UI shows. Spec:
  `docs/superpowers/specs/2026-05-26-telegram-morning-packing-report-design.md`.
```

✓ Looks good — recommend stripping "Phase 85" framing once the milestone is claimed.

## 10. Testing Plan Assessment

**Verdict:** **Adequate** (after fixing C1 + C2)

### Planned tests

| Layer | What | Test type | Status |
|-------|------|-----------|--------|
| Pure helper | `escapeHtml` | Vitest unit | ✅ 4 tests covering escape order, identity, double-encode, empty |
| Pure helper | `formatPackList` | Vitest unit | ✅ 11 tests covering empty, headers per reason, counts, order render, rush sort, address omit, notes, HTML escape, chunking, single-order atomicity |
| Backend query | `getOrdersForPackList` | convex-test integration | ✅ 8 tests covering status filter, dueDate boundary (overdue/today/future/undefined), sort, counts |
| Webhook handler core | `decideWebhookOutcome` | Vitest unit w/ mocked deps | ✅ 9 tests covering auth (3), command parsing (5), idempotency (2) |
| Action | `sendPackList` | None (thin orchestrator, covered by smoke) | ✅ acceptable |
| Crons | None | covered by smoke | ✅ acceptable |
| Manual smoke | All 4 paths (morning/midday/command/empty) | manual | ✅ Task 10 |

Coverage is good across unit + integration + manual layers. The pure-core extraction pattern means the webhook handler logic is fully unit-testable without httpAction infrastructure.

### Missing test coverage (must add)

| # | Missing test | Why it matters | Approach |
|---|--------------|----------------|----------|
| T1 | Query test for **cancelled orderItems** filter | The query filters `i.isCancelled` but no test asserts a cancelled item is excluded from the rendered card | Add to Task 4 Step 4.1: seed an order with 2 items, mark one `isCancelled: true`, assert `card.items.length === 1` |
| T2 | Formatter test for `productVariant` rendering | Spec doesn't say, but kanban card carries it — if it's in the data, should it appear? | Decide explicitly in spec; if rendered, add a test; if dropped, add a comment in `renderOrder` |

### Test execution checkpoints

1. ✅ After Task 2 (HTML helper)
2. ✅ After Task 3 (formatter)
3. ✅ After Task 4 (query)
4. ✅ After Task 7 (webhook handler)
5. ✅ Before merge: full `npm run test` + `npm run build` (Task 12)

### Regression risk

- **Low.** The feature adds new tables, files, crons, and routes. No existing function is modified. The only mutations to existing files are:
  - `convex/schema.ts` — additive table
  - `convex/crons.ts` — additive cron entries
  - `convex/http.ts` — additive route
- **No existing tests are at risk.** Recommended manual smoke check post-merge: verify the existing `/api/daily-sales` and GrabFood/Xendit routes still work (single curl each).

## 11. Edge Cases to Address

- [x] Empty day (zero orders) — handled (formatter empty-day branch)
- [x] Order with `dueDate: undefined` — handled (index range excludes)
- [x] Overdue (dueDate before today) — handled (`<=` upper bound)
- [x] Future-dated order — handled (excluded)
- [x] Cancelled items — handled in query (`.filter(i => !i.isCancelled)`) but no test (see T1)
- [x] HTML-unsafe characters in customer fields — handled (escapeHtml on every interpolation)
- [x] Long pack list exceeding 4096 chars — handled (chunking with continuation header)
- [x] Telegram API 5xx during send — fails cron; spec accepts this
- [ ] **Delivery order missing `deliveryAddress`** — currently silently renders "  Delivery" with no follow-up. See Refinement R1.
- [ ] **Bot in multiple groups** — `/pack` accepts from any. See Improvement I4.
- [x] Webhook secret mismatch — handled (401, constant-time compare)
- [x] Webhook update_id duplicate — handled (telegramUpdates dedupe)
- [ ] **`/pack` with trailing args** (e.g., `/pack now please`) — regex requires `^/pack(@bot)?$`, so this is treated as not-a-command and ignored silently. Probably OK, but worth a test: `text: "/pack help"` → expect runAction NOT called. Add to Task 7 Step 7.1.
- [x] Concurrent webhook deliveries — mitigated by `recordUpdate` mutation's own existence check + Convex mutation serialization
- [x] Dev/prod env var crossover — `--prod` flag explicit in Task 15
- [x] Wrong Convex subdomain (.cloud vs .site) — plan correctly specifies `.convex.site` in Step 9.6 + 15.5

## 12. Approval Conditions

**To approve, address:**

1. **C1** — fix month indexing in Task 4 Step 4.3 (`wib.month`, not `wib.month - 1`); also fix the misleading Step 4.4 troubleshooting note.
2. **C2** — add `createdBy: "test"` to the `customers` insert in Task 4 Step 4.1's `seedOrder`.

**Recommended before implementation:**

1. **I1** — use `TestConvex<typeof schema>` for schema-aware test typing (Task 4).
2. **I2** — formatter empty-day check should be `cards.length`, not `counts.total` (Task 3).
3. **I3** — split Step 10.4 into 10.4a (happy path) + 10.4b (forced dedupe via raw re-POST).
4. **I4** — add Step 15.11 single-group invariant check to prod cutover.

**Add before execution:**

- Missing test T1 — cancelled-item exclusion in `getOrdersForPackList`.
- Missing test "/pack with trailing args" — Task 7 Step 7.1.
- Rollback runbook — Step 15.12.

None of these are blockers in scope or design — all are local fixes that take ~30 minutes total. After applying, the plan is ready for `subagent-driven-development` or `executing-plans`.

---

*Generated by /staffreview*
