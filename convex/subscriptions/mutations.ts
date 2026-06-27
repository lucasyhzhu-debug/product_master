import { v, ConvexError } from "convex/values";
import { protectedMutation } from "../lib/functions";
import { deriveWeeklyQty } from "./creditMath";
import { effectiveDateOf } from "./enforcement/effectiveDates";

// dayOfWeek is 0-based-from-Monday (0=Mon … 6=Sun) — NOT the JS Sun=0 convention used by weekBounds.ts.
const scheduleTemplateArg = v.array(
  v.object({
    dayOfWeek: v.number(),
    items: v.array(v.object({ menuProductId: v.id("menuProducts"), qty: v.number() })),
  }),
);

export const createSubscription = protectedMutation({
  roles: ["manager", "admin"],
  args: {
    customerId: v.id("customers"),
    label: v.string(),
    unitPrice: v.number(),
    confidentialPrice: v.boolean(),
    baselineDailyQty: v.number(),
    deliverByTime: v.string(),
    creditRolloverPolicy: v.union(v.literal("expire"), v.literal("rollover")),
    rolloverExpiryWeeks: v.optional(v.union(v.number(), v.null())),
    cogsBasis: v.number(),
    startDate: v.number(),
    scheduleTemplate: scheduleTemplateArg,
    agreementId: v.optional(v.id("supplyAgreements")),
    notes: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const customer = await ctx.db.get(args.customerId);
    if (!customer) throw new ConvexError("Customer not found");
    // Task B9: a subscription customer is, by definition, B2B wholesale. Set the
    // durable revenue-category seam if unset (survives if the subscription later
    // ends). The at-delivery revenue bucket (recognition.ts) keys on this field.
    if (!customer.customerType) {
      await ctx.db.patch(customer._id, { customerType: "b2b_wholesale" });
    }
    return await ctx.db.insert("subscriptions", {
      ...args,
      weeklyQty: deriveWeeklyQty(args.scheduleTemplate),
      status: "draft",
      billingModel: "prepaid_weekly_credit",
      changeCutoffHour: 13,
      changeCutoffDayOffset: -1,
      permanentChangeNoticeDays: 14,
      terminationNoticeDays: 30,
      createdBy: ctx.user._id,
    });
  },
});

export const updateSubscription = protectedMutation({
  roles: ["manager", "admin"],
  args: {
    subscriptionId: v.id("subscriptions"),
    label: v.optional(v.string()),
    status: v.optional(
      v.union(v.literal("draft"), v.literal("active"), v.literal("terminating"), v.literal("ended")),
    ),
    unitPrice: v.optional(v.number()),
    baselineDailyQty: v.optional(v.number()),
    deliverByTime: v.optional(v.string()),
    creditRolloverPolicy: v.optional(v.union(v.literal("expire"), v.literal("rollover"))),
    rolloverExpiryWeeks: v.optional(v.union(v.number(), v.null())),
    terminationNoticeDate: v.optional(v.number()),
    endDate: v.optional(v.number()),
    scheduleTemplate: v.optional(scheduleTemplateArg),
    notes: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const { subscriptionId, ...rest } = args;
    const sub = await ctx.db.get(subscriptionId);
    if (!sub) throw new ConvexError("Subscription not found");
    const patch: Record<string, unknown> = Object.fromEntries(
      Object.entries(rest).filter(([, val]) => val !== undefined),
    );
    // Keep weeklyQty in lockstep with the template — re-derive whenever the
    // template changes, never accept a re-keyed weeklyQty (staffreview I2).
    if (rest.scheduleTemplate !== undefined) {
      patch.weeklyQty = deriveWeeklyQty(rest.scheduleTemplate);
    }
    await ctx.db.patch(subscriptionId, patch);
    return subscriptionId;
  },
});

export const scheduleBaselineChange = protectedMutation({
  roles: ["manager", "admin"],
  args: {
    subscriptionId: v.id("subscriptions"),
    newQty: v.number(),
  },
  handler: async (ctx, args) => {
    const sub = await ctx.db.get(args.subscriptionId);
    if (!sub) throw new ConvexError("Subscription not found");
    if (sub.status === "ended")
      throw new ConvexError("Subscription has ended; cannot schedule a baseline change");
    if (!Number.isInteger(args.newQty) || args.newQty <= 0)
      throw new ConvexError("newQty must be a positive integer");
    const effectiveDate = effectiveDateOf(Date.now(), sub.permanentChangeNoticeDays);
    await ctx.db.patch(args.subscriptionId, {
      pendingBaselineChange: { newQty: args.newQty, effectiveDate },
    });
    return { effectiveDate };
  },
});

/**
 * Cancel a not-yet-effective baseline change. Clears `pendingBaselineChange`.
 * No-op (idempotent) if none is pending.
 */
export const cancelBaselineChange = protectedMutation({
  roles: ["manager", "admin"],
  args: {
    subscriptionId: v.id("subscriptions"),
  },
  handler: async (ctx, args) => {
    const sub = await ctx.db.get(args.subscriptionId);
    if (!sub) throw new ConvexError("Subscription not found");
    if (sub.pendingBaselineChange !== undefined) {
      await ctx.db.patch(args.subscriptionId, { pendingBaselineChange: undefined });
    }
    return { cancelled: sub.pendingBaselineChange !== undefined };
  },
});

export const giveTerminationNotice = protectedMutation({
  roles: ["manager", "admin"],
  args: {
    subscriptionId: v.id("subscriptions"),
  },
  handler: async (ctx, args) => {
    const sub = await ctx.db.get(args.subscriptionId);
    if (!sub) throw new ConvexError("Subscription not found");
    if (sub.status === "terminating" || sub.status === "ended")
      throw new ConvexError(
        `Subscription is already ${sub.status}; cannot re-issue termination notice`,
      );
    const noticeDate = Date.now();
    const endDate = effectiveDateOf(noticeDate, sub.terminationNoticeDays);
    await ctx.db.patch(args.subscriptionId, {
      terminationNoticeDate: noticeDate,
      endDate,
      status: "terminating",
    });
    return { terminationNoticeDate: noticeDate, endDate };
  },
});
