/**
 * CrmHome — /crm index.
 *
 * Two live sections:
 *   1. "Needs funding" — reuses api.subscriptions.scheduling.queries.getFundingDashboard.
 *      Each row links to the subscription week page. DraftWhatsAppButton deferred to T23.
 *   2. "Active subscriptions" — api.crm.customers.getCrmHomeActiveSubscriptions.
 *      Each row links to /crm/customers/:customerId.
 *
 * CRM principles:
 *   A1/A3: hub/router; all references are links.
 *   B8: indexed server-side reads; no client-side .filter() over unbounded fetch.
 *   C9: compact by default, windowed — no unbounded .collect() per render.
 *   D12: designed loading / empty states.
 *   D11: role gate at route level (canAccessCrm = manager+admin);
 *        both queries use roles: ["manager","admin"] — no Pitfall-#19 Unauthorized risk.
 */
import { Link } from "react-router-dom";
import { ArrowUpRight, CreditCard, Users } from "lucide-react";
import { useSessionQuery } from "convex-helpers/react/sessions";

import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { EmptyState } from "@/components/shared/EmptyState";
import { LoadingPage } from "@/components/shared/LoadingState";
import { Breadcrumbs } from "@/components/crm/Breadcrumbs";
import { DraftWhatsAppButton } from "@/components/crm/DraftWhatsAppButton";
import { formatSubscriptionWeekLabel } from "@/lib/dateUtils";

// ---------------------------------------------------------------------------
// Types mirroring query return shapes
// ---------------------------------------------------------------------------

type FundingRow = {
  week: {
    _id: Id<"subscriptionWeeks">;
    weekStart: number;
    status: string;
    weeklyInvoiceId?: Id<"invoices">;
    subscriptionId: Id<"subscriptions">;
  };
  subscriptionId: Id<"subscriptions">;
  subscriptionLabel: string | null;
  customerId: Id<"customers"> | null;
  customerName: string | null;
  customerPhone: string | null;
};

type ActiveSubRow = {
  subscription: {
    _id: Id<"subscriptions">;
    customerId: Id<"customers">;
    status: string;
    label?: string | null;
  };
  customerId: Id<"customers">;
  customerName: string | null;
  currentWeek: { weekStart: number; status: string } | null;
};

// ---------------------------------------------------------------------------
// Status badge helpers — mirrored from CrmFundingDashboardPage
// ---------------------------------------------------------------------------

const STATUS_BADGE: Record<string, string> = {
  confirmed: "bg-amber-100 text-amber-700",
  invoiced: "bg-purple-100 text-purple-700",
};

const STATUS_LABEL: Record<string, string> = {
  confirmed: "Needs invoice",
  invoiced: "Awaiting payment",
};

// Sort: invoiced first, then by weekStart ascending.
function sortFundingRows(rows: FundingRow[]): FundingRow[] {
  return [...rows].sort((a, b) => {
    const statusOrder = (s: string) => (s === "invoiced" ? 0 : 1);
    const sd = statusOrder(a.week.status) - statusOrder(b.week.status);
    if (sd !== 0) return sd;
    return a.week.weekStart - b.week.weekStart;
  });
}

// ---------------------------------------------------------------------------
// Sub-sections
// ---------------------------------------------------------------------------

function NeedsFundingSection({ rows }: { rows: FundingRow[] }) {
  const sorted = sortFundingRows(rows);

  return (
    <section aria-labelledby="needs-funding-heading">
      <h2 id="needs-funding-heading" className="text-base font-semibold mb-3">
        Needs funding
      </h2>

      {sorted.length === 0 ? (
        <EmptyState
          icon={CreditCard}
          title="All caught up"
          description="No weeks awaiting payment or invoice right now."
        />
      ) : (
        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Customer</TableHead>
                  <TableHead>Subscription</TableHead>
                  <TableHead>Week</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {sorted.map((row) => {
                  const {
                    week,
                    customerId,
                    customerName,
                    customerPhone,
                    subscriptionId,
                    subscriptionLabel,
                  } = row;
                  const weekLabel = formatSubscriptionWeekLabel(week.weekStart);
                  const statusBadge =
                    STATUS_BADGE[week.status] ?? "bg-gray-100 text-gray-500";
                  const statusLabel = STATUS_LABEL[week.status] ?? week.status;
                  const isInvoiced = week.status === "invoiced";

                  const weekPath = customerId
                    ? isInvoiced && week.weeklyInvoiceId
                      ? `/crm/customers/${customerId}/subscriptions/${subscriptionId}/week/invoice?weekStart=${week.weekStart}`
                      : `/crm/customers/${customerId}/subscriptions/${subscriptionId}/week?weekStart=${week.weekStart}`
                    : null;

                  return (
                    <TableRow key={week._id}>
                      {/* Customer — A1: link */}
                      <TableCell>
                        {customerId ? (
                          <Link
                            to={`/crm/customers/${customerId}`}
                            className="font-medium hover:underline text-sm inline-flex items-center gap-0.5"
                          >
                            {customerName ?? "Unknown customer"}
                            <ArrowUpRight className="h-3 w-3 text-muted-foreground" />
                          </Link>
                        ) : (
                          <span className="text-sm text-muted-foreground">
                            {customerName ?? "Unknown"}
                          </span>
                        )}
                      </TableCell>

                      {/* Subscription label */}
                      <TableCell>
                        <span className="text-sm text-muted-foreground">
                          {subscriptionLabel ?? subscriptionId.slice(-6)}
                        </span>
                      </TableCell>

                      {/* Week — links to schedule page */}
                      <TableCell>
                        {weekPath ? (
                          <Link
                            to={weekPath}
                            className="text-sm hover:underline font-medium inline-flex items-center gap-0.5"
                          >
                            {weekLabel}
                            <ArrowUpRight className="h-3 w-3 text-muted-foreground" />
                          </Link>
                        ) : (
                          <span className="text-sm font-medium">{weekLabel}</span>
                        )}
                      </TableCell>

                      {/* Status */}
                      <TableCell>
                        <Badge
                          className={`text-xs font-medium capitalize ${statusBadge}`}
                        >
                          {statusLabel}
                        </Badge>
                      </TableCell>

                      {/* WhatsApp draft — only on invoiced (awaiting payment) rows */}
                      <TableCell>
                        {isInvoiced && customerId && (
                          <DraftWhatsAppButton
                            phone={customerPhone}
                            customerId={customerId}
                            invoiceId={week.weeklyInvoiceId}
                            customerName={customerName}
                          />
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </section>
  );
}

function ActiveSubscriptionsSection({ rows }: { rows: ActiveSubRow[] }) {
  return (
    <section aria-labelledby="active-subscriptions-heading">
      <h2 id="active-subscriptions-heading" className="text-base font-semibold mb-3">
        Active subscriptions
      </h2>

      {rows.length === 0 ? (
        <EmptyState
          icon={Users}
          title="No active subscriptions"
          description="No active subscriptions found."
        />
      ) : (
        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Customer</TableHead>
                  <TableHead>Label</TableHead>
                  <TableHead>Current week</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((row) => {
                  const { subscription, customerId, customerName, currentWeek } = row;
                  const subLabel = subscription.label ?? subscription._id.slice(-6);
                  const weekStatus = currentWeek?.status ?? null;
                  const weekBadge = weekStatus
                    ? STATUS_BADGE[weekStatus] ?? "bg-gray-100 text-gray-500"
                    : null;

                  return (
                    <TableRow key={subscription._id}>
                      {/* Customer — A1: link to customer hub */}
                      <TableCell>
                        <Link
                          to={`/crm/customers/${customerId}`}
                          className="font-medium hover:underline text-sm inline-flex items-center gap-0.5"
                        >
                          {customerName ?? "Unknown customer"}
                          <ArrowUpRight className="h-3 w-3 text-muted-foreground" />
                        </Link>
                      </TableCell>

                      {/* Subscription label */}
                      <TableCell>
                        <span className="text-sm text-muted-foreground">
                          {subLabel}
                        </span>
                      </TableCell>

                      {/* Current week status */}
                      <TableCell>
                        {currentWeek && weekBadge ? (
                          <Badge className={`text-xs font-medium capitalize ${weekBadge}`}>
                            {currentWeek.status}
                          </Badge>
                        ) : (
                          <span className="text-xs text-muted-foreground">—</span>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </section>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export function CrmHome() {
  // All hooks before any early returns (Pitfall #9).
  const fundingRows = useSessionQuery(
    api.subscriptions.scheduling.queries.getFundingDashboard,
    {},
  );
  const activeSubRows = useSessionQuery(
    api.crm.customers.getCrmHomeActiveSubscriptions,
    {},
  );

  // D12: loading guard — wait for both queries.
  if (fundingRows === undefined || activeSubRows === undefined) {
    return <LoadingPage />;
  }

  return (
    <div className="p-6 space-y-6">
      <Breadcrumbs trail={[{ label: "CRM" }]} />

      <div>
        <h1 className="text-2xl font-semibold tracking-tight">CRM</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Customer relationship management
        </p>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-2">
        <Card>
          <CardHeader className="pb-1 pt-4">
            <CardTitle className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
              Needs funding
            </CardTitle>
          </CardHeader>
          <CardContent className="pb-4">
            <p className="text-2xl font-bold">{(fundingRows as FundingRow[]).length}</p>
            <p className="text-xs text-muted-foreground mt-0.5">weeks pending</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-1 pt-4">
            <CardTitle className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
              Active subscriptions
            </CardTitle>
          </CardHeader>
          <CardContent className="pb-4">
            <p className="text-2xl font-bold">
              {(activeSubRows as ActiveSubRow[]).length}
            </p>
            <p className="text-xs text-muted-foreground mt-0.5">subscriptions</p>
          </CardContent>
        </Card>
      </div>

      <NeedsFundingSection rows={fundingRows as FundingRow[]} />
      <ActiveSubscriptionsSection rows={activeSubRows as ActiveSubRow[]} />
    </div>
  );
}
