/**
 * VouchersManager - Admin-only voucher management page
 * Voucher system: Create, edit, and manage voucher codes for discounts
 */
import { useState } from "react";
import type { Id } from "../../convex/_generated/dataModel";
import { useDocumentTitle } from "@/hooks/useDocumentTitle";
import { PageHeader } from "@/components/layout/PageHeader";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Ticket,
  Plus,
  ShieldCheck,
  Gift,
} from "lucide-react";
import { toast } from "sonner";
import {
  useVouchers,
  useManagerOverrides,
  useCreateVoucher,
  useUpdateVoucher,
  useToggleVoucherActive,
  useDeleteVoucher,
  useGenerateVoucherCode,
  useCreateFreeVoucher,
  type Voucher,
  type VoucherCreateInput,
} from "@/hooks/convex/useVouchers";
import { useMenuProducts } from "@/hooks/convex/useMenuProducts";
import {
  VoucherCard,
  OverrideCard,
  VoucherForm,
  FreeVoucherDialog,
  type VoucherFormState,
  initialFormState,
} from "@/components/vouchers";

// ============================================
// Component
// ============================================

export function VouchersManager() {
  useDocumentTitle("Vouchers");

  // Data queries
  const vouchers = useVouchers();
  const overrides = useManagerOverrides(30); // Last 30 days
  const { data: menuProductsData } = useMenuProducts(true); // Active menu products for item-linked vouchers

  // Mutations
  const { createVoucher } = useCreateVoucher();
  const { updateVoucher } = useUpdateVoucher();
  const { toggleActive } = useToggleVoucherActive();
  const { deleteVoucher } = useDeleteVoucher();
  const { generateCode } = useGenerateVoucherCode();
  const { createFreeVoucher } = useCreateFreeVoucher();

  // UI state
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [showEditDialog, setShowEditDialog] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [selectedVoucher, setSelectedVoucher] = useState<Voucher | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isGeneratingCode, setIsGeneratingCode] = useState(false);

  // Free voucher dialog state
  const [showFreeDialog, setShowFreeDialog] = useState(false);

  // Form state
  const [form, setForm] = useState<VoucherFormState>(initialFormState);

  // ============================================
  // Form Handlers
  // ============================================

  const resetForm = () => {
    setForm(initialFormState);
    setSelectedVoucher(null);
  };

  const handleGenerateCode = async () => {
    setIsGeneratingCode(true);
    try {
      const code = await generateCode("PROMO");
      setForm((prev) => ({ ...prev, code }));
    } finally {
      setIsGeneratingCode(false);
    }
  };

  const handleCopyCode = (code: string) => {
    navigator.clipboard.writeText(code);
    toast.success("Code copied to clipboard");
  };

  const openCreateDialog = async () => {
    resetForm();
    // Auto-generate a code
    setIsGeneratingCode(true);
    try {
      const code = await generateCode("PROMO");
      setForm((prev) => ({ ...prev, code }));
    } finally {
      setIsGeneratingCode(false);
    }
    setShowCreateDialog(true);
  };

  const openEditDialog = (voucher: Voucher) => {
    setSelectedVoucher(voucher);
    setForm({
      code: voucher.code,
      name: voucher.name,
      description: voucher.description || "",
      discountType: voucher.discountType,
      discountValue: String(voucher.discountValue),
      minimumOrderAmount: voucher.minimumOrderAmount
        ? String(voucher.minimumOrderAmount)
        : "",
      maximumDiscount: voucher.maximumDiscount
        ? String(voucher.maximumDiscount)
        : "",
      applicableMenuProductId: voucher.applicableMenuProductId ?? "",
      isActive: voucher.isActive,
      validFrom: voucher.validFrom
        ? new Date(voucher.validFrom).toISOString().split("T")[0]
        : "",
      validUntil: voucher.validUntil
        ? new Date(voucher.validUntil).toISOString().split("T")[0]
        : "",
      usageLimit: voucher.usageLimit ? String(voucher.usageLimit) : "",
      usagePerCustomer: voucher.usagePerCustomer
        ? String(voucher.usagePerCustomer)
        : "",
    });
    setShowEditDialog(true);
  };

  const openDeleteDialog = (voucher: Voucher) => {
    setSelectedVoucher(voucher);
    setShowDeleteDialog(true);
  };

  const handleCreate = async () => {
    if (!form.name.trim()) {
      toast.error("Voucher name is required");
      return;
    }
    if (!form.discountValue || parseFloat(form.discountValue) <= 0) {
      toast.error("Discount value must be greater than 0");
      return;
    }

    setIsSubmitting(true);
    try {
      const data: VoucherCreateInput = {
        code: form.code || undefined,
        name: form.name.trim(),
        description: form.description.trim() || undefined,
        discountType: form.discountType,
        discountValue: parseFloat(form.discountValue),
        minimumOrderAmount: form.minimumOrderAmount
          ? parseFloat(form.minimumOrderAmount)
          : undefined,
        maximumDiscount: form.maximumDiscount
          ? parseFloat(form.maximumDiscount)
          : undefined,
        applicableMenuProductId: form.applicableMenuProductId
          ? (form.applicableMenuProductId as Id<"menuProducts">)
          : undefined,
        isActive: form.isActive,
        validFrom: form.validFrom
          ? new Date(form.validFrom).getTime()
          : undefined,
        validUntil: form.validUntil
          ? new Date(form.validUntil + "T23:59:59").getTime()
          : undefined,
        usageLimit: form.usageLimit ? parseInt(form.usageLimit) : undefined,
        usagePerCustomer: form.usagePerCustomer
          ? parseInt(form.usagePerCustomer)
          : undefined,
      };

      await createVoucher(data);
      setShowCreateDialog(false);
      resetForm();
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleUpdate = async () => {
    if (!selectedVoucher) return;
    if (!form.name.trim()) {
      toast.error("Voucher name is required");
      return;
    }
    if (!form.discountValue || parseFloat(form.discountValue) <= 0) {
      toast.error("Discount value must be greater than 0");
      return;
    }

    setIsSubmitting(true);
    try {
      await updateVoucher({
        id: selectedVoucher._id,
        name: form.name.trim(),
        description: form.description.trim() || undefined,
        discountType: form.discountType,
        discountValue: parseFloat(form.discountValue),
        minimumOrderAmount: form.minimumOrderAmount
          ? parseFloat(form.minimumOrderAmount)
          : undefined,
        maximumDiscount: form.maximumDiscount
          ? parseFloat(form.maximumDiscount)
          : undefined,
        applicableMenuProductId: form.applicableMenuProductId
          ? (form.applicableMenuProductId as Id<"menuProducts">)
          : undefined,
        isActive: form.isActive,
        validFrom: form.validFrom
          ? new Date(form.validFrom).getTime()
          : undefined,
        validUntil: form.validUntil
          ? new Date(form.validUntil + "T23:59:59").getTime()
          : undefined,
        usageLimit: form.usageLimit ? parseInt(form.usageLimit) : undefined,
        usagePerCustomer: form.usagePerCustomer
          ? parseInt(form.usagePerCustomer)
          : undefined,
      });
      setShowEditDialog(false);
      resetForm();
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async () => {
    if (!selectedVoucher) return;

    setIsSubmitting(true);
    try {
      await deleteVoucher(selectedVoucher._id);
      setShowDeleteDialog(false);
      resetForm();
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleToggleActive = async (voucher: Voucher) => {
    await toggleActive(voucher._id);
  };

  // Build menuProductsMap for VoucherCard display
  const menuProductsMap = new Map<string, string>(
    (menuProductsData ?? []).map((p) => [p.id.toString(), p.name])
  );

  // ============================================
  // Loading State
  // ============================================

  if (vouchers === undefined) {
    return (
      <div className="space-y-6">
        <PageHeader
          title="Voucher Management"
          description="Loading..."
        />
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-48 w-full" />
          ))}
        </div>
      </div>
    );
  }

  // ============================================
  // Render
  // ============================================

  return (
    <div className="space-y-6">
      <PageHeader
        title="Voucher Management"
        description="Create and manage voucher codes for promotional discounts"
      >
        <Button variant="outline" onClick={() => setShowFreeDialog(true)}>
          <Gift className="w-4 h-4 mr-2" />
          Free Voucher
        </Button>
        <Button onClick={openCreateDialog}>
          <Plus className="w-4 h-4 mr-2" />
          Create Voucher
        </Button>
      </PageHeader>

      <Tabs defaultValue="vouchers">
        <TabsList>
          <TabsTrigger value="vouchers">
            <Ticket className="w-4 h-4 mr-2" />
            Vouchers ({vouchers?.length || 0})
          </TabsTrigger>
          <TabsTrigger value="overrides">
            <ShieldCheck className="w-4 h-4 mr-2" />
            Manager Overrides ({overrides?.length || 0})
          </TabsTrigger>
        </TabsList>

        {/* Regular Vouchers Tab */}
        <TabsContent value="vouchers" className="mt-4">
          {vouchers.length === 0 ? (
            <div className="text-center py-12">
              <Ticket className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
              <p className="text-muted-foreground">No vouchers created yet</p>
              <Button
                onClick={openCreateDialog}
                className="mt-4"
                variant="outline"
              >
                <Plus className="w-4 h-4 mr-2" />
                Create First Voucher
              </Button>
            </div>
          ) : (
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {vouchers.map((voucher: Voucher) => (
                <VoucherCard
                  key={voucher._id}
                  voucher={voucher}
                  onEdit={openEditDialog}
                  onDelete={openDeleteDialog}
                  onToggleActive={handleToggleActive}
                  onCopyCode={handleCopyCode}
                  menuProductsMap={menuProductsMap}
                />
              ))}
            </div>
          )}
        </TabsContent>

        {/* Manager Overrides Tab */}
        <TabsContent value="overrides" className="mt-4">
          {!overrides || overrides.length === 0 ? (
            <div className="text-center py-12">
              <ShieldCheck className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
              <p className="text-muted-foreground">
                No manager overrides in the last 30 days
              </p>
              <p className="text-sm text-muted-foreground mt-2">
                Manager overrides are created during checkout when a manager
                approves a special discount.
              </p>
            </div>
          ) : (
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {overrides.map((voucher: Voucher) => (
                <OverrideCard
                  key={voucher._id}
                  voucher={voucher}
                  onCopyCode={handleCopyCode}
                />
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>

      {/* Create Voucher Dialog */}
      <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Create New Voucher</DialogTitle>
            <DialogDescription>
              Create a promotional voucher code with discount rules.
            </DialogDescription>
          </DialogHeader>
          <VoucherForm
            form={form}
            setForm={setForm}
            isEditing={false}
            isGeneratingCode={isGeneratingCode}
            onGenerateCode={handleGenerateCode}
            menuProducts={(menuProductsData ?? []).map((p) => ({ id: p.id.toString(), name: p.name, code: p.code }))}
          />
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setShowCreateDialog(false);
                resetForm();
              }}
              disabled={isSubmitting}
            >
              Cancel
            </Button>
            <Button onClick={handleCreate} disabled={isSubmitting}>
              {isSubmitting ? "Creating..." : "Create Voucher"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Voucher Dialog */}
      <Dialog open={showEditDialog} onOpenChange={setShowEditDialog}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Edit Voucher</DialogTitle>
            <DialogDescription>
              Update voucher settings. Code cannot be changed.
            </DialogDescription>
          </DialogHeader>
          <VoucherForm
            form={form}
            setForm={setForm}
            isEditing={true}
            isGeneratingCode={false}
            onGenerateCode={() => {}}
            menuProducts={(menuProductsData ?? []).map((p) => ({ id: p.id.toString(), name: p.name, code: p.code }))}
          />
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setShowEditDialog(false);
                resetForm();
              }}
              disabled={isSubmitting}
            >
              Cancel
            </Button>
            <Button onClick={handleUpdate} disabled={isSubmitting}>
              {isSubmitting ? "Saving..." : "Save Changes"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Voucher?</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete voucher "{selectedVoucher?.code}"?
              This action cannot be undone.
              {selectedVoucher && selectedVoucher.usageCount > 0 && (
                <span className="block mt-2 text-destructive font-medium">
                  Note: This voucher has been used {selectedVoucher.usageCount}{" "}
                  time(s) and cannot be deleted. Consider deactivating it
                  instead.
                </span>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isSubmitting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              disabled={isSubmitting || (selectedVoucher?.usageCount || 0) > 0}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {isSubmitting ? "Deleting..." : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Create Free Voucher Dialog */}
      <FreeVoucherDialog
        open={showFreeDialog}
        onOpenChange={setShowFreeDialog}
        createFreeVoucher={createFreeVoucher}
      />
    </div>
  );
}
