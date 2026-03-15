import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { ChevronLeft, ChevronRight, Package } from "lucide-react";
import { formatCurrency } from "@/lib/utils";
import { useBigSellerOrders } from "@/hooks/convex";

const PAGE_SIZE = 20;

// Platform badge config
const PLATFORM_BADGES: Record<string, { label: string; className: string }> = {
  shopee: {
    label: "Shopee",
    className:
      "border-orange-500 dark:border-orange-600 text-orange-700 dark:text-orange-400 bg-orange-50 dark:bg-orange-950/30",
  },
  tiktok: {
    label: "TikTok",
    className:
      "border-pink-500 dark:border-pink-600 text-pink-700 dark:text-pink-400 bg-pink-50 dark:bg-pink-950/30",
  },
};

function formatSkus(skuVoList: Array<{ sku: string; skuNum: number }>) {
  if (!skuVoList || skuVoList.length === 0) return "--";
  const skus = skuVoList.map((s) => s.sku).filter(Boolean);
  if (skus.length <= 3) return skus.join(", ");
  return skus.slice(0, 3).join(", ");
}

function formatDate(ms: number) {
  return new Date(ms).toLocaleDateString("id-ID", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

export function BigSellerOrdersTable() {
  const [page, setPage] = useState(1);
  const [platform, setPlatform] = useState<string>("all");
  const [filterStartDate, setFilterStartDate] = useState("");
  const [filterEndDate, setFilterEndDate] = useState("");

  const filters: {
    page: number;
    pageSize: number;
    platform?: string;
    startDate?: number;
    endDate?: number;
  } = {
    page,
    pageSize: PAGE_SIZE,
  };

  if (platform !== "all") {
    filters.platform = platform;
  }
  if (filterStartDate) {
    filters.startDate = new Date(filterStartDate).getTime();
  }
  if (filterEndDate) {
    // End of day
    filters.endDate =
      new Date(filterEndDate).getTime() + 24 * 60 * 60 * 1000 - 1;
  }

  const { data, isLoading } = useBigSellerOrders(filters);

  const orders = data?.orders ?? [];
  const totalPages = data?.totalPages ?? 1;
  const total = data?.total ?? 0;

  return (
    <div className="space-y-3">
      {/* Filters */}
      <div className="flex flex-wrap items-end gap-2">
        <div>
          <label className="text-xs text-muted-foreground block mb-1">
            Platform
          </label>
          <Select
            value={platform}
            onValueChange={(v) => {
              setPlatform(v);
              setPage(1);
            }}
          >
            <SelectTrigger className="h-8 text-xs w-[120px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All</SelectItem>
              <SelectItem value="shopee">Shopee</SelectItem>
              <SelectItem value="tiktok">TikTok</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div>
          <label className="text-xs text-muted-foreground block mb-1">
            From
          </label>
          <Input
            type="date"
            value={filterStartDate}
            onChange={(e) => {
              setFilterStartDate(e.target.value);
              setPage(1);
            }}
            className="h-8 text-xs w-[130px]"
          />
        </div>
        <div>
          <label className="text-xs text-muted-foreground block mb-1">
            To
          </label>
          <Input
            type="date"
            value={filterEndDate}
            onChange={(e) => {
              setFilterEndDate(e.target.value);
              setPage(1);
            }}
            className="h-8 text-xs w-[130px]"
          />
        </div>
        <div className="text-xs text-muted-foreground self-end pb-1.5">
          {total} order{total !== 1 ? "s" : ""}
        </div>
      </div>

      {/* Table */}
      <div className="overflow-x-auto border rounded-lg">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="text-xs">Date</TableHead>
              <TableHead className="text-xs">Platform</TableHead>
              <TableHead className="text-xs">Shop</TableHead>
              <TableHead className="text-xs">SKUs</TableHead>
              <TableHead className="text-xs text-right">
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <span className="cursor-help">Gross Revenue</span>
                    </TooltipTrigger>
                    <TooltipContent>
                      <p className="text-xs max-w-[200px]">
                        Total amount the customer paid (product + shipping)
                      </p>
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              </TableHead>
              <TableHead className="text-xs text-right">Commission</TableHead>
              <TableHead className="text-xs text-right">Seller Shipping</TableHead>
              <TableHead className="text-xs text-right">Buyer Shipping</TableHead>
              <TableHead className="text-xs text-right">Other</TableHead>
              <TableHead className="text-xs text-right">Profit</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow>
                <TableCell colSpan={10} className="text-center py-8">
                  <div className="flex items-center justify-center gap-2 text-muted-foreground text-sm">
                    Loading orders...
                  </div>
                </TableCell>
              </TableRow>
            ) : orders.length === 0 ? (
              <TableRow>
                <TableCell colSpan={10} className="text-center py-8">
                  <div className="flex flex-col items-center gap-2 text-muted-foreground text-sm">
                    <Package className="h-8 w-8 opacity-40" />
                    <p>No synced orders yet. Run a sync to pull BigSeller data.</p>
                  </div>
                </TableCell>
              </TableRow>
            ) : (
              orders.map((order) => {
                const platformConfig =
                  PLATFORM_BADGES[order.platform] ??
                  PLATFORM_BADGES["shopee"];
                const skuList = order.skuVoList ?? [];
                const displaySkus = formatSkus(skuList);
                const hasMoreSkus = skuList.length > 3;
                const allSkus = skuList
                  .map((s) => s.sku)
                  .filter(Boolean)
                  .join(", ");

                return (
                  <TableRow key={order._id}>
                    <TableCell className="text-xs whitespace-nowrap">
                      {formatDate(order.orderTimeMs)}
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant="outline"
                        className={`text-[10px] ${platformConfig.className}`}
                      >
                        {platformConfig.label}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-xs max-w-[120px] truncate">
                      {order.shopName}
                    </TableCell>
                    <TableCell className="text-xs max-w-[150px]">
                      {hasMoreSkus ? (
                        <TooltipProvider>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <span className="cursor-help">
                                {displaySkus}...
                              </span>
                            </TooltipTrigger>
                            <TooltipContent>
                              <p className="text-xs max-w-[300px]">
                                {allSkus}
                              </p>
                            </TooltipContent>
                          </Tooltip>
                        </TooltipProvider>
                      ) : (
                        displaySkus
                      )}
                    </TableCell>
                    <TableCell className="text-xs text-right font-mono">
                      {formatCurrency(order.orderAmount ?? order.saleAmount)}
                    </TableCell>
                    <TableCell className="text-xs text-right font-mono text-[var(--color-status-error,#ef4444)]">
                      {formatCurrency(order.commissionFee)}
                    </TableCell>
                    <TableCell className="text-xs text-right font-mono text-[var(--color-status-error,#ef4444)]">
                      {formatCurrency(order.sellerShippingFee)}
                    </TableCell>
                    <TableCell className="text-xs text-right font-mono">
                      {formatCurrency(order.buyerShippingFee)}
                    </TableCell>
                    <TableCell className="text-xs text-right font-mono text-[var(--color-status-error,#ef4444)]">
                      {formatCurrency(order.otherFee)}
                    </TableCell>
                    <TableCell className="text-xs text-right font-mono">
                      <span
                        className={
                          order.calculatedProfit >= 0
                            ? "text-[var(--color-status-success,#22c55e)]"
                            : "text-[var(--color-status-error,#ef4444)]"
                        }
                      >
                        {formatCurrency(order.calculatedProfit)}
                      </span>
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span>
            Page {page} of {totalPages}
          </span>
          <div className="flex gap-1">
            <Button
              variant="outline"
              size="sm"
              className="h-7 text-xs"
              disabled={page <= 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
            >
              <ChevronLeft className="h-3 w-3" />
              Previous
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="h-7 text-xs"
              disabled={page >= totalPages}
              onClick={() => setPage((p) => p + 1)}
            >
              Next
              <ChevronRight className="h-3 w-3" />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
