/**
 * BankReconciliationPage — admin-only wizard for importing BCA bank statements.
 *
 * Wave-minimal per D-25 / D-26:
 *  - Upload → validating → review → importing → complete | error
 *  - NO split-view, NO manual match, NO inline expense create (P73).
 *  - All 17 review columns render read-only (StatementReviewTable).
 *
 * Backend contract: @plan 04 — `createFromParsedStatement` re-validates
 * reconciliation server-side (T-72-19) and dedups on fileHash + period.
 */

import { useState, useMemo } from "react";
import { useQuery } from "convex/react";
import { toast } from "sonner";
import { ArrowLeft, CheckCircle2, AlertTriangle, Loader2 } from "lucide-react";

import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import { useDocumentTitle } from "@/hooks/useDocumentTitle";
import { PageHeader } from "@/components/layout/PageHeader";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { formatCurrency } from "@/lib/utils";
import {
  useBankStatements,
  useBankStatement,
  useBankStatementLines,
  useCreateStatement,
} from "@/hooks/convex/useBankReconciliation";
import { StatementUploadStep } from "@/components/bankReconciliation/StatementUploadStep";
import { StatementReviewTable } from "@/components/bankReconciliation/StatementReviewTable";
import { StatementHistoryList } from "@/components/bankReconciliation/StatementHistoryList";
import type {
  ParsedStatement,
  ReconciliationDiff,
} from "@/lib/bankStatement/types";
// Note: ReconciliationError is thrown by the parser and caught in
// StatementUploadStep; this page only receives the safe { message, diff }
// payload via onError, so we don't import the class here.

// ---------------------------------------------------------------------------
// Wizard state
// ---------------------------------------------------------------------------

type BankWizardState =
  | { step: "upload" }
  | { step: "validating" }
  | { step: "review"; parsed: ParsedStatement; fileHash: string; fileName: string }
  | { step: "importing" }
  | {
      step: "complete";
      statementId: Id<"bankStatements">;
      lineCount: number;
      matchedCount: number;
    }
  | {
      step: "error";
      message: string;
      diff?: ReconciliationDiff;
      parsed?: ParsedStatement;
    };

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function maskAccount(accountNumber: string): string {
  if (accountNumber.length <= 4) return accountNumber;
  return `****${accountNumber.slice(-4)}`;
}

function formatDate(ms: number): string {
  const d = new Date(ms);
  return `${String(d.getUTCDate()).padStart(2, "0")}/${String(d.getUTCMonth() + 1).padStart(2, "0")}/${d.getUTCFullYear()}`;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function BankReconciliationPage() {
  useDocumentTitle("Bank Reconciliation");

  const statements = useBankStatements();
  const createStatement = useCreateStatement();

  const [wizard, setWizard] = useState<BankWizardState>({ step: "upload" });
  const [selectedId, setSelectedId] = useState<Id<"bankStatements"> | null>(null);

  const selectedStatement = useBankStatement(selectedId);
  const selectedLines = useBankStatementLines(selectedId);

  // Load all accounts once for label resolution in imported review.
  const allAccounts = useQuery(api.accounts.queries.list, {});
  const accountsById = useMemo(() => {
    if (!allAccounts) return undefined;
    const map = new Map<string, { _id: Id<"accounts">; name: string; code?: string }>();
    for (const a of allAccounts) {
      map.set(a._id, { _id: a._id, name: a.name, code: a.code });
    }
    return map;
  }, [allAccounts]);

  // -------------------------------------------------------------------------
  // Handlers
  // -------------------------------------------------------------------------

  async function handleConfirmImport(parsed: ParsedStatement, fileHash: string, fileName: string) {
    setWizard({ step: "importing" });
    try {
      const payload = {
        header: {
          fileHash,
          fileName,
          accountNumber: parsed.header.accountNumber,
          accountHolder: parsed.header.accountHolder,
          reportedPeriodStart: parsed.header.reportedPeriodStart,
          reportedPeriodEnd: parsed.header.reportedPeriodEnd,
          currency: parsed.header.currency,
          openingBalance: parsed.header.openingBalance,
          closingBalance: parsed.header.closingBalance,
          reportedDebitTotal: parsed.header.reportedDebitTotal,
          reportedCreditTotal: parsed.header.reportedCreditTotal,
        },
        lines: parsed.lines.map((l) => ({
          rowIndex: l.rowIndex,
          date: l.date,
          rawDescription: l.rawDescription,
          direction: l.direction,
          amountIdr: l.amountIdr,
          runningBalanceIdr: l.runningBalanceIdr ?? undefined,
          parsedCounterparty: l.parsedCounterparty ?? undefined,
        })),
      };
      const result = await createStatement(payload);
      // Convex mutation returns { statementId, lineCount, matchedCount } per plan 04
      setWizard({
        step: "complete",
        statementId: result.statementId,
        lineCount: result.lineCount,
        matchedCount: result.matchedCount,
      });
      toast.success(
        `Imported ${result.lineCount} lines (${result.matchedCount} matched).`,
      );
      // auto-select the newly imported statement for easy review
      setSelectedId(result.statementId);
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Failed to import bank statement.";
      setWizard({ step: "error", message, parsed });
      toast.error(message);
    }
  }

  function reset() {
    setWizard({ step: "upload" });
  }

  // -------------------------------------------------------------------------
  // Render
  // -------------------------------------------------------------------------

  return (
    <div className="space-y-6">
      <PageHeader
        title="Bank Reconciliation"
        description="Import BCA bank statements, classify transactions, and review auto-matches. Posting journal entries is handled in a separate workflow."
      />

      {/* Wizard */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            {wizard.step === "upload" && "Step 1 — Upload Statement"}
            {wizard.step === "validating" && "Validating…"}
            {wizard.step === "review" && "Step 2 — Review Before Import"}
            {wizard.step === "importing" && "Importing…"}
            {wizard.step === "complete" && "Import Complete"}
            {wizard.step === "error" && "Import Failed"}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {wizard.step === "upload" && (
            <StatementUploadStep
              onParsed={({ parsed, fileHash, fileName }) =>
                setWizard({ step: "review", parsed, fileHash, fileName })
              }
              onError={(message, diff) => setWizard({ step: "error", message, diff })}
            />
          )}

          {wizard.step === "validating" && (
            <div className="flex items-center gap-2 py-8 text-muted-foreground">
              <Loader2 className="h-5 w-5 animate-spin" />
              Validating file…
            </div>
          )}

          {wizard.step === "review" && (
            <ReviewSection
              parsed={wizard.parsed}
              onConfirm={() =>
                handleConfirmImport(wizard.parsed, wizard.fileHash, wizard.fileName)
              }
              onCancel={reset}
            />
          )}

          {wizard.step === "importing" && (
            <div className="flex items-center gap-2 py-8 text-muted-foreground">
              <Loader2 className="h-5 w-5 animate-spin" />
              Importing and auto-matching transactions…
            </div>
          )}

          {wizard.step === "complete" && (
            <div className="flex flex-col gap-4 py-4">
              <Alert>
                <CheckCircle2 className="h-4 w-4" />
                <AlertTitle>Imported successfully.</AlertTitle>
                <AlertDescription>
                  {wizard.lineCount} transaction{wizard.lineCount === 1 ? "" : "s"} imported,{" "}
                  {wizard.matchedCount} auto-matched. See the full review in the history
                  table below.
                </AlertDescription>
              </Alert>
              <div>
                <Button onClick={reset}>Upload Another Statement</Button>
              </div>
            </div>
          )}

          {wizard.step === "error" && (
            <div className="flex flex-col gap-4 py-4">
              <Alert variant="destructive">
                <AlertTriangle className="h-4 w-4" />
                <AlertTitle>Could not import statement.</AlertTitle>
                <AlertDescription className="whitespace-pre-wrap">
                  {wizard.message}
                </AlertDescription>
              </Alert>
              {wizard.diff && (
                <Card>
                  <CardHeader>
                    <CardTitle className="text-sm">Reconciliation diagnostic</CardTitle>
                  </CardHeader>
                  <CardContent className="text-xs space-y-1 tabular-nums">
                    <div>Debit diff: {formatCurrency(wizard.diff.debitDiff)}</div>
                    <div>Credit diff: {formatCurrency(wizard.diff.creditDiff)}</div>
                    <div>Balance diff: {formatCurrency(wizard.diff.balanceDiff)}</div>
                  </CardContent>
                </Card>
              )}
              <div>
                <Button variant="outline" onClick={reset}>
                  <ArrowLeft className="mr-2 h-4 w-4" />
                  Start Over
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* History list */}
      <StatementHistoryList
        statements={statements}
        selectedId={selectedId}
        onSelect={setSelectedId}
      />

      {/* Selected statement (post-import read-only review) */}
      {selectedId && selectedStatement !== undefined && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">
              {selectedStatement ? (
                <>
                  Review · {selectedStatement.fileName}
                  <span className="ml-2 text-xs font-normal text-muted-foreground">
                    {maskAccount(selectedStatement.accountNumber)} · {formatDate(selectedStatement.reportedPeriodStart)} – {formatDate(selectedStatement.reportedPeriodEnd)}
                  </span>
                </>
              ) : (
                "Statement not found"
              )}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {selectedLines === undefined ? (
              <p className="text-sm text-muted-foreground">Loading transactions…</p>
            ) : selectedLines.length === 0 ? (
              <p className="text-sm text-muted-foreground">No transactions.</p>
            ) : (
              <StatementReviewTable
                mode="imported"
                lines={selectedLines}
                accountsById={accountsById}
              />
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Review section (pre-import)
// ---------------------------------------------------------------------------

function ReviewSection({
  parsed,
  onConfirm,
  onCancel,
}: {
  parsed: ParsedStatement;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const { header, lines } = parsed;
  const debitCount = lines.filter((l) => l.direction === "debit").length;
  const creditCount = lines.filter((l) => l.direction === "credit").length;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
        <div>
          <div className="text-xs text-muted-foreground">Account</div>
          <div className="font-mono font-medium">{maskAccount(header.accountNumber)}</div>
          <div className="text-xs text-muted-foreground">{header.accountHolder}</div>
        </div>
        <div>
          <div className="text-xs text-muted-foreground">Period</div>
          <div className="font-medium">
            {formatDate(header.reportedPeriodStart)} – {formatDate(header.reportedPeriodEnd)}
          </div>
        </div>
        <div>
          <div className="text-xs text-muted-foreground">Opening / Closing</div>
          <div className="text-xs tabular-nums">
            {formatCurrency(header.openingBalance)} → {formatCurrency(header.closingBalance)}
          </div>
        </div>
        <div>
          <div className="text-xs text-muted-foreground">Totals (D / C)</div>
          <div className="text-xs tabular-nums">
            {formatCurrency(header.reportedDebitTotal)} / {formatCurrency(header.reportedCreditTotal)}
          </div>
        </div>
      </div>

      <Alert>
        <CheckCircle2 className="h-4 w-4" />
        <AlertTitle>Reconciled — ready to import</AlertTitle>
        <AlertDescription>
          {lines.length} transaction{lines.length === 1 ? "" : "s"} ({debitCount} debit,{" "}
          {creditCount} credit). Totals match the header footer. Classification and match
          candidates are computed server-side on import.
        </AlertDescription>
      </Alert>

      <StatementReviewTable mode="preview" parsed={parsed} />

      <div className="flex items-center justify-end gap-2">
        <Button variant="outline" onClick={onCancel}>
          Cancel
        </Button>
        <Button onClick={onConfirm}>Confirm Import</Button>
      </div>
    </div>
  );
}

export default BankReconciliationPage;
