/**
 * T17 — TDD tests for WeekBackReferences.
 *
 * Three back-reference sections on the week page:
 *   1. "Orders that drew down this credit"  → /orders/:id
 *   2. "Ledger entries for this week"        → /crm/customers/:cId/subscriptions/:subId (statement)
 *   3. "Invoice that funded this top-up"     → /invoices/:id
 *
 * CRM principles checked:
 *   A1: each object renders as a real anchor link.
 *   A4: bidirectional — orders, ledger entries, and invoice all link back to canonical pages.
 *   D12: per-section empty states.
 *
 * Mock strategy: vi.mock useSessionQuery at module level; control its return value
 * per test via the exported mockReturn variable. Component is isolated — no full page.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

// ---------------------------------------------------------------------------
// Mock convex-helpers/react/sessions (useSessionQuery only)
// ---------------------------------------------------------------------------

let mockReturn: unknown = undefined;

vi.mock("convex-helpers/react/sessions", () => ({
  useSessionQuery: vi.fn(() => mockReturn),
  useSessionMutation: vi.fn(() => vi.fn()),
}));

import { WeekBackReferences } from "../WeekBackReferences";

// ---------------------------------------------------------------------------
// Fixture ids
// ---------------------------------------------------------------------------

const WEEK_ID = "week_abc123" as const;
const CUSTOMER_ID = "cust_xyz" as const;
const SUB_ID = "sub_pqr" as const;
const ORDER_ID_1 = "order_aaa111" as const;
const ORDER_ID_2 = "order_bbb222" as const;
const LEDGER_ID_1 = "ledger_ccc333" as const;
const LEDGER_ID_2 = "ledger_ddd444" as const;
const INVOICE_ID = "inv_eee555" as const;

// ---------------------------------------------------------------------------
// Fixture payloads
// ---------------------------------------------------------------------------

const FULL_BACK_REFS = {
  orders: [
    {
      _id: ORDER_ID_1,
      _creationTime: 1_750_000_000_000,
      orderNumber: "0625-001",
      customerName: "Crystal Cafe",
      status: "Complete" as const,
      subscriptionWeekId: WEEK_ID,
    },
    {
      _id: ORDER_ID_2,
      _creationTime: 1_750_100_000_000,
      orderNumber: "0625-002",
      customerName: "Crystal Cafe",
      status: "AwaitingDelivery" as const,
      subscriptionWeekId: WEEK_ID,
    },
  ],
  ledgerEntries: [
    {
      _id: LEDGER_ID_1,
      _creationTime: 1_750_000_100_000,
      subscriptionId: SUB_ID,
      subscriptionWeekId: WEEK_ID,
      type: "topup" as const,
      amount: 100000,
      balanceAfter: 100000,
      createdBy: "user_001" as const,
    },
    {
      _id: LEDGER_ID_2,
      _creationTime: 1_750_000_200_000,
      subscriptionId: SUB_ID,
      subscriptionWeekId: WEEK_ID,
      type: "drawdown" as const,
      amount: -75000,
      balanceAfter: 25000,
      createdBy: "user_001" as const,
    },
  ],
  fundingInvoice: {
    _id: INVOICE_ID,
    _creationTime: 1_749_999_000_000,
    invoiceNumber: "INV-2026-0042",
    status: "final" as const,
    subscriptionWeekId: WEEK_ID,
    generatedBy: "user_001" as const,
    updatedAt: 1_750_000_000_000,
    sellerName: "PT Frollie",
    bankName: "BCA",
    bankAccountNumber: "1234567890",
    bankAccountName: "PT Frollie",
    buyerName: "Crystal Cafe",
  },
};

const EMPTY_BACK_REFS = {
  orders: [],
  ledgerEntries: [],
  fundingInvoice: null,
};

// ---------------------------------------------------------------------------
// Render helper
// ---------------------------------------------------------------------------

function renderComponent() {
  return render(
    <MemoryRouter>
      <WeekBackReferences
        subscriptionWeekId={WEEK_ID}
        customerId={CUSTOMER_ID}
        subscriptionId={SUB_ID}
      />
    </MemoryRouter>,
  );
}

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

beforeEach(() => {
  vi.clearAllMocks();
  mockReturn = FULL_BACK_REFS;
});

// ---------------------------------------------------------------------------
// Loading state
// ---------------------------------------------------------------------------

describe("WeekBackReferences — loading state", () => {
  it("renders loading skeleton when query returns undefined", () => {
    mockReturn = undefined;
    renderComponent();
    // Designed skeleton renders while loading (D12)...
    expect(screen.getByTestId("week-backref-skeleton")).toBeInTheDocument();
    // ...and no real section headings yet.
    expect(screen.queryByText(/orders that drew down/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/ledger entries/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/invoice that funded/i)).not.toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// Three section headings
// ---------------------------------------------------------------------------

describe("WeekBackReferences — section headings", () => {
  it("renders all three section headings", () => {
    renderComponent();
    expect(screen.getByText(/orders that drew down this credit/i)).toBeInTheDocument();
    expect(screen.getByText(/ledger entries for this week/i)).toBeInTheDocument();
    expect(screen.getByText(/invoice that funded this top.up/i)).toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// Orders section — links (A1)
// ---------------------------------------------------------------------------

describe("WeekBackReferences — orders section links (A1)", () => {
  it("renders one anchor per order pointing to /orders/:id", () => {
    renderComponent();
    const allLinks = screen.getAllByRole("link");

    const order1Link = allLinks.find(
      (a) => (a as HTMLAnchorElement).href.includes(ORDER_ID_1),
    );
    const order2Link = allLinks.find(
      (a) => (a as HTMLAnchorElement).href.includes(ORDER_ID_2),
    );

    expect(order1Link).toBeTruthy();
    expect(order2Link).toBeTruthy();
    expect((order1Link as HTMLAnchorElement).href).toContain(`/orders/${ORDER_ID_1}`);
    expect((order2Link as HTMLAnchorElement).href).toContain(`/orders/${ORDER_ID_2}`);
  });

  it("renders order number text as link label", () => {
    renderComponent();
    expect(screen.getByText(/0625-001/)).toBeInTheDocument();
    expect(screen.getByText(/0625-002/)).toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// Orders section — empty state (D12)
// ---------------------------------------------------------------------------

describe("WeekBackReferences — orders empty state (D12)", () => {
  it("shows per-section empty state when no orders", () => {
    mockReturn = { ...FULL_BACK_REFS, orders: [] };
    renderComponent();
    expect(screen.getByText(/no orders/i)).toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// Ledger entries section — links (A1)
// ---------------------------------------------------------------------------

describe("WeekBackReferences — ledger entries section links (A1)", () => {
  it("renders one anchor per ledger entry pointing to the subscription statement page", () => {
    renderComponent();
    const allLinks = screen.getAllByRole("link");

    // Ledger entries link to the subscription page (statement view), anchored by ledger id.
    const ledgerLinks = allLinks.filter(
      (a) =>
        (a as HTMLAnchorElement).href.includes(`/subscriptions/${SUB_ID}`) &&
        (a as HTMLAnchorElement).href.includes(`/crm/customers/${CUSTOMER_ID}`),
    );
    // Two ledger entries → two links to the subscription statement page.
    expect(ledgerLinks.length).toBeGreaterThanOrEqual(2);
  });

  it("renders ledger entry type labels", () => {
    renderComponent();
    expect(screen.getByText(/topup/i)).toBeInTheDocument();
    expect(screen.getByText(/drawdown/i)).toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// Ledger entries section — empty state (D12)
// ---------------------------------------------------------------------------

describe("WeekBackReferences — ledger entries empty state (D12)", () => {
  it("shows per-section empty state when no ledger entries", () => {
    mockReturn = { ...FULL_BACK_REFS, ledgerEntries: [] };
    renderComponent();
    expect(screen.getByText(/no ledger entries/i)).toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// Invoice section — link (A1)
// ---------------------------------------------------------------------------

describe("WeekBackReferences — invoice section link (A1)", () => {
  it("renders an anchor pointing to /invoices/:id", () => {
    renderComponent();
    const allLinks = screen.getAllByRole("link");

    const invLink = allLinks.find(
      (a) => (a as HTMLAnchorElement).href.includes(`/invoices/${INVOICE_ID}`),
    );
    expect(invLink).toBeTruthy();
  });

  it("renders invoice number as link label", () => {
    renderComponent();
    expect(screen.getByText(/INV-2026-0042/)).toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// Invoice section — empty state (D12)
// ---------------------------------------------------------------------------

describe("WeekBackReferences — invoice empty state (D12)", () => {
  it("shows per-section empty state when no funding invoice", () => {
    mockReturn = { ...FULL_BACK_REFS, fundingInvoice: null };
    renderComponent();
    expect(screen.getByText(/no invoice/i)).toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// All-empty state
// ---------------------------------------------------------------------------

describe("WeekBackReferences — all sections empty", () => {
  it("renders all three headings with empty messages when data is empty", () => {
    mockReturn = EMPTY_BACK_REFS;
    renderComponent();
    expect(screen.getByText(/orders that drew down this credit/i)).toBeInTheDocument();
    expect(screen.getByText(/ledger entries for this week/i)).toBeInTheDocument();
    expect(screen.getByText(/invoice that funded this top.up/i)).toBeInTheDocument();
    expect(screen.getByText(/no orders/i)).toBeInTheDocument();
    expect(screen.getByText(/no ledger entries/i)).toBeInTheDocument();
    expect(screen.getByText(/no invoice/i)).toBeInTheDocument();
  });
});
