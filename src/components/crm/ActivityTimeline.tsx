/**
 * ActivityTimeline — renders the timeline list with a type-filter control.
 *
 * Props:
 *   - items: TimelineItem[] (already sorted DESC by `at` from the backend — do NOT re-sort)
 *   - customerId: needed to build per-row routes
 *   - selectedTypes: controlled filter state (parent owns it)
 *   - onToggleType: callback to toggle a category on/off
 *
 * CRM design principles:
 *   B6: single taxonomy source (getActivityVisual from crmActivityTaxonomy.ts).
 *   B8: type filter passed as args → server-side filter, not client .filter().
 *   C9: compact by default; items already windowed from backend.
 *   D12: empty state when items=[].
 */

import { ACTIVITY_TAXONOMY } from "@/lib/crmActivityTaxonomy";
import type { ActivityType } from "@/lib/crmActivityTaxonomy";
import { TimelineItem } from "./TimelineItem";
import type { TimelineItemData } from "./TimelineItem";
import { EmptyState } from "@/components/shared/EmptyState";
import { Clock } from "lucide-react";

// ---------------------------------------------------------------------------
// Type-filter control
// ---------------------------------------------------------------------------

const ALL_CATEGORIES = Object.keys(ACTIVITY_TAXONOMY) as ActivityType[];

interface TypeFilterProps {
  selected: ActivityType[];
  onToggle: (type: ActivityType) => void;
}

function TypeFilterBar({ selected, onToggle }: TypeFilterProps) {
  const allSelected = selected.length === 0;

  return (
    <div className="flex flex-wrap gap-1.5" role="group" aria-label="Filter by type">
      {ALL_CATEGORIES.map((cat) => {
        const visual = ACTIVITY_TAXONOMY[cat];
        const isActive = allSelected || selected.includes(cat);
        return (
          <button
            key={cat}
            type="button"
            onClick={() => onToggle(cat)}
            aria-pressed={isActive}
            className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium transition-colors border
              ${
                isActive
                  ? "border-current bg-muted text-foreground"
                  : "border-border bg-transparent text-muted-foreground hover:text-foreground"
              }
            `}
            data-testid={`type-filter-${cat}`}
          >
            <span>{visual.icon}</span>
            {visual.label}
          </button>
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------------------
// ActivityTimeline
// ---------------------------------------------------------------------------

interface ActivityTimelineProps {
  items: TimelineItemData[];
  customerId: string;
  selectedTypes: ActivityType[];
  onToggleType: (type: ActivityType) => void;
}

export function ActivityTimeline({
  items,
  customerId,
  selectedTypes,
  onToggleType,
}: ActivityTimelineProps) {
  return (
    <div className="space-y-4">
      {/* Type-filter control */}
      <TypeFilterBar selected={selectedTypes} onToggle={onToggleType} />

      {/* Timeline list — D12: designed empty state */}
      {items.length === 0 ? (
        <EmptyState
          icon={Clock}
          title="No activity in this window"
          description="Try expanding the window or adjusting type filters."
        />
      ) : (
        <div className="divide-y divide-border/50">
          {items.map((item) => (
            <TimelineItem key={item.id} item={item} customerId={customerId} />
          ))}
        </div>
      )}
    </div>
  );
}
