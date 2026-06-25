/**
 * CrmHome RTL tests — Task T13.
 *
 * Covers:
 *   - Both section headers ("Needs funding", "Active subscriptions") render
 *   - Loading state: undefined returns a loading skeleton (LoadingPage)
 *   - Empty state: both sections show designed empty messaging when [] returned
 *   - Funding row links to the week path (/crm/customers/:id/subscriptions/:subId/week)
 *   - Active subscription row links to the customer page (/crm/customers/:id)
 *
 * useSessionQuery is mocked via convex-helpers/react/sessions so no real
 * Convex transport is needed. Two separate calls are intercepted by the
 * mock factory based on call order.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

// ---------------------------------------------------------------------------
// Mock: session hook (convex-helpers/react/sessions)
// Two separate useSessionQuery calls in order:
//   1st call → getFundingDashboard
//   2nd call → getCrmHomeActiveSubscriptions
// We capture return values per call via a queue.
// ---------------------------------------------------------------------------

const mockQueryResults: unknown[] = [];
const useSessionQueryMock = vi.fn(() => mockQueryResults.shift());

vi.mock("convex-helpers/react/sessions", () => ({
  useSessionQuery: (...args: unknown[]) => useSessionQueryMock(...args),
  useSessionMutation: vi.fn(() => vi.fn()),
}));

// Mock convex api — not needed at runtime (mocked hooks), but import must resolve.
vi.mock("../../../convex/_generated/api", () => ({
  api: {
    subscriptions: {
      scheduling: {
        queries: {
          getFundingDashboard: "getFundingDashboard",
        },
      },
    },
    crm: {
      customers: {
        getCrmHomeActiveSubscriptions: "getCrmHomeActiveSubscriptions",
      },
    },
  },
}));

// Sonner — captures toast without rendering toast layer.
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

// Breadcrumbs — minimal stub (irrelevant to these assertions).
vi.mock("@/components/crm/Breadcrumbs", () => ({
  Breadcrumbs: () => <nav aria-label="breadcrumb" />,
}));

import { CrmHome } from "../CrmHome";

// ---------------------------------------------------------------------------
// Fixture data
// ---------------------------------------------------------------------------

const CUSTOMER_ID = "cust_abc123" as const;
const SUB_ID = "sub_xyz789" as const;
const WEEK_ID = "week_w01" as const;

const FUNDING_ROW = {
  week: {
    _id: WEEK_ID,
    weekStart: 1_750_000_000_000, // arbitrary ms
    status: "confirmed",
    subscriptionId: SUB_ID,
  },
  subscriptionId: SUB_ID,
  subscriptionLabel: "Mon–Fri box",
  customerId: CUSTOMER_ID,
  customerName: "Budi Santoso",
};

const ACTIVE_SUB_ROW = {
  subscription: {
    _id: SUB_ID,
    customerId: CUSTOMER_ID,
    status: "active",
    label: "Mon–Fri box",
  },
  customerId: CUSTOMER_ID,
  customerName: "Budi Santoso",
  currentWeek: null,
};

// ---------------------------------------------------------------------------
// Helper
// ---------------------------------------------------------------------------

function renderPage() {
  // Reset mock queue before each render — caller pushes values before calling.
  return render(
    <MemoryRouter>
      <CrmHome />
    </MemoryRouter>,
  );
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

beforeEach(() => {
  vi.clearAllMocks();
  mockQueryResults.length = 0;
});

describe("CrmHome — section headers", () => {
  it("renders both section headers when data loaded", () => {
    mockQueryResults.push([FUNDING_ROW], [ACTIVE_SUB_ROW]);
    renderPage();
    // Both section headings appear (may also appear in summary cards — use getAllBy).
    expect(screen.getAllByText(/Needs funding/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/Active subscriptions/i).length).toBeGreaterThan(0);
  });
});

describe("CrmHome — loading state", () => {
  it("shows loading skeleton when funding data is undefined (first query loading)", () => {
    // Both queries undefined → loading state fires on the first undefined.
    mockQueryResults.push(undefined, undefined);
    renderPage();
    // LoadingPage renders a skeleton; section headers must NOT appear yet.
    expect(screen.queryByText(/Needs funding/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/Active subscriptions/i)).not.toBeInTheDocument();
  });

  it("shows loading skeleton when active-subscriptions data is undefined", () => {
    // Funding loaded, but active-subs still loading.
    mockQueryResults.push([], undefined);
    renderPage();
    expect(screen.queryByText(/Needs funding/i)).not.toBeInTheDocument();
  });
});

describe("CrmHome — empty states", () => {
  it("shows empty state for funding section when no rows", () => {
    mockQueryResults.push([], []);
    renderPage();
    // Section heading rendered; funding empty-state card text visible.
    expect(screen.getAllByText(/Needs funding/i).length).toBeGreaterThan(0);
    expect(screen.getByText(/All caught up/i)).toBeInTheDocument();
  });

  it("shows empty state for active-subscriptions section when empty", () => {
    mockQueryResults.push([], []);
    renderPage();
    // Multiple "Active subscriptions" elements expected (heading + summary card).
    expect(screen.getAllByText(/Active subscriptions/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/no active subscriptions/i).length).toBeGreaterThan(0);
  });
});

describe("CrmHome — funding row links to week path", () => {
  it("renders a link to the week page for a confirmed funding row", () => {
    mockQueryResults.push([FUNDING_ROW], []);
    renderPage();

    // The week link must point to the subscription week path.
    const expectedPath = `/crm/customers/${CUSTOMER_ID}/subscriptions/${SUB_ID}/week?weekStart=${FUNDING_ROW.week.weekStart}`;
    const allLinks = screen.getAllByRole("link");
    const weekLink = allLinks.find(
      (a) => (a as HTMLAnchorElement).href.includes(`/subscriptions/${SUB_ID}/week`),
    );
    expect(weekLink).toBeTruthy();
    expect((weekLink as HTMLAnchorElement).href).toContain(expectedPath);
  });
});

describe("CrmHome — active subscription row links to customer", () => {
  it("renders a link to the customer page for each active subscription", () => {
    mockQueryResults.push([], [ACTIVE_SUB_ROW]);
    renderPage();

    const allLinks = screen.getAllByRole("link");
    const customerLink = allLinks.find(
      (a) => (a as HTMLAnchorElement).href.includes(`/crm/customers/${CUSTOMER_ID}`),
    );
    expect(customerLink).toBeTruthy();
  });
});
