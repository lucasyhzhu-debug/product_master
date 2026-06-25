/**
 * OrderDetail — U3 subscription edit-affordance suppression tests (Task T18b).
 *
 * Verifies that on a subscription order (subscriptionId set):
 *   - InvoiceSidebarCard (Generate Invoice) is NOT rendered.
 *   - OrderItems receives canEditDeliveryFee=false (delivery fee Edit is suppressed).
 *
 * On a normal order (no subscriptionId):
 *   - InvoiceSidebarCard IS rendered (when user is manager/admin).
 *   - OrderItems receives canEditDeliveryFee=true (for non-terminal statuses).
 *
 * Mock strategy: mock all heavy hooks + child components. We assert by checking
 * whether the mocked InvoiceSidebarCard placeholder renders and whether
 * OrderItems receives the correct canEditDeliveryFee prop.
 *
 * DUAL SURFACE NOTE (Pitfall #20): OrderSlideOver counterpart tested in
 * src/components/orders/__tests__/OrderSlideOver.SubscriptionU3.test.tsx.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";

// ---------------------------------------------------------------------------
// Mock child components to keep the test surface small
// ---------------------------------------------------------------------------

// Capture canEditDeliveryFee prop passed to OrderItems
let capturedCanEditDeliveryFee: boolean | undefined;
vi.mock("@/components/orders", () => ({
  OrderItems: (props: { canEditDeliveryFee?: boolean }) => {
    capturedCanEditDeliveryFee = props.canEditDeliveryFee;
    return <div data-testid="order-items">order-items</div>;
  },
  StepWhatsAppTemplate: () => <div />,
  ShippingAgencyButtons: () => <div />,
  EnhancedCancellationDialog: () => <div />,
}));

vi.mock("@/components/invoice/InvoiceSidebarCard", () => ({
  InvoiceSidebarCard: () => <div data-testid="invoice-sidebar-card">invoice</div>,
}));

vi.mock("@/components/orders/StatusActionButtons", () => ({
  StatusActionButtons: () => <div />,
}));

vi.mock("@/components/orders/QrisChargeDialog", () => ({
  QrisChargeDialog: () => <div />,
}));

vi.mock("@/components/orders/AuditTrail", () => ({
  AuditTrail: () => <div />,
}));

vi.mock("@/components/inventory/FulfillFromInventoryButton", () => ({
  FulfillFromInventoryButton: () => <div />,
}));

vi.mock("@/components/shared", () => ({
  LoadingCards: () => <div />,
  ConfirmDialog: () => <div />,
  HoldButton: () => <div />,
}));

vi.mock("@/components/layout", () => ({
  PageHeader: ({ title }: { title: string }) => <h1>{title}</h1>,
}));

// ---------------------------------------------------------------------------
// Hook mocks
// ---------------------------------------------------------------------------

let mockOrderData: unknown = undefined;
let mockUserRole = "manager";

vi.mock("@/hooks/convex", () => ({
  useOrder: vi.fn(() => ({ data: mockOrderData, isLoading: false })),
  useDeleteOrder: vi.fn(() => ({ mutate: vi.fn() })),
  useUpdateOrderShipping: vi.fn(() => ({ mutate: vi.fn() })),
  useCancelOrder: vi.fn(() => ({ mutate: vi.fn() })),
  useForceComplete: vi.fn(() => ({ mutate: vi.fn() })),
}));

vi.mock("@/hooks/convex/useQris", () => ({
  useQrisConfig: vi.fn(() => ({ enabled: false })),
  useActiveQrisPayment: vi.fn(() => null),
}));

vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => ({ user: { role: mockUserRole, token: "test-token" } }),
}));

vi.mock("convex/react", () => ({
  useQuery: vi.fn(() => []),
}));

vi.mock("@/hooks/useDocumentTitle", () => ({
  useDocumentTitle: vi.fn(),
}));

vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn(), loading: vi.fn(), dismiss: vi.fn() },
}));

import { OrderDetail } from "../OrderDetail";
import { useOrder } from "@/hooks/convex";

// ---------------------------------------------------------------------------
// Fixture data
// ---------------------------------------------------------------------------

const ORDER_ID = "order_111" as const;

/** Normal order (no subscriptionId) */
const NORMAL_ORDER = {
  _id: ORDER_ID,
  order_number: "0623-001",
  status: "AwaitingPayment" as const,
  customer_name: "Crystal Corp",
  customer_phone: "+62812345678",
  customer_id_raw: "cust_abc",
  delivery_type: "Pickup" as const,
  items: [],
  total_amount: 100000,
  total_discount: 0,
  final_total: 100000,
  delivery_fee: 0,
  // No subscriptionId
};

/** Subscription order (subscriptionId set) */
const SUBSCRIPTION_ORDER = {
  ...NORMAL_ORDER,
  subscription_id: "sub_xyz",
};

// ---------------------------------------------------------------------------
// Render helper
// ---------------------------------------------------------------------------

function renderPage(orderId = ORDER_ID) {
  return render(
    <MemoryRouter initialEntries={[`/orders/${orderId}`]}>
      <Routes>
        <Route path="/orders/:id" element={<OrderDetail />} />
      </Routes>
    </MemoryRouter>,
  );
}

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

beforeEach(() => {
  vi.clearAllMocks();
  capturedCanEditDeliveryFee = undefined;
  mockUserRole = "manager";
  mockOrderData = NORMAL_ORDER;
  // Reset useOrder to return mockOrderData
  (useOrder as ReturnType<typeof vi.fn>).mockImplementation(() => ({
    data: mockOrderData,
    isLoading: false,
  }));
});

// ---------------------------------------------------------------------------
// Tests — U3: subscription order suppresses Generate Invoice + delivery fee Edit
// ---------------------------------------------------------------------------

describe("OrderDetail — subscription order suppresses affordances (U3)", () => {
  it("does NOT render InvoiceSidebarCard for a subscription order", () => {
    mockOrderData = SUBSCRIPTION_ORDER;
    (useOrder as ReturnType<typeof vi.fn>).mockImplementation(() => ({
      data: SUBSCRIPTION_ORDER,
      isLoading: false,
    }));
    renderPage();
    expect(screen.queryByTestId("invoice-sidebar-card")).not.toBeInTheDocument();
  });

  it("passes canEditDeliveryFee=false to OrderItems for a subscription order", () => {
    mockOrderData = SUBSCRIPTION_ORDER;
    (useOrder as ReturnType<typeof vi.fn>).mockImplementation(() => ({
      data: SUBSCRIPTION_ORDER,
      isLoading: false,
    }));
    renderPage();
    expect(capturedCanEditDeliveryFee).toBe(false);
  });
});

describe("OrderDetail — normal order shows affordances (U3)", () => {
  it("renders InvoiceSidebarCard for a normal order (manager)", () => {
    mockOrderData = NORMAL_ORDER;
    (useOrder as ReturnType<typeof vi.fn>).mockImplementation(() => ({
      data: NORMAL_ORDER,
      isLoading: false,
    }));
    renderPage();
    expect(screen.getByTestId("invoice-sidebar-card")).toBeInTheDocument();
  });

  it("passes canEditDeliveryFee=true to OrderItems for a normal non-terminal order", () => {
    mockOrderData = NORMAL_ORDER;
    (useOrder as ReturnType<typeof vi.fn>).mockImplementation(() => ({
      data: NORMAL_ORDER,
      isLoading: false,
    }));
    renderPage();
    expect(capturedCanEditDeliveryFee).toBe(true);
  });
});
