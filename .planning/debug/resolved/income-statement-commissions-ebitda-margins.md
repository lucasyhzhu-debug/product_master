---
status: resolved
trigger: "Income Statement has three related issues: (1) Gross Revenue numbers are missing platform commissions; (2) No EBITDA line exists; (3) Margins calculated using net revenue instead of gross revenue"
created: 2026-03-28T00:00:00Z
updated: 2026-03-28T00:10:00Z
---

## Current Focus

hypothesis: ROOT CAUSE CONFIRMED — three distinct bugs, all in incomeStatement.ts backend + ChannelRow.tsx frontend
test: All three confirmed by code reading
expecting: N/A — moving to fix phase
next_action: Implement fixes for all three issues in backend and frontend

## Symptoms

expected: |
  1. Gross Revenue in Income Statement should include platform commissions (GoFood, Shopee, Tokopedia take commissions). Revenue per channel should show pre-commission amounts, with commissions appearing as a separate deduction line.
  2. An EBITDA line should exist in the Income Statement below Operating Income.
  3. Gross Margin % and other margin calculations should use Gross Revenue as the denominator, not net revenue.

actual: |
  1. Gross Revenue shows Rp 20,446,600 for week of Mar 23-29. Channels like Direct, K3 Mart, Shopee, Tokopedia show COGS of Rp 0. Deductions section shows Rp 4,251,388 but unclear if includes platform commissions. Gross revenue may already be net of commissions.
  2. No EBITDA line exists anywhere in the statement.
  3. Gross Margin for GoFood shows 58.0% — likely uses net revenue denominator instead of gross revenue.

errors: No runtime errors — data/logic issue in income statement calculation.

reproduction: Go to Income Statement page, select Weekly view, look at any week. Compare revenue figures with Sales Dashboard for same period.

started: Income Statement built in Phase 33-34 (v1.5). Sales Dashboard with gross/net split built in v1.4. Commission data exists but not surfaced correctly.

## Eliminated

- hypothesis: revenueGross in externalRevenue is already net-of-commission (would mean Issue 1 is a data issue)
  evidence: Traced all sync adapters — GoBiz uses txn.gross (hit.amount/100, pre-commission), BigSeller uses order.orderAmount (total buyer paid incl. shipping, pre-commission), internal uses order.totalAmount (pre-discount). Commission is stored separately in the commission field. The data IS correctly storing gross revenue.
  timestamp: 2026-03-28T00:03:00Z

## Evidence

- timestamp: 2026-03-28T00:01:00Z
  checked: incomeStatement.ts line 446-447 — grossMarginPercent calculation
  found: `grossMarginPercent = netRevenue !== 0 ? (grossProfit / netRevenue) * 100 : null` — uses netRevenue as denominator
  implication: CONFIRMED Issue 3 — margin uses net revenue denominator, should use totalGross

- timestamp: 2026-03-28T00:01:00Z
  checked: WeekData interface in incomeStatement.ts lines 63-88
  found: No EBITDA field exists. Only ebit (EBIT = grossProfit - totalOpEx). Depreciation is account 6150 (opex type), Amortization is 6160 (opex type). EBITDA = EBIT + depreciation + amortization amounts.
  implication: CONFIRMED Issue 2 — EBITDA line is missing

- timestamp: 2026-03-28T00:01:00Z
  checked: Platform channel aggregation in incomeStatement.ts lines 268-278
  found: revenueGross IS truly gross (pre-commission). commission is separate. The data model is correct.
  implication: Issue 1 is PARTIALLY confirmed — the data is correct, but the user sees that some channels show $0 commissions. This means the income statement is correctly displaying gross revenue, but the user may be confused because the deductions section groups commission/ad/promo separately.

- timestamp: 2026-03-28T00:03:00Z
  checked: GoBiz adapter (gobiz/helpers.ts line 261-282, gobiz/adapter.ts line 387)
  found: GoBiz txn.gross = hit.amount/100 (pre-commission value from GoFood API). txn.commission and txn.net are separate. revenueGross stores true gross.
  implication: GoBiz/GoFood data correctly has both gross and commission

- timestamp: 2026-03-28T00:03:00Z
  checked: BigSeller adapter (bigseller/helpers.ts line 348-381)
  found: revenueGross = orderAmount (total buyer paid incl. shipping). commission = commissionFee. These are separate fields.
  implication: BigSeller (Shopee/TikTok) data correctly has both gross and commission

- timestamp: 2026-03-28T00:03:00Z
  checked: ChannelRow.tsx lines 51-56 — per-channel gross margin calculation
  found: `channelGrossMargin = channel.netRevenue !== 0 ? (channelGrossProfit / channel.netRevenue) * 100 : null` — uses channel.netRevenue as denominator, same bug as backend
  implication: Per-channel gross margin ALSO uses net revenue denominator — needs fixing

- timestamp: 2026-03-28T00:04:00Z
  checked: incomeStatement.ts lines 453-454 — ebitMarginPercent calculation
  found: `ebitMarginPercent = netRevenue !== 0 ? (ebit / netRevenue) * 100 : null` — also uses netRevenue
  implication: EBIT margin ALSO uses net revenue denominator — should use totalGross

- timestamp: 2026-03-28T00:04:00Z
  checked: incomeStatement.ts lines 457-458 — netMarginPercent calculation
  found: `netMarginPercentValue = netRevenue !== 0 ? (netIncomeValue / netRevenue) * 100 : null` — also uses netRevenue
  implication: Net margin ALSO uses net revenue — should use totalGross for consistency

- timestamp: 2026-03-28T00:05:00Z
  checked: accounts/mutations.ts lines 48-49 — depreciation/amortization account codes
  found: Account 6150 = "Depreciation Expense" (type opex), Account 6160 = "Amortization Expense" (type opex). Both are in the opex journal aggregation. Need to extract these specific amounts to compute EBITDA = EBIT + depreciation_amount + amortization_amount.
  implication: D&A amounts can be extracted from the existing opex journal line aggregation by matching account codes 6150 and 6160

## Resolution

root_cause: |
  Three confirmed issues:

  1. REVENUE DATA IS CORRECT (not a bug). The revenueGross field in externalRevenue truly stores pre-commission gross amounts. Commissions are stored separately and displayed in the Deductions section. The user's confusion may stem from channels showing $0 COGS, not a commission problem. NO FIX NEEDED for Issue 1.

  2. EBITDA LINE MISSING. The income statement computes EBIT (grossProfit - totalOpEx) but does not compute EBITDA (EBIT + Depreciation + Amortization). Depreciation (6150) and Amortization (6160) are already captured in the opex journal aggregation — their amounts just need to be extracted and added back to EBIT.

  3. ALL MARGIN CALCULATIONS USE WRONG DENOMINATOR. Three places in incomeStatement.ts and one in ChannelRow.tsx compute margins using netRevenue instead of totalGross:
     - grossMarginPercent (line 447): grossProfit / netRevenue — should be grossProfit / totalGross
     - ebitMarginPercent (line 454): ebit / netRevenue — should be ebit / totalGross
     - netMarginPercent (line 458): netIncome / netRevenue — should be netIncome / totalGross
     - ChannelRow.tsx (line 54): channelGrossProfit / channel.netRevenue — should be channelGrossProfit / channel.gross

fix: |
  Backend (convex/reports/incomeStatement.ts):
  - Add EBITDA computation: extract depreciation (6150) and amortization (6160) from opex items, compute ebitda = ebit + depreciationAmount + amortizationAmount
  - Add ebitda, ebitdaMarginPercent, depreciationAmount, amortizationAmount to WeekData interface
  - Fix grossMarginPercent: divide by totalGross instead of netRevenue
  - Fix ebitMarginPercent: divide by totalGross instead of netRevenue
  - Fix netMarginPercent: divide by totalGross instead of netRevenue
  - Add ebitda delta computation

  Frontend (src/pages/FinancialStatement.tsx):
  - Add EBITDA row between EBIT and Other Income/Expense section
  - Add EBITDA Margin % row

  Frontend (src/components/financials/ChannelRow.tsx):
  - Fix channel gross margin: divide by channel.gross instead of channel.netRevenue

  Frontend (src/lib/csvExport.ts):
  - Add EBITDA row to CSV export
  - Add EBITDA Margin % row to CSV export

verification: |
  - npm run build: passes (clean, no errors)
  - npm run type-check: passes (clean)
  - tests/convex/incomeStatement.test.ts: 19/19 pass (updated test expectation for new margin denominator)
  - Pre-existing failures in k3martCockpit, csvImportValidation, bigsellerOrders are unrelated

files_changed:
  - convex/reports/incomeStatement.ts
  - src/components/financials/ChannelRow.tsx
  - src/pages/FinancialStatement.tsx
  - src/lib/csvExport.ts
  - tests/convex/incomeStatement.test.ts
