# Phase 60: Asset Register & Depreciation - Context

**Gathered:** 2026-03-17
**Status:** Ready for planning

<domain>
## Phase Boundary

Build a fixed asset register with PSAK-compliant categories, flexible key-value characteristics, photo/document attachments, and auto-calculated monthly straight-line depreciation. Includes a "Catch Up to Now" batch JE generation flow with preview summary, per-asset JE creation, basic disposal workflow (sell/scrap with gain/loss JE), and a depreciation reminder on the Income Statement page.

Does NOT include: asset revaluation, impairment testing, asset transfers between locations, intangible asset amortization, or budget vs actual depreciation comparison.

</domain>

<decisions>
## Implementation Decisions

### Asset Data Model
- Track all business assets (kitchen equipment, office equipment, vehicles, furniture, leasehold improvements, tools)
- Asset number format: `FA-KIT-2603-001` (FA-{CATEGORY}-YYMM-NNN) — counter per category+month combo via `getNextNumber`
- Category abbreviations: KIT (kitchen/production), OFF (office), VEH (vehicles), FUR (furniture), BLD (buildings), TLS (tools), LHI (leasehold improvements)
- Status lifecycle: `active` → `fully_depreciated` → `disposed`
- Auto-mark `fully_depreciated` when accumulated depreciation reaches depreciable amount (cost - salvage)
- Accumulated depreciation denormalized on asset record (updated each time depreciation JE is posted)
- Location stored as simple string field (not linked to storageLocations table) — just another attribute
- Flexible key-value characteristics: array of `{key, value}` pairs per asset (Serial Number, Model, Manufacturer, Warranty Expiry, etc.)
- CSV paste support: paste key,value CSV rows into characteristics section — system parses and adds as key-value pairs
- Photo + document attachments: reuse existing `generateUploadUrl` pattern. Multiple files per asset (photos, purchase receipts, warranty docs, manuals)

### Asset Categories (PSAK-aligned fixed list)
- Categories hardcoded in code, based on Indonesian accounting standards (PSAK):
  - Tanah (Land) — not depreciable
  - Bangunan (Buildings)
  - Kendaraan (Vehicles)
  - Peralatan Kantor (Office Equipment)
  - Mesin & Peralatan Produksi (Kitchen/Production Equipment)
  - Mebelair & Perabot (Furniture & Fixtures)
  - Peralatan & Perkakas (Tools & Instruments)
  - Perbaikan Sewa (Leasehold Improvements)
- Each category has PSAK defaults for useful life and salvage value (see Depreciation Rules)

### Depreciation Rules
- Method: straight-line only (per phase scope)
- Proration: full month from acquisition month (asset acquired any day in March → full March depreciation)
- Salvage value: auto-populated from PSAK category defaults, overridable per asset (don't prompt user unless they want to change)
- PSAK default useful life by category (overridable per asset, with tooltip explaining "PSAK default"):
  - Tanah: N/A (not depreciable)
  - Bangunan: 20 years
  - Kendaraan: 8 years
  - Peralatan Kantor: 4 years
  - Mesin & Peralatan Produksi: 8 years
  - Mebelair & Perabot: 4 years
  - Peralatan & Perkakas: 4 years
  - Perbaikan Sewa: lease term or 4 years (whichever shorter)
- Monthly depreciation = (cost - salvage value) / (useful life in months)
- Auto-mark `fully_depreciated` when accumulated depreciation ≥ depreciable amount
- Commonsense PSAK rules — Claude handles edge cases and detailed calculation logic

### JE Generation Flow
- **"Catch Up to Now" button** on Asset Register page — single button that:
  1. Checks each active asset's last depreciation month
  2. Generates JEs for ALL missing months up to current month (WIB)
  3. Shows preview/summary before posting: "3 assets need March, 1 asset needs Feb + March", grouped by month
  4. One confirm to post everything
- **One JE per asset per month** — sourceId = asset ID, easy to trace/reverse/audit
- **Duplicate prevention**: track `lastDepreciationMonth` per asset. Assets already depreciated for a month are skipped in batch. No re-run risk.
- **Late-added assets**: automatically included in next "Catch Up" run — system detects missing months
- **GL accounts**: DR 6300 Depreciation Expense (single expense account), CR per-category accumulated depreciation contra-asset accounts (1210 Accum Depr-Buildings, 1220 Accum Depr-Equipment, etc.)
- **sourceType**: add `"depreciation"` and `"depreciation_void"` to journalEntries sourceType union
- **Void entire batch**: one-click void reverses all JEs from a specific month's run via existing `createReversalEntry`

### Asset Register UI
- **Page location**: under existing Financials dropdown in nav (alongside Income Statement, Expenses, Analytics, Payroll)
- **Access**: Manager + Admin (managers can view and create; only admin can dispose and run depreciation)
- **List view**: toggle between table view and card view
  - Table: Asset #, Name, Category, Acquisition Date, Cost, Accumulated Depreciation, Net Book Value, Status — sortable + filterable
  - Cards: asset photo, name, NBV progress bar, status badge — more visual
  - Leverage existing design patterns from InventoryManager/OrderManager
- **"Catch Up to Now" button** prominent at top of register page
- **Depreciation summary/preview dialog**: shown after clicking "Catch Up" — smart summary showing what will be updated, grouped by month, before confirming

### Disposal Workflow (basic)
- Dispose button on asset detail → dialog with:
  - Disposal type: sold / scrapped / written off
  - Disposal date
  - Sale proceeds (if sold, default 0 for scrap/write-off)
- System calculates gain/loss: sale proceeds - net book value at disposal date
- Creates final JE for gain/loss
- Marks asset status as `disposed`

### Depreciation Reminder on Income Statement
- **Both banner and inline**:
  - Yellow info banner at top of Income Statement page: "March 2026 depreciation not yet posted. Run from Asset Register." — dismissible but reappears next visit
  - Inline note next to Depreciation Expense line in OpEx section: "(March not posted)" — contextual
- Reminder only shows when current month has un-posted depreciation for active assets

### Claude's Discretion
- Exact PSAK salvage value defaults per category (research standard percentages)
- Internal function organization for depreciation calculation
- Exact table/card toggle UI implementation
- Photo gallery layout on asset detail page
- CSV paste parser implementation details
- Disposal JE account mapping (gain → 7xxx Other Income, loss → 7xxx Other Expense)
- Whether to add depreciation schedule/projection view per asset (nice-to-have)
- Depreciation batch run confirmation dialog design
- Asset form field ordering and section grouping

</decisions>

<code_context>
## Existing Code Insights

### Reusable Assets
- `convex/lib/journalEngine.ts`: `createJournalEntryWithLines`, `buildDebitLine`, `buildCreditLine`, `createReversalEntry` — core JE creation infrastructure
- `convex/lib/counter.ts`: `getNextNumber(ctx, prefix)` — sequential numbering. Needs category-aware prefix (e.g., "FA-KIT")
- `convex/lib/periodRange.ts`: WIB timezone handling — use for month determination
- `convex/accounts/`: Chart of Accounts queries/mutations. Account type `"asset"` exists in schema
- `ctx.storage.generateUploadUrl()` / `ctx.storage.getUrl()`: File upload pattern from expenses/payroll
- `protectedMutation` / `protectedQuery`: Auth wrapper pattern
- `ConfirmDialog`: Existing shared component for confirmation dialogs
- `src/components/financials/`: PLRow, SectionHeaderRow, DeltaIndicator — for Income Statement reminder

### Established Patterns
- Journal entry sourceType union in `convex/schema.ts` — extend with `"depreciation"` and `"depreciation_void"`
- Denormalized fields on records (e.g., `accumulatedDepreciation` on asset) — matches existing patterns
- Counter-based numbering via `getNextNumber` — extend for category-prefixed asset numbers
- Status badge components — reuse for asset status (active/fully_depreciated/disposed)
- File storage: upload URL → client upload → store storageId → resolve URL

### Integration Points
- `convex/schema.ts`: Add `fixedAssets` table, add `depreciationRuns` tracking table, extend `journalEntries.sourceType` union, add new contra-asset accounts
- `convex/accounts/mutations.ts`: Seed new GL accounts (6300 Depreciation Expense, 1210-1280 Accumulated Depreciation per category)
- `src/components/layout/Header.tsx`: Add "Asset Register" to `financialItems` array
- `src/App.tsx`: Add `/assets` route with ProtectedRoute
- `convex/reports/incomeStatement.ts`: Add depreciation reminder check (query fixedAssets for un-posted months)

</code_context>

<specifics>
## Specific Ideas

- "Can't we just have a button that says 'catch up to now'?" — the core UX insight: no month picker, system auto-detects what's missing
- Smart summary preview before posting: "3 assets need March, 1 asset needs Feb + March"
- PSAK defaults with tooltips explaining the source — user shouldn't need to think about depreciation parameters unless overriding
- Table/card toggle on register page — leverage existing design patterns
- Gentle depreciation reminder on Income Statement: both banner + inline note
- CSV paste for characteristics: paste specs from online product lookup by serial number
- Location is just another attribute (string field), not linked to storageLocations table

</specifics>

<deferred>
## Deferred Ideas

- Asset revaluation (PSAK 16 fair value model) — future phase
- Impairment testing (PSAK 48) — future phase
- Intangible asset amortization (software licenses, patents) — future phase
- Asset transfers between locations with audit trail — future phase
- Depreciation schedule projection/forecast view — Claude's discretion (nice-to-have)
- Budget vs actual depreciation comparison — requires budgets table
- Bulk asset import via CSV (create multiple assets at once) — future phase
- Asset barcode/QR code generation for physical tagging — future phase

</deferred>

---

*Phase: 60-asset-register-depreciation*
*Context gathered: 2026-03-17*
