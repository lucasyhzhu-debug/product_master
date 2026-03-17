/**
 * FraudFlags -- inline fraud indicator badges for expense approval queue.
 * Displays duplicate warning, late submission, rejection count, shared receipt,
 * and flagged-for-review badges.
 */
import { Badge } from "@/components/ui/badge";
import { AlertTriangle, Clock, Copy, Flag } from "lucide-react";

interface FraudFlagsProps {
  duplicateWarning?: string;
  lateSubmission?: boolean;
  rejectionCount?: number;
  flaggedForReview?: boolean;
  flagReason?: string;
  sharedReceiptAcknowledged?: boolean;
}

export function FraudFlags({
  duplicateWarning,
  lateSubmission,
  rejectionCount,
  flaggedForReview,
  flagReason,
  sharedReceiptAcknowledged,
}: FraudFlagsProps) {
  const hasFlags =
    !!duplicateWarning || !!lateSubmission || (rejectionCount ?? 0) > 0 || !!flaggedForReview || !!sharedReceiptAcknowledged;

  if (!hasFlags) return null;

  return (
    <div className="flex flex-wrap items-center gap-2">
      {duplicateWarning && (
        <Badge
          variant="outline"
          className="text-[var(--color-status-warning)] border-[var(--color-status-warning)]/30 bg-[var(--color-status-warning-bg)]"
          title={duplicateWarning}
        >
          <AlertTriangle className="h-3 w-3 mr-1" aria-label="Duplicate warning" />
          Duplicate
        </Badge>
      )}
      {lateSubmission && (
        <Badge
          variant="outline"
          className="text-[var(--color-status-warning)] border-[var(--color-status-warning)]/30 bg-[var(--color-status-warning-bg)]"
        >
          <Clock className="h-3 w-3 mr-1" aria-label="Late submission" />
          Late (&gt;14 days)
        </Badge>
      )}
      {(rejectionCount ?? 0) > 0 && (
        <Badge variant="destructive">
          {rejectionCount}x rejected
        </Badge>
      )}
      {flaggedForReview && (
        <Badge
          variant="outline"
          className="text-red-600 border-red-300 bg-red-50 dark:bg-red-900/20 dark:text-red-400"
          title={flagReason ?? "Flagged for review"}
        >
          <Flag className="h-3 w-3 mr-1" aria-label="Flagged for review" />
          Flagged
        </Badge>
      )}
      {sharedReceiptAcknowledged && (
        <Badge
          variant="outline"
          className="text-sky-600 border-sky-300 bg-sky-50 dark:bg-sky-900/20 dark:text-sky-400"
          title="This receipt is shared with another expense (submitter confirmed)"
        >
          <Copy className="h-3 w-3 mr-1" aria-label="Shared receipt" />
          Shared Receipt
        </Badge>
      )}
    </div>
  );
}
