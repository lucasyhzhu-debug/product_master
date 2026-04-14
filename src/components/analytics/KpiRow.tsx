import { Card } from "@/components/ui/card";
import { ArrowUp, ArrowDown } from "lucide-react";
import { useKpiSummary } from "@/hooks/convex/useAnalytics";
import { formatCurrency } from "@/lib/utils";

function Delta({ pct }: { pct: number | null }) {
  if (pct === null) return <span className="text-xs text-muted-foreground">—</span>;
  const up = pct >= 0;
  const Icon = up ? ArrowUp : ArrowDown;
  return (
    <span className={`flex items-center text-xs ${up ? "text-emerald-500" : "text-red-500"}`}>
      <Icon className="h-3 w-3" />
      {Math.abs(pct).toFixed(1)}%
    </span>
  );
}

function KpiTile({ label, value, delta }: { label: string; value: string; delta: number | null }) {
  return (
    <Card className="p-3">
      <div className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="mt-1 text-lg font-bold">{value}</div>
      <Delta pct={delta} />
    </Card>
  );
}

export function KpiRow() {
  const data = useKpiSummary();
  if (data === undefined) {
    return (
      <div className="grid grid-cols-2 gap-2 md:grid-cols-6">
        {Array.from({ length: 6 }).map((_, i) => (
          <Card key={i} className="h-20 animate-pulse p-3" />
        ))}
      </div>
    );
  }
  const { current, delta } = data;
  return (
    <div className="grid grid-cols-2 gap-2 md:grid-cols-6">
      <KpiTile label="Revenue (net)" value={formatCurrency(current.netRevenue)} delta={delta.netRevenue} />
      <KpiTile label="Units sold" value={current.units.toLocaleString()} delta={delta.units} />
      <KpiTile label="AOV (net)" value={formatCurrency(current.aovNet)} delta={delta.aovNet} />
      <KpiTile label="Rev / unit" value={formatCurrency(current.revPerUnit)} delta={delta.revPerUnit} />
      <KpiTile label="Orders" value={current.orderCount.toLocaleString()} delta={delta.orderCount} />
      <KpiTile label="Units / txn" value={current.unitsPerTxn.toFixed(2)} delta={delta.unitsPerTxn} />
    </div>
  );
}
