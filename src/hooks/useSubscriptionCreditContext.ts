import { useSessionQuery } from "convex-helpers/react/sessions";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";

export function useSubscriptionCreditContext(
  customerId: Id<"customers"> | null,
  dueDate: number,
  draftItems: { menuProductId: Id<"menuProducts">; qty: number; retailUnitPrice: number }[],
) {
  const contexts = useSessionQuery(
    api.subscriptions.queries.getSubscriptionCreditContext,
    customerId && draftItems.length > 0 ? { customerId, dueDate, draftItems } : "skip",
  );
  return { contexts: contexts ?? null, isLoading: customerId != null && draftItems.length > 0 && contexts === undefined };
}
