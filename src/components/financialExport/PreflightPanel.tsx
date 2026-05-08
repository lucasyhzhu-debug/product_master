import { Loader2, AlertTriangle } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";

interface PreflightPanelProps {
  isLoading: boolean;
  data:
    | {
        journalLineCount: number;
        revenueRowCount: number;
        periodCount: number;
        isLargeRange: boolean;
      }
    | undefined;
  hasValidRange: boolean;
}

/**
 * Phase 76 plan 04 — Preflight summary panel.
 *
 * Renders the live preflight stats from `getExportPreflight` with three
 * visible states (D-12 + D-16):
 *  - invalid range -> static empty hint copy
 *  - loading       -> Loader2 spinner + "Calculating range…"
 *  - has data      -> stat row in tabular-nums + optional large-range warning
 *
 * The large-range warning is informational, not blocking, so the surrounding
 * Alert is overridden to `role="status"` (not the default `role="alert"`).
 */
export function PreflightPanel({ isLoading, data, hasValidRange }: PreflightPanelProps) {
  return (
    <Card className="bg-muted/40">
      <CardHeader>
        <CardTitle className="text-base font-semibold">Preflight summary</CardTitle>
      </CardHeader>
      <CardContent aria-live="polite">
        {!hasValidRange && (
          <p className="text-sm text-muted-foreground">
            No data in this range.
            <br />
            <span className="text-xs">
              Adjust the dates above and the summary will refresh.
            </span>
          </p>
        )}
        {hasValidRange && isLoading && (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            Calculating range…
          </div>
        )}
        {hasValidRange && !isLoading && data && (
          <>
            <p className="text-sm tabular-nums">
              Range covers <strong>{data.journalLineCount}</strong> journal entries,{" "}
              <strong>{data.revenueRowCount}</strong> revenue rows,{" "}
              <strong>{data.periodCount}</strong> periods.
            </p>
            {data.isLargeRange && (
              <Alert role="status" className="mt-3">
                <AlertTriangle className="h-4 w-4" />
                <AlertTitle>Large range</AlertTitle>
                <AlertDescription>
                  This range covers more than 10,000 lines. Export may take a moment to
                  download.
                </AlertDescription>
              </Alert>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}
