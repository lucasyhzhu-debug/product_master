import type { Doc } from "../../../convex/_generated/dataModel";
import { formatIndonesianDate } from "@/lib/dateUtils";
import { formatCurrency } from "@/lib/utils";

// Derive from Convex schema type to prevent drift.
// sellerLogoUrl is added by the query layer (resolves sellerLogoStorageId -> URL),
// so it's added separately from the Pick<>.
type InvoiceDoc = Doc<"invoices">;

export type InvoicePrintData = Pick<
  InvoiceDoc,
  | "invoiceNumber"
  | "generatedAt"
  | "sellerName"
  | "sellerAddress"
  | "sellerPhone"
  | "sellerEmail"
  | "sellerNpwp"
  | "bankName"
  | "bankAccountNumber"
  | "bankAccountName"
  | "buyerName"
  | "buyerCompany"
  | "buyerNpwp"
  | "buyerAddress"
  | "buyerPhone"
  | "poNumber"
  | "orderNumber"
  | "orderDate"
  | "dueDate"
  | "items"
  | "subtotal"
  | "discountAmount"
  | "discountLabel"
  | "deliveryFee"
  | "finalTotal"
  | "paymentStatus"
  | "paymentMethod"
  | "notes"
> & {
  /** Resolved URL from sellerLogoStorageId (added by query layer) */
  sellerLogoUrl?: string | null;
};

interface InvoicePrintViewProps {
  data: InvoicePrintData;
}

export function InvoicePrintView({ data }: InvoicePrintViewProps) {
  const invoiceDate = formatIndonesianDate(data.generatedAt ?? Date.now());
  const orderDate = formatIndonesianDate(data.orderDate);
  const dueDate = data.dueDate ? formatIndonesianDate(data.dueDate) : "-";
  const isFinalized = !!data.invoiceNumber;

  return (
    <div className="bg-white text-black max-w-[210mm] mx-auto">
      {/* Section 1: Brand Bar */}
      <div className="invoice-brand-bar h-1 bg-brand" />

      {/* Section 2: Header */}
      <div className="flex justify-between items-start px-8 pt-6 pb-4" aria-label="Invoice header">
        <div className="flex items-start gap-4">
          {data.sellerLogoUrl && (
            <img
              src={data.sellerLogoUrl}
              alt={`${data.sellerName} logo`}
              className="max-h-16 w-auto object-contain"
              loading="eager"
            />
          )}
          <div className="space-y-0.5">
            <h2 className="text-lg font-bold">{data.sellerName}</h2>
            {data.sellerAddress && (
              <p className="text-sm text-gray-600">{data.sellerAddress}</p>
            )}
            {data.sellerPhone && (
              <p className="text-sm text-gray-600">{data.sellerPhone}</p>
            )}
            {data.sellerEmail && (
              <p className="text-sm text-gray-600">{data.sellerEmail}</p>
            )}
            {data.sellerNpwp && (
              <p className="text-sm text-gray-600">NPWP: {data.sellerNpwp}</p>
            )}
          </div>
        </div>
        <div className="text-right">
          <h1 className="text-2xl font-bold tracking-wide text-gray-800">INVOICE</h1>
          <p className="text-lg font-semibold mt-1">
            {isFinalized ? data.invoiceNumber : "DRAFT"}
          </p>
          <p className="text-sm text-gray-600 mt-1">{invoiceDate}</p>
        </div>
      </div>

      {/* Section 3: Bill To */}
      <div className="mx-8 mb-4 p-4 bg-gray-50 rounded" aria-label="Buyer information">
        <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
          Bill To
        </h3>
        <p className="font-semibold">{data.buyerName}</p>
        {data.buyerCompany && (
          <p className="text-sm text-gray-700">{data.buyerCompany}</p>
        )}
        {data.buyerNpwp && (
          <p className="text-sm text-gray-600">NPWP: {data.buyerNpwp}</p>
        )}
        {data.buyerAddress && (
          <p className="text-sm text-gray-600">{data.buyerAddress}</p>
        )}
        {data.buyerPhone && (
          <p className="text-sm text-gray-600">{data.buyerPhone}</p>
        )}
      </div>

      {/* Section 4: Order Details */}
      <div className="mx-8 mb-4 grid grid-cols-2 gap-x-8 gap-y-2 text-sm" aria-label="Order details">
        <div>
          <span className="text-gray-500">Order Number:</span>{" "}
          <span className="font-medium">{data.orderNumber}</span>
        </div>
        <div>
          <span className="text-gray-500">Order Date:</span>{" "}
          <span className="font-medium">{orderDate}</span>
        </div>
        <div>
          <span className="text-gray-500">Due Date:</span>{" "}
          <span className="font-medium">{dueDate}</span>
        </div>
        <div>
          <span className="text-gray-500">PO Number:</span>{" "}
          <span className="font-medium">{data.poNumber ?? "-"}</span>
        </div>
      </div>

      {/* Section 5: Items Table */}
      <div className="mx-8 mb-4" aria-label="Invoice items">
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
            {data.items.map((item, idx) => (
              <tr key={`${item.productName}-${idx}`} className="border-b border-gray-200">
                <td className="py-2">{idx + 1}</td>
                <td className="py-2">
                  <span>{item.productName}</span>
                  {item.variant && (
                    <span className="block text-xs text-gray-500">
                      {item.variant}
                    </span>
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

      {/* Section 6: Totals */}
      <div className="mx-8 mb-4 flex justify-end" aria-label="Invoice totals">
        <div className="w-64 space-y-1 text-sm">
          <div className="flex justify-between">
            <span className="text-gray-600">Subtotal</span>
            <span>{formatCurrency(data.subtotal)}</span>
          </div>
          {(data.discountAmount ?? 0) > 0 && (
            <div className="flex justify-between">
              <span className="text-gray-600">
                {data.discountLabel ?? "Discount"}
              </span>
              <span>-{formatCurrency(data.discountAmount!)}</span>
            </div>
          )}
          {(data.deliveryFee ?? 0) > 0 && (
            <div className="flex justify-between">
              <span className="text-gray-600">Delivery Fee</span>
              <span>{formatCurrency(data.deliveryFee!)}</span>
            </div>
          )}
          <div className="flex justify-between border-t border-gray-300 pt-2 mt-2">
            <span className="text-base font-bold">Grand Total</span>
            <span className="text-base font-bold">{formatCurrency(data.finalTotal)}</span>
          </div>
        </div>
      </div>

      {/* Section 7: Payment Info */}
      <div className="mx-8 mb-4 grid grid-cols-2 gap-x-8 gap-y-2 text-sm" aria-label="Payment information">
        <div>
          <span className="text-gray-500">Bank Name:</span>{" "}
          <span className="font-medium">{data.bankName}</span>
        </div>
        <div>
          <span className="text-gray-500">Account Number:</span>{" "}
          <span className="font-medium">{data.bankAccountNumber}</span>
        </div>
        <div>
          <span className="text-gray-500">Account Name:</span>{" "}
          <span className="font-medium">{data.bankAccountName}</span>
        </div>
        <div>
          <span className="text-gray-500">Payment Status:</span>{" "}
          <span className="font-medium">{data.paymentStatus}</span>
        </div>
        {data.paymentMethod && (
          <div>
            <span className="text-gray-500">Payment Method:</span>{" "}
            <span className="font-medium">{data.paymentMethod}</span>
          </div>
        )}
      </div>

      {/* Section 8: Signature Area */}
      <div className="mx-8 mb-4">
        <div className="border border-dashed border-gray-300 rounded p-4 h-[100px] flex flex-col justify-between">
          <span className="text-xs text-gray-400">Authorized Signature</span>
          <div />
        </div>
      </div>

      {/* Section 9: Footer */}
      <div className="mx-8 pb-6 text-center text-sm">
        {data.notes && (
          <p className="italic text-gray-500 mb-3">{data.notes}</p>
        )}
        <p className="text-gray-600">Thank you for your business</p>
        <p className="text-gray-400 text-xs mt-1">{data.sellerName}</p>
      </div>
    </div>
  );
}
