import { Skeleton } from "@/components/ui/skeleton";
import { formatCurrency } from "@/lib/utils";
import { useRevenueItems } from "@/hooks/convex";
import type { Id } from "../../../convex/_generated/dataModel";
import { MatchStatusBadge } from "./MatchStatusBadge";

export function RevenueItemDetails({ revenueId }: { revenueId: Id<"externalRevenue"> }) {
  const { data: items, isLoading } = useRevenueItems(revenueId);

  if (isLoading) {
    return (
      <tr>
        <td colSpan={10} className="py-3 px-2">
          <Skeleton className="h-16 w-full" />
        </td>
      </tr>
    );
  }

  if (!items || items.length === 0) {
    return (
      <tr>
        <td colSpan={10} className="py-3 px-6 text-sm text-muted-foreground">
          No item details available.
        </td>
      </tr>
    );
  }

  return (
    <tr>
      <td colSpan={10} className="p-0">
        <div className="bg-muted/30 px-6 py-3">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b">
                <th className="text-left py-2 px-2 font-medium">Product</th>
                <th className="text-right py-2 px-2 font-medium">Qty</th>
                <th className="text-right py-2 px-2 font-medium">Unit Price</th>
                <th className="text-right py-2 px-2 font-medium">Total</th>
                <th className="text-left py-2 px-2 font-medium">Match</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item) => (
                <tr key={item._id} className="border-b border-muted">
                  <td className="py-2 px-2">
                    {item.menuProductName ? (
                      <span>
                        {item.productName}
                        <span className="text-muted-foreground ml-1">
                          &rarr; {item.menuProductName}
                        </span>
                      </span>
                    ) : (
                      item.productName
                    )}
                  </td>
                  <td className="py-2 px-2 text-right">{item.quantity}</td>
                  <td className="py-2 px-2 text-right">{formatCurrency(item.unitPrice)}</td>
                  <td className="py-2 px-2 text-right font-medium">
                    {formatCurrency(item.totalPrice)}
                  </td>
                  <td className="py-2 px-2">
                    <MatchStatusBadge status={item.matchConfidence} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </td>
    </tr>
  );
}
