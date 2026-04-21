/**
 * Phase 74.5.1 Plan 09 — useChannelRouting
 *
 * Convex hook bindings for the ChannelRoutingManager admin page.
 * Wraps:
 *   - `listRoutingRules` query
 *   - `createRoutingRule`, `updateRoutingRule`, `deleteRoutingRule` mutations
 *   - `runRoutingSeed` migration trigger (Plan 08)
 *   - (passed separately) `getChannelDeductionFlags` / `setChannelDeductionFlag`
 *     are wired in useChannelFlags for the settings page.
 *
 * All mutations require admin role — enforced by `requireRole` on the backend.
 * This hook is intentionally thin: components handle their own optimistic UX
 * via Convex reactivity (see CLAUDE.md pitfall #4).
 */

import { useMutation, useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";

export function useChannelRouting(token: string | undefined) {
  const rules = useQuery(
    api.productInventory.channelRoutingQueries.listRoutingRules,
    token ? { token } : "skip",
  );
  const createRule = useMutation(
    api.productInventory.channelRouting.createRoutingRule,
  );
  const updateRule = useMutation(
    api.productInventory.channelRouting.updateRoutingRule,
  );
  const deleteRule = useMutation(
    api.productInventory.channelRouting.deleteRoutingRule,
  );
  const seedFromOutlets = useMutation(
    api.migrations.channelRoutingSeed.runRoutingSeed,
  );

  return { rules, createRule, updateRule, deleteRule, seedFromOutlets };
}

export function useChannelFlags(token: string | undefined) {
  const flags = useQuery(
    api.productInventory.channelFlags.getChannelDeductionFlags,
    token ? { token } : "skip",
  );
  const setFlag = useMutation(
    api.productInventory.channelFlags.setChannelDeductionFlag,
  );
  // Phase 74.5.2.1 — D74.5.2-L14 composite flip. Atomically sets both
  // `k3mart` and `consignment` flags in one mutation. Prevents the
  // accidental out-of-sync state that occurs when an operator flips only
  // one flag via the individual per-source switches above.
  const flipK3MartBundle = useMutation(
    api.productInventory.channelFlags.flipK3MartBundle,
  );
  return { flags, setFlag, flipK3MartBundle };
}
