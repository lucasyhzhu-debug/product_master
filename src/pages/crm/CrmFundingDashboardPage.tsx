/**
 * CrmFundingDashboardPage — /crm/funding
 *
 * Operator dashboard for weeks awaiting payment (invoiced) or awaiting invoice
 * (confirmed). Each row links to the customer and to the weekly invoice page.
 * "Mark paid → fund credit" action per invoiced row.
 *
 * Sort: client-side by weekStart asc (stable across reactive updates), with
 * "invoiced" rows before "confirmed" rows of the same weekStart.
 *
 * D12: designed loading / empty / error states.
 * D11: canAccessCrm gate (App.tsx) — money fields server-stripped for non-mgr/admin.
 *
 * Session hooks: useSessionQuery / useSessionMutation.
 */
import { useState } from "react";
import { Link } from "react-router-dom";
import {
  ArrowUpRight,
  CheckCircle2,
  CreditCard,
  Receipt,
  RefreshCw,
} from "lucide-react";
import { useSessionQuery, useSessionMutation } from "convex-helpers/react/sessions";
import { toast } from "sonner";

import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { Button } from "@/components/ui/button";
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
import { getErrorMessage, formatCurrency } from "@/lib/utils";
import { utcToWibDateStr, formatSubscriptionWeekLabel } from "@/lib/dateUtils";
import {
  FUNDING_STATUS_BADGE,
  FUNDING_STATUS_LABEL,
  sortFundingRows,
} from "@/lib/crmStatusBadges";

// ---------------------------------------------------------------------------
// Types mirroring getFundingDashboard / getUnpaidSubscriptionInvoices return shapes
// ---------------------------------------------------------------------------

type UnpaidInvoiceRow = {
  invoiceId: Id<"invoices">;
  invoiceNumber: string | null;
  amountTotal: number;
  paymentStatus: string;
  customerId: Id<"customers"> | null;
  customerName: string | null;
  subscriptionId: Id<"subscriptions"> | null;
  subscriptionLabel: string | null;
  weekStart: number | null;
};

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
};

// ---------------------------------------------------------------------------
// MarkPaidButton — isolated to avoid sharing marking state across rows
// ---------------------------------------------------------------------------

function MarkPaidButton({ weekId }: { weekId: Id<"subscriptionWeeks"> }) {
  const [marking, setMarking] = useState(false);
  const markPaid = useSessionMutation(api.subscriptions.invoicing.markWeeklyInvoicePaid);

  async function handleMark() {
    setMarking(true);
    try {
      await markPaid({ subscriptionWeekId: weekId });
      toast.success("Invoice marked paid. Credit funded.");
    } catch (err) {
      toast.error(getErrorMessage(err, "Failed to mark paid"));
    } finally {
      setMarking(false);
    }
  }

  return (
    <Button size="sm" variant="outline" onClick={handleMark} disabled={marking} className="text-xs">
      {marking ? (
        <RefreshCw className="h-3.5 w-3.5 mr-1.5 animate-spin" />
      ) : (
        <CheckCircle2 className="h-3.5 w-3.5 mr-1.5" />
      )}
      Mark paid
    </Button>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export function CrmFundingDashboardPage() {
  // ---------------------------------------------------------------------------
  // All hooks before any early returns (Pitfall #9)
  // ---------------------------------------------------------------------------
  const rows = useSessionQuery(api.subscriptions.scheduling.queries.getFundingDashboard, {});
  // Unpaid subscription invoices (incl. mid-week amendments) — reconciles the
  // "All caught up" weeks view with the customer hub (no money-safety contradiction).
  const unpaidInvoices = useSessionQuery(api.crm.funding.getUnpaidSubscriptionInvoices, {}) as UnpaidInvoiceRow[] | undefined;

  // ---------------------------------------------------------------------------
  // Loading guard (D12) — wait for both queries
  // ---------------------------------------------------------------------------
  if (rows === undefined || unpaidInvoices === undefined) {
    return <LoadingPage />;
  }

  const sorted = sortFundingRows(rows as FundingRow[]);

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------
  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-xl font-semibold leading-tight">Subscription Funding Dashboard</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Weeks awaiting payment or invoice — fund credit pools once cash received.
        </p>
      </div>

      {/* Summary counts */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
        <Card>
          <CardHeader className="pb-1 pt-4">
            <CardTitle className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
              Awaiting payment
            </CardTitle>
          </CardHeader>
          <CardContent className="pb-4">
            <p className="text-2xl font-bold">
              {sorted.filter((r) => r.week.status === "invoiced").length}
            </p>
            <p className="text-xs text-muted-foreground mt-0.5">weeks invoiced</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-1 pt-4">
            <CardTitle className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
              Needs invoice
            </CardTitle>
          </CardHeader>
          <CardContent className="pb-4">
            <p className="text-2xl font-bold">
              {sorted.filter((r) => r.week.status === "confirmed").length}
            </p>
            <p className="text-xs text-muted-foreground mt-0.5">weeks confirmed</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-1 pt-4">
            <CardTitle className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
              Unpaid invoices
            </CardTitle>
          </CardHeader>
          <CardContent className="pb-4">
            <p className="text-2xl font-bold">{unpaidInvoices.length}</p>
            <p className="text-xs text-muted-foreground mt-0.5">subscription invoices</p>
          </CardContent>
        </Card>
      </div>

      {/* All caught up — only when BOTH weeks and invoices are empty */}
      {sorted.length === 0 && unpaidInvoices.length === 0 && (
        <EmptyState
          icon={CreditCard}
          title="All caught up"
          description="No subscription weeks are awaiting payment or invoice right now."
        />
      )}

      {/* Weeks table — awaiting payment or invoice */}
      {sorted.length > 0 && (
        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Customer</TableHead>
                  <TableHead>Subscription</TableHead>
                  <TableHead>Week</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {sorted.map((row) => {
                  const { week, customerId, customerName, subscriptionId, subscriptionLabel } = row;
                  const weekLabel = formatSubscriptionWeekLabel(week.weekStart);
                  const weekDateStr = utcToWibDateStr(week.weekStart);
                  const statusBadge =
                    FUNDING_STATUS_BADGE[week.status] ?? "bg-gray-100 text-gray-500";
                  const statusLabel = FUNDING_STATUS_LABEL[week.status] ?? week.status;
                  const isInvoiced = week.status === "invoiced";

                  return (
                    <TableRow key={week._id}>
                      {/* Customer — fixed: was /customers, now /crm/customers/:id */}
                      <TableCell>
                        {customerId ? (
                          <Link
                            to={`/crm/customers/${customerId}`}
                            className="font-medium hover:underline text-sm"
                          >
                            {customerName ?? "Unknown customer"}
                            <ArrowUpRight className="inline h-3 w-3 ml-0.5 text-muted-foreground" />
                          </Link>
                        ) : (
                          <span className="text-sm text-muted-foreground">
                            {customerName ?? "Unknown"}
                          </span>
                        )}
                      </TableCell>

                      {/* Subscription */}
                      <TableCell>
                        <span className="text-sm text-muted-foreground">
                          {subscriptionLabel ?? subscriptionId.slice(-6)}
                        </span>
                      </TableCell>

                      {/* Week */}
                      <TableCell>
                        <div className="flex flex-col gap-0.5">
                          {customerId ? (
                            <Link
                              to={
                                isInvoiced && week.weeklyInvoiceId
                                  ? `/crm/customers/${customerId}/subscriptions/${subscriptionId}/week/invoice?weekStart=${week.weekStart}`
                                  : `/crm/customers/${customerId}/subscriptions/${subscriptionId}/week?weekStart=${week.weekStart}`
                              }
                              className="text-sm hover:underline font-medium"
                            >
                              {weekLabel}
                              <ArrowUpRight className="inline h-3 w-3 ml-0.5 text-muted-foreground" />
                            </Link>
                          ) : (
                            <span className="text-sm font-medium">{weekLabel}</span>
                          )}
                          <span className="text-xs text-muted-foreground">{weekDateStr}</span>
                        </div>
                      </TableCell>

                      {/* Status */}
                      <TableCell>
                        <Badge className={`text-xs font-medium capitalize ${statusBadge}`}>
                          {statusLabel}
                        </Badge>
                      </TableCell>

                      {/* Actions */}
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-2">
                          {/* View invoice link */}
                          {isInvoiced && week.weeklyInvoiceId && customerId && (
                            <Button
                              size="sm"
                              variant="ghost"
                              asChild
                              className="text-xs"
                            >
                              <Link
                                to={`/crm/customers/${customerId}/subscriptions/${subscriptionId}/week/invoice?weekStart=${week.weekStart}`}
                              >
                                View invoice
                              </Link>
                            </Button>
                          )}
                          {/* Mark paid action — only for invoiced weeks */}
                          {isInvoiced && <MarkPaidButton weekId={week._id} />}
                          {/* Confirmed-but-not-invoiced: link to schedule to create invoice */}
                          {!isInvoiced && customerId && (
                            <Button size="sm" variant="ghost" asChild className="text-xs">
                              <Link
                                to={`/crm/customers/${customerId}/subscriptions/${subscriptionId}/week?weekStart=${week.weekStart}`}
                              >
                                Create invoice
                              </Link>
                            </Button>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {/* Unpaid invoices section — subscription invoices awaiting payment */}
      {unpaidInvoices.length > 0 && (
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <Receipt className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
            <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">
              Unpaid invoices
            </h2>
          </div>
          <Card>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Invoice</TableHead>
                    <TableHead>Customer</TableHead>
                    <TableHead>Subscription</TableHead>
                    <TableHead>Amount</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {unpaidInvoices.map((inv) => {
                    const displayNum = inv.invoiceNumber ?? `···${inv.invoiceId.slice(-6)}`;
                    return (
                      <TableRow key={inv.invoiceId}>
                        {/* Invoice — links to invoice page */}
                        <TableCell>
                          <Link
                            to={`/invoices/${inv.invoiceId}`}
                            className="text-sm font-medium hover:underline"
                          >
                            {displayNum}
                            <ArrowUpRight className="inline h-3 w-3 ml-0.5 text-muted-foreground" />
                          </Link>
                        </TableCell>

                        {/* Customer */}
                        <TableCell>
                          {inv.customerId ? (
                            <Link
                              to={`/crm/customers/${inv.customerId}`}
                              className="text-sm hover:underline"
                            >
                              {inv.customerName ?? "Unknown"}
                              <ArrowUpRight className="inline h-3 w-3 ml-0.5 text-muted-foreground" />
                            </Link>
                          ) : (
                            <span className="text-sm text-muted-foreground">
                              {inv.customerName ?? "Unknown"}
                            </span>
                          )}
                        </TableCell>

                        {/* Subscription */}
                        <TableCell>
                          <span className="text-sm text-muted-foreground">
                            {inv.subscriptionLabel ?? (inv.subscriptionId ? `···${inv.subscriptionId.slice(-6)}` : "—")}
                          </span>
                        </TableCell>

                        {/* Amount */}
                        <TableCell>
                          <span className="text-sm font-medium tabular-nums">
                            {formatCurrency(inv.amountTotal)}
                          </span>
                        </TableCell>

                        {/* Status */}
                        <TableCell>
                          <Badge className="text-xs bg-amber-100 text-amber-700">
                            {inv.paymentStatus}
                          </Badge>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
