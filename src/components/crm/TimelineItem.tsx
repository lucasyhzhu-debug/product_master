/**
 * TimelineItem — one row in the customer activity timeline.
 *
 * Renders an icon disc (from getActivityVisual), title, detail, and actor.
 * If `item.linkTo` resolves to a known route, wraps content in a React Router
 * Link (CRM principle A1: references are links). Rows with kind="activity"
 * have no canonical page and render as plain content.
 *
 * CRM design principles:
 *   A1: references render as links.
 *   C9: compact row — progressive disclosure.
 *   D12: designed empty / loading states live on the parent page.
 */

import { Link } from "react-router-dom";
import { getActivityVisual } from "@/lib/crmActivityTaxonomy";
import { eventTypeToCategory } from "../../../convex/lib/activityEvents";
import type { EventType } from "../../../convex/lib/activityEvents";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type TimelineItemData = {
  id: string;
  eventType: EventType;
  at: number; // epoch ms
  actor?: string;
  title: string;
  detail: string;
  linkTo: { kind: string; id: string };
};

interface TimelineItemProps {
  item: TimelineItemData;
  /** The customerId from useParams — needed to build subscription/agreement routes. */
  customerId: string;
}

// ---------------------------------------------------------------------------
// Route resolver — mirrors CreditLedgerStatement.tsx convention
// ---------------------------------------------------------------------------

function resolveLinkTo(
  linkTo: { kind: string; id: string },
  customerId: string,
): string | null {
  switch (linkTo.kind) {
    case "order":
      return `/orders/${linkTo.id}`;
    case "invoice":
      return `/invoices/${linkTo.id}`;
    case "subscription":
      return `/crm/customers/${customerId}/subscriptions/${linkTo.id}`;
    case "agreement":
      return `/crm/customers/${customerId}/agreements`;
    case "activity":
    default:
      return null; // no canonical page → render non-clickable
  }
}

// ---------------------------------------------------------------------------
// TimelineItem
// ---------------------------------------------------------------------------

export function TimelineItem({ item, customerId }: TimelineItemProps) {
  const category = eventTypeToCategory(item.eventType);
  const visual = getActivityVisual(category);

  const to = resolveLinkTo(item.linkTo, customerId);

  const timestamp = new Date(item.at).toLocaleString("id-ID", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });

  const inner = (
    <div
      className="flex items-start gap-3 py-2.5 px-3 rounded-lg hover:bg-muted/40 transition-colors group"
      data-testid="timeline-item"
    >
      {/* Icon disc */}
      <span
        className={`mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-muted text-sm ${visual.colorClass}`}
        aria-hidden="true"
        data-testid="timeline-icon-disc"
      >
        {visual.icon}
      </span>

      {/* Content */}
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium leading-snug">{item.title}</p>
        {item.detail && (
          <p className="text-xs text-muted-foreground mt-0.5 truncate">{item.detail}</p>
        )}
        <p className="text-xs text-muted-foreground/70 mt-0.5">
          {timestamp}
          {item.actor && (
            <span className="ml-1.5">· {item.actor}</span>
          )}
        </p>
      </div>
    </div>
  );

  if (to) {
    return (
      <Link
        to={to}
        className="block no-underline text-foreground hover:text-foreground"
        aria-label={item.title}
      >
        {inner}
      </Link>
    );
  }

  return <div>{inner}</div>;
}
