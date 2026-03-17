import { useCallback, useEffect, useRef, useState } from "react";
import { InvoiceFieldInput, type FieldSource } from "./InvoiceFieldInput";
import { useUpdateInvoiceDraft, type Invoice } from "@/hooks/convex";
import { formatCurrency } from "@/lib/utils";
import { formatIndonesianDate } from "@/lib/dateUtils";
import { Badge } from "@/components/ui/badge";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface InvoiceFormProps {
  invoice: Invoice;
  onSaveStatusChange?: (status: "idle" | "saving" | "saved") => void;
}

/** Fields tracked in the form with their value + source. */
interface FieldState {
  value: string;
  source: FieldSource;
}

type FormFields = Record<string, FieldState>;

// ---------------------------------------------------------------------------
// Auto-save hook (extracted for testability)
// ---------------------------------------------------------------------------

export interface AutoSaveConfig {
  invoiceId: string;
  onStatusChange?: (status: "idle" | "saving" | "saved") => void;
  saveFn: (args: Record<string, unknown>) => Promise<unknown>;
}

/**
 * Hook that accumulates field changes and debounces the save call.
 *
 * The "saving" status is set INSIDE the timeout callback, NOT on every
 * keystroke. This means the user only sees "Saving..." when the mutation
 * is actually about to fire.
 */
export function useAutoSave({ invoiceId, onStatusChange, saveFn }: AutoSaveConfig) {
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const changedFieldsRef = useRef<Record<string, unknown>>({});
  const isInitializedRef = useRef(false);
  const savedTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  /** Schedule a debounced save. Accumulates field changes. */
  const scheduleChange = useCallback(
    (fieldName: string, value: unknown) => {
      // Prevent auto-save during initial load
      if (!isInitializedRef.current) return;

      // Accumulate change
      changedFieldsRef.current[fieldName] = value;

      // Clear any existing debounce timer
      if (saveTimerRef.current) {
        clearTimeout(saveTimerRef.current);
      }

      // Set new 2-second debounce
      saveTimerRef.current = setTimeout(async () => {
        const fieldsToSave = { ...changedFieldsRef.current };
        changedFieldsRef.current = {};

        if (Object.keys(fieldsToSave).length === 0) return;

        // CRITICAL: Set "saving" inside the timeout, not on keypress
        onStatusChange?.("saving");

        try {
          await saveFn({ invoiceId, ...fieldsToSave });
          onStatusChange?.("saved");

          // Clear any previous "saved -> idle" timer
          if (savedTimerRef.current) {
            clearTimeout(savedTimerRef.current);
          }
          // Transition to idle after 5 seconds
          savedTimerRef.current = setTimeout(() => {
            onStatusChange?.("idle");
          }, 5000);
        } catch {
          // On error, revert to idle so user knows save failed
          onStatusChange?.("idle");
        }
      }, 2000);
    },
    [invoiceId, onStatusChange, saveFn],
  );

  /** Mark initialization complete (call after setting initial form state). */
  const markInitialized = useCallback(() => {
    isInitializedRef.current = true;
  }, []);

  /** Cleanup timers on unmount. */
  useEffect(() => {
    return () => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
      if (savedTimerRef.current) clearTimeout(savedTimerRef.current);
    };
  }, []);

  return { scheduleChange, markInitialized };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Determine initial source for a field. */
function initialSource(
  value: string | undefined | null,
  defaultSource: FieldSource,
): FieldSource {
  if (defaultSource === "needs-input") {
    return value ? "auto" : "needs-input";
  }
  return defaultSource;
}

function initField(value: string | undefined | null, defaultSource: FieldSource): FieldState {
  return {
    value: value ?? "",
    source: initialSource(value, defaultSource),
  };
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function InvoiceForm({ invoice, onSaveStatusChange }: InvoiceFormProps) {
  const updateDraft = useUpdateInvoiceDraft();

  // Stable save function reference
  const saveFnRef = useRef(updateDraft.mutate);
  saveFnRef.current = updateDraft.mutate;
  const stableSaveFn = useCallback(
    (args: Record<string, unknown>) => saveFnRef.current(args as Parameters<typeof updateDraft.mutate>[0]),
    [],
  );

  const { scheduleChange, markInitialized } = useAutoSave({
    invoiceId: invoice._id,
    onStatusChange: onSaveStatusChange,
    saveFn: stableSaveFn,
  });

  // -------------------------------------------------------------------------
  // Form state -- initialized from loaded invoice
  // -------------------------------------------------------------------------

  const [fields, setFields] = useState<FormFields>(() => {
    const f: FormFields = {
      // Auto-filled from business settings (seller)
      sellerName: initField(invoice.sellerName, "auto"),
      sellerAddress: initField(invoice.sellerAddress, "auto"),
      sellerPhone: initField(invoice.sellerPhone, "auto"),
      sellerEmail: initField(invoice.sellerEmail, "auto"),
      sellerNpwp: initField(invoice.sellerNpwp, "auto"),
      // Auto-filled bank
      bankName: initField(invoice.bankName, "auto"),
      bankAccountNumber: initField(invoice.bankAccountNumber, "auto"),
      bankAccountName: initField(invoice.bankAccountName, "auto"),
      // Auto-filled from customer/order (buyer)
      buyerName: initField(invoice.buyerName, "auto"),
      buyerPhone: initField(invoice.buyerPhone, "auto"),
      // Needs-input (unless pre-filled)
      buyerCompany: initField(invoice.buyerCompany, "needs-input"),
      buyerNpwp: initField(invoice.buyerNpwp, "needs-input"),
      buyerAddress: initField(invoice.buyerAddress, "needs-input"),
      poNumber: initField(invoice.poNumber, "needs-input"),
      notes: initField(invoice.notes, "needs-input"),
      dueDate: initField(
        invoice.dueDate ? new Date(invoice.dueDate).toISOString().split("T")[0] : undefined,
        "needs-input",
      ),
    };
    return f;
  });

  // Mark as initialized after first render
  const didInit = useRef(false);
  useEffect(() => {
    if (!didInit.current) {
      didInit.current = true;
      markInitialized();
    }
  }, [markInitialized]);

  // -------------------------------------------------------------------------
  // Field change handler with source transitions
  // -------------------------------------------------------------------------

  const handleFieldChange = useCallback(
    (fieldName: string, newValue: string) => {
      setFields((prev) => {
        const current = prev[fieldName];
        if (!current) return prev;

        let newSource: FieldSource = current.source;
        if (current.source === "auto") {
          newSource = "edited";
        } else if (current.source === "needs-input" && newValue.length > 0) {
          newSource = "edited";
        }

        return {
          ...prev,
          [fieldName]: { value: newValue, source: newSource },
        };
      });

      // Map dueDate from YYYY-MM-DD string to epoch ms number for backend
      if (fieldName === "dueDate") {
        const dateMs = newValue ? new Date(newValue).getTime() : undefined;
        if (dateMs && !isNaN(dateMs)) {
          scheduleChange(fieldName, dateMs);
        }
      } else {
        scheduleChange(fieldName, newValue);
      }
    },
    [scheduleChange],
  );

  // -------------------------------------------------------------------------
  // Render helpers
  // -------------------------------------------------------------------------

  const f = (name: string) => fields[name] ?? { value: "", source: "auto" as FieldSource };

  return (
    <div className="max-w-[210mm] mx-auto bg-white border rounded-lg shadow-sm">
      {/* Field Color Legend (print:hidden) */}
      <div className="px-6 pt-4 print:hidden">
        <div className="flex items-center gap-4 text-xs text-muted-foreground mb-4">
          <span className="flex items-center gap-1.5">
            <span className="inline-block w-3 h-3 rounded border bg-[var(--invoice-field-auto)] border-[var(--invoice-field-auto-border)]" />
            Auto-filled
          </span>
          <span className="flex items-center gap-1.5">
            <span className="inline-block w-3 h-3 rounded border bg-[var(--invoice-field-input)] border-[var(--invoice-field-input-border)]" />
            Needs input
          </span>
          <span className="flex items-center gap-1.5">
            <span className="inline-block w-3 h-3 rounded border bg-white border-gray-200" />
            User edited
          </span>
        </div>
      </div>

      {/* Section 1: Header -- Seller info + INVOICE / DRAFT badge */}
      <div className="flex justify-between items-start px-6 pb-4" aria-label="Invoice header">
        <div className="flex-1 grid grid-cols-1 gap-2 max-w-md">
          <InvoiceFieldInput
            label="Seller Name"
            value={f("sellerName").value}
            source={f("sellerName").source}
            onChange={(v) => handleFieldChange("sellerName", v)}
          />
          <InvoiceFieldInput
            label="Seller Address"
            value={f("sellerAddress").value}
            source={f("sellerAddress").source}
            onChange={(v) => handleFieldChange("sellerAddress", v)}
            multiline
          />
          <div className="grid grid-cols-2 gap-2">
            <InvoiceFieldInput
              label="Seller Phone"
              value={f("sellerPhone").value}
              source={f("sellerPhone").source}
              onChange={(v) => handleFieldChange("sellerPhone", v)}
            />
            <InvoiceFieldInput
              label="Seller Email"
              value={f("sellerEmail").value}
              source={f("sellerEmail").source}
              onChange={(v) => handleFieldChange("sellerEmail", v)}
            />
          </div>
          <InvoiceFieldInput
            label="Seller NPWP"
            value={f("sellerNpwp").value}
            source={f("sellerNpwp").source}
            onChange={(v) => handleFieldChange("sellerNpwp", v)}
          />
        </div>
        <div className="text-right ml-6">
          <h1 className="text-2xl font-bold tracking-wide text-gray-800">INVOICE</h1>
          <Badge variant="outline" className="mt-1 text-amber-600 border-amber-300">
            DRAFT
          </Badge>
        </div>
      </div>

      {/* Section 2: Bill To */}
      <div className="mx-6 mb-4 p-4 bg-gray-50 rounded" aria-label="Buyer information">
        <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
          Bill To
        </h3>
        <div className="grid grid-cols-1 gap-2">
          <InvoiceFieldInput
            label="Buyer Name"
            value={f("buyerName").value}
            source={f("buyerName").source}
            onChange={(v) => handleFieldChange("buyerName", v)}
          />
          <InvoiceFieldInput
            label="Buyer Company"
            value={f("buyerCompany").value}
            source={f("buyerCompany").source}
            onChange={(v) => handleFieldChange("buyerCompany", v)}
            placeholder="Company name"
          />
          <InvoiceFieldInput
            label="Buyer NPWP"
            value={f("buyerNpwp").value}
            source={f("buyerNpwp").source}
            onChange={(v) => handleFieldChange("buyerNpwp", v)}
            placeholder="Tax ID number"
          />
          <InvoiceFieldInput
            label="Buyer Address"
            value={f("buyerAddress").value}
            source={f("buyerAddress").source}
            onChange={(v) => handleFieldChange("buyerAddress", v)}
            placeholder="Billing address"
            multiline
          />
          <InvoiceFieldInput
            label="Buyer Phone"
            value={f("buyerPhone").value}
            source={f("buyerPhone").source}
            onChange={(v) => handleFieldChange("buyerPhone", v)}
          />
        </div>
      </div>

      {/* Section 3: Order Details */}
      <div className="mx-6 mb-4 grid grid-cols-2 gap-x-6 gap-y-2" aria-label="Order details">
        <div className="space-y-1">
          <span className="text-xs text-muted-foreground">Order Number</span>
          <p className="text-sm font-medium">{invoice.orderNumber}</p>
        </div>
        <div className="space-y-1">
          <span className="text-xs text-muted-foreground">Order Date</span>
          <p className="text-sm font-medium">{formatIndonesianDate(invoice.orderDate)}</p>
        </div>
        <InvoiceFieldInput
          label="Due Date"
          value={f("dueDate").value}
          source={f("dueDate").source}
          onChange={(v) => handleFieldChange("dueDate", v)}
          placeholder="YYYY-MM-DD"
        />
        <InvoiceFieldInput
          label="PO Number"
          value={f("poNumber").value}
          source={f("poNumber").source}
          onChange={(v) => handleFieldChange("poNumber", v)}
          placeholder="Purchase order #"
        />
      </div>

      {/* Section 4: Items Table (read-only) */}
      <div className="mx-6 mb-4" aria-label="Invoice items">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="border-b-2 border-gray-300">
              <th className="py-2 text-left w-10">#</th>
              <th className="py-2 text-left">Product</th>
              <th className="py-2 text-right w-16">Qty</th>
              <th className="py-2 text-right w-32">Unit Price</th>
              <th className="py-2 text-right w-32">Line Total</th>
            </tr>
          </thead>
          <tbody>
            {invoice.items.map((item, idx) => (
              <tr key={idx} className="border-b border-gray-200">
                <td className="py-2">{idx + 1}</td>
                <td className="py-2">
                  <span>{item.productName}</span>
                  {item.variant && (
                    <span className="block text-xs text-gray-500">{item.variant}</span>
                  )}
                </td>
                <td className="py-2 text-right">{item.qty}</td>
                <td className="py-2 text-right">{formatCurrency(item.unitPrice)}</td>
                <td className="py-2 text-right">{formatCurrency(item.lineTotal)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Section 5: Totals (read-only) */}
      <div className="mx-6 mb-4 flex justify-end" aria-label="Invoice totals">
        <div className="w-64 space-y-1 text-sm">
          <div className="flex justify-between">
            <span className="text-gray-600">Subtotal</span>
            <span>{formatCurrency(invoice.subtotal)}</span>
          </div>
          {(invoice.discountAmount ?? 0) > 0 && (
            <div className="flex justify-between">
              <span className="text-gray-600">{invoice.discountLabel ?? "Discount"}</span>
              <span>-{formatCurrency(invoice.discountAmount!)}</span>
            </div>
          )}
          {(invoice.deliveryFee ?? 0) > 0 && (
            <div className="flex justify-between">
              <span className="text-gray-600">Delivery Fee</span>
              <span>{formatCurrency(invoice.deliveryFee!)}</span>
            </div>
          )}
          <div className="flex justify-between border-t border-gray-300 pt-2 mt-2">
            <span className="text-base font-bold">Grand Total</span>
            <span className="text-base font-bold">{formatCurrency(invoice.finalTotal)}</span>
          </div>
        </div>
      </div>

      {/* Section 6: Payment Info (read-only) */}
      <div className="mx-6 mb-4 grid grid-cols-2 gap-x-6 gap-y-2 text-sm" aria-label="Payment information">
        <div>
          <span className="text-gray-500">Bank Name:</span>{" "}
          <span className="font-medium">{invoice.bankName}</span>
        </div>
        <div>
          <span className="text-gray-500">Account Number:</span>{" "}
          <span className="font-medium">{invoice.bankAccountNumber}</span>
        </div>
        <div>
          <span className="text-gray-500">Account Name:</span>{" "}
          <span className="font-medium">{invoice.bankAccountName}</span>
        </div>
        <div>
          <span className="text-gray-500">Payment Status:</span>{" "}
          <span className="font-medium">{invoice.paymentStatus}</span>
        </div>
        {invoice.paymentMethod && (
          <div>
            <span className="text-gray-500">Payment Method:</span>{" "}
            <span className="font-medium">{invoice.paymentMethod}</span>
          </div>
        )}
      </div>

      {/* Section 7: Signature Area */}
      <div className="mx-6 mb-4">
        <div className="border border-dashed border-gray-300 rounded p-4 h-[100px] flex flex-col justify-between">
          <span className="text-xs text-gray-400">Authorized Signature</span>
          <div />
        </div>
      </div>

      {/* Section 8: Notes */}
      <div className="mx-6 mb-4" aria-label="Invoice notes">
        <InvoiceFieldInput
          label="Notes"
          value={f("notes").value}
          source={f("notes").source}
          onChange={(v) => handleFieldChange("notes", v)}
          placeholder="Additional notes..."
          multiline
        />
      </div>

      {/* Section 9: Footer Preview */}
      <div className="mx-6 pb-6 text-center text-sm">
        <p className="text-gray-600">Thank you for your business</p>
        <p className="text-gray-400 text-xs mt-1">{invoice.sellerName}</p>
      </div>
    </div>
  );
}
