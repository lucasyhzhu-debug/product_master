/**
 * VouchersManager - Admin-only voucher management page
 * Voucher system: Create, edit, and manage voucher codes for discounts
 */
import { useState } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import { useDocumentTitle } from "@/hooks/useDocumentTitle";
import { PageHeader } from "@/components/layout/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
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
  Edit,
  Trash2,
  Power,
  Copy,
  Percent,
  Hash,
  Calendar,
  Users,
  TrendingUp,
  RefreshCw,
  ShieldCheck,
  Clock,
  AlertTriangle,
  ExternalLink,
  Package,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { formatCurrency } from "@/lib/utils";
import {
  useVouchers,
  useManagerOverrides,
  useCreateVoucher,
  useUpdateVoucher,
  useToggleVoucherActive,
  useDeleteVoucher,
  useGenerateVoucherCode,
  type Voucher,
  type VoucherCreateInput,
} from "@/hooks/convex/useVouchers";
import { useMenuProducts } from "@/hooks/convex/useMenuProducts";

// ============================================
// Helper Functions
// ============================================

function formatDate(timestamp: number | undefined): string {
  if (!timestamp) return "-";
  return new Date(timestamp).toLocaleDateString("id-ID", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function formatDateTime(timestamp: number): string {
  return new Date(timestamp).toLocaleString("id-ID", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function getVoucherStatus(voucher: Voucher): {
  label: string;
  variant: "default" | "secondary" | "destructive" | "outline";
} {
  const now = Date.now();

  if (!voucher.isActive) {
    return { label: "Inactive", variant: "secondary" };
  }
  if (voucher.validUntil !== undefined && now > voucher.validUntil) {
    return { label: "Expired", variant: "destructive" };
  }
  if (
    voucher.usageLimit !== undefined &&
    voucher.usageCount >= voucher.usageLimit
  ) {
    return { label: "Depleted", variant: "outline" };
  }
  if (voucher.validFrom !== undefined && now < voucher.validFrom) {
    return { label: "Scheduled", variant: "outline" };
  }
  return { label: "Active", variant: "default" };
}

function formatDiscountValue(voucher: Voucher): string {
  if (voucher.discountType === "percentage") {
    return `${voucher.discountValue}%`;
  }
  if (voucher.applicableMenuProductId) {
    return `${formatCurrency(voucher.discountValue)}/item`;
  }
  return formatCurrency(voucher.discountValue);
}

// ============================================
// Form State Type
// ============================================

interface VoucherFormState {
  code: string;
  name: string;
  description: string;
  discountType: "amount" | "percentage";
  discountValue: string;
  minimumOrderAmount: string;
  maximumDiscount: string;
  applicableMenuProductId: string;
  isActive: boolean;
  validFrom: string;
  validUntil: string;
  usageLimit: string;
  usagePerCustomer: string;
}

const initialFormState: VoucherFormState = {
  code: "",
  name: "",
  description: "",
  discountType: "percentage",
  discountValue: "",
  minimumOrderAmount: "",
  maximumDiscount: "",
  applicableMenuProductId: "",
  isActive: true,
  validFrom: "",
  validUntil: "",
  usageLimit: "",
  usagePerCustomer: "",
};

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

  // UI state
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [showEditDialog, setShowEditDialog] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [selectedVoucher, setSelectedVoucher] = useState<Voucher | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isGeneratingCode, setIsGeneratingCode] = useState(false);

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
    </div>
  );
}

// ============================================
// Voucher Card Component
// ============================================

interface VoucherCardProps {
  voucher: Voucher;
  onEdit: (voucher: Voucher) => void;
  onDelete: (voucher: Voucher) => void;
  onToggleActive: (voucher: Voucher) => void;
  onCopyCode: (code: string) => void;
  menuProductsMap?: Map<string, string>;
}

function VoucherCard({
  voucher,
  onEdit,
  onDelete,
  onToggleActive,
  onCopyCode,
  menuProductsMap,
}: VoucherCardProps) {
  const status = getVoucherStatus(voucher);

  return (
    <Card className={cn(!voucher.isActive && "opacity-60")}>
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <CardTitle className="text-base truncate">{voucher.name}</CardTitle>
              <Badge variant={status.variant}>{status.label}</Badge>
            </div>
            <button
              onClick={() => onCopyCode(voucher.code)}
              className="flex items-center gap-1 text-sm font-mono text-muted-foreground hover:text-foreground transition-colors"
            >
              <Copy className="w-3 h-3" />
              {voucher.code}
            </button>
          </div>
          <div
            className={cn(
              "text-lg font-bold",
              voucher.discountType === "percentage"
                ? "text-blue-600 dark:text-blue-400"
                : "text-green-600 dark:text-green-400"
            )}
          >
            {formatDiscountValue(voucher)}
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {/* Description */}
        {voucher.description && (
          <p className="text-sm text-muted-foreground line-clamp-2">
            {voucher.description}
          </p>
        )}

        {/* Stats */}
        <div className="flex flex-wrap gap-3 text-xs text-muted-foreground">
          <div className="flex items-center gap-1">
            <TrendingUp className="w-3 h-3" />
            {voucher.usageCount}
            {voucher.usageLimit !== undefined && `/${voucher.usageLimit}`} used
          </div>
          {voucher.minimumOrderAmount !== undefined && (
            <div className="flex items-center gap-1">
              <Hash className="w-3 h-3" />
              Min {formatCurrency(voucher.minimumOrderAmount)}
            </div>
          )}
          {voucher.usagePerCustomer !== undefined && (
            <div className="flex items-center gap-1">
              <Users className="w-3 h-3" />
              {voucher.usagePerCustomer}/customer
            </div>
          )}
          {voucher.applicableMenuProductId && (
            <div className="flex items-center gap-1">
              <Package className="w-3 h-3" />
              Item: {menuProductsMap?.get(voucher.applicableMenuProductId) ?? "Linked product"}
            </div>
          )}
        </div>

        {/* Validity */}
        {(voucher.validFrom !== undefined ||
          voucher.validUntil !== undefined) && (
          <div className="flex items-center gap-1 text-xs text-muted-foreground">
            <Calendar className="w-3 h-3" />
            {formatDate(voucher.validFrom)} - {formatDate(voucher.validUntil)}
          </div>
        )}

        {/* Actions */}
        <div className="flex flex-wrap gap-2 pt-2 border-t">
          <Button variant="outline" size="sm" onClick={() => onEdit(voucher)}>
            <Edit className="w-3 h-3 mr-1" />
            Edit
          </Button>
          <Button
            variant={voucher.isActive ? "secondary" : "default"}
            size="sm"
            onClick={() => onToggleActive(voucher)}
          >
            <Power className="w-3 h-3 mr-1" />
            {voucher.isActive ? "Deactivate" : "Activate"}
          </Button>
          <Button
            variant="destructive"
            size="sm"
            onClick={() => onDelete(voucher)}
            disabled={voucher.usageCount > 0}
          >
            <Trash2 className="w-3 h-3 mr-1" />
            Delete
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

// ============================================
// Override Card Component
// ============================================

interface OverrideCardProps {
  voucher: Voucher;
  onCopyCode: (code: string) => void;
}

function OverrideCard({ voucher, onCopyCode }: OverrideCardProps) {
  const status = getVoucherStatus(voucher);
  const isExpired =
    voucher.validUntil !== undefined && Date.now() > voucher.validUntil;

  // Fetch linked order details if override has been used
  const orderDetails = useQuery(
    api.vouchers.queries.getOverrideOrderDetails,
    voucher.overrideOrderId ? { voucherId: voucher._id } : "skip"
  );

  return (
    <Card className={cn(isExpired && "opacity-60")}>
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <ShieldCheck className="w-4 h-4 text-amber-600" />
              <Badge variant={status.variant}>{status.label}</Badge>
            </div>
            <button
              onClick={() => onCopyCode(voucher.code)}
              className="flex items-center gap-1 text-sm font-mono text-muted-foreground hover:text-foreground transition-colors"
            >
              <Copy className="w-3 h-3" />
              {voucher.code}
            </button>
          </div>
          <div
            className={cn(
              "text-lg font-bold",
              voucher.discountType === "percentage"
                ? "text-blue-600 dark:text-blue-400"
                : "text-green-600 dark:text-green-400"
            )}
          >
            {formatDiscountValue(voucher)}
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-2">
        {/* Reason */}
        {voucher.overrideReason && (
          <p className="text-sm text-muted-foreground">
            <span className="font-medium">Reason:</span> {voucher.overrideReason}
          </p>
        )}

        {/* Order linkage */}
        {voucher.overrideOrderId && (
          <div className="text-sm">
            {orderDetails === undefined ? (
              <span className="text-muted-foreground">Loading order...</span>
            ) : orderDetails?.orderDeleted ? (
              <span className="text-destructive flex items-center gap-1">
                <AlertTriangle className="w-3 h-3" />
                Order has been deleted
              </span>
            ) : orderDetails ? (
              <Link
                to={`/orders/${voucher.overrideOrderId}`}
                className="text-blue-600 dark:text-blue-400 hover:underline flex items-center gap-1"
              >
                <ExternalLink className="w-3 h-3" />
                Used by Order #{orderDetails.orderNumber}
              </Link>
            ) : null}
          </div>
        )}

        {/* Created info */}
        <div className="flex items-center gap-1 text-xs text-muted-foreground">
          <Clock className="w-3 h-3" />
          Created by {voucher.createdBy} on {formatDateTime(voucher.createdAt)}
        </div>

        {/* Usage */}
        <div className="flex items-center gap-1 text-xs text-muted-foreground">
          <TrendingUp className="w-3 h-3" />
          {voucher.usageCount > 0 ? "Used" : "Not used"}
        </div>

        {/* Expiry */}
        {voucher.validUntil !== undefined && (
          <div
            className={cn(
              "flex items-center gap-1 text-xs",
              isExpired ? "text-destructive" : "text-muted-foreground"
            )}
          >
            <Calendar className="w-3 h-3" />
            {isExpired ? "Expired" : "Expires"} {formatDateTime(voucher.validUntil)}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ============================================
// Voucher Form Component
// ============================================

interface VoucherFormProps {
  form: VoucherFormState;
  setForm: React.Dispatch<React.SetStateAction<VoucherFormState>>;
  isEditing: boolean;
  isGeneratingCode: boolean;
  onGenerateCode: () => void;
  menuProducts: Array<{ id: string; name: string; code: string }>;
}

function VoucherForm({
  form,
  setForm,
  isEditing,
  isGeneratingCode,
  onGenerateCode,
  menuProducts,
}: VoucherFormProps) {
  return (
    <div className="space-y-4 py-4">
      {/* Code */}
      <div className="space-y-2">
        <Label htmlFor="code">Voucher Code</Label>
        <div className="flex gap-2">
          <Input
            id="code"
            value={form.code}
            onChange={(e) =>
              setForm((prev) => ({
                ...prev,
                code: e.target.value.toUpperCase().replace(/\s+/g, "-"),
              }))
            }
            placeholder="PROMO-XXXX-XXXX"
            className="font-mono"
            disabled={isEditing}
          />
          {!isEditing && (
            <Button
              type="button"
              variant="outline"
              onClick={onGenerateCode}
              disabled={isGeneratingCode}
            >
              <RefreshCw
                className={cn("w-4 h-4", isGeneratingCode && "animate-spin")}
              />
            </Button>
          )}
        </div>
        {isEditing && (
          <p className="text-xs text-muted-foreground">
            Code cannot be changed after creation
          </p>
        )}
      </div>

      {/* Name */}
      <div className="space-y-2">
        <Label htmlFor="name">Name *</Label>
        <Input
          id="name"
          value={form.name}
          onChange={(e) => setForm((prev) => ({ ...prev, name: e.target.value }))}
          placeholder="Summer Sale 2026"
        />
      </div>

      {/* Description */}
      <div className="space-y-2">
        <Label htmlFor="description">Description</Label>
        <Textarea
          id="description"
          value={form.description}
          onChange={(e) =>
            setForm((prev) => ({ ...prev, description: e.target.value }))
          }
          placeholder="Optional description for internal reference"
          rows={2}
        />
      </div>

      {/* Discount Type & Value */}
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label>Discount Type</Label>
          <Select
            value={form.discountType}
            onValueChange={(value: "amount" | "percentage") =>
              setForm((prev) => ({
                ...prev,
                discountType: value,
                // Reset linked product if switching away from fixed amount
                applicableMenuProductId: value === "percentage" ? "" : prev.applicableMenuProductId,
              }))
            }
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="percentage">
                <div className="flex items-center gap-2">
                  <Percent className="w-4 h-4" />
                  Percentage
                </div>
              </SelectItem>
              <SelectItem value="amount">
                <div className="flex items-center gap-2">
                  <Hash className="w-4 h-4" />
                  Fixed Amount
                </div>
              </SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label htmlFor="discountValue">
            Discount Value *{" "}
            {form.discountType === "percentage" ? "(%)" : "(Rp)"}
          </Label>
          <Input
            id="discountValue"
            type="number"
            value={form.discountValue}
            onChange={(e) =>
              setForm((prev) => ({ ...prev, discountValue: e.target.value }))
            }
            placeholder={form.discountType === "percentage" ? "10" : "50000"}
            min="0"
            max={form.discountType === "percentage" ? "100" : undefined}
          />
        </div>
      </div>

      {/* Linked Product (only for fixed amount discount) */}
      {form.discountType === "amount" && (
        <div className="space-y-2">
          <Label>Linked Product (optional)</Label>
          <Select
            value={form.applicableMenuProductId}
            onValueChange={(value) =>
              setForm((prev) => ({ ...prev, applicableMenuProductId: value }))
            }
          >
            <SelectTrigger>
              <SelectValue placeholder="No product link (applies to whole order)" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="">No product link (applies to whole order)</SelectItem>
              {menuProducts.map((product) => (
                <SelectItem key={product.id} value={product.id}>
                  {product.name} ({product.code})
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {form.applicableMenuProductId && (
            <p className="text-xs text-muted-foreground">
              {form.discountValue ? `Rp ${parseFloat(form.discountValue).toLocaleString("id-ID")}` : "..."} will be deducted from each unit of this product in the order
            </p>
          )}
        </div>
      )}

      {/* Constraints */}
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="minimumOrderAmount">Minimum Order (Rp)</Label>
          <Input
            id="minimumOrderAmount"
            type="number"
            value={form.minimumOrderAmount}
            onChange={(e) =>
              setForm((prev) => ({ ...prev, minimumOrderAmount: e.target.value }))
            }
            placeholder="100000"
            min="0"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="maximumDiscount">Maximum Discount (Rp)</Label>
          <Input
            id="maximumDiscount"
            type="number"
            value={form.maximumDiscount}
            onChange={(e) =>
              setForm((prev) => ({ ...prev, maximumDiscount: e.target.value }))
            }
            placeholder="50000"
            min="0"
          />
          <p className="text-xs text-muted-foreground">
            Cap for percentage discounts
          </p>
        </div>
      </div>

      {/* Validity Period */}
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="validFrom">Valid From</Label>
          <Input
            id="validFrom"
            type="date"
            value={form.validFrom}
            onChange={(e) =>
              setForm((prev) => ({ ...prev, validFrom: e.target.value }))
            }
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="validUntil">Valid Until</Label>
          <Input
            id="validUntil"
            type="date"
            value={form.validUntil}
            onChange={(e) =>
              setForm((prev) => ({ ...prev, validUntil: e.target.value }))
            }
          />
        </div>
      </div>

      {/* Usage Limits */}
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="usageLimit">Total Usage Limit</Label>
          <Input
            id="usageLimit"
            type="number"
            value={form.usageLimit}
            onChange={(e) =>
              setForm((prev) => ({ ...prev, usageLimit: e.target.value }))
            }
            placeholder="100"
            min="1"
          />
          <p className="text-xs text-muted-foreground">
            Leave empty for unlimited
          </p>
        </div>
        <div className="space-y-2">
          <Label htmlFor="usagePerCustomer">Usage Per Customer</Label>
          <Input
            id="usagePerCustomer"
            type="number"
            value={form.usagePerCustomer}
            onChange={(e) =>
              setForm((prev) => ({ ...prev, usagePerCustomer: e.target.value }))
            }
            placeholder="1"
            min="1"
          />
          <p className="text-xs text-muted-foreground">
            Leave empty for unlimited
          </p>
        </div>
      </div>

      {/* Active Status */}
      <div className="flex items-center justify-between pt-2 border-t">
        <div>
          <Label htmlFor="isActive">Active</Label>
          <p className="text-xs text-muted-foreground">
            Inactive vouchers cannot be used
          </p>
        </div>
        <Switch
          id="isActive"
          checked={form.isActive}
          onCheckedChange={(checked: boolean) =>
            setForm((prev) => ({ ...prev, isActive: checked }))
          }
        />
      </div>
    </div>
  );
}

export default VouchersManager;
