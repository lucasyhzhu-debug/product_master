import { useState } from "react";
import { useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { toast } from "sonner";
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
import { useBigSellerOrders, useSetMenuProductForSku } from "@/hooks/convex";
import { useAuth } from "@/contexts/AuthContext";

const PAGE_SIZE = 20;

// Phase 79 Plan 07 (D-14, D-15): window during which a Shopee/TikTok order
// with an empty skuVoList still shows the friendly "Pending SKU from Shopee"
// label. After this window elapses, the cell reverts to bare "--" because
// the daily 03:00 WIB re-sync should have populated SKUs by then.
const PENDING_SKU_THRESHOLD_MS = 24 * 60 * 60 * 1000;

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

type ResolvedSku = {
  sku: string;
  skuNum: number;
  returnNum: number;
  isAddition: number;
  externalProductMappingId: Id<"externalProductMappings"> | null;
  mappedMenuProductId: Id<"menuProducts"> | null;
  mappedMenuProductName: string | null;
};

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
  const { user } = useAuth();
  const setMenuProductForSku = useSetMenuProductForSku();

  // Fetch menu products for the "Map manually" dropdown. Small dataset
  // (<100 items); fetched once per page render.
  const menuProductsRaw = useQuery(api.menuProducts.queries.list, {});
  const menuProducts = (menuProductsRaw ?? []).map((mp) => ({
    _id: mp._id,
    name: mp.name,
  }));

  const orders = data?.orders ?? [];
  const totalPages = data?.totalPages ?? 1;
  const total = data?.total ?? 0;

  async function handleMapSku(
    source: string,
    externalProductCode: string,
    menuProductId: Id<"menuProducts"> | undefined
  ) {
    if (!user?.token) {
      toast.error("Not authenticated");
      return;
    }
    if (source !== "shopee" && source !== "tiktok") {
      toast.error(`Cannot map platform "${source}" from this table`);
      return;
    }
    try {
      const result = await setMenuProductForSku({
        token: user.token,
        source,
        externalProductCode,
        menuProductId,
      });
      if (menuProductId) {
        const linkedCount = result.updatedItems + result.bigsellerUpdated;
        toast.success(
          linkedCount > 0
            ? `Mapped ${externalProductCode} · relinked ${linkedCount} past order${linkedCount === 1 ? "" : "s"}`
            : `Mapped ${externalProductCode} · no past orders to relink`
        );
      } else {
        toast.success(`Cleared mapping for ${externalProductCode}`);
      }
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Failed to set mapping"
      );
    }
  }

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
              <TableHead className="text-xs">
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <span className="cursor-help">BigSeller SKU</span>
                    </TooltipTrigger>
                    <TooltipContent>
                      <p className="text-xs max-w-[240px]">
                        Raw SKU code sent by BigSeller / platform per line item.
                        Empty ("--") means BigSeller did not return SKU data for this order.
                      </p>
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              </TableHead>
              <TableHead className="text-xs">
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <span className="cursor-help">Frollie Product</span>
                    </TooltipTrigger>
                    <TooltipContent>
                      <p className="text-xs max-w-[240px]">
                        Internal Frollie menu product resolved via Product Mapping.
                        Use the dropdown to map unmapped SKUs inline.
                      </p>
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              </TableHead>
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
                <TableCell colSpan={11} className="text-center py-8">
                  <div className="flex items-center justify-center gap-2 text-muted-foreground text-sm">
                    Loading orders...
                  </div>
                </TableCell>
              </TableRow>
            ) : orders.length === 0 ? (
              <TableRow>
                <TableCell colSpan={11} className="text-center py-8">
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
                const resolved: ResolvedSku[] =
                  (order as { resolvedSkus?: ResolvedSku[] }).resolvedSkus ??
                  (order.skuVoList ?? []).map((s) => ({
                    sku: s.sku,
                    skuNum: s.skuNum,
                    returnNum: s.returnNum,
                    isAddition: s.isAddition,
                    externalProductMappingId: null,
                    mappedMenuProductId: null,
                    mappedMenuProductName: null,
                  }));
                const hasAllSkuNum =
                  (order.allSkuNum ?? 0) > 0 && resolved.length === 0;
                // Phase 79 Plan 07 T3 (D-14, D-15): 24h window for "Pending
                // SKU from Shopee" — after that, show bare "--".
                const ageMs = Date.now() - (order.orderTimeMs ?? 0);
                const withinPendingWindow = ageMs < PENDING_SKU_THRESHOLD_MS;

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
                    {/* BigSeller SKU column */}
                    <TableCell className="text-xs max-w-[160px] align-top">
                      {resolved.length === 0 ? (
                        hasAllSkuNum && withinPendingWindow ? (
                          <TooltipProvider>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <span className="cursor-help italic text-muted-foreground">
                                  Pending SKU from Shopee
                                </span>
                              </TooltipTrigger>
                              <TooltipContent>
                                <p className="text-xs max-w-[280px]">
                                  BigSeller reports {order.allSkuNum} unit
                                  {order.allSkuNum === 1 ? "" : "s"} on this
                                  order but has not yet returned the SKU
                                  breakdown. The daily 03:00 WIB re-sync
                                  should populate this within 24h of order
                                  time.
                                </p>
                              </TooltipContent>
                            </Tooltip>
                          </TooltipProvider>
                        ) : (
                          <span className="text-muted-foreground">--</span>
                        )
                      ) : (
                        <div className="flex flex-col gap-0.5">
                          {resolved.map((r, i) => (
                            <span key={`${r.sku}-${i}`} className="font-mono">
                              {r.sku}
                              {r.skuNum > 1 ? (
                                <span className="text-muted-foreground">
                                  {" "}
                                  × {r.skuNum}
                                </span>
                              ) : null}
                            </span>
                          ))}
                        </div>
                      )}
                    </TableCell>
                    {/* Frollie Product column */}
                    <TableCell className="text-xs max-w-[220px] align-top">
                      {resolved.length === 0 ? (
                        <span className="text-muted-foreground">--</span>
                      ) : (
                        <div className="flex flex-col gap-1">
                          {resolved.map((r, i) =>
                            r.mappedMenuProductName ? (
                              <span
                                key={`${r.sku}-name-${i}`}
                                className="truncate"
                                title={r.mappedMenuProductName}
                              >
                                {r.mappedMenuProductName}
                              </span>
                            ) : (
                              <Select
                                key={`${r.sku}-map-${i}`}
                                value=""
                                onValueChange={(value) => {
                                  void handleMapSku(
                                    order.platform,
                                    r.sku,
                                    value as Id<"menuProducts">
                                  );
                                }}
                              >
                                <SelectTrigger className="h-6 text-[11px] w-full max-w-[210px]">
                                  <SelectValue placeholder="Map manually…" />
                                </SelectTrigger>
                                <SelectContent>
                                  {menuProducts.map((mp) => (
                                    <SelectItem
                                      key={mp._id}
                                      value={mp._id}
                                      className="text-xs"
                                    >
                                      {mp.name}
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            )
                          )}
                        </div>
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
