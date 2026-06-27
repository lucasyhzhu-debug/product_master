# Flow Log — Subscription Phase E · Slice 2 (rule enforcement)

Single navigation pass, manager (E2E-Manager) on http://localhost:5175. Evidence pack for the
two persona evaluators. Global capture: **0 console errors**, **0 network failures** across the
whole pass (see `console-errors.log`, `network-failures.log`).

---

## Step 1 — CRM regression — /crm (CRM home)
- **Action:** Logged in as E2E-Manager (PIN), navigated to /crm.
- **Expected:** CRM home renders dashboard (needs-funding + active subscriptions table), links resolve, no errors.
- **Observed:** h1 = "CRM", subtitle "Customer relationship management". Cards: "NEEDS FUNDING 0 weeks pending", "ACTIVE SUBSCRIPTIONS 6 subscriptions", "All caught up — No weeks awaiting payment or invoice right now." Active-subscriptions table lists rows incl. `UAT Cafe B2B → Morning Bundle A → Delivering` and `UAT Cafe B2B → Afternoon Bundle B → Closed`. Renders cleanly.
- **Screenshot:** screens/01-crm-home.png
- **Console:** none
- **Network:** none
- **Load:** snappy
- **State:** ok

## Step 2 — CRM regression — /crm/customers/:id (customer record hub)
- **Action:** Navigated to customer record for UAT Cafe B2B.
- **Expected:** Hub renders; subscriptions listed as links; per-subscription "Manage subscription" trigger present; no confidential price leak inappropriate to a manager surface.
- **Observed:** h1 = "UAT Cafe B2B". Both "Morning Bundle A" and "Afternoon Bundle B" visible. 6 in-page `/crm/` links resolve. Partner-price string "75,000" IS present on this page (manager CRM hub) — 65,000 not present. (Note: this is a manager-only CRM surface, not a staff order screen; personas to judge whether the partner price exposure is appropriate per D11.)
- **Screenshot:** screens/02-customer-hub.png
- **Console:** none
- **Network:** none
- **Load:** snappy
- **State:** ok

## Step 3 — Schedule (PLANNED fixture) — /…/subscriptions/:id/week?weekStart=1782666000000
- **Action:** Opened the pre-seeded journey-A fixture week (PLANNED).
- **Expected:** Status badge "planned"; grid editable; cutoff warning on Mon; supplier badge on Tue.
- **Observed:** Header "Schedule Calendar", week status Badge = "**Planned**". Both the "past 13:00 cutoff" warning and the "needs supplier confirmation" badge are present somewhere in the grid. Header also shows "Partner price: Rp 75.000 / unit" (manager CRM surface).
- **Screenshot:** screens/03-schedule-planned-week.png
- **Console:** none
- **Network:** none
- **Load:** ~4.5s settle (Convex reactive)
- **State:** ok

## Step 3.1 — Monday cutoff — warn-not-lock invariant
- **Action:** Inspected the Monday column (pre-locked / past-cutoff day).
- **Expected:** Amber "past 13:00 cutoff" warning shows, AND Monday's "Add product" button stays ENABLED (cutoff is a heads-up, not an edit lock).
- **Observed:** Monday column shows "past 13:00 cutoff" = true; the "Add product" button under it is ENABLED = true. Invariant holds — warn does not lock editing.
- **Screenshot:** screens/04-monday-cutoff-cell.png
- **Console:** none
- **Network:** none
- **Load:** instant
- **State:** ok

## Step 3.2 — Tuesday — above-baseline supplier-confirmation badge
- **Action:** Inspected the Tuesday column (qty 8 vs baseline 5).
- **Expected:** Orange "needs supplier confirmation" badge shows on Tuesday.
- **Observed:** Tuesday cell text: `TUE 30 Jun · needs supplier confirmation · Original · Rp 600.000 · Day total Rp 600.000 · Add product`. Orange badge present = true. (Day total Rp 600.000 = 8 × Rp 75.000.)
- **Screenshot:** screens/05-tuesday-supplier-badge.png
- **Console:** none
- **Network:** none
- **Load:** instant
- **State:** ok

## Step 4 — LIVE write-path — bump Wed qty above baseline + Save
- **Action:** On the editable Wed column (at baseline qty 5), changed qty to 8 and clicked "Save plan".
- **Expected:** After save, the day shows the orange "needs supplier confirmation" badge (exercises the enforcement write path, not just the fixture).
- **Observed:** Before save Wed had NO supplier badge (badge before = false). Toast on save = "**Plan saved.**". After Convex reactive refresh, Wed shows "needs supplier confirmation" = true. Write path correctly recomputes the above-baseline flag on save. Pre-save state captured in screens/06-wed-qty-bumped-presave.png.
- **Screenshot:** screens/07-wed-after-save.png
- **Console:** none
- **Network:** none
- **Load:** ~4.5s save round-trip
- **State:** ok

## Step 5 — Negative check — current week (no weekStart param)
- **Action:** Navigated to the schedule with NO weekStart (defaults to current WIB week, which is seeded + locked).
- **Expected:** Status "delivering"/locked; NO spurious "past 13:00 cutoff" warning (fix suppresses it on already-locked grids).
- **Observed:** Status badge = "**Delivering**". Spurious "past 13:00 cutoff" warning = FALSE (correctly suppressed). Locked notice present ("…cannot be edited… or use 'Amend week'"). Suppression-on-locked-grid invariant holds.
- **Screenshot:** screens/08-current-week-default.png
- **Console:** none
- **Network:** none
- **Load:** ~4.5s settle
- **State:** ok

## Step 6 — Settings dialog — open (Manage subscription)
- **Action:** From the customer hub, clicked the "Manage subscription" (gear) trigger on the first subscription (Morning Bundle A).
- **Expected:** SubscriptionSettingsDialog opens with baseline-change form + termination button.
- **Observed:** 2 "Manage subscription" triggers found (one per subscription). Dialog title "Manage subscription / Morning Bundle A". Contains "New baseline daily qty" input + "Change baseline (effective in 14 days)" button + a "Give 30-day termination notice" button. Both controls present.
- **Screenshot:** screens/09-settings-dialog-open.png
- **Console:** none
- **Network:** none
- **Load:** instant
- **State:** ok

## Step 6.1 — Baseline reject path — qty 0
- **Action:** Entered 0 in the baseline input and submitted.
- **Expected:** Must NOT submit (0 / empty / non-integer rejected).
- **Observed:** Dialog stayed open (input still present) = true. No success toast (toast = null). Submission correctly blocked client-side. NOTE: rejection is silent — no inline validation message / error text shown to explain why nothing happened.
- **Screenshot:** screens/10-baseline-reject-zero.png
- **Console:** none
- **Network:** none
- **Load:** instant
- **State:** ok

## Step 6.2 — Baseline accept path — qty 7 (+14d staged change)
- **Action:** Entered 7 and submitted.
- **Expected:** Stages a pending change effective ~+14 days; confirmation feedback.
- **Observed:** Toast = "**Baseline change scheduled (effective in 14 days).**". Dialog closed on success = true. Pre-submit state in screens/11-baseline-accept-pre.png. NOTE: feedback is the toast only; the hub does not surface a persistent "pending change effective <date>" indicator after the dialog closes — the staged change is not visible anywhere on the customer record afterward.
- **Screenshot:** screens/12-baseline-accept-result.png
- **Console:** none
- **Network:** none
- **Load:** ~4s round-trip
- **State:** ok

## Step 7 — Termination — 30-day notice + confirm + disabled-after
- **Action:** Opened "Manage subscription" for Afternoon Bundle B → "Give 30-day termination notice" → "Confirm termination notice".
- **Expected:** Confirm step appears; on confirm, status flips to "terminating", endDate ≈ now+30d; termination button then DISABLED.
- **Observed:** Confirm step shown = true with copy "This will schedule the subscription to end in 30 days and set its status to **terminating**. This cannot be undone." Toast = "**30-day termination notice given.**". Re-opened hub: "terminating" status shown = true. Re-opened dialog: termination button DISABLED = true (already terminating). Full flow correct.
- **Screenshot:** screens/15-terminate-result.png (confirm step: screens/14-terminate-confirm-step.png; disabled-after: screens/16-terminate-disabled-after.png)
- **Console:** none
- **Network:** none
- **Load:** ~4s round-trip
- **State:** ok

## Step 8 — Mobile viewport — schedule page (390×844)
- **Action:** Reloaded the PLANNED fixture schedule at 390px width.
- **Expected:** Responsive — no overflow/clipping that blocks the journey.
- **Observed:** `scrollWidth=450` vs `clientWidth=390` → **horizontal overflow = true**. The 7-column `grid-cols-7` calendar does not reflow on narrow screens; columns are squeezed and the page scrolls sideways. Journey is still reachable (scrollable) but cramped.
- **Screenshot:** screens/17-mobile-schedule.png
- **Console:** none
- **Network:** none
- **Load:** ~4.5s settle
- **State:** warn

## Step 8.1 — Mobile viewport — settings dialog (390×844)
- **Action:** Opened the "Manage subscription" dialog at 390px.
- **Expected:** Dialog fits, no overflow.
- **Observed:** `scrollWidth=390 == clientWidth=390` → no overflow. Dialog (max-w-md) adapts cleanly to mobile.
- **Screenshot:** screens/18-mobile-settings.png
- **Console:** none
- **Network:** none
- **Load:** instant
- **State:** ok
