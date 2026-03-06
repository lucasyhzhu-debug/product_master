/**
 * Weekly plan channel assembly helpers.
 * Ctx-dependent functions that build channel sections for the dispatch planner grid.
 * Each function assembles one channel's outlet rows and product cells.
 * NOTE: These functions MUTATE their section/dailyTotals/dailyChannelProductQty parameters in place.
 * They are NOT pure functions -- they require ctx for DB queries and modify input objects.
 */
import type { Doc, Id } from "../../_generated/dataModel";
import type { ChannelSection, ProductRow, PlanCell } from "../types";
import { epochToDateString, CHANNEL_COLORS } from "../helpers";

/**
 * Direct Sales channel: each order with dueDate in the window becomes an outlet row.
 * Quantities count in dailyTotals only at dueDate (not production-start day).
 */
export async function assembleDirectChannel(
  ctx: { db: any },
  section: ChannelSection,
  dates: string[],
  todayStr: string,
  dailyTotals: Record<string, Record<string, number>>,
  menuProductMap: Map<string, Doc<"menuProducts">>,
  allDispatchPlans: Doc<"dispatchPlans">[],
  dailyChannelProductQty: Record<string, Record<string, Record<string, number>>>,
): Promise<void> {
  const dateSet = new Set(dates);
  const firstDate = dates[0];
  const lastDate = dates[dates.length - 1];

  // Convert date range to epoch for querying orders by dueDate
  const rangeStart = new Date(firstDate + "T00:00:00+07:00").getTime();
  const rangeEnd = new Date(lastDate + "T23:59:59+07:00").getTime();

  // Fetch orders with dueDate in range (exclude Draft and Cancelled)
  const orders = await ctx.db
    .query("orders")
    .withIndex("by_status_due_date")
    .collect();

  // Filter: dueDate in range, not Draft/Cancelled
  const excludeStatuses = new Set(["Draft", "Cancelled"]);
  const relevantOrders = orders.filter((o: Doc<"orders">) => {
    if (!o.dueDate) return false;
    if (excludeStatuses.has(o.status)) return false;
    return o.dueDate >= rangeStart && o.dueDate <= rangeEnd;
  });

  // Aggregate all orders into per-product-per-date totals (not one row per order)
  // aggregatedQty[date][mpId] = { name, qty }
  const aggregatedQty = new Map<string, Map<string, { name: string; qty: number }>>();
  for (const date of dates) {
    aggregatedQty.set(date, new Map());
  }

  for (const order of relevantOrders) {
    const dueDateStr = epochToDateString(order.dueDate!);
    if (!dateSet.has(dueDateStr)) continue;

    const items = await ctx.db
      .query("orderItems")
      .withIndex("by_order", (q: any) => q.eq("orderId", order._id))
      .collect();

    const dateMap = aggregatedQty.get(dueDateStr)!;
    for (const item of items) {
      if (item.isCancelled) continue;
      const mpId = item.menuProductId ? (item.menuProductId as string) : item.productName;
      const existing = dateMap.get(mpId);
      if (existing) {
        existing.qty += item.quantity;
      } else {
        dateMap.set(mpId, { name: item.productName, qty: item.quantity });
      }
    }
  }

  // Collect all unique product IDs across all dates
  const allProductIds = new Map<string, string>(); // mpId -> name
  for (const dateMap of aggregatedQty.values()) {
    for (const [mpId, { name }] of dateMap) {
      if (!allProductIds.has(mpId)) allProductIds.set(mpId, name);
    }
  }

  if (allProductIds.size > 0) {
    const products: ProductRow[] = [];
    for (const [mpId, name] of allProductIds) {
      const cells: Record<string, PlanCell> = {};
      for (const date of dates) {
        const qty = aggregatedQty.get(date)?.get(mpId)?.qty ?? 0;
        cells[date] = {
          plannedQty: qty,
          source: qty > 0 ? "order" : "none",
          isReadOnly: true,
        };
      }
      products.push({
        menuProductId: mpId as Id<"menuProducts">,
        productName: name,
        cells,
      });
    }

    // Update daily totals and per-channel product qty for BOM expansion
    for (const [date, dateMap] of aggregatedQty) {
      for (const [mpId, { qty }] of dateMap) {
        dailyTotals[date]["direct"] = (dailyTotals[date]["direct"] ?? 0) + qty;
        if (!dailyChannelProductQty[date]) dailyChannelProductQty[date] = {};
        if (!dailyChannelProductQty[date]["direct"]) dailyChannelProductQty[date]["direct"] = {};
        dailyChannelProductQty[date]["direct"][mpId] = (dailyChannelProductQty[date]["direct"][mpId] ?? 0) + qty;
      }
    }

    section.outlets.push({
      id: "direct-orders",
      name: "Orders (Aggregated)",
      type: "outlet",
      products,
    });
  }

  // Add a "Planned (Manual)" outlet for ad-hoc direct sales planning
  const manualProducts: ProductRow[] = [];
  const manualDirectPlans = allDispatchPlans.filter(
    (p) => p.channel === "direct" && !p.orderId
  );

  for (const [mpId, mp] of menuProductMap) {
    const mpPlans = manualDirectPlans.filter(
      (p) => (p.menuProductId as string) === mpId
    );

    const cells: Record<string, PlanCell> = {};
    for (const date of dates) {
      const isPast = date < todayStr;
      const plan = mpPlans.find((p) => p.date === date);
      cells[date] = {
        plannedQty: plan?.plannedQty ?? 0,
        source: plan?.source ?? "none",
        isReadOnly: isPast,
      };

      // Add manual planned qty to daily totals
      if ((plan?.plannedQty ?? 0) > 0) {
        dailyTotals[date]["direct"] =
          (dailyTotals[date]["direct"] ?? 0) + (plan?.plannedQty ?? 0);
        // Track per-channel per-product qty for ball total computation
        if (!dailyChannelProductQty[date]) dailyChannelProductQty[date] = {};
        if (!dailyChannelProductQty[date]["direct"]) dailyChannelProductQty[date]["direct"] = {};
        dailyChannelProductQty[date]["direct"][mpId] =
          (dailyChannelProductQty[date]["direct"][mpId] ?? 0) + (plan?.plannedQty ?? 0);
      }
    }

    manualProducts.push({
      menuProductId: mpId as Id<"menuProducts">,
      productName: mp.name,
      cells,
    });
  }

  if (manualProducts.length > 0) {
    section.outlets.push({
      id: "direct-manual",
      name: "Planned (Manual)",
      type: "outlet",
      products: manualProducts,
    });
  }
}

/**
 * GoFood channel: each active gobiz outlet becomes a row.
 * Past days use actual sales from externalRevenue; future days use dispatchPlans.
 */
export async function assembleGofoodChannel(
  ctx: { db: any },
  section: ChannelSection,
  dates: string[],
  todayStr: string,
  dailyTotals: Record<string, Record<string, number>>,
  menuProductMap: Map<string, Doc<"menuProducts">>,
  allDispatchPlans: Doc<"dispatchPlans">[],
  dailyChannelProductQty: Record<string, Record<string, Record<string, number>>>,
): Promise<void> {
  // Fetch active GoFood outlets (MIS-02: compound index)
  const gofoodOutlets = await ctx.db
    .query("externalOutlets")
    .withIndex("by_source_active", (q: any) => q.eq("source", "gobiz").eq("isActive", true))
    .collect();

  // Fetch external revenue for the date range
  const firstDate = dates[0];
  const lastDate = dates[dates.length - 1];
  const rangeStart = new Date(firstDate + "T00:00:00+07:00").getTime();
  const rangeEnd = new Date(lastDate + "T00:00:00+07:00").getTime() + 24 * 60 * 60 * 1000;

  // IRB-02: both period bounds at index level (exclusive upper bound)
  const revenueRecords = await ctx.db
    .query("externalRevenue")
    .withIndex("by_source_period", (q: any) =>
      q.eq("source", "gobiz").gte("periodStart", rangeStart).lt("periodStart", rangeEnd)
    )
    .collect();

  // Filter dispatch plans for gofood channel
  const gofoodPlans = allDispatchPlans.filter(
    (p: Doc<"dispatchPlans">) => p.channel === "gofood"
  );

  for (const outlet of gofoodOutlets) {
    // Get revenue for this outlet
    const outletRevenue = revenueRecords.filter(
      (r: Doc<"externalRevenue">) => r.outletId === outlet._id
    );

    // Get plans for this outlet
    const outletPlans = gofoodPlans.filter(
      (p: Doc<"dispatchPlans">) => p.outletId === outlet._id
    );

    // Build product rows from existing plans, revenue, and all POS-active products
    const productIds = new Set<string>();
    for (const plan of outletPlans) {
      productIds.add(plan.menuProductId as string);
    }
    for (const rev of outletRevenue) {
      if (rev.linkedMenuProductId) {
        productIds.add(rev.linkedMenuProductId as string);
      }
    }
    // Always show all active POS products so managers can plan even without prior data
    for (const mpId of menuProductMap.keys()) {
      productIds.add(mpId as string);
    }

    const products: ProductRow[] = [];
    for (const mpId of productIds) {
      const mp = menuProductMap.get(mpId);
      const productName = mp?.name ?? "Unknown";

      const cells: Record<string, PlanCell> = {};
      for (const date of dates) {
        const isPast = date < todayStr;
        const dateStart = new Date(date + "T00:00:00+07:00").getTime();
        const dateEnd = dateStart + 24 * 60 * 60 * 1000;

        if (isPast) {
          // Past: use actual sales from externalRevenue
          const dayRevenue = outletRevenue.filter(
            (r: Doc<"externalRevenue">) =>
              r.linkedMenuProductId === mpId &&
              r.periodStart >= dateStart &&
              r.periodStart < dateEnd
          );
          const actualQty = dayRevenue.reduce(
            (sum: number, r: Doc<"externalRevenue">) =>
              sum + (r.quantitySold ?? 0),
            0
          );

          // Also check if there was a planned qty
          const plan = outletPlans.find(
            (p: Doc<"dispatchPlans">) =>
              p.date === date && (p.menuProductId as string) === mpId
          );

          cells[date] = {
            plannedQty: plan?.plannedQty ?? 0,
            actualQty,
            source: plan?.source ?? "actual",
            isReadOnly: true,
          };
        } else {
          // Future: use dispatchPlans
          const plan = outletPlans.find(
            (p: Doc<"dispatchPlans">) =>
              p.date === date && (p.menuProductId as string) === mpId
          );
          cells[date] = {
            plannedQty: plan?.plannedQty ?? 0,
            source: plan?.source ?? "none",
            isReadOnly: false,
          };
        }
      }

      products.push({
        menuProductId: mpId as Id<"menuProducts">,
        productName,
        cells,
      });

      // Add to daily totals
      for (const date of dates) {
        const qty = cells[date]?.plannedQty ?? 0;
        if (qty > 0) {
          dailyTotals[date]["gofood"] =
            (dailyTotals[date]["gofood"] ?? 0) + qty;
          // Track per-channel per-product qty for ball total computation
          if (!dailyChannelProductQty[date]) dailyChannelProductQty[date] = {};
          if (!dailyChannelProductQty[date]["gofood"]) dailyChannelProductQty[date]["gofood"] = {};
          dailyChannelProductQty[date]["gofood"][mpId] =
            (dailyChannelProductQty[date]["gofood"][mpId] ?? 0) + qty;
        }
      }
    }

    section.outlets.push({
      id: outlet._id as string,
      name: outlet.name,
      type: "outlet",
      products,
    });
  }
}

/**
 * K3Mart channel: editable. Uses dispatchPlans for future cells,
 * k3martDispatchPlans as baseline/past data (from K3Mart Cockpit).
 * Past days show data from k3martDispatchPlans (read-only).
 * Future days are editable via dispatchPlans table.
 */
export async function assembleK3martChannel(
  ctx: { db: any },
  section: ChannelSection,
  dates: string[],
  todayStr: string,
  dailyTotals: Record<string, Record<string, number>>,
  menuProductMap: Map<string, Doc<"menuProducts">>,
  allDispatchPlans: Doc<"dispatchPlans">[],
  dailyChannelProductQty: Record<string, Record<string, Record<string, number>>>,
): Promise<void> {
  // Fetch active K3Mart outlets (MIS-02: compound index)
  const k3martOutlets = await ctx.db
    .query("externalOutlets")
    .withIndex("by_source_active", (q: any) => q.eq("source", "k3mart").eq("isActive", true))
    .collect();

  // Fetch k3mart dispatch plans (from K3Mart Cockpit) for baseline/past data
  const allK3Plans: Doc<"k3martDispatchPlans">[] = [];
  for (const date of dates) {
    const plans = await ctx.db
      .query("k3martDispatchPlans")
      .withIndex("by_date_status", (q: any) => q.eq("date", date))
      .collect();
    allK3Plans.push(...plans);
  }

  // Filter dispatch plans for k3mart channel (editable overrides)
  const k3martEditablePlans = allDispatchPlans.filter(
    (p: Doc<"dispatchPlans">) => p.channel === "k3mart"
  );

  for (const outlet of k3martOutlets) {
    const outletK3Plans = allK3Plans.filter(
      (p: Doc<"k3martDispatchPlans">) => p.outletId === outlet._id
    );
    const outletEditablePlans = k3martEditablePlans.filter(
      (p: Doc<"dispatchPlans">) => p.outletId === outlet._id
    );

    // Group by menuProductId - include all sources
    const productIds = new Set<string>();
    for (const plan of outletK3Plans) {
      productIds.add(plan.menuProductId as string);
    }
    for (const plan of outletEditablePlans) {
      productIds.add(plan.menuProductId as string);
    }
    // Always show all active POS products so managers can plan even without prior data
    for (const mpId of menuProductMap.keys()) {
      productIds.add(mpId as string);
    }

    const products: ProductRow[] = [];
    for (const mpId of productIds) {
      const mp = menuProductMap.get(mpId);
      const productName = mp?.name ?? "Unknown";

      const cells: Record<string, PlanCell> = {};
      for (const date of dates) {
        const isPast = date < todayStr;

        // K3Mart Cockpit baseline plan for this cell
        const k3Plan = outletK3Plans.find(
          (p: Doc<"k3martDispatchPlans">) =>
            p.date === date && (p.menuProductId as string) === mpId
        );

        // Editable dispatch plan override
        const editablePlan = outletEditablePlans.find(
          (p: Doc<"dispatchPlans">) =>
            p.date === date && (p.menuProductId as string) === mpId
        );

        if (isPast) {
          // Past: read-only, prefer editable plan if saved, else k3mart baseline
          cells[date] = {
            plannedQty: editablePlan?.plannedQty ?? k3Plan?.plannedQty ?? 0,
            source: editablePlan ? "manual" : k3Plan ? "k3mart" : "none",
            isReadOnly: true,
          };
        } else {
          // Future: editable via dispatchPlans, use k3mart baseline as fallback
          const plannedQty = editablePlan?.plannedQty ?? k3Plan?.plannedQty ?? 0;
          cells[date] = {
            plannedQty,
            source: editablePlan?.source ?? (k3Plan ? "k3mart" : "none"),
            isReadOnly: false,
          };
        }
      }

      products.push({
        menuProductId: mpId as Id<"menuProducts">,
        productName,
        cells,
      });

      // Add to daily totals
      for (const date of dates) {
        const qty = cells[date]?.plannedQty ?? 0;
        if (qty > 0) {
          dailyTotals[date]["k3mart"] =
            (dailyTotals[date]["k3mart"] ?? 0) + qty;
          // Track per-channel per-product qty for ball total computation
          if (!dailyChannelProductQty[date]) dailyChannelProductQty[date] = {};
          if (!dailyChannelProductQty[date]["k3mart"]) dailyChannelProductQty[date]["k3mart"] = {};
          dailyChannelProductQty[date]["k3mart"][mpId] =
            (dailyChannelProductQty[date]["k3mart"][mpId] ?? 0) + qty;
        }
      }
    }

    section.outlets.push({
      id: outlet._id as string,
      name: outlet.name,
      type: "outlet",
      products,
    });
  }
}

/**
 * Consignment channel: editable. Uses consignmentOutlets + dispatchPlans.
 */
export async function assembleConsignmentChannel(
  ctx: { db: any },
  section: ChannelSection,
  dates: string[],
  todayStr: string,
  dailyTotals: Record<string, Record<string, number>>,
  menuProductMap: Map<string, Doc<"menuProducts">>,
  allDispatchPlans: Doc<"dispatchPlans">[],
  dailyChannelProductQty: Record<string, Record<string, Record<string, number>>>,
): Promise<void> {
  // Fetch active consignment outlets (unified table)
  const consignmentOutlets = await ctx.db
    .query("consignmentOutlets")
    .withIndex("by_active", (q: any) => q.eq("isActive", true))
    .collect();

  // Filter dispatch plans for consignment channel
  const consignmentPlans = allDispatchPlans.filter(
    (p: Doc<"dispatchPlans">) => p.channel === "consignment"
  );

  for (const outlet of consignmentOutlets) {
    // Get plans for this outlet (match by outletId field in dispatchPlans)
    // For consignment, outletId on dispatchPlans stores the consignment outlet _id cast as externalOutlets id
    // We match by string comparison
    const outletPlans = consignmentPlans.filter(
      (p: Doc<"dispatchPlans">) => (p.outletId as unknown as string) === (outlet._id as string)
    );

    // For consignment outlets, only show explicitly mapped products (+ any with existing plans)
    const productIds = new Set<string>();
    for (const mapping of (outlet.productMappings ?? [])) {
      productIds.add(mapping.menuProductId as string);
    }
    for (const plan of outletPlans) {
      // Only include plan products that are still in the active menu
      if (menuProductMap.has(plan.menuProductId as string)) {
        productIds.add(plan.menuProductId as string);
      }
    }

    const products: ProductRow[] = [];
    for (const mpId of productIds) {
      const mp = menuProductMap.get(mpId);
      const productName = mp?.name ?? "Unknown";

      const cells: Record<string, PlanCell> = {};
      for (const date of dates) {
        const isPast = date < todayStr;
        const plan = outletPlans.find(
          (p: Doc<"dispatchPlans">) =>
            p.date === date && (p.menuProductId as string) === mpId
        );
        cells[date] = {
          plannedQty: plan?.plannedQty ?? 0,
          actualQty: plan?.actualQty ?? undefined,
          source: plan?.source ?? "none",
          isReadOnly: isPast,
        };
      }

      products.push({
        menuProductId: mpId as Id<"menuProducts">,
        productName,
        cells,
      });

      // Add to daily totals
      for (const date of dates) {
        const qty = cells[date]?.plannedQty ?? 0;
        if (qty > 0) {
          dailyTotals[date]["consignment"] =
            (dailyTotals[date]["consignment"] ?? 0) + qty;
          // Track per-channel per-product qty for ball total computation
          if (!dailyChannelProductQty[date]) dailyChannelProductQty[date] = {};
          if (!dailyChannelProductQty[date]["consignment"]) dailyChannelProductQty[date]["consignment"] = {};
          dailyChannelProductQty[date]["consignment"][mpId] =
            (dailyChannelProductQty[date]["consignment"][mpId] ?? 0) + qty;
        }
      }
    }

    section.outlets.push({
      id: outlet._id as string,
      name: outlet.name,
      type: "consignment",
      products,
    });
  }
}

/**
 * Compute BOM-expanded ball totals from daily per-channel per-product quantities.
 * Loads BOM and componentTypes once, builds internal Maps, and resolves product
 * quantities to ball counts via the resolveBalls helper (defined internally).
 */
export async function computeBallTotals(
  ctx: { db: any },
  dates: string[],
  dailyChannelProductQty: Record<string, Record<string, Record<string, number>>>,
): Promise<{
  dailyBallTotals: Record<string, number>;
  dailyBallTotalsByChannel: Record<string, Record<string, number>>;
}> {
  // 1. Load BOM + componentTypes from DB
  const allBomEntriesForBalls = await ctx.db.query("menuProductComponents").collect();
  const componentTypesForBalls = await ctx.db
    .query("componentTypes")
    .withIndex("by_active", (q: any) => q.eq("isActive", true))
    .collect();

  // 2. Build lookup Maps
  const componentTypeMapForBalls = new Map<string, Doc<"componentTypes">>();
  for (const ct of componentTypesForBalls) {
    componentTypeMapForBalls.set(ct._id as string, ct);
  }
  const bomByProductForBalls = new Map<string, Doc<"menuProductComponents">[]>();
  for (const entry of allBomEntriesForBalls) {
    const mpId = entry.menuProductId as string;
    if (!bomByProductForBalls.has(mpId)) bomByProductForBalls.set(mpId, []);
    bomByProductForBalls.get(mpId)!.push(entry);
  }

  // 3. Helper: resolve product qty to ball count via BOM
  function resolveBalls(mpId: string, qty: number): number {
    let balls = 0;
    const bom = bomByProductForBalls.get(mpId) ?? [];
    for (const entry of bom) {
      const ct = componentTypeMapForBalls.get(entry.componentTypeId as string);
      if (!ct || ct.category !== "production") continue;
      balls += qty * entry.quantity;
    }
    return balls;
  }

  // 4. Iterate dates x channels x products to compute ball totals
  const dailyBallTotals: Record<string, number> = {};
  const dailyBallTotalsByChannel: Record<string, Record<string, number>> = {};
  for (const date of dates) {
    let dateBalls = 0;
    dailyBallTotalsByChannel[date] = {};
    const channelProductQty = dailyChannelProductQty[date] ?? {};
    for (const [channel, productQtyMap] of Object.entries(channelProductQty)) {
      let channelBalls = 0;
      for (const [mpId, qty] of Object.entries(productQtyMap)) {
        channelBalls += resolveBalls(mpId, qty);
      }
      dailyBallTotalsByChannel[date][channel] = channelBalls;
      dateBalls += channelBalls;
    }
    dailyBallTotals[date] = dateBalls;
  }

  return { dailyBallTotals, dailyBallTotalsByChannel };
}
