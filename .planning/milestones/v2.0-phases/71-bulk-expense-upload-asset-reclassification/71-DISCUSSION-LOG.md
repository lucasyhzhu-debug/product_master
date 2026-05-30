# Phase 71: Bulk Expense Upload & Asset Reclassification - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-04-10
**Phase:** 71-bulk-expense-upload-asset-reclassification
**Areas discussed:** CSV format & validation, Trust mode UX, Asset reclassification flow, Upload page design

---

## CSV Format & Validation

| Option | Description | Selected |
|--------|-------------|----------|
| Frollie template | Define exact columns, strict validation, user downloads template | ✓ |
| Flexible mapping | Accept any CSV, user maps columns via dropdown UI | |
| Bank statement style | Accept BCA/Mandiri-style CSV, auto-categorize | |

**User's choice:** Frollie template
**Notes:** None

---

| Option | Description | Selected |
|--------|-------------|----------|
| Skip bad, import good | Flag invalid rows, import valid ones, show summary | |
| All or nothing | Reject entire file if any row fails | |
| Fix inline | Editable preview table where user can fix invalid cells | ✓ |

**User's choice:** Fix inline
**Notes:** None

---

| Option | Description | Selected |
|--------|-------------|----------|
| Match by account name | Category text must match existing account name, fuzzy match | ✓ |
| Match by account code | Category column contains account codes | |
| Free text + dropdown fix | Accept any text, user assigns via dropdown | ✓ (combo) |

**User's choice:** Account name matching with dropdown fallback for unmatched categories
**Notes:** "account name and we have the freetext combo to help fix it"

---

## Trust Mode UX

| Option | Description | Selected |
|--------|-------------|----------|
| Toggle per upload | Single "Auto-approve batch" toggle on upload page | ✓ |
| Per-row override | Default trust mode at upload level, override individual rows | ✓ |
| Role-based auto | Trust implicit from uploader's role, no toggle | |

**User's choice:** Both batch-level toggle AND per-row override
**Notes:** "only once we review every row from the upload can we fully confirm what's already paid and what's not already paid. The toggle should be more user friendly in its description."

---

| Option | Description | Selected |
|--------|-------------|----------|
| Admin only | Only admins can toggle auto-approve | |
| Admin + Manager | Both admin and manager can toggle | ✓ |
| Anyone who uploads | No restriction on the toggle | |

**User's choice:** Admin + Manager
**Notes:** None

---

## Asset Reclassification Flow

| Option | Description | Selected |
|--------|-------------|----------|
| Expense record + JE | Creates real expense record AND journal entry, appears in analytics | ✓ |
| JE only | Just creates journal entry, simpler but not in expense reports | |

**User's choice:** Expense record + JE
**Notes:** None

---

| Option | Description | Selected |
|--------|-------------|----------|
| User picks from dropdown | User selects target expense account when reclassifying | |
| Fixed account (6900 Misc) | All reclassified assets go to one account | |
| Auto from asset category | Map each asset category to default expense account, user can override | ✓ |

**User's choice:** Auto from asset category with dropdown override
**Notes:** "also - we should have a column in the upload and also in the editing to assign the 'owner' of that expense - the owners names should match the user names in our userbase"

---

## Upload Page Design

**User's directive (free text, not from options):**
"It should be an evolution of the historical import page - should now just be called 'bulk import upload' and we should refresh that page to be this purpose - any logic we already have on that page please review it and see if it should be deprecated/replaced with this work"

**Design outcome:** /frontend-design skill invoked to produce editable spreadsheet mockup. Key decisions:
- Evolve HistoricalImportPage, same route `/import`
- Editable preview table with click-to-edit cells
- Trust mode toggle in summary bar with per-row override column
- Owner column with user-select dropdown
- Existing `bulkCreateJournalEntries` mutation deprecated, replaced with new expense-creating mutation

---

## Claude's Discretion

- Cell editing UX details (focus behavior, keyboard navigation)
- Toggle styling and positioning
- Whether to keep "By GL Account" and "By Period" summary cards
- Row selection/multi-select for bulk operations

## Deferred Ideas

None
