import { describe, it, expect } from "vitest";
import { searchGuides, HELP_GUIDES, POPULAR_QUESTIONS } from "../helpGuides";

describe("searchGuides", () => {
  it("returns empty array for empty string query", () => {
    expect(searchGuides("")).toEqual([]);
  });

  it("returns empty array for whitespace-only query", () => {
    expect(searchGuides("   ")).toEqual([]);
    expect(searchGuides("\t\n")).toEqual([]);
  });

  it("matches a guide title", () => {
    const results = searchGuides("Expenses");
    const guideMatch = results.find(
      (r) => r.type === "guide" && r.guideId === "expenses"
    );
    expect(guideMatch).toBeDefined();
    expect(guideMatch!.label).toBe("Expenses & Reimbursement");
    expect(guideMatch!.guideTitle).toBe("Expenses & Reimbursement");
  });

  it("matches a section title and includes anchor", () => {
    const results = searchGuides("Walkthrough");
    const sectionMatch = results.find(
      (r) => r.type === "section" && r.anchor === "walkthrough"
    );
    expect(sectionMatch).toBeDefined();
    expect(sectionMatch!.guideId).toBe("expenses");
    expect(sectionMatch!.label).toBe("Interactive Walkthroughs");
    expect(sectionMatch!.anchor).toBe("walkthrough");
  });

  it("matches a FAQ question and includes guideId and anchor", () => {
    const results = searchGuides("submit an expense");
    const faqMatch = results.find((r) => r.type === "faq");
    expect(faqMatch).toBeDefined();
    expect(faqMatch!.guideId).toBe("expenses");
    expect(faqMatch!.label).toBe("How do I submit an expense?");
    expect(faqMatch!.anchor).toBe("walkthrough");
  });

  it("is case-insensitive", () => {
    const upper = searchGuides("EXPENSE");
    const lower = searchGuides("expense");
    // Both should find the same guide-level match at minimum
    const upperGuide = upper.find(
      (r) => r.type === "guide" && r.guideId === "expenses"
    );
    const lowerGuide = lower.find(
      (r) => r.type === "guide" && r.guideId === "expenses"
    );
    expect(upperGuide).toBeDefined();
    expect(lowerGuide).toBeDefined();
    // Same number of results
    expect(upper.length).toBe(lower.length);
  });

  it("returns empty array for non-matching query", () => {
    expect(searchGuides("xyznonexistent")).toEqual([]);
  });

  it("returns all matches when query spans guide, section, and FAQ", () => {
    // "expense" appears in the guide title, "Expense Analytics" section, and FAQ questions
    const results = searchGuides("expense");
    const types = new Set(results.map((r) => r.type));
    expect(types.has("guide")).toBe(true);
    expect(types.has("faq")).toBe(true);
    // Only "Expense Analytics" section title contains "expense" now (was 3 before Phase 63)
    const sectionMatches = results.filter((r) => r.type === "section");
    expect(sectionMatches.length).toBe(1);
    expect(sectionMatches[0].label).toBe("Expense Analytics");
    // 1 guide + 1 section + FAQ matches
    expect(results.length).toBeGreaterThanOrEqual(3);
  });
});

describe("HELP_GUIDES registry", () => {
  it("has 6 entries", () => {
    expect(HELP_GUIDES).toHaveLength(6);
  });

  it("expenses entry is live with component", () => {
    const expenses = HELP_GUIDES.find((g) => g.id === "expenses");
    expect(expenses).toBeDefined();
    expect(expenses!.status).toBe("live");
    expect(typeof expenses!.component).toBe("function");
  });

  it("all non-expenses entries are coming-soon", () => {
    const others = HELP_GUIDES.filter((g) => g.id !== "expenses");
    for (const guide of others) {
      expect(guide.status).toBe("coming-soon");
    }
  });

  it("expenses entry has isNew flag", () => {
    const expenses = HELP_GUIDES.find((g) => g.id === "expenses");
    expect(expenses).toBeDefined();
    expect(expenses!.isNew).toBe(true);
  });
});

describe("POPULAR_QUESTIONS", () => {
  it("has 4 entries", () => {
    expect(POPULAR_QUESTIONS).toHaveLength(4);
  });

  it("all reference valid guide IDs", () => {
    const guideIds = new Set(HELP_GUIDES.map((g) => g.id));
    for (const q of POPULAR_QUESTIONS) {
      expect(guideIds.has(q.guideId)).toBe(true);
    }
  });
});
