/**
 * K3Mart internal query wrappers.
 *
 * Wraps ctx-dependent helpers from `./helpers.ts` for consumption by actions
 * (which lack `ctx.db`). Actions call these via `ctx.runQuery(internal.*)`.
 */

import { internalQuery } from "../../_generated/server";
import { getK3MartMappingBySku } from "./helpers";
import type { Id } from "../../_generated/dataModel";

/**
 * Returns a K3Mart SKU -> menuProductId map as a serializable Record.
 * Convex cannot serialize `Map` across the action<->query boundary, so we
 * convert to `Record<string, string>` and the caller rebuilds the Map.
 *
 * Consumed by:
 *   - convex/integrations/k3mart/adapter.ts :: syncK3MartSales
 *     (pre-fetches mapping before batch insert so records get
 *     linkedMenuProductId set at insert time, healing the
 *     "new-unlinked-K3Mart-records-every-sync" bug -- Phase 80.2).
 */
export const getK3MartMappingBySkuQuery = internalQuery({
  args: {},
  handler: async (ctx): Promise<Record<string, string>> => {
    const map = await getK3MartMappingBySku(ctx);
    const record: Record<string, string> = {};
    for (const [k, val] of map.entries()) {
      record[k] = val as unknown as string;
    }
    return record;
  },
});

// Re-export the Id type for consumers that need it
export type { Id };
