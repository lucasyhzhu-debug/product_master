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
import { ChevronDown, Plus } from 'lucide-react';
import { cn } from '@/lib/utils';

// ============================================
// Types
// ============================================

interface ChannelButtonsProps {
  value?: string | null;
  onChange: (channel: string) => void;
  disabled?: boolean;
  className?: string;
}

// ============================================
// Channel Display Configuration
// ============================================

const CHANNEL_DISPLAY: Record<string, { short: string; full: string; color?: string }> = {
  whatsapp: { short: 'WA', full: 'WhatsApp', color: 'text-green-600' },
  instagram: { short: 'IG', full: 'Instagram', color: 'text-pink-600' },
  shopee: { short: 'SHP', full: 'Shopee', color: 'text-orange-600' },
  tiktok: { short: 'TT', full: 'TikTok', color: 'text-black' },
  tokopedia: { short: 'TKP', full: 'Tokopedia', color: 'text-green-700' },
  grabfood: { short: 'GF', full: 'GrabFood', color: 'text-green-500' },
  k3mart_gf: { short: 'K3', full: 'K3Mart GF', color: 'text-blue-600' },
  legato_tamtem: { short: 'LGT', full: 'Legato Tamtem', color: 'text-purple-600' },
  legato_goldfinch: { short: 'LGG', full: 'Legato Goldfinch', color: 'text-yellow-600' },
  bazaar: { short: 'BZR', full: 'Bazaar', color: 'text-red-600' },
  other: { short: 'OTH', full: 'Other', color: 'text-gray-600' },
};

// Fallback top channels if no usage data
const FALLBACK_CHANNELS = ['whatsapp', 'instagram', 'shopee', 'tiktok'];

// ============================================
// Main Component
// ============================================

export function ChannelButtons({
  value,
  onChange,
  disabled = false,
  className,
}: ChannelButtonsProps) {
  const [dropdownOpen, setDropdownOpen] = React.useState(false);
  const [customChannel, setCustomChannel] = React.useState('');

  // Fetch top channels from usage tracking
  const topChannels = useQuery(api.channels.queries.getTopChannels, { limit: 4 });
  const allChannels = useQuery(api.channels.queries.getAllChannelUsage, {});

  // Determine which channels to show as buttons
  const buttonChannels = React.useMemo(() => {
    if (topChannels && topChannels.length > 0) {
      return topChannels.map((c) => c.channel);
    }
    return FALLBACK_CHANNELS;
  }, [topChannels]);

  // Get remaining channels for dropdown
  const dropdownChannels = React.useMemo(() => {
    // Include all known channels that are not in buttons
    const knownChannels = Object.keys(CHANNEL_DISPLAY);
    const usedChannels = allChannels?.map((c) => c.channel) || [];

    // Merge known channels and used channels, remove duplicates
    const allPossible = [...new Set([...knownChannels, ...usedChannels])];

    return allPossible.filter((c) => !buttonChannels.includes(c));
  }, [allChannels, buttonChannels]);

  // Check if current value is not in button list
  const isDropdownSelected = value && !buttonChannels.includes(value);
  const remainingCount = dropdownChannels.length;

  // Get display info for a channel
  const getDisplay = (channel: string) => {
    return CHANNEL_DISPLAY[channel] || { short: channel.slice(0, 3).toUpperCase(), full: channel };
  };

  // Handle custom channel submission
  const handleAddCustom = React.useCallback(() => {
    if (customChannel.trim()) {
      onChange(customChannel.trim().toLowerCase());
      setCustomChannel('');
      setDropdownOpen(false);
    }
  }, [customChannel, onChange]);

  return (
    <div className={cn('flex flex-wrap gap-2', className)}>
      {/* Top 4 channel buttons */}
      {buttonChannels.map((channel) => {
        const display = getDisplay(channel);
        return (
          <Button
            key={channel}
            type="button"
            variant={value === channel ? 'default' : 'outline'}
            size="sm"
            disabled={disabled}
            onClick={() => onChange(channel)}
            className={cn(
              'min-w-[60px] font-medium',
              value === channel && 'ring-2 ring-primary ring-offset-1',
              value !== channel && display.color
            )}
            title={display.full}
          >
            {display.short}
          </Button>
        );
      })}

      {/* More dropdown */}
      <DropdownMenu open={dropdownOpen} onOpenChange={setDropdownOpen}>
        <DropdownMenuTrigger asChild>
          <Button
            type="button"
            variant={isDropdownSelected ? 'default' : 'outline'}
            size="sm"
            disabled={disabled}
            className={cn(
              'gap-1 min-w-[60px]',
              isDropdownSelected && 'ring-2 ring-primary ring-offset-1'
            )}
          >
            {isDropdownSelected ? (
              getDisplay(value).short
            ) : (
              <>
                <ChevronDown className="h-4 w-4" />
                {remainingCount > 0 ? `+${remainingCount}` : '...'}
              </>
            )}
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="min-w-[160px]">
          {/* Known channels not in buttons */}
          {dropdownChannels.map((channel) => {
            const display = getDisplay(channel);
            return (
              <DropdownMenuItem
                key={channel}
                onClick={() => {
                  onChange(channel);
                  setDropdownOpen(false);
                }}
                className={cn(
                  'cursor-pointer',
                  value === channel && 'bg-accent font-medium'
                )}
              >
                <span className={cn('font-medium mr-2', display.color)}>
                  {display.short}
                </span>
                {display.full}
              </DropdownMenuItem>
            );
          })}

          {dropdownChannels.length > 0 && <DropdownMenuSeparator />}

          {/* Custom channel input */}
          <div className="p-2">
            <div className="flex gap-2">
              <Input
                placeholder="Custom channel..."
                value={customChannel}
                onChange={(e) => setCustomChannel(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    handleAddCustom();
                  }
                }}
                className="h-8 text-sm"
              />
              <Button
                type="button"
                size="sm"
                variant="ghost"
                onClick={handleAddCustom}
                disabled={!customChannel.trim()}
                className="h-8 px-2"
              >
                <Plus className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}

export default ChannelButtons;
