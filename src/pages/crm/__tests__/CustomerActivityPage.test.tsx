/**
 * CustomerActivityPage RTL tests — Task T22.
 *
 * TDD approach: written before implementation.
 *
 * Covers:
 *   - Rows render title + detail with an icon disc (data-testid="timeline-icon-disc")
 *   - Toggling a type filter changes the query args (selectedTypes passed to useSessionQuery)
 *   - A row with kind="order" links to /orders/:id
 *   - A row with kind="activity" renders as non-link (no <a> wrapper)
 *   - Empty state (items=[]) shows "No activity in this window" message
 *   - Loading state (query undefined) shows LoadingPage (no timeline content)
 *
 * Mock strategy:
 *   - useSessionQuery returns mockTimelineResult
 *   - api mock uses string keys for the nested crm.timeline.getCustomerTimeline path
 *   - useParams mocked to return a fixed customerId
 *   - MemoryRouter + Routes wraps the page so React Router links work
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

let mockTimelineResult: unknown = undefined;
const useSessionQueryMock = vi.fn(() => mockTimelineResult);

vi.mock("convex-helpers/react/sessions", () => ({
  useSessionQuery: (...args: unknown[]) => useSessionQueryMock(...args),
  useSessionMutation: vi.fn(() => vi.fn()),
}));

vi.mock("../../../convex/_generated/api", () => ({
  api: {
    crm: {
      timeline: {
        getCustomerTimeline: "getCustomerTimeline",
      },
    },
  },
}));

vi.mock("@/components/crm/Breadcrumbs", () => ({
  Breadcrumbs: ({ trail }: { trail: { label: string }[] }) => (
    <nav aria-label="breadcrumb">{trail.map((s) => s.label).join(" / ")}</nav>
  ),
}));

vi.mock("@/components/shared/LoadingState", () => ({
  LoadingPage: () => <div data-testid="loading-page">Loading…</div>,
}));

import { CustomerActivityPage } from "../CustomerActivityPage";

// ---------------------------------------------------------------------------
// Fixture data
// ---------------------------------------------------------------------------

const CUSTOMER_ID = "cust_abc123" as const;
const ORDER_ID = "order_111" as const;
const ACTIVITY_ID = "act_999" as const;

const ITEM_ORDER = {
  id: `order_placed:${ORDER_ID}`,
  eventType: "order_placed" as const,
  at: 1_750_000_000_000,
  actor: "Budi",
  title: "Order #0601-001 placed",
  detail: "Crystal Toko",
  linkTo: { kind: "order", id: ORDER_ID },
};

const ITEM_ACTIVITY = {
  id: `logged:${ACTIVITY_ID}`,
  eventType: "note" as const,
  at: 1_749_999_000_000,
  actor: "Manager",
  title: "Note added",
  detail: "Calling tomorrow",
  linkTo: { kind: "activity", id: ACTIVITY_ID },
};

const ITEM_FINANCE = {
  id: "topup:ledger_001",
  eventType: "topup" as const,
  at: 1_748_000_000_000,
  actor: "Manager",
  title: "Credit top-up +500.000 IDR",
  detail: "subscription sub_xyz",
  linkTo: { kind: "subscription", id: "sub_xyz" },
};

// ---------------------------------------------------------------------------
// Render helper
// ---------------------------------------------------------------------------

function renderPage(customerId: string = CUSTOMER_ID) {
  return render(
    <MemoryRouter initialEntries={[`/crm/customers/${customerId}/activity`]}>
      <Routes>
        <Route
          path="/crm/customers/:customerId/activity"
          element={<CustomerActivityPage />}
        />
      </Routes>
    </MemoryRouter>,
  );
}

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

beforeEach(() => {
  vi.clearAllMocks();
  mockTimelineResult = undefined;
  useSessionQueryMock.mockImplementation(() => mockTimelineResult);
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("CustomerActivityPage — loading state", () => {
  it("shows loading page when query is undefined", () => {
    mockTimelineResult = undefined;
    renderPage();
    expect(screen.getByTestId("loading-page")).toBeInTheDocument();
    expect(screen.queryByTestId("timeline-item")).not.toBeInTheDocument();
  });
});

describe("CustomerActivityPage — empty state", () => {
  it("shows 'No activity in this window' when items is empty", () => {
    mockTimelineResult = { items: [] };
    renderPage();
    expect(screen.getByText(/No activity in this window/i)).toBeInTheDocument();
    expect(screen.queryByTestId("timeline-item")).not.toBeInTheDocument();
  });
});

describe("CustomerActivityPage — rows render", () => {
  it("renders title and detail for each row", () => {
    mockTimelineResult = { items: [ITEM_ORDER, ITEM_ACTIVITY] };
    renderPage();
    expect(screen.getByText("Order #0601-001 placed")).toBeInTheDocument();
    expect(screen.getByText("Crystal Toko")).toBeInTheDocument();
    expect(screen.getByText("Note added")).toBeInTheDocument();
    expect(screen.getByText("Calling tomorrow")).toBeInTheDocument();
  });

  it("renders an icon disc for each row", () => {
    mockTimelineResult = { items: [ITEM_ORDER, ITEM_ACTIVITY] };
    renderPage();
    const discs = screen.getAllByTestId("timeline-icon-disc");
    expect(discs.length).toBe(2);
  });

  it("renders actor name in each row", () => {
    mockTimelineResult = { items: [ITEM_ORDER] };
    renderPage();
    expect(screen.getByText(/Budi/)).toBeInTheDocument();
  });
});

describe("CustomerActivityPage — linkTo routing", () => {
  it("links an order row to /orders/:id", () => {
    mockTimelineResult = { items: [ITEM_ORDER] };
    renderPage();
    const links = screen.getAllByRole("link");
    const orderLink = links.find((a) =>
      (a as HTMLAnchorElement).href.includes(`/orders/${ORDER_ID}`),
    );
    expect(orderLink).toBeTruthy();
  });

  it("renders an activity row (kind=activity) as non-link", () => {
    mockTimelineResult = { items: [ITEM_ACTIVITY] };
    renderPage();
    // Should have a timeline-item row
    expect(screen.getByTestId("timeline-item")).toBeInTheDocument();
    // Title rendered
    expect(screen.getByText("Note added")).toBeInTheDocument();
    // There should be no link wrapping the activity item
    const links = screen.queryAllByRole("link");
    const activityLink = links.find((a) =>
      (a as HTMLAnchorElement).href.includes(`/activity`),
    );
    expect(activityLink).toBeUndefined();
  });
});

describe("CustomerActivityPage — type filter control", () => {
  it("renders filter buttons for all 6 categories", () => {
    mockTimelineResult = { items: [] };
    renderPage();
    // The 6 ActivityType categories from ACTIVITY_TAXONOMY
    const categories = ["order", "finance", "message", "document", "schedule", "milestone"];
    for (const cat of categories) {
      expect(screen.getByTestId(`type-filter-${cat}`)).toBeInTheDocument();
    }
  });

  it("toggling a type filter calls useSessionQuery with updated types", () => {
    mockTimelineResult = { items: [ITEM_ORDER, ITEM_FINANCE] };
    renderPage();

    // Click the "finance" filter button
    const financeBtn = screen.getByTestId("type-filter-finance");
    fireEvent.click(financeBtn);

    // After toggle, useSessionQuery should have been called with types including "finance"
    const lastCall = useSessionQueryMock.mock.calls.at(-1);
    expect(lastCall).toBeDefined();
    const argsObj = lastCall![1] as { types?: string[] };
    expect(argsObj.types).toBeDefined();
    expect(argsObj.types).toContain("finance");
  });

  it("toggling the same type twice removes it from the filter", () => {
    mockTimelineResult = { items: [] };
    renderPage();

    const financeBtn = screen.getByTestId("type-filter-finance");

    // First click — select finance
    fireEvent.click(financeBtn);
    // Second click — deselect finance
    fireEvent.click(financeBtn);

    const lastCall = useSessionQueryMock.mock.calls.at(-1);
    const argsObj = lastCall![1] as { types?: string[] };
    // After deselecting, types should be undefined (all categories) or not contain finance
    if (argsObj.types !== undefined) {
      expect(argsObj.types).not.toContain("finance");
    }
  });
});

describe("CustomerActivityPage — Load older button", () => {
  it("renders the Load older button", () => {
    mockTimelineResult = { items: [] };
    renderPage();
    expect(screen.getByTestId("load-older-btn")).toBeInTheDocument();
  });

  it("clicking Load older extends sinceDays in the query args", () => {
    mockTimelineResult = { items: [] };
    renderPage();

    // Get initial sinceDays from first call
    const firstCall = useSessionQueryMock.mock.calls[0];
    const initialArgs = firstCall![1] as { sinceDays?: number };
    const initialDays = initialArgs.sinceDays ?? 14;

    fireEvent.click(screen.getByTestId("load-older-btn"));

    const lastCall = useSessionQueryMock.mock.calls.at(-1);
    const newArgs = lastCall![1] as { sinceDays: number };
    expect(newArgs.sinceDays).toBe(initialDays + 14);
  });
});
