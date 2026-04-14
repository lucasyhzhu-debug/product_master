import { describe, expect, test, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { MemoryRouter, Routes, Route, useSearchParams } from "react-router-dom";

// AnalyticsFilterBar now reads menuProducts.queries.list via useQuery (I1).
// Mock convex/react.useQuery to return a fixed empty list so the component can
// render outside a ConvexProvider. Other convex/react exports aren't used here.
vi.mock("convex/react", () => ({
  useQuery: () => [],
}));

import { AnalyticsFilterProvider } from "@/contexts/AnalyticsFilterContext";
import { AnalyticsFilterBar } from "@/components/analytics/AnalyticsFilterBar";

function ParamProbe() {
  const [p] = useSearchParams();
  return <div data-testid="probe">{p.toString()}</div>;
}

describe("AnalyticsFilterBar", () => {
  test("clicking 7d preset writes from+to into URL", () => {
    render(
      <MemoryRouter initialEntries={["/analytics"]}>
        <Routes>
          <Route
            path="/analytics"
            element={
              <AnalyticsFilterProvider>
                <AnalyticsFilterBar />
                <ParamProbe />
              </AnalyticsFilterProvider>
            }
          />
        </Routes>
      </MemoryRouter>,
    );
    fireEvent.click(screen.getByText("7d"));
    const params = screen.getByTestId("probe").textContent ?? "";
    expect(params).toMatch(/from=\d+/);
    expect(params).toMatch(/to=\d+/);
  });
});
