import { ChevronDown, ChevronRight } from "lucide-react";
import { formatCurrency } from "@/lib/utils";
import type { RevenueRecord } from "./overviewUtils";

export function StoreGroupHeader({
  storeName,
  records,
  isExpanded,
  onToggle,
}: {
  storeName: string;
  records: RevenueRecord[];
  isExpanded: boolean;
  onToggle: () => void;
}) {
  const totalGross = records.reduce((sum, r) => sum + (r.revenueGross ?? 0), 0);
  const txnCount = records.length;

  return (
    <tr
      className="border-b bg-muted/20 cursor-pointer hover:bg-muted/40"
      onClick={onToggle}
    >
      <td className="py-2 px-1">
        {isExpanded
          ? <ChevronDown className="h-4 w-4 text-muted-foreground" />
          : <ChevronRight className="h-4 w-4 text-muted-foreground" />}
      </td>
      <td colSpan={6} className="py-2 px-2 font-medium text-sm">
        {storeName}
        <span className="text-xs text-muted-foreground ml-2">
          ({txnCount} transaction{txnCount !== 1 ? "s" : ""})
        </span>
      </td>
      <td className="py-2 px-2 text-right font-medium text-sm">
        {formatCurrency(totalGross)}
      </td>
      <td colSpan={2}></td>
    </tr>
  );
}
