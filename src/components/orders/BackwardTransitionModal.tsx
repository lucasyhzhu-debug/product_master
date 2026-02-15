/**
 * BackwardTransitionModal - Confirmation dialog for moving orders backward.
 * Uses AlertDialog from shadcn/ui with reason textarea and status-specific warnings.
 *
 * Phase 14 Plan 04: Kanban board UI.
 */
import { useState } from 'react';
import { Loader2 } from 'lucide-react';
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogAction,
  AlertDialogCancel,
} from '@/components/ui/alert-dialog';
import { Alert } from '@/components/ui/alert';
import { Textarea } from '@/components/ui/textarea';

// ============================================
// Types
// ============================================

interface BackwardTransitionModalProps {
  open: boolean;
  onClose: () => void;
  onConfirm: (reason: string) => Promise<void>;
  fromStatus: string;
  targetStatus: string;
  isLoading?: boolean;
}

// ============================================
// Status Display Labels
// ============================================

const STATUS_LABELS: Record<string, string> = {
  Draft: 'Draft',
  AwaitingPayment: 'Awaiting Payment',
  PaymentReceived: 'Payment Received',
  BeingPrepared: 'Being Prepared',
  AwaitingDelivery: 'Awaiting Delivery',
  Complete: 'Complete',
};

// ============================================
// Warning Messages
// ============================================

function getWarningMessage(fromStatus: string, targetStatus: string): string | null {
  if (fromStatus === 'PaymentReceived' && (targetStatus === 'AwaitingPayment' || targetStatus === 'Draft')) {
    return 'This will reverse the sales record for this order.';
  }
  if (fromStatus === 'BeingPrepared' && targetStatus === 'PaymentReceived') {
    return 'This will unallocate all packages.';
  }
  if (fromStatus === 'Complete' && targetStatus === 'AwaitingDelivery') {
    return 'This will reopen the order for delivery.';
  }
  return null;
}

// ============================================
// Component
// ============================================

export function BackwardTransitionModal({
  open,
  onClose,
  onConfirm,
  fromStatus,
  targetStatus,
  isLoading = false,
}: BackwardTransitionModalProps) {
  const [reason, setReason] = useState('');
  const warningMessage = getWarningMessage(fromStatus, targetStatus);
  const targetLabel = STATUS_LABELS[targetStatus] ?? targetStatus;

  const handleConfirm = async () => {
    await onConfirm(reason);
    setReason('');
  };

  const handleClose = () => {
    setReason('');
    onClose();
  };

  return (
    <AlertDialog open={open} onOpenChange={(v) => !v && handleClose()}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Move order back to {targetLabel}?</AlertDialogTitle>
          <AlertDialogDescription>
            This will revert the order status. This action is logged in the audit trail.
          </AlertDialogDescription>
        </AlertDialogHeader>

        {warningMessage && (
          <Alert variant="destructive" className="text-sm">
            {warningMessage}
          </Alert>
        )}

        <Textarea
          placeholder="Reason for reverting (optional)"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          rows={3}
        />

        <AlertDialogFooter>
          <AlertDialogCancel disabled={isLoading} onClick={handleClose}>
            Cancel
          </AlertDialogCancel>
          <AlertDialogAction
            onClick={handleConfirm}
            disabled={isLoading}
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
          >
            {isLoading && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
            Move Back
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
