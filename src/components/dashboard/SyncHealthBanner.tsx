import { Link } from "react-router-dom";
import { AlertTriangle } from "lucide-react";
import { useConvexSyncHealthAlert } from "@/hooks/convex";

/**
 * Format a duration in milliseconds to a human-readable string.
 * e.g. 7200000 -> "2 hours", 9000000 -> "2 hours 30 minutes"
 */
function formatDuration(ms: number): string {
  const totalMinutes = Math.floor(ms / 60_000);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;

  if (hours === 0) return `${minutes} minute${minutes !== 1 ? "s" : ""}`;
  if (minutes === 0) return `${hours} hour${hours !== 1 ? "s" : ""}`;
  return `${hours} hour${hours !== 1 ? "s" : ""} ${minutes} minute${minutes !== 1 ? "s" : ""}`;
}

/**
 * Persistent sync failure banner for the main dashboard.
 * Appears when any API sync (GoFood, K3 Mart) has failed for 6+ hours.
 * Cannot be dismissed -- disappears only when sync recovers (reactive Convex query).
 */
export function SyncHealthBanner() {
  const { data: alert } = useConvexSyncHealthAlert();

  // Loading or no data yet
  if (alert === undefined) return null;
  // No alerts active
  if (!alert.hasAlert) return null;

  return (
    <div className="rounded-lg border border-destructive/50 bg-destructive/10 p-3 mb-4">
      <div className="space-y-1">
        {alert.alerts.map((a) => (
          <div key={a.platform} className="flex items-center gap-2 text-sm">
            <AlertTriangle
              className={`h-4 w-4 shrink-0 ${
                a.lastError ? "text-destructive" : "text-amber-500"
              }`}
            />
            <span className={a.lastError ? "text-destructive" : "text-amber-600 dark:text-amber-400"}>
              {a.lastError
                ? `${a.platformName} sync failed: ${a.lastError}`
                : `${a.platformName} has not synced in ${formatDuration(a.staleSinceMs)}`}
            </span>
          </div>
        ))}
      </div>
      <Link
        to="/sales-analytics?tab=settings"
        className="text-xs text-primary underline mt-2 block"
      >
        Go to Settings
      </Link>
    </div>
  );
}
