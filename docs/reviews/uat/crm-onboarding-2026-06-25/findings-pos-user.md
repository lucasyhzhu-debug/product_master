# Findings — Bu Sri (POS operator) — New-customer onboarding (Phase D CRM)

Run: crm-onboarding-2026-06-25. I read the flow-log, every screenshot, and the logs. I did not open the app myself. Each finding cites a step/screen.

---

### [BLOCKER] I cannot actually start a subscription for a brand-new customer
- **Where:** Step 7-9 / subscription + schedule pages (screens/07-subscription-page.png, screens/08-schedule-week-unseeded.png); also Scope note (c) in context.md
- **What:** The whole point of onboarding is to put a NEW customer onto a weekly subscription. But the UI only lets me schedule weeks on a subscription that ALREADY exists. There is no button anywhere to create the subscription itself. My new customer "Kopi Senja Onboarding" has "No subscriptions found for this customer" (screens/03) and no way to give her one. The orchestrator could only test the cycle because "UAT Cafe B2B" already had a subscription seeded behind the scenes.
- **Why it matters (POS operator lens):** This is the main job — sign up a new cafe for weekly cookies. If I cannot create their subscription on screen, the onboarding just stops dead. I would have to call someone technical, which means I cannot do my own job.
- **Suggested fix:** Add a "Start subscription" / "New subscription" button on the customer dashboard (next to Plan schedule) that opens a form for weekly qty, product, price, delivery time, start date.

### [BLOCKER] No way to add a new customer inside CRM — I get thrown into the order form
- **Where:** Step 1-2 / CRM home + New Order (screens/01-crm-home.png, screens/02b-inline-create-customer-dropdown.png)
- **What:** On the CRM page there is no "Add customer" button, no customer list, no search. The ONLY way to create a customer is to go to Orders -> New Order, type a name, and click "+ Create new customer". So to onboard a customer I must leave CRM entirely and pretend to take an order.
- **Why it matters (POS operator lens):** When I want to add a new cafe, I go to "Customer relationship management" — that is literally what the page is called. Finding nothing there and being told to fake an order is backwards and confusing. A new staff member would never figure this out.
- **Suggested fix:** Put an "Add customer" button on the CRM home with a proper form (name, phone, WhatsApp, address). Add a customer list/search too so I can find people.

### [UX-HIGH] The credit balance is the most important number and it is just an empty box that says "Credit gauge (T26)"
- **Where:** Step 3, 6, 13 / customer dashboards (screens/03-new-customer-dashboard-empty.png, screens/06-existing-customer-dashboard.png, screens/13-dashboard-after-fund.png)
- **What:** Where the customer prepaid credit should show, there is only a dashed empty box with grey text "Credit gauge (T26)". Even AFTER I marked the Rp1.500.000 invoice paid and "funded credit", the dashboard still shows the same empty box — no balance, no amount, nothing.
- **Why it matters (POS operator lens):** My whole business with these cafes is prepaid credit — how much money they put in and how much is left. That is the FIRST thing I need to see on a customer. If it is blank, I have no idea if they are funded or out of money, and I cannot trust the screen at all. "T26" looks like a code that means the page is unfinished.
- **Suggested fix:** Build the credit gauge to show funded / consumed / remaining in Rupiah. Until it is built, do not ship the "(T26)" placeholder — show a proper "Coming soon" or hide it.

### [UX-HIGH] The invoice tells the customer to bank-transfer but shows NO bank account
- **Where:** Step 11 / weekly invoice (screens/11-weekly-invoice.png)
- **What:** The invoice has a big "BANK TRANSFER REFERENCE: INV-2606-005" and says "Customer copies this into the transfer memo field". But the bank block only shows "a/n" with nothing after it — no bank name, no account number, no account-holder name.
- **Why it matters (POS operator lens):** How is the cafe supposed to pay me? I am telling them to transfer money but not telling them WHERE. They will call me confused, or worse, not pay. Money instructions that do not say which account is the scariest kind of broken — it stops me getting paid.
- **Suggested fix:** Always show bank name + account number + account holder on the invoice. If no bank is configured, block sending and warn the operator to set it up first.

### [BUG] The activity log says the invoice was "sent" — but it was never actually sent
- **Where:** Step 14 / activity timeline (screens/14-activity-populated.png)
- **What:** The timeline shows "Invoice INV-2606-005 sent 1.500.000 IDR". But the invoice was never sent to anyone — there are no WhatsApp or email send buttons on the invoice, and this customer has no phone/email. The flow only marked it paid; nothing was ever delivered to a customer.
- **Why it matters (POS operator lens):** If my history says I "sent" the invoice, I will believe the cafe already got it and just wait for payment. Meanwhile they never received anything. A record that says something happened when it did not will make me make wrong decisions about who I have chased.
- **Suggested fix:** Only log "Invoice sent" when it is actually delivered (WhatsApp/email/PDF shared). Otherwise log "Invoice created" or "Invoice issued".

### [UX-HIGH] The customer phone number and address are nowhere to be seen
- **Where:** Step 3 / new-customer dashboard (screens/03-new-customer-dashboard-empty.png)
- **What:** The IDENTITY card shows a phone icon with the words "Phone (WhatsApp)" but NOT the actual number 081298765432 that was saved. The delivery address saved on the record is not shown anywhere either.
- **Why it matters (POS operator lens):** I open a customer to grab their WhatsApp number and where to deliver. If the page shows the word "Phone" but not the number, and no address at all, the customer page is useless to me for the everyday thing I need it for.
- **Suggested fix:** Show the actual phone number as text (with the WhatsApp link), and show the delivery/store address in an Addresses section.

### [UX-HIGH] The edit dialog cannot reach the phone, name, or saved address
- **Where:** Step 5 / Settings dialog (screens/05-settings-edit-dialog.png)
- **What:** "Edit CRM fields" has Key contact name, role, WhatsApp, Email, Instagram, Delivery address, Store address, Notes — but NO field for the customer primary phone number, NO field for the customer Name, and it does not show the address captured when the order was placed. The WhatsApp box is empty even though a phone number exists on the record.
- **Why it matters (POS operator lens):** If a cafe changes their number or I typed the name wrong, I should be able to fix it here. Instead the form has two different phone-ish boxes (one I cannot even see) and cannot touch the main number or the name. I would never trust which box actually matters.
- **Suggested fix:** Make the edit form cover the same fields shown on the card — primary phone, name, and the delivery address — so what I edit matches what I see.

### [UX-HIGH] A customer with a live subscription shows a totally blank IDENTITY box
- **Where:** Step 6 / UAT Cafe B2B dashboard (screens/06-existing-customer-dashboard.png)
- **What:** The IDENTITY card is just an empty bordered box with the word "IDENTITY" and nothing inside — no contact info, and no message explaining why it is empty.
- **Why it matters (POS operator lens):** An empty white box looks broken, like the page did not finish loading. I would sit and wait, or refresh, thinking something failed.
- **Suggested fix:** Show a friendly empty message like "No contact details yet — add them in Settings" with a button, instead of a silent blank box.

### [UX-HIGH] After funding, the dashboard does not show the week I just paid for
- **Where:** Step 13 / dashboard after funding (screens/13-dashboard-after-fund.png)
- **What:** I just confirmed, invoiced, and funded the 29 Jun - 5 Jul week for Rp1.500.000. Back on the dashboard the subscription card still only says "Current week: 22 Jun - 28 Jun 2026 delivering" — the old in-flight week. Nothing on the hub tells me my funding worked.
- **Why it matters (POS operator lens):** I did all that work and the customer page looks exactly the same as before. I cannot tell if the money landed. I would redo it or panic that it failed.
- **Suggested fix:** Surface the funded credit and upcoming funded week on the dashboard (tied to the credit gauge fix), so the hub reflects what I just did.

### [UX-HIGH] The "Who did this" column shows long computer codes instead of a person name
- **Where:** Step 7 / subscription credit ledger — BY column (screens/07-subscription-page.png)
- **What:** In the Credit Ledger Statement the BY column shows things like mn7d0j0kycdyqv08xpftp... instead of a staff name like "Lucas" or "Manager User".
- **Why it matters (POS operator lens):** This is the money record. The "who" column is supposed to tell me which of my staff topped up or recognized a sale. A jumble of letters tells me nothing and makes the money record feel untrustworthy.
- **Suggested fix:** Show the staff member name in the BY column (the activity timeline already shows "Manager User"/"Lucas", so the name is available).

### [UX-HIGH] On the phone, the bottom menu bar sits on top of the customer table and cuts off the right side
- **Where:** Step 17 / mobile CRM home (screens/17a-mobile-crm-home.png)
- **What:** The fixed bottom nav (Sales/Orders/Kitchen/Inventory/More) overlaps the "Active subscriptions" table, and the right columns are cut off ("Deli..." / "Current week" truncated). No way to scroll sideways to see them.
- **Why it matters (POS operator lens):** I use my phone constantly. If the menu bar covers the table and I cannot see the right side, I cannot read which week or status a cafe is on while I am standing at the counter.
- **Suggested fix:** Add bottom padding so the list clears the nav bar, and make the table scroll or stack on small screens.

### [UX-HIGH] CRM is hidden — it is not in the menu at all, only by typing the web address
- **Where:** Step 1 + Step 17 / top nav + mobile nav (screens/01-crm-home.png, screens/17a-mobile-crm-home.png)
- **What:** /crm is not in the top menu (Dashboards / Orders / Ops / Finance / Config) and not in the mobile menu either. The orchestrator could only reach it by typing the URL.
- **Why it matters (POS operator lens):** If a whole section is not in the menu, I do not know it exists. I am never going to type web addresses by hand. For me, this feature basically does not exist.
- **Suggested fix:** Add "CRM" (or "Customers") to the main nav on desktop and mobile.

### [UX-NIT] The activity feed shows a raw subscription code instead of the subscription name
- **Where:** Step 14 / activity timeline (screens/14-activity-populated.png)
- **What:** The "Credit top-up +1.500.000 IDR" rows have a small grey subhead reading "subscription zh75j..." instead of the friendly name "UAT Weekly Cookies".
- **Why it matters (POS operator lens):** A line of random letters under a money entry means nothing to me. The proper name would tell me which subscription got the money.
- **Suggested fix:** Show the subscription label ("UAT Weekly Cookies") under the activity entry, not the database id.

### [UX-NIT] Breadcrumb says the generic word "Customer" instead of the customer name
- **Where:** Step 4, 7, 16 / breadcrumbs (screens/04-new-customer-activity-empty.png, screens/07-subscription-page.png, screens/16-agreement-page.png)
- **What:** The trail reads "CRM > Customer > Activity" — the middle crumb is the word "Customer", not the actual name (e.g. "UAT Cafe B2B").
- **Why it matters (POS operator lens):** When I am deep in a customer pages, the breadcrumb should remind me WHOSE page this is. "Customer" could be anybody — I lose track of who I am looking at.
- **Suggested fix:** Use the customer real name in the middle breadcrumb, and make it a link back to their dashboard.

### [UX-NIT] "Balance resets at the start of each week" may worry me about my customer money
- **Where:** Step 7 / credit ledger disclaimer (screens/07-subscription-page.png)
- **What:** The ledger says "Balance column is week-scoped and resets at the start of each week."
- **Why it matters (POS operator lens):** "Resets" sounds like money disappears every week. I would worry the cafe loses unused credit. I need plain words telling me whether leftover credit rolls over (the subscription does say "Rollover" up top) or not.
- **Suggested fix:** Reword to make clear the credit itself is not lost — e.g. "This column shows the balance within each week; unused credit rolls over to next week."

### [BUG] Repeating console error on every customer dashboard with a subscription
- **Where:** Step 3/6/13 / console-errors.log
- **What:** A React DOM-nesting error fires every time a dashboard with a subscription loads (a Badge div placed inside a p in the subscription card). There is also a dialog accessibility warning on the Settings dialog.
- **Why it matters (POS operator lens):** I cannot see this myself, but errors firing on every load is the kind of thing that can make a page glitch or fail to load later. It should be cleaned up before it bites a real customer.
- **Suggested fix:** Fix the markup so the Badge is not nested inside a paragraph; add the missing dialog description for accessibility.

---

## What worked well (so the team keeps it)
- The empty states on Activity, Agreement, and the unseeded schedule week are clear and reassuring (screens/04, 08, 16).
- Every money action gave me a clear toast: "Week seeded", "Week confirmed and invoice created", "Invoice marked paid. Credit funded." (screens/09, 10, 12). That feedback is exactly what I need.
- The subscription credit ledger links to the invoice and the orders, and the bank-transfer reference is big and copyable (screens/07, 11).
- The schedule -> confirm -> invoice -> mark-paid steps were easy to follow and locked the week sensibly after invoicing (screens/09-12).
