/**
 * Phase 74 Staff Attendance — shared aggregation helper.
 *
 * Neutral module (no `query()` wrapper) consumed by BOTH:
 *   - convex/kitchenShiftRecords/queries.ts :: getStaffPerformanceSummary
 *     (called with no userIdFilter → returns all staff)
 *   - convex/staffAttendance/queries.ts     :: getMyPerformance
 *     (called with userIdFilter = caller._id → hard-scoped to the session user
 *      for T-74-03 info-disclosure mitigation)
 *
 * Both importers depend on this module one-directionally → no circular risk.
 *
 * The helper additively extends the original getStaffPerformanceSummary shape
 * with hours/attendance fields:
 *   - totalHoursWorked        — sum of closed durationMs / 3_600_000
 *                               (open shifts contribute 0 per D-03)
 *   - daysAttended            — distinct dates with ≥1 clock-in
 *   - flaggedShiftCount       — sessions with any flag reason
 *   - perDayBreakdown[]       — per-date hours + sessions + componentTotals
 *
 * Also runs the flag engine at query time (no stored flags) — flagReasons
 * surface through each session summary.
 */

import type { QueryCtx } from "../_generated/server";
import type { Doc, Id } from "../_generated/dataModel";
import { detectFlags, detectOverlaps, type FlagReason } from "./flagEngine";
import { type ComponentUnit, resolveUnit } from "../lib/componentUnit";
import { isProductionUnit } from "../reports/productionUnitHelpers";

interface AggregateArgs {
  startDate: string;
  endDate: string;
  userIdFilter?: Id<"users">;
}

interface TrackingEntry {
  code: string;
  tracked: boolean;
  unit: ComponentUnit;
  name: string;
}

interface SessionSummary {
  attendanceId: Id<"staffAttendance">;
  clockIn: number;
  clockOut: number | null;
  durationMs: number | null;
  isFlagged: boolean;
  flagReasons: FlagReason[];
}

interface ComponentTotal {
  code: string;
  name: string;
  unit: ComponentUnit;
  quantity: number;
}

interface PerDayEntry {
  date: string;
  hoursWorked: number;
  sessions: SessionSummary[];
  ballsProduced: number;
  componentTotals: ComponentTotal[];
}

/**
 * D-14 adapter: builds the `TrackingEntry[]` map from whichever
 * kitchenConfig shape is on disk. Works in both the main-tree state
 * (legacy `enabledProductionComponents` / `enabledKitchenComponents` arrays)
 * and the worktree-merged state (`componentTracking: { code, tracked, unit }[]`).
 *
 * When `componentTracking` is present it wins (worktree merged). Otherwise we
 * derive from `componentTypes` (production → "pcs") + `kitchenComponents` ("g")
 * tables directly, using the legacy enabled-arrays as the tracked filter.
 */
async function buildTrackingMap(ctx: QueryCtx): Promise<TrackingEntry[]> {
  const kitchenConfig = await ctx.db.query("kitchenConfig").first();
  const componentTypesAll = await ctx.db.query("componentTypes").collect();
  const kitchenComponentsAll = await ctx.db.query("kitchenComponents").collect();
  const configAny = kitchenConfig as unknown as {
    componentTracking?: Array<{ code: string; tracked?: boolean; unit: ComponentUnit }>;
    enabledProductionComponents?: string[];
    enabledKitchenComponents?: string[];
  } | null;

  const tracking: TrackingEntry[] = [];

  if (configAny && Array.isArray(configAny.componentTracking)) {
    // Worktree merged: componentTracking is authoritative.
    for (const t of configAny.componentTracking) {
      const ct = componentTypesAll.find((c) => c.code === t.code);
      const kc = kitchenComponentsAll.find((c) => c.code === t.code);
      tracking.push({
        code: t.code,
        tracked: t.tracked !== false,
        unit: t.unit,
        name: ct?.name ?? kc?.name ?? t.code,
      });
    }
    return tracking;
  }

  // Main tree: derive from componentTypes + kitchenComponents tables.
  const enabledProd: Set<string> | null = Array.isArray(
    configAny?.enabledProductionComponents,
  )
    ? new Set(configAny!.enabledProductionComponents)
    : null;
  const enabledKitch: Set<string> | null = Array.isArray(
    configAny?.enabledKitchenComponents,
  )
    ? new Set(configAny!.enabledKitchenComponents)
    : null;
  for (const ct of componentTypesAll) {
    if (ct.category !== "production") continue;
    const isTracked = enabledProd === null ? true : enabledProd.has(ct.code);
    tracking.push({
      code: ct.code,
      tracked: isTracked,
      unit: "pcs",
      name: ct.name,
    });
  }
  for (const kc of kitchenComponentsAll) {
    const isTracked = enabledKitch === null ? true : enabledKitch.has(kc.code);
    tracking.push({
      code: kc.code,
      tracked: isTracked,
      unit: "g",
      name: kc.name,
    });
  }
  return tracking;
}

/**
 * Main aggregation. Returns the same shape as the original
 * `getStaffPerformanceSummary`, additively extended with attendance fields.
 *
 * Applies `userIdFilter` at two call sites:
 *  1. kitchenShiftRecords scan → filter by chefUserId
 *  2. staffAttendance scan    → filter by userId
 * Keeping the range-scan wide and filtering post-collect is fine here:
 * staff performance queries are manager-bounded (small data volumes) and the
 * alternative (per-user by_user_date scan) would require an outer loop over
 * all users which is worse.
 */
export async function aggregateStaffPerformance(
  ctx: QueryCtx,
  { startDate, endDate, userIdFilter }: AggregateArgs,
) {
  // --- 1. Range-scan both data sources ---
  const recordsAll = await ctx.db
    .query("kitchenShiftRecords")
    .withIndex("by_date", (q) => q.gte("date", startDate).lte("date", endDate))
    .collect();
  const records =
    userIdFilter !== undefined
      ? recordsAll.filter((r) => (r.chefUserId ?? r.submittedByUserId) === userIdFilter)
      : recordsAll;

  const attendanceAll = await ctx.db
    .query("staffAttendance")
    .withIndex("by_date", (q) => q.gte("date", startDate).lte("date", endDate))
    .collect();
  const activeAttendance = attendanceAll.filter(
    (r) => !r.deletedAt && (userIdFilter === undefined || r.userId === userIdFilter),
  );

  // --- 2. Pre-fetch componentTypes for BOM resolution + D-14 tracking map ---
  const allComponentTypes = await ctx.db.query("componentTypes").collect();
  const componentTypeMap = new Map(
    allComponentTypes.map((ct) => [ct._id.toString(), ct]),
  );
  const tracking = await buildTrackingMap(ctx);
  const trackedCodes = new Set(tracking.filter((c) => c.tracked).map((c) => c.code));
  const unitByCode = new Map(tracking.map((c) => [c.code, c.unit]));
  const nameByCode = new Map(tracking.map((c) => [c.code, c.name]));

  // Determine which componentType codes are "production" (category=production).
  // Used to emit per-day ballsProduced + to project BOM-resolved production
  // balls into componentTotals[] with unit=pcs.
  // Phase 81 / D-01: canonical predicate (already-canonical rule shape — mechanical swap).
  const productionCodesByCategory = new Set(
    allComponentTypes
      .filter(isProductionUnit)
      .map((c) => c.code),
  );

  // --- 3. Collect menuProduct ids + BOM + names ---
  const allProductIds = new Set<string>();
  for (const record of records) {
    for (const p of record.produced) allProductIds.add(String(p.menuProductId));
    for (const w of record.waste) allProductIds.add(String(w.menuProductId));
  }
  const productNameMap = new Map<string, string>();
  const productBallCountMap = new Map<string, number>();
  // Per-product BOM projected to component-code level for componentTotals aggregation:
  //   producedProduct.quantity * bomEntry.quantity → additive into componentTotals[code]
  const productBomByProductId = new Map<string, Array<{ code: string; qty: number }>>();

  await Promise.all(
    Array.from(allProductIds).map(async (id) => {
      const [product, components] = await Promise.all([
        ctx.db.get(id as Id<"menuProducts">),
        ctx.db
          .query("menuProductComponents")
          .withIndex("by_menu_product", (q) =>
            q.eq("menuProductId", id as Id<"menuProducts">),
          )
          .collect(),
      ]);
      productNameMap.set(id, product?.name ?? id);

      let ballCount = 0;
      const bomProjection: Array<{ code: string; qty: number }> = [];
      for (const comp of components) {
        const compType = componentTypeMap.get(comp.componentTypeId.toString());
        if (!compType) continue;
        if (compType.category === "production") {
          ballCount += comp.quantity;
        }
        // Project every BOM entry for tracking-map aggregation.
        bomProjection.push({ code: compType.code, qty: comp.quantity });
      }
      // No BOM production components → 0 balls (Business Rule 13).
      productBallCountMap.set(id, ballCount);
      productBomByProductId.set(id, bomProjection);
    }),
  );

  // --- 4. Bucket attendance by userId → by date ---
  const attendanceByUser = new Map<
    Id<"users">,
    Map<string, Doc<"staffAttendance">[]>
  >();
  for (const a of activeAttendance) {
    if (!attendanceByUser.has(a.userId)) {
      attendanceByUser.set(a.userId, new Map());
    }
    const byDate = attendanceByUser.get(a.userId)!;
    const list = byDate.get(a.date) ?? [];
    list.push(a);
    byDate.set(a.date, list);
  }

  // Batch-fetch users for hireDate + name lookups.
  const allStaffUserIds = new Set<string>();
  for (const userId of attendanceByUser.keys()) {
    allStaffUserIds.add(String(userId));
  }
  for (const record of records) {
    allStaffUserIds.add(String(record.chefUserId ?? record.submittedByUserId));
  }
  const userDocs = await Promise.all(
    Array.from(allStaffUserIds).map((id) =>
      ctx.db.get(id as Id<"users">),
    ),
  );
  const userMap = new Map<string, Doc<"users">>();
  for (const u of userDocs) {
    if (u) userMap.set(String(u._id), u);
  }

  // --- 5. Build staffMap from production records first ---
  // C1: component totals are split by unit (grams vs pieces) so pcs-tracked
  // components (e.g. packaging-style leaves) do not pollute gram totals.
  // Each breakdown entry carries its `unit` tag so the frontend can render
  // the correct suffix ("g" vs " pcs").
  type StaffBucket = {
    staffKey: string;
    chefName: string;
    chefUserId: string;
    totalBallsProduced: number;
    productBreakdown: Map<string, { name: string; quantity: number; ballCount: number }>;
    totalComponentGrams: number;
    totalComponentPieces: number;
    componentBreakdown: Map<string, { name: string; grams: number; unit: ComponentUnit }>;
    totalComponentWasteGrams: number;
    totalComponentWastePieces: number;
    componentWasteBreakdown: Map<string, { name: string; grams: number; unit: ComponentUnit }>;
    totalWaste: number;
    wasteByReason: Map<string, number>;
    wasteProductBreakdown: Map<string, { name: string; quantity: number }>;
    shiftCount: number;
    daysWorked: Set<string>;
  };
  const staffMap = new Map<string, StaffBucket>();

  for (const record of records) {
    const name = record.chefName ?? record.submittedBy;
    const userId = String(record.chefUserId ?? record.submittedByUserId);
    const staffKey = userId;

    if (!staffMap.has(staffKey)) {
      staffMap.set(staffKey, {
        staffKey,
        chefName: name,
        chefUserId: userId,
        totalBallsProduced: 0,
        productBreakdown: new Map(),
        totalComponentGrams: 0,
        totalComponentPieces: 0,
        componentBreakdown: new Map(),
        totalComponentWasteGrams: 0,
        totalComponentWastePieces: 0,
        componentWasteBreakdown: new Map(),
        totalWaste: 0,
        wasteByReason: new Map(),
        wasteProductBreakdown: new Map(),
        shiftCount: 0,
        daysWorked: new Set(),
      });
    }
    const staff = staffMap.get(staffKey)!;
    staff.shiftCount++;
    staff.daysWorked.add(record.date);

    // Produced — BOM-resolved balls.
    for (const p of record.produced) {
      const pid = String(p.menuProductId);
      const ballsPerUnit = productBallCountMap.get(pid) ?? 0;
      const totalBalls = p.quantity * ballsPerUnit;
      staff.totalBallsProduced += totalBalls;
      const existing = staff.productBreakdown.get(pid);
      if (existing) {
        existing.quantity += p.quantity;
        existing.ballCount += totalBalls;
      } else {
        staff.productBreakdown.set(pid, {
          name: productNameMap.get(pid) ?? pid,
          quantity: p.quantity,
          ballCount: totalBalls,
        });
      }
    }

    // Product waste.
    for (const w of record.waste) {
      staff.totalWaste += w.quantity;
      staff.wasteByReason.set(
        w.reason,
        (staff.wasteByReason.get(w.reason) ?? 0) + w.quantity,
      );
      const wid = String(w.menuProductId);
      const existingWaste = staff.wasteProductBreakdown.get(wid);
      if (existingWaste) {
        existingWaste.quantity += w.quantity;
      } else {
        staff.wasteProductBreakdown.set(wid, {
          name: productNameMap.get(wid) ?? wid,
          quantity: w.quantity,
        });
      }
    }

    // Component production — split totals by unit (grams vs pieces) so pcs
    // entries (kitchen-dedupe round 2 `unit` field) do not pollute gram totals.
    // Historical records without `unit` default to "g" for backward compat.
    if (record.componentProduced) {
      for (const c of record.componentProduced) {
        if (c.grams <= 0) continue;
        const unit = resolveUnit(c.unit);
        if (unit === "pcs") {
          staff.totalComponentPieces += c.grams;
        } else {
          staff.totalComponentGrams += c.grams;
        }
        const existing = staff.componentBreakdown.get(c.kitchenComponentCode);
        if (existing) {
          existing.grams += c.grams;
          // Prefer an explicit unit on a later record over the default.
          if (c.unit) existing.unit = unit;
        } else {
          staff.componentBreakdown.set(c.kitchenComponentCode, {
            name: c.kitchenComponentName,
            grams: c.grams,
            unit,
          });
        }
      }
    }

    if (record.componentWaste) {
      for (const c of record.componentWaste) {
        if (c.grams <= 0) continue;
        const unit = resolveUnit(c.unit);
        if (unit === "pcs") {
          staff.totalComponentWastePieces += c.grams;
        } else {
          staff.totalComponentWasteGrams += c.grams;
        }
        const existing = staff.componentWasteBreakdown.get(c.kitchenComponentCode);
        if (existing) {
          existing.grams += c.grams;
          if (c.unit) existing.unit = unit;
        } else {
          staff.componentWasteBreakdown.set(c.kitchenComponentCode, {
            name: c.kitchenComponentName,
            grams: c.grams,
            unit,
          });
        }
      }
    }
  }

  // --- 6. Inject staff with attendance-only (no production) ---
  for (const userId of attendanceByUser.keys()) {
    const key = String(userId);
    if (staffMap.has(key)) continue;
    const userDoc = userMap.get(key);
    const name = userDoc?.name ?? key;
    staffMap.set(key, {
      staffKey: key,
      chefName: name,
      chefUserId: key,
      totalBallsProduced: 0,
      productBreakdown: new Map(),
      totalComponentGrams: 0,
      totalComponentPieces: 0,
      componentBreakdown: new Map(),
      totalComponentWasteGrams: 0,
      totalComponentWastePieces: 0,
      componentWasteBreakdown: new Map(),
      totalWaste: 0,
      wasteByReason: new Map(),
      wasteProductBreakdown: new Map(),
      shiftCount: 0,
      daysWorked: new Set(),
    });
  }

  // --- 7. Attach attendance-derived fields to each staff entry ---
  const now = Date.now();
  const results = Array.from(staffMap.values()).map((s) => {
    const userIdKey = s.chefUserId;
    const userAttendance: Map<string, Doc<"staffAttendance">[]> =
      attendanceByUser.get(userIdKey as Id<"users">) ??
      new Map<string, Doc<"staffAttendance">[]>();
    const hireDate = userMap.get(userIdKey)?.hireDate;

    // Flatten for cross-date overlap detection (e.g. two open shifts on
    // consecutive dates still overlap).
    const allSessions: Doc<"staffAttendance">[] = [];
    for (const sessions of userAttendance.values()) {
      for (const session of sessions) allSessions.push(session);
    }
    const overlapping = detectOverlaps(allSessions);

    let totalHoursWorked = 0;
    let flaggedShiftCount = 0;
    const daysAttendedSet = new Set<string>();
    const perDayBreakdown: PerDayEntry[] = [];

    // Combine attendance dates with production-only dates so staff who had
    // attendance-only days or production-only days both appear.
    const allDatesForStaff = new Set<string>();
    for (const date of userAttendance.keys()) allDatesForStaff.add(date);
    for (const date of s.daysWorked) allDatesForStaff.add(date);

    for (const date of allDatesForStaff) {
      const sessions = userAttendance.get(date) ?? [];
      if (sessions.length > 0) daysAttendedSet.add(date);

      let dayHours = 0;
      const sessionSummaries: SessionSummary[] = sessions.map((session) => {
        const closedMs =
          session.clockOut !== undefined
            ? session.durationMs ?? session.clockOut - session.clockIn
            : 0;
        dayHours += closedMs / 3_600_000;
        const flags = detectFlags(session, hireDate, now);
        if (overlapping.has(session._id)) flags.push("overlapping");
        if (flags.length > 0) flaggedShiftCount++;
        return {
          attendanceId: session._id,
          clockIn: session.clockIn,
          clockOut: session.clockOut ?? null,
          durationMs: session.durationMs ?? null,
          isFlagged: flags.length > 0,
          flagReasons: flags,
        };
      });
      totalHoursWorked += dayHours;

      // Per-day component totals from kitchenShiftRecords (produced + BOM projection).
      const dayRecords = records.filter(
        (r) =>
          r.date === date &&
          String(r.chefUserId ?? r.submittedByUserId) === userIdKey,
      );
      const componentAccumulator = new Map<string, number>();
      let dayBalls = 0;
      for (const rec of dayRecords) {
        for (const p of rec.produced) {
          const pid = String(p.menuProductId);
          const bom = productBomByProductId.get(pid) ?? [];
          for (const comp of bom) {
            // Production category → project to componentTotals (pcs).
            if (productionCodesByCategory.has(comp.code)) {
              dayBalls += p.quantity * comp.qty;
              if (trackedCodes.has(comp.code)) {
                componentAccumulator.set(
                  comp.code,
                  (componentAccumulator.get(comp.code) ?? 0) + p.quantity * comp.qty,
                );
              }
            }
          }
        }
        // Component production → only when tracked (kitchen components).
        // Each code has a single configured unit in `unitByCode` (from tracking
        // config), applied at componentTotals emit time below. Accumulating the
        // raw value is correct regardless of unit: the `grams` field name is
        // legacy — when the configured unit is "pcs" the value is a piece count.
        if (rec.componentProduced) {
          for (const c of rec.componentProduced) {
            if (c.grams <= 0) continue;
            if (!trackedCodes.has(c.kitchenComponentCode)) continue;
            componentAccumulator.set(
              c.kitchenComponentCode,
              (componentAccumulator.get(c.kitchenComponentCode) ?? 0) + c.grams,
            );
          }
        }
      }
      const componentTotals: ComponentTotal[] = Array.from(componentAccumulator.entries()).map(
        ([code, quantity]) => ({
          code,
          name: nameByCode.get(code) ?? code,
          unit: unitByCode.get(code) ?? "pcs",
          quantity,
        }),
      );

      perDayBreakdown.push({
        date,
        hoursWorked: dayHours,
        sessions: sessionSummaries,
        ballsProduced: dayBalls,
        componentTotals,
      });
    }

    perDayBreakdown.sort((a, b) => b.date.localeCompare(a.date));

    return {
      staffKey: s.staffKey,
      chefName: s.chefName,
      chefUserId: s.chefUserId,
      totalBallsProduced: s.totalBallsProduced,
      productBreakdown: Array.from(s.productBreakdown.entries()).map(([id, val]) => ({
        menuProductId: id,
        name: val.name,
        quantity: val.quantity,
        ballCount: val.ballCount,
      })),
      totalComponentGrams: s.totalComponentGrams,
      totalComponentPieces: s.totalComponentPieces,
      componentBreakdown: Array.from(s.componentBreakdown.entries()).map(([code, val]) => ({
        code,
        name: val.name,
        grams: val.grams,
        unit: val.unit,
      })),
      totalComponentWasteGrams: s.totalComponentWasteGrams,
      totalComponentWastePieces: s.totalComponentWastePieces,
      componentWasteBreakdown: Array.from(s.componentWasteBreakdown.entries()).map(
        ([code, val]) => ({
          code,
          name: val.name,
          grams: val.grams,
          unit: val.unit,
        }),
      ),
      totalWaste: s.totalWaste,
      wasteByReason: Array.from(s.wasteByReason.entries()).map(([reason, qty]) => ({
        reason,
        quantity: qty,
      })),
      wasteProductBreakdown: Array.from(s.wasteProductBreakdown.entries()).map(
        ([id, val]) => ({
          menuProductId: id,
          name: val.name,
          quantity: val.quantity,
        }),
      ),
      shiftCount: s.shiftCount,
      daysWorked: s.daysWorked.size,
      // Phase 74 additive fields ↓
      totalHoursWorked,
      daysAttended: daysAttendedSet.size,
      flaggedShiftCount,
      perDayBreakdown,
    };
  });

  results.sort((a, b) => b.totalBallsProduced - a.totalBallsProduced);

  return {
    startDate,
    endDate,
    totalRecords: records.length,
    staff: results,
  };
}
