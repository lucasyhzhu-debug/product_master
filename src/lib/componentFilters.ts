export function dedupeByCode<T extends { code: string }>(items: readonly T[]): T[] {
  const seen = new Set<string>();
  const out: T[] = [];
  for (const it of items) {
    if (!seen.has(it.code)) {
      seen.add(it.code);
      out.push(it);
    }
  }
  return out;
}

/**
 * Kitchen components = active production componentTypes referenced as a CHILD
 * of a tier-1+ recipe (isRecipeChild=true). Top-level balls like BIG_BALL
 * belong to PRODUCTION COMPONENTS, not KITCHEN COMPONENTS.
 */
export function getKitchenLeafComponents<
  T extends { code: string; isActive: boolean; isRecipeChild: boolean },
>(arr: readonly T[]): T[] {
  return dedupeByCode(arr.filter((c) => c.isActive && c.isRecipeChild));
}

/**
 * Tier-1+ production components (ball types like BIG_BALL, MID_BALL,
 * HAZELNUT_REGULAR). Filters out soft-deactivated dedupe shadows.
 */
export function getProductionTier1Components<
  T extends { code: string; isActive: boolean; tier: number },
>(arr: readonly T[]): T[] {
  return dedupeByCode(arr.filter((c) => c.tier > 0 && c.isActive));
}
