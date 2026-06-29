import { useSessionQuery } from "convex-helpers/react/sessions";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";

export function useActiveSubscriptionsForCustomer(customerId: Id<"customers"> | null) {
  const subs = useSessionQuery(
    api.subscriptions.queries.listActiveSubscriptionsForCustomer,
    customerId ? { customerId } : "skip",
  );
  return { subs: subs ?? null, isLoading: customerId != null && subs === undefined };
}
