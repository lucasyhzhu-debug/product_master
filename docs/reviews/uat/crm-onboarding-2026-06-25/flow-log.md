# Flow Log — New-customer onboarding journey (Phase D CRM)

Single navigation pass, in order. Personas judge from this + screens/ + logs only.
Timestamp: 2026-06-26. Role: Manager User (manager).

---

## Step 1 — CRM home — /crm
- **Action:** Logged in (Manager User / PIN 999999), navigated to /crm.
- **Expected:** A CRM hub where a manager can find customers and start the onboarding of a new one.
- **Observed:** Header "CRM — Customer relationship management". Two summary cards: "Needs funding 0 weeks pending", "Active subscriptions 3". "Needs funding" section = empty state "All caught up". "Active subscriptions" table lists 3 customers (UAT Cafe B2B / "UAT Weekly Cookies" / Delivering, + 2 UAT-Sub-Test). Customer names are links. **No "Add / Create customer" button anywhere. No customer list / search. `/crm` is NOT present in the top nav (Dashboards / Orders / Ops / Finance / Config) — reached only by typing the URL.**
- **Screenshot:** screens/01-crm-home.png
- **Console:** none
- **Network:** none
- **Load:** snappy
- **State:** warn (no create affordance; CRM not discoverable from nav)

## Step 2 — Customer creation path — /orders/new
- **Action:** Looked for any create-customer entry from /crm (none), then opened Orders → New Order and typed a name into the Customer search.
- **Expected:** A way to create a customer as part of onboarding.
- **Observed:** The ONLY customer-create affordance in the app is inside the **New Order** form: typing a name shows a dropdown "+ Create new customer \"<name>\"", which opens an inline name+phone mini-form. Creating a customer therefore forces the operator entirely out of /crm into the order-taking surface. The created record captures only `name`, `phone`, and (via order) `defaultAddress`.
- **Screenshot:** screens/02a-order-create-page.png, screens/02b-inline-create-customer-dropdown.png
- **Console:** none
- **Network:** none
- **Load:** snappy
- **State:** warn (onboarding "create customer" dead-ends in /crm; only path is the order flow)

## Step 3 — New-customer dashboard (EMPTY) — /crm/customers/:id
- **Action:** Opened the brand-new customer "Kopi Senja Onboarding (UAT 2026-06-26)" dashboard.
- **Expected:** Contact info (phone, address), reassuring empty states for subscription/credit/activity.
- **Observed:** Two-pane hub. LEFT "IDENTITY": shows a phone icon with the text **"Phone (WhatsApp)"** — the **actual phone number `081298765432` is NOT shown** (only a generic label that is a wa.me link); Notes render fine. The **`defaultAddress` set on the record is NOT displayed** (no Addresses section). RIGHT pane: a dashed box literally labelled **"Credit gauge (T26)"** — the credit/funding gauge is an **unimplemented placeholder**. "SUBSCRIPTIONS" → good empty state "No active subscriptions / No subscriptions found for this customer." "View activity timeline →" link present. No agreements section shown.
- **Screenshot:** screens/03-new-customer-dashboard-empty.png
- **Console:** DOM-nesting error fires on dashboards with a subscription (see Step 6 / console-errors.log)
- **Network:** none
- **Load:** ~1.5s, no spinner stuck
- **State:** broken-ish (gauge placeholder shipped to UI; contact number + address invisible)

## Step 4 — Empty activity timeline — /crm/customers/:id/activity
- **Action:** Opened the new customer's Activity timeline.
- **Expected:** Designed empty state.
- **Observed:** "Activity timeline — Last 14 days". Facet filter chips: Order / Finance / Message / Document / Schedule / Milestone. "Load older" button. Empty state: clock icon, "No activity in this window / Try expanding the window or adjusting type filters." Breadcrumb reads **"CRM › Customer › Activity"** — the middle crumb is the generic word "Customer", not the customer's name.
- **Screenshot:** screens/04-new-customer-activity-empty.png
- **Console:** none
- **Network:** none
- **Load:** snappy
- **State:** ok (good empty state; breadcrumb nit)

## Step 5 — Settings / edit dialog — /crm/customers/:id (Settings)
- **Action:** Clicked "Settings" on the new customer's dashboard.
- **Expected:** Edit contact / identity fields, incl. the phone shown on the card.
- **Observed:** Dialog "Edit CRM fields" with: Key contact name, Key contact role, **WhatsApp** (+62…), Email, Instagram, Delivery address, Store address, Notes. **There is NO field for the primary `phone`, the customer Name, or `defaultAddress`.** So the operator cannot edit/see the phone number that drives the "Phone (WhatsApp)" link, nor the address captured at order time. WhatsApp field is blank (the number lives in `phone`, which this form doesn't touch).
- **Screenshot:** screens/05-settings-edit-dialog.png
- **Console:** warning — Missing `Description`/`aria-describedby` for DialogContent
- **Network:** none
- **Load:** instant
- **State:** warn (edit form can't reach the primary phone/name/defaultAddress)

## Step 6 — Existing customer dashboard (populated) — /crm/customers/:id (UAT Cafe B2B)
- **Action:** Opened the populated customer "UAT Cafe B2B".
- **Expected:** Identity + financial hub for a customer with an active subscription.
- **Observed:** LEFT "IDENTITY" card is an **empty bordered box — just the "IDENTITY" header, no content and no empty-state message** (this customer has no contact fields set). RIGHT: "Credit gauge (T26)" placeholder again. "SUBSCRIPTIONS" → card "UAT Weekly Cookies" (link) · "Current week: 22 Jun – 28 Jun 2026" + "delivering" badge + "active" badge. "Plan schedule" + "Settings" actions in header. "View activity timeline →".
- **Screenshot:** screens/06-existing-customer-dashboard.png
- **Console:** error — "In HTML, <div> cannot be a descendant of <p>" (the "Current week …" `<p>` contains a `<Badge>` which renders a `<div>`); React hydration warning.
- **Network:** none
- **Load:** ~1.5s
- **State:** warn (blank Identity card has no empty state; gauge placeholder; DOM-nesting console error)

## Step 7 — Subscription detail — /crm/customers/:id/subscriptions/:subId
- **Action:** Opened the "UAT Weekly Cookies" subscription page.
- **Expected:** Subscription terms + traceable credit ledger.
- **Observed:** Header "UAT Weekly Cookies", "active" + "Prepaid weekly credit". Stats: Weekly qty 50, Deliver by 09:00 WIB, Started 2026-06-24, Rollover. **Credit Ledger Statement** with a week selector ("22 Jun – 28 Jun 2026 — delivering"): Issued Rp1.650.000 · Consumed Rp450.000 · Remaining Rp1.200.000. Rows: **topup +Rp1.650.000 → balance Rp1.650.000** (link "Invoice ···89980h"), **drawdown −Rp450.000 → balance Rp1.200.000** (link "Order ···899nf5"). Columns TYPE / AMOUNT (signed) / BALANCE (week-scoped) / LINK / **BY** / NOTE. Disclaimer "Balance column is week-scoped and resets at the start of each week." **The BY column shows raw Convex user document IDs (e.g. `mn7d0j0kycdyqv08xpftp…`) instead of a person's name.** Breadcrumb "CRM › Customer › Subscription" (generic "Customer").
- **Screenshot:** screens/07-subscription-page.png
- **Console:** none
- **Network:** none
- **Load:** ~1.5s
- **State:** ok (strong money traceability; BY raw-ID + generic breadcrumb are blemishes)

## Step 8 — Schedule, unseeded future week — …/week?weekStart=…(29 Jun)
- **Action:** Clicked "Plan schedule" / navigated to a fresh future week (29 Jun – 5 Jul 2026).
- **Expected:** Empty schedule with seed options.
- **Observed:** "Schedule Calendar — 29 Jun – 5 Jul 2026" + "Unseeded" badge + "Partner price: Rp 30.000 / unit". Action bar: "Reset to template", "Copy last week", "Blank", "Confirm → orders + invoice" (greyed), "Rp 0". Empty state: calendar icon, "Week not seeded yet / Choose a seed source above to create the schedule for this week."
- **Screenshot:** screens/08-schedule-week-unseeded.png
- **Console:** none
- **Network:** none
- **Load:** ~1.5s
- **State:** ok

## Step 9 — Seed from template — schedule
- **Action:** Clicked "Reset to template".
- **Expected:** Week populated from the subscription template.
- **Observed:** Toast "Week seeded from template". Status → "Planned". 7-day grid Mon–Sun; Tue–Sat each show qty 10 / "Rp 300.000" / "Day total Rp 300.000" / "Add product"; Mon & Sun "No delivery". Week total "Rp 1.500.000" (top-right). "Confirm → orders + invoice" now active.
- **Screenshot:** screens/09-schedule-seeded-template.png
- **Console:** none
- **Network:** none
- **Load:** ~2.5s
- **State:** ok

## Step 10 — Confirm → orders + invoice — schedule
- **Action:** Clicked "Confirm → orders + invoice".
- **Expected:** Orders + a weekly invoice generated; week locked.
- **Observed:** Toast "Week confirmed and invoice created." Status → "Invoiced". Grid locked: "This week is invoiced and cannot be edited. Navigate to a planned week to make changes." Back-reference sections now populate (A4): "ORDERS THAT DREW DOWN THIS CREDIT" → 0625-005…0625-009 (5 orders, all "AwaitingPayment", linked); "INVOICE THAT FUNDED THIS TOP-UP" → "INV-2606-005 · final" (linked); "LEDGER ENTRIES FOR THIS WEEK" → "No ledger entries recorded." (no topup until paid).
- **Screenshot:** screens/10-after-confirm.png
- **Console:** none
- **Network:** none
- **Load:** ~4s (orders generated)
- **State:** ok

## Step 11 — Weekly invoice — …/week/invoice?weekStart=…
- **Action:** Opened the generated weekly invoice.
- **Expected:** A send-ready invoice with bank-transfer details.
- **Observed:** "Weekly Invoice" + "Unpaid" badge. Prominent **"BANK TRANSFER REFERENCE: INV-2606-005"** + "Customer copies this into the transfer memo field" + "Copy ref". **BUT the bank account block shows only "a/n" with NO bank name, NO account number, NO account-holder name** (bank fields empty). Day cards in Indonesian (Selasa 30 Juni … Sabtu 4 Juli), each Original ×10 @ Rp30.000 = Rp300.000. "Week total (= credit funded on payment) Rp 1.500.000". "Mark paid → fund credit" CTA (top + bottom). No WhatsApp/Email buttons (customer has no phone/email set).
- **Screenshot:** screens/11-weekly-invoice.png
- **Console:** none
- **Network:** none
- **Load:** ~1.8s
- **State:** warn (invoice tells customer to bank-transfer but shows no bank account to transfer to)

## Step 12 — Mark paid → fund credit — invoice
- **Action:** Clicked "Mark paid → fund credit".
- **Expected:** Invoice paid; weekly credit funded.
- **Observed:** Toast "Invoice marked paid. Credit funded." Badge → "Paid" (green); week-total card → "Paid"; pay CTAs disappear.
- **Screenshot:** screens/12-after-mark-paid.png
- **Console:** none
- **Network:** none
- **Load:** ~3.5s
- **State:** ok

## Step 13 — Dashboard after funding — /crm/customers/:id (UAT Cafe B2B)
- **Action:** Returned to the customer dashboard after funding.
- **Expected:** Dashboard reflects the funded credit (a credit/funding gauge).
- **Observed:** Dashboard unchanged from Step 6 — the financial widget is STILL the dashed **"Credit gauge (T26)" placeholder**; no balance, no funded-amount, no gauge. The subscription card still reads "Current week: 22 Jun – 28 Jun 2026 delivering" (the in-flight week, not the funded 29 Jun week). **Scope (d) "verify the credit/funding gauge" is not satisfiable — the gauge is unbuilt.**
- **Screenshot:** screens/13-dashboard-after-fund.png
- **Console:** error — DOM-nesting (same as Step 6)
- **Network:** none
- **Load:** ~1.8s
- **State:** broken (headline financial widget is a placeholder; funded credit not surfaced on the hub)

## Step 14 — Activity timeline (populated) — /crm/customers/:id/activity
- **Action:** Opened the populated activity timeline.
- **Expected:** Derived union of orders/invoices/ledger/milestones.
- **Observed:** Rich feed (newest first): "Credit top-up +1.500.000 IDR" (subhead = **raw subscription id `subscription zh75j…`**, not the label "UAT Weekly Cookies"); "Invoice INV-2606-005 paid 1.500.000 IDR"; "Invoice INV-2606-005 **sent** 1.500.000 IDR" (an "Invoice sent" event was logged although the invoice was never actually sent via WhatsApp/email); "Order #0625-009…005 placed — UAT Cafe B2B"; older block: "Credit top-up +1.650.000", "Invoice INV-2606-001 paid/sent", "Order #0624-…", and "Subscription \"UAT Weekly Cookies\" started — 24 Jun · Lucas". Per-type icons + colours (Order / Finance / Milestone) consistent. Timestamps "26 Jun, 00:27 · Manager User".
- **Screenshot:** screens/14-activity-populated.png
- **Console:** none
- **Network:** none
- **Load:** ~1.8s
- **State:** ok (strong B5/B6 timeline; raw-id subject + "sent" mislabel are blemishes)

## Step 15 — Funding dashboard — /crm/funding
- **Action:** Opened the operator funding dashboard.
- **Expected:** Weeks awaiting payment / invoice.
- **Observed:** "Subscription Funding Dashboard — Weeks awaiting payment or invoice — fund credit pools once cash received." Cards: "Awaiting payment 0 weeks invoiced", "Needs invoice 0 weeks confirmed". Empty state "All caught up / No subscription weeks are awaiting payment or invoice right now." (the week funded in Steps 10–12 is already paid, so nothing pending).
- **Screenshot:** screens/15-funding-dashboard.png
- **Console:** none
- **Network:** none
- **Load:** ~1.5s
- **State:** ok

## Step 16 — Agreement page (empty) — /crm/customers/:id/agreements
- **Action:** Opened the supply-agreement page.
- **Expected:** Designed empty state + upload.
- **Observed:** "Agreement" + "Back to customer". Empty state: document icon, "No supply agreement / Upload the supply agreement for this customer to get started." Below: Language ID/EN toggle + "Upload agreement (PDF, JPEG, PNG, WebP · max 10 MB)". Breadcrumb "CRM › Customer › Agreement" (generic "Customer").
- **Screenshot:** screens/16-agreement-page.png
- **Console:** none
- **Network:** none
- **Load:** ~1.5s
- **State:** ok (good empty + upload affordance)

## Step 17 — Mobile viewport nav check — 390×844
- **Action:** Set mobile viewport, opened /crm then a customer dashboard.
- **Expected:** Usable nav + layout on phone.
- **Observed:** /crm home (17a): cards + sections stack; **the fixed bottom mobile nav bar (Sales/Orders/Kitchen/Inventory/More) overlaps the "Active subscriptions" table, and the table's right columns are cut off** ("Deli…" / "Current week" truncated). No horizontal scroll affordance visible. Customer dashboard (17b): stacks cleanly into one column; "Plan schedule"/"Settings" buttons sit beside the (3-line-wrapped) title; IDENTITY box, "Credit gauge (T26)" placeholder, subscription card, "View activity timeline →" all render. Top-left hamburger + bottom tab-bar present; **CRM is not in either mobile nav** (URL-only, same as desktop).
- **Screenshot:** screens/17a-mobile-crm-home.png, screens/17b-mobile-customer-dashboard.png
- **Console:** none new
- **Network:** none
- **Load:** snappy
- **State:** warn (mobile table overflow under bottom nav; CRM not in nav)

---

### Console / network summary
- **console-errors.log:** (1) recurring React **DOM-nesting error** — `<div>` (Badge) inside `<p>` in `CustomerDashboard` FinancialPane subscription card ("Current week …" line); fires on every dashboard that has a subscription. (2) **a11y warning** — DialogContent missing `Description`/`aria-describedby` (Settings dialog). No other errors.
- **network-failures.log:** no 4xx/5xx responses captured across the whole pass.
