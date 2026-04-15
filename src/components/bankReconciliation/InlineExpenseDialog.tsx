/**
 * InlineExpenseDialog — Phase 73 D-17 critical.
 *
 * Inline-creates an expense from an unmatched bank line using the SAME
 * submission flow as /expenses/new. Renders <ExpenseSubmitForm mode="dialog">
 * so no form-body duplication (I4 mandate).
 *
 * D-17 INVARIANT: this dialog NEVER surfaces an auto-approve button. The
 * backend `inlineCreateExpense` mutation hard-codes status="submitted". The
 * expense still goes through the standard Expense Approval queue.
 */
import { useRef, useState } from "react";
import { toast } from "sonner";
import type { Doc, Id } from "../../../convex/_generated/dataModel";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Loader2, Send, Info } from "lucide-react";
import { useInlineCreateExpense } from "@/hooks/convex/useBankReconciliation";
import { useAuth } from "@/contexts/AuthContext";
import {
  ExpenseSubmitForm,
  type ExpenseSubmitFormHandle,
  type ExpenseSubmitFormValues,
} from "@/components/expense/ExpenseSubmitForm";
import { utcToWibDateStr } from "@/lib/dateUtils";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  line: Doc<"bankStatementLines"> | null;
}

export function InlineExpenseDialog({ open, onOpenChange, line }: Props) {
  const { user } = useAuth();
  const submit = useInlineCreateExpense();
  const formRef = useRef<ExpenseSubmitFormHandle>(null);
  const [submitting, setSubmitting] = useState(false);

  if (!line) {
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>Create expense from bank line</DialogTitle>
          </DialogHeader>
          <div className="text-sm text-muted-foreground">
            Select a bank line first.
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  const initialValues: Partial<ExpenseSubmitFormValues> = {
    description: line.rawDescription,
    amount: String(line.amountIdr),
    vendorName: line.parsedCounterparty ?? "",
    expenseDate: utcToWibDateStr(line.date),
    // Bank-reconciliation inline expense is ALWAYS company-paid — money has
    // already left the company bank account. Forcing this value here also
    // satisfies the backend validator union + D-17 reviewer guard.
    paymentMethod: "company_paid",
    // expenseType is derived from account selected by reviewer (NOT prefilled —
    // required-but-not-prefilled per UI-SPEC §6.7 "bg-invoice-field-input").
    expenseType: "",
    accountId: "",
  };

  async function handleSubmit() {
    const build = formRef.current?.buildArgs();
    if (!build) return;
    if (!build.ok) {
      toast.error(build.error);
      return;
    }

    if (!user?.userId) {
      toast.error("Not authenticated");
      return;
    }

    setSubmitting(true);
    try {
      await submit({
        bankLineId: line!._id,
        submittedBy: user.userId as Id<"users">,
        // D-17 requires a receipt — form validate() enforces it in dialog mode.
        receiptStorageId: build.args.receiptFileId!,
        accountId: build.args.accountId,
        expenseDate: build.args.expenseDate,
        amountIdr: build.args.amount,
        vendorName: build.args.vendorName,
        description: build.args.description,
        paymentMethod: build.args.paymentMethod,
      });
      toast.info(
        "Expense submitted — approve in Expense Approval to confirm match",
      );
      onOpenChange(false);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to submit expense.";
      toast.error(msg);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Create expense from bank line</DialogTitle>
          <DialogDescription>
            Inline expense — uses the standard submission flow (D-17).
          </DialogDescription>
        </DialogHeader>

        <Alert>
          <Info className="h-4 w-4" />
          <AlertTitle>Standard submission</AlertTitle>
          <AlertDescription>
            This expense uses the standard submission flow. Receipt and owner
            are required even though money has already left the bank. After
            submitting, approve it in the Expense Approval queue to confirm the
            bank line match.
          </AlertDescription>
        </Alert>

        <ExpenseSubmitForm
          ref={formRef}
          mode="dialog"
          initialValues={initialValues}
          disabled={submitting}
          hidePaymentMethod
        />

        <DialogFooter>
          <Button
            variant="ghost"
            onClick={() => onOpenChange(false)}
            disabled={submitting}
          >
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={submitting}>
            {submitting ? (
              <Loader2 className="h-4 w-4 animate-spin mr-2" />
            ) : (
              <Send className="h-4 w-4 mr-2" />
            )}
            Submit for approval
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
