import { Circle, Package } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import type { KitchenStats } from '@/lib/types';

interface KitchenDashboardProps {
  stats: KitchenStats | undefined;
}

export default function KitchenDashboard({ stats }: KitchenDashboardProps) {
  if (stats === undefined) {
    return <KitchenDashboardSkeleton />;
  }

  const bigBallsProgress = stats.big_balls_needed > 0
    ? (stats.big_balls_completed / stats.big_balls_needed) * 100
    : 0;

  const midBallsProgress = stats.mid_balls_needed > 0
    ? (stats.mid_balls_completed / stats.mid_balls_needed) * 100
    : 0;

  const ordersProgress = stats.orders_pending + stats.orders_completed_today > 0
    ? (stats.orders_completed_today / (stats.orders_pending + stats.orders_completed_today)) * 100
    : 0;

  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
      {/* Big Balls Card */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">Big Balls</CardTitle>
          <div className="h-8 w-8 rounded-full bg-red-100 flex items-center justify-center">
            <Circle className="h-4 w-4 text-red-600 fill-red-600" />
          </div>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">Needed</span>
              <span className="text-2xl font-bold">{stats.big_balls_needed}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">Done</span>
              <span className={cn(
                "text-2xl font-bold",
                stats.big_balls_completed >= stats.big_balls_needed && stats.big_balls_needed > 0
                  ? "text-green-600"
                  : ""
              )}>
                {stats.big_balls_completed}
              </span>
            </div>
            {stats.big_balls_needed > 0 && (
              <ProgressBar progress={bigBallsProgress} color="bg-red-500" />
            )}
          </div>
        </CardContent>
      </Card>

      {/* Mid Balls Card */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">Mid Balls</CardTitle>
          <div className="h-8 w-8 rounded-full bg-yellow-100 flex items-center justify-center">
            <Circle className="h-4 w-4 text-yellow-600 fill-yellow-600" />
          </div>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">Needed</span>
              <span className="text-2xl font-bold">{stats.mid_balls_needed}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">Done</span>
              <span className={cn(
                "text-2xl font-bold",
                stats.mid_balls_completed >= stats.mid_balls_needed && stats.mid_balls_needed > 0
                  ? "text-green-600"
                  : ""
              )}>
                {stats.mid_balls_completed}
              </span>
            </div>
            {stats.mid_balls_needed > 0 && (
              <ProgressBar progress={midBallsProgress} color="bg-yellow-500" />
            )}
          </div>
        </CardContent>
      </Card>

      {/* Orders Card */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">Orders</CardTitle>
          <div className="h-8 w-8 rounded-full bg-blue-100 flex items-center justify-center">
            <Package className="h-4 w-4 text-blue-600" />
          </div>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">Pending</span>
              <span className="text-2xl font-bold">{stats.orders_pending}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">Done</span>
              <span className={cn(
                "text-2xl font-bold",
                stats.orders_completed_today > 0 ? "text-green-600" : ""
              )}>
                {stats.orders_completed_today}
              </span>
            </div>
            {(stats.orders_pending + stats.orders_completed_today) > 0 && (
              <ProgressBar progress={ordersProgress} color="bg-blue-500" />
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

interface ProgressBarProps {
  progress: number;
  color: string;
}

function ProgressBar({ progress, color }: ProgressBarProps) {
  return (
    <div className="h-2 bg-muted rounded-full overflow-hidden mt-2">
      <div
        className={cn('h-full rounded-full transition-all duration-300', color)}
        style={{ width: `${Math.min(progress, 100)}%` }}
      />
    </div>
  );
}

function KitchenDashboardSkeleton() {
  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
      {[1, 2, 3].map((i) => (
        <Card key={i}>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <Skeleton className="h-4 w-20" />
            <Skeleton className="h-8 w-8 rounded-full" />
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Skeleton className="h-4 w-12" />
                <Skeleton className="h-8 w-12" />
              </div>
              <div className="flex items-center justify-between">
                <Skeleton className="h-4 w-12" />
                <Skeleton className="h-8 w-12" />
              </div>
              <Skeleton className="h-2 w-full rounded-full mt-2" />
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

export { KitchenDashboardSkeleton };
