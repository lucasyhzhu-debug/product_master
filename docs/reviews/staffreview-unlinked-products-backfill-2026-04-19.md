# Staff Review: Phase 80.2 Unlinked Products Backfill — UI + Hotfix

**Date:** 2026-04-19
**Scope:** Hotfix `fix/unlinked-backfill-stats-readlimit` (`bab294ea`) + full admin-UI stack already on main
  - Backend: `convex/externalData/queries.ts::getUnlinkedBackfillStats`, `convex/externalData/mutations.ts::cascadeAllK3MartMappings`, `convex/externalData/mutations.ts::backfillInternalRevenueItems`
  - Frontend: `src/pages/UnlinkedProductsBackfill.tsx`, `src/hooks/convex/useUnlinkedBackfill.ts`
**Reviewers:** Staff Developer (Implementation) + Principal Developer (Architecture)
**Verdict:** **Revise** — 2 Critical, 4 Should-Fix, 4 Nice-to-Have.

---

## 1. Summary

The UI is genuinely useful and the pattern is reusable. Backend endpoints are idiomatic (requireRole + paginated write). The hotfix correctly swaps an O(parents) design for an O(children) design.

But three latent scale bombs remain:

1. **`backfillInternalRevenueItems` accepts `limit` up to 4000** while the inner loop reads ~7 docs and writes up to 1+N docs per parent — at limit=4000 this blows Convex's 16k read / 8k write per-mutation limits. Today's 262-parent dev corpus hides it; a future run with the page unknowingly changing its default will fail mid-loop.
2. **`cascadeAllK3MartMappings` has no scheduling** — it iterates all K3Mart mappings sequentially and patches parents inline. Aggregate writes grow linearly with (active mappings × avg parents per mapping). For 737 K3Mart parents this works. For the next source added to this pattern, the caller may not realize the bound.
3. **The hotfix's 4 × 4000-row scans = ~16k reads** sits right at Convex's documented per-query ceiling. This is safer than the previous version but still one schema addition away from breaking.

Everything else is polish or architectural hygiene around making this a reusable template.

---

## 2. Critical Issues (Must Fix)

### C1 — `backfillInternalRevenueItems` `limit` cap is wrong

`convex/externalData/mutations.ts:1144` — `const limit = Math.min(args.limit ?? 200, 4000);`

Inside the loop (`backfillInternalRevenueItemsPageImpl`), each orphan parent costs:
- 1 `hasExternalRevenueItems` (.first) read
- 1 `orders.by_order_number` (.unique) read
- 1 `orderItems.by_order` (.collect) scan — N reads where N = items per order
- 1 write per item via `saveRevenueItemsImpl`

For Direct orders with ~5 items/parent, a page of limit=4000 = 4000 + 4000 + 20000 = **28k reads** (Convex caps at 16,384) and **20k writes** (cap is 8,192).

The 4000 cap was copied from `applyRetroactiveProductMappingImpl` which only patches 1 row per iteration. For a paginated-write mutation with N writes per iteration, the real safe cap is much lower.

**Recommendation:** Change line 1144 to `const limit = Math.min(args.limit ?? 200, 500);`. Update the jsdoc above (line 1124) to reflect the 500 ceiling. Add an assertion comment in `backfillInternalRevenueItemsPageImpl` documenting the per-parent read/write budget so the next author doesn't re-bump the cap.

---

### C2 — `cascadeAllK3MartMappings` unbounded aggregate writes

`convex/externalData/mutations.ts:1196` — no bound on `activeMappings.length × per-mapping-patches`.

Each call to `applyRetroactiveProductMappingImpl(ctx, { source: "k3mart", ... })` can patch up to 4000 parents (its internal `.take(4000)` cap). With N mappings, total writes = up to `N × 4000`. Convex's per-mutation write limit is 8,192.

Today's prod: 737 K3Mart parents distributed across ~8–15 mappings (estimate from CONTEXT). Aggregate writes ≤ 737. Safe.

Tomorrow's risk: if a new K3Mart SKU lands with thousands of parents, or if this pattern gets copied to Shopee/TikTok (which have higher volumes), the mutation will throw mid-loop with partial state — some mappings applied, some not.

**Recommendation (pick one):**

A. Add a `totalWrites` counter in the loop and `throw new Error(...)` cleanly if it crosses 6000, with a "reduce scope or re-run after the first batch commits" message. Preserves auditability.

B. Convert to `ctx.scheduler.runAfter(0, ...)` chaining: each scheduled step handles M mappings, writes its partial audit row, then schedules the next step with the remaining mappings. Matches the pagination pattern already used for `backfillInternalRevenueItems`.

C. Accept the risk for K3Mart only (volume-bounded) but rename the function `cascadeAllK3MartMappingsSingleShot` and add a big comment explaining the bound.

Prefer (A) — minimal change, still fails loudly before hitting the Convex limit. (B) is the "right" architectural answer but a 3–4× bigger change than warranted for one use case.

---

## 3. Should-Fix

### S1 — `getUnlinkedBackfillStats` still runs close to the read ceiling

After the hotfix, the query does four `.take(4000)` scans in one handler:
- k3mart parents (4000)
- k3mart mappings (4000)
- internal parents (4000)
- internal children (4000)

Convex per-query read limit is 16,384. Worst case = 16,000 — inside the ceiling by 384 docs. Any future scope creep (add a fifth scan, or widen the cap) breaks the query.

This is fragile. The fix should split into independent queries the page calls in parallel:
- `getK3MartBackfillStats` (2 scans)
- `getDirectBackfillStats` (2 scans)

The frontend calls both in parallel via two `useQuery` hooks. Each query's read budget is independent. Total payload to the client is the same.

**Also:** `scanCapReached` is a single global flag. Splitting the query makes it naturally per-section (each half-query returns its own cap flag), which is what the UI actually needs to display.

---

### S2 — `backfillInternalRevenueItemsPageImpl` scans EVERY internal parent per page, not just orphans

`convex/externalData/mutations.ts:1045–1056` paginates ALL `externalRevenue[source="internal"]` rows, then per-row calls `hasExternalRevenueItems` and `continue`s if children exist. On steady state (all parents have children) the mutation reads 4000 parents × 1 `.first()` per parent = **8000 wasted reads per invocation** just to decide everything is skipped.

This is especially wasteful for the "click backfill a second time to confirm idempotency" case — we re-scan the entire population just to produce `skippedHasChildren` counters.

**Recommendation:** Narrow the scan with a derived filter. Options:
- Add an index `externalRevenue.by_source_hasItems` with a denormalized boolean — too heavy for one-time repair.
- Use `externalRevenueItems.by_source` to collect `Set<revenueId>` of parents-with-children first (1 scan, ~4000 reads), then iterate only internal parents NOT in the set. Still one paginated scan of parents, but the inner `hasExternalRevenueItems` call disappears. Net read reduction: 50%.
- Defensive minimum: just document that the per-page cost is `limit × (1 + 1 + avgItemsPerOrder)` reads and link it to the C1 cap.

The simplest fix is #3. #2 is cleaner but changes semantics (memory cost scales with all-internal-children, not one page).

---

### S3 — Race on concurrent admin clicks

No serialization between two admins (or one admin clicking twice before the first promise resolves) invoking `backfillInternalRevenueItems` concurrently. Convex mutations are serialized per-row, so data stays consistent — the dedup on `(revenueId, externalItemId)` prevents double-inserts. But cumulative counters in both audit rows will double-count `parentsScanned`.

More concerning: the `cascadeAllK3MartMappings` clicks would both run the full cascade. Second click = pure no-op (all parents already correctly linked) but pays the full read cost.

**Recommendation:** Disable the button on the server side too:
- Add a "live mutex" row in a new `adminOperationsLocks` table with key="cascadeAllK3MartMappings" and a 5-minute expiry.
- Mutation first acquires the lock (upsert with expiry check); refuses with a clear error if held.
- On completion, releases (deletes the row).

Small table, small complexity, prevents concurrent runs. If you don't want a new table, at minimum add a client-side toast + disable for N seconds after completion (cheap, covers the double-click case).

---

### S4 — `useUnlinkedBackfill.ts` `(api as any)` escape hatch is dead code

`src/hooks/convex/useUnlinkedBackfill.ts:59–67` — the comment says "until `npx convex dev` regenerates." It has regenerated. The types are fully available now. The cast adds noise and hides future type errors.

**Recommendation:** Replace:
```ts
const externalDataApi = (api as any).externalData as { ... };
```
with direct `api.externalData.queries.getUnlinkedBackfillStats` and `api.externalData.mutations.cascadeAllK3MartMappings` / `.backfillInternalRevenueItems`. Remove the `as any` on each hook invocation. Keep the TypeScript return-type assertion (`as UnlinkedBackfillStats | undefined`) since Convex return types don't pass through perfectly to client code.

---

## 4. Nice-to-Have

- **N1 — Cursor-loop unmount cleanup.** `handleDirectBackfill` doesn't cancel on unmount. If the admin navigates away mid-loop, the promise chain keeps firing `setDirectLoop` on an unmounted component. React 18 swallows the warning, but it's sloppy. Fix: wrap the loop in an `AbortController`-style pattern with a `useRef<boolean>` flag the handler checks each iteration, cleared in a `useEffect` cleanup.

- **N2 — Audit payload cap.** `cascadeAllK3MartMappings` stores `perMappingTop10` (10 entries) in `summary` JSON. Convex string max is 1 MiB — way above what 10 entries can produce. Fine today; document the cap if you ever widen to `top50`+.

- **N3 — Lift the pattern into a reusable component.** Per `feedback_ui_for_db_ops.md`, this is now THE pattern for admin DB ops. Before the next consumer lands, extract `<AdminOpPage>` with props `{ title, description, stats, operations[] }` where each operation has `{ label, description, expectedImpact, runFn, resultRenderer }`. The cursor-loop, stats card, and execution log become shared. Keeps individual admin ops to ~50 LOC each.

- **N4 — Nav link placement.** Currently in Config dropdown. Works, but this is a one-time-use page that becomes navigation dead weight after the run. Consider: guard the link with a query — if `unlinkedParents == 0 && orphanParents == 0`, hide the nav link (page URL still works). Tiny UX win.

---

## 5. Probe Responses (specific questions asked)

| Question | Finding |
|---|---|
| Does O(children) fix the prod issue? | Yes for reads. But see S1 — we're still at the ceiling. |
| What if internal children >4000? | Set keeps only distinct revenueIds (max = parents scanned, capped at 4000) — correctness holds. But the orphan count becomes a lower bound, not exact. `scanCapReached` already flags this. |
| Is `by_source` on `externalRevenueItems` confirmed? | Yes — `schema.ts:1162`. |
| Children >> parents failure mode? | No correctness issue. One parent with 100 items adds 100 to `totalChildren` but only 1 to `parentIdsWithChildren`. Both correct. |
| `scanCapReached` per-section? | Currently global. S1's split-query refactor solves this naturally. |
| Token-in-args vs `useSessionMutation`? | **Token-in-args is canonical in this codebase.** `grep requireRole convex/` finds 30+ files using this pattern. `useSessionMutation` exists (`createMutationHook.ts`, `useBankReconciliation.ts`) but is the minority. No refactor needed. |
| `cascadeAllK3MartMappings` single-mutation risk? | See C2. |
| `backfillInternalRevenueItems` idempotent on double-click? | Correctness yes (dedup). Counters no — double-counted in audit. See S3. |
| `(api as any)` hatch needed? | No. See S4. |
| Cursor-loop leak on unmount? | Yes but benign. See N1. |
| Auto-refresh of stats after mutations? | ✅ Yes — Convex reactive query refires when `externalRevenue` / `externalRevenueItems` tables change. The stats card is correct. |
| Triple gating (route + hook + backend)? | Correct. Route prevents render, hook injects token only if auth, backend rejects missing/invalid token. Defense in depth is right here — pages without a valid session should never flash stats. |
| Hold-to-action for destructive buttons? | Not warranted. Both operations are idempotent. A standard button with a spinner is correct. |

---

## 6. Approval Conditions

**For Approval, must-fix:**
1. C1 — cap `backfillInternalRevenueItems` limit at 500.
2. C2 — decide cascade strategy (recommend option A: fail-fast with clear error at 6000 writes).

**Strongly recommended before the next admin op lands:**
3. S1 — split `getUnlinkedBackfillStats` into two parallel queries.
4. S4 — drop `(api as any)`.

**Before any second consumer uses this pattern:**
5. N3 — extract `<AdminOpPage>` reusable shell.

---

## 7. Files Touched in This Review

- `convex/externalData/queries.ts:1645–1735` (`getUnlinkedBackfillStats`)
- `convex/externalData/mutations.ts:1030–1110` (`backfillInternalRevenueItemsPageImpl`)
- `convex/externalData/mutations.ts:1135–1180` (`backfillInternalRevenueItems`)
- `convex/externalData/mutations.ts:1196–1260` (`cascadeAllK3MartMappings`)
- `src/pages/UnlinkedProductsBackfill.tsx:1–588`
- `src/hooks/convex/useUnlinkedBackfill.ts:1–117`

---

*Generated by /staffreview skill — adapted for implemented-code review (no plan file).*
