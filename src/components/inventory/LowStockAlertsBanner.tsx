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
    <Card className="border-amber-800/50 bg-gradient-to-r from-amber-900/30 to-amber-800/20 shadow-lg">
      <div className="flex items-center gap-4 p-4">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-amber-500/20">
            <AlertTriangle className="h-5 w-5 text-amber-400" />
          </div>
          <div>
            <p className="font-semibold text-amber-100">
              {alerts.length} component{alerts.length === 1 ? "" : "s"} below reorder point
            </p>
            <p className="text-sm text-amber-200/70">
              {criticalAlerts.length > 0 && (
                <>
                  <span className="font-medium text-red-400">
                    {criticalAlerts.length} critical
                  </span>
                  {" • "}
                </>
              )}
              {alerts.slice(0, 3).map((a, i) => (
                <span key={a.component._id}>
                  {i > 0 && ", "}
                  {a.component.name}
                </span>
              ))}
              {alerts.length > 3 && ` +${alerts.length - 3} more`}
            </p>
          </div>
        </div>

        <div className="ml-auto flex items-center gap-2">
          <Badge
            variant="outline"
            className="bg-amber-500/10 text-amber-300 border-amber-600"
          >
            {alerts.length} low
          </Badge>
          {criticalAlerts.length > 0 && (
            <Badge
              variant="outline"
              className="bg-red-500/10 text-red-300 border-red-600"
            >
              {criticalAlerts.length} critical
            </Badge>
          )}
          <ChevronRight className="h-5 w-5 text-amber-400" />
        </div>
      </div>
    </Card>
  );
}
