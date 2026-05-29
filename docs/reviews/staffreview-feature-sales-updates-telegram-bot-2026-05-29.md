# Staff Review: Sales-Updates Telegram Bot (implementation)

**Date:** 2026-05-29
**Branch:** `feature/sales-updates-telegram-bot`
**Base → Head:** `838bbf75` → `4a8f90b5`
**Reviewer:** Staff / Principal Engineer (implementation-fidelity + architecture pass)
**Plan:** `docs/superpowers/plans/2026-05-28-sales-updates-telegram-bot.md`
**Spec:** `docs/superpowers/specs/2026-05-28-sales-updates-telegram-bot-design.md`
**Prior (plan-stage) review:** `docs/reviews/staffreview-sales-updates-telegram-bot-2026-05-28.md`

---

## 1. Summary

**Overall Assessment: Approve with minor doc fixes** — 0 Critical, 2 Important, 4 Minor, 2 Nitpick.

The implementation is a faithful, well-disciplined execution of the plan. All 6 tasks landed, TDD was honoured (14 tests, all green: 4 range + 5 query + 5 format), `npx tsc -b` is clean, and the plan's "Post-staffreview adjustments" were all carried through verbatim:

- `by_source_period` index used instead of collect-all-then-filter (Improvement 2). ✅
- Read-budget scale comment + ~5K-row WATCH-ITEM present (Improvement 1). ✅
- K3Mart order-count omitted in the formatter (Improvement 4). ✅
- Rollback & deployment + deploy-precondition folded into the plan. ✅

The implementation also went **beyond** the plan in one good way: it added a `transactionType !== "sales"` guard (excludes `return` / `delta_inferred` rows), matching the canonical `unitEconomics.ts` predicate, and added a dedicated K3Mart return-exclusion test. That is a correctness improvement, not scope creep — but it introduces an undocumented divergence from the dashboard reference (see Important #1).

The only real issues are **documentation accuracy**, not code: the CHANGELOG and FILE_MAP both describe the unassigned-role behaviour as "silently no-op", but the code (and the plan/spec) say it **throws** a visible failed-cron. And the BigSeller / DA-12 retirement (the highest operational risk) is documented but not mitigated.

Every load-bearing assumption was re-verified against the codebase and held: `transactionType` union (`schema.ts:1209-1213`), `by_source_period` index (`schema.ts:1223`), `fetchInternalOrderDataMap` signature (`externalData/queries.ts:29`), internal `periodStart = confirmedAt ?? orderDate` (`internal/adapter.ts:165-175`), all three sync action refs (`gobiz/adapter.ts:793`, `k3mart/adapter.ts:459`, `internal/adapter.ts:106`), and `getChatIdByRole` throw semantics (`chatRegistry.ts:71-90`).

---

## 2. Critical Issues (Must Fix)

**None.**

All correctness-blocking risks the plan flagged were verified non-issues, and the implementation handles them correctly. The plan-stage staffreview's "Approved as-is" holds in shipped code.

---

## 3. Important (Should Fix)

### Important 1 — Return-exclusion silently diverges the summary gross from the dashboard

**File:** `convex/telegram/salesSummary/salesSummaryQuery.ts:159` and `:210`

**What:** The implementation added a guard not present in the plan:
```ts
if (row.transactionType && row.transactionType !== "sales") continue;
```
This excludes `return` and `delta_inferred` rows. The canonical dashboard reference `getRevenueByOutletInternal` (`externalData/queries.ts:1515`) does **not** apply this filter — it sums every in-period `externalRevenue` row's `revenueGross`.

**Why it matters:** Spec Deviation #2 / D1 promised "Direct gross matches `getRevenueByOutletInternal`". For **Direct** that promise still holds (internal rows are always `transactionType: "sales"` — `internal/adapter.ts:178`). But for **K3Mart** (and any future channel that writes `return`/`delta_inferred` rows), the Telegram round-up gross will now be **lower** than the dashboard's outlet revenue for the same period. A sales-team member cross-checking the bot against the dashboard will see a mismatch with no explanation. The divergence is a *defensible product choice* (a "sales round-up" arguably shouldn't count returns) — but it is currently undocumented and contradicts a stated spec deviation.

**Suggested fix:** Keep the filter (it's the right behaviour for a sales digest), but (a) add an inline comment in `getSalesSummary` stating it intentionally diverges from `getRevenueByOutletInternal` for K3Mart returns, and (b) add one line to the CHANGELOG "For the team" note: "Returns are excluded, so K3Mart figures may read lower than the channel dashboard." This converts a silent mismatch into a documented, intentional one.

### Important 2 — CHANGELOG / FILE_MAP misstate the unassigned-role failure mode

**File:** `docs/CHANGELOG.md` (Migration/Operational bullet) and `docs/FILE_MAP.md` (Operator step)

**What:** Both docs say: "Until assigned, the crons **fire but silently no-op** (no delivery destination)." The actual behaviour: `getChatIdByRole` **throws** `No Telegram chat assigned to role 'sales-updates'` (`chatRegistry.ts:89`) — there is no env fallback for `sales-updates` (`TELEGRAM_FALLBACK_ROLE=pack-list` only). The orchestrator does not catch this, so the cron run **fails visibly** in the Convex dashboard Crons tab. The plan (line 67) and spec (§7) correctly describe it as a throw; only the merged docs are wrong.

**Why it matters:** This is the single hard deploy precondition. An operator who reads the CHANGELOG expects benign no-ops and will not be alarmed by — or even look for — the failed-cron entries that will actually appear every 23:00/Mon/1st until a chat is assigned. It also wastes a full daily refresh (3 syncs run before the throw at `sendSalesSummary.ts:56`).

**Suggested fix:** Correct both docs to: "Until a chat is assigned to `sales-updates`, every cron run **fails** (visible as a failed cron in the dashboard) and nothing sends — recoverable any time by assigning the role, no redeploy." Optionally, move the `getChatIdByRole` call **before** the daily refresh block in the orchestrator so an unassigned role fails fast without burning three syncs (and consider the plan-stage Improvement 5: catch + log an actionable "assign a chat at /admin/telegram-chats" message before rethrowing).

---

## 4. Minor

### Minor 1 — DA-12 (Phase 79 Shopee 7-day auto-backfill) retired with documentation only, no mitigation

**File:** `convex/crons.ts` (deleted block), `docs/CHANGELOG.md`, `docs/FILE_MAP.md`

**What:** Removing `bigseller nightly 7d resync` retires the trailing-7-day Shopee `--`-row self-heal. This is correctly called out in spec §2 ("user has accepted this tradeoff"), the CHANGELOG, and FILE_MAP. The `nightlySync` *action* is preserved (only the registration removed), so it remains manually invocable — exactly as the plan's rollback section states.

**Why it's only Minor:** the tradeoff was explicitly accepted by the user at spec time and is documented in three places. It is, however, a real behavioural regression (same-day Shopee rows will no longer auto-heal within 24h), and "refresh BigSeller manually" is an operator-discipline dependency with no enforcement or reminder. On-demand-only is acceptable per the accepted spec, but it is a *silent* regression for anyone not reading the CHANGELOG.

**Suggested fix:** Acceptable as-is given explicit user sign-off. To de-risk: add a short note to MEMORY.md / the operator runbook ("Shopee `--` rows no longer auto-backfill nightly — trigger `nightlySync` from the dashboard if same-day Shopee rows look stale"), or schedule `nightlySync` externally if the manual cadence proves unreliable. No code change required.

### Minor 2 — Empty-state still renders "Total: Rp 0 · 0 orders"

**File:** `convex/telegram/salesSummary/salesSummaryFormat.ts:65-68`

**What:** When `channels.length === 0`, the message is `header(data) + "\n\nNo sales recorded …"`, and `header` always emits the `Total: Rp 0 · 0 orders` line. The plan-stage Refinement flagged this; it was not addressed.

**Why:** Cosmetic — "Total: Rp 0 · 0 orders / No sales recorded today" is slightly redundant. Harmless.

**Suggested fix:** Suppress the total line when there are no channels, or accept as-is (it's defensible — a zero total is honest).

### Minor 3 — "▲ new" delta case for a channel/total going 0 → positive not handled

**File:** `convex/telegram/salesSummary/salesSummaryQuery.ts:32-35` (`pctDelta` returns null when `prev <= 0`)

**What:** Plan-stage Refinement suggested rendering "▲ new" when prior period gross was 0 and current is positive. Implementation returns `null` (renders no delta), which the formatter drops to an empty string. Not addressed.

**Why:** A brand-new channel/outlet shows no delta badge in weekly/monthly — mildly less informative, but not wrong.

**Suggested fix:** Optional. If desired, distinguish `prev === 0 && cur > 0` → a sentinel the formatter renders as "▲ new". Low value for v1.

### Minor 4 — `deliveryFee` widened in `rowGross` orderMap type but unused

**File:** `convex/telegram/salesSummary/salesSummaryQuery.ts:72`

**What:** `rowGross`'s `orderMap` param type is `Map<string, { totalAmount; finalTotal; deliveryFee }>` (the plan had only `{ totalAmount; finalTotal }`). It was widened to match the real `fetchInternalOrderDataMap` return shape (`queries.ts:32`), which is correct — but `deliveryFee` and `finalTotal` are never read inside `rowGross` (only `totalAmount`).

**Why:** Harmless type-accuracy artifact. No behavioural impact.

**Suggested fix:** None needed. The wider type is the honest signature of the shared helper.

---

## 5. Nitpick

### Nitpick 1 — `rowGross` duplicates the canonical internal-gross rule with no cross-reference

**File:** `convex/telegram/salesSummary/salesSummaryQuery.ts:70-79`

`rowGross` re-implements the internal-order gross selection from `getRevenueByOutletInternal` (`queries.ts:1567-1570`). Plan-stage Improvement 3 noted this; it was (acceptably) deferred. If the canonical rule ever switches from `totalAmount` to `finalTotal`, the summary will silently drift from the dashboard. A one-line `// keep in sync with getRevenueByOutletInternal internal-order branch` comment would cost nothing and flag the coupling.

### Nitpick 2 — Idempotency of nightly re-refresh relies on adapter upserts (undocumented)

**File:** `convex/telegram/salesSummary/sendSalesSummary.ts:23-50`

The daily refresh re-runs all three syncs every night over the same day; correctness depends on the sync adapters being idempotent upserts (true today). Plan-stage Refinement suggested a one-line note so a future adapter change doesn't introduce double-counting. Not added. Trivial.

---

## 6. Plan-Fidelity Matrix

| Plan / Spec item | Built? | Evidence |
|---|---|---|
| Task 1 range resolver (daily/weekly/monthly WIB, Jan boundary) | ✅ | `range.ts`; 4 tests green |
| Task 2 query via `by_source_period` (Improvement 2) | ✅ | `salesSummaryQuery.ts:49-63` |
| Task 2 read-budget comment + ~5K WATCH-ITEM (Improvement 1) | ✅ | `salesSummaryQuery.ts:43-48` |
| Task 2 Direct gross via `fetchInternalOrderDataMap` (Deviation #2) | ✅ | `:96-99`, `:74-76` |
| Task 2 product 3-shape fallback (items → row → orderItems; cancelled excluded) | ✅ | `:186-201`; tests pin all 3 |
| Task 3 formatter, 4000-char chunk + per-section truncation cap | ✅ | `salesSummaryFormat.ts:8-10,70-71` |
| Task 3 K3Mart order-count omitted (Improvement 4) | ✅ | `:34`; test asserts no "(N orders)" |
| Task 4 orchestrator, best-effort per-sync try/catch + breadcrumb | ✅ | `sendSalesSummary.ts:23-81` |
| Task 4 no `use node` directive (V8 runtime, matches sendPackList) | ✅ | commit `b66afd98` |
| Task 5 add 3 crons, delete bigseller nightly resync | ✅ | `crons.ts` diff |
| Task 6 CHANGELOG + FILE_MAP | ⚠️ | present but inaccurate (Important #2) |
| Rollback & deployment + deploy precondition | ✅ | folded into plan |
| **Beyond plan:** `transactionType !== "sales"` guard + K3Mart return test | ➕ | `:159,:210`; good addition, see Important #1 |

**Spec channel/outlet/delta decisions:** GoFood-by-outlet (D2), K3Mart "if any" via zero-channel omission, Direct, gross headline (D1), per-SKU qty (D3), weekly/monthly-only deltas (D10), no "units sold" aggregate (D13) — **all honoured**.

**Spec per-outlet delta question (focus item 2):** The spec's §6 weekly example shows per-outlet deltas ("• Crystal — Rp 15.2M ▲ 5%"); the plan's `OutletSummary` carries no `deltaPct`, and the implementation matches the plan (outlets have gross/orders/products only). **The plan is authoritative here** (the spec example is illustrative, the plan's typed contract is the spec-superseding artifact). This is a deliberate, documented narrowing — not a gap. Per-outlet deltas would require fetching+matching previous-period rows down to the outlet grain, materially increasing read cost; deferring them is the correct call for v1. Acceptable.

---

## 7. Architectural Risk Assessment (focus item 3)

- **Refresh→query freshness seam:** the orchestrator awaits all three syncs inline before querying (spec D4 "linear, no watchdog"). Correct — no async poll-state-machine (that was BigSeller-only, now de-scoped). Internal `periodStart = confirmedAt ?? orderDate` means same-day Direct revenue lands in the window; the `by_source_period` range on `periodStart` captures it consistently with the dashboard. ✅
- **Read-budget scaling:** O(rows) fan-out (1 items lookup per non-internal row; 1 orders + 1 orderItems lookup per internal row), bounded by the 3-source `by_source_period` range. Documented ~1K-row current scale, ~5K WATCH-ITEM, 16,384 read ceiling. Sound for current scale; the watch-item is a conscious cliff, not a latent one. ✅
- **Cron load:** 3 new crons; daily adds 3 sync actions at 23:00 WIB. No overlap with the 07:00/midday pack-list crons. K3Mart cron-auth path (`syncK3MartSales` resolves stored creds, no session token) degrades to `K3Mart ✗` footer rather than failing the send — by design. ✅
- **Schema:** none claimed, none made. ✅ (verified — no `schema.ts` in the diff.)

No coupling or real-time concerns. The module is self-contained under `convex/telegram/salesSummary/` and reuses Phase 85 registry + existing platform/period helpers cleanly.

---

## 8. Over-Engineering Check (focus item 5)

None. The module is proportionate to the requirement: one pure range resolver, one query, one pure formatter, one orchestrator. No speculative abstraction, no premature pre-aggregation (correctly deferred behind a watch-item). The per-section truncation cap + chunk budget reuse the pack-list lessons rather than reinventing. Good restraint.

---

## 9. Missing Pieces (focus item 6)

No planned items are absent from the diff. The two plan-stage *Refinements* that were explicitly marked optional/deferred (empty-state total suppression, "▲ new" delta) remain unimplemented — that is consistent with the plan's deferral, captured here as Minor 2/3 for completeness. The `sendSalesSummary` action has no unit test, which is the documented `sendPackList` precedent (actions doing real `fetch` are verified via cron/manual run) — acceptable, though extracting the refresh-status→footer mapping into a tiny pure helper for a unit test would be cheap insurance (plan-stage Testing Gap #1).

---

## 10. Verification Performed

| Check | Result |
|---|---|
| `npx vitest run convex/telegram/salesSummary` | ✅ 14/14 pass (3 files) |
| `npx tsc -b` | ✅ clean |
| All sync action refs resolve | ✅ gobiz:793, k3mart:459, internal:106 |
| `transactionType` union covers `return`/`delta_inferred` | ✅ schema.ts:1209-1213 |
| `by_source_period` index exists | ✅ schema.ts:1223 |
| `getChatIdByRole` throw semantics | ✅ chatRegistry.ts:89 (contradicts CHANGELOG) |
| Internal `periodStart` = recognition date | ✅ internal/adapter.ts:165-175 |

---

## 11. Approval Conditions

**Approved.** Nothing blocking.

**Fix before/at merge (cheap, docs-only):**
1. Important #2 — correct CHANGELOG + FILE_MAP unassigned-role wording from "silently no-op" to "fails visibly (failed cron)".
2. Important #1 — one inline comment + one CHANGELOG line documenting the intentional return-exclusion divergence for K3Mart.

**Optional (defer):** Minor 1 operator-runbook note for DA-12; fail-fast `getChatIdByRole` reorder; Nitpicks 1–2 cross-reference comments.

---

*Generated by /staffreview (implementation-fidelity pass)*
