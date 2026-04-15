/**
 * SplitViewWorkspace — Phase 73 reconciliation Review tab.
 *
 * Orchestrates:
 *  - <StatementProgressHeader> (live progress)
 *  - <BankLinesPane> (left, 55%)
 *  - <CandidatesPane> (right, 45%)
 *  - <ReconciliationActionBar> (sticky bottom)
 *
 * Holds selection state and exposes dialog-open hooks that Plan 04 (Wave 2b)
 * wires to BatchConfirmDialog / LearnFromOverrideDialog / Inline*Dialog /
 * SearchAllRecordsDialog. The match/unmatch/confirm path works end-to-end
 * here without those dialogs.
 *
 * UI-SPEC §6.2 + §6.9 (responsive). All hooks declared at top per
 * CLAUDE.md pitfall 9.
 */

import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import type { Doc, Id } from "../../../convex/_generated/dataModel";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
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
  useBankStatement,
  useBankStatementLines,
  useConfirmLine,
  useManualMatch,
  useUnmatch,
} from "@/hooks/convex/useBankReconciliation";
import { StatementProgressHeader } from "./StatementProgressHeader";
import { BankLinesPane } from "./BankLinesPane";
import { CandidatesPane } from "./CandidatesPane";
import { ReconciliationActionBar } from "./ReconciliationActionBar";
import type { MatchedType } from "./CandidateRow";

interface Props {
  statementId: Id<"bankStatements"> | null;
  /** Optional handler for when no statement is selected — typically opens a picker. */
  onPickStatement?: () => void;
}

function fmtPeriod(start: number, end: number): string {
  const s = new Date(start);
  const e = new Date(end);
  return `${String(s.getUTCDate()).padStart(2, "0")}/${String(s.getUTCMonth() + 1).padStart(2, "0")}/${s.getUTCFullYear()} – ${String(e.getUTCDate()).padStart(2, "0")}/${String(e.getUTCMonth() + 1).padStart(2, "0")}/${e.getUTCFullYear()}`;
}

function humanError(err: unknown): string {
  if (!(err instanceof Error)) return "Action failed.";
  const m = err.message.match(/Uncaught ConvexError:\s*([\s\S]*?)(?:\r?\n\s*Called by client|$)/);
  return m && m[1] ? m[1].trim() : err.message;
}

export function SplitViewWorkspace({ statementId, onPickStatement }: Props) {
  // --- All hooks declared up-front (pitfall 9) -----------------------------
  const navigate = useNavigate();
  const statement = useBankStatement(statementId);
  const lines = useBankStatementLines(statementId);

  const [selectedLineId, setSelectedLineId] = useState<Id<"bankStatementLines"> | null>(null);
  const [selectedCandidate, setSelectedCandidate] = useState<{
    type: MatchedType;
    id: string;
  } | null>(null);
  const [showUnmatchConfirm, setShowUnmatchConfirm] = useState(false);

  // Plan 04 (Wave 2b) dialog open-state hooks — declared now so the consumer
  // contract is stable when 04 lands.
  const [batchConfirmOpen, setBatchConfirmOpen] = useState(false);
  const [overrideDialogState, setOverrideDialogState] = useState<
    null | { line: Doc<"bankStatementLines">; overrideAccountId: Id<"accounts"> }
  >(null);
  const [inlineExpenseOpen, setInlineExpenseOpen] = useState(false);
  const [inlineRevenueOpen, setInlineRevenueOpen] = useState(false);
  const [inlineReimbursementOpen, setInlineReimbursementOpen] = useState(false);
  const [searchAllOpen, setSearchAllOpen] = useState(false);

  const manualMatch = useManualMatch();
  const unmatch = useUnmatch();
  const confirmLine = useConfirmLine();

  // --- Derived state -------------------------------------------------------
  const selectedLine = useMemo(
    () => (lines && selectedLineId ? lines.find((l) => l._id === selectedLineId) ?? null : null),
    [lines, selectedLineId],
  );

  // Pitfall 2: clear candidate selection whenever the line changes so a stale
  // candidate from a previous line doesn't bleed through.
  useEffect(() => {
    setSelectedCandidate(null);
  }, [selectedLineId]);

  // --- Handlers ------------------------------------------------------------
  async function handleMatch() {
    if (!selectedLine || !selectedCandidate) return;
    try {
      await manualMatch({
        lineId: selectedLine._id,
        matchedType: selectedCandidate.type,
        matchedId: selectedCandidate.id,
      });
      toast.success(`Line matched to ${selectedCandidate.type}`);
      setSelectedCandidate(null);
    } catch (err) {
      toast.error(humanError(err));
    }
  }

  function handleUnmatchClick() {
    if (!selectedLine) return;
    if (selectedLine.status === "confirmed") {
      setShowUnmatchConfirm(true);
    } else {
      void doUnmatch();
    }
  }

  async function doUnmatch() {
    if (!selectedLine) return;
    try {
      const result = await unmatch({ lineId: selectedLine._id });
      if (result && typeof result === "object" && "reversalJournalEntryId" in result) {
        toast.success("Line unmatched — reversal journal entry posted");
      } else {
        toast.info("Line unmatched");
      }
      setShowUnmatchConfirm(false);
    } catch (err) {
      toast.error(humanError(err));
      setShowUnmatchConfirm(false);
    }
  }

  async function handleConfirm() {
    if (!selectedLine) return;
    try {
      await confirmLine({ lineId: selectedLine._id });
      toast.success("Journal entry posted");
    } catch (err) {
      toast.error(humanError(err));
    }
  }

  function handleRouteToAssetRegister() {
    if (!selectedLine) return;
    toast.info("Opening Asset Register…");
    navigate(`/assets?fromBankLine=${selectedLine._id}`);
  }

  // Plan 04 stub callbacks — these flip the dialog-open state hooks.
  function handleBatchConfirm() {
    setBatchConfirmOpen(true);
    // Plan 04 renders <BatchConfirmDialog open={batchConfirmOpen} ... />
    toast.info("Batch confirm dialog wired in Plan 04");
  }
  function handleSearchAll() {
    setSearchAllOpen(true);
    toast.info("Search all records dialog wired in Plan 04");
  }
  function handleInlineCreateExpense() {
    setInlineExpenseOpen(true);
    toast.info("Inline expense dialog wired in Plan 04");
  }
  function handleInlineCreateRevenue() {
    setInlineRevenueOpen(true);
    toast.info("Inline revenue dialog wired in Plan 04");
  }
  function handleInlineCreateReimbursement() {
    setInlineReimbursementOpen(true);
    toast.info("Inline reimbursement dialog wired in Plan 04");
  }

  // Reference Plan 04 hooks so TypeScript doesn't strip them and so they are
  // discoverable by Plan 04. Setter is the contract surface; reader is unused
  // until Plan 04 wires the dialog.
  void overrideDialogState;
  void setOverrideDialogState;
  void batchConfirmOpen;
  void inlineExpenseOpen;
  void inlineRevenueOpen;
  void inlineReimbursementOpen;
  void searchAllOpen;

  // --- Render --------------------------------------------------------------
  if (!statementId) {
    return (
      <Card className="flex min-h-[400px] flex-col items-center justify-center gap-3 p-8 text-center">
        <p className="text-sm text-muted-foreground">
          Select a statement from the Statements tab to start reconciling.
        </p>
        {onPickStatement && (
          <Button onClick={onPickStatement} variant="outline">
            Choose statement
          </Button>
        )}
      </Card>
    );
  }

  if (statement === undefined || lines === undefined) {
    return (
      <Card className="flex min-h-[400px] flex-col items-center justify-center p-8 text-sm text-muted-foreground">
        Loading statement…
      </Card>
    );
  }
  if (statement === null) {
    return (
      <Card className="flex min-h-[400px] flex-col items-center justify-center p-8 text-sm text-muted-foreground">
        Statement not found.
      </Card>
    );
  }

  const periodLabel = fmtPeriod(statement.reportedPeriodStart, statement.reportedPeriodEnd);

  return (
    <div className="flex flex-col gap-4">
      <StatementProgressHeader
        statementId={statementId}
        statementName={statement.fileName}
        periodLabel={periodLabel}
      />

      <div className="grid gap-4 grid-cols-1 md:grid-cols-2 xl:grid-cols-[55fr_45fr]">
        <BankLinesPane
          statementId={statementId}
          selectedLineId={selectedLineId}
          onSelect={setSelectedLineId}
        />
        <CandidatesPane
          lineId={selectedLineId}
          selectedCandidate={selectedCandidate}
          onSelect={setSelectedCandidate}
          onSearchAll={handleSearchAll}
        />
      </div>

      <div className="sticky bottom-0 z-10">
        <ReconciliationActionBar
          selectedLine={selectedLine}
          selectedCandidate={selectedCandidate}
          onMatch={handleMatch}
          onUnmatch={handleUnmatchClick}
          onConfirm={handleConfirm}
          onBatchConfirm={handleBatchConfirm}
          onSearchAll={handleSearchAll}
          onRouteToAssetRegister={handleRouteToAssetRegister}
          onInlineCreateExpense={handleInlineCreateExpense}
          onInlineCreateRevenue={handleInlineCreateRevenue}
          onInlineCreateReimbursement={handleInlineCreateReimbursement}
        />
      </div>

      <AlertDialog open={showUnmatchConfirm} onOpenChange={setShowUnmatchConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Unmatch and reverse this line?</AlertDialogTitle>
            <AlertDialogDescription>
              The original journal entry stays in the ledger. A reversal journal entry will be
              created with swapped DR/CR. The bank line returns to suggested or unmatched.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                void doUnmatch();
              }}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Unmatch and reverse
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
