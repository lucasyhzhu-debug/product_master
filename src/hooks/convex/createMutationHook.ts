/**
 * Generic mutation hook factory.
 * Wraps useSessionMutation with try/catch + toast notifications.
 * Eliminates ~400 lines of duplicated boilerplate across entity hooks.
 */
import { useSessionMutation } from "convex-helpers/react/sessions";
import type { FunctionReference, FunctionReturnType } from "convex/server";
import { toast } from "sonner";
import { getErrorMessage } from "@/lib/utils";

export interface MutationHookConfig {
  successMessage: string;
  errorMessage: string;
}

export function createMutationHook<
  Mutation extends FunctionReference<"mutation">
>(
  mutationRef: Mutation,
  config: MutationHookConfig,
) {
  return function useMutationWithToast() {
    const mutation = useSessionMutation(mutationRef);
    const execute = async (
      ...args: Parameters<typeof mutation>
    ): Promise<FunctionReturnType<Mutation>> => {
      try {
        const result = await mutation(...args);
        toast.success(config.successMessage);
        return result;
      } catch (error: unknown) {
        toast.error(getErrorMessage(error, config.errorMessage));
        throw error;
      }
    };
    return { mutate: execute, mutateAsync: execute };
  };
}
