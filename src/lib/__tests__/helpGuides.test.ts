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
    const results = searchGuides("Submitting");
    const sectionMatch = results.find(
      (r) => r.type === "section" && r.anchor === "submitting"
    );
    expect(sectionMatch).toBeDefined();
    expect(sectionMatch!.guideId).toBe("expenses");
    expect(sectionMatch!.label).toBe("Submitting Expenses");
    expect(sectionMatch!.anchor).toBe("submitting");
  });

  it("matches a FAQ question and includes guideId and anchor", () => {
    const results = searchGuides("submit an expense");
    const faqMatch = results.find((r) => r.type === "faq");
    expect(faqMatch).toBeDefined();
    expect(faqMatch!.guideId).toBe("expenses");
    expect(faqMatch!.label).toBe("How do I submit an expense?");
    expect(faqMatch!.anchor).toBe("submitting");
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
    // "expense" appears in the guide title, section titles, and FAQ questions
    const results = searchGuides("expense");
    const types = new Set(results.map((r) => r.type));
    // Should have at least guide-level and FAQ-level matches
    expect(types.has("guide")).toBe(true);
    expect(types.has("faq")).toBe(true);
    // Sections that contain "expense" (e.g., "Submitting Expenses", "Approving Expenses", "Expense Analytics")
    const sectionMatches = results.filter((r) => r.type === "section");
    expect(sectionMatches.length).toBeGreaterThan(0);
    // Total matches should be more than 1
    expect(results.length).toBeGreaterThan(3);
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
