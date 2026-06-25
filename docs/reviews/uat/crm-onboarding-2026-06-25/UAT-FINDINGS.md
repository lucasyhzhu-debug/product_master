# UAT-FINDINGS — New-customer onboarding journey (Phase D CRM)

- **Run-id:** crm-onboarding-2026-06-25 · **Captured:** 2026-06-26 · **Surface:** /crm (manager+admin)
- **Role:** Manager User (manager) · **Env:** dev Convex `exciting-fennec-671` + Vite :5173
- **Evidence:** `flow-log.md` (17 steps), `screens/` (19 PNGs), `console-errors.log`, `network-failures.log`
- **Personas:** `findings-pos-user.md` (Bu Sri, non-technical operator) · `findings-crm-expert.md` (senior CRM practitioner). Judged independently from the same evidence pack.

## Executive summary — readiness verdict: NOT READY for onboarding use

The **backend subscription cycle works and is well-built**: schedule → seed-from-template → confirm → generate invoice → mark-paid/fund all succeeded with clear toasts, the week locked correctly after invoicing, and the **Credit Ledger Statement (Step 7) is exemplary** (signed deltas, week-scoped running balance with a reset disclaimer, integer IDR, click-through to invoice + orders). Back-reference sections and empty states (Activity/Agreement/Funding/unseeded-week) are strong.

But the **CRM front-of-house for onboarding is incomplete**. Two BLOCKERs stop the scoped journey from being done in-app: (1) there is **no UI to create a subscription** for a customer — scope step (c) only worked because an existing subscription was seeded behind the scenes; (2) the **customer dashboard's headline credit gauge is an unbuilt placeholder ("Credit gauge (T26)")**, so the funded credit never surfaces and scope step (d) is unverifiable. On top of that, six functional BUGs undermine trust in the money/record surfaces (invoice with no bank account, false "Invoice sent" events, raw Convex IDs in the credit ledger and timeline, an edit form that can't reach the displayed contact fields, and a DOM-nesting console error on every dashboard).

### Severity counts (consolidated, deduped)
| Severity | Count |
|----------|-------|
| BLOCKER  | 2 |
| BUG      | 6 |
| UX-HIGH  | 8 |
| UX-NIT   | 3 |
| **Total**| **19** |

Per persona (pre-dedup): POS-user 2 BLOCKER / 2 BUG / 9 UX-HIGH / 3 UX-NIT (16); CRM-expert 1 BLOCKER / 6 BUG / 7 UX-HIGH / 3 UX-NIT (17).

---

## BLOCKER

### [BLOCKER] No UI to create a subscription — onboarding step (c) cannot be done in-app — POS
- **Where:** Step 3/7/8 (screens/03-new-customer-dashboard-empty.png, screens/07-subscription-page.png, screens/08-schedule-week-unseeded.png)
- **What:** The UI only schedules weeks on a subscription that already exists. There is no "Start subscription / New subscription" affordance anywhere. The new customer shows "No subscriptions found" with no way to give her one; the cycle was only testable because `UAT Cafe B2B` had a subscription seeded via backend.
- **Fix:** Add a "Start subscription" action on the customer dashboard (weekly qty, product, unit price, deliver-by, start date, template).

### [BLOCKER] Funded credit pool invisible on the hub — credit gauge is an unbuilt "(T26)" placeholder — BOTH
- **Where:** Step 3/6/13 (screens/03-new-customer-dashboard-empty.png, screens/06-existing-customer-dashboard.png, screens/13-dashboard-after-fund.png)
- **What:** The dashboard's headline financial widget is a dashed box literally labelled "Credit gauge (T26)". After funding Rp 1.500.000 (Steps 10–12), the hub still shows the same empty box — no balance, funded, consumed, or remaining. `currentWeekPoolBySubscription` is passed into FinancialPane (console) so the derived pool exists but renders as a stub. Scope (d) is not satisfiable. (CRM: C10/A3 violation; POS: the prepaid-credit balance is the first thing she opens a customer for.)
- **Fix:** Render the derived pool (funded/consumed/remaining, integer IDR, click-through to the ledger). Never ship a "(T26)" task-id in the UI.

## BUG

### [BUG] Weekly invoice instructs a bank transfer but shows no bank account — BOTH
- **Where:** Step 11 (screens/11-weekly-invoice.png)
- **What:** Prominent "BANK TRANSFER REFERENCE: INV-2606-005" + "copies this into the transfer memo", but the bank block shows only "a/n" — no bank name, account number, or holder. The customer has nowhere to send the money. (POS rated UX-HIGH; CRM rated BUG and flagged potential prod-BLOCKER.)
- **Fix:** Always render full bank details; if unset, block send and show a clear "bank account not configured" warning.

### [BUG] "Invoice sent" logged in the timeline though the invoice was never sent — BOTH
- **Where:** Step 14 (screens/14-activity-populated.png); cross-ref Step 11 (no send affordance)
- **What:** Timeline shows "Invoice INV-2606-005 sent" (and INV-2606-001 "sent") although the invoice was never delivered (no WhatsApp/email button; customer has no phone/email). "Sent" appears to fire on generation. Corrupts the what-happened log (B5/B7) and misleads chase decisions.
- **Fix:** Emit "Invoice sent" only on actual delivery; on generation emit "Invoice created/issued".

### [BUG] Settings dialog can't reach the primary phone, name, or defaultAddress (split phone/WhatsApp model) — BOTH
- **Where:** Step 5 (screens/05-settings-edit-dialog.png)
- **What:** "Edit CRM fields" exposes Key contact name/role, WhatsApp, Email, Instagram, Delivery/Store address, Notes — but NO field for the customer's primary `phone`, the customer `name`, or the `defaultAddress` saved at order time. The WhatsApp box is blank because the number lives in `phone`, which this form doesn't touch — so the editable surface diverges from what the card displays. (POS rated UX-HIGH.)
- **Fix:** Reconcile `phone`/`whatsapp` (single source or backfill) and expose name + primary phone + defaultAddress so edits match the card.

### [BUG] Credit ledger "BY" column shows raw Convex user IDs, not names — BOTH
- **Where:** Step 7 (screens/07-subscription-page.png)
- **What:** The money ledger's BY column shows `mn7d0j0kycdyqv08xpftp…` / `mn7619tbcw44tmvys0a6…` instead of "Manager User"/"Lucas" (the timeline resolves these names correctly). Untraceable "who moved the money" (C10) + inconsistency with the timeline (B6). (POS rated UX-HIGH.)
- **Fix:** Resolve `userId` → display name in the BY column.

### [BUG] Activity timeline shows a raw subscription document ID instead of a label/link — BOTH
- **Where:** Step 14 (screens/14-activity-populated.png)
- **What:** "Credit top-up" rows show subhead `subscription zh75j…898xqq` (raw ID) instead of "UAT Weekly Cookies" (the milestone row resolves it correctly). Inert raw text, not a link (A1), inconsistent within one feed (B6). (POS rated UX-NIT.)
- **Fix:** Resolve the subject ref to the subscription label and link it.

### [BUG] DOM-nesting / hydration error on every dashboard with a subscription — BOTH
- **Where:** Step 6/13 (screens/06-existing-customer-dashboard.png); console-errors.log
- **What:** FinancialPane's subscription card renders a `<Badge>` (a `<div>`) inside a `<p>` ("Current week…"), throwing "In HTML, <div> cannot be a descendant of <p>" + a React hydration warning on every dashboard that has a subscription. Risks hydration mismatches and masks real console errors.
- **Fix:** Change the `<p>` wrapper to a `<div>`/`<span>`.

## UX-HIGH

### [UX-HIGH] No create-customer affordance in /crm — onboarding ejects to the Orders form — BOTH
- **Where:** Step 1/2 (screens/01-crm-home.png, screens/02b-inline-create-customer-dropdown.png)
- **What:** /crm has no "Add customer" button, no list, no search. The only way to create a customer is Orders → New Order → "+ Create new customer" (captures name + phone + order address only). Onboarding's first step leaves the CRM entirely. (POS rated this BLOCKER; record is still creatable via Orders, so consolidated UX-HIGH.)
- **Fix:** Add an "Add customer" action + searchable customer list to /crm home, collecting CRM identity fields.

### [UX-HIGH] /crm is not discoverable — URL-only, absent from desktop and mobile nav — BOTH
- **Where:** Step 1/17 (screens/01-crm-home.png, screens/17a-mobile-crm-home.png)
- **What:** /crm appears in neither the top nav (Dashboards/Orders/Ops/Finance/Config) nor the mobile hamburger/bottom tab bar; reachable only by typing the URL. An orphan surface operators won't find.
- **Fix:** Add a "CRM" (or "Customers") entry to the primary and mobile navs.

### [UX-HIGH] Contact phone number and address are invisible on the identity card — BOTH
- **Where:** Step 3 (screens/03-new-customer-dashboard-empty.png)
- **What:** A customer saved with phone `081298765432` + defaultAddress shows only a generic "Phone (WhatsApp)" wa.me label (the number itself is never rendered) and no Addresses section. The everyday "grab their number / where to deliver" task fails (A1).
- **Fix:** Render the actual number (WhatsApp link as an affordance, not a replacement) and an Addresses section.

### [UX-HIGH] Populated IDENTITY card is a blank box with no empty state — BOTH
- **Where:** Step 6 (screens/06-existing-customer-dashboard.png)
- **What:** UAT Cafe B2B (no contact fields) shows an empty bordered box with just the "IDENTITY" header — no content, no message. Reads as a broken/half-loaded page (D12).
- **Fix:** Add a designed empty state ("No contact details yet — add via Settings") + CTA.

### [UX-HIGH] Agreement page is not linked from the customer hub — CRM-EXPERT
- **Where:** Step 3/6/16 (screens/16-agreement-page.png)
- **What:** /crm/customers/:id/agreements is reachable only by URL — the dashboard renders an Agreements section only when an agreement already exists, so a customer with none can never reach the upload page from the hub (A4/A3). Onboarding can't attach the supply agreement.
- **Fix:** Add an Agreements section/link (with empty state) to the hub, bidirectional with the agreement page.

### [UX-HIGH] Breadcrumbs say generic "Customer" instead of the customer name — BOTH
- **Where:** Step 4/7/16 (screens/04-new-customer-activity-empty.png, screens/07-subscription-page.png, screens/16-agreement-page.png)
- **What:** Activity/Subscription/Agreement breadcrumbs read "CRM › Customer › …" — the middle crumb is the literal word "Customer", not the name (the dashboard breadcrumb does resolve the name, so the trail is inconsistent) (A2). (POS rated UX-NIT; CRM UX-HIGH.)
- **Fix:** Resolve and render the customer name (linked to the dashboard) in the middle crumb on every child page.

### [UX-HIGH] After funding, the dashboard doesn't reflect the week just paid — BOTH
- **Where:** Step 13 (screens/13-dashboard-after-fund.png)
- **What:** After confirming/invoicing/funding the 29 Jun–5 Jul week (Rp 1.500.000), the dashboard subscription card still only shows "Current week: 22 Jun–28 Jun · delivering" and the gauge is still a placeholder — nothing confirms the funding landed. (CRM rated UX-NIT; tied to the gauge BLOCKER.)
- **Fix:** Surface the funded credit + upcoming funded week on the hub (with the gauge fix).

### [UX-HIGH] Mobile: bottom nav overlaps the Active Subscriptions table; right columns cut off — BOTH
- **Where:** Step 17 (screens/17a-mobile-crm-home.png)
- **What:** On 390-wide, the fixed bottom tab bar overlaps the "Active subscriptions" table and the right columns truncate ("Deli…"/"Current week" cut), with no horizontal-scroll affordance. A core list is partially unreadable on phone (D12/responsive).
- **Fix:** Add bottom padding to clear the fixed nav; make the table horizontally scrollable or stack into cards.

## UX-NIT

### [UX-NIT] Settings dialog missing accessible description (aria-describedby) — BOTH
- **Where:** Step 5 (screens/05-settings-edit-dialog.png); console-errors.log
- **What:** Console warns "Missing Description/aria-describedby for DialogContent" (twice) on the Settings dialog (D12/a11y).
- **Fix:** Add a `DialogDescription` / `aria-describedby`.

### [UX-NIT] "Balance resets at the start of each week" may read as money being lost — POS
- **Where:** Step 7 (screens/07-subscription-page.png)
- **What:** The ledger disclaimer "Balance column is week-scoped and resets at the start of each week" — "resets" can imply unused credit disappears, even though the subscription policy says "Rollover".
- **Fix:** Reword to clarify the credit itself isn't lost — e.g. "shows the balance within each week; unused credit rolls over".

### [UX-NIT] No per-customer "what's next" surface (due / tasks / reminders) — CRM-EXPERT
- **Where:** Step 14 + dashboard (screens/14-activity-populated.png)
- **What:** Strong "what happened" feed but no per-customer "what's next" (upcoming deliveries, this customer's unpaid weeks); the only forward-looking view is the global funding dashboard (B7).
- **Fix:** Add a per-customer "Upcoming / Needs attention" panel distinct from the activity feed.

---

## Strengths to preserve
- **Credit Ledger Statement (Step 7)** — exemplary money traceability (signed delta + week-scoped running balance + reset disclaimer + integer IDR + links to invoice & orders).
- **Schedule back-references (Step 10)** — orders + invoice cross-linked bidirectionally (A4).
- **Action feedback** — clear toasts on every money action ("Week seeded", "Week confirmed and invoice created", "Invoice marked paid. Credit funded.").
- **Empty states** for Subscriptions / Activity / Agreement / Funding / unseeded-week are well-designed (D12).
- **No HTTP (4xx/5xx) network failures** across the entire pass.
