/**
 * ComponentTypeRow - Display row for component type with cost insights
 */

import { Package, AlertTriangle, TrendingDown, TrendingUp, BarChart3 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import type { ComponentType } from "@/hooks/convex";
import { formatCurrency } from "@/lib/utils";

interface ComponentTypeRowProps {
  component: ComponentType;
}

export function ComponentTypeRow({ component }: ComponentTypeRowProps) {
  const hasCostInsights = component.costInsights && component.trackInventory;

  return (
    <div className="flex items-center justify-between p-4 rounded-lg border bg-card hover:bg-accent/50 transition-colors">
      <div className="flex items-center gap-4 flex-1">
        <Package className="h-5 w-5 text-muted-foreground" />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-semibold">{component.name}</span>
            <Badge variant="outline" className="text-xs">
              {component.code}
            </Badge>
            {!component.isActive && (
              <Badge variant="destructive">Inactive</Badge>
            )}
            {component.trackInventory && (
              <Badge variant="secondary">Tracked</Badge>
            )}
          </div>

          {/* Cost information */}
          <div className="flex items-center gap-2 mt-1 text-sm text-muted-foreground flex-wrap">
            {hasCostInsights && component.costInsights ? (
              <>
                {/* Cost insights for packaging components */}
                {component.costInsights.weightedAverageCost !== null && (
                  <>
                    <div className="flex items-center gap-1">
                      <BarChart3 className="h-3 w-3" />
                      <span className="font-medium text-foreground">
                        {formatCurrency(component.costInsights.weightedAverageCost)}
                      </span>
                      <span className="text-xs">(avg)</span>
                    </div>
                    <span>•</span>
                  </>
                )}
                {component.costInsights.lowestCost !== null && (
                  <>
                    <div className="flex items-center gap-1">
                      <TrendingDown className="h-3 w-3 text-green-600" />
                      <span>{formatCurrency(component.costInsights.lowestCost)}</span>
                      <span className="text-xs">(low)</span>
                    </div>
                    <span>•</span>
                  </>
                )}
                {component.costInsights.latestCost !== null && (
                  <>
                    <div className="flex items-center gap-1">
                      <TrendingUp className="h-3 w-3 text-blue-600" />
                      <span>{formatCurrency(component.costInsights.latestCost)}</span>
                      <span className="text-xs">(latest)</span>
                    </div>
                    <span>•</span>
                  </>
                )}
              </>
            ) : (
              <>
                {/* Static cost for production components */}
                <span>{formatCurrency(component.unitCostIdr)}</span>
                <span>•</span>
              </>
            )}
            <span>{component.unit}</span>
            {component.gramsPerUnit && (
              <>
                <span>•</span>
                <span>{component.gramsPerUnit}g per unit</span>
              </>
            )}
            {component.reorderPoint && (
              <>
                <span>•</span>
                <span className="flex items-center gap-1">
                  <AlertTriangle className="h-3 w-3" />
                  Reorder at {component.reorderPoint}
                </span>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
