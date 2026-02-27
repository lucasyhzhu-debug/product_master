/**
 * SyncStatusBadge - Shows the latest GrabFood menu sync status as a colored badge.
 * Displays relative time since last sync.
 */
import { Badge } from "@/components/ui/badge";

interface SyncLogEntry {
  _id: string;
  status: string;
  _creationTime: number;
  timestamp?: number;
}

interface SyncStatusBadgeProps {
  syncStatus: SyncLogEntry[] | undefined;
}

function getRelativeTime(timestamp: number): string {
  const diff = Date.now() - timestamp;
  const seconds = Math.floor(diff / 1000);
  if (seconds < 60) return "just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

export function SyncStatusBadge({ syncStatus }: SyncStatusBadgeProps) {
  if (!syncStatus || syncStatus.length === 0) {
    return (
      <Badge variant="secondary" className="text-xs">
        Not synced
      </Badge>
    );
  }

  const latest = syncStatus[0];
  const time = latest.timestamp ?? latest._creationTime;
  const relativeTime = getRelativeTime(time);

  if (latest.status === "success") {
    return (
      <span className="inline-flex items-center gap-1.5">
        <Badge className="bg-[var(--color-status-success)] text-white text-xs">
          Synced
        </Badge>
        <span className="text-xs text-muted-foreground">{relativeTime}</span>
      </span>
    );
  }

  if (latest.status === "error") {
    return (
      <span className="inline-flex items-center gap-1.5">
        <Badge variant="destructive" className="text-xs">
          Sync Failed
        </Badge>
        <span className="text-xs text-muted-foreground">{relativeTime}</span>
      </span>
    );
  }

  if (latest.status === "started") {
    return (
      <span className="inline-flex items-center gap-1.5">
        <Badge className="bg-[var(--color-status-warning)] text-white text-xs">
          Syncing...
        </Badge>
        <span className="text-xs text-muted-foreground">{relativeTime}</span>
      </span>
    );
  }

  return (
    <Badge variant="secondary" className="text-xs">
      {latest.status}
    </Badge>
  );
}
