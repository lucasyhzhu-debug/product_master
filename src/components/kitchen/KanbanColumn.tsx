import { cn } from '@/lib/utils';

interface KanbanColumnProps {
  title: string;
  subtitle: string;
  count: number;
  color: 'amber' | 'blue' | 'emerald' | 'slate';
  icon: React.ReactNode;
  footer?: React.ReactNode;
  children: React.ReactNode;
}

const colorStyles = {
  amber: {
    header: 'bg-amber-900/50 border-amber-800',
    count: 'bg-amber-600 text-white',
    accent: 'text-amber-400',
  },
  blue: {
    header: 'bg-blue-900/50 border-blue-800',
    count: 'bg-blue-600 text-white',
    accent: 'text-blue-400',
  },
  emerald: {
    header: 'bg-emerald-900/50 border-emerald-800',
    count: 'bg-emerald-600 text-white',
    accent: 'text-emerald-400',
  },
  slate: {
    header: 'bg-slate-800 border-slate-700',
    count: 'bg-slate-600 text-white',
    accent: 'text-slate-400',
  },
};

export function KanbanColumn({ title, subtitle, count, color, icon, footer, children }: KanbanColumnProps) {
  const styles = colorStyles[color];

  return (
    <div className="flex flex-col bg-slate-800/50 rounded-2xl border border-slate-700 overflow-hidden">
      {/* Header */}
      <div className={cn('px-4 py-3 border-b', styles.header)}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className={styles.accent}>{icon}</span>
            <div>
              <h2 className="font-semibold text-white">{title}</h2>
              <p className="text-xs text-slate-400">{subtitle}</p>
            </div>
          </div>
          <span className={cn('px-2.5 py-1 rounded-full text-sm font-bold', styles.count)}>
            {count}
          </span>
        </div>
      </div>

      {/* Scrollable Content */}
      <div className="flex-1 p-3 overflow-y-auto">
        {children}
      </div>

      {/* Footer */}
      {footer}
    </div>
  );
}
