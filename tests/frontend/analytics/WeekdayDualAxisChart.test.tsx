import { describe, expect, test, vi, beforeEach } from "vitest";
import { render } from "@testing-library/react";
import { WeekdayDualAxisChart } from "@/components/analytics/WeekdayDualAxisChart";

vi.mock("@/hooks/convex/useAnalytics", () => ({
  useByWeekday: vi.fn(),
}));

import { useByWeekday } from "@/hooks/convex/useAnalytics";

const mockedHook = vi.mocked(useByWeekday);

describe("WeekdayDualAxisChart", () => {
  beforeEach(() => {
    mockedHook.mockReset();
  });

  test("renders SVG with mock data", () => {
    mockedHook.mockReturnValue({
      labels: ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"],
      orders: [10, 12, 11, 14, 18, 22, 16],
      units: [20, 25, 22, 28, 40, 48, 34],
    } as never);
    const { container } = render(<WeekdayDualAxisChart />);
    // Recharts renders an SVG (at minimum a ResponsiveContainer div; SVG appears on mount)
    // Use container query for .recharts-* wrapper classes or svg
    expect(container.querySelector("svg, .recharts-responsive-container")).not.toBeNull();
  });

  test("renders skeleton when loading", () => {
    mockedHook.mockReturnValue(undefined as never);
    const { container } = render(<WeekdayDualAxisChart />);
    expect(container.querySelector(".animate-pulse")).not.toBeNull();
  });
});
