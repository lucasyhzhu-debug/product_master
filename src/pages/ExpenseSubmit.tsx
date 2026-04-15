/**
 * ExpenseSubmit - Create or edit expense draft, then submit for approval.
 * All authenticated roles can access (PERM-01).
 *
 * Routes:
 *   /expenses/new       -- create new expense
 *   /expenses/new?edit=ID -- edit existing draft
 *
 * Phase 73 I4: form body extracted into <ExpenseSubmitForm> for reuse in
 * InlineExpenseDialog (D-17 standard submission, never auto-approve).
 */
import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { useSearchParams, useNavigate, Link } from "react-router-dom";
import { useDocumentTitle } from "@/hooks/useDocumentTitle";
import { PageHeader } from "@/components/layout/PageHeader";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { AlertTriangle, Loader2, Save, Send } from "lucide-react";
import { toast } from "sonner";
import { useAccounts } from "@/hooks/convex/useAccounts";
import {
  useExpense,
  useCreateExpenseDraft,
  useUpdateExpenseDraft,
  useSubmitExpense,
} from "@/hooks/convex/useExpenses";
import { utcToWibDateStr } from "@/lib/dateUtils";
import type { Id } from "../../convex/_generated/dataModel";
import {
  ExpenseSubmitForm,
  type ExpenseSubmitFormHandle,
  type ExpenseSubmitFormValues,
  type PaymentMethod,
} from "@/components/expense/ExpenseSubmitForm";

export function ExpenseSubmit() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const editId = searchParams.get("edit") as Id<"expenses"> | null;
  const isEditing = !!editId;

  useDocumentTitle(isEditing ? "Edit Expense" : "New Expense");

  const allAccounts = useAccounts(true);
  const accounts = useMemo(
    () => allAccounts?.filter((a) => ["opex", "cogs", "other"].includes(a.type)),
    [allAccounts],
  );
  const existingExpense = useExpense(editId ?? undefined);

  const { mutate: createDraft } = useCreateExpenseDraft();
  const { mutate: updateDraft } = useUpdateExpenseDraft();
  const { mutate: submitExpense } = useSubmitExpense();

  const [draftId, setDraftId] = useState<Id<"expenses"> | null>(editId);
  const [duplicateWarning, setDuplicateWarning] = useState<string | null>(null);
  const [initialValues, setInitialValues] = useState<
    Partial<ExpenseSubmitFormValues> | undefined
  >(undefined);
  const [saving, setSaving] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const formLoadedRef = useRef(!isEditing);
  const formRef = useRef<ExpenseSubmitFormHandle>(null);

  useEffect(() => {
    if (isEditing && existingExpense && accounts && !formLoadedRef.current) {
      if (existingExpense.status !== "draft") {
        toast.error("Only draft expenses can be edited");
        navigate("/expenses");
        return;
      }

      const matchedAccount = accounts.find((a) => a._id === existingExpense.accountId);

      setInitialValues({
        description: existingExpense.description,
        amount: String(existingExpense.amount),
        expenseType:
          (matchedAccount?.type as ExpenseSubmitFormValues["expenseType"]) ?? "",
        accountId: existingExpense.accountId,
        expenseDate: utcToWibDateStr(existingExpense.expenseDate),
        vendorName: existingExpense.vendorName,
        paymentMethod: existingExpense.paymentMethod as PaymentMethod,
        transactionReference: existingExpense.transactionReference ?? "",
        receiptFileId: existingExpense.receiptFileId,
        receiptImageHash: existingExpense.receiptImageHash,
        sharedReceiptAcknowledged:
          existingExpense.sharedReceiptAcknowledged ?? undefined,
      });
      setDraftId(existingExpense._id);
      if (existingExpense.duplicateWarning) {
        setDuplicateWarning(existingExpense.duplicateWarning);
      }
      formLoadedRef.current = true;
    }
  }, [isEditing, existingExpense, accounts, navigate]);

  const handleSaveDraft = useCallback(async () => {
    const build = formRef.current?.buildArgs();
    if (!build) return;
    if (!build.ok) {
      toast.error(build.error);
      return;
    }

    setSaving(true);
    try {
      if (draftId) {
        await updateDraft({ expenseId: draftId, ...build.args });
      } else {
        const result = await createDraft(build.args);
        if (result) {
          setDraftId(result.expenseId);
          if (result.duplicateWarning) setDuplicateWarning(result.duplicateWarning);
        }
      }
    } catch {
      // Error toast handled by mutation hook
    } finally {
      setSaving(false);
    }
  }, [draftId, updateDraft, createDraft]);

  const handleSubmit = useCallback(async () => {
    const build = formRef.current?.buildArgs();
    if (!build) return;
    if (!build.ok) {
      toast.error(build.error);
      return;
    }

    setSubmitting(true);
    try {
      let expenseIdToSubmit = draftId;

      if (!expenseIdToSubmit) {
        const result = await createDraft(build.args);
        if (!result) {
          setSubmitting(false);
          return;
        }
        expenseIdToSubmit = result.expenseId;
        setDraftId(result.expenseId);
        if (result.duplicateWarning) setDuplicateWarning(result.duplicateWarning);
      } else {
        await updateDraft({ expenseId: expenseIdToSubmit, ...build.args });
      }

      await submitExpense({ expenseId: expenseIdToSubmit });
      navigate("/expenses");
    } catch {
      // Error toast handled by mutation hook
    } finally {
      setSubmitting(false);
    }
  }, [draftId, createDraft, updateDraft, submitExpense, navigate]);

  if (allAccounts === undefined) {
    return (
      <div className="space-y-4">
        <PageHeader title="New Expense" backTo="/expenses" backLabel="My Expenses" />
        <Skeleton className="h-[400px] w-full" />
      </div>
    );
  }

  if (isEditing && !formLoadedRef.current) {
    return (
      <div className="space-y-4">
        <PageHeader title="Edit Expense" backTo="/expenses" backLabel="My Expenses" />
        <Skeleton className="h-[400px] w-full" />
      </div>
    );
  }

  const isProcessing = saving || submitting;

  const banner = duplicateWarning ? (
    <div className="flex items-center gap-2 rounded-md border border-amber-200 bg-amber-50 dark:border-amber-800 dark:bg-amber-950 p-3 text-sm text-amber-800 dark:text-amber-200">
      <AlertTriangle className="h-4 w-4 shrink-0" />
      <p>{duplicateWarning}</p>
    </div>
  ) : null;

  return (
    <div className="space-y-4">
      <PageHeader
        title={isEditing ? "Edit Expense" : "New Expense"}
        backTo="/expenses"
        backLabel="My Expenses"
      />

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Expense Details</CardTitle>
        </CardHeader>
        <CardContent>
          <ExpenseSubmitForm
            ref={formRef}
            mode="page"
            initialValues={initialValues}
            disabled={isProcessing}
            banner={banner}
          />
        </CardContent>
      </Card>

      <div className="flex items-center gap-3">
        <Button variant="outline" onClick={handleSaveDraft} disabled={isProcessing}>
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
