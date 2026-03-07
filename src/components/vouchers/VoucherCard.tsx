/**
 * VoucherCard - Displays a single voucher with status, stats, and actions.
 */
import type { Voucher } from "@/hooks/convex/useVouchers";
import { formatDate, getVoucherStatus, formatDiscountValue } from "./voucherUtils";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { formatCurrency } from "@/lib/utils";
import {
  Edit,
  Trash2,
  Power,
  Copy,
  Hash,
  Calendar,
  Users,
  TrendingUp,
  Package,
} from "lucide-react";

interface VoucherCardProps {
  voucher: Voucher;
  onEdit: (voucher: Voucher) => void;
  onDelete: (voucher: Voucher) => void;
  onToggleActive: (voucher: Voucher) => void;
  onCopyCode: (code: string) => void;
  menuProductsMap?: Map<string, string>;
}

export function VoucherCard({
  voucher,
  onEdit,
  onDelete,
  onToggleActive,
  onCopyCode,
  menuProductsMap,
}: VoucherCardProps) {
  const status = getVoucherStatus(voucher);

  return (
    <Card className={cn(!voucher.isActive && "opacity-60")}>
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <CardTitle className="text-base truncate">{voucher.name}</CardTitle>
              <Badge variant={status.variant}>{status.label}</Badge>
              {voucher.isFreeVoucher && (
                <Badge variant="outline" className="text-green-600 border-green-600">
                  Free
                </Badge>
              )}
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
      <CardContent className="space-y-3">
        {/* Description */}
        {voucher.description && (
          <p className="text-sm text-muted-foreground line-clamp-2">
            {voucher.description}
          </p>
        )}

        {/* Stats */}
        <div className="flex flex-wrap gap-3 text-xs text-muted-foreground">
          <div className="flex items-center gap-1">
            <TrendingUp className="w-3 h-3" />
            {voucher.usageCount}
            {voucher.usageLimit !== undefined && `/${voucher.usageLimit}`} used
          </div>
          {voucher.minimumOrderAmount !== undefined && (
            <div className="flex items-center gap-1">
              <Hash className="w-3 h-3" />
              Min {formatCurrency(voucher.minimumOrderAmount)}
            </div>
          )}
          {voucher.usagePerCustomer !== undefined && (
            <div className="flex items-center gap-1">
              <Users className="w-3 h-3" />
              {voucher.usagePerCustomer}/customer
            </div>
          )}
          {voucher.applicableMenuProductId && (
            <div className="flex items-center gap-1">
              <Package className="w-3 h-3" />
              Item: {menuProductsMap?.get(voucher.applicableMenuProductId) ?? "Linked product"}
            </div>
          )}
        </div>

        {/* Validity */}
        {(voucher.validFrom !== undefined ||
          voucher.validUntil !== undefined) && (
          <div className="flex items-center gap-1 text-xs text-muted-foreground">
            <Calendar className="w-3 h-3" />
            {formatDate(voucher.validFrom)} - {formatDate(voucher.validUntil)}
          </div>
        )}

        {/* Actions */}
        <div className="flex flex-wrap gap-2 pt-2 border-t">
          <Button variant="outline" size="sm" onClick={() => onEdit(voucher)}>
            <Edit className="w-3 h-3 mr-1" />
            Edit
          </Button>
          <Button
            variant={voucher.isActive ? "secondary" : "default"}
            size="sm"
            onClick={() => onToggleActive(voucher)}
          >
            <Power className="w-3 h-3 mr-1" />
            {voucher.isActive ? "Deactivate" : "Activate"}
          </Button>
          <Button
            variant="destructive"
            size="sm"
            onClick={() => onDelete(voucher)}
            disabled={voucher.usageCount > 0}
          >
            <Trash2 className="w-3 h-3 mr-1" />
            Delete
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
