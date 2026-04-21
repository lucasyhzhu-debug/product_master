# Phase 74.5.2 — Deferred Items

Out-of-scope issues discovered during execution. Per GSD SCOPE BOUNDARY rule, these
are NOT fixed by the discovering executor; they are logged for a follow-up plan or
the phase reviewer.

---

## 1. `convex/migrations/gofoodSaleToChannelSale.ts` — build errors (introduced in Plan 05 fix commit)

**Discovered by:** Plan 06 executor during `npm run build` verification gate.

**Introduced by:** `4408fab3 fix(74.5.2): add direct-handler test shims to gofoodSaleToChannelSale`
(merged into the 74.5.2 feature branch before Plan 06 started).

**Errors:**
```
convex/migrations/gofoodSaleToChannelSale.ts(76,24): error TS6133: 'args' is declared but its value is never read.
convex/migrations/gofoodSaleToChannelSale.ts(86,13): error TS7022: 'result' implicitly has type 'any' because it does not have a type annotation and is referenced directly or indirectly in its own initializer.
```

**Reproduction:**
```bash
git checkout 4d9c080c  # Wave 2 tip before Plan 06
npm ci && npm run build  # FAILS with both errors above
```

**Note:** `npm run type-check` passes (tsc --noEmit mode is more lenient on the
action `args` parameter). Only `npm run build` (which uses `tsc -b` composite-project
strict mode) fails.

**Impact on Plan 06 verification:**
- `npm run type-check`: ✅ PASS
- `npm run build`: ❌ FAIL — but NOT because of Plan 06 changes. The same failure
  occurs on base commit `4d9c080c` before any Plan 06 edits. Confirmed via
  `git stash && npm run build` on the base.

**Suggested fix (follow-up plan):**
```typescript
// In migrateGofoodSaleToChannelSale handler:
handler: async (ctx, _args): Promise<{           // rename args → _args
  totalMigrated: number;
  pagesProcessed: number;
}> => {
  // ...
  const result: { migrated: number; isDone: boolean; continueCursor: string | null } = await ctx.runMutation(  // explicit annotation
    internal.migrations.gofoodSaleToChannelSale.migrateOnePage,
    { paginationOpts: { numItems: PAGE_SIZE, cursor } },
  );
```

Or: consume `args.triggeredBy` in a console.log or audit record to use the parameter
genuinely.

**Suggested home:** Plan 10 (polish-and-docs) already touches 74.5.2 tidy-up;
add a single-paragraph task to fix these two errors before milestone close.
