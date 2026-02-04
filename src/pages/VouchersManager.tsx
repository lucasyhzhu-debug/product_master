/**
 * VouchersManager - Admin-only voucher management page
 * Voucher system: Create, edit, and manage voucher codes for discounts
 */
import { useDocumentTitle } from "@/hooks/useDocumentTitle";
import { PageHeader } from "@/components/layout/PageHeader";
import { Button } from "@/components/ui/button";
import { Ticket, Plus } from "lucide-react";

export function VouchersManager() {
  useDocumentTitle("Vouchers");

  return (
    <div className="p-6">
      <PageHeader
        title="Voucher Management"
        description="Create and manage voucher codes for promotional discounts"
      >
        <Button disabled>
          <Plus className="w-4 h-4 mr-2" />
          Create Voucher
        </Button>
      </PageHeader>

      {/* Placeholder - Full implementation in Phase 5 */}
      <div className="mt-12 flex flex-col items-center justify-center text-center">
        <div className="w-16 h-16 rounded-full bg-muted flex items-center justify-center mb-4">
          <Ticket className="w-8 h-8 text-muted-foreground" />
        </div>
        <h3 className="text-lg font-medium mb-2">Voucher System</h3>
        <p className="text-muted-foreground max-w-md">
          This page will allow administrators to create and manage voucher codes
          with percentage or fixed amount discounts, usage limits, and validity periods.
        </p>
        <p className="text-sm text-muted-foreground mt-4">
          Phase 5 implementation pending.
        </p>
      </div>
    </div>
  );
}

export default VouchersManager;
