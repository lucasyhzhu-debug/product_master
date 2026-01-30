import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { orderApi } from '@/lib/api';
import type { OrderCreate } from '@/lib/types';
import { toast } from 'sonner';

export const orderKeys = {
  all: ['orders'] as const,
  lists: () => [...orderKeys.all, 'list'] as const,
  list: (filters?: Record<string, unknown>) => [...orderKeys.lists(), filters] as const,
  details: () => [...orderKeys.all, 'detail'] as const,
  detail: (id: number) => [...orderKeys.details(), id] as const,
  productSuggestions: () => [...orderKeys.all, 'product-suggestions'] as const,
  sellerSuggestions: () => [...orderKeys.all, 'seller-suggestions'] as const,
  kitchen: (date?: string) => [...orderKeys.all, 'kitchen', date] as const,
};

export function useOrders(filters?: {
  status?: string;
  channel?: string;
  due_date_from?: string;
  due_date_to?: string;
}) {
  return useQuery({
    queryKey: orderKeys.list(filters),
    queryFn: () => orderApi.list(filters),
  });
}

export function useOrder(id: number) {
  return useQuery({
    queryKey: orderKeys.detail(id),
    queryFn: () => orderApi.get(id),
    enabled: !!id,
  });
}

export function useCreateOrder() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: OrderCreate) => orderApi.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: orderKeys.lists() });
      // Success toast is handled by toast.promise in the component
    },
    onError: (error: Error) => {
      // Error toast is handled by toast.promise in the component
      throw error;
    },
  });
}

export function useUpdateOrderStatus() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      id,
      status,
      cancellation_reason,
    }: {
      id: number;
      status: string;
      cancellation_reason?: string;
    }) => orderApi.updateStatus(id, status, cancellation_reason),
    onSuccess: (_, { id }) => {
      queryClient.invalidateQueries({ queryKey: orderKeys.detail(id) });
      queryClient.invalidateQueries({ queryKey: orderKeys.lists() });
      toast.success('Order status updated');
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to update order status');
    },
  });
}

export function useUpdateOrderPayment() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      id,
      payment_status,
      payment_method,
    }: {
      id: number;
      payment_status: string;
      payment_method?: string;
    }) => orderApi.updatePayment(id, payment_status, payment_method),
    onSuccess: (_, { id }) => {
      queryClient.invalidateQueries({ queryKey: orderKeys.detail(id) });
      queryClient.invalidateQueries({ queryKey: orderKeys.lists() });
      toast.success('Payment status updated');
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to update payment status');
    },
  });
}

export function useUpdateOrderShipping() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      id,
      shipping_agency,
      shipping_number,
    }: {
      id: number;
      shipping_agency: string | null;
      shipping_number: string | null;
    }) => orderApi.updateShipping(id, shipping_agency, shipping_number),
    onSuccess: (_, { id }) => {
      queryClient.invalidateQueries({ queryKey: orderKeys.detail(id) });
      queryClient.invalidateQueries({ queryKey: orderKeys.lists() });
      toast.success('Shipping info updated');
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to update shipping info');
    },
  });
}

export function useDeleteOrder() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: number) => orderApi.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: orderKeys.lists() });
      toast.success('Order deleted');
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to delete order');
    },
  });
}

export function useProductSuggestions(query?: string) {
  return useQuery({
    queryKey: [...orderKeys.productSuggestions(), query],
    queryFn: () => orderApi.getProductSuggestions(query),
  });
}

export function useSellerSuggestions(query?: string) {
  return useQuery({
    queryKey: [...orderKeys.sellerSuggestions(), query],
    queryFn: () => orderApi.getSellerSuggestions(query),
  });
}

export function useKitchenOrders(targetDate?: string) {
  return useQuery({
    queryKey: orderKeys.kitchen(targetDate),
    queryFn: () => orderApi.getKitchenOrders(targetDate),
  });
}
