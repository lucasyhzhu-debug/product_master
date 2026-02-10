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
    <Card className="border-amber-300 bg-gradient-to-r from-amber-50 to-amber-50/50">
      <div className="flex items-center gap-4 p-4">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-amber-100">
            <AlertTriangle className="h-5 w-5 text-amber-600" />
          </div>
          <div>
            <p className="font-semibold text-amber-900">
              {alerts.length} component{alerts.length === 1 ? "" : "s"} below reorder point
            </p>
            <p className="text-sm text-amber-700/80">
              {criticalAlerts.length > 0 && (
                <>
                  <span className="font-medium text-red-600">
                    {criticalAlerts.length} critical
                  </span>
                  {" \u2022 "}
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
            className="bg-amber-100 text-amber-700 border-amber-300"
          >
            {alerts.length} low
          </Badge>
          {criticalAlerts.length > 0 && (
            <Badge
              variant="outline"
              className="bg-red-100 text-red-700 border-red-300"
            >
              {criticalAlerts.length} critical
            </Badge>
          )}
          <ChevronRight className="h-5 w-5 text-amber-500" />
        </div>
      </div>
    </Card>
  );
}
