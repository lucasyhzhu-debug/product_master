/**
 * ApprovalActions -- approve/reject/void button group for expense approval queue.
 * Shows appropriate dialogs with comment/reason fields based on action type.
 * DoA enforcement is at the backend; frontend shows/hides and requires comments.
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
  const [comment, setComment] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const commentRequired = amount >= COMMENT_REQUIRED_THRESHOLD;

  const handleApproveSubmit = useCallback(async () => {
    setIsSubmitting(true);
    try {
      await approve({
        expenseId,
        ...(comment.trim() ? { comment: comment.trim() } : {}),
      });
      setActiveDialog(null);
      setComment("");
      onActionComplete?.();
    } catch {
      // Toast handles error via createMutationHook
    } finally {
      setIsSubmitting(false);
    }
  }, [approve, expenseId, comment, onActionComplete]);

  const handleApproveClick = useCallback(() => {
    if (commentRequired) {
      setActiveDialog("approve");
      setComment("");
    } else {
      handleApproveSubmit();
    }
  }, [commentRequired, handleApproveSubmit]);

  const handleRejectSubmit = useCallback(async () => {
    if (!comment.trim()) return;
    setIsSubmitting(true);
    try {
      await reject({ expenseId, reason: comment.trim() });
      setActiveDialog(null);
      setComment("");
      onActionComplete?.();
    } catch {
      // Toast handles error
    } finally {
      setIsSubmitting(false);
    }
  }, [reject, expenseId, comment, onActionComplete]);

  const handleVoidSubmit = useCallback(async () => {
    if (!comment.trim()) return;
    setIsSubmitting(true);
    try {
      await voidExpense({ expenseId, reason: comment.trim() });
      setActiveDialog(null);
      setComment("");
      onActionComplete?.();
    } catch {
      // Toast handles error
    } finally {
      setIsSubmitting(false);
    }
  }, [voidExpense, expenseId, comment, onActionComplete]);

  const closeDialog = useCallback(() => {
    setActiveDialog(null);
    setComment("");
  }, []);

  const isAdmin = user?.role === "admin";

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
          onClick={() => {
            setActiveDialog("reject");
            setComment("");
          }}
          disabled={isSubmitting}
        >
          <X className="h-3.5 w-3.5 mr-1" />
          Reject
        </Button>
        {isAdmin && (
          <Button
            size="sm"
            variant="outline"
            onClick={() => {
              setActiveDialog("void");
              setComment("");
            }}
            disabled={isSubmitting}
          >
            <Ban className="h-3.5 w-3.5 mr-1" />
            Void
          </Button>
        )}
      </div>

      {/* Approve Dialog (shown for >= 500K) */}
      <Dialog
        open={activeDialog === "approve"}
        onOpenChange={(open) => !open && closeDialog()}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Approve Expense</DialogTitle>
            <DialogDescription>
              This expense is {formatCurrency(amount)}.
              {commentRequired
                ? " A comment is required for expenses >= Rp 500,000."
                : " You may add an optional comment."}
            </DialogDescription>
          </DialogHeader>
          <Textarea
            placeholder={
              commentRequired
                ? "Comment required for expenses >= Rp 500,000"
                : "Optional comment..."
            }
            value={comment}
            onChange={(e) => setComment(e.target.value)}
          />
          <DialogFooter>
            <Button variant="outline" onClick={closeDialog} disabled={isSubmitting}>
              Cancel
            </Button>
            <Button
              className="bg-emerald-600 hover:bg-emerald-700 text-white"
              onClick={handleApproveSubmit}
              disabled={isSubmitting || (commentRequired && !comment.trim())}
            >
              {isSubmitting ? "Approving..." : "Confirm Approve"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Reject Dialog */}
      <Dialog
        open={activeDialog === "reject"}
        onOpenChange={(open) => !open && closeDialog()}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reject Expense</DialogTitle>
            <DialogDescription>
              Please provide a reason for rejecting this expense ({formatCurrency(amount)}).
            </DialogDescription>
          </DialogHeader>
          <Textarea
            placeholder="Rejection reason (required)"
            value={comment}
            onChange={(e) => setComment(e.target.value)}
          />
          <DialogFooter>
            <Button variant="outline" onClick={closeDialog} disabled={isSubmitting}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleRejectSubmit}
              disabled={isSubmitting || !comment.trim()}
            >
              {isSubmitting ? "Rejecting..." : "Confirm Reject"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Void Dialog (admin only) */}
      <Dialog
        open={activeDialog === "void"}
        onOpenChange={(open) => !open && closeDialog()}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Void Expense</DialogTitle>
            <DialogDescription>
              This will void the expense ({formatCurrency(amount)}) and create a reversing journal entry if applicable.
            </DialogDescription>
          </DialogHeader>
          <Textarea
            placeholder="Void reason (required)"
            value={comment}
            onChange={(e) => setComment(e.target.value)}
          />
          <DialogFooter>
            <Button variant="outline" onClick={closeDialog} disabled={isSubmitting}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleVoidSubmit}
              disabled={isSubmitting || !comment.trim()}
            >
              {isSubmitting ? "Voiding..." : "Confirm Void"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
