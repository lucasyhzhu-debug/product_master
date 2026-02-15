import { Link } from 'react-router-dom';
import {
  DollarSign,
  AlertCircle,
  Factory,
  TrendingUp,
  ArrowUp,
  ArrowDown,
  Clock,
  Calendar,
  AlertTriangle,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import type { OrderStats } from '@/lib/types';

interface OrderStatsCardsProps {
  stats: OrderStats;
}

function formatCurrency(value: number): string {
  if (value >= 1_000_000) {
    return `Rp ${(value / 1_000_000).toFixed(1)}M`;
  }
  if (value >= 1_000) {
    return `Rp ${(value / 1_000).toFixed(0)}K`;
  }
  return `Rp ${value.toLocaleString('id-ID')}`;
}

function formatFullCurrency(value: number): string {
  return `Rp ${value.toLocaleString('id-ID')}`;
}

export function OrderStatsCards({ stats }: OrderStatsCardsProps) {
  const { today, yesterday, needs_attention, pipeline } = stats;

  // Calculate revenue change percentage
  const revenueChange =
    yesterday.revenue > 0
      ? ((today.revenue - yesterday.revenue) / yesterday.revenue) * 100
      : today.revenue > 0
      ? 100
      : 0;

  // Total pipeline orders
  const totalPipeline =
    pipeline.payment_received +
    pipeline.being_prepared +
    pipeline.awaiting_delivery;

  // Total attention items
  const totalAttention =
    needs_attention.overdue +
    needs_attention.awaiting_payment_long +
    needs_attention.due_today;

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
      {/* Today's Revenue Card */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">Today's Revenue</CardTitle>
          <DollarSign className="h-4 w-4 text-muted-foreground" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold">{formatCurrency(today.revenue)}</div>
          <p className="text-xs text-muted-foreground">
            from {today.order_count} order{today.order_count !== 1 ? 's' : ''}
          </p>
          {yesterday.revenue > 0 && (
            <div
              className={cn(
                'flex items-center text-xs mt-2',
                revenueChange >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'
              )}
            >
              {revenueChange >= 0 ? (
                <ArrowUp className="h-3 w-3 mr-1" />
              ) : (
                <ArrowDown className="h-3 w-3 mr-1" />
              )}
              {Math.abs(revenueChange).toFixed(0)}% vs yesterday
            </div>
          )}
        </CardContent>
      </Card>

      {/* Needs Attention Card */}
      <Card className={cn(totalAttention > 0 && 'border-amber-300 dark:border-amber-700 bg-amber-50/50 dark:bg-amber-950/30')}>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">Needs Attention</CardTitle>
          <AlertCircle
            className={cn(
              'h-4 w-4',
              totalAttention > 0 ? 'text-amber-600 dark:text-amber-400' : 'text-muted-foreground'
            )}
          />
        </CardHeader>
        <CardContent>
          {totalAttention === 0 ? (
            <div className="text-2xl font-bold text-green-600 dark:text-green-400">All Good</div>
          ) : (
            <div className="space-y-2">
              {needs_attention.overdue > 0 && (
                <Link
                  to="/orders?filter=overdue"
                  className="flex items-center gap-2 hover:opacity-80"
                >
                  <Badge variant="destructive" className="gap-1">
                    <AlertTriangle className="h-3 w-3" />
                    {needs_attention.overdue} overdue
                  </Badge>
                </Link>
              )}
              {needs_attention.awaiting_payment_long > 0 && (
                <Link
                  to="/orders?status=AwaitingPayment"
                  className="flex items-center gap-2 hover:opacity-80"
                >
                  <Badge variant="outline" className="gap-1 border-amber-500 dark:border-amber-600 text-amber-700 dark:text-amber-400">
                    <Clock className="h-3 w-3" />
                    {needs_attention.awaiting_payment_long} payment &gt;24h
                  </Badge>
                </Link>
              )}
              {needs_attention.due_today > 0 && (
                <Link
                  to="/orders?filter=due_today"
                  className="flex items-center gap-2 hover:opacity-80"
                >
                  <Badge variant="outline" className="gap-1 border-blue-500 dark:border-blue-600 text-blue-700 dark:text-blue-400">
                    <Calendar className="h-3 w-3" />
                    {needs_attention.due_today} due today
                  </Badge>
                </Link>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Production Pipeline Card */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">Production Pipeline</CardTitle>
          <Factory className="h-4 w-4 text-muted-foreground" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold">{totalPipeline} orders</div>
          <div className="mt-3 space-y-2">
            <PipelineBar label="Paid" count={pipeline.payment_received} color="bg-blue-500" total={totalPipeline} />
            <PipelineBar label="Preparing" count={pipeline.being_prepared} color="bg-purple-500" total={totalPipeline} />
            <PipelineBar label="Ready" count={pipeline.awaiting_delivery} color="bg-green-500" total={totalPipeline} />
          </div>
        </CardContent>
      </Card>

      {/* Today's Margin Card */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">Today's Margin</CardTitle>
          <TrendingUp className="h-4 w-4 text-muted-foreground" />
        </CardHeader>
        <CardContent>
          <div
            className={cn(
              'text-2xl font-bold',
              today.margin_pct >= 30
                ? 'text-green-600 dark:text-green-400'
                : today.margin_pct >= 20
                ? 'text-amber-600 dark:text-amber-400'
                : 'text-red-600 dark:text-red-400'
            )}
          >
            {today.margin_pct.toFixed(0)}%
          </div>
          <p className="text-xs text-muted-foreground">
            {formatFullCurrency(today.margin)} profit
          </p>
          <div className="text-xs text-muted-foreground mt-2">
            Avg order: {formatCurrency(today.avg_order_value)}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

interface PipelineBarProps {
  label: string;
  count: number;
  color: string;
  total: number;
}

function PipelineBar({ label, count, color, total }: PipelineBarProps) {
  const percentage = total > 0 ? (count / total) * 100 : 0;

  return (
    <div className="flex items-center gap-2 text-xs">
      <span className="w-20 text-muted-foreground truncate">{label}</span>
      <div className="flex-1 h-2 bg-muted rounded-full overflow-hidden">
        <div className={cn('h-full rounded-full', color)} style={{ width: `${percentage}%` }} />
      </div>
      <span className="w-6 text-right font-medium">{count}</span>
    </div>
  );
}

export function OrderStatsCardsSkeleton() {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
      {[1, 2, 3, 4].map((i) => (
        <Card key={i}>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <div className="h-4 w-24 bg-muted animate-pulse rounded" />
            <div className="h-4 w-4 bg-muted animate-pulse rounded" />
          </CardHeader>
          <CardContent>
            <div className="h-8 w-32 bg-muted animate-pulse rounded mb-2" />
            <div className="h-4 w-20 bg-muted animate-pulse rounded" />
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
