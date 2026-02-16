import { cn } from '@/lib/utils';

interface DueDateGroupHeaderProps {
  label: string;
  orderCount: number;
  isOverdue: boolean;
}

export function DueDateGroupHeader({ label, orderCount, isOverdue }: DueDateGroupHeaderProps) {
  return (
    <div
      className={cn(
        'sticky top-0 z-10 px-4 py-2 text-sm font-semibold rounded-md mb-2',
        isOverdue
          ? 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400 font-bold border border-red-300 dark:border-red-700'
          : 'bg-muted text-muted-foreground'
      )}
    >
      {label} ({orderCount})
    </div>
  );
}
