/**
 * Customer resolution and order number generation helpers.
 * Ctx-dependent helpers that encapsulate repeated patterns from order mutations.
 */
import type { MutationCtx } from "../../_generated/server";
import type { Id } from "../../_generated/dataModel";
import { generateOrderNumber as formatOrderNumber } from "../helpers";

/**
 * Resolve customer from either an existing ID or new customer data.
 * Used by create, createDraft, and updateDraft mutations.
 * Returns the resolved customer ID, name, and phone.
 */
export async function resolveCustomer(
  ctx: MutationCtx,
  args: {
    customerId?: Id<"customers">;
    newCustomer?: { name: string; phone?: string; source?: string };
    createdBy?: string;
    defaultAddress?: string;
  }
): Promise<{ customerId: Id<"customers">; customerName: string; customerPhone?: string }> {
  if (args.customerId) {
    const customer = await ctx.db.get(args.customerId);
    if (!customer) throw new Error("Customer not found");
    return {
      customerId: args.customerId,
      customerName: customer.name,
      customerPhone: customer.phone,
    };
  } else if (args.newCustomer) {
    // Build insert data — only include optional fields if defined.
    // `create` passes source + defaultAddress; `createDraft` does not.
    // Omitting undefined fields preserves original behavior for both callers.
    const customerId = await ctx.db.insert("customers", {
      name: args.newCustomer.name,
      phone: args.newCustomer.phone,
      createdBy: args.createdBy ?? "admin",
      ...(args.newCustomer.source !== undefined && { source: args.newCustomer.source }),
      ...(args.defaultAddress !== undefined && { defaultAddress: args.defaultAddress }),
    } as never);
    return {
      customerId,
      customerName: args.newCustomer.name,
      customerPhone: args.newCustomer.phone,
    };
  }
  throw new Error("Either customerId or newCustomer is required");
}

/**
 * Generate the next order number for today (MMDD-NNN format).
 * Queries existing orders to find the next available sequence number.
 */
export async function generateNextOrderNumber(ctx: MutationCtx): Promise<string> {
  const now = new Date();
  const datePrefix = `${String(now.getMonth() + 1).padStart(2, "0")}${String(
    now.getDate()
  ).padStart(2, "0")}`;
  const prefix = `${datePrefix}-`;

  // Get today's orders using index for efficient lookup
  const todayOrders = await ctx.db
    .query("orders")
    .withIndex("by_order_number", (q: any) =>
      q.gte("orderNumber", prefix).lt("orderNumber", `${datePrefix}.`)
    )
    .collect();

  // Find the highest sequence number used today (handles gaps from deletions)
  let maxSequence = 0;
  for (const order of todayOrders) {
    const parts = order.orderNumber.split("-");
    if (parts.length === 2) {
      const seq = parseInt(parts[1], 10);
      if (!isNaN(seq) && seq > maxSequence) {
        maxSequence = seq;
      }
    }
  }

  // Use pure helper for format string generation
  const orderNumber = formatOrderNumber(now, maxSequence);

  // Verify uniqueness (handles race condition)
  const existing = await ctx.db
    .query("orders")
    .withIndex("by_order_number", (q: any) => q.eq("orderNumber", orderNumber))
    .first();

  if (existing) {
    // Rare race condition - retry with incremented sequence
    return formatOrderNumber(now, maxSequence + 1);
  }

  return orderNumber;
}
