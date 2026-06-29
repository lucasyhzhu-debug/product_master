# Handover prompt — Ordering subscription-credit UX (Slices 1–3)

> Paste everything in the fenced block below as the argument to `/spec-plan-pipeline`
> in a fresh session (after `/clear`). It is self-contained.

```
/spec-plan-pipeline Build Slices 1–3 of the ordering-screen subscription-credit UX. The full design already exists and is the source of truth — READ IT FIRST: docs/superpowers/specs/2026-06-29-ordering-subscription-credit-ux-SPEC.md (sections "Slice 1/2/3" and "Decisions (locked 2026-06-29)"). Ground the spec/plan in the real files below; do not re-discover from scratch.

GOAL (operator's words): a B2B cafe places a daily order from the ordering sheet; if they have an active subscription it must be obvious at customer-select time and the order can draw down that subscription's credit. They must be able to reduce a day's existing order before it ships, and "add more" by creating a new order that draws down the same credit.

ALREADY SHIPPED — DO NOT REBUILD:
- Slice 4 (end-of-day Telegram KPIs) — PR #226, live. Counts SCHEDULED PRODUCT PIECES (orderItems.quantity / weeklyQty), NOT BOM balls.
- resyncWeekPlanFromOrders + "Resync from orders" button — PR #224, live (convex/subscriptions/resyncPlan.ts). Reuse it to keep the schedule (plannedDays) in sync after any order edit.
- Symmetric amend (decreases/removals on UNDELIVERED days) — PR #218, live (convex/subscriptions/amend.ts).

SCOPE — three slices:

SLICE 1 — [B2B] indicator + subscription selector on the ordering sheet:
- Ordering sheet = src/pages/OrderCreate.tsx; customer picker = src/components/orders/CustomerSearch.tsx → useCustomerSearch (src/hooks/convex/useCustomers.ts) → api.customers.queries.search (convex/customers/queries.ts:30, generic textSearch on name/phone, returns customer docs incl. customerType: "direct_b2c"|"b2b_wholesale").
- In the dropdown result list, PREFIX the customer name with "[B2B]" when customerType === "b2b_wholesale" AND the customer has ≥1 ACTIVE subscription. Extend the search query (or add a companion) to return customerType + a boolean hasActiveSubscription (subscriptions table has a by_customer index; status === "active").
- When a [B2B] customer is selected, render a compact subscription selector DIRECTLY UNDER the selected name (in the Customer card) listing their active subscriptions; selecting one sets the existing selectedSubId state (OrderCreate.tsx:114). Add a per-customer query listActiveSubscriptionsForCustomer(customerId) → [{ subscriptionId, label, ... }].
- WHY (the existing version is flaky): today the credit selector is the SubscriptionCreditBanner (src/components/orders/SubscriptionCreditBanner.tsx) rendered at OrderCreate.tsx:902, gated behind isManagerOrAdmin && customerId && hasItems && a due date — so it appears late and is easy to miss. Surface the subscription CHOICE at customer-select time; the per-line credit SPLIT detail (useSubscriptionCreditContext) can still fill in once items + due date exist.

SLICE 2 — edit a day's existing order before it ships (UNDELIVERED only):
- Let staff reduce/change pieces on a not-yet-delivered subscription order directly from the order tile. On save: update orderItems + production records + order totals, then resync that week's plannedDays (reuse resyncWeekPlanFromOrders). UNDELIVERED only — NO recognized-revenue/drawdown correction (explicitly out of scope; "more" goes through Slice 3, "less" before ship).
- DUAL SURFACE (CLAUDE.md Pitfall #20): wire BOTH src/components/orders/OrderSlideOver.tsx AND src/pages/OrderDetail.tsx — they do not share an Actions component.

SLICE 3 — "add more" = a new credit-funded order:
- When creating a new order for a customer with an active subscription, prompt "This customer has an active subscription with credit — use it?" and, if yes, fund via the EXISTING mutation api.subscriptions.creditOrder.createCreditFundedOrder (already wired in OrderCreate.tsx:265, getCreditOrderWhatsappDraft too) so the new order draws down the pool. Largely Slice 1's selector + the existing credit-funded-order path.

LOCKED DECISIONS (from the spec):
- Counting unit = scheduled product pieces (orderItems.quantity), NOT BOM balls.
- Credit remaining is the DERIVED pool: deriveCreditPool(weekLedger) (CRM C10 — never re-key a denormalised total).
- Confidential fields (partner price, credit) stripped server-side per role (CRM D11); query roles must be ⊇ the route's requiredPermission (CLAUDE.md Pitfall #19).

OPEN QUESTIONS the spec phase must resolve (see spec "Open questions"): [B2B] flag rule (B2B+has-sub vs any b2b_wholesale); multiple active subscriptions (radio + default-when-one); whether order staff (not just manager/admin) can see/use the selector (affects backend roles); credit-funded-order eligibility per line.

WORKFLOW GATES: feature branch per slice (CLAUDE.md), TDD (write failing tests first), `npm run build` MUST pass before merge, triple-review the money-path slices (2 & 3) before merge, update docs/CHANGELOG.md after each merge. Slice 1 is UI + read queries (low risk). Convex deploy is drift-detected vs the convex-deployed marker tag — a convex/ change auto-deploys on merge to main.

SUCCESS CRITERIA: a B2B-with-subscription customer shows "[B2B]" in the dropdown; selecting them reveals a subscription selector under the name; a new order can draw down the chosen subscription's credit; an undelivered day's order can be reduced from both order surfaces with the schedule staying in sync.
```
