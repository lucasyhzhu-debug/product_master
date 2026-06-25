// Pure mapper — no convex/server imports. Importable by both backend (timeline-merge) and frontend.
export type ActivityCategory = "order" | "finance" | "message" | "document" | "schedule" | "milestone";

export const EVENT_TYPES = [
  // derived from domain events
  "order_placed", "order_delivered", "invoice_sent", "payment_funded",
  "topup", "week_reconciled", "schedule_changed",
  "subscription_started", "subscription_ended", "subscription_terminated",
  "agreement_uploaded", "agreement_signed", "customer_onboarded",
  // logged (customerActivity.type)
  "whatsapp_drafted", "note", "manual_milestone",
] as const;

export type EventType = (typeof EVENT_TYPES)[number];

const EVENT_CATEGORY: Record<EventType, ActivityCategory> = {
  order_placed:             "order",
  order_delivered:          "order",
  invoice_sent:             "finance",
  payment_funded:           "finance",
  topup:                    "finance",
  week_reconciled:          "finance",
  schedule_changed:         "schedule",
  subscription_started:     "milestone",
  subscription_ended:       "milestone",
  subscription_terminated:  "milestone",
  agreement_uploaded:       "document",
  agreement_signed:         "document",
  customer_onboarded:       "milestone",
  manual_milestone:         "milestone",
  whatsapp_drafted:         "message",
  note:                     "message",
};

export function eventTypeToCategory(eventType: EventType): ActivityCategory {
  return EVENT_CATEGORY[eventType];
}

// Direction per activity category — single source shared with the backend stamp in
// convex/crm/timeline.ts (logCustomerInteraction). Mirrors the visual direction in
// src/lib/crmActivityTaxonomy.ts (ACTIVITY_TAXONOMY); kept here (pure, no server imports)
// so backend functions don't re-declare a divergent copy.
export const CATEGORY_DIRECTION: Record<ActivityCategory, "inbound" | "outbound" | "system"> = {
  order:     "system",
  finance:   "system",
  message:   "outbound",
  document:  "inbound",
  schedule:  "system",
  milestone: "system",
};
