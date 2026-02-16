/**
 * StatusActionButtons - Renders appropriate action buttons per order status.
 * Handles forward/backward status transitions with loading states.
 *
 * Phase 14 Plan 04: Kanban board UI.
 */
import { useState } from 'react';
import { ChevronLeft, Loader2, Send, DollarSign, Zap, Truck, Copy } from 'lucide-react';
import { useMutation } from 'convex/react';
import { useNavigate } from 'react-router-dom';
import { ConvexError } from 'convex/values';
import { api } from '../../../convex/_generated/api';
import type { Id } from '../../../convex/_generated/dataModel';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { useAuth } from '@/contexts/AuthContext';
import { BackwardTransitionModal } from './BackwardTransitionModal';
import { getErrorMessage } from '@/lib/utils';

// ============================================
// Backward Transition Targets
// ============================================

const BACKWARD_TARGETS: Record<string, string> = {
  AwaitingPayment: 'Draft',
  PaymentReceived: 'AwaitingPayment',
  BeingPrepared: 'PaymentReceived',
  AwaitingDelivery: 'BeingPrepared',
  Complete: 'AwaitingDelivery',
};

// ============================================
// Types
// ============================================

interface StatusActionButtonsProps {
  orderId: Id<"orders">;
  status: string;
  onStatusChange?: () => void;
}

// ============================================
// Component
// ============================================

export function StatusActionButtons({ orderId, status, onStatusChange }: StatusActionButtonsProps) {
  const { user } = useAuth();
  const token = user?.token ?? '';
  const navigate = useNavigate();

  const moveForward = useMutation(api.orders.mutations.statusUpdates.moveForward);
  const moveBackwardMut = useMutation(api.orders.mutations.statusUpdates.moveBackward);
  const expediteOrderMut = useMutation(api.orders.mutations.statusUpdates.expediteOrder);
  const cancelOrderMut = useMutation(api.orders.mutations.index.cancel);
  const copyFromCancelledMut = useMutation(api.orders.mutations.orderCrud.copyFromCancelled);

  const [isForwardLoading, setIsForwardLoading] = useState(false);
  const [isBackwardLoading, setIsBackwardLoading] = useState(false);
  const [isCancelLoading, setIsCancelLoading] = useState(false);
  const [showBackwardModal, setShowBackwardModal] = useState(false);

  // Stock override dialog state
  const [showStockOverride, setShowStockOverride] = useState(false);
  const [stockShortageMessage, setStockShortageMessage] = useState('');
  const [overrideReason, setOverrideReason] = useState('');
  const [isOverrideLoading, setIsOverrideLoading] = useState(false);

  const backwardTarget = BACKWARD_TARGETS[status];
  const isManagerOrAdmin = user?.role === 'manager' || user?.role === 'admin';

  // ============================================
  // Forward Action
  // ============================================

  const handleForward = async () => {
    setIsForwardLoading(true);
    try {
      if (status === 'PaymentReceived') {
        // Expedite into kitchen
        await expediteOrderMut({ orderId, token });
        toast.success('Order expedited to kitchen');
      } else {
        await moveForward({ orderId, token });
        toast.success('Order moved forward');
      }
      onStatusChange?.();
    } catch (error: unknown) {
      // Check for insufficient stock error -> show override dialog
      const errMsg = error instanceof ConvexError ? String(error.data) : error instanceof Error ? error.message : '';
      if (errMsg.includes('Insufficient packaging stock') && isManagerOrAdmin) {
        setStockShortageMessage(errMsg);
        setOverrideReason('');
        setShowStockOverride(true);
      } else {
        toast.error(getErrorMessage(error, 'Failed to update status'));
      }
    } finally {
      setIsForwardLoading(false);
    }
  };

  const handleStockOverride = async () => {
    if (!overrideReason.trim()) return;
    setIsOverrideLoading(true);
    try {
      await moveForward({ orderId, token, skipStockCheck: true, overrideReason: overrideReason.trim() });
      toast.success('Order moved forward (stock override)');
      setShowStockOverride(false);
      onStatusChange?.();
    } catch (error: unknown) {
      toast.error(getErrorMessage(error, 'Failed to override'));
    } finally {
      setIsOverrideLoading(false);
    }
  };

  // ============================================
  // Backward Action
  // ============================================

  const handleBackward = async (reason: string) => {
    if (!backwardTarget) return;
    setIsBackwardLoading(true);
    try {
      await moveBackwardMut({
        orderId,
        targetStatus: backwardTarget as "Draft" | "AwaitingPayment" | "PaymentReceived" | "BeingPrepared" | "AwaitingDelivery" | "Complete" | "Cancelled",
        reason: reason || undefined,
        token,
      });
      toast.success('Order moved back');
      setShowBackwardModal(false);
      onStatusChange?.();
    } catch (error: unknown) {
      toast.error(getErrorMessage(error, 'Failed to move order back'));
    } finally {
      setIsBackwardLoading(false);
    }
  };

  // ============================================
  // Cancel Action
  // ============================================

  const handleCancel = async () => {
    setIsCancelLoading(true);
    try {
      await cancelOrderMut({ orderId });
      toast.success('Order cancelled');
      onStatusChange?.();
    } catch (error: unknown) {
      toast.error(getErrorMessage(error, 'Failed to cancel order'));
    } finally {
      setIsCancelLoading(false);
    }
  };

  // ============================================
  // Render per status
  // ============================================

  const isTerminal = status === 'Complete' || status === 'Cancelled';

  return (
    <div className="space-y-3">
      {/* Forward + Backward row */}
      <div className="flex items-center gap-2">
        {/* Backward button */}
        {backwardTarget && (
          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowBackwardModal(true)}
            disabled={isBackwardLoading}
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
        )}

        {/* Forward button (status-specific) */}
        {status === 'Draft' && (
          <Button
            className="flex-1 bg-green-600 hover:bg-green-700 text-white"
            onClick={handleForward}
            disabled={isForwardLoading}
          >
            {isForwardLoading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Send className="h-4 w-4 mr-2" />}
            Submit Order
          </Button>
        )}

        {status === 'AwaitingPayment' && (
          <Button
            className="flex-1 bg-blue-600 hover:bg-blue-700 text-white"
            onClick={handleForward}
            disabled={isForwardLoading}
          >
            {isForwardLoading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <DollarSign className="h-4 w-4 mr-2" />}
            Customer Paid!
          </Button>
        )}

        {status === 'PaymentReceived' && (
          <Button
            className="flex-1 bg-amber-600 hover:bg-amber-700 text-white"
            onClick={handleForward}
            disabled={isForwardLoading}
          >
            {isForwardLoading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Zap className="h-4 w-4 mr-2" />}
            Expedite Production
          </Button>
        )}

        {status === 'BeingPrepared' && (
          <span className="flex-1 text-xs text-muted-foreground italic">
            Kitchen completes this order
          </span>
        )}

        {status === 'AwaitingDelivery' && (
          <Button
            className="flex-1 bg-green-600 hover:bg-green-700 text-white"
            onClick={handleForward}
            disabled={isForwardLoading}
          >
            {isForwardLoading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Truck className="h-4 w-4 mr-2" />}
            Mark Delivered
          </Button>
        )}
      </div>

      {/* Cancel button (non-terminal only) */}
      {!isTerminal && (
        <Button
          variant="outline"
          size="sm"
          className="w-full text-destructive border-destructive/30 hover:bg-destructive/10"
          onClick={handleCancel}
          disabled={isCancelLoading}
        >
          {isCancelLoading && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
          Cancel Order
        </Button>
      )}

      {/* Copy to New Order (Cancelled only) */}
      {status === 'Cancelled' && (
        <Button
          variant="outline"
          size="sm"
          className="w-full"
          onClick={async () => {
            try {
              const newOrderId = await copyFromCancelledMut({ orderId, token });
              toast.success('Draft order created from cancelled order');
              navigate(`/orders/new?orderId=${newOrderId}`);
            } catch (error: unknown) {
              toast.error(getErrorMessage(error, 'Failed to copy order'));
            }
          }}
        >
          <Copy className="h-4 w-4 mr-2" />
          Copy to New Order
        </Button>
      )}

      {/* Backward transition modal */}
      {backwardTarget && (
        <BackwardTransitionModal
          open={showBackwardModal}
          onClose={() => setShowBackwardModal(false)}
          onConfirm={handleBackward}
          fromStatus={status}
          targetStatus={backwardTarget}
          isLoading={isBackwardLoading}
        />
      )}

      {/* Stock override dialog */}
      <AlertDialog open={showStockOverride} onOpenChange={setShowStockOverride}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Insufficient Packaging Stock</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-2">
                {stockShortageMessage
                  .replace('Insufficient packaging stock:\n', '')
                  .replace('\n\nAuthorized staff can override to proceed.', '')
                  .split('\n')
                  .filter(Boolean)
                  .map((line, i) => (
                    <p key={i} className="text-sm">{line}</p>
                  ))}
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="py-2">
            <Textarea
              placeholder="Reason for override (required)..."
              value={overrideReason}
              onChange={(e) => setOverrideReason(e.target.value)}
              rows={2}
              className="resize-none"
            />
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isOverrideLoading}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                handleStockOverride();
              }}
              disabled={!overrideReason.trim() || isOverrideLoading}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {isOverrideLoading && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
              Override & Continue
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
