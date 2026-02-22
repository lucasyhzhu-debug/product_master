import { MapPin } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface QuickAddressButtonsProps {
  onSelect: (address: string) => void;
}

const LOCATIONS = [
  { name: 'Crystal', address: 'Pick up: Crystal' },
  { name: 'Goldfinch', address: 'Pick up: Legato Gelato - Goldfinch' },
] as const;

export function QuickAddressButtons({ onSelect }: QuickAddressButtonsProps) {
  return (
    <div className="flex gap-2">
      {LOCATIONS.map((loc) => (
        <Button
          key={loc.name}
          variant="outline"
          size="sm"
          className="gap-1.5"
          onClick={() => onSelect(loc.address)}
        >
          <MapPin className="h-3.5 w-3.5" />
          {loc.name}
        </Button>
      ))}
    </div>
  );
}
