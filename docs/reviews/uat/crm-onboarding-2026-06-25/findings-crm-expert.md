# Findings — CRM-expert persona (Phase D CRM onboarding UAT)

**Count: 1 BLOCKER · 6 BUG · 6 UX-HIGH · 3 UX-NIT (16 total)**

---

### [BLOCKER] Funded credit pool is invisible on the customer hub — gauge is an unbuilt placeholder
- **Where:** Step 3 (screens/03-new-customer-dashboard-empty.png), Step 6 (screens/06-existing-customer-dashboard.png), Step 13 (screens/13-dashboard-after-fund.png)
- **What:** The headline financial widget on every customer dashboard is a dashed box labelled "Credit gauge (T26)" — an unimplemented placeholder. After funding Rp 1.500.000 in Steps 10–12, returning to the hub shows no balance, no funded amount, no gauge. `currentWeekPoolBySubscription` IS passed into FinancialPane (console), so the derived pool exists but renders as a stub. Scope (d) ("verify the credit/funding gauge") is not satisfiable.
- **Why it matters (CRM-expert lens):** C10 inverse violation — a funded credit pool NOT surfaced on the hub. For a prepaid-credit B2B model the credit balance is the primary number an operator opens the record for; also A3 (hub should route to the money). A raw `(T26)` task-id leaking into shipped UI is its own polish failure.
- **Suggested fix:** Render the derived pool (deriveCreditPool / currentWeekPoolBySubscription): funded vs consumed vs remaining, integer IDR, click-through to the Credit Ledger Statement. Never ship a `(T26)` label.

### [UX-HIGH] No create-customer affordance in /crm — onboarding ejects to the Orders surface
- **Where:** Step 1 (screens/01-crm-home.png), Step 2 (screens/02b-inline-create-customer-dropdown.png)
- **What:** /crm has no create button, no customer list, no search. The only create path is the New Order form ("+ Create new customer"), capturing only name + phone (+ address via order).
- **Why it matters (CRM-expert lens):** A3 violation — you cannot originate a record from the CRM; onboarding's first step ejects to a transactional screen.
- **Suggested fix:** Add a "New customer" action + searchable list to /crm home; collect CRM identity fields at creation.

### [UX-HIGH] /crm is not discoverable — URL-only, absent from desktop and mobile nav
- **Where:** Step 1 (screens/01-crm-home.png), Step 17 (screens/17a-mobile-crm-home.png, 17b)
- **What:** /crm is not in the top nav (Dashboards/Orders/Ops/Finance/Config) nor the mobile hamburger/bottom tab bar; reachable only by typing the URL.
- **Why it matters (CRM-expert lens):** A1/A3 — a surface with no entry point is an orphan; operators won't adopt it.
- **Suggested fix:** Add a CRM entry to the primary and mobile navs.

### [UX-HIGH] Contact phone and default address are invisible on the identity card
- **Where:** Step 3 (screens/03-new-customer-dashboard-empty.png)
- **What:** Customer created with phone 081298765432 + defaultAddress. IDENTITY card shows only a generic "Phone (WhatsApp)" wa.me label — the actual number is never rendered — and there is no Addresses section. Only Notes render.
- **Why it matters (CRM-expert lens):** A1 — the canonical page does not display the two most basic contact facts (number to dial, address to deliver).
- **Suggested fix:** Render the actual number (WhatsApp link as affordance, not replacement) and an Addresses section.

### [BUG] Settings dialog cannot reach primary phone, name, or defaultAddress — split phone/WhatsApp model leaks
- **Where:** Step 5 (screens/05-settings-edit-dialog.png)
- **What:** "Edit CRM fields" has Key contact name/role, WhatsApp, Email, Instagram, Delivery/Store address, Notes — but no field for primary `phone`, customer `name`, or `defaultAddress`. WhatsApp renders blank because the number lives in `phone`, which this form does not touch.
- **Why it matters (CRM-expert lens):** A1/data integrity — the editable surface diverges from the fields that drive displayed links; operators "fix" WhatsApp and the visible link does not change.
- **Suggested fix:** Reconcile phone/whatsapp (single source or backfill) and expose name + primary phone + defaultAddress.

### [UX-HIGH] Populated IDENTITY card is a blank box with no empty state
- **Where:** Step 6 (screens/06-existing-customer-dashboard.png)
- **What:** UAT Cafe B2B (no contact fields) shows an empty bordered IDENTITY box — header only, no content, no empty-state message. Contrasts with the good empty states elsewhere.
- **Why it matters (CRM-expert lens):** D12 — every CRM surface needs a designed empty state; a silent blank card reads as broken.
- **Suggested fix:** Add an empty state ("No contact details yet — add via Settings") + CTA.

### [UX-HIGH] Agreement page exists but is not linked from the customer hub
- **Where:** Step 3, Step 6, Step 16 (screens/16-agreement-page.png)
- **What:** /crm/customers/:id/agreements is reachable only by URL; the dashboard shows no Agreements section/link (only Subscriptions + an Activity link). The dashboard renders an Agreements section only when an agreement already exists — so a customer with none can never reach the upload page from the hub.
- **Why it matters (CRM-expert lens):** A4/A3 — cross-object links should be bidirectional and the hub should route to its object pages; operators cannot discover an agreement can be uploaded.
- **Suggested fix:** Add an Agreements section/link to the hub (with empty state), bidirectional with the agreement page.

### [UX-HIGH] Breadcrumbs say generic "Customer" instead of the customer name
- **Where:** Step 4 (screens/04-new-customer-activity-empty.png), Step 7 (screens/07-subscription-page.png), Step 16 (screens/16-agreement-page.png)
- **What:** Activity/Subscription/Agreement breadcrumbs read "CRM > Customer > …" — generic word, not the name. The dashboard breadcrumb does resolve the name, so the trail is inconsistent.
- **Why it matters (CRM-expert lens):** A2 — breadcrumbs must mirror the object hierarchy and deep-links resolve the full trail incl. the actual customer name.
- **Suggested fix:** Resolve and render the customer name in the middle crumb on every child page.

### [BUG] Activity timeline shows a raw subscription document id instead of a label/link
- **Where:** Step 14 (screens/14-activity-populated.png)
- **What:** The "Credit top-up +1.500.000 / +1.650.000 IDR" rows show subhead `subscription zh75j…898xqq` (raw Convex id) rather than "UAT Weekly Cookies" (which the milestone row shows correctly).
- **Why it matters (CRM-expert lens):** A1 (inert raw text, not a link to the canonical subscription page) + B6 (inconsistent subject rendering within one feed).
- **Suggested fix:** Resolve the subject ref to the subscription label and link it, consistent with the milestone row.

### [BUG] Credit ledger "BY" column shows raw Convex user ids, not person names
- **Where:** Step 7 (screens/07-subscription-page.png)
- **What:** BY column shows mn7d0j0kycdyqv08xpftp… / mn7619tbcw44tmvys0a6… instead of names. The activity timeline correctly shows "Manager User" / "Lucas".
- **Why it matters (CRM-expert lens):** C10 — "who moved this money" is part of the audit trail; raw ids are not human-traceable. Also B6 inconsistency with the timeline.
- **Suggested fix:** Resolve userId to display name.

### [BUG] "Invoice sent" activity event logged though the invoice was never sent
- **Where:** Step 14 (screens/14-activity-populated.png); cross-ref Step 11 (no send affordance, screens/11-weekly-invoice.png)
- **What:** Timeline logs "Invoice INV-2606-005 sent" (and INV-2606-001 "sent") although the invoice was never delivered (customer has no phone/email; invoice page has no send button). "Sent" appears to fire on generation.
- **Why it matters (CRM-expert lens):** B5/B7 — the event log must faithfully record what happened; a false "sent" corrupts the derived timeline and blurs what-happened vs what's-next.
- **Suggested fix:** Emit "Invoice sent" only on an actual send; on generation emit "Invoice created/issued".

### [BUG] Weekly invoice instructs a bank transfer but shows no bank account to transfer to
- **Where:** Step 11 (screens/11-weekly-invoice.png)
- **What:** Shows "BANK TRANSFER REFERENCE: INV-2606-005" + "copies this into the transfer memo", but the bank block reads only "a/n" — no bank name, account number, or holder name.
- **Why it matters (CRM-expert lens):** C10 — money must be actionable end-to-end; an invoice telling the customer to transfer with no destination account is unpayable. (Could be BLOCKER in prod; logged BUG since bank details may be unset dev seed — but the empty "a/n" should be a clear "not configured" state.)
- **Suggested fix:** Render full bank details, or a designed "bank account not configured" warning, before showing the transfer instruction.

### [BUG] Recurring DOM-nesting / hydration error on every dashboard with a subscription
- **Where:** Step 6, Step 13; console-errors.log
- **What:** FinancialPane's subscription card renders a Badge (div) inside a `<p>` ("Current week…"), throwing "In HTML, <div> cannot be a descendant of <p>" + a React hydration warning on every dashboard with a subscription.
- **Why it matters (CRM-expert lens):** B6/markup hygiene — invalid nesting risks hydration mismatches and masks real console errors on the most-visited CRM surface.
- **Suggested fix:** Change the `<p>` wrapper to a div/span.

### [UX-HIGH] Mobile: bottom nav overlaps the Active Subscriptions table; right columns cut off
- **Where:** Step 17 (screens/17a-mobile-crm-home.png)
- **What:** On 390-wide, the fixed bottom tab bar overlaps the "Active subscriptions" table and right columns truncate ("Deli…" / "Current week" cut), no horizontal-scroll affordance.
- **Why it matters (CRM-expert lens):** D12/responsive — a core list is partially unreadable on mobile (field operators in a delivery business will hit this).
- **Suggested fix:** Add bottom padding to clear the fixed nav; make the table horizontally scrollable or stack into cards.

### [UX-NIT] Settings dialog missing accessible description (aria-describedby)
- **Where:** Step 5 (screens/05-settings-edit-dialog.png); console-errors.log
- **What:** Console warns "Missing Description/aria-describedby for DialogContent" (twice).
- **Why it matters (CRM-expert lens):** D12/a11y polish on a CRM edit surface.
- **Suggested fix:** Add DialogDescription/aria-describedby.

### [UX-NIT] Hub subscription card highlights the in-flight week, not the just-funded week
- **Where:** Step 13 (screens/13-dashboard-after-fund.png)
- **What:** After funding 29 Jun–5 Jul, the card still reads "Current week: 22 Jun–28 Jun · delivering" (technically correct), but combined with the unbuilt gauge there is no on-hub confirmation the next week was funded.
- **Why it matters (CRM-expert lens):** C9/C10 — the hub should still confirm the most recent money event.
- **Suggested fix:** Once the gauge exists, surface upcoming-week funded status alongside the delivering week.

### [UX-NIT] No per-customer "what's next" surface (due / tasks / reminders)
- **Where:** Step 14, Step 3/6 dashboard
- **What:** Strong "what happened" feed but no per-customer "what's next" (upcoming deliveries, this customer's unpaid weeks). The only forward-looking surface is the global funding dashboard (Step 15).
- **Why it matters (CRM-expert lens):** B7 — separate "what happened" from "what's next."
- **Suggested fix:** Add a per-customer "Upcoming / Needs attention" panel distinct from the activity feed.

---

**Strengths (not defects):** the Credit Ledger Statement (Step 7) is exemplary C10 — signed delta, week-scoped running balance with an explicit reset disclaimer, integer IDR, click-through to invoice + order; the schedule back-reference sections (Step 10) are strong A4; empty states for Subscriptions/Activity/Agreement/Funding are well-designed D12.
