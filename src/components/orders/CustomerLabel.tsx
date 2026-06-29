/**
 * CustomerLabel — shared presentational fragment for the customer picker.
 *
 * Renders the `[B2B]` badge (only for b2b_wholesale), the customer name, and a
 * muted ` — {companyName}` suffix when present. Returns inline content (no
 * wrapper element) so each call site keeps its own wrapper class (`<p>` vs
 * `<div>`, with/without `text-foreground`). Extracted from 4 copy-pasted sites
 * (CustomerSearch selected + dropdown, OrderForm dropdown, OrderFormPOS dropdown).
 */
import type { Id } from "../../../convex/_generated/dataModel";

/** Shared option shape for the customer picker (search result / handler arg). */
export type CustomerPickerOption = {
  _id: Id<"customers">;
  name: string;
  phone?: string | null;
  companyName?: string | null;
  customerType?: "direct_b2c" | "b2b_wholesale" | null;
  defaultAddress?: string | null;
};

interface CustomerLabelProps {
  name: string;
  companyName?: string | null;
  customerType?: "direct_b2c" | "b2b_wholesale" | null;
}

export function CustomerLabel({ name, companyName, customerType }: CustomerLabelProps) {
  return (
    <>
      {customerType === 'b2b_wholesale' && (
        <span className="text-xs font-semibold text-blue-600 mr-1">[B2B]</span>
      )}
      {name}
      {companyName && (
        <span className="text-muted-foreground font-normal"> — {companyName}</span>
      )}
    </>
  );
}
