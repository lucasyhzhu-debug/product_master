export type ActivityType =
  | "order" | "finance" | "message" | "document" | "schedule" | "milestone";

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

export function getActivityVisual(type: ActivityType, _subtype?: string): ActivityVisual {
  return ACTIVITY_TAXONOMY[type]; // subtype icon overrides layered in the Phase D timeline task
}
