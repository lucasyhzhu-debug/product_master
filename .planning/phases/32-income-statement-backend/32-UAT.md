---
status: complete
phase: 32-income-statement-backend
source: 32-01-SUMMARY.md, 32-02-SUMMARY.md, 32-03-SUMMARY.md
started: 2026-03-02T12:12:00Z
updated: 2026-03-02T12:15:00Z
---

## Current Test

[testing complete]

## Tests

### 1. buildProductCOGSMap Export & Functionality
expected: `convex/lib/costCalculator.ts` exports `buildProductCOGSMap` that builds per-product COGS map from BOM components
result: pass

### 2. calculateWeekRange Export & Functionality
expected: `convex/lib/periodRange.ts` exports `calculateWeekRange` with Monday-start week boundaries and exclusive end
result: pass

### 3. getWeeklyIncomeStatement Query Exists
expected: `convex/reports/incomeStatement.ts` exports a registered Convex query `getWeeklyIncomeStatement`
result: pass

### 4. Confidence Classification System
expected: All financial figures tagged with exact/calculated/inferred/missing confidence levels
result: pass

### 5. Gap Analysis in Query Response
expected: Query returns unmapped products, zero-cost components, and missing channels inline with P&L data
result: pass

### 6. Index Range Bounds Applied Correctly
expected: All `.withIndex()` queries apply both `.gte()` and `.lt()` at index level (not post-scan `.filter()`)
result: pass

### 7. isActive Filtering on Component Types
expected: COGS map built from active component types only (inactive filtered before cost calculation)
result: pass

### 8. Dedup Before Promise.all
expected: Revenue IDs deduped via Set before parallel DB queries to avoid redundant reads
result: pass

### 9. TypeScript Type Check Passes
expected: `npm run type-check` (tsc --noEmit) completes with zero errors
result: pass

### 10. Production Build Passes
expected: `npm run build` (tsc + vite build) completes successfully
result: pass

### 11. Phase 32 Unit Tests Pass
expected: 10 unit tests for buildProductCOGSMap and calculateWeekRange pass
result: pass

### 12. Phase 32 Integration Tests Pass
expected: 11 integration tests for getWeeklyIncomeStatement pass (8 original + 3 from triple-review)
result: pass

### 13. Full Test Suite Green
expected: All 683 tests pass with 0 failures (662 baseline + 21 new)
result: pass

### 14. CHANGELOG.md Updated
expected: v1.5 Financial Statements unreleased section added with income statement backend entry
result: pass

### 15. API_REFERENCE.md Updated
expected: Reports: Income Statement section documenting getWeeklyIncomeStatement with WeekData, Deltas, GapAnalysis
result: pass

### 16. Triple Review Fixes Applied
expected: 13 issues from triple-review resolved in commit 73cf226 (index bounds, dedup, isActive, etc.)
result: pass

## Summary

total: 16
passed: 16
issues: 0
pending: 0
skipped: 0

## Gaps

[none]
