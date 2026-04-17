---
quick: 260416-jm7
review_date: 2026-04-16
reviewer: gsd-code-reviewer
depth: quick
files_reviewed: 4
files_reviewed_list:
  - tests/convex/gobizAdapter.test.ts
  - tests/convex/k3martCockpit.test.ts
  - convex/bigsellerOrders/__tests__/integration.test.ts
  - src/lib/__tests__/csvImportValidation.test.ts
findings:
  critical: 0
  important: 1
  minor: 2
  nitpick: 1
status: issues_found
---

# Quick 260416-jm7 — Test Debt Cleanup Review

## Summary

Four test-only fixes restoring 17 failures to green. All fixes are targeted and correct in intent. Production code untouched. Three of the four fixes are clean; the BigSeller commission assertion change weakens the test more than necessary and should be tightened. CSV fixture updates are valid per the validator. The k3martCockpit delete is safe — the underlying query is genuinely gone from production and git preserves the tests if needed.

---

## Findings

### IMP-01 (Important): BigSeller commission assertion is weaker than necessary

**File:** `convex/bigsellerOrders/__tests__/integration.test.ts:112`

**Issue:** The fix changed `expect(revenue.commission).toBeGreaterThanOrEqual(0)` to `expect(revenue.commission).toBeDefined()`. This now passes for literally any value including `NaN`, `null`, `undefined` (wait — `toBeDefined` rejects undefined, but accepts NaN/null). The test no longer verifies anything meaningful about the commission pass-through semantics described in the comment.

`mapOrderToRevenue` does `commission: order.commissionFee ?? 0`. The fixtures have `commissionFee: -9750, -5250, -5400`. A correct, tighter assertion verifies pass-through:

**Fix:**
```ts
// Commission passes through unchanged (negative = deduction until normalizePlatformFees runs)
expect(revenue.commission).toBe(order.commissionFee ?? 0);
```

This preserves original test intent (asserting correctness of mapping) without the implicit normalization assumption that broke the old assertion. `toBeDefined` is too lax — it would still pass if `mapOrderToRevenue` returned garbage like `NaN` or the wrong field.

---

### MIN-01 (Minor): Error-case CSV tests still use pre-Phase-72 header format

**File:** `src/lib/__tests__/csvImportValidation.test.ts:121-174, 202-208`

**Issue:** Seven error-case tests (missing description, negative amount, non-integer amount, unknown accountCode, inactive accountCode, invalid date, empty CSV) were NOT updated and still use CSVs without `paymentMethod,submitterName` columns:

```ts
const csv = `date,amount,description,accountCode
2026-01-15,50000,,6100`;
```

These currently pass because each targeted error (missing description, negative amount, etc.) is detected BEFORE the paymentMethod check in `parseAndValidateCsv`. The suite is green.

However, this is fragile: if anyone reorders validation in the validator (e.g., moves paymentMethod check earlier, or adds a pre-flight required-columns check), these tests will fail with "Missing paymentMethod" instead of the expected error message. The tests would then be testing the wrong thing without anyone noticing, since each only asserts `errors[0].error.toLowerCase()` contains a keyword.

**Fix:** For consistency and robustness, update these 7 fixtures to include `paymentMethod,submitterName` columns with valid values, matching the pattern used in the happy-path fixtures. Not urgent (all pass today), but cleanup debt.

---

### MIN-02 (Minor): BigSeller test comment is slightly misleading

**File:** `convex/bigsellerOrders/__tests__/integration.test.ts:111`

**Issue:** New comment says "BigSeller passes values through unchanged; negative = deduction". This is true for `mapOrderToRevenue` called directly on raw rows (as the test does), but not for the production path where `normalizePlatformFees` runs first and converts commissions to positive for TikTok/Lazada. A future reader might conclude negative commissions persist end-to-end.

**Fix:** Clarify the comment to state the test operates on pre-normalization data:
```ts
// Commission passes through mapOrderToRevenue unchanged (sign is normalized
// upstream by normalizePlatformFees, not exercised in this unit test)
```

---

### NIT-01 (Nitpick): Deleted k3martCockpit tests had 4 scenarios worth preserving if function is re-added

**File:** `tests/convex/k3martCockpit.test.ts` (historical)

**Issue:** The 4 deleted tests covered useful scenarios (outlet filter, date filter, no filters, limit parameter) for a generic history query. If a future phase re-adds `getStockMovementHistory` (e.g., for an admin stock history page), these tests are gone and would need to be rewritten from scratch.

Git history and the `.claude/worktrees/debug-kitchen-dedupe-round2/` copy preserve them — so the information is recoverable. No action required, but worth noting in the summary that these specific test patterns should be referenced if a similar query is re-added.

**Status:** Accept as-is. Deletion is correct for dead-code hygiene. Flagging for awareness only.

---

## Other Checks Performed

- **saveRevenue return shape:** Verified `convex/externalData/mutations.ts:90-124` returns `Array<{id: string, isNew: boolean}>`. The `ids[0].id` change in gobizAdapter is correct.
- **paymentMethod validity:** Verified `employee_paid` is in `VALID_PAYMENT_METHODS` in `src/lib/csvImportValidation.ts:21-25`. The `submitterName` field only requires non-empty string (no user-list lookup), so `"Admin"` is valid.
- **getStockMovementHistory truly gone:** `grep -r getStockMovementHistory convex/ src/` returns no matches. Underlying `k3martStockMovements` table is still accessed via `getOutletDetail` (queries.ts:574) but not via a dedicated history query.
- **Related tests for BigSeller commission:** No other tests in `convex/bigsellerOrders/` assert `commission >= 0`, so no follow-up cleanup needed there.
- **Fixture row count:** 10 CSV fixtures updated as stated in summary. Asset-category and error-path tests correctly left unchanged (asset tests don't exist in this file; error tests trip earlier in validation).

---

## Recommendation

Ship as-is. Address IMP-01 opportunistically (2-line tightening). MIN-01 and MIN-02 are low-priority housekeeping. NIT-01 is awareness only.

No production risk. Suite is genuinely 1506/1506 green.
