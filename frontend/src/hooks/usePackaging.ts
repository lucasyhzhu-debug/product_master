import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { packagingApi } from '@/lib/api';
import type { PackagingRecipeCreate, PackagingVersionCreate, PackagingVersionCopyCreate } from '@/lib/types';

export const packagingKeys = {
  all: ['packaging'] as const,
  lists: () => [...packagingKeys.all, 'list'] as const,
  list: () => [...packagingKeys.lists()] as const,
  details: () => [...packagingKeys.all, 'detail'] as const,
  detail: (id: number) => [...packagingKeys.details(), id] as const,
  versions: () => [...packagingKeys.all, 'version'] as const,
  version: (packagingId: number, versionNumber: number) =>
    [...packagingKeys.versions(), packagingId, versionNumber] as const,
};

export function usePackagingRecipes() {
  return useQuery({
    queryKey: packagingKeys.list(),
    queryFn: packagingApi.list,
  });
}

export function usePackagingRecipe(id: number) {
  return useQuery({
    queryKey: packagingKeys.detail(id),
    queryFn: () => packagingApi.get(id),
    enabled: !!id,
  });
}

export function usePackagingVersion(packagingId: number, versionNumber: number) {
  return useQuery({
    queryKey: packagingKeys.version(packagingId, versionNumber),
    queryFn: () => packagingApi.getVersion(packagingId, versionNumber),
    enabled: !!packagingId && !!versionNumber,
  });
}

export function useCreatePackagingRecipe() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: PackagingRecipeCreate) => packagingApi.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: packagingKeys.lists() });
    },
  });
}

export function useCreatePackagingVersion() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ packagingId, data }: { packagingId: number; data: PackagingVersionCreate }) =>
      packagingApi.createVersion(packagingId, data),
    onSuccess: (_, { packagingId }) => {
      queryClient.invalidateQueries({ queryKey: packagingKeys.detail(packagingId) });
      queryClient.invalidateQueries({ queryKey: packagingKeys.lists() });
    },
  });
}

export function useCopyPackagingVersion() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ packagingId, data }: { packagingId: number; data: PackagingVersionCopyCreate }) =>
      packagingApi.copyVersion(packagingId, data),
    onSuccess: (_, { packagingId }) => {
      queryClient.invalidateQueries({ queryKey: packagingKeys.detail(packagingId) });
      queryClient.invalidateQueries({ queryKey: packagingKeys.lists() });
    },
  });
}

export function useUpdatePackagingTags() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, tagIds }: { id: number; tagIds: number[] }) =>
      packagingApi.updateTags(id, tagIds),
    onSuccess: (_, { id }) => {
      queryClient.invalidateQueries({ queryKey: packagingKeys.detail(id) });
      queryClient.invalidateQueries({ queryKey: packagingKeys.lists() });
    },
  });
}

export function useDeletePackagingRecipe() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: number) => packagingApi.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: packagingKeys.lists() });
    },
  });
}
