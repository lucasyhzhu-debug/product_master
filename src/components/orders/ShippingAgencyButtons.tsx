import * as React from 'react';
import { useQuery } from 'convex/react';
import { api } from '../../../convex/_generated/api';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import { ChevronDown, Truck, Plus } from 'lucide-react';
import { cn } from '@/lib/utils';

// ============================================
// Types
// ============================================

interface ShippingAgencyButtonsProps {
  value?: string | null;
  onChange: (agency: string) => void;
  disabled?: boolean;
  className?: string;
}

// ============================================
// Fallback agencies if no usage data exists
// ============================================

const FALLBACK_AGENCIES = ['Gojek', 'Grab', 'JNE', 'J&T'];

// ============================================
// Main Component
// ============================================

export function ShippingAgencyButtons({
  value,
  onChange,
  disabled = false,
  className,
}: ShippingAgencyButtonsProps) {
  const [dropdownOpen, setDropdownOpen] = React.useState(false);
  const [customAgency, setCustomAgency] = React.useState('');

  // Fetch top agencies from usage tracking
  const topAgencies = useQuery(api.shipping.queries.getTopAgencies, { limit: 4 });
  const allAgencies = useQuery(api.shipping.queries.getAllAgencyUsage, {});

  // Determine which agencies to show as buttons
  const buttonAgencies = React.useMemo(() => {
    if (topAgencies && topAgencies.length > 0) {
      return topAgencies.map((a) => a.agency);
    }
    return FALLBACK_AGENCIES;
  }, [topAgencies]);

  // Get remaining agencies for dropdown
  const dropdownAgencies = React.useMemo(() => {
    if (!allAgencies) return [];
    return allAgencies
      .filter((a) => !buttonAgencies.includes(a.agency))
      .map((a) => a.agency);
  }, [allAgencies, buttonAgencies]);

  // Check if current value is not in button list
  const isDropdownSelected = value && !buttonAgencies.includes(value);
  const remainingCount = dropdownAgencies.length;

  // Handle custom agency submission
  const handleAddCustom = React.useCallback(() => {
    if (customAgency.trim()) {
      onChange(customAgency.trim());
      setCustomAgency('');
      setDropdownOpen(false);
    }
  }, [customAgency, onChange]);

  return (
    <div className={cn('flex flex-wrap gap-2', className)}>
      {/* Top 4 agency buttons */}
      {buttonAgencies.map((agency) => (
        <Button
          key={agency}
          type="button"
          variant={value === agency ? 'default' : 'outline'}
          disabled={disabled}
          onClick={() => onChange(agency)}
          className={cn(
            'gap-2 min-h-[44px] px-3 sm:min-h-[36px] sm:px-3 text-base sm:text-sm',
            value === agency && 'ring-2 ring-primary ring-offset-1'
          )}
        >
          <Truck className="h-5 w-5 sm:h-4 sm:w-4" />
          {agency}
        </Button>
      ))}

      {/* More dropdown */}
      <DropdownMenu open={dropdownOpen} onOpenChange={setDropdownOpen}>
        <DropdownMenuTrigger asChild>
          <Button
            type="button"
            variant={isDropdownSelected ? 'default' : 'outline'}
            disabled={disabled}
            className={cn(
              'gap-1 min-h-[44px] px-3 sm:min-h-[36px] sm:px-3 text-base sm:text-sm',
              isDropdownSelected && 'ring-2 ring-primary ring-offset-1'
            )}
          >
            {isDropdownSelected ? (
              value
            ) : (
              <>
                <ChevronDown className="h-5 w-5 sm:h-4 sm:w-4" />
                {remainingCount > 0 ? `+${remainingCount}` : 'More'}
              </>
            )}
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="min-w-[180px]">
          {/* Existing agencies from dropdown */}
          {dropdownAgencies.map((agency) => (
            <DropdownMenuItem
              key={agency}
              onClick={() => {
                onChange(agency);
                setDropdownOpen(false);
              }}
              className={cn(
                'cursor-pointer min-h-[44px] sm:min-h-[36px] text-base sm:text-sm',
                value === agency && 'bg-accent font-medium'
              )}
            >
              <Truck className="h-4 w-4 mr-2" />
              {agency}
            </DropdownMenuItem>
          ))}

          {dropdownAgencies.length > 0 && <DropdownMenuSeparator />}

          {/* Custom agency input */}
          <div className="p-2">
            <div className="flex gap-2">
              <Input
                placeholder="Custom agency..."
                value={customAgency}
                onChange={(e) => setCustomAgency(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    handleAddCustom();
                  }
                }}
                className="h-10 sm:h-8 text-base sm:text-sm"
              />
              <Button
                type="button"
                variant="ghost"
                onClick={handleAddCustom}
                disabled={!customAgency.trim()}
                className="h-10 w-10 sm:h-8 sm:w-8 p-0"
              >
                <Plus className="h-5 w-5 sm:h-4 sm:w-4" />
              </Button>
            </div>
          </div>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}

export default ShippingAgencyButtons;
