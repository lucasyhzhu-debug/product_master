# UAT Context — Phase D CRM Surface

- **Run-id:** `phase-d-crm-2026-06-26`
- **App URL:** http://localhost:5173 (Vite) → Convex dev `exciting-fennec-671`
- **Build:** worktree `feature+subscription-phase-d-crm`, branch `fix/crm-dedupe-ledger-index` (Phase D CRM = PR #202 `f78c0037` on main + post-merge index hotfixes #203/#204; harness/run-spec live only on this branch).
- **Date captured:** 2026-06-26
- **Navigation:** single Playwright pass (`tests/e2e/uat-phase-d-crm.spec.ts`), 23 numbered steps, headless Chromium 1440×900 (+ one 390px mobile step). Console + network captured globally and tagged per step.
- **Roles exercised:** `manager` (E2E-Manager, PIN 999999) primary pass; `admin` (E2E-Admin) hub pass; `order_staff` (E2E-OrderStaff) negative pass. Users provisioned by `tests/e2e/global-setup.ts`.

## Seed dataset (`subscriptions/_devSeed:seedCrmUat`)
- Customer **UAT Cafe B2B** (`j97dq4jjy6xgxg2qp8be485vfx89cpgb`) — full CRM fields incl. both `phone` + `whatsapp`.
- **2 subscriptions:** Morning Bundle A (`zh78…ds0j`, delivering, current week 22–28 Jun) + Afternoon Bundle B (`zh75…c8vd`, closed week).
- Current week ledger: opening topup +Rp1,875,000 → 3 drawdowns (−375k, −375k, −225k) → mid-week amendment topup +Rp300,000 → **remaining Rp1,200,000** (consumed Rp975,000 of issued Rp2,175,000).
- Invoices: 2 paid (weekly + amendment) + 1 unpaid (`INV-UAT-2606-003`, the Draft-WA trigger).
- Orders across statuses incl. subscription orders with `subscriptionWeekId`.
- **Leftover prior-run data present:** `UAT Weekly Cookies` + two `UAT-Sub-Test-178…` customers (CrmHome shows 5 active subscriptions total). Not part of this seed; ignore their ugly numeric names.

## Scope checklist (from run-spec `docs/reviews/uat-phase-d-crm-plan-2026-06-26.md`)
CrmHome · CustomerDashboard hub (gauge, subs, unpaid invoices, Draft-WA, Settings dialog, drawdown chart + selector) · Activity timeline (filter, load older) · Agreements · Subscription page (ledger statement, back-refs) · Funding dashboard · Order-surface customer link (both surfaces) · Nav + access (order_staff negative, mobile) · empty/loading/error states · not-found.

## Coverage gaps (be honest — personas should weigh, not assume covered)
1. **Order slide-over / OrderDetail full page did not visually open** — kanban cards navigate via onClick, not an `<a href>`, so the automated click didn't open them. The customer→CRM link **href** (`/crm/customers/j97…`) WAS found in the order-surface DOM, and the link exists in code in all three surfaces (`KanbanCard.tsx:153`, `OrderSlideOver.tsx:353`, `OrderDetail.tsx:268`). Parity is code-confirmed but not screenshot-confirmed.
2. **Mark-paid → fund end-to-end NOT exercised** — the mutation was skipped to preserve seed state; the funding dashboard was empty ("All caught up") so the flow had no entry row there anyway. Recommend a focused follow-up click-through from the hub's "Mark paid → fund" deep-link.
3. **Agreement file "Open"** — seed used a real storageId but the file is a placeholder (not the actual agreement PDF); open-URL resolution works, content is unrelated.
