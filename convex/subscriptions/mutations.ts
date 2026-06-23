import { v, ConvexError } from "convex/values";
import { protectedMutation } from "../lib/functions";

const scheduleTemplateArg = v.array(
  v.object({
    dayOfWeek: v.number(),
    items: v.array(v.object({ menuProductId: v.id("menuProducts"), qty: v.number() })),
  }),
);

type ScheduleTemplate = { dayOfWeek: number; items: { qty: number }[] }[];

// weeklyQty is always DERIVED from the schedule template (staffreview I2 — avoid drift),
// never re-keyed by a caller. Single derivation path for both create and update.
function deriveWeeklyQty(template: ScheduleTemplate): number {
  return template.reduce(
    (sum, day) => sum + day.items.reduce((s, it) => s + it.qty, 0),
    0,
  );
}

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
