import { useQuery } from '@tanstack/react-query';
import { dashboardApi } from '@/lib/api';

export const orderStatsKeys = {
  all: ['orderStats'] as const,
  stats: () => [...orderStatsKeys.all, 'stats'] as const,
};

export function useOrderStats() {
  return useQuery({
    queryKey: orderStatsKeys.stats(),
    queryFn: () => dashboardApi.getOrderStats(),
    refetchInterval: 60000, // Refresh every minute
    staleTime: 30000, // Consider stale after 30 seconds
  });
}
