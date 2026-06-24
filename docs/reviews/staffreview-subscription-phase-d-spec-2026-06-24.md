# Staff Review: Subscription & Credit System — Phase D Spec (rev-5)

**Date:** 2026-06-24
**Plan:** `docs/superpowers/specs/2026-06-23-subscription-credit-system-phase-d-spec.md` (rev-5)
**Reviewers:** Staff Developer (Implementation) + Principal Developer (Architecture)
**Artifact type:** SPEC (WHAT + acceptance) — reviewed at the spec gate, grounded against the merged tree + the Slice-0 branch (`feature/subscription-backend-consolidation`).
**Plan Structure:** ✅ Spec-shaped (WHAT/data/AC/edge/testing/access/schema/deps/Qs all present).

---

## 1. Summary

**Overall Assessment:** Approve with revisions (fold Improvements into the spec before planning).

The spec is mature (5 revs, proofing rounds, conformance audit) and the rev-5 corrections are sound. Grounding against real code confirms **every consumed artifact exists with the stated names** (customers CRM fields, `canAccessCrm`, `getFundingDashboard`, `markWeeklyInvoicePaid`, `getWeekPool`, `supplyAgreements`, `creditLedger`, all indexes). No Critical (failure/data-loss/security) issues. The blockers to a clean plan are four **implementability gaps** the spec leaves implicit: (I1) current-week resolution, (I2) timeline derived-event source enumeration + actor-name join, (I3) an overstated Slice-0 dependency, (I4) UX-UAT needs seed data. Plus one self-consistency cleanup (taxonomy two-level model contradicts surviving rev-4 body text).

## 2. Critical Issues (Must Fix)

None. (All consumed signatures verified to exist; access model is uniformly manager+admin; no schema change; revert = revert commits.)

## 3. Improvements (Recommended)

| # | Improvement | Impact | Effort |
|---|-------------|--------|--------|
| I1 | Define current-week resolution | H | L |
| I2 | Enumerate timeline derived-event sources + actor join | H | L |
| I3 | Relax the Slice-0 dependency (it's a merge-order, not a functional, dep) | M | L |
| I4 | UX-UAT must seed data first | H | L |
| I5 | Taxonomy two-level model — scrub surviving rev-4 "same union/compile error" body text | M | L |

### I1 — Current-week resolution is undefined (load-bearing for the gauge, drawdown, ledger statement, back-refs)
`getWeekPool`, `getCreditLedgerStatement`, `getWeekBackReferences` all take an **explicit `subscriptionWeekId`**. But the customer dashboard's `currentWeekPoolBySubscription`, the credit gauge, and the drawdown chart need **"this subscription's CURRENT week"**, and **no resolver exists**. `subscriptionWeeks` has `.index("by_subscription_weekStart", ["subscriptionId","weekStart"])` (`schema.ts:2581`).
**Recommendation:** Spec a small backend helper `resolveCurrentWeek(ctx, subscriptionId, nowWib)` → latest `subscriptionWeeks` row with `weekStart ≤ nowWib` via `by_subscription_weekStart` (range `.lte`, `.order("desc").first()`). WIB `now` from `convex/lib/periodRange.ts`. `getCustomerRecord` fans out over the customer's subscriptions (bounded — few per customer) calling it once each → `currentWeekPoolBySubscription`. Add an AC: empty/no-current-week subscription degrades to an empty gauge, not a crash.

### I2 — Timeline derived-event sources + actor name not enumerated
`getCustomerTimeline` "merges derived events," but: (a) `creditLedger` has **NO `by_customer` index** — topup/drawdown events must fan out customer → `subscriptions` (`by_customer`) → per-sub `creditLedger` (`by_subscription`); (b) `markWeeklyInvoicePaid`'s topup `createdBy` is `Id<"users">`, but AC10 wants the **confirmer's name** — needs a `users`-table join, which the spec never mentions; (c) `getByCustomer` (Slice-0) returns orders with **no items** and money stripped for non-managers — fine for the m+a timeline, but order-row *details* must read order-level snapshot fields only (no per-item fetch), consistent with the §4 "stored snapshot `productName`" edge case.
**Recommendation:** Add a §2.2 sub-list "derived-event source map": orders via `orders.by_customer`; subscription weekly/topup invoices via `invoices.by_customer`; ledger topups/drawdowns via `subscriptions.by_customer` → `creditLedger.by_subscription` (bounded fan-out, documented); milestones from `subscriptions.startDate/endDate/terminationNoticeDate` + `supplyAgreements.uploadedAt`/`versions[].uploadedAt`. Resolve `actor` once per distinct `createdBy`/`confirmedBy`/`uploadedBy` via a `Map<Id<"users">,name>` (batch the user gets, no N+1 per row).

### I3 — Slice-0 dependency is overstated (it's merge-ordering, not functional)
Rev-5 says Phase D "consumes its R2 strip seam (`stripOrders`/`stripOrder`)." Grounded reality: the **entire `/crm` surface is manager+admin**, so `stripSubscriptionPricing` is a **no-op for every CRM viewer** (managers see all money). Phase D adds *new* CRM queries and does **not edit `convex/orders/queries.ts`**; the only order-surface change is a **frontend** customer-name link in `OrderDetail`/`OrderSlideOver`/kanban (no backend money exposure). So Phase D has **no functional dependency on R2** — the only reason to land after Slice 0 is to avoid a merge conflict if both touch order queries (they don't) and to honor the consolidation spec's "D reads clean seams" intent.
**Recommendation:** Restate the dependency as: *"Land Phase D after Slice 0 merges for a clean base; no functional strip dependency — CRM is m+a so nothing is stripped within it."* This means **Phase D planning need not block on Slice 0** (only the final merge should follow it). Removes the false blocker behind the user's "keep looping" concern.

### I4 — UX-UAT (AC16) will surface nothing on empty screens
The `/browse` UX pass can only find nitpicks if the screens have data. An untracked `convex/subscriptions/_devSeed.ts` exists.
**Recommendation:** The UX-UAT task's live-env prep MUST run/confirm a seed that produces ≥1 subscription customer with: ≥1 agreement (ID+EN versions), ≥2 subscriptions, a current week with `plannedDays` + ledger topup/drawdowns, ≥1 unpaid invoice, and a few orders across statuses. Reference `_devSeed.ts`; extend it if it doesn't cover all D surfaces. Findings file: `docs/reviews/uat-phase-d-ux-findings-2026-06-24.md`.

### I5 — Taxonomy two-level model contradicts surviving rev-4 body text
Rev-5 + AC17 correctly establish the two-level model (`customerActivity.type` specific event + `subtype` → `ActivityType` visual category), but rev-4 body text still says the unions are "identical … a missing entry is a compile error" (§1 item 3, §2.1 table, §7.7, AC6). Grounded: frontend `ActivityType = order|finance|message|document|schedule|milestone` (6) ≠ backend `customerActivity.type = whatsapp_drafted|note|manual_milestone` (3 stub). They are deliberately different levels.
**Recommendation:** Point AC6 at AC17 as the authoritative model; the plan implements an `eventType → ActivityType` mapper + runtime coverage test (every produced event resolves to a category), NOT a single shared union. (Folded into spec; full scrub deferred to the plan, which I author.)

## 4. Refinements (Optional)
- Stable timeline sort tiebreaker `(at desc, _id desc)` — already noted in §4; carry into the pure-fn test.
- `getByCustomer` already includes `order_staff`/`kitchen` roles + strips — reuse as-is for the dashboard order list; do not add a parallel query.
- Nav entries (Header `configItems` + `MobileBottomNav moreItems`) ship m+a-gated from first commit (ship-dark, Phase-85 pattern) — already in scope; ensure both surfaces (Pitfall #20-style dual nav).

## 5. Duplication Analysis
**Reuse (verified):** `getFundingDashboard` + `CrmFundingDashboardPage` (don't rebuild funding aggregate); `getWeekPool`/`deriveCreditPool` (read derived `pool`, never re-key); `stripOrder`/`getByCustomer` (Slice-0); `protectedQuery`/`protectedMutation` (`convex/lib/functions.ts`, SessionIdArg, `ctx.user`, no token); `getNextInvoiceNumber` (agreements don't need it; invoices do). **Don't duplicate:** `businessSettings.generateUploadUrl` is admin-only → fresh `generateAgreementUploadUrl` m+a wrapper (audit #19).

## 6. Phase / Wave Accuracy
Combined single-plan framing is correct now that Phase B is merged. Waves: W1 = D1 scaffold (routes/breadcrumbs/contact-links/agreements/`updateCustomerCrmFields`/subscriptions list/ledger statement/back-refs/current-week resolver) → W2 = D2 timeline + D3 visuals (depend on scaffold + taxonomy mapper) → W3 = verification (type-check/build/tests/codegen, code-auditor role grep, dual-surface check, UX-UAT). Shared/serialized files: `src/lib/crmActivityTaxonomy.ts` (extend once, W1), `convex/_generated/api.d.ts` (regen once per wave on merged tree), `Header.tsx`/`MobileBottomNav.tsx` (nav, one task).

## 7. Specialist Agent Recommendations
`convex-backend` (queries/mutations/current-week resolver/timeline merge), `react-ui-builder` (CRM pages/components), `tdd-test-architect` (pure-fn + RTL), `code-auditor` (role-superset grep + dual-surface), main session for `/triple-review` + `/simplify` + the `/browse` UX-UAT (live env).

## 8. Git Workflow Assessment
Feature branch off synced `main` (after Slice 0 merges) ✅; squash-merge ✅; commit-per-task ✅; `npm run build`+`type-check`+`test`+`codegen` pre-merge ✅; no schema change → low rollback risk ✅; split-brain `gh run list` check after merge ✅.

## 9. Documentation Checkpoints
CHANGELOG (always), API_REFERENCE (new CRM queries/mutations), FILE_MAP (new CRM file area + permission rows), CLAUDE.md (CRM principles already present; add the taxonomy two-level rule if non-obvious). No SCHEMA.md change (no schema).

## 10. Testing Plan Assessment
**Verdict:** Adequate (spec level). Pure-fn focus is right: `buildCustomerTimeline`, `buildLedgerStatement` (week-scoped `balanceAfter` resets), `buildDrawdownSeries` (single-sub, no sum), contact-link builder, `eventType→ActivityType` coverage test, `resolveCurrentWeek` (I1). RTL for two-pane render + breadcrumb trail + linkified object refs + empty states. Add: actor-name-join test (I2); current-week empty-state test (I1).

## 11. Edge Cases to Address
- [ ] Subscription with no current week / no ledger → empty gauge, not crash (I1)
- [ ] Customer with 0 subscriptions / 0 agreements / 0 orders → all empty states
- [ ] Timeline > 14d window + "load older" cursor; stable tiebreaker
- [ ] Deleted/renamed menuProduct → stored snapshot `productName`
- [ ] Agreement uploaded but unlinked → standalone render
- [ ] Manager mounts any CRM hook before a dialog opens → roles ⊇ canAccessCrm (Pitfall #19)

## 12. Approval Conditions
**To approve (fold into spec before/at planning):** I1, I2, I3, I4 (I5 resolved in the plan).
**Recommended:** §4 refinements.

*Generated by /staffreview*
