# Quick Task 260407-p1w: Add pieces sold metric to sales analytics - Context

**Gathered:** 2026-04-07
**Status:** Ready for planning

<domain>
## Task Boundary

Add a "Pieces Sold" hero card to the sales analytics overview that shows BOM-resolved component counts (e.g., triples = 3 pieces, singles = 1 piece) filtered by the selected date range. Same logic as the all-time "Balls Sold" lifetime card but period-filtered with growth comparison.

</domain>

<decisions>
## Implementation Decisions

### Calculation Method
- Direct BOM count from externalRevenueItems linked to period externalRevenue records
- Join with menuProductComponents + componentTypes (category="production") to resolve ball counts per product
- For items without linkedMenuProductId, use estimation (period revenue portion / avgRevenuePerBall) as fallback
- This mirrors the lifetime computeLifetimeTotals() approach but scoped to a date range

### Card Placement
- Add "Pieces Sold" as a new period-filtered hero card in the TOP section (alongside Gross Sales, Net Sales, etc.)
- Keep the existing lifetime "Balls Sold" card unchanged in the bottom lifetime section
- Position after Delivery Fees, before lifetime section

### Growth Indicator
- Show period-over-period growth comparison (GrowthIndicator component) like Gross Sales and Net Sales cards
- Compare current period pieces vs previous period pieces

### Naming
- Label: "Pieces Sold"
- Subtitle: show count breakdown or period label

</decisions>

<specifics>
## Specific Ideas

- Reuse computeLifetimeTotals logic from convex/externalData/helpers/lifetimeHelpers.ts but parameterized for period filtering
- Add totalPiecesSold to PeriodData type and getDashboardSummaryByPeriodInternal query
- Use CircleDot icon (same as lifetime Balls Sold) for visual consistency

</specifics>
