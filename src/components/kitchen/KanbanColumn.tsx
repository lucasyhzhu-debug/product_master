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
    header: 'bg-orange-50 border-orange-200',
    count: 'bg-orange-600 text-white',
    title: 'text-orange-900',
    subtitle: 'text-orange-700',
  },
  blue: {
    header: 'bg-blue-50 border-blue-200',
    count: 'bg-blue-600 text-white',
    title: 'text-blue-900',
    subtitle: 'text-blue-700',
  },
  green: {
    header: 'bg-green-50 border-green-200',
    count: 'bg-green-600 text-white',
    title: 'text-green-900',
    subtitle: 'text-green-700',
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
      <div className="flex-1 p-3 overflow-y-auto bg-gray-50">
        {children}
      </div>

      {/* Footer */}
      {footer}
    </div>
  );
}
