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
import { Clock, SlidersHorizontal, X } from "lucide-react";

// ---------------------------------------------------------------------------
// Type-filter control
// ---------------------------------------------------------------------------

const ALL_CATEGORIES = Object.keys(ACTIVITY_TAXONOMY) as ActivityType[];

interface TypeFilterProps {
  selected: ActivityType[];
  onToggle: (type: ActivityType) => void;
  onClear: () => void;
}

function TypeFilterBar({ selected, onToggle, onClear }: TypeFilterProps) {
  // No selection = no filter applied (everything shows). Each chip is a real
  // toggle: OFF chips render as muted outlines so it's obvious they're clickable
  // filters, not static category labels; ON chips fill in. (Was: all chips
  // rendered filled by default, so they read as a legend — "where are the filters?")
  const anyActive = selected.length > 0;

  return (
    <div className="space-y-2">
      {/* Label row — makes it obvious this is a filter control */}
      <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <SlidersHorizontal className="h-3.5 w-3.5" aria-hidden="true" />
        <span className="font-medium">Filter by type</span>
        {anyActive && (
          <button
            type="button"
            onClick={onClear}
            className="ml-1 inline-flex items-center gap-0.5 rounded px-1 py-0.5 text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
            data-testid="type-filter-clear"
          >
            <X className="h-3 w-3" aria-hidden="true" />
            Clear
          </button>
        )}
      </div>

      <div className="flex flex-wrap gap-1.5" role="group" aria-label="Filter by type">
        {ALL_CATEGORIES.map((cat) => {
          const visual = ACTIVITY_TAXONOMY[cat];
          const isActive = selected.includes(cat);
          return (
            <button
              key={cat}
              type="button"
              onClick={() => onToggle(cat)}
              aria-pressed={isActive}
              className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium transition-colors border
                ${
                  isActive
                    ? "border-primary bg-primary/10 text-foreground"
                    : "border-border bg-transparent text-muted-foreground hover:border-primary/40 hover:text-foreground hover:bg-accent"
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
  onClearTypes: () => void;
}

export function ActivityTimeline({
  items,
  customerId,
  selectedTypes,
  onToggleType,
  onClearTypes,
}: ActivityTimelineProps) {
  return (
    <div className="space-y-4">
      {/* Type-filter control */}
      <TypeFilterBar selected={selectedTypes} onToggle={onToggleType} onClear={onClearTypes} />

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
