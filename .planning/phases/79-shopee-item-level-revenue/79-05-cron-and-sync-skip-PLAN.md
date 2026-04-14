---
phase: 79
plan: 05
type: execute
wave: 2
depends_on: [79-01]
files_modified:
  - convex/crons.ts
  - convex/integrations/bigseller/cron.ts
  - convex/integrations/bigseller/queries.ts
autonomous: true
requirements: [DA-12]
tags: [bigseller, shopee, cron, skip-if-busy]
must_haves:
  truths:
    - "Cron fires daily at 20:00 UTC (= 03:00 WIB next day, Indonesia UTC+7 no DST)"
    - "Cron re-syncs trailing 7 days of BigSeller data"
    - "If bigsellerSyncState.stage !== 'idle', cron writes externalSyncLogs row with status='error', errorMessage='skipped: manual sync in progress', and RETURNS WITHOUT running sync"
    - "No retry, no queue, no email/toast alerting (D-13)"
  artifacts:
    - path: convex/integrations/bigseller/cron.ts
      provides: nightlySync internalAction with skip-if-not-idle guard
      exports: ["nightlySync"]
    - path: convex/crons.ts
      provides: crons.daily entry wiring 20:00 UTC to nightlySync
      contains: "hourUTC: 20"
  key_links:
    - from: convex/crons.ts
      to: convex/integrations/bigseller/cron.ts nightlySync
      via: "internal.integrations.bigseller.cron.nightlySync"
      pattern: "nightlySync"
    - from: convex/integrations/bigseller/cron.ts
      to: convex/integrations/bigseller/sync.ts runBigsellerSync
      via: "internal.integrations.bigseller.sync.runBigsellerSync"
      pattern: "runBigsellerSync"
---

<objective>
Add a daily BigSeller re-sync cron at 03:00 WIB (= 20:00 UTC). The cron wrapper checks `bigsellerSyncState.stage` and skips if a manual sync is in progress (D-12), logging the skip via `externalSyncLogs`.

Purpose: DA-12. Same-day Shopee `--` rows that BigSeller populates within 24h auto-backfill without admin intervention.

Output: New cron entry; skip-if-busy guard tested; cron.test.ts green.
</objective>

<execution_context>
@D:/Claude/Product Manager/product_master/.claude/get-shit-done/workflows/execute-plan.md
@D:/Claude/Product Manager/product_master/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/phases/79-shopee-item-level-revenue/79-CONTEXT.md
@.planning/phases/79-shopee-item-level-revenue/79-RESEARCH.md §Pattern 4
@convex/crons.ts
@convex/integrations/bigseller/sync.ts (runBigsellerSync action signature)
@convex/integrations/bigseller/queries.ts (existing getSyncState-style queries)
@convex/externalData/mutations.ts (logSyncEvent mutation — verify exists or create)
@convex/integrations/bigseller/__tests__/cron.test.ts
@convex/schema.ts §bigsellerSyncState, §externalSyncLogs
</context>

<tasks>

<task type="auto">
  <name>Task 1: Create nightlySync internalAction + wire crons.daily</name>
  <read_first>
    - convex/crons.ts (existing cron entries — match formatting conventions)
    - convex/integrations/bigseller/sync.ts (find `runBigsellerSync` internalAction — confirm args shape `{startDate, endDate, triggeredBy}`)
    - convex/integrations/bigseller/queries.ts (check for `getSyncState` internalQuery — if absent, add alongside nightlySync)
    - convex/externalData/mutations.ts (search for `logSyncEvent` — if absent, use direct `ctx.db.insert("externalSyncLogs", ...)` inside the action via a helper internalMutation)
    - convex/schema.ts `externalSyncLogs` shape (required fields: source, syncType, status, errorMessage, timestamp — adjust to match actual schema)
  </read_first>
  <action>
**Step 1 — Create `convex/integrations/bigseller/cron.ts` (new file):**

```typescript
import { internalAction } from "../../_generated/server";
import { internal } from "../../_generated/api";

export const nightlySync = internalAction({
  args: {},
  handler: async (ctx) => {
    // D-12: skip if manual sync in flight
    const state = await ctx.runQuery(internal.integrations.bigseller.queries.getSyncState, {});
    if (state && state.stage !== "idle") {
      await ctx.runMutation(internal.externalData.mutations.logSyncEvent, {
        source: "shopee",
        syncType: "scheduled",
        status: "error",
        errorMessage: "skipped: manual sync in progress",
        timestamp: Date.now(),
      });
      return;
    }

    // D-11: trailing 7-day window
    const endDate = new Date().toISOString().slice(0, 10);               // YYYY-MM-DD UTC
    const startDate = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

    try {
      await ctx.runAction(internal.integrations.bigseller.sync.runBigsellerSync, {
        startDate,
        endDate,
        triggeredBy: "cron-daily",
      });
    } catch (err) {
      // D-13: log error; no email/toast
      await ctx.runMutation(internal.externalData.mutations.logSyncEvent, {
        source: "shopee",
        syncType: "scheduled",
        status: "error",
        errorMessage: err instanceof Error ? err.message : String(err),
        timestamp: Date.now(),
      });
    }
  },
});
```

**Step 2 — Add `getSyncState` internalQuery (if not present) to `convex/integrations/bigseller/queries.ts`:**

```typescript
export const getSyncState = internalQuery({
  args: {},
  handler: async (ctx) => {
    const state = await ctx.db.query("bigsellerSyncState").first();
    return state;  // { stage, startedAt, ... } | null
  },
});
```

**Step 3 — Add `logSyncEvent` internalMutation (if not present) to `convex/externalData/mutations.ts`:**

```typescript
export const logSyncEvent = internalMutation({
  args: {
    source: externalSource,  // reuse existing validator
    syncType: v.string(),
    status: v.union(v.literal("started"), v.literal("success"), v.literal("error")),
    errorMessage: v.optional(v.string()),
    timestamp: v.number(),
  },
  handler: async (ctx, args) => {
    await ctx.db.insert("externalSyncLogs", args);
  },
});
```
(Adjust field names/shape to match the actual `externalSyncLogs` schema found in `convex/schema.ts`.)

**Step 4 — Wire cron in `convex/crons.ts`:**

```typescript
crons.daily(
  "bigseller nightly 7d resync",
  { hourUTC: 20, minuteUTC: 0 },   // 03:00 WIB next day = 20:00 UTC
  internal.integrations.bigseller.cron.nightlySync,
);
```

**Do NOT:**
- Add retry loop on failure (D-13 — log only).
- Add email/toast alerting (out of scope per D-13).
- Trigger inventory deduction (D-22).
- Use scheduler.runAfter for retry chaining.
  </action>
  <verify>
    <automated>npm run test -- --run convex/integrations/bigseller/__tests__/cron.test.ts</automated>
  </verify>
  <acceptance_criteria>
    - File exists: convex/integrations/bigseller/cron.ts with export `nightlySync`
    - `grep -n "hourUTC: 20" convex/crons.ts` returns match (exactly 20, not 19 or 21)
    - `grep -n "minuteUTC: 0" convex/crons.ts` returns match
    - `grep -n "bigseller nightly" convex/crons.ts` returns match (descriptive cron name)
    - `grep -n "skipped: manual sync in progress" convex/integrations/bigseller/cron.ts` returns EXACT string match (D-12 literal wording)
    - cron.test.ts all cases green
    - `npm run type-check` + `npm run build` pass
  </acceptance_criteria>
  <done>Cron wired; skip-if-busy guard tested green; no retry logic.</done>
</task>

</tasks>

<threat_model>
## Trust Boundaries
| Boundary | Description |
|----------|-------------|
| Convex scheduler → nightlySync | Internal; no user auth required |
| nightlySync → runBigsellerSync | Internal call chain; no additional auth |

## STRIDE Threat Register
| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-79-08 | DoS | Cron race with manual sync → double-write | mitigate | D-12 skip-if-not-idle guard — cron exits cleanly on conflict |
| T-79-09 | DoS | Cron token expired → flood 401 errors | accept | Single try/catch logs once per day; admin sees error row, refreshes token |
| T-79-10 | Information Disclosure | errorMessage contains raw API response with token | mitigate | Log `err.message` only (not response body); document in code comment |
</threat_model>

<verification>
cron.test.ts green; full suite green; no behavior change for manual syncs.
</verification>

<success_criteria>
- [ ] cron.test.ts all cases green
- [ ] `npm run type-check` + `npm run build` pass
- [ ] Manual inspection: `npx convex dashboard` shows scheduled cron entry "bigseller nightly 7d resync"
</success_criteria>

## Git Workflow
**Branch:** `feature/79-shopee-item-level-revenue`

## Implementation Waves
### Wave 2: Cron wiring [PARALLEL with Plan 03, 04 — different files]
| Agent | Task | Files |
|-------|------|-------|
| convex-backend | New cron + skip guard | crons.ts, integrations/bigseller/cron.ts, queries.ts, externalData/mutations.ts |

## Documentation Updates
- [ ] CHANGELOG (batched at phase end)
- [ ] CLAUDE.md if cron cadence worth calling out (optional, planner discretion)

## Success Criteria (this plan)
- [ ] cron.test.ts green
- [ ] Build + type-check pass

<output>
Create `.planning/phases/79-shopee-item-level-revenue/79-05-SUMMARY.md`
</output>
