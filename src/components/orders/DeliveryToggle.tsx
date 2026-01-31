import { MapPin, Truck } from 'lucide-react';
import { cn } from '@/lib/utils';

interface DeliveryToggleProps {
  value: 'Pickup' | 'Delivery';
  onChange: (value: 'Pickup' | 'Delivery') => void;
}

export function DeliveryToggle({ value, onChange }: DeliveryToggleProps) {
  return (
    <div className="flex rounded-lg border overflow-hidden">
      <button
        type="button"
        onClick={() => onChange('Pickup')}
        className={cn(
          "flex items-center justify-center gap-2 px-4 py-2 flex-1 transition-colors",
          value === 'Pickup'
            ? "bg-primary text-primary-foreground"
            : "bg-muted hover:bg-muted/80"
        )}
      >
        <MapPin className="h-4 w-4" />
        <span>Pickup</span>
      </button>
      <button
        type="button"
        onClick={() => onChange('Delivery')}
        className={cn(
          "flex items-center justify-center gap-2 px-4 py-2 flex-1 transition-colors",
          value === 'Delivery'
            ? "bg-primary text-primary-foreground"
            : "bg-muted hover:bg-muted/80"
        )}
      >
        <Truck className="h-4 w-4" />
        <span>Delivery</span>
      </button>
    </div>
  );
}
