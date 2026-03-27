/**
 * Fixed asset queries.
 *
 * List, detail, depreciation preview, and reminder check.
 * All queries use protectedQuery with role-based access.
 */

import { v } from "convex/values";
import { protectedQuery } from "../lib/functions";
import {
  ASSET_CATEGORIES,
  calculateFinalMonthAmount,
  computeMissingMonths,
  getCurrentYYYYMM,
} from "./helpers";

// ---------------------------------------------------------------------------
// 1. List assets
// ---------------------------------------------------------------------------

export const list = protectedQuery({
  roles: ["manager", "admin"],
  args: {
    statusFilter: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    let assets;

    if (
      args.statusFilter &&
      args.statusFilter !== "all" &&
      (args.statusFilter === "active" ||
        args.statusFilter === "fully_depreciated" ||
        args.statusFilter === "disposed")
    ) {
      assets = await ctx.db
        .query("fixedAssets")
        .withIndex("by_status", (q) => q.eq("status", args.statusFilter as "active" | "fully_depreciated" | "disposed"))
        .collect();
    } else {
      assets = await ctx.db.query("fixedAssets").collect();
    }

    // Sort by _creationTime desc
    assets.sort((a, b) => b._creationTime - a._creationTime);

    // Batch-resolve first attachment URLs for thumbnails
    const firstAttachmentIds = assets
      .map((a) => (a.attachmentIds.length > 0 ? a.attachmentIds[0] : null))
      .filter((id) => id !== null);

    const thumbnailUrls = await Promise.all(
      firstAttachmentIds.map((id) => ctx.storage.getUrl(id!))
    );

    // Build a map from storageId string to URL
    const urlMap = new Map<string, string | null>();
    for (let i = 0; i < firstAttachmentIds.length; i++) {
      urlMap.set(firstAttachmentIds[i]! as unknown as string, thumbnailUrls[i]);
    }

    return assets.map((asset) => {
      const netBookValue = asset.cost - asset.accumulatedDepreciation;
      const firstId =
        asset.attachmentIds.length > 0 ? asset.attachmentIds[0] : null;
      const thumbnailUrl = firstId
        ? urlMap.get(firstId as unknown as string) ?? null
        : null;

      return {
        _id: asset._id,
        _creationTime: asset._creationTime,
        assetNumber: asset.assetNumber,
        name: asset.name,
        category: asset.category,
        acquisitionDate: asset.acquisitionDate,
        cost: asset.cost,
        salvageValue: asset.salvageValue,
        usefulLifeMonths: asset.usefulLifeMonths,
        location: asset.location,
        status: asset.status,
        monthlyDepreciation: asset.monthlyDepreciation,
        accumulatedDepreciation: asset.accumulatedDepreciation,
        lastDepreciationMonth: asset.lastDepreciationMonth,
        netBookValue,
        thumbnailUrl,
      };
    });
  },
});

// ---------------------------------------------------------------------------
// 2. Get asset by ID
// ---------------------------------------------------------------------------

export const getById = protectedQuery({
  roles: ["manager", "admin"],
  args: {
    assetId: v.id("fixedAssets"),
  },
  handler: async (ctx, args) => {
    const asset = await ctx.db.get(args.assetId);
    if (!asset) return null;

    const netBookValue = asset.cost - asset.accumulatedDepreciation;

    // Resolve ALL attachment URLs
    const attachmentUrls = await Promise.all(
      asset.attachmentIds.map((id) => ctx.storage.getUrl(id))
    );

    // Look up category config
    const categoryConfig = ASSET_CATEGORIES.find(
      (c) => c.key === asset.category
    );

    // Fetch recent depreciation JEs (last 12)
    const depreciationJEs = await ctx.db
      .query("journalEntries")
      .withIndex("by_source", (q) =>
        q
          .eq("sourceType", "depreciation")
          .eq("sourceId", asset._id as string)
      )
      .collect();

    const nonReversedJEs = depreciationJEs
      .filter((je) => !je.isReversed)
      .sort((a, b) => b.date - a.date)
      .slice(0, 12);

    const depreciationHistory = nonReversedJEs.map((je) => ({
      _id: je._id,
      entryNumber: je.entryNumber,
      date: je.date,
      description: je.description,
    }));

    return {
      ...asset,
      netBookValue,
      attachmentUrls,
      categoryLabel: categoryConfig?.label ?? asset.category,
      categoryAbbr: categoryConfig?.abbr ?? "???",
      depreciable: categoryConfig?.depreciable ?? false,
      depreciationHistory,
    };
  },
});

// ---------------------------------------------------------------------------
// 3. Depreciation preview
// ---------------------------------------------------------------------------

export const getDepreciationPreview = protectedQuery({
  roles: ["admin"],
  args: {},
  handler: async (ctx) => {
    const currentMonth = getCurrentYYYYMM();

    // Fetch all active depreciable assets
    const allActive = await ctx.db
      .query("fixedAssets")
      .withIndex("by_status", (q) => q.eq("status", "active"))
      .collect();

    const depreciableAssets = allActive.filter((a) => {
      const cat = ASSET_CATEGORIES.find((c) => c.key === a.category);
      return cat?.depreciable === true;
    });

    const preview = [];
    let grandTotal = 0;

    for (const asset of depreciableAssets) {
      const depreciableAmount = asset.cost - asset.salvageValue;
      const missingMonths = computeMissingMonths(
        asset.acquisitionDate,
        asset.lastDepreciationMonth ?? null,
        currentMonth,
        asset.usefulLifeMonths,
        asset.accumulatedDepreciation,
        depreciableAmount
      );

      if (missingMonths.length === 0) continue;

      // Calculate accurate total using calculateFinalMonthAmount
      let runningAccum = asset.accumulatedDepreciation;
      let totalAmount = 0;
      for (const _month of missingMonths) {
        const amount = calculateFinalMonthAmount(
          asset.monthlyDepreciation,
          runningAccum,
          depreciableAmount
        );
        totalAmount += amount;
        runningAccum += amount;
      }

      grandTotal += totalAmount;

      preview.push({
        assetId: asset._id,
        assetNumber: asset.assetNumber,
        name: asset.name,
        missingMonths,
        monthlyAmount: asset.monthlyDepreciation,
        totalAmount,
      });
    }

    return {
      currentMonth,
      items: preview,
      grandTotal,
      totalAssets: preview.length,
      totalMonths: preview.reduce((sum, p) => sum + p.missingMonths.length, 0),
    };
  },
});

// ---------------------------------------------------------------------------
// 4. Orphan equipment purchase JEs (one-off migration helper)
// ---------------------------------------------------------------------------

/**
 * Find manual journal entries created with the old equipment_purchase template
 * that don't have matching assets in the register. Returns date, description,
 * and amount so users can manually create corresponding assets.
 */
export const getOrphanEquipmentPurchases = protectedQuery({
  roles: ["manager", "admin"],
  args: {},
  handler: async (ctx) => {
    // Find all manual JEs — filter for equipment_purchase templateType in app
    const manualJEs = await ctx.db
      .query("journalEntries")
      .withIndex("by_sourceType_date", (q) => q.eq("sourceType", "manual"))
      .collect();

    const orphans = manualJEs.filter(
      (je) =>
        je.metadata &&
        typeof je.metadata === "object" &&
        "templateType" in je.metadata &&
        je.metadata.templateType === "equipment_purchase" &&
        !je.isReversed
    );

    if (orphans.length === 0) return [];

    // Fetch debit lines to get amounts
    const results = [];
    for (const je of orphans) {
      const lines = await ctx.db
        .query("journalEntryLines")
        .withIndex("by_journal_entry", (q) => q.eq("journalEntryId", je._id))
        .collect();

      const debitLine = lines.find((l) => l.debitAmount > 0);
      results.push({
        _id: je._id,
        entryNumber: je.entryNumber,
        date: je.date,
        description: je.description,
        amount: debitLine?.debitAmount ?? 0,
      });
    }

    return results;
  },
});

// ---------------------------------------------------------------------------
// 5. Orphan assets without acquisition JE
// ---------------------------------------------------------------------------

/**
 * Find active assets that have no acquisition JE and were not created from
 * expense-to-capex conversion. Returns minimal info for backfill banner.
 */
export const getAssetsWithoutAcquisitionJE = protectedQuery({
  roles: ["admin"],
  args: {},
  handler: async (ctx) => {
    const allAssets = await ctx.db.query("fixedAssets").collect();
    // Orphans: no acquisitionJeId AND no sourceExpenseId (expense-to-capex creates its own JE)
    const orphans = allAssets.filter(
      (a) => !a.acquisitionJeId && !a.sourceExpenseId && a.status !== "disposed"
    );
    return orphans.map((a) => ({
      _id: a._id,
      assetNumber: a.assetNumber,
      name: a.name,
      category: a.category,
      cost: a.cost,
      acquisitionDate: a.acquisitionDate,
    }));
  },
});

// ---------------------------------------------------------------------------
// 6. Depreciation reminder (lightweight)
// ---------------------------------------------------------------------------

export const getDepreciationReminder = protectedQuery({
  roles: ["manager", "admin"],
  args: {},
  handler: async (ctx) => {
    const currentMonth = getCurrentYYYYMM();

    // Fetch all active depreciable assets
    const allActive = await ctx.db
      .query("fixedAssets")
      .withIndex("by_status", (q) => q.eq("status", "active"))
      .collect();

    let unpostedCount = 0;
    for (const asset of allActive) {
      const cat = ASSET_CATEGORIES.find((c) => c.key === asset.category);
      if (!cat?.depreciable) continue;

      // Asset needs depreciation if lastDepreciationMonth is undefined or < currentMonth
      if (
        asset.lastDepreciationMonth === undefined ||
        asset.lastDepreciationMonth < currentMonth
      ) {
        unpostedCount++;
      }
    }

    return {
      hasUnposted: unpostedCount > 0,
      unpostedCount,
      currentMonth,
    };
  },
});
