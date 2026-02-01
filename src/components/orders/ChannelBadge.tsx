import { cn } from '@/lib/utils';
import { getChannelInfo } from '@/lib/channels';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';

interface ChannelBadgeProps {
  channel: string | null | undefined;
  size?: 'sm' | 'md' | 'lg';
  showLabel?: boolean;
  className?: string;
}

const sizeStyles = {
  sm: 'text-xs px-2 py-0.5',
  md: 'text-sm px-3 py-1',
  lg: 'text-base px-4 py-1.5',
};

export function ChannelBadge({
  channel,
  size = 'md',
  showLabel = false,
  className,
}: ChannelBadgeProps) {
  const info = getChannelInfo(channel);

  // Double border for green channels (whatsapp, tokopedia, grabfood)
  const isDoubleBorder = info.border === 'double';

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <span
            className={cn(
              'inline-flex items-center gap-1.5 font-semibold rounded-md transition-colors',
              sizeStyles[size],
              className
            )}
            style={{
              backgroundColor: `${info.color}20`,
              color: info.color,
              border: `2px solid ${info.color}`,
              boxShadow: isDoubleBorder
                ? `0 0 0 2px ${info.color}, 0 0 0 4px ${info.color}40`
                : undefined,
            }}
          >
            <span className="font-mono">[{info.code}]</span>
            {showLabel && <span>{info.name}</span>}
          </span>
        </TooltipTrigger>
        <TooltipContent>
          <p>{info.name}</p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

export default ChannelBadge;
