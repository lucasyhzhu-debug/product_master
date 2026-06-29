/**
 * EditUndeliveredOrderControl — Slice 2 money-path control (Task T10).
 *
 * Lets staff REDUCE pieces (or remove a line, qty 0) on a not-yet-delivered
 * SUBSCRIPTION order before it ships, by calling the backend orchestrator
 * `editUndeliveredSubscriptionOrder` (re-derives the credit reservation DOWN;
 * Pitfall #23). REDUCE-ONLY — increasing a line is "add more" = a new order.
 *
 * Self-contained + presentational: gates its own visibility and owns the
 * mutation, so it can be dropped into BOTH order surfaces (Pitfall #20):
 *   - OrderSlideOver.tsx  (T10, staff kanban drawer)
 *   - OrderDetail.tsx     (T11, full page)
 *
 * Roles: order_staff + manager + admin (the mutation accepts all three; this
 * surface is order_staff-reachable — NO manager-only gate here).
 */
import { useState, useEffect, useRef } from 'react';
import { useSessionMutation } from 'convex-helpers/react/sessions';
import { Pencil, Loader2 } from 'lucide-react';
import { api } from '../../../convex/_generated/api';
import type { Id } from '../../../convex/_generated/dataModel';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { toast } from 'sonner';
import { getErrorMessage } from '@/lib/utils';

// Editable = undelivered. Mirrors the backend deny-list (Cancelled +
// DELIVERY_DONE_STATUSES → AwaitingDelivery/Complete/legacy): of the 7 live
// statuses, only these four remain editable. Keep in lockstep with
// convex/subscriptions/queries.ts DELIVERY_DONE_STATUSES.
const EDITABLE_STATUSES = ['Draft', 'AwaitingPayment', 'PaymentReceived', 'BeingPrepared'];

export interface EditUndeliveredOrderItem {
  id: Id<'orderItems'>;
  productName: string;
  productVariant?: string | null;
  quantity: number;
}

interface EditUndeliveredOrderControlProps {
  orderId: Id<'orders'>;
  status: string;
  /** True only when the order has BOTH subscriptionId and subscriptionWeekId. */
  isSubscriptionOrder: boolean;
  items: EditUndeliveredOrderItem[];
}

export function EditUndeliveredOrderControl({
  orderId,
  status,
  isSubscriptionOrder,
  items,
}: EditUndeliveredOrderControlProps) {
  const editOrder = useSessionMutation(
    api.subscriptions.editOrder.editUndeliveredSubscriptionOrder,
  );
  const [open, setOpen] = useState(false);
  const [qty, setQty] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);
  const wasOpen = useRef(false);

  // Reset edit state from the CURRENT items ONLY on the open transition
  // (false→true). The parent (OrderSlideOver) rebuilds `items` via an inline
  // .map every render, so its identity changes on ANY reactive push; depending
  // on `items` here would re-fire while OPEN and silently wipe in-progress
  // edits. Reading `items` inside the effect (not as a dep) keeps the open-time
  // snapshot current without re-initializing on later identity changes.
  useEffect(() => {
    if (open && !wasOpen.current) {
      const init: Record<string, string> = {};
      for (const it of items) init[it.id] = String(it.quantity);
      setQty(init);
    }
    wasOpen.current = open;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // Gate (Pitfall #9: after all hooks): subscription order + undelivered status.
  if (!isSubscriptionOrder || !EDITABLE_STATUSES.includes(status) || items.length === 0) {
    return null;
  }

  // Resulting qty per line. An empty / non-numeric field is treated as 0 (remove);
  // anything above the current qty is clamped down to current (no increase).
  const lineStates = items.map((it) => {
    const raw = qty[it.id];
    const parsed = raw === undefined || raw.trim() === '' ? 0 : parseInt(raw, 10);
    const clamped = Number.isNaN(parsed)
      ? it.quantity
      : Math.min(Math.max(parsed, 0), it.quantity);
    return { itemId: it.id, newQty: clamped, original: it.quantity };
  });

  // Changed lines = reductions only (lands equal-to-original lines are filtered out).
  const changedLines = lineStates.filter((l) => l.newQty < l.original);

  // Minor-A: removing EVERY line leaves a zombie 0-item order — steer staff to
  // Cancel instead (backend also rejects this). Disable Save + show a hint.
  const removesAllLines = lineStates.every((l) => l.newQty === 0);

  const handleSubmit = async () => {
    if (changedLines.length === 0) {
      toast.error('Reduce at least one line first.');
      return;
    }
    if (removesAllLines) {
      toast.error('Cannot remove every line — cancel the order instead.');
      return;
    }
    setSubmitting(true);
    try {
      await editOrder({
        orderId,
        lines: changedLines.map(({ itemId, newQty }) => ({ itemId, newQty })),
      });
      toast.success('Order updated.');
      setOpen(false);
    } catch (err) {
      toast.error(getErrorMessage(err, 'Failed to update order'));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <>
      <Button
        variant="outline"
        size="sm"
        className="w-full text-violet-700 border-violet-300 hover:bg-violet-100"
        onClick={() => setOpen(true)}
      >
        <Pencil className="h-4 w-4 mr-2" />
        Edit order (reduce)
      </Button>

      <Dialog open={open} onOpenChange={(v) => { if (!submitting) setOpen(v); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Reduce order quantities</DialogTitle>
            <DialogDescription>
              Lower a line's quantity, or set it to 0 to remove it. You can only
              reduce here — to add more, create a new order.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3 py-2">
            {items.map((it) => (
              <div key={it.id} className="flex items-center gap-3">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">
                    {it.productName}
                    {it.productVariant ? ` · ${it.productVariant}` : ''}
                  </p>
                  <p className="text-xs text-muted-foreground">Current: {it.quantity}</p>
                </div>
                {/* Qty input — text + numeric inputMode so there are no spinner
                    arrows and the field can be cleared while typing. */}
                <Input
                  type="text"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  value={qty[it.id] ?? ''}
                  aria-label={`Quantity for ${it.productName}`}
                  className="w-16 h-9 text-sm text-center shrink-0"
                  onChange={(e) =>
                    setQty((prev) => ({
                      ...prev,
                      [it.id]: e.target.value.replace(/[^0-9]/g, ''),
                    }))
                  }
                />
              </div>
            ))}
          </div>

          {removesAllLines && (
            <p className="text-xs text-amber-600">
              This would remove every line. Cancel the order instead of emptying it.
            </p>
          )}

          <DialogFooter>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setOpen(false)}
              disabled={submitting}
            >
              Cancel
            </Button>
            <Button
              size="sm"
              onClick={handleSubmit}
              disabled={submitting || changedLines.length === 0 || removesAllLines}
            >
              {submitting ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Saving…
                </>
              ) : (
                'Save reductions'
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
