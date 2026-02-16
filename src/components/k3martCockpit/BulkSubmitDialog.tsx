/**
 * BulkSubmitDialog - Sequential progress modal for bulk K3 Mart stock-in submissions
 *
 * Displays a modal showing per-outlet progress when submitting today's dispatch plan.
 * Each outlet shows a status line with animated icons (pending, submitting, success, failed).
 * Close button is enabled only when all outlets are processed.
 * Shows final summary when complete.
 */

import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Loader2, CheckCircle, XCircle, Clock } from 'lucide-react';

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';

interface BulkSubmitDialogProps {
  isOpen: boolean;
  onClose: () => void;
  outlets: Array<{
    outletId: string;
    outletName: string;
  }>;
  results: Array<{
    outletId: string;
    status: 'pending' | 'submitting' | 'success' | 'failed';
    error?: string;
  }>;
  /** Total progress count */
  completedCount: number;
}

const STATUS_ICONS = {
  pending: Clock,
  submitting: Loader2,
  success: CheckCircle,
  failed: XCircle,
};

const STATUS_COLORS = {
  pending: 'text-muted-foreground/70',
  submitting: 'text-amber-600',
  success: 'text-green-600',
  failed: 'text-red-600',
};

export const BulkSubmitDialog = React.memo(function BulkSubmitDialog({
  isOpen,
  onClose,
  outlets,
  results,
  completedCount,
}: BulkSubmitDialogProps) {
  const totalCount = outlets.length;
  const isComplete = completedCount === totalCount;
  const successCount = results.filter((r) => r.status === 'success').length;
  const failedCount = results.filter((r) => r.status === 'failed').length;

  return (
    <Dialog open={isOpen} onOpenChange={isComplete ? onClose : undefined}>
      <DialogContent className="max-w-md max-h-[80vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle>Submitting Today&apos;s Plan</DialogTitle>
          <DialogDescription>
            {isComplete ? (
              <span className="text-sm">
                Complete: <span className="font-semibold text-green-600">{successCount} succeeded</span>
                {failedCount > 0 && (
                  <>
                    , <span className="font-semibold text-red-600">{failedCount} failed</span>
                  </>
                )}
              </span>
            ) : (
              <span className="text-sm">
                Progress: {completedCount} of {totalCount} outlets
              </span>
            )}
          </DialogDescription>
        </DialogHeader>

        {/* Scrollable outlet list */}
        <div className="flex-1 overflow-y-auto space-y-2 py-2 pr-2">
          <AnimatePresence mode="popLayout">
            {outlets.map((outlet, index) => {
              const result = results.find((r) => r.outletId === outlet.outletId);
              const status = result?.status ?? 'pending';
              const Icon = STATUS_ICONS[status];
              const colorClass = STATUS_COLORS[status];

              return (
                <motion.div
                  key={outlet.outletId}
                  layout
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.2, delay: index * 0.05 }}
                  className="flex items-start gap-2 p-2 rounded-lg bg-muted"
                >
                  {/* Icon */}
                  <div className="shrink-0 pt-0.5">
                    <Icon
                      className={`h-4 w-4 ${colorClass} ${
                        status === 'submitting' ? 'animate-spin' : ''
                      }`}
                    />
                  </div>

                  {/* Outlet name and error message */}
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium text-foreground truncate">
                      {outlet.outletName}
                    </div>
                    {result?.error && (
                      <div className="text-xs text-red-600 mt-1">{result.error}</div>
                    )}
                  </div>
                </motion.div>
              );
            })}
          </AnimatePresence>
        </div>

        <DialogFooter>
          <Button onClick={onClose} disabled={!isComplete} variant="outline">
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
});
