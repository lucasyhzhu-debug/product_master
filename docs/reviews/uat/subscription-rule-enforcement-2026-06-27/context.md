# UAT Context — Subscription Phase E · Slice 2 (rule enforcement)

- **Run-id:** subscription-rule-enforcement-2026-06-27
- **Timestamp:** 2026-06-27
- **App URL:** http://localhost:5175 (local dev — `npx convex dev` + `npm run dev`)
- **Role / login:** E2E-Manager, PIN 999999 (role: manager), PIN-based avatar-grid login
- **Browser:** Playwright chromium, headless, viewport 1440×900 (desktop) + 390×844 (mobile pass)

## Spec summary
Phase E Slice-2 enforces supply-agreement clauses 3/4/5/10: a per-day **13:00 cutoff lock**
(warn-only in the UI — heads-up, not an edit lock), an **above-baseline supplier-confirmation
flag** (warn-only badge), an effective-dated **+14d permanent baseline change**, and an
effective-dated **+30d termination** that stops future weeks. Confidential partner pricing must
never appear on staff order screens (D11 strip).

## Seed / fixtures
- Customer **UAT Cafe B2B** (`j97dq4jjy6xgxg2qp8be485vfx89cpgb`), 2 subscriptions:
  - **Morning Bundle A** (`zh78wkzfhrfe3xhg5rvjtv8c5989ds0j`) baseline 5
  - **Afternoon Bundle B** baseline 3
- Pre-seeded journey-A fixture week (PLANNED, weekStart=1782666000000): Mon pre-locked
  (past-cutoff), Tue qty 8 (above baseline 5 → needs supplier confirmation).
- Partner unit price for Morning Bundle A = Rp 75,000/unit (visible in schedule header).

## Scope checklist
- [x] 1. CRM home → customer record hub (regression: links resolve, no console errors)
- [x] 2. Schedule page (PLANNED fixture): planned badge; Mon cutoff warn + Add-product still
      enabled; Tue above-baseline supplier badge; LIVE write-path (bump Wed qty>baseline + Save
      → badge appears); negative check (current week = delivering/locked, no spurious cutoff warn)
- [x] 3. Settings dialog: schedule +14d baseline change (accept 7 / reject 0); 30-day termination
      notice → confirm → status terminating + button disabled; loading/error states (D12)
- [x] 4. Mobile-viewport nav check (schedule + settings dialog)

## Pass result
Single navigation pass completed. **0 console errors, 0 network failures.** All 13 capture
points produced screenshots. One mobile-layout warn (7-col grid overflows 390px viewport).

## Provenance legend (for personas — they are blind to this; orchestrator tags in consolidation)
- `[slice-new]` cutoff warning, supplier-confirmation badge, SubscriptionSettingsDialog,
  "Manage subscription" trigger, dayFlags wiring.
- `[slice-touched]` DayPlanCell, WeekCalendarGrid, SubscriptionSchedulePage, CustomerDashboard.
- `[pre-existing]` CRM home, customer hub, activity timeline, agreement/invoice/ledger,
  existing grid editing mechanics, orders surfaces, global layout.
