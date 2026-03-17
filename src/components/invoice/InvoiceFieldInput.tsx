import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";

export type FieldSource = "auto" | "needs-input" | "edited";

/**
 * CSS classes referencing custom properties defined in src/index.css
 * under the "Invoice Field Source Tokens" section.
 * This is a deliberate invoice-specific semantic token set
 * (light-mode only since invoices are a print-oriented feature).
 */
export const SOURCE_BG: Record<FieldSource, string> = {
  auto: "bg-[var(--invoice-field-auto)] border-[var(--invoice-field-auto-border)]",
  "needs-input":
    "bg-[var(--invoice-field-input)] border-[var(--invoice-field-input-border)]",
  edited: "bg-white border-gray-200",
};

interface InvoiceFieldInputProps {
  label: string;
  value: string;
  source: FieldSource;
  onChange: (value: string) => void;
  placeholder?: string;
  multiline?: boolean;
  readOnly?: boolean;
  type?: string;
}

/**
 * Color-coded input for invoice fields.
 *
 * Background color indicates the field source:
 * - auto (blue): auto-filled from order/settings data
 * - needs-input (amber): requires user input
 * - edited (white): user has modified the auto-filled value
 *
 * The parent (InvoiceForm) manages source transitions (auto -> edited).
 */
export function InvoiceFieldInput({
  label,
  value,
  source,
  onChange,
  placeholder,
  multiline = false,
  readOnly = false,
  type,
}: InvoiceFieldInputProps) {
  const fieldClasses = cn(
    SOURCE_BG[source],
    "print:border-none print:bg-transparent print:p-0 print:shadow-none print:h-auto",
  );

  return (
    <div className="space-y-1">
      <Label className="text-xs text-muted-foreground print:hidden">
        {label}
      </Label>
      {multiline ? (
        <Textarea
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          readOnly={readOnly}
          className={fieldClasses}
          rows={3}
        />
      ) : (
        <Input
          type={type}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          readOnly={readOnly}
          className={fieldClasses}
        />
      )}
    </div>
  );
}
