# Phase 71: Bulk Expense Upload & Asset Reclassification - Context

**Gathered:** 2026-04-10
**Status:** Ready for planning

<domain>
## Phase Boundary

Users can efficiently import batches of expenses from CSV (creating actual expense records, not raw journal entries) and reclassify disposed fixed assets as operating expenses. The existing HistoricalImportPage is evolved into a general "Bulk Import" page with an editable preview table.

**Requirements:** EXP-01 (CSV bulk upload → expense records), EXP-02 (auto-approve trusted batches), EXP-03 (submit-for-approval untrusted batches), EXP-04 (asset disposal → reclassify to expense)

</domain>

<decisions>
## Implementation Decisions

### CSV Format & Validation (EXP-01)
- **D-01:** Use a **Frollie-defined CSV template** with exact columns: `date`, `amount`, `description`, `category`, `vendor`, `payment_method`, `owner`, `receipt_url` (optional), `asset_category` (asset rows only), `asset_name` (asset rows only). User downloads the template from the page.
- **D-02:** The `category` column uses **account name matching** (case-insensitive). Unmatched categories are flagged and resolved via a **searchable dropdown** in the inline editor.
- **D-03:** The `owner` column matches against **system user names** (`users` table). Unmatched owners are resolved via a **user-select dropdown** in the inline editor.
- **D-04:** Bad rows are handled via **inline fix** — show an editable preview table where the user can correct invalid cells before confirming import. Error cells are highlighted red with error tooltips. This is the most polished UX option.

### Trust Mode UX (EXP-02, EXP-03)
- **D-05:** A **batch-level toggle** sets the default trust mode: "Already paid" (ON = auto-approve, creates expenses in `recorded` status with JEs immediately) vs OFF (creates expenses in `submitted` status, enters DoA approval queue).
- **D-06:** Each row has a **per-row override** in the preview table — user can flip individual rows after reviewing. The toggle column uses a simple click-to-toggle indicator.
- **D-07:** Toggle label should be **user-friendly** — "These expenses are already paid" / "Skip approval — record directly with journal entries". Not technical jargon like "auto-approve mode".
- **D-08:** **Admin and Manager** can use the auto-approve toggle. Other roles can upload but all rows go through approval.

### Asset Reclassification (EXP-04)
- **D-09:** Reclassifying a fixed asset creates both an **expense record** (status: `recorded`) AND its **journal entry**. The expense appears in Expense Analytics, has audit trail, and the NBV becomes the expense amount linked back to the asset.
- **D-10:** Target GL account is **auto-mapped from asset category** with a **dropdown override** — user can change the suggested account.
- **D-11:** Add `reclassify_to_expense` as a new disposal type in `disposeAsset` mutation alongside existing `sold`/`scrapped`/`written_off`.
- **D-12:** The reclassification JE: DR target expense account (NBV), DR accumulated depreciation, CR fixed asset cost. Different from existing disposal which uses gain/loss accounts (7300/7400).

### Upload Page Design
- **D-13:** **Evolve the existing HistoricalImportPage** (`src/pages/HistoricalImportPage.tsx`) into "Bulk Import". Same route (`/import`), renamed page, refreshed wizard flow.
- **D-14:** The existing `bulkCreateJournalEntries` mutation (`convex/journalImport/mutations.ts`) creates raw JEs — this is **deprecated/legacy**. Phase 71 creates a new mutation that produces actual expense records flowing through the expense lifecycle.
- **D-15:** The review step becomes an **editable spreadsheet table** — click any cell to edit (text input, date picker, searchable dropdown for category/owner). Uses same pattern as `editingCogsId` in MenuProductsManager.
- **D-16:** Keep existing patterns: template download, CoA reference download, drag-and-drop upload zone, batch progress with sequential batching, error/retry from failed batch.
- **D-17:** Row validation states: green left border (valid), amber (warning), red (error). Error cells highlighted red with tooltip. Import button disabled until all errors resolved.
- **D-18:** The `owner` field (expense submitter) must be present in both the **CSV upload columns** and the **asset reclassification flow**. Owner names match system users.

### Claude's Discretion
- Cell editing UX details (focus behavior, keyboard navigation between cells)
- Exact toggle styling and positioning within the summary bar
- Row selection/multi-select for bulk operations (if deemed useful)
- Whether to keep the "By GL Account" and "By Period" summary cards from the existing page or simplify

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Existing Page & Import Logic (to be evolved/replaced)
- `src/pages/HistoricalImportPage.tsx` — Current page, 5-step wizard shell to evolve
- `src/lib/csvImportValidation.ts` — CSV parsing + validation with Papa Parse, needs new columns (owner, category-by-name)
- `convex/journalImport/mutations.ts` — `bulkCreateJournalEntries` (LEGACY — creates raw JEs, not expense records)
- `src/hooks/convex/useJournalImport.ts` — Hook wrapping legacy mutation

### Expense System (target for new records)
- `convex/expenses/mutations.ts` — `createDraft`, `submitExpense` — the expense lifecycle the new import must produce
- `convex/expenses/helpers.ts` — `generateExpenseNumber`, `recordStatusChange`, `canApproveExpense` (DoA), fraud controls
- `convex/schema.ts` lines 1719-1777 — `expenses` table schema with status union and all fields
- `convex/expenses/auditTrail.ts` — Status change audit trail

### Fixed Asset Disposal (to be extended)
- `convex/fixedAssets/mutations.ts` — `disposeAsset` mutation, needs new `reclassify_to_expense` type
- `convex/fixedAssets/helpers.ts` — `calculateDisposalGainLoss`, `ASSET_CATEGORIES` with GL account mappings
- `convex/lib/journalEngine.ts` — `createJournalEntryWithLines` (JE-06 pattern)

### Inline Editing Pattern
- `src/pages/MenuProductsManager.tsx` — `editingCogsId` pattern for click-to-edit cells

### Auth & Users
- `convex/lib/auth.ts` — `requireRole()` for admin/manager restriction on auto-approve
- `convex/auth/queries.ts` — User list for owner dropdown matching

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `HistoricalImportPage.tsx` wizard shell: upload/validating/review/importing/complete/error states — reuse directly
- `csvImportValidation.ts` Papa Parse integration, `parseAndValidateCsv` — extend with new columns
- `chunkArray`, `downloadBlob`, `escapeCsv` helpers — keep as-is
- `groupByAccount`, `groupByPeriod` summary functions — may keep for summary cards
- shadcn `Table`, `Select`, `Switch`, `Badge`, `Progress`, `Card` components — all available
- `protectedMutation` wrapper — use for new bulk expense mutation
- `createJournalEntryWithLines` — reuse for JE creation on auto-approved expenses

### Established Patterns
- Wizard state machine via `useState<WizardState>` with union type — proven pattern
- Sequential batch processing with retry-from-failure — keep for new mutation
- `editingCogsId` click-to-edit pattern in MenuProductsManager — use for all editable cells
- `protectedMutation` with role arrays for admin/manager restriction

### Integration Points
- Route: `/import` in `src/App.tsx` — keep same route, update component name
- Permission: `canManageReimbursements` — keep (admin-only base, toggle check for manager)
- Expense lifecycle: new mutation creates expense records that enter existing approval/reimbursement flow
- Asset disposal: new disposal type slots into existing `disposeAsset` mutation

</code_context>

<specifics>
## Specific Ideas

- Page should feel like a **modern spreadsheet import tool** (Airtable CSV import UX reference)
- Toggle copy: "These expenses are already paid" with subtitle "Skip approval — record directly with journal entries"
- The editable preview table is the **star of the page** — data-dense, click-to-edit cells, color-coded validation
- Per-row trust column uses a simple visual indicator (checkmark = already paid, arrow = needs approval)
- Category dropdown should be **searchable** (account names can be long)
- Owner dropdown should list all system users by display name

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 71-bulk-expense-upload-asset-reclassification*
*Context gathered: 2026-04-10*
