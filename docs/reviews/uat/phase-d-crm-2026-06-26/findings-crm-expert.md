# Phase D CRM — UAT findings (uat-crm-expert lens)

**Summary:** 0 BLOCKER · 4 BUG · 6 UX-HIGH · 3 UX-NIT

## What conforms well
- **C10 (money traceable) — exemplary subscription ledger** (screens/12): signed deltas, week-scoped running balance, integer IDR, per-row order/invoice link, reset disclaimer; Issued−Consumed=Remaining reconciles exactly (2.175.000−975.000=1.200.000). Strongest surface in the build.
- **C10 / no-roll-up** — per-subscription credit gauge on the hub and a per-sub drawdown chart selector; no summed pool.
- **B5/B6 (event log + shared taxonomy)** — clean derived timeline, latest-on-top, one icon+color per category, filter chips, human actor names ("· Lucas").
- **C9** — 14-day window + "Load older" works.
- **D11 (access)** — order_staff redirected off `/crm` and customer deep-link, no crash; hub identical for manager/admin (server-resolved).
- **D12 (empty states)** — CrmHome and Funding Dashboard both have designed "All caught up" states.
- **A4** — agreement↔subscription link is genuinely bidirectional. **A3** — hub is a router, not a scroll-dump.

---

### [BUG] Not-found customer crashes the page instead of a designed not-found state
- **Where:** Step 15 (screens/15), console-errors.log
- **What:** `/crm/customers/<bad-id>` → full-screen `ChunkErrorBoundary` crash. `getCustomerRecord` declares `customerId: v.id("customers")`, so a malformed id throws `ArgumentValidationError → Server Error`. No designed not-found state.
- **Why it matters (D12):** every CRM surface needs a designed error/not-found state; a stale bookmark or deleted-customer link takes the operator to an unrecoverable crash with no way back. Recurs the "plain throw = opaque Server Error" pattern (Pitfall #19 / lesson_convex_error_masking).
- **Suggested fix:** Accept `v.string()`, `db.get` defensively, return `null` for malformed/missing; render an `EmptyState` with a link to `/crm`. Mirror for subscription/agreement deep-links.

### [BUG] Invalid HTML nesting (Badge `<div>` inside `<p>`) — hydration error on the hub
- **Where:** Steps 4 & 20 (screens/04, /20), console-errors.log
- **What:** `<Badge>` (a `<div>`) nested in a `<p>` in the subscription card (`FinancialPane`→`LinkWithRef`→`<p>`→`<Badge>`). Reproducible, role-independent.
- **Why it matters (D12/quality):** hydration-class error on the most-used CRM surface; risks mismatched hydration and buries real console errors. (Recurring from prior run finding #8.)
- **Suggested fix:** Render the status Badge as a `<span>` or move it out of the `<p>` into a flex `<div>`.

### [BUG] Duplicate React key — `wa.me/<phone>` reused as a list key
- **Where:** Steps 4/5/7/20, console-errors.log
- **What:** "Encountered two children with the same key, `https://wa.me/6281234560099`" — a derived deep-link URL is used as a non-unique React key on the contact list.
- **Why it matters (data integrity):** non-unique keys let React duplicate/drop children unpredictably on the identity pane.
- **Suggested fix:** Key contact rows by a stable unique field, not the derived URL.

### [BUG] Settings/edit dialog cannot reach the "Phone" field shown on the hub
- **Where:** Step 5 (screens/05, dump 05) vs Step 4 (dump 04)
- **What:** Hub lists "Phone (WhatsApp)" and "WhatsApp" as two distinct contacts and seed sets both `phone`+`whatsapp`, but the edit dialog exposes only a WhatsApp input. `phone` doesn't round-trip.
- **Why it matters (data completeness):** an edit dialog must round-trip every displayed CRM field, or operators can't correct a value they can see (or the hub is showing a phantom duplicate contact). (Recurring/partial from prior #5.)
- **Suggested fix:** Add a Phone field, or collapse "Phone (WhatsApp)"/"WhatsApp" into one so displayed == editable.

### [UX-HIGH] References render as raw ID fragments instead of named links
- **Where:** Steps 4/11/12 (screens/04, /11, /12)
- **What:** Link text is truncated raw doc IDs: "Agreement ···89dkf8", "Subscription ···89ds0j", ledger "Invoice ···89c0g0", "Order ···89cmp0". The human identifier (INV-UAT-2606-001, "Morning Bundle A") appears only in the free-text NOTE column; the agreement and linked subscription have no human name on their own pages.
- **Why it matters (A1):** references must be links using a human name/number, never an opaque ID — an operator can't tell which invoice "···89c0g0" is.
- **Suggested fix:** Render link text from the business identifier (invoice number, order number, subscription label, agreement title).

### [UX-HIGH] Ledger "BY" column shows a raw user ID, contradicting the timeline's named actor
- **Where:** Step 12 (dump 12) vs Step 8 (dump 08)
- **What:** Every ledger row's BY = `mn7619tbcw44tmvys0a…`; the timeline renders the same actor for the same events as "Lucas". Same actor, two renderings.
- **Why it matters (A1 + cross-surface consistency, C10):** actor attribution on a money statement is where a name matters most; the timeline already resolves it correctly. (Recurring from prior #6.)
- **Suggested fix:** Resolve `byUserId → user.name` in the ledger query (reuse the timeline projection); fall back to "System (seed)".

### [UX-HIGH] Timeline credit top-up rows show a raw subscription id as the subject
- **Where:** Step 8 (dump 08)
- **What:** "Credit top-up" rows show subject `subscription zh78wkzfhrfe...` (raw id, not a link), while order/invoice rows correctly show "UAT Cafe B2B"/"INV-UAT-2606-003".
- **Why it matters (A1):** leaked raw id, unreadable, inconsistent within the same feed. (Recurring from prior #7.)
- **Suggested fix:** Project the subscription label + deep-link into ledger/finance activity rows.

### [UX-HIGH] Breadcrumbs don't resolve the named object trail
- **Where:** Step 11 ("CRM › Customer › Agreement"), Steps 12/13 ("CRM › Customer › Subscription")
- **What:** Child pages show a generic "Customer" middle crumb (not "UAT Cafe B2B") and a generic type leaf (not the object name). The hub itself resolves correctly.
- **Why it matters (A2):** breadcrumbs must mirror the object hierarchy with a full named trail; a deep-linked operator can't tell which customer/agreement they're on. (Recurring from prior #14.)
- **Suggested fix:** Resolve to "CRM › UAT Cafe B2B › Morning Bundle A", customer crumb linking to the hub.

### [UX-HIGH] Hub "1 invoice unpaid" is inert — no number, no link to the invoice
- **Where:** Step 4 (screens/04, dump 04)
- **What:** Unpaid block shows only the count + "Draft WhatsApp reminder"/"Mark paid → fund"; the invoice (INV-UAT-2606-003) isn't named or linked. No click-through.
- **Why it matters (A1/A4):** an unpaid invoice is a first-class object — it should be a named link with amount/due date and back-reference the customer/week; a bare count forces action on an invoice the operator can't open.
- **Suggested fix:** List each unpaid invoice as a row (number + amount + due date) linking to the invoice page, with per-row actions.

### [UX-HIGH] Cross-surface contradiction: hub "1 invoice unpaid" vs Funding Dashboard "All caught up"
- **Where:** Step 4 (dump 04) vs Step 14 (screens/14, dump 14)
- **What:** Hub dunning an unpaid invoice with "Mark paid → fund", but the Funding Dashboard shows AWAITING PAYMENT 0 / NEEDS INVOICE 0 / "All caught up". The unpaid mid-week-amendment invoice never surfaces there because funding is keyed on *weeks*, not *invoices*.
- **Why it matters (cross-surface / A4/B):** the surface built to action funding hides an outstanding invoice the hub is actively dunning; an operator trusting the dashboard concludes nothing is owed while money is in fact owed — a data-grain mismatch leaking to the UI.
- **Suggested fix:** Reconcile both surfaces — surface unpaid invoices (incl. amendments) on the funding dashboard, or scope the hub action to week-level so both read the same derived set. Don't claim "All caught up" while an unpaid invoice exists.

### [UX-NIT] Recharts renders at width(-1)/height(-1) on first paint
- **Where:** Steps 4/7/20, console-errors.log
- **What:** Repeated zero-size chart warnings; chart eventually paints. Risks flash/zero-size chart + console noise.
- **Suggested fix:** explicit `minHeight={280}`/`aspect`, or render after container measures.

### [UX-NIT] Edit dialog missing `aria-describedby` / Description
- **Where:** Step 5, console-errors.log. (Recurring from prior #17.)
- **Why it matters (D12 a11y):** screen-reader users get no dialog description.
- **Suggested fix:** add `<DialogDescription>`.

### [UX-NIT] Possible duplicate "Drafted WhatsApp payment reminder" timeline rows
- **Where:** Step 8 (dump 08) — two rows though the run drafted once in Step 6 (low confidence; distinct timestamps may be two genuine drafts).
- **Why it matters (B5):** a single action may log two activity rows.
- **Suggested fix:** confirm one `whatsapp_drafted` activity per action / de-dupe the projection.

## Watch / unverified (coverage gaps)
- **A4 ledger→order/invoice back-reference** verified one-way only; the order surface (slide-over/full page) never visually loaded (context gap #1) — confirm order/invoice pages back-reference the subscription week.
- **Mark-paid → fund** end-to-end not exercised (context gap #2); the contradiction finding makes a focused click-through worthwhile.
