import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { ingredientApi } from '@/lib/api';
import type { IngredientCreate } from '@/lib/types';

export const ingredientKeys = {
  all: ['ingredients'] as const,
  lists: () => [...ingredientKeys.all, 'list'] as const,
  list: () => [...ingredientKeys.lists()] as const,
  details: () => [...ingredientKeys.all, 'detail'] as const,
  detail: (id: number) => [...ingredientKeys.details(), id] as const,
};

export function useIngredients() {
  return useQuery({
    queryKey: ingredientKeys.list(),
    queryFn: ingredientApi.list,
  });
}

export function useIngredient(id: number) {
  return useQuery({
    queryKey: ingredientKeys.detail(id),
    queryFn: () => ingredientApi.get(id),
    enabled: !!id,
  });
}

export function useCreateIngredient() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: IngredientCreate) => ingredientApi.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ingredientKeys.lists() });
    },
  });
}

export function useUpdateIngredient() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, data }: { id: number; data: Partial<IngredientCreate> }) =>
      ingredientApi.update(id, data),
    onSuccess: (_, { id }) => {
      queryClient.invalidateQueries({ queryKey: ingredientKeys.detail(id) });
      queryClient.invalidateQueries({ queryKey: ingredientKeys.lists() });
    },
  });
}

export function useDeleteIngredient() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: number) => ingredientApi.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ingredientKeys.lists() });
    },
  });
}
