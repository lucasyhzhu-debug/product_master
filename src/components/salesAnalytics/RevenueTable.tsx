import { useState, Fragment } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import { cn, formatCurrency } from "@/lib/utils";
import { wibDateStrToUtcMs } from "@/lib/dateUtils";
import { utcToWibTimeStr } from "@/lib/dateUtils";
import { formatDateId } from "@/lib/dateUtils";
import type { Id } from "../../../convex/_generated/dataModel";
import type { RevenueRecord } from "./overviewUtils";
import { PlatformBadge } from "./PlatformBadge";
import { ConfidenceBadge } from "./ConfidenceBadge";
import { RevenueItemDetails } from "./RevenueItemDetails";
import { InternalOrderDetails } from "./InternalOrderDetails";
import { StoreGroupHeader } from "./StoreGroupHeader";

export function RevenueTable({
  records,
  dateFrom,
  dateTo,
}: {
  records: RevenueRecord[];
  dateFrom: string;
  dateTo: string;
}) {
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [collapsedStores, setCollapsedStores] = useState<Set<string>>(new Set());

  const filtered = records
    .filter((r) => {
      // Convert WIB date strings to UTC boundaries for filtering
      if (dateFrom && r.periodStart < wibDateStrToUtcMs(dateFrom)) return false;
      if (dateTo && r.periodStart >= wibDateStrToUtcMs(dateTo) + 24 * 60 * 60 * 1000) return false;
      return true;
    })
    .sort((a, b) => {
      // Sort by transaction time descending (newest first)
      const tsA = a.transactionDate ?? a.periodStart;
      const tsB = b.transactionDate ?? b.periodStart;
      return tsB - tsA;
    });

  if (filtered.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-center">
        <p className="text-sm text-muted-foreground">No records match the selected date range.</p>
      </div>
    );
  }

  // K3 Mart store grouping: only when all visible records are k3mart
  const useStoreGrouping = filtered.length > 0 && filtered.every(r => r.source === "k3mart");

  const storeGroups = useStoreGrouping
    ? (() => {
        const groups = new Map<string, RevenueRecord[]>();
        for (const r of filtered) {
          const key = r.customerStoreName || "Unknown Store";
          const existing = groups.get(key);
          if (existing) {
            existing.push(r);
          } else {
            groups.set(key, [r]);
          }
        }
        return groups;
      })()
    : null;

  const toggleStore = (storeName: string) => {
    setCollapsedStores((prev) => {
      const next = new Set(prev);
      if (next.has(storeName)) {
        next.delete(storeName);
      } else {
        next.add(storeName);
      }
      return next;
    });
  };

  function renderRow(record: RevenueRecord) {
    const isExpandableGobiz = record.source === "gobiz" && !!record.gobizOrderNumber;
    const isExpandableInternal = record.source === "internal" && !!record.externalTransactionId;
    const isExpandable = isExpandableGobiz || isExpandableInternal;
    const isExpanded = expandedId === record._id;

    return (
      <Fragment key={record._id}>
        <tr
          className={cn("border-b hover:bg-muted/50", isExpandable && "cursor-pointer")}
          onClick={isExpandable ? () => setExpandedId(isExpanded ? null : record._id) : undefined}
        >
          <td className="py-3 px-1">
            {isExpandable && (
              isExpanded
                ? <ChevronDown className="h-4 w-4 text-muted-foreground" />
                : <ChevronRight className="h-4 w-4 text-muted-foreground" />
            )}
          </td>
          <td className="py-3 px-2">
            {formatDateId(record.periodStart)}
          </td>
          <td className="py-3 px-2 text-muted-foreground text-xs tabular-nums">
            {utcToWibTimeStr(record.transactionDate ?? record.periodStart)}
          </td>
          <td className="py-3 px-2">
            <PlatformBadge platform={record.source} />
          </td>
          <td className="py-3 px-2 text-muted-foreground text-xs">
            {record.customerStoreName || "\u2014"}
          </td>
          <td className="py-3 px-2">
            {record.productName || "(all)"}
          </td>
          <td className="py-3 px-2 text-right">
            {record.quantitySold || "\u2014"}
          </td>
          <td className="py-3 px-2 text-right font-medium">
            {record.revenueGross
              ? formatCurrency(record.revenueGross)
              : "\u2014"}
          </td>
          <td className="py-3 px-2 text-right">
            {record.revenueNet
              ? formatCurrency(record.revenueNet)
              : "\u2014"}
          </td>
          <td className="py-3 px-2">
            <ConfidenceBadge confidence={record.confidence} />
          </td>
        </tr>
        {isExpanded && isExpandableGobiz && (
          <RevenueItemDetails
            key={`${record._id}-items`}
            revenueId={record._id as Id<"externalRevenue">}
          />
        )}
        {isExpanded && isExpandableInternal && (
          <InternalOrderDetails
            key={`${record._id}-order`}
            orderNumber={record.externalTransactionId!}
          />
        )}
      </Fragment>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b">
            <th className="w-8 py-3 px-1"></th>
            <th className="text-left py-3 px-2 font-medium">Date</th>
            <th className="text-left py-3 px-2 font-medium">Time</th>
            <th className="text-left py-3 px-2 font-medium">Platform</th>
            <th className="text-left py-3 px-2 font-medium">Customer/Store</th>
            <th className="text-left py-3 px-2 font-medium">Product</th>
            <th className="text-right py-3 px-2 font-medium">Qty</th>
            <th className="text-right py-3 px-2 font-medium">Gross</th>
            <th className="text-right py-3 px-2 font-medium">Net</th>
            <th className="text-left py-3 px-2 font-medium">Confidence</th>
          </tr>
        </thead>
        <tbody>
          {storeGroups
            ? Array.from(storeGroups.entries()).map(([storeName, storeRecords]) => {
                const isStoreExpanded = !collapsedStores.has(storeName);
                return (
                  <>{/* Store group */}
                    <StoreGroupHeader
                      key={`group-${storeName}`}
                      storeName={storeName}
                      records={storeRecords}
                      isExpanded={isStoreExpanded}
                      onToggle={() => toggleStore(storeName)}
                    />
                    {isStoreExpanded && storeRecords.map((record) => renderRow(record))}
                  </>
                );
              })
            : filtered.map((record) => renderRow(record))}
        </tbody>
      </table>
    </div>
  );
}
