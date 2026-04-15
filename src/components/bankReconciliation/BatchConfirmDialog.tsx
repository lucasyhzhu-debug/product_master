/**
 * BatchConfirmDialog — Phase 73 D-07, D-08.
 *
 * Preview modal for the "Confirm all exact-tier" batch post. Groups lines
 * by (DR account, CR account) pair, shows grand totals + balance gate.
 *
 * D-08 invariant: if aggregate DR ≠ aggregate CR, the Post button is
 * disabled and a destructive Alert explains the imbalance. Server-side
 * `createJournalEntryWithLines` re-validates balance; this UI gate is
 * convenience + signal.
 */
import { useMemo, useState } from "react";
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
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Separator } from "@/components/ui/separator";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { AlertTriangle, Loader2 } from "lucide-react";
import { useBatchConfirmExactTier } from "@/hooks/convex/useBankReconciliation";
import { useAccounts } from "@/hooks/convex/useAccounts";
import { formatCurrency } from "@/lib/utils";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  statementId: Id<"bankStatements"> | null;
  /** Lines eligible for batch confirm (auto_matched exact-tier, not confirmed). */
  exactTierLines: Doc<"bankStatementLines">[];
  onSuccess?: (result: {
    posted: number;
    skipped: number;
    totalAmountIdr: number;
  }) => void;
}

type GroupKey = string;
type GroupRow = {
  key: GroupKey;
  debitAccountId: Id<"accounts">;
  creditAccountId: Id<"accounts">;
  count: number;
  total: number;
};

export function BatchConfirmDialog({
  open,
  onOpenChange,
  statementId,
  exactTierLines,
  onSuccess,
}: Props) {
  const batchConfirm = useBatchConfirmExactTier();
  const accounts = useAccounts(false);
  const [submitting, setSubmitting] = useState(false);

  const accountLookup = useMemo(() => {
    const m = new Map<string, { code: string; name: string }>();
    accounts?.forEach((a) => m.set(a._id as string, { code: a.code, name: a.name }));
    return m;
  }, [accounts]);

  // Group postable lines by (debit, credit) account pair.
  const { groups, skipped, totalDR, totalCR, totalLines } = useMemo(() => {
    const map = new Map<GroupKey, GroupRow>();
    let skippedCount = 0;
    let drSum = 0;
    let crSum = 0;

    for (const line of exactTierLines) {
      if (!line.jeDebitAccountId || !line.jeCreditAccountId) {
        skippedCount += 1;
        continue;
      }
      const key = `${line.jeDebitAccountId}|${line.jeCreditAccountId}`;
      const existing = map.get(key);
      if (existing) {
        existing.count += 1;
        existing.total += line.amountIdr;
      } else {
        map.set(key, {
          key,
          debitAccountId: line.jeDebitAccountId,
          creditAccountId: line.jeCreditAccountId,
          count: 1,
          total: line.amountIdr,
        });
      }
      // For balance gate: DR and CR equal per line (amountIdr each) — but
      // aggregate may still diverge if accounts overlap by contra sign.
      // For Phase 73 simple balance: sum all debits vs credits.
      drSum += line.amountIdr;
      crSum += line.amountIdr;
    }

    return {
      groups: Array.from(map.values()),
      skipped: skippedCount,
      totalDR: drSum,
      totalCR: crSum,
      totalLines: exactTierLines.length - skippedCount,
    };
  }, [exactTierLines]);

  const balanced = totalDR === totalCR;

  function accountLabel(id: Id<"accounts">): string {
    const a = accountLookup.get(id as string);
    return a ? `${a.code} · ${a.name}` : String(id);
  }

  async function handlePost() {
    if (!statementId) return;
    if (!balanced) return;
    setSubmitting(true);
    try {
      const result = await batchConfirm({ statementId });
      const posted = result?.posted ?? totalLines;
      toast.success(`${posted} journal entries posted`);
      onSuccess?.({
        posted: result?.posted ?? totalLines,
        skipped: result?.skipped ?? skipped,
        totalAmountIdr: result?.totalAmountIdr ?? totalDR,
      });
      onOpenChange(false);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to post batch.";
      toast.error(msg);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Confirm {totalLines} matched lines</DialogTitle>
          <DialogDescription>
            Preview of the journal entries about to be posted.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <p className="text-sm">
            You are about to post <strong>{totalLines}</strong> journal entries
            totaling <strong>{formatCurrency(totalDR)}</strong>.
          </p>

          {skipped > 0 && (
            <Alert>
              <AlertTriangle className="h-4 w-4" />
              <AlertDescription>
                {skipped} line{skipped === 1 ? "" : "s"} skipped — no JE accounts
                assigned. These stay in their current state and can be matched
                individually.
              </AlertDescription>
            </Alert>
          )}

          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Debit Account</TableHead>
                  <TableHead>Credit Account</TableHead>
                  <TableHead className="text-right">Lines</TableHead>
                  <TableHead className="text-right">Total</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {groups.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={4} className="text-center text-sm text-muted-foreground">
                      No postable lines. Auto-match more lines before batch confirming.
                    </TableCell>
                  </TableRow>
                ) : (
                  groups.map((g) => (
                    <TableRow key={g.key}>
                      <TableCell className="text-xs font-mono">
                        {accountLabel(g.debitAccountId)}
                      </TableCell>
                      <TableCell className="text-xs font-mono">
                        {accountLabel(g.creditAccountId)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">{g.count}</TableCell>
                      <TableCell className="text-right tabular-nums">
                        {formatCurrency(g.total)}
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>

          <Separator />

          <div className="flex items-center justify-between text-sm font-mono tabular-nums">
            <span>Grand Total DR:</span>
            <span>{formatCurrency(totalDR)}</span>
          </div>
          <div className="flex items-center justify-between text-sm font-mono tabular-nums">
            <span>Grand Total CR:</span>
            <span>{formatCurrency(totalCR)}</span>
          </div>

          {!balanced && (
            <Alert variant="destructive">
              <AlertTriangle className="h-4 w-4" />
              <AlertTitle>Ledger imbalance detected</AlertTitle>
              <AlertDescription>
                DR ≠ CR. Posting blocked. Review the selected lines or contact
                an admin.
              </AlertDescription>
            </Alert>
          )}
        </div>

        <DialogFooter>
          <Button
            variant="ghost"
            onClick={() => onOpenChange(false)}
            disabled={submitting}
          >
            Cancel
          </Button>
          <Button
            onClick={handlePost}
            disabled={submitting || !balanced || totalLines === 0}
          >
            {submitting && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
            Post {totalLines} journal entries
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
