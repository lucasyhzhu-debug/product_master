/**
 * NewSubscriptionPage — /crm/customers/:customerId/subscriptions/new
 * Hosts SubscriptionForm; breadcrumb back to the customer hub.
 *
 * CRM design principles:
 *   A2: breadcrumbs mirror object hierarchy (CRM → Customer → New subscription).
 *   D12: null-guard if customerId is missing.
 */
import { useParams } from "react-router-dom";
import { useSessionQuery } from "convex-helpers/react/sessions";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { Breadcrumbs } from "@/components/crm/Breadcrumbs";
import { SubscriptionForm } from "@/components/crm/SubscriptionForm";

export function NewSubscriptionPage() {
  const { customerId } = useParams<{ customerId: string }>();
  const record = useSessionQuery(
    api.crm.customers.getCustomerRecord,
    customerId ? { customerId: customerId as Id<"customers"> } : "skip",
  );
  if (!customerId) return null;
  const customerName = (record as { customer?: { name?: string } } | null | undefined)?.customer?.name ?? "Customer";
  return (
    <div className="p-6 space-y-6">
      <Breadcrumbs
        trail={[
          { label: "CRM", to: "/crm" },
          { label: customerName, to: `/crm/customers/${customerId}` },
          { label: "New subscription" },
        ]}
      />
      <h1 className="text-2xl font-semibold tracking-tight">New subscription</h1>
      <SubscriptionForm customerId={customerId as Id<"customers">} />
    </div>
  );
}
