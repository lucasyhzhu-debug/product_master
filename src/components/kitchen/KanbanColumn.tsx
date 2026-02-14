import { cn } from '@/lib/utils';

interface KanbanColumnProps {
  title: string;
  subtitle: string;
  count: number;
  color: 'orange' | 'blue' | 'green';
  icon: React.ReactNode;
  footer?: React.ReactNode;
  children: React.ReactNode;
}

const colorStyles = {
  orange: {
    header: 'bg-[var(--color-station-boxing-light)] border-[var(--color-station-boxing)]/20',
    count: 'bg-[var(--color-station-boxing)] text-white',
    title: 'text-[var(--color-station-boxing-accent)]',
    subtitle: 'text-[var(--color-station-boxing)]',
  },
  blue: {
    header: 'bg-[var(--color-status-info-bg)] border-[var(--color-status-info)]/20',
    count: 'bg-[var(--color-status-info)] text-white',
    title: 'text-[var(--color-status-info)]',
    subtitle: 'text-[var(--color-status-info)]',
  },
  green: {
    header: 'bg-[var(--color-kitchen-success-bg)] border-[var(--color-kitchen-success)]/20',
    count: 'bg-[var(--color-kitchen-success)] text-white',
    title: 'text-[var(--color-kitchen-success)]',
    subtitle: 'text-[var(--color-kitchen-success)]',
  },
};

export function KanbanColumn({ title, subtitle, count, color, icon, footer, children }: KanbanColumnProps) {
  const styles = colorStyles[color];

  return (
    <div className="flex flex-col bg-card rounded-lg border-2 border-border overflow-hidden shadow-sm min-h-[600px]">
      {/* Header */}
      <div className={cn('px-4 py-3 border-b-2', styles.header)}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <span className={styles.title}>{icon}</span>
            <div>
              <h2 className={cn('font-bold text-base', styles.title)}>{title}</h2>
              <p className={cn('text-xs mt-0.5', styles.subtitle)}>{subtitle}</p>
            </div>
          </div>
          <span className={cn('px-3 py-1.5 rounded-full text-base font-bold min-w-[2.5rem] text-center', styles.count)}>
            {count}
          </span>
        </div>
      </div>

      {/* Scrollable Content */}
      <div className="flex-1 p-3 overflow-y-auto bg-muted">
        {children}
      </div>

      {/* Footer */}
      {footer}
    </div>
  );
}
