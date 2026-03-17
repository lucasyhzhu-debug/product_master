import { useCallback, useEffect, useRef, useState } from "react";
import { useParams, useSearchParams, useNavigate } from "react-router-dom";
import {
  ArrowLeft,
  Eye,
  Printer,
  FileText,
  Trash2,
  Plus,
} from "lucide-react";
import type { Id } from "../../convex/_generated/dataModel";

import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/layout";
import { LoadingCards, ConfirmDialog } from "@/components/shared";
import { InvoiceForm } from "@/components/invoice/InvoiceForm";
import { InvoicePrintView } from "@/components/invoice/InvoicePrintView";
import type { InvoicePrintData } from "@/components/invoice/InvoicePrintView";
import {
  useInvoicesByOrder,
  useCreateInvoiceDraft,
  useDiscardInvoiceDraft,
  useFinalizeInvoice,
  type Invoice,
} from "@/hooks/convex";
import { useDocumentTitle } from "@/hooks/useDocumentTitle";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type SaveStatus = "idle" | "saving" | "saved";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Convert an Invoice to InvoicePrintData for the print view component. */
function toInvoicePrintData(inv: Invoice): InvoicePrintData {
  return {
    invoiceNumber: inv.invoiceNumber,
    generatedAt: inv.generatedAt,
    sellerName: inv.sellerName,
    sellerAddress: inv.sellerAddress,
    sellerPhone: inv.sellerPhone,
    sellerEmail: inv.sellerEmail,
    sellerNpwp: inv.sellerNpwp,
    bankName: inv.bankName,
    bankAccountNumber: inv.bankAccountNumber,
    bankAccountName: inv.bankAccountName,
    buyerName: inv.buyerName,
    buyerCompany: inv.buyerCompany,
    buyerNpwp: inv.buyerNpwp,
    buyerAddress: inv.buyerAddress,
    buyerPhone: inv.buyerPhone,
    poNumber: inv.poNumber,
    orderNumber: inv.orderNumber,
    orderDate: inv.orderDate,
    dueDate: inv.dueDate,
    items: inv.items,
    subtotal: inv.subtotal,
    discountAmount: inv.discountAmount,
    discountLabel: inv.discountLabel,
    deliveryFee: inv.deliveryFee,
    finalTotal: inv.finalTotal,
    paymentStatus: inv.paymentStatus,
    paymentMethod: inv.paymentMethod,
    notes: inv.notes,
    sellerLogoUrl: inv.sellerLogoUrl,
  };
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function InvoicePage() {
  const { orderId: orderIdParam, invoiceNumber } = useParams<{
    orderId: string;
    invoiceNumber: string;
  }>();
  const [searchParams] = useSearchParams();
  const isPreview = searchParams.has("preview");
  const navigate = useNavigate();

  // Guard against malformed URL params
  const orderId =
    orderIdParam && orderIdParam.length > 0
      ? (orderIdParam as Id<"orders">)
      : undefined;

  // ---------------------------------------------------------------------------
  // Hooks (ALL called before any conditional returns -- React rules)
  // ---------------------------------------------------------------------------

  const invoices = useInvoicesByOrder(orderId);
  const createDraft = useCreateInvoiceDraft();
  const discardDraft = useDiscardInvoiceDraft();
  const finalizeInvoice = useFinalizeInvoice();

  // Find draft or finalized invoice
  const draft = invoices?.find(
    (inv) => inv.status === "draft",
  ) as Invoice | undefined;
  const finalizedInvoice = invoiceNumber
    ? (invoices?.find(
        (inv) => inv.invoiceNumber === invoiceNumber,
      ) as Invoice | undefined)
    : undefined;

  // Determine which invoice to show for tab title
  const displayInvoice = invoiceNumber ? finalizedInvoice : draft;

  // Browser tab title
  useDocumentTitle(
    displayInvoice?.orderNumber
      ? `Invoice - ${displayInvoice.orderNumber}`
      : "Invoice",
  );

  // ---------------------------------------------------------------------------
  // Auto-create draft when navigating to form mode without one
  // ---------------------------------------------------------------------------

  const creatingRef = useRef(false);
  const [createError, setCreateError] = useState<string | null>(null);

  useEffect(() => {
    if (!orderId || draft || creatingRef.current || invoiceNumber) return;
    // Only auto-create when invoices have loaded and no draft exists
    if (invoices === undefined) return;

    creatingRef.current = true;
    setCreateError(null);
    createDraft.mutate({ orderId }).catch((err: Error) => {
      // Reset ref so user can retry on failure
      creatingRef.current = false;
      setCreateError(err.message || "Failed to create invoice draft. The order may not be in an invoiceable status.");
    });
  }, [orderId, draft, invoices, invoiceNumber, createDraft]);

  // ---------------------------------------------------------------------------
  // Save status tracking for form mode
  // ---------------------------------------------------------------------------

  const [saveStatus, setSaveStatus] = useState<SaveStatus>("idle");
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const [savedAgoText, setSavedAgoText] = useState("");

  const handleSaveStatusChange = useCallback((status: SaveStatus) => {
    setSaveStatus(status);
    if (status === "saved") {
      setSavedAt(Date.now());
      setSavedAgoText("Saved just now");
    }
  }, []);

  // Update "Saved X min ago" text
  useEffect(() => {
    if (saveStatus !== "saved" || !savedAt) return;

    const interval = setInterval(() => {
      const minutes = Math.floor((Date.now() - savedAt) / 60_000);
      if (minutes >= 1) {
        setSavedAgoText(`Saved ${minutes} min ago`);
      }
    }, 60_000);

    return () => clearInterval(interval);
  }, [saveStatus, savedAt]);

  // ---------------------------------------------------------------------------
  // Dialog states
  // ---------------------------------------------------------------------------

  const [showDiscardDialog, setShowDiscardDialog] = useState(false);
  const [showFinalizeDialog, setShowFinalizeDialog] = useState(false);
  const [isDiscarding, setIsDiscarding] = useState(false);
  const [isFinalizing, setIsFinalizing] = useState(false);

  const handleDiscard = useCallback(async () => {
    if (!draft) return;
    setIsDiscarding(true);
    try {
      await discardDraft.mutate({ invoiceId: draft._id });
      navigate(`/orders/${orderId}`);
    } finally {
      setIsDiscarding(false);
      setShowDiscardDialog(false);
    }
  }, [draft, discardDraft, navigate, orderId]);

  const handleFinalize = useCallback(async () => {
    if (!draft) return;
    setIsFinalizing(true);
    try {
      const result = await finalizeInvoice.mutate({ invoiceId: draft._id });
      if (result && typeof result === "object" && "invoiceNumber" in result) {
        navigate(
          `/orders/${orderId}/invoice/${(result as { invoiceNumber: string }).invoiceNumber}`,
        );
      }
    } finally {
      setIsFinalizing(false);
      setShowFinalizeDialog(false);
    }
  }, [draft, finalizeInvoice, navigate, orderId]);

  const handleNewInvoice = useCallback(async () => {
    if (!orderId) return;
    creatingRef.current = true;
    try {
      await createDraft.mutate({ orderId });
      navigate(`/orders/${orderId}/invoice`);
    } catch {
      creatingRef.current = false;
    }
  }, [orderId, createDraft, navigate]);

  // ---------------------------------------------------------------------------
  // Error state: invalid orderId
  // ---------------------------------------------------------------------------

  if (!orderId) {
    return (
      <div className="print:hidden">
        <PageHeader title="Invoice" />
        <div className="rounded-lg border border-destructive/50 bg-destructive/5 p-6 text-center">
          <p className="text-destructive font-medium">Invalid order ID</p>
          <Button
            variant="outline"
            className="mt-4"
            onClick={() => navigate("/orders")}
          >
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back to Orders
          </Button>
        </div>
      </div>
    );
  }

  // ---------------------------------------------------------------------------
  // Loading state
  // ---------------------------------------------------------------------------

  if (invoices === undefined) {
    return (
      <div>
        <PageHeader title="Invoice" backTo={`/orders/${orderId}`} />
        <LoadingCards count={2} />
      </div>
    );
  }

  // ---------------------------------------------------------------------------
  // PRINT VIEW MODE: /orders/:orderId/invoice/:invoiceNumber
  // ---------------------------------------------------------------------------

  if (invoiceNumber) {
    if (!finalizedInvoice) {
      return (
        <div className="print:hidden">
          <PageHeader title="Invoice" backTo={`/orders/${orderId}`} />
          <div className="rounded-lg border border-muted p-6 text-center">
            <p className="text-muted-foreground">
              Invoice {invoiceNumber} not found
            </p>
            <Button
              variant="outline"
              className="mt-4"
              onClick={() => navigate(`/orders/${orderId}`)}
            >
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back to Order
            </Button>
          </div>
        </div>
      );
    }

    return (
      <div>
        {/* Action buttons (hidden on print) */}
        <div className="print:hidden mb-6 flex items-center justify-between">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => navigate(`/orders/${orderId}`)}
          >
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back to Order
          </Button>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={handleNewInvoice}>
              <Plus className="h-4 w-4 mr-2" />
              New Invoice
            </Button>
            <Button size="sm" onClick={() => window.print()}>
              <Printer className="h-4 w-4 mr-2" />
              Print
            </Button>
          </div>
        </div>

        {/* Print view -- bare wrapper */}
        <div className="invoice-print-area">
          <InvoicePrintView data={toInvoicePrintData(finalizedInvoice)} />
        </div>
      </div>
    );
  }

  // ---------------------------------------------------------------------------
  // PREVIEW MODE: /orders/:orderId/invoice?preview
  // ---------------------------------------------------------------------------

  if (isPreview && draft) {
    return (
      <div>
        {/* Action buttons (hidden on print) */}
        <div className="print:hidden mb-6 flex items-center justify-between">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => navigate(`/orders/${orderId}/invoice`)}
          >
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back to Edit
          </Button>
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              onClick={() => setShowFinalizeDialog(true)}
            >
              <FileText className="h-4 w-4 mr-2" />
              Generate Invoice
            </Button>
          </div>
        </div>

        {/* Preview wrapper with invoice-print-area class */}
        <div className="invoice-print-area border rounded-lg shadow-sm mx-auto max-w-[210mm] bg-white">
          <InvoicePrintView data={toInvoicePrintData(draft)} />
        </div>

        {/* Finalize dialog */}
        <ConfirmDialog
          open={showFinalizeDialog}
          onOpenChange={setShowFinalizeDialog}
          title="Generate Invoice"
          description="This will finalize the invoice and assign a number. This cannot be undone."
          confirmLabel="Generate Invoice"
          onConfirm={handleFinalize}
          loading={isFinalizing}
        />
      </div>
    );
  }

  // ---------------------------------------------------------------------------
  // FORM MODE: /orders/:orderId/invoice (default)
  // ---------------------------------------------------------------------------

  // Draft still being created or creation failed
  if (!draft) {
    return (
      <div>
        <PageHeader title="Invoice" backTo={`/orders/${orderId}`} />
        {createError ? (
          <div className="rounded-lg border border-destructive/50 bg-destructive/5 p-6 text-center">
            <p className="text-destructive font-medium">{createError}</p>
            <Button
              variant="outline"
              className="mt-4"
              onClick={() => navigate(`/orders/${orderId}`)}
            >
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back to Order
            </Button>
          </div>
        ) : (
          <div className="flex items-center justify-center py-12">
            <p className="text-muted-foreground">Creating draft...</p>
          </div>
        )}
      </div>
    );
  }

  // Save status display text
  const saveStatusText =
    saveStatus === "saving"
      ? "Saving..."
      : saveStatus === "saved"
        ? savedAgoText
        : "";

  return (
    <div>
      {/* Action bar (hidden on print) */}
      <div className="print:hidden mb-6 flex items-center justify-between">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => navigate(`/orders/${orderId}`)}
        >
          <ArrowLeft className="h-4 w-4 mr-2" />
          Back to Order
        </Button>
        <div className="flex items-center gap-3">
          {saveStatusText && (
            <span className="text-xs text-muted-foreground">
              {saveStatusText}
            </span>
          )}
          <Button
            variant="outline"
            size="sm"
            className="text-destructive hover:text-destructive"
            onClick={() => setShowDiscardDialog(true)}
          >
            <Trash2 className="h-4 w-4 mr-2" />
            Discard Draft
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => navigate(`/orders/${orderId}/invoice?preview`)}
          >
            <Eye className="h-4 w-4 mr-2" />
            Preview
          </Button>
          <Button size="sm" onClick={() => setShowFinalizeDialog(true)}>
            <FileText className="h-4 w-4 mr-2" />
            Generate Invoice
          </Button>
        </div>
      </div>

      {/* Invoice Form */}
      <InvoiceForm
        invoice={draft}
        onSaveStatusChange={handleSaveStatusChange}
      />

      {/* Discard draft dialog */}
      <ConfirmDialog
        open={showDiscardDialog}
        onOpenChange={setShowDiscardDialog}
        title="Discard Draft"
        description="Are you sure you want to discard this invoice draft? This cannot be undone."
        confirmLabel="Discard"
        variant="destructive"
        onConfirm={handleDiscard}
        loading={isDiscarding}
      />

      {/* Finalize dialog */}
      <ConfirmDialog
        open={showFinalizeDialog}
        onOpenChange={setShowFinalizeDialog}
        title="Generate Invoice"
        description="This will finalize the invoice and assign a number. This cannot be undone."
        confirmLabel="Generate Invoice"
        onConfirm={handleFinalize}
        loading={isFinalizing}
      />
    </div>
  );
}
