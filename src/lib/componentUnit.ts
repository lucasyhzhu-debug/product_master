export type ComponentUnit = "g" | "pcs";
export const DEFAULT_UNIT: ComponentUnit = "g";

export function resolveUnit(
  u: string | null | undefined,
  fallback: ComponentUnit = DEFAULT_UNIT
): ComponentUnit {
  return u === "g" || u === "pcs" ? u : fallback;
}

export function sumByUnit<T extends { unit?: string | null; grams: number }>(
  items: readonly T[]
): { grams: number; pieces: number } {
  let g = 0;
  let p = 0;
  for (const it of items) {
    if (it.unit === "pcs") p += it.grams;
    else g += it.grams;
  }
  return { grams: g, pieces: p };
}
