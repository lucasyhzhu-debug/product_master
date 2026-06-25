import type { ActivityCategory } from "../../convex/lib/activityEvents";

// ActivityType IS the visual key — a coarse category, one step up from EventType.
export type ActivityType = ActivityCategory;

// Direction lives on the backend (CATEGORY_DIRECTION in convex/lib/activityEvents.ts),
// which owns the stamp written to customerActivity. The visual layer only needs
// icon/color/label.
export type ActivityVisual = {
  icon: string;
  colorClass: string;
  label: string;
};

export const ACTIVITY_TAXONOMY: Record<ActivityType, ActivityVisual> = {
  order:     { icon: "📦", colorClass: "text-blue-500",   label: "Order" },
  finance:   { icon: "💳", colorClass: "text-green-500",  label: "Finance" },
  message:   { icon: "💬", colorClass: "text-violet-500", label: "Message" },
  document:  { icon: "📄", colorClass: "text-amber-500",  label: "Document" },
  schedule:  { icon: "📅", colorClass: "text-cyan-500",   label: "Schedule" },
  milestone: { icon: "🏁", colorClass: "text-rose-500",   label: "Milestone" },
};

// Subtype icon overrides — layered on top of the category base visual.
const SUBTYPE_ICON: Record<string, string> = {
  funded:     "✓",
  reconcile:  "⚖",
};

export function getActivityVisual(category: ActivityType, subtype?: string): ActivityVisual {
  const base = ACTIVITY_TAXONOMY[category];
  if (!base) throw new Error(`Unknown activity category: ${category}`);
  if (subtype && SUBTYPE_ICON[subtype]) return { ...base, icon: SUBTYPE_ICON[subtype] };
  return base;
}

// Re-export for downstream consumers who need the category type.
export type { ActivityCategory };
