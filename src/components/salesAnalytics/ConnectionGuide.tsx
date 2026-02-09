import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';
import { Loader2, CheckCircle2, XCircle, AlertCircle, Settings2 } from 'lucide-react';
import { cn } from '@/lib/utils';

interface ConnectionGuideProps {
  platformName: string;
  description: string;
  tokenLifespan: string;
  reconnectSteps: string[];
  lastSyncAt?: number;
  lastSyncStatus?: 'success' | 'error' | 'partial' | null;
  lastSyncError?: string;
  isSyncing: boolean;
  onSync: () => void;
  syncLabel?: string;
  onSecondarySync?: () => void;
  secondarySyncLabel?: string;
  isSecondarySyncing?: boolean;
  hasCredentials?: boolean;
  hasRefreshToken?: boolean;
  tokenExpiresAt?: number | null;
  lastRefreshStatus?: 'success' | 'error' | null;
  onConfigure?: () => void;
}

function formatRelativeTime(timestamp: number): string {
  const now = Date.now();
  const diff = now - timestamp;
  const minutes = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  const days = Math.floor(diff / 86400000);

  if (minutes < 1) return 'Just now';
  if (minutes < 60) return `${minutes}m ago`;
  if (hours < 24) return `${hours}h ago`;
  return `${days}d ago`;
}

function renderStepContent(step: string): React.ReactNode {
  // Detect URLs with regex and render them as styled text
  const urlRegex = /(https?:\/\/[^\s]+)/g;
  const parts = step.split(urlRegex);

  return parts.map((part, index) => {
    if (urlRegex.test(part)) {
      return (
        <span key={index} className="font-mono text-blue-600 select-all">
          {part}
        </span>
      );
    }
    return <span key={index}>{part}</span>;
  });
}

export function ConnectionGuide({
  platformName,
  description,
  tokenLifespan,
  reconnectSteps,
  lastSyncAt,
  lastSyncStatus,
  lastSyncError,
  isSyncing,
  onSync,
  syncLabel = 'Sync Now',
  onSecondarySync,
  secondarySyncLabel = 'Secondary Action',
  isSecondarySyncing = false,
  hasCredentials,
  hasRefreshToken,
  tokenExpiresAt,
  onConfigure,
}: ConnectionGuideProps) {
  // Determine status badge
  const getStatusBadge = () => {
    if (lastSyncStatus === 'success') {
      return (
        <Badge variant="outline" className="border-green-500 text-green-700 bg-green-50">
          <CheckCircle2 className="h-3 w-3 mr-1" />
          Connected
        </Badge>
      );
    }
    if (lastSyncStatus === 'error') {
      return (
        <Badge variant="outline" className="border-red-500 text-red-700 bg-red-50">
          <XCircle className="h-3 w-3 mr-1" />
          Token Expired
        </Badge>
      );
    }
    if (lastSyncStatus === 'partial') {
      return (
        <Badge variant="outline" className="border-yellow-500 text-yellow-700 bg-yellow-50">
          <AlertCircle className="h-3 w-3 mr-1" />
          Partial Data
        </Badge>
      );
    }
    return (
      <Badge variant="outline" className="border-amber-500 text-amber-700 bg-amber-50 font-medium">
        <AlertCircle className="h-3 w-3 mr-1" />
        Not Synced Yet
      </Badge>
    );
  };

  // Determine status indicator color (more visible for "not synced yet")
  const getStatusColor = () => {
    if (lastSyncStatus === 'success') return 'bg-green-500';
    if (lastSyncStatus === 'error') return 'bg-red-500';
    if (lastSyncStatus === 'partial') return 'bg-yellow-500';
    return 'bg-amber-500'; // Changed from gray-400 to amber for better visibility
  };

  // Format last sync message
  const getLastSyncMessage = () => {
    if (!lastSyncAt) return 'Never';
    if (lastSyncStatus === 'error' && lastSyncError) {
      return `Failed — ${lastSyncError}`;
    }
    if (lastSyncStatus === 'success') {
      return `${formatRelativeTime(lastSyncAt)} ✓`;
    }
    return formatRelativeTime(lastSyncAt);
  };

  // Auto-expand accordion if there's an error
  const defaultValue = lastSyncStatus === 'error' ? 'reconnect-guide' : undefined;

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-start gap-3">
            <div
              className={cn(
                'h-3 w-3 rounded-full mt-1 shrink-0',
                getStatusColor()
              )}
            />
            <div className="space-y-0.5">
              <div className="font-semibold">{platformName}</div>
              <div className="text-sm text-muted-foreground">{description}</div>
            </div>
          </div>
          {getStatusBadge()}
        </div>

        <div className="space-y-1 text-xs text-muted-foreground mt-3">
          {reconnectSteps.length > 0 && (
            <div>Token lifespan: {tokenLifespan}</div>
          )}
          <div>
            Last sync:{' '}
            <span
              className={cn(
                lastSyncStatus === 'error' && 'text-red-600 font-medium'
              )}
            >
              {getLastSyncMessage()}
            </span>
          </div>
          {hasCredentials !== undefined && (
            <div className="flex items-center gap-2">
              <span>Auto-refresh:</span>
              {hasCredentials ? (
                <Badge variant="outline" className="border-green-500 text-green-700 bg-green-50 text-[10px] px-1.5 py-0">
                  Active
                </Badge>
              ) : (
                <Badge variant="outline" className="border-amber-500 text-amber-700 bg-amber-50 text-[10px] px-1.5 py-0">
                  Not configured
                </Badge>
              )}
            </div>
          )}
          {hasRefreshToken && (
            <div className="flex items-center gap-2">
              <span>Refresh token:</span>
              <Badge variant="outline" className="border-green-500 text-green-700 bg-green-50 text-[10px] px-1.5 py-0">
                Saved
              </Badge>
            </div>
          )}
          {tokenExpiresAt && (
            <div>
              Token valid until:{' '}
              <span className={cn(
                tokenExpiresAt < Date.now() ? 'text-red-600 font-medium' : 'text-green-700'
              )}>
                {tokenExpiresAt < Date.now()
                  ? 'Expired'
                  : new Date(tokenExpiresAt).toLocaleString('id-ID', {
                      month: 'short',
                      day: 'numeric',
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
              </span>
            </div>
          )}
        </div>
      </CardHeader>

      <CardContent className="pt-0 space-y-4">
        {reconnectSteps.length > 0 && (
          <Accordion type="single" collapsible defaultValue={defaultValue}>
            <AccordionItem value="reconnect-guide" className="border-b-0">
              <AccordionTrigger className="text-sm py-3">
                How to reconnect API token
              </AccordionTrigger>
              <AccordionContent>
                <div className="space-y-3 text-sm">
                  {reconnectSteps.map((step, index) => (
                    <div key={index} className="flex gap-3">
                      <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground text-xs font-medium">
                        {index + 1}
                      </div>
                      <div className="pt-0.5 leading-relaxed">
                        {renderStepContent(step)}
                      </div>
                    </div>
                  ))}
                </div>
              </AccordionContent>
            </AccordionItem>
          </Accordion>
        )}

        <div className="space-y-2">
          {onConfigure && (
            <Button
              onClick={onConfigure}
              className="w-full min-h-[44px]"
              variant="outline"
            >
              <Settings2 className="h-4 w-4" />
              Configure
            </Button>
          )}
          {onSecondarySync && (
            <Button
              onClick={onSecondarySync}
              disabled={isSecondarySyncing || isSyncing}
              className="w-full min-h-[44px]"
              variant="outline"
            >
              {isSecondarySyncing ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  {secondarySyncLabel}...
                </>
              ) : (
                secondarySyncLabel
              )}
            </Button>
          )}
          <Button
            onClick={onSync}
            disabled={isSyncing || isSecondarySyncing}
            className="w-full min-h-[44px]"
            variant={lastSyncStatus === 'error' || !lastSyncAt ? 'default' : 'outline'}
          >
            {isSyncing ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Syncing...
              </>
            ) : (
              syncLabel
            )}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
