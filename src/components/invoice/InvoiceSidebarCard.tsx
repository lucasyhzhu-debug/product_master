import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { FileText, Eye, Printer, Plus, Trash2, ChevronDown, ChevronRight } from "lucide-react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ConfirmDialog } from "@/components/shared";
import { useInvoicesByOrder, useDiscardInvoiceDraft } from "@/hooks/convex";
import { formatDateTimeId } from "@/lib/dateUtils";
import type { Id } from "../../../convex/_generated/dataModel";

// ============================================================================
// TYPES
// ============================================================================

interface InvoiceSidebarCardProps {
  orderId: Id<"orders">;
  orderStatus: string;
}

// ============================================================================
// CONSTANTS
// ============================================================================

const INVOICEABLE_STATUSES = new Set([
  "PaymentReceived",
  "BeingPrepared",
  "AwaitingDelivery",
  "Complete",
]);

// ============================================================================
// COMPONENT
// ============================================================================

export function InvoiceSidebarCard({ orderId, orderStatus }: InvoiceSidebarCardProps) {
  const invoices = useInvoicesByOrder(orderId);
  const discardDraft = useDiscardInvoiceDraft();
  const navigate = useNavigate();

  const [showDiscardDialog, setShowDiscardDialog] = useState(false);
  const [showOlderInvoices, setShowOlderInvoices] = useState(false);

  // Visibility logic
  const canCreate = INVOICEABLE_STATUSES.has(orderStatus);
  const canView = canCreate || orderStatus === "Cancelled";

  // Don't render for Draft or AwaitingPayment
  if (!canView) return null;

  // Loading state
  if (invoices === undefined) return null;

  // Derive state
  const draft = invoices.find((inv) => inv.status === "draft");
  const finals = invoices.filter((inv) => inv.status === "final");
  const latestFinal = finals[0]; // Already sorted by _creationTime desc
  const olderFinals = finals.slice(1);

  // Cancelled + no invoices (no draft, no finals): don't render
  if (orderStatus === "Cancelled" && !draft && finals.length === 0) {
    return null;
  }

  const handleDiscard = async () => {
    if (!draft) return;
    await discardDraft.mutate({ invoiceId: draft._id });
    setShowDiscardDialog(false);
  };

  // ----------------------------------------
  // State 1: No Invoice (no draft, no finals)
  // ----------------------------------------
  if (!draft && finals.length === 0) {
    return (
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center gap-2">
            <FileText className="h-4 w-4" />
            Invoice
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm text-muted-foreground">
            No invoice generated for this order
          </p>
          {canCreate && (
            <Button
              className="w-full"
              onClick={() => navigate(`/orders/${orderId}/invoice`)}
            >
              <FileText className="h-4 w-4 mr-2" />
              Generate Invoice
            </Button>
          )}
        </CardContent>
      </Card>
    );
  }

  // ----------------------------------------
  // State 2: Draft Saved
  // ----------------------------------------
  if (draft && finals.length === 0) {
    return (
      <>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <FileText className="h-4 w-4" />
              Invoice
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex items-center gap-2">
              <Badge variant="outline" className="text-xs">Draft</Badge>
            </div>
            <p className="text-xs text-muted-foreground">
              Last edited: {formatDateTimeId(draft.updatedAt)}
            </p>
            <Button
              className="w-full"
              onClick={() => navigate(`/orders/${orderId}/invoice`)}
            >
              Continue Editing
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="w-full"
              onClick={() => setShowDiscardDialog(true)}
            >
              <Trash2 className="h-3 w-3 mr-1" />
              Discard
            </Button>
          </CardContent>
        </Card>

        <ConfirmDialog
          open={showDiscardDialog}
          onOpenChange={setShowDiscardDialog}
          title="Discard Draft?"
          description="Discard this invoice draft? This cannot be undone."
          onConfirm={handleDiscard}
          confirmLabel="Discard"
          variant="destructive"
        />
      </>
    );
  }

  // ----------------------------------------
  // State 3: Finalized (has at least one final invoice)
  // ----------------------------------------
  return (
    <>
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center gap-2">
            <FileText className="h-4 w-4" />
            Invoice
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {/* Latest finalized invoice */}
          {latestFinal && (
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <Badge className="text-xs font-mono">
                  {latestFinal.invoiceNumber}
                </Badge>
              </div>
              <p className="text-xs text-muted-foreground">
                {latestFinal.generatedAt ? formatDateTimeId(latestFinal.generatedAt) : "—"}
              </p>
              {latestFinal.buyerCompany && (
                <p className="text-xs text-muted-foreground truncate">
                  {latestFinal.buyerCompany}
                </p>
              )}
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  className="flex-1"
                  onClick={() =>
                    navigate(`/orders/${orderId}/invoice/${latestFinal.invoiceNumber}`)
                  }
                >
                  <Eye className="h-3 w-3 mr-1" />
                  View
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="flex-1"
                  onClick={() =>
                    navigate(`/orders/${orderId}/invoice/${latestFinal.invoiceNumber}`)
                  }
                >
                  <Printer className="h-3 w-3 mr-1" />
                  Re-print
                </Button>
              </div>
            </div>
          )}

          {/* New Invoice button (only for invoiceable statuses, not Cancelled) */}
          {canCreate && (
            <Button
              variant="ghost"
              size="sm"
              className="w-full"
              onClick={() => navigate(`/orders/${orderId}/invoice`)}
            >
              <Plus className="h-3 w-3 mr-1" />
              New Invoice
            </Button>
          )}

          {/* Draft in progress alongside finals */}
          {draft && (
            <div className="border-t pt-2 space-y-2">
              <div className="flex items-center gap-2">
                <Badge variant="outline" className="text-xs">Draft in Progress</Badge>
              </div>
              <p className="text-xs text-muted-foreground">
                Last edited: {formatDateTimeId(draft.updatedAt)}
              </p>
              <div className="flex gap-2">
                <Button
                  size="sm"
                  className="flex-1"
                  onClick={() => navigate(`/orders/${orderId}/invoice`)}
                >
                  Continue Editing
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setShowDiscardDialog(true)}
                >
                  <Trash2 className="h-3 w-3" />
                </Button>
              </div>
            </div>
          )}

          {/* Older finalized invoices */}
          {olderFinals.length > 0 && (
            <div className="border-t pt-2">
              <button
                type="button"
                className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors w-full"
                onClick={() => setShowOlderInvoices(!showOlderInvoices)}
              >
                {showOlderInvoices ? (
                  <ChevronDown className="h-3 w-3" />
                ) : (
                  <ChevronRight className="h-3 w-3" />
                )}
                {olderFinals.length} older invoice{olderFinals.length > 1 ? "s" : ""}
              </button>
              {showOlderInvoices && (
                <div className="mt-2 space-y-1.5">
                  {olderFinals.map((inv) => (
                    <button
                      key={inv._id}
                      type="button"
                      className="flex items-center justify-between w-full text-xs text-muted-foreground hover:text-foreground transition-colors py-1"
                      onClick={() =>
                        navigate(`/orders/${orderId}/invoice/${inv.invoiceNumber}`)
                      }
                    >
                      <span className="font-mono">{inv.invoiceNumber}</span>
                      <span>{inv.generatedAt ? formatDateTimeId(inv.generatedAt) : "—"}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Discard dialog for draft alongside finals */}
      {draft && (
        <ConfirmDialog
          open={showDiscardDialog}
          onOpenChange={setShowDiscardDialog}
          title="Discard Draft?"
          description="Discard this invoice draft? This cannot be undone."
          onConfirm={handleDiscard}
          confirmLabel="Discard"
          variant="destructive"
        />
      )}
    </>
  );
}
