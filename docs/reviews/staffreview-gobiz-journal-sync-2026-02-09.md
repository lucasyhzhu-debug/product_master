# Staff Review: GoBiz API Integration Refresh

**Date:** 2026-02-09
**Plan:** `C:\Users\Irfan\.claude\plans\majestic-foraging-flamingo.md`
**Reviewers:** Staff Developer (Implementation) + Principal Developer (Architecture)

---

## 1. Summary

**Overall Assessment:** REVISE

This plan proposes a significant upgrade to the GoBiz integration, replacing proxy-based daily totals with transaction-level data from 3 newly discovered APIs. The overall approach is sound and follows existing patterns well. However, there are **5 critical issues** that must be addressed before implementation, primarily around N+1 query performance, API response format assumptions, token refresh mechanics in Convex actions, and missing database indexes for the auto-match algorithm.

---

## 2. Plan Structure Validation

**PLAN VALIDATION CHECKLIST**

| Requirement | Status |
|-------------|--------|
| Git Workflow section exists? | Yes |
| Branch name specified? | Yes: `feature/gobiz-journal-sync` |
| Checkpoint strategy defined? | Yes: 4 checkpoints after each wave |
| Implementation Waves section exists? | Yes |
| Agents assigned? | Yes |
| File paths specified? | Yes |
| PARALLEL/SEQUENTIAL marked? | Yes |
| Documentation Updates section exists? | Yes |
| CHANGELOG.md checkbox? | Yes |
| Success Criteria section exists? | Yes |
| Type check requirement? | Yes |
| Build requirement? | Yes |

**Plan structure validated**

---

## 3. Critical Issues (Must Fix)

Issues that would cause implementation failure or serious bugs.

| # | Issue | Category | Location in Plan |
|---|-------|----------|------------------|
| 1 | N+1 Query Problem: orders/search called per transaction | Performance | Wave 2, Task 2A-2B |
| 2 | Missing `by_name` index on menuProducts table | Schema | Wave 1, Task 1C (autoMatchMenuProduct) |
| 3 | Token refresh from Convex action may not work | Integration | Wave 2, Task 2B |
| 4 | journals/search API response format unverified | Data | Wave 2, Task 2B |
| 5 | Cron removal may break scheduled infrastructure | Infra | Wave 2, Task 2C |

---

### Issue 1: N+1 Query Problem - orders/search Called Per Transaction

**Severity:** CRITICAL

The plan states:
> "For each NEW revenue record (not deduped): Call orders/search API with order_number"

For a 7-day backfill with potentially 50+ transactions per day, this means **350+ sequential API calls**. Each orders/search call appears to be synchronous and in the hot path of the sync.

**Evidence from codebase:**
Looking at the existing K3Mart adapter (`convex/integrations/k3mart/adapter.ts`), the sales API returns all transactions in a single call (line 311-322):
```typescript
const response = await fetch(url.toString(), { ... });
const json = (await response.json()) as K3MartSalesResponse;
const transactions = json.data;
```

The GoBiz plan proposes per-transaction fetching which will:
1. Take 5-10+ minutes for initial backfill (350 API calls at ~1s each)
2. Hit rate limits
3. Risk timeout (Convex actions have a 10-minute limit)

**Recommendation:**
1. **Option A (Preferred):** Batch order number lookups - check if orders/search supports multiple order numbers in one call
2. **Option B:** Skip item detail fetching during sync, add a lazy-load pattern where items are fetched on-demand when user expands a transaction row
3. **Option C:** If neither works, implement pagination/chunking with continuation tokens and multiple action calls

**If you must keep per-transaction calls:**
- Add rate limiting (100ms delay between calls minimum)
- Store journal data first, then populate items via background job
- Show "Loading items..." in UI until populated

---

### Issue 2: Missing `by_name` Index on menuProducts Table

**Severity:** CRITICAL

The plan's auto-match algorithm states:
> "Query menuProducts where name EXACTLY matches item.name"

However, checking `convex/schema.ts` lines 50-77, the `menuProducts` table has these indexes:
```typescript
.index("by_code", ["code"])
.index("by_active", ["isActive"])
.index("by_pos_slot", ["posSlot"])
.index("by_packaging_pos_slot", ["packagingPosSlot"])
```

**There is NO `by_name` index.** The auto-match algorithm will require a full table scan for every item matched by name.

Looking at the existing `menuProducts/queries.ts`, all queries use either:
- `.query("menuProducts").collect()` (full scan)
- `.withIndex("by_code", ...)` (code lookup)
- `.withIndex("by_active", ...)` (active filter)

**Impact:**
- With ~50 menu products and ~50 items per order, this is 2,500 comparisons per transaction
- For 350 transactions in 7-day backfill: **875,000 comparisons** (unacceptable)

**Recommendation:**
Add to Wave 1, Task 1A (schema changes):
```typescript
// In menuProducts table definition, add:
.index("by_name", ["name"])
.index("by_default_price", ["defaultPrice"])
```

Then update `autoMatchMenuProduct` to use indexes:
```typescript
// Step 1: Exact name match
const exactNameMatch = await ctx.db
  .query("menuProducts")
  .withIndex("by_name", q => q.eq("name", itemName))
  .filter(q => q.eq(q.field("defaultPrice"), itemPrice))
  .first();
```

---

### Issue 3: Token Refresh from Convex Action May Not Work

**Severity:** CRITICAL

The plan states:
> "On 401: attempt token refresh (3 methods from POC), retry once."

The POC (`scripts/gobiz_sales_poc.py` lines 139-250) implements token refresh using:
1. Cookie-based refresh via `/micro-app/auth` endpoint
2. Token rotate via `/analytics-backend/api/auth/token/rotate`
3. API refresh via `https://api.gobiz.co.id/auth/token/refresh`

**Problems with implementing this in Convex:**

1. **Cookies don't work in Convex actions:** The POC relies on browser cookie headers (`Set-Cookie` parsing, `cookies={}` in requests). Convex `fetch` doesn't automatically handle cookies like Python requests.

2. **`refresh_token` storage location:** The plan adds `refreshToken` to `platformCredentials`, but the POC shows the refresh token is typically stored as an HTTP-only cookie, not easily extractable.

3. **Method 1 (cookie refresh) won't work:** This requires a browser session with cookies.

4. **Method 3 (API refresh) is the only viable option:** This is a JSON POST with `{"refresh_token": "..."}` and might work, but we haven't verified the actual response format.

**Evidence from codebase:**
Looking at `convex/platformCredentials/mutations.ts` line 91-128, the `saveDirectToken` mutation currently only accepts `bearerToken` - there's no `refreshToken` parameter yet.

**Recommendation:**
1. Update `saveDirectToken` to accept optional `refreshToken` parameter (as planned)
2. Document that users must manually copy BOTH tokens from DevTools cookies
3. Implement ONLY Method 3 (API refresh) - the JSON endpoint
4. Add fallback behavior: if refresh fails, mark token as expired and notify user
5. Test the API refresh endpoint manually before implementing

---

### Issue 4: journals/search API Response Format Unverified

**Severity:** CRITICAL

The plan shows the request payload for journals/search but **we only have the request, not the response format**.

From the plan:
```
POST https://api.gobiz.co.id/journals/search
Body: {...complex filter...}
Response: ??? (not documented)
```

The POC (`scripts/gobiz_sales_poc.py`) uses the Dashboard Analytics API (proxy/63), which has a known response format documented in `config.ts`. But the journals/search API is completely new and undocumented in the codebase.

**What we need to verify:**
1. What fields are returned per journal entry?
2. Is `metadata.transaction.order_number` actually present? (needed for orders/search lookup)
3. How is pagination handled? (the plan assumes `from`/`size` like Elasticsearch)
4. Are commission, ad_burn, promo_burn in the journal response or only in dashboard?
5. What is the exact path to gross_amount and net_amount?

**Recommendation:**
1. **Before implementation:** Add a test curl command to verify the response
2. Create a spike task: "Verify journals/search API response structure"
3. Document the actual response format in `convex/integrations/gobiz/config.ts`
4. Consider: the dashboard API (currently used) might already have all 5 metrics we need - the plan's 3-API approach may be over-engineered

**Alternative approach:**
If journals/search doesn't return all needed fields, consider:
- Keep using Dashboard API for totals (already working)
- Add journals/search only for transaction IDs and timestamps
- Skip orders/search entirely and let users view items on GoBiz portal

---

### Issue 5: Cron Removal May Break Scheduled Infrastructure

**Severity:** MODERATE-HIGH

The plan states:
> "Remove `syncGoBizRevenueCron` - no longer needed."
> "Delete the `sync gobiz revenue` cron interval (lines 12-16)"

Looking at `convex/crons.ts`:
```typescript
crons.interval(
  "sync gobiz revenue",
  { hours: 3 },
  internal.integrations.gobiz.adapter.syncGoBizRevenueCron
);
```

**Issues:**
1. The cron function `syncGoBizRevenueCron` is an `internalAction` (line 280-287 of adapter.ts). If we remove the cron but keep the function, we have dead code.
2. If we remove both the cron AND the function, what happens to sync logs with `syncType: "cron"`? They become orphaned.
3. Users who relied on auto-sync will lose data if they forget to manually sync.

**However, looking at the existing code:**
The cron only syncs "today's" data (default to current day range). For transaction-level sync, daily cron wouldn't capture all transactions anyway.

**Recommendation:**
1. Removing the cron is correct for this design
2. Also remove the `syncGoBizRevenueCron` internalAction to avoid dead code
3. Update `externalSyncLogs.syncType` validator to remove `"cron"` option... **WAIT, this is wrong!**

Looking at `convex/schema.ts` line 950:
```typescript
syncType: v.union(v.literal("manual"), v.literal("cron")),
```

K3Mart still uses cron for token refresh. We should:
1. Keep `syncType: "cron"` in the validator (K3Mart needs it)
2. Just remove the GoBiz cron entry from `crons.ts`
3. Remove the `syncGoBizRevenueCron` function from adapter.ts
4. Document in CHANGELOG that GoBiz sync is now manual-only

---

## 4. Improvements (Recommended)

Changes that would significantly improve the implementation.

| # | Improvement | Impact | Effort |
|---|-------------|--------|--------|
| 1 | Add validation layer for API responses | High | Medium |
| 2 | Implement retry logic with exponential backoff | Medium | Low |
| 3 | Add match confidence threshold configuration | Medium | Low |
| 4 | Use transactions for atomic item + revenue saves | Medium | Medium |
| 5 | Add progress callback for long-running sync | Medium | Medium |

---

### Improvement 1: Add Validation Layer for API Responses

The plan creates TypeScript interfaces (`GoBizJournalResponse`, etc.) but doesn't validate that API responses match these interfaces at runtime.

**Recommendation:**
Add Zod schemas for API responses:
```typescript
import { z } from "zod";

const JournalEntrySchema = z.object({
  metadata: z.object({
    transaction: z.object({
      order_number: z.string(),
      transaction_time: z.string(),
      gross_amount: z.number(),
      // ... etc
    }),
  }),
});

// In sync handler:
const parsed = JournalEntrySchema.safeParse(rawData);
if (!parsed.success) {
  console.error("Invalid API response:", parsed.error);
  // Handle gracefully
}
```

---

### Improvement 2: Implement Retry Logic with Exponential Backoff

The plan mentions "retry once" on 401, but doesn't specify retry behavior for:
- Network errors
- 429 rate limiting
- 500 server errors

**Recommendation:**
```typescript
async function fetchWithRetry(url: string, options: RequestInit, maxRetries = 3): Promise<Response> {
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      const response = await fetch(url, options);
      if (response.status === 429) {
        const delay = Math.pow(2, attempt) * 1000; // 1s, 2s, 4s
        await sleep(delay);
        continue;
      }
      return response;
    } catch (error) {
      if (attempt === maxRetries - 1) throw error;
      await sleep(Math.pow(2, attempt) * 1000);
    }
  }
  throw new Error("Max retries exceeded");
}
```

---

### Improvement 3: Add Match Confidence Threshold Configuration

The auto-match algorithm has 4 confidence levels but no way to configure which levels are acceptable for auto-linking.

**Recommendation:**
Add to `GOBIZ_CONFIG`:
```typescript
autoMatch: {
  minConfidenceForAutoLink: "price_only" as const, // Only link if exact or price_only
  enableFuzzyNameMatch: false, // Disable name_only by default (too risky)
}
```

---

### Improvement 4: Use Transactions for Atomic Item + Revenue Saves

The plan saves revenue first, then saves items separately. If item save fails, you have orphaned revenue records.

**Recommendation:**
Use a single internal mutation that saves both:
```typescript
export const saveRevenueWithItems = internalMutation({
  args: {
    revenue: v.object({ ... }),
    items: v.array(v.object({ ... })),
  },
  handler: async (ctx, args) => {
    const revenueId = await ctx.db.insert("externalRevenue", args.revenue);
    for (const item of args.items) {
      await ctx.db.insert("externalRevenueItems", { ...item, revenueId });
    }
    return revenueId;
  },
});
```

---

### Improvement 5: Add Progress Callback for Long-Running Sync

A 7-day backfill with 350+ transactions could take several minutes. Users need feedback.

**Recommendation:**
1. Update sync log with progress percentage during sync
2. Frontend polls `getSyncLogs` to show progress bar
3. Add `progressPercent` field to syncLog:
```typescript
// In externalSyncLogs table:
progressPercent: v.optional(v.number()), // 0-100

// During sync:
if (i % 10 === 0) {
  await ctx.runMutation(internal.externalData.mutations.updateSyncLog, {
    logId: syncLogId,
    progressPercent: Math.round((i / totalDays) * 100),
  });
}
```

---

## 5. Refinements (Minor Suggestions)

Nice-to-have improvements that are not blocking.

- Consider adding `externalRevenueId` field to `externalRevenueItems` instead of `revenueId` for consistency with naming convention (`externalTransactionId` pattern)
- Add `createdBy` field to `externalRevenueItems` for audit trail
- Consider storing `variants` as `v.array(v.object(...))` instead of JSON string for type safety
- Add index `by_created_at` on `externalRevenueItems` for time-based queries
- Consider using `v.optional(v.id("menuProducts"))` consistently (already correct in plan)

---

## 6. Duplication Analysis

### Existing Code to Leverage

| Existing Code | Location | How to Use |
|---------------|----------|------------|
| Token resolution pattern | `convex/integrations/gobiz/adapter.ts:24-30` | Extend to include refreshToken |
| Dedup via by_source_txn index | `convex/externalData/mutations.ts:84-93` | Reuse for journal transactions |
| Incremental sync with overlap | `convex/integrations/k3mart/adapter.ts:291-305` | Copy overlapDays pattern |
| Sync log lifecycle | `convex/externalData/mutations.ts:101-135` | Reuse createSyncLog/updateSyncLog |
| Product mapping upsert | `convex/externalData/mutations.ts:152-184` | Reuse for GoBiz items |
| formatDate helper | `convex/integrations/k3mart/helpers.ts` | Import for date formatting |

### Potential Duplication Risks

- **wibDateToUtcRange helper:** Similar date conversion exists in Python POC. Ensure consistent implementation.
- **Token refresh logic:** Don't duplicate - extract to a shared utility if K3Mart ever needs it
- **API response parsing:** Consider a shared `parseApiResponse` utility with Zod validation

---

## 7. Phase/Wave Accuracy

Assessment of the implementation phases:

| Phase | Assessment | Notes |
|-------|------------|-------|
| Wave 1: Backend Schema + Config | Good | Dependencies clear, parallel tasks work |
| Wave 2: Adapter Rewrite | Needs Adjustment | N+1 problem, should split into sub-tasks |
| Wave 3: Frontend | Good | After Wave 2, parallel tasks work |
| Wave 4: Verification | Good | Standard verification sequence |

**Ordering Issues:**
- Wave 2A (helpers.ts) should come before Wave 2B (adapter.ts) - currently marked SEQUENTIAL which is correct
- Wave 2C (cron removal) can be parallel with Wave 2B

**Missing Phases:**
- Add "Wave 0: API Verification Spike" - verify journals/search response format before implementation
- Consider splitting Wave 2B into "2B1: Journal sync" and "2B2: Order detail fetch" for easier debugging

---

## 8. Specialist Agent Recommendations

Which agents should handle each phase of implementation:

| Phase | Recommended Agent | Rationale |
|-------|-------------------|-----------|
| Wave 0: API Spike | `general-purpose` | Exploratory curl testing, not code changes |
| Wave 1A: Schema | `convex-backend` | Schema changes are core Convex work |
| Wave 1B: Config | `convex-backend` | Config + TypeScript interfaces |
| Wave 1C-E: Mutations/Queries | `convex-backend` | Backend data access layer |
| Wave 2A-C: Adapter | `convex-backend` | Complex action with external API calls |
| Wave 3A-C: UI | `react-ui-builder` | Frontend components and pages |
| Wave 3D: Hooks | `frontend-integrator` | Convex hook wiring |
| Wave 4: Verification | `code-auditor` | Type check and pattern compliance |

**Available Agents:**
- `convex-backend` - Backend mutations, queries, schema changes
- `react-ui-builder` - Frontend components, pages, hooks
- `frontend-integrator` - Connecting Convex hooks to UI
- `code-auditor` - Code review, quality checks
- `cto-orchestrator` - Cross-cutting concerns, major decisions

---

## 9. Git Workflow Assessment

### Branch Strategy
| Assessment | Status |
|------------|--------|
| Feature branch specified | Yes: `feature/gobiz-journal-sync` |
| Branch naming convention | Correct: `feature/{name}` |
| Merge strategy documented | Implied (standard PR flow) |

### Commit Strategy
| Phase | Expected Commits | Commit Type | Notes |
|-------|------------------|-------------|-------|
| Wave 1 | 5 | feat | One per task (1A-1E) |
| Wave 2 | 4 | feat | One per task (2A-2D) |
| Wave 3 | 4 | feat | One per task (3A-3D) |
| Wave 4 | 1 | chore | Verification pass |

### Recommended Commit Checkpoints
The plan should commit at these natural boundaries:
1. After schema changes (1A) -> `feat: add externalRevenueItems table and schema fields`
2. After config rewrite (1B) -> `feat: rewrite GoBiz config with 3-API structure`
3. After mutations/queries (1C-1E) -> `feat: add revenue items mutations and auto-match logic`
4. After helpers (2A) -> `feat: add GoBiz date conversion and request helpers`
5. After adapter rewrite (2B) -> `feat: implement journal-level GoBiz sync with order details`
6. After cron removal (2C-2D) -> `fix: remove GoBiz cron, update registry metadata`
7. After frontend (3A-3D) -> `feat: add GoBiz transaction items UI with match status`

### Pre-Push Verification
- [x] Plan includes `npm run build` check
- [x] Plan includes `npm run type-check` verification
- [ ] Plan includes local testing before push - **MISSING: Add "npx convex dev" verification**

### CI/CD Considerations
| Concern | Assessment |
|---------|------------|
| Rollback strategy | Missing - add note about reverting schema changes |
| Deployment order | Correct - backend (Wave 1-2) before frontend (Wave 3) |
| Data backup needed | Recommended - externalRevenue has existing data |
| Migration safety | Safe - all new fields are optional, new table |

### Git Workflow Issues Found
- Missing: "Verify in local dev environment before push" step
- Missing: Rollback strategy for schema changes
- Consider: Pre-merge data backup of externalRevenue table

---

## 10. Documentation Checkpoints

| Phase | Documentation Update Required |
|-------|-------------------------------|
| Wave 1 (Schema) | docs/SCHEMA.md - Add externalRevenueItems table, new fields |
| Wave 2 (Adapter) | docs/API_REFERENCE.md - Document syncGoBizRevenue action changes |
| Wave 4 (Complete) | docs/CHANGELOG.md - Feature summary |
| Wave 4 (Complete) | docs/GOBIZ_SALES_SCRIPT.md - Update status |

### CHANGELOG.md Entry (Draft)
```markdown
## 2026-02-XX - GoBiz Journal-Level Integration

**Transaction-level GoBiz sync with item details and auto-matching**

- Add `externalRevenueItems` table for per-transaction item storage
- Implement journals/search API for transaction-level data (replaces dashboard totals)
- Auto-match GoBiz items to menuProducts by name + price
- Store 5 metrics: gross, net, commission, adBurn, promoBurn
- Add refresh token storage for extended session duration
- Remove GoBiz auto-sync cron (manual sync only)
- Add expandable transaction rows in Revenue table
- Role-gate commission/fees visibility to Manager/Admin

**Files Modified:**
- convex/schema.ts (new table + field additions)
- convex/integrations/gobiz/adapter.ts (complete rewrite)
- convex/integrations/gobiz/config.ts (complete rewrite)
- convex/integrations/gobiz/helpers.ts (NEW)
- convex/externalData/mutations.ts (new saveRevenueItems)
- convex/externalData/queries.ts (new getRevenueItems)
- convex/platformCredentials/* (refreshToken support)
- convex/crons.ts (remove GoBiz cron)
- src/components/salesAnalytics/* (item details UI)
- src/hooks/convex/useExternalData.ts (new hooks)

**Breaking Changes:**
- GoBiz sync no longer runs automatically every 3 hours
```

---

## 11. Edge Cases to Address

The plan should explicitly handle:

- [ ] **Empty journal response:** What if journals/search returns 0 transactions for a day?
- [ ] **Order not found:** What if orders/search returns 404 for an order_number from journals?
- [ ] **Partial item match:** What if some items match and some don't in the same order?
- [ ] **Price mismatch:** GoBiz item price is 100000, menuProduct defaultPrice is 95000 (close but not exact)
- [ ] **Duplicate product names:** Multiple menuProducts with same name but different grams/prices
- [ ] **Refund transactions:** How are `status: "refund"` or `"partial_refund"` transactions handled?
- [ ] **Currency/decimal handling:** Are amounts in cents or IDR? (POC shows `/100` for cents)
- [ ] **Timezone edge cases:** Transaction at 23:59 WIB vs 00:01 WIB next day
- [ ] **Large batch handling:** What if a day has 500+ transactions? Pagination loop needed
- [ ] **Token expires mid-sync:** What if 401 happens on transaction 200 of 350?

---

## 12. Approval Conditions

**For Approval, address:**
1. Critical Issue #1: Design solution for N+1 query problem (orders/search per transaction)
2. Critical Issue #2: Add `by_name` index to menuProducts table
3. Critical Issue #3: Verify API refresh endpoint works from Convex actions
4. Critical Issue #4: Document journals/search API response format
5. Critical Issue #5: Confirm cron removal is intentional and document impact

**Recommended before implementation:**
1. Add "Wave 0: API Verification Spike" phase
2. Add retry logic with exponential backoff
3. Add progress tracking for long-running sync
4. Consider batching or lazy-loading for order details
5. Add rollback strategy to Git Workflow section

---

## 13. Security Review

| Concern | Status | Notes |
|---------|--------|-------|
| Token storage | OK | Stored in platformCredentials, not exposed in queries |
| Refresh token handling | OK | Stored same as access token, admin-only access |
| Commission visibility | OK | Plan gates to Manager/Admin via useAuth |
| Input validation | Needs work | Add Zod validation for API responses |
| Rate limiting | Missing | No protection against API rate limits |

---

*Generated by /staffreview skill*
*Staff Developer Review + Principal Developer Review*
