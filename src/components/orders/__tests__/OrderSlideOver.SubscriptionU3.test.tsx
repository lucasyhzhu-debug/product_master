/**
 * OrderSlideOver — U3 subscription edit-affordance suppression tests (Task T18b).
 *
 * Verifies that on a subscription order (subscriptionId set):
 *   - OrderItems receives canEditDeliveryFee=false (delivery fee Edit is suppressed).
 *
 * On a normal order (no subscriptionId):
 *   - OrderItems receives canEditDeliveryFee=true (for non-terminal statuses).
 *
 * Mock strategy: mock all heavy hooks + child components. Assert by checking
 * whether OrderItems receives the correct canEditDeliveryFee prop.
 *
 * DUAL SURFACE NOTE (Pitfall #20): OrderDetail counterpart tested in
 * src/pages/__tests__/OrderDetail.SubscriptionU3.test.tsx.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

// ---------------------------------------------------------------------------
// Mock child components
// ---------------------------------------------------------------------------

// Capture canEditDeliveryFee prop passed to OrderItems
let capturedCanEditDeliveryFee: boolean | undefined;
vi.mock("./OrderItems", () => ({
  OrderItems: (props: { canEditDeliveryFee?: boolean }) => {
    capturedCanEditDeliveryFee = props.canEditDeliveryFee;
    return <div data-testid="order-items">order-items</div>;
  },
}));

// Remap the barrel import that OrderSlideOver uses
vi.mock("@/components/orders/OrderItems", () => ({
  OrderItems: (props: { canEditDeliveryFee?: boolean }) => {
    capturedCanEditDeliveryFee = props.canEditDeliveryFee;
    return <div data-testid="order-items">order-items</div>;
  },
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

vi.mock("@/components/orders/StepWhatsAppTemplate", () => ({
  StepWhatsAppTemplate: () => <div />,
}));

vi.mock("@/components/orders/ShippingAgencyButtons", () => ({
  ShippingAgencyButtons: () => <div />,
}));

vi.mock("@/components/inventory/FulfillFromInventoryButton", () => ({
  FulfillFromInventoryButton: () => <div />,
}));

vi.mock("@/components/shared", () => ({
  ConfirmDialog: () => <div />,
}));

vi.mock("@/components/ui/sheet", () => ({
  Sheet: ({ children, open }: { children: React.ReactNode; open: boolean }) =>
    open ? <div data-testid="sheet">{children}</div> : null,
  SheetContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  SheetHeader: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  SheetTitle: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  SheetDescription: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

vi.mock("@/components/ui/dialog", () => ({
  Dialog: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DialogContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DialogHeader: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DialogTitle: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DialogDescription: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

// ---------------------------------------------------------------------------
// Hook mocks
// ---------------------------------------------------------------------------

let mockOrder: unknown = undefined;
let mockUserRole = "manager";

vi.mock("convex-helpers/react/sessions", () => ({
  useSessionQuery: vi.fn(() => mockOrder),
  useSessionMutation: vi.fn(() => vi.fn()),
}));

vi.mock("convex/react", () => ({
  useMutation: vi.fn(() => vi.fn()),
}));

vi.mock("@/hooks/convex/useQris", () => ({
  useQrisConfig: vi.fn(() => ({ enabled: false })),
  useActiveQrisPayment: vi.fn(() => null),
}));

vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => ({ user: { role: mockUserRole, token: "test-token" } }),
}));

vi.mock("@/hooks/convex", () => ({
  useDeleteOrder: vi.fn(() => ({ mutate: vi.fn() })),
  useUpdateOrderShipping: vi.fn(() => ({ mutate: vi.fn() })),
  useForceComplete: vi.fn(() => ({ mutate: vi.fn() })),
}));

vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn(), loading: vi.fn(), dismiss: vi.fn() },
}));

import React from "react";
import { OrderSlideOver } from "../OrderSlideOver";
import { useSessionQuery } from "convex-helpers/react/sessions";

// ---------------------------------------------------------------------------
// Fixture data
// ---------------------------------------------------------------------------

const ORDER_ID = "order_111" as const;

/** Normal order (no subscriptionId) */
const NORMAL_ORDER = {
  _id: ORDER_ID,
  _creationTime: 1_750_000_000_000,
  orderNumber: "0623-001",
  status: "AwaitingPayment" as const,
  customerName: "Crystal Corp",
  customerPhone: "+62812345678",
  customerId: "cust_abc",
  deliveryType: "Pickup" as const,
  items: [],
  totalAmount: 100000,
  orderLevelDiscount: 0,
  orderLevelDiscountType: null,
  voucherCode: null,
  voucherDiscountValue: null,
  finalTotal: 100000,
  deliveryFee: 0,
  // No subscriptionId
};

/** Subscription order (subscriptionId set) */
const SUBSCRIPTION_ORDER = {
  ...NORMAL_ORDER,
  subscriptionId: "sub_xyz",
};

// ---------------------------------------------------------------------------
// Render helper
// ---------------------------------------------------------------------------

function renderSlideOver(order: unknown = NORMAL_ORDER) {
  mockOrder = order;
  (useSessionQuery as ReturnType<typeof vi.fn>).mockReturnValue(order);
  return render(
    <MemoryRouter>
      <OrderSlideOver
        orderId={ORDER_ID as Parameters<typeof OrderSlideOver>[0]["orderId"]}
        open={true}
        onClose={vi.fn()}
      />
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
  mockOrder = NORMAL_ORDER;
  (useSessionQuery as ReturnType<typeof vi.fn>).mockReturnValue(NORMAL_ORDER);
});

// ---------------------------------------------------------------------------
// Tests — U3: subscription order suppresses delivery fee Edit in OrderSlideOver
// ---------------------------------------------------------------------------

describe("OrderSlideOver — subscription order suppresses delivery fee Edit (U3)", () => {
  it("passes canEditDeliveryFee=false to OrderItems for a subscription order", () => {
    renderSlideOver(SUBSCRIPTION_ORDER);
    expect(capturedCanEditDeliveryFee).toBe(false);
  });
});

describe("OrderSlideOver — normal order shows delivery fee Edit (U3)", () => {
  it("passes canEditDeliveryFee=true to OrderItems for a normal non-terminal order", () => {
    renderSlideOver(NORMAL_ORDER);
    expect(capturedCanEditDeliveryFee).toBe(true);
  });
});
