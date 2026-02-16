import { cn } from '@/lib/utils';

interface StatCardProps {
  label: string;
  value: string | number;
  subtitle?: string;
  urgency?: 'green' | 'amber' | 'red';
  onClick?: () => void;
  icon?: React.ReactNode;
}

const urgencyStyles = {
  green: {
    text: 'text-emerald-600',
    border: 'border-emerald-300',
  },
  amber: {
    text: 'text-amber-500',
    border: 'border-amber-300',
  },
  red: {
    text: 'text-red-600',
    border: 'border-red-300',
  },
} as const;

export function StatCard({ label, value, subtitle, urgency, onClick, icon }: StatCardProps) {
  const style = urgency ? urgencyStyles[urgency] : null;

  return (
    <div
      className={cn(
        'rounded-lg border px-3 py-2.5 min-h-[60px] flex flex-col justify-center transition-colors',
        style ? `${style.border} bg-card` : 'border-border bg-card',
        onClick && 'cursor-pointer active:scale-[0.98] hover:bg-accent/50'
      )}
      onClick={onClick}
      role={onClick ? 'button' : undefined}
      tabIndex={onClick ? 0 : undefined}
      onKeyDown={onClick ? (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onClick(); } } : undefined}
    >
      <div className="flex items-center justify-between gap-1">
        <span
          className={cn(
            'text-2xl font-bold tabular-nums leading-tight',
            style ? style.text : 'text-foreground'
          )}
        >
          {value}
        </span>
        {icon && <span className="text-muted-foreground">{icon}</span>}
      </div>
      <div className="flex items-baseline gap-1 mt-0.5">
        <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
          {label}
        </span>
        {subtitle && (
          <span className="text-xs text-muted-foreground">{subtitle}</span>
        )}
      </div>
    </div>
  );
}
