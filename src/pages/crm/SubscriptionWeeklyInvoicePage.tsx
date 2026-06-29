/**
 * SubscriptionWeeklyInvoicePage — /crm/customers/:customerId/subscriptions/:subId/week/invoice
 *
 * Day-by-day invoice for one subscription week. Groups invoice.items by date,
 * shows day cards with per-product unit price + line subtotal, day subtotal,
 * and week total (= credit deposited when "Mark paid → fund credit" is triggered).
 *
 * The invoiceNumber is displayed prominently as "Bank transfer reference" (gap#1 A3).
 * 1-click send: WhatsApp deep link (wa.me) + mailto. Print-to-PDF via window.print().
 *
 * Session hooks: useSessionQuery / useSessionMutation (protectedQuery/protectedMutation).
 * canAccessCrm — manager + admin only. Money fields are server-side stripped for
 * non-eligible roles (D11); this page is gated in App.tsx under canAccessCrm.
 */
import { useMemo, useState } from "react";
import { useParams, useNavigate, useSearchParams, Link } from "react-router-dom";
import {
  ArrowLeft,
  CheckCircle2,
  Mail,
  MessageCircle,
  Printer,
  Receipt,
  RefreshCw,
} from "lucide-react";
import { ReconcileWeekDialog } from "@/components/crm/ReconcileWeekDialog";
import { useQuery } from "convex/react";
import { useSessionQuery, useSessionMutation } from "convex-helpers/react/sessions";
import { toast } from "sonner";

import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { EmptyState } from "@/components/shared/EmptyState";
import { LoadingPage } from "@/components/shared/LoadingState";
import { InvoicePrintView, type InvoicePrintData } from "@/components/invoice/InvoicePrintView";
import { formatCurrency, getErrorMessage } from "@/lib/utils";
import { formatSubscriptionWeekLabel } from "@/lib/dateUtils";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const PAYMENT_STATUS_BADGE: Record<string, string> = {
  Unpaid: "bg-amber-100 text-amber-700",
  Paid: "bg-green-100 text-green-700",
  Partial: "bg-blue-100 text-blue-700",
  Void: "bg-gray-100 text-gray-500",
};

/**
 * Convex ids are base32-encoded strings (~32 chars of [A-Za-z0-9]).
 * A missing, empty, or obviously-malformed value will fail v.id() validation
 * on the server and throw ArgumentValidationError. Detect it client-side so
 * we can skip the query and show a friendly EmptyState instead of crashing.
 */
function isValidConvexId(id: string | undefined): id is string {
  return typeof id === "string" && id.length >= 20 && /^[A-Za-z0-9_-]+$/.test(id);
}

// ---------------------------------------------------------------------------
// Shared sub-component
// ---------------------------------------------------------------------------

/** "Mark paid → fund credit" button — used in action bar and bottom CTA. */
function MarkPaidInvoiceButton({
  marking,
  onClick,
}: {
  marking: boolean;
  onClick: () => void;
}) {
  return (
    <Button size="sm" onClick={onClick} disabled={marking} className="text-xs">
      {marking ? (
        <RefreshCw className="h-4 w-4 mr-1.5 animate-spin" />
      ) : (
        <CheckCircle2 className="h-4 w-4 mr-1.5" />
      )}
      Mark paid &rarr; fund credit
    </Button>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export function SubscriptionWeeklyInvoicePage() {
  const { customerId, subId } = useParams<{ customerId: string; subId: string }>();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();

  const [marking, setMarking] = useState(false);
  const [showReconcile, setShowReconcile] = useState(false);

  // ---------------------------------------------------------------------------
  // All hooks before any early returns (Pitfall #9, Rules of Hooks)
  // ---------------------------------------------------------------------------
  const validSubId = isValidConvexId(subId);
  const subscriptionId = subId as Id<"subscriptions">;
  const customerIdTyped = customerId as Id<"customers">;

  const weekStartMs: number = useMemo(() => {
    const raw = searchParams.get("weekStart");
    if (raw) {
      const parsed = parseInt(raw, 10);
      if (!isNaN(parsed)) return parsed;
    }
    return 0;
  }, [searchParams]);

  // Load the planning week (subscription + week doc).
  const planningData = useSessionQuery(
    api.subscriptions.scheduling.queries.getPlanningWeek,
    validSubId && weekStartMs > 0 ? { subscriptionId, weekStart: weekStartMs } : "skip",
  );

  // Load the weekly invoice by ID once we have the week.
  // planningData.week?.weeklyInvoiceId drives this query.
  const weeklyInvoiceId: Id<"invoices"> | null =
    planningData && planningData !== null && "week" in planningData
      ? (planningData.week?.weeklyInvoiceId ?? null)
      : null;

  const invoiceDoc = useSessionQuery(
    api.invoices.queries.getById,
    weeklyInvoiceId ? { invoiceId: weeklyInvoiceId } : "skip",
  );

  // Customer doc for WhatsApp/email (invoice has buyerPhone but NOT whatsapp/email fields).
  // api.customers.queries.get is a plain query (not protectedQuery) — use useQuery.
  const customer = useQuery(
    api.customers.queries.get,
    customerIdTyped ? { id: customerIdTyped } : "skip",
  );

  const markPaidMutation = useSessionMutation(api.subscriptions.invoicing.markWeeklyInvoicePaid);

  // Projected credit shortfall for this week (drives the "almost out of credit"
  // offer-to-bill banner). subscriptionWeekId only known once the week loads.
  const weekIdForShortfall: Id<"subscriptionWeeks"> | null =
    planningData && planningData !== null && "week" in planningData
      ? (planningData.week?._id ?? null)
      : null;
  const shortfall = useSessionQuery(
    api.subscriptions.queries.getWeekShortfall,
    weekIdForShortfall ? { subscriptionWeekId: weekIdForShortfall } : "skip",
  );
  const billShortfallMutation = useSessionMutation(api.subscriptions.invoicing.billWeekShortfall);
  const [billing, setBilling] = useState(false);

  // ---------------------------------------------------------------------------
  // Loading guards (D12)
  // ---------------------------------------------------------------------------

  // Malformed / missing subscription ID in URL — skip query already applied above
  if (!validSubId) {
    return (
      <EmptyState
        icon={Receipt}
        title="Subscription not found"
        description="The subscription ID in this URL is invalid. Check the URL and try again."
        action={{ label: "Go back", onClick: () => navigate(-1) }}
      />
    );
  }

  if (weekStartMs === 0) {
    return (
      <EmptyState
        icon={Receipt}
        title="Missing week"
        description="No weekStart parameter provided. Navigate here from the schedule page."
        action={{ label: "Go back", onClick: () => navigate(-1) }}
      />
    );
  }

  if (planningData === undefined || customer === undefined) {
    return <LoadingPage />;
  }

  if (planningData === null) {
    return (
      <EmptyState
        icon={Receipt}
        title="Subscription not found"
        description="This subscription or week could not be loaded."
        action={{ label: "Go back", onClick: () => navigate(-1) }}
      />
    );
  }

  const { week } = planningData;

  if (week === null || !week.weeklyInvoiceId) {
    return (
      <EmptyState
        icon={Receipt}
        title="No invoice yet"
        description="This week has not been invoiced yet. Confirm the week to generate an invoice."
        action={{ label: "View schedule", onClick: () => navigate(-1) }}
      />
    );
  }

  if (invoiceDoc === undefined) {
    return <LoadingPage />;
  }

  if (!invoiceDoc) {
    return (
      <EmptyState
        icon={Receipt}
        title="Invoice not found"
        description="The invoice document could not be loaded."
        action={{ label: "Go back", onClick: () => navigate(-1) }}
      />
    );
  }

  // ---------------------------------------------------------------------------
  // Derived display values
  // ---------------------------------------------------------------------------
  const { invoiceNumber, paymentStatus, finalTotal, buyerName, bankName, bankAccountNumber, bankAccountName } =
    invoiceDoc;

  const weekLabel = formatSubscriptionWeekLabel(weekStartMs);
  const statusClass =
    PAYMENT_STATUS_BADGE[paymentStatus ?? "Unpaid"] ?? "bg-gray-100 text-gray-500";
  const isPaid = paymentStatus === "Paid";

  // Reuse the canonical customer-facing invoice generator (same as the ordering
  // system). Keep the per-line delivery `date` so the print view renders the
  // week's lines grouped day-by-day (each line carries its delivery date).
  const printData: InvoicePrintData = invoiceDoc;

  // ---------------------------------------------------------------------------
  // Actions
  // ---------------------------------------------------------------------------
  async function handleMarkPaid() {
    setMarking(true);
    try {
      await markPaidMutation({ subscriptionWeekId: week!._id });
      toast.success("Invoice marked paid. Credit funded.");
    } catch (err) {
      toast.error(getErrorMessage(err, "Failed to mark invoice paid"));
    } finally {
      setMarking(false);
    }
  }

  async function handleBillShortfall() {
    setBilling(true);
    try {
      const res = await billShortfallMutation({ subscriptionWeekId: week!._id });
      toast.success(`Top-up invoice created for ${formatCurrency(res.projectedShortfall)}.`);
    } catch (err) {
      toast.error(getErrorMessage(err, "Failed to bill shortfall"));
    } finally {
      setBilling(false);
    }
  }

  function handlePrint() {
    window.print();
  }

  // Build WhatsApp deep link.
  const rawPhone = customer?.whatsapp ?? customer?.phone ?? "";
  const waNumber = rawPhone.replace(/\D/g, "").replace(/^0/, "62");
  const waMessage = encodeURIComponent(
    `Halo ${buyerName ?? ""},\n\nBerikut tagihan langganan Frollie minggu ${weekLabel}:\n` +
      `Nomor invoice: *${invoiceNumber}*\n` +
      `Total: *${formatCurrency(finalTotal)}*\n\n` +
      `Mohon transfer ke:\n${bankName} ${bankAccountNumber} a/n ${bankAccountName}\n` +
      `Referensi transfer: *${invoiceNumber}*\n\nTerima kasih!`,
  );
  const waHref = `https://wa.me/${waNumber}?text=${waMessage}`;

  const emailSubject = encodeURIComponent(
    `Invoice Frollie ${invoiceNumber} — ${weekLabel}`,
  );
  const emailBody = encodeURIComponent(
    `Halo ${buyerName ?? ""},\n\nBerikut tagihan langganan Frollie minggu ${weekLabel}.\n\n` +
      `Nomor invoice: ${invoiceNumber}\n` +
      `Total: ${formatCurrency(finalTotal)}\n\n` +
      `Transfer ke: ${bankName} ${bankAccountNumber} a/n ${bankAccountName}\n` +
      `Referensi: ${invoiceNumber}\n\nTerima kasih!`,
  );
  const emailHref = `mailto:${customer?.email ?? ""}?subject=${emailSubject}&body=${emailBody}`;

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------
  return (
    <div className="space-y-4">
      {/* Header — hidden when printing */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between print:hidden">
        <div className="flex items-start gap-3">
          <Button
            variant="ghost"
            size="icon"
            className="shrink-0 mt-0.5"
            onClick={() => navigate(-1)}
            aria-label="Go back"
          >
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-xl font-semibold leading-tight">Weekly Invoice</h1>
              <Badge className={`text-xs font-medium capitalize ${statusClass}`}>
                {paymentStatus ?? "Unpaid"}
              </Badge>
            </div>
            <p className="text-sm text-muted-foreground mt-0.5">
              {buyerName} &middot; {weekLabel}
            </p>
            <p className="text-xs text-muted-foreground mt-0.5">
              <Link
                to={`/crm/customers/${customerIdTyped}/subscriptions/${subId}/week?weekStart=${weekStartMs}`}
                className="hover:underline"
              >
                View schedule &rarr;
              </Link>
            </p>
          </div>
        </div>

        {/* Action bar */}
        <div className="flex items-center gap-2 flex-wrap">
          <Button variant="outline" size="sm" onClick={handlePrint} className="text-xs">
            <Printer className="h-3.5 w-3.5 mr-1.5" />
            Print / PDF
          </Button>
          {waNumber && (
            <Button variant="outline" size="sm" asChild className="text-xs">
              <a href={waHref} target="_blank" rel="noopener noreferrer">
                <MessageCircle className="h-3.5 w-3.5 mr-1.5" />
                WhatsApp
              </a>
            </Button>
          )}
          {customer?.email && (
            <Button variant="outline" size="sm" asChild className="text-xs">
              <a href={emailHref}>
                <Mail className="h-3.5 w-3.5 mr-1.5" />
                Email
              </a>
            </Button>
          )}
          {!isPaid && (
            <MarkPaidInvoiceButton marking={marking} onClick={handleMarkPaid} />
          )}
          {(['paid', 'delivering'] as const).includes(week.status as 'paid' | 'delivering') && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowReconcile(true)}
              className="text-xs"
            >
              <RefreshCw className="h-3.5 w-3.5 mr-1.5" />
              Reconcile week
            </Button>
          )}
        </div>
      </div>

      {/* Reconcile-week dialog — mounted here so it has access to week._id */}
      <ReconcileWeekDialog
        subscriptionWeekId={week._id}
        open={showReconcile}
        onOpenChange={setShowReconcile}
      />

      {/* Almost-out-of-credit offer — surfaces when the (amended) plan will overrun
          the funded credit. Billing it creates ONE top-up invoice for the shortfall. */}
      {shortfall && shortfall.shouldOfferTopup && (
        <Card className="border-amber-300 bg-amber-50 print:hidden">
          <CardContent className="p-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div className="text-sm">
              <p className="font-semibold text-amber-800">Credit almost used up</p>
              <p className="text-amber-700 mt-0.5">
                This week is projected to overrun its funded credit by{" "}
                <span className="font-semibold tabular-nums">
                  {formatCurrency(shortfall.projectedShortfall)}
                </span>
                . Bill the shortfall as one top-up when ready.
              </p>
            </div>
            <Button
              size="sm"
              onClick={handleBillShortfall}
              disabled={billing}
              className="shrink-0 text-xs"
            >
              {billing ? (
                <RefreshCw className="h-3.5 w-3.5 mr-1.5 animate-spin" />
              ) : (
                <Receipt className="h-3.5 w-3.5 mr-1.5" />
              )}
              Bill shortfall ({formatCurrency(shortfall.projectedShortfall)})
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Customer-facing invoice — canonical print view (one page) */}
      <div className="rounded border bg-white shadow-sm print:rounded-none print:border-0 print:shadow-none">
        <InvoicePrintView data={printData} showSignature={false} />
      </div>

      {/* Bottom CTA — only visible when unpaid */}
      {!isPaid && (
        <div className="flex justify-end print:hidden">
          <MarkPaidInvoiceButton marking={marking} onClick={handleMarkPaid} />
        </div>
      )}
    </div>
  );
}
