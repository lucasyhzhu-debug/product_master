/**
 * CRM timeline mutations and queries — Phase D CRM surface.
 *
 * T19: logCustomerInteraction — inserts a customerActivity row for a manually logged event.
 * T21: getCustomerTimeline — returns a merged, windowed, actor-resolved timeline feed.
 *
 * Auth: manager + admin only (Pitfall #19 superset).
 */

import { v } from "convex/values";
import { protectedMutation, protectedQuery } from "../lib/functions";
import { buildCustomerTimeline, type TimelineItem } from "./helpers/timelineMerge";
import { eventTypeToCategory, type ActivityCategory } from "../lib/activityEvents";
import type { Id } from "../_generated/dataModel";

// Direction per activity category — mirrors ACTIVITY_TAXONOMY in src/lib/crmActivityTaxonomy.ts.
// Kept here (backend) to avoid importing from src/ in Convex functions.
const CATEGORY_DIRECTION: Record<ActivityCategory, "inbound" | "outbound" | "system"> = {
  order:     "system",
  finance:   "system",
  message:   "outbound",
  document:  "inbound",
  schedule:  "system",
  milestone: "system",
};

// ---------------------------------------------------------------------------
// T19: logCustomerInteraction
// ---------------------------------------------------------------------------

export const logCustomerInteraction = protectedMutation({
  roles: ["manager", "admin"],
  args: {
    customerId:     v.id("customers"),
    type:           v.union(
      v.literal("whatsapp_drafted"),
      v.literal("note"),
      v.literal("manual_milestone"),
    ),
    subtype:        v.optional(v.string()),
    note:           v.optional(v.string()),
    summary:        v.optional(v.string()),
    subscriptionId: v.optional(v.id("subscriptions")),
    invoiceId:      v.optional(v.id("invoices")),
    orderId:        v.optional(v.id("orders")),
    agreementId:    v.optional(v.id("supplyAgreements")),
  },
  handler: async (ctx, args) => {
    const { customerId, type, subtype, note, summary, subscriptionId, invoiceId, orderId, agreementId } = args;

    // Derive direction from category map (mirrors src/lib/crmActivityTaxonomy.ts).
    const category = eventTypeToCategory(type);
    const direction = CATEGORY_DIRECTION[category];

    const id = await ctx.db.insert("customerActivity", {
      customerId,
      type,
      subtype,
      note,
      summary,
      direction,
      at: Date.now(),
      actor: ctx.user._id,
      subscriptionId,
      invoiceId,
      orderId,
      agreementId,
    });
    return id;
  },
});

// ---------------------------------------------------------------------------
// T21: getCustomerTimeline
// ---------------------------------------------------------------------------

export const getCustomerTimeline = protectedQuery({
  roles: ["manager", "admin"],
  args: {
    customerId: v.id("customers"),
    sinceDays:  v.optional(v.number()), // default 14
    // types: in-memory category filter — post-scan (documented; audit #7/B8).
    types:      v.optional(v.array(v.string())),
    // cursor reserved for future pagination — not yet implemented (windowed approach)
    cursor:     v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const sinceDays = args.sinceDays ?? 14;
    const now = Date.now();
    const cutoff = now - sinceDays * 86_400_000;

    // -------------------------------------------------------------------
    // Collect all actor ids for a single batched name-map resolve.
    // -------------------------------------------------------------------
    const actorIds = new Set<Id<"users">>();
    const collectActor = (id: Id<"users"> | string | undefined) => {
      if (id && typeof id === "string") actorIds.add(id as Id<"users">);
    };

    // -------------------------------------------------------------------
    // 1. Orders via orders.by_customer_orderDate (windowed to cutoff — C9)
    // Business date: orderDate (timeline event: order_placed). Compound index bounds
    // the scan at the DB layer. Trade-off: order_delivered events for orders placed
    // just before the window are excluded — acceptable for the 14d default since
    // orders reach terminal status within days of placement.
    // -------------------------------------------------------------------
    const orders = await ctx.db
      .query("orders")
      .withIndex("by_customer_orderDate", (q) =>
        q.eq("customerId", args.customerId).gte("orderDate", cutoff),
      )
      .collect();

    for (const o of orders) {
      collectActor(o.createdByUserId);
    }

    // -------------------------------------------------------------------
    // 2. Invoices via invoices.by_customer_generatedAt (windowed to cutoff — C9)
    // Business date: generatedAt (timeline event: invoice_sent). Optional in schema
    // but always set for subscription invoices. Invoices without generatedAt are
    // excluded by the gte bound (undefined sorts below any number in Convex index).
    // -------------------------------------------------------------------
    const invoices = await ctx.db
      .query("invoices")
      .withIndex("by_customer_generatedAt", (q) =>
        q.eq("customerId", args.customerId).gte("generatedAt", cutoff),
      )
      .collect();

    for (const inv of invoices) {
      collectActor(inv.generatedBy);
    }

    // -------------------------------------------------------------------
    // 3. Subscriptions + creditLedger fan-out
    // -------------------------------------------------------------------
    const subscriptions = await ctx.db
      .query("subscriptions")
      .withIndex("by_customer", (q) => q.eq("customerId", args.customerId))
      .collect();

    for (const sub of subscriptions) {
      collectActor(sub.createdBy);
    }

    // Bounded fan-out: fetch ledger entries per subscription (a customer has few subs).
    // Business date: _creationTime (no explicit timestamp field on creditLedger).
    // by_subscription_creationTime compound index bounds each per-sub fetch to the
    // sinceDays window (C9 fix). Topup entries are the only type shown in the timeline.
    const ledgerBySub: Array<{
      subscriptionId: Id<"subscriptions">;
      entries: Array<{ _id: string; _creationTime: number; type: string; amount: number; createdBy: Id<"users"> }>;
    }> = [];
    for (const sub of subscriptions) {
      const entries = await ctx.db
        .query("creditLedger")
        .withIndex("by_subscription_creationTime", (q) =>
          q.eq("subscriptionId", sub._id).gte("_creationTime", cutoff),
        )
        .collect();
      for (const e of entries) {
        collectActor(e.createdBy);
      }
      ledgerBySub.push({ subscriptionId: sub._id, entries });
    }

    // -------------------------------------------------------------------
    // 4. Supply agreements via supplyAgreements.by_customer
    // -------------------------------------------------------------------
    const agreements = await ctx.db
      .query("supplyAgreements")
      .withIndex("by_customer", (q) => q.eq("customerId", args.customerId))
      .collect();

    for (const ag of agreements) {
      collectActor(ag.uploadedBy);
    }

    // -------------------------------------------------------------------
    // 5. Logged rows via customerActivity.by_customer_at (windowed)
    // -------------------------------------------------------------------
    const logged = await ctx.db
      .query("customerActivity")
      .withIndex("by_customer_at", (q) =>
        q.eq("customerId", args.customerId).gte("at", cutoff),
      )
      .collect();

    for (const row of logged) {
      collectActor(row.actor);
    }

    // -------------------------------------------------------------------
    // Batch resolve actor names (one ctx.db.get per distinct user id).
    // -------------------------------------------------------------------
    const actorMap = new Map<string, string>();
    for (const uid of actorIds) {
      const user = await ctx.db.get(uid);
      if (user) actorMap.set(uid, user.name);
    }

    // -------------------------------------------------------------------
    // Project derived domain rows into TimelineItem[]
    // -------------------------------------------------------------------
    const derived: TimelineItem[] = [];

    // Orders → order_placed / order_delivered
    for (const o of orders) {
      const actor = o.createdByUserId ? actorMap.get(o.createdByUserId) : undefined;
      const placedAt = o.orderDate ?? o._creationTime;
      derived.push({
        id:        `order_placed:${o._id}`,
        eventType: "order_placed",
        at:        placedAt,
        actor,
        title:     `Order #${o.orderNumber} placed`,
        detail:    o.customerName,
        linkTo:    { kind: "order", id: o._id },
      });
      // order_delivered: only when terminal with completedAt
      if (o.completedAt && (o.status === "CompleteShipped" || o.status === "PickedUp" || o.status === "Complete")) {
        derived.push({
          id:        `order_delivered:${o._id}`,
          eventType: "order_delivered",
          at:        o.completedAt,
          actor,
          title:     `Order #${o.orderNumber} delivered`,
          detail:    o.customerName,
          linkTo:    { kind: "order", id: o._id },
        });
      }
    }

    // Invoices → invoice_sent / payment_funded
    for (const inv of invoices) {
      const actor = actorMap.get(inv.generatedBy);
      const sentAt = inv.generatedAt ?? inv._creationTime;
      derived.push({
        id:        `invoice_sent:${inv._id}`,
        eventType: "invoice_sent",
        at:        sentAt,
        actor,
        title:     `Invoice ${inv.invoiceNumber ?? inv.orderNumber} sent`,
        detail:    `${inv.finalTotal.toLocaleString("id-ID")} IDR`,
        linkTo:    { kind: "invoice", id: inv._id },
      });
      if (inv.paymentStatus === "Paid") {
        derived.push({
          id:        `payment_funded:${inv._id}`,
          eventType: "payment_funded",
          at:        inv.updatedAt,
          actor,
          title:     `Invoice ${inv.invoiceNumber ?? inv.orderNumber} paid`,
          detail:    `${inv.finalTotal.toLocaleString("id-ID")} IDR`,
          linkTo:    { kind: "invoice", id: inv._id },
        });
      }
    }

    // Subscriptions → subscription_started / subscription_ended / subscription_terminated
    for (const sub of subscriptions) {
      const actor = actorMap.get(sub.createdBy);
      derived.push({
        id:        `subscription_started:${sub._id}`,
        eventType: "subscription_started",
        at:        sub.startDate,
        actor,
        title:     `Subscription "${sub.label}" started`,
        detail:    sub.label,
        linkTo:    { kind: "subscription", id: sub._id },
      });
      if (sub.endDate && sub.status === "ended") {
        derived.push({
          id:        `subscription_ended:${sub._id}`,
          eventType: "subscription_ended",
          at:        sub.endDate,
          actor,
          title:     `Subscription "${sub.label}" ended`,
          detail:    sub.label,
          linkTo:    { kind: "subscription", id: sub._id },
        });
      }
      if (sub.terminationNoticeDate && sub.status === "terminating") {
        derived.push({
          id:        `subscription_terminated:${sub._id}`,
          eventType: "subscription_terminated",
          at:        sub.terminationNoticeDate,
          actor,
          title:     `Subscription "${sub.label}" terminating`,
          detail:    sub.label,
          linkTo:    { kind: "subscription", id: sub._id },
        });
      }
    }

    // Credit ledger → topup (drawdowns are voluminous; surface topups only)
    for (const { subscriptionId, entries } of ledgerBySub) {
      for (const e of entries) {
        if (e.type === "topup") {
          const actor = actorMap.get(e.createdBy);
          derived.push({
            id:        `topup:${e._id}`,
            eventType: "topup" as const,
            at:        e._creationTime,
            actor,
            title:     `Credit top-up +${e.amount.toLocaleString("id-ID")} IDR`,
            detail:    `subscription ${subscriptionId}`,
            linkTo:    { kind: "subscription", id: subscriptionId },
          });
        }
      }
    }

    // Supply agreements → agreement_uploaded / agreement_signed
    for (const ag of agreements) {
      const actor = actorMap.get(ag.uploadedBy);
      derived.push({
        id:        `agreement_uploaded:${ag._id}`,
        eventType: "agreement_uploaded",
        at:        ag.uploadedAt,
        actor,
        title:     `Agreement "${ag.fileName}" uploaded`,
        detail:    ag.fileName,
        linkTo:    { kind: "agreement", id: ag._id },
      });
      if (ag.status === "signed" && ag.signedDate) {
        derived.push({
          id:        `agreement_signed:${ag._id}`,
          eventType: "agreement_signed",
          at:        ag.signedDate,
          actor,
          title:     `Agreement "${ag.fileName}" signed`,
          detail:    ag.fileName,
          linkTo:    { kind: "agreement", id: ag._id },
        });
      }
    }

    // -------------------------------------------------------------------
    // Project logged customerActivity rows into TimelineItem[]
    // -------------------------------------------------------------------
    const loggedItems: TimelineItem[] = logged.map((row) => ({
      id:        `logged:${row._id}`,
      eventType: row.type,
      at:        row.at,
      actor:     actorMap.get(row.actor),
      title:     row.summary ?? row.type,
      detail:    row.note ?? "",
      linkTo:    { kind: "activity", id: row._id },
    }));

    // -------------------------------------------------------------------
    // Merge via buildCustomerTimeline (windowed + sorted + type-filtered)
    // types filter is in-memory post-scan (documented; B8 — facets are
    // server-side indexed fields, but category is derived from eventType).
    // -------------------------------------------------------------------
    const typesFilter = args.types as ActivityCategory[] | undefined;

    const { items } = buildCustomerTimeline(derived, loggedItems, {
      sinceDays,
      types: typesFilter,
      now,
    });

    return { items };
  },
});
