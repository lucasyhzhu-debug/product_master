/**
 * ApprovalActions -- approve/reject/void button group for expense approval queue.
 * Shows appropriate dialogs with comment/reason fields based on action type.
 * DoA enforcement is at the backend; frontend shows/hides and requires comments.
 *
 * Uses ActionDialog sub-component to eliminate duplicated Dialog JSX (F7).
 * Uses formatCurrency(COMMENT_REQUIRED_THRESHOLD) instead of hardcoded strings (F4).
 */
import { useState, useCallback } from "react";
import { Button } from "@/components/ui/button";
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
import { useApproveExpense, useRejectExpense, useVoidExpense } from "@/hooks/convex/useExpenses";
import { formatCurrency } from "@/lib/utils";
import { Check, X, Ban } from "lucide-react";
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
  onActionComplete?: () => void;
}

type DialogType = "approve" | "reject" | "void" | null;

export function ApprovalActions({
  expenseId,
  amount,
  onActionComplete,
}: ApprovalActionsProps) {
  const { user } = useAuth();
  const { mutate: approve } = useApproveExpense();
  const { mutate: reject } = useRejectExpense();
  const { mutate: voidExpense } = useVoidExpense();

  const [activeDialog, setActiveDialog] = useState<DialogType>(null);
  const [isDirectSubmitting, setIsDirectSubmitting] = useState(false);

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

  const closeDialog = useCallback(() => {
    setActiveDialog(null);
  }, []);

  const isAdmin = user?.role === "admin";
  const isSubmitting = isDirectSubmitting;

  return (
    <>
      <div className="flex items-center gap-2">
        <Button
          size="sm"
          className="bg-emerald-600 hover:bg-emerald-700 text-white"
          onClick={handleApproveClick}
          disabled={isSubmitting}
        >
          <Check className="h-3.5 w-3.5 mr-1" />
          Approve
        </Button>
        <Button
          size="sm"
          variant="destructive"
          onClick={() => setActiveDialog("reject")}
          disabled={isSubmitting}
        >
          <X className="h-3.5 w-3.5 mr-1" />
          Reject
        </Button>
        {isAdmin && (
          <Button
            size="sm"
            variant="outline"
            onClick={() => setActiveDialog("void")}
            disabled={isSubmitting}
          >
            <Ban className="h-3.5 w-3.5 mr-1" />
            Void
          </Button>
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
        description={`Please provide a reason for rejecting this expense (${formatCurrency(amount)}).`}
        placeholder="Rejection reason (required)"
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
        description={`This will void the expense (${formatCurrency(amount)}) and create a reversing journal entry if applicable.`}
        placeholder="Void reason (required)"
        submitLabel="Confirm Void"
        submitVariant="destructive"
        onSubmit={handleVoidSubmit}
        requireComment
        open={activeDialog === "void"}
        onOpenChange={(open) => !open && closeDialog()}
      />
    </>
  );
}
