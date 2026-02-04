import { Copy, Check } from "lucide-react";
import { useState } from "react";
import { cn } from "@/lib/utils";

interface VariableReferenceProps {
  variables: string[];
  onInsert?: (variable: string) => void;
}

// Variable descriptions for better UX
const VARIABLE_DESCRIPTIONS: Record<string, string> = {
  "{customer_name}": "Customer's full name",
  "{order_number}": "Order number (e.g., 0204-001)",
  "{items_list}": "Bulleted list of order items",
  "{total_amount}": "Final total in IDR format",
  "{delivery_info}": "Delivery type and address/location",
  "{due_date}": "Order due date",
  "{discount_note}": "Discount amount if applied",
  "{payment_info}": "Payment status and method",
  "{notes_section}": "Order notes if any",
  "{status_label}": "Order status badge",
  "{channel_suffix}": "Sales channel in parentheses",
  "{due_date_line}": "Due date on new line",
  "{shipping_number}": "Tracking number",
  "{shipping_agency}": "Shipping carrier name",
  "{delivery_address}": "Full delivery address",
  "{pickup_location}": "Pickup location name",
};

// Group variables by category
const VARIABLE_CATEGORIES: Record<string, string[]> = {
  Customer: ["{customer_name}"],
  Order: [
    "{order_number}",
    "{items_list}",
    "{total_amount}",
    "{status_label}",
    "{channel_suffix}",
  ],
  Delivery: [
    "{delivery_info}",
    "{due_date}",
    "{due_date_line}",
    "{shipping_number}",
    "{shipping_agency}",
    "{delivery_address}",
    "{pickup_location}",
  ],
  Payment: ["{payment_info}", "{discount_note}"],
  Other: ["{notes_section}"],
};

export function VariableReference({
  variables,
  onInsert,
}: VariableReferenceProps) {
  const [copiedVariable, setCopiedVariable] = useState<string | null>(null);

  const handleCopy = async (variable: string) => {
    await navigator.clipboard.writeText(variable);
    setCopiedVariable(variable);
    setTimeout(() => setCopiedVariable(null), 1500);

    if (onInsert) {
      onInsert(variable);
    }
  };

  // Filter available variables into categories
  const availableByCategory: Record<string, string[]> = {};
  for (const [category, vars] of Object.entries(VARIABLE_CATEGORIES)) {
    const available = vars.filter((v) => variables.includes(v));
    if (available.length > 0) {
      availableByCategory[category] = available;
    }
  }

  return (
    <div className="space-y-4">
      <div className="text-xs text-muted-foreground mb-2">
        Click to copy • Variables auto-highlight in editor
      </div>

      {Object.entries(availableByCategory).map(([category, vars]) => (
        <div key={category}>
          <div className="text-xs font-medium text-muted-foreground mb-2">
            {category}
          </div>
          <div className="flex flex-wrap gap-2">
            {vars.map((variable) => (
              <button
                key={variable}
                onClick={() => handleCopy(variable)}
                className={cn(
                  "group relative inline-flex items-center gap-1.5 px-2.5 py-1.5",
                  "text-xs font-mono rounded-md",
                  "bg-[#DCF8C6]/50 border border-[#25D366]/30",
                  "hover:bg-[#DCF8C6] hover:border-[#25D366]",
                  "transition-all duration-200",
                  copiedVariable === variable &&
                    "bg-[#25D366] border-[#25D366] text-white"
                )}
                title={VARIABLE_DESCRIPTIONS[variable] || variable}
              >
                <span className="truncate max-w-[120px]">{variable}</span>
                {copiedVariable === variable ? (
                  <Check className="h-3 w-3 flex-shrink-0" />
                ) : (
                  <Copy className="h-3 w-3 flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity" />
                )}
              </button>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
