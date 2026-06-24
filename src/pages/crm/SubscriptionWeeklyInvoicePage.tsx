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
  Copy,
  FileText,
  Mail,
  MessageCircle,
  Printer,
  Receipt,
  RefreshCw,
} from "lucide-react";
import { useQuery } from "convex/react";
import { useSessionQuery, useSessionMutation } from "convex-helpers/react/sessions";
import { toast } from "sonner";

import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { EmptyState } from "@/components/shared/EmptyState";
import { LoadingPage } from "@/components/shared/LoadingState";
import { formatCurrency, getErrorMessage } from "@/lib/utils";
import { utcToWibDateStr, formatIndonesianDate, formatSubscriptionWeekLabel } from "@/lib/dateUtils";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------


type InvoiceItem = {
  productName: string;
  qty: number;
  unitPrice: number;
  lineTotal: number;
  date?: number;
};

/** Group invoice items by their delivery date (epoch ms). */
function groupByDate(items: InvoiceItem[]): Map<number | undefined, InvoiceItem[]> {
  const map = new Map<number | undefined, InvoiceItem[]>();
  for (const item of items) {
    const key = item.date;
    const bucket = map.get(key) ?? [];
    bucket.push(item);
    map.set(key, bucket);
  }
  return map;
}

const PAYMENT_STATUS_BADGE: Record<string, string> = {
  Unpaid: "bg-amber-100 text-amber-700",
  Paid: "bg-green-100 text-green-700",
  Partial: "bg-blue-100 text-blue-700",
  Void: "bg-gray-100 text-gray-500",
};

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
  const [copied, setCopied] = useState(false);

  // ---------------------------------------------------------------------------
  // All hooks before any early returns (Pitfall #9, Rules of Hooks)
  // ---------------------------------------------------------------------------
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
    weekStartMs > 0 ? { subscriptionId, weekStart: weekStartMs } : "skip",
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

  // ---------------------------------------------------------------------------
  // Loading guards (D12)
  // ---------------------------------------------------------------------------
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
  const {
    invoiceNumber,
    paymentStatus,
    items,
    finalTotal,
    buyerName,
    bankName,
    bankAccountNumber,
    bankAccountName,
  } = invoiceDoc;

  const weekLabel = formatSubscriptionWeekLabel(weekStartMs);
  const statusClass =
    PAYMENT_STATUS_BADGE[paymentStatus ?? "Unpaid"] ?? "bg-gray-100 text-gray-500";
  const isPaid = paymentStatus === "Paid";

  const byDate = groupByDate((items as InvoiceItem[]) ?? []);
  const sortedDates = [...byDate.keys()].sort((a, b) => (a ?? 0) - (b ?? 0));

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

  function handleCopyRef() {
    navigator.clipboard.writeText(invoiceNumber ?? "").then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
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
    <div className="space-y-6 print:space-y-4">
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
        </div>
      </div>

      {/* Bank transfer reference — PROMINENT (gap#1 A3, customer copies into memo) */}
      <Card className="border-2 border-primary/30 print:border print:border-gray-400">
        <CardContent className="pt-5 pb-4">
          <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
            <div>
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-1">
                Bank Transfer Reference
              </p>
              <p className="text-2xl font-bold font-mono tracking-wider text-primary">
                {invoiceNumber}
              </p>
              <p className="text-xs text-muted-foreground mt-1">
                Customer copies this into the transfer memo field
              </p>
            </div>
            <div className="flex flex-col gap-0.5 text-sm">
              <p className="font-medium">{bankName}</p>
              <p className="font-mono text-foreground">{bankAccountNumber}</p>
              <p className="text-muted-foreground">a/n {bankAccountName}</p>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={handleCopyRef}
              className="self-start text-xs print:hidden"
            >
              <Copy className="h-3.5 w-3.5 mr-1.5" />
              {copied ? "Copied!" : "Copy ref"}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Day-by-day invoice cards */}
      {sortedDates.length === 0 ? (
        <EmptyState
          icon={FileText}
          title="No items on this invoice"
          description="The week has no planned delivery items."
        />
      ) : (
        <div className="space-y-3">
          {sortedDates.map((dateMs) => {
            const dayItems = byDate.get(dateMs) ?? [];
            const dayTotal = dayItems.reduce((s, it) => s + it.lineTotal, 0);
            const dateLabel =
              dateMs != null ? formatIndonesianDate(dateMs) : "Date not set";
            const dateStr = dateMs != null ? utcToWibDateStr(dateMs) : "";

            return (
              <Card key={dateMs ?? "no-date"} className="print:shadow-none print:border">
                <CardHeader className="pb-2 pt-4">
                  <CardTitle className="text-sm font-semibold flex items-center justify-between">
                    <span>{dateLabel}</span>
                    <span className="text-xs text-muted-foreground font-normal">{dateStr}</span>
                  </CardTitle>
                </CardHeader>
                <CardContent className="pb-4">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-xs text-muted-foreground border-b">
                        <th className="text-left pb-1.5 font-medium">Product</th>
                        <th className="text-right pb-1.5 font-medium">Qty</th>
                        <th className="text-right pb-1.5 font-medium">Unit price</th>
                        <th className="text-right pb-1.5 font-medium">Subtotal</th>
                      </tr>
                    </thead>
                    <tbody>
                      {dayItems.map((item, i) => (
                        <tr key={i} className="border-b last:border-0">
                          <td className="py-1.5 pr-2">{item.productName}</td>
                          <td className="py-1.5 text-right tabular-nums">{item.qty}</td>
                          <td className="py-1.5 text-right tabular-nums">
                            {formatCurrency(item.unitPrice)}
                          </td>
                          <td className="py-1.5 text-right tabular-nums font-medium">
                            {formatCurrency(item.lineTotal)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot>
                      <tr>
                        <td
                          colSpan={3}
                          className="pt-2 text-right text-xs text-muted-foreground font-medium"
                        >
                          Day total
                        </td>
                        <td className="pt-2 text-right font-semibold tabular-nums">
                          {formatCurrency(dayTotal)}
                        </td>
                      </tr>
                    </tfoot>
                  </table>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* Week total */}
      {sortedDates.length > 0 && (
        <Card className="print:shadow-none print:border">
          <CardContent className="pt-4 pb-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-semibold">
                  Week total (= credit funded on payment)
                </p>
                <p className="text-xs text-muted-foreground mt-0.5">{weekLabel}</p>
              </div>
              <p className="text-2xl font-bold tabular-nums">{formatCurrency(finalTotal)}</p>
            </div>
            <Separator className="my-3" />
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span>Invoice {invoiceNumber}</span>
              <Badge className={`text-xs font-medium ${statusClass}`}>
                {paymentStatus ?? "Unpaid"}
              </Badge>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Bottom CTA — only visible when unpaid and there are items */}
      {!isPaid && sortedDates.length > 0 && (
        <div className="flex justify-end print:hidden">
          <MarkPaidInvoiceButton marking={marking} onClick={handleMarkPaid} />
        </div>
      )}
    </div>
  );
}
