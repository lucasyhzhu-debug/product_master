/**
 * COGSBreakdownTooltip - Hierarchical COGS breakdown in a hover tooltip.
 *
 * Shows the full cost hierarchy: root component -> sub-components -> leaf ingredients.
 * Uses useProductionCogs for flat breakdown and useProductionRecipe for hierarchy display.
 */

import { Calculator, AlertTriangle } from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useProductionCogs } from "@/hooks/convex/useProductionRecipes";
import { useProductionRecipe } from "@/hooks/convex/useProductionRecipes";
import { formatCurrency } from "@/lib/utils";
import type { Id } from "../../../convex/_generated/dataModel";

interface COGSBreakdownTooltipProps {
  componentTypeId: Id<"componentTypes">;
  componentName: string;
  children: React.ReactNode;
}

export function COGSBreakdownTooltip({
  componentTypeId,
  componentName,
  children,
}: COGSBreakdownTooltipProps) {
  const cogs = useProductionCogs(componentTypeId);
  const recipe = useProductionRecipe(componentTypeId);

  // Still loading
  if (cogs === undefined || recipe === undefined) {
    return <>{children}</>;
  }

  return (
    <TooltipProvider delayDuration={300}>
      <Tooltip>
        <TooltipTrigger asChild>{children}</TooltipTrigger>
        <TooltipContent
          side="top"
          className="max-w-sm bg-popover text-popover-foreground border shadow-lg p-0"
        >
          <div className="p-3 space-y-2 text-xs">
            {/* Header */}
            <div className="flex items-center justify-between gap-4 pb-1 border-b">
              <span className="font-semibold text-sm flex items-center gap-1.5">
                <Calculator className="h-3.5 w-3.5 text-emerald-600" />
                {componentName}
              </span>
              <span className="font-bold text-sm text-emerald-700">
                {formatCurrency(cogs.totalCogs)}
              </span>
            </div>

            {/* Sub-components */}
            {recipe.subComponents.length > 0 && (
              <div className="space-y-1.5">
                {recipe.subComponents.map((sub) => {
                  // Find ingredients belonging to this sub-component from the flat breakdown
                  // We show each sub-component with its quantity
                  return (
                    <div key={sub._id} className="ml-2">
                      <div className="flex items-center justify-between text-muted-foreground">
                        <span className="font-medium text-foreground">
                          {sub.childName}
                        </span>
                        <span className="tabular-nums">
                          {sub.quantityPerUnit} {sub.unit}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {/* Direct ingredients */}
            {recipe.ingredients.length > 0 && (
              <div className="space-y-1">
                {recipe.ingredients.map((ing) => (
                  <div
                    key={ing._id}
                    className="ml-2 flex items-center justify-between"
                  >
                    <span className="text-muted-foreground">
                      {ing.ingredientName}{" "}
                      <span className="tabular-nums">
                        ({ing.quantityPerUnit}
                        {ing.unit})
                      </span>
                    </span>
                    <span className="tabular-nums font-medium">
                      {formatCurrency(ing.cachedLineCost ?? ing.costPerBaseUnit * ing.quantityPerUnit)}
                    </span>
                  </div>
                ))}
              </div>
            )}

            {/* Flat leaf breakdown from COGS calculation */}
            {cogs.breakdown.length > 0 && recipe.subComponents.length > 0 && (
              <div className="border-t pt-1.5 space-y-0.5">
                <div className="text-[10px] uppercase tracking-wide text-muted-foreground mb-1">
                  Leaf Ingredients
                </div>
                {cogs.breakdown.map((leaf, i) => (
                  <div
                    key={`${leaf.ingredientId}-${i}`}
                    className="ml-4 flex items-center justify-between text-muted-foreground"
                  >
                    <span>
                      {leaf.ingredientName}{" "}
                      <span className="tabular-nums">
                        ({leaf.totalQuantity.toFixed(1)} {leaf.unit})
                      </span>
                    </span>
                    <span className="tabular-nums">
                      {formatCurrency(leaf.lineCost)}
                    </span>
                  </div>
                ))}
              </div>
            )}

            {/* Missing warning */}
            {cogs.missingCount > 0 && (
              <div className="flex items-center gap-1.5 text-amber-600 pt-1 border-t">
                <AlertTriangle className="h-3 w-3" />
                <span>
                  {cogs.missingCount} ingredient{cogs.missingCount > 1 ? "s" : ""}{" "}
                  missing cost data
                </span>
              </div>
            )}
          </div>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
