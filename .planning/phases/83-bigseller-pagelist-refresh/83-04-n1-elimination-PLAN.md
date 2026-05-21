---
phase: 83-bigseller-pagelist-refresh
plan: 04
type: execute
wave: 1
depends_on: []
files_modified:
  - convex/integrations/bigseller/queries.ts
  - convex/integrations/bigseller/sync.ts
  - convex/integrations/bigseller/__tests__/sync.test.ts
  - docs/CHANGELOG.md
autonomous: true
requirements: []

must_haves:
  truths:
    - "The revenue-linking loop and the cross-platform leak guard read from ONE batch lookup instead of one getRevenueById call per id (D-05 O4)"
    - "getRevenueByIds returns the same docs as N sequential getRevenueById calls (parity)"
    - "The cross-platform leak guard at the former sync.ts:917-925 still throws when a revenue row's source != the order's platform (T-79-02 survives O4)"
  artifacts:
    - path: "convex/integrations/bigseller/queries.ts"
      provides: "getRevenueByIds batch lookup"
      contains: "getRevenueByIds"
    - path: "convex/integrations/bigseller/sync.ts"
      provides: "both former N+1 loops read from the prefetched batch"
      contains: "getRevenueByIds"
  key_links:
    - from: "convex/integrations/bigseller/sync.ts"
      to: "internal.integrations.bigseller.queries.getRevenueByIds"
      via: "single ctx.runQuery batch prefetch after saveRevenue"
      pattern: "getRevenueByIds"
---

<objective>
O4 — eliminate the N+1 query in BigSeller revenue linking (D-05, low-risk-first #1). Today `sync.ts:875-889` calls `getRevenueById` once per revenue id to read `externalTransactionId`, then `sync.ts:917-925` loops again calling `getRevenueById` per row for the cross-platform leak guard — for 200 rows that is ~400 sequential single-doc lookups.

Add `getRevenueByIds(ids)` batch lookup to `convex/integrations/bigseller/queries.ts`, prefetch the entire batch ONCE after `saveRevenue` returns, and have both loops read from the in-memory map. Pure refactor — no behavior change, easiest to test.

Purpose: cut ~200ms × N off manual full-month sync runtime. First (lowest-risk) of the 83-02 optimizations.
Output: new batch query, two call-site swaps, parity test, CHANGELOG.
</objective>

<execution_context>
@D:/Claude/Product Manager/product_master/.claude/get-shit-done/workflows/execute-plan.md
@D:/Claude/Product Manager/product_master/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/phases/83-bigseller-pagelist-refresh/83-CONTEXT.md
@.planning/phases/83-bigseller-pagelist-refresh/83-PATTERNS.md
@.planning/phases/83-bigseller-pagelist-refresh/83-02-sync-optimization-SPEC.md

<interfaces>
<!-- getRevenueById — the N+1 culprit (convex/integrations/bigseller/queries.ts:127-134) -->
```typescript
export const getRevenueById = internalQuery({
  args: { revenueId: v.id("externalRevenue") },
  handler: async (ctx, args) => await ctx.db.get(args.revenueId),
});
```

<!-- Map-return analog: convex/orders/helpers/batchFetching.ts:32-44 -->
<!-- Array→Map caller-side build analog: convex/productionCounts/queries.ts:31 (new Map(arr.map(...))) -->

<!-- Call site 1 — revenue→order linking loop (sync.ts:872-896) -->
<!-- Call site 2 — cross-platform leak guard (sync.ts:903-925); reads revDoc.source, revDoc.externalTransactionId -->
</interfaces>
</context>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: Add getRevenueByIds batch query (confirm Map serialization)</name>
  <read_first>
    - convex/integrations/bigseller/queries.ts (L1 imports incl. Doc/Id; L123-134 getRevenueById)
    - convex/orders/helpers/batchFetching.ts (L32-44 Map-return pattern)
    - convex/productionCounts/queries.ts (L31 new Map(entries) caller-side build)
    - 83-02-sync-optimization-SPEC.md O4 (caveats: 200 ids × 32B = 6.4kB, internal-only)
    - 83-PATTERNS.md getRevenueByIds section + Flag #5 (Map serialization)
  </read_first>
  <behavior>
    - getRevenueByIds([a,b,c]) returns the same three docs that three getRevenueById calls return
    - missing/deleted ids are absent from the result (no null entries)
    - the result round-trips across the ctx.runQuery boundary (Map OR Array<[id,doc]> — Flag #5)
  </behavior>
  <action>
Add `getRevenueByIds` to `convex/integrations/bigseller/queries.ts` next to `getRevenueById`.

PRIMARY shape (Map):
```typescript
export const getRevenueByIds = internalQuery({
  args: { revenueIds: v.array(v.id("externalRevenue")) },
  handler: async (ctx, args) => {
    const docs = await Promise.all(args.revenueIds.map((id) => ctx.db.get(id)));
    const map = new Map<string, Doc<"externalRevenue">>();
    docs.forEach((doc, i) => {
      if (doc) map.set(args.revenueIds[i], doc);
    });
    return map;
  },
});
```

FLAG #5 — Convex Map-over-the-wire: verify in the Task 3 test that a `Map` round-trips through `ctx.runQuery`. If it does NOT round-trip cleanly, switch the return to `Array<[string, Doc<"externalRevenue">]>` (return `[...map.entries()]`) and build the Map on the caller side in sync.ts via `new Map(entries)` (the `convex/productionCounts/queries.ts:31` pattern). Document which path you took in the SUMMARY.

Ensure `Doc` is imported from `../../_generated/dataModel` (or wherever the file already imports `Id` from). Reuse the existing `internalQuery` and `v` imports.
  </action>
  <verify>
    <automated>npm run test -- bigseller</automated>
  </verify>
  <acceptance_criteria>
    - `grep -c 'getRevenueByIds' convex/integrations/bigseller/queries.ts` returns >= 1
    - `npx convex codegen && npm run type-check` exits 0
    - `npm run test -- bigseller` exits 0
  </acceptance_criteria>
  <done>getRevenueByIds exists, returns docs keyed by id, round-trip confirmed (Map or Array fallback documented), type-check + tests green.</done>
</task>

<task type="auto">
  <name>Task 2: Swap both N+1 loops to read from one prefetched batch</name>
  <read_first>
    - convex/integrations/bigseller/sync.ts (L871-896 revenue-link loop; L903-925 cross-platform leak guard; L876-879 + L917-919 the getRevenueById calls to replace)
    - 83-02-sync-optimization-SPEC.md O4 ("Pre-fetch the entire batch once after saveRevenue returns. Both loops read from the in-memory map.")
    - 83-PATTERNS.md "Call-site swaps" section
  </read_first>
  <action>
In `convex/integrations/bigseller/sync.ts`, after `saveRevenue` returns and `revenueIds` is computed (currently L872), prefetch ONCE:
```typescript
        const revDocsById = await ctx.runQuery(
          internal.integrations.bigseller.queries.getRevenueByIds,
          { revenueIds: revenueIds as Id<"externalRevenue">[] }
        );
        // If Task 1 returned an Array fallback: `const revDocsById = new Map(entriesFromQuery);`
```

1. Loop 1 (L875-889 revenue→order linking): replace the per-id `ctx.runQuery(... getRevenueById ...)` with `const revDoc = revDocsById.get(revId);`. Keep the rest of the link-building logic identical (`revDoc?.externalTransactionId`, the `bigseller:` strip, the `links.push`).

2. Loop 2 (L917-925 cross-platform leak guard): replace the per-row `ctx.runQuery(... getRevenueById ...)` with `const revDoc = revDocsById.get(revenueId);`. Keep the guard intact:
```typescript
            if (revDoc && revDoc.source !== platform) {
              throw new Error(
                `Cross-platform leak guard: revenueSource=${revDoc.source} !== order.platform=${platform} (revenueId=${revenueId})`
              );
            }
```
The guard MUST still throw on a source mismatch — this is T-79-02 and it must survive O4 (and later O1/O2). Do not remove or weaken it.

Do NOT delete `getRevenueById` — other callers may exist; leave it in place. Just stop calling it from these two loops.
  </action>
  <verify>
    <automated>npm run test -- bigseller</automated>
  </verify>
  <acceptance_criteria>
    - `grep -c 'getRevenueByIds' convex/integrations/bigseller/sync.ts` returns >= 1
    - `grep -c 'getRevenueById\b' convex/integrations/bigseller/sync.ts` returns 0 (the per-id call is gone from sync.ts; the `s`-suffixed batch call does not match `\b` after `Id`)
    - `grep -c 'Cross-platform leak guard' convex/integrations/bigseller/sync.ts` returns 1
    - `npm run test -- bigseller` exits 0
  </acceptance_criteria>
  <done>Both loops read from a single prefetched batch; leak guard preserved; no remaining per-id getRevenueById call in sync.ts.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 3: Parity test for getRevenueByIds + leak-guard survival; CHANGELOG; build</name>
  <read_first>
    - convex/integrations/bigseller/__tests__/sync.test.ts (created in 83-03; extend it — confirm it exists, else use cron.test.ts harness)
    - convex/integrations/bigseller/__tests__/cron.test.ts (L1-25 convexTest harness)
    - docs/CHANGELOG.md (top entry format)
  </read_first>
  <behavior>
    - getRevenueByIds returns docs equal to N getRevenueById calls for the same ids (parity)
    - a missing id is omitted from the result, not returned as null
    - Map (or Array fallback) round-trips through ctx.runQuery
  </behavior>
  <action>
Extend `convex/integrations/bigseller/__tests__/sync.test.ts` (or create it via the cron.test.ts harness if 83-04 lands before 83-03 in a given executor's tree). Add `describe("getRevenueByIds (O4 N+1 elimination)")`:
- seed 3 `externalRevenue` rows via `t.run`; call `getRevenueByIds` with all 3 ids + 1 bogus/deleted id; assert the result has exactly 3 entries keyed by the real ids and the bogus id is absent.
- assert parity: for each id, `getRevenueByIds(...).get(id)` deep-equals `getRevenueById({revenueId: id})`.
- this is also the Flag #5 round-trip check — if the assertion fails because a Map doesn't serialize, switch Task 1 to the Array fallback and re-run.

Then add the CHANGELOG entry: "Phase 83-04: BigSeller sync O4 — replaced ~400 sequential getRevenueById lookups with one getRevenueByIds batch prefetch (revenue-link loop + cross-platform leak guard read from one in-memory map). Pure refactor, no behavior change." Run the build gate.
  </action>
  <verify>
    <automated>npm run test -- bigseller &amp;&amp; npm run build</automated>
  </verify>
  <acceptance_criteria>
    - `grep -c 'getRevenueByIds' convex/integrations/bigseller/__tests__/sync.test.ts` returns >= 1
    - `grep -ci '83-04' docs/CHANGELOG.md` returns >= 1
    - `npm run test -- bigseller` exits 0
    - `npm run build` exits 0
  </acceptance_criteria>
  <done>Parity + round-trip tests pass; CHANGELOG records O4; build green.</done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| action runtime → externalRevenue reads | Internal batch query; no new external input. |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-83-04-01 | Information disclosure | getRevenueByIds | accept | `internalQuery` — not client-reachable; only callable from the trusted sync action. No permission surface. (SPEC O4) |
| T-83-04-02 | Tampering | cross-platform leak guard | mitigate | The per-row source-mismatch guard (T-79-02) is preserved verbatim when reading from the batch map — it still throws on `revDoc.source !== platform`, preventing items being emitted against the wrong platform's revenueId. (Task 2) |
| T-83-04-03 | DoS | batch arg size | accept | 200 ids × 32B = 6.4kB — well within Convex arg limits (SPEC O4). |
</threat_model>

<verification>
- `npx convex codegen && npm run type-check` — batch query compiles.
- `npm run test -- bigseller` — parity + round-trip + existing suite green.
- `npm run build` — passes.
</verification>

<success_criteria>
- `getRevenueByIds` returns docs equal to N `getRevenueById` calls; missing ids omitted.
- Both former N+1 loops read from one prefetched batch; no per-id `getRevenueById` call left in sync.ts.
- Cross-platform leak guard (T-79-02) still throws on source mismatch.
- CHANGELOG records O4; bigseller suite + build green.
</success_criteria>

<output>
After completion, create `.planning/phases/83-bigseller-pagelist-refresh/83-04-SUMMARY.md`
</output>
