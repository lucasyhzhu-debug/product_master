import { describe, expect, test, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { KpiRow } from "@/components/analytics/KpiRow";

vi.mock("@/hooks/convex/useAnalytics", () => ({
  useKpiSummary: vi.fn(),
}));

import { useKpiSummary } from "@/hooks/convex/useAnalytics";

const mockedHook = vi.mocked(useKpiSummary);

describe("KpiRow", () => {
  beforeEach(() => {
    mockedHook.mockReset();
  });

  test("shows skeleton when data is undefined", () => {
    mockedHook.mockReturnValue(undefined as never);
    render(<KpiRow />);
    expect(document.querySelectorAll(".animate-pulse").length).toBe(6);
  });

  test("renders 6 tiles with formatted values and deltas", () => {
    mockedHook.mockReturnValue({
      current: {
        grossRevenue: 0,
        netRevenue: 100_000_000,
        discount: 0,
        units: 2500,
        orderCount: 1000,
        aovGross: 0,
        aovNet: 100_000,
        revPerUnit: 40_000,
        unitsPerTxn: 2.5,
      },
      prior: {
        grossRevenue: 0,
        netRevenue: 0,
        discount: 0,
        units: 0,
        orderCount: 0,
        aovGross: 0,
        aovNet: 0,
        revPerUnit: 0,
        unitsPerTxn: 0,
      },
      delta: {
        netRevenue: 10,
        units: 5,
        aovNet: null,
        revPerUnit: -2,
        orderCount: 15,
        unitsPerTxn: 0.1,
      },
    } as never);
    render(<KpiRow />);
    expect(screen.getByText(/Revenue \(net\)/i)).toBeInTheDocument();
    expect(screen.getByText(/Units sold/i)).toBeInTheDocument();
    expect(screen.getByText("2,500")).toBeInTheDocument();
    expect(screen.getByText("2.50")).toBeInTheDocument();
    // null delta renders em-dash
    expect(screen.getAllByText("—").length).toBeGreaterThanOrEqual(1);
  });
});
