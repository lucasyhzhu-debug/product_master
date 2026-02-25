# Staff Review: Phase 26 — Platform Auth & Schema Foundation

**Date:** 2026-02-25
**Plans:** `26-01-PLAN.md`, `26-02-PLAN.md`, `26-03-PLAN.md`
**Reviewers:** Staff Developer (Implementation) + Principal Developer (Architecture)

---

## 0. Plan Validation Checklist

```
PLAN VALIDATION CHECKLIST (GSD format)
=======================================

[~] Git Workflow section exists?
    -> Branch: implicit via GSD phase config (branching_strategy: "phase")
    -> Not in individual plan files, but GSD enforces it. ACCEPTABLE.

[~] Implementation Waves section exists?
    -> GSD uses <tasks> with wave ordering. Plans define 3 waves (01→02→03).
    -> Wave dependencies specified in YAML frontmatter. ACCEPTABLE.

[x] Documentation Updates section exists?
    -> MISSING from all 3 plans.
    -> CHANGELOG.md, SCHEMA.md, API_REFERENCE.md updates not tracked.

[~] Success Criteria section exists?
    -> Present in all 3 plans (<success_criteria> tags).
    -> Type check + build requirements included. OK.

=======================================
```

**Plan Structure Additions Required:**
- All 3 plans must include a Documentation Updates section specifying: CHANGELOG.md (required), SCHEMA.md (schema changes in Plan 01), API_REFERENCE.md (new query + actions in Plans 01-02).

---

## 1. Summary

**Overall Assessment: REVISE**

The plans are well-structured, detailed, and architecturally sound in their registry-driven approach. However, there are 4 critical implementation issues that would cause runtime failures or security vulnerabilities if built as written. The most dangerous is calling `saveDirectToken` (a public mutation) via `internal.*` paths from actions — this will fail silently. The plans also lack any testing strategy and have a data shape mismatch between the new health query and the existing UI component props.

---

## 2. Critical Issues (Must Fix)

| # | Issue | Category | Location in Plan |
|---|-------|----------|------------------|
| 1 | `saveDirectToken` calling convention — wrong import path | Logic/Runtime | Plan 02, Tasks 1 & 2 |
| 2 | `getHealthStatusAll` has no auth — exposes credential metadata | Security | Plan 01, Task 3 |
| 3 | `saveDirectToken` overwrites `tokenExpiresAt` with 6h estimate | Logic | Plan 02, Task 2 |
| 4 | Schema source union count is 5, not 4 | Schema | Plan 01, Task 2 |
| 5 | Data shape mismatch: `getHealthStatusAll` vs `IntegrationHealthCard` props | Architecture | Plan 01 Task 3 → Plan 03 Task 1 |

**Details:**

### Issue 1: `saveDirectToken` is a public mutation, not internal

**Severity: CRITICAL — will cause runtime failure**

Plan 02 Tasks 1 & 2 both instruct calling:
```typescript
await ctx.runMutation(internal.platformCredentials.mutations.saveDirectToken, {
  platformId: "bigseller",
  bearerToken: args.mucToken,
});
```

But `saveDirectToken` is exported as a **public `mutation`** (line 91 of `convex/platformCredentials/mutations.ts`), NOT as `internalMutation`. In Convex:
- `internal.*` references only `internalMutation`/`internalQuery`/`internalAction` exports
- Public mutations are referenced via `api.*`

**This code will fail at runtime** — the `internal.platformCredentials.mutations.saveDirectToken` path won't resolve.

**Recommendation:** Two options:
1. **Preferred:** Change `saveDirectToken` to an `internalMutation` and create a thin public wrapper that handles auth, then calls the internal version. This is cleaner because actions already validate admin auth themselves.
2. **Alternative:** Call via `api.*` but then you must pass the admin `token` — which means the action needs to forward the auth token through. This is awkward because the action already validated admin auth at the start.

Option 1 is cleaner and aligns with the K3Mart pattern where `updateToken` is already `internalMutation`.

### Issue 2: `getHealthStatusAll` exposes credential metadata without auth

**Severity: CRITICAL — security gap**

Plan 01 Task 3 states: "This query requires no auth token (it's read-only status for display)."

But this query returns:
- Whether credentials exist for each platform
- Token expiry dates and days remaining
- Last sync activity timestamps

This is sensitive operational data. The existing queries (`getCredentialStatus`, `getCredentialStatusForManagers`) both require role-based auth. An unauthenticated health query would be a regression.

**Recommendation:** Require at minimum `["manager", "admin"]` role, matching `getCredentialStatusForManagers` pattern. Add `token: v.string()` to args and call `requireRole()`.

### Issue 3: `saveDirectToken` overwrites `tokenExpiresAt` with 6h estimate

**Severity: CRITICAL — data corruption for BigSeller**

`saveDirectToken` (mutations.ts:108) hardcodes:
```typescript
const estimatedExpiry = now + 6 * 60 * 60 * 1000; // 6h estimate
```

When BigSeller's `saveBigSellerToken` calls `saveDirectToken`, it will store the 6h estimate instead of the actual JWT expiry (which could be 30+ days). The plan vaguely says "ALSO update tokenExpiresAt" but this creates a race: save with wrong value, then immediately overwrite with correct value.

**Recommendation:** Add an optional `tokenExpiresAt: v.optional(v.number())` parameter to `saveDirectToken`. When provided, use it instead of the 6h estimate. This is a non-breaking change (existing callers don't pass it). The BigSeller adapter passes the decoded JWT `exp * 1000`.

### Issue 4: Schema has 5 source unions, not 4

**Severity: CRITICAL — incomplete migration**

Plan 01 Task 2 says "Replace inline source unions in these 4 existing tables." But grepping `convex/schema.ts` reveals **5** tables with inline `source: v.union(...)`:
1. `externalOutlets` (line 967)
2. `externalRevenue` (line 1009)
3. `externalRevenueItems` (line 1054)
4. `externalSyncLogs` (line 1075)
5. `externalProductMappings` (line 1093)

The plan misses `externalProductMappings`. Leaving it with only 3 literals while the others have 6 will cause inconsistency and type errors when mapping products from new platforms.

**Recommendation:** Add `externalProductMappings` to the list. Replace all 5 inline unions with `externalSource`.

### Issue 5: Data shape mismatch between health query and UI component

**Severity: CRITICAL — Plan 03 will break**

Plan 01 Task 3 defines `getHealthStatusAll` returning:
```typescript
Array<{ platformId, status, label, lastActivity, daysRemaining }>
```

But Plan 03 Task 1 says `SettingsTab` will pass `healthStatus` to `IntegrationHealthCard`, which currently expects:
```typescript
syncHealth: SyncHealthData | undefined  // { lastSync, syncHistory, isStale, staleSinceMs }
credentialStatus: CredentialStatus | undefined  // { hasCredentials, hasToken, tokenExpiresAt, ... }
```

These are completely different shapes. The plan doesn't specify how to bridge this. Either:
- The `IntegrationHealthCard` props must be redesigned to accept the new shape
- Or `getHealthStatusAll` must return data matching the existing shapes
- Or a mapping layer must exist

**Recommendation:** Plan 03 Task 1 must explicitly define the new `IntegrationHealthCard` prop interface. The simplest approach: replace `syncHealth` + `credentialStatus` with a single `healthStatus` prop matching the `getHealthStatusAll` return type. The old `SyncHealthData`/sync-history display can be kept as an optional enhancement for platforms that have sync history.

---

## 3. Improvements (Recommended)

| # | Improvement | Impact | Effort |
|---|-------------|--------|--------|
| 1 | Extract `decodeJwtPayload` to shared `convex/lib/jwt.ts` | Medium | Low |
| 2 | Export `externalSource` validator from schema for cross-module use | Medium | Low |
| 3 | Add `by_linked_revenue` index to `grabfoodOrders` and `bigsellerOrders` | Medium | Low |
| 4 | Use CSS variable tokens for status badges per CODE_STYLE.md | Medium | Medium |
| 5 | Extract `formatCountdown` to shared util | Low | Low |

**Details:**

### Improvement 1: Extract `decodeJwtPayload` to shared util

The function exists locally in `convex/platformCredentials/actions.ts` (line 11-21). Plan 02 needs it for BigSeller and notes this ambiguity. Since both K3Mart (actions.ts) and BigSeller (adapter.ts) need JWT decoding, extract to `convex/lib/jwt.ts` and import from both. This prevents duplication and makes it testable.

### Improvement 2: Export `externalSource` for reuse

The shared `externalSource` validator defined in Plan 01 Task 2 should be exported (e.g., `export const externalSource = ...`) so future integrations and type guards can reference it without re-defining. Currently the plan keeps it as a `const` inside the schema file which is fine, but exporting it is zero-cost and prevents drift.

### Improvement 3: Missing `by_linked_revenue` index

Both `grabfoodOrders` and `bigsellerOrders` have `linkedRevenueId` fields that link to `externalRevenue`. Phase 27+ will likely need to look up orders by revenue record (for reconciliation). Add `by_linked_revenue` on `["linkedRevenueId"]` now to avoid a schema migration later.

### Improvement 4: Use CSS variable tokens for status badges

CODE_STYLE.md (Dark Mode section) explicitly says: "Do not use raw Tailwind color classes for semantic backgrounds." The existing `IntegrationHealthCard` uses hardcoded `border-green-500 dark:border-green-600` patterns extensively. Plan 03 should use the existing CSS variable tokens (`--color-status-success`, `--color-status-warning`, `--color-status-error`) instead.

### Improvement 5: Extract `formatCountdown` to shared util

`formatCountdown` is duplicated in both `IntegrationHealthCard.tsx` (line 83) and `GoBizTokenDialog.tsx` (line 27) — identical implementations. Plan 03 adds a third consumer (BigSellerTokenDialog). Extract to `src/lib/formatters.ts` or similar.

---

## 4. Refinements (Minor Suggestions)

- Plan 01 Task 1: Consider adding a `baseUrl` field to `PlatformMeta` for platforms with API endpoints — avoids scattering URLs across adapter files
- Plan 01 Task 2: The `grabfoodOrders.items` using `v.any()` should have an inline comment `// TODO: Phase 27 — define proper item schema` so it doesn't get forgotten
- Plan 02 Task 1: GoBiz password grant should log the refresh event to `externalSyncLogs` for audit trail consistency
- Plan 03 Task 2: Consider making the BigSeller instructions section link to the `reconnectSteps` array from registry rather than hardcoding text — keeps the single-source-of-truth principle

---

## 5. Duplication Analysis

### Existing Code to Leverage
| Existing Code | Location | How to Use |
|---------------|----------|------------|
| `decodeJwtPayload()` | `convex/platformCredentials/actions.ts:11` | Extract to `convex/lib/jwt.ts`, reuse in BigSeller adapter |
| `formatCountdown()` | `src/components/salesAnalytics/IntegrationHealthCard.tsx:83` | Extract to shared util, reuse in BigSeller dialog |
| `saveDirectToken` mutation | `convex/platformCredentials/mutations.ts:91` | Reuse (after fixing to internalMutation), don't duplicate |
| `validateAdminToken` query | `convex/platformCredentials/queries.ts:134` | Reuse in GoBiz and BigSeller actions for auth validation |
| `performK3MartRefresh` pattern | `convex/platformCredentials/actions.ts:31` | Use same error handling pattern for GoBiz login action |
| `useProtectedMutation` hook | `src/hooks/convex/useProtectedMutation.ts` | Reuse for BigSeller token save in frontend |

### Potential Duplication Risks
- Plan 02 risks inlining JWT decode instead of extracting — enforce extraction before implementation
- Plan 03 risks re-implementing status badge logic instead of using registry-driven derivation
- GoBiz dialog already has token save+verify pattern — BigSeller dialog should follow same UX flow (paste → preview → save → verify)

---

## 6. Phase/Wave Accuracy

| Wave | Assessment | Notes |
|------|------------|-------|
| Plan 01 (Registry + Schema) | Good | Clean foundation layer, no dependencies |
| Plan 02 (Backend auth flows) | Needs Adjustment | Critical fix: saveDirectToken calling convention |
| Plan 03 (Frontend UI) | Needs Adjustment | Critical fix: data shape mismatch, needs interface redesign |

**Ordering Issues:**
- Wave ordering (01→02→03) is correct — schema first, backend second, frontend third
- Plan 02 depends on Plan 01 for registry types — correctly declared

**Missing Steps:**
- No step to extract `decodeJwtPayload` to shared util (should be added to Plan 01 or as Plan 02 pre-task)
- No step to convert `saveDirectToken` from public mutation to internal (should be Plan 01 or Plan 02 pre-task)
- No documentation update step in any plan

---

## 7. Specialist Agent Recommendations

| Wave | Recommended Agent | Rationale |
|------|-------------------|-----------|
| Plan 01 | `convex-backend` | Schema changes, registry extension, new query |
| Plan 02 | `convex-backend` | Backend actions, API integration, credential management |
| Plan 03 | `react-ui-builder` | Frontend components, dialog UI, hook wiring |
| Verification | `code-auditor` | Type check, pattern compliance, registry-driven validation |

---

## 8. Git Workflow Assessment

### Branch Strategy
| Assessment | Status |
|------------|--------|
| Feature branch specified | ~Implicit via GSD `branching_strategy: "phase"` |
| Branch naming convention | Will be `feature/26-platform-auth-schema` per GSD |
| Merge strategy documented | GSD handles — merge to main after phase verification |

### Commit Strategy
| Wave | Expected Commits | Commit Type | Notes |
|------|------------------|-------------|-------|
| Plan 01 | 2-3 | feat | Registry extension, schema tables, health query |
| Plan 02 | 2 | feat | GoBiz login action, BigSeller adapter |
| Plan 03 | 2-3 | feat | IntegrationHealthCard refactor, dialogs, build verify |

### Recommended Commit Checkpoints
1. After Plan 01 Task 1+2: `feat(26): extend platform registry and add 4 schema tables`
2. After Plan 01 Task 3: `feat(26): add registry-driven health status query`
3. After Plan 02 Task 1: `feat(26): implement GoBiz password grant action`
4. After Plan 02 Task 2: `feat(26): implement BigSeller paste-token flow`
5. After Plan 03 Task 1: `feat(26): refactor IntegrationHealthCard to registry-driven`
6. After Plan 03 Task 2: `feat(26): add GoBiz refresh button and BigSeller token dialog`
7. After Plan 03 Task 3: `chore(26): verify build passes`

### Pre-Push Verification
- [x] Plans include `npm run type-check` at each task
- [x] Plan 03 Task 3 includes full `npm run build`
- [ ] No `npm run test` — testing plan is MISSING (see Section 10)

### CI/CD Considerations
| Concern | Assessment |
|---------|------------|
| Rollback strategy | Missing — no mention in any plan |
| Deployment order | Correct — backend (Convex) deploys before frontend (Vercel) via CI |
| Data backup needed | No — additive schema changes only (new tables + wider unions) |
| Migration safety | Safe — new tables are additive, wider unions are backward-compatible |

---

## 9. Documentation Checkpoints

| Wave | Documentation Update Required |
|------|-------------------------------|
| Plan 01 | `docs/SCHEMA.md` (4 new tables), `docs/API_REFERENCE.md` (getHealthStatusAll query) |
| Plan 02 | `docs/API_REFERENCE.md` (loginWithCredentials, previewBigSellerToken, saveBigSellerToken actions) |
| Plan 03 | `docs/CHANGELOG.md` (required), `docs/ROADMAP.md` (phase 26 marked complete) |

### CHANGELOG.md Entry (Draft)
```markdown
## 2026-02-XX - Platform Auth & Schema Foundation (Phase 26)

**Multi-platform credential management and schema expansion for GrabFood, BigSeller, and Consignment.**

### Added
- Platform registry extended to 6 platforms: K3Mart, GoBiz, Internal, GrabFood, BigSeller, Consignment
- Registry-driven credential health dashboard (Settings tab)
- GoBiz one-click password grant token refresh
- BigSeller paste-token flow with JWT expiry preview
- 4 new schema tables: grabfoodOrders, bigsellerOrders, consignmentOutlets, consignmentSettlements
- Shared `externalSource` union across all external tables (6 literals)

### Changed
- IntegrationHealthCard refactored to registry-driven rendering (no platformId string comparisons)
- SettingsTab renders all 6 platforms via PLATFORMS loop

**Files Modified:**
- convex/integrations/registry.ts
- convex/schema.ts
- convex/platformCredentials/queries.ts
- convex/integrations/gobiz/adapter.ts
- convex/integrations/bigseller/adapter.ts (new)
- convex/integrations/bigseller/config.ts (new)
- src/components/salesAnalytics/IntegrationHealthCard.tsx
- src/components/salesAnalytics/SettingsTab.tsx
- src/components/salesAnalytics/BigSellerTokenDialog.tsx (new)
- src/components/salesAnalytics/GoBizTokenDialog.tsx
```

---

## 10. Testing Plan Assessment

**Overall Testing Verdict: MISSING**

None of the 3 plans include any testing strategy beyond `npm run type-check` and `npm run build`. This is insufficient for a phase that introduces new backend actions making external API calls and handling credential storage.

### Planned Tests
| Layer | What's Tested | Test Type | Status |
|-------|---------------|-----------|--------|
| Backend | Registry types | convex-test | Missing |
| Backend | getHealthStatusAll query | convex-test | Missing |
| Backend | loginWithCredentials action | convex-test | Missing |
| Backend | BigSeller preview/save actions | convex-test | Missing |
| Frontend | IntegrationHealthCard | Vitest + RTL | Missing |
| Frontend | BigSellerTokenDialog | Vitest + RTL | Missing |
| Integration | Full auth flow | Manual | Missing |

### Missing Test Coverage (Must Add)

| # | Missing Test | Why It Matters | Suggested Approach |
|---|--------------|----------------|-------------------|
| 1 | `getHealthStatusAll` returns correct status for each `healthCheckType` | Core query — wrong status = misleading dashboard | convex-test: seed platformCredentials + externalSyncLogs, verify green/yellow/red thresholds |
| 2 | BigSeller JWT decode handles valid/expired/malformed tokens | Prevents runtime crash on bad input | Unit test for `decodeJwtPayload` with known JWTs |
| 3 | `saveDirectToken` with custom `tokenExpiresAt` | After the fix, must verify expiry is stored correctly | convex-test: save token with explicit expiry, read back |
| 4 | Schema source union accepts all 6 literals | Regression guard for union expansion | convex-test: insert externalRevenue with source="grabfood", verify no schema error |

### Test Execution Checkpoints
1. After Plan 01: `npm run test` (existing tests still pass + new schema tests)
2. After Plan 02: `npm run test` (JWT decode + action tests)
3. Before merge: Full `npm run test && npm run build`

### Regression Risk
- Existing `getCredentialStatus` and `getCredentialStatusForManagers` queries should not break
- Existing K3Mart and GoBiz sync flows must continue working
- Outlet management table in SettingsTab should render correctly for new source values

---

## 11. Edge Cases to Address

The plans should explicitly handle:

- [ ] **GrabFood with no `platformCredentials` record**: getHealthStatusAll should return `disconnected`, not throw
- [ ] **BigSeller JWT without `exp` field**: previewBigSellerToken should return clear error (plan covers this)
- [ ] **BigSeller JWT with `exp` in the past**: saveBigSellerToken should reject (plan covers this for preview but not for save — user could bypass preview)
- [ ] **GoBiz login with wrong credentials**: Should return user-friendly error, not raw HTTP status
- [ ] **Concurrent `saveDirectToken` calls**: Two admins saving tokens simultaneously — last-write-wins is acceptable but should be documented
- [ ] **`externalSyncLogs` empty for a platform**: getHealthStatusAll `last_sync` strategy should handle "never synced" gracefully
- [ ] **Registry change at runtime**: Frontend imports PLATFORMS as static object — if registry types change, frontend needs rebuild (acceptable, just document)
- [ ] **Existing IntegrationHealthCard consumers**: After props change in Plan 03, ensure SettingsTab is the only consumer — verify no other files import it

---

## 12. Approval Conditions

**For Approval, address these 5 Critical Issues:**

1. **Fix `saveDirectToken` calling convention**: Either convert to `internalMutation` (preferred) or use `api.*` path with token forwarding
2. **Add auth to `getHealthStatusAll`**: Require `["manager", "admin"]` role
3. **Fix `tokenExpiresAt` for BigSeller**: Add optional `tokenExpiresAt` param to `saveDirectToken` (or use separate `updateToken` call — but document the approach explicitly)
4. **Fix source union count**: Replace all 5 inline source unions (include `externalProductMappings`)
5. **Define `IntegrationHealthCard` new prop interface**: Explicitly specify how `getHealthStatusAll` data maps to component props

**Recommended before implementation:**
1. Extract `decodeJwtPayload` to `convex/lib/jwt.ts` (add as Plan 01 Task 0 or Plan 02 pre-task)
2. Add testing tasks to each plan (at minimum: health query tests, JWT decode tests)
3. Add documentation update tasks to Plan 03

---

*Generated by /staffreview skill*
*Staff Developer Review + Principal Developer Review*
