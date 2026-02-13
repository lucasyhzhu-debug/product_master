import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook } from '@testing-library/react';

// Mock convex/react
vi.mock('convex/react', () => ({
  useQuery: vi.fn(),
  useMutation: vi.fn(() => vi.fn()),
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
    recipes: {
      queries: {
        list: 'recipes.queries.list',
        get: 'recipes.queries.get',
        getVersion: 'recipes.queries.getVersion',
        getReusableComponents: 'recipes.queries.getReusableComponents',
        getRecipesUsingComponent: 'recipes.queries.getRecipesUsingComponent',
        search: 'recipes.queries.search',
      },
      mutations: {
        create: 'recipes.mutations.create',
        copyVersion: 'recipes.mutations.copyVersion',
        createVersion: 'recipes.mutations.createVersion',
        updateTags: 'recipes.mutations.updateTags',
        updateName: 'recipes.mutations.updateName',
        remove: 'recipes.mutations.remove',
        recalculateCosts: 'recipes.mutations.recalculateCosts',
      },
    },
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
import {
  useConvexRecipes,
  useConvexRecipe,
  useConvexRecipeVersion,
  useConvexReusableComponents,
  useConvexCreateRecipe,
  useConvexDeleteRecipe,
  useConvexRecipeSearch,
} from '../convex/useRecipes';
import {
  useConvexOrders,
  useConvexOrder,
  useConvexKitchenOrders,
  useConvexCreateOrder,
  useConvexUpdateOrderStatus,
} from '../convex/useOrders';
import type { Id } from '../../../convex/_generated/dataModel';

const mockUseQuery = vi.mocked(useQuery);
const mockUseMutation = vi.mocked(useMutation);

describe('useRecipes hooks', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('useConvexRecipes', () => {
    it('returns undefined while loading', () => {
      mockUseQuery.mockReturnValue(undefined);

      const { result } = renderHook(() => useConvexRecipes());

      expect(result.current).toBeUndefined();
    });

    it('returns data when loaded', () => {
      const mockRecipes = [
        { _id: 'recipe1', name: 'Recipe 1', tagIds: [], createdBy: 'admin' },
        { _id: 'recipe2', name: 'Recipe 2', tagIds: [], createdBy: 'admin' },
      ];
      mockUseQuery.mockReturnValue(mockRecipes);

      const { result } = renderHook(() => useConvexRecipes());

      expect(result.current).toEqual(mockRecipes);
    });

    it('handles empty list', () => {
      mockUseQuery.mockReturnValue([]);

      const { result } = renderHook(() => useConvexRecipes());

      expect(result.current).toEqual([]);
    });

    it('passes limit parameter to query', () => {
      mockUseQuery.mockReturnValue([]);

      renderHook(() => useConvexRecipes(10));

      expect(mockUseQuery).toHaveBeenCalledWith('recipes.queries.list', { limit: 10 });
    });
  });

  describe('useConvexRecipe', () => {
    it('skips query when id is undefined', () => {
      mockUseQuery.mockReturnValue(undefined);

      renderHook(() => useConvexRecipe(undefined));

      expect(mockUseQuery).toHaveBeenCalledWith('recipes.queries.get', 'skip');
    });

    it('calls query with id when provided', () => {
      const recipeId = 'recipe123' as Id<'recipes'>;
      mockUseQuery.mockReturnValue({ _id: recipeId, name: 'Test Recipe' });

      renderHook(() => useConvexRecipe(recipeId));

      expect(mockUseQuery).toHaveBeenCalledWith('recipes.queries.get', { id: recipeId });
    });
  });

  describe('useConvexCreateRecipe', () => {
    it('provides mutate and mutateAsync functions', () => {
      const mockMutate = vi.fn();
      mockUseMutation.mockReturnValue(mockMutate);

      const { result } = renderHook(() => useConvexCreateRecipe());

      expect(result.current).toHaveProperty('mutate');
      expect(result.current).toHaveProperty('mutateAsync');
      expect(typeof result.current.mutate).toBe('function');
      expect(typeof result.current.mutateAsync).toBe('function');
    });
  });

  describe('useConvexDeleteRecipe', () => {
    it('provides mutate function for deletion', () => {
      const mockMutate = vi.fn();
      mockUseMutation.mockReturnValue(mockMutate);

      const { result } = renderHook(() => useConvexDeleteRecipe());

      expect(result.current).toHaveProperty('mutate');
      expect(typeof result.current.mutate).toBe('function');
    });
  });

  describe('useConvexRecipeSearch', () => {
    it('skips query when search string is empty', () => {
      mockUseQuery.mockReturnValue(undefined);

      renderHook(() => useConvexRecipeSearch(''));

      expect(mockUseQuery).toHaveBeenCalledWith('recipes.queries.search', 'skip');
    });

    it('performs search when query is provided', () => {
      mockUseQuery.mockReturnValue([]);

      renderHook(() => useConvexRecipeSearch('chocolate'));

      expect(mockUseQuery).toHaveBeenCalledWith('recipes.queries.search', { query: 'chocolate', limit: undefined });
    });
  });
});

describe('useOrders hooks', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('useConvexOrders', () => {
    it('returns isLoading true while data is undefined', () => {
      mockUseQuery.mockReturnValue(undefined);

      const { result } = renderHook(() => useConvexOrders());

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

      const { result } = renderHook(() => useConvexOrders());

      expect(result.current.isLoading).toBe(false);
      expect(result.current.data).toBeDefined();
      expect(result.current.data?.[0]).toHaveProperty('order_number', '0131-001');
      expect(result.current.data?.[0]).toHaveProperty('customer_name', 'John Doe');
    });

    it('handles empty orders list', () => {
      mockUseQuery.mockReturnValue([]);

      const { result } = renderHook(() => useConvexOrders());

      expect(result.current.isLoading).toBe(false);
      expect(result.current.data).toEqual([]);
    });

    it('passes filter parameters to query', () => {
      mockUseQuery.mockReturnValue([]);
      const filters = { status: 'Draft', limit: 10 };

      renderHook(() => useConvexOrders(filters));

      expect(mockUseQuery).toHaveBeenCalledWith('orders.queries.list', filters);
    });
  });

  describe('useConvexOrder', () => {
    it('returns isLoading true when id is provided but data is undefined', () => {
      mockUseQuery.mockReturnValue(undefined);
      const orderId = 'order123' as Id<'orders'>;

      const { result } = renderHook(() => useConvexOrder(orderId));

      expect(result.current.data).toBeUndefined();
      expect(result.current.isLoading).toBe(true);
    });

    it('returns null when order not found', () => {
      mockUseQuery.mockReturnValue(null);
      const orderId = 'order123' as Id<'orders'>;

      const { result } = renderHook(() => useConvexOrder(orderId));

      expect(result.current.data).toBeNull();
      expect(result.current.isLoading).toBe(false);
    });

    it('skips query when id is undefined', () => {
      mockUseQuery.mockReturnValue(undefined);

      renderHook(() => useConvexOrder(undefined));

      expect(mockUseQuery).toHaveBeenCalledWith('orders.queries.get', 'skip');
    });
  });

  describe('useConvexKitchenOrders', () => {
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
      mockUseQuery.mockReturnValue(mockOrders);

      const { result } = renderHook(() => useConvexKitchenOrders());

      expect(result.current.isLoading).toBe(false);
      expect(result.current.data?.[0]).toHaveProperty('status', 'In Production');
    });
  });

  describe('useConvexCreateOrder', () => {
    it('provides mutate and mutateAsync functions', () => {
      const mockMutate = vi.fn();
      mockUseMutation.mockReturnValue(mockMutate);

      const { result } = renderHook(() => useConvexCreateOrder());

      expect(result.current).toHaveProperty('mutate');
      expect(result.current).toHaveProperty('mutateAsync');
    });
  });

  describe('useConvexUpdateOrderStatus', () => {
    it('provides status update mutation function', () => {
      const mockMutate = vi.fn();
      mockUseMutation.mockReturnValue(mockMutate);

      const { result } = renderHook(() => useConvexUpdateOrderStatus());

      expect(result.current).toHaveProperty('mutate');
      expect(typeof result.current.mutate).toBe('function');
    });
  });
});
