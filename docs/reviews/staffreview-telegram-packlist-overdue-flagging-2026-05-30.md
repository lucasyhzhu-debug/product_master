# Staff Review: Pack-list Overdue Flagging (SEED-001)

**Date:** 2026-05-30
**Plan:** `docs/superpowers/plans/2026-05-30-telegram-packlist-overdue-flagging.md`
**Reviewers:** Staff Developer (Implementation) + Principal Developer (Architecture)
**Plan Structure:** ✅ Validated

---

## 0. Plan Structure Additions

None required. The plan carries all six structural sections: Goal, File Structure (create/modify per task), Implementation Waves (with PARALLEL/SEQUENTIAL markings), per-task Testing + a full-suite gate (Task 5), Success Criteria, Git Workflow, Documentation Updates, and rollback/deployment notes (in "Notes for the executor": backend-only, no schema/index, revert-to-roll-back).

## 1. Summary

**Overall Assessment: Approve** (no Critical issues; 4 recommended Improvements)

This is a strong, well-grounded plan. It correctly anchors the overdue definition to the existing kanban rule (`getUrgencyLevel`) instead of inventing a threshold, isolates that rule in one pure helper (`dueClassification.ts`), threads a single `generatedAt` to kill Date.now() drift, and preserves byte-identical output when nothing is overdue. TDD is genuine (failing test → impl → pass → commit per task), reuse is high (`buildKanbanCard`, `escapeHtml`, WIB helpers, extracted `chunkBlocks`/`truncate`), and there are zero schema/index changes. The improvements below are quality refinements, not blockers.

## 2. Critical Issues (Must Fix)

None.

The one risk I expected to be Critical — a convex test-file type error failing the production `deploy-convex` job (the recurring split-brain incident, prod outage 2× per memory) — is **already covered**: `npm run build` runs `tsc -p convex/tsconfig.json --noEmit`, and `convex/tsconfig.json` includes `./**/*` (only `_generated` excluded), so the new `convex/telegram/queries/__tests__/dueClassification.test.ts` and the edited test files are type-checked by the Task 5 build gate. Keep Task 5 Step 2 (`npm run build`) mandatory before push and this stays closed.

## 3. Improvements (Recommended)

| # | Improvement | Impact | Effort |
|---|-------------|--------|--------|
| 1 | `reason` is dead input in `formatUnpaidAlert` — use it or drop it | M | L |
| 2 | Unpaid alert double-sends at morning **and** midday — confirm or gate | M | L |
| 3 | No mixed-section chunking test (overdue + dueToday spanning chunks) | M | L |
| 4 | Test fixture: `AwaitingPayment` seeds carry `paymentStatus: "Paid"` | L | L |

### Improvement 1: `reason` is an unused parameter in `formatUnpaidAlert`
`UnpaidAlertInput` carries `reason: FormatReason`, but `formatUnpaidAlert` never reads it — the header is always `🚨 OVERDUE — Unpaid & Past Due — {date}` regardless of morning/midday/command. That's a YAGNI smell (and a thing triple-review/simplify will flag later). Either remove `reason` from `UnpaidAlertInput`, or wire it to Improvement 2.

**Recommendation:** Tie it to Improvement 2 — if you keep midday suppression, `reason` earns its place; otherwise drop the field.

### Improvement 2: The unpaid alert nags twice a day (morning + midday)
The plan sends the unpaid-overdue alert for **all** reasons. Morning + midday crons both fire it, so the same unpaid-and-past-due orders generate two `🚨` messages per day to the pack-list group. The paid pack list legitimately repeats at midday ("Still Pending" — packing progresses through the day), but the unpaid set rarely changes between 07:00 and midday, so the second alert is mostly noise. The operator's framing was "just document it" (a low-urgency follow-up signal), which argues against a twice-daily klaxon.

**Recommendation:** Gate the unpaid alert to `reason !== "midday"` (i.e. morning + on-demand `/pack` only). This also gives `reason` (Improvement 1) a real use. The spec's "all reasons" line was a default, not a hard requirement — worth a one-line confirmation with the user. If twice-daily is genuinely wanted, keep as-is and drop `reason` per Improvement 1.

### Improvement 3: Add a mixed-section chunking test
The existing chunking tests (and the plan's migrated versions) only exercise `dueToday` with `overdue: []`. The new `<b>⚠️ OVERDUE (n)</b>` / `<b>Due Today (n)</b>` section-header strings are **new blocks** flowing through `chunkBlocks`. Nothing tests that, when both sections are large enough to span a 4096-char chunk boundary, (a) no chunk exceeds 4096, (b) each section header appears exactly once, and (c) a section header isn't emitted as the trailing block of a chunk with its orders pushed into the next chunk (orphaned header).

**Recommendation:** Add one test to `packListFormat.test.ts`:
```ts
it("chunks correctly across OVERDUE + Due Today sections", () => {
  const mk = (n: string) => card({ orderNumber: n, customerName: `Customer ${n} long name here`, deliveryAddress: `Jl. ${n} long address detail` });
  const out = formatPackList({
    ...baseInput,
    overdue: Array.from({ length: 25 }, (_, i) => mk(`OD-${i}`)),
    dueToday: Array.from({ length: 25 }, (_, i) => mk(`DT-${i}`)),
    counts: { total: 50, delivery: 50, pickup: 0 },
    generatedAt: Date.parse("2026-05-27T00:00:00Z"),
  });
  for (const c of out) expect(c.length).toBeLessThanOrEqual(4096);
  const all = out.join("\n");
  expect(all.split("⚠️ OVERDUE (25)").length - 1).toBe(1);
  expect(all.split("Due Today (25)").length - 1).toBe(1);
});
```
Note: overdue cards here need a past dueDate so `daysLate` renders; `card()`'s default dueDate is fine since the assertions don't check the late text. (If you want the late line exercised, set `dueDate` to a May-25 value as in the OVERDUE-section tests.)

### Improvement 4: `AwaitingPayment` fixtures carry a contradictory `paymentStatus`
`seedOrder` hardcodes `paymentStatus: "Paid"` for every order, including the new `AwaitingPayment` seeds — a semantically impossible state (awaiting payment yet paid). The query keys only on `status`, so tests pass today. But it's a latent trap: if anyone later tightens the unpaid scan with a `paymentStatus` guard, these fixtures would mask the regression (Phase 80.2 / Pitfall-class "fixture doesn't match reality" bug).

**Recommendation:** Derive it in `seedOrder`:
```ts
paymentStatus: (override.status ?? "PaymentReceived") === "AwaitingPayment" ? "Unpaid" : "Paid",
```

## 4. Refinements (Optional)

- **R1 — Breadcrumb wording:** the partial-send breadcrumb says `Pack list send failed after N/M chunks` where `M` now includes alert chunks; if the alert (last chunks) is what fails, the label slightly misattributes. Consider `report send failed`. Best-effort message — low value.
- **R2 — Defensive bucket:** `else dueToday.push(card)` would misbucket an impossible `"future"` paid order into dueToday. Index bound makes it unreachable; an explicit `classifyDue(...) === "overdue" ? overdue : dueToday` (current) is fine — optionally assert `!== "future"` to document intent.
- **R3 — Constant escape:** `escapeHtml("Unpaid & Past Due")` on a literal is harmless; the inline `Unpaid &amp; Past Due` literal would read more directly. Cosmetic.
- **R4 — sendPackList wiring untested:** the `generatedAt` threading + `[...packChunks, ...alertChunks]` concatenation has no direct test, but `sendPackList` was already untested (env + Telegram HTTP). Matches the existing test boundary; unit coverage of the two formatters + query is the right altitude. Noted as a known gap, not a fix.

## 5. Duplication Analysis

### Existing code leveraged (good)
| Code | Location | How used |
|------|----------|----------|
| `buildKanbanCard` | `convex/orders/helpers/kanbanBuilders.ts` | Card construction reused for all three buckets |
| `escapeHtml`, `sendTelegramHtml` | `convex/lib/telegramHtml.ts` | Unchanged HTML/send path |
| `WIB_OFFSET_MS`, `wibMidnightToUtc`, `getWibComponents` | `convex/lib/periodRange.ts` | WIB math, single source |
| `renderOrder` / chunking | `packListFormat.ts` | Refactored into shared `chunkBlocks` + `truncate`, reused by both formatters (DRY win) |

### Potential duplication risks
- **`formatIdr` (precise) vs `rupiah` (abbreviated) in `salesSummaryFormat.ts`.** This is an **intentional, justified** divergence — an actionable amount-owed must be exact (`Rp 150.000`), not `Rp 150K`. Acceptable. A principal might later consolidate both into a shared `convex/lib/currency.ts` with `idrExact()` + `idrShort()`, but that's out of scope here and not worth coupling two telegram modules now.

## 6. Phase / Wave Accuracy

| Task | Assessment | Notes |
|------|------------|-------|
| 1 — dueClassification helper | Good | Correct foundation-first ordering; pure + unit-tested |
| 2 — query bucketing + unpaid scan | Good | Depends on T1; correctly SEQUENTIAL |
| 3 — formatter sections + alert | Good | Depends on T1 (`daysLate`); independent of T2 logic |
| 4 — send wiring | Good | Depends on T2 (shape) + T3 (formatters) |
| 5 — verify + docs | Good | Full `npm run test` + `npm run build` + CHANGELOG |

**Ordering issues:** none. Foundation (T1) → consumers (T2/T3) → wiring (T4) → verify (T5) is correct.
**Missing phases:** none. (The wave table marks Wave 1 as SEQUENTIAL because all four tasks touch the same `convex/telegram` tree and chain on T1's exports — correct call, do not parallelize.)

## 7. Specialist Agent Recommendations

| Task | Recommended Agent | Rationale |
|------|-------------------|-----------|
| 1–4 | `convex-backend` | All backend + report-format work in `convex/` (matches plan's wave table) |
| 5 (audit) | `code-auditor` | Read-only type + pattern compliance gate before merge |
| 5 (tests) | `tdd-test-architect` (optional) | If you want the mixed-section chunking test (Improvement 3) authored rigorously |

## 8. Git Workflow Assessment

### Branch & merge strategy
| Check | Status |
|-------|--------|
| Feature branch specified | ✅ `feature/packlist-overdue-flagging` |
| Branch naming follows convention | ✅ `feature/{slug}` |
| Branch-from-main noted | ✅ "git switch main && git pull first" |
| Merge strategy documented | ✅ PR + squash (per task prompt + workflow) |

### Commit checkpoints
1. After T1 → `feat(telegram): add WIB dueDate classification helper…`
2. After T2 → `feat(telegram): bucket pack-list into overdue/dueToday + unpaid past-due scan`
3. After T3 → `feat(telegram): render OVERDUE section + unpaid past-due alert formatter`
4. After T4 → `feat(telegram): send overdue-sectioned pack list + unpaid alert message`
5. After T5 → `docs: changelog…`

Atomic, one-logical-unit-per-commit. ✅

### Pre-push verification
- [x] `npm run build` in plan (Task 5 Step 2) — and it type-checks convex tests
- [x] Full `npm run test` in plan (Task 5 Step 1)
- [x] `npm run type-check` in Success Criteria

### CI/CD & rollback
| Concern | Status |
|---------|--------|
| Rollback strategy | ✅ Revert commits; backend-only, no data migration |
| Deployment order | ✅ N/A — Convex deploys all functions atomically, so the new query shape + its consuming action ship together (no query/action split-brain) |
| Data backup needed | No |
| Migration safety | ✅ No schema/index change |

## 9. Documentation Checkpoints

| Task | Docs |
|------|------|
| 5 | `docs/CHANGELOG.md` (drafted in-plan) |
| 5 | `docs/API_REFERENCE.md` — only if `getOrdersForPackList` shape is documented there (plan says grep-first; confirm) |

CLAUDE.md: no new business rule or pitfall is mandatory here, but consider a one-liner under the Telegram pitfalls noting "pack-list overdue/unpaid sections derive from `dueClassification.classifyDue` (the kanban-equivalent WIB rule) — don't re-derive overdue elsewhere." Optional.

### CHANGELOG draft (matches plan)
```markdown
### Added
- Pack-list overdue flagging (SEED-001): dedicated ⚠️ OVERDUE section with days-late
  count + separate 🚨 Unpaid & Past Due alert. Overdue = dueDate's WIB day strictly
  before today (same rule as the kanban board). Backend/report-only.
```

## 10. Testing Plan Assessment

**Verdict: Adequate**

### Planned tests
| Layer | What | Test type | Status |
|-------|------|-----------|--------|
| Helper | `wibDayIndex` / `classifyDue` / `daysLate` WIB boundaries | vitest unit | planned ✅ |
| Backend | overdue/dueToday bucketing, counts, `generatedAt` | convex-test | planned ✅ |
| Backend | unpaid scan: past-due in, due-today out, no-dueDate out, paid excluded | convex-test | planned ✅ |
| Formatter | OVERDUE section, days-late text, header segment, empty-overdue parity | vitest unit | planned ✅ |
| Formatter | unpaid alert: header, amount, days-late, contact fallback, totalAmount fallback | vitest unit | planned ✅ |
| Integration | sendPackList wiring | — | none (matches existing boundary) |

### Missing test coverage (recommended)
| # | Missing test | Why it matters | Approach |
|---|--------------|----------------|----------|
| 1 | Mixed-section chunking (overdue + dueToday across 4096 boundary) | Section headers are new `chunkBlocks` participants; orphan-header / overflow regressions would ship silently | Improvement 3 snippet |
| 2 | (nice) Empty pack list + non-empty unpaid alert | Confirms "Nothing to pack ✅" coexists with a 🚨 alert | format-level: assert `formatPackList` → 1 chunk AND `formatUnpaidAlert` → non-empty |

### Test execution checkpoints
1. Per task (TDD red→green)
2. Before merge: **full** `npm run test` (not filtered — the plan explicitly calls this out after last session's fixture-path break) + `npm run build`

### Regression risk
- `packListQuery.test.ts` and `packListFormat.test.ts` are migrated (return-shape + field rename). Risk is low because the empty-`overdue` path is byte-identical, but **run the full format/query suites** to confirm the ~17 `cards:`→`dueToday:` renames are complete (a missed one is a compile error via the typed `FormatInput`, so it'll surface at `npm run build`).
- No other consumer of `getOrdersForPackList` exists besides `sendPackList` (grep to confirm before merge) — the `orders` → buckets shape change is otherwise contained.

## 11. Edge Cases to Address

- [x] Undefined `dueDate` excluded from both paid and unpaid scans (filtered post-collect) — covered
- [x] dueDate exactly at WIB midnight today → "today", not overdue — covered by helper tests
- [x] Empty overdue → no section headers, identical output — covered
- [x] No-contact unpaid order → `(no contact — check order)` — covered
- [x] `finalTotal` absent → `totalAmount` — covered
- [ ] Mixed-section chunk boundary (Improvement 3) — **add**
- [ ] Empty pack list + non-empty unpaid alert (test #2 above) — optional add
- [x] Partial-send failure → breadcrumb (preserved) — covered (R1 wording nit only)

## 12. Approval Conditions

**Blocking (must fix before implementation):** none.

**Recommended before implementation (cheap, high-signal):**
1. Decide Improvement 2 (midday suppression) with the user — it's a one-line product call that also resolves Improvement 1 (`reason` usage). 30 seconds.
2. Fold Improvements 3 (mixed-section chunking test) and 4 (fixture `paymentStatus`) into Tasks 3 and 2 respectively.

These are additive to an already-solid plan — proceed to execution after the Improvement-2 confirmation; 1/3/4 can be applied inline during their respective tasks.

---

*Generated by /staffreview*
