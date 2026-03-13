/**
 * RejectionChain -- timeline display of prior rejections for an expense.
 * Walks the previousExpenseId chain via the useRejectionChain hook.
 */
import { Skeleton } from "@/components/ui/skeleton";
import { useRejectionChain } from "@/hooks/convex/useExpenses";
import { utcToWibDateStr } from "@/lib/dateUtils";
import type { Id } from "../../../convex/_generated/dataModel";

interface RejectionChainProps {
  expenseId: Id<"expenses">;
}

export function RejectionChain({ expenseId }: RejectionChainProps) {
  const chain = useRejectionChain(expenseId);

  // Loading
  if (chain === undefined) {
    return (
      <div className="space-y-2 mt-2">
        <Skeleton className="h-4 w-40" />
        <Skeleton className="h-12 w-full" />
      </div>
    );
  }

  // No rejection history
  if (chain.length === 0) return null;

  return (
    <div className="mt-3">
      <p className="text-xs font-medium text-muted-foreground mb-2">
        Prior Rejections ({chain.length})
      </p>
      <div className="relative pl-4">
        {/* Vertical timeline line */}
        <div className="absolute left-[7px] top-1 bottom-1 w-0.5 bg-border" />

        {chain.map((entry, i) => (
          <div key={entry.expenseId} className="relative pb-3 last:pb-0">
            {/* Timeline dot */}
            <div className="absolute left-[-12px] top-1.5 w-2.5 h-2.5 rounded-full bg-destructive" />

            <div className="text-sm">
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <span className="font-medium">Revision {chain.length - i}</span>
                {entry.rejectedAt && (
                  <span>{utcToWibDateStr(entry.rejectedAt)}</span>
                )}
              </div>
              {entry.rejectionReason && (
                <p className="text-sm mt-0.5 text-foreground">
                  {entry.rejectionReason}
                </p>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
