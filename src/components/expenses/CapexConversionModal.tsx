/**
 * CapexConversionModal -- modal for converting an expense to a fixed asset (CapEx).
 *
 * Shows expense summary, category selection with auto-suggestion from description
 * keywords, real-time depreciation preview, JE preview, and confirmation button.
 *
 * Uses detectAssetCategory for initial category suggestion; user can override.
 */
import { useState, useMemo, useCallback } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ArrowRightLeft, Package, FileCheck, ChevronDown } from "lucide-react";
import { formatCurrency } from "@/lib/utils";
import { utcToWibDateStr } from "@/lib/dateUtils";
import { useConvertToCapex } from "@/hooks/convex/useExpenses";
import { ASSET_CATEGORIES, calculateMonthlyDepreciation } from "../../../convex/fixedAssets/helpers";
import { detectAssetCategory } from "../../../convex/expenses/helpers";
import { toast } from "sonner";
import type { Id } from "../../../convex/_generated/dataModel";
import type { AssetCategoryKey } from "../../../convex/fixedAssets/helpers";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface CapexConversionModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  expense: {
    _id: Id<"expenses">;
    description: string;
    amount: number;
    expenseDate: number;
    vendorName: string;
    expenseNumber: string;
    paymentMethod: string;
    receiptFileId?: Id<"_storage">;
    receiptUrl?: string | null;
    journalEntryId?: Id<"journalEntries">;
  };
}

// Filter to depreciable categories only (land is not equipment)
const DEPRECIABLE_CATEGORIES = ASSET_CATEGORIES.filter((c) => c.depreciable);

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function CapexConversionModal({
  open,
  onOpenChange,
  expense,
}: CapexConversionModalProps) {
  const { mutateAsync: convertToCapex } = useConvertToCapex();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [jePreviewOpen, setJePreviewOpen] = useState(false);

  // Auto-detect category from description, allow user override
  const autoCategory = useMemo(
    () => detectAssetCategory(expense.description),
    [expense.description]
  );
  const [selectedCategory, setSelectedCategory] = useState(autoCategory);

  // Compute depreciation preview from selected category
  const depreciationPreview = useMemo(() => {
    const cat = ASSET_CATEGORIES.find((c) => c.key === selectedCategory);
    if (!cat || !cat.depreciable || cat.usefulLifeYears === null) {
      return null;
    }
    const salvageValue = Math.round(expense.amount * (cat.salvagePercent / 100));
    const usefulLifeMonths = cat.usefulLifeYears * 12;
    const monthly = calculateMonthlyDepreciation(expense.amount, salvageValue, usefulLifeMonths);
    return {
      monthly,
      years: cat.usefulLifeYears,
      salvageValue,
      salvagePercent: cat.salvagePercent,
    };
  }, [selectedCategory, expense.amount]);

  // Determine credit account label for JE preview
  const creditAccountLabel = expense.paymentMethod === "employee_paid"
    ? "2200 Employee Reimbursements Payable"
    : "1100 Cash";

  const handleConfirm = useCallback(async () => {
    setIsSubmitting(true);
    try {
      const result = await convertToCapex({
        expenseId: expense._id,
        category: selectedCategory,
      });
      if (result) {
        toast.success(`Converted to asset ${result.assetNumber}`);
      }
      onOpenChange(false);
    } catch {
      // Error toast handled by createMutationHook
    } finally {
      setIsSubmitting(false);
    }
  }, [convertToCapex, expense._id, selectedCategory, onOpenChange]);

  return (
    <Dialog open={open} onOpenChange={(nextOpen) => { if (!nextOpen && !isSubmitting) onOpenChange(false); }}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ArrowRightLeft className="h-5 w-5 text-blue-600" />
            Convert Expense to Equipment Purchase
          </DialogTitle>
          <DialogDescription>
            Reclassify this expense as a fixed asset with proper depreciation tracking.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Expense summary */}
          <div className="rounded-md border p-3 space-y-1.5 bg-muted/30">
            <div className="flex items-center justify-between">
              <span className="text-xs font-mono text-muted-foreground">{expense.expenseNumber}</span>
              <span className="text-base font-semibold">{formatCurrency(expense.amount)}</span>
            </div>
            <p className="text-sm font-medium">{expense.description}</p>
            <div className="flex items-center gap-3 text-xs text-muted-foreground">
              <span>{expense.vendorName}</span>
              <span>{utcToWibDateStr(expense.expenseDate)}</span>
            </div>
            {/* Receipt indicator */}
            {expense.receiptUrl && (
              <div className="flex items-center gap-1 text-xs text-emerald-600">
                <FileCheck className="h-3 w-3" />
                Receipt will be carried over to asset
              </div>
            )}
          </div>

          {/* Category selection */}
          <div className="space-y-1.5">
            <label className="text-sm font-medium">Asset Category</label>
            <Select value={selectedCategory} onValueChange={(v) => setSelectedCategory(v as AssetCategoryKey)}>
              <SelectTrigger>
                <SelectValue placeholder="Select category" />
              </SelectTrigger>
              <SelectContent>
                {DEPRECIABLE_CATEGORIES.map((cat) => (
                  <SelectItem key={cat.key} value={cat.key}>
                    {cat.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {selectedCategory === autoCategory && (
              <p className="text-xs text-muted-foreground">Auto-suggested from description keywords</p>
            )}
          </div>

          {/* Depreciation preview */}
          {depreciationPreview && (
            <div className="rounded-md border p-3 bg-blue-50/50 dark:bg-blue-900/10 space-y-1">
              <div className="flex items-center gap-1.5">
                <Package className="h-4 w-4 text-blue-600" />
                <span className="text-sm font-medium text-blue-800 dark:text-blue-300">Depreciation Preview</span>
              </div>
              <p className="text-sm">
                {formatCurrency(depreciationPreview.monthly)}/month for {depreciationPreview.years} years
              </p>
              <p className="text-xs text-muted-foreground">
                Salvage value: {formatCurrency(depreciationPreview.salvageValue)} ({depreciationPreview.salvagePercent}%)
                {" | "} Straight-line method (PSAK 16)
              </p>
            </div>
          )}

          {/* JE preview (collapsible) */}
          <Collapsible open={jePreviewOpen} onOpenChange={setJePreviewOpen}>
            <CollapsibleTrigger asChild>
              <Button variant="ghost" size="sm" className="w-full justify-between text-xs text-muted-foreground">
                Journal Entry Preview
                <ChevronDown className={`h-3.5 w-3.5 transition-transform ${jePreviewOpen ? "rotate-180" : ""}`} />
              </Button>
            </CollapsibleTrigger>
            <CollapsibleContent>
              <div className="rounded-md border p-3 space-y-3 text-xs">
                {/* Reversal JE */}
                {expense.journalEntryId && (
                  <div className="space-y-1">
                    <Badge variant="outline" className="text-amber-600 border-amber-300 text-xs">
                      Step 1: Reversal
                    </Badge>
                    <p className="text-muted-foreground">
                      Reverses original expense journal entry
                    </p>
                  </div>
                )}

                {/* Acquisition JE */}
                <div className="space-y-1">
                  <Badge variant="outline" className="text-blue-600 border-blue-300 text-xs">
                    {expense.journalEntryId ? "Step 2: Acquisition" : "Acquisition"}
                  </Badge>
                  <div className="font-mono space-y-0.5">
                    <div className="flex justify-between">
                      <span>DR 1500 Fixed Assets</span>
                      <span>{formatCurrency(expense.amount)}</span>
                    </div>
                    <div className="flex justify-between text-muted-foreground">
                      <span className="pl-4">CR {creditAccountLabel}</span>
                      <span>{formatCurrency(expense.amount)}</span>
                    </div>
                  </div>
                </div>
              </div>
            </CollapsibleContent>
          </Collapsible>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isSubmitting}>
            Cancel
          </Button>
          <Button
            className="bg-blue-600 hover:bg-blue-700 text-white"
            onClick={handleConfirm}
            disabled={isSubmitting}
          >
            {isSubmitting ? "Converting..." : "Confirm Conversion"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
