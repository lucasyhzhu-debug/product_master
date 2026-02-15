import { useState } from 'react';
import { addDays, startOfDay, format, isToday, isTomorrow } from 'date-fns';
import { CalendarDays } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface DueDatePillsProps {
  value: number | undefined;
  onChange: (timestamp: number) => void;
}

function getDayLabel(date: Date): string {
  if (isToday(date)) return 'Today';
  if (isTomorrow(date)) return 'Tomorrow';
  return format(date, 'EEE'); // Mon, Tue, etc.
}

export function DueDatePills({ value, onChange }: DueDatePillsProps) {
  const [showManual, setShowManual] = useState(false);

  const today = startOfDay(new Date());
  const pills = Array.from({ length: 7 }, (_, i) => {
    const date = addDays(today, i);
    return {
      date,
      timestamp: date.getTime(),
      label: getDayLabel(date),
      dateStr: format(date, 'MMM d'), // e.g. "Feb 17"
    };
  });

  const selectedTimestamp = value ? startOfDay(new Date(value)).getTime() : undefined;

  return (
    <div className="space-y-3">
      {/* Scrollable pill row */}
      <div className="flex gap-2 overflow-x-auto pb-1 -mx-1 px-1">
        {pills.map((pill) => {
          const isSelected = selectedTimestamp === pill.timestamp;
          return (
            <Button
              key={pill.timestamp}
              variant={isSelected ? 'default' : 'outline'}
              className="flex flex-col items-center gap-0.5 min-w-[72px] h-auto py-2 px-3 shrink-0"
              onClick={() => onChange(pill.timestamp)}
            >
              <span className="text-xs font-bold leading-tight">{pill.label}</span>
              <span className="text-[10px] leading-tight opacity-80">{pill.dateStr}</span>
            </Button>
          );
        })}
      </div>

      {/* Manual date picker fallback */}
      {showManual ? (
        <input
          type="date"
          className="block w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
          value={value ? format(new Date(value), 'yyyy-MM-dd') : ''}
          onChange={(e) => {
            if (e.target.value) {
              const date = startOfDay(new Date(e.target.value + 'T00:00:00'));
              onChange(date.getTime());
            }
          }}
          min={format(today, 'yyyy-MM-dd')}
        />
      ) : (
        <Button
          variant="link"
          size="sm"
          className="h-auto p-0 text-xs"
          onClick={() => setShowManual(true)}
        >
          <CalendarDays className="h-3 w-3 mr-1" />
          Pick a date
        </Button>
      )}
    </div>
  );
}
