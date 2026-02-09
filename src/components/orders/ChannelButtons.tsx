import * as React from 'react';
import { useQuery } from 'convex/react';
import { api } from '../../../convex/_generated/api';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { ChevronDown } from 'lucide-react';
import { cn } from '@/lib/utils';

// ============================================
// Types
// ============================================

type Channel = "whatsapp" | "instagram" | "shopee" | "tiktok" | "tokopedia" | "grabfood" | "k3mart_gf" | "legato_tamtem" | "legato_goldfinch" | "bazaar" | "other";

interface ChannelButtonsProps {
  value?: string | null;
  onChange: (channel: Channel) => void;
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
            disabled={disabled}
            onClick={() => onChange(channel as Channel)}
            className={cn(
              'min-h-[44px] px-4 sm:min-h-[36px] sm:px-3 font-medium text-base sm:text-sm',
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
            disabled={disabled}
            className={cn(
              'gap-1 min-h-[44px] px-4 sm:min-h-[36px] sm:px-3 text-base sm:text-sm',
              isDropdownSelected && 'ring-2 ring-primary ring-offset-1'
            )}
          >
            {isDropdownSelected ? (
              getDisplay(value).short
            ) : (
              <>
                <ChevronDown className="h-5 w-5 sm:h-4 sm:w-4" />
                {remainingCount > 0 ? `+${remainingCount}` : '...'}
              </>
            )}
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="min-w-[180px]">
          {/* Known channels not in buttons */}
          {dropdownChannels.map((channel) => {
            const display = getDisplay(channel);
            return (
              <DropdownMenuItem
                key={channel}
                onClick={() => {
                  onChange(channel as Channel);
                  setDropdownOpen(false);
                }}
                className={cn(
                  'cursor-pointer min-h-[44px] sm:min-h-[36px] text-base sm:text-sm',
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

        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}

export default ChannelButtons;
