---
phase: 260327-sin
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - src/lib/csvImportValidation.ts
  - convex/journalImport/mutations.ts
  - src/pages/HistoricalImportPage.tsx
autonomous: true
requirements: [BULK-IMPORT-CAPEX]

must_haves:
  truths:
    - "CSV template includes new columns: paymentMethod, submitterName, assetCategory, assetName"
    - "paymentMethod is required and validated against employee_paid/company_paid/payment_request"
    - "submitterName is required for all rows"
    - "When accountCode maps to an asset-type account (1500/1700), assetCategory and assetName are required"
    - "Asset rows create fixedAssets records with auto-calculated depreciation schedule from ASSET_CATEGORIES"
    - "Asset rows create acquisition JE (DR 1500/1700, CR 1100) with sourceType asset_acquisition instead of regular expense JE"
    - "Non-asset rows continue to create regular expense JEs (DR expense, CR 1100) as before"
    - "Template download includes all new columns with examples for both expense and asset rows"
    - "Review step displays asset vs expense breakdown summary"
  artifacts:
    - path: "src/lib/csvImportValidation.ts"
      provides: "Extended ImportRow type with paymentMethod, submitterName, assetCategory, assetName"
      contains: "paymentMethod"
    - path: "convex/journalImport/mutations.ts"
      provides: "Asset-aware bulkCreateJournalEntries mutation"
      contains: "asset_acquisition"
    - path: "src/pages/HistoricalImportPage.tsx"
      provides: "Updated template headers, template examples, and review breakdown"
      contains: "paymentMethod"
  key_links:
    - from: "src/lib/csvImportValidation.ts"
      to: "convex/journalImport/mutations.ts"
      via: "ImportRow type shared between frontend and backend"
      pattern: "ImportRow"
    - from: "convex/journalImport/mutations.ts"
      to: "convex/fixedAssets/helpers.ts"
      via: "ASSET_CATEGORIES for category validation and depreciation calculation"
      pattern: "ASSET_CATEGORIES"
    - from: "convex/journalImport/mutations.ts"
      to: "convex/lib/journalEngine.ts"
      via: "createJournalEntryWithLines with asset_acquisition sourceType"
      pattern: "asset_acquisition"
---

# Quick Task: Bulk Import with CapEx/Intangible Support

## Task 1: Extend CSV validation and ImportRow type

**files:** `src/lib/csvImportValidation.ts`
**action:**
1. Add new fields to `ImportRow` interface: `paymentMethod`, `submitterName`, `assetCategory?`, `assetName?`
2. Add new fields to `RawCsvRow` interface: `paymentMethod?`, `submitterName?`, `assetCategory?`, `assetName?`
3. In `parseAndValidateCsv`:
   - Validate `paymentMethod` is required and one of: employee_paid, company_paid, payment_request
   - Validate `submitterName` is required and non-empty
   - When accountCode maps to asset-type account (check account type from accounts list), validate:
     - `assetCategory` is required and is a valid AssetCategoryKey
     - `assetName` is required and non-empty
   - Pass through valid optional fields into ImportRow
4. Export `VALID_PAYMENT_METHODS` and `VALID_ASSET_CATEGORIES` arrays for reuse
5. Add `AccountRef.type` field to enable asset-type detection

**verify:** TypeScript compiles, all existing fields still work, new fields are validated
**done:** ImportRow has paymentMethod + submitterName + assetCategory + assetName, validation catches missing required fields

## Task 2: Extend backend mutation for asset-aware import

**files:** `convex/journalImport/mutations.ts`
**action:**
1. Add new fields to mutation args: `paymentMethod`, `submitterName`, `assetCategory?`, `assetName?`
2. Add new fields to `ImportRow` interface (backend parallel)
3. In validation: check assetCategory is valid when account type is "asset"
4. Build account type lookup (need to check account.type from the fetched accounts)
5. In the creation loop, branch on account type:
   - **For asset accounts (type "asset"):**
     - Look up category config from ASSET_CATEGORIES
     - Calculate depreciation: monthlyDepreciation, usefulLifeMonths, salvageValue
     - Create fixedAssets record (import getAssetAccountCode, calculateMonthlyDepreciation from helpers)
     - Create acquisition JE: DR assetAccountId (1500/1700), CR cashAccount (1100), sourceType "asset_acquisition"
     - Use getNextAssetNumber pattern for asset numbering
   - **For non-asset accounts (existing behavior):**
     - Create regular expense JE: DR expenseAccount, CR cashAccount, sourceType "manual"
6. Include submitterName in JE description: "[Historical Import] desc | vendor | by submitterName"
7. Return { created, assetsCreated } counts

**verify:** TypeScript compiles, asset rows create fixedAssets + acquisition JE, expense rows unchanged
**done:** Mutation handles both expense and asset rows correctly

## Task 3: Update UI — template, review step, and template download

**files:** `src/pages/HistoricalImportPage.tsx`
**action:**
1. Update `TEMPLATE_HEADERS` to include all new columns
2. Update `TEMPLATE_EXAMPLE` with two rows: one regular expense, one capex asset purchase
3. Update the "Required columns" / "Optional columns" help text
4. In `ReviewStep`, add a summary card showing "Asset Entries" vs "Expense Entries" counts
5. Pass account types through so the review can distinguish asset vs expense rows
6. Update the `handleConfirmImport` to pass new fields through to mutation
7. Update completion state to show assets created count

**verify:** Template downloads with correct headers, review step shows asset/expense breakdown
**done:** Full UI flow works for mixed expense + asset CSV imports
