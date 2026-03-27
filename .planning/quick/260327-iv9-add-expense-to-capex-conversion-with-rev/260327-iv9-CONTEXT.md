# Quick Task 260327-iv9: Expense-to-CapEx Conversion - Context

**Gathered:** 2026-03-27
**Status:** Ready for planning

<domain>
## Task Boundary

Add a "Convert to CapEx" action on expense approval cards that:
1. Voids the original opex expense (reversal JE)
2. Creates a fixed asset record with proper PSAK-aligned categorization
3. Creates the asset acquisition JE (DR 1500 Fixed Assets, CR Cash/Payable)
4. Carries over receipt/invoice documentation to the asset record
5. Shows a summary modal with journal entries and depreciation preview before confirmation

The 11 pending expenses are all equipment purchases (Sealer Machine, Printer Thermal, FOMAC Mixer, Trolley, Vacuum Sealer, Inkjet Printer, etc.) currently categorized under account 6600 (Repairs & Maintenance) that need reclassification to fixed assets.

</domain>

<decisions>
## Implementation Decisions

### Conversion Flow & UX
- **Individual button per expense** (no batch mode) — "Convert to CapEx" alongside existing Approve/Reject/Void buttons
- Each button opens a summary/confirmation modal for that single expense
- Modal shows: expense details, auto-suggested asset category, depreciation preview, journal entries preview, receipt attachment status
- User confirms category (can override), reviews JE preview, then clicks "Confirm Conversion"

### Accounting Treatment (LOCKED)
- **Two-step Void + New Asset** approach (clean audit trail):
  1. Void the existing expense → reversal JE via existing `createReversalEntry` (reverses original DR 6600/CR 2200 or 1100)
  2. Create fixed asset record + acquisition JE (DR 1500 Fixed Assets, CR original credit account matching payment method)
- Should work identically to manually doing an equipment purchase from the manual journal entry page
- Expense record transitions to "voided" status
- Void comment auto-populated: "Converted to fixed asset: {assetNumber}"
- All operations happen atomically in a single mutation
- **Receipt/invoice documentation MUST be carried over** from expense to asset record (attachmentIds)
- **Indonesian PSAK compliance** required for all accounting entries

### Asset Categorization (LOCKED)
- **Auto-suggest + Override**: detect category from expense description keywords:
  - "mixer", "sealer", "vacuum" → mesin_produksi (Kitchen Equipment, 8yr, 5% salvage)
  - "printer", "trolley" → peralatan_kantor (Office Equipment, 4yr, 5% salvage)
  - Fallback: perkakas (Tools, 4yr, 5% salvage)
- Modal shows auto-detected category with dropdown to override
- Changing category updates depreciation preview in real-time
- Default salvage value and useful life come from ASSET_CATEGORIES config

### Asset Linkage
- New `sourceExpenseId` field on fixedAssets for audit traceability
- Receipt file from expense copied to asset's attachmentIds array

### Claude's Discretion
- Exact modal layout and visual hierarchy
- Button visibility rules (show for Pending/Submitted expenses, not already-voided ones)
- Error handling edge cases
- Keyword-to-category mapping implementation details

</decisions>

<specifics>
## Specific Ideas

- Button text: "Convert to CapEx" (short, fits alongside existing action buttons)
- Modal title: "Convert Expense to Equipment Purchase"
- Depreciation display: "Rp {monthly}/month for {years} years (salvage: Rp {salvage})"
- Journal entries preview as expandable section showing both reversal and acquisition JEs
- Receipt thumbnail shown in modal with checkmark if present
- New sourceType for acquisition JE: "asset_acquisition" (distinct from "manual" and "depreciation")

</specifics>
