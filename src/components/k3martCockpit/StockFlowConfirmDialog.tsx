/**
 * StockFlowConfirmDialog - Confirmation dialog before K3Mart API submission.
 *
 * Shows a summary of the stock flow operation (outlet, product, direction,
 * quantity, price, total value, note) and enforces price sanity check.
 * Uses shadcn AlertDialog for modal confirmation.
 */

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
import { Alert, AlertDescription } from "@/components/ui/alert";
import { AlertTriangle } from "lucide-react";

export interface StockFlowConfirmData {
  outletName: string;
  productName: string;
  direction: "stock_in" | "stock_out";
  qty: number;
  price: number;
  note?: string;
  isRotation?: boolean;
  /** For rotation: the stock-out qty (remaining stock) */
  rotationStockOutQty?: number;
  /** For rotation: the stock-in qty (new quantity) */
  rotationStockInQty?: number;
}

interface StockFlowConfirmDialogProps {
  open: boolean;
  onConfirm: () => void;
  onCancel: () => void;
  data: StockFlowConfirmData;
}

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount);
}

export function StockFlowConfirmDialog({
  open,
  onConfirm,
  onCancel,
  data,
}: StockFlowConfirmDialogProps) {
  const hasPriceError = !data.price || data.price <= 0;

  const directionLabel = data.isRotation
    ? "Rotation (Stock Out + Stock In)"
    : data.direction === "stock_in"
      ? "Stock In"
      : "Stock Out";

  const totalValue = data.isRotation
    ? (data.rotationStockInQty ?? data.qty) * data.price
    : data.qty * data.price;

  return (
    <AlertDialog open={open} onOpenChange={(isOpen) => !isOpen && onCancel()}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>
            {data.isRotation ? "Confirm Rotation" : `Confirm ${data.direction === "stock_in" ? "Stock In" : "Stock Out"}`}
          </AlertDialogTitle>
          <AlertDialogDescription>
            Review the details below before sending to K3Mart API.
          </AlertDialogDescription>
        </AlertDialogHeader>

        <div className="space-y-3 py-2">
          {/* Summary rows */}
          <div className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm">
            <span className="text-muted-foreground">Outlet</span>
            <span className="font-semibold">{data.outletName}</span>

            <span className="text-muted-foreground">Product</span>
            <span>{data.productName}</span>

            <span className="text-muted-foreground">Direction</span>
            <span className={
              data.isRotation ? "text-amber-700 font-medium"
                : data.direction === "stock_in" ? "text-green-700 font-medium"
                  : "text-amber-700 font-medium"
            }>
              {directionLabel}
            </span>

            {data.isRotation ? (
              <>
                <span className="text-muted-foreground">Stock Out</span>
                <span className="text-2xl font-bold tabular-nums">{data.rotationStockOutQty ?? 0}</span>

                <span className="text-muted-foreground">Stock In</span>
                <span className="text-2xl font-bold tabular-nums">{data.rotationStockInQty ?? data.qty}</span>
              </>
            ) : (
              <>
                <span className="text-muted-foreground">Quantity</span>
                <span className="text-2xl font-bold tabular-nums">{data.qty}</span>
              </>
            )}

            <span className="text-muted-foreground">Price/unit</span>
            <span className="tabular-nums">{formatCurrency(data.price)}</span>

            <span className="text-muted-foreground">Total value</span>
            <span className="font-semibold tabular-nums">{formatCurrency(totalValue)}</span>

            {data.note && (
              <>
                <span className="text-muted-foreground">Note</span>
                <span className="text-muted-foreground italic">{data.note}</span>
              </>
            )}
          </div>

          {/* Price sanity check */}
          {hasPriceError && (
            <Alert variant="destructive">
              <AlertTriangle className="h-4 w-4" />
              <AlertDescription>
                Price is missing! Cannot submit without price. Configure pricing in Outlet Settings.
              </AlertDescription>
            </Alert>
          )}
        </div>

        <AlertDialogFooter>
          <AlertDialogCancel onClick={onCancel}>Cancel</AlertDialogCancel>
          <AlertDialogAction onClick={onConfirm} disabled={hasPriceError}>
            {data.isRotation ? "Confirm Rotation" : "Confirm"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
