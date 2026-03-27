# Quick Task 260327-sin: Summary

## What Changed

Extended the bulk CSV import system to support capex (fixed assets) and intangible assets (brands/patents/software) alongside regular expenses.

### Template Changes
- **New required columns:** `paymentMethod` (employee_paid / company_paid / payment_request), `submitterName`
- **New asset-only columns:** `assetCategory` (e.g., mesin_produksi, merek_dagang), `assetName`
- Template now includes example rows for both expense and asset imports

### Backend Changes (convex/journalImport/mutations.ts)
- `ImportRow` extended with paymentMethod, submitterName, assetCategory, assetName
- `AccountMap` now includes account `type` for asset detection
- Validation enforces:
  - paymentMethod is required and must be one of 3 valid values
  - submitterName is required
  - assetCategory and assetName are required when accountCode is an asset-type account
- Import loop branches on account type:
  - **Expense rows:** Same as before (DR expense, CR Cash, sourceType "manual")
  - **Asset rows:** Creates fixedAssets record + acquisition JE (DR 1500/1700, CR Cash, sourceType "asset_acquisition")
- Auto-calculates depreciation schedule from ASSET_CATEGORIES config
- Returns `{ created, assetsCreated }` counts

### Frontend Changes (csvImportValidation.ts + HistoricalImportPage.tsx)
- `AccountRef` now carries `type` field for asset detection
- Frontend validation matches backend: paymentMethod, submitterName required; assetCategory/assetName required for asset accounts
- Review step shows asset vs expense breakdown (count + subtotal)
- Page title updated to "Bulk Expense & Asset Import"
- Help text documents all new columns

## Files Modified
- `convex/journalImport/mutations.ts` — Backend mutation with asset support
- `src/lib/csvImportValidation.ts` — CSV parse/validate with new columns
- `src/pages/HistoricalImportPage.tsx` — UI template, review, help text

## Commit
ac572ebf - feat(import): support capex & intangible assets in bulk CSV import
