/**
 * InvoiceHeaderPreview -- live preview of how seller info appears on invoices.
 *
 * Pure presentational component. Reads from props, no API calls.
 * Shows logo + business name + address + contact on left/right layout,
 * with bank details below.
 */
import { Building2 } from "lucide-react";

interface InvoiceHeaderPreviewProps {
  businessName: string;
  address: string;
  phone: string;
  email: string;
  npwp: string;
  logoUrl: string | null;
  bankAccount: {
    bankName: string;
    accountNumber: string;
    name: string;
  } | null;
}

function PlaceholderText({ text }: { text: string }) {
  return <span className="text-muted-foreground/50 italic">{text}</span>;
}

export function InvoiceHeaderPreview({
  businessName,
  address,
  phone,
  email,
  npwp,
  logoUrl,
  bankAccount,
}: InvoiceHeaderPreviewProps) {
  return (
    <div className="rounded-lg border bg-card p-4 space-y-4">
      <div className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-3">
        Invoice Header Preview
      </div>

      {/* Header: logo + business info */}
      <div className="flex items-start gap-4">
        {/* Logo */}
        <div className="flex items-center justify-center w-14 h-14 rounded border bg-muted/30 overflow-hidden shrink-0">
          {logoUrl ? (
            <img
              src={logoUrl}
              alt="Logo preview"
              className="h-14 w-auto object-contain"
            />
          ) : (
            <Building2 className="h-7 w-7 text-muted-foreground/40" />
          )}
        </div>

        {/* Business details */}
        <div className="flex-1 min-w-0 space-y-0.5">
          <div className="text-base font-semibold">
            {businessName || <PlaceholderText text="Your Business Name" />}
          </div>
          <div className="text-sm text-muted-foreground">
            {address || <PlaceholderText text="Business address" />}
          </div>
          <div className="flex flex-wrap gap-x-4 gap-y-0.5 text-sm text-muted-foreground">
            {phone ? (
              <span>{phone}</span>
            ) : (
              <PlaceholderText text="Phone" />
            )}
            {email ? (
              <span>{email}</span>
            ) : (
              <PlaceholderText text="Email" />
            )}
          </div>
          {npwp && (
            <div className="text-xs text-muted-foreground">
              NPWP: {npwp}
            </div>
          )}
        </div>
      </div>

      {/* Bank details */}
      {bankAccount && (
        <div className="border-t pt-3">
          <div className="text-xs font-medium text-muted-foreground mb-1">
            Payment Details
          </div>
          <div className="text-sm">
            {bankAccount.bankName} &middot;{" "}
            <span className="font-mono">{bankAccount.accountNumber}</span>
          </div>
          <div className="text-xs text-muted-foreground">
            a/n {bankAccount.name}
          </div>
        </div>
      )}
    </div>
  );
}
