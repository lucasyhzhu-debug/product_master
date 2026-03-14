/**
 * Fraud Flags Card (XANL-06 + FRAUD-06/07/08)
 *
 * Shows active fraud detection alerts: split detection, approver concentration,
 * and unfamiliar vendor flags.
 */
import { AlertTriangle, Users, HelpCircle } from "lucide-react";
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { formatCurrency } from "@/lib/utils";
import type { FraudFlagsData } from "@/hooks/convex/useExpenseAnalytics";

interface FraudFlagsCardProps {
  data: FraudFlagsData | undefined;
}

export function FraudFlagsCard({ data }: FraudFlagsCardProps) {
  const totalFlags = data
    ? data.splits.length + data.concentrations.length + data.unfamiliarVendors.length
    : 0;

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-sm font-medium flex items-center gap-1.5">
              <AlertTriangle className="h-4 w-4 text-amber-500" />
              Fraud Flags
            </CardTitle>
            <CardDescription>Automated anomaly detection</CardDescription>
          </div>
          {data !== undefined && totalFlags > 0 && (
            <Badge variant="destructive" className="text-xs">
              {totalFlags}
            </Badge>
          )}
        </div>
      </CardHeader>
      <CardContent>
        {data === undefined ? (
          <div className="space-y-3">
            <Skeleton className="h-8 w-full" />
            <Skeleton className="h-8 w-full" />
            <Skeleton className="h-8 w-[80%]" />
          </div>
        ) : totalFlags === 0 ? (
          <div className="flex items-center gap-2 py-4 text-sm text-green-600 dark:text-green-400">
            <span className="h-2 w-2 rounded-full bg-green-500" />
            No active flags
          </div>
        ) : (
          <div className="space-y-4">
            {/* Split Detection (FRAUD-06) */}
            {data.splits.length > 0 && (
              <div>
                <div className="flex items-center gap-1.5 mb-2">
                  <AlertTriangle className="h-3.5 w-3.5 text-amber-500" />
                  <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    Split Detection
                  </span>
                  <Badge variant="outline" className="text-xs ml-auto">
                    {data.splits.length}
                  </Badge>
                </div>
                <div className="space-y-2">
                  {data.splits.map((flag, i) => (
                    <div
                      key={i}
                      className="text-sm rounded-md bg-amber-50 dark:bg-amber-950/20 p-2"
                    >
                      <p className="font-medium">{flag.employeeName}</p>
                      <p className="text-xs text-muted-foreground">
                        {flag.expenseIds.length} expenses totaling{" "}
                        <span className="font-medium tabular-nums">
                          {formatCurrency(flag.totalAmount)}
                        </span>
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Approver Concentration (FRAUD-07) */}
            {data.concentrations.length > 0 && (
              <div>
                <div className="flex items-center gap-1.5 mb-2">
                  <Users className="h-3.5 w-3.5 text-orange-500" />
                  <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    Approver Concentration
                  </span>
                  <Badge variant="outline" className="text-xs ml-auto">
                    {data.concentrations.length}
                  </Badge>
                </div>
                <div className="space-y-2">
                  {data.concentrations.map((flag, i) => (
                    <div
                      key={i}
                      className="text-sm rounded-md bg-orange-50 dark:bg-orange-950/20 p-2"
                    >
                      <p className="font-medium">{flag.employeeName}</p>
                      <p className="text-xs text-muted-foreground">
                        {flag.approverName} approved {flag.count}/{flag.totalCount} (
                        {flag.percent.toFixed(0)}%)
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Unfamiliar Vendor (FRAUD-08) */}
            {data.unfamiliarVendors.length > 0 && (
              <div>
                <div className="flex items-center gap-1.5 mb-2">
                  <HelpCircle className="h-3.5 w-3.5 text-purple-500" />
                  <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    Unfamiliar Vendors
                  </span>
                  <Badge variant="outline" className="text-xs ml-auto">
                    {data.unfamiliarVendors.length}
                  </Badge>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {data.unfamiliarVendors.map((vendor) => (
                    <Badge
                      key={vendor}
                      variant="secondary"
                      className="text-xs"
                    >
                      {vendor}
                    </Badge>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
