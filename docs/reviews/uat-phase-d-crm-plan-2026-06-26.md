# UAT Run-Spec — Phase D CRM Surface

> **What this is.** The ready-to-run input for the `/persona-uat` harness (skill `.claude/skills/persona-uat/SKILL.md` → agent `uat-orchestrator` → personas `uat-pos-user` + `uat-crm-expert`). It is the test plan/script, not the harness. Drive the app ONCE through the Scope below; the orchestrator writes an evidence pack to `docs/reviews/uat/<run-id>/` then dispatches the two personas in parallel and consolidates `UAT-FINDINGS.md`.
>
> **Authored:** 2026-06-26, at the close of the Phase D CRM implementation (branch `worktree-feature+subscription-phase-d-crm`, HEAD after triple-review + /simplify). Build/type-check/full-suite all green.

---

## Harness inputs

| Field | Value |
|-------|-------|
| **App URL** | `https://frollie-product.vercel.app` (prod) — or local `http://localhost:5173` against `npx convex dev` if running pre-merge. |
| **Login** | Manager PIN (role `manager`). Also do a focused `admin` pass for the admin-only affordances; do a NEGATIVE `order_staff` pass to confirm `/crm/*` is blocked (route `canAccessCrm` = manager+admin) and that the order-surface customer link is a dead link (not a crash) for staff. |
| **Run-id** | `phase-d-crm-2026-06-26` (orchestrator writes to `docs/reviews/uat/phase-d-crm-2026-06-26/`). |
| **Personas** | A = `uat-pos-user` (non-technical operator: functional bugs + UX friction/jargon/missing-feedback/unclear-money). B = `uat-crm-expert` (CRM best practice + CLAUDE.md CRM Design Principles A1–D12). |
| **Env assumption** | LIVE env with seed data (below). The Convex CLI is network-blocked in the build sandbox, so the live run most likely happens **post-merge on `main` + dev/prod deploy**. If no live env is reachable, the orchestrator reports **"pending: needs live env"** — that is NOT a pass. |

### Spec summary (1 paragraph)
Phase D adds a manager+admin CRM surface for the subscription business under `/crm`: a home (needs-funding + active-subscriptions lists), a two-pane customer hub (identity + financial story with a derived **credit gauge**, subscriptions, unpaid invoices, and a **Draft WhatsApp reminder**), a merged **activity timeline** (14-day window, category filter, "Load older"), a supply-**agreement** page (upload + versions + link-to-subscription), a read-only **subscription** page with **week back-references** and a **credit-ledger statement**, a per-subscription **drawdown chart** with a subscription selector, and an operator **funding** dashboard. Money is first-class and traceable (signed deltas, running balance, integer IDR, derived-pool reads — never re-keyed). Every entity reference is a link; confidential fields are stripped server-side per role. Order detail surfaces (slide-over + full page) link the customer name into the CRM hub.

---

## Mandatory pre-step — regression cross-check against the prior run

**Before exercising the new scope, ingest the existing run** `docs/reviews/uat/crm-onboarding-2026-06-25/UAT-FINDINGS.md` (19 findings: 2 BLOCKER / 6 BUG / 8 UX-HIGH / 3 UX-NIT) and verify each against the current build. That run was captured against an **earlier** state of this branch, so several findings should now be **resolved** by this implementation — confirm or refute each, and carry forward anything still open. Known mapping to verify (do not assume — re-test live):

- **[BLOCKER] Credit gauge was an unbuilt "(T26)" placeholder** → T26 now renders the derived pool (`CreditGauge` reads `pool.creditRemaining`). **Expect RESOLVED.** Verify the funded credit actually surfaces on the hub after funding, with integer IDR and a click-through.
- **[BUG] Raw Convex IDs in the credit ledger / timeline** → partially addressed (ledger statement labels links). The timeline top-up row still renders `subscription <id>` in its detail string (known nitpick). **Verify and report if still operator-hostile.**
- **[BUG] False "Invoice sent" timeline events / event-time fidelity** → the timeline derives `invoice_sent` from `generatedAt` and `payment_funded` from `updatedAt`; an invoice generated >14d ago but paid in-window is intentionally NOT shown (documented limitation). **Verify the feed reads truthfully for a normal recent cycle.**
- **[BUG] Edit form can't reach the displayed contact fields / DOM-nesting console error** → re-verify the CRM-fields edit dialog round-trips every displayed field, and that the dashboard renders with a **clean console** (the prior run logged a DOM-nesting error on every dashboard).
- **[BLOCKER] No UI to create a subscription** → **STILL OUT OF PHASE-D SCOPE** (this phase is the CRM read/operate surface, not subscription creation). Note it as a carried-forward gap, not a Phase-D regression; seed a subscription for the run (below).

The orchestrator should fold the resolved/still-open status of these 19 into the new `UAT-FINDINGS.md` so coverage is provably complete, not restarted.

---

## Seed-data prerequisites

The prior run only succeeded because a `UAT Cafe B2B` customer with a subscription was seeded behind the scenes. There is **no `convex/subscriptions/_devSeed.ts`** yet — create a seed mutation (or set up the data manually via the dashboard Functions tab) producing at minimum:

1. **One B2B customer** with full CRM fields populated: name, key contact (name + role), `whatsapp` AND `phone` (so the Draft-WhatsApp button is enabled), `email`, `instagram`, delivery + store addresses, notes.
2. **A supply agreement** for that customer with both an **ID** and **EN** version file uploaded, status `active`, linked to a subscription (exercises agreement page + versions + open-file URLs + bidirectional link).
3. **≥2 subscriptions** for that customer (so the subscription selector on the drawdown chart and the per-subscription gauge have something to switch between — and to prove **no summed roll-up**).
4. **A current week** on at least one subscription with `plannedDays` set and a **creditLedger** populated: an opening **topup**, several **drawdown** entries across days, and a **mid-week amendment top-up** (this is the edge case the drawdown chart's per-day attribution handles — verify the chart and the ledger statement both read sensibly).
5. **≥1 unpaid invoice** (so the unpaid-invoices section + Draft-WhatsApp button + "Mark paid → fund" deep-link render), and at least one **paid** invoice (so the timeline shows `payment_funded`).
6. **Orders across statuses** for that customer (Draft → … → CompleteShipped/PickedUp) including subscription orders carrying `subscriptionWeekId` (so the drawdown delivered-pcs series and the order-surface customer link both populate).

Leave the prior run's leftover `UAT-Sub-Test-*` / `UAT Cafe B2B` dev customers in place or reseed cleanly — note which dataset was used in the run context.

---

## Scope — screens, routes, and states to exercise

Drive these in order. For EACH surface, explicitly exercise the **empty / loading / error** state (D12) where reachable, and check a **mobile viewport** (≤390px) for nav + layout.

1. **`/crm` — CrmHome.** Needs-funding list (sorted: invoiced first), active-subscriptions list. Every customer/subscription/week reference is a clickable link (A1). Summary counts match list lengths. Empty state when nothing needs funding. Status badges read from the shared palette (consistent with the funding dashboard).
2. **`/crm/customers/:id` — CustomerDashboard (the hub).** Two panes: identity (contact links open wa.me/mailto/IG correctly; key contact; addresses; notes; agreement link) and financial story. Verify:
   - **Credit gauge** (T26) per subscription — shows `creditRemaining` (integer IDR), a bounded fill bar, empty state when a sub's pool is null. (Prior BLOCKER — confirm resolved.)
   - **Subscriptions list** — each links to its subscription page; current-week label + status badge.
   - **Unpaid invoices** — count + "Mark paid → fund" deep-link + **Draft WhatsApp reminder** button.
   - **Draft WhatsApp reminder** — opens a wa.me deep-link with a prefilled dunning message (must NOT claim it was sent), AND logs a `whatsapp_drafted` activity (verify it then appears in the timeline). Disabled with a hint when no phone on file. Trigger a failure (e.g. offline) and confirm a friendly error toast, not a silent failure.
   - **"View activity timeline →"** now navigates to the real activity route (no longer a "coming in D2" pill).
   - **Settings** dialog round-trips every displayed CRM field (prior BUG — re-verify). **Console must be clean** (prior DOM-nesting error).
   - Quick action "Plan schedule" deep-links into the B scheduler.
   - **Not-found** state for a bad `:id` (friendly EmptyState, not a crash).
3. **`/crm/customers/:id/activity` — CustomerActivityPage + ActivityTimeline.** Latest-on-top, default 14 days. Category **type-filter** toggles rows server-side. Each row: icon disc (taxonomy), title, detail, actor, time; rows with a target are clickable into the object (`order`→`/orders/:id`, `invoice`→`/invoices/:id`, `subscription`→ its page, `agreement`→ agreements). **"Load older"** widens the window. Empty state (no activity), loading state, error/not-found state. Confirm the `funded` (✓) icon override actually renders on a payment event.
4. **`/crm/customers/:id/agreements` — AgreementPage + AgreementUpload.** Shows agreement(s) with ID + EN versions; **open each version** (signed storage URL resolves); upload a **new version** (uses its own upload URL, not businessSettings); **link to a subscription** (verify the back-reference appears on the subscription page — bidirectional A4). Empty state (no agreement). Error on a failed upload.
5. **`/crm/customers/:id/subscriptions/:subId` — SubscriptionPage (read-only).** Links to parent customer (breadcrumb A2). **Week back-references** (orders that drew down, funding invoice, ledger) each link out. **Credit-ledger statement**: signed delta + week-scoped running balance + reset disclaimer, integer IDR, click-through to invoice/orders/week. Week entries link to the week with `?weekId=` selection. Loading skeleton on the back-references (no blank flash). Empty/closed-week states.
6. **Drawdown chart + SubscriptionSelector** (on the dashboard). One subscription at a time via the selector — switching refetches and the **title names the selected subscription** and links to its page. Dual-axis: delivered (solid) + planned (lighter) bars on the left, credit-remaining line on the right, a **"today" divider**, and an **"Unspent credit"** flag when the week ends with leftover credit. **No summed roll-up** across subscriptions. Empty state (no current week / no points).
7. **`/crm/funding` — CrmFundingDashboardPage.** Needs-invoice vs awaiting-payment rows; **mark-paid → fund** flow end-to-end (toast, week locks, gauge/ledger update on return). Status palette consistent with CrmHome.
8. **Order-surface customer link (Pitfall #20 — BOTH surfaces).** Open an order in the **kanban slide-over** (`OrderSlideOver`) AND the **full page** (`OrderDetail`): the customer name links to `/crm/customers/:id` in both. Confirm parity. As `order_staff`, the link target is blocked by the route guard (dead link, not a crash).
9. **Nav + access.** CRM appears in the secondary/config nav (manager+admin) in both `Header` and `MobileBottomNav`. As `order_staff`, `/crm` and all `/crm/*` routes are blocked. Mobile-viewport navigation works.

---

## Severity rubric

**Functional**
- **BLOCKER** — the scoped journey cannot be completed in-app; data loss/corruption; a money figure is wrong; a surface crashes.
- **BUG** — a feature misbehaves, shows wrong/raw data (e.g. raw Convex IDs, mislabeled events), or a state (empty/loading/error) is missing or broken, but a workaround exists.

**Usability**
- **UX-HIGH** — confusing flow, jargon/task-ids leaking into UI, missing feedback (no toast/loading), unclear money (no currency, no balance context), or an A1–D12 principle violation that materially impairs an operator.
- **UX-NIT** — polish: spacing, wording, iconography, minor inconsistency.

Each finding: `severity` · `where` (route + screenshot) · `what` · `why it matters` (tie to a CRM principle where relevant) · `fix`. Personas judge independently from the same evidence pack; the orchestrator dedups and assigns the final consolidated severity.

## Exit verdict
READY / NOT READY for CRM operate-and-onboard use, with the consolidated severity counts and the carried-forward status of every prior-run finding. "pending: needs live env" if no live environment was reachable (not a pass).
