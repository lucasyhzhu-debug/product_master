/**
 * Reusable query helper functions for standard CRUD patterns.
 *
 * These are utility functions called from within query/mutation handlers,
 * NOT Convex functions themselves. They reduce per-entity query boilerplate
 * from ~30 lines to ~5 lines per query.
 *
 * All helpers are fully typed using Convex's generated TableNames and Doc types.
 */

import type { QueryCtx } from "../_generated/server";
import type { TableNames, Doc } from "../_generated/dataModel";

/**
 * Filter function type for listAll.
 */
type FilterFn<T extends TableNames> = (doc: Doc<T>) => boolean;

/**
 * List all documents from a table, optionally filtered.
 *
 * For unfiltered queries, uses `.take(limit)` for efficiency.
 * For filtered queries, collects all and filters in-memory (suitable for
 * tables with <10k rows -- all 6 simple entities qualify).
 *
 * @param ctx - Query context
 * @param table - Table name
 * @param options - Optional limit (default 100), order (default "desc"), filter callback
 * @returns Array of documents
 *
 * @example
 * ```ts
 * // Simple: list all ingredients, newest first
 * const items = await listAll(ctx, "ingredients");
 *
 * // Filtered: only active items
 * const active = await listAll(ctx, "ingredients", {
 *   filter: (doc) => doc.name.startsWith("A"),
 *   limit: 50,
 * });
 * ```
 */
export async function listAll<T extends TableNames>(
  ctx: QueryCtx,
  table: T,
  options?: {
    limit?: number;
    order?: "asc" | "desc";
    filter?: FilterFn<T>;
  },
): Promise<Doc<T>[]> {
  const limit = options?.limit ?? 100;
  const order = options?.order ?? "desc";

  const q = ctx.db.query(table).order(order);

  if (options?.filter) {
    const all = await q.collect();
    return all.filter(options.filter).slice(0, limit);
  }

  return await q.take(limit);
}

/**
 * Get a single document by ID. Returns null if not found.
 *
 * Simple wrapper around ctx.db.get() for consistency with other helpers
 * and to provide a standard null-return pattern.
 *
 * @param ctx - Query context
 * @param id - Document ID (typed to any table)
 * @returns Document or null
 *
 * @example
 * ```ts
 * const ingredient = await getById(ctx, args.id);
 * if (!ingredient) throw new ConvexError("Not found");
 * ```
 */
export async function getById<T extends TableNames>(
  ctx: QueryCtx,
  id: Doc<T>["_id"],
): Promise<Doc<T> | null> {
  return await ctx.db.get(id) as Doc<T> | null;
}

/**
 * In-memory text search across specified fields.
 *
 * Collects all documents and filters by case-insensitive substring match
 * on the specified string fields. Suitable for small tables (<10k rows).
 * For larger tables, use Convex search indexes instead.
 *
 * @param ctx - Query context
 * @param table - Table name
 * @param searchQuery - Search string (case-insensitive substring match)
 * @param fields - Array of field names to search in (must be string fields)
 * @param limit - Maximum results (default 20)
 * @returns Matching documents
 *
 * @example
 * ```ts
 * const results = await textSearch(ctx, "ingredients", "vanilla", ["name", "brand"]);
 * ```
 */
export async function textSearch<T extends TableNames>(
  ctx: QueryCtx,
  table: T,
  searchQuery: string,
  fields: (keyof Doc<T>)[],
  limit: number = 20,
): Promise<Doc<T>[]> {
  const searchLower = searchQuery.toLowerCase();
  const all = await ctx.db.query(table).collect();

  return all
    .filter((doc) => {
      return fields.some((field) => {
        const value = doc[field];
        if (typeof value === "string") {
          return value.toLowerCase().includes(searchLower);
        }
        return false;
      });
    })
    .slice(0, limit);
}
