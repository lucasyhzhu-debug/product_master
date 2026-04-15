/**
 * InlineReimbursementDialog — Phase 73 D-19.
 *
 * Inline-creates a reimbursement batch linked to an unmatched DEBIT bank
 * line. Because batch creation requires (a) selecting the employee and
 * (b) picking already-awaiting-payment expenses, the dialog surfaces the
 * bank-line context + a deep link into the standard Reimbursement Manager
 * flow. Once items are added and the mutation completes, the caller wires
 * the bank line back via the existing `useInlineCreateReimbursement` hook.
 *
 * Minimum viable: collects a user-supplied list of expense IDs (pasted or
 * entered manually). The existing Reimbursement Manager remains the
 * canonical multi-expense picker; this dialog is the "from bank line"
 * shortcut. If no items are entered, we redirect to the full manager.
 */
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
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
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { ExternalLink, Info, Loader2 } from "lucide-react";
import { useInlineCreateReimbursement } from "@/hooks/convex/useBankReconciliation";
import { formatCurrency } from "@/lib/utils";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  line: Doc<"bankStatementLines"> | null;
}

export function InlineReimbursementDialog({ open, onOpenChange, line }: Props) {
  const navigate = useNavigate();
  const submit = useInlineCreateReimbursement();
  const [employeeUserId, setEmployeeUserId] = useState("");
  const [expenseIdsRaw, setExpenseIdsRaw] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!open) {
      setEmployeeUserId("");
      setExpenseIdsRaw("");
    }
  }, [open]);

  async function handleSubmit() {
    if (!line) return;
    const expenseIds = expenseIdsRaw
      .split(/[\s,]+/)
      .map((s) => s.trim())
      .filter(Boolean);
    if (!employeeUserId) {
      toast.error("Employee user id is required.");
      return;
    }
    if (expenseIds.length === 0) {
      toast.error(
        "Provide at least one expense id. Use the Reimbursements page to pick from the awaiting-payment queue.",
      );
      return;
    }

    // WR-05 mitigation: validate pasted IDs before calling the mutation so
    // fat-fingered input fails fast with a clear message instead of a
    // cryptic server-side "not found" (or silent-null when an id from the
    // wrong table happens to exist). Convex ids are opaque base32 strings,
    // but the common fat-finger cases (empty prefix, wrong table prefix,
    // leading/trailing quotes) are catchable with a minimal shape check.
    const looksLikeConvexId = (s: string) => /^[a-z0-9]{20,}$/i.test(s);
    if (!looksLikeConvexId(employeeUserId)) {
      toast.error(
        "Employee user id looks malformed. Paste the raw id from Users Manager.",
      );
      return;
    }
    const badExpenseId = expenseIds.find((id) => !looksLikeConvexId(id));
    if (badExpenseId) {
      toast.error(
        `Expense id "${badExpenseId}" looks malformed. Paste raw ids separated by commas or whitespace.`,
      );
      return;
    }

    setSubmitting(true);
    try {
      const result = await submit({
        bankLineId: line._id,
        employeeUserId: employeeUserId as Id<"users">,
        expenseIds: expenseIds as Id<"expenses">[],
      });
      toast.success(
        `Reimbursement batch ${result?.batchNumber ?? ""} created and linked to line. Add any additional items from the batch detail page.`,
      );
      onOpenChange(false);
      if (result?.batchId) {
        navigate(`/reimbursements/${result.batchId}`);
      } else {
        navigate("/reimbursements");
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to create reimbursement batch.";
      toast.error(msg);
    } finally {
      setSubmitting(false);
    }
  }

  function goToFullManager() {
    onOpenChange(false);
    navigate("/reimbursements");
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>Create reimbursement batch from bank line</DialogTitle>
          <DialogDescription>
            Link this debit to a new reimbursement batch (D-19).
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="text-sm">
            <p className="text-muted-foreground">Bank line</p>
            <p className="font-medium">
              {line ? `${formatCurrency(line.amountIdr)} — ${line.rawDescription}` : "—"}
            </p>
          </div>

          <Alert>
            <Info className="h-4 w-4" />
            <AlertDescription>
              Items are taken from expenses already in <strong>awaiting payment</strong>
              . Use the full Reimbursement Manager to pick items visually, then
              return here to confirm the match.
            </AlertDescription>
          </Alert>

          <div className="space-y-1.5">
            <Label htmlFor="employeeUserId">Employee user id *</Label>
            <Input
              id="employeeUserId"
              value={employeeUserId}
              onChange={(e) => setEmployeeUserId(e.target.value)}
              disabled={submitting}
              placeholder="users/..."
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="expenseIds">Expense ids (comma or whitespace separated) *</Label>
            <Input
              id="expenseIds"
              value={expenseIdsRaw}
              onChange={(e) => setExpenseIdsRaw(e.target.value)}
              disabled={submitting}
              placeholder="expenses/abc..., expenses/def..."
            />
            <p className="text-xs text-muted-foreground">
              All expenses must be <strong>awaiting_payment</strong> and belong to
              the selected employee.
            </p>
          </div>
        </div>

        <DialogFooter className="flex justify-between sm:justify-between">
          <Button variant="ghost" onClick={goToFullManager} disabled={submitting}>
            <ExternalLink className="h-4 w-4 mr-1" />
            Open Reimbursement Manager
          </Button>
          <div className="flex gap-2">
            <Button
              variant="ghost"
              onClick={() => onOpenChange(false)}
              disabled={submitting}
            >
              Cancel
            </Button>
            <Button onClick={handleSubmit} disabled={submitting}>
              {submitting && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
              Create reimbursement batch
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
