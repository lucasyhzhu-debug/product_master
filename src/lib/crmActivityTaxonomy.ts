import type { ActivityCategory } from "../../convex/lib/activityEvents";

// ActivityType IS the visual key — a coarse category, one step up from EventType.
export type ActivityType = ActivityCategory;

export type ActivityVisual = {
  icon: string;
  colorClass: string;
  label: string;
  direction?: "inbound" | "outbound" | "system";
};

export const ACTIVITY_TAXONOMY: Record<ActivityType, ActivityVisual> = {
  order:     { icon: "📦", colorClass: "text-blue-500",   label: "Order",     direction: "system" },
  finance:   { icon: "💳", colorClass: "text-green-500",  label: "Finance",   direction: "system" },
  message:   { icon: "💬", colorClass: "text-violet-500", label: "Message",   direction: "outbound" },
  document:  { icon: "📄", colorClass: "text-amber-500",  label: "Document",  direction: "inbound" },
  schedule:  { icon: "📅", colorClass: "text-cyan-500",   label: "Schedule",  direction: "system" },
  milestone: { icon: "🏁", colorClass: "text-rose-500",   label: "Milestone", direction: "system" },
};

// Subtype icon overrides — layered on top of the category base visual.
const SUBTYPE_ICON: Record<string, string> = {
  funded:     "✓",
  reconcile:  "⚖",
};

export function getActivityVisual(category: ActivityType, subtype?: string): ActivityVisual {
  const base = ACTIVITY_TAXONOMY[category];
  if (subtype && SUBTYPE_ICON[subtype]) return { ...base, icon: SUBTYPE_ICON[subtype] };
  return base;
}

// Re-export for downstream consumers who need the category type.
export type { ActivityCategory };
