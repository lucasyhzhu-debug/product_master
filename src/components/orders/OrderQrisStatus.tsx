/**
 * OrderQrisStatus — read-only "this order has a QRIS payment attached" row.
 *
 * Shown on BOTH order surfaces (OrderSlideOver + OrderDetail — pitfall #20) so a
 * QRIS payment stays visible AFTER the order auto-transitions to paid. The
 * "Charge via QRIS" / "Generate QRIS" button only renders while the order is
 * AwaitingPayment; once the webhook flips the order to PaymentReceived that
 * button disappears, and without this row the fact that payment arrived via a
 * generated QRIS would be invisible on the order.
 *
 * Purely presentational: it derives everything from the `getActiveQrisPayment`
 * row (the most-recent non-expired pending|paid row for the order). `onView`
 * re-opens the existing QrisChargeDialog (paid → confirmation panel, pending →
 * the live QR). Renders nothing when there is no attached row (undefined =
 * loading, null = none).
 */
import { CheckCircle2, QrCode } from "lucide-react";
import { Button } from "@/components/ui/button";
import { formatCurrency } from "@/lib/utils";

/**
 * Order statuses where a QR should no longer be presented as collectible.
 * A `pending` row on a terminal order (e.g. Cancelled) is stale — never offer to
 * re-view a still-scannable QR there (a customer paying it records a silent paid
 * row that does NOT transition the dead order). The `paid` row stays informational.
 */
const TERMINAL_STATUSES = new Set([
  "Complete",
  "Cancelled",
  "CompleteShipped",
  "PickedUp",
]);

interface OrderQrisStatusProps {
  /** The active QRIS payment row from `useActiveQrisPayment`. undefined = loading, null = none. */
  row:
    | {
        status: string;
        amount: number;
        source?: string | null;
        /** Our 30-min window end (ms). A pending row past this is dead. */
        expiresAt?: number;
      }
    | null
    | undefined;
  /** The order's workflow status — gates the (collectible) pending affordance. */
  orderStatus: string;
  /** Re-open the QrisChargeDialog for this order. */
  onView: () => void;
}

export function OrderQrisStatus({ row, orderStatus, onView }: OrderQrisStatusProps) {
  if (!row) return null;

  if (row.status === "paid") {
    return (
      <div className="flex items-center justify-between gap-2 rounded-md border border-[var(--color-status-success)]/40 bg-[var(--color-status-success-bg)] px-3 py-2">
        <div className="flex min-w-0 items-center gap-2 text-sm text-[var(--color-status-success)]">
          <CheckCircle2 className="h-4 w-4 shrink-0" />
          <span className="truncate font-medium">
            QRIS Paid · {formatCurrency(row.amount)}
            {row.source ? ` · ${row.source}` : ""}
          </span>
        </div>
        <Button
          variant="ghost"
          size="sm"
          className="h-7 shrink-0 px-2 text-[var(--color-status-success)]"
          onClick={onView}
        >
          View
        </Button>
      </div>
    );
  }

  if (row.status === "pending") {
    // Suppress a still-scannable "awaiting payment" affordance once the order is
    // terminal (stale QR risk) or once our 30-min window has elapsed (the QR is
    // dead — staff regenerate via the Generate button while AwaitingPayment).
    if (TERMINAL_STATUSES.has(orderStatus)) return null;
    if (row.expiresAt !== undefined && Date.now() >= row.expiresAt) return null;
    return (
      <div className="flex items-center justify-between gap-2 rounded-md border bg-muted px-3 py-2">
        <div className="flex min-w-0 items-center gap-2 text-sm text-muted-foreground">
          <QrCode className="h-4 w-4 shrink-0" />
          <span className="truncate font-medium">
            QRIS ready · {formatCurrency(row.amount)} · awaiting payment
          </span>
        </div>
        <Button variant="ghost" size="sm" className="h-7 shrink-0 px-2" onClick={onView}>
          View QR
        </Button>
      </div>
    );
  }

  return null;
}

export default OrderQrisStatus;
