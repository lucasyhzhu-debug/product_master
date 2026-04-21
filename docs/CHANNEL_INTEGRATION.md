# Channel Integration — Onboarding, Cutover, Audit, Backfill, Rollback

**Purpose:** Single source of truth for operating the unified channel integration architecture (Phase 74.5.1 spine + 74.5.2 cutover). Covers onboarding a new channel, running the 74.5.2 cutover, triaging audit issues, operating backfills, and rolling back.

**Audience:** Admin operators, engineers diagnosing sync issues, future planners onboarding a new platform.

**Related reading:**
- `.planning/phases/74.5-unified-channel-integration/74.5-RESEARCH.md` — full architectural research (1098 LOC)
- `.planning/phases/74.5.1-channel-routing-spine/74.5.1-VERIFICATION.md` — 74.5.1 ship manifest (flags, routing, audit)
- `.planning/phases/74.5.2-unified-deduct-cutover/74.5.2-CONTEXT.md` — 74.5.2 locked decisions (D74.5.2-L1..L15)

---

## Table of Contents

1. [Architecture overview](#architecture-overview)
2. [Onboarding a new channel](#onboarding-a-new-channel)
3. [74.5.2 cutover runbook](#7452-cutover-runbook)
4. [Audit issue triage](#audit-issue-triage)
5. [Backfill operations](#backfill-operations)
6. [Rollback procedures](#rollback-procedures)
7. [Known gaps and follow-ups](#known-gaps-and-follow-ups)
8. [Troubleshooting FAQ](#troubleshooting-faq)

---

## Architecture overview

Phase 74.5.1 shipped the **unified channel integration spine**: a single `processChannelSaleInternal` deduction core writing `transactionType: "channel_sale"` + a per-source `source` literal, dispatched by a flag-gated `saveRevenueItems` hook, with 5-tier `channelRouting` precedence and an audit workbench. Phase 74.5.2 executes the staged cutover — backfilling historical sales, flipping per-source `channelDeductionEnabled` flags, migrating the last legacy `gofood_sale` transaction literal, and retiring the one remaining bypass path (`processGofoodSales`).

**Key tables:**

- `productInventorySettings.channelDeductionEnabled` — 8 boolean flags. Keys use source literals per `convex/lib/externalSource.ts` (gobiz, not gofood — language mirrors `schema.ts:1049` verbatim): `bigseller`, `consignment`, `gobiz`, `grabfood`, `internal`, `k3mart`, `shopee`, `tiktok`. All default `false` (missing → false at read time).
- `channelRouting` — `(source, outletId?, menuProductId?) → storageLocationId` mapping resolved via 5-tier precedence (most specific first, `isDefault` fallback last, throws on miss).
- `channelAuditIssues` — detected issues surface in `/admin/channel-audit` workbench.
- `externalRevenueItems.inventoryDeductedAt` — set-once idempotency marker for backfill (`undefined` means "not deducted yet").
- `productInventoryTransactions.transactionType = "channel_sale"` + `source` — unified ledger literal. Legacy `"gofood_sale"` literal still exists on historical rows; migration rewrites them forward to `"channel_sale" + source: "gobiz"`.

**Key constants:**

- **GoFood surface = `source: "gobiz"`** in the `externalSource` union at `convex/lib/externalSource.ts`. The union contains `"gobiz"` but NOT `"gofood"` — `"gobiz"` is the integration literal; GoFood is a surface name. Writing `"gofood"` in a literal position fails type-check. (Pitfall 1.)
- **`"GoFood"` is a display label** — `sourceToPlatform("gobiz") === "GoFood"`; admin UI labels map `value: "gobiz"` → label `"GoFood"`.

**Key interfaces:**

- `ChannelAdapter<TRawPayload>` at `convex/integrations/_shared/channelAdapter.ts`:
  - `readonly source: ExternalSource` — the one literal this adapter owns.
  - `readonly fetch?: (args) => Promise<TRawPayload>` — optional HTTP/DB retrieval in a Convex action.
  - `readonly normalize: (payload) => ChannelSaleEvent[] | Promise<ChannelSaleEvent[]>` — pure side-effect-free transform.

- `resolveChannelRoute(ctx, {source, outletId?, menuProductId?})` at `convex/productInventory/channelRouting.ts` — 5-tier precedence:
  1. `source + outletId + menuProductId` (most specific)
  2. `source + outletId` (no product)
  3. `source + menuProductId` (no outlet)
  4. `source` + `isDefault: true` (outlet + product both unset)
  5. Throws `CHANNEL_ROUTING_NOT_CONFIGURED: ...` — no silent fallback.

---

## Onboarding a new channel

Steps to add a new platform (example: hypothetical `newchannel`):

1. **Add to `externalSource` union**
   - File: `convex/lib/externalSource.ts`
   - Append `"newchannel"` to the `EXTERNAL_SOURCES` array AND the matching `v.union(...)` validator in `convex/schema.ts` (externalSource validator, around line 18).
   - Add a `sourceToPlatform("newchannel") => "New Channel"` branch (display label).
   - Run `npm run type-check` — every switch/union narrowing in the codebase flags missing branches.

2. **Implement `ChannelAdapter`**
   - Place under `convex/integrations/newchannel/adapter.ts`.
   - Implement the interface at `convex/integrations/_shared/channelAdapter.ts`:
     ```typescript
     export const newchannelAdapter: ChannelAdapter<NewChannelPayload> = {
       source: "newchannel",
       fetch: async (args) => { /* "use node" HTTP call if needed */ },
       normalize: (payload) => { /* pure transform → ChannelSaleEvent[] */ },
     };
     ```
   - `normalize()` must be pure — no `ctx.db` reads/writes. Testable in isolation with fixture payloads.

3. **Add `channelDeductionEnabled` flag key**
   - File: `convex/schema.ts` around line 1057.
   - Append `newchannel: v.boolean()` to the `channelDeductionEnabled` map.
   - Deploy schema. Admin UI `/admin/product-inventory-settings` auto-renders the new toggle.

4. **Wire saveRevenueItems dispatch**
   - File: `convex/externalData/mutations.ts` (around `saveRevenueItemsImpl`).
   - No code change needed if the adapter feeds `saveRevenueItems` with `source: "newchannel"` — the flag-gated dispatch is source-agnostic.

5. **Seed routing rules**
   - Before flipping the flag, create at least one routing rule via `/admin/channel-routing`:
     - Minimum: one `isDefault: true` row for `source: "newchannel"` pointing at a storage location. This satisfies Tier 4 of `resolveChannelRoute` — without it, every sale throws `CHANNEL_ROUTING_NOT_CONFIGURED`.
   - For outlet-specific routing, add Tier 1/2 rows as needed.

6. **Add taxonomy entry**
   - If `src/lib/platformColors.ts` has a color map, add a color + label for the new channel.

7. **Add to admin-backfill UI**
   - File: `src/pages/UnlinkedProductsBackfill.tsx` → the Channel Deduction Backfill section's card array.
   - Add a new `ChannelBackfillCard` for `source: "newchannel"`.

8. **Write integration tests**
   - Pattern: `convex/integrations/newchannel/__tests__/normalize.test.ts` — mirror the BigSeller test shape.
   - Platform literal typing: use `Extract<ExternalSource, "newchannel">` in fixture types, not a loose `string`.

9. **Flip flag**
   - Visit `/admin/product-inventory-settings` → toggle `channelDeductionEnabled.newchannel` ON.
   - Soak 24–48h.
   - Verify via parity query (see [cutover runbook verify parity](#verify-parity-sc4-query)).

---

## 74.5.2 cutover runbook

### Cutover order (D-12)

1. **Shopee**
2. **TikTok** (merged with Tokopedia in ID — source key is `tiktok`)
3. **BigSeller** (aggregate-only; UI toggle disabled per Pitfall 3. Placeholder in ordering.)
4. **K3Mart** (sync + consignment flip together — D74.5.2-L14)
5. **GoFood** — atomic flip-and-retire (D74.5.2-L5)

**GrabFood: skipped in 74.5.2** — `orders:read` OAuth scope not granted. Infrastructure works but returns 401. Backfill button renders a permanent "Awaiting OAuth scope" state. Flip when scope arrives.

### Per-channel procedure (non-GoFood — Shopee through K3Mart)

For each channel, in order. Do NOT parallelize — one channel at a time, 24–48h soak between.

1. **Backfill** (before flip — D74.5.2-L4):
   - Visit `/admin/unlinked-products-backfill`.
   - Scroll to the **Channel Deduction Backfill** section.
   - Locate the card for `{channel}`.
   - Confirm the preflight shows pending items. Yellow warning means blocking audit issues exist — informational only (D-17), button stays clickable.
   - Click **Backfill {channel}**.
   - Wait until progress card shows `deducted / skipped / iterations` stabilized and "Completed" state.

2. **Audit** (resolve blocking issues before flip — optional but strongly recommended):
   - Visit `/admin/channel-audit`.
   - Filter by source = `{channel}`, severity = `block`, resolvedAt = undefined.
   - Resolve each issue per the [Audit issue triage](#audit-issue-triage) table.

3. **Flip flag**:
   - Visit `/admin/product-inventory-settings`.
   - Toggle `channelDeductionEnabled.{source}` ON (e.g., `shopee`, `tiktok`, `k3mart`).
   - Confirm toast "Flag updated".

4. **Soak 24–48h**:
   - Monitor daily row count via Convex dashboard:
     ```typescript
     // Count today's channel_sale rows for {source}
     const startWib = /* WIB midnight epoch ms */;
     const rows = await db.query("productInventoryTransactions")
       .filter(q => q.and(
         q.eq(q.field("source"), "{source}"),
         q.eq(q.field("transactionType"), "channel_sale"),
         q.gte(q.field("createdAt"), startWib),
       ))
       .collect();
     rows.length;
     ```
   - Compare to physical stock decline — digital Δ should approximate physical Δ for the storage location resolved by `channelRouting`.

5. **Verify parity (SC4 query)**:
   ```typescript
   // Row-for-row parity: sum of deducted revenue item quantities should equal
   // negative sum of channel_sale ledger quantities for the source.
   const revenue = await db.query("externalRevenueItems")
     .withIndex("by_source", q => q.eq("source", "{source}"))
     .collect();
   const revenueQtySum = revenue
     .filter(r => r.inventoryDeductedAt !== undefined)
     .reduce((s, r) => s + r.quantity, 0);

   const ledger = await db.query("productInventoryTransactions")
     .filter(q => q.and(
       q.eq(q.field("transactionType"), "channel_sale"),
       q.eq(q.field("source"), "{source}"),
     ))
     .collect();
   const ledgerQtySum = ledger.reduce((s, t) => s + t.quantity, 0);

   // Assert: ledgerQtySum === -revenueQtySum (deductions are negative; items are positive)
   console.log({ revenueQtySum, ledgerQtySum, expectedZero: revenueQtySum + ledgerQtySum });
   ```

6. **Sampling spot-check (pre-flip verification; 10 random rows):**
   ```typescript
   // Sample 10 rows with linkedMenuProductId set; verify every one has
   // inventoryDeductedAt populated and a matching productInventoryTransactions row
   // whose createdAt === revenue.transactionDate (NOT Date.now()).
   const sample = await db.query("externalRevenueItems")
     .withIndex("by_source", q => q.eq("source", "{source}"))
     .take(100);
   const withMap = sample.filter(r => r.linkedMenuProductId).slice(0, 10);
   for (const r of withMap) {
     const externalRef = `${r.externalTransactionId ?? ""}${r.externalItemId ?? ""}`;
     const tx = await db.query("productInventoryTransactions")
       .withIndex("by_source_externalRef", q =>
         q.eq("source", "{source}").eq("externalRef", externalRef))
       .first();
     console.assert(r.inventoryDeductedAt !== undefined, "item not deducted");
     console.assert(tx?.createdAt === r.transactionDate, "tx createdAt drift");
     console.assert(tx?.quantity === -r.quantity, "qty sign mismatch");
   }
   ```

### K3Mart bundle flip (D74.5.2-L14)

K3Mart has TWO flag keys that MUST flip together: `channelDeductionEnabled.k3mart` (sync path) and `channelDeductionEnabled.consignment` (settlement path). Per parent D-12, "K3Mart sync + consignment move together".

**How to flip:** `/admin/product-inventory-settings` — the K3Mart card surfaces both toggles prominently. Admin ergonomically flips both in one session. Separate keys are retained so that if ONE path misbehaves post-flip, the admin can rollback only the offending path (fine-grained rollback).

### GoFood atomic cutover (D74.5.2-L5 + Pitfall 2)

GoFood is the one channel where flip and legacy-path-retirement ship in the **same deployment**. Running both paths concurrently would double-deduct; running neither would under-deduct. The sequence below minimizes both risks.

**Prereqs:**
- Plans 02–07 merged (backfill infra, migration action, admin UI, consignment breakdown).
- Plan 08 feature branch merged to main (retires `processGofoodSales` + both gobiz adapter call sites).
- Admin has `/admin/product-inventory-settings` OPEN in a browser tab BEFORE deploy kicks off — you will flip the flag seconds after deploy-complete.

**Sequence (single admin working session):**

1. **Run Plan 04 migration** (rewrites historical `transactionType: "gofood_sale"` → `"channel_sale" + source: "gobiz"`):
   - Trigger `runGofoodSaleToChannelSaleMigration` via admin mutation (Convex dashboard → Functions tab → `migrations/gofoodSaleToChannelSale:runGofoodSaleToChannelSaleMigration`, pass your admin token).
   - The action paginates 500 rows per chunk via internal mutation. Re-runnable — if it hits the Convex mutation time limit, re-click; by_type index narrows to un-migrated rows (self-heal).
   - Verify after completion:
     ```typescript
     // MUST return 0
     const residual = await db.query("productInventoryTransactions")
       .withIndex("by_type", q => q.eq("transactionType", "gofood_sale"))
       .collect();
     residual.length;
     ```

2. **Run GoFood backfill** (catches any `externalRevenueItems` with `inventoryDeductedAt=undefined` for `source: "gobiz"`):
   - Visit `/admin/unlinked-products-backfill` → GoFood card (dispatches with `source: "gobiz"`) → click **Backfill GoFood**.
   - Wait for completion.

3. **Deploy Plan 08 PR** (the `processGofoodSales` retirement + hybrid `TransactionLogPanel.tsx`):
   - Merge feature branch `feature/74.5.2-cutover` (or equivalent) to `main`.
   - CI runs: Convex deploy → Vercel rebuild.
   - **DO NOT proceed until deploy-complete confirmation** (GitHub Actions green + Vercel build green).

4. **IMMEDIATELY flip `channelDeductionEnabled.gobiz` to ON**:
   - With `/admin/product-inventory-settings` already open, toggle the GoFood flag ON within seconds of CI green.
   - **Window analysis:** Between deploy-complete and flag-flip, the code path changes but the flag is still OFF, meaning GoFood sales produce ZERO deductions during that window (under-deduction). This window is acceptable because it is recoverable via re-running the GoFood backfill afterward — re-run picks up any items with `inventoryDeductedAt=undefined` from the window. In contrast, if Plan 08 had shipped with flag already ON, the legacy path and unified path could have overlapped for a moment, producing double-deductions (non-recoverable without manual row deletion).

5. **Re-run GoFood backfill** (covers the under-deduction window):
   - Visit `/admin/unlinked-products-backfill` → **Backfill GoFood** once more.
   - Idempotent; no-op if zero items remain.

6. **Soak 48h + verify** (same SC4 parity query as other channels, run against `source: "gobiz"`).

---

## Audit issue triage

Five issue types detected by `runFullAudit` at `convex/productInventory/channelAudit.ts`. The type set is an exported union (`AuditIssueType`):

| Issue type | Severity | Meaning | Resolution |
|-----------|----------|---------|------------|
| `unmapped_sku` | warn | Item's `linkedMenuProductId` is null — SKU has no mapping to a local menu product | Visit `/admin/unlinked-products` → map SKU → re-run backfill; the item will now deduct |
| `stale_mapping` | warn | `linkedMenuProductId` points at a deleted or `isActive: false` menu product | Either re-activate the product or re-map the SKU to a live product |
| `malformed_item` | block | Item has `quantity <= 0` or `totalPrice < 0` — adapter produced invalid data | Inspect via dashboard. Likely an adapter bug — file a task. Dismiss via workbench if one-off data glitch |
| `duplicate_transaction` | block | Same `(source, externalRef, menuProductId)` tuple appears more than once in `productInventoryTransactions` | Identify the paired rows via dashboard; delete one. Note: legitimate substitutions (Phase 78) write two rows with different `menuProductId` and are NOT flagged (see `findDuplicateTxQuery` dedup logic) |
| `orphan_item` | block | `externalRevenueItems` row exists but its parent `externalRevenue` row was deleted | Either restore the parent or delete the orphan items. Usually a data-integrity anomaly; low-volume |

**Resolving an issue:** In the workbench UI, each issue row has a "Resolve" action that sets `resolvedAt = Date.now()` on the `channelAuditIssues` row. Resolved issues are excluded from the `listOpenIssuesBySource` helper consumed by the backfill per-source audit gate (D-17, informational).

**Dismiss vs fix:** "Resolve" can mean either "I fixed the root cause" or "I accept this as a known anomaly". The workbench does not distinguish — severity + timestamp is the audit trail.

**Block vs warn:**
- `block` severity indicates the row would corrupt state if left — duplicate transactions over-deduct, orphans leave dangling references, malformed items would throw at processChannelSaleInternal.
- `warn` severity is informational — unmapped SKUs simply skip deduction (no corruption), stale mappings could still deduct against a soft-deleted product.

---

## Backfill operations

**Page:** `/admin/unlinked-products-backfill` → "Channel Deduction Backfill" section.

**What backfill does:**
1. Queries `externalRevenueItems` WHERE `source = X AND inventoryDeductedAt IS NULL` via the compound `by_source_deductedAt` index (D74.5.2-L12 — added in Plan 02 to avoid O(N) post-scan filter).
2. Skips rows with `linkedMenuProductId = undefined` (unmapped SKUs — admin must map via `/admin/unlinked-products` first; item is silently dropped from this backfill page without patching `inventoryDeductedAt`, so subsequent backfill after mapping picks it up).
3. Calls `processChannelSaleInternal` with `occurredAt = revenue.transactionDate` — the resulting ledger row's `createdAt` equals the historical transaction date, NOT `Date.now()`.
4. Patches `inventoryDeductedAt = Date.now()` ONLY when the deduction succeeds (the server timestamp marks "we've deducted this item"; the transactionDate lives on the ledger row's `createdAt`).
5. Returns `{ iterations, deducted, skipped }` per page; UI loops the action until the server reports zero remaining.

**Idempotency guarantee (D-19):** `inventoryDeductedAt` is set-once. Re-clicking **Backfill** after completion is a no-op — the compound index returns zero matches once every item is deducted.

**Per-source audit gate (D-17, informational):** The UI card shows a yellow warning if blocking audit issues exist for the source. Button stays clickable. Admin decides whether to backfill before resolving audit. Rationale: admin may choose to backfill first (if the blocking issue is unrelated to the rows being backfilled) and resolve audit after.

**Flag-independence (D74.5.2-L13):** Backfill does NOT read `channelDeductionEnabled`. Admin can run backfill with flag OFF, then flip ON afterward. Intentional — backfill is a one-shot data-repair operation, separate from live-sync gating. This is what makes the D74.5.2-L4 "backfill-before-flip" sequence possible.

**Cancellation:** Navigating away during backfill aborts the client-side loop cleanly (mountedRef unmount guard). Partially-deducted batches commit in place on the server. Re-click **Backfill** to resume — the index query picks up from the next undeducted item.

**Progress card contents (D-18):**
- Iterations count (pages processed in this run)
- Deducted count (items successfully processed)
- Skipped count (items with null `linkedMenuProductId`)
- Status label (`idle`, `running`, `completed`, `error`)

**GrabFood permanent-OFF (D74.5.2-L15):** The GrabFood card renders a distinct "Awaiting OAuth scope" state rather than a disabled button. Scope is not granted; zero GrabFood revenue items exist in the DB today. The card will activate once scope arrives — no code change needed.

---

## Rollback procedures

No new tooling. All rollback uses existing mutations + admin UI. Prose-only per D74.5.2-L10 (building a UI rollback button is over-engineering).

### Case A: Channel post-flip is double-deducting

**Symptom:** `productInventoryTransactions` row count for source X grew faster than expected post-flip. Audit surfaces `duplicate_transaction` issues with post-flip timestamps.

**Cause:** Both legacy path AND new path running. Only possible for GoFood if atomicity was violated (e.g., `processGofoodSales` retirement deploy landed but flag flip never happened, then someone later re-introduced the legacy code without toggling the flag off).

**Steps:**
1. Flip `channelDeductionEnabled.{source}` OFF via `/admin/product-inventory-settings`.
2. Identify the duplicate window: first post-flip `createdAt` through current `Date.now()`.
3. Run `runFullAudit` via admin scheduler → surfaces `duplicate_transaction` issues for the window.
4. Resolve each duplicate by manually deleting one paired `productInventoryTransactions` row via Convex dashboard. Preserve the row with the most-recent `_creationTime` as the survivor (the new path is the source of truth).
5. Re-flip flag ON after confirming the legacy path is removed.

### Case B: Channel post-flip is under-deducting

**Symptom:** Recent `externalRevenueItems` rows have `inventoryDeductedAt = undefined` despite flag being ON.

**Cause:** Backfill hit errors partway (rare — idempotent reruns recover), OR the GoFood atomic-cutover deploy-to-flag window left rows under-deducted.

**Steps:**
1. Flag stays ON.
2. Re-run the per-source **Backfill** button (idempotent — picks up where it left off via the `by_source_deductedAt` compound index).
3. Verify zero items remain:
   ```typescript
   const undeducted = await db.query("externalRevenueItems")
     .withIndex("by_source_deductedAt", q =>
       q.eq("source", "{source}").eq("inventoryDeductedAt", undefined))
     .collect();
   const mapped = undeducted.filter(r => r.linkedMenuProductId);
   console.log({ undeductedMapped: mapped.length });  // expect 0
   ```

### Case C: Wrong storage location resolved

**Symptom:** `productInventoryTransactions.locationId` is unexpected — stock decrementing at the wrong depot.

**Cause:** `channelRouting` rule misconfigured (routing precedence rule at tier 1–4 picked wrong location).

**Steps:**
1. Fix the rule via `/admin/channel-routing` (edit, or delete + recreate with correct storage location).
2. Identify affected rows:
   ```typescript
   const affected = await db.query("productInventoryTransactions")
     .filter(q => q.and(
       q.eq(q.field("source"), "{source}"),
       q.eq(q.field("transactionType"), "channel_sale"),
       q.eq(q.field("locationId"), wrongLocationId),
       q.gte(q.field("createdAt"), ruleCreationTime),
     ))
     .collect();
   ```
3. Manually re-post corrected ledger entries (no batch tool; low expected volume if admin catches in soak).

### Case D: Total rollback (unrecoverable)

**Symptom:** Pre-GoFood-atomic-flip catastrophe — inconsistent ledger state, cannot safely continue.

**Steps:**
1. Flip ALL flags OFF via `/admin/product-inventory-settings`.
2. Document the gap window timestamps (when did the problem start, current time).
3. File a follow-up plan to re-run all historical deductions against cleaned `externalRevenueItems`.
4. **For GoFood specifically:** `processGofoodSales` is deleted (retired in Plan 08 commit `c64c6d97`). Rollback requires a git revert of the retirement commit:
   ```bash
   git revert -m 1 <merge-sha-of-plan-08-into-main>
   ```
   The merge SHA is recorded on `main` once Plan 08 merges. After revert, a code deploy re-introduces the legacy handler; the gobiz adapter Phase C/D try/catch blocks return, and GoFood flag stays OFF until a future plan re-retires.

---

## Known gaps and follow-ups

These are known incomplete items post-74.5.2. None of them block the 74.5.2 cutover; they are tracked for future phases.

### Sticker auto-deduction (post-retirement gap)

**What:** Phase C of the legacy gobiz adapter sync path (`gofoodDepot.mutations.processSyncSales`) deducted stickers as a side effect of GoFood sales. Plan 08 retired Phase C alongside Phase D (the `processGofoodSales` call), so GoFood sales post-cutover no longer auto-deduct stickers.

**Why:** The unified `processChannelSaleInternal` path deducts the product-level finished-good inventory (a ball) but does not yet BOM-resolve packaging components (small-box, sticker, etc.). Extending the unified path to BOM-resolve packaging is a separate scope.

**Impact post-cutover:** Admin must manually track sticker consumption via the packaging inventory tab OR via a one-shot admin action until a follow-up phase extends the unified path. Sticker counts will drift from reality otherwise.

**Operational fallback (mandatory daily task until 74.5.3 ships):**
1. Once daily (end of day WIB), check the day's GoFood sale count:
   - Query via Convex dashboard: `externalRevenueItems` filtered by `source="gobiz"` and `transactionDate` ≥ today 00:00 WIB.
   - Sum `quantity` across the returned rows (one sticker per sale item).
2. At `/admin/inventory` (packaging tab), select `Sticker` (or the active sticker SKU) and record a manual adjustment:
   - **Adjustment type:** `consumption`
   - **Quantity:** `-<sum from step 1>`
   - **Reason:** `sticker auto-deduct bridge — 74.5.2 cutover (YYYY-MM-DD)`
   - **Location:** `Office` (sticker fulfillment location).
3. Log the adjustment in the phase retrospective if counts drift from physical reality (leftover or shortage) — these data points inform the 74.5.3 BOM resolution logic.
4. Continue daily until the 74.5.3 (or standalone packaging-BOM phase) ships.

**Follow-up candidates:** Phase 74.5.3 (if scoped for packaging deduction) or a standalone phase titled e.g. "Channel-sale packaging auto-deduction". Not yet scheduled.

**Why not fixed in 74.5.2:** Scope discipline. The 74.5.2 charter is cutover + retire, not feature extension. Adding packaging BOM resolution to `processChannelSaleInternal` would require per-source packaging component mapping (each channel may use different packaging SKUs), a non-trivial design that deserves its own research pass.

### `channelDeductionEnabled` flag field drop (deferred)

**What:** Per D74.5.2-L8, the `channelDeductionEnabled` field stays in schema through 74.5.2. The field is removed in a follow-up (74.5.3 or later) AFTER 72h GoFood soak confirms the unified path is stable.

**Why:** Convex strip-before-drop rule — cannot remove a field while code still reads it. Code continues to read the flag until the cutover is complete across all channels; only then can the field be dropped.

### `gofood_sale` schema literal drop (deferred)

**What:** Per D74.5.2-L6, the `gofood_sale` literal stays in the `productInventoryTransactions.transactionType` union through 74.5.2. Plan 04's migration forward-rewrites historical rows to `channel_sale + source: "gobiz"`; the literal removal happens in a follow-up phase AFTER 72h soak.

**Why:** Strip-before-drop ordering. `TransactionLogPanel.tsx` still renders legacy rows during soak via the hybrid display (Plan 08 Task 4). Once the `by_type` index returns 0 rows for `"gofood_sale"`, the literal can be dropped in a decimal follow-up.

### Build errors in `convex/migrations/gofoodSaleToChannelSale.ts`

**What:** `tsc -b` strict composite-project mode reports two errors (`TS6133` unused `args`, `TS7022` implicit-any on `result`). `npm run type-check` (non-composite) passes. Plan 06 filed this to `.planning/phases/74.5.2-unified-deduct-cutover/deferred-items.md`.

**Follow-up:** Plan 10 (polish-and-docs) owns the permanent fix — rename `args` to `_args` and add explicit type annotation to the `result` binding. Not a cutover blocker.

### 74.5.1 HUMAN-UAT items

**What:** 5 pending human-smoke items from 74.5.1 (CRUD on routing, 8-flag UI, audit workbench, seed migration, ship-dark confirmation).

**Resolution:** These resolve as a side-effect of driving the 74.5.2 cutover through the admin UI (D74.5.2-L11). Document resolution via `/gsd-verify-work 74.5.1` after 74.5.2 flips complete.

---

## Troubleshooting FAQ

**Q: Backfill button shows 0 pending items but I know there are unmapped SKUs.**
A: Backfill filters `linkedMenuProductId != undefined` — unmapped items are invisible to backfill. They appear in audit as `unmapped_sku` issues instead. Map via `/admin/unlinked-products` first, then re-run backfill.

**Q: Flag flip immediately spikes `channelAuditIssues` count.**
A: Expected. Inline detection runs on every new sale via `saveRevenueItems` (cheap inline checks `unmapped_sku` + `malformed_item` per D74.5.1-L4 two-tier split). Resolve via audit workbench as issues surface. Expensive checks (`stale_mapping`, `duplicate_transaction`, `orphan_item`) only run on admin-triggered `runFullAudit`.

**Q: GoFood code / data / UI references `source: "gobiz"` — is that right?**
A: Yes. `"gobiz"` is the `externalSource` union literal; `"GoFood"` is the display label returned by `sourceToPlatform("gobiz")`. Writing `"gofood"` in any literal position (schema, filter, mutation arg) fails type-check — the union does not contain `"gofood"`. Admin UI's CHANNEL_SOURCES array maps `value: "gobiz"` to label `"GoFood"`. Same pattern for Tokopedia: source key is `"tiktok"` (post-2023 merge).

**Q: Migration action errored with "Mutation time limit exceeded".**
A: Chunk size exceeded 2s mutation limit. File: `convex/migrations/gofoodSaleToChannelSale.ts`. Default `PAGE_SIZE = 500`. If your environment has slower mutations, lower to 250 or 100 and re-run. The `by_type` index narrows to un-migrated rows (self-healing — re-run picks up where prior run stopped).

**Q: Consignment settlement shows empty per-product breakdown.**
A: Expected for pre-74.5.1 settlements — no items were emitted before the `saveRevenueItems` refactor landed. New settlements created via Plan 07's extended form WILL populate item rows. The UI renders an explicit empty-state for legacy settlements ("No per-product breakdown — settlement predates 74.5.1").

**Q: `channelRouting` lookup throws `CHANNEL_ROUTING_NOT_CONFIGURED`.**
A: No Tier 1–4 rule matched for the `(source, outletId, menuProductId)` tuple. Fix via `/admin/channel-routing` — at minimum, ensure one `isDefault: true` row exists for the source (Tier 4 fallback). No silent fallback by design per SPEC §R2.

**Q: Can I backfill a channel with the flag OFF?**
A: Yes. Backfill ignores the `channelDeductionEnabled` flag (D74.5.2-L13). Backfill is a one-shot data-repair operation; the flag gates only the live `saveRevenueItems` dispatch path. This is what makes backfill-before-flip possible (D74.5.2-L4).

**Q: Does re-running backfill double-deduct?**
A: No. `inventoryDeductedAt` is set-once — patched only when the deduction succeeds. Re-running is a no-op once all items have `inventoryDeductedAt != undefined` (the compound index `by_source_deductedAt` returns zero matches).

**Q: What if deploy-complete lands but I can't flip the GoFood flag within seconds (e.g., dashboard won't load)?**
A: Acceptable. The window between deploy and flip produces under-deduction (recoverable), NOT double-deduction. Re-run the GoFood backfill after flipping to catch up the window. Per D74.5.2-L5 rationale: under-deduction is recoverable via backfill; double-deduction requires manual row deletion.

**Q: Where do I find the retirement merge SHA for a GoFood rollback?**
A: After Plan 08 merges to main, the merge commit SHA is the one produced by `git merge feature/74.5.2-cutover` (or equivalent). Look for the merge commit in `git log main --merges --oneline | grep 74.5.2` — the SHA pattern matches `chore: merge executor worktree (74.5.2-08 ...)`.

---

*Last updated: 2026-04-21 — Phase 74.5.2 Plan 09*
*Related: `.planning/phases/74.5-unified-channel-integration/74.5-RESEARCH.md` (architectural), `.planning/phases/74.5.1-channel-routing-spine/74.5.1-VERIFICATION.md` (what 74.5.1 shipped), `.planning/phases/74.5.2-unified-deduct-cutover/deferred-items.md` (Plan 10 follow-ups)*
