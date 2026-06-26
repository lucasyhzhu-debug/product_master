/**
 * NewSubscriptionPage — /crm/customers/:customerId/subscriptions/new
 * Hosts SubscriptionForm; breadcrumb back to the customer hub.
 *
 * CRM design principles:
 *   A2: breadcrumbs mirror object hierarchy (CRM → Customer → New subscription).
 *   D12: null-guard if customerId is missing.
 */
import { useParams } from "react-router-dom";
import type { Id } from "../../../convex/_generated/dataModel";
import { Breadcrumbs } from "@/components/crm/Breadcrumbs";
import { SubscriptionForm } from "@/components/crm/SubscriptionForm";

export function NewSubscriptionPage() {
  const { customerId } = useParams<{ customerId: string }>();
  if (!customerId) return null;
  return (
    <div className="p-6 space-y-6">
      <Breadcrumbs
        trail={[
          { label: "CRM", to: "/crm" },
          { label: "Customer", to: `/crm/customers/${customerId}` },
          { label: "New subscription" },
        ]}
      />
      <h1 className="text-2xl font-semibold tracking-tight">New subscription</h1>
      <SubscriptionForm customerId={customerId as Id<"customers">} />
    </div>
  );
}
