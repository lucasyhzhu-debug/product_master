/**
 * LowPriceWarningDialog - Confirmation dialog for orders with total < Rp 20,000
 * Requires explicit confirmation before proceeding with low-price orders
 */
import { AlertTriangle } from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { formatCurrency } from "@/lib/utils";

interface LowPriceWarningDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  finalPrice: number;
  originalPrice: number;
  discountAmount: number;
  onConfirm: () => void;
  isSubmitting?: boolean;
}

export function LowPriceWarningDialog({
  open,
  onOpenChange,
  finalPrice,
  originalPrice,
  discountAmount,
  onConfirm,
  isSubmitting = false,
}: LowPriceWarningDialogProps) {
  const discountPercentage = Math.round((discountAmount / originalPrice) * 100);

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle className="flex items-center gap-2 text-amber-600">
            <AlertTriangle className="w-5 h-5" />
            Low Order Total Warning
          </AlertDialogTitle>
          <AlertDialogDescription asChild>
            <div className="space-y-3">
              <p>
                The order total is below <strong>Rp 20,000</strong>. Please
                confirm this is intentional.
              </p>

              <div className="p-3 bg-amber-50 dark:bg-amber-950 border border-amber-200 dark:border-amber-800 rounded-md space-y-2">
                <div className="flex justify-between text-sm">
                  <span>Original Total</span>
                  <span>{formatCurrency(originalPrice)}</span>
                </div>
                <div className="flex justify-between text-sm text-amber-600">
                  <span>Total Discount</span>
                  <span>
                    -{formatCurrency(discountAmount)} ({discountPercentage}%)
                  </span>
                </div>
                <div className="flex justify-between font-semibold border-t pt-2">
                  <span>Final Total</span>
                  <span className="text-amber-600">
                    {formatCurrency(finalPrice)}
                  </span>
                </div>
              </div>

              <p className="text-sm">
                Are you sure you want to create this order with a{" "}
                <strong>{discountPercentage}% discount</strong>?
              </p>
            </div>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={isSubmitting}>Cancel</AlertDialogCancel>
          <AlertDialogAction
            onClick={onConfirm}
            disabled={isSubmitting}
            className="bg-amber-600 hover:bg-amber-700 text-white"
          >
            {isSubmitting ? "Creating..." : "Yes, Create Order"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
