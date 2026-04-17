/**
 * Kitchen targets hook for the redesigned KitchenViewV2.
 *
 * Provides today's production targets (ball totals + packaging breakdown),
 * today's shift records, kitchen components, and daily component summary.
 * Uses WIB (UTC+7) date.
 */

import { useMemo } from "react";
import { useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import { getKitchenLeafComponents } from "../../lib/componentFilters";
import { resolveUnit, type ComponentUnit } from "../../lib/componentUnit";

export function useKitchenTargets() {
  const today = useMemo(() => {
    const now = new Date();
    const wibNow = new Date(now.getTime() + 7 * 60 * 60 * 1000);
    return wibNow.toISOString().slice(0, 10);
  }, []);

  const targets = useQuery(api.kitchenConfig.queries.getKitchenTargetsForDate, {
    date: today,
  });
  const todayShiftRecords = useQuery(
    api.kitchenShiftRecords.queries.getShiftRecordsByDate,
    { date: today }
  );

  const productionComponentsWithTiers = useQuery(
    api.productionRecipes.queries.getComponentsWithTiers
  );

  // Kitchen components = production componentTypes referenced as a CHILD of
  // some tier-1+ recipe. Top-level balls (BIG_BALL/Jumbo) are linked directly
  // to menu products and belong to PRODUCTION COMPONENTS (ball targets),
  // NOT KITCHEN COMPONENTS.
  const kitchenComponents = useMemo(
    () => getKitchenLeafComponents(productionComponentsWithTiers ?? []),
    [productionComponentsWithTiers]
  );

  const dailyComponentSummary = useQuery(
    api.kitchenShiftRecords.queries.getDailyComponentSummary,
    { date: today }
  );

  const kitchenConfig = useQuery(api.kitchenConfig.queries.getConfig);

  // Build unitByCode: componentTracking is authoritative when present,
  // otherwise derive from componentType.unit.
  const unitByCode = useMemo(() => {
    const map: Record<string, ComponentUnit> = {};
    if (kitchenConfig?.componentTracking && kitchenConfig.componentTracking.length > 0) {
      for (const entry of kitchenConfig.componentTracking) {
        map[entry.code] = entry.unit;
      }
    } else {
      for (const c of productionComponentsWithTiers ?? []) {
        if (c.isActive) map[c.code] = resolveUnit(c.unit);
      }
    }
    return map;
  }, [kitchenConfig?.componentTracking, productionComponentsWithTiers]);

  return {
    today,
    targets,
    todayShiftRecords,
    productionComponentsWithTiers,
    kitchenComponents,
    dailyComponentSummary,
    unitByCode,
  };
}
