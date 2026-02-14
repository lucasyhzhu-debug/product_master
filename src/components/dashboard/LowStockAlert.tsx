/**
 * Low Stock Alert Component
 *
 * Displays low stock alerts for inventory components.
 * Shows count + top 3 components with shortage.
 * Click to navigate to /inventory page.
 */

import { AlertTriangle, Package } from "lucide-react";
import { Link } from "react-router-dom";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useConvexLowStockAlerts } from "@/hooks/convex";

export function LowStockAlert() {
  const alerts = useConvexLowStockAlerts();

  // Loading state
  if (alerts === undefined) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Package className="h-5 w-5" />
            Low Stock Alerts
          </CardTitle>
          <CardDescription>Checking inventory levels...</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            <div className="h-12 bg-muted/30 rounded animate-pulse" />
            <div className="h-12 bg-muted/30 rounded animate-pulse" />
            <div className="h-12 bg-muted/30 rounded animate-pulse" />
          </div>
        </CardContent>
      </Card>
    );
  }

  // No alerts - everything is good
  if (alerts.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Package className="h-5 w-5 text-emerald-600" />
            Low Stock Alerts
          </CardTitle>
          <CardDescription>All inventory levels are healthy</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-3 text-muted-foreground p-4 border rounded-lg bg-emerald-50 dark:bg-emerald-950/20">
            <div className="h-10 w-10 rounded-full bg-emerald-100 dark:bg-emerald-900/30 flex items-center justify-center">
              <Package className="h-5 w-5 text-emerald-600" />
            </div>
            <div>
              <p className="text-sm font-medium text-emerald-700 dark:text-emerald-400">All Stock Levels OK</p>
              <p className="text-xs text-emerald-600/80 dark:text-emerald-500/80">
                No components below reorder point
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }

  // Show alerts - top 3 most critical
  const topAlerts = alerts.slice(0, 3);
  const remainingCount = alerts.length - 3;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <AlertTriangle className="h-5 w-5 text-orange-600" />
          Low Stock Alerts
          <Badge variant="destructive" className="ml-auto">
            {alerts.length}
          </Badge>
        </CardTitle>
        <CardDescription>Components below reorder point</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="space-y-3">
          {topAlerts.map((alert) => {
            const percentAvailable = (alert.available / (alert.reorderPoint ?? 1)) * 100;
            const severity = percentAvailable <= 0 ? "critical" : percentAvailable < 50 ? "urgent" : "warning";

            return (
              <div
                key={`${alert.component._id}-${alert.location._id}`}
                className="flex items-center gap-3 p-3 border rounded-lg hover:bg-muted/50 transition-colors"
              >
                {/* Severity indicator */}
                <div
                  className={`h-10 w-10 rounded-full flex items-center justify-center flex-shrink-0 ${
                    severity === "critical"
                      ? "bg-red-100 dark:bg-red-900/30"
                      : severity === "urgent"
                      ? "bg-orange-100 dark:bg-orange-900/30"
                      : "bg-yellow-100 dark:bg-yellow-900/30"
                  }`}
                >
                  <AlertTriangle
                    className={`h-5 w-5 ${
                      severity === "critical"
                        ? "text-red-600 dark:text-red-400"
                        : severity === "urgent"
                        ? "text-orange-600 dark:text-orange-400"
                        : "text-yellow-600 dark:text-yellow-400"
                    }`}
                  />
                </div>

                {/* Component info */}
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{alert.component.name}</p>
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <span>{alert.location.name}</span>
                    <span>•</span>
                    <span>
                      {alert.available} / {alert.reorderPoint} {alert.component.unit}
                    </span>
                  </div>
                </div>

                {/* Shortage badge */}
                <Badge
                  variant={severity === "critical" ? "destructive" : "secondary"}
                  className="flex-shrink-0"
                >
                  -{alert.shortage}
                </Badge>
              </div>
            );
          })}

          {/* Show more link */}
          {remainingCount > 0 && (
            <p className="text-xs text-muted-foreground text-center pt-2">
              + {remainingCount} more alert{remainingCount > 1 ? "s" : ""}
            </p>
          )}

          {/* Action button */}
          <Button variant="outline" size="sm" className="w-full mt-2" asChild>
            <Link to="/inventory">View Inventory Manager</Link>
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
