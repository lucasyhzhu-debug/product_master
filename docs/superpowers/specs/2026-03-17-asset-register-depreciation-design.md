# Asset Register & Depreciation — Design Spec

**Date:** 2026-03-17
**Phase:** 60
**Status:** Approved

## 1. Overview

Build a fixed asset register with PSAK-compliant categories, flexible key-value characteristics, photo/document attachments, and auto-calculated monthly straight-line depreciation. Includes a "Catch Up to Now" batch JE generation flow with preview summary, per-asset JE creation, basic disposal workflow (sell/scrap with gain/loss JE), and a depreciation reminder on the Income Statement page.

### Out of Scope

- Asset revaluation (PSAK 16 fair value model)
- Impairment testing (PSAK 48)
- Intangible asset amortization (software licenses, patents)
- Asset transfers between locations with audit trail
- Acquisition journal entries (purchase was already recorded elsewhere)
- Cron-based automatic depreciation
- Budget vs actual depreciation comparison
- Bulk asset import via CSV (creating multiple assets)
- Asset barcode/QR code generation

## 2. Schema

### 2.1 New Table: `fixedAssets`

```typescript
fixedAssets: defineTable({
  assetNumber: v.string(),                    // FA-KIT-2603-001
  name: v.string(),                           // "KitchenAid Stand Mixer"
  category: v.string(),                       // "kitchen_equipment" (maps to ASSET_CATEGORIES)
  acquisitionDate: v.number(),                // timestamp (business date)
  acquisitionCost: v.number(),                // IDR, whole number
  usefulLifeMonths: v.number(),               // PSAK default, overridable (e.g., 96)
  salvageValue: v.number(),                   // PSAK default, overridable (e.g., 0)
  monthlyDepreciation: v.number(),            // pre-calculated: (cost - salvage) / usefulLifeMonths
  accumulatedDepreciation: v.number(),        // denormalized, updated on each JE post
  lastDepreciationMonth: v.optional(v.string()), // "2026-03" or undefined if never run
  status: v.union(
    v.literal("active"),
    v.literal("fully_depreciated"),
    v.literal("disposed")
  ),
  location: v.optional(v.string()),           // free text (e.g., "Goldfinch Kitchen")
  characteristics: v.array(v.object({         // flexible key-value metadata
    key: v.string(),
    value: v.string(),
  })),
  attachments: v.array(v.object({             // photos + documents
    storageId: v.id("_storage"),
    fileName: v.string(),
    fileType: v.string(),                     // MIME type
  })),
  depreciationAccountId: v.id("accounts"),    // contra-asset account (1610-1670)
  // Disposal fields (populated when status = "disposed")
  disposalDate: v.optional(v.number()),
  disposalType: v.optional(v.union(
    v.literal("sold"),
    v.literal("scrapped"),
    v.literal("written_off")
  )),
  saleProceeds: v.optional(v.number()),
  disposalJournalEntryId: v.optional(v.id("journalEntries")),
  createdBy: v.id("users"),
  createdAt: v.number(),
})
  .index("by_status", ["status"])
  .index("by_category", ["category"])
  .index("by_category_status", ["category", "status"])
  .index("by_asset_number", ["assetNumber"])
```

### 2.2 Schema Changes: `journalEntries`

Extend `sourceType` union:

```typescript
sourceType: v.union(
  v.literal("expense_approval"),
  v.literal("expense_void"),
  v.literal("reimbursement"),
  v.literal("reimbursement_void"),
  v.literal("payroll"),
  v.literal("payroll_void"),
  v.literal("depreciation"),        // NEW
  v.literal("depreciation_void"),   // NEW
  v.literal("manual")
),
```

### 2.3 GL Account Changes

**Remove:**
- `1600 Accumulated Depreciation` (replaced by per-category sub-accounts)

**Add to seedDefaults:**

| Code | Name | Type | Category |
|------|------|------|----------|
| 1610 | Accum Depr — Buildings | asset | Assets |
| 1620 | Accum Depr — Vehicles | asset | Assets |
| 1630 | Accum Depr — Office Equipment | asset | Assets |
| 1640 | Accum Depr — Kitchen Equipment | asset | Assets |
| 1650 | Accum Depr — Furniture & Fixtures | asset | Assets |
| 1660 | Accum Depr — Tools & Instruments | asset | Assets |
| 1670 | Accum Depr — Leasehold Improvements | asset | Assets |
| 6150 | Depreciation Expense | opex | Operating Expenses |
| 7300 | Gain on Asset Disposal | other | Other Income/Expense |
| 7400 | Loss on Asset Disposal | other | Other Income/Expense |

All are `isSystem: true`, `isActive: true`.

## 3. PSAK Category Constants

Single constant map in `convex/fixedAssets/categories.ts`:

```typescript
export const ASSET_CATEGORIES = {
  land: {
    label: "Tanah",
    prefix: "LND",
    usefulLifeMonths: null,   // not depreciable
    salvagePercent: 0,
    depreciable: false,
    contraAccountCode: null,
  },
  buildings: {
    label: "Bangunan",
    prefix: "BLD",
    usefulLifeMonths: 240,    // 20 years
    salvagePercent: 5,
    depreciable: true,
    contraAccountCode: "1610",
  },
  vehicles: {
    label: "Kendaraan",
    prefix: "VEH",
    usefulLifeMonths: 96,     // 8 years
    salvagePercent: 10,
    depreciable: true,
    contraAccountCode: "1620",
  },
  office_equipment: {
    label: "Peralatan Kantor",
    prefix: "OFF",
    usefulLifeMonths: 48,     // 4 years
    salvagePercent: 0,
    depreciable: true,
    contraAccountCode: "1630",
  },
  kitchen_equipment: {
    label: "Mesin & Peralatan Produksi",
    prefix: "KIT",
    usefulLifeMonths: 96,     // 8 years
    salvagePercent: 0,
    depreciable: true,
    contraAccountCode: "1640",
  },
  furniture: {
    label: "Mebelair & Perabot",
    prefix: "FUR",
    usefulLifeMonths: 48,     // 4 years
    salvagePercent: 0,
    depreciable: true,
    contraAccountCode: "1650",
  },
  tools: {
    label: "Peralatan & Perkakas",
    prefix: "TLS",
    usefulLifeMonths: 48,     // 4 years
    salvagePercent: 0,
    depreciable: true,
    contraAccountCode: "1660",
  },
  leasehold: {
    label: "Perbaikan Sewa",
    prefix: "LHI",
    usefulLifeMonths: 48,     // 4 years or lease term (whichever shorter)
    salvagePercent: 0,
    depreciable: true,
    contraAccountCode: "1670",
  },
} as const;

export type AssetCategory = keyof typeof ASSET_CATEGORIES;
```

**Defaults auto-populate on category selection:**
- `usefulLifeMonths` from category default
- `salvageValue` = `acquisitionCost * salvagePercent / 100`
- `monthlyDepreciation` = `(acquisitionCost - salvageValue) / usefulLifeMonths`
- `depreciationAccountId` resolved from `contraAccountCode` via `by_code` index

**Tooltips on form fields:**
- Useful life: "PSAK default for {categoryLabel}: {years} years ({months} months)"
- Salvage value: "PSAK default for {categoryLabel}: {percent}% of acquisition cost"

## 4. Depreciation Engine (Backend)

### 4.1 Architecture: Stateless Calculation

No batch tracking table. Each asset stores `lastDepreciationMonth`. The system computes what's missing at query time and posts JEs on demand.

### 4.2 Preview Query: `getDepreciationPreview`

```typescript
// convex/fixedAssets/queries.ts
export const getDepreciationPreview = protectedQuery({
  roles: ["admin"],
  args: {},
  handler: async (ctx) => {
    const currentMonth = getCurrentWibMonth(); // "2026-03"
    const activeAssets = await ctx.db
      .query("fixedAssets")
      .withIndex("by_status", (q) => q.eq("status", "active"))
      .collect();

    const preview = [];
    for (const asset of activeAssets) {
      const category = ASSET_CATEGORIES[asset.category];
      if (!category.depreciable) continue;

      const startMonth = toYearMonth(asset.acquisitionDate);
      const lastDone = asset.lastDepreciationMonth;
      const missingMonths = getMonthRange(
        lastDone ? nextMonth(lastDone) : startMonth,
        currentMonth
      );

      if (missingMonths.length === 0) continue;

      preview.push({
        assetId: asset._id,
        assetNumber: asset.assetNumber,
        name: asset.name,
        category: asset.category,
        missingMonths,
        amountPerMonth: asset.monthlyDepreciation,
        totalAmount: asset.monthlyDepreciation * missingMonths.length,
      });
    }

    return {
      currentMonth,
      assets: preview,
      totalEntries: preview.reduce((sum, a) => sum + a.missingMonths.length, 0),
      totalAmount: preview.reduce((sum, a) => sum + a.totalAmount, 0),
    };
  },
});
```

### 4.3 Run Mutation: `runDepreciation`

```typescript
// convex/fixedAssets/mutations.ts
export const runDepreciation = protectedMutation({
  roles: ["admin"],
  args: {},
  handler: async (ctx, _args, userId) => {
    const currentMonth = getCurrentWibMonth();
    const expenseAccount = await getAccountByCode(ctx, "6150");
    const activeAssets = await ctx.db
      .query("fixedAssets")
      .withIndex("by_status", (q) => q.eq("status", "active"))
      .collect();

    let assetsProcessed = 0;
    let monthsPosted = 0;
    let totalAmount = 0;

    for (const asset of activeAssets) {
      const category = ASSET_CATEGORIES[asset.category];
      if (!category.depreciable) continue;

      const startMonth = toYearMonth(asset.acquisitionDate);
      const lastDone = asset.lastDepreciationMonth;
      const missingMonths = getMonthRange(
        lastDone ? nextMonth(lastDone) : startMonth,
        currentMonth
      );

      if (missingMonths.length === 0) continue;

      for (const month of missingMonths) {
        const entryDate = lastDayOfMonth(month); // business date

        await createJournalEntryWithLines(ctx, {
          date: entryDate,
          description: `Depreciation ${formatMonth(month)}: ${asset.name} (${asset.assetNumber})`,
          sourceType: "depreciation",
          sourceId: asset._id,
          createdBy: userId,
          lines: [
            buildDebitLine(expenseAccount._id, asset.monthlyDepreciation),
            buildCreditLine(asset.depreciationAccountId, asset.monthlyDepreciation),
          ],
        });

        monthsPosted++;
        totalAmount += asset.monthlyDepreciation;
      }

      const newAccumulated = asset.accumulatedDepreciation +
        (asset.monthlyDepreciation * missingMonths.length);
      const depreciableAmount = asset.acquisitionCost - asset.salvageValue;
      const isFullyDepreciated = newAccumulated >= depreciableAmount;

      await ctx.db.patch(asset._id, {
        accumulatedDepreciation: isFullyDepreciated ? depreciableAmount : newAccumulated,
        lastDepreciationMonth: missingMonths[missingMonths.length - 1],
        ...(isFullyDepreciated ? { status: "fully_depreciated" } : {}),
      });

      assetsProcessed++;
    }

    return { assetsProcessed, monthsPosted, totalAmount };
  },
});
```

### 4.4 Void Mutation: `voidMonthDepreciation`

```typescript
export const voidMonthDepreciation = protectedMutation({
  roles: ["admin"],
  args: { targetMonth: v.string() }, // "2026-03"
  handler: async (ctx, args, userId) => {
    const monthStart = firstDayOfMonth(args.targetMonth);
    const monthEnd = lastDayOfMonth(args.targetMonth);

    // Find all non-reversed depreciation JEs in target month
    const entries = await ctx.db
      .query("journalEntries")
      .withIndex("by_date", (q) => q.gte("date", monthStart).lte("date", monthEnd))
      .collect();

    const depEntries = entries.filter(
      (e) => e.sourceType === "depreciation" && !e.isReversed
    );

    for (const entry of depEntries) {
      await createReversalEntry(ctx, entry._id, "depreciation_void", userId);

      // Patch asset: reduce accumulated, reset lastDepreciationMonth
      if (entry.sourceId) {
        const asset = await ctx.db.get(entry.sourceId as Id<"fixedAssets">);
        if (asset) {
          const previousMonth = prevMonth(args.targetMonth);
          const startMonth = toYearMonth(asset.acquisitionDate);
          await ctx.db.patch(asset._id, {
            accumulatedDepreciation: Math.max(
              0,
              asset.accumulatedDepreciation - asset.monthlyDepreciation
            ),
            lastDepreciationMonth: previousMonth < startMonth ? undefined : previousMonth,
            // Revert fully_depreciated if now NBV > salvage
            ...(asset.status === "fully_depreciated" ? { status: "active" } : {}),
          });
        }
      }
    }

    return { reversedCount: depEntries.length, month: args.targetMonth };
  },
});
```

### 4.5 Disposal Mutation: `disposeAsset`

```typescript
export const disposeAsset = protectedMutation({
  roles: ["admin"],
  args: {
    assetId: v.id("fixedAssets"),
    disposalType: v.union(v.literal("sold"), v.literal("scrapped"), v.literal("written_off")),
    disposalDate: v.number(),
    saleProceeds: v.optional(v.number()), // default 0
  },
  handler: async (ctx, args, userId) => {
    const asset = await ctx.db.get(args.assetId);
    if (!asset) throw new Error("Asset not found");
    if (asset.status === "disposed") throw new Error("Asset already disposed");

    const proceeds = args.saleProceeds ?? 0;
    const nbv = asset.acquisitionCost - asset.accumulatedDepreciation;
    const gainLoss = proceeds - nbv; // positive = gain, negative = loss

    const fixedAssetAccount = await getAccountByCode(ctx, "1500");
    const contraAccount = await ctx.db.get(asset.depreciationAccountId);
    const cashAccount = await getAccountByCode(ctx, "1100");
    const gainAccount = await getAccountByCode(ctx, "7300");
    const lossAccount = await getAccountByCode(ctx, "7400");

    // Build JE lines for disposal
    const lines: JournalLine[] = [];

    // Remove accumulated depreciation (debit contra-asset)
    if (asset.accumulatedDepreciation > 0) {
      lines.push(buildDebitLine(asset.depreciationAccountId, asset.accumulatedDepreciation));
    }

    // Cash received (debit cash)
    if (proceeds > 0) {
      lines.push(buildDebitLine(cashAccount._id, proceeds));
    }

    // Remove asset from books (credit fixed assets)
    lines.push(buildCreditLine(fixedAssetAccount._id, asset.acquisitionCost));

    // Gain or loss
    if (gainLoss > 0) {
      lines.push(buildCreditLine(gainAccount._id, gainLoss));   // gain
    } else if (gainLoss < 0) {
      lines.push(buildDebitLine(lossAccount._id, Math.abs(gainLoss))); // loss
    }

    const jeId = await createJournalEntryWithLines(ctx, {
      date: args.disposalDate,
      description: `Asset disposal (${args.disposalType}): ${asset.name} (${asset.assetNumber})`,
      sourceType: "depreciation", // reuse — disposal is a depreciation-domain event
      sourceId: asset._id,
      createdBy: userId,
      lines,
    });

    await ctx.db.patch(args.assetId, {
      status: "disposed",
      disposalDate: args.disposalDate,
      disposalType: args.disposalType,
      saleProceeds: proceeds,
      disposalJournalEntryId: jeId,
    });

    return { assetNumber: asset.assetNumber, gainLoss, journalEntryId: jeId };
  },
});
```

### 4.6 Journal Engine Extension

In `convex/lib/journalEngine.ts`:

```typescript
export type JournalSourceType =
  | "expense_approval"
  | "expense_void"
  | "reimbursement"
  | "reimbursement_void"
  | "payroll"
  | "payroll_void"
  | "depreciation"          // NEW
  | "depreciation_void"     // NEW
  | "manual";

export type VoidSourceType =
  | "expense_void"
  | "reimbursement_void"
  | "payroll_void"
  | "depreciation_void";   // NEW

export type ReversibleSourceType =
  | "expense_approval"
  | "reimbursement"
  | "payroll"
  | "depreciation";        // NEW

const VALID_VOID_PAIRS: Record<string, VoidSourceType> = {
  expense_approval: "expense_void",
  reimbursement: "reimbursement_void",
  payroll: "payroll_void",
  depreciation: "depreciation_void",  // NEW
};
```

## 5. Income Statement Depreciation Reminder

### 5.1 Backend Query: `getDepreciationStatus`

```typescript
// convex/fixedAssets/queries.ts
export const getDepreciationStatus = query({
  args: {},
  handler: async (ctx) => {
    const currentMonth = getCurrentWibMonth();
    const activeAssets = await ctx.db
      .query("fixedAssets")
      .withIndex("by_status", (q) => q.eq("status", "active"))
      .collect();

    const unpostedCount = activeAssets.filter((a) => {
      const cat = ASSET_CATEGORIES[a.category];
      if (!cat.depreciable) return false;
      return !a.lastDepreciationMonth || a.lastDepreciationMonth < currentMonth;
    }).length;

    return {
      hasUnpostedMonths: unpostedCount > 0,
      currentMonth,
      unpostedCount,
    };
  },
});
```

### 5.2 Frontend: Two Reminder Placements

**Top banner** in `FinancialStatement.tsx`:
- Yellow info banner: "{Month} depreciation not yet posted for {N} assets. Run from Asset Register"
- Link navigates to `/assets`
- Dismissible per session (local state), reappears on next page visit
- Only rendered when `hasUnpostedMonths === true`

**Inline note** in OpEx section:
- Append `(Mar not posted)` in muted text next to the 6150 Depreciation Expense row
- Only shows when unposted months exist

## 6. Asset Register UI

### 6.1 Page: `/assets`

**Access:** Manager + Admin via `canAccessAssets` permission.

**Header area:**
- Page title: "Asset Register"
- "Catch Up to Now" button (admin only) — prominent, primary color
- "+ Add Asset" button
- Table/Card toggle

**Filters:**
- Category dropdown (All Categories + each PSAK category)
- Status dropdown (All / Active / Fully Depreciated / Disposed)
- Search by name or asset number

### 6.2 Table View

| Column | Description |
|--------|-------------|
| # | Asset number (FA-KIT-2603-001) |
| Name | Asset name |
| Category | PSAK label (Mesin & Peralatan Produksi) |
| Location | Free text location |
| Acquired | Acquisition date |
| Cost | Acquisition cost (IDR) |
| Accum Depr | Accumulated depreciation (IDR) |
| NBV | Net book value = Cost - Accum Depr |
| Status | Badge: Active / Fully Depreciated / Disposed |

Sortable by all columns. Rows clickable → navigate to asset detail.

### 6.3 Card View

Each card shows:
- Thumbnail photo (first attachment, or placeholder icon)
- Asset name + number
- Progress bar (% depreciated = accumulated / depreciable amount)
- NBV in IDR
- Status badge
- Location text

### 6.4 "Catch Up to Now" Dialog

Triggered by button click. Shows computed preview:

```
Depreciation Catch-Up Preview

February 2026:
  FA-VEH-2501-001  Honda Vario 160       Rp 291,667

March 2026:
  FA-KIT-2603-001  KitchenAid Mixer      Rp 156,250
  FA-VEH-2501-001  Honda Vario 160       Rp 291,667

Total: 3 entries across 2 assets = Rp 739,584

[Cancel]  [Post All Journal Entries]
```

Grouped by month, sorted by asset number within each month. Shows total entry count, asset count, and total amount.

### 6.5 Asset Detail Page

**URL:** `/assets/:id`

**Sections:**

1. **Header:** Asset number, name, status badge, Edit/Dispose buttons
2. **Asset Information:** Category, acquisition date, cost, useful life (with PSAK tooltip), salvage value (with PSAK tooltip), monthly depreciation, location
3. **Characteristics:** Key-value pairs table. "Add Field" button. "Paste CSV" button opens textarea for pasting `key,value` lines.
4. **Attachments:** Grid of uploaded photos/documents. Upload button (reuses `generateUploadUrl` pattern). Click to view/download.
5. **Depreciation History:** Table with columns: Month, Depreciation, Accumulated, NBV, JE# (linked to journal entry). Shows full history of posted depreciation.
6. **Actions:** Edit asset (manager/admin), Dispose asset (admin), Void month depreciation (admin)

### 6.6 Asset Create/Edit Form

**Fields:**
- Name (required)
- Category (dropdown, required) — selecting category auto-fills useful life, salvage value, monthly depreciation
- Acquisition Date (date picker, required)
- Acquisition Cost (number, required, IDR)
- Useful Life (months, auto-filled from category, editable, PSAK tooltip)
- Salvage Value (IDR, auto-calculated from category salvagePercent, editable, PSAK tooltip)
- Location (optional text)
- Characteristics (key-value editor + CSV paste)
- Attachments (file upload)

**Computed (shown but not editable):**
- Monthly Depreciation = (cost - salvage) / usefulLifeMonths
- Asset Number (auto-generated on create: FA-{prefix}-YYMM-NNN)

### 6.7 Disposal Dialog

Triggered by "Dispose" button on asset detail (admin only).

**Fields:**
- Disposal type: Sold / Scrapped / Written Off (radio)
- Disposal date (date picker, defaults to today)
- Sale proceeds (number field, only shown when type = "sold", default 0)

**Computed preview before confirm:**
- Current NBV: Rp X
- Sale proceeds: Rp Y
- Gain/Loss: Rp Z (gain in green, loss in red)

**Confirm button:** "Dispose Asset & Post Journal Entry"

## 7. Backend API Summary

### Queries (convex/fixedAssets/queries.ts)

| Query | Access | Description |
|-------|--------|-------------|
| `list` | Manager, Admin | List all assets with optional category/status filters |
| `getById` | Manager, Admin | Get single asset with full details |
| `getDepreciationPreview` | Admin | Compute catch-up preview (missing months per asset) |
| `getDepreciationStatus` | Public (no auth) | Check if current month has unposted depreciation (for Income Statement reminder) |
| `getDepreciationHistory` | Manager, Admin | Get depreciation JE history for a single asset |

### Mutations (convex/fixedAssets/mutations.ts)

| Mutation | Access | Description |
|----------|--------|-------------|
| `create` | Manager, Admin | Create new fixed asset with auto-numbering |
| `update` | Manager, Admin | Update asset details (not cost/category after depreciation started) |
| `generateUploadUrl` | Manager, Admin | Get signed upload URL for attachments |
| `runDepreciation` | Admin | Post depreciation JEs for all assets with missing months |
| `voidMonthDepreciation` | Admin | Reverse all depreciation JEs for a target month |
| `disposeAsset` | Admin | Dispose asset with gain/loss JE |

### Seed Extension (convex/accounts/mutations.ts)

Update `DEFAULT_ACCOUNTS` to:
- Remove `1600 Accumulated Depreciation`
- Add `1610`-`1670` per-category accumulated depreciation accounts
- Add `6150 Depreciation Expense`
- Add `7300 Gain on Asset Disposal`
- Add `7400 Loss on Asset Disposal`

## 8. Frontend Components

### New Files

| File | Purpose |
|------|---------|
| `src/pages/AssetRegister.tsx` | Asset list page with table/card toggle |
| `src/pages/AssetDetail.tsx` | Asset detail with depreciation history |
| `src/components/assets/AssetForm.tsx` | Create/edit form with PSAK defaults |
| `src/components/assets/AssetCard.tsx` | Card view component |
| `src/components/assets/DepreciationPreviewDialog.tsx` | Catch-up preview and confirm |
| `src/components/assets/DisposalDialog.tsx` | Disposal workflow dialog |
| `src/components/assets/CharacteristicsEditor.tsx` | Key-value pairs + CSV paste |
| `src/components/assets/DepreciationHistory.tsx` | History table per asset |
| `src/hooks/convex/useFixedAssets.ts` | Convex hooks for assets |

### Modified Files

| File | Change |
|------|--------|
| `src/App.tsx` | Add `/assets` and `/assets/:id` routes |
| `src/components/layout/Header.tsx` | Add "Asset Register" to `financialItems` |
| `src/lib/types.ts` | Add `canAccessAssets` permission |
| `src/hooks/convex/index.ts` | Export `useFixedAssets` |
| `src/pages/FinancialStatement.tsx` | Add depreciation reminder (banner + inline) |
| `convex/schema.ts` | Add `fixedAssets` table, extend `journalEntries.sourceType` |
| `convex/lib/journalEngine.ts` | Extend types + void pairs |
| `convex/accounts/mutations.ts` | Update `DEFAULT_ACCOUNTS` |

## 9. Access Control

| Action | Manager | Admin |
|--------|---------|-------|
| View asset list | Yes | Yes |
| View asset detail | Yes | Yes |
| Create asset | Yes | Yes |
| Edit asset | Yes | Yes |
| Upload attachments | Yes | Yes |
| Run depreciation | No | Yes |
| Void depreciation | No | Yes |
| Dispose asset | No | Yes |

Permission: `canAccessAssets` added to `ROLE_PERMISSIONS` for manager and admin roles.

## 10. Helper Utilities

### Date/Month Helpers (convex/fixedAssets/dateHelpers.ts)

```typescript
getCurrentWibMonth(): string        // "2026-03" — current month in WIB
toYearMonth(timestamp: number): string  // timestamp → "2026-03"
nextMonth(ym: string): string       // "2026-03" → "2026-04"
prevMonth(ym: string): string       // "2026-03" → "2026-02"
getMonthRange(start: string, end: string): string[]  // inclusive range
lastDayOfMonth(ym: string): number  // "2026-03" → timestamp for Mar 31
firstDayOfMonth(ym: string): number // "2026-03" → timestamp for Mar 1
formatMonth(ym: string): string     // "2026-03" → "Mar 2026"
```

### Account Lookup (convex/fixedAssets/helpers.ts)

```typescript
getAccountByCode(ctx: QueryCtx, code: string): Promise<Doc<"accounts">>
```

---

*Phase: 60-asset-register-depreciation*
*Design spec: 2026-03-17*
