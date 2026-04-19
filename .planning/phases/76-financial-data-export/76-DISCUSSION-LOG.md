# Phase 76: Financial Data Export - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-04-19
**Phase:** 76-financial-data-export
**Areas discussed:** Raw transaction scope, P&L multi-period layout, UI entry point, Role gate + file delivery

---

## Raw Transaction Scope

| Option | Description | Selected |
|--------|-------------|----------|
| GL lines only | ONE CSV from journalEntryLines joined with journalEntries + glAccounts. Columns: date, je_id, je_type, account_code, account_name, debit_idr, credit_idr, description, source_ref, source_doc_type. Accountant-standard, covers everything uniformly. | ✓ |
| Two files: revenue + JEs | externalRevenue rows + journalEntries summary rows. Literal roadmap reading but duplicates data. | |
| Source documents union | Five-section CSV with externalRevenue + expenses + payroll + settlements + manual JEs. Mixed schemas awkward. | |
| Both: GL lines + source docs | ZIP with both. Doubles implementation. | |

**User's choice:** GL lines only (recommended option)
**Notes:** Accountant-handoff mental model wins. GL is uniform (every movement is a debit or credit) and double-entry is accountant-native.

---

## P&L Multi-Period Layout

| Option | Description | Selected |
|--------|-------------|----------|
| Long format, one row per period | Existing csvExport.ts `period` column is the discriminator. Row per (period, section, channel, line_item). Zero new columns; Excel pivot-friendly. | ✓ |
| Wide format, periods as columns | One row per line_item, columns: Jan, Feb, Mar, …. Compact but unstable column count. | |
| Stacked sections with separators | Full P&L per period, blank-row separator. Human-readable but breaks Excel sort/filter. | |
| Granularity selector | User picks grain at export time (week/month/quarter). Most flexible; adds UI control. | |

**User's choice:** Long format (recommended option)
**Notes:** Consistent with Phase 75 schema. Zero schema change, Excel pivots naturally. We added a granularity selector separately (D-06) that lets the user pick weekly/monthly/custom — but the output grid stays long-format in all cases.

---

## UI Entry Point

| Option | Description | Selected |
|--------|-------------|----------|
| Dedicated /financials/export page | New route with export-type picker, date range, granularity. Linked from /financials header. Clean wizard pattern. | ✓ |
| Modal from /financials | Button opens modal. Cramped with multiple controls; modals lose URL-shareability. | |
| Two buttons in /financials header | "Export Current" + "Export Range". Minimal new UI but range-picker popover is cramped. | |
| Settings / admin page | Under /settings or /admin. Hidden from natural workflow. | |

**User's choice:** Dedicated /financials/export page (recommended option)
**Notes:** Matches the wizard pattern used for bank-reconciliation upload. Route-level role gate is cleaner than modal-level. URL is shareable for handoff.

---

## Role Gate + File Delivery

| Option | Description | Selected |
|--------|-------------|----------|
| admin only + per-file download | Most restrictive. Raw GL is sensitive. | |
| admin only + ZIP bundle | Same restriction; cleaner multi-file. Adds jszip dependency. | |
| manager + admin + per-file download | Matches /financials view access. Per-file via existing downloadCSV helper. No new dep. | ✓ |
| manager + admin + ZIP bundle | Widest access, cleanest multi-file. Adds dep. | |

**User's choice:** manager + admin + per-file browser download
**Notes:** Managers can already see the aggregates on /financials; raw GL transaction descriptions are one level deeper but still within manager responsibility. Per-file download reuses existing `downloadCSV` in `src/lib/csvExport.ts` — no jszip dependency added.

---

## Claude's Discretion

- XLSX format output (deferred per roadmap CSV-only lock)
- Pre-flight stats panel numbers/layout details
- Date preset button labels ("Last week" vs "Last 7 days")
- Filename date format (YYYYMMDD recommended)
- Internal Convex file organization for export queries
- Error surfacing / empty-range / no-data messages
- Exact styling of the export button on /financials

## Deferred Ideas

- XLSX output (CSV-only locked by roadmap; SheetJS installed if demand emerges later)
- ZIP bundling (user opted for per-file download)
- Scheduled / cron exports
- Source-document pivot exports (analytics, not data export)
- Signed share links / S3 upload
- Accountant-import-format presets (QuickBooks, Xero)
- Data Health hooks (Phase 77)
