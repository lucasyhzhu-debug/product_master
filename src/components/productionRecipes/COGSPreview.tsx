/**
 * COGSPreview - Live COGS calculation display for production components.
 *
 * Shows calculated cost, missing ingredient warnings, or manual cost mode.
 * Updates in real-time as recipe ingredients change via Convex reactivity.
 */

import { AlertTriangle, Calculator, HandCoins } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { useProductionCogs } from "@/hooks/convex/useProductionRecipes";
import { formatCurrency } from "@/lib/utils";
import type { Id } from "../../../convex/_generated/dataModel";

interface COGSPreviewProps {
  componentTypeId: Id<"componentTypes">;
  cogsMode?: "manual" | "calculated";
  manualUnitCostIdr?: number;
  hasRecipeData: boolean; // Whether there are any sub-components or ingredients
}

export function COGSPreview({
  componentTypeId,
  cogsMode,
  manualUnitCostIdr,
  hasRecipeData,
}: COGSPreviewProps) {
  const cogs = useProductionCogs(componentTypeId);

  // No recipe data and no manual cost
  if (!hasRecipeData && cogsMode !== "manual") {
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground py-3 px-4 rounded-lg bg-muted/30 border">
        <Calculator className="h-4 w-4" />
        <span>COGS: not set (add ingredients to calculate)</span>
      </div>
    );
  }

  // Manual mode
  if (cogsMode === "manual") {
    return (
      <div className="flex items-center justify-between py-3 px-4 rounded-lg bg-blue-50 border border-blue-200">
        <div className="flex items-center gap-2">
          <HandCoins className="h-4 w-4 text-blue-600" />
          <span className="text-sm font-medium text-blue-800">
            Manual COGS: {formatCurrency(manualUnitCostIdr ?? 0)}
          </span>
        </div>
        <Badge variant="outline" className="text-xs text-blue-600 border-blue-300">
          manual
        </Badge>
      </div>
    );
  }

  // Calculated mode - loading
  if (cogs === undefined) {
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground py-3 px-4 rounded-lg bg-muted/30 border animate-pulse">
        <Calculator className="h-4 w-4" />
        <span>Calculating COGS...</span>
      </div>
    );
  }

  // Calculated mode - with missing ingredients
  if (cogs.missingCount > 0) {
    return (
      <div className="space-y-1">
        <div className="flex items-center justify-between py-3 px-4 rounded-lg bg-emerald-50 border border-emerald-200">
          <div className="flex items-center gap-2">
            <Calculator className="h-4 w-4 text-emerald-600" />
            <span className="text-sm font-medium text-emerald-800">
              Calculated COGS: {formatCurrency(cogs.totalCogs)}
            </span>
          </div>
          <Badge variant="outline" className="text-xs text-emerald-600 border-emerald-300">
            calculated
          </Badge>
        </div>
        <div className="flex items-center gap-1.5 text-xs text-amber-700 px-1">
          <AlertTriangle className="h-3.5 w-3.5 text-amber-500" />
          <span>
            COGS incomplete -- {cogs.missingCount} ingredient{cogs.missingCount > 1 ? "s" : ""} missing cost data
          </span>
        </div>
      </div>
    );
  }

  // Calculated mode - complete
  return (
    <div className="flex items-center justify-between py-3 px-4 rounded-lg bg-emerald-50 border border-emerald-200">
      <div className="flex items-center gap-2">
        <Calculator className="h-4 w-4 text-emerald-600" />
        <span className="text-sm font-medium text-emerald-800">
          Calculated COGS: {formatCurrency(cogs.totalCogs)}
        </span>
      </div>
      <Badge variant="outline" className="text-xs text-emerald-600 border-emerald-300">
        calculated
      </Badge>
    </div>
  );
}
