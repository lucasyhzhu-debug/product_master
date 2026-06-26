# Staff Review: Subscription Creation & Onboarding UI — Spec

**Date:** 2026-06-26
**Plan:** `docs/superpowers/specs/2026-06-26-subscription-creation-onboarding-design.md`
**Reviewers:** Staff Developer (Implementation) + Principal Developer (Architecture)
**Plan Structure:** ✅ Validated (Git Workflow / Waves / Testing / Success Criteria / Rollback all present)

---

## 1. Summary

**Overall Assessment:** Approve (with Improvements applied inline)

The spec is well-scoped and grounded against real code — `createSubscription`/`updateSubscription`, `customers.create`, `crm.customers.updateCustomerCrmFields`, and `crm.agreements.*` all exist with the cited signatures. No Critical issues. Four Improvements raise correctness/clarity: (1) the rich-customer create currently spans three sequential mutations with a partial-write seam — adopt a thin atomic backend wrapper; (2) enumerate the activation-required fields; (3) pin the exact `menuProducts` query + its public-`useQuery` gotcha; (4) lock the route param name + confirm the `new` vs `:subId` ranking.

## 2. Critical Issues (Must Fix)

None. The slice composes existing manager+admin mutations on existing gated routes; no schema change, no auth widening, no money re-keying.

## 3. Improvements (Recommended)

| # | Improvement | Impact | Effort |
|---|-------------|--------|--------|
| 1 | Replace the 3-call rich-customer create with an atomic backend `crm.customers.createCustomer` | H | L |
| 2 | Enumerate activation-required fields (define the guard precisely) | M | L |
| 3 | Pin `api.menuProducts.queries.list({activeOnly:true})` + public-query `useQuery` (not session) | M | L |
| 4 | Lock route param `:subId`; confirm `new` static-segment ranks above `:subId` | M | L |

### Improvement 1: Atomic customer-create wrapper
§3.1 composes `customers.create` → `customers.update` (companyName/billing) → `crm.customers.updateCustomerCrmFields` (contact/social/addresses). Verified: `updateCustomerCrmFields` (`convex/crm/customers.ts:20`) does NOT carry companyName/npwp/billingAddress (those are on `customers.update`), so three calls are genuinely required. Three sequential mutations across the network have a partial-write window: a failure after `create` leaves a thinly-populated customer. Per the user's "optimize for correctness/maintainability over cheapest" directive, this should be one transaction.
**Recommendation:** Add a thin `crm.customers.createCustomer` mutation (`roles:["manager","admin"]`) that inserts the customer with all CRM fields in one `ctx.db.insert` (it can also set `customerType` if known). One additive mutation + `convex codegen`; removes the partial-write seam and the multi-await orchestration from the dialog. Flip the spec default to this; keep the 3-call path only as the rejected alternative. **This makes the slice frontend + 1 backend mutation, not pure-frontend** — update AC14 (codegen committed) and the rollback note.

### Improvement 2: Define the activation guard
AC10 blocks Activate when "the schedule template is empty or a required term is missing" but doesn't list the terms. Make it explicit: **Activate requires** `label` non-empty, `unitPrice > 0`, `baselineDailyQty > 0`, `deliverByTime` valid HH:MM, `cogsBasis > 0`, `startDate` set, and **≥1 product line across the schedule template**. A draft may omit any of these; an active subscription may not.

### Improvement 3: Pin the products query
The scheduler uses `api.menuProducts.queries.list` with `{ activeOnly: true }` and — per the comment at `SubscriptionSchedulePage.tsx:122` — it is a **public `query`** consumed with plain `useQuery` (NOT `useSessionQuery`; no `sessionId` arg). The `ScheduleTemplateEditor` MUST use the same call the same way, or it will mis-call the hook. Pin this in §3.1/§8.

### Improvement 4: Route naming + ranking
Existing routes use `:subId` (e.g. `crm/customers/:customerId/subscriptions/:subId`, `App.tsx`). The new route should be `crm/customers/:customerId/subscriptions/new`. In React Router v6 a static segment (`new`) ranks above a dynamic one (`:subId`), so there is no match collision — but state this explicitly and use `:subId` (not `:subscriptionId`) for consistency. Activate lands back on the `:subId` page.

## 4. Refinements (Optional)

- Default `confidentialPrice = true` (a B2B partner price is confidential by default; the strip is already built downstream).
- Default `startDate` to the next Monday (WIB) via `convex/lib/periodRange.ts` week helpers — subscriptions bill Monday-aligned weeks.
- `ScheduleTemplateEditor` should share only the **product-dropdown primitive** with `ProductLineEditor`, not reuse it wholesale — `ProductLineEditor` carries per-line `unitPrice`/`lineTotal`/`locked` (week-schedule concerns) the template doesn't have. Build a focused line (product + qty) to avoid dragging priced-line semantics into the template.
- Money formatting: reuse the existing IDR formatter used across CRM (don't hand-roll) for the credit-estimate preview.

## 5. Duplication Analysis

### Existing code to leverage
| Code | Location | How to use |
|------|----------|------------|
| `createSubscription`/`updateSubscription` | `convex/subscriptions/mutations.ts:13,53` | create draft / activate |
| `updateCustomerCrmFields` | `convex/crm/customers.ts:20` | rich customer fields (or fold into the new wrapper) |
| `crm.agreements.*` + `AgreementUpload.tsx` | `convex/crm/agreements.ts`, `src/components/crm/` | attach/upload/link agreement |
| `deriveWeeklyQty` | `convex/subscriptions/creditMath.ts:20` | client preview (Σ line qtys — confirmed) |
| `api.menuProducts.queries.list` | public query | product dropdown |
| Existing hub edit-dialog field set | `CustomerDashboard.tsx` | mirror field labels/validation in NewCustomerDialog |

### Potential duplication risks
- Re-implementing customer field validation already present in the hub edit dialog — share a field schema/component where practical.

## 6. Phase / Wave Accuracy
Waves are sketched (filled by writing-plans). Ordering is sound: schedule-template + form primitives → pages + activate → verification. With Improvement 1, add a Wave 0 (backend `createCustomer` wrapper + codegen) before the FE waves.

## 7. Specialist Agent Recommendations
| Phase | Recommended Agent | Rationale |
|-------|-------------------|-----------|
| Backend wrapper (if adopted) | `convex-backend` | one additive mutation + codegen |
| FE form/editor/pages | `react-ui-builder` | shadcn/form work in `src/` |
| Tests | `tdd-test-architect` | component tests T1–T5 |
| Verification | `code-auditor` | access (Pitfall #19) + pattern compliance |

## 8. Git Workflow Assessment
Branch `plan/subscription-creation-ui` for planning; implementation branch off `main` at execution. Atomic commits per component. Pre-push `npm run build` + `type-check` + vitest. Rollback = revert commits (+ codegen if wrapper). ✅

## 9. Documentation Checkpoints
CHANGELOG (execution), FILE_MAP (CRM creation surfaces + permission rows), ROADMAP (record now / remove on execution), API_REFERENCE (only if the wrapper mutation is added).

## 10. Testing Plan Assessment
**Verdict:** Adequate. Component tests T1–T5 cover form validation, template shaping, preview math, the create-customer composition, and the activate guard. Add a backend mutation test if the `createCustomer` wrapper is adopted. Full create→activate→kanban journey + live agreement upload → persona-UAT at close-out (not headless-claimable). Note explicitly.

## 11. Edge Cases to Address
Already covered (EC1–EC9). Add: activating with all-zero-qty product lines (treat as empty → blocked); switching rollover `rollover→expire` clears `rolloverExpiryWeeks` before submit.

## 12. Approval Conditions
**To approve:** none blocking.
**Apply before planning (Improvements):** 1 (atomic create wrapper — flip default), 2 (activation-required fields), 3 (pin products query), 4 (route param/ranking). All applied inline to the spec.

---

*Generated by /staffreview*
