/**
 * OverrideCard - Displays a manager override voucher with order details.
 */
import { Link } from "react-router-dom";
import { useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import type { Voucher } from "@/hooks/convex/useVouchers";
import { getVoucherStatus, formatDiscountValue, formatDateTime } from "./voucherUtils";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import {
  ShieldCheck,
  Copy,
  Clock,
  AlertTriangle,
  ExternalLink,
  TrendingUp,
  Calendar,
} from "lucide-react";

interface OverrideCardProps {
  voucher: Voucher;
  onCopyCode: (code: string) => void;
}

export function OverrideCard({ voucher, onCopyCode }: OverrideCardProps) {
  const status = getVoucherStatus(voucher);
  const isExpired =
    voucher.validUntil !== undefined && Date.now() > voucher.validUntil;

  // Fetch linked order details if override has been used
  const orderDetails = useQuery(
    api.vouchers.queries.getOverrideOrderDetails,
    voucher.overrideOrderId ? { voucherId: voucher._id } : "skip"
  );

  return (
    <Card className={cn(isExpired && "opacity-60")}>
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <ShieldCheck className="w-4 h-4 text-amber-600" />
              <Badge variant={status.variant}>{status.label}</Badge>
            </div>
            <button
              onClick={() => onCopyCode(voucher.code)}
              className="flex items-center gap-1 text-sm font-mono text-muted-foreground hover:text-foreground transition-colors"
            >
              <Copy className="w-3 h-3" />
              {voucher.code}
            </button>
          </div>
          <div
            className={cn(
              "text-lg font-bold",
              voucher.discountType === "percentage"
                ? "text-blue-600 dark:text-blue-400"
                : "text-green-600 dark:text-green-400"
            )}
          >
            {formatDiscountValue(voucher)}
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-2">
        {/* Reason */}
        {voucher.overrideReason && (
          <p className="text-sm text-muted-foreground">
            <span className="font-medium">Reason:</span> {voucher.overrideReason}
          </p>
        )}

        {/* Order linkage */}
        {voucher.overrideOrderId && (
          <div className="text-sm">
            {orderDetails === undefined ? (
              <span className="text-muted-foreground">Loading order...</span>
            ) : orderDetails?.orderDeleted ? (
              <span className="text-destructive flex items-center gap-1">
                <AlertTriangle className="w-3 h-3" />
                Order has been deleted
              </span>
            ) : orderDetails ? (
              <Link
                to={`/orders/${voucher.overrideOrderId}`}
                className="text-blue-600 dark:text-blue-400 hover:underline flex items-center gap-1"
              >
                <ExternalLink className="w-3 h-3" />
                Used by Order #{orderDetails.orderNumber}
              </Link>
            ) : null}
          </div>
        )}

        {/* Created info */}
        <div className="flex items-center gap-1 text-xs text-muted-foreground">
          <Clock className="w-3 h-3" />
          Created by {voucher.createdBy} on {formatDateTime(voucher.createdAt)}
        </div>

        {/* Usage */}
        <div className="flex items-center gap-1 text-xs text-muted-foreground">
          <TrendingUp className="w-3 h-3" />
          {voucher.usageCount > 0 ? "Used" : "Not used"}
        </div>

        {/* Expiry */}
        {voucher.validUntil !== undefined && (
          <div
            className={cn(
              "flex items-center gap-1 text-xs",
              isExpired ? "text-destructive" : "text-muted-foreground"
            )}
          >
            <Calendar className="w-3 h-3" />
            {isExpired ? "Expired" : "Expires"} {formatDateTime(voucher.validUntil)}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
