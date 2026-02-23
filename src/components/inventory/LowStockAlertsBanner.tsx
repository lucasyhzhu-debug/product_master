/**
 * LowStockAlertsBanner - Persistent header for low stock alerts
 */

import { AlertTriangle, ChevronRight } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import type { LowStockAlert } from "@/hooks/convex";

interface LowStockAlertsBannerProps {
  alerts: LowStockAlert[];
}

export function LowStockAlertsBanner({ alerts }: LowStockAlertsBannerProps) {
  const criticalAlerts = alerts.filter(
    (a) => a.available <= (a.reorderPoint || 0) * 0.25
  );

  return (
    <Card className="border-[var(--color-status-warning)]/40 bg-[var(--color-status-warning-bg)]">
      <div className="flex items-center gap-4 p-4">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-[var(--color-status-warning)]/15">
            <AlertTriangle className="h-5 w-5 text-[var(--color-status-warning)]" />
          </div>
          <div>
            <p className="font-semibold text-[var(--color-status-warning)]">
              {alerts.length} component{alerts.length === 1 ? "" : "s"} below reorder point
            </p>
            <p className="text-sm text-[var(--color-status-warning)]/80">
              {criticalAlerts.length > 0 && (
                <>
                  <span className="font-medium text-[var(--color-status-error)]">
                    {criticalAlerts.length} critical
                  </span>
                  {" \u2022 "}
                </>
              )}
              {alerts.slice(0, 3).map((a, i) => (
                <span key={a.component._id}>
                  {i > 0 && ", "}
                  {a.component.name}
                  {a.component.category === "production" && a.component.trackInventory && (
                    <Badge
                      variant="outline"
                      className="ml-1 text-[9px] px-1 py-0 border-[var(--color-status-success)]/40 text-[var(--color-status-success)] bg-[var(--color-status-success-bg)] inline-flex"
                    >
                      Ingredient
                    </Badge>
                  )}
                </span>
              ))}
              {alerts.length > 3 && ` +${alerts.length - 3} more`}
            </p>
          </div>
        </div>

        <div className="ml-auto flex items-center gap-2">
          <Badge
            variant="outline"
            className="bg-[var(--color-status-warning-bg)] text-[var(--color-status-warning)] border-[var(--color-status-warning)]/30"
          >
            {alerts.length} low
          </Badge>
          {criticalAlerts.length > 0 && (
            <Badge
              variant="outline"
              className="bg-[var(--color-status-error-bg)] text-[var(--color-status-error)] border-[var(--color-status-error)]/30"
            >
              {criticalAlerts.length} critical
            </Badge>
          )}
          <ChevronRight className="h-5 w-5 text-[var(--color-status-warning)]" />
        </div>
      </div>
    </Card>
  );
}
