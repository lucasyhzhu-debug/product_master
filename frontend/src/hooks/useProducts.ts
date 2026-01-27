import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { productApi } from '@/lib/api';
import type { ProductCreate, ProductVersionCreate, ProductVersionCopyCreate } from '@/lib/types';

export const productKeys = {
  all: ['products'] as const,
  lists: () => [...productKeys.all, 'list'] as const,
  list: () => [...productKeys.lists()] as const,
  details: () => [...productKeys.all, 'detail'] as const,
  detail: (id: number) => [...productKeys.details(), id] as const,
  versions: () => [...productKeys.all, 'version'] as const,
  version: (productId: number, versionNumber: number) =>
    [...productKeys.versions(), productId, versionNumber] as const,
};

export function useProducts() {
  return useQuery({
    queryKey: productKeys.list(),
    queryFn: productApi.list,
  });
}

export function useProduct(id: number) {
  return useQuery({
    queryKey: productKeys.detail(id),
    queryFn: () => productApi.get(id),
    enabled: !!id,
  });
}

export function useProductVersion(productId: number, versionNumber: number) {
  return useQuery({
    queryKey: productKeys.version(productId, versionNumber),
    queryFn: () => productApi.getVersion(productId, versionNumber),
    enabled: !!productId && !!versionNumber,
  });
}

export function useCreateProduct() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: ProductCreate) => productApi.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: productKeys.lists() });
    },
  });
}

export function useCreateProductVersion() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ productId, data }: { productId: number; data: ProductVersionCreate }) =>
      productApi.createVersion(productId, data),
    onSuccess: (_, { productId }) => {
      queryClient.invalidateQueries({ queryKey: productKeys.detail(productId) });
      queryClient.invalidateQueries({ queryKey: productKeys.lists() });
    },
  });
}

export function useCopyProductVersion() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ productId, data }: { productId: number; data: ProductVersionCopyCreate }) =>
      productApi.copyVersion(productId, data),
    onSuccess: (_, { productId }) => {
      queryClient.invalidateQueries({ queryKey: productKeys.detail(productId) });
      queryClient.invalidateQueries({ queryKey: productKeys.lists() });
    },
  });
}

export function useDeleteProduct() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: number) => productApi.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: productKeys.lists() });
    },
  });
}
