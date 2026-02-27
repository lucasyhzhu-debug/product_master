# Staff Review: Phase 28 — BigSeller Integration

**Date:** 2026-02-25
**Plans:** `.planning/phases/28-bigseller-integration/28-01-PLAN.md`, `28-02-PLAN.md`
**Reviewers:** Staff Developer (Implementation) + Principal Developer (Architecture)

---

## 1. Summary

**Overall Assessment:** REVISE

Two well-structured plans with clear task decomposition, correct wave ordering, and strong alignment with locked decisions. However, there are two critical issues: (1) the plan registers "shopee" and "tiktok" as separate platform entries in the integration registry, which will spawn phantom health cards in SettingsTab with no actionable purpose, and (2) there is no testing plan whatsoever for a reverse-engineered API integration with fee calculations, dedup logic, and a scheduler-chain — this is a high-risk gap. Both issues are fixable without replanning.

---

## 2. Critical Issues (Must Fix)

| # | Issue | Category | Location in Plan |
|---|-------|----------|------------------|
| 1 | Registry scope creep — shopee/tiktok as platform entries | Architecture | Plan 01, Task 1 (registry.ts) |
| 2 | No testing plan for fee calculations, dedup, or scheduler chain | Testing | Both plans |

### Issue 1: Registry Scope Creep — shopee/tiktok as Platform Entries

**Context:** Plan 01 Task 1 adds `"shopee"` and `"tiktok"` to three places: (a) the `externalSource` union in `schema.ts`, (b) the `PlatformId` type in `registry.ts`, and (c) full `PLATFORMS` registry entries with `healthConfig`.

**Problem:** The `PLATFORMS` registry drives `getHealthStatusAll()`, which populates SettingsTab with `IntegrationHealthCard` rows — one per platform. Adding shopee and tiktok to the registry will create **2 phantom health cards** in Settings with:
- No token to manage (they say `tokenLifespan: "N/A"`)
- No action button (no auth strategy that makes sense)
- `healthCheckType: "always_green"` (always healthy — meaningless)
- No sync capability (sync goes through BigSeller, not direct API)

This contradicts the user's intent: *"two outlets (shopee + tiktok), one BigSeller sync fans out to both."* Shopee/TikTok are **revenue sources** (where money comes from), not **integration platforms** (where tokens live). The user explicitly said BigSeller is the pipe — shopee/tiktok are labels on the data that comes through that pipe.

**Recommendation:**
- **DO** add `v.literal("shopee")` and `v.literal("tiktok")` to the `externalSource` validator in `schema.ts` — this is the revenue source label, correct per locked decision
- **DO NOT** add them to `PlatformId` type or `PLATFORMS` registry — they don't have independent auth, tokens, or sync capability
- If downstream code (like `saveRevenue`) needs to accept "shopee"/"tiktok" as sources, the validator change alone handles that
- Product mappings: register with `source: "shopee"` / `source: "tiktok"` in `externalProductMappings` — this is the source field, not the platformId field

**Impact if not fixed:** Users see 8 platform cards in Settings instead of 6, with 2 dummy cards that say "Shopee (via BigSeller)" and "TikTok Shop (via BigSeller)" with no useful action. Confusing UX.

---

### Issue 2: No Testing Plan

**Context:** Both plans have zero mentions of unit tests, integration tests, or test execution checkpoints. The `<verify>` blocks only mention `npm run type-check` and `npm run build`.

**Problem:** This integration involves:
- **Fee sign convention** (`commissionFee`, `sellerShippingFee`, `otherFee` are NEGATIVE — arithmetic must be correct)
- **Profit calculation** (`platformIncome + commissionFee + sellerShippingFee + otherFee` — all negative costs as additions)
- **Dedup logic** (upsert by `platformOrderId` — must not create double records)
- **Scheduler-chain state machine** (8 states, retry logic, auto-retry once)
- **Reverse-engineered API** (25+ required fields in request body — any omission causes silent `code: -1`)
- **BigSeller response parsing** (HTML detection, error code interpretation)

Running `npm run build` proves types align. It does NOT prove the math is right, the dedup works, or the state machine transitions correctly.

**Recommendation — Must-have tests (add to Plan 01):**

1. **`helpers.test.ts`** — Unit tests for pure functions:
   - `mapOrderToRevenue`: Given a mock BigSeller order with known fee values, verify revenue fields are correct. Test with `commissionFee: -5850` → commission = 5850
   - `mapOrderToStorage`: Given a mock order, verify all fields mapped correctly
   - `buildPageListBody`: Verify all 25+ required fields are present (regression test against silent failures)
   - `detectHtmlResponse`: Test with HTML input → true, JSON input → false

2. **`mutations.test.ts`** — convex-test for dedup logic:
   - `upsertOrders`: Insert 5 orders, re-insert with same `platformOrderId` → verify count unchanged, fields updated
   - `applyRetroactiveMapping`: Insert orders with SKU "X", map SKU "X", verify all linked revenue records updated

3. **State machine test** (optional but recommended):
   - Verify transition paths: idle → triggering → polling → fetching → storing → complete
   - Verify retry: polling (8 fails) → retrying → polling → complete
   - Verify failure: polling (8 fails) → retrying → polling (8 fails) → failed

---

## 3. Improvements (Recommended)

| # | Improvement | Impact | Effort |
|---|-------------|--------|--------|
| 1 | Add auth to `getSyncState` query | Medium | Low |
| 2 | Use `actionToast()` for success feedback | Medium | Low |
| 3 | Paginate retroactive mapping | Medium | Medium |
| 4 | Document hardcoded shop IDs | Low | Low |
| 5 | Use CSS variable tokens for dark mode | Medium | Low |

### Improvement 1: Add Auth to getSyncState

Plan 01 Task 3 creates `getSyncState` as a public query with no auth. While sync state isn't sensitive data, it leaks operational details (sync timing, error messages, attempt counts) to unauthenticated users.

**Recommendation:** Add `token: v.string()` arg and `requireRole(ctx, args.token, ["admin", "manager"])`. Cost is minimal and follows the pattern of other queries in the codebase.

### Improvement 2: Use actionToast() Pattern

Plan 02 Task 1 says "fire a sonner toast" on sync completion. Per `docs/CODE_STYLE.md`, the project convention is:
- `actionToast(message, event)` for success feedback (floating near click)
- `toast.error(message)` for errors (top-center via Sonner)
- **Never** use `toast.success()` — use `actionToast()` instead

**Recommendation:** Sync completion toast should use `actionToast("Sync complete!", event)` if triggered by button click. For background completion (admin returned to page), `toast.info("BigSeller sync completed")` is appropriate since there's no click event.

### Improvement 3: Paginate Retroactive Mapping

Plan 02 Task 3 adds `applyRetroactiveMapping` that queries ALL `bigsellerOrders` to find matching SKUs. After months of syncing, this could be thousands of orders.

**Recommendation:** Use the `by_platform` index to filter by platform first, then iterate with pagination (collect 100 at a time). Alternatively, add an index on the denormalized SKU field if one exists, or at minimum add a comment noting this should be optimized if order volume grows.

### Improvement 4: Document Hardcoded Shop IDs

Plan 01 Task 1 hardcodes `BIGSELLER_FROLLIE_SHOP_IDS = [5090946, 5092855]`. These are BigSeller internal IDs specific to Frollie's account.

**Recommendation:** Add a comment in config.ts: `// Frollie-specific BigSeller shop IDs — update if shops change in BigSeller dashboard`. Consider moving to `platformCredentials` metadata in a future iteration so they're admin-editable.

### Improvement 5: Use CSS Variable Tokens for Dark Mode

Plan 02 Task 2 specifies `text-red-600 dark:text-red-400` for negative values and `text-green-600 dark:text-green-400` for positive profit.

Per `docs/CODE_STYLE.md` Dark Mode section: **Do not use raw Tailwind color classes for semantic backgrounds** — use CSS variable tokens. The project has `--color-status-error` (red) and `--color-status-success` (green) tokens that auto-switch in dark mode.

**Recommendation:** Replace `text-red-600 dark:text-red-400` with `text-[var(--color-status-error)]` and `text-green-600 dark:text-green-400` with `text-[var(--color-status-success)]`.

---

## 4. Refinements (Minor Suggestions)

- **Sync state `phase` naming**: Consider `stage` instead of `phase` to avoid confusion with GSD phase numbers (Phase 28 vs sync phase "polling")
- **`startSync` return type**: Consider returning `{ success: boolean, error?: string, syncLogId?: string }` so the frontend can link to the sync log entry
- **Orders table pagination**: Plan mentions `page` and `pageSize` args but Convex queries don't natively support OFFSET pagination. Consider cursor-based pagination using `_creationTime` or implement client-side pagination with `collect()` and slice. For the initial volume (hundreds of orders, not millions), client-side is fine.
- **Summary card `totalRevenue` field**: Should clarify currency — this is IDR. The formatCurrency util handles this, but the type should note it.

---

## 5. Duplication Analysis

### Existing Code to Leverage

| Existing Code | Location | How to Use |
|---------------|----------|------------|
| `saveRevenue` | `convex/externalData/mutations.ts` | Plan correctly uses this for revenue bridge — dedup via `externalTransactionId` |
| `saveProductMappings` | `convex/externalData/mutations.ts` | Plan correctly uses this for SKU registration — upsert pattern |
| `createSyncLog` / `updateSyncLog` | `convex/externalData/mutations.ts` | Plan should use these directly rather than creating BigSeller-specific logging |
| `IntegrationHealthCard` | `src/components/salesAnalytics/IntegrationHealthCard.tsx` | Already has expandable section with sync history — extend expansion area |
| `ProductMappingCard` | `src/components/salesAnalytics/ProductMappingCard.tsx` | Inline dropdown mapping pattern already built — reuse for new sources |
| `BigSellerTokenDialog` | `src/components/salesAnalytics/BigSellerTokenDialog.tsx` | Already exists from Phase 26 — wire from sync panel |
| `saveBigSellerToken` | `convex/integrations/bigseller/adapter.ts` | Token save already implemented with JWT decode + expiry extraction |
| `formatCurrency` | `src/lib/utils.ts` | Plan correctly references for IDR formatting |

### Potential Duplication Risks

- **Sync logging**: Plan creates custom logging in sync.ts (`"Log raw response via a helper"`). Should use existing `createSyncLog`/`updateSyncLog` from `externalData/mutations.ts` rather than building parallel logging. The existing sync log table already has `source`, `syncType`, `status`, `errorMessage`, `durationMs` fields.
- **Token resolution**: Plan says "Resolve token from platformCredentials" in sync.ts. Use existing `getCredentialsInternal(platformId)` from `convex/platformCredentials/queries.ts` rather than writing custom token lookup.

---

## 6. Phase/Wave Accuracy

| Plan | Wave | Assessment | Notes |
|------|------|------------|-------|
| 28-01 (Backend) | 1 | Good | Schema + sync action + mutations — correct backend-first ordering |
| 28-02 (Frontend) | 2 | Good | Correctly depends on 28-01; consumes backend APIs |

**Ordering Issues:** None. Wave ordering is correct.

**Missing Phases:**
- Consider adding a Wave 3 verification plan (or adding to Plan 02 Task 3's verification section): Manual integration test — paste a token, trigger a sync against real BigSeller API, verify orders appear. Since this is a reverse-engineered API, the "does it actually work" test is critical and can't be automated.

---

## 7. Specialist Agent Recommendations

| Plan | Task | Recommended Agent | Rationale |
|------|------|-------------------|-----------|
| 28-01 | Task 1 (Schema + registry) | `convex-backend` | Schema changes, validator extensions |
| 28-01 | Task 2 (Sync action + helpers) | `convex-backend` | Complex server-side action, scheduler-chain |
| 28-01 | Task 3 (Mutations + queries) | `convex-backend` | CRUD mutations, auth-protected queries |
| 28-02 | Task 1 (Hook + SyncPanel) | `react-ui-builder` | React component, Convex hooks |
| 28-02 | Task 2 (OrdersTable + SettingsTab) | `react-ui-builder` | Table component, SettingsTab integration |
| 28-02 | Task 3 (SKU mapping + build) | `react-ui-builder` | ProductMappingTab wiring, build verification |

---

## 8. Git Workflow Assessment

### Branch Strategy

| Assessment | Status |
|------------|--------|
| Feature branch specified | ⚠️ Implicit (frontmatter says `phase: 28-bigseller-integration` but no explicit branch name) |
| Branch naming convention | ⚠️ Should specify `feature/28-bigseller-integration` or `gsd/phase-28-bigseller-integration` |
| Merge strategy documented | ❌ No |

### Commit Strategy

| Plan | Expected Commits | Commit Type | Notes |
|------|-----------------|-------------|-------|
| 28-01 Task 1 | 1 | feat | Schema + registry changes — atomic |
| 28-01 Task 2 | 1 | feat | Sync action + helpers — atomic |
| 28-01 Task 3 | 1 | feat | Mutations + queries — atomic |
| 28-02 Task 1 | 1 | feat | Hook + sync panel — atomic |
| 28-02 Task 2 | 1 | feat | Orders table + SettingsTab — atomic |
| 28-02 Task 3 | 1 | feat | SKU mapping + build verification — atomic |

### Recommended Commit Checkpoints

1. After schema + registry changes → `feat(28): extend externalSource union + add bigsellerSyncState table`
2. After sync action → `feat(28): implement BigSeller scheduler-chain sync action`
3. After mutations/queries → `feat(28): add BigSeller order mutations and queries`
4. After hook + sync panel → `feat(28): add BigSeller sync progress UI`
5. After orders table → `feat(28): add BigSeller orders table + SettingsTab integration`
6. After SKU mapping + build → `feat(28): wire BigSeller SKU mapping + verify build`

### Pre-Push Verification

- [x] Plan includes `npm run build` check (Plan 02 Task 3)
- [x] Plan includes `npm run type-check` verification (every task)
- [ ] Plan includes test execution (`npm run test`) — **MISSING**

### CI/CD Considerations

| Concern | Assessment |
|---------|------------|
| Rollback strategy | ❌ Missing — should note that schema changes (new table, new union members) are additive and safe to deploy |
| Deployment order | ✅ Correct — backend (schema) deploys first via `npx convex deploy`, then frontend via Vercel |
| Data backup needed | No — additive schema changes only, no data migration |
| Migration safety | ✅ Safe — all changes are additive (new table, new union literals, new files) |

### Git Workflow Issues Found

- No explicit feature branch creation step
- No `npm run test` checkpoint between plans
- No CHANGELOG.md update mentioned in plans (required per CLAUDE.md)

---

## 9. Documentation Checkpoints

| Plan | Documentation Update Required |
|------|-------------------------------|
| 28-01 (Backend) | `docs/SCHEMA.md` (new table + union changes), `docs/API_REFERENCE.md` (new queries/mutations) |
| 28-02 (Frontend) | `docs/CHANGELOG.md` (required per CLAUDE.md) |
| Both | `docs/BIGSELLER_PROFIT_API.md` (update with any API quirks discovered during implementation) |

### CHANGELOG.md Entry (Draft)

```markdown
## 2026-02-XX — BigSeller Integration (Phase 28)

**Admin can manually trigger BigSeller sync to pull Shopee/TikTok order data with SKU breakdowns and revenue bridge.**

- BigSeller scheduler-chain sync: manual trigger → poll (8 retries, auto-retry once) → fetch paginated orders → store with dedup
- Per-order data stored in `bigsellerOrders` with full fee breakdown (commission, shipping, other fees)
- Revenue bridged to `externalRevenue` with actual platform source (shopee/tiktok), not "bigseller"
- Sync progress shown in Settings tab with step-by-step state machine
- Browsable orders table with platform, SKU, and fee columns
- SKU mapping via inline dropdown in Product Mapping tab with retroactive application
- JWT expiry warning inline; sync button disabled when token expired
- COGS caveat banner when BigSeller cost data is zero

**Files Modified:**
- convex/schema.ts, convex/integrations/bigseller/, convex/bigsellerOrders/
- src/components/salesAnalytics/, src/hooks/convex/useBigSeller.ts
```

---

## 10. Testing Plan Assessment

**Overall Testing Verdict:** Missing

### Planned Tests

| Layer | What's Tested | Test Type | Status |
|-------|---------------|-----------|--------|
| Backend | helpers.ts (mapOrderToRevenue, fee calculations) | Vitest unit | **Missing** |
| Backend | upsertOrders dedup logic | convex-test | **Missing** |
| Backend | Scheduler-chain state transitions | convex-test | **Missing** |
| Frontend | BigSellerSyncPanel states | Vitest + RTL | **Missing** |
| Integration | End-to-end sync flow | Manual | **Missing** |

### Missing Test Coverage (Must Add)

| # | Missing Test | Why It Matters | Suggested Approach |
|---|--------------|----------------|-------------------|
| 1 | Fee calculation unit tests | Financial calculations with negative values — wrong sign = wrong profit | Vitest: `mapOrderToRevenue({commissionFee: -5850, ...})` → verify `commission: 5850` |
| 2 | Request body completeness | Missing fields cause silent API failures (`code: -1`) | Vitest: `buildPageListBody(...)` → verify all 25+ fields present |
| 3 | Dedup/upsert logic | Double-sync must not create duplicate records | convex-test: insert 5 orders, re-upsert same 5 → verify count = 5, fields updated |
| 4 | HTML response detection | Auth failure must be caught, not crash JSON parse | Vitest: `detectHtmlResponse("<!DOCTYPE html>")` → true |
| 5 | Retroactive mapping | Must update ALL historical orders, not just new ones | convex-test: insert orders with SKU, apply mapping, verify all linked |

### Test Execution Checkpoints

1. After Plan 01 Task 2 (helpers): `npm run test` — all helper unit tests pass
2. After Plan 01 Task 3 (mutations): `npm run test` — dedup tests pass
3. After Plan 02 Task 3 (build): `npm run test && npm run build` — full verification

### Regression Risk

- Existing `saveRevenue` behavior — new source literals ("shopee"/"tiktok") should not affect existing gobiz/k3mart records
- Existing `ProductMappingTab` — adding new source tabs should not break gobiz/k3mart mapping UI
- Existing `IntegrationHealthCard` expansion — BigSeller expansion should not affect other platform cards

---

## 11. Edge Cases to Address

The plans should explicitly handle:

- [ ] **Empty sync** — BigSeller returns 0 orders for date range. Should show "No orders found" summary, not error.
- [ ] **Partial page failure** — Page 3 of 5 fails to fetch. Plan mentions continuing with partial data — good. But verify the summary accurately reflects partial counts.
- [ ] **Concurrent sync attempts** — Admin clicks "Sync" twice quickly. Plan handles this ("if already triggering/polling, return error"). But verify the check is atomic (no race condition between read and write of sync state).
- [ ] **Token expires mid-sync** — Token works for trigger but expires before fetchOrders completes. Ensure HTML detection works at every API call point, not just the first.
- [ ] **SKU with special characters** — BigSeller SKU codes may contain spaces, hyphens, or non-ASCII. Verify dedup and mapping work regardless of SKU format.
- [ ] **Date range boundary** — Exactly 31 days should pass validation; 32 days should fail. Edge case: 31 days that span a month with different day counts.
- [ ] **bigsellerSyncState document deleted** — If the singleton is manually deleted, `getSyncState` should return default idle state (Plan mentions this — good).
- [ ] **Zero revenue orders** — Orders with `saleAmount: 0` (returns, refunds). Should still be stored and counted.

---

## 12. Approval Conditions

**For Approval, address:**
1. **Remove shopee/tiktok from PLATFORMS registry and PlatformId type** — keep them ONLY in `externalSource` union. No phantom health cards.
2. **Add a testing section** to Plan 01 with at least: helper unit tests (fee calculations, request body, HTML detection) and mutation dedup tests.

**Recommended before implementation:**
1. Add `requireRole` auth to `getSyncState` query
2. Use `actionToast()` pattern per project conventions
3. Use CSS variable tokens (`--color-status-error`/`--color-status-success`) instead of raw Tailwind dark mode classes
4. Add CHANGELOG.md update requirement to Plan 02 verification section
5. Add explicit branch name to plan frontmatter

---

*Generated by /staffreview skill*
*Staff Developer Review + Principal Developer Review*
