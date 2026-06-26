# UAT-FINDINGS — Phase D CRM surface (operate & read)

> **UPDATE 2026-06-26 — punch-list fixed + re-verified live** (branch `fix/crm-dedupe-ledger-index`). `npm run build` ✓, lint ✓, tsc (fe+convex) ✓, and a focused re-verification spec (`tests/e2e/uat-phase-d-crm-verify.spec.ts`, evidence in `verify/`) asserts each fix:
> - **[BLOCKER] not-found crash** → FIXED: `getCustomerRecord`/`getAgreement`/`getCustomerDrawdown`/`getSubscription` now use `v.string()`+`normalizeId`→null; bad id renders "Customer not found", no crash.
> - **[BUG] ledger BY raw user id** → FIXED: resolved to actor name ("Lucas") in `getCreditLedgerStatement`.
> - **[BUG] ledger link raw-id text** → FIXED: links now show order/invoice numbers ("INV-UAT-2606-001", "Order UAT-001").
> - **[BUG] DOM-nesting + duplicate React key** → FIXED: `<p>`→`<div>` in FinancialPane; ContactLinks deduped by href. Console asserted clean (also cleared the Recharts size warning via `DrawdownChart` explicit height).
> - **[UX-HIGH] hub↔funding contradiction** → FIXED: new `crm/funding:getUnpaidSubscriptionInvoices`; funding dashboard now shows an "Unpaid invoices" card + section (no false "All caught up").
> - **[UX-HIGH] hub unpaid invoice inert** → FIXED: each unpaid invoice renders as a named row linking to `/invoices/:id`.
> - **[UX-HIGH] breadcrumbs generic "Customer"** → FIXED: agreement/subscription pages resolve the customer name (A2).
> - **[UX-NIT] dialog aria-describedby** → FIXED (DialogDescription added). **[UX-NIT] Agreement raw-id label** → FIXED on hub + agreement page ("Supply Agreement"); SubscriptionPage's supply-agreement link still shows the id tail (minor remainder).
> - **Remaining nits (not fixed):** money-format Rp vs IDR in timeline; possible duplicate WhatsApp-drafted timeline rows; "Balance resets" wording; edit dialog still has no separate Phone field (the displayed "Phone (WhatsApp)" + "WhatsApp" are now deduped when identical). Coverage gaps unchanged (order slide-over not visually opened; mark-paid→fund not exercised).


- **Run-id:** `phase-d-crm-2026-06-26` · **Captured:** 2026-06-26 · **Surface:** `/crm` (manager+admin)
- **Roles:** manager (E2E-Manager) primary · admin (E2E-Admin) hub · order_staff (E2E-OrderStaff) negative · **Env:** dev Convex `exciting-fennec-671` + Vite :5173
- **Build:** worktree `fix/crm-dedupe-ledger-index` (Phase D CRM = PR #202 `f78c0037` on main + index hotfixes #203/#204)
- **Evidence:** `flow-log.md` (23 steps), `screens/` (20 PNGs), `console-errors.log`, `network-failures.log` (none), `steps.json`, `dumps/`
- **Personas (independent):** `findings-pos-user.md` (Bu Sri, non-technical operator) · `findings-crm-expert.md` (senior CRM practitioner)

## Executive summary — verdict: **NOT READY (narrowly)** — small, cheap punch-list before operate-use

Phase D's **core CRM operate-and-read journeys all work and the money surfaces are well-built.** The prior run's two BLOCKERs are gone: the **credit gauge is now real** (per-subscription derived pool, integer IDR — prior `(T26)` placeholder RESOLVED), and subscription *creation* was always out of Phase-D scope. The **subscription credit-ledger statement is exemplary** (signed deltas, week-scoped running balance, reset disclaimer, links), the **drawdown selector proves per-sub data with no roll-up**, the **timeline taxonomy + 14d window + Load-older** are clean, **Draft-WhatsApp is honest** (prefilled wa.me, no false "sent", logs an activity), and **access control is correct** (order_staff redirected off `/crm` and the deep-link, no crash).

It falls short of READY on a small, mostly-cheap set: (1) a **non-existent customer id crashes to a full-page error boundary** instead of a friendly not-found (the spec explicitly required this state); (2) the **money ledger still shows raw Convex user IDs in the "BY" column** (recurring, trust-critical on a money statement); (3) the **hub dunns "1 invoice unpaid" while the Funding Dashboard says "All caught up"** — two surfaces disagree about whether money is owed. Around these sit a recurring DOM-nesting/duplicate-key console cluster on the hub and pervasive **raw-ID-as-link-text** (A1) + generic breadcrumbs (A2). None block the happy path; all are fixable quickly, then re-verify.

### Severity counts (consolidated, deduped)
| Severity | Count |
|----------|-------|
| BLOCKER  | 1 |
| BUG      | 5 |
| UX-HIGH  | 4 |
| UX-NIT   | 6 |
| **Total**| **16** |

Per persona (pre-dedup): POS-user 1 BLOCKER / 3 BUG / 3 UX-HIGH / 3 UX-NIT (10); CRM-expert 0 BLOCKER / 4 BUG / 6 UX-HIGH / 3 UX-NIT (13).

---

## BLOCKER

### [BLOCKER] Not-found customer crashes to a full-page error boundary — BOTH
- **Where:** Step 15 (screens/15-not-found-customer.png), console-errors.log
- **What:** `/crm/customers/<bad-id>` shows "Something went wrong loading this page. / Please reload." `getCustomerRecord` declares `customerId: v.id("customers")`, so a malformed/missing id throws `ArgumentValidationError → Server Error`, caught by `ChunkErrorBoundary`. The spec (Scope §2) requires a friendly EmptyState. (POS: BLOCKER — "app looks broken on a stale link"; CRM: BUG/D12. Consolidated BLOCKER — the rubric counts "a surface crashes," and a stale bookmark is everyday.)
- **Fix:** Accept `v.string()` + defensive `db.get` returning `null` for malformed/missing; render an EmptyState with a link back to `/crm`. Mirror for subscription/agreement deep-links. (Pitfall #19 / lesson_convex_error_masking — plain throw = opaque Server Error.)

## BUG

### [BUG] Ledger "BY" column shows raw Convex user IDs, not names — BOTH · recurring (prior #6)
- **Where:** Step 12 (screens/12, dump 12) — `mn7619tbcw44tmvys0a…`; the timeline resolves the same actor as "Lucas" (Step 8).
- **Why:** money attribution (C10) must say WHO moved credit; inconsistent with the timeline (B6).
- **Fix:** resolve `byUserId → user.name` in the ledger query (reuse the timeline projection); fall back to "System (seed)".

### [BUG] Timeline credit top-up rows show a raw subscription id as the subject — BOTH · recurring (prior #7)
- **Where:** Step 8 (dump 08) — "Credit top-up … subscription zh78wkzfhrfe…" vs order/invoice rows that resolve names.
- **Why:** leaked raw id, unreadable, inconsistent within one feed (A1/B6).
- **Fix:** project the subscription label + deep-link into ledger/finance activity rows.

### [BUG] DOM-nesting: Badge `<div>` inside `<p>` — hydration error on the hub — BOTH · recurring (prior #8)
- **Where:** Steps 4 & 20 (screens/04, /20), console-errors.log — `FinancialPane`→`LinkWithRef`→`<p>`→`<Badge>`, role-independent.
- **Why:** hydration-class error on the most-used CRM surface; masks real console errors.
- **Fix:** render the status Badge as a `<span>` / move it out of the `<p>`.

### [BUG] Duplicate React key — `wa.me/<phone>` reused as a list key — BOTH · NEW
- **Where:** Steps 4/5/7/20, console-errors.log — "two children with the same key, https://wa.me/6281234560099".
- **Why:** non-unique keys let React duplicate/drop children on the identity pane.
- **Fix:** key contact rows by a stable unique field, not the derived URL.

### [BUG] Edit dialog can't reach the "Phone" field shown on the hub — BOTH · partial-recurring (prior #5)
- **Where:** Step 5 (screens/05, dump 05) vs Step 4 (dump 04) — hub shows "Phone (WhatsApp)" + "WhatsApp"; dialog exposes only WhatsApp; seed sets both `phone`+`whatsapp`.
- **Why:** a displayed-but-uneditable field is a trap; or the hub shows a phantom duplicate contact.
- **Fix:** add a Phone field, or collapse the two so displayed == editable.

## UX-HIGH

### [UX-HIGH] References render as raw ID fragments instead of named links (A1) — BOTH
- **Where:** Steps 4/11/12 — "Agreement ···89dkf8", "Subscription ···89ds0j", ledger "Invoice ···89c0g0"/"Order ···89cmp0"; human number (INV-UAT-2606-001) only in the NOTE column.
- **Fix:** label links from the business identifier (invoice/order number, subscription label, agreement title).

### [UX-HIGH] Breadcrumbs don't resolve the named object trail (A2) — BOTH · recurring (prior #14)
- **Where:** Step 11 ("CRM › Customer › Agreement"), Steps 12/13 ("CRM › Customer › Subscription") — generic middle crumb; the hub resolves the name correctly.
- **Fix:** resolve to "CRM › UAT Cafe B2B › Morning Bundle A", customer crumb linking to the hub.

### [UX-HIGH] Hub "1 invoice unpaid" is inert — no number, no link (A1/A4) — CRM-EXPERT
- **Where:** Step 4 (screens/04, dump 04) — count only + action buttons; the invoice (INV-UAT-2606-003) isn't named or linked.
- **Fix:** list each unpaid invoice as a row (number + amount + due date) linking to the invoice page.

### [UX-HIGH] Cross-surface contradiction: hub "1 invoice unpaid" vs Funding "All caught up" — BOTH · NEW
- **Where:** Step 4 (dump 04) vs Step 14 (screens/14) — funding is keyed on *weeks*, so the unpaid mid-week-amendment invoice never surfaces there.
- **Why:** the surface built to action funding hides an outstanding invoice the hub is dunning; an operator trusting the dashboard concludes nothing is owed.
- **Fix:** surface unpaid invoices (incl. amendments) on the funding dashboard, or scope the hub action to week-level so both read the same derived set. Don't say "All caught up" while an invoice is unpaid.

## UX-NIT
- **[UX-NIT] Recharts width(-1)/height(-1) on first paint** (CRM) — Steps 4/7/20; set `minHeight`/`aspect`.
- **[UX-NIT] Edit dialog missing `aria-describedby`/Description** (BOTH · recurring prior #17) — Step 5; add `<DialogDescription>`.
- **[UX-NIT] Inconsistent money format "Rp 1.200.000" vs "585.000 IDR"** (POS) — gauge/ledger vs timeline; standardize on "Rp …".
- **[UX-NIT] Possible duplicate "Drafted WhatsApp payment reminder" rows** (CRM, low-confidence) — Step 8; confirm one activity per action.
- **[UX-NIT] "Balance resets at the start of each week" may read as money lost** (carry · prior #18) — Step 12; reword to clarify rollover.
- **[UX-NIT] Leftover prior-run customers with raw numeric names clutter the list** (POS, data not code) — Step 2; reseed clean + ensure a human-name fallback.

---

## Mandatory regression cross-check — all 19 prior findings (`crm-onboarding-2026-06-25`)

| # | Prior finding | Sev | Status in this build |
|---|---------------|-----|----------------------|
| 1 | No UI to create a subscription | BLOCKER | **OUT OF SCOPE** — Phase D is operate/read, not creation. Carried gap (confirmed by run-spec). |
| 2 | Credit gauge is unbuilt "(T26)" placeholder | BLOCKER | ✅ **RESOLVED** — Step 4 renders the per-sub derived pool (Rp 1.200.000 of Rp 2.175.000). |
| 3 | Weekly invoice shows no bank account | BUG | ⚠️ **NOT RE-TESTED** — weekly-invoice page not opened this run. Carry; verify in follow-up. |
| 4 | False "Invoice sent" timeline events | BUG | ✅ **RESOLVED (by design)** — `invoice_sent` now derives from `generatedAt`; reads truthfully for the recent cycle (documented limitation). Not re-flagged. |
| 5 | Edit dialog can't reach phone/name/defaultAddress | BUG | 🟡 **PARTIAL** — name/whatsapp/email/IG/addresses/notes now editable; **Phone still missing** (see BUG above). |
| 6 | Ledger "BY" raw Convex user IDs | BUG | ❌ **STILL OPEN** (see BUG above). |
| 7 | Timeline raw subscription document ID | BUG | ❌ **STILL OPEN** (see BUG above). |
| 8 | DOM-nesting / hydration error on dashboard | BUG | ❌ **STILL OPEN** (see BUG above). |
| 9 | No create-customer affordance in /crm | UX-HIGH | ⚠️ **NOT RE-TESTED / likely OUT OF SCOPE** — carried. |
| 10 | /crm not discoverable (absent from nav) | UX-HIGH | ⚠️ **NOT VERIFIED** — navigated by URL; nav-presence (Header/MobileBottomNav under Config/More) not confirmed this run. Verify. |
| 11 | Contact phone/address invisible on identity card | UX-HIGH | ✅ **RESOLVED** — Step 4 shows addresses + contact links (seed had full fields). |
| 12 | Populated IDENTITY card is a blank box (no empty state) | UX-HIGH | ⚠️ **NOT REPRODUCED** — seed has full identity; empty-identity state not exercised. Carry. |
| 13 | Agreement page not linked from the hub | UX-HIGH | ✅ **RESOLVED** — Step 4 hub identity shows an Agreement link. |
| 14 | Breadcrumbs say generic "Customer" | UX-HIGH | ❌ **STILL OPEN** (see UX-HIGH above). |
| 15 | After funding, dashboard doesn't reflect the week | UX-HIGH | 🟡 **PARTIAL/UNVERIFIED** — gauge now renders; mark-paid→fund not exercised this run (coverage gap #2). |
| 16 | Mobile bottom nav overlaps table; columns cut | UX-HIGH | ✅ **LIKELY RESOLVED/IMPROVED** — Step 3 mobile readable, bottom nav clears the table, no obvious overlap. Verify on device. |
| 17 | Settings dialog missing aria-describedby | UX-NIT | ❌ **STILL OPEN** (see UX-NIT above). |
| 18 | "Balance resets" wording may read as money lost | UX-NIT | ❌ **STILL OPEN** — wording unchanged (Step 12). |
| 19 | No per-customer "what's next" surface | UX-NIT | ❌ **STILL OPEN** — no due/tasks panel observed. Carry. |

**Prior-run roll-up:** 4 RESOLVED (#2, 11, 13, 16) + 1 resolved-by-design (#4) · 2 PARTIAL (#5, 15) · 6 STILL OPEN (#6, 7, 8, 14, 17, 18, 19) · 4 out-of-scope/not-retested (#1, 3, 9, 10, 12). Both prior BLOCKERs cleared (one fixed, one out-of-scope).

---

## Coverage gaps (not a pass for these — see context.md)
1. **Order slide-over / OrderDetail full page not visually opened** (kanban cards use onClick, not href). The customer→CRM link href was found in-DOM and exists in code in `KanbanCard.tsx:153`, `OrderSlideOver.tsx:353`, `OrderDetail.tsx:268` — parity code-confirmed, not screenshot-confirmed.
2. **Mark-paid → fund end-to-end not exercised** (mutation skipped to preserve seed; funding dashboard was empty). Worth a focused click-through given the hub/funding contradiction.
3. **Agreement file "Open"** resolves a placeholder, not the real PDF (seed limitation).
4. **CRM nav discoverability** (prior #10) and **weekly-invoice bank-details** (prior #3) not re-tested.

## Recommended punch-list before operate-use (small)
1. Fix the **not-found crash** → friendly EmptyState (BLOCKER).
2. Resolve **ledger BY → user name** (BUG, money-trust, recurring).
3. Reconcile **hub vs funding** unpaid-invoice contradiction (UX-HIGH, money-safety).
4. Fix the **DOM-nesting + duplicate-key** console cluster (BUG).
5. Batch the rest (raw-ID link text, breadcrumbs, phone field, a11y, wording) as fast follow-ups, then re-verify.
