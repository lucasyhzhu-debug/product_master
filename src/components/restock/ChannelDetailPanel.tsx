import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { X, Package } from "lucide-react";
import { cn } from "@/lib/utils";
import { RestockTargetRow } from "./RestockTargetRow";
import { useState } from "react";
import { toast } from "sonner";

type Product = {
  productKey: string;
  productName: string;
  menuProductId?: string;
  currentStock?: number;
  weekdaySalesTotal: number;
  weekendSalesTotal: number;
  totalSold30d: number;
  weekdayDailyRate: number;
  weekendDailyRate: number;
  overallDailyRate: number;
  daysRemaining?: number;
  status?: "critical" | "warning" | "ok";
  suggestedWeekday: number;
  suggestedWeekend: number;
  targetWeekday?: number;
  targetWeekend?: number;
  last7dSales: number;
  prev7dSales: number;
  trendDirection: "up" | "down" | "flat";
  transactionCount: number;
  confidence: "high" | "medium" | "low";
};

interface ChannelDetailPanelProps {
  channel: "k3mart" | "gobiz" | "internal";
  outletName?: string;
  products: Product[] | undefined;
  isLoading: boolean;
  onClose: () => void;
  onSaveTarget: (
    productKey: string,
    menuProductId: string | undefined,
    weekdayTarget: number,
    weekendTarget: number
  ) => Promise<void>;
  onUpdateStock?: (productKey: string, quantity: number) => Promise<void>;
}

const channelLabels: Record<string, string> = {
  k3mart: "K3Mart",
  gobiz: "GoBiz",
  internal: "Internal",
};

export function ChannelDetailPanel({
  channel,
  outletName,
  products,
  isLoading,
  onClose,
  onSaveTarget,
  onUpdateStock,
}: ChannelDetailPanelProps) {
  const hasManualStockData = products?.some((p) => p.currentStock !== undefined) ?? false;
  const showStock = channel === "k3mart" || hasManualStockData;
  const showManualStock = channel !== "k3mart" && !!onUpdateStock;

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Package className="h-5 w-5 text-muted-foreground" />
            <CardTitle className="text-lg">
              {channelLabels[channel]}
              {outletName && ` - ${outletName}`}
            </CardTitle>
            <Badge variant="secondary" className="text-xs">
              {products?.length ?? 0} products
            </Badge>
          </div>
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={onClose}>
            <X className="h-4 w-4" />
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="space-y-3">
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="h-10 w-full" />
            ))}
          </div>
        ) : !products || products.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-8">
            No sales data found for the past 30 days.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b text-xs text-muted-foreground">
                  <th className="py-2 px-3 text-left font-medium">Product</th>
                  {showStock && (
                    <th className="py-2 px-3 text-center font-medium">
                      Stock {showManualStock && "(manual)"}
                    </th>
                  )}
                  <th className="py-2 px-3 text-center font-medium">Avg Daily (Wd/We)</th>
                  {showStock && (
                    <th className="py-2 px-3 text-center font-medium">Days Left</th>
                  )}
                  <th className="py-2 px-3 text-center font-medium">Trend</th>
                  <th className="py-2 px-3 text-left font-medium">Target (Wd/We)</th>
                  <th className="py-2 px-3 text-center font-medium w-20"></th>
                </tr>
              </thead>
              <tbody>
                {products.map((p) => (
                  <RestockTargetRow
                    key={p.productKey}
                    productKey={p.productKey}
                    productName={p.productName}
                    currentStock={p.currentStock}
                    weekdayDailyRate={p.weekdayDailyRate}
                    weekendDailyRate={p.weekendDailyRate}
                    overallDailyRate={p.overallDailyRate}
                    daysRemaining={p.daysRemaining}
                    status={p.status}
                    suggestedWeekday={p.suggestedWeekday}
                    suggestedWeekend={p.suggestedWeekend}
                    targetWeekday={p.targetWeekday}
                    targetWeekend={p.targetWeekend}
                    trendDirection={p.trendDirection}
                    confidence={p.confidence}
                    showStock={showStock}
                    onSave={async (wd, we) => {
                      await onSaveTarget(p.productKey, p.menuProductId, wd, we);
                    }}
                  />
                ))}
              </tbody>
            </table>

            {showManualStock && (
              <ManualStockSection
                products={products}
                onUpdateStock={onUpdateStock!}
              />
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function ManualStockSection({
  products,
  onUpdateStock,
}: {
  products: Product[];
  onUpdateStock: (productKey: string, quantity: number) => Promise<void>;
}) {
  const [editingProduct, setEditingProduct] = useState<string | null>(null);
  const [stockValue, setStockValue] = useState("");

  async function handleSaveStock(productKey: string) {
    const qty = Number(stockValue);
    if (isNaN(qty) || qty < 0) {
      toast.error("Please enter a valid quantity");
      return;
    }
    try {
      await onUpdateStock(productKey, qty);
      toast.success("Stock updated");
      setEditingProduct(null);
      setStockValue("");
    } catch {
      toast.error("Failed to update stock");
    }
  }

  return (
    <div className="mt-4 pt-4 border-t">
      <p className="text-xs text-muted-foreground mb-2">
        Manual Stock Entry — Click a product to update current stock count
      </p>
      <div className="flex flex-wrap gap-2">
        {products.map((p) => (
          <div key={p.productKey} className="flex items-center gap-1">
            {editingProduct === p.productKey ? (
              <div className="flex items-center gap-1">
                <span className="text-xs truncate max-w-[100px]">{p.productName}:</span>
                <Input
                  type="number"
                  min={0}
                  value={stockValue}
                  onChange={(e) => setStockValue(e.target.value)}
                  className="w-20 h-7 text-xs"
                  placeholder={String(p.currentStock ?? 0)}
                  autoFocus
                  onKeyDown={(e) => {
                    if (e.key === "Enter") handleSaveStock(p.productKey);
                    if (e.key === "Escape") {
                      setEditingProduct(null);
                      setStockValue("");
                    }
                  }}
                />
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 px-2 text-xs"
                  onClick={() => handleSaveStock(p.productKey)}
                >
                  Save
                </Button>
              </div>
            ) : (
              <Badge
                variant="outline"
                className={cn(
                  "cursor-pointer hover:bg-muted text-xs",
                  p.currentStock !== undefined && "font-medium"
                )}
                onClick={() => {
                  setEditingProduct(p.productKey);
                  setStockValue(p.currentStock !== undefined ? String(p.currentStock) : "");
                }}
              >
                {p.productName}: {p.currentStock ?? "?"}
              </Badge>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
