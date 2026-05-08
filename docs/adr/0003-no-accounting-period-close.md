# No Accounting Period Close

## Status

accepted

## Context

Frollie's general ledger has shipped through Phase 75 with full accrual accounting: expense approval, payroll, depreciation, fixed-asset acquisition, bank-statement reconciliation, manual journal entries, and a P&L report (`convex/reports/incomeStatement.ts`) that recomputes from raw `journalEntryLines` on every read.

There is no concept of a closed accounting period anywhere in the codebase. No `closedPeriod` / `fiscalYearEnd` / `lockedPeriod` field exists on any table, and `validateJournalLines` performs no period check. A back-dated journal entry — including one dated to a prior fiscal year — is unconditionally accepted. Any line in any prior month can be edited or reversed at any time.

Bookkeeping is performed entirely by the system, not by a human accountant. Frollie is a single-actor PT operating without an external auditor. There is no statutory requirement today that prior periods be locked.

Period-close is the standard mechanism in conventional accounting systems for protecting the integrity of reported figures: once a period is closed, no postings into that period are accepted, and any correction must flow through a current-period adjusting entry. Its absence here is an implicit design choice that has held across ~30 phases of accounting work without surfacing as a problem.

## Decision

Frollie's GL operates **without period close**. Any journal entry can be posted to any business date. Any prior-period figure is recomputed from raw lines on every report read; reports are intentionally non-snapshotted.

The `journalEntries.date` field is the single source of period attribution. Reports filter on it; no separate "open / closed" state exists.

## Considered Options

- **Option A (chosen).** No period-close machinery. Reports recompute from raw `journalEntryLines` every time. Back-dated entries always succeed.
- **Option B (rejected for now).** Add a `closedPeriod` table or `accountingPeriods.isClosed` flag, validated at posting time in `validateJournalLines`. Require an explicit "open period for correction" workflow to amend prior periods. Add a snapshot table to freeze closed-period figures.

## Consequences

- **No protection against retroactive edits.** A user with `requireRole(... ["admin"])` can post a journal entry into 2024 today, and last year's P&L will silently change on next read. The mitigation is operational discipline, not technical enforcement.
- **No "force-open" workflow needed.** The corollary of the above. Adjusting entries are just normal entries with the right `date` — no special flow, no approval ceremony, no risk of users hitting "period closed" errors.
- **P&L is always live.** `aggregateWeek` / `fetchAndAggregate` always read from the same source of truth. There's no risk of the snapshot disagreeing with the raw lines, because there is no snapshot.
- **No statutory audit trail.** If Frollie needs an external auditor (Indonesian tax audit, due diligence for funding, acquisition diligence), this decision must be revisited. A reasonable migration path: introduce `accountingPeriods` with an `isClosed` flag, backfill historical periods as closed at the cutover, and add the validator check to `createJournalEntryWithLines`. The reversal entry path must keep working — `createReversalEntry` would need a "force into closed period" carve-out, since reversal entries reuse the original's `date` (JE-03).
- **Trigger to revisit.** External audit requirement, multi-actor bookkeeping (a human accountant joins), or a regulatory event (KAP audit, tax investigation, due diligence). Until then, the absence of period-close is a feature, not a bug.
