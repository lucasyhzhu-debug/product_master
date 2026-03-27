# Quick Task 260327-p5x: Asset Creation with Acquisition JE + Intangible Amortization - Context

**Gathered:** 2026-03-27
**Status:** Ready for planning

<domain>
## Task Boundary

Three enhancements to the Asset Register:
1. **Acquisition JE on create**: When creating any asset (fixed or intangible), also create the acquisition JE atomically
2. **Intangible asset categories**: Add trademark/brand, patent, software categories with PSAK 19-aligned GL accounts and amortization
3. **Orphan backfill**: Banner + batch JE creation for existing assets that have no acquisition JE

Use case: Frollie brand trademark registration needs to be recorded as an intangible asset with amortization tracking. Equipment purchases from Tokopedia/Shopee need acquisition JEs when registered.

</domain>

<decisions>
## Implementation Decisions

### Payment Method on Asset Creation (LOCKED)
- Two options: "Company paid (Cash)" → CR 1100, "Employee paid" → CR 2200 Employee Reimbursements Payable
- Radio buttons in CreateAssetDialog, default to "Company paid"
- JE preview section shows the acquisition JE (DR 1500/1700, CR 1100/2200) that will be created
- Depreciation/amortization preview already exists conceptually — enhance it

### Intangible Categories (Claude's Discretion)
- Add 3 intangible categories to ASSET_CATEGORIES:
  - `merek_dagang` (Trademarks/Brands) — 10yr useful life, 0% salvage, abbr: TM
  - `hak_paten` (Patents) — 10yr useful life, 0% salvage, abbr: PAT
  - `perangkat_lunak` (Software) — 4yr useful life, 0% salvage, abbr: SW
- New GL accounts to seed:
  - 1700 Intangible Assets (asset account, debit side for intangibles)
  - 1710 Accumulated Amortization — Trademarks (contra-asset)
  - 1720 Accumulated Amortization — Patents (contra-asset)
  - 1730 Accumulated Amortization — Software (contra-asset)
  - 6160 Amortization Expense (expense account)
- The existing `runDepreciation` engine handles amortization automatically — same straight-line math, different GL codes
- Intangible categories use `glAssetCode: "1700"` (instead of "1500" for tangibles) and category-specific `glAccumCode`
- Amortization uses `amortizationExpenseCode: "6160"` (instead of "6150" for depreciation)

### Backward Compatibility — Orphan Backfill (LOCKED)
- Yellow banner on Asset Register: "X assets have no acquisition journal entry"
- `useOrphanEquipmentPurchases` query already exists — repurpose or enhance it to detect assets without linked JEs
- Click "Backfill" → modal lists orphan assets with assumed payment method (company cash)
- Confirm → batch-create acquisition JEs for all orphan assets
- Banner is dismissible (localStorage)

### Acquisition JE Integration (LOCKED)
- `fixedAssets.create` mutation enhanced with:
  - `paymentMethod: v.optional(v.union(v.literal("company_paid"), v.literal("employee_paid")))`
  - Default "company_paid" if not provided (backward compat)
  - Creates acquisition JE: DR asset account (1500 for tangible, 1700 for intangible), CR credit account
  - sourceType: "asset_acquisition" (same as Convert to CapEx)
  - Stores `acquisitionJeId` on the asset record
- New field on fixedAssets: `acquisitionJeId: v.optional(v.id("journalEntries"))`

### Claude's Discretion
- Exact orphan detection logic (assets without acquisitionJeId and not sourceExpenseId-linked)
- GL account seeding mechanism (seed function vs. manual)
- Whether to add a `glAssetCode` field to ASSET_CATEGORIES or derive from category type

</decisions>

<specifics>
## Specific Ideas

- Intangible categories distinguished by a new `type: "tangible" | "intangible"` field on ASSET_CATEGORIES
- Asset account code derived: tangible → "1500", intangible → "1700"
- Depreciation/amortization expense code: tangible → "6150", intangible → "6160"
- Backfill mutation: `fixedAssets.backfillAcquisitionJEs` (admin-only, batch operation)
- The orphan banner reuses the existing `orphanBannerDismissed` localStorage pattern already in AssetRegister.tsx

</specifics>
