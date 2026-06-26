# Flow Log — Phase D CRM (evidence pack)

> One block per step, navigation order. Personas: rely ONLY on this + `screens/` + `dumps/` + `console-errors.log` + `network-failures.log`. Full innerText per step is in `dumps/NN-*.txt`. No network failures occurred in the whole run (`network-failures.log` = none).

## Step 1 — Login as manager — /login
- **Action:** Avatar grid → E2E-Manager → PIN 999999 → Sign In.
- **Expected:** Authenticated, redirected off /login.
- **Observed:** Logged in; landed on app. Header shows "E2E-Manager".
- **Screenshot:** screens/01-login-as-manager.png
- **Console:** none · **Network:** none · **Load:** snappy · **State:** ok

## Step 2 — CrmHome — /crm
- **Action:** Navigate /crm.
- **Expected:** Needs-funding list (invoiced first) + active-subscriptions list; every reference a link; summary counts match lists.
- **Observed:** "CRM / Customer relationship management". Cards: NEEDS FUNDING **0** weeks pending; ACTIVE SUBSCRIPTIONS **5** subscriptions. Needs-funding shows a designed empty state ("All caught up — No weeks awaiting payment or invoice right now."). "Active subscriptions" table: Customer (linked, ↗ icon) | Label | Current week (Delivering/Closed badges). Rows incl. UAT Cafe B2B → Morning Bundle A (Delivering), Afternoon Bundle B (Closed), + 3 leftover prior-run subs.
- **Screenshot:** screens/02-crmhome.png
- **Console:** none · **Network:** none · **Load:** snappy · **State:** ok

## Step 3 — CrmHome mobile (390px) — /crm
- **Action:** Set 390×844 viewport, reload /crm.
- **Expected:** Nav + layout usable on mobile.
- **Observed:** Hamburger + logo header; cards stack; MobileBottomNav (Sales, Orders, Kitchen, Inventory, More) present; active-subscriptions renders as a table below. Readable, no horizontal overflow.
- **Screenshot:** screens/03-crmhome-mobile.png
- **Console:** none · **Network:** none · **Load:** snappy · **State:** ok

## Step 4 — CustomerDashboard hub — /crm/customers/:id
- **Action:** Open the UAT Cafe B2B hub.
- **Expected:** Two panes (identity + financial story); per-sub credit gauge (integer IDR); subs list; unpaid invoices + Draft-WA; clean console.
- **Observed:** Breadcrumb "CRM › UAT Cafe B2B". Identity pane: contact icons (Phone (WhatsApp), WhatsApp, Email, Instagram), key contact "Budi Santoso · Purchasing Manager", delivery + store addresses, notes, and **"Agreement ···89dkf8" (raw ID fragment) + "signed" badge**. Financial pane: **credit gauge per subscription** — "MORNING BUNDLE A Rp 1.200.000 of Rp 2.175.000, Rp 975.000 consumed" (bounded green bar) and "AFTERNOON BUNDLE B Rp 585.000 of Rp 585.000, Rp 0 consumed" — **per-sub, no roll-up**. Subscriptions list (Morning Bundle A delivering / Afternoon Bundle B closed, both active). Credit-drawdown chart (selector + bars + credit-remaining line + "Unspent credit" flag). Unpaid invoices: "1 invoice unpaid", "Draft WhatsApp reminder", "Mark paid → fund". "View activity timeline →" link. **Prior-run credit-gauge BLOCKER is RESOLVED.**
- **Screenshot:** screens/04-customerdashboard-hub.png
- **Console:** **5 errors** — `In HTML, <X> cannot be a descendant of <Y>` + `<X> cannot contain a nested <Y>` (DOM-nesting, likely nested anchors/badges); `Encountered two children with the same key` (duplicate React keys); 2× Recharts `width(-1)/height(-1) of chart should be greater than 0`. (full detail in console-errors.log) · **Network:** none · **Load:** snappy (chart paints) · **State:** warn

## Step 5 — Hub → Settings (Edit CRM fields) dialog — /crm/customers/:id
- **Action:** Click Settings; observe edit dialog.
- **Expected:** Dialog round-trips EVERY displayed CRM field.
- **Observed:** "Edit CRM fields" dialog: Key contact name (Budi Santoso), Key contact role, **WhatsApp** (+6281234560099), Email, Instagram, Delivery address, Store address, Notes; Cancel/Save. All identity fields editable — **prior "edit can't reach displayed fields" BUG appears RESOLVED.** NOTE: dialog exposes only "WhatsApp", **no separate "Phone" field** though the hub identity lists "Phone (WhatsApp)" separately — phone may not round-trip.
- **Screenshot:** screens/05-hub-settings-dialog.png
- **Console:** 3 — duplicate-key + `Missing Description or aria-describedby for {DialogContent}` (a11y). · **Network:** none · **Load:** instant · **State:** warn

## Step 6 — Hub → Draft WhatsApp reminder — /crm/customers/:id
- **Action:** Click "Draft WhatsApp reminder"; capture popup.
- **Expected:** Opens wa.me deep-link with prefilled dunning text (must NOT claim "sent"); logs a `whatsapp_drafted` activity.
- **Observed:** Opened popup to **`https://api.whatsapp.com/send/?phone=6281234560099&text=Halo+UAT+Cafe+B2B%21+Ka…`** (prefilled message; no "sent" claim). A "Drafted WhatsApp payment reminder" row subsequently appears in the timeline (see Step 8) — activity logged correctly.
- **Screenshot:** screens/06-hub-draft-whatsapp.png
- **Console:** none · **Network:** none · **Load:** instant · **State:** ok

## Step 7 — Hub → drawdown chart + SubscriptionSelector — /crm/customers/:id
- **Action:** Switch the subscription selector to the 2nd subscription; scroll chart into view.
- **Expected:** Switching refetches; chart title names the selected sub; per-sub series (no summed roll-up); "today" divider + "Unspent credit" flag.
- **Observed:** Selector switched to **"Afternoon Bundle B"**; chart title updated to "Credit drawdown — Afternoon Bundle B" with its own bars (Rp 600.000 axis, 0 consumed) + flat credit-remaining line + "Unspent credit" flag — **distinct per-subscription, confirms no roll-up.** (fullPage screenshot shows a sticky-header artifact mid-page — cosmetic capture-only.)
- **Screenshot:** screens/07-hub-drawdown-chart-selector.png
- **Console:** 3 — duplicate-key + Recharts sizing warnings. · **Network:** none · **Load:** snappy · **State:** warn

## Step 8 — Activity timeline — /crm/customers/:id/activity
- **Action:** Navigate timeline.
- **Expected:** Latest-on-top, 14-day window, category filters, icon discs, clickable rows.
- **Observed:** "Activity timeline / Last 14 days". Filter chips: Order, Finance, Message, Document, Schedule, Milestone + "Load older". Rows with colored icon discs: "Drafted WhatsApp payment reminder" (appears twice at top), "Credit top-up +1.875.000 IDR" / "+300.000 IDR" (detail strings contain a raw `subscription <id>`), "Order #UAT-006 placed", "Invoice INV-UAT-0606-003 sent", "Order …delivered", "Invoice …paid", "Agreement 'UAT Supply Agreement-ID.pdf' signed/uploaded", etc. Comprehensive, categorized, truthful for the recent cycle.
- **Screenshot:** screens/08-activity-timeline.png
- **Console:** none · **Network:** none · **Load:** snappy · **State:** ok

## Step 9 — Activity → category filter — /crm/customers/:id/activity
- **Action:** Toggle a type filter.
- **Expected:** Rows filter server-side.
- **Observed:** Filter control engaged; list updates. (See dump 09.)
- **Screenshot:** screens/09-activity-category-filter.png
- **Console:** none · **Network:** none · **Load:** snappy · **State:** ok

## Step 10 — Activity → Load older — /crm/customers/:id/activity
- **Action:** Click "Load older".
- **Expected:** Window widens; older events appear.
- **Observed:** Control clicked; window widened (sub-2 past-week invoice ~15d old surfaces beyond default 14d).
- **Screenshot:** screens/10-activity-load-older.png
- **Console:** none · **Network:** none · **Load:** snappy · **State:** ok

## Step 11 — Agreements — /crm/customers/:id/agreements
- **Action:** Navigate agreement page.
- **Expected:** ID + EN versions, open URLs, link-to-subscription (bidirectional), upload.
- **Observed:** Breadcrumb "CRM › Customer › Agreement" (**generic "Customer", not the customer name**). Card "**Agreement ···89dkf8**" (raw ID fragment) + signed badge + "Last uploaded 2026-06-19". VERSIONS: UAT-Supply-Agreement-ID.pdf (ID badge + open icon), UAT-Supply-Agreement-EN.pdf (EN badge + open icon). LINKED SUBSCRIPTION: "**Subscription ···89ds0j**" (raw ID fragment, linked ↗). ADD VERSION: Language ID/EN toggle + "Upload new version (PDF, JPEG, PNG, WebP · max 10 MB)".
- **Screenshot:** screens/11-agreements.png
- **Console:** none · **Network:** none · **Load:** snappy · **State:** ok

## Step 12 — Subscription page (Morning Bundle A) — /crm/customers/:id/subscriptions/:subId
- **Action:** Open read-only subscription page; scroll.
- **Expected:** Parent breadcrumb; week back-refs; credit-ledger statement (signed delta + running balance, integer IDR, click-throughs); reset disclaimer.
- **Observed:** "Morning Bundle A" / active / "Prepaid weekly credit". WEEKLY QTY 25 items · DELIVER BY 09:00 WIB · STARTED 2026-05-29 · ROLLOVER Expire. **Credit Ledger Statement** with week selector "22 Jun – 28 Jun 2026 — delivering": Issued Rp 2.175.000, Consumed Rp 975.000, Remaining Rp 1.200.000. Rows (TYPE/AMOUNT/BALANCE/LINK/BY/NOTE): topup +Rp1.875.000 → 1.875.000 (Invoice ···89c0g0 · **BY `mn7619tbcw44tmvys0a…` raw user ID** · "Weekly credit funded — INV-UAT-2606-001 (seed)"); drawdown −375.000 → 1.500.000 (Order ···89cmp0 · "Delivery day 1"); −375.000 → 1.125.000 (Order ···89cvtg · day 2); −225.000 → 900.000 (Order ···89dfxf · day 3); topup +300.000 → 1.200.000 (Invoice ···89d3j5 · "Mid-week amendment — INV-UAT-2606-002"). Note "Balance column is week-scoped and resets at the start of each week." SUPPLY AGREEMENT "Agreement ···89dkf8 →". **Money fully traceable (C10).** Findings: ledger **LINK text uses raw ID fragments** (Invoice ···89c0g0 / Order ···89cmp0) while the human number (INV-UAT-2606-001, etc.) only appears in NOTE; **BY column shows a raw user ID, not an actor name.**
- **Screenshot:** screens/12-subscription-page.png
- **Console:** none · **Network:** none · **Load:** snappy · **State:** ok

## Step 13 — Subscription page (Afternoon Bundle B) — /crm/customers/:id/subscriptions/:sub2
- **Action:** Open the 2nd subscription.
- **Expected:** Distinct data, closed-week state.
- **Observed:** Renders the 2nd subscription independently. (See dump 13.)
- **Screenshot:** screens/13-subscription-page-sub2-.png
- **Console:** none · **Network:** none · **Load:** snappy · **State:** ok

## Step 14 — Funding dashboard — /crm/funding
- **Action:** Navigate funding dashboard.
- **Expected:** Needs-invoice vs awaiting-payment rows; mark-paid→fund; palette consistent with CrmHome.
- **Observed:** "Subscription Funding Dashboard / Weeks awaiting payment or invoice — fund credit pools once cash received." AWAITING PAYMENT **0** weeks invoiced; NEEDS INVOICE **0** weeks confirmed. Designed empty state "All caught up — No subscription weeks are awaiting payment or invoice right now." **Inconsistency:** the hub (Step 4) shows "1 invoice unpaid / Mark paid → fund", but funding shows 0 awaiting — the unpaid mid-week amendment invoice does not surface here (funding tracks WEEKS, not invoices). Mark-paid→fund therefore had no row to exercise here (see coverage gap #2).
- **Screenshot:** screens/14-funding-dashboard.png
- **Console:** none · **Network:** none · **Load:** snappy · **State:** ok

## Step 15 — Not-found customer (bad :id) — /crm/customers/<bad>
- **Action:** Navigate to a non-existent customer id.
- **Expected:** Friendly EmptyState ("customer not found"), NOT a crash.
- **Observed:** **Full-screen error-boundary crash: "Something went wrong loading this page. / Please reload."** Console: `[CONVEX Q(crm/customers:getCustomerRecord)] Server Error` surfaced as a ChunkLoadError → caught by ChunkErrorBoundary. The backend throws a plain `Server Error` for a missing id instead of returning null / a typed not-found, so the UI shows a generic crash page rather than a friendly not-found state.
- **Screenshot:** screens/15-not-found-customer.png
- **Console:** 2 — Convex Server Error + error-boundary. · **Network:** none (Convex over WS) · **Load:** error · **State:** broken

## Step 16 — Orders board — /orders
- **Action:** Navigate orders kanban.
- **Expected:** Seeded orders across statuses incl. UAT Cafe B2B + subscription orders.
- **Observed:** Kanban columns Draft / Awaiting Payment / Payment Received / Being Prepared / Awaiting Delivery with many cards incl. "UAT Cafe B2B" and "UAT-Sub-Test-…" subscription orders.
- **Screenshot:** screens/16-orders-board.png
- **Console:** none · **Network:** none · **Load:** snappy · **State:** ok

## Step 17 — Order slide-over (attempt) — /orders
- **Action:** Click an order card to open the slide-over.
- **Expected:** Slide-over opens; customer name links to /crm/customers/:id.
- **Observed:** Card click did not open the slide-over in the automated pass (cards use onClick, not href). Board remained. **Coverage gap** — see Step 18 for the captured link href and context.md gap #1.
- **Screenshot:** screens/17-order-slide-over.png
- **Console:** none · **Network:** none · **Load:** n/a · **State:** warn

## Step 18 — Order → CRM link (href captured) — /orders
- **Action:** Read any `/crm/customers/` link in the order-surface DOM.
- **Expected:** Order surface links the customer to the CRM hub.
- **Observed:** Found `href="/crm/customers/j97dq4jjy6xgxg2qp8be485vfx89cpgb"` in the order surface DOM. Link exists in code in `KanbanCard.tsx:153`, `OrderSlideOver.tsx:353`, `OrderDetail.tsx:268` (Pitfall #20 parity code-confirmed). Full OrderDetail page not visually opened.
- **Screenshot:** screens/18-order-full-page.png
- **Console:** none · **Network:** none · **Load:** n/a · **State:** warn

## Step 19 — Login as admin — /login
- **Action:** Logout, login as E2E-Admin.
- **Observed:** Admin authenticated.
- **Screenshot:** screens/19-login-as-admin.png
- **Console:** none · **Network:** none · **Load:** snappy · **State:** ok

## Step 20 — Admin — hub — /crm/customers/:id
- **Action:** Open the hub as admin.
- **Expected:** Admin-only affordances; same data integrity.
- **Observed:** Hub renders identically for admin (gauge, subs, chart, unpaid invoices). Same DOM-nesting + duplicate-key + Recharts console errors as the manager pass (reproducible, role-independent).
- **Screenshot:** screens/20-admin-hub.png
- **Console:** 5 — same set as Step 4. · **Network:** none · **Load:** snappy · **State:** warn

## Step 21 — Login as order_staff — /login
- **Action:** Logout, login as E2E-OrderStaff.
- **Observed:** Order-staff authenticated; header "E2E OrderStaff".
- **Screenshot:** screens/21-login-as-order-staff.png
- **Console:** none · **Network:** none · **Load:** snappy · **State:** ok

## Step 22 — order_staff blocked from /crm — /crm
- **Action:** Navigate /crm as order_staff.
- **Expected:** Route guard blocks (no CRM content), no crash.
- **Observed:** Redirected to the Orders board — **no CRM content shown, no crash.** Access control (canAccessCrm = manager+admin) enforced. ✅
- **Screenshot:** screens/22-order-staff-blocked-crm.png
- **Console:** none · **Network:** none · **Load:** snappy · **State:** ok

## Step 23 — order_staff customer deep-link blocked — /crm/customers/:id
- **Action:** Navigate the customer hub deep-link as order_staff.
- **Expected:** Blocked (dead link), not a crash.
- **Observed:** Redirected to the Orders board — deep link blocked gracefully, no crash. ✅
- **Screenshot:** screens/23-order-staff-customer-link.png
- **Console:** none · **Network:** none · **Load:** snappy · **State:** ok
