/**
 * InvoiceViewPage — /invoices/:invoiceId
 *
 * The canonical, read-only page for ANY invoice (order invoice or subscription
 * weekly / top-up invoice), reachable by its id. Fixes CRM principle A1: several
 * surfaces (activity timeline, funding dashboard, week back-references) render
 * `/invoices/:id` links, but no such route existed — they silently bounced to the
 * catch-all. This page is that missing canonical target.
 *
 * Loads the invoice via `api.invoices.queries.getById` (manager+admin) and renders
 * the shared `InvoicePrintView`. Back + Print actions; window.print() for PDF.
 *
 * D12: designed loading / not-found / invalid-id states.
 * Pitfall #9: all hooks before early returns.
 */
import { useParams, useNavigate } from "react-router-dom";
import { ArrowLeft, Printer, Receipt } from "lucide-react";
import { useSessionQuery } from "convex-helpers/react/sessions";

import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/shared/EmptyState";
import { LoadingPage } from "@/components/shared/LoadingState";
import { InvoicePrintView, type InvoicePrintData } from "@/components/invoice/InvoicePrintView";

/**
 * Convex ids are ~32 chars of [A-Za-z0-9_-]. A missing / malformed value would fail
 * v.id() validation server-side and throw — detect it here and show a friendly state.
 */
function isValidConvexId(id: string | undefined): id is string {
  return typeof id === "string" && id.length >= 20 && /^[A-Za-z0-9_-]+$/.test(id);
}

export function InvoiceViewPage() {
  const { invoiceId } = useParams<{ invoiceId: string }>();
  const navigate = useNavigate();

  const validId = isValidConvexId(invoiceId);

  // All hooks before any early return (Pitfall #9).
  const invoice = useSessionQuery(
    api.invoices.queries.getById,
    validId ? { invoiceId: invoiceId as Id<"invoices"> } : "skip",
  );

  if (!validId) {
    return (
      <EmptyState
        icon={Receipt}
        title="Invoice not found"
        description="The invoice ID in this URL is invalid."
        action={{ label: "Go back", onClick: () => navigate(-1) }}
      />
    );
  }

  if (invoice === undefined) {
    return <LoadingPage />;
  }

  if (invoice === null) {
    return (
      <EmptyState
        icon={Receipt}
        title="Invoice not found"
        description="This invoice could not be loaded. It may have been deleted."
        action={{ label: "Go back", onClick: () => navigate(-1) }}
      />
    );
  }

  const printData: InvoicePrintData = invoice;

  return (
    <div className="space-y-4">
      {/* Action bar — hidden when printing */}
      <div className="flex items-center justify-between print:hidden">
        <Button variant="ghost" size="sm" onClick={() => navigate(-1)}>
          <ArrowLeft className="h-4 w-4 mr-2" />
          Back
        </Button>
        <Button size="sm" onClick={() => window.print()}>
          <Printer className="h-4 w-4 mr-2" />
          Print / PDF
        </Button>
      </div>

      {/* Canonical read-only invoice */}
      <div className="rounded border bg-white shadow-sm print:rounded-none print:border-0 print:shadow-none">
        <InvoicePrintView data={printData} showSignature={false} />
      </div>
    </div>
  );
}
