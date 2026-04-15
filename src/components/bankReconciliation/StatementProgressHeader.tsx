/**
 * StatementProgressHeader — header strip above the split-view workspace.
 *
 * Live progress bar + 4 status chips (matched / suggested / unmatched / confirmed)
 * reading `useStatementProgress`. Phase 73 BANK-04 + UI-SPEC §6.3.
 */

import type { Id } from "../../../convex/_generated/dataModel";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useStatementProgress } from "@/hooks/convex/useBankReconciliation";

interface Props {
  statementId: Id<"bankStatements">;
  statementName: string;
  periodLabel: string;
}

export function StatementProgressHeader({ statementId, statementName, periodLabel }: Props) {
  const progress = useStatementProgress(statementId);

  if (progress === undefined) {
    return (
      <div
        className="flex flex-col gap-3 rounded-md border border-border bg-card p-4"
        data-testid="progress-header-skeleton"
      >
        <div className="flex items-center justify-between gap-4">
          <div>
            <div className="text-sm font-semibold text-foreground">{statementName}</div>
            <div className="text-xs text-muted-foreground">{periodLabel}</div>
          </div>
          <Skeleton className="h-2 w-32" />
        </div>
        <Skeleton className="h-2 w-full" />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3 rounded-md border border-border bg-card p-4">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <div className="text-sm font-semibold text-foreground">{statementName}</div>
          <div className="text-xs text-muted-foreground">{periodLabel}</div>
        </div>
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <Badge
            variant="outline"
            className="bg-[color:var(--color-status-success-bg)] text-[color:var(--color-status-success)] border-[color:var(--color-status-success)]/30 tabular-nums"
          >
            {`${progress.matched} matched`}
          </Badge>
          <Badge
            variant="outline"
            className="bg-[color:var(--color-status-warning-bg)] text-[color:var(--color-status-warning)] border-[color:var(--color-status-warning)]/30 tabular-nums"
          >
            {`${progress.suggested} suggested`}
          </Badge>
          <Badge
            variant="outline"
            className="bg-[color:var(--color-status-error-bg)] text-[color:var(--color-status-error)] border-[color:var(--color-status-error)]/30 tabular-nums"
          >
            {`${progress.unmatched} unmatched`}
          </Badge>
          <Badge className="bg-[color:var(--color-status-success)] text-white border-transparent tabular-nums">
            {`${progress.confirmed} confirmed`}
          </Badge>
        </div>
      </div>
      <Progress
        value={progress.reconciledPct}
        max={100}
        aria-label={`${progress.reconciledPct}% reconciled`}
        aria-valuenow={progress.reconciledPct}
        aria-valuemin={0}
        aria-valuemax={100}
      />
      <div className="text-xs text-muted-foreground">
        {progress.reconciledPct}% reconciled · {progress.confirmed}/{progress.total} confirmed
      </div>
    </div>
  );
}
