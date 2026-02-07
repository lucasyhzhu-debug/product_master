/**
 * Protected mutation wrapper for Convex.
 * Automatically injects auth token into mutation calls.
 *
 * Usage:
 * ```typescript
 * const mutation = useProtectedMutation(api.menuProducts.mutations.create);
 * await mutation({ name: "Product", defaultPrice: 1000 }); // token auto-injected
 * ```
 */
import { useMutation } from "convex/react";
import type { FunctionReference, FunctionArgs, FunctionReturnType } from "convex/server";
import { useAuth } from "../../contexts/AuthContext";
import { toast } from "sonner";

/**
 * Hook that wraps a Convex mutation with automatic token injection.
 * Handles session expiry gracefully with a toast notification.
 *
 * Type parameters are automatically inferred from the mutation reference:
 * - Args are extracted from the mutation definition (minus the `token` field)
 * - Return type is extracted from the mutation definition
 *
 * @param mutationFn - The Convex mutation function reference
 * @returns A function that accepts args (without token) and returns the mutation result
 *
 * @example
 * ```typescript
 * // Types are automatically inferred - no explicit generics needed!
 * const createProduct = useProtectedMutation(api.menuProducts.mutations.create);
 *
 * // TypeScript knows the exact arg types and return type
 * const productId = await createProduct({
 *   name: "Product",
 *   defaultPrice: 1000
 * });
 * ```
 */
export function useProtectedMutation<
  Mutation extends FunctionReference<"mutation">
>(mutationFn: Mutation) {
  const baseMutation = useMutation(mutationFn);
  const { user } = useAuth();

  // Extract the args type and remove the 'token' field
  type MutationArgs = FunctionArgs<Mutation>;
  type ArgsWithoutToken = Omit<MutationArgs, "token">;
  type ReturnType = FunctionReturnType<Mutation>;

  return async (args: ArgsWithoutToken): Promise<ReturnType> => {
    if (!user?.token) {
      toast.error("Session expired. Please log in again.");
      throw new Error("Not authenticated");
    }
    return baseMutation({ ...args, token: user.token } as MutationArgs);
  };
}
