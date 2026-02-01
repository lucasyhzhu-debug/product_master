import { useEffect, useState } from 'react';
import { Package, ChevronDown } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { cn } from '@/lib/utils';

const ALL_COURIERS = [
  'Gojek',
  'GrabSend',
  'JNE',
  'J&T',
  'SiCepat',
  'AnterAja',
  'Paxel',
  'Lalamove',
];

const STORAGE_KEY = 'frollie_recent_couriers';
const MAX_RECENT = 4;

function getRecentCouriers(): string[] {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      const parsed = JSON.parse(stored);
      if (Array.isArray(parsed)) {
        return parsed.slice(0, MAX_RECENT);
      }
    }
  } catch {
    // Ignore parse errors
  }
  // Default to first 4 couriers if nothing stored
  return ALL_COURIERS.slice(0, MAX_RECENT);
}

function addRecentCourier(courier: string): void {
  if (!courier || courier === 'Other') return;

  try {
    const recent = getRecentCouriers();
    // Remove if already exists
    const filtered = recent.filter((c) => c !== courier);
    // Add to front
    const updated = [courier, ...filtered].slice(0, MAX_RECENT);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
  } catch {
    // Ignore storage errors
  }
}

interface ShippingPanelProps {
  shippingAgency: string | undefined;
  shippingNumber: string | undefined;
  onSave: (agency: string | undefined, number: string | undefined) => void;
}

export function ShippingPanel({
  shippingAgency,
  shippingNumber,
  onSave,
}: ShippingPanelProps) {
  const [recentCouriers, setRecentCouriers] = useState<string[]>(getRecentCouriers);
  const [localAgency, setLocalAgency] = useState(shippingAgency || '');
  const [localNumber, setLocalNumber] = useState(shippingNumber || '');
  const [showCustomInput, setShowCustomInput] = useState(false);

  // Get remaining couriers not in recent
  const otherCouriers = ALL_COURIERS.filter((c) => !recentCouriers.includes(c));

  // Sync local state when props change
  useEffect(() => {
    setLocalAgency(shippingAgency || '');
    setLocalNumber(shippingNumber || '');
  }, [shippingAgency, shippingNumber]);

  const handleCourierSelect = (courier: string) => {
    if (courier === 'Other') {
      setShowCustomInput(true);
      setLocalAgency('');
    } else {
      setShowCustomInput(false);
      setLocalAgency(courier);
      addRecentCourier(courier);
      setRecentCouriers(getRecentCouriers());
      // Auto-save agency selection
      onSave(courier, localNumber || undefined);
    }
  };

  const handleCustomAgencyChange = (value: string) => {
    setLocalAgency(value);
  };

  const handleCustomAgencySave = () => {
    if (localAgency.trim()) {
      addRecentCourier(localAgency.trim());
      setRecentCouriers(getRecentCouriers());
      onSave(localAgency.trim(), localNumber || undefined);
      setShowCustomInput(false);
    }
  };

  const handleNumberChange = (value: string) => {
    setLocalNumber(value);
  };

  const handleNumberBlur = () => {
    // Save on blur if there's a change
    if (localNumber !== (shippingNumber || '')) {
      onSave(localAgency || undefined, localNumber || undefined);
    }
  };

  const handleNumberKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      onSave(localAgency || undefined, localNumber || undefined);
    }
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <Package className="h-4 w-4" />
          Shipping Information
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Quick Select Buttons - Top 4 Recent */}
        <div className="space-y-2">
          <Label className="text-sm text-muted-foreground">Courier</Label>
          <div className="grid grid-cols-2 gap-2">
            {recentCouriers.map((courier) => (
              <Button
                key={courier}
                variant={localAgency === courier ? 'default' : 'outline'}
                size="sm"
                className={cn(
                  'h-9',
                  localAgency === courier && 'ring-2 ring-primary ring-offset-1'
                )}
                onClick={() => handleCourierSelect(courier)}
              >
                {courier}
              </Button>
            ))}
          </div>
        </div>

        {/* Dropdown for other couriers */}
        <Select onValueChange={handleCourierSelect}>
          <SelectTrigger className="w-full">
            <div className="flex items-center gap-2">
              <ChevronDown className="h-4 w-4 opacity-50" />
              <span className="text-muted-foreground">Other couriers...</span>
            </div>
          </SelectTrigger>
          <SelectContent>
            {otherCouriers.map((courier) => (
              <SelectItem key={courier} value={courier}>
                {courier}
              </SelectItem>
            ))}
            <SelectItem value="Other">Custom / Other</SelectItem>
          </SelectContent>
        </Select>

        {/* Custom courier input */}
        {showCustomInput && (
          <div className="flex gap-2">
            <Input
              value={localAgency}
              onChange={(e) => handleCustomAgencyChange(e.target.value)}
              placeholder="Enter courier name"
              className="flex-1"
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleCustomAgencySave();
              }}
            />
            <Button size="sm" onClick={handleCustomAgencySave}>
              Set
            </Button>
          </div>
        )}

        {/* Current selection display */}
        {localAgency && !showCustomInput && (
          <div className="text-sm text-muted-foreground">
            Selected: <span className="font-medium text-foreground">{localAgency}</span>
          </div>
        )}

        {/* Tracking Number */}
        <div className="space-y-2">
          <Label className="text-sm text-muted-foreground">Tracking / Reference Number</Label>
          <Input
            value={localNumber}
            onChange={(e) => handleNumberChange(e.target.value)}
            onBlur={handleNumberBlur}
            onKeyDown={handleNumberKeyDown}
            placeholder="Enter receipt number"
          />
        </div>
      </CardContent>
    </Card>
  );
}
