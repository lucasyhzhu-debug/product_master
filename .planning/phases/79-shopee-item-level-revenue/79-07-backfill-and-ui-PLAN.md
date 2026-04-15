---
phase: 79
plan: 07
type: execute
wave: 3
depends_on: [79-02, 79-03, 79-04]
files_modified:
  - convex/bigsellerOrders/mutations.ts
  - convex/bigsellerOrders/queries.ts
  - src/components/salesAnalytics/BigSellerSyncPanel.tsx
  - src/components/salesAnalytics/BigSellerOrdersTable.tsx
  - src/hooks/convex/useBigSeller.ts
autonomous: false
requirements: [DA-10, DA-11, DA-13]
tags: [bigseller, shopee, backfill, ui, admin]
must_haves:
  truths:
    - "Admin can click 'Backfill historical items' button in BigSellerSyncPanel; backfillBigsellerItems mutation iterates all bigsellerOrders with skuVoList.length > 0 and creates externalRevenueItems idempotently"
    - "Admin can click 'Re-check empty rows' button; rescanEmptyRows action identifies date ranges of empty-skuVoList orders, triggers runBigsellerSync for those ranges, then runs backfill for newly-populated rows"
    - "Both buttons show progress toast and final count (e.g., 'Created 143 items from 89 orders (2 skipped as duplicates)')"
    - "Both buttons are idempotent — clicking twice creates zero new rows on the second click"
    - "BigSellerOrdersTable shows 'Pending SKU from Shopee' label for rows with age < 24h AND empty skuVoList; reverts to '--' after 24h (D-14, D-15)"
    - "Backfill does NOT deduct inventory (D-21) and does NOT call processBigsellerSales (D-22)"
    - "DA-11 (buyer fields) explicitly deferred: no buyer columns in UI, no schema change. Rationale documented in SUMMARY.md"
  artifacts:
    - path: convex/bigsellerOrders/mutations.ts
      provides: backfillBigsellerItems mutation (admin-gated)
      contains: "backfillBigsellerItems"
    - path: convex/bigsellerOrders/mutations.ts
      provides: rescanEmptyRows action (admin-gated)
      contains: "rescanEmptyRows"
    - path: src/components/salesAnalytics/BigSellerSyncPanel.tsx
      provides: Two new buttons (Backfill items, Re-check empty rows) with toast feedback
      contains: "Backfill historical items"
    - path: src/components/salesAnalytics/BigSellerOrdersTable.tsx
      provides: 24h threshold "Pending SKU from Shopee" label branch
      contains: "Pending SKU from Shopee"
  key_links:
    - from: BigSellerSyncPanel buttons
      to: convex/bigsellerOrders/mutations.ts (backfill + rescan)
      via: useMutation / useAction hooks
      pattern: "useMutation.*backfillBigsellerItems\\|useAction.*rescanEmptyRows"
    - from: BigSellerOrdersTable "Pending SKU" label
      to: order.orderTimeMs + 24h threshold constant
      via: "Date.now() - orderTimeMs < PENDING_SKU_THRESHOLD_MS"
      pattern: "PENDING_SKU_THRESHOLD_MS"
---

<objective>
Ship the admin-facing backfill workflow and the "Pending SKU from Shopee" UI label:

1. Backend: `backfillBigsellerItems` mutation (iterates existing bigsellerOrders, emits items via `saveRevenueItems`, idempotent via existing dedup).
2. Backend: `rescanEmptyRows` action (identifies empty-skuVoList date ranges, re-syncs, then backfills newly-populated rows).
3. Frontend: Two prominent buttons in `BigSellerSyncPanel` with progress toast.
4. Frontend: 24h-threshold "Pending SKU from Shopee" label in `BigSellerOrdersTable`.
5. Document DA-11 deferral (no buyer fields — BigSeller API doesn't expose them).

Purpose: DA-10, DA-11 (deferral), DA-13. Closes the admin tooling loop and the UX gap on transient empty rows.

Output: Two buttons live; 24h label live; backfill test green; manual verification checkpoint.
</objective>

<execution_context>
@D:/Claude/Product Manager/product_master/.claude/get-shit-done/workflows/execute-plan.md
@D:/Claude/Product Manager/product_master/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/phases/79-shopee-item-level-revenue/79-CONTEXT.md
@.planning/phases/79-shopee-item-level-revenue/79-RESEARCH.md
@convex/bigsellerOrders/mutations.ts
@convex/bigsellerOrders/queries.ts
@convex/integrations/bigseller/sync.ts (runBigsellerSync for rescan chaining)
@convex/integrations/bigseller/helpers.ts (buildPriceOracle, prorateItems from Plan 02)
@convex/externalData/mutations.ts (saveRevenueItems from Plan 03)
@src/components/salesAnalytics/BigSellerSyncPanel.tsx
@src/components/salesAnalytics/BigSellerOrdersTable.tsx
@src/hooks/convex/useBigSeller.ts
@convex/bigsellerOrders/__tests__/backfill.test.ts

<interfaces>
From convex/lib/auth.ts:
```typescript
export async function requireRole(ctx, token: string, allowedRoles: string[]): Promise<User>;
```

From convex/integrations/bigseller/helpers.ts (Plan 02):
```typescript
export function buildPriceOracle(orders): Map<string, number>;
export function prorateItems(order, oracle, mappingBySku): Array<{sku, skuNum, unitPrice, totalPrice}>;
```

From convex/externalData/mutations.ts (Plan 03):
```typescript
export const saveRevenueItems: InternalMutation<{revenueId, items: Array<{externalItemId, productName, unitPrice, quantity, totalPrice, linkedMenuProductId?, isAutoMatched, matchConfidence}>}>;
```
</interfaces>
</context>

<tasks>

<task type="auto">
  <name>Task 1: Implement backfillBigsellerItems + rescanEmptyRows backend</name>
  <read_first>
    - convex/bigsellerOrders/mutations.ts (existing file — note patterns + token auth style)
    - convex/lib/auth.ts requireRole signature
    - convex/externalData/mutations.ts saveRevenueItems dedup behavior (lines 587-644)
    - convex/integrations/bigseller/sync.ts runBigsellerSync args
    - convex/bigsellerOrders/__tests__/backfill.test.ts (target spec)
  </read_first>
  <action>
**Step 1 — `backfillBigsellerItems` mutation (`convex/bigsellerOrders/mutations.ts`):**

```typescript
export const backfillBigsellerItems = mutation({
  args: {
    token: v.string(),
    limit: v.optional(v.number()),   // default 200 (V5 input validation — safety cap)
  },
  handler: async (ctx, args) => {
    await requireRole(ctx, args.token, ["admin"]);

    const limit = Math.min(args.limit ?? 200, 500);

    // Load all bigsellerOrders with non-empty skuVoList, batched
    // (caller can re-invoke; idempotency guarantees safe replay)
    const orders = await ctx.db.query("bigsellerOrders")
      .filter(q => q.gt(q.field("allSkuNum"), 0))  // optimize with a new index if needed
      .take(limit);

    // Build priceOracle ONCE over all single-SKU historical orders
    const allSingleSku = await ctx.db.query("bigsellerOrders").collect();  // full scan — acceptable at 6K rows (assumption A1)
    const priceOracle = buildPriceOracle(allSingleSku);

    // Build mappingBySku
    const mappings = await ctx.db.query("externalProductMappings")
      .withIndex("by_source", q => q.eq("source", "shopee"))
      .collect();
    // Include tiktok mappings too
    const tiktokMappings = await ctx.db.query("externalProductMappings")
      .withIndex("by_source", q => q.eq("source", "tiktok"))
      .collect();
    const allMappings = [...mappings, ...tiktokMappings];
    const mappingBySku = new Map<string, {menuProductId?: string; menuProductPrice?: number}>();
    const menuProductById = new Map<string, {name: string; price: number}>();
    // ... populate both maps

    let created = 0, skipped = 0, processedOrders = 0;
    for (const order of orders) {
      if (!order.skuVoList || order.skuVoList.length === 0) { skipped++; continue; }
      // Find revenueId via order.revenueId pointer (bigsellerOrders schema has it)
      if (!order.revenueId) { skipped++; continue; }

      const prorated = prorateItems({orderAmount: order.orderAmount, saleAmount: order.saleAmount, skuVoList: order.skuVoList}, priceOracle, mappingBySku);
      const items = prorated.map(p => { /* same shape as Plan 03 */ });

      // saveRevenueItems dedups internally via (revenueId, externalItemId); replay-safe
      const result = await ctx.runMutation(internal.externalData.mutations.saveRevenueItems, {
        revenueId: order.revenueId,
        items,
      });
      // saveRevenueItems should return count of new vs skipped — if it doesn't, augment it
      created += result?.created ?? 0;
      skipped += result?.skipped ?? 0;
      processedOrders++;
    }

    return { created, skipped, processedOrders, hasMore: orders.length === limit };
  },
});
```

If `saveRevenueItems` doesn't return a `{created, skipped}` shape today, augment its return value (minimal additive change in convex/externalData/mutations.ts).

**Step 2 — `rescanEmptyRows` action (`convex/bigsellerOrders/mutations.ts` — use `action`, not mutation, because it calls external sync):**

```typescript
export const rescanEmptyRows = action({
  args: { token: v.string() },
  handler: async (ctx, args) => {
    // Token validation via runQuery to an auth-checking helper (actions don't have direct db access)
    await ctx.runQuery(internal.auth.requireAdminByToken, { token: args.token });

    // Query all bigsellerOrders with empty skuVoList
    const emptyOrders = await ctx.runQuery(internal.bigsellerOrders.queries.listEmptyRows, {});
    if (emptyOrders.length === 0) return { rescannedDateRanges: 0, created: 0, skipped: 0 };

    // Group by date (YYYY-MM-DD from orderTimeMs) and compute min/max
    const dates = emptyOrders.map(o => new Date(o.orderTimeMs).toISOString().slice(0, 10));
    const startDate = dates.reduce((a, b) => (a < b ? a : b));
    const endDate = dates.reduce((a, b) => (a > b ? a : b));

    // Re-sync that date span (preserve-non-empty guard applies)
    await ctx.runAction(internal.integrations.bigseller.sync.runBigsellerSync, {
      startDate, endDate, triggeredBy: "rescan-empty",
    });

    // Run backfill for newly-populated rows
    const backfillResult = await ctx.runMutation(api.bigsellerOrders.mutations.backfillBigsellerItems, {
      token: args.token, limit: 500,
    });

    return {
      rescannedDateRanges: 1,
      startDate, endDate,
      ...backfillResult,
    };
  },
});
```

Add helper `listEmptyRows` internalQuery to `convex/bigsellerOrders/queries.ts`:
```typescript
export const listEmptyRows = internalQuery({
  args: {},
  handler: async (ctx) => ctx.db.query("bigsellerOrders").filter(q => q.or(q.eq(q.field("allSkuNum"), 0), /* skuVoList.length === 0 */)).collect(),
});
```

Add `requireAdminByToken` internalQuery to `convex/auth/` (if absent) — wraps `requireRole` for action callers. Or call `requireRole` from an internalMutation wrapper.

**Step 3 — D-22 compliance verification:**

Add a unit-test assertion OR a code comment: `// D-22: this backfill creates revenue items only. No inventory deduction. No processBigsellerSales call.`
  </action>
  <verify>
    <automated>npm run test -- --run convex/bigsellerOrders/__tests__/backfill.test.ts</automated>
  </verify>
  <acceptance_criteria>
    - `grep -n "export const backfillBigsellerItems" convex/bigsellerOrders/mutations.ts` returns match
    - `grep -n "export const rescanEmptyRows" convex/bigsellerOrders/mutations.ts` returns match
    - `grep -n 'requireRole.*\["admin"\]' convex/bigsellerOrders/mutations.ts` returns match (admin-only gate)
    - `grep -rn "processBigsellerSales" convex/` returns NO match (D-22 honored)
    - backfill.test.ts all 4 cases GREEN (create, replay-idempotent, empty-skipped, auth-rejected)
    - `npm run type-check` + `npm run build` pass
  </acceptance_criteria>
  <done>Two admin-gated entrypoints live; backfill test green; no inventory side-effect.</done>
</task>

<task type="auto">
  <name>Task 2: Add Backfill + Re-check buttons to BigSellerSyncPanel</name>
  <read_first>
    - src/components/salesAnalytics/BigSellerSyncPanel.tsx (existing buttons + toast patterns — match exactly)
    - src/hooks/convex/useBigSeller.ts (existing mutation/action hooks — add new ones)
    - convex/bigsellerOrders/mutations.ts (Task 1 new mutations — for hook wiring)
  </read_first>
  <action>
**Step 1 — Add hooks in `src/hooks/convex/useBigSeller.ts`:**

```typescript
export function useBackfillBigsellerItems() {
  return useMutation(api.bigsellerOrders.mutations.backfillBigsellerItems);
}
export function useRescanEmptyRows() {
  return useAction(api.bigsellerOrders.mutations.rescanEmptyRows);
}
```

**Step 2 — Add two buttons to `BigSellerSyncPanel.tsx`:**

Locate the existing sync-controls section. Add a new sibling section "Item-level data" with two buttons:

```tsx
import { toast } from "sonner";
import { RefreshCw, CheckCircle2 } from "lucide-react";  // match existing iconography

const backfill = useBackfillBigsellerItems();
const rescan = useRescanEmptyRows();
const [isBackfilling, setIsBackfilling] = useState(false);
const [isRescanning, setIsRescanning] = useState(false);

const onBackfill = async () => {
  setIsBackfilling(true);
  const toastId = toast.loading("Backfilling historical Shopee items...");
  try {
    let totalCreated = 0, totalSkipped = 0, totalOrders = 0;
    let hasMore = true;
    while (hasMore) {
      const r = await backfill({ token, limit: 500 });
      totalCreated += r.created;
      totalSkipped += r.skipped;
      totalOrders += r.processedOrders;
      hasMore = r.hasMore;
    }
    toast.success(
      `Created ${totalCreated} items from ${totalOrders} orders (${totalSkipped} skipped as duplicates)`,
      { id: toastId },
    );
  } catch (e) {
    toast.error(e instanceof Error ? e.message : "Backfill failed", { id: toastId });
  } finally { setIsBackfilling(false); }
};

const onRescan = async () => { /* same pattern for rescan, toast.success shows "Re-checked N empty rows..." */ };

// JSX:
<Button onClick={onBackfill} disabled={isBackfilling}>
  <RefreshCw className={isBackfilling ? "animate-spin" : ""} />
  Backfill historical items
</Button>
<Button onClick={onRescan} disabled={isRescanning} variant="outline">
  <CheckCircle2 />
  Re-check empty rows
</Button>
```

Label wording must be exactly: `"Backfill historical items"` and `"Re-check empty rows"` (D-17, D-19).
Toast copy is Claude's discretion but must include the counts format.
  </action>
  <verify>
    <automated>npm run test -- --run src/components/salesAnalytics/__tests__/BigSellerSyncPanel.test.tsx</automated>
  </verify>
  <acceptance_criteria>
    - `grep -n "Backfill historical items" src/components/salesAnalytics/BigSellerSyncPanel.tsx` returns match (exact string)
    - `grep -n "Re-check empty rows" src/components/salesAnalytics/BigSellerSyncPanel.tsx` returns match
    - `grep -n "useBackfillBigsellerItems\|useRescanEmptyRows" src/hooks/convex/useBigSeller.ts` returns matches
    - Both buttons render and are clickable (component test or Storybook snap)
    - `npm run type-check` + `npm run build` pass
  </acceptance_criteria>
  <done>Two buttons live; hooks wired; toast feedback works.</done>
</task>

<task type="auto">
  <name>Task 3: Add 24h "Pending SKU from Shopee" label to BigSellerOrdersTable</name>
  <read_first>
    - src/components/salesAnalytics/BigSellerOrdersTable.tsx lines 280-400 (current "--" rendering for empty SKU)
    - convex/schema.ts §bigsellerOrders.orderTimeMs + allSkuNum + skuVoList fields
    - RESEARCH.md §Code Examples §"Pending SKU label branching"
  </read_first>
  <action>
Modify `src/components/salesAnalytics/BigSellerOrdersTable.tsx`:

1. Add constant at module top: `const PENDING_SKU_THRESHOLD_MS = 24 * 60 * 60 * 1000;  // D-14: 24h window`.

2. Locate the section that renders `--` for empty-SKU rows (likely inside a row cell). Replace with branching logic:

```tsx
const ageMs = Date.now() - (order.orderTimeMs ?? 0);
const withinPendingWindow = ageMs < PENDING_SKU_THRESHOLD_MS;
const hasResolvedSku = resolved.length > 0;
const isEmpty = !hasResolvedSku && (
  (order.allSkuNum ?? 0) === 0 ||
  (order.skuVoList?.length ?? 0) === 0
);

{isEmpty ? (
  withinPendingWindow ? (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <span className="cursor-help italic text-muted-foreground">
            Pending SKU from Shopee
          </span>
        </TooltipTrigger>
        <TooltipContent>
          <p className="text-xs max-w-[280px]">
            BigSeller has not yet returned SKU breakdown. The daily 03:00 WIB re-sync
            should populate this within 24h of order time.
          </p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  ) : (
    <span className="text-muted-foreground">--</span>
  )
) : (
  /* existing resolved SKU rendering */
)}
```

3. Ensure TooltipProvider/Tooltip imports are present (they likely are — the file already uses them elsewhere per RESEARCH line 280-400).

4. DO NOT add buyer fields to the table (DA-11 deferral).
  </action>
  <verify>
    <automated>npm run test -- --run src/components/salesAnalytics/__tests__/BigSellerOrdersTable.test.tsx</automated>
  </verify>
  <acceptance_criteria>
    - `grep -n "Pending SKU from Shopee" src/components/salesAnalytics/BigSellerOrdersTable.tsx` returns EXACT match
    - `grep -n "PENDING_SKU_THRESHOLD_MS" src/components/salesAnalytics/BigSellerOrdersTable.tsx` returns match
    - `grep -n "24 \* 60 \* 60 \* 1000\|24 \* 3600_000" src/components/salesAnalytics/BigSellerOrdersTable.tsx` returns match (24h constant present, not 48h)
    - BigSellerOrdersTable test (if exists) passes; else component renders without error in dev
    - `npm run type-check` + `npm run build` pass
    - No buyer name/phone/address column added (`grep -n "buyerName\|buyerPhone\|buyerAddress" src/components/salesAnalytics/BigSellerOrdersTable.tsx` returns NO match — DA-11 deferral)
  </acceptance_criteria>
  <done>24h label live; no buyer columns.</done>
</task>

<task type="checkpoint:human-verify" gate="blocking">
  <name>Task 4: Manual verification in dev environment</name>
  <what-built>
    Phase 79 backend + UI complete. Shopee/TikTok item-level revenue live.
    - New syncs emit externalRevenueItems
    - Daily 03:00 WIB cron scheduled
    - Admin can click "Backfill historical items" + "Re-check empty rows"
    - 24h "Pending SKU from Shopee" label on empty rows
    - Retroactive mapping cascades to items + parent dominant-SKU
  </what-built>
  <how-to-verify>
    1. On dev (`npm run dev` + `npx convex dev`), navigate to `/sales-analytics`.
    2. Locate `BigSellerSyncPanel`. Verify two new buttons: "Backfill historical items" and "Re-check empty rows".
    3. Click "Backfill historical items". Toast shows "Backfilling..." then success count. Open Convex dashboard → `externalRevenueItems` table → verify rows with `source="shopee"` or `source="tiktok"` appear.
    4. Click the button AGAIN. Toast should report `created: 0, skipped: N` (idempotent).
    5. Open Sales Analytics orders table. Find a Shopee row with age < 24h and empty SKU (if any exist). Verify label reads "Pending SKU from Shopee" (italic, with tooltip on hover). If no such row exists, this check is N/A — note in resume message.
    6. Find a Shopee row with age > 24h and empty SKU. Verify label is bare "--".
    7. In Convex dashboard, check `externalSyncLogs` — no new error rows from non-cron triggers.
    8. Trigger retroactive mapping for a Shopee SKU via the existing mapping UI. Open `externalRevenueItems` — verify items with matching `externalItemId` now have `linkedMenuProductId` populated, and the parent `externalRevenue.linkedMenuProductId` updates if the SKU is dominant.
    9. Run `npm run test -- --run` (full suite) — all green.
    10. Run `npm run build` — succeeds.
  </how-to-verify>
  <resume-signal>Type "approved" or describe issues found</resume-signal>
</task>

</tasks>

<threat_model>
## Trust Boundaries
| Boundary | Description |
|----------|-------------|
| Admin UI → backfillBigsellerItems | Authenticated + admin-role-gated |
| Admin UI → rescanEmptyRows | Authenticated + admin-role-gated |
| Public orders table render | Read-only; no PII surfaced (per DA-11 deferral) |

## STRIDE Threat Register
| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-79-11 | Elevation of Privilege | backfillBigsellerItems / rescanEmptyRows | mitigate | `requireRole(ctx, args.token, ["admin"])` — throws on unauthorized |
| T-79-12 | DoS | Backfill loops forever on unbounded data | mitigate | `limit` param capped at 500; `hasMore` signal from mutation; UI while-loop has natural stop |
| T-79-13 | Tampering | Backfill creates duplicate items on replay | mitigate | saveRevenueItems existing `(revenueId, externalItemId)` dedup — tested via backfill.test.ts idempotency case |
| T-79-14 | Information Disclosure | toast.error leaks raw error to UI | accept | Error is from our own mutation; no sensitive API body exposure (BigSeller call not re-made in backfill path) |
| T-79-15 | Information Disclosure | DA-11 buyer data leak | accept | No buyer data captured — RESEARCH confirms pageList does not return it |
</threat_model>

<verification>
Full phase: all tests green + build + manual verification checkpoint.
</verification>

<success_criteria>
- [ ] backfill.test.ts all 4 cases green
- [ ] BigSellerSyncPanel shows 2 new buttons with exact label text
- [ ] BigSellerOrdersTable shows "Pending SKU from Shopee" for sub-24h empty rows
- [ ] No buyer columns added (DA-11 explicit deferral)
- [ ] No processBigsellerSales introduced (D-22 honored)
- [ ] `npm run type-check` + `npm run build` + `npm run test` all pass
- [ ] Human verification checkpoint approved
</success_criteria>

## Git Workflow
**Branch:** `feature/79-shopee-item-level-revenue`

## Implementation Waves
### Wave 3: Admin tooling + UI [SEQUENTIAL after Wave 2 plans 02-06]
| Agent | Task | Files |
|-------|------|-------|
| convex-backend | backfill + rescan mutations | convex/bigsellerOrders/mutations.ts, queries.ts |
| react-ui-builder | Two buttons + 24h label | src/components/salesAnalytics/BigSellerSyncPanel.tsx, BigSellerOrdersTable.tsx, src/hooks/convex/useBigSeller.ts |
| User | Manual verification checkpoint | — |

## Documentation Updates (batched — this is the final plan of phase 79)
- [ ] docs/CHANGELOG.md (mandatory per CLAUDE.md)
- [ ] docs/SCHEMA.md (add by_source_external_item index from Plan 04; note NO new columns on bigsellerOrders due to DA-11 deferral)
- [ ] docs/API_REFERENCE.md (new mutations: backfillBigsellerItems, rescanEmptyRows, logSyncEvent; new query: getSyncState, listEmptyRows)
- [ ] .planning/REQUIREMENTS.md (add DA-05..DA-13 traceability rows: "Phase 79 Complete")
- [ ] .planning/ROADMAP.md (mark Phase 79 complete with plans 1/7 through 7/7)

## Success Criteria (this plan)
- [ ] backfill test green
- [ ] UI verification passes
- [ ] Full suite + build green
- [ ] Docs updated

<output>
Create `.planning/phases/79-shopee-item-level-revenue/79-07-SUMMARY.md` including DA-11 deferral rationale + link to RESEARCH.md §Critical finding.
</output>
