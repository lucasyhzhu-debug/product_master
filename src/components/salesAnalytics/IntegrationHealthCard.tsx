import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Clock,
  Globe,
  ShoppingBag,
  Store,
  Database,
  RefreshCw,
  ClipboardPaste,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { formatCountdown, formatRelativeTime } from "@/lib/formatters";
import type { PlatformHealthStatus } from "../../../convex/platformCredentials/queries";

/**
 * Registry-driven platform health row component.
 *
 * Accepts a single PlatformHealthStatus prop (from getHealthStatusAll query).
 * Derives all UI behavior from authStrategy + status fields — no platformId string comparisons.
 *
 * Phase 26 Plan 03: Replaces the old syncHealth + credentialStatus dual-prop pattern.
 */

interface IntegrationHealthCardProps {
  health: PlatformHealthStatus;
  onAction?: () => void; // Primary action handler (refresh, paste, configure)
  isAdmin?: boolean;
}

// Map status to badge styles
const STATUS_BADGE: Record<
  PlatformHealthStatus["status"],
  { label: string; badgeClass: string; dotColor: string; Icon: typeof CheckCircle2 }
> = {
  green: {
    label: "Connected",
    badgeClass:
      "border-green-500 dark:border-green-600 text-green-700 dark:text-green-400 bg-green-50 dark:bg-green-950/30",
    dotColor: "bg-green-500",
    Icon: CheckCircle2,
  },
  yellow: {
    label: "Warning",
    badgeClass:
      "border-amber-500 dark:border-amber-600 text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/30",
    dotColor: "bg-amber-500",
    Icon: AlertTriangle,
  },
  red: {
    label: "Error",
    badgeClass:
      "border-red-500 dark:border-red-600 text-red-700 dark:text-red-400 bg-red-50 dark:bg-red-950/30",
    dotColor: "bg-red-500",
    Icon: XCircle,
  },
  disconnected: {
    label: "Not Configured",
    badgeClass:
      "border-slate-400 dark:border-slate-500 text-slate-600 dark:text-slate-400 bg-slate-50 dark:bg-slate-900/30",
    dotColor: "bg-slate-400",
    Icon: XCircle,
  },
};

// Map category to icon component
function getCategoryIcon(category: PlatformHealthStatus["category"]) {
  switch (category) {
    case "pos":
      return Store;
    case "delivery":
      return Globe;
    case "marketplace":
      return ShoppingBag;
    case "internal":
      return Database;
    default:
      return Globe;
  }
}

// Determine action button label from authStrategy
function getActionLabel(authStrategy: PlatformHealthStatus["authStrategy"]): string | null {
  switch (authStrategy) {
    case "password_grant":
      return "Refresh Token";
    case "paste_token":
      return "Paste Token";
    case "pos_login":
      return "Configure";
    case "client_credentials":
      return "Configure";
    case "session_auth":
      return null; // Always connected — no action needed
    default:
      return null;
  }
}

// Determine action button icon from authStrategy
function getActionIcon(authStrategy: PlatformHealthStatus["authStrategy"]) {
  switch (authStrategy) {
    case "password_grant":
      return RefreshCw;
    case "paste_token":
      return ClipboardPaste;
    default:
      return RefreshCw;
  }
}

export function IntegrationHealthCard({
  health,
  onAction,
  isAdmin = false,
}: IntegrationHealthCardProps) {
  const statusConfig = STATUS_BADGE[health.status];
  const StatusIcon = statusConfig.Icon;
  const CategoryIcon = getCategoryIcon(health.category);
  const actionLabel = getActionLabel(health.authStrategy);
  const ActionIcon = getActionIcon(health.authStrategy);

  return (
    <div className="flex items-center justify-between gap-3 py-3 px-4 rounded-lg border bg-card hover:bg-muted/30 transition-colors">
      {/* Left: icon + name + status info */}
      <div className="flex items-center gap-3 min-w-0">
        {/* Status dot */}
        <div
          className={cn(
            "h-2.5 w-2.5 rounded-full shrink-0",
            statusConfig.dotColor
          )}
        />

        {/* Category icon */}
        <CategoryIcon className="h-4 w-4 text-muted-foreground shrink-0" />

        {/* Platform info */}
        <div className="min-w-0">
          <div className="font-medium text-sm">{health.platformName}</div>
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            {/* Label (e.g., "Connected", "7 days remaining", "Never synced") */}
            <span>{health.label}</span>

            {/* Last activity */}
            {health.lastActivity && (
              <>
                <span className="opacity-40">·</span>
                <Clock className="h-3 w-3 opacity-60" />
                <span>{formatRelativeTime(health.lastActivity)}</span>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Right: status badge + optional action button */}
      <div className="flex items-center gap-2 shrink-0">
        {/* Expiry countdown badge for token-based platforms */}
        {health.hasExpiry && health.daysRemaining !== null && health.status !== "disconnected" && (
          <Badge
            variant="outline"
            className={cn(
              "text-[10px] px-1.5 py-0",
              health.status === "green"
                ? "border-green-500 dark:border-green-600 text-green-700 dark:text-green-400"
                : health.status === "yellow"
                ? "border-amber-500 dark:border-amber-600 text-amber-700 dark:text-amber-400"
                : "border-red-500 dark:border-red-600 text-red-700 dark:text-red-400"
            )}
          >
            {formatCountdown(health.daysRemaining)}
          </Badge>
        )}

        {/* Status badge */}
        <Badge variant="outline" className={cn("text-xs", statusConfig.badgeClass)}>
          <StatusIcon className="h-3 w-3 mr-1" />
          {statusConfig.label}
        </Badge>

        {/* Action button (admin-only) */}
        {isAdmin && onAction && actionLabel && (
          <Button
            variant="outline"
            size="sm"
            onClick={onAction}
            className="h-7 px-2 text-xs gap-1"
          >
            <ActionIcon className="h-3 w-3" />
            {actionLabel}
          </Button>
        )}
      </div>
    </div>
  );
}
