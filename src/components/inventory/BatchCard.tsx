/**
 * BatchCard - Individual batch display with FIFO indicator
 */

import { Calendar, User, Package, Truck, Link as LinkIcon } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { cn, formatCurrency } from "@/lib/utils";

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

export function BatchCard({ batch, isFifoNext }: BatchCardProps) {
  const purchaseDate = new Date(batch.purchaseDate);
  const consumedQty = batch.quantityPurchased - batch.quantityRemaining;
  const consumedPercent =
    (consumedQty / batch.quantityPurchased) * 100;

  return (
    <Card
      className={cn(
        "border-slate-700 bg-slate-700/30 p-3",
        isFifoNext && "border-emerald-600 bg-emerald-900/20"
      )}
    >
      <div className="flex items-start justify-between gap-4">
        {/* Left: Batch Info */}
        <div className="flex-1 space-y-2">
          <div className="flex items-center gap-2">
            {isFifoNext && (
              <Badge className="bg-emerald-600 text-white">FIFO Next</Badge>
            )}
            <div className="flex items-center gap-1 text-xs text-slate-400">
              <Calendar className="h-3 w-3" />
              <span>{purchaseDate.toLocaleDateString()}</span>
            </div>
            {batch.expiryDate && (
              <div className="text-xs text-amber-400">
                Exp: {new Date(batch.expiryDate).toLocaleDateString()}
              </div>
            )}
          </div>

          <div className="flex items-center gap-2">
            <Truck className="h-4 w-4 text-slate-400" />
            <div>
              <span className="text-sm font-medium text-slate-200">
                {batch.supplierName}
              </span>
              {batch.supplierBrand && (
                <span className="text-xs text-slate-400 ml-2">
                  • {batch.supplierBrand}
                </span>
              )}
            </div>
          </div>

          {batch.purchaseReference && (
            <div className="flex items-center gap-1 text-xs text-slate-400">
              <Package className="h-3 w-3" />
              <span>{batch.purchaseReference}</span>
            </div>
          )}

          {batch.purchaseUrl && (
            <a
              href={batch.purchaseUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1 text-xs text-blue-400 hover:text-blue-300 hover:underline"
            >
              <LinkIcon className="h-3 w-3" />
              <span>Reorder link</span>
            </a>
          )}

          <div className="flex items-center gap-1 text-xs text-slate-400">
            <User className="h-3 w-3" />
            <span>Added by {batch.createdBy}</span>
          </div>
        </div>

        {/* Right: Stock Numbers */}
        <div className="text-right space-y-1 font-mono">
          <div>
            <div className="text-xs text-slate-400">Available</div>
            <div className="text-xl font-bold text-emerald-400">
              {batch.available}
            </div>
          </div>
          {batch.quantityReserved > 0 && (
            <div>
              <div className="text-xs text-slate-400">Reserved</div>
              <div className="text-lg font-bold text-amber-400">
                {batch.quantityReserved}
              </div>
            </div>
          )}
          <div>
            <div className="text-xs text-slate-400">Total Remaining</div>
            <div className="text-sm text-slate-300">
              {batch.quantityRemaining} / {batch.quantityPurchased}
            </div>
          </div>
          <div>
            <div className="text-xs text-slate-400">Unit Cost</div>
            <div className="text-sm text-slate-300">
              {formatCurrency(batch.unitCostIdr)}
            </div>
          </div>
        </div>
      </div>

      {/* Progress Bar */}
      <div className="mt-3">
        <div className="flex items-center justify-between text-xs text-slate-400 mb-1">
          <span>Consumed</span>
          <span>{consumedPercent.toFixed(0)}%</span>
        </div>
        <div className="h-2 bg-slate-700 rounded-full overflow-hidden">
          <div
            className={cn(
              "h-full transition-all",
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
    </Card>
  );
}
