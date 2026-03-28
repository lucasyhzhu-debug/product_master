# GSD Debug Knowledge Base

Resolved debug sessions. Used by `gsd-debugger` to surface known-pattern hypotheses at the start of new investigations.

---

## income-statement-commissions-ebitda-margins -- Margin denominator wrong + EBITDA missing
- **Date:** 2026-03-28
- **Error patterns:** margin, grossMarginPercent, netRevenue denominator, EBITDA missing, ebitMarginPercent, netMarginPercent, income statement
- **Root cause:** All margin calculations in incomeStatement.ts divided by netRevenue instead of totalGross. EBITDA line was never computed despite depreciation (6150) and amortization (6160) data being available in OpEx journal aggregation.
- **Fix:** Changed margin denominators from netRevenue to totalGross in 4 locations (backend grossMarginPercent/ebitMarginPercent/netMarginPercent + frontend ChannelRow per-channel margin). Added EBITDA = EBIT + D&A with margin row and CSV export.
- **Files changed:** convex/reports/incomeStatement.ts, src/components/financials/ChannelRow.tsx, src/pages/FinancialStatement.tsx, src/lib/csvExport.ts, tests/convex/incomeStatement.test.ts
---
