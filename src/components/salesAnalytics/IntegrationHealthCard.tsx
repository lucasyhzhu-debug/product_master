import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  CheckCircle2,
  XCircle,
  AlertTriangle,
  RefreshCw,
  Clock,
  Settings2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { PlatformMeta } from "../../../convex/integrations/registry";

// Types matching the getSyncHealthStatus query return
interface SyncHealthData {
  lastSync: {
    timestamp: number;
    status: string;
    error?: string;
    productsCount?: number;
    durationMs?: number;
  } | null;
  syncHistory: Array<{
    timestamp: number;
    status: string;
    syncType: string;
    productsCount?: number;
    errorMessage?: string;
    durationMs?: number;
  }>;
  isStale: boolean;
  staleSinceMs: number | null;
}

interface CredentialStatus {
  hasCredentials: boolean;
  hasToken: boolean;
  hasRefreshToken: boolean;
  email?: string | null;
  tokenExpiresAt?: number | null;
  tokenExpiresIn?: number | null;
  lastRefreshAt?: number | null;
  lastRefreshStatus?: string | null;
  lastRefreshError?: string | null;
}

interface IntegrationHealthCardProps {
  platformId: string;
  platformMeta: PlatformMeta;
  syncHealth: SyncHealthData | undefined;
  credentialStatus: CredentialStatus | undefined;
  isAdmin: boolean;
  onSyncNow: () => void;
  onConfigure?: () => void;
  isSyncing: boolean;
  syncLabel?: string;
  onSecondarySync?: () => void;
  secondarySyncLabel?: string;
  isSecondarySyncing?: boolean;
}

function formatRelativeTime(timestamp: number): string {
  const now = Date.now();
  const diff = now - timestamp;
  const seconds = Math.floor(diff / 1000);
  const minutes = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);

  if (seconds < 60) return "Just now";
  if (minutes < 60) return `${minutes}m ago`;
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

function formatCountdown(ms: number): string {
  if (ms <= 0) return "Expired";
  const minutes = Math.floor(ms / 60000);
  const hours = Math.floor(minutes / 60);
  if (hours > 0) return `${hours}h ${minutes % 60}m`;
  return `${minutes}m`;
}

type OverallStatus = "connected" | "warning" | "error";

function getOverallStatus(
  syncHealth: SyncHealthData | undefined,
  credentialStatus: CredentialStatus | undefined,
  platformId: string
): OverallStatus {
  // No sync data at all
  if (!syncHealth?.lastSync) return "error";

  // Token expired for platforms that use tokens
  if (
    (platformId === "k3mart" || platformId === "gobiz") &&
    credentialStatus
  ) {
    if (!credentialStatus.hasToken) return "error";
    if (
      credentialStatus.tokenExpiresIn !== undefined &&
      credentialStatus.tokenExpiresIn !== null &&
      credentialStatus.tokenExpiresIn <= 0
    ) {
      return "error";
    }
  }

  // Last sync was an error
  if (syncHealth.lastSync.status === "error") return "warning";

  // Stale (no successful sync in 6+ hours)
  if (syncHealth.isStale) return "warning";

  return "connected";
}

const STATUS_CONFIG: Record<
  OverallStatus,
  { label: string; badgeClass: string; dotColor: string; Icon: typeof CheckCircle2 }
> = {
  connected: {
    label: "Connected",
    badgeClass:
      "border-green-500 dark:border-green-600 text-green-700 dark:text-green-400 bg-green-50 dark:bg-green-950/30",
    dotColor: "bg-green-500",
    Icon: CheckCircle2,
  },
  warning: {
    label: "Warning",
    badgeClass:
      "border-amber-500 dark:border-amber-600 text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/30",
    dotColor: "bg-amber-500",
    Icon: AlertTriangle,
  },
  error: {
    label: "Error",
    badgeClass:
      "border-red-500 dark:border-red-600 text-red-700 dark:text-red-400 bg-red-50 dark:bg-red-950/30",
    dotColor: "bg-red-500",
    Icon: XCircle,
  },
};

export function IntegrationHealthCard({
  platformId,
  platformMeta,
  syncHealth,
  credentialStatus,
  isAdmin,
  onSyncNow,
  onConfigure,
  isSyncing,
  syncLabel = "Sync Now",
  onSecondarySync,
  secondarySyncLabel,
  isSecondarySyncing = false,
}: IntegrationHealthCardProps) {
  const overallStatus = getOverallStatus(syncHealth, credentialStatus, platformId);
  const statusConfig = STATUS_CONFIG[overallStatus];
  const StatusIcon = statusConfig.Icon;

  // Token countdown state (updates every 30 seconds)
  const [countdownText, setCountdownText] = useState<string | null>(null);
  const [nextRefreshText, setNextRefreshText] = useState<string | null>(null);

  useEffect(() => {
    const hasTokenPlatform = platformId === "k3mart" || platformId === "gobiz";
    if (!hasTokenPlatform || !credentialStatus) return;

    function updateCountdown() {
      if (!credentialStatus) return;

      // Token expiry countdown
      if (
        credentialStatus.tokenExpiresIn !== undefined &&
        credentialStatus.tokenExpiresIn !== null
      ) {
        // tokenExpiresIn is calculated server-side at query time, adjust for elapsed time
        const expiresAt = credentialStatus.tokenExpiresAt;
        if (expiresAt) {
          const remaining = expiresAt - Date.now();
          setCountdownText(formatCountdown(remaining));
        } else {
          setCountdownText(formatCountdown(credentialStatus.tokenExpiresIn));
        }
      } else {
        setCountdownText(null);
      }

      // Next refresh countdown (30-min cron cycle)
      if (credentialStatus.lastRefreshAt) {
        const msSinceRefresh = Date.now() - credentialStatus.lastRefreshAt;
        const nextRefreshMs = 30 * 60 * 1000 - msSinceRefresh;
        setNextRefreshText(
          nextRefreshMs > 0 ? formatCountdown(nextRefreshMs) : "Due now"
        );
      } else {
        setNextRefreshText(null);
      }
    }

    updateCountdown();
    const interval = setInterval(updateCountdown, 30000);
    return () => clearInterval(interval);
  }, [platformId, credentialStatus]);

  // Token status for platforms that use tokens
  const showTokenSection = platformId === "k3mart" || platformId === "gobiz";

  function getTokenStatusBadge() {
    if (!credentialStatus) return null;
    if (!credentialStatus.hasToken) {
      return (
        <Badge
          variant="outline"
          className="border-red-500 dark:border-red-600 text-red-700 dark:text-red-400 text-[10px] px-1.5 py-0"
        >
          No token
        </Badge>
      );
    }
    if (
      credentialStatus.tokenExpiresIn !== null &&
      credentialStatus.tokenExpiresIn !== undefined &&
      credentialStatus.tokenExpiresIn <= 0
    ) {
      return (
        <Badge
          variant="outline"
          className="border-red-500 dark:border-red-600 text-red-700 dark:text-red-400 text-[10px] px-1.5 py-0"
        >
          Expired
        </Badge>
      );
    }
    return (
      <Badge
        variant="outline"
        className="border-green-500 dark:border-green-600 text-green-700 dark:text-green-400 text-[10px] px-1.5 py-0"
      >
        Active
      </Badge>
    );
  }

  return (
    <Card>
      {/* Header row */}
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-start gap-3">
            <div
              className={cn(
                "h-3 w-3 rounded-full mt-1.5 shrink-0",
                statusConfig.dotColor
              )}
            />
            <div className="space-y-0.5">
              <div className="font-semibold">{platformMeta.name}</div>
              <div className="text-sm text-muted-foreground">
                {platformMeta.description}
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <Badge variant="outline" className={statusConfig.badgeClass}>
              <StatusIcon className="h-3 w-3 mr-1" />
              {statusConfig.label}
            </Badge>
          </div>
        </div>
      </CardHeader>

      <CardContent className="pt-0 space-y-4">
        {/* Token status section */}
        {showTokenSection && (
          <div className="space-y-1 text-xs text-muted-foreground">
            <div className="flex items-center gap-2">
              <span>Token:</span>
              {getTokenStatusBadge()}
            </div>
            {countdownText && credentialStatus?.hasToken && (
              <div className="flex items-center gap-1.5">
                <Clock className="h-3 w-3" />
                <span>
                  Expires in {countdownText}
                  {nextRefreshText && `, next refresh in ${nextRefreshText}`}
                </span>
              </div>
            )}
            {credentialStatus?.hasRefreshToken && (
              <div className="flex items-center gap-2">
                <span>Refresh token:</span>
                <Badge
                  variant="outline"
                  className="border-green-500 dark:border-green-600 text-green-700 dark:text-green-400 text-[10px] px-1.5 py-0"
                >
                  Saved
                </Badge>
              </div>
            )}
            {isAdmin && onConfigure && (
              <Button
                variant="ghost"
                size="sm"
                onClick={onConfigure}
                className="h-7 px-2 text-xs mt-1"
              >
                <Settings2 className="h-3 w-3 mr-1" />
                Configure
              </Button>
            )}
          </div>
        )}

        {/* Last sync row */}
        <div className="text-xs text-muted-foreground">
          <div className="flex items-center gap-1.5">
            {syncHealth?.lastSync ? (
              <>
                {syncHealth.lastSync.status === "success" ? (
                  <CheckCircle2 className="h-3 w-3 text-green-600 dark:text-green-400" />
                ) : (
                  <XCircle className="h-3 w-3 text-red-600 dark:text-red-400" />
                )}
                <span>
                  Last synced {formatRelativeTime(syncHealth.lastSync.timestamp)}
                </span>
                {syncHealth.lastSync.status === "error" &&
                  syncHealth.lastSync.error && (
                    <span className="text-red-600 dark:text-red-400 ml-1">
                      - {syncHealth.lastSync.error}
                    </span>
                  )}
              </>
            ) : (
              <>
                <AlertTriangle className="h-3 w-3 text-amber-500" />
                <span>Never synced</span>
              </>
            )}
          </div>
        </div>

        {/* Sync history (last 24h) */}
        {syncHealth?.syncHistory && syncHealth.syncHistory.length > 0 && (
          <div className="space-y-1.5">
            <div className="text-xs font-medium text-muted-foreground">
              Sync History (24h)
            </div>
            <ScrollArea className="max-h-40">
              <div className="space-y-1">
                {syncHealth.syncHistory.map((entry, i) => (
                  <div
                    key={`${entry.timestamp}-${i}`}
                    className="flex items-center gap-2 text-xs py-1 px-1 rounded hover:bg-muted/50"
                  >
                    <span className="text-muted-foreground shrink-0 w-14">
                      {formatRelativeTime(entry.timestamp)}
                    </span>
                    {entry.status === "success" ? (
                      <Badge
                        variant="outline"
                        className="border-green-500 dark:border-green-600 text-green-700 dark:text-green-400 text-[10px] px-1.5 py-0"
                      >
                        OK
                      </Badge>
                    ) : entry.status === "error" ? (
                      <Badge
                        variant="outline"
                        className="border-red-500 dark:border-red-600 text-red-700 dark:text-red-400 text-[10px] px-1.5 py-0"
                      >
                        Err
                      </Badge>
                    ) : (
                      <Badge
                        variant="outline"
                        className="text-muted-foreground text-[10px] px-1.5 py-0"
                      >
                        ...
                      </Badge>
                    )}
                    {entry.productsCount !== undefined && entry.productsCount > 0 && (
                      <span className="text-muted-foreground">
                        {entry.productsCount} synced
                      </span>
                    )}
                    {entry.durationMs !== undefined && (
                      <span className="text-muted-foreground">
                        ({formatDuration(entry.durationMs)})
                      </span>
                    )}
                    {entry.status === "error" && entry.errorMessage && (
                      <span className="text-red-600 dark:text-red-400 truncate max-w-[150px]">
                        {entry.errorMessage}
                      </span>
                    )}
                  </div>
                ))}
              </div>
            </ScrollArea>
          </div>
        )}

        {/* Action buttons */}
        <div className="space-y-2">
          {isAdmin && onSecondarySync && secondarySyncLabel && (
            <Button
              onClick={onSecondarySync}
              disabled={isSecondarySyncing || isSyncing}
              variant="outline"
              className="w-full min-h-[44px]"
            >
              {isSecondarySyncing ? (
                <>
                  <RefreshCw className="h-4 w-4 animate-spin" />
                  {secondarySyncLabel}...
                </>
              ) : (
                secondarySyncLabel
              )}
            </Button>
          )}
          {isAdmin && (
            <Button
              onClick={onSyncNow}
              disabled={isSyncing || isSecondarySyncing}
              variant={overallStatus === "error" ? "default" : "outline"}
              className="w-full min-h-[44px]"
            >
              {isSyncing ? (
                <>
                  <RefreshCw className="h-4 w-4 animate-spin" />
                  Syncing...
                </>
              ) : (
                <>
                  <RefreshCw className="h-4 w-4" />
                  {syncLabel}
                </>
              )}
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
