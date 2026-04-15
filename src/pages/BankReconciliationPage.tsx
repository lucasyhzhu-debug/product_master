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
import { useSearchParams } from "react-router-dom";
import { toast } from "sonner";
import { ArrowLeft, CheckCircle2, AlertTriangle, Loader2 } from "lucide-react";

import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import { useAuth } from "@/contexts/AuthContext";
import { useDocumentTitle } from "@/hooks/useDocumentTitle";
import { PageHeader } from "@/components/layout/PageHeader";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { formatCurrency } from "@/lib/utils";
import {
  useBankStatements,
  useBankStatement,
  useBankStatementByFileHash,
  useBankStatementLines,
  useCreateStatement,
} from "@/hooks/convex/useBankReconciliation";
import { StatementUploadStep } from "@/components/bankReconciliation/StatementUploadStep";
import { StatementReviewTable } from "@/components/bankReconciliation/StatementReviewTable";
import { StatementHistoryList } from "@/components/bankReconciliation/StatementHistoryList";
import { BankReconciliationTabs } from "@/components/bankReconciliation/BankReconciliationTabs";
import { SplitViewWorkspace } from "@/components/bankReconciliation/SplitViewWorkspace";
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

/**
 * Convex wraps thrown `ConvexError(msg)` into an Error whose message is
 * `"[CONVEX M(path)] [Request ID: ...] Server Error\nUncaught ConvexError: <msg>\nCalled by client"`.
 * Extract only the user-facing `<msg>` portion so error cards don't leak
 * request IDs and handler paths to the user.
 */
function humanizeError(err: unknown): string {
  if (!(err instanceof Error)) return "Failed to import bank statement.";
  const match = err.message.match(/Uncaught ConvexError:\s*([\s\S]*?)(?:\r?\n\s*Called by client|$)/);
  if (match && match[1]) return match[1].trim();
  return err.message;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function BankReconciliationPage() {
  useDocumentTitle("Bank Reconciliation");

  const statements = useBankStatements();
  const createStatement = useCreateStatement();
  const [searchParams, setSearchParams] = useSearchParams();

  const [wizard, setWizard] = useState<BankWizardState>({ step: "upload" });

  // Selected statement is URL-driven so deep links into the Review tab work
  // (D-15). selectedId is also synced to ?statementId when the user clicks
  // a row in the history list.
  const urlStatementId = searchParams.get("statementId") as Id<"bankStatements"> | null;
  const [selectedId, setSelectedIdState] = useState<Id<"bankStatements"> | null>(urlStatementId);

  function setSelectedId(id: Id<"bankStatements"> | null) {
    setSelectedIdState(id);
    setSearchParams(
      (prev) => {
        const np = new URLSearchParams(prev);
        if (id) np.set("statementId", id);
        else np.delete("statementId");
        return np;
      },
      { replace: true },
    );
  }

  const selectedStatement = useBankStatement(selectedId);
  const selectedLines = useBankStatementLines(selectedId);

  // Early dedup probe: when a file lands in the review step, check its hash
  // against past uploads BEFORE the user has to read the preview + click
  // Confirm just to be told it was already imported.
  const reviewHash = wizard.step === "review" ? wizard.fileHash : null;
  const existingDupe = useBankStatementByFileHash(reviewHash);

  // Load all accounts once for label resolution in imported review.
  // Guard with auth — matches the pattern used by every other hook in this file.
  const { user } = useAuth();
  const allAccounts = useQuery(api.accounts.queries.list, user?.token ? {} : "skip");
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
      const message = humanizeError(err);
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

  const statementsTabContent = (
    <div className="space-y-6">
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
              duplicate={existingDupe ?? null}
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
            <ErrorSection
              message={wizard.message}
              diff={wizard.diff}
              onReset={reset}
            />
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

  const reviewTabContent = (
    <SplitViewWorkspace
      statementId={selectedId}
      onPickStatement={() => {
        setSearchParams(
          (prev) => {
            const np = new URLSearchParams(prev);
            np.set("tab", "statements");
            return np;
          },
          { replace: true },
        );
      }}
    />
  );

  // Plan 05 owns the Revenue Gap tab. Stub placeholder until then.
  const revenueGapTabContent = (
    <Card className="p-8 text-center text-sm text-muted-foreground">
      Revenue Gap dashboard ships in Plan 05.
    </Card>
  );

  return (
    <div className="space-y-6">
      <PageHeader
        title="Bank Reconciliation"
        description="Import BCA bank statements, classify transactions, and review auto-matches. Posting journal entries is handled in a separate workflow."
      />
      <BankReconciliationTabs
        statements={statementsTabContent}
        review={reviewTabContent}
        revenueGap={revenueGapTabContent}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Error section
// ---------------------------------------------------------------------------

/**
 * Classify the error so we can render a tailored headline + guidance block
 * rather than a single wall of red text. Reconciliation failures carry a
 * `diff`; duplicate / validation / auth errors do not.
 */
function classifyError(message: string, diff?: ReconciliationDiff): {
  kind: "reconciliation" | "duplicate" | "validation" | "generic";
  title: string;
  detail: string;
} {
  if (diff || /reconciliation/i.test(message)) {
    return {
      kind: "reconciliation",
      title: "Numbers don't add up",
      detail:
        "The sum of the transaction rows doesn't match the totals printed in the statement footer. This usually means the file was edited, truncated, or exported mid-page. Re-download the original file from the BCA portal and try again.",
    };
  }
  if (/already imported/i.test(message)) {
    return {
      kind: "duplicate",
      title: "Already imported",
      detail: message,
    };
  }
  if (/invalid|must be|required/i.test(message)) {
    return {
      kind: "validation",
      title: "File is invalid",
      detail: message,
    };
  }
  return {
    kind: "generic",
    title: "Could not import statement",
    detail: message,
  };
}

function DiffRow({
  label,
  amount,
  hint,
}: {
  label: string;
  amount: number;
  hint: string;
}) {
  const zero = amount === 0;
  return (
    <div className="flex items-start justify-between gap-4 py-1.5">
      <div className="space-y-0.5">
        <div className="text-xs font-medium">{label}</div>
        <div className="text-xs text-muted-foreground">{hint}</div>
      </div>
      <div
        className={`text-sm font-mono tabular-nums whitespace-nowrap ${
          zero ? "text-muted-foreground" : "text-destructive font-semibold"
        }`}
      >
        {zero ? "matches" : formatCurrency(amount)}
      </div>
    </div>
  );
}

function ErrorSection({
  message,
  diff,
  onReset,
}: {
  message: string;
  diff?: ReconciliationDiff;
  onReset: () => void;
}) {
  const { kind, title, detail } = classifyError(message, diff);

  return (
    <div className="flex flex-col gap-4 py-2">
      <Alert variant="destructive">
        <AlertTriangle className="h-4 w-4" />
        <AlertTitle>{title}</AlertTitle>
        <AlertDescription>{detail}</AlertDescription>
      </Alert>

      {kind === "reconciliation" && diff && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Where the mismatch is</CardTitle>
          </CardHeader>
          <CardContent className="divide-y divide-border/50">
            <DiffRow
              label="Debit column"
              amount={diff.debitDiff}
              hint="Sum of debit rows vs. Mutasi Debet footer"
            />
            <DiffRow
              label="Credit column"
              amount={diff.creditDiff}
              hint="Sum of credit rows vs. Mutasi Kredit footer"
            />
            <DiffRow
              label="Opening → closing balance"
              amount={diff.balanceDiff}
              hint="Opening + credits − debits vs. Saldo Akhir"
            />
          </CardContent>
        </Card>
      )}

      <div>
        <Button variant="outline" onClick={onReset}>
          <ArrowLeft className="mr-2 h-4 w-4" />
          Start Over
        </Button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Review section (pre-import)
// ---------------------------------------------------------------------------

function ReviewSection({
  parsed,
  duplicate,
  onConfirm,
  onCancel,
}: {
  parsed: ParsedStatement;
  duplicate: { _id: Id<"bankStatements">; createdAt: number } | null;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const { header, lines } = parsed;
  const debitCount = lines.filter((l) => l.direction === "debit").length;
  const creditCount = lines.filter((l) => l.direction === "credit").length;
  const isDuplicate = duplicate !== null;

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

      {isDuplicate ? (
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>Already imported</AlertTitle>
          <AlertDescription>
            This file was imported on {formatDate(duplicate.createdAt)}. Re-importing the same
            statement isn't allowed — it would create duplicate line-level matches. Cancel and
            upload a different period, or open Statement History below to review the existing
            import.
          </AlertDescription>
        </Alert>
      ) : (
        <Alert>
          <CheckCircle2 className="h-4 w-4" />
          <AlertTitle>Reconciled — ready to import</AlertTitle>
          <AlertDescription>
            {lines.length} transaction{lines.length === 1 ? "" : "s"} ({debitCount} debit,{" "}
            {creditCount} credit). Totals match the header footer. Classification and match
            candidates are computed server-side on import.
          </AlertDescription>
        </Alert>
      )}

      <StatementReviewTable mode="preview" parsed={parsed} />

      <div className="flex items-center justify-end gap-2">
        <Button variant="outline" onClick={onCancel}>
          Cancel
        </Button>
        <Button onClick={onConfirm} disabled={isDuplicate}>
          Confirm Import
        </Button>
      </div>
    </div>
  );
}

export default BankReconciliationPage;
