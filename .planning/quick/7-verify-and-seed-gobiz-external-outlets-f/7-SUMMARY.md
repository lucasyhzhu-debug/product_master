---
phase: quick-7
plan: 01
subsystem: database
tags: [convex, mutation, gobiz, externalOutlets, seed]

requires:
  - phase: 17-unified-dispatch-planner-3rd-outlet
    provides: externalOutlets table schema with by_source_external_id index

provides:
  - Public mutation seedGoBizOutlets callable from Convex dashboard Functions tab

affects:
  - dispatch-planner GoFood channel (assembleGofoodChannel queries externalOutlets by source=gobiz)

tech-stack:
  added: []
  patterns:
    - "Admin-gated public mutation for one-time seeding operations"

key-files:
  created: []
  modified:
    - convex/integrations/gobiz/mutations.ts

key-decisions:
  - "internalMutation converted to public mutation with requireRole admin guard to allow dashboard invocation"

patterns-established: []

duration: 3min
completed: 2026-02-17
---

# Quick Task 7: Verify and Seed GoBiz External Outlets Summary

**seedGoBizOutlets converted from internalMutation to admin-gated public mutation, callable from Convex dashboard Functions tab to seed 3 gobiz externalOutlets records**

## Performance

- **Duration:** ~3 min
- **Started:** 2026-02-17
- **Completed:** 2026-02-17
- **Tasks:** 1 of 2 (Task 2 is human-action checkpoint — cannot be auto-executed)
- **Files modified:** 1

## Accomplishments

- Converted `seedGoBizOutlets` from `internalMutation` (not callable from dashboard) to `mutation` (callable from dashboard)
- Added `token: v.string()` arg with `requireRole(ctx, args.token, ["admin"])` for secure invocation
- Added necessary imports: `mutation`, `v`, `requireRole`
- Type-check passes cleanly after change

## Task Commits

1. **Task 1: Convert seedGoBizOutlets to public mutation** - `65a7d60` (feat)

## Files Created/Modified

- `convex/integrations/gobiz/mutations.ts` - Changed `internalMutation` to `mutation`, added `token` arg with admin auth

## Decisions Made

- Used `requireRole(ctx, args.token, ["admin"])` consistent with other seeding mutations in the codebase
- Kept the idempotent logic identical (skips existing records by `by_source_external_id` index)

## Deviations from Plan

None - plan executed exactly as written.

## User Setup Required (Task 2 — Human Action)

Task 2 is a `checkpoint:human-action` and requires manual execution. The automated portion (Task 1) is complete.

**To complete the seeding:**

1. Deploy the updated code to your environment:
   ```bash
   npx convex deploy
   ```
   Or push to dev:
   ```bash
   npx convex dev
   ```

2. Open the Convex dashboard:
   ```bash
   npx convex dashboard
   ```

3. Navigate to **Functions tab** → find `integrations/gobiz/mutations` → `seedGoBizOutlets`

4. Run it with your admin token:
   ```json
   { "token": "<your-admin-token>" }
   ```

5. Expected return on first run:
   ```json
   {
     "created": ["Legato Goldfinch (G293156297)", "GoFood Crystal (G347061572)", "Legato Tamtem (G958262444)"],
     "skipped": []
   }
   ```
   If all appear in `skipped`, the outlets already existed (also acceptable).

6. Verify at **/dispatch-planner** — GoFood channel section should show 3 outlet rows: Legato Goldfinch, GoFood Crystal, Legato Tamtem.

## Self-Check: PASSED

- `convex/integrations/gobiz/mutations.ts` exists and contains `export const seedGoBizOutlets = mutation({`
- Commit `65a7d60` exists
- `npm run type-check` passes (0 errors)

---
*Phase: quick-7*
*Completed: 2026-02-17*
