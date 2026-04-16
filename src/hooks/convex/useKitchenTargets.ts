/**
 * Kitchen targets hook for the redesigned KitchenViewV2.
 *
 * Provides today's production targets (ball totals + packaging breakdown),
 * today's shift records, kitchen components, and daily component summary.
 * Uses WIB (UTC+7) date, same as useKitchenProduction.ts.
 *
 * Phase 69: Added kitchenComponents + dailyComponentSummary queries.
 */

import { useMemo } from "react";
import { useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";

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

  // Phase 69 -> paq: Unified production components with tier computation
  const productionComponentsWithTiers = useQuery(
    api.productionRecipes.queries.getComponentsWithTiers
  );

  // Kitchen components = production componentTypes referenced as a CHILD of
  // some tier-1+ recipe (i.e. `productionComponentLinks.childComponentId`).
  // This is the canonical definition: kitchen staff produces things that are
  // sub-components of recipes. Top-level balls like BIG_BALL/Jumbo are linked
  // directly to menu products (menuProductComponents) but are NOT recipe
  // children — they belong to PRODUCTION COMPONENTS (ball targets), not
  // KITCHEN COMPONENTS.
  //
  // Round-2 fix: filter `isActive` to exclude soft-deactivated dedupe shadows
  // (convex/componentTypes/dedupe.ts line 757 sets isActive=false without deletion).
  // Round-4 fix: source from `isRecipeChild` (not tier===0 && unit==="g") so
  // pcs-unit sub-components like Filling Pistachio, Outer Marshmallow,
  // nutella_filling appear as toggleable kitchen components.
  // Additional dedupe-by-code guard protects against any lingering active
  // dupes the schema doesn't enforce unique.
  const kitchenComponents = useMemo(() => {
    const base = (productionComponentsWithTiers ?? []).filter(
      (c) => c.isActive && c.isRecipeChild
    );
    const seen = new Set<string>();
    const unique: typeof base = [];
    for (const c of base) {
      if (seen.has(c.code)) continue;
      seen.add(c.code);
      unique.push(c);
    }
    return unique;
  }, [productionComponentsWithTiers]);

  const dailyComponentSummary = useQuery(
    api.kitchenShiftRecords.queries.getDailyComponentSummary,
    { date: today }
  );

  return {
    today,
    targets,
    todayShiftRecords,
    productionComponentsWithTiers,
    kitchenComponents,
    dailyComponentSummary,
  };
}
