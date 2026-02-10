/**
 * BatchCard - Individual batch display with FIFO indicator and actions
 */

import { useState } from "react";
import { Calendar, User, Package, Truck, Link as LinkIcon, Pencil } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn, formatCurrency } from "@/lib/utils";
import { AdjustStockDialog } from "./AdjustStockDialog";
import type { Id } from "../../../convex/_generated/dataModel";

interface BatchCardProps {
  batch: {
    _id: string;
    purchaseDate: number;
    supplierName: string;
    supplierBrand?: string;
    purchaseReference?: string;
    purchaseUrl?: string;
    quantityPurchased: number;
    totalCostIdr: number;
    unitCostIdr: number;
    quantityRemaining: number;
    quantityReserved: number;
    available: number;
    status: "active" | "depleted" | "expired";
    expiryDate?: number;
    createdBy: string;
  };
  isFifoNext: boolean;
  componentName: string;
}

export function BatchCard({ batch, isFifoNext, componentName }: BatchCardProps) {
  const [adjustDialogOpen, setAdjustDialogOpen] = useState(false);

  const purchaseDate = new Date(batch.purchaseDate);
  const effectivePurchased = Math.max(batch.quantityPurchased, batch.quantityRemaining);
  const consumedQty = effectivePurchased - batch.quantityRemaining;
  const consumedPercent = effectivePurchased > 0
    ? (consumedQty / effectivePurchased) * 100 : 0;

  const isExpired = batch.status === "expired";
  const isDepleted = batch.status === "depleted";

  return (
    <Card
      className={cn(
        "p-3",
        isFifoNext && !isExpired && "border-emerald-300 bg-emerald-50/50",
        isExpired && "border-red-200 bg-red-50/30 opacity-60",
        !isFifoNext && !isExpired && "border-border bg-muted/20"
      )}
    >
      <div className="flex items-start justify-between gap-4">
        {/* Left: Batch Info */}
        <div className="flex-1 space-y-1.5">
          <div className="flex items-center gap-2">
            {isExpired && (
              <Badge variant="destructive" className="text-xs">Expired</Badge>
            )}
            {isDepleted && (
              <Badge variant="secondary" className="text-xs">Depleted</Badge>
            )}
            {isFifoNext && !isExpired && !isDepleted && (
              <Badge className="bg-emerald-600 text-white text-xs">FIFO Next</Badge>
            )}
            <div className="flex items-center gap-1 text-xs text-muted-foreground">
              <Calendar className="h-3 w-3" />
              <span>{purchaseDate.toLocaleDateString()}</span>
            </div>
            {batch.expiryDate && (
              <div className="text-xs text-amber-600">
                Exp: {new Date(batch.expiryDate).toLocaleDateString()}
              </div>
            )}
          </div>

          <div className="flex items-center gap-2">
            <Truck className="h-3.5 w-3.5 text-muted-foreground" />
            <div>
              <span className="text-sm font-medium">
                {batch.supplierName}
              </span>
              {batch.supplierBrand && (
                <span className="text-xs text-muted-foreground ml-2">
                  &middot; {batch.supplierBrand}
                </span>
              )}
            </div>
          </div>

          {batch.purchaseReference && (
            <div className="flex items-center gap-1 text-xs text-muted-foreground">
              <Package className="h-3 w-3" />
              <span>{batch.purchaseReference}</span>
            </div>
          )}

          {batch.purchaseUrl && (
            <a
              href={batch.purchaseUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1 text-xs text-blue-600 hover:text-blue-500 hover:underline"
            >
              <LinkIcon className="h-3 w-3" />
              <span>Reorder link</span>
            </a>
          )}

          <div className="flex items-center gap-1 text-xs text-muted-foreground">
            <User className="h-3 w-3" />
            <span>Added by {batch.createdBy}</span>
          </div>
        </div>

        {/* Right: Stock Numbers */}
        <div className="text-right space-y-1 tabular-nums">
          <div>
            <div className="text-[10px] uppercase tracking-wide text-muted-foreground">Available</div>
            <div className="text-xl font-bold text-emerald-600">
              {batch.available}
            </div>
          </div>
          {batch.quantityReserved > 0 && (
            <div>
              <div className="text-[10px] uppercase tracking-wide text-muted-foreground">Reserved</div>
              <div className="text-lg font-bold text-amber-600">
                {batch.quantityReserved}
              </div>
            </div>
          )}
          <div>
            <div className="text-[10px] uppercase tracking-wide text-muted-foreground">Remaining</div>
            <div className="text-sm">
              {batch.quantityRemaining} / {batch.quantityPurchased}
            </div>
          </div>
          <div>
            <div className="text-[10px] uppercase tracking-wide text-muted-foreground">Unit Cost</div>
            <div className="text-sm">
              {formatCurrency(batch.unitCostIdr)}
            </div>
          </div>
        </div>
      </div>

      {/* Progress Bar */}
      <div className="mt-3">
        <div className="flex items-center justify-between text-xs text-muted-foreground mb-1">
          <span>Consumed</span>
          <span>{consumedPercent.toFixed(0)}%</span>
        </div>
        <div className="h-1.5 bg-muted rounded-full overflow-hidden">
          <div
            className={cn(
              "h-full rounded-full transition-all",
              consumedPercent > 90
                ? "bg-red-500"
                : consumedPercent > 70
                ? "bg-amber-500"
                : "bg-emerald-500"
            )}
            style={{ width: `${consumedPercent}%` }}
          />
        </div>
      </div>

      {/* Action Buttons */}
      {!isExpired && !isDepleted && (
        <div className="mt-3 pt-2 border-t flex items-center gap-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setAdjustDialogOpen(true)}
            className="text-xs text-muted-foreground hover:text-foreground"
          >
            <Pencil className="h-3 w-3 mr-1" />
            Adjust
          </Button>
        </div>
      )}

      {/* Adjust Stock Dialog */}
      <AdjustStockDialog
        open={adjustDialogOpen}
        onOpenChange={setAdjustDialogOpen}
        batchId={batch._id as Id<"inventoryBatches">}
        componentName={componentName}
        currentQuantity={batch.quantityRemaining}
        reservedQuantity={batch.quantityReserved}
      />
    </Card>
  );
}
