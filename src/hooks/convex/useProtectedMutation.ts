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
import { useAuth } from "../../contexts/AuthContext";
import { toast } from "sonner";

type FunctionReference = Parameters<typeof useMutation>[0];

/**
 * Hook that wraps a Convex mutation with automatic token injection.
 * Handles session expiry gracefully with a toast notification.
 *
 * @param mutationFn - The Convex mutation function reference
 * @returns A function that accepts args (without token) and returns the mutation result
 */
export function useProtectedMutation<
  Args extends Record<string, unknown>,
  Result
>(mutationFn: FunctionReference) {
  const baseMutation = useMutation(mutationFn);
  const { user } = useAuth();

  return async (args: Omit<Args, "token">): Promise<Result> => {
    if (!user?.token) {
      toast.error("Session expired. Please log in again.");
      throw new Error("Not authenticated");
    }
    return baseMutation({ ...args, token: user.token }) as Promise<Result>;
  };
}
