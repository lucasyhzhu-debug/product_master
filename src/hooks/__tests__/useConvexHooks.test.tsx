import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook } from '@testing-library/react';

// Mock convex/react
vi.mock('convex/react', () => ({
  useQuery: vi.fn(),
  useMutation: vi.fn(() => vi.fn()),
}));

// gap#2: useOrder / useOrderByNumber / useKitchenOrders now use useSessionQuery
// (protectedQuery — server strips confidential subscription pricing).
vi.mock('convex-helpers/react/sessions', () => ({
  useSessionQuery: vi.fn(),
  useSessionMutation: vi.fn(() => vi.fn()),
}));

// Mock sonner toast
vi.mock('sonner', () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
  },
}));

// Mock the convex API
vi.mock('../../../convex/_generated/api', () => ({
  api: {
    orders: {
      queries: {
        list: 'orders.queries.list',
        get: 'orders.queries.get',
        getByOrderNumber: 'orders.queries.getByOrderNumber',
        getKitchenOrders: 'orders.queries.getKitchenOrders',
        getByCustomer: 'orders.queries.getByCustomer',
        getProductSuggestions: 'orders.queries.getProductSuggestions',
        getSellerSuggestions: 'orders.queries.getSellerSuggestions',
        getChannelSuggestions: 'orders.queries.getChannelSuggestions',
      },
      mutations: {
        index: {
          create: 'orders.mutations.index.create',
          updateStatus: 'orders.mutations.index.updateStatus',
          updatePayment: 'orders.mutations.index.updatePayment',
          updateShipping: 'orders.mutations.index.updateShipping',
          updateDetails: 'orders.mutations.index.updateDetails',
          cancel: 'orders.mutations.index.cancel',
          remove: 'orders.mutations.index.remove',
          addItem: 'orders.mutations.index.addItem',
          removeItem: 'orders.mutations.index.removeItem',
          updateItemQuantity: 'orders.mutations.index.updateItemQuantity',
        },
      },
      whatsapp: {
        getMessage: 'orders.whatsapp.getMessage',
      },
    },
  },
}));

import { useQuery, useMutation } from 'convex/react';
import { useSessionQuery } from 'convex-helpers/react/sessions';
import {
  useOrders,
  useOrder,
  useKitchenOrders,
  useCreateOrder,
  useUpdateOrderStatus,
} from '../convex/useOrders';
import type { Id } from '../../../convex/_generated/dataModel';

const mockUseQuery = vi.mocked(useQuery);
const mockUseSessionQuery = vi.mocked(useSessionQuery);
const mockUseMutation = vi.mocked(useMutation);

describe('useOrders hooks', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('useOrders', () => {
    it('returns isLoading true while data is undefined', () => {
      mockUseQuery.mockReturnValue(undefined);

      const { result } = renderHook(() => useOrders());

      expect(result.current.data).toBeUndefined();
      expect(result.current.isLoading).toBe(true);
    });

    it('returns transformed order data when loaded', () => {
      const mockOrders = [
        {
          _id: 'order1',
          _creationTime: Date.now(),
          orderNumber: '0131-001',
          customerId: 'cust1',
          customerName: 'John Doe',
          status: 'Draft',
          paymentStatus: 'Unpaid',
          orderDate: Date.now(),
          totalAmount: 50000,
          totalCost: 30000,
          totalMargin: 20000,
          itemCount: 2,
        },
      ];
      mockUseQuery.mockReturnValue(mockOrders);

      const { result } = renderHook(() => useOrders());

      expect(result.current.isLoading).toBe(false);
      expect(result.current.data).toBeDefined();
      expect(result.current.data?.[0]).toHaveProperty('order_number', '0131-001');
      expect(result.current.data?.[0]).toHaveProperty('customer_name', 'John Doe');
    });

    it('handles empty orders list', () => {
      mockUseQuery.mockReturnValue([]);

      const { result } = renderHook(() => useOrders());

      expect(result.current.isLoading).toBe(false);
      expect(result.current.data).toEqual([]);
    });

    it('passes filter parameters to query', () => {
      mockUseQuery.mockReturnValue([]);
      const filters = { status: 'Draft', limit: 10 };

      renderHook(() => useOrders(filters));

      expect(mockUseQuery).toHaveBeenCalledWith('orders.queries.list', filters);
    });
  });

  describe('useOrder', () => {
    it('returns isLoading true when id is provided but data is undefined', () => {
      mockUseSessionQuery.mockReturnValue(undefined);
      const orderId = 'order123' as Id<'orders'>;

      const { result } = renderHook(() => useOrder(orderId));

      expect(result.current.data).toBeUndefined();
      expect(result.current.isLoading).toBe(true);
    });

    it('returns null when order not found', () => {
      mockUseSessionQuery.mockReturnValue(null);
      const orderId = 'order123' as Id<'orders'>;

      const { result } = renderHook(() => useOrder(orderId));

      expect(result.current.data).toBeNull();
      expect(result.current.isLoading).toBe(false);
    });

    it('skips query when id is undefined', () => {
      mockUseSessionQuery.mockReturnValue(undefined);

      renderHook(() => useOrder(undefined));

      expect(mockUseSessionQuery).toHaveBeenCalledWith('orders.queries.get', 'skip');
    });
  });

  describe('useKitchenOrders', () => {
    it('returns orders for kitchen view', () => {
      const mockOrders = [
        {
          _id: 'order1',
          _creationTime: Date.now(),
          orderNumber: '0131-001',
          customerId: 'cust1',
          customerName: 'Kitchen Order',
          status: 'In Production',
          paymentStatus: 'Paid',
          orderDate: Date.now(),
          totalAmount: 100000,
          totalCost: 60000,
          totalMargin: 40000,
          itemCount: 5,
        },
      ];
      mockUseSessionQuery.mockReturnValue(mockOrders);

      const { result } = renderHook(() => useKitchenOrders());

      expect(result.current.isLoading).toBe(false);
      expect(result.current.data?.[0]).toHaveProperty('status', 'In Production');
    });
  });

  describe('useCreateOrder', () => {
    it('provides mutate and mutateAsync functions', () => {
      const mockMutate = vi.fn();
      mockUseMutation.mockReturnValue(mockMutate);

      const { result } = renderHook(() => useCreateOrder());

      expect(result.current).toHaveProperty('mutate');
      expect(result.current).toHaveProperty('mutateAsync');
    });
  });

  describe('useUpdateOrderStatus', () => {
    it('provides status update mutation function', () => {
      const mockMutate = vi.fn();
      mockUseMutation.mockReturnValue(mockMutate);

      const { result } = renderHook(() => useUpdateOrderStatus());

      expect(result.current).toHaveProperty('mutate');
      expect(typeof result.current.mutate).toBe('function');
    });
  });
});
