# Staff Review: Phase 29-01 — Schema Migration + Consignment Backend

**Date:** 2026-02-28
**Plan:** `.planning/phases/29-consignment-settlements/29-01-PLAN.md`
**Reviewers:** Staff Developer (Implementation) + Principal Developer (Architecture)

---

## 0. Plan Validation

```
PLAN VALIDATION CHECKLIST
═════════════════════════

✅ Git Workflow section exists?
  → Branch name specified? Yes (feature/phase-29-consignment-settlements)
  → Checkpoint strategy defined? Yes (after schema, after backend, after dispatch migration)

✅ Implementation Waves section exists?
  → Agents assigned? Yes
  → File paths specified? Yes
  → PARALLEL/SEQUENTIAL marked? Yes (SEQUENTIAL noted)

✅ Documentation Updates section exists?
  → CHANGELOG.md checkbox? Yes

✅ Success Criteria section exists?
  → Type check requirement? Yes
  → Build requirement? Yes

═════════════════════════
```

**Plan structure validated.** Proceeding to review.

---

## 1. Summary

**Overall Assessment:** Revise (minor)

The plan is well-structured and covers the core requirements (CON-01 through CON-04 backend). The schema migration strategy is sound, the revenue bridge pattern follows established precedent from GrabFood/BigSeller, and the dispatch planner migration is correctly scoped. However, there are critical gaps in testing coverage (only pure helper tests, no mutation/query integration tests), a missing `docs/SCHEMA.md` documentation update, and the `actionToast` pattern from CODE_STYLE.md should be flagged for the frontend plan's awareness. The `externalId` generation for outlets uses `Date.now()` which risks collision in rapid-fire testing.

---

## 2. Critical Issues (Must Fix)

| # | Issue | Category | Location in Plan |
|---|-------|----------|------------------|
| 1 | Testing covers only pure helpers — no mutation/query integration tests | Testing | Step 6, behavior section |
| 2 | `externalId: "consignment-" + Date.now()` is not unique under rapid creation | Logic | Step 2a (createOutlet) |
| 3 | Missing `docs/SCHEMA.md` in Documentation Updates | Documentation | Documentation Updates section |

**Details:**

### Issue 1: Testing covers only pure helpers — no mutation/query integration tests

The plan only tests `computeSettlementMath` and `shouldAutoArchive` — both are trivial pure functions. The actual critical business logic lives in the mutations:
- `createOutlet` creates dual records (consignmentOutlets + externalOutlets) with cross-linking — if either insert fails, data is orphaned
- `createSettlement` creates an externalRevenue record and links it via `linkedRevenueId` — the revenue bridge is the phase's most important integration
- `markAsPaid` auto-archives event outlets — a conditional side-effect that touches two tables
- `updateSettlement` must sync linked externalRevenue — if the patch is missed, analytics diverge
- `deleteSettlement` must cascade-delete the externalRevenue record

Testing only pure helpers is like testing `1 + 1 = 2` while leaving the actual transactional behavior unverified. The existing `bigsellerOrders/__tests__/mutations.test.ts` shows the project pattern — test the mapping/transform helpers when full convex-test integration is costly, but at minimum test guards and state transitions.

**Recommendation:** Add integration-style tests (or at minimum, guard logic tests):
1. Test `markAsPaid` guard: calling on already-paid settlement should throw
2. Test `updateSettlement` guard: calling on paid settlement should throw
3. Test `deleteSettlement` guard: calling on paid settlement should throw
4. Test `createSettlement` math matches `computeSettlementMath` output
5. Test event auto-archive decision is called only for event-type outlets
6. If convex-test is too heavy, extract guard logic into testable pure functions (e.g., `validateSettlementEditable(status)`)

### Issue 2: `externalId` generation uses `Date.now()` — collision risk

`externalId: "consignment-" + Date.now()` generates the same ID if two outlets are created within the same millisecond (e.g., during seed migration or automated testing). This violates the `externalOutlets` uniqueness expectation.

**Recommendation:** Use `crypto.randomUUID()` or `"consignment-" + outletId` (the consignmentOutlets `_id` is guaranteed unique by Convex). Since the outlet _id is available after insert, the pattern would be:
```typescript
const outletId = await ctx.db.insert("consignmentOutlets", {...});
const externalOutletId = await ctx.db.insert("externalOutlets", {
  externalId: `consignment-${outletId}`,
  ...
});
await ctx.db.patch(outletId, { externalOutletId });
```

### Issue 3: Missing `docs/SCHEMA.md` in Documentation Updates

The plan modifies `convex/schema.ts` extensively (merge tables, remove table, change fields). Per CLAUDE.md: "Also update `docs/SCHEMA.md` if schema changed." The Documentation Updates section only lists CHANGELOG.md.

**Recommendation:** Add `docs/SCHEMA.md` to the Documentation Updates checklist.

---

## 3. Improvements (Recommended)

| # | Improvement | Impact | Effort |
|---|-------------|--------|--------|
| 1 | Add `getGlobalSummary` query efficiency note | Medium | Low |
| 2 | Add manager role alongside admin for consignment mutations | Medium | Low |
| 3 | Add explicit data migration step for existing dispatch outlets | High | Medium |
| 4 | Add `by_outlet_status` compound index for settlement queries | Medium | Low |

**Details:**

### Improvement 1: `getGlobalSummary` query scans all outlets + all settlements

The plan's `getGlobalSummary` query fetches ALL active outlets, then for each outlet queries ALL settlements. With N outlets and M settlements each, this is O(N*M) document reads. For Phase 29's small data volume this is fine, but the plan should add a comment noting the scaling ceiling and when to switch to an action-based aggregation pattern.

**Recommendation:** Add a comment in the query: `// O(N*M) reads — acceptable for <50 outlets. Switch to action-based aggregation if outlet count exceeds 100.`

### Improvement 2: Access control is admin-only — manager role is excluded

CONTEXT.md says "manager/admin only" but the plan uses `requireRole(ctx, args.token, ["admin"])`. Managers should also access consignment (it's manager-level financial data per the context). The CLAUDE.md access control table says "Manager, Admin" for Sales Analytics.

**Recommendation:** Change to `requireRole(ctx, args.token, ["admin", "manager"])` for all consignment mutations.

### Improvement 3: No explicit data migration step for existing dispatchConsignmentOutlets

The plan mentions checking for existing data ("IMPORTANT: Check production data first") but doesn't include a concrete migration mutation. If production has dispatch outlet data (Legato Tamtem, Legato Goldfinch from seeds), those records need to be copied to `consignmentOutlets` with the new schema shape before the old table is removed.

**Recommendation:** Add a migration sub-step:
```typescript
// Step 1.5: Run migration mutation if dispatchConsignmentOutlets has data
// Copy each record to consignmentOutlets with type: "cafe", then remove old records
```

### Improvement 4: Missing compound index `by_outlet_status`

The `getOutletsWithTotals` query needs to compute outstanding balance per outlet (settlements where `status === "pending"`). The current indexes (`by_outlet`, `by_status`) require either a full table scan or a client-side filter. A compound index `by_outlet_status: ["outletId", "status"]` would allow efficient filtering.

**Recommendation:** Add to `consignmentSettlements`:
```typescript
.index("by_outlet_status", ["outletId", "status"])
```

---

## 4. Refinements (Minor Suggestions)

- The `helpers.ts` file could also export a `formatPeriodLabel(start: number, end: number): string` helper for consistent date period formatting across backend responses — avoids frontend formatting divergence
- Consider adding `deletedAt: v.optional(v.number())` soft-delete field to `consignmentSettlements` instead of hard delete — financial records are typically preserved
- The `verify` command should include `npm run test` (not just `--filter=consignment`) to catch dispatch planner regression
- Plan uses "Wave 1" then "Wave 3" (skipping Wave 2) — cosmetically inconsistent numbering

---

## 5. Duplication Analysis

### Existing Code to Leverage
| Existing Code | Location | How to Use |
|---------------|----------|------------|
| `requireRole()` auth helper | `convex/lib/auth.ts` | Used in plan — correct |
| `externalSource` union validator | `convex/schema.ts:18` | Already includes "consignment" — no changes needed |
| Revenue bridge pattern | `convex/grabfoodOrders/mutations.ts:65-96` | Follow same `externalRevenue` insert pattern — plan correctly mirrors this |
| BigSeller test pattern | `convex/bigsellerOrders/__tests__/mutations.test.ts` | Test mapping helpers when full integration is expensive |

### Potential Duplication Risks
- The `computeSettlementMath` helper is trivial (2 lines of arithmetic) — consider if it warrants a separate file vs inline in the mutation. Current extraction is fine for testability, but don't over-abstract.
- Outlet CRUD follows same pattern as `dispatchPlanner/mutations.ts` consignment functions — the plan correctly replaces these rather than duplicating alongside.

---

## 6. Phase/Wave Accuracy

| Phase | Assessment | Notes |
|-------|------------|-------|
| Wave 1: Schema + Backend | Good | Correct ordering — schema must change before mutations can reference new fields |
| Wave 3: Verification | Good | type-check, test, build — correct order |

**Ordering Issues:**
- None — the sequential approach is correct for schema migration. Schema must deploy before mutations reference new table shapes.

**Missing Phases:**
- Consider adding a "Wave 0: Data Migration" step before schema changes if production data exists in `dispatchConsignmentOutlets`. The plan acknowledges this but defers to executor judgment — should be more prescriptive.

---

## 7. Specialist Agent Recommendations

| Phase | Recommended Agent | Rationale |
|-------|-------------------|-----------|
| Schema + Backend | `convex-backend` | Backend-only changes, schema migration expertise |
| Dispatch Planner Migration | `convex-backend` | Same agent can handle table reference repointing |
| Tests | `convex-backend` | Test writing alongside implementation |
| Verification | `code-auditor` | Type check + build verification |

---

## 8. Git Workflow Assessment

### Branch Strategy
| Assessment | Status |
|------------|--------|
| Feature branch specified | ✅ Yes (`feature/phase-29-consignment-settlements`) |
| Branch naming convention | ✅ Correct |
| Merge strategy documented | ✅ Implicit (after all plans complete) |

### Commit Strategy
| Phase | Expected Commits | Commit Type | Notes |
|-------|------------------|-------------|-------|
| Schema migration | 1 | feat | Atomic — schema + table removal |
| Backend module | 1 | feat | All mutations + queries + helpers |
| Dispatch migration | 1 | refactor | Table reference repointing |
| Tests | 1 | test | Unit tests for settlement math |

### Recommended Commit Checkpoints
1. After schema changes → `feat(schema): merge consignment outlet tables, add settlement linkedRevenueId`
2. After backend module → `feat(consignment): add outlet CRUD, settlement mutations, revenue bridge`
3. After dispatch migration → `refactor(dispatch): repoint from dispatchConsignmentOutlets to consignmentOutlets`
4. After tests → `test(consignment): add settlement math and auto-archive tests`

### Pre-Push Verification
- [x] Plan includes `npm run build` check
- [x] Plan includes `npm run type-check` verification
- [x] Plan includes local testing before push

### CI/CD Considerations
| Concern | Assessment |
|---------|------------|
| Rollback strategy | ⚠️ Not documented — schema removal is hard to reverse |
| Deployment order | ✅ Correct — backend before frontend |
| Data backup needed | ✅ Yes — before removing `dispatchConsignmentOutlets` table |
| Migration safety | ⚠️ Review needed — production data check deferred to executor |

### Git Workflow Issues Found
- No rollback strategy documented for the `dispatchConsignmentOutlets` removal. If the table is removed and something breaks in dispatch planner, rollback requires re-adding the table + re-seeding data.

---

## 9. Documentation Checkpoints

| Phase | Documentation Update Required |
|-------|-------------------------------|
| Schema migration | `docs/SCHEMA.md` — update consignmentOutlets definition, remove dispatchConsignmentOutlets |
| All plans done | `docs/CHANGELOG.md` — Phase 29 entry |

### CHANGELOG.md Entry (Draft)
```markdown
## 2026-02-XX - Phase 29: Consignment Settlements

**Consignment outlet management and settlement tracking**

- Added consignment backend module (outlet CRUD, settlements, revenue bridge)
- Merged `dispatchConsignmentOutlets` into unified `consignmentOutlets` table
- Settlement entry with auto-calculated rev share and Frollie payment
- Payment tracking with event-type outlet auto-archive
- Revenue bridge: settlements create `externalRevenue` records for analytics
- Consignment tab in Sales Analytics with outlet cards and settlement timeline

**Schema Changes:**
- `consignmentOutlets`: replaced `mode` with `type` (cafe/retail/event), added dispatch planner fields
- `consignmentSettlements`: added `linkedRevenueId` field
- `dispatchPlans.outletId`: updated union type
- Removed `dispatchConsignmentOutlets` table (merged)
```

---

## 10. Testing Plan Assessment

**Overall Testing Verdict:** Insufficient

### Planned Tests
| Layer | What's Tested | Test Type | Status |
|-------|---------------|-----------|--------|
| Backend | `computeSettlementMath` (5 cases) | Vitest unit | Planned |
| Backend | `shouldAutoArchive` (3 cases) | Vitest unit | Planned |
| Backend | Mutation guards (paid status blocking) | convex-test / unit | **Missing** |
| Backend | Revenue bridge correctness | convex-test / unit | **Missing** |
| Backend | Dual-record creation (outlet + externalOutlets) | convex-test / unit | **Missing** |
| Backend | Dispatch planner regression (still works after migration) | Manual / test | **Missing** |

### Missing Test Coverage (Must Add)

| # | Missing Test | Why It Matters | Suggested Approach |
|---|--------------|----------------|-------------------|
| 1 | Settlement guard: updateSettlement rejects paid settlements | Financial data integrity — paid records must be immutable | Extract `assertSettlementEditable(status: string)` to helpers.ts, test it directly |
| 2 | Settlement guard: deleteSettlement rejects paid settlements | Same as above — prevents accidental revenue record deletion | Same helper extraction |
| 3 | Revenue bridge field mapping | The `externalRevenue` record must have correct `source`, `dataOrigin`, `confidence`, `outletId` | Test a helper that builds the externalRevenue insert object |
| 4 | Dispatch planner regression: `assembleConsignmentChannel` still works | Migration could break dispatch planning | Run `npm run type-check` covers types; add a comment noting manual verification needed |
| 5 | Edge: createSettlement with zero revenue | Zero revenue is valid (e.g., event where nothing sold) — must not throw | Add to computeSettlementMath tests (already covered: case 5) |

### Test Execution Checkpoints
1. After schema + backend: `npm run test -- --filter=consignment` (new tests pass)
2. After dispatch migration: `npm run type-check` (no type regression)
3. Before merge: Full `npm run test && npm run build` verification

### Regression Risk
- `convex/dispatchPlanner/queries.ts` — `assembleConsignmentChannel` and `getConsignmentOutlets` both change table references. Dispatch Planner page should be manually smoke-tested.
- `src/components/dispatchPlanner/ChannelSettingsDialog.tsx` — type reference change. Verify the dialog still opens and functions.

---

## 11. Edge Cases to Address

The plan should explicitly handle:

- [ ] **Zero rev share percent** (0%) — legitimate for some outlets; ensure no division by zero
- [ ] **100% rev share percent** — edge case where frolliePayment = 0; should be allowed
- [ ] **Negative revenue** — should the mutation reject negative `totalRevenue`? Probably yes (add validation)
- [ ] **Period start > period end** — date range validation (periodStart should be <= periodEnd)
- [ ] **Duplicate settlement periods** — should the same outlet allow overlapping date ranges? (Probably yes for consignment — different settlement batches)
- [ ] **Outlet with no externalOutletId** — if the externalOutlets insert fails, the consignmentOutlets record would have no link. The plan's current approach (insert externalOutlets first) handles this, but add a note about error handling.
- [ ] **markAsPaid on outlet with no settlements** — not directly an edge case, but worth noting
- [ ] **Concurrent markAsPaid** — two admins marking the same settlement simultaneously. Convex mutations are serialized per document, so this is safe, but the second call should handle the "already paid" guard gracefully.

---

## 12. Approval Conditions

**For Approval, address:**
1. **Critical #1:** Add mutation guard tests (extract guards to helpers, test independently)
2. **Critical #2:** Fix `externalId` generation to avoid collision (use outlet _id or UUID)
3. **Critical #3:** Add `docs/SCHEMA.md` to Documentation Updates

**Recommended before implementation:**
1. Add `["admin", "manager"]` role access (not admin-only)
2. Add input validation for negative revenue and invalid date ranges
3. Document data migration strategy for existing dispatch outlet data
4. Add `by_outlet_status` compound index

---

*Generated by /staffreview skill*
*Staff Developer Review + Principal Developer Review*
