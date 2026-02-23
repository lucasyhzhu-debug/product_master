/**
 * KitchenOrderSummary
 *
 * Read-only 3-column view of active orders by status group.
 * Replaces the interactive DueDateOrderList in the kitchen collapsible section.
 * No action buttons — order management happens in the Order Management kanban.
 */

import { useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import { Badge } from "@/components/ui/badge";

interface OrderRow {
  _id: string;
  orderNumber: string;
  customerName: string;
  status: string;
  items: Array<{ productName: string; quantity: number }>;
}

const STATUS_COLUMNS = [
  {
    key: "payment_received",
    label: "Payment Received",
    badgeVariant: "outline" as const,
  },
  {
    key: "being_prepared",
    label: "Being Prepared",
    badgeVariant: "secondary" as const,
  },
  {
    key: "awaiting_delivery",
    label: "Awaiting Delivery",
    badgeVariant: "default" as const,
  },
] as const;

export function KitchenOrderSummary() {
  const kanban = useQuery(api.orders.queries.listForKanban);

  if (kanban === undefined) {
    return (
      <div className="grid grid-cols-3 gap-3">
        {STATUS_COLUMNS.map((col) => (
          <div key={col.key} className="space-y-2">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
              {col.label}
            </p>
            <div className="h-16 rounded-lg bg-muted/30 animate-pulse" />
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="grid grid-cols-3 gap-3">
      {STATUS_COLUMNS.map((col) => {
        const orders = ((kanban as Record<string, OrderRow[]>)[col.key]) ?? [];

        return (
          <div key={col.key} className="space-y-2">
            <div className="flex items-center gap-1.5">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                {col.label}
              </p>
              {orders.length > 0 && (
                <Badge variant={col.badgeVariant} className="text-xs px-1.5 py-0 h-4">
                  {orders.length}
                </Badge>
              )}
            </div>
            {orders.length === 0 ? (
              <p className="text-xs text-muted-foreground italic">None</p>
            ) : (
              <div className="space-y-1.5">
                {orders.map((order) => (
                  <div
                    key={order._id}
                    className="rounded-md border border-border bg-card px-2.5 py-2 text-xs"
                  >
                    <div className="font-medium text-foreground">{order.orderNumber}</div>
                    <div className="text-muted-foreground truncate">{order.customerName}</div>
                    <div className="mt-0.5 text-muted-foreground">
                      {order.items
                        .map((item) => `${item.quantity}x ${item.productName}`)
                        .join(", ")}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
