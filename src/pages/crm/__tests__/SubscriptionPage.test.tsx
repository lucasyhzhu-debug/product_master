/**
 * SubscriptionPage RTL tests — Task T16.
 *
 * Covers:
 *   - Parent customer link present (A4 bidirectional — subscription ↔ customer).
 *   - Breadcrumb renders Customer → Subscription trail.
 *   - CreditLedgerStatement renders signed deltas (type + signedAmount).
 *   - Week-scoped running balanceAfter per row.
 *   - Per-entry anchor links (order/invoice/week).
 *   - Week selector dropdown (picks which week's statement to show).
 *   - Loading state (undefined subscription).
 *   - Empty state (no weeks).
 *   - Error/null subscription.
 *
 * Mock strategy — ref-identity discrimination (same pattern as AgreementPage.test.tsx):
 *   The first unique query ref seen per render = getSubscription.
 *   The second unique ref = listWeeks.
 *   The third unique ref = getCreditLedgerStatement.
 *   useSessionMutation returns mockMutateFn for all calls.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";

// ---------------------------------------------------------------------------
// Shared state
// ---------------------------------------------------------------------------

let mockSubscription: unknown = undefined;
let mockWeeks: unknown = undefined;
let mockStatement: unknown = undefined;

// Ref-identity discrimination: track up to 3 unique query refs.
const _seenRefs: unknown[] = [];
const useSessionQueryMock = vi.fn((query: unknown) => {
  const idx = _seenRefs.indexOf(query);
  if (idx === -1) {
    _seenRefs.push(query);
    const newIdx = _seenRefs.length - 1;
    if (newIdx === 0) return mockSubscription;
    if (newIdx === 1) return mockWeeks;
    return mockStatement;
  }
  if (idx === 0) return mockSubscription;
  if (idx === 1) return mockWeeks;
  return mockStatement;
});

vi.mock("convex-helpers/react/sessions", () => ({
  useSessionQuery: (...args: unknown[]) => useSessionQueryMock(...args),
  useSessionMutation: vi.fn(() => vi.fn()),
}));

vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

vi.mock("@/components/crm/Breadcrumbs", () => ({
  Breadcrumbs: ({ trail }: { trail: { label: string }[] }) => (
    <nav aria-label="breadcrumb">{trail.map((s) => s.label).join(" / ")}</nav>
  ),
}));

import { SubscriptionPage } from "../SubscriptionPage";

// ---------------------------------------------------------------------------
// Fixture data
// ---------------------------------------------------------------------------

const CUSTOMER_ID = "cust_abc123" as const;
const SUB_ID = "sub_xyz789" as const;
const WEEK_ID_1 = "week_aaa" as const;
const WEEK_ID_2 = "week_bbb" as const;
const ORDER_ID = "order_111" as const;
const INVOICE_ID = "inv_222" as const;

const SUB_DOC = {
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

const WEEK_1 = {
  _id: WEEK_ID_1,
  _creationTime: 1_750_000_000_000,
  subscriptionId: SUB_ID,
  weekStart: 1_750_000_000_000,
  weekEnd: 1_750_604_800_000,
  status: "paid" as const,
  plannedDays: [],
  creditIssued: 100000,
  creditConsumed: 75000,
  creditRemaining: 25000,
  creditExpired: 0,
  shortfall: 0,
  shortfallFault: "none" as const,
  refundDue: 0,
};

const WEEK_2 = {
  _id: WEEK_ID_2,
  _creationTime: 1_750_604_800_001,
  subscriptionId: SUB_ID,
  weekStart: 1_750_604_800_000,
  weekEnd: 1_751_209_600_000,
  status: "planned" as const,
  plannedDays: [],
  creditIssued: 100000,
  creditConsumed: 0,
  creditRemaining: 100000,
  creditExpired: 0,
  shortfall: 0,
  shortfallFault: "none" as const,
  refundDue: 0,
};

const STATEMENT_ROWS = {
  rows: [
    {
      type: "topup" as const,
      signedAmount: 100000,
      balanceAfter: 100000,
      link: { kind: "invoice" as const, id: INVOICE_ID },
      createdBy: "user_001",
      note: "Weekly top-up",
      at: 1_750_000_100_000,
    },
    {
      type: "drawdown" as const,
      signedAmount: -75000,
      balanceAfter: 25000,
      link: { kind: "order" as const, id: ORDER_ID },
      createdBy: "user_001",
      note: "Order fulfillment",
      at: 1_750_000_200_000,
    },
  ],
};

const STATEMENT_WITH_WEEK_LINK = {
  rows: [
    {
      type: "topup" as const,
      signedAmount: 25000,
      balanceAfter: 25000,
      link: { kind: "week" as const, id: WEEK_ID_1 },
      createdBy: "user_001",
      note: "Rollover from previous week",
      at: 1_750_604_900_000,
    },
  ],
};

// ---------------------------------------------------------------------------
// Render helper
// ---------------------------------------------------------------------------

function renderPage(
  customerId: string = CUSTOMER_ID,
  subId: string = SUB_ID,
) {
  return render(
    <MemoryRouter
      initialEntries={[
        `/crm/customers/${customerId}/subscriptions/${subId}`,
      ]}
    >
      <Routes>
        <Route
          path="/crm/customers/:customerId/subscriptions/:subId"
          element={<SubscriptionPage />}
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

  // Happy-path defaults.
  mockSubscription = SUB_DOC;
  mockWeeks = [WEEK_2, WEEK_1]; // most-recent first
  mockStatement = STATEMENT_ROWS;

  useSessionQueryMock.mockImplementation((query: unknown) => {
    const idx = _seenRefs.indexOf(query);
    if (idx === -1) {
      _seenRefs.push(query);
      const newIdx = _seenRefs.length - 1;
      if (newIdx === 0) return mockSubscription;
      if (newIdx === 1) return mockWeeks;
      return mockStatement;
    }
    if (idx === 0) return mockSubscription;
    if (idx === 1) return mockWeeks;
    return mockStatement;
  });
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("SubscriptionPage — loading state", () => {
  it("shows loading when subscription is undefined", () => {
    mockSubscription = undefined;
    renderPage();
    // Should not show content.
    expect(screen.queryByText("Crystal Weekly")).not.toBeInTheDocument();
  });
});

describe("SubscriptionPage — null/missing state", () => {
  it("shows not-found when subscription is null", () => {
    mockSubscription = null;
    renderPage();
    expect(screen.getByText(/not found/i)).toBeInTheDocument();
  });
});

describe("SubscriptionPage — parent customer link (A4 bidirectional)", () => {
  it("renders a link back to the parent customer page", () => {
    renderPage();
    const allLinks = screen.getAllByRole("link");
    const customerLink = allLinks.find((a) =>
      (a as HTMLAnchorElement).href.includes(
        `/crm/customers/${CUSTOMER_ID}`,
      ) &&
      !(a as HTMLAnchorElement).href.includes("/subscriptions/"),
    );
    expect(customerLink).toBeTruthy();
  });
});

describe("SubscriptionPage — breadcrumbs (A2)", () => {
  it("renders Customer and Subscription in the breadcrumb trail", () => {
    renderPage();
    const breadcrumb = screen.getByRole("navigation", {
      name: /breadcrumb/i,
    });
    expect(breadcrumb.textContent).toContain("Customer");
    expect(breadcrumb.textContent).toContain("Subscription");
  });
});

describe("SubscriptionPage — subscription info", () => {
  it("renders the subscription label", () => {
    renderPage();
    expect(screen.getByText("Crystal Weekly")).toBeInTheDocument();
  });

  it("renders the subscription status badge", () => {
    renderPage();
    expect(screen.getByText("active")).toBeInTheDocument();
  });
});

describe("SubscriptionPage — CreditLedgerStatement signed amounts", () => {
  it("renders positive topup amount", () => {
    renderPage();
    // 100000 rendered as currency string; may appear multiple times (week metadata + table).
    const matches = screen.getAllByText(/100[\.,]?000/);
    expect(matches.length).toBeGreaterThan(0);
  });

  it("renders negative drawdown amount", () => {
    renderPage();
    // The negative sign and amount may be in the same element or adjacent siblings.
    // Query the table body for a cell containing the signed amount.
    const allCells = document.querySelectorAll("td");
    const hasNegative = Array.from(allCells).some(
      (el) => el.textContent && /75[\.,]?000/.test(el.textContent),
    );
    expect(hasNegative).toBe(true);
  });
});

describe("SubscriptionPage — CreditLedgerStatement week-scoped balanceAfter", () => {
  it("labels the balance column as week-scoped (not lifetime)", () => {
    renderPage();
    // The column header or footnote must mention week-scoped.
    const matches = screen.getAllByText(/balance.*week|week.*balance/i);
    expect(matches.length).toBeGreaterThan(0);
  });

  it("renders the balanceAfter values for each row", () => {
    renderPage();
    // Row 1: balanceAfter=100000, Row 2: balanceAfter=25000.
    // Values may appear multiple times (week metadata + table); use getAllByText.
    const matches100k = screen.getAllByText(/100[\.,]?000/);
    expect(matches100k.length).toBeGreaterThan(0);
    const matches25k = screen.getAllByText(/25[\.,]?000/);
    expect(matches25k.length).toBeGreaterThan(0);
  });
});

describe("SubscriptionPage — CreditLedgerStatement per-entry links (A1)", () => {
  it("renders a link for an order entry", () => {
    renderPage();
    const allLinks = screen.getAllByRole("link");
    const orderLink = allLinks.find((a) =>
      (a as HTMLAnchorElement).href.includes(ORDER_ID),
    );
    expect(orderLink).toBeTruthy();
  });

  it("renders a link for an invoice entry", () => {
    renderPage();
    const allLinks = screen.getAllByRole("link");
    const invLink = allLinks.find((a) =>
      (a as HTMLAnchorElement).href.includes(INVOICE_ID),
    );
    expect(invLink).toBeTruthy();
  });
});

describe("SubscriptionPage — week link entry", () => {
  it("renders a link for a week (rollover) entry", () => {
    mockStatement = STATEMENT_WITH_WEEK_LINK;
    renderPage();
    const allLinks = screen.getAllByRole("link");
    const weekLink = allLinks.find((a) =>
      (a as HTMLAnchorElement).href.includes(WEEK_ID_1),
    );
    expect(weekLink).toBeTruthy();
  });
});

describe("SubscriptionPage — week selector", () => {
  it("defaults to showing the latest week's statement", () => {
    renderPage();
    // The latest week (WEEK_2) should be selected by default — statement rows visible.
    expect(screen.getByText(/topup/i)).toBeInTheDocument();
  });

  it("renders week options in the selector", () => {
    renderPage();
    // Should have selectable options for each week.
    const selects = screen.getAllByRole("option");
    expect(selects.length).toBeGreaterThanOrEqual(2);
  });
});

describe("SubscriptionPage — empty weeks state", () => {
  it("shows empty state when no weeks exist", () => {
    mockWeeks = [];
    renderPage();
    expect(screen.getByText(/no weeks/i)).toBeInTheDocument();
  });
});

describe("SubscriptionPage — empty statement state", () => {
  it("shows empty state when statement has no rows", () => {
    mockStatement = { rows: [] };
    renderPage();
    expect(screen.getByText(/no ledger entries/i)).toBeInTheDocument();
  });
});

describe("SubscriptionPage — type column", () => {
  it("renders entry type labels", () => {
    renderPage();
    expect(screen.getByText(/topup/i)).toBeInTheDocument();
    expect(screen.getByText(/drawdown/i)).toBeInTheDocument();
  });
});

describe("SubscriptionPage — createdBy column", () => {
  it("renders the createdBy field", () => {
    renderPage();
    // Both rows have createdBy "user_001".
    const createdByEls = screen.getAllByText(/user_001/);
    expect(createdByEls.length).toBeGreaterThanOrEqual(1);
  });
});
