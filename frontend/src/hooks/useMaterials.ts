import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { packagingMaterialApi } from '@/lib/api';
import type { PackagingMaterialCreate } from '@/lib/types';

export const materialKeys = {
  all: ['materials'] as const,
  lists: () => [...materialKeys.all, 'list'] as const,
  list: () => [...materialKeys.lists()] as const,
  details: () => [...materialKeys.all, 'detail'] as const,
  detail: (id: number) => [...materialKeys.details(), id] as const,
};

export function useMaterials() {
  return useQuery({
    queryKey: materialKeys.list(),
    queryFn: packagingMaterialApi.list,
  });
}

export function useMaterial(id: number) {
  return useQuery({
    queryKey: materialKeys.detail(id),
    queryFn: () => packagingMaterialApi.get(id),
    enabled: !!id,
  });
}

export function useCreateMaterial() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: PackagingMaterialCreate) => packagingMaterialApi.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: materialKeys.lists() });
      toast.success('Packaging material created successfully');
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.detail || 'Failed to create packaging material');
    },
  });
}

export function useUpdateMaterial() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, data }: { id: number; data: Partial<PackagingMaterialCreate> }) =>
      packagingMaterialApi.update(id, data),
    onSuccess: (_, { id }) => {
      queryClient.invalidateQueries({ queryKey: materialKeys.detail(id) });
      queryClient.invalidateQueries({ queryKey: materialKeys.lists() });
      toast.success('Packaging material updated successfully');
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.detail || 'Failed to update packaging material');
    },
  });
}

export function useDeleteMaterial() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: number) => packagingMaterialApi.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: materialKeys.lists() });
      toast.success('Packaging material deleted successfully');
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.detail || 'Failed to delete packaging material');
    },
  });
}
