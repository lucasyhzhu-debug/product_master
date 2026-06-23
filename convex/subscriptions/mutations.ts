import { v } from "convex/values";
import { ConvexError } from "convex/values";
import { protectedMutation } from "../lib/functions";

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
    // weeklyQty is DERIVED from the template (staffreview I2 — avoid drift), not re-keyed.
    const weeklyQty = args.scheduleTemplate.reduce(
      (sum, day) => sum + day.items.reduce((s, it) => s + it.qty, 0),
      0,
    );
    return await ctx.db.insert("subscriptions", {
      ...args,
      weeklyQty,
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
    weeklyQty: v.optional(v.number()),
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
    const patch = Object.fromEntries(Object.entries(rest).filter(([, v]) => v !== undefined));
    await ctx.db.patch(subscriptionId, patch);
    return subscriptionId;
  },
});
