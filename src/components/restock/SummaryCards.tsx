import { Card, CardContent } from "@/components/ui/card";
import { Store, AlertTriangle, TrendingUp } from "lucide-react";

interface SummaryCardsProps {
  activeChannels: number;
  lowStockAlerts: number;
  totalDailyDemand: number;
}

export function SummaryCards({ activeChannels, lowStockAlerts, totalDailyDemand }: SummaryCardsProps) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
      <Card>
        <CardContent className="pt-6">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-blue-500/10">
              <Store className="h-5 w-5 text-blue-600 dark:text-blue-400" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Active Channels</p>
              <p className="text-2xl font-bold">{activeChannels}</p>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="pt-6">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-amber-500/10">
              <AlertTriangle className="h-5 w-5 text-amber-600 dark:text-amber-400" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Low Stock Alerts</p>
              <p className="text-2xl font-bold">{lowStockAlerts}</p>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="pt-6">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-green-500/10">
              <TrendingUp className="h-5 w-5 text-green-600 dark:text-green-400" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Total Daily Demand</p>
              <p className="text-2xl font-bold">{Math.round(totalDailyDemand)} units</p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
