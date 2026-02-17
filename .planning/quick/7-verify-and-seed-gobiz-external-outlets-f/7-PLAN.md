---
phase: quick-7
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - convex/integrations/gobiz/mutations.ts
autonomous: false

must_haves:
  truths:
    - "The externalOutlets table contains 3 records with source='gobiz': Legato Goldfinch (G293156297), GoFood Crystal (G347061572), Legato Tamtem (G958262444)"
    - "The seedGoBizOutlets function is callable from the Convex dashboard (not an internalMutation)"
    - "Running seedGoBizOutlets a second time is safe (idempotent — skips existing outlets)"
    - "The GoFood channel section in Dispatch Planner at /dispatch-planner shows all 3 gobiz outlet rows"
  artifacts:
    - path: "convex/integrations/gobiz/mutations.ts"
      provides: "Public mutation for seeding gobiz outlets, callable from Convex dashboard"
      exports: ["seedGoBizOutlets"]
      contains: "mutation({"
  key_links:
    - from: "convex/integrations/gobiz/mutations.ts"
      to: "convex/integrations/gobiz/config.ts"
      via: "GOBIZ_OUTLET_SEED import — iterates all 3 outlets"
      pattern: "GOBIZ_OUTLET_SEED"
    - from: "convex/dispatchPlanner/queries.ts"
      to: "convex/schema.ts externalOutlets"
      via: "assembleGofoodChannel queries externalOutlets by_source index with source='gobiz'"
      pattern: "q.eq..source.*gobiz"
---

<objective>
Fix seedGoBizOutlets so it is callable from the Convex dashboard, then run it to create the 3 externalOutlets records with source='gobiz'. Currently the function is an `internalMutation` which CANNOT be called from the dashboard Functions tab — it requires a public `mutation` with auth. Without these records, the GoFood channel section in the Dispatch Planner assembles 0 outlets and the section is effectively hidden.

Purpose: Unblock GoFood channel editing in the Dispatch Planner. GOBIZ_OUTLET_SEED already has all 3 outlets (Goldfinch, Crystal, Tamtem from Phase 17). The database records just need to be created.
Output: 3 externalOutlets records with source='gobiz', GoFood channel visible in Dispatch Planner.
</objective>

<execution_context>
@./.claude/get-shit-done/workflows/execute-plan.md
@./.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/PROJECT.md
@.planning/STATE.md
@convex/integrations/gobiz/mutations.ts
@convex/integrations/gobiz/config.ts
</context>

<tasks>

<task type="auto">
  <name>Task 1: Convert seedGoBizOutlets from internalMutation to public mutation</name>
  <files>convex/integrations/gobiz/mutations.ts</files>
  <action>
The current `seedGoBizOutlets` is an `internalMutation` which cannot be called from the Convex dashboard Functions tab. Convert it to a public `mutation` with admin auth so it can be triggered via the dashboard.

Replace the existing file content:

```typescript
import { mutation } from "../../_generated/server";
import { v } from "convex/values";
import { requireRole } from "../../lib/auth";
import { GOBIZ_OUTLET_SEED } from "./config";

/**
 * Seed GoBiz outlets (Goldfinch, Crystal, Tamtem) into externalOutlets table.
 * Idempotent: only creates outlets that don't already exist.
 *
 * Run from Convex dashboard Functions tab during initial setup:
 *   integrations/gobiz/mutations.seedGoBizOutlets
 *   Args: { "token": "<admin-token>" }
 */
export const seedGoBizOutlets = mutation({
  args: { token: v.string() },
  handler: async (ctx, args) => {
    await requireRole(ctx, args.token, ["admin"]);

    const created: string[] = [];
    const skipped: string[] = [];

    for (const outlet of GOBIZ_OUTLET_SEED) {
      // Check if outlet already exists by source + externalId
      const existing = await ctx.db
        .query("externalOutlets")
        .withIndex("by_source_external_id", (q) =>
          q.eq("source", outlet.source).eq("externalId", outlet.externalId)
        )
        .first();

      if (existing) {
        skipped.push(`${outlet.name} (${outlet.externalId})`);
        continue;
      }

      await ctx.db.insert("externalOutlets", {
        source: outlet.source,
        externalId: outlet.externalId,
        name: outlet.name,
        isActive: true,
        createdBy: "system:seed",
        createdAt: Date.now(),
      });

      created.push(`${outlet.name} (${outlet.externalId})`);
    }

    console.log(`seedGoBizOutlets: created ${created.length}, skipped ${skipped.length}`);
    return { created, skipped };
  },
});
```

Key changes from original:
- `internalMutation` → `mutation` (makes it callable from dashboard)
- Added `import { v } from "convex/values"` and `import { requireRole } from "../../lib/auth"`
- Added `args: { token: v.string() }` and `await requireRole(ctx, args.token, ["admin"])`
- Static imports only (no dynamic import — pitfall #8)
  </action>
  <verify>npm run type-check passes. grep confirms "export const seedGoBizOutlets = mutation(" in convex/integrations/gobiz/mutations.ts.</verify>
  <done>seedGoBizOutlets is a public mutation with admin auth. Type-check passes. Function will appear in Convex dashboard Functions tab as integrations/gobiz/mutations:seedGoBizOutlets.</done>
</task>

<task type="checkpoint:human-verify" gate="blocking">
  <what-built>Public seedGoBizOutlets mutation that creates 3 gobiz externalOutlets records (Goldfinch, Crystal, Tamtem). The mutation is idempotent — safe to run multiple times.</what-built>
  <how-to-verify>
1. Deploy the updated code: `npx convex deploy` (or `npx convex dev` to push to dev environment)
2. Open the Convex dashboard: `npx convex dashboard`
3. Go to Functions tab → find `integrations/gobiz/mutations` → `seedGoBizOutlets`
4. Run it with args: `{ "token": "<your-admin-token>" }`
   - Get your admin token from the sessions table or by logging in as admin in the app
5. Check the return value: expect `{ created: ["Legato Goldfinch (G293156297)", "GoFood Crystal (G347061572)", "Legato Tamtem (G958262444)"], skipped: [] }` on first run
   - If all 3 appear in `skipped`, the outlets already existed (also acceptable)
6. Navigate to /dispatch-planner in the app
7. Verify the GoFood channel section shows 3 outlet rows: Legato Goldfinch, GoFood Crystal, Legato Tamtem
8. Verify each GoFood outlet row has editable cells for future days (click a future day cell — a number input should appear)
  </how-to-verify>
  <resume-signal>Type "verified" if all 3 GoFood outlets appear in the Dispatch Planner, or describe what you see</resume-signal>
</task>

</tasks>

<verification>
1. `npm run type-check` passes after mutation change
2. `grep -n "export const seedGoBizOutlets = mutation" convex/integrations/gobiz/mutations.ts` returns a match
3. After running seedGoBizOutlets from dashboard: return value shows created or skipped for all 3 outlets
4. /dispatch-planner GoFood channel shows: Legato Goldfinch, GoFood Crystal, Legato Tamtem as rows
</verification>

<success_criteria>
- [ ] `npm run type-check` passes
- [ ] `seedGoBizOutlets` is a public `mutation` (not `internalMutation`)
- [ ] 3 gobiz outlets exist in externalOutlets table after running seed
- [ ] GoFood channel in Dispatch Planner shows all 3 outlet rows
- [ ] Future day cells in GoFood rows are editable (click opens number input)
</success_criteria>

<output>
No SUMMARY.md needed — this is a quick fix plan. Mark complete when checkpoint passes.
</output>
