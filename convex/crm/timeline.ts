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
import { eventTypeToCategory, CATEGORY_DIRECTION, type ActivityCategory } from "../lib/activityEvents";
import type { Id } from "../_generated/dataModel";

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
  },
  handler: async (ctx, args) => {
    const sinceDays = args.sinceDays ?? 14;
    const now = Date.now();
    const cutoff = now - sinceDays * 86_400_000;

    // -------------------------------------------------------------------
    // Collect all actor ids for a single batched name-map resolve.
    // -------------------------------------------------------------------
    const actorIds = new Set<Id<"users">>();
    const collectActor = (id: Id<"users"> | undefined) => {
      if (id) actorIds.add(id);
    };

    // -------------------------------------------------------------------
    // Collect the 5 independent top-level reads in parallel (C9-windowed):
    //   1. Orders   — by_customer_orderDate, gte cutoff. Business date: orderDate.
    //      Trade-off: order_delivered events for orders placed just before the
    //      window are excluded — acceptable for the 14d default.
    //   2. Invoices — by_customer_generatedAt, gte cutoff. Business date: generatedAt
    //      (always set for subscription invoices; undefined sorts below any number).
    //      KNOWN LIMITATION (audit I5): window keyed on generatedAt, but
    //      payment_funded emits at inv.updatedAt; an invoice generated BEFORE but
    //      paid INSIDE the window is dropped. Needs a dedicated paidAt field — OOS.
    //   3. Subscriptions — by_customer (drives the ledger fan-out below).
    //   4. Supply agreements — by_customer.
    //   5. Logged rows — by_customer_at, gte cutoff.
    // -------------------------------------------------------------------
    const [orders, invoices, subscriptions, agreements, logged] = await Promise.all([
      ctx.db
        .query("orders")
        .withIndex("by_customer_orderDate", (q) =>
          q.eq("customerId", args.customerId).gte("orderDate", cutoff),
        )
        .collect(),
      ctx.db
        .query("invoices")
        .withIndex("by_customer_generatedAt", (q) =>
          q.eq("customerId", args.customerId).gte("generatedAt", cutoff),
        )
        .collect(),
      ctx.db
        .query("subscriptions")
        .withIndex("by_customer", (q) => q.eq("customerId", args.customerId))
        .collect(),
      ctx.db
        .query("supplyAgreements")
        .withIndex("by_customer", (q) => q.eq("customerId", args.customerId))
        .collect(),
      ctx.db
        .query("customerActivity")
        .withIndex("by_customer_at", (q) =>
          q.eq("customerId", args.customerId).gte("at", cutoff),
        )
        .collect(),
    ]);

    for (const o of orders) collectActor(o.createdByUserId);
    for (const inv of invoices) collectActor(inv.generatedBy);
    for (const sub of subscriptions) collectActor(sub.createdBy);
    for (const ag of agreements) collectActor(ag.uploadedBy);
    for (const row of logged) collectActor(row.actor);

    // Bounded fan-out: fetch ledger entries per subscription (a customer has few subs),
    // parallelized across subs. Business date: _creationTime (no explicit timestamp
    // field on creditLedger). by_subscription_creationTime bounds each per-sub fetch
    // to the sinceDays window (C9). Topup entries are the only type shown in the timeline.
    const ledgerBySub = await Promise.all(
      subscriptions.map(async (sub) => {
        const entries = await ctx.db
          .query("creditLedger")
          .withIndex("by_subscription_creationTime", (q) =>
            q.eq("subscriptionId", sub._id).gte("_creationTime", cutoff),
          )
          .collect();
        return { subscriptionId: sub._id, entries };
      }),
    );
    for (const { entries } of ledgerBySub) {
      for (const e of entries) collectActor(e.createdBy);
    }

    // -------------------------------------------------------------------
    // Batch resolve actor names (one ctx.db.get per distinct user id).
    // -------------------------------------------------------------------
    const actorMap = new Map<string, string>();
    await Promise.all(
      Array.from(actorIds).map(async (uid) => {
        const u = await ctx.db.get(uid);
        if (u) actorMap.set(uid, u.name);
      }),
    );

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
          // Drives the SUBTYPE_ICON "funded" (✓) override in getActivityVisual.
          subtype:   "funded",
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
      // Pass the stored subtype through so SUBTYPE_ICON overrides (e.g. "reconcile")
      // surface for logged rows. NOTE: week_reconciled is not currently emitted as a
      // DERIVED event (no producer), so the "reconcile" override only lands via this
      // logged-row passthrough today.
      subtype:   row.subtype,
    }));

    // -------------------------------------------------------------------
    // Merge via buildCustomerTimeline (windowed + sorted + type-filtered)
    // types filter is in-memory post-scan (documented; B8 — facets are
    // server-side indexed fields, but category is derived from eventType).
    // -------------------------------------------------------------------
    // Narrow the requested categories to KNOWN ActivityCategory values so an unknown
    // string (e.g. a typo or stale client) can't silently empty the feed via a filter
    // that matches nothing.
    const typesFilter = args.types?.filter((t): t is ActivityCategory =>
      (["order", "finance", "message", "document", "schedule", "milestone"] as string[]).includes(t),
    );

    const { items } = buildCustomerTimeline(derived, loggedItems, {
      sinceDays,
      types: typesFilter,
      now,
    });

    return { items };
  },
});
