import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Loader2, RefreshCw } from "lucide-react";
import { toast } from "sonner";

interface PlatformSyncPanelProps {
  /** Whether to show date range inputs (K3Mart and GoBiz use dates, Internal does not) */
  showDateRange: boolean;
  /** When true, hides the end date input and shows "to today" hint (e.g., GoBiz only supports daysBack) */
  hideEndDate?: boolean;
  /** Optional secondary action button (e.g., K3Mart "Refresh Stores") */
  secondaryAction?: {
    label: string;
    loadingLabel: string;
    onAction: () => Promise<void>;
  };
  /** Primary sync function -- receives fromDate/toDate if showDateRange is true */
  onSync: (params: { fromDate?: string; toDate?: string }) => Promise<void>;
  /** Whether any sync action is currently running */
  isSyncing: boolean;
}

export function PlatformSyncPanel({
  showDateRange,
  hideEndDate = false,
  secondaryAction,
  onSync,
  isSyncing,
}: PlatformSyncPanelProps) {
  const today = new Date().toISOString().slice(0, 10);
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
    .toISOString()
    .slice(0, 10);

  const [startDate, setStartDate] = useState(thirtyDaysAgo);
  const [endDate, setEndDate] = useState(today);
  const [secondaryLoading, setSecondaryLoading] = useState(false);

  const handleSync = async () => {
    if (showDateRange) {
      const effectiveEndDate = hideEndDate ? today : endDate;
      const diffMs =
        new Date(effectiveEndDate).getTime() - new Date(startDate).getTime();
      const diffDays = diffMs / (24 * 60 * 60 * 1000);
      if (diffDays > 31) {
        toast.error("Date range cannot exceed 31 days");
        return;
      }
      if (diffDays < 0) {
        toast.error("Start date must be before end date");
        return;
      }
      await onSync({ fromDate: startDate, toDate: effectiveEndDate });
    } else {
      await onSync({});
    }
  };

  const handleSecondary = async () => {
    if (!secondaryAction) return;
    setSecondaryLoading(true);
    try {
      await secondaryAction.onAction();
    } finally {
      setSecondaryLoading(false);
    }
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-end gap-2">
        {showDateRange && (
          <div className="flex items-center gap-2">
            <div>
              <label className="text-xs text-muted-foreground block mb-1">
                Start Date
              </label>
              <Input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="h-8 text-xs w-[130px]"
                disabled={isSyncing}
              />
            </div>
            {hideEndDate ? (
              <span className="text-xs text-muted-foreground self-end pb-1.5">to today</span>
            ) : (
              <div>
                <label className="text-xs text-muted-foreground block mb-1">
                  End Date
                </label>
                <Input
                  type="date"
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                  className="h-8 text-xs w-[130px]"
                  disabled={isSyncing}
                />
              </div>
            )}
          </div>
        )}
        <Button
          size="sm"
          onClick={handleSync}
          disabled={isSyncing}
          className="h-8 text-xs gap-1.5"
        >
          {isSyncing ? (
            <>
              <Loader2 className="h-3 w-3 animate-spin" />
              Syncing...
            </>
          ) : (
            <>
              <RefreshCw className="h-3 w-3" />
              Sync Now
            </>
          )}
        </Button>
        {secondaryAction && (
          <Button
            size="sm"
            variant="outline"
            onClick={handleSecondary}
            disabled={isSyncing || secondaryLoading}
            className="h-8 text-xs gap-1.5"
          >
            {secondaryLoading ? (
              <>
                <Loader2 className="h-3 w-3 animate-spin" />
                {secondaryAction.loadingLabel}
              </>
            ) : (
              <>
                <RefreshCw className="h-3 w-3" />
                {secondaryAction.label}
              </>
            )}
          </Button>
        )}
      </div>
    </div>
  );
}
