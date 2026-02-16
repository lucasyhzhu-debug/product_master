# Phase 11: Infrastructure & Consolidation - Research

**Researched:** 2026-02-14
**Domain:** Convex scheduled functions, database backup, dependency management, production data consolidation
**Confidence:** MEDIUM (backup approach requires adaptation from user's original vision)

## Summary

This phase covers three distinct work areas: automated database backups, dependency audit, and production counts consolidation. The **most critical finding** is that Convex does NOT support programmatic backup triggering from code -- backups can only be scheduled/triggered via the Convex Dashboard UI (Pro plan required for automatic scheduling). This means the user's vision of a "Convex scheduled function for weekly backup" cannot be implemented as a cron-triggered export. The recommended approach is to use Convex's built-in dashboard-based automatic backup scheduling (weekly) and implement a **backup monitoring system** in code that tracks whether backups are current and alerts admins on failure.

The production counts consolidation is the highest-risk item. Currently, `productionCounts` is a mutable running tally written to by **4 separate mutation files** (kitchen.ts, gofoodDepot/mutations.ts, k3martCockpit/mutations.ts, productionCounts/mutations.ts) and read by **4 query files** (productionCounts/queries.ts, orders/kitchenQueries.ts, k3martCockpit/queries.ts). Replacing these reads with `productionLog` aggregation requires careful query design to avoid performance degradation in the kitchen's sustained-usage pattern.

**Primary recommendation:** Configure Convex Dashboard automatic weekly backup (not code-based); build a monitoring table + admin notification system; replace all `productionCounts` reads with `productionLog` aggregation queries; stop all dual-writes; keep `productionCounts` table in schema as read-only archive.

<user_constraints>

## User Constraints (from CONTEXT.md)

### Locked Decisions

- **Backup schedule & retention:** Weekly backup using Convex scheduled function (cron). Storage: Convex export only (no external S3). Retain last 8 backups (2 months of weekly snapshots), auto-delete older. On failure: retry once after 1 hour, log result to `backupLogs` table either way. Backup status logged to Convex table (not dashboard widget). On admin login: show notification banner if most recent backup failed -- user must click to dismiss.
- **Dependency audit scope:** Full audit: document all packages with versions, then upgrade everything possible. Skip breaking upgrades -- only apply upgrades where `npm run build` still passes. Document skipped packages with rationale for why they were not upgraded. Include future recommendations section with 3-6 month timeline for upcoming attention items. Primary focus: compatibility verification (React 19 + Convex 1.31 + Vite 7 + TS 5.9). Secondary: security vulnerabilities (npm audit).
- **Production counts consolidation:** Full replacement: all kitchen UI reads from `productionLog` aggregation, not `productionCounts`. Stop dual-write immediately once productionLog reads are live (no transition period). Keep `productionCounts` table as read-only archive (do not delete from schema). Accept up to ~500ms slower queries if data is more accurate. Kitchen usage pattern: starts morning, runs until late depending on demand -- optimize for sustained usage, not burst.
- **Monitoring & integrity:** Weekly data integrity check (scheduled function) comparing productionLog totals against kitchen display expectations -- log mismatches to a table. Backup failure notification shown to admin on next login (must click OK to clear). Existing Convex crons already in place (cost invalidation, etc.) -- new crons follow same patterns.

### Claude's Discretion

- Exact Convex cron scheduling syntax and timing
- Backup export format and implementation details
- productionLog aggregation query optimization approach
- Integrity check verification method (side-by-side vs spot check vs automated comparison)
- How to surface backup failure notification on admin login (toast, banner, dialog)

### Deferred Ideas (OUT OF SCOPE)

- External API integration (K3Mart, Gobiz website authentication and data pulling) -- new capability, deserves its own phase
- Cron-based re-authentication for external services -- superseded by on-the-fly auth approach, but the integration itself is out of scope

</user_constraints>

## Standard Stack

### Core (already in project)

| Library | Version | Purpose | Notes |
|---------|---------|---------|-------|
| Convex | ^1.31.7 | Backend + real-time database | Cron jobs, scheduled functions, actions |
| React | ^19.2.0 | Frontend UI | Admin notification banner |
| TypeScript | ~5.9.3 | Type safety | Type-check verification |
| Vite | ^7.2.4 | Build tool | Build verification |

### Supporting (already in project)

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| Sonner | ^2.0.7 | Toast notifications | Backup failure notification on admin login |
| Tailwind CSS | ^4.1.18 | Styling | Notification banner styling |

### No New Dependencies Required

This phase does not require any new npm packages. All functionality is built using existing Convex primitives (cron jobs, queries, mutations, actions) and existing frontend libraries.

## Architecture Patterns

### INFRA-01: Backup Monitoring System

**CRITICAL FINDING:** Convex does NOT support programmatic backup triggering from server functions. The `npx convex export` CLI and the Dashboard "Backup Now" button are the only ways to create backups. Automatic backup scheduling is available via the Convex Dashboard (Pro plan) with daily/weekly options.

**Recommended Approach (adapted from user's vision):**

1. **Configure backup via Convex Dashboard** -- enable weekly automatic backups in the Dashboard settings (Pro plan feature). This satisfies the "weekly backup" requirement.
2. **Build a backup monitoring system in code** -- since we cannot trigger backups programmatically, we build monitoring:
   - `backupLogs` table in schema to track expected vs actual backup status
   - Weekly cron job that logs an "expected backup" record and checks the previous week's status
   - Admin notification banner on login when the most recent log entry shows a failure or missing backup
3. **Retention is handled by Convex Dashboard** -- Convex Pro stores daily backups for 7 days, weekly for 14 days. The "8 backups / 2 months" retention is not directly controllable in dashboard but the monitoring table can track history.

**Alternative if Pro plan is not available:** The backup monitoring cron can instead remind admins to run `npx convex export` manually, logging whether the reminder was acknowledged.

```
convex/
  backups/
    mutations.ts       # logBackupStatus, dismissBackupAlert, acknowledgeBackup
    queries.ts         # getLatestBackupStatus, getBackupHistory, hasUnacknowledgedFailure
  schema.ts            # + backupLogs table
  crons.ts             # + weekly backup check cron
src/
  components/layout/
    BackupAlertBanner.tsx  # Admin-only notification banner
  hooks/convex/
    useBackupStatus.ts     # Hook for backup alert state
```

### INFRA-02: Dependency Audit

**Pattern:** Document-only phase -- no code changes, just a thorough audit document.

```
docs/
  DEPENDENCY_AUDIT.md  # Full audit results
```

Audit approach:
1. Run `npm outdated` to identify available upgrades
2. Run `npm audit` for security vulnerabilities
3. For each upgradeable package, attempt upgrade + `npm run build` verification
4. Document results: upgraded, skipped (with rationale), future attention items

### INFRA-03: Production Counts Consolidation

**Pattern:** Replace materialized counter reads with log-derived aggregation queries.

#### Current Architecture (dual-write):

```
Mutations that WRITE to productionCounts:
  1. convex/orders/mutations/kitchen.ts        -- boxProducts, stickerProducts, togglePackOrderLineItem
  2. convex/gofoodDepot/mutations.ts           -- recordShipment (shippedToGoldfinch), returnFromGoldfinch (stickered)
  3. convex/k3martCockpit/mutations.ts         -- resolveMovement (stickered for office destination)
  4. convex/productionCounts/mutations.ts      -- resetCounts

Queries that READ from productionCounts:
  1. convex/productionCounts/queries.ts        -- getAll, getByMenuProduct
  2. convex/orders/kitchenQueries.ts           -- getKitchenPackingOrders (availability check)
  3. convex/k3martCockpit/queries.ts           -- getCockpitSummary, getK3MartInventoryOverview

Frontend consumers:
  1. src/hooks/convex/useKitchenProduction.ts   -- useQuery(api.productionCounts.queries.getAll)
  2. src/pages/KitchenViewV2.tsx                -- uses productionCounts from hook
  3. src/components/kitchen/BoxingPanel.tsx      -- receives productionCounts prop
  4. src/components/kitchen/StickeringPanel.tsx  -- receives productionCounts prop
  5. src/components/kitchen/ProductionLogPanel.tsx -- receives productionCounts prop
  6. src/components/kitchen/GoFoodPackingCard.tsx -- receives productionCounts prop
```

#### Target Architecture (productionLog aggregation):

```
convex/
  productionLog/
    queries.ts         # + getAggregatedCounts (replaces productionCounts.queries.getAll)
                       # + getCountsByMenuProduct (replaces productionCounts.queries.getByMenuProduct)
```

#### Aggregation Query Design

The `productionLog` table records individual actions with quantities:
- Actions: `box`, `unbox`, `sticker`, `unsticker`, `pack`, `unpack`
- Each has: `menuProductId`, `action`, `quantity` (always positive), `timestamp`

**Aggregation logic:**
```typescript
// For each menuProduct, sum:
// boxed = SUM(box.quantity) - SUM(unbox.quantity)
// stickered = SUM(sticker.quantity) - SUM(unsticker.quantity)
// packed = SUM(pack.quantity) - SUM(unpack.quantity)
// availableForStickering = boxed - stickered
// availableForPacking = stickered - packed
```

**Key challenge:** The `productionCounts` table supports a "reset" operation (setting counts to zero). With log-derived aggregation, resets need a different approach:
- Option A: Insert "reset" log entries that negate all accumulated values
- Option B: Track a `lastResetAt` timestamp and only aggregate logs after that timestamp
- **Recommendation: Option B** -- store `lastResetAt` per menuProduct in a small `productionResets` table. Aggregation queries filter `productionLog` entries where `timestamp > lastResetAt`.

**shippedToGoldfinch concern:** The `productionLog` table does NOT currently log GoFood shipment actions. The `gofoodDepot/mutations.ts` writes `shippedToGoldfinch` directly to `productionCounts` without a corresponding `productionLog` entry. This needs a new log action type or a separate tracking approach.

### Pattern: Convex Cron Job Definition

Source: Convex official docs + existing crons.ts in project

```typescript
// convex/crons.ts -- existing pattern in project
import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";

const crons = cronJobs();

// Existing crons
crons.interval("refresh k3mart token", { hours: 12 }, internal.platformCredentials.actions.refreshK3MartTokenCron);
crons.cron("sync gobiz revenue", "0 1,3,5,7,9,11,13 * * *", internal.integrations.gobiz.adapter.autoSyncGoBizRevenue);

// NEW: Weekly backup check (Sundays at 2:00 UTC = 9:00 WIB)
crons.cron("weekly backup check", "0 2 * * 0", internal.backups.mutations.checkBackupStatus);

// NEW: Weekly data integrity check (Sundays at 3:00 UTC = 10:00 WIB)
crons.cron("weekly integrity check", "0 3 * * 0", internal.integrityChecks.mutations.runWeeklyCheck);

export default crons;
```

### Pattern: Admin Notification on Login

The login flow goes through `convex/auth/mutations.ts` -> `login()` which returns session info. The frontend `AuthContext` then stores this. For the backup failure notification:

**Backend approach:** Add a query `backups.queries.hasUnacknowledgedFailure` that checks the `backupLogs` table for the most recent entry and returns whether it's a failure that hasn't been dismissed.

**Frontend approach:** In the `Layout` component or `AuthContext`, query the backup status for admin users. Show a dismissible banner (not a toast, since toasts auto-dismiss). The banner should be a persistent UI element at the top of the page, similar to maintenance banners.

```typescript
// src/components/layout/BackupAlertBanner.tsx
// Only renders for admin/manager roles
// Queries backups.queries.hasUnacknowledgedFailure
// On dismiss click: calls backups.mutations.dismissBackupAlert
```

### Anti-Patterns to Avoid

- **DO NOT trigger `npx convex export` from a Convex action** -- CLI commands cannot run inside Convex server functions. Actions can make HTTP requests but there is no Convex HTTP API for triggering exports.
- **DO NOT aggregate all productionLog entries without a time filter** -- as the log grows, scanning all entries becomes increasingly slow. Always filter by `lastResetAt` timestamp.
- **DO NOT delete productionCounts records** -- the table stays in schema as a read-only archive per user decision.
- **DO NOT remove productionCounts writes and reads simultaneously** -- remove reads first (replace with aggregation queries), verify everything works, THEN remove writes.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Backup scheduling | Custom cron that calls `npx convex export` | Convex Dashboard automatic backup (Pro plan) | CLI cannot run from server functions |
| Backup retention | Custom retention logic deleting old exports | Convex Dashboard retention settings | Dashboard manages this automatically |
| Dependency upgrade checking | Custom script to check versions | `npm outdated` + `npm audit` | Standard npm tooling is sufficient |
| Production log aggregation caching | Custom materialized view with triggers | Direct aggregation with timestamp filter | Convex queries are fast enough for ~500ms budget; materialized views add complexity |

**Key insight:** The backup system should be monitoring/alerting, not backup execution. Convex Dashboard handles the actual backup mechanics.

## Common Pitfalls

### Pitfall 1: Assuming Convex Supports Programmatic Backups
**What goes wrong:** Implementing a cron job that tries to trigger `npx convex export` or call an export API that doesn't exist.
**Why it happens:** The user's decision says "Convex scheduled function (cron)" for backup, which seems to imply code-triggered exports.
**How to avoid:** Use Convex Dashboard for backup scheduling; use code only for monitoring/alerting.
**Warning signs:** Looking for `ctx.export()` or similar API -- it doesn't exist.

### Pitfall 2: productionLog Aggregation Without Reset Awareness
**What goes wrong:** Aggregation returns massive historical totals instead of "since last reset" values.
**Why it happens:** The `productionCounts` table supports a "reset" operation that zeros out counts. Log-based aggregation must account for this.
**How to avoid:** Create a `productionResets` table storing `lastResetAt` per menuProduct. Filter `productionLog` queries to only aggregate entries after the reset timestamp.
**Warning signs:** Boxed counts showing values in the thousands when they should be in the dozens.

### Pitfall 3: Missing shippedToGoldfinch in productionLog
**What goes wrong:** After consolidation, the GoFood depot shipping tracking breaks because `shippedToGoldfinch` was tracked in `productionCounts` but never logged to `productionLog`.
**Why it happens:** The `gofoodDepot/mutations.ts` `recordShipment` function writes to `productionCounts.shippedToGoldfinch` directly without creating a `productionLog` entry.
**How to avoid:** Either add new action types to `productionLog` (e.g., `ship_to_goldfinch`) or track GoFood shipping separately.
**Warning signs:** `shippedToGoldfinch` field is zero or missing after consolidation.

### Pitfall 4: Race Conditions During Dual-Write Removal
**What goes wrong:** Removing writes before reads are fully migrated causes the kitchen to show stale or zero data.
**Why it happens:** The transition from `productionCounts` reads to `productionLog` aggregation is done in steps, and if writes are removed too early, the old queries return stale data.
**How to avoid:** Migration order: (1) build new aggregation queries, (2) switch frontend to use new queries, (3) verify in production, (4) THEN remove writes. Per user decision, there's no transition period -- but the "switch" must be atomic within a single deployment.
**Warning signs:** Kitchen showing 0 for boxed/stickered/packed after deployment.

### Pitfall 5: K3Mart and GoFood Depot Modules Still Reading productionCounts
**What goes wrong:** Kitchen UI is migrated but K3Mart cockpit and GoFood depot queries still read from `productionCounts`, causing inconsistent data.
**Why it happens:** Forgetting that `productionCounts` is read by `k3martCockpit/queries.ts` and `orders/kitchenQueries.ts`, not just `productionCounts/queries.ts`.
**How to avoid:** Comprehensive search for ALL `productionCounts` references before migration.
**Warning signs:** K3Mart inventory overview showing different numbers than kitchen view.

### Pitfall 6: Dependency Upgrades Breaking Build
**What goes wrong:** Upgrading a package that has a breaking change causes build failure.
**Why it happens:** Major version bumps or peer dependency conflicts.
**How to avoid:** Upgrade one package at a time. Run `npm run build` after each upgrade. Revert if it fails.
**Warning signs:** TypeScript errors after `npm install`.

## Code Examples

### Backup Monitoring Schema Addition

```typescript
// In convex/schema.ts -- add backupLogs table
backupLogs: defineTable({
  timestamp: v.number(),         // When this log was created
  type: v.union(
    v.literal("check"),          // Weekly cron check
    v.literal("manual")          // Admin manually logged
  ),
  status: v.union(
    v.literal("ok"),             // Backup appears current
    v.literal("warning"),        // Backup may be stale
    v.literal("failure")         // Backup confirmed failed/missing
  ),
  message: v.string(),          // Human-readable description
  acknowledgedAt: v.optional(v.number()),   // When admin clicked dismiss
  acknowledgedBy: v.optional(v.string()),   // Who dismissed
})
  .index("by_timestamp", ["timestamp"]),
```

### Production Log Aggregation Query

```typescript
// convex/productionLog/queries.ts -- new aggregation query
export const getAggregatedCounts = query({
  args: {},
  handler: async (ctx) => {
    const menuProducts = await ctx.db
      .query("menuProducts")
      .withIndex("by_active", (q) => q.eq("isActive", true))
      .collect();

    // Get reset timestamps per menu product
    const resets = await ctx.db.query("productionResets").collect();
    const resetMap = new Map(resets.map(r => [r.menuProductId as string, r.lastResetAt]));

    const results = await Promise.all(
      menuProducts.map(async (mp) => {
        const resetAt = resetMap.get(mp._id as unknown as string) ?? 0;

        // Get all log entries for this product since last reset
        const logs = await ctx.db
          .query("productionLog")
          .withIndex("by_menu_product", (q) => q.eq("menuProductId", mp._id))
          .filter((q) => q.gt(q.field("timestamp"), resetAt))
          .collect();

        // Aggregate by action
        let boxed = 0, stickered = 0, packed = 0;
        for (const log of logs) {
          switch (log.action) {
            case "box": boxed += log.quantity; break;
            case "unbox": boxed -= log.quantity; break;
            case "sticker": stickered += log.quantity; break;
            case "unsticker": stickered -= log.quantity; break;
            case "pack": packed += log.quantity; break;
            case "unpack": packed -= log.quantity; break;
          }
        }

        return {
          menuProductId: mp._id,
          menuProductName: mp.name,
          menuProductCode: mp.code,
          posSlot: mp.posSlot,
          productType: mp.productType,
          boxed,
          stickered,
          packed,
          availableForStickering: boxed - stickered,
          availableForPacking: stickered - packed,
          lastResetAt: resetAt > 0 ? resetAt : undefined,
          lastResetBy: resets.find(r => (r.menuProductId as unknown as string) === (mp._id as unknown as string))?.lastResetBy,
        };
      })
    );

    return results;
  },
});
```

### Weekly Integrity Check

```typescript
// convex/integrityChecks/mutations.ts
export const runWeeklyCheck = internalMutation({
  args: {},
  handler: async (ctx) => {
    // Compare productionLog aggregation against productionCounts
    const countsRecords = await ctx.db.query("productionCounts").collect();
    const mismatches: Array<{ menuProductId: string; field: string; expected: number; actual: number }> = [];

    for (const counts of countsRecords) {
      // Aggregate from productionLog for this product
      const logs = await ctx.db
        .query("productionLog")
        .withIndex("by_menu_product", (q) => q.eq("menuProductId", counts.menuProductId))
        .collect();

      let logBoxed = 0, logStickered = 0, logPacked = 0;
      for (const log of logs) {
        switch (log.action) {
          case "box": logBoxed += log.quantity; break;
          case "unbox": logBoxed -= log.quantity; break;
          case "sticker": logStickered += log.quantity; break;
          case "unsticker": logStickered -= log.quantity; break;
          case "pack": logPacked += log.quantity; break;
          case "unpack": logPacked -= log.quantity; break;
        }
      }

      if (logBoxed !== counts.boxed) mismatches.push({ menuProductId: counts.menuProductId as string, field: "boxed", expected: logBoxed, actual: counts.boxed });
      if (logStickered !== counts.stickered) mismatches.push({ menuProductId: counts.menuProductId as string, field: "stickered", expected: logStickered, actual: counts.stickered });
      if (logPacked !== counts.packed) mismatches.push({ menuProductId: counts.menuProductId as string, field: "packed", expected: logPacked, actual: counts.packed });
    }

    // Log result
    await ctx.db.insert("integrityCheckLogs", {
      timestamp: Date.now(),
      type: "production_counts",
      mismatchCount: mismatches.length,
      mismatches: mismatches.length > 0 ? JSON.stringify(mismatches) : undefined,
      status: mismatches.length === 0 ? "pass" : "fail",
    });
  },
});
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Convex CLI-only export | Dashboard-based backup with scheduling (Pro) | 2024 | Backups are now a Dashboard feature, not code-triggered |
| `productionCounts` as running tally | `productionLog` as audit trail + derived aggregation | This phase | Single source of truth, better auditability |

**Deprecated/outdated:**
- `productionCounts` table: Will become read-only archive after this phase. All reads switch to `productionLog` aggregation.
- `productionCounts/mutations.ts` `resetCounts`: Will be replaced by inserting a reset record into `productionResets` table.

## Open Questions

1. **Convex Pro plan availability**
   - What we know: Automatic backup scheduling requires Convex Pro plan. The project uses `prod:decisive-wombat-7`.
   - What's unclear: Whether the project is on Pro plan or free tier.
   - Recommendation: Check Convex Dashboard for plan status. If not on Pro, the "weekly backup" becomes manual backup reminders via cron notification, not actual automated backups.

2. **productionLog volume and query performance**
   - What we know: Kitchen runs all day. Each box/sticker/pack action creates a log entry. With ~10 products, ~50 boxes/day each = ~500 log entries/day. After 2 months without reset = ~30,000 entries per product.
   - What's unclear: Whether aggregating 30,000 entries per product per query stays within the ~500ms budget.
   - Recommendation: Add a per-product index (`by_menu_product`) already exists. If performance degrades, fall back to a materialized view updated by a scheduled function (per phase risk note).

3. **shippedToGoldfinch tracking after consolidation**
   - What we know: This field exists only on `productionCounts`, not in `productionLog`. GoFood shipments write it directly.
   - What's unclear: Whether to add `ship_to_goldfinch`/`return_from_goldfinch` as new `productionLog` action types, or track separately.
   - Recommendation: Add new action types to `productionLog` union type: `ship_goldfinch`, `return_goldfinch`. This keeps everything in one log.

4. **Reset semantics with log-derived counts**
   - What we know: Managers currently reset counts to zero via `productionCounts/mutations.ts`. With log-based approach, you need a `productionResets` table or negating log entries.
   - What's unclear: Whether managers expect reset history to be visible (e.g., "last reset: Feb 14 by Admin").
   - Recommendation: Use `productionResets` table with `lastResetAt` + `lastResetBy`. The aggregation query filters logs by this timestamp.

5. **GoFood `returnFromGoldfinch` also writes productionCounts.stickered**
   - What we know: `gofoodDepot/mutations.ts` has a mutation that increments `productionCounts.stickered` when products are returned from Goldfinch depot. This also lacks a `productionLog` entry.
   - What's unclear: Whether the "sticker" action in `productionLog` should cover this or if a distinct action type is needed.
   - Recommendation: Add `return_goldfinch_sticker` as a new action type to distinguish depot returns from kitchen stickering.

## Complete File Impact Analysis

### Files to CREATE:
| File | Purpose |
|------|---------|
| `convex/backups/mutations.ts` | Backup monitoring mutations (logStatus, dismiss, check) |
| `convex/backups/queries.ts` | Backup status queries (hasUnacknowledgedFailure, history) |
| `convex/integrityChecks/mutations.ts` | Weekly integrity check logic |
| `convex/integrityChecks/queries.ts` | Integrity check log queries |
| `src/components/layout/BackupAlertBanner.tsx` | Admin notification banner |
| `docs/DEPENDENCY_AUDIT.md` | Dependency audit results document |

### Files to MODIFY:
| File | Change |
|------|--------|
| `convex/schema.ts` | Add `backupLogs`, `integrityCheckLogs`, `productionResets` tables |
| `convex/crons.ts` | Add weekly backup check + weekly integrity check crons |
| `convex/productionLog/queries.ts` | Add `getAggregatedCounts`, `getCountsByMenuProduct` aggregation queries |
| `convex/orders/mutations/kitchen.ts` | Remove `productionCounts` writes (boxProducts, stickerProducts, togglePackOrderLineItem) |
| `convex/gofoodDepot/mutations.ts` | Remove `productionCounts` writes, add `productionLog` entries for shipments |
| `convex/k3martCockpit/mutations.ts` | Remove `productionCounts` writes, add `productionLog` entries |
| `convex/k3martCockpit/queries.ts` | Switch from `productionCounts` reads to `productionLog` aggregation |
| `convex/orders/kitchenQueries.ts` | Switch from `productionCounts` reads to `productionLog` aggregation |
| `convex/productionCounts/mutations.ts` | Replace `resetCounts` with `productionResets` insert |
| `src/hooks/convex/useKitchenProduction.ts` | Switch from `productionCounts.queries.getAll` to `productionLog.queries.getAggregatedCounts` |
| `src/components/layout/Layout.tsx` | Add BackupAlertBanner for admin users |
| `docs/CHANGELOG.md` | Phase completion entry |

### Files to KEEP (read-only archive):
| File | Status |
|------|--------|
| `convex/productionCounts/queries.ts` | Keep but deprecate (no longer called from frontend) |

## Sources

### Primary (HIGH confidence)
- Convex official docs: [Backup & Restore](https://docs.convex.dev/database/backup-restore) -- confirmed no programmatic backup API
- Convex official docs: [Cron Jobs](https://docs.convex.dev/scheduling/cron-jobs) -- cron syntax and patterns
- Convex official docs: [Scheduled Functions](https://docs.convex.dev/scheduling/scheduled-functions) -- ctx.scheduler API
- Convex official docs: [Data Export](https://docs.convex.dev/database/import-export/export) -- CLI-only export
- Context7 `/llmstxt/convex_dev_llms_txt` -- cron job patterns, action patterns, scheduler usage

### Secondary (MEDIUM confidence)
- Codebase analysis of `convex/crons.ts` -- existing cron patterns in project
- Codebase analysis of `productionCounts` / `productionLog` tables and all references -- full dependency map

### Tertiary (LOW confidence)
- Performance estimate for productionLog aggregation (~500ms budget) -- based on rough calculation of log volume, not benchmarked

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH -- no new dependencies, all existing Convex patterns
- Architecture (backup): MEDIUM -- user decision says "scheduled function cron" but Convex doesn't support programmatic exports; adapted to monitoring approach
- Architecture (production consolidation): MEDIUM -- aggregation query design is sound but performance is unverified
- Pitfalls: HIGH -- thorough codebase analysis identified all touch points

**Research date:** 2026-02-14
**Valid until:** 2026-03-14 (stable -- Convex API unlikely to change significantly)
