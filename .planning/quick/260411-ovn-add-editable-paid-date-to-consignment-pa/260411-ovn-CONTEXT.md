# Quick Task 260411-ovn: Add editable paid date to consignment Paid button - Context

**Gathered:** 2026-04-11
**Status:** Ready for planning

<domain>
## Task Boundary

Add a date picker to the "Mark as Paid" flow for consignment settlements so users can record the actual paid date (which may differ from when they enter it into the system).

</domain>

<decisions>
## Implementation Decisions

### Date Input UX
- Default to today's date, allow user to change to a past date
- Pre-filled date picker in the confirmation dialog

### Claude's Discretion
- Replace the simple ConfirmDialog with a custom dialog containing a date input + confirm/cancel
- Backend: add optional `paidAt` arg to `markAsPaid` mutation (falls back to `Date.now()` if not provided)

</decisions>

<specifics>
## Specific Ideas

- The "Paid" badge already displays `paidAt` via `formatSettlementDate(s.paidAt)` — no changes needed there
- Use native HTML date input (consistent with existing SettlementFormDialog pattern) rather than a calendar component

</specifics>
