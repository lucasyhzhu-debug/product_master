export function isSubscriptionOrder(order: {
  fundingSource?: string | null;
  subscriptionId?: unknown;
}): boolean {
  return order.fundingSource === "subscription_credit" || order.subscriptionId != null;
}
