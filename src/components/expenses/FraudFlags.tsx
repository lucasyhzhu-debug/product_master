/**
 * FraudFlags -- inline fraud indicator badges for expense approval queue.
 * Displays duplicate warning, late submission, and rejection count badges.
 */
import { Badge } from "@/components/ui/badge";
import { AlertTriangle, Clock } from "lucide-react";

interface FraudFlagsProps {
  duplicateWarning?: string;
  lateSubmission?: boolean;
  rejectionCount?: number;
}

export function FraudFlags({
  duplicateWarning,
  lateSubmission,
  rejectionCount,
}: FraudFlagsProps) {
  const hasFlags =
    !!duplicateWarning || !!lateSubmission || (rejectionCount ?? 0) > 0;

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
    </div>
  );
}
