/**
 * AuditTrail - Vertical timeline showing order status change history.
 * Renders at the bottom of the order details slide-over panel.
 *
 * Phase 14 Plan 06: Audit trail timeline with who/when/reason.
 */
import { useState } from 'react';
import { useQuery } from 'convex/react';
import { api } from '../../../convex/_generated/api';
import type { Id } from '../../../convex/_generated/dataModel';
import { ChevronDown, ChevronUp, Info } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';

// ============================================
// Types
// ============================================

interface AuditTrailProps {
  orderId: Id<"orders">;
}

// ============================================
// Helpers
// ============================================

/** Get relative time string (e.g., "2 hours ago") */
function getRelativeTime(timestamp: number): string {
  const now = Date.now();
  const diffMs = now - timestamp;
  const diffSec = Math.floor(diffMs / 1000);
  const diffMin = Math.floor(diffSec / 60);
  const diffHour = Math.floor(diffMin / 60);
  const diffDay = Math.floor(diffHour / 24);

  if (diffSec < 60) return 'just now';
  if (diffMin < 60) return `${diffMin}m ago`;
  if (diffHour < 24) return `${diffHour}h ago`;
  if (diffDay < 7) return `${diffDay}d ago`;
  return new Date(timestamp).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
  });
}

/** Determine event direction for coloring */
function getEventDirection(event: {
  eventType: string;
  fromStatus?: string | null;
  toStatus?: string | null;
}): 'forward' | 'backward' | 'cancel' | 'neutral' {
  if (event.eventType === 'cancelled' || event.toStatus === 'Cancelled') {
    return 'cancel';
  }
  if (event.eventType === 'status_backward' || event.eventType === 'status_revert') {
    return 'backward';
  }
  if (event.eventType === 'status_change' || event.eventType === 'status_auto_transition') {
    return 'forward';
  }
  return 'neutral';
}

/** Get badge styling for event direction */
function getDirectionBadge(direction: 'forward' | 'backward' | 'cancel' | 'neutral') {
  switch (direction) {
    case 'forward':
      return 'bg-green-100 text-green-700 border-green-300';
    case 'backward':
      return 'bg-amber-100 text-amber-700 border-amber-300';
    case 'cancel':
      return 'bg-red-100 text-red-700 border-red-300';
    case 'neutral':
      return 'bg-gray-100 text-gray-700 border-gray-300';
  }
}

/** Get dot color for the timeline circle */
function getDotColor(direction: 'forward' | 'backward' | 'cancel' | 'neutral') {
  switch (direction) {
    case 'forward':
      return 'bg-green-500';
    case 'backward':
      return 'bg-amber-500';
    case 'cancel':
      return 'bg-red-500';
    case 'neutral':
      return 'bg-gray-400';
  }
}

/** Format status for display */
function formatStatus(status: string): string {
  const labels: Record<string, string> = {
    Draft: 'Draft',
    AwaitingPayment: 'Awaiting Payment',
    PaymentReceived: 'Payment Received',
    BeingPrepared: 'Being Prepared',
    AwaitingDelivery: 'Awaiting Delivery',
    Complete: 'Complete',
    Cancelled: 'Cancelled',
  };
  return labels[status] ?? status;
}

// ============================================
// Loading Skeleton
// ============================================

function AuditTrailSkeleton() {
  return (
    <div className="space-y-4 pl-6 border-l-2 border-muted ml-2">
      {[1, 2, 3].map((i) => (
        <div key={i} className="relative">
          <div className="absolute -left-[25px] top-1 w-3 h-3 rounded-full bg-muted" />
          <Skeleton className="h-4 w-40 mb-1" />
          <Skeleton className="h-3 w-24" />
        </div>
      ))}
    </div>
  );
}

// ============================================
// Component
// ============================================

export function AuditTrail({ orderId }: AuditTrailProps) {
  const auditEvents = useQuery(api.orders.queries.getAuditTrail, { orderId });
  const [isExpanded, setIsExpanded] = useState(true);

  // Filter to status-related events only (not stock_override etc.)
  const statusEvents = auditEvents?.filter(
    (e) =>
      e.eventType === 'status_change' ||
      e.eventType === 'status_auto_transition' ||
      e.eventType === 'status_backward' ||
      e.eventType === 'status_revert' ||
      e.eventType === 'cancelled'
  );

  const eventCount = statusEvents?.length ?? 0;

  return (
    <div>
      {/* Collapsible header */}
      <Button
        variant="ghost"
        size="sm"
        className="w-full justify-between px-0 hover:bg-transparent"
        onClick={() => setIsExpanded(!isExpanded)}
      >
        <span className="text-sm font-semibold">
          Status History{eventCount > 0 ? ` (${eventCount})` : ''}
        </span>
        {isExpanded ? (
          <ChevronUp className="h-4 w-4 text-muted-foreground" />
        ) : (
          <ChevronDown className="h-4 w-4 text-muted-foreground" />
        )}
      </Button>

      {isExpanded && (
        <div className="mt-2">
          {/* Loading state */}
          {auditEvents === undefined && <AuditTrailSkeleton />}

          {/* Empty state */}
          {auditEvents !== undefined && eventCount === 0 && (
            <div className="flex items-center gap-2 text-xs text-muted-foreground py-2">
              <Info className="h-3.5 w-3.5" />
              <span>No status changes recorded</span>
            </div>
          )}

          {/* Timeline */}
          {statusEvents && statusEvents.length > 0 && (
            <div className="relative pl-6 ml-1.5">
              {/* Vertical line */}
              <div className="absolute left-[5px] top-2 bottom-2 w-px bg-border" />

              <div className="space-y-4">
                {statusEvents.map((event) => {
                  const direction = getEventDirection(event);
                  const dotColor = getDotColor(direction);
                  const badgeClass = getDirectionBadge(direction);

                  return (
                    <div key={event._id} className="relative">
                      {/* Circle dot on the timeline */}
                      <div
                        className={`absolute -left-[21px] top-1.5 w-2.5 h-2.5 rounded-full ring-2 ring-background ${dotColor}`}
                      />

                      {/* Event content */}
                      <div className="space-y-1">
                        {/* Transition badge */}
                        {event.fromStatus && event.toStatus ? (
                          <Badge
                            variant="outline"
                            className={`text-xs font-medium ${badgeClass}`}
                          >
                            {formatStatus(event.fromStatus)} &rarr; {formatStatus(event.toStatus)}
                          </Badge>
                        ) : (
                          <Badge
                            variant="outline"
                            className={`text-xs font-medium ${badgeClass}`}
                          >
                            {event.eventType === 'cancelled' ? 'Cancelled' : event.eventType}
                          </Badge>
                        )}

                        {/* Who + When */}
                        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                          <span className="font-medium text-foreground/70">
                            {event.userName ?? event.triggeredBy ?? 'System'}
                          </span>
                          <span>&middot;</span>
                          <TooltipProvider>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <span className="cursor-default">
                                  {getRelativeTime(event.timestamp)}
                                </span>
                              </TooltipTrigger>
                              <TooltipContent>
                                {new Date(event.timestamp).toLocaleString('en-US', {
                                  weekday: 'short',
                                  month: 'short',
                                  day: 'numeric',
                                  year: 'numeric',
                                  hour: '2-digit',
                                  minute: '2-digit',
                                })}
                              </TooltipContent>
                            </Tooltip>
                          </TooltipProvider>
                        </div>

                        {/* Reason (if present) */}
                        {event.reason && (
                          <p className="text-xs text-muted-foreground italic pl-0.5">
                            &ldquo;{event.reason}&rdquo;
                          </p>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
