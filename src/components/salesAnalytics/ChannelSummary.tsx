import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn, formatCurrency } from "@/lib/utils";
import { getPlatformPalette } from "@/lib/platformColors";
import { GrowthIndicator } from "./GrowthIndicator";
import type { PeriodData } from "./overviewUtils";

export function ChannelSummary({
  currentPeriod,
  previousPeriod,
}: {
  currentPeriod: PeriodData;
  previousPeriod: PeriodData;
}) {
  const channels = currentPeriod.channels ?? [];
  const prevChannels = previousPeriod.channels ?? [];

  const prevChannelMap = new Map(prevChannels.map((p) => [p.source, p]));
  function findPrevChannel(source: string) {
    const prev = prevChannelMap.get(source);
    return prev ? { gross: prev.gross, net: prev.net, transactions: prev.transactions } : { gross: 0, net: 0, transactions: 0 };
  }

  // Build segments: "All Channels" first, then dynamic channels from backend
  const segments: {
    key: string;
    label: string;
    colorClass: string;
    dotClass: string;
    current: { gross: number; net: number; transactions: number; commission: number; promoBurn: number };
    previous: { gross: number; net: number; transactions: number };
  }[] = [
    {
      key: "all",
      label: "All Channels",
      colorClass: "border-t-foreground",
      dotClass: "bg-foreground",
      current: {
        gross: currentPeriod.totalGross,
        net: currentPeriod.totalNet,
        transactions: currentPeriod.totalTransactions,
        commission: currentPeriod.totalCommission,
        promoBurn: currentPeriod.totalPromoBurn,
      },
      previous: {
        gross: previousPeriod.totalGross,
        net: previousPeriod.totalNet,
        transactions: previousPeriod.totalTransactions,
      },
    },
    ...channels.map((ch) => {
      const palette = getPlatformPalette(ch.source);
      return {
        key: ch.source,
        label: ch.displayName,
        colorClass: palette.borderTop,
        dotClass: palette.dot,
        current: { gross: ch.gross, net: ch.net, transactions: ch.transactions, commission: ch.commission, promoBurn: ch.promoBurn },
        previous: findPrevChannel(ch.source),
      };
    }),
  ];

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-sm font-medium">Channel Breakdown</CardTitle>
      </CardHeader>
      <CardContent className="pt-0">
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
          {segments.map((seg) => {
            const aov = seg.current.transactions > 0
              ? seg.current.gross / seg.current.transactions
              : 0;
            const prevAov = seg.previous.transactions > 0
              ? seg.previous.gross / seg.previous.transactions
              : 0;
            const shareOfGross = currentPeriod.totalGross > 0
              ? (seg.current.gross / currentPeriod.totalGross) * 100
              : 0;

            return (
              <div
                key={seg.key}
                className={cn(
                  "border-t-2 rounded-md bg-muted/30 p-3 space-y-2.5",
                  seg.colorClass
                )}
              >
                {/* Channel label */}
                <div className="flex items-center gap-1.5">
                  <span className={cn("h-2 w-2 rounded-full", seg.dotClass)} />
                  <span className="text-xs font-semibold tracking-wide uppercase text-muted-foreground">
                    {seg.label}
                  </span>
                  {seg.key !== "all" && shareOfGross > 0 && (
                    <span className="ml-auto text-[10px] text-muted-foreground">
                      {shareOfGross.toFixed(0)}%
                    </span>
                  )}
                </div>

                {/* Gross Sales */}
                <div>
                  <div className="flex items-baseline justify-between">
                    <span className="text-lg font-bold tabular-nums">
                      {formatCurrency(seg.current.gross)}
                    </span>
                    <GrowthIndicator current={seg.current.gross} previous={seg.previous.gross} />
                  </div>
                  <p className="text-[10px] text-muted-foreground uppercase tracking-wide">Gross</p>
                </div>

                {/* Connector line */}
                <div className="border-l border-dashed border-muted-foreground/30 ml-1 pl-2.5 space-y-2">
                  {/* Promo Discount (only for channels with promo data) */}
                  {seg.current.promoBurn > 0 && (
                    <div className="text-xs text-orange-600 dark:text-orange-400">
                      <span className="tabular-nums">-{formatCurrency(seg.current.promoBurn)}</span>
                      <span className="text-[10px] text-muted-foreground ml-1">Promo Discount</span>
                    </div>
                  )}

                  {/* Net Sales */}
                  <div>
                    <div className="flex items-baseline justify-between">
                      <span className="text-sm font-semibold tabular-nums">
                        {formatCurrency(seg.current.net)}
                        {seg.current.gross > 0 && (
                          <span className="text-sm font-normal text-muted-foreground ml-1">
                            ({((seg.current.net / seg.current.gross) * 100).toFixed(0)}%)
                          </span>
                        )}
                      </span>
                      <GrowthIndicator current={seg.current.net} previous={seg.previous.net} />
                    </div>
                    <p className="text-[10px] text-muted-foreground">Net</p>
                  </div>

                  {/* Transactions */}
                  <div>
                    <div className="flex items-baseline justify-between">
                      <span className="text-sm font-semibold tabular-nums">
                        {seg.current.transactions}
                      </span>
                      <GrowthIndicator current={seg.current.transactions} previous={seg.previous.transactions} />
                    </div>
                    <p className="text-[10px] text-muted-foreground">Transactions</p>
                  </div>

                  {/* AOV */}
                  <div>
                    <div className="flex items-baseline justify-between">
                      <span className="text-sm font-semibold tabular-nums">
                        {formatCurrency(aov)}
                      </span>
                      <GrowthIndicator current={aov} previous={prevAov} />
                    </div>
                    <p className="text-[10px] text-muted-foreground">AOV</p>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}
