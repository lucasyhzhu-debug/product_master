# Root Cause Analysis Report

## Incident: Kitchen Page Production Failure

| Field | Value |
|-------|-------|
| **Date** | 2026-02-03 |
| **Duration** | ~15 minutes (from discovery to fix) |
| **Severity** | High (Kitchen page completely broken) |
| **Status** | ✅ Resolved |

---

## Executive Summary

The Kitchen View page (`/kitchen`) was returning a 204 No Content response in production. **Two root causes were identified:**

1. **Primary**: Use of dynamic `import()` statements in Convex backend code, which is not supported by the Convex serverless runtime
2. **Secondary**: Deployment confusion between Convex "Development" and "Production" environments, causing fixes to be deployed to the wrong environment

---

## Timeline

| Time (GMT+7) | Event |
|--------------|-------|
| 2026-02-02 23:08 | Commit `f4fda3b` introduced dynamic imports during Phase 2 refactor |
| 2026-02-03 ~09:24 | Merge to main: `9e24f43` (Phase 2 queries) |
| 2026-02-03 ~18:17 | User reported Kitchen page not working |
| 2026-02-03 18:17:11 | First Convex log: `TypeError: dynamic module import unsupported` |
| 2026-02-03 ~18:20 | Fix deployed to **wrong** Convex instance (`decisive-wombat-7` Production) |
| 2026-02-03 18:22:58 | Error still occurring - deployment mismatch discovered |
| 2026-02-03 18:24:57 | Second failed attempt - still wrong instance |
| 2026-02-03 ~18:30 | Discovered Vercel uses `exciting-fennec-671` (Development) |
| 2026-02-03 18:30:44 | Fix deployed to correct instance via `npx convex dev --once` |
| 2026-02-03 ~18:31 | Kitchen page working |

---

## Root Cause #1: Dynamic Imports in Convex

### What Happened

During the **Phase 2 Query Optimization Refactor**, dynamic `import()` statements were introduced to the `getKitchenOrders` query to "avoid circular dependency issues."

**Offending Code** (introduced in `f4fda3b`):
```typescript
export const getKitchenOrders = query({
  args: {},
  handler: async (ctx) => {
    // ❌ Dynamic imports - NOT supported in Convex runtime
    const { fetchOrdersByStatuses } = await import("./helpers/statusFetching");
    const { fetchOrdersWithItemsAndProduction } = await import("./helpers/batchFetching");
    // ...
  },
});
```

### Why It Was Introduced

The Phase 2 refactor was a major performance optimization effort:
- **Goal**: Eliminate N+1 query patterns, reduce query count by 67%
- **Scope**: 27 files changed, 6,820 insertions
- **New helpers created**:
  - `convex/orders/helpers/batchFetching.ts` (150 lines)
  - `convex/orders/helpers/statusFetching.ts` (54 lines)

The commit message explicitly stated: *"Import helpers (dynamic to avoid circular dependency issues)"*

This was a **misguided workaround** - circular dependencies should be solved by restructuring code, not by using dynamic imports.

### Why It Worked Locally But Failed in Production

1. **Local Dev (`npx convex dev`)**: May have more permissive module resolution or different bundling behavior
2. **Production Convex Runtime**: Runs in restricted V8 isolates that do NOT support ES dynamic `import()`

### The Fix

Changed to static imports at file top:
```typescript
import { fetchOrdersByStatuses } from "./helpers/statusFetching";
import { fetchOrdersWithItemsAndProduction } from "./helpers/batchFetching";
```

---

## Root Cause #2: Convex Environment Confusion

### The Setup

Your Convex project has **two environments**:

| Environment | Deployment ID | Purpose |
|-------------|---------------|---------|
| **Production** | `decisive-wombat-7` | Where `npx convex deploy` pushes |
| **Development (Cloud)** | `exciting-fennec-671` | Where your Vercel app connects |

### The Problem

Your **Vercel app** (`frollie-product.vercel.app`) is configured to use the **Development** environment:
```
VITE_CONVEX_URL=https://exciting-fennec-671.convex.cloud
```

But `npx convex deploy` pushes to **Production** (`decisive-wombat-7`).

### Why This Happened

1. **Initial Setup**: You started with `npx convex dev` which created `exciting-fennec-671` as your development deployment
2. **Vercel Integration**: When connecting Vercel, you used the development URL
3. **Never Used Production**: The production environment was created but never actually used
4. **Confusion**: The `.env.local` says "Production" in comments but `CONVEX_DEPLOYMENT=dev:exciting-fennec-671` - the naming is misleading

### Timeline of Deployment Attempts

| Command | Target | Result |
|---------|--------|--------|
| `npx convex deploy --yes` | `decisive-wombat-7` (Production) | ❌ Wrong environment |
| `npx convex deploy --yes --env-file .env.local` | Failed auth | ❌ |
| `npx convex dev --once` | `exciting-fennec-671` (Development) | ✅ Correct! |

---

## What We Were Doing at the Time

### Phase 2 Refactor Context

The bug was introduced during **Phase 2 of a 4-phase Kitchen Orders Refactor**:

| Phase | Focus | Status |
|-------|-------|--------|
| Phase 1 | Pre-flight validation, backup | ✅ Complete |
| **Phase 2** | Query optimization (N+1 elimination) | ✅ Complete - **Bug introduced here** |
| Phase 3 | Frontend & mutations split | ✅ Complete |
| Phase 4 | OLD system removal | ✅ Complete |

**Phase 2 Goals (from commit message):**
- Eliminate N+1 query patterns
- Reduce query count: 27 queries → 9 queries (67% reduction)
- Create reusable batch fetching helpers

**Phase 2 Deliverables:**
- `helpers/batchFetching.ts` - Batch fetch orders/items/production
- `helpers/statusFetching.ts` - Fetch orders by multiple statuses
- Performance analysis documentation

The refactor was well-planned with documentation, but the dynamic import workaround slipped through code review.

---

## Impact

| Area | Impact |
|------|--------|
| **Kitchen View** | Completely non-functional for ~15 minutes |
| **Order Fulfillment** | Staff unable to track ball production |
| **Data** | No data loss or corruption |
| **Other Pages** | Unaffected |

---

## Lessons Learned

### What Went Wrong

1. **Workaround Smell Ignored**: Using dynamic imports to "avoid circular dependencies" is a code smell that should have triggered review
2. **Incomplete Testing**: Refactor tested locally but not verified in production Convex
3. **Environment Confusion**: Unclear which Convex deployment is "production"
4. **Misleading Config Comments**: `.env.local` says "Production" but points to `dev:` deployment

### What Went Right

1. **Fast Detection**: Error caught within minutes via Convex logs
2. **Clear Error Message**: `dynamic module import unsupported` pointed directly to the issue
3. **Quick Fix**: Simple code change, no data impact

---

## Action Items

### Immediate (Completed)

- [x] Fix deployed to correct Convex instance (`exciting-fennec-671`)
- [x] Fix committed and pushed to main (`bc3163d`)
- [x] Verified no other dynamic imports in `convex/` directory

### Short-term

- [ ] **Clarify Convex environments**: Either use `exciting-fennec-671` for everything OR migrate to `decisive-wombat-7`
- [ ] **Update `.env.local` comments**: Remove misleading "Production" label
- [ ] **Add to CODE_STYLE.md**: Document that dynamic `import()` is not allowed in Convex
- [ ] **Add CI check**: Grep for `await import(` in `convex/` directory

### Long-term

- [ ] Consider consolidating to single Convex deployment
- [ ] Add production smoke tests after Convex deployments
- [ ] Create deployment checklist for refactors touching Convex code

---

## Recommended Environment Setup

**Option A: Use Development for Everything (Current State)**
```bash
# .env.local
CONVEX_DEPLOYMENT=dev:exciting-fennec-671
VITE_CONVEX_URL=https://exciting-fennec-671.convex.cloud

# Deploy command
npx convex dev --once   # NOT npx convex deploy
```

**Option B: Migrate Vercel to Production**
```bash
# Update Vercel environment variables to:
VITE_CONVEX_URL=https://decisive-wombat-7.convex.cloud

# Then use:
npx convex deploy
```

---

## Verification Commands

**Check for dynamic imports:**
```bash
grep -r "await import(" convex/ --include="*.ts"
# Expected: No matches
```

**Verify correct deployment target:**
```bash
npx convex dashboard
# Should open: https://dashboard.convex.dev/d/exciting-fennec-671
```

---

## Commits

| Commit | Description |
|--------|-------------|
| `f4fda3b` | **Root cause**: Introduced dynamic imports (Phase 2 refactor) |
| `9e24f43` | Merged Phase 2 to main |
| `bc3163d` | **Fix**: Replaced with static imports |

---

## Files Affected

- `convex/orders/queries.ts` - Dynamic imports removed
- `convex/orders/helpers/statusFetching.ts` - No changes needed (clean)
- `convex/orders/helpers/batchFetching.ts` - No changes needed (clean)

---

*Report generated: 2026-02-03*
*Author: Claude Code Assistant*
