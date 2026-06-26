# UAT Findings — "Bu Sri" (POS operator persona) — Phase D CRM

Run: `phase-d-crm-2026-06-26`. Judged through a non-technical shop-operator lens from the evidence pack (flow-log + 23 screens + dumps + console log).

**Summary counts: 1 BLOCKER · 3 BUG · 3 UX-HIGH · 3 UX-NIT**

## What worked
- **Credit gauge reads clearly.** "MORNING BUNDLE A · Rp 1.200.000 of Rp 2.175.000 · Rp 975.000 consumed" with a bounded green bar — per-subscription, no confusing roll-up. (Step 4)
- **Ledger statement is trustworthy money.** Signed amount + running balance on every row, plus week Issued/Consumed/Remaining up top. (Step 12)
- **Draft WhatsApp is honest.** Opens a pre-filled message, does NOT claim "sent", and logs a timeline note. (Steps 6, 8)
- **Empty states are calm, not scary** ("All caught up …"). (Steps 2, 14)
- **Access control bounces staff cleanly** to Orders, no error. (Steps 22, 23)

---

### [BLOCKER] Opening a bad/old customer link crashes the whole page
- **Where:** Step 15 / not-found customer (screens/15-not-found-customer.png)
- **What:** A non-existent customer id shows a blank full-screen "Something went wrong loading this page. / Please reload." Backend throws a raw `Server Error` caught by the error boundary, instead of a friendly not-found.
- **Why it matters (POS lens):** A stale bookmark or mistyped link makes the app look BROKEN. "Please reload" just reproduces the crash. A missing customer is normal life and must never look like the software fell over.
- **Suggested fix:** Have the customer query return null / typed not-found and render a designed EmptyState ("We couldn't find this customer" + link back to /crm), not the crash boundary.

### [UX-HIGH] Raw database codes shown where a name or number belongs
- **Where:** Step 4 hub ("Agreement ···89dkf8"); Step 11 agreement page ("Agreement ···89dkf8", "Subscription ···89ds0j"); Step 12 ledger LINK column ("Invoice ···89c0g0", "Order ···89cmp0") + "Agreement ···89dkf8 →".
- **What:** Links/titles labelled with truncated raw IDs. The real invoice number (INV-UAT-2606-001) only appears buried in the NOTE column.
- **Why it matters (POS lens):** "···89dkf8" means nothing — I think in invoice/order numbers and names. I can't tell which invoice or order I'm about to open, and it makes the screen feel like leaking internals, lowering trust in the money beside it.
- **Suggested fix:** Label links with the human identifier (invoice/order number, "Supply Agreement", subscription label). Keep raw IDs out of visible text.

### [UX-HIGH] Agreement breadcrumb says "Customer", not the customer's name
- **Where:** Step 11 / agreements (screens/11) — "CRM › Customer › Agreement"
- **What:** Middle crumb is generic "Customer" instead of "UAT Cafe B2B".
- **Why it matters (POS lens):** Breadcrumbs are how I get back; "Customer" doesn't tell me whose page this is. With several customers open I lose my place.
- **Suggested fix:** Render the real customer name in the trail on agreement and subscription pages.

### [UX-HIGH] Hub says "1 invoice unpaid" but Funding dashboard says "All caught up"
- **Where:** Step 4 hub vs Step 14 funding (screens/04, /14)
- **What:** Hub flags an unpaid invoice to chase; the Funding dashboard — where I'd go to mark paid — shows nothing pending (funding tracks weeks, not the mid-week amendment invoice).
- **Why it matters (POS lens):** Two screens disagree about whether someone owes me money. I'd see "All caught up" on funding and miss the unpaid invoice — real money slips through.
- **Suggested fix:** Surface the unpaid invoice on Funding too, or make the hub's "Mark paid → fund" link land on the actual invoice. The surfaces must not contradict on outstanding payment.

### [BUG] Ledger "BY" column shows a raw user ID instead of a person's name
- **Where:** Step 12 / ledger BY column "mn7619tbcw44tmvys0a…" (screens/12)
- **What:** Each ledger row's actor is a raw user ID, not a staff name.
- **Why it matters (POS lens):** A money statement should say WHO topped up/drew down credit. The code makes it look unfinished/untrustworthy.
- **Suggested fix:** Resolve to the staff display name — the timeline already does this ("· Lucas").

### [BUG] Timeline top-up rows show a raw subscription ID as the only detail
- **Where:** Step 8 / timeline (screens/08, dumps/08)
- **What:** Top-up entries show the full raw subscription ID as the subject instead of the subscription name.
- **Why it matters (POS lens):** Order/invoice rows say "UAT Cafe B2B" / "Order #UAT-006"; the top-up rows show a 32-char code. Reads like a glitch in an otherwise clean history.
- **Suggested fix:** Show the subscription label ("Afternoon Bundle B") as the subject; keep the ID for linking only.

### [BUG] Edit dialog has no "Phone" field, though the hub lists "Phone (WhatsApp)" separately
- **Where:** Step 5 / Edit CRM fields dialog (screens/05) vs hub identity (screens/04)
- **What:** Hub identity shows both "Phone (WhatsApp)" and "WhatsApp", but the edit dialog only exposes one "WhatsApp" field — phone can't be edited (seed has both `phone` + `whatsapp`).
- **Why it matters (POS lens):** A displayed-but-uneditable field is a trap — I'll think I updated the number when I didn't, and reminders go to the wrong phone.
- **Suggested fix:** Add the Phone field so every displayed contact round-trips through edit (or merge the two if they're the same number).

### [UX-NIT] Inconsistent money format — "Rp 1.200.000" vs "585.000 IDR"
- **Where:** Gauge/ledger use "Rp …" prefix (screens/04, /12); timeline uses "… IDR" suffix (screens/08).
- **Why it matters (POS lens):** Consistent money reads as more trustworthy and scans faster.
- **Suggested fix:** Standardize on one (prefer "Rp 1.200.000") everywhere.

### [UX-NIT] Customers with raw numeric names clutter the home list
- **Where:** Step 2 / CrmHome ("UAT-Sub-Test-1782395598604") — leftover prior-run seed data.
- **Why it matters (POS lens):** A row named like a code looks like junk and makes me distrust the list.
- **Suggested fix:** Seed cleanup (data, not code); confirm real customers always have a human-name fallback so a blank/auto name can never render as a raw ID.

### [UX-NIT] Invisible hub page errors (duplicate-key / DOM-nesting) — risk of contact rows duplicating or dropping
- **Where:** Steps 4, 5, 7, 20 (console-errors.log) — reproducible for manager + admin.
- **What:** React "two children with the same key (https://wa.me/6281234560099)", `<div>` inside `<p>` nesting, missing dialog `aria-describedby`, Recharts width(-1) warnings.
- **Why it matters (POS lens):** I don't see the console, but a duplicate key can duplicate/omit children — a contact icon could double up or vanish in production.
- **Suggested fix:** Use a stable unique key (not the wa.me URL) for contacts; fix badge-inside-`<p>` nesting; add a Description to the dialog; give the chart container a min height.
