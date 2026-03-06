/**
 * OrdersTab - GrabFood orders sync history and revenue table.
 * Extracted from GrabFoodManager.tsx for maintainability.
 */

import { useState, useMemo } from "react";
import {
  Clock,
  Loader2,
  ChevronDown,
  ChevronUp,
} from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

import { formatCurrency } from "@/lib/utils";
import { formatRelativeTime } from "@/lib/formatters";
import { useGrabFoodActions } from "@/hooks/convex/useGrabFood";
import type { Id } from "../../../convex/_generated/dataModel";

// GrabFood-specific: formats ISO string dates from GrabFood API responses
function formatDateTime(isoString: string): string {
  try {
    return new Date(isoString).toLocaleString("en-ID", {
      timeZone: "Asia/Jakarta",
      day: "2-digit",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return isoString;
  }
}

export interface OrdersTabProps {
  merchantID: string;
  outletId?: Id<"externalOutlets">;
  orders: any[] | undefined;
  isLoading: boolean;
  stats: { totalOrders: number; lastSyncedAt: number | null } | undefined;
  isAdmin: boolean;
}

export function OrdersTab({ merchantID, outletId, orders, isLoading, stats, isAdmin }: OrdersTabProps) {
  const actions = useGrabFoodActions();
  const [syncing, setSyncing] = useState(false);
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [page, setPage] = useState(0);
  const pageSize = 25;

  const handleSync = async () => {
    if (!merchantID) {
      toast.error("No outlet selected. Select an outlet or add one in Settings.");
      return;
    }

    setSyncing(true);
    try {
      const result = await actions.syncOrders(
        merchantID,
        outletId,
        fromDate || undefined,
        toDate || undefined
      );

      if (result.success) {
        toast.success(`Synced ${result.ordersCount} orders`);
      } else {
        toast.error(result.error ?? "Sync failed");
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Sync failed");
    } finally {
      setSyncing(false);
    }
  };

  const paginatedOrders = useMemo(() => {
    if (!orders) return [];
    return orders.slice(page * pageSize, (page + 1) * pageSize);
  }, [orders, page]);

  const totalPages = orders ? Math.ceil(orders.length / pageSize) : 0;

  return (
    <div className="space-y-4">
      {/* Sync controls */}
      <Card>
        <CardContent className="pt-4 pb-4">
          <div className="flex items-center justify-between flex-wrap gap-3">
            <div className="flex items-center gap-3">
              {isAdmin && (
                <Button onClick={handleSync} disabled={syncing || !merchantID} className="min-h-[44px]">
                  {syncing ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin mr-1" />
                      Syncing...
                    </>
                  ) : (
                    "Sync Order History"
                  )}
                </Button>
              )}
              <span className="text-sm text-muted-foreground">
                <Clock className="h-3.5 w-3.5 inline mr-1" />
                Last synced: {stats?.lastSyncedAt ? formatRelativeTime(stats.lastSyncedAt) : "Never"}
              </span>
              {stats && (
                <Badge variant="secondary">{stats.totalOrders} orders</Badge>
              )}
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setShowDatePicker(!showDatePicker)}
            >
              Custom Date
              {showDatePicker ? (
                <ChevronUp className="h-4 w-4 ml-1" />
              ) : (
                <ChevronDown className="h-4 w-4 ml-1" />
              )}
            </Button>
          </div>

          {showDatePicker && (
            <div className="flex items-end gap-3 mt-3 pt-3 border-t">
              <div>
                <Label className="text-xs">From</Label>
                <Input
                  type="date"
                  value={fromDate}
                  onChange={(e) => setFromDate(e.target.value)}
                  className="w-[160px]"
                />
              </div>
              <div>
                <Label className="text-xs">To</Label>
                <Input
                  type="date"
                  value={toDate}
                  onChange={(e) => setToDate(e.target.value)}
                  className="w-[160px]"
                />
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setFromDate("");
                  setToDate("");
                }}
              >
                Clear
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Orders table */}
      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Order ID</TableHead>
                <TableHead>Date/Time</TableHead>
                <TableHead>Items</TableHead>
                <TableHead className="text-right">Subtotal</TableHead>
                <TableHead className="text-right">Promo</TableHead>
                <TableHead className="text-right">Net Revenue</TableHead>
                <TableHead>Payment</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <TableRow key={i}>
                    {Array.from({ length: 7 }).map((_, j) => (
                      <TableCell key={j}>
                        <Skeleton className="h-4 w-full" />
                      </TableCell>
                    ))}
                  </TableRow>
                ))
              ) : paginatedOrders.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="text-center text-muted-foreground py-8">
                    No orders found. Click "Sync Order History" to fetch from GrabFood.
                  </TableCell>
                </TableRow>
              ) : (
                paginatedOrders.map((order: any) => {
                  const price = order.price ?? {};
                  const subtotal: number = price.subtotal ?? 0;
                  const promoTotal =
                    (price.grabFundPromo ?? 0) +
                    (price.merchantFundPromo ?? 0) +
                    (price.basketPromo ?? 0);
                  const netRevenue = subtotal - promoTotal;
                  const itemCount = Array.isArray(order.items) ? order.items.length : 0;
                  const firstItem =
                    itemCount > 0 ? order.items[0]?.name ?? "Item" : "-";

                  return (
                    <TableRow key={order._id}>
                      <TableCell className="font-mono text-sm">
                        {order.shortOrderNumber || order.orderID?.slice(0, 8)}
                      </TableCell>
                      <TableCell className="text-sm">
                        {formatDateTime(order.orderTime)}
                      </TableCell>
                      <TableCell className="text-sm">
                        {itemCount > 0
                          ? `${firstItem}${itemCount > 1 ? ` +${itemCount - 1}` : ""}`
                          : "-"}
                      </TableCell>
                      <TableCell className="text-right text-sm">
                        {formatCurrency(subtotal ?? 0)}
                      </TableCell>
                      <TableCell className="text-right text-sm text-orange-600">
                        {promoTotal > 0 ? `-${formatCurrency(promoTotal ?? 0)}` : "-"}
                      </TableCell>
                      <TableCell className="text-right text-sm font-medium">
                        {formatCurrency(netRevenue ?? 0)}
                      </TableCell>
                      <TableCell className="text-sm">
                        {price.paymentType ?? order.paymentType ?? "-"}
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between px-4 py-3 border-t">
              <span className="text-sm text-muted-foreground">
                Page {page + 1} of {totalPages}
              </span>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={page === 0}
                  onClick={() => setPage((p) => p - 1)}
                >
                  Previous
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={page >= totalPages - 1}
                  onClick={() => setPage((p) => p + 1)}
                >
                  Next
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
