/**
 * SubscriptionSchedulePage RTL tests — Task T18b (U1).
 *
 * Covers:
 *   - Confirmed week: quantity inputs disabled, Remove button absent, locked banner present.
 *   - Planned week: quantity inputs editable, Add product button present (not locked).
 *   - Loading state (undefined planningData).
 *
 * Mock strategy — ref-identity discrimination:
 *   The first unique useSessionQuery ref seen per render = getPlanningWeek.
 *   useQuery (plain, not session) = menuProducts.queries.list.
 *   useSessionMutation returns a stable vi.fn() for all calls.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";

// ---------------------------------------------------------------------------
// Shared state
// ---------------------------------------------------------------------------

let mockPlanningData: unknown = undefined;
let mockProducts: unknown = undefined;

const _seenRefs: unknown[] = [];
const useSessionQueryMock = vi.fn((query: unknown) => {
  const idx = _seenRefs.indexOf(query);
  if (idx === -1) {
    _seenRefs.push(query);
    return mockPlanningData;
  }
  return mockPlanningData;
});

vi.mock("convex-helpers/react/sessions", () => ({
  useSessionQuery: (...args: unknown[]) => useSessionQueryMock(...args),
  useSessionMutation: vi.fn(() => vi.fn()),
}));

vi.mock("convex/react", () => ({
  useQuery: vi.fn(() => mockProducts),
}));

vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

// WeekBackReferences makes its own useSessionQuery calls — mock to avoid undefined read errors.
vi.mock("@/components/crm/WeekBackReferences", () => ({
  WeekBackReferences: () => <div data-testid="week-back-references" />,
}));

import { SubscriptionSchedulePage } from "../SubscriptionSchedulePage";

// ---------------------------------------------------------------------------
// Fixture data
// ---------------------------------------------------------------------------

const CUSTOMER_ID = "cust_abc" as const;
// Must satisfy #200's isValidConvexId guard (≥20 chars, [A-Za-z0-9_-]) or the
// page renders a "Subscription not found" EmptyState instead of the grid.
const SUB_ID = "jd7c8k2m9n4p5q6r7s8t9" as const;
const WEEK_ID = "week_001" as const;
const PRODUCT_ID = "prod_111" as const;

/** WIB Monday midnight (2026-06-23 00:00 WIB = 2026-06-22 17:00 UTC) */
const WEEK_START = 1_750_550_400_000;

const SUBSCRIPTION_BASE = {
  _id: SUB_ID,
  _creationTime: 1_750_000_000_000,
  customerId: CUSTOMER_ID,
  label: "Crystal Weekly",
  status: "active" as const,
  billingModel: "prepaid_weekly_credit" as const,
  unitPrice: 75000,
  confidentialPrice: false,
  baselineDailyQty: 5,
  weeklyQty: 35,
  deliverByTime: "09:00",
  creditRolloverPolicy: "rollover" as const,
  changeCutoffHour: 13,
  changeCutoffDayOffset: -1,
  permanentChangeNoticeDays: 14,
  terminationNoticeDays: 30,
  cogsBasis: 35000,
  startDate: 1_748_000_000_000,
  scheduleTemplate: [],
  createdBy: "user_001" as const,
};

/** A planned (editable) week with one line on Monday */
const PLANNED_WEEK = {
  _id: WEEK_ID,
  _creationTime: 1_750_000_000_000,
  subscriptionId: SUB_ID,
  weekStart: WEEK_START,
  weekEnd: WEEK_START + 7 * 86_400_000,
  status: "planned" as const,
  plannedDays: [
    {
      date: WEEK_START, // Monday
      deliverByTime: "09:00",
      locked: false,
      items: [{ menuProductId: PRODUCT_ID, productName: "Original 80g", qty: 3, unitPrice: 75000, lineTotal: 225000 }],
    },
  ],
  creditIssued: 0,
  creditConsumed: 0,
  creditRemaining: 0,
  creditExpired: 0,
  shortfall: 0,
  shortfallFault: "none" as const,
  refundDue: 0,
};

/** A confirmed (locked) week with one line on Monday */
const CONFIRMED_WEEK = {
  ...PLANNED_WEEK,
  status: "confirmed" as const,
};

/** A confirmed week whose Monday day is locked:true (as amendConfirmedWeek leaves it).
 *  The whole grid is already edit-locked, so the per-day "past 13:00 cutoff" warning
 *  must be suppressed (I2). */
const CONFIRMED_WEEK_LOCKED_DAY = {
  ...PLANNED_WEEK,
  status: "confirmed" as const,
  plannedDays: [{ ...PLANNED_WEEK.plannedDays[0], locked: true }],
};

/** A planned (editable) week whose Monday day was locked by the cutoff cron.
 *  The grid stays editable, so the warn-not-lock "past 13:00 cutoff" badge SHOULD show (I2). */
const PLANNED_WEEK_LOCKED_DAY = {
  ...PLANNED_WEEK,
  plannedDays: [{ ...PLANNED_WEEK.plannedDays[0], locked: true }],
};

const PRODUCTS = [{ _id: PRODUCT_ID, name: "Original 80g" }];

// ---------------------------------------------------------------------------
// Render helper
// ---------------------------------------------------------------------------

function renderPage(customerId = CUSTOMER_ID, subId = SUB_ID) {
  return render(
    <MemoryRouter
      initialEntries={[`/crm/customers/${customerId}/subscriptions/${subId}/week?weekStart=${WEEK_START}`]}
    >
      <Routes>
        <Route
          path="/crm/customers/:customerId/subscriptions/:subId/week"
          element={<SubscriptionSchedulePage />}
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
  _seenRefs.length = 0;
  // Defaults: confirmed week + products available
  mockPlanningData = { week: CONFIRMED_WEEK, subscription: SUBSCRIPTION_BASE };
  mockProducts = PRODUCTS;
  useSessionQueryMock.mockImplementation((query: unknown) => {
    const idx = _seenRefs.indexOf(query);
    if (idx === -1) {
      _seenRefs.push(query);
    }
    return mockPlanningData;
  });
});

// ---------------------------------------------------------------------------
// Tests — U1: confirmed week locking
// ---------------------------------------------------------------------------

describe("SubscriptionSchedulePage — confirmed week is locked (U1)", () => {
  it("disables quantity inputs when week is confirmed", () => {
    mockPlanningData = { week: CONFIRMED_WEEK, subscription: SUBSCRIPTION_BASE };
    renderPage();
    // Qty fields are numeric text inputs (no spinner arrows) labelled "Quantity".
    const qtyInputs = screen.queryAllByLabelText(/quantity/i);
    // All quantity inputs must be disabled (one per line item)
    expect(qtyInputs.length).toBeGreaterThan(0);
    for (const input of qtyInputs) {
      expect(input).toBeDisabled();
    }
  });

  it("shows locked banner when week is confirmed", () => {
    mockPlanningData = { week: CONFIRMED_WEEK, subscription: SUBSCRIPTION_BASE };
    renderPage();
    // Banner text must mention cannot be edited
    expect(
      screen.getByText(/cannot be edited/i),
    ).toBeInTheDocument();
  });

  it("does not render Add product buttons when week is confirmed", () => {
    mockPlanningData = { week: CONFIRMED_WEEK, subscription: SUBSCRIPTION_BASE };
    renderPage();
    expect(screen.queryAllByRole("button", { name: /add product/i })).toHaveLength(0);
  });

  it("does not render Remove line buttons when week is confirmed", () => {
    mockPlanningData = { week: CONFIRMED_WEEK, subscription: SUBSCRIPTION_BASE };
    renderPage();
    expect(screen.queryAllByRole("button", { name: /remove line/i })).toHaveLength(0);
  });
});

describe("SubscriptionSchedulePage — planned week is editable (U1)", () => {
  it("renders Add product buttons when week is planned", () => {
    mockPlanningData = { week: PLANNED_WEEK, subscription: SUBSCRIPTION_BASE };
    renderPage();
    // 7 day columns → 7 Add product buttons
    expect(screen.getAllByRole("button", { name: /add product/i }).length).toBeGreaterThan(0);
  });

  it("quantity inputs are not disabled when week is planned", () => {
    mockPlanningData = { week: PLANNED_WEEK, subscription: SUBSCRIPTION_BASE };
    renderPage();
    const qtyInputs = screen.queryAllByLabelText(/quantity/i);
    expect(qtyInputs.length).toBeGreaterThan(0);
    for (const input of qtyInputs) {
      expect(input).not.toBeDisabled();
    }
  });

  it("does not show locked banner when week is planned", () => {
    mockPlanningData = { week: PLANNED_WEEK, subscription: SUBSCRIPTION_BASE };
    renderPage();
    // The "cannot be edited" notice should NOT appear for planned weeks
    expect(screen.queryByText(/cannot be edited/i)).not.toBeInTheDocument();
  });
});

describe("SubscriptionSchedulePage — cutoff warning suppressed on locked grids (I2)", () => {
  it("does NOT show the past-cutoff warning when the grid is locked (confirmed week, locked day)", () => {
    mockPlanningData = { week: CONFIRMED_WEEK_LOCKED_DAY, subscription: SUBSCRIPTION_BASE };
    renderPage();
    // Grid is edit-locked (confirmed) → redundant per-day cutoff warning suppressed.
    expect(screen.queryByText(/past 1 PM cutoff/i)).not.toBeInTheDocument();
  });

  it("shows the past-cutoff warning on a planned week with a cron-locked day", () => {
    mockPlanningData = { week: PLANNED_WEEK_LOCKED_DAY, subscription: SUBSCRIPTION_BASE };
    renderPage();
    // Planned week stays editable → warn-not-lock badge is shown for the locked day.
    expect(screen.getByText(/past 1 PM cutoff/i)).toBeInTheDocument();
    // ...and editing is still allowed (Add product button present).
    expect(screen.getAllByRole("button", { name: /add product/i }).length).toBeGreaterThan(0);
  });
});

describe("SubscriptionSchedulePage — loading state", () => {
  it("shows loading when planningData is undefined", () => {
    mockPlanningData = undefined;
    renderPage();
    // Should not show any schedule content — just loading
    expect(screen.queryByText("Crystal Weekly")).not.toBeInTheDocument();
  });
});
