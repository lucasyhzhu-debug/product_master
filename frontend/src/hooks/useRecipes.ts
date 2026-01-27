import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { recipeApi } from '@/lib/api';
import type { RecipeCreate, RecipeVersionCreate, RecipeVersionCopyCreate } from '@/lib/types';

export const recipeKeys = {
  all: ['recipes'] as const,
  lists: () => [...recipeKeys.all, 'list'] as const,
  list: () => [...recipeKeys.lists()] as const,
  details: () => [...recipeKeys.all, 'detail'] as const,
  detail: (id: number) => [...recipeKeys.details(), id] as const,
  versions: () => [...recipeKeys.all, 'version'] as const,
  version: (recipeId: number, versionNumber: number) =>
    [...recipeKeys.versions(), recipeId, versionNumber] as const,
  reusable: () => [...recipeKeys.all, 'reusable'] as const,
};

export function useRecipes() {
  return useQuery({
    queryKey: recipeKeys.list(),
    queryFn: recipeApi.list,
  });
}

export function useRecipe(id: number) {
  return useQuery({
    queryKey: recipeKeys.detail(id),
    queryFn: () => recipeApi.get(id),
    enabled: !!id,
  });
}

export function useRecipeVersion(recipeId: number, versionNumber: number) {
  return useQuery({
    queryKey: recipeKeys.version(recipeId, versionNumber),
    queryFn: () => recipeApi.getVersion(recipeId, versionNumber),
    enabled: !!recipeId && !!versionNumber,
  });
}

export function useReusableRecipes() {
  return useQuery({
    queryKey: recipeKeys.reusable(),
    queryFn: recipeApi.listReusable,
  });
}

export function useCreateRecipe() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: RecipeCreate) => recipeApi.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: recipeKeys.lists() });
    },
  });
}

export function useCreateRecipeVersion() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ recipeId, data }: { recipeId: number; data: RecipeVersionCreate }) =>
      recipeApi.createVersion(recipeId, data),
    onSuccess: (_, { recipeId }) => {
      queryClient.invalidateQueries({ queryKey: recipeKeys.detail(recipeId) });
      queryClient.invalidateQueries({ queryKey: recipeKeys.lists() });
    },
  });
}

export function useCopyRecipeVersion() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ recipeId, data }: { recipeId: number; data: RecipeVersionCopyCreate }) =>
      recipeApi.copyVersion(recipeId, data),
    onSuccess: (_, { recipeId }) => {
      queryClient.invalidateQueries({ queryKey: recipeKeys.detail(recipeId) });
      queryClient.invalidateQueries({ queryKey: recipeKeys.lists() });
    },
  });
}

export function useUpdateRecipeTags() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, tagIds }: { id: number; tagIds: number[] }) =>
      recipeApi.updateTags(id, tagIds),
    onSuccess: (_, { id }) => {
      queryClient.invalidateQueries({ queryKey: recipeKeys.detail(id) });
      queryClient.invalidateQueries({ queryKey: recipeKeys.lists() });
    },
  });
}

export function useDeleteRecipe() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: number) => recipeApi.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: recipeKeys.lists() });
    },
  });
}
