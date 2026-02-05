/**
 * ComponentTypeRow - Display row for component type
 */

import { Package, AlertTriangle } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import type { ComponentType } from "@/hooks/convex";
import { formatCurrency } from "@/lib/utils";

interface ComponentTypeRowProps {
  component: ComponentType;
}

export function ComponentTypeRow({ component }: ComponentTypeRowProps) {
  return (
    <div className="flex items-center justify-between p-4 rounded-lg border bg-card hover:bg-accent/50 transition-colors">
      <div className="flex items-center gap-4">
        <Package className="h-5 w-5 text-muted-foreground" />
        <div>
          <div className="flex items-center gap-2">
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
          <div className="flex items-center gap-2 mt-1 text-sm text-muted-foreground">
            <span>{formatCurrency(component.unitCostIdr)}</span>
            <span>•</span>
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
