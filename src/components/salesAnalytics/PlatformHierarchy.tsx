import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { ChevronDown, ChevronRight } from "lucide-react";
import { cn, formatCurrency } from "@/lib/utils";
import { getPlatformPalette } from "@/lib/platformColors";
import { useRevenueByOutlet, type PeriodPreset } from "@/hooks/convex";

export function PlatformHierarchy({ preset }: { preset: PeriodPreset }) {
  const { data, isLoading, refresh: refreshByOutlet } = useRevenueByOutlet(preset);
  void refreshByOutlet; // available for sync handlers if needed
  const [expandedPlatform, setExpandedPlatform] = useState<string | null>(null);

  if (isLoading || !data) {
    return (
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-medium">Platform &amp; Outlet Breakdown</CardTitle>
        </CardHeader>
        <CardContent>
          <Skeleton className="h-24 w-full" />
        </CardContent>
      </Card>
    );
  }

  if (data.length === 0) {
    return null;
  }


  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-sm font-medium">Platform &amp; Outlet Breakdown</CardTitle>
      </CardHeader>
      <CardContent className="pt-0 space-y-1">
        {data.map((platform) => {
          const palette = getPlatformPalette(platform.platform);
          const colors = { border: palette.borderLeft, dot: palette.dot, bg: palette.hoverBg };
          const isExpanded = expandedPlatform === platform.platform;
          const hasOutlets = platform.outlets.length > 1 || (platform.outlets.length === 1 && platform.outlets[0].outletId !== null);

          return (
            <div key={platform.platform} className={cn("border-l-4 rounded-r-md", colors.border)}>
              <div
                className={cn(
                  "flex items-center justify-between py-3 px-4 rounded-r-md cursor-pointer transition-colors",
                  colors.bg
                )}
                onClick={() => setExpandedPlatform(isExpanded ? null : platform.platform)}
              >
                <div className="flex items-center gap-2">
                  {hasOutlets ? (
                    isExpanded ? <ChevronDown className="h-4 w-4 text-muted-foreground" /> : <ChevronRight className="h-4 w-4 text-muted-foreground" />
                  ) : (
                    <span className="w-4" />
                  )}
                  <span className={cn("h-2 w-2 rounded-full", colors.dot)} />
                  <span className="font-medium text-sm">{platform.platformName}</span>
                  <span className="text-xs text-muted-foreground">
                    ({platform.totals.transactions} txn{platform.totals.transactions !== 1 ? "s" : ""})
                  </span>
                </div>
                <div className="flex items-center gap-6 text-sm">
                  <div className="text-right">
                    <span className="font-semibold tabular-nums">{formatCurrency(platform.totals.gross)}</span>
                    <span className="text-xs text-muted-foreground ml-1">gross</span>
                  </div>
                  <div className="text-right">
                    <span className="font-semibold tabular-nums">{formatCurrency(platform.totals.net)}</span>
                    <span className="text-xs text-muted-foreground ml-1">net</span>
                  </div>
                </div>
              </div>
              {isExpanded && hasOutlets && (
                <div className="pb-2 px-4 space-y-0.5">
                  {platform.outlets
                    .sort((a, b) => b.gross - a.gross)
                    .map((outlet, idx) => (
                    <div
                      key={outlet.outletId ?? `direct-${idx}`}
                      className="flex items-center justify-between py-2 px-4 text-sm rounded-md hover:bg-muted/50"
                    >
                      <div className="flex items-center gap-2">
                        <span className="text-muted-foreground">{outlet.name}</span>
                        <span className="text-xs text-muted-foreground">
                          ({outlet.transactions} txn{outlet.transactions !== 1 ? "s" : ""})
                        </span>
                      </div>
                      <div className="flex items-center gap-6">
                        <div className="text-right">
                          <span className="tabular-nums">{formatCurrency(outlet.gross)}</span>
                        </div>
                        <div className="text-right text-muted-foreground">
                          <span className="tabular-nums">{formatCurrency(outlet.net)}</span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}
