import { describe, it, expect } from "vitest";
import { eventTypeToCategory, EVENT_TYPES, ActivityCategory } from "../activityEvents";

describe("activityEvents pure mapper", () => {
  it("every EventType maps to a valid ActivityCategory", () => {
    const validCategories = ["order", "finance", "message", "document", "schedule", "milestone"] satisfies ActivityCategory[];
    for (const et of EVENT_TYPES) {
      const cat = eventTypeToCategory(et);
      expect(validCategories).toContain(cat);
    }
  });

  it("order events map to order", () => {
    expect(eventTypeToCategory("order_placed")).toBe("order");
    expect(eventTypeToCategory("order_delivered")).toBe("order");
  });

  it("finance events map to finance", () => {
    expect(eventTypeToCategory("invoice_sent")).toBe("finance");
    expect(eventTypeToCategory("payment_funded")).toBe("finance");
    expect(eventTypeToCategory("topup")).toBe("finance");
    expect(eventTypeToCategory("week_reconciled")).toBe("finance");
  });

  it("message events map to message", () => {
    expect(eventTypeToCategory("whatsapp_drafted")).toBe("message");
    expect(eventTypeToCategory("note")).toBe("message");
  });

  it("document events map to document", () => {
    expect(eventTypeToCategory("agreement_uploaded")).toBe("document");
    expect(eventTypeToCategory("agreement_signed")).toBe("document");
  });

  it("schedule events map to schedule", () => {
    expect(eventTypeToCategory("schedule_changed")).toBe("schedule");
  });

  it("milestone events map to milestone", () => {
    expect(eventTypeToCategory("subscription_started")).toBe("milestone");
    expect(eventTypeToCategory("subscription_ended")).toBe("milestone");
    expect(eventTypeToCategory("subscription_terminated")).toBe("milestone");
    expect(eventTypeToCategory("customer_onboarded")).toBe("milestone");
    expect(eventTypeToCategory("manual_milestone")).toBe("milestone");
  });

  it("EVENT_TYPES has 16 entries", () => {
    expect(EVENT_TYPES.length).toBe(16);
  });
});
