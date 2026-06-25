import { describe, it, expect } from "vitest";
import { getActivityVisual, ACTIVITY_TAXONOMY } from "../crmActivityTaxonomy";
import { eventTypeToCategory, EVENT_TYPES, ActivityCategory } from "../../../convex/lib/activityEvents";

describe("crmActivityTaxonomy two-level model", () => {
  it("getActivityVisual returns the category visual, applying subtype override", () => {
    expect(getActivityVisual("finance").icon).toBe("💳");
    expect(getActivityVisual("finance", "funded").icon).toBe("✓"); // subtype override
  });

  it("every EventType maps to a real ActivityType category", () => {
    for (const et of EVENT_TYPES) {
      const cat = eventTypeToCategory(et);
      expect(getActivityVisual(cat)).toBeDefined();
    }
  });

  it("ACTIVITY_TAXONOMY has a key for every ActivityCategory the mapper can return", () => {
    const categories: ActivityCategory[] = ["order", "finance", "message", "document", "schedule", "milestone"];
    for (const cat of categories) {
      expect(ACTIVITY_TAXONOMY[cat]).toBeDefined();
    }
  });
});
