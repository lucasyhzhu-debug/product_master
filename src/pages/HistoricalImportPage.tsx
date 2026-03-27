/**
 * HistoricalImportPage - Admin-only CSV import wizard for bulk expenses & assets.
 *
 * Linear wizard with 5 states: upload -> validating -> review -> importing -> complete
 * Plus error state for batch failure with retry-from-failure support.
 *
 * Supports two row types:
 * - Expense rows: creates DR expense account, CR Cash journal entries
 * - Asset rows: creates fixedAssets record + DR asset account, CR Cash acquisition JE
 */

import { useState, useRef, useCallback } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "convex/react";
import { toast } from "sonner";
import { Upload, Download, FileText, CheckCircle2, AlertTriangle, XCircle, ArrowLeft } from "lucide-react";

import { api } from "../../convex/_generated/api";
import { useDocumentTitle } from "@/hooks/useDocumentTitle";
import { PageHeader } from "@/components/layout/PageHeader";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { formatCurrency, cn } from "@/lib/utils";
import { useBulkCreateJournalEntries } from "@/hooks/convex/useJournalImport";
import {
  parseAndValidateCsv,
  type CsvParseResult,
  type ImportRow,
  type AccountRef,
} from "@/lib/csvImportValidation";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const MAX_BATCH_SIZE = 50;

const TEMPLATE_HEADERS = "date,amount,description,vendorName,accountCode,paymentMethod,submitterName,receiptUrl,assetCategory,assetName";
const TEMPLATE_EXAMPLE =
  "2025-01-15,250000,Office supplies for January,Toko ABC,6200,company_paid,Irfan,,,,\n" +
  "2025-02-01,150000,Internet bill February,Telkom,6300,company_paid,Irfan,,,,\n" +
  "2025-03-01,5000000,Oven for kitchen,Toko Mesin,1500,company_paid,Irfan,,mesin_produksi,Kitchen Oven\n" +
  "2025-03-15,2000000,Frollie brand registration,DJKI,1700,company_paid,Irfan,,merek_dagang,Frollie Trademark";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type WizardState =
  | { step: "upload" }
  | { step: "validating" }
  | { step: "review"; result: CsvParseResult }
  | { step: "importing"; total: number; completed: number; batchIndex: number; batches: ImportRow[][] }
  | { step: "complete"; totalCreated: number; totalAmount: number }
  | { step: "error"; message: string; completedSoFar: number; failedBatchIndex: number; batches: ImportRow[][] };

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Escape a value for CSV output (wrap in quotes if needed) */
function escapeCsv(value: string): string {
  if (value.includes(",") || value.includes('"') || value.includes("\n")) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

/** Trigger a file download from a Blob */
function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/** Chunk an array into batches of a given size */
function chunkArray<T>(arr: T[], size: number): T[][] {
  const result: T[][] = [];
  for (let i = 0; i < arr.length; i += size) {
    result.push(arr.slice(i, i + size));
  }
  return result;
}

/** Group rows by account code and compute count + subtotal */
function groupByAccount(rows: ImportRow[], accounts: AccountRef[]) {
  const accountMap = new Map(accounts.map((a) => [a.code, a.name]));
  const groups = new Map<string, { code: string; name: string; count: number; subtotal: number }>();

  for (const row of rows) {
    const existing = groups.get(row.accountCode);
    if (existing) {
      existing.count++;
      existing.subtotal += row.amount;
    } else {
      groups.set(row.accountCode, {
        code: row.accountCode,
        name: accountMap.get(row.accountCode) || "Unknown",
        count: 1,
        subtotal: row.amount,
      });
    }
  }

  return Array.from(groups.values()).sort((a, b) => a.code.localeCompare(b.code));
}

/** Group rows by period (YYYY-MM) and compute count + subtotal */
function groupByPeriod(rows: ImportRow[]) {
  const groups = new Map<string, { period: string; count: number; subtotal: number }>();

  for (const row of rows) {
    // row.date is WIB midnight as UTC epoch ms; add 7h to get WIB date
    const wibDate = new Date(row.date + 7 * 60 * 60 * 1000);
    const period = `${wibDate.getUTCFullYear()}-${String(wibDate.getUTCMonth() + 1).padStart(2, "0")}`;

    const existing = groups.get(period);
    if (existing) {
      existing.count++;
      existing.subtotal += row.amount;
    } else {
      groups.set(period, { period, count: 1, subtotal: row.amount });
    }
  }

  return Array.from(groups.values()).sort((a, b) => a.period.localeCompare(b.period));
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function HistoricalImportPage() {
  useDocumentTitle("Bulk Expense & Asset Import");

  const accounts = useQuery(api.accounts.queries.list, { activeOnly: true });
  const allAccounts = useQuery(api.accounts.queries.list, {});
  const bulkCreate = useBulkCreateJournalEntries();

  const [state, setState] = useState<WizardState>({ step: "upload" });
  const [importBatchId, setImportBatchId] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // -------------------------------------------------------------------------
  // Template download
  // -------------------------------------------------------------------------

  const handleDownloadTemplate = useCallback(() => {
    const content = TEMPLATE_HEADERS + "\n" + TEMPLATE_EXAMPLE;
    const blob = new Blob([content], { type: "text/csv;charset=utf-8;" });
    downloadBlob(blob, "import-template.csv");
  }, []);

  // -------------------------------------------------------------------------
  // CoA reference download
  // -------------------------------------------------------------------------

  const handleDownloadCoaReference = useCallback(() => {
    if (!allAccounts) return;

    const header = "code,name,type,category,isActive";
    const rows = allAccounts.map((a) =>
      [escapeCsv(a.code), escapeCsv(a.name), escapeCsv(a.type), escapeCsv(a.category), a.isActive ? "true" : "false"].join(",")
    );
    const content = [header, ...rows].join("\n");
    const blob = new Blob([content], { type: "text/csv;charset=utf-8;" });
    downloadBlob(blob, "chart-of-accounts-reference.csv");
  }, [allAccounts]);

  // -------------------------------------------------------------------------
  // File upload + validation
  // -------------------------------------------------------------------------

  const handleFileChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;

      if (!allAccounts) {
        toast.error("Accounts list not loaded yet. Please wait and try again.");
        return;
      }

      setState({ step: "validating" });

      const reader = new FileReader();
      reader.onload = (event) => {
        const csvText = event.target?.result as string;
        const accountRefs: AccountRef[] = allAccounts.map((a) => ({
          code: a.code,
          name: a.name,
          type: a.type,
          isActive: a.isActive,
        }));

        const result = parseAndValidateCsv(csvText, accountRefs);
        setState({ step: "review", result });
      };
      reader.onerror = () => {
        toast.error("Failed to read file");
        setState({ step: "upload" });
      };
      reader.readAsText(file);

      // Reset input so same file can be re-selected
      e.target.value = "";
    },
    [allAccounts]
  );

  // -------------------------------------------------------------------------
  // Import execution (sequential batching)
  // -------------------------------------------------------------------------

  const handleConfirmImport = useCallback(
    async (validRows: ImportRow[], startFromBatch = 0) => {
      const batches = chunkArray(validRows, MAX_BATCH_SIZE);
      // Generate batch ID once on first call; reuse on retry
      const batchId = importBatchId ?? crypto.randomUUID();
      if (!importBatchId) {
        setImportBatchId(batchId);
      }
      let completed = startFromBatch * MAX_BATCH_SIZE;

      setState({
        step: "importing",
        total: validRows.length,
        completed,
        batchIndex: startFromBatch,
        batches,
      });

      for (let i = startFromBatch; i < batches.length; i++) {
        try {
          await bulkCreate.mutateAsync({
            importBatchId: batchId,
            rows: batches[i],
          });
          completed += batches[i].length;
          setState({
            step: "importing",
            total: validRows.length,
            completed,
            batchIndex: i + 1,
            batches,
          });
        } catch (error) {
          const message =
            error instanceof Error ? error.message : "Unknown error during import";
          setState({
            step: "error",
            message,
            completedSoFar: completed,
            failedBatchIndex: i,
            batches,
          });
          return;
        }
      }

      // Calculate total amount
      const totalAmount = validRows.reduce((sum, r) => sum + r.amount, 0);
      setState({
        step: "complete",
        totalCreated: validRows.length,
        totalAmount,
      });
    },
    [bulkCreate, importBatchId]
  );

  // -------------------------------------------------------------------------
  // Render
  // -------------------------------------------------------------------------

  if (accounts === undefined || allAccounts === undefined) {
    return (
      <div className="flex items-center justify-center h-64">
        <p className="text-muted-foreground">Loading accounts...</p>
      </div>
    );
  }

  return (
    <div>
      <PageHeader
        title="Bulk Expense & Asset Import"
        description="Bulk-import expenses and asset purchases from CSV — creates journal entries and fixed asset records"
        backTo="/accounts"
        backLabel="Chart of Accounts"
      />

      {/* Upload State */}
      {state.step === "upload" && (
        <div className="space-y-6">
          {/* Downloads */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Step 1: Prepare your CSV</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-sm text-muted-foreground">
                Download the template and fill in your expense/asset data. Expense rows create
                journal entries (DR expense, CR Cash). Asset rows (account 1500/1700) also create
                a fixed asset record with auto-calculated depreciation.
              </p>
              <div className="flex flex-wrap gap-3">
                <Button variant="outline" onClick={handleDownloadTemplate}>
                  <Download className="h-4 w-4 mr-2" />
                  Download Template
                </Button>
                <Button variant="outline" onClick={handleDownloadCoaReference}>
                  <FileText className="h-4 w-4 mr-2" />
                  Download CoA Reference
                </Button>
              </div>
              <div className="text-xs text-muted-foreground space-y-1">
                <p><strong>Required columns:</strong> date (YYYY-MM-DD), amount (positive integer IDR), description, accountCode, paymentMethod (employee_paid / company_paid / payment_request), submitterName</p>
                <p><strong>Optional columns:</strong> vendorName, receiptUrl</p>
                <p><strong>Asset rows only:</strong> assetCategory (e.g., peralatan_kantor, merek_dagang), assetName — required when accountCode is an asset account (1500 or 1700)</p>
              </div>
            </CardContent>
          </Card>

          {/* Upload */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Step 2: Upload CSV</CardTitle>
            </CardHeader>
            <CardContent>
              <div
                className={cn(
                  "border-2 border-dashed rounded-lg p-8 text-center cursor-pointer",
                  "hover:border-primary/50 hover:bg-muted/50 transition-colors"
                )}
                onClick={() => fileInputRef.current?.click()}
              >
                <Upload className="h-10 w-10 mx-auto mb-3 text-muted-foreground" />
                <p className="text-sm font-medium">Click to select a CSV file</p>
                <p className="text-xs text-muted-foreground mt-1">
                  Accepts .csv files
                </p>
              </div>
              <input
                ref={fileInputRef}
                type="file"
                accept=".csv"
                className="hidden"
                onChange={handleFileChange}
              />
            </CardContent>
          </Card>
        </div>
      )}

      {/* Validating State */}
      {state.step === "validating" && (
        <Card>
          <CardContent className="py-12 text-center">
            <p className="text-muted-foreground">Validating CSV data...</p>
          </CardContent>
        </Card>
      )}

      {/* Review State */}
      {state.step === "review" && (
        <ReviewStep
          result={state.result}
          accounts={allAccounts.map((a) => ({ code: a.code, name: a.name, type: a.type, isActive: a.isActive }))}
          onConfirm={() => handleConfirmImport(state.result.validRows)}
          onReupload={() => setState({ step: "upload" })}
        />
      )}

      {/* Importing State */}
      {state.step === "importing" && (
        <Card>
          <CardContent className="py-12 space-y-6">
            <div className="text-center space-y-2">
              <p className="text-lg font-medium">Creating journal entries...</p>
              <p className="text-sm text-muted-foreground">
                {state.completed}/{state.total} (batch {state.batchIndex} of{" "}
                {state.batches.length})
              </p>
            </div>
            <Progress
              value={state.total > 0 ? (state.completed / state.total) * 100 : 0}
              className="h-3"
            />
            <p className="text-xs text-center text-muted-foreground">
              Do not close this page during import
            </p>
          </CardContent>
        </Card>
      )}

      {/* Complete State */}
      {state.step === "complete" && (
        <Card>
          <CardContent className="py-12 text-center space-y-4">
            <CheckCircle2 className="h-12 w-12 mx-auto text-green-500" />
            <div>
              <p className="text-lg font-medium">
                {state.totalCreated} journal entries created successfully
              </p>
              <p className="text-sm text-muted-foreground mt-1">
                Total amount imported: {formatCurrency(state.totalAmount)}
              </p>
            </div>
            <div className="flex justify-center gap-3">
              <Button asChild>
                <Link to="/financials">View in P&L</Link>
              </Button>
              <Button variant="outline" onClick={() => { setImportBatchId(null); setState({ step: "upload" }); }}>
                Import More
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Error State */}
      {state.step === "error" && (
        <Card>
          <CardContent className="py-12 text-center space-y-4">
            <XCircle className="h-12 w-12 mx-auto text-red-500" />
            <div>
              <p className="text-lg font-medium">Import failed</p>
              <p className="text-sm text-red-600 mt-1">{state.message}</p>
              {state.completedSoFar > 0 && (
                <p className="text-sm text-muted-foreground mt-2">
                  {state.completedSoFar} entries were already created before the error
                </p>
              )}
            </div>
            <div className="flex justify-center gap-3">
              <Button
                onClick={() => {
                  const allRows = state.batches.flat();
                  handleConfirmImport(allRows, state.failedBatchIndex);
                }}
              >
                Retry from failed batch
              </Button>
              <Button variant="outline" onClick={() => { setImportBatchId(null); setState({ step: "upload" }); }}>
                <ArrowLeft className="h-4 w-4 mr-2" />
                Start Over
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Review Sub-component
// ---------------------------------------------------------------------------

function ReviewStep({
  result,
  accounts,
  onConfirm,
  onReupload,
}: {
  result: CsvParseResult;
  accounts: AccountRef[];
  onConfirm: () => void;
  onReupload: () => void;
}) {
  const hasErrors = result.errors.length > 0;
  const totalAmount = result.validRows.reduce((sum, r) => sum + r.amount, 0);
  const accountGroups = groupByAccount(result.validRows, accounts);
  const periodGroups = groupByPeriod(result.validRows);

  // Compute asset vs expense breakdown
  const accountTypeMap = new Map(accounts.map((a) => [a.code, a.type]));
  const assetRows = result.validRows.filter((r) => accountTypeMap.get(r.accountCode) === "asset");
  const expenseRows = result.validRows.filter((r) => accountTypeMap.get(r.accountCode) !== "asset");
  const assetTotal = assetRows.reduce((sum, r) => sum + r.amount, 0);
  const expenseTotal = expenseRows.reduce((sum, r) => sum + r.amount, 0);

  return (
    <div className="space-y-6">
      {/* Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card>
          <CardContent className="pt-6">
            <div className="text-center">
              <p className="text-2xl font-bold text-green-600">{result.validRows.length}</p>
              <p className="text-sm text-muted-foreground">Valid Rows</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="text-center">
              <p className={cn("text-2xl font-bold", hasErrors ? "text-red-600" : "text-muted-foreground")}>
                {result.errors.length}
              </p>
              <p className="text-sm text-muted-foreground">Errors</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="text-center">
              <p className="text-2xl font-bold">{formatCurrency(totalAmount)}</p>
              <p className="text-sm text-muted-foreground">Total Amount</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Asset vs Expense Breakdown */}
      {(assetRows.length > 0 || expenseRows.length > 0) && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Card>
            <CardContent className="pt-6">
              <div className="text-center">
                <p className="text-xl font-bold">{expenseRows.length}</p>
                <p className="text-sm text-muted-foreground">Expense Entries</p>
                <p className="text-xs text-muted-foreground mt-1">{formatCurrency(expenseTotal)}</p>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="text-center">
                <p className="text-xl font-bold text-blue-600">{assetRows.length}</p>
                <p className="text-sm text-muted-foreground">Asset Entries (CapEx)</p>
                <p className="text-xs text-muted-foreground mt-1">{formatCurrency(assetTotal)}</p>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Errors */}
      {hasErrors && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2 text-red-600">
              <XCircle className="h-5 w-5" />
              Validation Errors ({result.errors.length})
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="max-h-64 overflow-y-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b">
                    <th className="text-left py-2 pr-4 font-medium w-20">Row</th>
                    <th className="text-left py-2 font-medium">Error</th>
                  </tr>
                </thead>
                <tbody>
                  {result.errors.map((e, i) => (
                    <tr key={i} className="border-b last:border-0">
                      <td className="py-2 pr-4 text-muted-foreground">{e.row}</td>
                      <td className="py-2 text-red-600">{e.error}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Warnings */}
      {result.warnings.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2 text-amber-600">
              <AlertTriangle className="h-5 w-5" />
              Warnings ({result.warnings.length})
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="space-y-1 text-sm text-amber-700">
              {result.warnings.map((w, i) => (
                <li key={i}>{w}</li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

      {/* Summary by GL Account */}
      {accountGroups.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">By GL Account</CardTitle>
          </CardHeader>
          <CardContent>
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b">
                  <th className="text-left py-2 pr-4 font-medium">Code</th>
                  <th className="text-left py-2 pr-4 font-medium">Name</th>
                  <th className="text-right py-2 pr-4 font-medium">Entries</th>
                  <th className="text-right py-2 font-medium">Subtotal</th>
                </tr>
              </thead>
              <tbody>
                {accountGroups.map((g) => (
                  <tr key={g.code} className="border-b last:border-0">
                    <td className="py-2 pr-4">
                      <Badge variant="outline">{g.code}</Badge>
                    </td>
                    <td className="py-2 pr-4">{g.name}</td>
                    <td className="py-2 pr-4 text-right">{g.count}</td>
                    <td className="py-2 text-right">{formatCurrency(g.subtotal)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>
      )}

      {/* Summary by Period */}
      {periodGroups.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">By Period</CardTitle>
          </CardHeader>
          <CardContent>
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b">
                  <th className="text-left py-2 pr-4 font-medium">Month</th>
                  <th className="text-right py-2 pr-4 font-medium">Entries</th>
                  <th className="text-right py-2 font-medium">Subtotal</th>
                </tr>
              </thead>
              <tbody>
                {periodGroups.map((g) => (
                  <tr key={g.period} className="border-b last:border-0">
                    <td className="py-2 pr-4">{g.period}</td>
                    <td className="py-2 pr-4 text-right">{g.count}</td>
                    <td className="py-2 text-right">{formatCurrency(g.subtotal)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>
      )}

      {/* Actions */}
      <div className="flex justify-end gap-3">
        <Button variant="outline" onClick={onReupload}>
          <ArrowLeft className="h-4 w-4 mr-2" />
          Re-upload
        </Button>
        <Button onClick={onConfirm} disabled={hasErrors || result.validRows.length === 0}>
          {hasErrors
            ? `Fix ${result.errors.length} error${result.errors.length === 1 ? "" : "s"} to continue`
            : `Confirm Import (${result.validRows.length} entries)`}
        </Button>
      </div>
    </div>
  );
}
