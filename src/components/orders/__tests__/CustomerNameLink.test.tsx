/**
 * T18: Customer-name link on order surfaces (dual surface + kanban).
 *
 * Covers:
 *   - OrderSlideOver renders customer name as <a> linking to /crm/customers/:id
 *     when order.customerId is set.
 *   - OrderSlideOver renders plain text (no anchor) when order.customerId is absent.
 *   - OrderDetail renders customer name as <a> linking to /crm/customers/:id
 *     when order.customer_id_raw is set.
 *   - OrderDetail renders plain text (no anchor) when order.customer_id_raw is null.
 *
 * Follows the same mock pattern as QrisChargeDialog.test.tsx and
 * CustomerDashboard.test.tsx in this project.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";

// ---------------------------------------------------------------------------
// Shared hook mocks
// ---------------------------------------------------------------------------

const sessionQueryMock = vi.fn();
vi.mock("convex-helpers/react/sessions", () => ({
  useSessionQuery: (...args: unknown[]) => sessionQueryMock(...args),
  useSessionMutation: vi.fn(() => vi.fn()),
}));

const authUserMock = vi.fn();
vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => ({ user: authUserMock() }),
}));

vi.mock("convex/react", () => ({
  useMutation: vi.fn(() => vi.fn()),
  useQuery: vi.fn(() => undefined),
}));

vi.mock("sonner", () => ({
  toast: {
    loading: vi.fn(() => "tid"),
    success: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
    dismiss: vi.fn(),
  },
}));

vi.mock("../../../convex/_generated/api", () => ({
  api: {
    orders: {
      queries: { get: "orders.get", getOrderEvents: "orders.getOrderEvents" },
      mutations: { index: { cancel: "orders.cancel" } },
    },
  },
}));

// Avoid JSDOM missing Radix Sheet portal issues.
vi.mock("@/components/ui/sheet", () => ({
  Sheet: ({ open, children }: { open: boolean; children: React.ReactNode }) =>
    open ? <div role="dialog">{children}</div> : null,
  SheetContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  SheetHeader: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  SheetTitle: ({ children }: { children: React.ReactNode }) => <h2>{children}</h2>,
  SheetDescription: ({ children }: { children: React.ReactNode }) => <p>{children}</p>,
}));

vi.mock("@/components/ui/dialog", () => ({
  Dialog: ({ open, children }: { open: boolean; children: React.ReactNode }) =>
    open ? <div role="dialog">{children}</div> : null,
  DialogContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DialogHeader: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DialogTitle: ({ children }: { children: React.ReactNode }) => <h2>{children}</h2>,
  DialogDescription: ({ children }: { children: React.ReactNode }) => <p>{children}</p>,
}));

// Stub heavy sub-components to keep test surface minimal.
vi.mock("@/components/orders/StatusActionButtons", () => ({ StatusActionButtons: () => null }));
vi.mock("@/components/orders/QrisChargeDialog", () => ({ QrisChargeDialog: () => null }));
vi.mock("@/components/orders/AuditTrail", () => ({ AuditTrail: () => null }));
vi.mock("@/components/orders/StepWhatsAppTemplate", () => ({ StepWhatsAppTemplate: () => null }));
vi.mock("@/components/orders/ShippingAgencyButtons", () => ({ ShippingAgencyButtons: () => null }));
vi.mock("@/components/shared", () => ({ ConfirmDialog: () => null }));
vi.mock("@/components/inventory/FulfillFromInventoryButton", () => ({
  FulfillFromInventoryButton: () => null,
}));
vi.mock("@/components/orders/OrderItems", () => ({ OrderItems: () => null }));
vi.mock("@/hooks/convex/useQris", () => ({
  useQrisConfig: vi.fn(() => ({ enabled: false })),
  useActiveQrisPayment: vi.fn(() => undefined),
}));
vi.mock("@/hooks/convex", () => ({
  useDeleteOrder: vi.fn(() => ({ mutateAsync: vi.fn() })),
  useUpdateOrderShipping: vi.fn(() => ({ mutateAsync: vi.fn() })),
  useForceComplete: vi.fn(() => ({ mutateAsync: vi.fn() })),
  useCancelOrder: vi.fn(() => ({ mutateAsync: vi.fn() })),
  useOrder: vi.fn(() => ({ data: undefined, isLoading: true })),
}));

// ---------------------------------------------------------------------------
// Minimal order fixture — fields that OrderSlideOver reads at render time.
// ---------------------------------------------------------------------------

const CUSTOMER_ID = "customers_abc123";
const ORDER_BASE = {
  _id: "orders_xyz" as unknown,
  _creationTime: 1700000000000,
  orderNumber: "0625-001",
  status: "BeingPrepared",
  customerName: "Alice Frollie",
  customerPhone: "08111111111",
  subscriptionId: undefined,
  dueDate: undefined,
  totalAmount: undefined,
  finalTotal: undefined,
  items: [],
  createdBy: "admin",
  createdByUserId: undefined,
  expedited: false,
  deliveryType: "Pickup",
  paymentStatus: "Unpaid",
};

// ---------------------------------------------------------------------------
// OrderSlideOver tests
// ---------------------------------------------------------------------------

import { OrderSlideOver } from "../OrderSlideOver";

function renderSlideOver(order: typeof ORDER_BASE & { customerId?: string }) {
  sessionQueryMock.mockReturnValue(order);
  authUserMock.mockReturnValue({ _id: "u1", name: "Staff", role: "order_staff", token: "tok" });

  return render(
    <MemoryRouter initialEntries={["/orders"]}>
      <OrderSlideOver
        orderId={"orders_xyz" as never}
        open
        onClose={() => {}}
      />
    </MemoryRouter>,
  );
}

describe("OrderSlideOver — customer name link (T18)", () => {
  beforeEach(() => {
    sessionQueryMock.mockReset();
    authUserMock.mockReset();
  });

  it("renders customer name as a link to /crm/customers/:id when customerId is set", () => {
    renderSlideOver({ ...ORDER_BASE, customerId: CUSTOMER_ID });

    const link = screen.getByRole("link", { name: "Alice Frollie" });
    expect(link).toBeInTheDocument();
    expect(link).toHaveAttribute("href", `/crm/customers/${CUSTOMER_ID}`);
  });

  it("renders customer name as plain text (no anchor) when customerId is absent", () => {
    renderSlideOver({ ...ORDER_BASE, customerId: undefined });

    // The name must still be visible.
    expect(screen.getByText("Alice Frollie")).toBeInTheDocument();
    // But NOT wrapped in an anchor.
    const links = screen.queryAllByRole("link", { name: "Alice Frollie" });
    expect(links).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// OrderDetail tests
// ---------------------------------------------------------------------------

// useOrder / useDocumentTitle / etc. need extra mocks for the full-page component.
vi.mock("@/hooks/useDocumentTitle", () => ({ useDocumentTitle: vi.fn() }));
vi.mock("@/components/invoice/InvoiceSidebarCard", () => ({ InvoiceSidebarCard: () => null }));
vi.mock("@/components/orders/EnhancedCancellationDialog", () => ({
  EnhancedCancellationDialog: () => null,
}));
vi.mock("@/components/orders/StatusActionButtons", () => ({ StatusActionButtons: () => null }));
vi.mock("@/components/layout", () => ({
  PageHeader: ({ title }: { title: string }) => <header>{title}</header>,
}));
vi.mock("@/components/shared", () => ({
  LoadingCards: () => <div>loading</div>,
  ConfirmDialog: () => null,
  HoldButton: () => null,
}));
vi.mock("@/components/orders", () => ({
  OrderItems: () => null,
  StepWhatsAppTemplate: () => null,
  ShippingAgencyButtons: () => null,
  EnhancedCancellationDialog: () => null,
}));

import { useOrder } from "@/hooks/convex";
import { OrderDetail } from "@/pages/OrderDetail";

const DETAIL_BASE = {
  id: 1,
  order_number: "0625-001",
  customer_name: "Alice Frollie",
  customer_id: null,
  customer_id_raw: null as string | null,
  subscription_id: null,
  customer_phone: null,
  status: "BeingPrepared",
  payment_status: "Unpaid",
  payment_method: null,
  order_date: "2026-06-25T00:00:00.000Z",
  due_date: null,
  total_amount: 0,
  total_cost: 0,
  total_margin: 0,
  total_discount: 0,
  margin_pct: 0,
  voucher_code: null,
  voucher_discount_value: null,
  final_total: null,
  delivery_fee: null,
  channel: null,
  sold_by: null,
  notes: null,
  delivery_type: "Pickup",
  pickup_location: null,
  delivery_address: null,
  contact_wa: null,
  contact_ig: null,
  shipping_agency: null,
  shipping_number: null,
  cancellation_reason: null,
  awaiting_payment_since: null,
  created_at: "2026-06-25T00:00:00.000Z",
  created_by: "admin",
  items: [],
  whatsapp_text: "",
  payment_request_text: undefined,
  production_started_text: undefined,
  delivery_complete_text: undefined,
  shipping_text: undefined,
  pickup_text: undefined,
};

function renderDetail(customerIdRaw: string | null) {
  const order = { ...DETAIL_BASE, customer_id_raw: customerIdRaw };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (useOrder as any).mockReturnValue({
    data: order,
    isLoading: false,
  });
  authUserMock.mockReturnValue({ _id: "u1", name: "Manager", role: "manager", token: "tok" });

  return render(
    <MemoryRouter initialEntries={["/orders/orders_xyz"]}>
      <Routes>
        <Route path="/orders/:id" element={<OrderDetail />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe("OrderDetail — customer name link (T18)", () => {
  beforeEach(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (useOrder as any).mockReset();
    authUserMock.mockReset();
  });

  it("renders customer name as a link to /crm/customers/:id when customer_id_raw is set", () => {
    renderDetail(CUSTOMER_ID);

    const link = screen.getByRole("link", { name: "Alice Frollie" });
    expect(link).toBeInTheDocument();
    expect(link).toHaveAttribute("href", `/crm/customers/${CUSTOMER_ID}`);
  });

  it("renders customer name as plain text (no anchor) when customer_id_raw is null", () => {
    renderDetail(null);

    expect(screen.getByText("Alice Frollie")).toBeInTheDocument();
    const links = screen.queryAllByRole("link", { name: "Alice Frollie" });
    expect(links).toHaveLength(0);
  });
});
