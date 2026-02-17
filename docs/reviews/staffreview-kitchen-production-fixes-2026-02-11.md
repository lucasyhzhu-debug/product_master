# Staff Review: Kitchen Production Fixes — Targets, Boxing, and UX

**Date:** 2026-02-11
**Plan:** `C:\Users\Irfan\.claude\plans\nested-bouncing-grove.md`
**Reviewers:** Staff Developer (Implementation) + Principal Developer (Architecture)

---

## 1. Summary

**Overall Assessment:** Revise

The plan correctly identifies 4 real issues and proposes reasonable fixes. Root cause analysis is thorough and the implementation approach is sensible. However, there are 3 critical gaps: (1) the return-value capture for the new `warning` field is missing from the frontend handler code, (2) there are no tests planned for any of the changes, and (3) the plan contradicts the established toast pattern in CODE_STYLE.md without updating it. After addressing these, the plan is ready for implementation.

---

## 2. Critical Issues (Must Fix)

| # | Issue | Category | Location in Plan |
|---|-------|----------|------------------|
| 1 | Mutation return value not captured | Logic | Wave 2e |
| 2 | No testing plan | Testing | Missing entirely |
| 3 | CODE_STYLE.md conflict on toast pattern | Documentation | Wave 2d/2e |

**Details:**

### Issue 1: Mutation return value not captured

The plan adds a `warning` field to the `boxProducts` and `stickerProducts` return value (Wave 1b), then says to check `result.warning` in the frontend (Wave 2e). But the current handler discards the return value:

```typescript
// CURRENT (KitchenViewV2.tsx:122)
await boxProducts({ menuProductId, quantity });
// Return value discarded!
```

The plan must explicitly show:
```typescript
const result = await boxProducts({ menuProductId, quantity });
actionToast(`Boxed ${qty}`, event);
if (result?.warning) {
  actionToast('Low packaging stock', event, 'warning');
}
```

Same for `stickerProducts`.

**Recommendation:** Update Wave 2e to show the full `const result = await ...` pattern. Also verify `useProtectedMutation` preserves the return type (confirmed: it does via `FunctionReturnType<Mutation>`).

### Issue 2: No testing plan

The plan has zero tests. This is a "Missing" verdict. The changes include:
- A new schema field (`totalProducedOriginal`, `totalProducedBiteSized`)
- Modified mutation behavior (`addBallsToTray` cumulative tracking)
- Changed error handling semantics (`boxProducts`/`stickerProducts` non-fatal FIFO)
- New frontend computation (`productTargetTotals`)

All of these need backend tests at minimum. The non-fatal FIFO change is especially risky — silently swallowing FIFO errors could mask real inventory problems if not tested.

**Recommendation:** Add a Wave 2.5 (Tests) with:
- `addBallsToTray` cumulative counter: increment on positive, no change on negative (3 tests)
- `boxProducts` non-fatal FIFO: proceeds when FIFO throws, returns warning (2 tests)
- `stickerProducts` non-fatal FIFO: same pattern (2 tests)
- `getTrayInventory` returns cumulative fields (1 test)
- Regression: existing boxing/stickering behavior unchanged when FIFO has stock (2 tests)

Total: ~10 tests in `tests/convex/kitchenProduction.test.ts`

### Issue 3: CODE_STYLE.md contradicts proposed toast pattern

CODE_STYLE.md (line 739, 746-749) explicitly says:
> - `toast.error(message)` — for all error feedback (top-center via Sonner)
> - Never use `toast.success()` — use `actionToast()` instead

The plan proposes `actionToast(msg, event, 'error')` for ALL errors, directly contradicting the documented pattern. The pattern was established as a deliberate design choice (errors should be prominent/persistent, not floating/transient).

**Recommendation:** Either:
- **(A) Keep `toast.error()` for fatal errors, use `actionToast` error variant only for non-fatal warnings** — this preserves the design intent. Fatal errors (auth, insufficient balls) stay as prominent Sonner toasts. Non-fatal warnings (packaging shortage after successful boxing) use the new warning variant.
- **(B) Update CODE_STYLE.md** to reflect the new pattern if the user truly wants ALL errors near the button.

Option A is recommended — it gives the best UX: fatal errors demand attention (top-center, persistent), warnings are contextual (near button, transient).

---

## 3. Improvements (Recommended)

| # | Improvement | Impact | Effort |
|---|-------------|--------|--------|
| 1 | Handle `removeBallFromTray` mutation | Medium | Low |
| 2 | Log packaging warnings in productionLog | Medium | Low |
| 3 | Extract productTargetTotals computation into shared utility | Medium | Low |
| 4 | Handle dual actionToast timing collision | Medium | Low |

**Details:**

### Improvement 1: Handle `removeBallFromTray` mutation

The plan updates `addBallsToTray` to track cumulative production but doesn't mention `removeBallFromTray` (kitchen.ts:194-230). This separate mutation removes one ball from the tray. It should NOT decrement the cumulative counter either. Add this to Wave 1a.

### Improvement 2: Log packaging warnings in productionLog

When `consumeBatchMaterials` fails and boxing proceeds anyway, the plan only returns a frontend warning. There's no audit trail for the packaging shortage. Add a `productionLog` entry:
```typescript
if (packagingWarning) {
  await ctx.db.insert("productionLog", {
    menuProductId: args.menuProductId,
    action: "box",
    quantity: Math.abs(args.quantity),
    timestamp: Date.now(),
    performedBy: user.name,
    note: `packaging-shortage:${packagingWarning}`,
  });
}
```

This preserves the existing audit pattern and makes shortages visible in the production log.

### Improvement 3: Extract productTargetTotals computation

The `productTargetTotals` computation in `KitchenViewV2.tsx` duplicates the same order+consignment+gofood aggregation done in `ProductionLogPanel` (lines 317-348). Compute it once in `KitchenViewV2.tsx` and pass to both panels to avoid inconsistency.

### Improvement 4: Handle dual actionToast timing collision

The plan shows:
```typescript
actionToast(`Boxed ${qty}`, event);
if (result.warning) {
  actionToast('Low packaging stock', event, 'warning');
}
```

Two `actionToast` calls targeting the same button will overlap visually (both positioned relative to the same element). Either:
- Add a small delay (150ms) before the warning toast
- Or combine into a single message: `actionToast('Boxed 5 (packaging low)', event, 'warning')`

---

## 4. Refinements (Minor Suggestions)

- Consider adding `totalProducedOriginal`/`totalProducedBiteSized` to the daily reset logic if one exists (so cumulative resets each day with the tray)
- The delta text "On target (30/30 made)" is good — also consider "25/30 made" without prefix when in progress (shorter for mobile)
- The `productTargetTotals` prop name is fine but `boxingTargets` would be more concise

---

## 5. Duplication Analysis

### Existing Code to Leverage
| Existing Code | Location | How to Use |
|---------------|----------|------------|
| `actionToast` | `src/lib/actionToast.ts` | Extend with type param (already planned) |
| `FlipNumber` | `src/components/kitchen/FlipNumber.tsx` | Use for targets in BoxingPanel |
| `productionLog` insert pattern | `convex/orders/mutations/kitchen.ts:382-389` | Reuse for packaging shortage audit |
| `useProtectedMutation` | `src/hooks/convex/useProtectedMutation.ts` | Already used; preserves return type |

### Potential Duplication Risks
- `productTargetTotals` computation duplicates `ProductionLogPanel` demand aggregation — extract shared
- `BallCounterSection` delta logic will have TWO sources of truth (tray count vs cumulative) — clear naming needed

---

## 6. Phase/Wave Accuracy

| Phase | Assessment | Notes |
|-------|------------|-------|
| Wave 1: Backend | Good | Sequential is correct — schema must deploy before mutations |
| Wave 2: Frontend | Needs Adjustment | 2e depends on 2d (actionToast must have error variant before handlers use it) |
| Wave 3: Verification | Good | Standard pattern |

**Ordering Issues:**
- Wave 2e (update handlers) depends on Wave 2d (extend actionToast) — should be sequential, not parallel

**Missing Phases:**
- Wave 2.5: Tests — must be added (see Critical Issue 2)

---

## 7. Specialist Agent Recommendations

| Phase | Recommended Agent | Rationale |
|-------|-------------------|-----------|
| Wave 1 (Backend) | `convex-backend` | Schema + mutation changes |
| Wave 2 (Frontend) | `react-ui-builder` | Component + hook changes |
| Wave 2.5 (Tests) | `tdd-test-architect` | Backend test coverage |
| Wave 3 (Verification) | `code-auditor` | Type check + pattern compliance |

---

## 8. Git Workflow Assessment

### Branch Strategy
| Assessment | Status |
|------------|--------|
| Feature branch specified | ✅ Yes (`feature/gofood-kitchen-integration`) |
| Branch naming convention | ⚠️ Reusing existing branch — consider separate fix branch |
| Merge strategy documented | ✅ Implicit (same PR) |

### Commit Strategy
| Phase | Expected Commits | Commit Type | Notes |
|-------|------------------|-------------|-------|
| Wave 1 | 1 | fix | Schema + mutation changes together (atomic) |
| Wave 2 | 1 | fix | All frontend fixes together |
| Wave 2.5 | 1 | test | Test coverage |

### Recommended Commit Checkpoints
1. After Wave 1: `fix(kitchen): track cumulative production + make FIFO non-fatal`
2. After Wave 2: `fix(kitchen): restore ball targets, add boxing targets, improve error UX`
3. After Wave 2.5: `test(kitchen): add production tracking and non-fatal FIFO tests`

### Pre-Push Verification
- [x] Plan includes `npm run build` check
- [x] Plan includes `npm run type-check` verification
- [ ] Plan includes `npm run test` — MISSING (see Critical Issue 2)

### CI/CD Considerations
| Concern | Assessment |
|---------|------------|
| Rollback strategy | ✅ Additive schema changes (optional fields) |
| Deployment order | ✅ Backend before frontend |
| Data backup needed | No |
| Migration safety | ✅ Safe — all new fields are `v.optional()` |

---

## 9. Documentation Checkpoints

| Phase | Documentation Update Required |
|-------|-------------------------------|
| Wave 1 | `docs/SCHEMA.md` — add `totalProducedOriginal`/`totalProducedBiteSized` to kitchenInventory |
| Wave 2 | `docs/CODE_STYLE.md` — update toast pattern if changing error behavior |
| All | `docs/CHANGELOG.md` — required |

### CHANGELOG.md Entry (Draft)
```markdown
## 2026-02-11 - Kitchen Production Fixes

**Bug fixes and UX improvements for the kitchen production pipeline.**

- Fixed ball targets showing 0 when production unit targets exist (now uses MAX of per-product demand and unit-level targets)
- Fixed ball counter resetting to "need more" after boxing (added cumulative production tracking)
- Fixed boxing/stickering blocked by reserved stock (FIFO consumption now non-fatal with warning)
- Improved error notifications: human-friendly copy, positioned near the action button
- Added per-product boxing targets to the Boxing panel

**Files Modified:**
- `convex/schema.ts` — added cumulative production fields to kitchenInventory
- `convex/orders/mutations/kitchen.ts` — cumulative tracking, non-fatal FIFO
- `convex/orders/queries.ts` — return cumulative fields from getTrayInventory
- `src/components/kitchen/ProductionLogPanel.tsx` — use productionTargets, cumulative delta
- `src/components/kitchen/BoxingPanel.tsx` — per-product target display
- `src/pages/KitchenViewV2.tsx` — compute targets, friendly error copy
- `src/lib/actionToast.ts` — error/warning variants
```

---

## 10. Testing Plan Assessment

**Overall Testing Verdict:** Missing

### Planned Tests
| Layer | What's Tested | Test Type | Status |
|-------|---------------|-----------|--------|
| Backend | Schema fields | convex-test | Missing |
| Backend | addBallsToTray cumulative | convex-test | Missing |
| Backend | boxProducts non-fatal FIFO | convex-test | Missing |
| Backend | stickerProducts non-fatal FIFO | convex-test | Missing |
| Backend | getTrayInventory cumulative | convex-test | Missing |
| Frontend | BallCounterSection delta logic | Vitest | Missing |
| Frontend | actionToast error/warning | Vitest | Missing |
| Integration | Full boxing flow | Manual | Missing |

### Missing Test Coverage (Must Add)

| # | Missing Test | Why It Matters | Suggested Approach |
|---|--------------|----------------|-------------------|
| 1 | `addBallsToTray` cumulative increment | Core behavioral change — must verify positive increments only | convex-test: add 10, check totalProduced=10; remove 5, check totalProduced still 10 |
| 2 | `boxProducts` non-fatal FIFO | Risk of silently masking real inventory issues | convex-test: set up product with no packaging stock, box it, verify success + warning |
| 3 | `stickerProducts` non-fatal FIFO | Same risk as above | convex-test: same pattern |
| 4 | `getTrayInventory` cumulative fields | Ensures backward compat for records without new fields | convex-test: query before and after addBalls |
| 5 | Regression: boxing WITH stock | Verify normal flow still consumes FIFO correctly | convex-test: set up stock, box, verify FIFO consumed, no warning |

### Test Execution Checkpoints
1. After Wave 1: `npm run test` (verify existing + new backend tests)
2. After Wave 2: `npm run build` (frontend compiles)
3. Before merge: `npm run test && npm run build`

### Regression Risk
- Existing `tests/convex/inventory.test.ts` — verify FIFO tests still pass
- Existing kitchen flow: boxing with stock should still consume FIFO (no regression to always-skip)
- Ball counter display: tray count must still show current value (not cumulative)

---

## 11. Edge Cases to Address

The plan should explicitly handle:

- [ ] Daily reset: when `kitchenInventory` resets for a new day, cumulative counters should also reset (they're per-date already since each date has its own record)
- [ ] `getOrCreateTodayInventory` helper creates records without cumulative fields — must include `totalProducedOriginal: 0, totalProducedBiteSized: 0`
- [ ] `boxProducts` negative flow (undo): currently deducts from tray — should NOT deduct from cumulative counter (plan says this but verify `removeBallFromTray` mutation too)
- [ ] Two actionToasts fired simultaneously overlap — need visual separation
- [ ] `productionTargets` prop being `undefined` during loading — the `?.find()` handles this, but verify `Math.max(0, undefined ?? 0)` doesn't produce NaN
- [ ] Products with BOTH `big` and `mid` ball components (unlikely but theoretically possible) — current BOM lookup only stores last ball type

---

## 12. Approval Conditions

**For Approval, address:**
1. **Capture mutation return value** in `handleBoxProducts`/`handleStickerProducts` (Critical Issue 1)
2. **Add testing wave** with at minimum 10 backend tests (Critical Issue 2)
3. **Decide toast pattern** for errors — either keep `toast.error()` for fatal + new variant for warnings, or update CODE_STYLE.md (Critical Issue 3)

**Recommended before implementation:**
1. Handle `removeBallFromTray` and `getOrCreateTodayInventory` for cumulative fields
2. Log packaging warnings in productionLog for audit trail
3. Address dual-actionToast visual collision
4. Update `docs/SCHEMA.md` for new kitchenInventory fields

---

*Generated by /staffreview skill*
*Staff Developer Review + Principal Developer Review*
