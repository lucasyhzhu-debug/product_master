/**
 * Phase 76 plan 04 — FinancialExportPage RTL tests.
 *
 * Coverage spans:
 *   - Granularity radio is hidden when P&L checkbox is unchecked
 *   - "Generate exports" button disabled with tooltip when no type selected
 *   - Filename preview is deterministic (vi.setSystemTime — Refinement R3)
 *   - Preflight stat row renders with mocked Convex data
 *   - Default preset chip ("Last week") is `aria-pressed="true"`
 *   - Loading state replaces button label with "Generating…"
 *
 * Convex hooks, auth context, document title, sonner, and downloadCSV are
 * mocked so no real network/IO happens. The mocks are imported through the
 * same module identifiers the page consumes via the `@` alias.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

// Mock Convex hooks. `useQuery` returns the preflight stats so the loading
// state immediately resolves; `useConvex().query` resolves to an empty array
// so the Generate handler's await chain completes without IO.
vi.mock("convex/react", () => ({
  useQuery: vi.fn(() => ({
    journalLineCount: 42,
    revenueRowCount: 7,
    periodCount: 1,
    isLargeRange: false,
  })),
  useConvex: vi.fn(() => ({
    query: vi.fn(async () => []),
  })),
}));

// Mock auth — provide a manager token so the "skip" branches don't trigger.
vi.mock("@/contexts/AuthContext", () => ({
  useAuth: vi.fn(() => ({
    user: { token: "test-token", role: "manager", name: "Test Manager" },
  })),
}));

// Document title hook is a side-effecting useEffect that we don't need here.
vi.mock("@/hooks/useDocumentTitle", () => ({
  useDocumentTitle: vi.fn(),
}));

// Sonner — capture toast calls without rendering the toast layer.
vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

// downloadCSV — no real Blob/URL plumbing in jsdom. Re-export the rest of
// csvExport so internal helpers stay typed.
vi.mock("@/lib/csvExport", async () => {
  const actual = await vi.importActual<typeof import("@/lib/csvExport")>(
    "@/lib/csvExport",
  );
  return { ...actual, downloadCSV: vi.fn() };
});

import { FinancialExportPage } from "../FinancialExportPage";

function renderPage() {
  return render(
    <MemoryRouter>
      <FinancialExportPage />
    </MemoryRouter>,
  );
}

describe("FinancialExportPage", () => {
  beforeEach(() => {
    // R3 — deterministic system clock so the "Last week" preset always returns
    // the same prior-ISO-week range and the filename preview stays stable.
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-05-08T00:00:00Z"));
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("granularity hidden when P&L unchecked", () => {
    renderPage();
    // Default state: P&L checked → Granularity heading visible.
    expect(screen.queryByText(/Granularity/i)).toBeInTheDocument();

    // Uncheck the P&L checkbox.
    const plCheckbox = screen.getByLabelText(/P&L summary/i);
    fireEvent.click(plCheckbox);

    // Granularity heading should disappear from the DOM (conditional render).
    expect(screen.queryByText(/Granularity/i)).not.toBeInTheDocument();
  });

  it("at least one type required: Generate disabled when both checkboxes unchecked", () => {
    renderPage();
    fireEvent.click(screen.getByLabelText(/Raw transactions/i));
    fireEvent.click(screen.getByLabelText(/P&L summary/i));
    const btn = screen.getByRole("button", { name: /Generate exports/i });
    expect(btn).toBeDisabled();
    expect(btn).toHaveAttribute("title", "Select at least one export type.");
  });

  it("filename preview shows correct names when both types checked + valid range (deterministic via setSystemTime — R3)", () => {
    renderPage();
    // With Date.now() pinned to 2026-05-08 (Friday), "Last week" preset returns
    // prior ISO week (2026-04-27 Mon → 2026-05-04 Mon, label end 2026-05-03).
    expect(screen.getByText(/frollie-transactions-/)).toBeInTheDocument();
    expect(screen.getByText(/frollie-pl-summary-/)).toBeInTheDocument();
  });

  it("preflight stat row renders with mocked data", () => {
    renderPage();
    // Stat row is structured as "Range covers <strong>42</strong> journal entries…"
    // Match against the parent <p> that includes the prefix copy + the <strong>
    // counts for journalLineCount (42) and revenueRowCount (7).
    const statRow = screen.getByText(/Range covers/);
    expect(statRow).toBeInTheDocument();
    expect(statRow.textContent).toContain("42");
    expect(statRow.textContent).toContain("7");
    expect(statRow.textContent).toContain("journal entries");
    expect(statRow.textContent).toContain("revenue rows");
  });

  it("Last week preset button is active by default", () => {
    renderPage();
    const btn = screen.getByRole("button", { name: /Last week/i });
    expect(btn).toHaveAttribute("aria-pressed", "true");
  });

  it("clicking Generate triggers loading state", async () => {
    // Switch to real timers — waitFor needs real time advancement, and the
    // never-resolving promise means we don't depend on the deterministic
    // system clock for this test.
    vi.useRealTimers();

    // Override useConvex().query to return a never-resolving promise so the
    // loading state stays visible long enough to assert against.
    const neverResolves = new Promise<unknown>(() => {});
    const { useConvex } = await import("convex/react");
    (useConvex as unknown as { mockReturnValue: (v: unknown) => void }).mockReturnValue({
      query: vi.fn(() => neverResolves),
    });

    renderPage();
    fireEvent.click(screen.getByRole("button", { name: /Generate exports/i }));

    await waitFor(() => {
      expect(screen.getByText(/Generating/i)).toBeInTheDocument();
    });
  });
});
