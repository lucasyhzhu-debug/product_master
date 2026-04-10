# Phase 71: Bulk Expense Upload & Asset Reclassification - UI Design Contract

---
status: draft
phase: 71
name: bulk-expense-upload-asset-reclassification
created: 2026-04-10
---

## Summary

Phase 71 evolves the existing HistoricalImportPage into a modern "Bulk Import" tool with an editable preview table (the star of the page), trust mode controls, and adds asset reclassification to the existing disposal flow. One existing page is refactored (`HistoricalImportPage.tsx`), one existing dialog is extended (asset disposal in `AssetRegister.tsx`). No new routes.

Two key UX surfaces:
1. **Editable preview table** -- Airtable-style CSV import with click-to-edit cells, validation coloring, and batch trust controls
2. **Asset reclassification** -- New disposal type option in existing dispose asset dialog

## Design System Detection

| Property | Value | Source |
|----------|-------|--------|
| Tool | shadcn/ui (manual installation, no `components.json`) | Codebase scan |
| Styling | Tailwind CSS v4 via `@theme` block in `src/index.css` | `src/index.css` lines 1-133 |
| Font | Inter, system-ui fallback | `--font-sans` in `src/index.css` line 6 |
| Icons | Lucide React | Import statements across pages |
| Toasts | Sonner (`toast.success`, `toast.error`) | Import pattern across pages |
| Theme | Light + dark mode via `.dark` class variant | `src/index.css` lines 136-243 |
| Table | shadcn `Table` component available | `src/components/ui/table.tsx` |
| Switch | shadcn `Switch` (Radix) available | `src/components/ui/switch.tsx` |
| Popover | shadcn `Popover` available | `src/components/ui/popover.tsx` |

## Spacing

8-point grid scale (existing project convention):

| Token | Value | Usage in this phase |
|-------|-------|---------------------|
| `gap-1` | 4px | Icon-to-text in badges, validation indicator spacing |
| `gap-2` | 8px | Table cell internal padding, inline edit input padding |
| `gap-3` | 12px | Summary card grid gaps, action button groups |
| `gap-4` | 16px | Section spacing within wizard steps, card padding |
| `space-y-4` | 16px | Vertical stacking in trust mode controls |
| `space-y-6` | 24px | Page-level section spacing between wizard cards |
| `p-2` | 8px | Table cell padding (matches shadcn Table default) |
| `px-3 py-1.5` | 12px/6px | Inline edit input padding within table cells |
| `py-8` | 32px | Upload dropzone vertical padding |

Exception: Table rows have a 3px left border for validation state coloring. This is a decorative border, not spacing.

## Typography

Existing project typography (no new sizes):

| Level | Size | Weight | Line Height | Usage in this phase |
|-------|------|--------|-------------|---------------------|
| Page title | 20px (`text-xl`) | 600 (semibold) | 1.2 | PageHeader "Bulk Import" |
| Card title | 16px (`text-base`) | 600 (semibold) | 1.2 | Wizard step titles, summary card headers |
| Body | 14px (`text-sm`) | 400 (normal) | 1.5 | Table cells, form labels, descriptions, dropdown items |
| Caption | 12px (`text-xs`) | 400 (normal) | 1.5 | Validation messages, muted hints, row counts, column headers |

Font weights: 400 (normal) and 600 (semibold) only.

## Color

60/30/10 split (existing project convention):

| Allocation | Color | CSS Variable | Elements |
|------------|-------|-------------|----------|
| 60% dominant | White / Dark bg | `--color-background` | Page background, table background |
| 30% secondary | Muted gray | `--color-card`, `--color-muted` | Card surfaces, upload dropzone background, dropdown backgrounds |
| 10% accent | Teal `#0D9488` | `--color-brand`, `--color-primary` | "Confirm Import" button, toggle active state, focus rings |

### Semantic colors used in this phase

| Purpose | Light Mode | Dark Mode | CSS Variable | Elements |
|---------|-----------|-----------|-------------|----------|
| Valid row | `#059669` | `#34D399` | `--color-status-success` | Green left border on valid rows, "Valid" count badge |
| Warning row | `#D97706` | `#FBBF24` | `--color-status-warning` | Amber left border on warning rows, warning cell highlights |
| Error row | `#DC2626` | `#F87171` | `--color-status-error` | Red left border on error rows, error cell backgrounds, error badges |
| Info | `#2563EB` | `#60A5FA` | `--color-status-info` | "Already paid" toggle info text, auto-mapped category indicator |
| Success background | `#ECFDF5` | `hsl(160 15% 14%)` | `--color-status-success-bg` | Valid row subtle background tint |
| Warning background | `#FFFBEB` | `hsl(40 15% 14%)` | `--color-status-warning-bg` | Warning row subtle background tint |
| Error background | `#FEF2F2` | `hsl(0 15% 14%)` | `--color-status-error-bg` | Error cell background highlight |

### Row Validation Visual Treatment

Each row in the preview table has a colored left border indicating its validation state:

| State | Left Border | Row Background | Cell Highlight |
|-------|-------------|---------------|----------------|
| Valid | 3px solid `--color-status-success` | None (default) | None |
| Warning | 3px solid `--color-status-warning` | `--color-status-warning-bg` at 50% opacity | Amber ring on warning cells |
| Error | 3px solid `--color-status-error` | `--color-status-error-bg` at 50% opacity | `--color-status-error-bg` background + red ring on error cells |

### Trust Mode Visual Treatment

| State | Visual |
|-------|--------|
| "Already paid" ON (auto-approve) | Row shows `CheckCircle2` icon (green) in trust column |
| "Already paid" OFF (needs approval) | Row shows `ArrowRight` icon (muted) in trust column |
| Batch toggle ON | `Switch` component in primary/teal active color |
| Batch toggle OFF | `Switch` component in default muted color |

## Component Inventory

### Existing Components (reuse as-is)

| Component | Import Path | Used Where in Phase 71 |
|-----------|-------------|----------------------|
| `Table` / `TableHeader` / `TableBody` / `TableRow` / `TableHead` / `TableCell` | `@/components/ui/table` | Editable preview table |
| `Card` / `CardContent` / `CardHeader` / `CardTitle` | `@/components/ui/card` | Wizard step containers, summary cards |
| `Button` | `@/components/ui/button` | Import actions, template downloads, re-upload |
| `Badge` | `@/components/ui/badge` | Validation counts, row type indicators, column status |
| `Input` | `@/components/ui/input` | Inline edit: date, amount, description, vendor |
| `Switch` | `@/components/ui/switch` | Batch-level "Already paid" toggle |
| `Select` / `SelectTrigger` / `SelectContent` / `SelectItem` | `@/components/ui/select` | Payment method dropdown in inline edit |
| `Popover` / `PopoverTrigger` / `PopoverContent` | `@/components/ui/popover` | Searchable category/owner dropdown container |
| `Progress` | `@/components/ui/progress` | Import batch progress bar |
| `Tooltip` / `TooltipTrigger` / `TooltipContent` | `@/components/ui/tooltip` | Error cell tooltips showing validation message |
| `Skeleton` | `@/components/ui/skeleton` | Loading state while accounts/users load |
| `PageHeader` | `@/components/layout/PageHeader` | Page title |
| `toast` (Sonner) | `sonner` | Success/error/warning feedback |

### New Components

| Component | Purpose | Location |
|-----------|---------|----------|
| `SearchableSelect` | Popover + text input + filtered list for category and owner columns. Renders inside `PopoverContent` with a text `Input` for filtering and a scrollable list of items. | `src/components/shared/SearchableSelect.tsx` |
| `EditableCell` | Wraps the click-to-edit pattern: renders display value when idle, appropriate input when active. Manages focus, blur save, Enter/Escape keyboard handling. | `src/components/import/EditableCell.tsx` |
| `TrustToggleCell` | Per-row trust toggle cell -- click toggles between "Already paid" and "Needs approval" with icon indicator. | Inline in `BulkImportPage` or `src/components/import/TrustToggleCell.tsx` |
| `ValidationBadge` | Small colored badge showing validation state (valid/warning/error) with count. | Inline in review step |

### Third-Party Registry

None. No third-party shadcn registries used. All components are from shadcn official or custom-built.

## Copywriting

### Wizard Step Titles

| Step | Title | Subtitle |
|------|-------|----------|
| Upload | "Prepare & Upload" | "Download the CSV template, fill in your expenses, and upload" |
| Validating | "Validating..." | "Checking your CSV data against the chart of accounts" |
| Review | "Review & Edit" | "{N} rows parsed -- fix errors and configure approval mode before importing" |
| Importing | "Creating expense records..." | "{completed}/{total} (batch {n} of {m})" |
| Complete | "{N} expense records created" | "Total amount imported: {formatted amount}" |
| Error | "Import failed" | "{error message}" |

### Trust Mode Controls

| Element | Copy |
|---------|------|
| Batch toggle label | "These expenses are already paid" |
| Batch toggle subtitle (ON) | "Skip approval -- record directly with journal entries" |
| Batch toggle subtitle (OFF) | "Submit for approval through the normal expense workflow" |
| Per-row override column header | "Paid?" |
| Per-row tooltip (ON) | "Already paid -- will be recorded directly" |
| Per-row tooltip (OFF) | "Needs approval -- will enter approval queue" |
| Non-admin/manager info | "All rows will be submitted for approval (admin/manager required for direct recording)" |

### Template & Downloads

| Element | Copy |
|---------|------|
| Template download button | "Download Template" |
| CoA reference download button | "Download Chart of Accounts" |
| Template description | "Required columns: date, amount, description, category, vendor, payment_method, owner. Optional: receipt_url, asset_category, asset_name" |
| Column format hints | "date: YYYY-MM-DD | amount: positive integer (IDR) | category: account name (case-insensitive) | owner: system user display name" |

### Editable Table Column Headers

| Column | Header Text | Width | Editable? |
|--------|-------------|-------|-----------|
| Row # | "#" | 48px fixed | No |
| Validation | (icon only) | 32px fixed | No |
| Date | "Date" | 120px min | Yes -- date input |
| Amount | "Amount" | 120px min | Yes -- number input |
| Description | "Description" | 200px min, flex | Yes -- text input |
| Category | "Category" | 180px min | Yes -- searchable dropdown (account names) |
| Vendor | "Vendor" | 140px min | Yes -- text input |
| Payment | "Payment" | 130px min | Yes -- select dropdown |
| Owner | "Owner" | 140px min | Yes -- searchable dropdown (user names) |
| Paid? | "Paid?" | 64px fixed | Yes -- click toggle |
| Receipt URL | "Receipt" | 100px min | Yes -- text input |

### Summary Cards (Review Step)

| Card | Value | Label |
|------|-------|-------|
| Valid rows | "{count}" (green text) | "Valid Rows" |
| Warnings | "{count}" (amber text, or muted if 0) | "Warnings" |
| Errors | "{count}" (red text, or muted if 0) | "Errors" |
| Total amount | "{formatted IDR}" | "Total Amount" |

### Empty States

| Context | Copy | Visual |
|---------|------|--------|
| No CSV uploaded yet | "Click to select a CSV file" / "or drag and drop" | `Upload` icon (lucide) centered in dashed border zone |
| CSV has 0 valid rows | "No valid rows found. Check your CSV format against the template." | `AlertTriangle` icon, amber text |
| Category not matched | Cell shows red background, tooltip: "Category '{value}' not found -- select from dropdown" | Red cell + dropdown trigger |
| Owner not matched | Cell shows red background, tooltip: "Owner '{value}' not found -- select from dropdown" | Red cell + dropdown trigger |

### Error States

| Context | Error Copy | Recovery Action |
|---------|-----------|----------------|
| File read failure | "Failed to read CSV file" | Toast error. User re-uploads. |
| No valid rows after parse | "No valid rows found. Please check your CSV format matches the template." | Show re-upload button. |
| Batch mutation failure | "Import failed at batch {n}: {server error}" | Show "Retry from failed batch" + "Start Over" buttons (existing pattern). |
| Category column unmatched | Tooltip on cell: "Category '{raw value}' not found in Chart of Accounts" | User clicks cell to open searchable dropdown. |
| Owner column unmatched | Tooltip on cell: "User '{raw value}' not found in system" | User clicks cell to open searchable user dropdown. |
| Date format invalid | Tooltip on cell: "Invalid date format. Use YYYY-MM-DD" | User clicks cell to edit with date input. |
| Amount invalid | Tooltip on cell: "Amount must be a positive number" | User clicks cell to edit with number input. |

### Destructive Actions

| Action | Confirmation Approach | Copy |
|--------|----------------------|------|
| Re-upload (discard current preview) | No confirmation dialog. Single click returns to upload step. Reversible by re-uploading same file. | Button: "Re-upload" with `ArrowLeft` icon |
| Asset reclassification to expense | Confirmation via existing dispose dialog submit. Non-reversible. | Dialog text: "This will reverse the asset capitalization and record the net book value ({formatted NBV}) as an operating expense. This cannot be undone." |

### Asset Reclassification (AssetRegister Disposal Dialog)

| Element | Copy |
|---------|------|
| New disposal type option | "Reclassify to Expense" |
| Option description | "Reverse capitalization and book net book value as operating expense" |
| Target account label | "Expense Account" |
| Target account default | Auto-mapped from asset category (e.g., peralatan_kantor -> 6200 Office Equipment Expense) |
| Target account override | Searchable dropdown of expense accounts |
| Owner label | "Expense Owner" |
| Owner placeholder | "Select the person responsible for this expense" |
| Confirmation text | "This will reverse the asset capitalization and record the net book value ({NBV}) as an operating expense. This cannot be undone." |
| Success toast | "Asset reclassified to expense -- {expense number} created" |

## Interaction Contracts

### Wizard Flow State Machine

```
upload ──→ validating ──→ review ──→ importing ──→ complete
  ↑                        │   ↑         │
  └────────────────────────┘   └─────────┘
  (re-upload)                  (retry from failed batch)
                                    │
                                    ↓
                                  error ──→ upload (start over)
```

Same state machine as existing `HistoricalImportPage`, extended with edit capabilities in the review step.

### Upload Step

| Interaction | Behavior |
|-------------|----------|
| Click dropzone or drag file | Opens file picker / accepts drop. `.csv` files only. |
| File selected | Transitions to `validating` state. Parses with Papa Parse. |
| Parse complete | Transitions to `review` state with parsed + validated rows. |
| Download Template | Downloads `import-template.csv` with new column headers (date, amount, description, category, vendor, payment_method, owner, receipt_url, asset_category, asset_name). |
| Download CoA Reference | Downloads `chart-of-accounts-reference.csv` (existing behavior). |

### Review Step: Editable Preview Table

**Table interaction model:** Click-to-edit cells (same pattern as `editingCogsId` in MenuProductsManager).

| Interaction | Behavior |
|-------------|----------|
| Click a cell | Cell enters edit mode. Renders appropriate input type (see column table above). Input auto-focuses. Previous editing cell saves on blur. |
| Tab from editing cell | Saves current cell, moves focus to next editable cell in the row. |
| Enter in editing cell | Saves current cell value, exits edit mode. |
| Escape in editing cell | Reverts to original value, exits edit mode. |
| Blur from editing cell | Saves current cell value, exits edit mode. |
| Edit a category cell | Opens `SearchableSelect` popover. Type to filter accounts by name. Click item to select. Popover closes on selection. |
| Edit an owner cell | Opens `SearchableSelect` popover. Type to filter users by display name. Click item to select. Popover closes on selection. |
| Click "Paid?" column | Toggles the per-row trust override. No edit mode -- immediate toggle. |
| Edit resolves an error | Row re-validates. If all errors cleared, row border changes from red to green. Error count in summary cards updates reactively. |
| All errors resolved | "Confirm Import" button becomes enabled. |

**Editing state management:** Single `editingCell: { rowIndex: number; column: string } | null` state. Only one cell editable at a time.

### Review Step: Trust Mode Controls

**Location:** Between summary cards and the preview table.

| Interaction | Behavior |
|-------------|----------|
| Toggle batch "Already paid" switch | All rows update to the new trust mode default. Per-row overrides are reset. |
| Click per-row trust indicator | Toggles that single row's trust mode. Does not affect other rows or batch toggle. |
| Non-admin/non-manager user | Batch toggle is hidden. All rows locked to "Needs approval". Info banner shown. |

### Review Step: Summary Bar

**Location:** Sticky bar at the top of the review step, above the table.

```
+------------------------------------------------------------------+
| [Valid: 42]  [Warnings: 3]  [Errors: 2]    Total: Rp 15,450,000 |
+------------------------------------------------------------------+
```

Badges use semantic colors. Errors badge pulses subtly if count > 0 to draw attention.

### Review Step: Actions

| Button | State | Behavior |
|--------|-------|----------|
| "Confirm Import ({N} rows)" | Enabled when 0 errors | Transitions to `importing` state. Sequential batch processing with progress bar. |
| "Confirm Import" | Disabled when errors > 0 | Tooltip: "Fix {N} error(s) to continue" |
| "Re-upload" | Always enabled | Returns to upload step. Discards current preview data. |

### Import Step

Identical to existing `HistoricalImportPage` import step. Sequential batch processing (50 rows/batch), progress bar, "do not close this page" warning.

Key difference: calls new `bulkCreateExpenses` mutation instead of legacy `bulkCreateJournalEntries`.

### Complete Step

| Element | Behavior |
|---------|----------|
| Success icon | `CheckCircle2` green, centered |
| Primary stat | "{N} expense records created" |
| Secondary stat | "Total amount imported: {formatted}" |
| Primary CTA | "View My Expenses" -- navigates to `/expenses` |
| Secondary CTA | "Import More" -- resets wizard to upload step |

### Asset Reclassification (AssetRegister Page)

**Location:** Existing "Dispose Asset" dialog in AssetRegister.tsx.

| Interaction | Behavior |
|-------------|----------|
| Open dispose dialog | Existing behavior. Shows disposal type selector. |
| Select "Reclassify to Expense" | Shows additional fields: target expense account (auto-mapped with override dropdown), owner (user dropdown). Hides "Sale Proceeds" field (not applicable). |
| Target account auto-map | Based on asset category: maps to corresponding operating expense GL code. User sees pre-selected account with ability to change via searchable dropdown. |
| Owner field | Required. Searchable dropdown of system users. |
| Confirm reclassification | Creates expense record (status: `recorded`), JE (DR expense account for NBV, DR accumulated depreciation, CR fixed asset cost), updates asset to `disposed`. |
| Success | Toast: "Asset reclassified to expense -- {expense number} created". Dialog closes. Asset list refreshes reactively. |

## Layout Specifications

### Upload Step Layout

```
[PageHeader: "Bulk Import"]
  backTo="/expenses"  backLabel="My Expenses"

[Card: "Prepare & Upload"]
  Description text
  [Download Template]  [Download CoA Reference]
  Column format hints (text-xs text-muted-foreground)

[Card: "Upload CSV"]
  +-------------------------------------------+
  |  - - - - - - - - - - - - - - - - - - - -  |
  |  |                                     |  |
  |  |     [Upload icon]                   |  |
  |  |     Click to select a CSV file      |  |
  |  |     or drag and drop                |  |
  |  |     Accepts .csv files              |  |
  |  |                                     |  |
  |  - - - - - - - - - - - - - - - - - - - -  |
  +-------------------------------------------+
```

### Review Step Layout

```
[PageHeader: "Bulk Import"]

[Summary Cards Row: grid grid-cols-2 sm:grid-cols-4 gap-3]
  [Valid: 42]  [Warnings: 3]  [Errors: 2]  [Total: Rp 15.4M]

[Trust Mode Bar: Card with flex items-center justify-between p-4]
  Left:  "These expenses are already paid"
         subtitle text below toggle label
  Right: [Switch toggle]

[Editable Preview Table: Card wrapping Table with horizontal scroll]
  +----+---+------------+------------+------------------+-------------------+----------+---------+----------+------+----------+
  | #  | ! | Date       | Amount     | Description      | Category          | Vendor   | Payment | Owner    |Paid? | Receipt  |
  +----+---+------------+------------+------------------+-------------------+----------+---------+----------+------+----------+
  | 1  | G | 2025-01-15 | 250,000    | Office supplies  | Office Supplies   | Toko ABC | Company | Irfan    | [v]  |          |
  | 2  | R | 2025-02-01 | -50,000    | Internet bill    | [Select account]  | Telkom   | Company | Irfan    | [v]  |          |
  | 3  | A | 2025-03-01 | 5,000,000  | Oven for kitchen | Production Equip  | Toko XY  | Company | [Select] | [ ]  |          |
  +----+---+------------+------------+------------------+-------------------+----------+---------+----------+------+----------+

  Legend: G = green dot (valid), R = red dot (error), A = amber dot (warning)
  Row 2: amount cell has red background (negative value), category cell has red background (unmatched)
  Row 3: owner cell has red background (unmatched user)

[Actions Bar: flex justify-end gap-3 pt-4]
  [Re-upload]  [Confirm Import (42 rows)]
```

**Table scroll behavior:** Horizontal scroll on the `Table` wrapper div (existing shadcn Table pattern). The `#` and validation columns are NOT sticky (table is not wide enough to warrant it on most screens).

**Table max height:** `max-h-[60vh] overflow-y-auto` on the table body. Header row stays visible via `sticky top-0 bg-background z-10` on `TableHeader`.

### Asset Reclassification Dialog Layout

```
[Dialog: "Dispose Asset"]
  DialogDescription: "Record the disposal of this asset"

  Asset Summary (read-only):
    Name: Kitchen Oven
    Cost: Rp 5,000,000
    Accumulated Depreciation: Rp 1,250,000
    Net Book Value: Rp 3,750,000

  Disposal Type: [RadioGroup]
    ( ) Sold
    ( ) Scrapped
    ( ) Written Off
    (x) Reclassify to Expense       <-- NEW option

  --- shown when "Reclassify to Expense" selected ---
  Expense Account: [SearchableSelect: auto-mapped, overrideable]
  Expense Owner:   [SearchableSelect: system users]

  [Warning text-xs text-amber-600]:
  "This will reverse the asset capitalization and record Rp 3,750,000
   as an operating expense. This cannot be undone."

  [Cancel]  [Confirm Disposal]
```

## Responsive Behavior

| View | Mobile (<640px) | Tablet (640-1024px) | Desktop (>1024px) |
|------|-----------------|---------------------|-------------------|
| Summary cards | 2x2 grid | 4-column row | 4-column row |
| Trust mode bar | Stack: label above, switch below | Side-by-side | Side-by-side |
| Preview table | Horizontal scroll, touch-friendly cells | Horizontal scroll if needed | Full table visible |
| Table cell editing | Full-width input overlay | Inline input in cell | Inline input in cell |
| Upload dropzone | Full-width, reduced padding | Standard padding | Standard padding |
| Action buttons | Full-width stacked | Right-aligned row | Right-aligned row |
| Disposal dialog | Full-screen (shadcn default) | Centered modal 500px | Centered modal 500px |

**Mobile table editing:** On screens < 640px, clicking an editable cell opens a small floating input above the cell (using Popover positioning) rather than inline replacement. This avoids the table cell being too narrow for comfortable text entry.

## Accessibility

| Element | Requirement | Implementation |
|---------|-------------|----------------|
| Editable table | Screen reader announces "editable table with {N} rows" | `aria-label="Expense import preview"` on `Table` |
| Editable cell (idle) | Announce value + editability | `role="gridcell"` + `aria-label="{column}: {value}, click to edit"` |
| Editable cell (active) | Focus trapped in input | Standard `Input` focus. `aria-label="{column}"` on input. |
| Validation indicator | Error/warning communicated non-visually | `aria-label="Error: {message}"` or `aria-label="Warning: {message}"` on validation icon |
| Error cell | Error state communicated | `aria-invalid="true"` + `aria-errormessage` pointing to tooltip content |
| Trust toggle (batch) | Label association | `Switch` with `id="trust-mode"` + `Label htmlFor="trust-mode"` |
| Trust toggle (per-row) | Accessible name | `aria-label="Mark as already paid"` on the toggle button |
| SearchableSelect | Combobox pattern | `role="combobox"` on trigger, `aria-expanded`, `aria-controls` on listbox |
| Import progress | Progress communicated | `Progress` component with `aria-label="Import progress"` + `aria-valuenow` |
| Keyboard nav in table | Tab between editable cells | `tabIndex={0}` on editable cells in idle mode. Arrow keys NOT implemented (Tab-only navigation). |
| Disposal dialog radio | Radio group | Existing `RadioGroup` component handles keyboard + ARIA. |

## Loading & Transition States

| State | Visual Treatment |
|-------|-----------------|
| Page loading (accounts/users) | `Skeleton` rows matching table layout. "Loading accounts..." centered text (existing pattern). |
| CSV validating | Card with "Validating CSV data..." centered text (existing pattern). |
| Searching in dropdown | Input shows text, list filters immediately (client-side filter, no loading). |
| Import in progress | `Progress` bar with batch counter. "Do not close this page during import" warning. |
| Cell saving | No loading indicator. Saves are local state changes (no backend call per cell). Backend call happens on final "Confirm Import". |
| Import complete transition | Fade-in of success card with `CheckCircle2` icon. |

## Validation Rules

### CSV Column Validation (client-side, during parse)

| Column | Type | Constraints | Error Message |
|--------|------|-------------|---------------|
| `date` | string -> epoch ms | Required. Format: `YYYY-MM-DD`. Parsed via `strictWibDateStrToUtcMs`. | "Invalid date format. Use YYYY-MM-DD" |
| `amount` | number | Required. Must be positive integer. | "Amount must be a positive number" |
| `description` | string | Required. Non-empty after trim. Max 500 chars. | "Description is required" / "Description too long (max 500)" |
| `category` | string | Required. Case-insensitive match against active account names. Unmatched = error (fixable via dropdown). | "Category '{value}' not found in Chart of Accounts" |
| `vendor` | string | Optional. Max 200 chars. | "Vendor name too long (max 200)" |
| `payment_method` | string | Required. One of: `employee_paid`, `company_paid`, `payment_request`. | "Invalid payment method" |
| `owner` | string | Required. Match against system user display names. Unmatched = error (fixable via dropdown). | "User '{value}' not found in system" |
| `receipt_url` | string | Optional. If provided, must start with `http://` or `https://`. | "Receipt URL must be a valid URL" |
| `asset_category` | string | Required when category maps to asset account. Must be valid asset category key. | "Asset category required for asset accounts" |
| `asset_name` | string | Required when `asset_category` is present. Non-empty. | "Asset name required when asset category is specified" |

### Row-Level Validation States

| State | Criteria | Import Behavior |
|-------|----------|----------------|
| Valid (green) | All columns pass validation | Included in import |
| Warning (amber) | All required columns valid, but has advisory flags (e.g., unusually high amount, duplicate description) | Included in import, user warned |
| Error (red) | One or more columns fail validation | Blocked from import. Must be fixed inline. |

### Trust Mode Validation

| Rule | Enforcement |
|------|-------------|
| Only admin/manager can toggle "Already paid" | Frontend: `Switch` hidden for other roles. Backend: mutation checks `requireRole(ctx, token, ["admin", "manager"])` for auto-approve rows. |
| Per-row override requires batch toggle visible | If batch toggle hidden (non-admin), per-row "Paid?" column is hidden entirely. |

## No New Routes

This phase modifies existing pages. No new routes, no changes to `src/App.tsx`.

| Modified Page | Route | Access | Change |
|---------------|-------|--------|--------|
| HistoricalImportPage (renamed to BulkImportPage) | `/import` | `canManageReimbursements` (Admin) | Major refactor: editable table, trust mode, new mutation |
| AssetRegister | `/assets` | `canAccessAssets` (Manager, Admin) | Disposal dialog: new "Reclassify to Expense" option |

## File Impact Summary

### Frontend Files (new or modified)

| File | Action | Purpose |
|------|--------|---------|
| `src/pages/HistoricalImportPage.tsx` | Major refactor | Rename to BulkImportPage, add editable table, trust mode, new wizard flow |
| `src/lib/csvImportValidation.ts` | Modify | New columns (category-by-name, owner-by-name), new validation rules |
| `src/components/shared/SearchableSelect.tsx` | New | Reusable Popover + filter input + list pattern for category/owner |
| `src/components/import/EditableCell.tsx` | New | Click-to-edit cell wrapper with keyboard handling |
| `src/pages/AssetRegister.tsx` | Modify | Add "Reclassify to Expense" option in disposal dialog |
| `src/hooks/convex/useJournalImport.ts` | Modify | Add hook for new `bulkCreateExpenses` mutation |

### Backend Files (new or modified)

| File | Action | Purpose |
|------|--------|---------|
| `convex/journalImport/mutations.ts` (or new file) | New mutation | `bulkCreateExpenses` -- creates expense records, not raw JEs |
| `convex/fixedAssets/mutations.ts` | Modify | Add `reclassify_to_expense` disposal type to `disposeAsset` |
| `convex/fixedAssets/helpers.ts` | Modify | Add category-to-expense-account mapping for reclassification |

---

*Phase: 71-bulk-expense-upload-asset-reclassification*
*UI-SPEC created: 2026-04-10*
*Status: draft -- pending checker validation*
