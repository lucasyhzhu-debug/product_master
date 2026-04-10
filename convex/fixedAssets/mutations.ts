/**
 * Fixed asset mutations.
 *
 * CRUD, depreciation batch, disposal, void, and file upload.
 * All JE creation goes through createJournalEntryWithLines (JE-06).
 *
 * Auth: manager/admin for CRUD, admin-only for depreciation/disposal/void.
 */

import { v, ConvexError } from "convex/values";
import { protectedMutation } from "../lib/functions";
import {
  createJournalEntryWithLines,
  createReversalEntry,
  buildDebitLine,
  buildCreditLine,
} from "../lib/journalEngine";
import {
  ASSET_CATEGORIES,
  calculateMonthlyDepreciation,
  calculateFinalMonthAmount,
  computeMissingMonths,
  calculateDisposalGainLoss,
  formatAssetNumber,
  getYYMMDateStr,
  getCurrentYYYYMM,
  getAssetAccountCode,
  getExpenseAccountCode,
  getReclassificationExpenseCode,
} from "./helpers";
import { getNextNumber } from "../lib/counter";
import { recordStatusChange } from "../expenses/auditTrail";
import { getWibComponents, wibMidnightToUtc, calculateMonthRange } from "../lib/periodRange";
import type { Id, Doc } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";

// ---------------------------------------------------------------------------
// Helper: resolve GL account by code
// ---------------------------------------------------------------------------

export async function resolveAccount(
  ctx: MutationCtx,
  code: string
): Promise<Doc<"accounts">> {
  const account = await ctx.db
    .query("accounts")
    .withIndex("by_code", (q) => q.eq("code", code))
    .first();
  if (!account) {
    throw new ConvexError(
      `System account ${code} not found. Please ask an admin to run accounts:seedDefaults from the Convex dashboard.`
    );
  }
  return account;
}

// ---------------------------------------------------------------------------
// Helper: get next asset number (custom YYMM counter)
// ---------------------------------------------------------------------------

export async function getNextAssetNumber(
  ctx: MutationCtx,
  abbr: string,
  acquisitionDate: number
): Promise<string> {
  const yymmDateStr = getYYMMDateStr(acquisitionDate);
  const prefix = `FA-${abbr}`;
  const counterKey = yymmDateStr; // YYMM as date key

  // Look up existing counter for this prefix+YYMM
  const counter = await ctx.db
    .query("counters")
    .withIndex("by_prefix_date", (q) =>
      q.eq("prefix", prefix).eq("date", counterKey)
    )
    .first();

  let sequence: number;
  if (counter) {
    sequence = counter.lastSequence + 1;
    await ctx.db.patch(counter._id, { lastSequence: sequence });
  } else {
    sequence = 1;
    await ctx.db.insert("counters", {
      prefix,
      date: counterKey,
      lastSequence: sequence,
    });
  }

  return formatAssetNumber(abbr, yymmDateStr, sequence);
}

// ---------------------------------------------------------------------------
// 1. Create asset
// ---------------------------------------------------------------------------

export const create = protectedMutation({
  roles: ["manager", "admin"],
  args: {
    name: v.string(),
    category: v.string(),
    acquisitionDate: v.number(),
    cost: v.number(),
    salvageValue: v.optional(v.number()),
    usefulLifeMonths: v.optional(v.number()),
    location: v.optional(v.string()),
    characteristics: v.array(v.object({ key: v.string(), value: v.string() })),
    attachmentIds: v.array(v.id("_storage")),
    paymentMethod: v.optional(v.union(v.literal("company_paid"), v.literal("employee_paid"))),
  },
  handler: async (ctx, args) => {
    // Validate category
    const categoryConfig = ASSET_CATEGORIES.find((c) => c.key === args.category);
    if (!categoryConfig) {
      throw new Error(
        `Invalid category: "${args.category}". Must be one of: ${ASSET_CATEGORIES.map((c) => c.key).join(", ")}`
      );
    }

    // Validate cost
    if (args.cost <= 0 || !Number.isInteger(args.cost)) {
      throw new Error("Cost must be a positive integer (IDR)");
    }

    // Determine salvage value: explicit or default from category
    const salvageValue =
      args.salvageValue !== undefined
        ? args.salvageValue
        : Math.round(args.cost * (categoryConfig.salvagePercent / 100));

    // Determine useful life: explicit or default from category
    let usefulLifeMonths: number;
    if (args.usefulLifeMonths !== undefined) {
      usefulLifeMonths = args.usefulLifeMonths;
    } else if (categoryConfig.usefulLifeYears !== null) {
      usefulLifeMonths = categoryConfig.usefulLifeYears * 12;
    } else {
      usefulLifeMonths = 0; // Non-depreciable (e.g., Tanah)
    }

    // Calculate monthly depreciation (0 for non-depreciable)
    const monthlyDepreciation = categoryConfig.depreciable
      ? calculateMonthlyDepreciation(args.cost, salvageValue, usefulLifeMonths)
      : 0;

    // Generate asset number
    const assetNumber = await getNextAssetNumber(
      ctx,
      categoryConfig.abbr,
      args.acquisitionDate
    );

    // Insert asset
    const assetId = await ctx.db.insert("fixedAssets", {
      assetNumber,
      name: args.name,
      category: args.category,
      acquisitionDate: args.acquisitionDate,
      cost: args.cost,
      salvageValue,
      usefulLifeMonths,
      location: args.location,
      characteristics: args.characteristics,
      attachmentIds: args.attachmentIds,
      status: "active",
      monthlyDepreciation,
      accumulatedDepreciation: 0,
      lastDepreciationMonth: undefined,
      createdBy: ctx.user._id,
      createdAt: Date.now(),
    });

    // Create acquisition JE atomically
    const assetAccountCode = getAssetAccountCode(categoryConfig);
    const payment = args.paymentMethod ?? "company_paid";
    const creditAccountCode = payment === "company_paid" ? "1100" : "2200";

    const [assetAccount, creditAccount] = await Promise.all([
      resolveAccount(ctx, assetAccountCode),
      resolveAccount(ctx, creditAccountCode),
    ]);

    const acquisitionJeId = await createJournalEntryWithLines(ctx, {
      date: args.acquisitionDate,
      description: `Asset Acquisition: ${args.name} (${assetNumber})`,
      sourceType: "asset_acquisition",
      sourceId: assetId as string,
      createdBy: ctx.user._id,
      lines: [
        buildDebitLine(assetAccount._id, args.cost, `Asset: ${args.name}`),
        buildCreditLine(creditAccount._id, args.cost),
      ],
    });

    // Store JE reference on asset
    await ctx.db.patch(assetId, { acquisitionJeId });

    return assetId;
  },
});

// ---------------------------------------------------------------------------
// 2. Update asset (non-financial fields only)
// ---------------------------------------------------------------------------

export const update = protectedMutation({
  roles: ["manager", "admin"],
  args: {
    assetId: v.id("fixedAssets"),
    name: v.optional(v.string()),
    location: v.optional(v.string()),
    characteristics: v.optional(
      v.array(v.object({ key: v.string(), value: v.string() }))
    ),
    attachmentIds: v.optional(v.array(v.id("_storage"))),
  },
  handler: async (ctx, args) => {
    const asset = await ctx.db.get(args.assetId);
    if (!asset) throw new Error("Asset not found");
    if (asset.status === "disposed") {
      throw new Error("Cannot update a disposed asset");
    }

    // Patch only provided fields
    const patch: Record<string, unknown> = {};
    if (args.name !== undefined) patch.name = args.name;
    if (args.location !== undefined) patch.location = args.location;
    if (args.characteristics !== undefined)
      patch.characteristics = args.characteristics;
    if (args.attachmentIds !== undefined)
      patch.attachmentIds = args.attachmentIds;

    if (Object.keys(patch).length > 0) {
      await ctx.db.patch(args.assetId, patch);
    }
  },
});

// ---------------------------------------------------------------------------
// 3. Generate upload URL
// ---------------------------------------------------------------------------

export const generateUploadUrl = protectedMutation({
  roles: ["manager", "admin"],
  args: {},
  handler: async (ctx) => {
    return await ctx.storage.generateUploadUrl();
  },
});

// ---------------------------------------------------------------------------
// 4. Run depreciation batch ("Catch Up to Now")
// ---------------------------------------------------------------------------

export const runDepreciation = protectedMutation({
  roles: ["admin"],
  args: {},
  handler: async (ctx) => {
    const currentYYYYMM = getCurrentYYYYMM();

    // Fetch all active depreciable assets
    const allActive = await ctx.db
      .query("fixedAssets")
      .withIndex("by_status", (q) => q.eq("status", "active"))
      .collect();

    const depreciableAssets = allActive.filter((a) => {
      const cat = ASSET_CATEGORIES.find((c) => c.key === a.category);
      return cat?.depreciable === true;
    });

    // Resolve GL accounts ONCE at start (not per-iteration)
    // Build a map of all needed GL codes -> account ID (expense + accumulation)
    const accountMap = new Map<string, Id<"accounts">>();
    const neededCodes = new Set<string>();
    for (const asset of depreciableAssets) {
      const cat = ASSET_CATEGORIES.find((c) => c.key === asset.category);
      if (cat?.glAccumCode) neededCodes.add(cat.glAccumCode);
      if (cat) neededCodes.add(getExpenseAccountCode(cat));
    }
    // Resolve all needed accounts in parallel
    const codeEntries = [...neededCodes];
    const resolvedAccounts = await Promise.all(
      codeEntries.map((code) => resolveAccount(ctx, code))
    );
    for (let i = 0; i < codeEntries.length; i++) {
      accountMap.set(codeEntries[i], resolvedAccounts[i]._id);
    }

    let assetsProcessed = 0;
    let totalJEs = 0;
    let totalAmount = 0;
    const monthsCovered = new Set<string>();

    for (const asset of depreciableAssets) {
      const depreciableAmount = asset.cost - asset.salvageValue;
      const missingMonths = computeMissingMonths(
        asset.acquisitionDate,
        asset.lastDepreciationMonth ?? null,
        currentYYYYMM,
        asset.usefulLifeMonths,
        asset.accumulatedDepreciation,
        depreciableAmount
      );

      if (missingMonths.length === 0) continue;
      assetsProcessed++;

      let runningAccum = asset.accumulatedDepreciation;

      for (const month of missingMonths) {
        const amount = calculateFinalMonthAmount(
          asset.monthlyDepreciation,
          runningAccum,
          depreciableAmount
        );

        if (amount === 0) continue;

        // Parse month to date for JE
        const [yearStr, monthStr] = month.split("-");
        const year = parseInt(yearStr, 10);
        const m = parseInt(monthStr, 10) - 1; // 0-indexed
        const jeDate = wibMidnightToUtc(year, m, 1); // First day of month, WIB midnight

        // Get category accounts (expense + accumulation)
        const cat = ASSET_CATEGORIES.find((c) => c.key === asset.category);
        const expenseCode = getExpenseAccountCode(cat!);
        const expenseAccountId = accountMap.get(expenseCode);
        const accumAccountId = accountMap.get(cat!.glAccumCode!);
        if (!accumAccountId) {
          throw new Error(
            `Accumulated depreciation account for ${cat!.glAccumCode} not found`
          );
        }
        if (!expenseAccountId) {
          throw new Error(
            `Expense account ${expenseCode} not found`
          );
        }

        // JE label: "Amortization" for intangible, "Depreciation" for tangible
        const jeLabel = cat!.type === "intangible" ? "Amortization" : "Depreciation";

        // Create JE
        await createJournalEntryWithLines(ctx, {
          date: jeDate,
          description: `${jeLabel}: ${asset.name} (${month})`,
          sourceType: "depreciation",
          sourceId: asset._id as string,
          createdBy: ctx.user._id,
          lines: [
            buildDebitLine(expenseAccountId, amount),
            buildCreditLine(accumAccountId, amount),
          ],
        });

        runningAccum += amount;
        totalJEs++;
        totalAmount += amount;
        monthsCovered.add(month);
      }

      // Update asset atomically
      const newAccum = runningAccum;
      const lastMonth = missingMonths[missingMonths.length - 1];
      const isFullyDepreciated = newAccum >= depreciableAmount;

      await ctx.db.patch(asset._id, {
        accumulatedDepreciation: newAccum,
        lastDepreciationMonth: lastMonth,
        ...(isFullyDepreciated ? { status: "fully_depreciated" as const } : {}),
      });
    }

    return {
      assetsProcessed,
      totalJEs,
      totalAmount,
      monthsCovered: [...monthsCovered].sort(),
    };
  },
});

// ---------------------------------------------------------------------------
// 5. Dispose asset
// ---------------------------------------------------------------------------

export const disposeAsset = protectedMutation({
  roles: ["admin"],
  args: {
    assetId: v.id("fixedAssets"),
    disposalType: v.union(
      v.literal("sold"),
      v.literal("scrapped"),
      v.literal("written_off"),
      v.literal("reclassify_to_expense")
    ),
    disposalDate: v.number(),
    saleProceeds: v.optional(v.number()),
    targetExpenseAccountId: v.optional(v.id("accounts")),
    submitterId: v.optional(v.id("users")),
  },
  handler: async (ctx, args) => {
    const asset = await ctx.db.get(args.assetId);
    if (!asset) throw new Error("Asset not found");
    if (asset.status === "disposed") {
      throw new Error("Asset is already disposed");
    }

    // -----------------------------------------------------------------------
    // Reclassify to expense — separate branch with its own JE + expense record
    // -----------------------------------------------------------------------
    if (args.disposalType === "reclassify_to_expense") {
      if (!args.submitterId) {
        throw new ConvexError(
          "Expense owner (submitterId) is required for asset reclassification"
        );
      }

      const nbv = asset.cost - asset.accumulatedDepreciation;
      if (nbv <= 0) {
        throw new ConvexError(
          "Cannot reclassify: Net Book Value must be positive"
        );
      }

      // Resolve target expense account (user override or category default)
      let targetExpenseAccountId;
      if (args.targetExpenseAccountId) {
        targetExpenseAccountId = args.targetExpenseAccountId;
      } else {
        const defaultCode = getReclassificationExpenseCode(asset.category);
        const targetAccount = await resolveAccount(ctx, defaultCode);
        targetExpenseAccountId = targetAccount._id;
      }

      // Resolve GL accounts for compound JE
      const cat = ASSET_CATEGORIES.find((c) => c.key === asset.category);
      const assetAccountCode = cat ? getAssetAccountCode(cat) : "1500";
      const fixedAssetAccount = await resolveAccount(ctx, assetAccountCode);
      const accumAccount =
        cat?.glAccumCode ? await resolveAccount(ctx, cat.glAccumCode) : null;

      // Build reclassification JE lines
      const jeLines = [];

      // DR Target Expense Account (NBV)
      jeLines.push(
        buildDebitLine(
          targetExpenseAccountId,
          nbv,
          `Reclassified: ${asset.name}`
        )
      );

      // DR Accumulated Depreciation (full accumulated amount, if > 0)
      if (asset.accumulatedDepreciation > 0 && accumAccount) {
        jeLines.push(
          buildDebitLine(
            accumAccount._id,
            asset.accumulatedDepreciation,
            "Remove accumulated depreciation"
          )
        );
      }

      // CR Fixed Assets (original cost)
      jeLines.push(
        buildCreditLine(
          fixedAssetAccount._id,
          asset.cost,
          "Remove asset cost"
        )
      );

      // Create compound JE
      const jeId = await createJournalEntryWithLines(ctx, {
        date: args.disposalDate,
        description: `Asset Reclassification: ${asset.name} (${asset.assetNumber})`,
        sourceType: "manual",
        sourceId: asset._id as string,
        createdBy: ctx.user._id,
        lines: jeLines,
      });

      // Create expense record (recorded status — already approved via admin disposal)
      const expenseNumber = await getNextNumber(ctx, "EXP");
      const expenseId = await ctx.db.insert("expenses", {
        expenseNumber,
        submittedBy: args.submitterId,
        amount: nbv,
        accountId: targetExpenseAccountId,
        expenseDate: args.disposalDate,
        description: `Asset reclassified to expense: ${asset.name} (${asset.assetNumber})`,
        vendorName: "",
        paymentMethod: "company_paid" as const,
        status: "recorded" as const,
        lateSubmission: false,
        submittedAt: Date.now(),
        approvedBy: ctx.user._id,
        approvedAt: Date.now(),
        journalEntryId: jeId,
        sourceAssetId: asset._id,
        createdAt: Date.now(),
      });

      // Record audit trail
      await recordStatusChange(
        ctx,
        expenseId,
        undefined,
        "recorded",
        ctx.user._id,
        `Reclassified from asset: ${asset.assetNumber}`
      );

      // Update asset to disposed
      await ctx.db.patch(args.assetId, {
        status: "disposed" as const,
        disposalDate: args.disposalDate,
        disposalType: "reclassify_to_expense" as const,
        saleProceeds: 0,
        disposalGainLoss: 0,
        disposalJournalEntryId: jeId,
      });

      return { journalEntryId: jeId, gainLoss: 0, expenseId, expenseNumber };
    }

    // -----------------------------------------------------------------------
    // Standard disposal (sold, scrapped, written_off)
    // -----------------------------------------------------------------------
    const saleProceeds = args.saleProceeds ?? 0;
    const gainLoss = calculateDisposalGainLoss(
      asset.cost,
      asset.accumulatedDepreciation,
      saleProceeds
    );

    // Resolve GL accounts
    const cat = ASSET_CATEGORIES.find((c) => c.key === asset.category);
    const assetAccountCode = cat ? getAssetAccountCode(cat) : "1500";

    // Resolve all needed accounts in parallel
    const disposalAccountCodes = [assetAccountCode, "1100", "7300", "7400"];
    if (cat?.glAccumCode) disposalAccountCodes.push(cat.glAccumCode);

    const accountResults = await Promise.all(
      disposalAccountCodes.map((code) => resolveAccount(ctx, code))
    );

    const disposalAccountMap = new Map<string, Id<"accounts">>();
    for (let i = 0; i < disposalAccountCodes.length; i++) {
      disposalAccountMap.set(disposalAccountCodes[i], accountResults[i]._id);
    }

    const fixedAssetAccountId = disposalAccountMap.get(assetAccountCode)!;
    const cashAccountId = disposalAccountMap.get("1100")!;
    const gainAccountId = disposalAccountMap.get("7300")!;
    const lossAccountId = disposalAccountMap.get("7400")!;
    const accumAccountId = cat?.glAccumCode
      ? disposalAccountMap.get(cat.glAccumCode)!
      : null;

    // Build compound disposal JE lines
    const lines = [];

    // DR Accumulated Depreciation (full accumulated amount)
    if (asset.accumulatedDepreciation > 0 && accumAccountId) {
      lines.push(
        buildDebitLine(
          accumAccountId,
          asset.accumulatedDepreciation,
          "Remove accumulated depreciation"
        )
      );
    }

    // DR Cash (sale proceeds, only if > 0)
    if (saleProceeds > 0) {
      lines.push(
        buildDebitLine(cashAccountId, saleProceeds, "Sale proceeds received")
      );
    }

    // DR Loss on Disposal (7400, only if loss)
    if (gainLoss < 0) {
      lines.push(
        buildDebitLine(
          lossAccountId,
          Math.abs(gainLoss),
          "Loss on disposal"
        )
      );
    }

    // CR Fixed Assets (1500, original cost)
    lines.push(
      buildCreditLine(fixedAssetAccountId, asset.cost, "Remove asset cost")
    );

    // CR Gain on Disposal (7300, only if gain)
    if (gainLoss > 0) {
      lines.push(
        buildCreditLine(gainAccountId, gainLoss, "Gain on disposal")
      );
    }

    // Create disposal JE with sourceType="manual" (NOT "depreciation")
    const jeId = await createJournalEntryWithLines(ctx, {
      date: args.disposalDate,
      description: `Disposal: ${asset.name} (${args.disposalType})`,
      sourceType: "manual",
      sourceId: asset._id as string,
      createdBy: ctx.user._id,
      lines,
    });

    // Update asset
    await ctx.db.patch(args.assetId, {
      status: "disposed" as const,
      disposalDate: args.disposalDate,
      disposalType: args.disposalType,
      saleProceeds,
      disposalGainLoss: gainLoss,
      disposalJournalEntryId: jeId,
    });

    return { journalEntryId: jeId, gainLoss };
  },
});

// ---------------------------------------------------------------------------
// 6. Void depreciation month
// ---------------------------------------------------------------------------

export const voidDepreciationMonth = protectedMutation({
  roles: ["admin"],
  args: {
    month: v.string(), // "YYYY-MM"
  },
  handler: async (ctx, args) => {
    // Parse month
    const [yearStr, monthStr] = args.month.split("-");
    const year = parseInt(yearStr, 10);
    const m = parseInt(monthStr, 10) - 1; // 0-indexed

    // Compute month date range
    const { currentStart: monthStart, currentEnd: monthEnd } =
      calculateMonthRange(year, m);

    // Query depreciation JEs for this month using compound index
    const depreciationJEs = await ctx.db
      .query("journalEntries")
      .withIndex("by_sourceType_date", (q) =>
        q
          .eq("sourceType", "depreciation")
          .gte("date", monthStart)
          .lt("date", monthEnd)
      )
      .collect();

    // Filter non-reversed only
    const unreversedJEs = depreciationJEs.filter((je) => !je.isReversed);

    if (unreversedJEs.length === 0) {
      return { jesReversed: 0, assetsAffected: 0 };
    }

    // Track affected assets
    const affectedAssetIds = new Set<string>();

    // Reverse each JE
    for (const je of unreversedJEs) {
      await createReversalEntry(
        ctx,
        je._id,
        "depreciation_void",
        ctx.user._id
      );
      if (je.sourceId) {
        affectedAssetIds.add(je.sourceId);
      }
    }

    // For each affected asset, recalculate state
    for (const assetIdStr of affectedAssetIds) {
      const asset = await ctx.db.get(assetIdStr as Id<"fixedAssets">);
      if (!asset) continue;

      // Query ALL non-reversed depreciation JEs for this asset
      const allAssetJEs = await ctx.db
        .query("journalEntries")
        .withIndex("by_source", (q) =>
          q.eq("sourceType", "depreciation").eq("sourceId", assetIdStr)
        )
        .collect();

      const remainingJEs = allAssetJEs.filter((je) => !je.isReversed);

      // Recalculate accumulated depreciation from remaining JEs
      // Recalculate accumulated depreciation by summing credit amounts across all
      // non-reversed JE lines. This works because each depreciation JE has exactly
      // 2 lines: one debit to expense (6150), one credit to accumulated depreciation
      // (1610-1670). Summing all credits gives the correct total since debit lines
      // have creditAmount=0 and credit lines carry the depreciation amount.
      let newAccum = 0;
      for (const je of remainingJEs) {
        const lines = await ctx.db
          .query("journalEntryLines")
          .withIndex("by_journal_entry", (q) =>
            q.eq("journalEntryId", je._id)
          )
          .collect();
        for (const line of lines) {
          newAccum += line.creditAmount;
        }
      }

      // Find last posted month (max date from remaining JEs)
      let lastDepreciationMonth: string | undefined;
      if (remainingJEs.length > 0) {
        const maxDate = Math.max(...remainingJEs.map((je) => je.date));
        const { year: maxYear, month: maxMonth } = getWibComponents(maxDate);
        lastDepreciationMonth = `${maxYear}-${String(maxMonth + 1).padStart(2, "0")}`;
      }

      // Determine status
      const depreciableAmount = asset.cost - asset.salvageValue;
      const newStatus =
        newAccum >= depreciableAmount ? "fully_depreciated" : "active";

      await ctx.db.patch(asset._id, {
        accumulatedDepreciation: newAccum,
        lastDepreciationMonth,
        status: newStatus as "active" | "fully_depreciated",
      });
    }

    return {
      jesReversed: unreversedJEs.length,
      assetsAffected: affectedAssetIds.size,
    };
  },
});

// ---------------------------------------------------------------------------
// 7. Backfill acquisition JEs for orphan assets
// ---------------------------------------------------------------------------

export const backfillAcquisitionJEs = protectedMutation({
  roles: ["admin"],
  args: {},
  handler: async (ctx) => {
    const allAssets = await ctx.db.query("fixedAssets").collect();
    const orphans = allAssets.filter(
      (a) => !a.acquisitionJeId && !a.sourceExpenseId && a.status !== "disposed"
    );
    if (orphans.length === 0) return { count: 0 };

    // Default: company_paid (Cash 1100)
    const cashAccount = await resolveAccount(ctx, "1100");
    const tangibleAssetAccount = await resolveAccount(ctx, "1500");
    const intangibleAssetAccount = await resolveAccount(ctx, "1700");

    let count = 0;
    for (const asset of orphans) {
      const cat = ASSET_CATEGORIES.find((c) => c.key === asset.category);
      const assetAccountId = cat?.type === "intangible"
        ? intangibleAssetAccount._id
        : tangibleAssetAccount._id;

      const jeId = await createJournalEntryWithLines(ctx, {
        date: asset.acquisitionDate,
        description: `Asset Acquisition (backfill): ${asset.name} (${asset.assetNumber})`,
        sourceType: "asset_acquisition",
        sourceId: asset._id as string,
        createdBy: ctx.user._id,
        lines: [
          buildDebitLine(assetAccountId, asset.cost, `Asset: ${asset.name}`),
          buildCreditLine(cashAccount._id, asset.cost),
        ],
      });
      await ctx.db.patch(asset._id, { acquisitionJeId: jeId });
      count++;
    }
    return { count };
  },
});
