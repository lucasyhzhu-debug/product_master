/**
 * Shared GL account resolution utility.
 *
 * Extracted from fixedAssets/mutations.ts to avoid circular imports
 * when multiple modules need to resolve accounts by code.
 */

import { ConvexError } from "convex/values";
import type { Doc } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";

/**
 * Resolve a GL account by its code. Throws if not found.
 *
 * Used by: fixedAssets/mutations, expenses/bulkMutations, expenses/mutations,
 * journalImport/mutations — any mutation that needs to look up a system account.
 */
export async function resolveAccount(
  ctx: MutationCtx,
  code: string
): Promise<Doc<"accounts">> {
  const account = await ctx.db
    .query("accounts")
    .withIndex("by_code", (q) => q.eq("code", code))
    .first();
  if (!account) {
    throw new ConvexError(
      `System account ${code} not found. Please ask an admin to run accounts:seedDefaults from the Convex dashboard.`
    );
  }
  return account;
}
