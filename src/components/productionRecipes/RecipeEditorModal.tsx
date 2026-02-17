/**
 * RecipeEditorModal - Main recipe editor modal for production components.
 *
 * Opens from ProductionComponentsManager when a row is clicked.
 * Two stacked sections: Sub-components + Direct Ingredients (both always visible).
 * Footer shows live COGSPreview.
 */

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useProductionRecipe } from "@/hooks/convex/useProductionRecipes";
import { SubComponentSection } from "./SubComponentSection";
import { IngredientSection } from "./IngredientSection";
import { COGSPreview } from "./COGSPreview";
import type { ComponentType } from "@/hooks/convex";

interface RecipeEditorModalProps {
  componentType: ComponentType | null;
  open: boolean;
  onClose: () => void;
}

export function RecipeEditorModal({
  componentType,
  open,
  onClose,
}: RecipeEditorModalProps) {
  const recipe = useProductionRecipe(
    componentType?._id
  );

  if (!componentType) return null;

  const hasRecipeData =
    recipe !== undefined &&
    ((recipe?.subComponents?.length ?? 0) > 0 ||
      (recipe?.ingredients?.length ?? 0) > 0);

  return (
    <Dialog open={open} onOpenChange={(isOpen) => !isOpen && onClose()}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 flex-wrap">
            <span>{componentType.name}</span>
            <Badge variant="outline" className="text-xs font-mono">
              {componentType.code}
            </Badge>
          </DialogTitle>
          <DialogDescription className="flex items-center gap-2 flex-wrap">
            <span>Recipe editor for production component</span>
            {(componentType as Record<string, unknown>).batchSize && (
              <Badge variant="secondary" className="text-xs">
                Batch: {String((componentType as Record<string, unknown>).batchSize)}
                {(componentType as Record<string, unknown>).batchSizeUnit
                  ? String((componentType as Record<string, unknown>).batchSizeUnit)
                  : ""}
              </Badge>
            )}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6 py-2">
          {/* Loading skeleton */}
          {recipe === undefined ? (
            <div className="space-y-4">
              <Skeleton className="h-8 w-48" />
              <Skeleton className="h-24 w-full" />
              <Skeleton className="h-8 w-48" />
              <Skeleton className="h-24 w-full" />
            </div>
          ) : (
            <>
              {/* Section 1: Sub-components */}
              <SubComponentSection
                parentComponentId={componentType._id}
                parentName={componentType.name}
                subComponents={recipe.subComponents}
              />

              {/* Divider */}
              <div className="border-t" />

              {/* Section 2: Direct Ingredients */}
              <IngredientSection
                componentTypeId={componentType._id}
                parentName={componentType.name}
                ingredients={recipe.ingredients}
              />
            </>
          )}
        </div>

        {/* Footer: COGS Preview */}
        <div className="border-t pt-3">
          <COGSPreview
            componentTypeId={componentType._id}
            cogsMode={(componentType as Record<string, unknown>).cogsMode as "manual" | "calculated" | undefined}
            manualUnitCostIdr={(componentType as Record<string, unknown>).manualUnitCostIdr as number | undefined}
            hasRecipeData={hasRecipeData}
          />
        </div>
      </DialogContent>
    </Dialog>
  );
}
