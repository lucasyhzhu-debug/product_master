/**
 * CRM supply-agreement mutations and queries — Phase D CRM surface.
 *
 * T7: generateAgreementUploadUrl — fresh upload-url wrapper over ctx.storage.
 *     createSupplyAgreement      — insert agreement, seed versions[0], set uploadedBy.
 *     addAgreementVersion        — append a version entry to versions[].
 *     linkAgreementToSubscription — patch both supplyAgreements.subscriptionId
 *                                   and subscriptions.agreementId atomically.
 *     getAgreement               — single-doc lookup.
 *     listAgreementsByCustomer   — index-driven list via by_customer.
 *
 * Auth: manager + admin only on all 6 functions (Pitfall #19).
 */

import { v, ConvexError } from "convex/values";
import { protectedMutation, protectedQuery } from "../lib/functions";

// ---------------------------------------------------------------------------
// generateAgreementUploadUrl
// ---------------------------------------------------------------------------

export const generateAgreementUploadUrl = protectedMutation({
  roles: ["manager", "admin"],
  args: {},
  handler: async (ctx) => await ctx.storage.generateUploadUrl(),
});

// ---------------------------------------------------------------------------
// createSupplyAgreement
// ---------------------------------------------------------------------------

export const createSupplyAgreement = protectedMutation({
  roles: ["manager", "admin"],
  args: {
    customerId: v.id("customers"),
    subscriptionId: v.optional(v.id("subscriptions")),
    fileStorageId: v.id("_storage"),
    fileName: v.string(),
    fileSize: v.number(),
    status: v.union(
      v.literal("draft"),
      v.literal("signed"),
      v.literal("expired"),
      v.literal("terminated"),
    ),
    signedDate: v.optional(v.number()),
    governingLaw: v.optional(v.string()),
    signatories: v.optional(v.string()),
    keyTerms: v.optional(
      v.object({
        weeklyQty: v.number(),
        unitPrice: v.number(),
        weeklyCreditAmount: v.number(),
        baselineDailyQty: v.number(),
        deliverByTime: v.string(),
        permanentChangeNoticeDays: v.number(),
        terminationNoticeDays: v.number(),
        creditRolloverPolicy: v.union(v.literal("expire"), v.literal("rollover")),
        termType: v.string(),
      }),
    ),
    lang: v.union(v.literal("id"), v.literal("en")),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    const { lang, ...rest } = args;
    return await ctx.db.insert("supplyAgreements", {
      ...rest,
      uploadedBy: ctx.user._id,
      uploadedAt: now,
      versions: [
        {
          fileStorageId: args.fileStorageId,
          fileName: args.fileName,
          uploadedAt: now,
          lang,
        },
      ],
    });
  },
});

// ---------------------------------------------------------------------------
// addAgreementVersion
// ---------------------------------------------------------------------------

export const addAgreementVersion = protectedMutation({
  roles: ["manager", "admin"],
  args: {
    agreementId: v.id("supplyAgreements"),
    fileStorageId: v.id("_storage"),
    fileName: v.string(),
    lang: v.union(v.literal("id"), v.literal("en")),
  },
  handler: async (ctx, args) => {
    const agreement = await ctx.db.get(args.agreementId);
    if (!agreement) throw new ConvexError(`Agreement not found: ${args.agreementId}`);

    const existing = agreement.versions ?? [];
    await ctx.db.patch(args.agreementId, {
      versions: [
        ...existing,
        {
          fileStorageId: args.fileStorageId,
          fileName: args.fileName,
          uploadedAt: Date.now(),
          lang: args.lang,
        },
      ],
    });
    return args.agreementId;
  },
});

// ---------------------------------------------------------------------------
// linkAgreementToSubscription
// ---------------------------------------------------------------------------

export const linkAgreementToSubscription = protectedMutation({
  roles: ["manager", "admin"],
  args: {
    agreementId: v.id("supplyAgreements"),
    subscriptionId: v.id("subscriptions"),
  },
  handler: async (ctx, args) => {
    const agreement = await ctx.db.get(args.agreementId);
    if (!agreement) throw new ConvexError(`Agreement not found: ${args.agreementId}`);
    const subscription = await ctx.db.get(args.subscriptionId);
    if (!subscription) throw new ConvexError(`Subscription not found: ${args.subscriptionId}`);

    await ctx.db.patch(args.agreementId, { subscriptionId: args.subscriptionId });
    await ctx.db.patch(args.subscriptionId, { agreementId: args.agreementId });
  },
});

// ---------------------------------------------------------------------------
// getAgreement
// ---------------------------------------------------------------------------

export const getAgreement = protectedQuery({
  roles: ["manager", "admin"],
  args: { agreementId: v.id("supplyAgreements") },
  handler: async (ctx, args) => ctx.db.get(args.agreementId),
});

// ---------------------------------------------------------------------------
// listAgreementsByCustomer
// ---------------------------------------------------------------------------

export const listAgreementsByCustomer = protectedQuery({
  roles: ["manager", "admin"],
  args: { customerId: v.id("customers") },
  handler: async (ctx, args) =>
    ctx.db
      .query("supplyAgreements")
      .withIndex("by_customer", (q) => q.eq("customerId", args.customerId))
      .collect(),
});
