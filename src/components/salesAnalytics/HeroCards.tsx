import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { DollarSign, TrendingUp, Percent, TagIcon, Truck, CircleDot, Receipt, ShoppingCart } from "lucide-react";
import { formatCurrency } from "@/lib/utils";
import { GrowthIndicator } from "./GrowthIndicator";
import type { PeriodData } from "./overviewUtils";
import type { LifetimeTotals } from "@/hooks/convex/useExternalData";

export function HeroCards({
  currentPeriod,
  previousPeriod,
  lifetime,
}: {
  currentPeriod: PeriodData;
  previousPeriod: PeriodData;
  lifetime?: LifetimeTotals;
}) {
  return (
    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">Gross Sales</CardTitle>
          <DollarSign className="h-4 w-4 text-muted-foreground" />
        </CardHeader>
        <CardContent>
          <div className="flex items-baseline gap-2">
            <div className="text-2xl font-bold">
              {formatCurrency(currentPeriod.totalGross)}
            </div>
            <GrowthIndicator current={currentPeriod.totalGross} previous={previousPeriod.totalGross} />
          </div>
          <p className="text-xs text-muted-foreground">
            {currentPeriod.periodLabel} {currentPeriod.comparisonLabel}
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">Net Sales</CardTitle>
          <TrendingUp className="h-4 w-4 text-muted-foreground" />
        </CardHeader>
        <CardContent>
          <div className="flex items-baseline gap-2">
            <div className="text-2xl font-bold">
              {formatCurrency(currentPeriod.totalNet)}
            </div>
            <GrowthIndicator current={currentPeriod.totalNet} previous={previousPeriod.totalNet} />
          </div>
          <p className="text-xs text-muted-foreground">
            {currentPeriod.periodLabel} {currentPeriod.comparisonLabel}
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">Commissions Paid</CardTitle>
          <Percent className="h-4 w-4 text-muted-foreground" />
        </CardHeader>
        <CardContent>
          <div className="flex items-baseline gap-2">
            <div className="text-2xl font-bold text-red-600 dark:text-red-400">
              -{formatCurrency(currentPeriod.totalCommission ?? 0)}
            </div>
            <GrowthIndicator
              current={currentPeriod.totalCommission ?? 0}
              previous={previousPeriod.totalCommission ?? 0}
              invertColor
            />
          </div>
          <p className="text-xs text-muted-foreground">
            {(currentPeriod.platformGross ?? 0) > 0
              ? `${(((currentPeriod.totalCommission ?? 0) / currentPeriod.platformGross!) * 100).toFixed(1)}% of platform sales`
              : currentPeriod.periodLabel}
          </p>
          {(currentPeriod.totalAdBurn ?? 0) > 0 && (
            <p className="text-xs text-muted-foreground mt-1">
              Ad burn: {formatCurrency(currentPeriod.totalAdBurn ?? 0)}
            </p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">Discounts Given</CardTitle>
          <TagIcon className="h-4 w-4 text-muted-foreground" />
        </CardHeader>
        <CardContent>
          <div className="flex items-baseline gap-2">
            <div className="text-2xl font-bold text-red-600 dark:text-red-400">
              -{formatCurrency(currentPeriod.totalDiscounts ?? 0)}
            </div>
            <GrowthIndicator
              current={currentPeriod.totalDiscounts ?? 0}
              previous={previousPeriod.totalDiscounts ?? 0}
              invertColor
            />
          </div>
          <p className="text-xs text-muted-foreground">
            {(currentPeriod.totalGross ?? 0) > 0
              ? `${(((currentPeriod.totalDiscounts ?? 0) / currentPeriod.totalGross) * 100).toFixed(1)}% of gross sales`
              : currentPeriod.periodLabel}
          </p>
          {(currentPeriod.totalPromoBurn ?? 0) > 0 && (
            <p className="text-xs text-muted-foreground mt-1">
              Promo burn: {formatCurrency(currentPeriod.totalPromoBurn ?? 0)}
            </p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">Delivery Fees</CardTitle>
          <Truck className="h-4 w-4 text-muted-foreground" />
        </CardHeader>
        <CardContent>
          <div className="flex items-baseline gap-2">
            <div className="text-2xl font-bold text-muted-foreground">
              {formatCurrency(currentPeriod.totalDeliveryFees ?? 0)}
            </div>
            <GrowthIndicator
              current={currentPeriod.totalDeliveryFees ?? 0}
              previous={previousPeriod.totalDeliveryFees ?? 0}
            />
          </div>
          <p className="text-xs text-muted-foreground">
            Pass-through. Not included in Net Sales.
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">Pieces Sold</CardTitle>
          <CircleDot className="h-4 w-4 text-muted-foreground" />
        </CardHeader>
        <CardContent>
          <div className="flex items-baseline gap-2">
            <div className="text-2xl font-bold">
              {(currentPeriod.totalPiecesSold ?? 0).toLocaleString()}
            </div>
            <GrowthIndicator
              current={currentPeriod.totalPiecesSold ?? 0}
              previous={previousPeriod.totalPiecesSold ?? 0}
            />
          </div>
          <p className="text-xs text-muted-foreground">
            {currentPeriod.periodLabel} {currentPeriod.comparisonLabel}
          </p>
        </CardContent>
      </Card>

      {/* Lifetime metrics — always show all-time data regardless of period filter */}
      {lifetime && (
        <>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Balls Sold</CardTitle>
              <CircleDot className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {lifetime.totalBalls.toLocaleString()}
              </div>
              <p className="text-xs text-muted-foreground">
                Est. at {formatCurrency(lifetime.avgRevenuePerBall)}/ball
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Lifetime Revenue</CardTitle>
              <Receipt className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {formatCurrency(lifetime.lifetimeRevenue)}
              </div>
              <p className="text-xs text-muted-foreground">
                All time
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Lifetime Transactions</CardTitle>
              <ShoppingCart className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {lifetime.lifetimeTransactions.toLocaleString()}
              </div>
              <p className="text-xs text-muted-foreground">
                All time
              </p>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
