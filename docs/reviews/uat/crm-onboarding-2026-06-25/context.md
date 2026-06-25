# UAT Context — New-customer onboarding journey (Phase D CRM)

- **Run-id:** crm-onboarding-2026-06-25
- **Date captured:** 2026-06-26
- **App URL:** http://localhost:5173
- **Role:** Manager User (role `manager`), PIN auth — login verified working.
- **Backend:** dev Convex deployment `exciting-fennec-671` (branch backend deployed/live; Convex hot-reload OFF per dispatcher note — deployed backend functionally complete for this journey).
- **Driver:** Playwright (headless Chromium, 1366×900 desktop; 390×844 for mobile check). Throwaway scripts `_uat_p1.mjs` / `_uat_p2.mjs` (removed after run).

## Seed summary
- Existing dev data: 3 active subscriptions (`UAT Cafe B2B` / "UAT Weekly Cookies" @ Rp30.000/unit, plus 2 `UAT-Sub-Test-*`). Leftover from prior UAT runs.
- **Created for this run** (so empty states could be captured):
  - Brand-new customer **"Kopi Senja Onboarding (UAT 2026-06-26)"** (id `j976ep4s8hk1cjfw9g7b9ssc6d89axj7`), phone `081298765432`, defaultAddress set, **no subscription** — used for empty-dashboard / empty-timeline / empty-agreement captures. Created via `customers.create` mutation (token-authenticated) because **/crm exposes no customer-create affordance** (see Step 1/2).
  - A fresh **future subscription week** (29 Jun – 5 Jul 2026) on the `UAT Cafe B2B` subscription, then driven through the UI: seed-from-template → confirm → invoice → mark-paid/fund. This exercised scope (c) end-to-end through the real UI.

## Scope checklist
- [x] (a) Create a brand-new customer record **in /crm** — NO create affordance exists in /crm; only path is the Orders → New Order inline "Create new customer" form (Steps 1–2).
- [x] (b) Open the customer dashboard — contact info, cross-object links, EMPTY states (no subscription, empty activity, empty agreement) (Steps 3–6, 16).
- [x] (c) Start a subscription cycle: plan weekly schedule → confirm week → generate invoice → mark funded/paid (Steps 7–12). NB: there is **no UI to create a subscription itself** — only to schedule an existing one.
- [x] (d) Return to dashboard — reflects active subscription, credit/funding gauge (PLACEHOLDER only — see Step 13), activity timeline entries (Steps 13–15).
- [x] Edge captures: empty/loading/error states, dead-ends, forced-out-to-another-surface, long values, mobile nav.

## Notes on completeness
- All 17 logical steps captured one navigation pass. No HTTP (4xx/5xx) network failures observed.
- One recurring **console DOM-nesting error** on the customer dashboard and one **dialog a11y warning** (see console-errors.log).
