/**
 * OrderCreate — Slice 3 / T12 "add more" credit-intent prompt.
 *
 * When a customer with an active subscription is selected on a FRESH order, a prompt
 * "This customer has an active subscription with credit — use it?" is surfaced near the
 * SubscriptionSelector. Accepting routes the order submit through the existing credit
 * draw-down (createCreditFundedOrder), NOT the plain create. Declining proceeds with the
 * normal create path and does not re-nag.
 *
 * Mock strategy: stub heavy child components + all convex hooks; keep the REAL
 * SubscriptionSelector (so its sole-sub auto-select wiring exercises). Assert by spying
 * on the credit mutation vs the plain submit path (updateOrderStatus).
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

// ---------------------------------------------------------------------------
// Hoisted spies / fixtures
// ---------------------------------------------------------------------------
const h = vi.hoisted(() => ({
  createCreditSpy: vi.fn(),
  createOrderMutateAsync: vi.fn(),
  updateOrderStatusMutate: vi.fn(),
  deleteOrderMutate: vi.fn(),
  draftMutationSpy: vi.fn(),
  navigateSpy: vi.fn(),
  mockSubs: [] as { subscriptionId: string; label: string; creditRemaining: number | null }[],
}));

// ---------------------------------------------------------------------------
// Router (keep MemoryRouter real, stub navigate)
// ---------------------------------------------------------------------------
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom');
  return { ...actual, useNavigate: () => h.navigateSpy };
});

// ---------------------------------------------------------------------------
// Convex hook / mutation mocks
// ---------------------------------------------------------------------------
vi.mock('@/hooks/convex', () => ({
  usePosProducts: () => ({ data: [], isLoading: false }),
  usePackagingPosProducts: () => ({ data: [] }),
  useCreateOrder: () => ({ mutateAsync: h.createOrderMutateAsync }),
  useUpdateOrderStatus: () => ({ mutate: h.updateOrderStatusMutate }),
  useDeleteOrder: () => ({ mutate: h.deleteOrderMutate }),
}));

vi.mock('convex/react', () => ({
  useQuery: () => undefined,
  useMutation: () => h.draftMutationSpy,
}));

vi.mock('convex-helpers/react/sessions', () => ({
  useSessionQuery: () => undefined,
  useSessionMutation: () => h.createCreditSpy,
}));

vi.mock('@/hooks/useActiveSubscriptionsForCustomer', () => ({
  useActiveSubscriptionsForCustomer: () => ({ subs: h.mockSubs, isLoading: false }),
}));

vi.mock('@/hooks/useSubscriptionCreditContext', () => ({
  useSubscriptionCreditContext: () => ({ contexts: [], isLoading: false }),
}));

vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({
    hasPermission: () => false,
    user: { userId: 'user_1', name: 'Test Staff', role: 'order_staff', token: 'tok' },
  }),
}));

vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn(), loading: vi.fn(), dismiss: vi.fn() },
}));

// ---------------------------------------------------------------------------
// Child component stubs (keep SubscriptionSelector REAL)
// ---------------------------------------------------------------------------
vi.mock('@/components/orders/CustomerSearch', () => ({
  CustomerSearch: ({ onCustomerSelect }: { onCustomerSelect: (id: string, name: string, phone?: string) => void }) => (
    <button onClick={() => onCustomerSelect('cust_1', 'Crystal Corp', '0812')}>select-customer</button>
  ),
}));

vi.mock('@/components/orders/DueDatePills', () => ({
  DueDatePills: ({ onChange }: { onChange: (v: number) => void }) => (
    <button onClick={() => onChange(1700000000000)}>set-due</button>
  ),
}));

vi.mock('@/components/orders/QuickAddressButtons', () => ({
  QuickAddressButtons: () => <div />,
}));

vi.mock('@/components/orders/ProductButtons', () => ({
  ProductButtons: ({ onAddProduct }: { onAddProduct: (p: unknown, q: number) => void }) => (
    <button
      onClick={() =>
        onAddProduct(
          { _id: 'prod_1', code: 'P1', name: 'Prod 1', defaultPrice: 50000, unitCost: 10000, grams: 80 },
          1,
        )
      }
    >
      add-product
    </button>
  ),
}));

vi.mock('@/components/orders/SwipeableLineItem', () => ({
  SwipeableLineItem: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

vi.mock('@/components/orders/VoucherInput', () => ({
  VoucherInput: () => <div />,
}));

vi.mock('@/components/orders/ManagerOverrideDialog', () => ({
  ManagerOverrideDialog: () => <div />,
}));

vi.mock('@/components/orders/LowPriceWarningDialog', () => ({
  LowPriceWarningDialog: () => <div />,
}));

vi.mock('@/components/orders/SubscriptionCreditBanner', () => ({
  SubscriptionCreditBanner: ({ onFulfilWithCredit }: { onFulfilWithCredit: () => void }) => (
    <button onClick={onFulfilWithCredit}>banner-fulfil</button>
  ),
}));

vi.mock('@/components/layout', () => ({
  PageHeader: ({ title }: { title: string }) => <h1>{title}</h1>,
}));

import { OrderCreate } from '../OrderCreate';

const PROMPT = /active subscription with credit/i;

function renderPage() {
  return render(
    <MemoryRouter>
      <OrderCreate />
    </MemoryRouter>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  h.mockSubs = [{ subscriptionId: 'sub_1', label: 'Crystal weekly', creditRemaining: 500000 }];
  h.draftMutationSpy.mockResolvedValue({ orderId: 'draft_1', customerId: 'cust_1' });
  h.createCreditSpy.mockResolvedValue({ orderId: 'credit_1' });
  h.createOrderMutateAsync.mockResolvedValue('order_new');
  h.updateOrderStatusMutate.mockResolvedValue(undefined);
  h.deleteOrderMutate.mockResolvedValue(undefined);
});

describe('OrderCreate — "add more" subscription-credit prompt (T12)', () => {
  it('surfaces the prompt when a customer with an active subscription is selected', async () => {
    renderPage();
    expect(screen.queryByText(PROMPT)).not.toBeInTheDocument();
    fireEvent.click(screen.getByText('select-customer'));
    expect(await screen.findByText(PROMPT)).toBeInTheDocument();
  });

  it('ACCEPT routes submit through createCreditFundedOrder, not the plain create', async () => {
    renderPage();
    fireEvent.click(screen.getByText('select-customer'));
    await screen.findByText(PROMPT);

    fireEvent.click(screen.getByRole('button', { name: /use subscription credit/i }));
    fireEvent.click(screen.getByText('add-product'));
    fireEvent.click(screen.getByText('set-due'));
    fireEvent.click(screen.getByRole('button', { name: /submit order/i }));

    await waitFor(() => expect(h.createCreditSpy).toHaveBeenCalledTimes(1));
    expect(h.createCreditSpy).toHaveBeenCalledWith(expect.objectContaining({ subscriptionId: 'sub_1' }));
    // Plain create path must NOT run
    expect(h.createOrderMutateAsync).not.toHaveBeenCalled();
    expect(h.updateOrderStatusMutate).not.toHaveBeenCalled();
  });

  it('DECLINE proceeds with the plain create path and does not re-nag', async () => {
    renderPage();
    fireEvent.click(screen.getByText('select-customer'));
    await screen.findByText(PROMPT);

    fireEvent.click(screen.getByRole('button', { name: /no, normal order/i }));
    // No re-nag
    expect(screen.queryByText(PROMPT)).not.toBeInTheDocument();

    fireEvent.click(screen.getByText('add-product'));
    fireEvent.click(screen.getByText('set-due'));
    fireEvent.change(screen.getByPlaceholderText(/enter delivery address/i), {
      target: { value: 'Jalan Test 123' },
    });
    fireEvent.click(screen.getByRole('button', { name: /submit order/i }));

    await waitFor(() => expect(h.updateOrderStatusMutate).toHaveBeenCalled());
    expect(h.createCreditSpy).not.toHaveBeenCalled();
  });
});
