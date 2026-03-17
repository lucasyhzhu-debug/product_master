/**
 * ApprovalActions -- context-aware action button group for expense approval queue.
 * Renders different button sets based on paymentMethod + status:
 *   - submitted employee_paid/payment_request: Approve / Reject
 *   - recorded company_paid: Acknowledge / Flag for Review
 *   - approved payment_request: Mark as Paid (with transaction reference)
 *   - Void is always available for admins
 *
 * Uses ActionDialog sub-component to eliminate duplicated Dialog JSX (F7).
 * Uses formatCurrency(COMMENT_REQUIRED_THRESHOLD) instead of hardcoded strings (F4).
 */
import { useState, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
import { useAuth } from "@/contexts/AuthContext";
import {
  useApproveExpense,
  useRejectExpense,
  useVoidExpense,
  useAcknowledgeExpense,
  useFlagExpense,
  useMarkAsPaid,
} from "@/hooks/convex/useExpenses";
import { formatCurrency } from "@/lib/utils";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Check, X, Ban, AlertTriangle, Banknote } from "lucide-react";
import type { Id } from "../../../convex/_generated/dataModel";
import { COMMENT_REQUIRED_THRESHOLD } from "../../../convex/expenses/helpers";

// ============================================================================
// ActionDialog -- local sub-component for approve/reject/void dialogs
// ============================================================================

interface ActionDialogProps {
  title: string;
  description: string;
  placeholder: string;
  submitLabel: string;
  submitVariant?: "default" | "destructive";
  onSubmit: (comment: string) => Promise<void>;
  requireComment?: boolean;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

function ActionDialog({
  title,
  description,
  placeholder,
  submitLabel,
  submitVariant = "default",
  onSubmit,
  requireComment = false,
  open,
  onOpenChange,
}: ActionDialogProps) {
  const [comment, setComment] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = useCallback(async () => {
    if (requireComment && !comment.trim()) return;
    setIsSubmitting(true);
    try {
      await onSubmit(comment.trim());
      setComment("");
      onOpenChange(false);
    } catch {
      // Toast handles error via createMutationHook
    } finally {
      setIsSubmitting(false);
    }
  }, [comment, requireComment, onSubmit, onOpenChange]);

  const handleClose = useCallback(() => {
    setComment("");
    onOpenChange(false);
  }, [onOpenChange]);

  return (
    <Dialog open={open} onOpenChange={(nextOpen) => !nextOpen && handleClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        <Textarea
          placeholder={placeholder}
          value={comment}
          onChange={(e) => setComment(e.target.value)}
        />
        <DialogFooter>
          <Button variant="outline" onClick={handleClose} disabled={isSubmitting}>
            Cancel
          </Button>
          <Button
            variant={submitVariant}
            className={submitVariant === "default" ? "bg-emerald-600 hover:bg-emerald-700 text-white" : undefined}
            onClick={handleSubmit}
            disabled={isSubmitting || (requireComment && !comment.trim())}
          >
            {isSubmitting ? `${submitLabel.replace("Confirm ", "")}...` : submitLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ============================================================================
// ApprovalActions -- main component
// ============================================================================

interface ApprovalActionsProps {
  expenseId: Id<"expenses">;
  amount: number;
  paymentMethod: string;
  status: string;
  onActionComplete?: () => void;
}

type DialogType = "approve" | "reject" | "void" | "acknowledge" | "flag" | "markAsPaid" | null;

export function ApprovalActions({
  expenseId,
  amount,
  paymentMethod,
  status,
  onActionComplete,
}: ApprovalActionsProps) {
  const { user } = useAuth();
  const { mutate: approve } = useApproveExpense();
  const { mutate: reject } = useRejectExpense();
  const { mutate: voidExpense } = useVoidExpense();
  const { mutate: acknowledge } = useAcknowledgeExpense();
  const { mutate: flag } = useFlagExpense();
  const { mutate: markPaid } = useMarkAsPaid();

  const [activeDialog, setActiveDialog] = useState<DialogType>(null);
  const [isDirectSubmitting, setIsDirectSubmitting] = useState(false);
  const [transactionRef, setTransactionRef] = useState("");

  const commentRequired = amount >= COMMENT_REQUIRED_THRESHOLD;
  const thresholdStr = formatCurrency(COMMENT_REQUIRED_THRESHOLD);

  const handleApproveSubmit = useCallback(async (comment: string) => {
    await approve({
      expenseId,
      ...(comment ? { comment } : {}),
    });
    onActionComplete?.();
  }, [approve, expenseId, onActionComplete]);

  const handleApproveClick = useCallback(() => {
    if (commentRequired) {
      setActiveDialog("approve");
    } else {
      // Direct approve without dialog for low-value expenses
      setIsDirectSubmitting(true);
      handleApproveSubmit("").finally(() => setIsDirectSubmitting(false));
    }
  }, [commentRequired, handleApproveSubmit]);

  const handleRejectSubmit = useCallback(async (comment: string) => {
    await reject({ expenseId, reason: comment });
    onActionComplete?.();
  }, [reject, expenseId, onActionComplete]);

  const handleVoidSubmit = useCallback(async (comment: string) => {
    await voidExpense({ expenseId, reason: comment });
    onActionComplete?.();
  }, [voidExpense, expenseId, onActionComplete]);

  const handleAcknowledgeSubmit = useCallback(async (comment: string) => {
    await acknowledge({ expenseId, ...(comment ? { comment } : {}) });
    onActionComplete?.();
  }, [acknowledge, expenseId, onActionComplete]);

  const handleFlagSubmit = useCallback(async (comment: string) => {
    await flag({ expenseId, reason: comment });
    onActionComplete?.();
  }, [flag, expenseId, onActionComplete]);

  const handleMarkAsPaidSubmit = useCallback(async () => {
    if (!transactionRef.trim()) return;
    await markPaid({ expenseId, transactionReference: transactionRef.trim() });
    setTransactionRef("");
    onActionComplete?.();
  }, [markPaid, expenseId, transactionRef, onActionComplete]);

  const closeDialog = useCallback(() => {
    setActiveDialog(null);
  }, []);

  const isAdmin = user?.role === "admin";

  // Determine which action set to show
  const isRecordedCompanyPaid = paymentMethod === "company_paid" && status === "recorded";
  const isSubmittedForApproval = status === "submitted" && (paymentMethod === "employee_paid" || paymentMethod === "payment_request");
  const isApprovedPaymentRequest = paymentMethod === "payment_request" && status === "approved";

  return (
    <>
      <div className="flex items-center gap-2">
        {/* Standard approval actions: submitted employee_paid or payment_request */}
        {isSubmittedForApproval && (
          <>
            <Button
              size="sm"
              className="bg-emerald-600 hover:bg-emerald-700 text-white"
              onClick={handleApproveClick}
              disabled={isDirectSubmitting}
            >
              <Check className="h-3.5 w-3.5 mr-1" />
              Approve
            </Button>
            <Button
              size="sm"
              variant="destructive"
              onClick={() => setActiveDialog("reject")}
              disabled={isDirectSubmitting}
            >
              <X className="h-3.5 w-3.5 mr-1" />
              Reject
            </Button>
          </>
        )}

        {/* Acknowledge/Flag actions: recorded company_paid */}
        {isRecordedCompanyPaid && (
          <>
            <Button
              size="sm"
              className="bg-emerald-600 hover:bg-emerald-700 text-white"
              onClick={() => {
                // NOTE: commentRequired uses the existing COMMENT_REQUIRED_THRESHOLD logic
                // (>= Rp 500K). For acknowledge this controls whether a dialog is shown,
                // NOT whether the action is allowed. DoA does not apply to acknowledgment
                // (the money already left the bank -- this is confirmation, not authorization).
                if (commentRequired) {
                  setActiveDialog("acknowledge");
                } else {
                  setIsDirectSubmitting(true);
                  handleAcknowledgeSubmit("").finally(() => setIsDirectSubmitting(false));
                }
              }}
              disabled={isDirectSubmitting}
            >
              <Check className="h-3.5 w-3.5 mr-1" />
              Acknowledge
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="text-amber-600 border-amber-300"
              onClick={() => setActiveDialog("flag")}
              disabled={isDirectSubmitting}
            >
              <AlertTriangle className="h-3.5 w-3.5 mr-1" />
              Flag for Review
            </Button>
          </>
        )}

        {/* Mark as Paid action: approved payment_request */}
        {isApprovedPaymentRequest && (
          <Button
            size="sm"
            className="bg-teal-600 hover:bg-teal-700 text-white"
            onClick={() => setActiveDialog("markAsPaid")}
            disabled={isDirectSubmitting}
          >
            <Banknote className="h-3.5 w-3.5 mr-1" />
            Mark as Paid
          </Button>
        )}

        {/* Void is always available for admin */}
        {isAdmin && (
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setActiveDialog("void")}
                  disabled={isDirectSubmitting}
                >
                  <Ban className="h-3.5 w-3.5 mr-1" />
                  Void
                </Button>
              </TooltipTrigger>
              <TooltipContent side="bottom" className="max-w-[220px] text-center">
                <p>Permanently cancel this expense and reverse any journal entries. Cannot be resubmitted.</p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        )}
      </div>

      {/* Approve Dialog (shown for high-value expenses) */}
      <ActionDialog
        title="Approve Expense"
        description={`This expense is ${formatCurrency(amount)}.${commentRequired ? ` A comment is required for expenses >= ${thresholdStr}.` : " You may add an optional comment."}`}
        placeholder={commentRequired ? `Comment required for expenses >= ${thresholdStr}` : "Optional comment..."}
        submitLabel="Confirm Approve"
        submitVariant="default"
        onSubmit={handleApproveSubmit}
        requireComment={commentRequired}
        open={activeDialog === "approve"}
        onOpenChange={(open) => !open && closeDialog()}
      />

      {/* Reject Dialog */}
      <ActionDialog
        title="Reject Expense"
        description={`Reject this expense (${formatCurrency(amount)}) and send it back to the submitter for correction. They can fix the issue and resubmit a revised version.`}
        placeholder="What needs to be corrected? (required)"
        submitLabel="Confirm Reject"
        submitVariant="destructive"
        onSubmit={handleRejectSubmit}
        requireComment
        open={activeDialog === "reject"}
        onOpenChange={(open) => !open && closeDialog()}
      />

      {/* Void Dialog (admin only) */}
      <ActionDialog
        title="Void Expense"
        description={`Permanently cancel this expense (${formatCurrency(amount)}). This cannot be resubmitted. Any journal entries will be reversed. Use Void when the expense should never have been created (e.g., duplicate entry, fraudulent claim, or entered in error).`}
        placeholder="Why should this expense be permanently cancelled? (required)"
        submitLabel="Confirm Void"
        submitVariant="destructive"
        onSubmit={handleVoidSubmit}
        requireComment
        open={activeDialog === "void"}
        onOpenChange={(open) => !open && closeDialog()}
      />

      {/* Acknowledge Dialog */}
      <ActionDialog
        title="Acknowledge Company Expense"
        description={`Confirm this company-paid expense (${formatCurrency(amount)}) has been reviewed and is correct.`}
        placeholder={commentRequired ? `Comment required for expenses >= ${thresholdStr}` : "Optional comment..."}
        submitLabel="Confirm Acknowledge"
        submitVariant="default"
        onSubmit={handleAcknowledgeSubmit}
        requireComment={commentRequired}
        open={activeDialog === "acknowledge"}
        onOpenChange={(open) => !open && closeDialog()}
      />

      {/* Flag for Review Dialog */}
      <ActionDialog
        title="Flag for Review"
        description={`Flag this company-paid expense (${formatCurrency(amount)}) for further investigation. The journal entry will not be reversed.`}
        placeholder="Reason for flagging (required)"
        submitLabel="Submit Flag"
        submitVariant="destructive"
        onSubmit={handleFlagSubmit}
        requireComment
        open={activeDialog === "flag"}
        onOpenChange={(open) => !open && closeDialog()}
      />

      {/* Mark as Paid Dialog -- custom dialog with text input for transaction reference */}
      <Dialog open={activeDialog === "markAsPaid"} onOpenChange={(open) => { if (!open) { setTransactionRef(""); closeDialog(); } }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Mark as Paid</DialogTitle>
            <DialogDescription>
              Confirm that the bank transfer for this payment request ({formatCurrency(amount)}) has been executed.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="txRef">Transaction Reference</Label>
            <Input id="txRef" placeholder="Bank reference number (required)" value={transactionRef} onChange={(e) => setTransactionRef(e.target.value)} />
            <p className="text-xs text-muted-foreground">Enter the bank transfer reference or confirmation number</p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setTransactionRef(""); closeDialog(); }}>Cancel</Button>
            <Button className="bg-teal-600 hover:bg-teal-700 text-white" onClick={handleMarkAsPaidSubmit} disabled={!transactionRef.trim()}>
              Confirm Payment
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
