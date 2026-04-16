# Phase 74: Staff Attendance - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-04-16
**Phase:** 74-staff-attendance
**Areas discussed:** Clock-in/out UX, Attendance ↔ Production link, Monthly summary view, Clock-out correction

---

## Clock-in/out UX

### Q1: How should clock-in/out integrate with the kitchen app?

| Option | Description | Selected |
|--------|-------------|----------|
| Gate screen | After PIN login, staff hits a 'Clock In' screen before accessing the kitchen. Forces attendance tracking. Clock-out button in header once clocked in. | ✓ |
| Header widget | Small clock-in/out button in the existing DashboardHeader. Minimal disruption but staff could skip clocking in. | |
| Dedicated tab | New swipeable panel on the kitchen layout for attendance. Doesn't block kitchen access. | |

**User's choice:** Gate screen
**Notes:** Ensures no one works without clocking in. Preview-selected.

### Q2: Should the gate screen also authenticate (re-enter PIN), or is the login PIN sufficient?

| Option | Description | Selected |
|--------|-------------|----------|
| Login PIN is enough | Already PIN-authenticated at login. Clock-in is single tap — no re-auth. Matches ATT-01 "one-tap" requirement. | ✓ |
| Re-enter PIN to clock in | Extra verification. Prevents impersonation. Adds friction. | |

**User's choice:** Login PIN is enough

### Q3: What happens if staff navigates away while clocked in?

| Option | Description | Selected |
|--------|-------------|----------|
| Stay clocked in | Clock-in persists. Timer still running when they return. Clock-out is explicit. | ✓ |
| Auto clock-out after inactivity | After X minutes no app interaction, auto clock-out. Risks false clock-outs. | |

**User's choice:** Stay clocked in

### Q4: Open shift from yesterday — what happens today?

| Option | Description | Selected |
|--------|-------------|----------|
| Block & warn | "You have an open shift from yesterday. Ask manager to correct it." Prevents ghost shifts. | ✓ |
| Auto-close at midnight | Cron auto-closes with "auto-closed, needs review" flag. Staff can clock in today normally. | |
| Let them clock in, flag both | Both shifts visible with warning. Manager fixes later. Two concurrent open shifts. | |

**User's choice:** Block & warn

### Q5: Multiple shifts per day?

| Option | Description | Selected |
|--------|-------------|----------|
| Yes — allow multiple shifts | Separate attendance records per cycle. Hours summed per day. | ✓ |
| No — one shift per day | Simpler but doesn't cover lunch breaks, split shifts. | |

**User's choice:** Yes — allow multiple shifts

---

## Attendance ↔ Production link

### Q6: How should attendance records link to production?

| Option | Description | Selected |
|--------|-------------|----------|
| Date + chefUserId match | Separate tables. Join at query time. Simpler schema. | ✓ |
| Explicit FK on shift record | kitchenShiftRecords.attendanceId links to clock-in session. | |
| Store shift IDs in attendance | staffAttendance owns its production via array of IDs. | |

**User's choice:** Date + chefUserId match
**Notes:** Matches existing aggregation pattern. Simpler.

### Q7: Submit shift without being clocked in?

| Option | Description | Selected |
|--------|-------------|----------|
| No gating | Works regardless. Independent tracking. | |
| Warn but allow | Banner "You're not clocked in — shift won't count toward hours." Non-blocking. | ✓ |
| Block submission | Must be clocked in. Strict but blocks retroactive entries. | |

**User's choice:** Warn but allow

### Q8: Clock out without submitting shift record?

| Option | Description | Selected |
|--------|-------------|----------|
| Clock out normally | Independent of production. "Hours worked, 0 balls" is valid. | |
| Prompt to submit shift first | Dialog "Submit your shift record first?" with Submit/Skip options. | ✓ |
| Block clock-out until submitted | Must submit or mark "no production." Frustrates prep-only days. | |

**User's choice:** Prompt to submit shift first

### Q9: Multi-session production attribution?

| Option | Description | Selected |
|--------|-------------|----------|
| Sum to the day | All shift records for date+user aggregate to that day. Simplest. | ✓ |
| Attribute to most recent open session | Shift record attributes to whichever session is open at submission time. | |
| Ask staff to pick | Dropdown in EndOfShiftForm when multiple sessions exist today. | |

**User's choice:** Sum to the day

---

## Monthly summary view

### Q10: Where does the monthly summary live?

| Option | Description | Selected |
|--------|-------------|----------|
| New dedicated page | /staff-performance route, manager/admin only. Clean home for ATT-03. | ✓ |
| Tab on UsersManager | Per-user drill-down on existing /users page. | |
| Dashboard widget | Card on main dashboard. Limited depth. | |

**User's choice:** New dedicated page

### Q11: Default columns?

| Option | Description | Selected |
|--------|-------------|----------|
| Hours worked | Total clocked-in time. Core ATT-03. | ✓ |
| Days worked | Unique days with ≥1 shift. | ✓ |
| Balls produced by type | Big Ball + Mid Ball totals. BOM-resolved. | ✓ |
| Total grams produced | Sum of componentProduced.grams. | ✓ |

**User's choice:** All four, multi-select
**Notes:** User added "have the dynamic components and grams/pieces for each shift so we can see all the subtotal plus the above" — captured as D-11 + D-14.

### Q12: Default period view?

| Option | Description | Selected |
|--------|-------------|----------|
| Current month | MTD on load. Prev/next arrows. Matches payroll cadence. | ✓ |
| Last 30 days | Rolling window. Less aligned with salary cycles. | |
| Custom range picker | No default. Flexible but more friction. | |

**User's choice:** Current month

### Q13: Can kitchen staff see their own attendance data?

| Option | Description | Selected |
|--------|-------------|----------|
| Yes — own data only | Preview on gate screen + personal "My Performance" view. | ✓ |
| No — manager/admin only | Staff only sees clock-in status. Simpler access but less transparency. | |

**User's choice:** Yes — own data only

### Q14: How should per-shift component breakdown render (g/pcs mixed units)?

| Option | Description | Selected |
|--------|-------------|----------|
| Expandable row per staff, dynamic cols per component | Top-level aggregate. Expand to nested table with one row per shift, one column per component in native unit. Headers show unit. | ✓ |
| Single column 'Output' with unit per row | Compact. One row per (date × component). | |
| Group by component, then by date | One block per component. Focus on one ingredient at a time. | |

**User's choice:** Expandable row per staff, dynamic cols per component
**Notes:** Per-component subtotals respect the componentTracking unit — never sum g and pcs together.

---

## Clock-out correction

### Q15: What triggers the correction UI?

| Option | Description | Selected |
|--------|-------------|----------|
| Flagged list on /staff-performance | Yellow badge on shifts with missing clock-out or >16h open. | ✓ |
| Separate corrections page | Dedicated admin page for problematic records. | |
| Inline on kitchen gate screen | Manager logs in on same device, corrects on the spot. | |

**User's choice:** Flagged list on /staff-performance

### Q16: What can a manager correct?

| Option | Description | Selected |
|--------|-------------|----------|
| clockIn, clockOut, reason note | Adjust timestamps + required note. | |
| clockOut only + reason | Narrower. Delete+recreate for clockIn fixes. | |
| Full editing (+ add/delete sessions, +/- chef) | Add retroactive shifts, delete, reassign. Most powerful. | ✓ |

**User's choice:** Full editing

### Q17: Audit trail contents?

| Option | Description | Selected |
|--------|-------------|----------|
| Previous + new values, editedBy, editedAt, note | Full before/after. Mirrors ShiftEditDialog. | ✓ |
| Just a flag + note | Simple corrected:true flag. Doesn't preserve originals. | |
| Full event log (every field) | Per-field event entries. Noisy. | |

**User's choice:** Previous + new values, editedBy, editedAt, note

### Q18: Auto-flag rules?

| Option | Description | Selected |
|--------|-------------|----------|
| Missing clock-out | clockIn set, clockOut null, staff not currently clocked in. | ✓ |
| Open shift > 16 hours | Threshold to catch forgotten clock-outs same day. | ✓ |
| Clock-in before hire date | Sanity check against data errors. | ✓ |
| Overlapping sessions for same staff | Two open shifts or overlapping time ranges. | ✓ |

**User's choice:** All four (multi-select)

### Q19: Correction note required?

| Option | Description | Selected |
|--------|-------------|----------|
| Required | Manager must enter reason. Keeps audit trail meaningful. | ✓ |
| Optional | Faster but risks uninformative audit. | |

**User's choice:** Required

---

## Claude's Discretion

- Gate screen visual design (card dimensions, animations, typography) — follow existing kitchen UI
- Derivation of "currently clocked in" state (query-side vs. flag)
- Running timer format in the header
- CSV column order and filename format
- Auto-flag threshold tuning (16h starting point)
- Visual treatment of the correction audit trail display

## Deferred Ideas

- Biometric / device-pinned attendance
- GPS location verification
- Overtime calculation and payroll integration
- Break tracking (paid vs. unpaid)
- Leave management (vacation, sick days, approval)
- Auto clock-out at midnight or after inactivity
- Bulk corrections
- Email/push notifications to managers when flags appear
- Per-session production attribution
- Shift scheduling / rostering
- "Notify Manager" WhatsApp button on blocked clock-in screen
