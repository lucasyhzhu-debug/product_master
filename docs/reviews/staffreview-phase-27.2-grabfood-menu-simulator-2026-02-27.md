# Staff Review: Phase 27.2 — GrabFood Menu Simulator

**Date:** 2026-02-27
**Plans:** `.planning/phases/27.2-grabfood-menu-simulator/27.2-01-PLAN.md`, `27.2-02-PLAN.md`
**Reviewers:** Staff Developer (Implementation) + Principal Developer (Architecture)

---

## 0. Plan Validation Checklist

```
PLAN VALIDATION CHECKLIST
═════════════════════════

✅ Git Workflow section exists? → MISSING from both plans
  → Branch name specified? ❌
  → Checkpoint strategy defined? ❌

✅ Implementation Waves section exists?
  → Agents assigned? ✅ (via frontmatter autonomous flag)
  → File paths specified? ✅
  → PARALLEL/SEQUENTIAL marked? ✅ (wave 1 / wave 2)

✅ Documentation Updates section exists? → MISSING from both plans

✅ Success Criteria section exists?
  → Type check requirement? ✅
  → Build requirement? ✅

═════════════════════════
```

### Plan Structure Additions Required

Both plans are missing the mandatory **Git Workflow** and **Documentation Updates** sections per CLAUDE.md requirements. These must be added:

**Git Workflow (for both plans):**
```markdown
## Git Workflow
**Branch:** `feature/grabfood-menu-simulator`
**Checkpoints:** After Plan 01 (backend), after Plan 02 (frontend)
```

**Documentation Updates (for both plans):**
```markdown
## Documentation Updates
- [ ] CHANGELOG.md
- [ ] SCHEMA.md (new grabfoodMenuItems table + photoStorageId on menuProducts)
- [ ] API_REFERENCE.md (new grabfoodMenu module + pushMenuChanges action)
```

---

## 1. Summary

**Overall Assessment:** Revise

The plans are well-structured with clear task breakdowns and good decision fidelity from CONTEXT.md. However, there are several critical issues: significant code duplication with the existing `batchUpdateAvailability` action, a missing auth check on `generateUploadUrl` in the existing feedback pattern (which the plan copies), the `pushMenuChanges` action needs to be a `"use node"` action but the plan doesn't specify this, and the webhook update has a logic issue with serving unavailable items. The frontend plan (02) is solid but Task 1 covers 8 files which is ambitious for a single auto task.

---

## 2. Critical Issues (Must Fix)

| # | Issue | Category | Location in Plan |
|---|-------|----------|------------------|
| 1 | `pushMenuChanges` duplicates `batchUpdateAvailability` | Duplication | Plan 01, Task 2 |
| 2 | Webhook serves ALL items then contradicts with "only available" | Logic | Plan 01, Task 2 |
| 3 | `pushMenuChanges` must be an `action` (Node runtime) but plan puts it in adapter.ts | Architecture | Plan 01, Task 2 |
| 4 | Missing `"use node"` awareness for adapter.ts action | Architecture | Plan 01, Task 2 |
| 5 | `generateUploadUrl` in plan has auth but feedback pattern doesn't — inconsistency | Security | Plan 01, Task 1 |
| 6 | Change diff tracking has no persistence layer | Logic | Plan 02, Task 1 |

**Details:**

### Issue 1: `pushMenuChanges` duplicates `batchUpdateAvailability`

The existing `batchUpdateAvailability` action (adapter.ts:370-435) already implements the exact 2-step batch+notify pattern for availability updates. The new `pushMenuChanges` adds price updates on top. Rather than creating a parallel action, the plan should **extend `batchUpdateAvailability` into a general `pushMenuChanges`** or have `pushMenuChanges` call the same internal logic.

**Recommendation:** Replace `batchUpdateAvailability` with `pushMenuChanges` (breaking change is fine since `batchUpdateAvailability` is only used from the GrabFood Manager Settings tab, which can be updated). Or, extract the shared batch+notify logic into a helper function used by both.

### Issue 2: Webhook item filtering logic contradiction

Plan says: "Only include items where `isAvailable === true` (soft-remove means unavailable items still exist but are not served)" — but this contradicts GrabFood's expected behavior. The GET /menu webhook should return ALL items with their `availableStatus` field set correctly (`"AVAILABLE"` or `"UNAVAILABLE"`). GrabFood uses `availableStatus` per-item to show/hide on the app. Filtering them out entirely would mean GrabFood can never re-show them without a full menu push.

**Recommendation:** Return ALL grabfoodMenuItems, setting `availableStatus` based on `isAvailable`. Do NOT filter out unavailable items.

### Issue 3: Action runtime context

The `adapter.ts` file starts with `"use node"` and uses `action`/`internalAction` from Convex. The plan correctly places `pushMenuChanges` here, but doesn't explicitly mention it needs to be an `action` (not `mutation`) since it makes external HTTP calls. This is already the pattern in the file, but the plan should be explicit to avoid confusion — especially since `grabfoodMenu/mutations.ts` is a different file (mutations only, no Node runtime).

**Recommendation:** Plan should explicitly state `pushMenuChanges` is an `action` in the `"use node"` adapter.ts file, not a mutation.

### Issue 5: `generateUploadUrl` auth inconsistency

The existing `feedback/mutations.ts:generateUploadUrl` has NO auth check (lines 12-17). The plan correctly adds `requireRole` to the new one, but this creates an inconsistency. More importantly, the plan references "Follow the exact pattern from `convex/feedback/mutations.ts`" — the executor may copy the no-auth version.

**Recommendation:** Explicitly state "Add `requireRole(ctx, args.token, ["admin"])` — do NOT copy the feedback pattern which lacks auth."

### Issue 6: Change diff tracking has no persistence

The frontend plan says "Track original state (snapshot taken on page load/populate) for diff calculation." This means if the admin reloads the page, the diff is lost and all current items appear as "no changes." There's no way to know what was "last pushed" vs what's been modified since.

**Recommendation:** Add a `lastPushedAt` timestamp field to `grabfoodMenuItems` and snapshot fields (`lastPushedPrice`, `lastPushedAvailability`) so the diff can survive page reloads. Alternatively, accept this limitation and document it clearly — the diff only works within a single session.

---

## 3. Improvements (Recommended)

| # | Improvement | Impact | Effort |
|---|-------------|--------|--------|
| 1 | Add `lastPushedPrice` / `lastPushedAvailability` to schema | High | Low |
| 2 | Split Plan 02 Task 1 (8 files) into 2 tasks | Medium | Low |
| 3 | Add index on `grabfoodMenuItems.grabfoodItemId` | Medium | Low |
| 4 | Use existing GrabFood types from config.ts | Medium | Low |
| 5 | Consolidate batch update logic | High | Medium |

**Details:**

### Improvement 1: Persist push state for diff calculation

Add to schema:
```typescript
lastPushedPrice: v.optional(v.number()),
lastPushedAvailability: v.optional(v.boolean()),
lastPushedAt: v.optional(v.number()),
```

After a successful push, update these fields. The frontend can then compute diffs from the database rather than ephemeral React state.

### Improvement 2: Split Plan 02 Task 1

8 files in a single auto task is at the upper boundary. Consider splitting:
- Task 1a: Hook + components (SyncStatusBadge, PhotoUpload, MenuItemCard)
- Task 1b: Dialogs + page + route (AddItemDialog, PushConfirmDialog, GrabFoodMenuSimulator, App.tsx)

### Improvement 3: Add `grabfoodItemId` index

The `populateFromMappings` mutation needs to check for existing items, and the push action needs to look up items by their GrabFood ID. Add:
```typescript
.index("by_grabfood_item_id", ["grabfoodItemId"])
```

### Improvement 4: Use existing GrabFood types

`config.ts` already defines `GrabMenuItem`, `GrabMenuCategory`, `GrabBatchMenuUpdateRequest`. The push action and webhook should use these types rather than inline object shapes.

### Improvement 5: Consolidate batch update logic

Extract a shared helper in adapter.ts:
```typescript
async function batchMenuUpdate(token, merchantID, field, menuEntities) { ... }
async function notifyMenu(token, merchantID) { ... }
```
Both `batchUpdateAvailability` and `pushMenuChanges` (or a single consolidated action) use these helpers.

---

## 4. Refinements (Minor Suggestions)

- Plan 02 mentions `GrabFood green (#00B14F)` — should use a CSS variable (e.g., `--color-grabfood`) per CODE_STYLE.md dark mode patterns rather than hardcoded hex
- Plan 01 `getSyncStatus` query filters client-side after fetching 20 records — acceptable for now but could use a dedicated index if sync log volume grows
- Plan 02 empty state text could be shorter and more actionable
- Consider adding a "last synced" relative time display in the page header

---

## 5. Duplication Analysis

### Existing Code to Leverage
| Existing Code | Location | How to Use |
|---------------|----------|------------|
| `batchUpdateAvailability` action | `convex/integrations/grabfood/adapter.ts:370` | Extend or refactor into `pushMenuChanges` |
| `grabRequest` helper | `convex/integrations/grabfood/adapter.ts:132` | Already used — `pushMenuChanges` should use it |
| `resolveToken` helper | `convex/integrations/grabfood/adapter.ts:49` | Already used — `pushMenuChanges` should use it |
| `GrabMenuItem` type | `convex/integrations/grabfood/config.ts:177` | Use for webhook response building |
| `GrabBatchMenuUpdateRequest` type | `convex/integrations/grabfood/config.ts:215` | Use for push action params |
| `ALL_DAY_SERVICE_HOURS` | `convex/integrations/grabfood/webhooks.ts:133` | Already in scope for webhook update |
| `formatCurrency` | `src/lib/utils.ts` | Plan 02 already references |
| `lazyWithPreload` | `src/lib/lazyWithPreload.ts` | Plan 02 already references |
| `actionToast` | `src/lib/actionToast.ts` | Should use for push success feedback |

### Potential Duplication Risks
- `pushMenuChanges` vs `batchUpdateAvailability` — nearly identical pattern, risk of diverging implementations
- `generateUploadUrl` — duplicated from feedback module (consider a shared utility if more modules need upload)
- `getMenuItems` action in adapter.ts (line 447) reads from `externalProductMappings` — after this phase, it becomes partially redundant with the new `listMenuItems` query

---

## 6. Phase/Wave Accuracy

| Wave | Assessment | Notes |
|------|------------|-------|
| Wave 1 (Plan 01) | Good | Backend must come first — frontend depends on it |
| Wave 2 (Plan 02) | Good | Correct dependency on 01 |

**Ordering Issues:**
- None — wave structure is correct

**Missing Phases:**
- Consider a Wave 3 verification task: `npm run build` + `npm run type-check` + manual smoke test

---

## 7. Specialist Agent Recommendations

| Phase | Recommended Agent | Rationale |
|-------|-------------------|-----------|
| Plan 01 Task 1 | `convex-backend` | Schema + queries + mutations |
| Plan 01 Task 2 | `convex-backend` | Adapter action + webhook update |
| Plan 02 Task 1 | `react-ui-builder` | All frontend components |
| Plan 02 Task 2 | Manual | Human verification checkpoint |
| Post-implementation | `code-auditor` | Type check + pattern compliance |

---

## 8. Git Workflow Assessment

### Branch Strategy
| Assessment | Status |
|------------|--------|
| Feature branch specified | ❌ Missing |
| Branch naming convention | ❌ Missing |
| Merge strategy documented | ❌ Missing |

### Commit Strategy
| Phase | Expected Commits | Commit Type | Notes |
|-------|------------------|-------------|-------|
| Plan 01 Task 1 | 1 | feat | Schema + CRUD module |
| Plan 01 Task 2 | 1 | feat | Push action + webhook |
| Plan 02 Task 1 | 1 | feat | Frontend page + components |
| Plan 02 Task 2 | 0 | — | Verification only |

### Recommended Commit Checkpoints
1. After schema + CRUD → `feat(grabfood): add grabfoodMenuItems table and CRUD module`
2. After push action + webhook → `feat(grabfood): add pushMenuChanges action and update menu webhook`
3. After frontend → `feat(grabfood): add GrabFood Menu Simulator page`
4. After verification → `docs: update changelog for phase 27.2`

### Pre-Push Verification
- [ ] Plan includes `npm run build` check — ✅ (both plans)
- [ ] Plan includes `npm run type-check` verification — ✅ (Plan 01)
- [ ] Plan includes local testing before push — ✅ (Plan 02 checkpoint)

### CI/CD Considerations
| Concern | Assessment |
|---------|------------|
| Rollback strategy | ❌ Missing |
| Deployment order | ✅ Correct (backend before frontend) |
| Data backup needed | No (additive schema change only) |
| Migration safety | ✅ Safe (new table, optional field addition) |

---

## 9. Documentation Checkpoints

| Phase | Documentation Update Required |
|-------|-------------------------------|
| Plan 01 | `docs/SCHEMA.md` (new table), `docs/API_REFERENCE.md` (new module) |
| Plan 02 | None (page is internal admin tool) |
| Post-merge | `docs/CHANGELOG.md` (always required) |

### CHANGELOG.md Entry (Draft)
```markdown
## 2026-02-27 — GrabFood Menu Simulator

**New standalone page for managing the GrabFood menu with visual preview and push capability.**

- Added `grabfoodMenuItems` table for GrabFood-specific item overrides
- Added `photoStorageId` field to `menuProducts` for photo write-back
- Built GrabFood Menu Simulator page at `/grabfood-menu`
- Inline editing for name, price, description with onBlur commit
- Photo upload with Convex file storage
- Push-to-GrabFood with confirmation dialog showing change diff
- Updated GET /menu webhook to serve from grabfoodMenuItems
- Availability toggle with visual gray-out for unavailable items
```

---

## 10. Testing Plan Assessment

**Overall Testing Verdict:** Missing

Neither plan includes any automated tests. Both plans rely solely on `npm run build` / `npx tsc --noEmit` and a manual human verification checkpoint.

### Planned Tests
| Layer | What's Tested | Test Type | Status |
|-------|---------------|-----------|--------|
| Backend | grabfoodMenu mutations | convex-test | **Missing** |
| Backend | pushMenuChanges action | convex-test | **Missing** |
| Backend | webhook fallback logic | convex-test | **Missing** |
| Frontend | GrabFoodMenuSimulator | Vitest + RTL | **Missing** |
| Frontend | useGrabFoodMenu hook | Vitest | **Missing** |
| Integration | Full edit → push flow | Manual | Planned (checkpoint) |

### Missing Test Coverage (Must Add)

| # | Missing Test | Why It Matters | Suggested Approach |
|---|--------------|----------------|-------------------|
| 1 | `createItem` duplicate menuProductId rejection | Data integrity — prevents double-adding | convex-test: insert then insert again, expect error |
| 2 | `populateFromMappings` idempotency | Re-running shouldn't duplicate items | convex-test: run twice, verify count unchanged |
| 3 | `savePhoto` write-back to menuProducts | Core feature — photo flows to internal products | convex-test: verify both records updated |
| 4 | Webhook fallback (no grabfoodMenuItems → externalProductMappings) | Regression safety | convex-test: empty table returns fallback data |
| 5 | `pushMenuChanges` error handling (API failure) | Graceful degradation | convex-test with mock: verify sync log created |

### Test Execution Checkpoints
1. After Plan 01: `npm run test` (existing tests still pass + new backend tests)
2. After Plan 02: `npm run test` (all tests pass)
3. Before merge: `npm run test && npm run build`

### Regression Risk
- Existing `handleGetMenuWebhook` tests (if any) may break due to fallback logic change
- Existing `batchUpdateAvailability` callers need updating if consolidated

---

## 11. Edge Cases to Address

The plans should explicitly handle:

- [ ] What happens if `populateFromMappings` is called when mappings have no `menuProductId` (unmapped items)?
- [ ] What if admin deletes a menuProduct that has a linked grabfoodMenuItem? (orphaned reference)
- [ ] Photo upload when Convex storage is unavailable or returns error
- [ ] `pushMenuChanges` called with 0 changes (empty arrays for both price and availability) — should it still call menuNotify?
- [ ] `reorderItems` called with partial list of IDs (not all items included)
- [ ] Concurrent edits — two admins editing the same item simultaneously (Convex handles this at transaction level, but UI needs to handle stale data gracefully)
- [ ] `grabfoodPrice` of 0 — valid or error? (IDR 0 would be free item)

---

## 12. Approval Conditions

**For Approval, address:**
1. Add Git Workflow section to both plans (branch name, checkpoints)
2. Add Documentation Updates section to both plans
3. Fix webhook logic: return ALL items with correct `availableStatus`, don't filter out unavailable
4. Resolve `pushMenuChanges` vs `batchUpdateAvailability` duplication — consolidate or clearly separate
5. Add `lastPushedPrice`/`lastPushedAvailability`/`lastPushedAt` to schema for persistent diff tracking (or explicitly document session-only limitation)
6. Add at least backend tests for mutations (createItem duplicate check, populateFromMappings idempotency, savePhoto write-back)

**Recommended before implementation:**
1. Split Plan 02 Task 1 into two tasks (hook+components and dialogs+page)
2. Add `by_grabfood_item_id` index to schema
3. Use existing GrabFood types from config.ts in push action

---

*Generated by /staffreview skill*
*Staff Developer Review + Principal Developer Review*
