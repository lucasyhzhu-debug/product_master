# UAT-FINDINGS — Subscription Phase E · Slice 2 (rule enforcement)

**Run-id:** subscription-rule-enforcement-2026-06-27
**App:** http://localhost:5175 (dev `exciting-fennec-671`) · **Login:** E2E-Manager / manager
**Branch:** feature/subscription-rule-enforcement · **Verdict:** READY WITH UX FOLLOW-UPS
**Persisted by the main loop** — the orchestrator/personas were blocked by the write-guard from writing findings `.md`; consolidated output is reproduced here so nothing is dropped.

## Result
Single live navigation pass exercised all four enforcement mechanics end-to-end with **0 console errors, 0 network failures**. Every slice-new behavior worked:
- Week status badge "Planned" (fixture) / "Delivering" (current week).
- Monday cutoff: amber "past 13:00 cutoff" shows AND Add-product stays ENABLED (warn-not-lock holds).
- Tuesday qty 8 > baseline 5: orange "needs supplier confirmation" badge present.
- Live write-path: Wed 5→8 + Save → toast "Plan saved." → supplier badge appears (enforcement recomputes on write). Week total Rp 2.100.000 → Rp 2.325.000 (+3×75.000), money traceable.
- Negative: current/locked "Delivering" week shows NO spurious cutoff warning (suppression fix holds).
- Baseline change: rejects 0, accepts 7 → toast "Baseline change scheduled (effective in 14 days)."
- Termination: confirm → "30-day termination notice given." → status "terminating" → button disabled.

**Merge gate (per handoff §4): GREEN** — 0 `[slice-new]`/`[slice-touched]` BLOCKER/BUG, 0 regression caused by this slice.

## Severity × provenance
| | slice-new | pre-existing | total |
|---|---|---|---|
| BLOCKER | 0 | 0 | 0 |
| BUG | 0 | 1 | 1 |
| UX-HIGH | 5 | 3 | 8 |
| UX-NIT | 1 | 4 | 5 |

## Findings

### BUG
1. **[pre-existing, aggravated] Mobile schedule grid overflows viewport, clips money/badges** (BOTH) — screens/17-mobile-schedule.png. At 390px `grid grid-cols-7` doesn't reflow (scrollWidth 450>390): badge text truncates, "75.000" overlaps trash icon, day-total wraps, sideways scroll. Grid line unchanged by slice (git diff: only `dayFlags` props added); root pre-existing from Phase D, aggravated by new long badge text. → File issue; below a breakpoint stack one card per day, never clip money.

### UX-HIGH
2. **[slice-new] Staged +14d baseline change leaves no persistent record** (BOTH) — screens/12. After the toast the customer record looks identical: no pending-change chip, no effective date, no cancel. Only evidence is a 3s toast (B7 what's-next gap). → Persistent "Baseline 5 → 7, effective 11 Jul 2026" chip + cancel.
3. **[slice-new] "past 13:00 cutoff" warning is unexplained jargon** (POS) — screens/04. Amber + triangle, no sentence; operator can't tell it's a heads-up not a lock. → "Past today's 1 PM cutoff — you can still edit, but the supplier may already be packing this day."
4. **[slice-new] "needs supplier confirmation" badge has no action/owner/baseline context** (POS) — screens/05,07. → "Above your usual 5/day — we'll ask the supplier to confirm the extra 3"; tie to baseline.
5. **[slice-new] Terminated sub: disabled button with no reason; baseline button still active** (POS) — screens/16. → Replace disabled button with "This subscription is ending on 14 Jul 2026 (notice given 27 Jun)"; hide/disable the baseline form too.
6. **[slice-new] Termination shows "terminating" but never the effective end date** (BOTH) — screens/15. Status chip persists (good) but last-delivery date (now+30d) appears nowhere; row still shows old current-week range. → Show absolute end date with the badge in confirm step + row.
7. **[slice-new] "Manage subscription" reachable only via a tiny gear, colliding with a separate top "Settings"** (POS) — screens/02,09. → Visible labelled "Manage" button per subscription; rename top "Settings".
8. **[pre-existing] Schedule week page has no breadcrumb / up-links to subscription + customer** (CRM) — screens/03,17. Header never names "Morning Bundle A"/"UAT Cafe B2B" (A1/A2/A3). Header unchanged by slice. → Linked breadcrumb.
9. **[pre-existing] CRM home renders subscription Label as inert text, not a link** (CRM) — screens/01. Label column (primary entity) is plain text (A1). → Link the Label cell.

### UX-NIT
10. **[slice-new] Baseline reject uses native browser validation bubble, not designed inline error** (BOTH) — screens/10. Entering 0 → OS-native "Value must be ≥ 1" tooltip (English-only, transient) instead of styled inline (D12). → Inline field error in app style/language; disable submit until valid.
11. **[pre-existing] "Confirm → orders + invoice" uses arrow + shorthand** (POS) — screens/03. → "Confirm this week (creates orders & invoice)".
12. **[pre-existing] Accounting jargon — "drew down", "ledger", "top-up"** (POS) — screens/03,08. → Plain-language headings.
13. **[pre-existing] CRM home shows bare "—" for one subscription's current week** (POS) — screens/01. → "No active week".
14. **[pre-existing] Partner price on manager schedule/hub — appropriate, but staff D11 strip unverified this pack** (CRM) — screens/02,03. Partner price renders on the MANAGER surface (acceptable per brief). This pass only ran the manager role; the D11 negative case (staff strip + server-side route gate) is NOT covered here. → Confirm via staff-role pass / code that the schedule route is server-role-gated and `unitPrice` is omitted from staff order-screen payloads.

## Evidence pack
`docs/reviews/uat/subscription-rule-enforcement-2026-06-27/` — context.md, flow-log.md (13 steps), console-errors.log (none), network-failures.log (none), screens/ (00–18), _results.json.

## Notes
- Live-env fixture for journey A added via dev-only `convex/subscriptions/_devSeed.ts:seedCutoffFixture` (self-guards vs prod): seeds a PLANNED next-week for Sub 1 with Mon locked (cutoff warning) + Tue qty 8 (supplier badge).
