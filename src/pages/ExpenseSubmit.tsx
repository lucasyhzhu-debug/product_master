/**
 * ExpenseSubmit - Create or edit expense draft, then submit for approval.
 * All authenticated roles can access (PERM-01).
 *
 * Routes:
 *   /expenses/new       -- create new expense
 *   /expenses/new?edit=ID -- edit existing draft
 */
import { useState, useEffect, useCallback } from "react";
import { useSearchParams, useNavigate, Link } from "react-router-dom";
import { useDocumentTitle } from "@/hooks/useDocumentTitle";
import { PageHeader } from "@/components/layout/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { AlertTriangle, Loader2, Save, Send } from "lucide-react";
import { toast } from "sonner";
import { useAccounts } from "@/hooks/convex/useAccounts";
import {
  useExpense,
  useCreateExpenseDraft,
  useUpdateExpenseDraft,
  useSubmitExpense,
  useExpenseUploadUrl,
} from "@/hooks/convex/useExpenses";
import { ReceiptUpload } from "@/components/expenses/ReceiptUpload";
import { utcToWibDateStr, wibDateStrToUtcMs } from "@/lib/dateUtils";
import type { Id } from "../../convex/_generated/dataModel";

// Payment method options matching schema validators
const PAYMENT_METHODS = [
  { value: "personal_cash", label: "Personal Cash" },
  { value: "personal_transfer", label: "Personal Transfer" },
  { value: "company_card", label: "Company Card" },
] as const;

type PaymentMethod = (typeof PAYMENT_METHODS)[number]["value"];

// Minimum amount that requires receipt (EXP-03)
const RECEIPT_WARNING_THRESHOLD = 50_000;

interface FormState {
  description: string;
  amount: string;
  accountId: string;
  expenseDate: string;
  vendorName: string;
  paymentMethod: PaymentMethod;
  receiptFileId?: Id<"_storage">;
  receiptImageHash?: string;
}

function getDefaultDate(): string {
  return utcToWibDateStr(Date.now());
}

const INITIAL_FORM: FormState = {
  description: "",
  amount: "",
  accountId: "",
  expenseDate: getDefaultDate(),
  vendorName: "",
  paymentMethod: "personal_cash",
};

export function ExpenseSubmit() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const editId = searchParams.get("edit") as Id<"expenses"> | null;
  const isEditing = !!editId;

  useDocumentTitle(isEditing ? "Edit Expense" : "New Expense");

  // Data queries — filter to expense-relevant account types (opex, cogs, other)
  const allAccounts = useAccounts(true);
  const accounts = allAccounts?.filter((a) =>
    ["opex", "cogs", "other"].includes(a.type)
  );
  const existingExpense = useExpense(editId ?? undefined);
  const generateUploadUrl = useExpenseUploadUrl();

  // Mutation hooks
  const { mutate: createDraft } = useCreateExpenseDraft();
  const { mutate: updateDraft } = useUpdateExpenseDraft();
  const { mutate: submitExpense } = useSubmitExpense();

  // Form state
  const [form, setForm] = useState<FormState>(INITIAL_FORM);
  const [draftId, setDraftId] = useState<Id<"expenses"> | null>(editId);
  const [duplicateWarning, setDuplicateWarning] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [formLoaded, setFormLoaded] = useState(!isEditing);

  // Pre-fill form when editing
  useEffect(() => {
    if (isEditing && existingExpense && !formLoaded) {
      // Verify it's a draft
      if (existingExpense.status !== "draft") {
        toast.error("Only draft expenses can be edited");
        navigate("/expenses");
        return;
      }

      setForm({
        description: existingExpense.description,
        amount: String(existingExpense.amount),
        accountId: existingExpense.accountId,
        expenseDate: utcToWibDateStr(existingExpense.expenseDate),
        vendorName: existingExpense.vendorName,
        paymentMethod: existingExpense.paymentMethod as PaymentMethod,
        receiptFileId: existingExpense.receiptFileId,
        receiptImageHash: existingExpense.receiptImageHash,
      });
      setDraftId(existingExpense._id);
      if (existingExpense.duplicateWarning) {
        setDuplicateWarning(existingExpense.duplicateWarning);
      }
      setFormLoaded(true);
    }
  }, [isEditing, existingExpense, formLoaded, navigate]);

  const updateField = useCallback(
    <K extends keyof FormState>(field: K, value: FormState[K]) => {
      setForm((prev) => ({ ...prev, [field]: value }));
    },
    []
  );

  // Validate form before save
  const validateForm = useCallback((): string | null => {
    if (!form.description.trim()) return "Description is required";
    if (!form.amount || Number(form.amount) <= 0) return "Amount must be positive";
    if (!Number.isInteger(Number(form.amount)))
      return "Amount must be a whole number (IDR, no decimals)";
    if (!form.accountId) return "GL Category is required";
    if (!form.expenseDate) return "Expense date is required";
    if (!form.vendorName.trim()) return "Vendor name is required";
    return null;
  }, [form]);

  // Build mutation args from form
  const buildArgs = useCallback(() => {
    return {
      description: form.description.trim(),
      amount: Number(form.amount),
      accountId: form.accountId as Id<"accounts">,
      expenseDate: wibDateStrToUtcMs(form.expenseDate),
      vendorName: form.vendorName.trim(),
      paymentMethod: form.paymentMethod,
      ...(form.receiptFileId && { receiptFileId: form.receiptFileId }),
      ...(form.receiptImageHash && { receiptImageHash: form.receiptImageHash }),
    };
  }, [form]);

  // Save Draft handler
  const handleSaveDraft = useCallback(async () => {
    const error = validateForm();
    if (error) {
      toast.error(error);
      return;
    }

    setSaving(true);
    try {
      if (draftId) {
        // Update existing draft
        await updateDraft({ expenseId: draftId, ...buildArgs() });
      } else {
        // Create new draft
        const result = await createDraft(buildArgs());
        if (result) {
          setDraftId(result.expenseId);
          if (result.duplicateWarning) {
            setDuplicateWarning(result.duplicateWarning);
          }
        }
      }
    } catch {
      // Error toast handled by mutation hook
    } finally {
      setSaving(false);
    }
  }, [validateForm, draftId, updateDraft, createDraft, buildArgs]);

  // Submit handler
  const handleSubmit = useCallback(async () => {
    const error = validateForm();
    if (error) {
      toast.error(error);
      return;
    }

    setSubmitting(true);
    try {
      let expenseIdToSubmit = draftId;

      // Save first if new/unsaved
      if (!expenseIdToSubmit) {
        const result = await createDraft(buildArgs());
        if (!result) {
          setSubmitting(false);
          return;
        }
        expenseIdToSubmit = result.expenseId;
        setDraftId(result.expenseId);
        if (result.duplicateWarning) {
          setDuplicateWarning(result.duplicateWarning);
        }
      } else {
        // Update with latest form data before submitting
        await updateDraft({ expenseId: expenseIdToSubmit, ...buildArgs() });
      }

      // Submit the draft
      await submitExpense({ expenseId: expenseIdToSubmit });
      navigate("/expenses");
    } catch {
      // Error toast handled by mutation hook (FRAUD-02 receipt hash duplicate, EXP-03 receipt required)
    } finally {
      setSubmitting(false);
    }
  }, [validateForm, draftId, createDraft, updateDraft, submitExpense, buildArgs, navigate]);

  // Handle receipt upload
  const handleReceiptUpload = useCallback(
    (result: { storageId: Id<"_storage">; hash: string }) => {
      setForm((prev) => ({
        ...prev,
        receiptFileId: result.storageId,
        receiptImageHash: result.hash,
      }));
    },
    []
  );

  const handleReceiptRemove = useCallback(() => {
    setForm((prev) => ({
      ...prev,
      receiptFileId: undefined,
      receiptImageHash: undefined,
    }));
  }, []);

  // Loading states
  if (allAccounts === undefined) {
    return (
      <div className="space-y-4">
        <PageHeader title="New Expense" backTo="/expenses" backLabel="My Expenses" />
        <Skeleton className="h-[400px] w-full" />
      </div>
    );
  }

  if (isEditing && !formLoaded) {
    return (
      <div className="space-y-4">
        <PageHeader title="Edit Expense" backTo="/expenses" backLabel="My Expenses" />
        <Skeleton className="h-[400px] w-full" />
      </div>
    );
  }

  const amountNum = Number(form.amount) || 0;
  const showReceiptWarning =
    amountNum > RECEIPT_WARNING_THRESHOLD && !form.receiptFileId;
  const isProcessing = saving || submitting;

  return (
    <div className="space-y-4">
      <PageHeader
        title={isEditing ? "Edit Expense" : "New Expense"}
        backTo="/expenses"
        backLabel="My Expenses"
      />

      {/* Duplicate Warning Banner */}
      {duplicateWarning && (
        <div className="flex items-center gap-2 rounded-md border border-amber-200 bg-amber-50 dark:border-amber-800 dark:bg-amber-950 p-3 text-sm text-amber-800 dark:text-amber-200">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          <p>{duplicateWarning}</p>
        </div>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Expense Details</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Description */}
          <div className="space-y-2">
            <Label htmlFor="description">Description *</Label>
            <Input
              id="description"
              placeholder="What was this expense for?"
              value={form.description}
              onChange={(e) => updateField("description", e.target.value)}
              disabled={isProcessing}
            />
          </div>

          {/* Amount + Expense Date row */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="amount">Amount (IDR) *</Label>
              <Input
                id="amount"
                type="number"
                placeholder="0"
                min={1}
                step={1}
                value={form.amount}
                onChange={(e) => updateField("amount", e.target.value)}
                disabled={isProcessing}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="expenseDate">Expense Date *</Label>
              <Input
                id="expenseDate"
                type="date"
                value={form.expenseDate}
                onChange={(e) => updateField("expenseDate", e.target.value)}
                disabled={isProcessing}
              />
            </div>
          </div>

          {/* GL Category */}
          <div className="space-y-2">
            <Label htmlFor="accountId">GL Category *</Label>
            <Select
              value={form.accountId}
              onValueChange={(v) => updateField("accountId", v)}
              disabled={isProcessing}
            >
              <SelectTrigger id="accountId">
                <SelectValue placeholder="Select category..." />
              </SelectTrigger>
              <SelectContent>
                {accounts?.map((account) => (
                  <SelectItem key={account._id} value={account._id}>
                    {account.code} - {account.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Vendor + Payment Method row */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="vendorName">Vendor *</Label>
              <Input
                id="vendorName"
                placeholder="Vendor or store name"
                value={form.vendorName}
                onChange={(e) => updateField("vendorName", e.target.value)}
                disabled={isProcessing}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="paymentMethod">Payment Method</Label>
              <Select
                value={form.paymentMethod}
                onValueChange={(v) =>
                  updateField("paymentMethod", v as PaymentMethod)
                }
                disabled={isProcessing}
              >
                <SelectTrigger id="paymentMethod">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PAYMENT_METHODS.map((pm) => (
                    <SelectItem key={pm.value} value={pm.value}>
                      {pm.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Receipt Upload */}
          <div className="space-y-2">
            <Label>
              Receipt{" "}
              {amountNum > RECEIPT_WARNING_THRESHOLD
                ? "(required for > Rp 50,000)"
                : "(optional)"}
            </Label>
            <ReceiptUpload
              generateUploadUrl={generateUploadUrl}
              onUpload={handleReceiptUpload}
              onRemove={handleReceiptRemove}
              currentFileId={form.receiptFileId}
              disabled={isProcessing}
            />
            {showReceiptWarning && (
              <p className="text-xs text-amber-600 dark:text-amber-400 flex items-center gap-1">
                <AlertTriangle className="h-3 w-3" />
                Receipt is required for expenses over Rp 50,000
              </p>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Action Buttons */}
      <div className="flex items-center gap-3">
        <Button
          variant="outline"
          onClick={handleSaveDraft}
          disabled={isProcessing}
        >
          {saving ? (
            <Loader2 className="h-4 w-4 animate-spin mr-2" />
          ) : (
            <Save className="h-4 w-4 mr-2" />
          )}
          Save Draft
        </Button>
        <Button onClick={handleSubmit} disabled={isProcessing}>
          {submitting ? (
            <Loader2 className="h-4 w-4 animate-spin mr-2" />
          ) : (
            <Send className="h-4 w-4 mr-2" />
          )}
          Submit for Approval
        </Button>
        <Button variant="ghost" asChild>
          <Link to="/expenses">Back to My Expenses</Link>
        </Button>
      </div>
    </div>
  );
}
