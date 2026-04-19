/**
 * K3Mart helpers (pure + ctx-dependent).
 * Extracted from adapter for testability and cross-caller reuse.
 * - Pure: parseK3MartDate, formatDate, buildDedupKey, resolveOutletName,
 *   resolveOutletExternalId, transformProductDetailEntry, attachLinkedMenuProductId.
 * - Ctx-dependent: getK3MartMappingBySku.
 */

import type { K3MartProductDetailEntry } from "./config";
import type { QueryCtx, MutationCtx } from "../../_generated/server";
import type { Id } from "../../_generated/dataModel";

/**
 * Parse K3Mart date format "07 Feb 2026, 14:23" to epoch ms.
 */
export function parseK3MartDate(dateStr: string): number {
  // Format: "07 Feb 2026, 14:23"
  const cleaned = dateStr.replace(",", "");
  const parsed = new Date(cleaned);
  if (isNaN(parsed.getTime())) {
    // Fallback: try manual parsing
    const parts = dateStr.match(/(\d{2})\s+(\w{3})\s+(\d{4}),?\s+(\d{2}):(\d{2})/);
    if (parts) {
      const months: Record<string, number> = {
        Jan: 0, Feb: 1, Mar: 2, Apr: 3, May: 4, Jun: 5,
        Jul: 6, Aug: 7, Sep: 8, Oct: 9, Nov: 10, Dec: 11,
      };
      return new Date(
        parseInt(parts[3]),
        months[parts[2]] ?? 0,
        parseInt(parts[1]),
        parseInt(parts[4]),
        parseInt(parts[5])
      ).getTime();
    }
    return Date.now();
  }
  return parsed.getTime();
}

/**
 * Format a timestamp to YYYY-MM-DD string.
 */
export function formatDate(timestamp: number): string {
  const d = new Date(timestamp);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/**
 * Build a dedup key for a K3Mart sales transaction.
 */
export function buildDedupKey(
  transDate: string,
  outletName: string,
  productCode: string,
  qty: number,
  total: number
): string {
  return `${transDate}|${outletName}|${productCode}|${qty}|${total}`;
}

/**
 * Resolve outlet numeric ID to human-readable name.
 * Falls back to "K3 Mart #{id}" for unknown outlets.
 */
export function resolveOutletName(
  outletId: number,
  nameMap: Record<number, string>
): string {
  return nameMap[outletId] ?? `K3 Mart #${outletId}`;
}

/**
 * Resolve outlet name to its numeric externalId string.
 * Uses the reverse name->ID map from K3MART_OUTLET_NAME_TO_ID.
 * Falls back to "name:{outletName}" for unknown outlets.
 */
export function resolveOutletExternalId(
  outletName: string,
  nameToIdMap: Record<string, string>
): string {
  return nameToIdMap[outletName] ?? `name:${outletName}`;
}

/**
 * Transform a product detail entry from the /vendor-stock/detail/{productId} API
 * into the shape expected by saveSnapshots.
 */
export function transformProductDetailEntry(
  entry: K3MartProductDetailEntry,
  productId: number
): {
  externalProductId: string;
  externalProductCode: string;
  productName: string;
  quantity: number;
  price: number;
  capital: number;
} {
  return {
    externalProductId: String(productId),
    externalProductCode: entry.product_code,
    productName: entry.product_name,
    quantity: entry.quantity ?? 0,
    price: entry.price ?? 0,
    capital: entry.capital ?? 0,
  };
}

/**
 * Returns a Map<externalProductCode, menuProductId> of all active K3Mart mappings
 * with a non-null menuProductId. Used by:
 *   - applyRetroactiveProductMappingImpl (K3Mart branch) -- to patch existing parents
 *   - syncK3MartSales -- to set linkedMenuProductId at sync time
 *
 * Queries externalProductMappings via the by_source_code prefix index on
 * source="k3mart". Prefix-only eq inside .withIndex() is the canonical Convex
 * pattern for source-scoped scans (see CLAUDE.md pitfall #11 -- never inline
 * the "k3mart" literal in a NEW validator; this function consumes the
 * shared externalSource values and is safe).
 */
export async function getK3MartMappingBySku(
  ctx: QueryCtx | MutationCtx,
): Promise<Map<string, Id<"menuProducts">>> {
  const rows = await ctx.db
    .query("externalProductMappings")
    .withIndex("by_source_code", (q) => q.eq("source", "k3mart"))
    .collect();
  const map = new Map<string, Id<"menuProducts">>();
  for (const r of rows) {
    if (r.menuProductId) map.set(r.externalProductCode, r.menuProductId);
  }
  return map;
}

/**
 * Pure record shape used by both syncK3MartSales and the unit test for the
 * mapping-attachment step. Mirrors the literal shape built in the adapter's
 * batch.map at k3mart/adapter.ts:545-576 (excluding the ctx-sourced fields
 * outletId and syncLogId which are already present on the record).
 */
export type K3MartMappableRecord = {
  externalProductCode?: string;
  linkedMenuProductId?: Id<"menuProducts">;
  [key: string]: unknown;
};

/**
 * Returns a shallow copy of `record` with `linkedMenuProductId` set when the
 * record's externalProductCode is present in `mappingMap`. Records without a
 * matching mapping (or without externalProductCode) are returned unchanged --
 * `linkedMenuProductId` stays undefined, matching today's behavior.
 *
 * Pure function -- no ctx, no db, no fetch. Tested directly in
 * k3mart/__tests__/helpers-attach-linking.test.ts (Wave 3).
 */
export function attachLinkedMenuProductId<T extends K3MartMappableRecord>(
  record: T,
  mappingMap: Map<string, Id<"menuProducts">>,
): T & { linkedMenuProductId?: Id<"menuProducts"> } {
  if (!record.externalProductCode) return record;
  const mapped = mappingMap.get(record.externalProductCode);
  if (!mapped) return record;
  return { ...record, linkedMenuProductId: mapped };
}
