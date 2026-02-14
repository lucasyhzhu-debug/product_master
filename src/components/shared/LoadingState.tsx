import { Skeleton } from '@/components/ui/skeleton';
import { TablePageSkeleton, EditorPageSkeleton, DashboardSkeleton } from './skeletons';

export { TablePageSkeleton, EditorPageSkeleton, DashboardSkeleton };

export function LoadingCards({ count = 3 }: { count?: number }) {
  return (
    <div className="flex gap-4">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="w-64 shrink-0">
          <Skeleton className="h-40 w-full rounded-xl" />
        </div>
      ))}
    </div>
  );
}

export function LoadingPage() {
  return <TablePageSkeleton />;
}
