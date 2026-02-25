---
phase: 29-add-sync-history-entries-for-platform-token-refreshes
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - convex/schema.ts
  - convex/externalData/mutations.ts
  - convex/platformCredentials/actions.ts
  - convex/integrations/gobiz/adapter.ts
  - convex/integrations/bigseller/adapter.ts
  - convex/platformCredentials/mutations.ts
  - convex/platformCredentials/queries.ts
  - src/components/salesAnalytics/IntegrationHealthCard.tsx
autonomous: true
requirements: [SYNC-HISTORY-TOKEN-REFRESH]

must_haves:
  truths:
    - "Token refresh operations for K3Mart appear in sync history log"
    - "Token refresh operations for GoBiz appear in sync history log"
    - "Token paste operations for BigSeller appear in sync history log"
    - "Sync history entries for token refreshes are visually distinguishable from data syncs"
    - "All platform cards show sync history when expanded (not just last_sync platforms)"
  artifacts:
    - path: "convex/schema.ts"
      provides: "token_refresh syncType literal in externalSyncLogs"
      contains: "token_refresh"
    - path: "convex/platformCredentials/actions.ts"
      provides: "Sync log creation on K3Mart token refresh"
      contains: "createSyncLog"
    - path: "convex/integrations/gobiz/adapter.ts"
      provides: "Sync log creation on GoBiz token refresh"
      contains: "createSyncLog"
    - path: "convex/platformCredentials/queries.ts"
      provides: "syncHistory populated for all platforms with credentials"
      contains: "token_refresh"
  key_links:
    - from: "convex/platformCredentials/actions.ts"
      to: "convex/externalData/mutations.ts"
      via: "createSyncLog internal mutation call"
      pattern: "internal\\.externalData\\.mutations\\.createSyncLog"
    - from: "convex/integrations/gobiz/adapter.ts"
      to: "convex/externalData/mutations.ts"
      via: "createSyncLog internal mutation call"
      pattern: "internal\\.externalData\\.mutations\\.createSyncLog"
    - from: "convex/platformCredentials/queries.ts"
      to: "src/components/salesAnalytics/IntegrationHealthCard.tsx"
      via: "syncHistory in PlatformHealthStatus"
      pattern: "syncHistory"
---

<objective>
Add sync history entries for platform token refreshes so that refresh operations (K3Mart login, GoBiz password/refresh grant, BigSeller token paste) are visible in the sync history log on each platform's Integration Health Card.

Purpose: Currently only data syncs create externalSyncLogs entries. Token refreshes are invisible in the UI, making it hard to debug auth issues or confirm that refreshes happened.

Output: Token refresh events appear as sync history entries with a distinct "Token refresh" label, visible when expanding any platform card that has credentials.
</objective>

<execution_context>
@./.claude/get-shit-done/workflows/execute-plan.md
@./.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@convex/schema.ts (externalSyncLogs table definition, externalSource validator)
@convex/externalData/mutations.ts (createSyncLog, updateSyncLog internal mutations)
@convex/platformCredentials/actions.ts (K3Mart performK3MartRefresh, refreshK3MartToken)
@convex/platformCredentials/mutations.ts (updateToken, saveDirectToken, saveDirectTokenPublic)
@convex/platformCredentials/queries.ts (getHealthStatusAll, SyncLogEntry, PlatformHealthStatus)
@convex/integrations/gobiz/adapter.ts (loginWithCredentials — refresh_token grant + password grant)
@convex/integrations/bigseller/adapter.ts (saveBigSellerToken — paste flow)
@src/components/salesAnalytics/IntegrationHealthCard.tsx (sync history display)
</context>

<tasks>

<task type="auto">
  <name>Task 1: Schema + backend — add token_refresh syncType and create sync log entries in all refresh paths</name>
  <files>
    convex/schema.ts
    convex/externalData/mutations.ts
    convex/platformCredentials/actions.ts
    convex/integrations/gobiz/adapter.ts
    convex/integrations/bigseller/adapter.ts
  </files>
  <action>
1. In `convex/schema.ts`, find the `externalSyncLogs` table definition. Add `v.literal("token_refresh")` to the `syncType` union so it becomes:
   ```
   syncType: v.union(v.literal("manual"), v.literal("cron"), v.literal("token_refresh")),
   ```

2. In `convex/externalData/mutations.ts`, update the `createSyncLog` args `syncType` validator to match the schema (add `v.literal("token_refresh")`).

3. In `convex/platformCredentials/actions.ts` (K3Mart refresh):
   - Import `internal` from `../_generated/api` (already imported).
   - In `performK3MartRefresh`, AFTER the successful `updateToken` call (around line 128-136), add a sync log entry:
     ```ts
     await ctx.runMutation(internal.externalData.mutations.createSyncLog, {
       source: "k3mart" as const,
       syncType: "token_refresh" as const,
       status: "success" as const,
       timestamp: Date.now(),
       triggeredBy: "system",
     });
     ```
   - In the catch block (around line 140-153), AFTER the error `updateToken` call, add a sync log for the failure:
     ```ts
     await ctx.runMutation(internal.externalData.mutations.createSyncLog, {
       source: "k3mart" as const,
       syncType: "token_refresh" as const,
       status: "error" as const,
       errorMessage: errorMsg,
       timestamp: Date.now(),
       triggeredBy: "system",
     });
     ```

4. In `convex/integrations/gobiz/adapter.ts` (`loginWithCredentials`):
   - Import `internal` from `../../_generated/api` (check if already imported, likely is).
   - After successful refresh_token grant (line ~1111-1116, after `saveDirectToken`), add sync log:
     ```ts
     await ctx.runMutation(internal.externalData.mutations.createSyncLog, {
       source: "gobiz" as const,
       syncType: "token_refresh" as const,
       status: "success" as const,
       timestamp: Date.now(),
       triggeredBy: "system",
     });
     ```
   - After successful password grant (line ~1144-1146, after `loginViaGoID` returns truthy), add sync log:
     ```ts
     await ctx.runMutation(internal.externalData.mutations.createSyncLog, {
       source: "gobiz" as const,
       syncType: "token_refresh" as const,
       status: "success" as const,
       timestamp: Date.now(),
       triggeredBy: "system",
     });
     ```
   - After failed password grant (line ~1149-1154, after error `updateToken`), add sync log:
     ```ts
     await ctx.runMutation(internal.externalData.mutations.createSyncLog, {
       source: "gobiz" as const,
       syncType: "token_refresh" as const,
       status: "error" as const,
       errorMessage: "GoID 2-step password login failed",
       timestamp: Date.now(),
       triggeredBy: "system",
     });
     ```
   - After the catch block error (line ~1159-1163), add sync log:
     ```ts
     await ctx.runMutation(internal.externalData.mutations.createSyncLog, {
       source: "gobiz" as const,
       syncType: "token_refresh" as const,
       status: "error" as const,
       errorMessage: err instanceof Error ? err.message : String(err),
       timestamp: Date.now(),
       triggeredBy: "system",
     });
     ```

5. In `convex/integrations/bigseller/adapter.ts` (`saveBigSellerToken`):
   - After the `saveDirectToken` call (line ~121-124), add sync log:
     ```ts
     await ctx.runMutation(internal.externalData.mutations.createSyncLog, {
       source: "bigseller" as const,
       syncType: "token_refresh" as const,
       status: "success" as const,
       timestamp: Date.now(),
       triggeredBy: "system",
     });
     ```
   Note: bigseller is NOT in the `externalSource` validator. Check `convex/schema.ts` — if "bigseller" is listed in the `externalSource` union, use it. If NOT, skip the BigSeller sync log (cannot insert a source not in the validator). In that case, the BigSeller token paste will continue to be tracked only via `lastRefreshAt` on the credential record.
  </action>
  <verify>
    <automated>cd "D:/Claude/Product Manager/product_master" && npx tsc --noEmit 2>&1 | head -30</automated>
    <manual>Verify schema.ts has token_refresh in syncType union, and all 3 adapter files have createSyncLog calls</manual>
  </verify>
  <done>
    - externalSyncLogs schema accepts "token_refresh" as syncType
    - K3Mart refresh creates sync log on success and error
    - GoBiz loginWithCredentials creates sync log on success (refresh grant and password grant) and error
    - BigSeller creates sync log on token paste (if source is in validator), or skipped with comment explaining why
  </done>
</task>

<task type="auto">
  <name>Task 2: Query + UI — show token refresh entries in sync history for all platform cards</name>
  <files>
    convex/platformCredentials/queries.ts
    src/components/salesAnalytics/IntegrationHealthCard.tsx
  </files>
  <action>
1. In `convex/platformCredentials/queries.ts`, update `getHealthStatusAll`:
   - Currently `syncHistory` is only populated for `healthCheckType === "last_sync"` platforms (k3mart, gobiz). Token refresh logs need to appear for ALL platforms that have credentials.
   - Update the `SyncLogEntry` type to include an optional `syncType` field:
     ```ts
     export type SyncLogEntry = {
       timestamp: number;
       status: "started" | "success" | "error";
       syncType: "manual" | "cron" | "token_refresh";
       productsCount?: number;
       durationMs?: number;
       errorMessage?: string;
     };
     ```
     (syncType is already in the type — just add "token_refresh" to the union.)
   - For `always_green` platforms (grabfood) and `token_expiry` platforms (bigseller): after setting status/label, query the last 5 sync logs for that platform's source (same pattern as `last_sync` block, lines 283-296). Only do this IF the platformId is a valid externalSource (i.e., it exists in the `externalSyncLogs` index). Since bigseller may not be in the externalSource validator, guard with a try/catch or only query if platformId is in a known list.
   - For `last_sync` platforms: the existing syncHistory query already fetches all sync log types including token_refresh — no change needed there.

2. In `src/components/salesAnalytics/IntegrationHealthCard.tsx`, update the sync history display:
   - In the `syncHistory.map` block (around line 231-252), add a label that distinguishes token refreshes from data syncs.
   - After the status icon and relative time, add a type badge:
     ```tsx
     <span className={cn(
       "text-[10px] px-1 py-0.5 rounded",
       entry.syncType === "token_refresh"
         ? "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400"
         : "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400"
     )}>
       {entry.syncType === "token_refresh" ? "Token" : "Sync"}
     </span>
     ```
   - For token_refresh entries, do NOT show productsCount (it will be undefined anyway).
  </action>
  <verify>
    <automated>cd "D:/Claude/Product Manager/product_master" && npm run build 2>&1 | tail -5</automated>
    <manual>Open Sales Analytics Settings tab, expand K3Mart or GoBiz card, verify token refresh entries appear with "Token" badge distinct from "Sync" badge</manual>
  </verify>
  <done>
    - All platform cards with credentials show sync history including token refresh entries
    - Token refresh entries display with a blue "Token" badge to distinguish from data "Sync" entries
    - Build passes with no TypeScript errors
  </done>
</task>

</tasks>

<verification>
1. `npm run build` passes — no TypeScript errors from schema change or new sync log calls
2. `npm run type-check` passes
3. Manual: trigger a K3Mart token refresh from the UI, expand the K3Mart card, see a new "Token" entry in sync history
4. Manual: trigger a GoBiz one-click login, expand the GoBiz card, see a new "Token" entry
</verification>

<success_criteria>
- Token refresh operations create externalSyncLogs entries with syncType "token_refresh"
- Sync history on platform health cards shows token refresh entries with visual distinction
- All existing data sync entries continue to display correctly (no regression)
- `npm run build` passes
</success_criteria>

<output>
After completion, create `.planning/quick/29-add-sync-history-entries-for-platform-to/29-SUMMARY.md`
</output>
