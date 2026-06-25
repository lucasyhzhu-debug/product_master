/**
 * CustomerActivityPage — /crm/customers/:customerId/activity
 *
 * Customer activity timeline hub. Loads `getCustomerTimeline` with a default
 * 14-day window. "Load older" extends the window via sinceDays state (not cursor).
 * Type-filter control filters server-side by passing `types` arg.
 *
 * CRM design principles:
 *   A1: all event rows link to their canonical page.
 *   A2: breadcrumbs mirror object hierarchy.
 *   A3: hub/router — not a scroll-dump.
 *   B6: single taxonomy (crmActivityTaxonomy.ts).
 *   B8: type filter = server-side (types arg), not client .filter().
 *   C9: windowed by sinceDays — never unbounded collect().
 *   D11: query restricted to manager+admin (Pitfall #19 match).
 *   D12: loading / empty / error states.
 *
 * Pitfall #9: all hooks before early returns.
 * Pitfall #19: query uses roles: ["manager","admin"] — matches canAccessCrm.
 */

import { useState } from "react";
import { useParams } from "react-router-dom";
import { ChevronDown } from "lucide-react";
import { useSessionQuery } from "convex-helpers/react/sessions";

import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { Button } from "@/components/ui/button";
import { LoadingPage } from "@/components/shared/LoadingState";
import { EmptyState } from "@/components/shared/EmptyState";
import { Breadcrumbs } from "@/components/crm/Breadcrumbs";
import { ActivityTimeline } from "@/components/crm/ActivityTimeline";
import type { ActivityType } from "@/lib/crmActivityTaxonomy";
import { Clock } from "lucide-react";

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export function CustomerActivityPage() {
  const { customerId } = useParams<{ customerId: string }>();

  // Window state — "Load older" bumps sinceDays; reactive query refetches.
  const [sinceDays, setSinceDays] = useState(14);

  // Type-filter state — empty = all categories (omit from query args).
  const [selectedTypes, setSelectedTypes] = useState<ActivityType[]>([]);

  // All hooks before any early returns (Pitfall #9).
  const result = useSessionQuery(
    api.crm.timeline.getCustomerTimeline,
    customerId
      ? {
          customerId: customerId as Id<"customers">,
          sinceDays,
          types: selectedTypes.length > 0 ? selectedTypes : undefined,
        }
      : "skip",
  );

  // D12: loading guard.
  if (result === undefined) {
    return <LoadingPage />;
  }

  // D12: error / missing customerId.
  if (!customerId) {
    return (
      <div className="p-6 space-y-4">
        <Breadcrumbs trail={[{ label: "CRM", to: "/crm" }, { label: "Activity" }]} />
        <EmptyState
          icon={Clock}
          title="Customer not found"
          description="The customer ID is missing from the URL."
        />
      </div>
    );
  }

  // D12: null result (not found / Convex error boundary should catch, but be defensive).
  if (result === null) {
    return (
      <div className="p-6 space-y-4">
        <Breadcrumbs
          trail={[
            { label: "CRM", to: "/crm" },
            { label: "Customer", to: `/crm/customers/${customerId}` },
            { label: "Activity" },
          ]}
        />
        <EmptyState
          icon={Clock}
          title="No activity found"
          description="No timeline data could be loaded for this customer."
        />
      </div>
    );
  }

  const { items } = result;

  // ---------------------------------------------------------------------------
  // Toggle type filter — if already in list, remove; else add.
  // Selecting an already-active type when all are active clears to just that type.
  // ---------------------------------------------------------------------------
  function handleToggleType(type: ActivityType) {
    setSelectedTypes((prev) => {
      if (prev.includes(type)) {
        // Deselect — if only one remains, go back to "all"
        const next = prev.filter((t) => t !== type);
        return next;
      } else {
        return [...prev, type];
      }
    });
  }

  return (
    <div className="p-6 space-y-6 max-w-3xl">
      {/* Breadcrumbs — A2 */}
      <Breadcrumbs
        trail={[
          { label: "CRM", to: "/crm" },
          { label: "Customer", to: `/crm/customers/${customerId}` },
          { label: "Activity" },
        ]}
      />

      {/* Page header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Activity timeline</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Last {sinceDays} days
          </p>
        </div>

        {/* Load older */}
        <Button
          size="sm"
          variant="outline"
          onClick={() => setSinceDays((d) => d + 14)}
          className="text-xs shrink-0"
          aria-label={`Load older (extend to ${sinceDays + 14} days)`}
          data-testid="load-older-btn"
        >
          <ChevronDown className="h-3.5 w-3.5 mr-1.5" aria-hidden="true" />
          Load older
        </Button>
      </div>

      {/* Timeline with filter control */}
      <ActivityTimeline
        items={items}
        customerId={customerId}
        selectedTypes={selectedTypes}
        onToggleType={handleToggleType}
      />
    </div>
  );
}
