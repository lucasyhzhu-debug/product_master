/**
 * CrmHome — /crm index shell.
 *
 * Placeholder page for the CRM hub. Task T13 will add the live
 * funding-summary and active-subscription content sections.
 *
 * CRM principle A3: customer record is a hub/router.
 * D12: designed empty/loading states (trivial here; populated in T13).
 */
import { Breadcrumbs } from "@/components/crm/Breadcrumbs";

export function CrmHome() {
  return (
    <div className="p-6 space-y-4">
      <Breadcrumbs trail={[{ label: "CRM" }]} />
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">CRM</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Customer relationship management
        </p>
      </div>
    </div>
  );
}
