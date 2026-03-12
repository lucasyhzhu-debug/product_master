# Project Research Summary

**Project:** Frollie Recipe Master v1.7 -- Expense & Accounting
**Domain:** Employee expense management, double-entry accounting, and financial statement extension for an Indonesian FMCG snack company
**Researched:** 2026-03-12
**Overall confidence:** HIGH

## Executive Summary

This milestone adds expense tracking, double-entry accounting, reimbursement management, payroll journal entries, and extends the existing P&L (income statement) to include Operating Expenses, EBIT, and Net Income. The system currently has 65 Convex tables with 150 indexes, 26 pages, and ~131K LOC TypeScript. After v1.7, it will have 75 tables, ~174 indexes, 29 pages, and 3 new backend modules.

The technical stack requires zero new external dependencies. Everything needed -- file upload (receipts via Convex `_storage`), role-based auth (`requireRole`), real-time queries, and data visualization (Recharts) -- already exists in the codebase. The only "new" technology is the Web Crypto API for client-side SHA-256 receipt hashing, which is a browser built-in requiring no install. This makes v1.7 the lowest-risk milestone from a dependency perspective across all 7 milestones shipped so far.

The architecture is a hybrid model: Revenue (4xxx) and COGS (5xxx) continue to be computed via real-time aggregation from `externalRevenue` + BOM tables (the existing v1.5 pattern), while OpEx (6xxx) and Other Income/Expense (7xxx) are read from stored journal entry lines. The P&L query (`fetchAndAggregate`) is extended with 3 additional parallel queries in its `Promise.all` batch -- accounts lookup (36 rows), current period journal lines, and prior period journal lines. This adds negligible latency since all queries run in parallel and the journal line result sets are small at current scale (5-10 concurrent users).

A staff review identified 4 critical issues and 6 improvements. The two most architecturally significant are: (C1) reversal journal entries using `Date.now()` instead of the original business date, which would corrupt P&L across periods; and (C2) an N+1 query pattern where OpEx aggregation would issue 14 sequential DB reads (one per GL account). Both have clear solutions documented in ARCHITECTURE.md -- same-period reversal policy and single `by_entryDate` index query with in-memory grouping, respectively.

---

## Key Findings

**Stack:** Zero new dependencies. Convex file storage for receipts, Web Crypto API for SHA-256 hashing, existing Recharts for analytics charts. The most notable stack decision is what NOT to add -- no accounting library, no PDF generator, no separate database.

**Architecture:** Hybrid P&L (real-time revenue/COGS + stored OpEx journal lines) with a single-query aggregation pattern. 10 new tables, 24 new indexes (total 174). The `createJournalEntryWithLines` helper enforces denormalization and balance validation as the single creation path for all journal entries.

**Critical pitfall:** The reversal date bug (C1) is the highest-impact issue. Using `Date.now()` for reversal entries would post to the wrong accounting period, making both the original and reversal periods incorrect on the P&L. The fix is simple (use the original entry's `date` field), but missing it would require retroactive correction of all affected periods.

---

## Implications for Roadmap

Based on research, the milestone naturally divides into 7 phases with clear dependency chains. The key constraint is Convex's deploy-first-then-code pattern: schema must be deployed before any mutations can reference new tables, and seed data (Chart of Accounts) must exist before mutations can look up system accounts.

### Phase 1: Schema + Seed + Counters [Foundation]

**Rationale:** Convex requires tables to exist before mutations can reference them. The Chart of Accounts seed data is a prerequisite for all journal entry creation. Counter infrastructure (EXP-MMDD-NNN format) is needed by expense submission.

- Addresses: 10 new table definitions, 2 optional user fields, accounts:seedDefaults, counter helper
- Avoids: Pitfall "Schema deploy ordering" -- deploying mutations before tables exist causes runtime errors
- Risk: LOW -- purely additive schema changes, no migrations needed

### Phase 2: Journal Engine [Core Accounting]

**Rationale:** The journal entry system is the dependency for expenses, reimbursements, and payroll. Building it second (after schema) means all three consumers can develop against a tested, validated journal API. The `createJournalEntryWithLines` helper enforces denormalization (C2 fix) and balance validation as invariants.

- Addresses: JE creation helper, reversal helper (C1 fix), system account lookup (I6 fix), single-query aggregation (C2 fix)
- Avoids: Anti-pattern "direct journalEntryLines insertion" -- all JE creation through single helper

### Phase 3: Expense Lifecycle [Main Feature]

**Rationale:** This is the largest feature and has the most business logic (status transitions, DoA routing, fraud controls, receipt upload). It depends on the journal engine (Phase 2) because expense approval auto-generates journal entries. Building expenses before reimbursements is correct because reimbursements consume approved expenses.

- Addresses: Expense CRUD, status transitions, DoA routing, self-approval blocking, receipt upload with SHA-256 dedup, auto JE on approval
- Avoids: Pitfall "approval without JE" -- every approval must atomically create a journal entry

### Phase 4: Reimbursement + Payroll [Parallel Pair]

**Rationale:** Reimbursement and payroll are independent of each other but both depend on the journal engine (Phase 2) and expenses (Phase 3, for reimbursement only). They can be built in parallel by separate agents.

- Addresses: Reimbursement batch management, payroll JE generation, void/reversal for both
- Avoids: Pitfall "reimbursement without linked expenses" -- batch creation validates all expenses are in approved state

### Phase 5: Frontend Foundation [Sequential]

**Rationale:** Permission definitions must exist before route guards can reference them (addresses staff review I3). Hooks and routes depend on permission names being in the type system. This phase is sequential: permissions first, then hooks/routes.

- Addresses: 4 new ROLE_PERMISSIONS flags, 3 hooks, 3 lazy routes, Finance hub card
- Avoids: Pitfall "route before permission" -- TypeScript error if permission name doesn't exist in ROLE_PERMISSIONS

### Phase 6: Frontend Pages [Parallel Trio]

**Rationale:** ExpenseManager, ReimbursementManager, and ExpenseAnalytics have no shared state and can be built in parallel. All consume hooks from Phase 5.

- Addresses: Expense submission form, approval queue, reimbursement batch view, OpEx analytics dashboards
- Avoids: Pitfall "page without hook" -- hooks from Phase 5 must exist first

### Phase 7: P&L Integration + Verification [Final]

**Rationale:** This is the culmination phase where OpEx flows into the P&L view. It must be last because it depends on journal entries actually existing in the database (from expense approval in Phase 3) and the frontend rendering infrastructure (from Phase 6). End-to-end verification ensures the complete data flow: expense approval -> JE creation -> journal lines with denormalized entryDate -> fetchAndAggregate single-query -> WeekData extension -> FinancialStatement.tsx rendering.

- Addresses: fetchAndAggregate extension, WeekData type extension, FinancialStatement OpEx/EBIT/Net Income sections
- Avoids: Pitfall "N+1 in P&L query" -- uses single by_entryDate range scan with in-memory grouping

### Phase Ordering Rationale

- **Schema before everything:** Convex deploys require table definitions before mutation code
- **Journal engine before consumers:** Expenses, reimbursements, and payroll all create JEs
- **Expenses before reimbursements:** Reimbursement batches reference approved expenses
- **Permissions before routes:** TypeScript requires permission names in the type system before ProtectedRoute can reference them (I3)
- **P&L integration last:** Requires end-to-end data flow verification, depends on all prior phases

### Research Flags for Phases

- **Phase 2 (Journal Engine):** Standard double-entry pattern, but the single-creation-path enforcement and denormalization correctness need thorough testing. Recommend 8+ unit tests minimum.
- **Phase 3 (Expense Lifecycle):** Largest phase. The status transition matrix (6 states, 11 transitions) and DoA routing logic are the most complex business rules. May benefit from splitting into sub-phases if implementation plan exceeds 15 files.
- **Phase 7 (P&L Integration):** Modifies the `fetchAndAggregate` hot path. Needs careful testing to ensure existing Revenue/COGS data is unchanged while OpEx/Other data is correctly added.
- **All other phases:** Follow established codebase patterns with no additional research needed.

---

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | HIGH | Zero new dependencies. All technologies already in production use across 40 prior phases. Web Crypto API is a browser standard (no library risk). |
| Features | HIGH | Design spec validated by CPA advisory. All features map directly to established SME accounting workflows (expense submission, manager approval, batch reimbursement). No novel domain concepts. |
| Architecture | HIGH | Integration pattern verified by direct inspection of `fetchAndAggregate` (687 lines), `requireRole`, `useProtectedMutation`, `ProtectedRoute`, and `HubPage`. Schema change is purely additive. Index budget (174/unlimited) has no risk. |
| Pitfalls | HIGH | Staff review C1-C4 and I1-I6 findings all have architectural resolutions documented. Convex-specific pitfalls draw from 40 phases of production experience. The reversal date (C1) and N+1 query (C2) fixes are the highest-value findings. |

---

## Gaps to Address

- **Fraud control ML/scoring (C3 from staff review):** The design spec mentions fraud flags (duplicate detection, receipt hash dedup, round-number flagging) but the plan included phantom UI badges for ML-based fraud scoring that has no backend. Resolution: implement only the rule-based fraud flags (duplicate, hash, round-number) in v1.7. ML scoring deferred to future milestone.
- **Payroll tax withholding rules:** The design spec uses a simple "DR Salaries, CR Cash" journal template. Indonesian payroll has PPh 21 withholding requirements. For v1.7, the simple template is sufficient (the accountant handles tax externally). If payroll grows in scope, a future milestone should add tax calculation.
- **Multi-currency support:** All amounts are IDR. No multi-currency consideration in v1.7. This is correct for the current business (domestic FMCG) but would need addressing if the company expands internationally.
- **Audit report generation:** The journal entry system stores complete audit trails, but there is no export/report generation feature in v1.7. If auditors require formatted reports, a future phase should add PDF/Excel export of journal entries by period.
- **Period close/lock:** The design spec does not include an accounting period close mechanism. In v1.7, journal entries can be created for any date. A future milestone should add period locking to prevent retroactive entries in closed periods.

---

## Sources

### Primary (HIGH confidence -- direct codebase inspection)
- `convex/schema.ts` -- 65 tables, 150 indexes (line-by-line verification)
- `convex/reports/incomeStatement.ts` -- `fetchAndAggregate` pattern, `WeekData` type, parallel query structure
- `convex/lib/auth.ts` -- `requireRole` pattern, session management
- `src/lib/types.ts` -- `ROLE_PERMISSIONS` structure with 14 boolean flags
- `src/App.tsx` -- 21 lazy routes with `ProtectedRoute` pattern
- `src/pages/HubPage.tsx` -- `HUB_AREAS` card array
- `src/hooks/convex/useFinancials.ts` -- P&L data flow through `WeekData`
- `src/hooks/convex/useProtectedMutation.ts` -- auto token injection pattern
- `convex/feedback/mutations.ts` -- `generateUploadUrl` file upload pattern

### Secondary (HIGH confidence -- project documentation)
- `docs/superpowers/specs/2026-03-12-expense-accounting-system-design.md` -- complete design spec with 10 tables, 36-account CoA, expense lifecycle, DoA thresholds, journal templates
- `docs/reviews/staffreview-expense-accounting-plan-2026-03-12.md` -- C1-C4 critical issues, I1-I6 improvements, I3 wave parallelism fix
- `.planning/PROJECT.md` -- v1.7 milestone context, constraints, existing state

### Tertiary (context)
- `CLAUDE.md` -- project conventions, tech stack versions, common pitfalls (13 documented)
- `MEMORY.md` -- session memory with 40 shipped phases, schema state, key architecture decisions

---
*Research completed: 2026-03-12*
*Ready for roadmap: yes*
