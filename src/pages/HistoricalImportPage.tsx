/**
 * BulkImportPage (export name: HistoricalImportPage for route compat).
 *
 * Airtable-style CSV import wizard: upload -> validating -> review (editable) -> importing -> complete.
 * Plus error state with retry-from-failure support.
 *
 * Review step is the star: editable preview table with click-to-edit cells,
 * SearchableSelect for category/owner, validation coloring, batch trust mode.
 */

import { useState, useRef, useCallback, useMemo } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "convex/react";
import { toast } from "sonner";
import {
  Upload,
  Download,
  FileText,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  ArrowLeft,
  ArrowRight,
  Info,
} from "lucide-react";

import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import { useDocumentTitle } from "@/hooks/useDocumentTitle";
import { useAuth } from "@/contexts/AuthContext";
import { PageHeader } from "@/components/layout/PageHeader";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Switch } from "@/components/ui/switch";
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from "@/components/ui/table";
import {
  Tooltip,
  TooltipTrigger,
  TooltipContent,
} from "@/components/ui/tooltip";
import { formatCurrency, cn } from "@/lib/utils";
import { EditableCell } from "@/components/import/EditableCell";
import {
  useBulkCreateJournalEntries,
  useBulkCreateExpenses,
} from "@/hooks/convex/useJournalImport";
import {
  parseAndValidateBulkExpenseCsv,
  type BulkExpenseRow,
  type BulkExpenseParseResult,
  type AccountRef,
  type UserRef,
  type PaymentMethod,
  VALID_PAYMENT_METHODS,
  BULK_EXPENSE_TEMPLATE_HEADERS,
  BULK_EXPENSE_TEMPLATE_EXAMPLE,
} from "@/lib/csvImportValidation";
import { strictWibDateStrToUtcMs } from "@/lib/dateUtils";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const MAX_BATCH_SIZE = 50;

const PAYMENT_METHOD_OPTIONS = [
  { value: "employee_paid", label: "Employee Paid" },
  { value: "company_paid", label: "Company Paid" },
  { value: "payment_request", label: "Payment Request" },
];

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type WizardState =
  | { step: "upload" }
  | { step: "validating" }
  | { step: "review"; result: BulkExpenseParseResult }
  | { step: "importing"; total: number; completed: number; batchIndex: number; batches: BulkExpenseRow[][] }
  | { step: "complete"; totalCreated: number; totalAmount: number; autoApproved: number; submitted: number }
  | { step: "error"; message: string; completedSoFar: number; failedBatchIndex: number; batches: BulkExpenseRow[][] };

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

/** Get validation state for a row */
function getRowValidation(row: BulkExpenseRow): "valid" | "warning" | "error" {
  if (row.errors.length > 0) return "error";
  if (row.warnings.length > 0) return "warning";
  return "valid";
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function HistoricalImportPage() {
  useDocumentTitle("Bulk Import");

  // Data loading -- must come before any conditional returns (React hooks rule)
  const accountsList = useQuery(api.accounts.queries.list, { activeOnly: true });
  const allAccounts = useQuery(api.accounts.queries.list, {});
  const usersList = useQuery(api.auth.queries.getActiveUsers);
  const { user } = useAuth();

  // Keep legacy hook available for old import format
  const _bulkCreateLegacy = useBulkCreateJournalEntries();
  const bulkCreateExpenses = useBulkCreateExpenses();

  const isApprover = user?.role === "admin" || user?.role === "manager";

  // State
  const [state, setState] = useState<WizardState>({ step: "upload" });
  const [editingCell, setEditingCell] = useState<{ rowIndex: number; column: string } | null>(null);
  const [batchTrusted, setBatchTrusted] = useState(false);
  const [rows, setRows] = useState<BulkExpenseRow[]>([]);
  const [importBatchId, setImportBatchId] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Build lookup maps from loaded data
  const accountRefs: AccountRef[] = useMemo(() => {
    if (!accountsList) return [];
    return accountsList.map((a) => ({
      _id: a._id as Id<"accounts">,
      code: a.code,
      name: a.name,
      type: a.type,
      isActive: a.isActive,
    }));
  }, [accountsList]);

  const userRefs: UserRef[] = useMemo(() => {
    if (!usersList) return [];
    return usersList.map((u) => ({
      _id: u._id as Id<"users">,
      name: u.name,
    }));
  }, [usersList]);

  const accountSearchItems = useMemo(
    () => accountRefs.filter((a) => a.isActive).map((a) => ({ value: a._id, label: a.name, sublabel: a.code })),
    [accountRefs]
  );

  const userSearchItems = useMemo(
    () => userRefs.map((u) => ({ value: u._id, label: u.name })),
    [userRefs]
  );

  // Reactive summary counts from rows state
  const summaryCounts = useMemo(() => {
    const errorCount = rows.filter((r) => r.errors.length > 0).length;
    const warningCount = rows.filter((r) => r.errors.length === 0 && r.warnings.length > 0).length;
    const validCount = rows.filter((r) => r.errors.length === 0).length;
    const totalAmount = rows.reduce((sum, r) => sum + (r.amount ?? 0), 0);
    return { errorCount, warningCount, validCount, totalAmount };
  }, [rows]);

  // -------------------------------------------------------------------------
  // Template download
  // -------------------------------------------------------------------------

  const handleDownloadTemplate = useCallback(() => {
    const content = BULK_EXPENSE_TEMPLATE_HEADERS + "\n" + BULK_EXPENSE_TEMPLATE_EXAMPLE;
    const blob = new Blob([content], { type: "text/csv;charset=utf-8;" });
    downloadBlob(blob, "bulk-expense-template.csv");
  }, []);

  // -------------------------------------------------------------------------
  // CoA reference download
  // -------------------------------------------------------------------------

  const handleDownloadCoaReference = useCallback(() => {
    if (!allAccounts) return;

    const header = "code,name,type,category,isActive";
    const csvRows = allAccounts.map((a) =>
      [escapeCsv(a.code), escapeCsv(a.name), escapeCsv(a.type), escapeCsv(a.category), a.isActive ? "true" : "false"].join(",")
    );
    const content = [header, ...csvRows].join("\n");
    const blob = new Blob([content], { type: "text/csv;charset=utf-8;" });
    downloadBlob(blob, "chart-of-accounts-reference.csv");
  }, [allAccounts]);

  // -------------------------------------------------------------------------
  // File upload + validation
  // -------------------------------------------------------------------------

  const handleFileUpload = useCallback(
    (file: File) => {
      if (!accountsList || !usersList) {
        toast.error("Accounts or users list not loaded yet. Please wait and try again.");
        return;
      }

      setState({ step: "validating" });

      const reader = new FileReader();
      reader.onload = (event) => {
        const csvText = event.target?.result as string;
        const result = parseAndValidateBulkExpenseCsv(csvText, accountRefs, userRefs, batchTrusted);
        setRows(result.rows);
        setState({ step: "review", result });
      };
      reader.onerror = () => {
        toast.error("Failed to read CSV file");
        setState({ step: "upload" });
      };
      reader.readAsText(file);
    },
    [accountsList, usersList, accountRefs, userRefs, batchTrusted]
  );

  const handleFileChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;
      handleFileUpload(file);
      // Reset input so same file can be re-selected
      e.target.value = "";
    },
    [handleFileUpload]
  );

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      const file = e.dataTransfer.files?.[0];
      if (file && file.name.endsWith(".csv")) {
        handleFileUpload(file);
      } else {
        toast.error("Please drop a .csv file");
      }
    },
    [handleFileUpload]
  );

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
  }, []);

  // -------------------------------------------------------------------------
  // Cell editing
  // -------------------------------------------------------------------------

  const handleCellSave = useCallback(
    (rowIndex: number, column: string, newValue: string) => {
      setEditingCell(null);
      setRows((prevRows) => {
        const updated = [...prevRows];
        const row = { ...updated[rowIndex] };

        // Update the field
        switch (column) {
          case "date": {
            row.dateStr = newValue;
            const epoch = strictWibDateStrToUtcMs(newValue);
            row.date = isNaN(epoch) ? null : epoch;
            break;
          }
          case "amount": {
            row.amountStr = newValue;
            const n = Number(newValue);
            row.amount = isNaN(n) || n <= 0 ? null : Math.floor(n);
            break;
          }
          case "description":
            row.description = newValue;
            break;
          case "category": {
            // newValue is account _id from SearchableSelect
            const matched = accountRefs.find((a) => a._id === newValue);
            if (matched) {
              row.category = matched.name;
              row.accountId = matched._id;
              row.accountName = matched.name;
            }
            break;
          }
          case "vendor":
            row.vendor = newValue;
            break;
          case "payment_method":
            row.paymentMethod = newValue;
            break;
          case "owner": {
            // newValue is user _id from SearchableSelect
            const matched = userRefs.find((u) => u._id === newValue);
            if (matched) {
              row.owner = matched.name;
              row.submitterId = matched._id;
              row.ownerName = matched.name;
            }
            break;
          }
          case "receipt_url":
            row.receiptUrl = newValue;
            break;
        }

        // Revalidate the row
        row.errors = [];
        row.warnings = [];

        if (!row.dateStr) {
          row.errors.push({ column: "date", message: "Date is required" });
        } else if (row.date === null) {
          row.errors.push({ column: "date", message: "Invalid date format. Use YYYY-MM-DD" });
        }

        if (!row.amountStr) {
          row.errors.push({ column: "amount", message: "Amount is required" });
        } else if (row.amount === null) {
          row.errors.push({ column: "amount", message: "Amount must be a positive integer" });
        } else if (row.amount > 10_000_000) {
          row.warnings.push({ column: "amount", message: "Unusually high amount" });
        }

        if (!row.description) {
          row.errors.push({ column: "description", message: "Description is required" });
        } else if (row.description.length > 500) {
          row.errors.push({ column: "description", message: "Description too long (max 500)" });
        }

        if (!row.category) {
          row.errors.push({ column: "category", message: "Category is required" });
        } else if (!row.accountId) {
          row.errors.push({ column: "category", message: `Category '${row.category}' not found in Chart of Accounts` });
        }

        if (!row.paymentMethod) {
          row.errors.push({ column: "payment_method", message: "Payment method is required" });
        } else if (!(VALID_PAYMENT_METHODS as readonly string[]).includes(row.paymentMethod)) {
          row.errors.push({ column: "payment_method", message: "Invalid payment method" });
        }

        if (!row.owner) {
          row.errors.push({ column: "owner", message: "Owner is required" });
        } else if (!row.submitterId) {
          row.errors.push({ column: "owner", message: `User '${row.owner}' not found in system` });
        }

        if (row.receiptUrl && !row.receiptUrl.startsWith("http://") && !row.receiptUrl.startsWith("https://")) {
          row.errors.push({ column: "receipt_url", message: "Receipt URL must be a valid URL" });
        }

        if (!row.vendor) {
          row.warnings.push({ column: "vendor", message: "Vendor not specified" });
        }

        updated[rowIndex] = row;
        return updated;
      });
    },
    [accountRefs, userRefs]
  );

  // -------------------------------------------------------------------------
  // Trust mode toggling
  // -------------------------------------------------------------------------

  const handleBatchTrustToggle = useCallback((checked: boolean) => {
    setBatchTrusted(checked);
    setRows((prevRows) => prevRows.map((r) => ({ ...r, trusted: checked })));
  }, []);

  const handleRowTrustToggle = useCallback((rowIndex: number) => {
    setRows((prevRows) => {
      const updated = [...prevRows];
      updated[rowIndex] = { ...updated[rowIndex], trusted: !updated[rowIndex].trusted };
      return updated;
    });
  }, []);

  // -------------------------------------------------------------------------
  // Import execution (sequential batching)
  // -------------------------------------------------------------------------

  const handleConfirmImport = useCallback(
    async (startFromBatch = 0) => {
      const validRows = rows.filter((r) => r.errors.length === 0);
      if (validRows.length === 0) return;

      const batches = chunkArray(validRows, MAX_BATCH_SIZE);
      const batchId = importBatchId ?? crypto.randomUUID();
      if (!importBatchId) {
        setImportBatchId(batchId);
      }

      let completed = startFromBatch * MAX_BATCH_SIZE;
      let totalAutoApproved = 0;
      let totalSubmitted = 0;

      setState({
        step: "importing",
        total: validRows.length,
        completed,
        batchIndex: startFromBatch,
        batches,
      });

      for (let i = startFromBatch; i < batches.length; i++) {
        try {
          const batchRows = batches[i].map((row) => ({
            date: row.date!,
            amount: row.amount!,
            description: row.description,
            vendorName: row.vendor || "",
            accountId: row.accountId as Id<"accounts">,
            submitterId: row.submitterId as Id<"users">,
            paymentMethod: row.paymentMethod as PaymentMethod,
            receiptUrl: row.receiptUrl || undefined,
            trusted: row.trusted,
          }));

          const result = await bulkCreateExpenses.mutateAsync({
            importBatchId: batchId,
            rows: batchRows,
          });

          if (result && typeof result === "object") {
            const r = result as { created?: number; autoApproved?: number; submitted?: number };
            totalAutoApproved += r.autoApproved ?? 0;
            totalSubmitted += r.submitted ?? 0;
          }

          completed += batches[i].length;
          setState({
            step: "importing",
            total: validRows.length,
            completed,
            batchIndex: i + 1,
            batches,
          });
        } catch (error) {
          const message = error instanceof Error ? error.message : "Unknown error during import";
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

      const totalAmount = validRows.reduce((sum, r) => sum + (r.amount ?? 0), 0);
      setState({
        step: "complete",
        totalCreated: validRows.length,
        totalAmount,
        autoApproved: totalAutoApproved,
        submitted: totalSubmitted,
      });
    },
    [rows, bulkCreateExpenses, importBatchId]
  );

  // -------------------------------------------------------------------------
  // Render
  // -------------------------------------------------------------------------

  if (accountsList === undefined || allAccounts === undefined || usersList === undefined) {
    return (
      <div className="flex items-center justify-center h-64">
        <p className="text-muted-foreground">Loading accounts and users...</p>
      </div>
    );
  }

  return (
    <div>
      <PageHeader
        title="Bulk Import"
        backTo="/expenses"
        backLabel="My Expenses"
      />

      {/* Upload State */}
      {state.step === "upload" && (
        <div className="space-y-6">
          {/* Downloads */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Prepare & Upload</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-sm text-muted-foreground">
                Download the CSV template, fill in your expenses, and upload.
                Required columns: date, amount, description, category, vendor, payment_method, owner.
                Optional: receipt_url, asset_category, asset_name.
              </p>
              <p className="text-xs text-muted-foreground">
                date: YYYY-MM-DD | amount: positive integer (IDR) | category: account name (case-insensitive) | owner: system user display name
              </p>
              <div className="flex flex-wrap gap-3">
                <Button variant="outline" onClick={handleDownloadTemplate}>
                  <Download className="h-4 w-4 mr-2" />
                  Download Template
                </Button>
                <Button variant="outline" onClick={handleDownloadCoaReference}>
                  <FileText className="h-4 w-4 mr-2" />
                  Download Chart of Accounts
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* Upload Zone */}
          <Card>
            <CardContent className="pt-6">
              <div
                className={cn(
                  "border-2 border-dashed rounded-lg py-8 text-center cursor-pointer",
                  "hover:border-primary/50 hover:bg-muted/50 transition-colors"
                )}
                onClick={() => fileInputRef.current?.click()}
                onDragOver={handleDragOver}
                onDrop={handleDrop}
              >
                <Upload className="h-10 w-10 mx-auto mb-3 text-muted-foreground" />
                <p className="text-sm font-medium">Click to select a CSV file</p>
                <p className="text-xs text-muted-foreground mt-1">or drag and drop</p>
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

      {/* Review State -- STAR OF THE PAGE */}
      {state.step === "review" && (
        <div className="space-y-6">
          {/* Summary Cards */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <Card>
              <CardContent className="pt-6">
                <div className="text-center">
                  <p className="text-2xl font-bold text-green-600">{summaryCounts.validCount}</p>
                  <p className="text-xs text-muted-foreground">Valid Rows</p>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-6">
                <div className="text-center">
                  <p className={cn("text-2xl font-bold", summaryCounts.warningCount > 0 ? "text-amber-600" : "text-muted-foreground")}>
                    {summaryCounts.warningCount}
                  </p>
                  <p className="text-xs text-muted-foreground">Warnings</p>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-6">
                <div className="text-center">
                  <p className={cn("text-2xl font-bold", summaryCounts.errorCount > 0 ? "text-red-600" : "text-muted-foreground")}>
                    {summaryCounts.errorCount}
                  </p>
                  <p className="text-xs text-muted-foreground">Errors</p>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-6">
                <div className="text-center">
                  <p className="text-2xl font-bold">{formatCurrency(summaryCounts.totalAmount)}</p>
                  <p className="text-xs text-muted-foreground">Total Amount</p>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Trust Mode Bar */}
          {isApprover ? (
            <Card>
              <CardContent className="flex items-center justify-between p-4">
                <div>
                  <p className="text-sm font-medium">These expenses are already paid</p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {batchTrusted
                      ? "Skip approval -- record directly with journal entries"
                      : "Submit for approval through the normal expense workflow"}
                  </p>
                </div>
                <Switch
                  checked={batchTrusted}
                  onCheckedChange={handleBatchTrustToggle}
                />
              </CardContent>
            </Card>
          ) : (
            <Card>
              <CardContent className="flex items-center gap-3 p-4">
                <Info className="h-4 w-4 text-blue-500 shrink-0" />
                <p className="text-sm text-muted-foreground">
                  All rows will be submitted for approval (admin/manager required for direct recording)
                </p>
              </CardContent>
            </Card>
          )}

          {/* Editable Preview Table */}
          <Card>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader className="sticky top-0 bg-background z-10">
                  <TableRow>
                    <TableHead className="w-[48px]">#</TableHead>
                    <TableHead className="w-[32px]"></TableHead>
                    <TableHead className="min-w-[120px]">Date</TableHead>
                    <TableHead className="min-w-[120px]">Amount</TableHead>
                    <TableHead className="min-w-[200px]">Description</TableHead>
                    <TableHead className="min-w-[180px]">Category</TableHead>
                    <TableHead className="min-w-[140px]">Vendor</TableHead>
                    <TableHead className="min-w-[130px]">Payment</TableHead>
                    <TableHead className="min-w-[140px]">Owner</TableHead>
                    {isApprover && <TableHead className="w-[64px]">Paid?</TableHead>}
                    <TableHead className="min-w-[100px]">Receipt</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody className="max-h-[60vh] overflow-y-auto">
                  {rows.map((row, idx) => {
                    const validation = getRowValidation(row);
                    const borderColor =
                      validation === "error"
                        ? "border-l-red-500"
                        : validation === "warning"
                          ? "border-l-amber-500"
                          : "border-l-green-500";
                    const bgTint =
                      validation === "error"
                        ? "bg-red-50/50 dark:bg-red-950/20"
                        : validation === "warning"
                          ? "bg-amber-50/50 dark:bg-amber-950/20"
                          : "";

                    return (
                      <TableRow
                        key={row.rowIndex}
                        className={cn("border-l-[3px]", borderColor, bgTint)}
                      >
                        {/* Row number */}
                        <TableCell className="text-xs text-muted-foreground font-mono">
                          {row.rowIndex + 1}
                        </TableCell>

                        {/* Validation icon */}
                        <TableCell className="p-1">
                          {validation === "error" && (
                            <Tooltip>
                              <TooltipTrigger>
                                <XCircle className="h-4 w-4 text-red-500" />
                              </TooltipTrigger>
                              <TooltipContent className="max-w-xs">
                                <ul className="text-xs space-y-0.5">
                                  {row.errors.map((e, i) => (
                                    <li key={i}>{e.column}: {e.message}</li>
                                  ))}
                                </ul>
                              </TooltipContent>
                            </Tooltip>
                          )}
                          {validation === "warning" && (
                            <Tooltip>
                              <TooltipTrigger>
                                <AlertTriangle className="h-4 w-4 text-amber-500" />
                              </TooltipTrigger>
                              <TooltipContent className="max-w-xs">
                                <ul className="text-xs space-y-0.5">
                                  {row.warnings.map((w, i) => (
                                    <li key={i}>{w.column}: {w.message}</li>
                                  ))}
                                </ul>
                              </TooltipContent>
                            </Tooltip>
                          )}
                          {validation === "valid" && (
                            <CheckCircle2 className="h-4 w-4 text-green-500" />
                          )}
                        </TableCell>

                        {/* Date */}
                        <TableCell className="p-0">
                          <EditableCell
                            value={row.dateStr}
                            displayValue={row.dateStr}
                            type="date"
                            isEditing={editingCell?.rowIndex === idx && editingCell?.column === "date"}
                            onStartEdit={() => setEditingCell({ rowIndex: idx, column: "date" })}
                            onSave={(v) => handleCellSave(idx, "date", v)}
                            onCancel={() => setEditingCell(null)}
                            hasError={row.errors.some((e) => e.column === "date")}
                            errorMessage={row.errors.find((e) => e.column === "date")?.message}
                          />
                        </TableCell>

                        {/* Amount */}
                        <TableCell className="p-0">
                          <EditableCell
                            value={row.amountStr}
                            displayValue={row.amount !== null ? formatCurrency(row.amount) : row.amountStr}
                            type="number"
                            isEditing={editingCell?.rowIndex === idx && editingCell?.column === "amount"}
                            onStartEdit={() => setEditingCell({ rowIndex: idx, column: "amount" })}
                            onSave={(v) => handleCellSave(idx, "amount", v)}
                            onCancel={() => setEditingCell(null)}
                            hasError={row.errors.some((e) => e.column === "amount")}
                            errorMessage={row.errors.find((e) => e.column === "amount")?.message}
                            hasWarning={row.warnings.some((w) => w.column === "amount")}
                            warningMessage={row.warnings.find((w) => w.column === "amount")?.message}
                          />
                        </TableCell>

                        {/* Description */}
                        <TableCell className="p-0">
                          <EditableCell
                            value={row.description}
                            type="text"
                            isEditing={editingCell?.rowIndex === idx && editingCell?.column === "description"}
                            onStartEdit={() => setEditingCell({ rowIndex: idx, column: "description" })}
                            onSave={(v) => handleCellSave(idx, "description", v)}
                            onCancel={() => setEditingCell(null)}
                            hasError={row.errors.some((e) => e.column === "description")}
                            errorMessage={row.errors.find((e) => e.column === "description")?.message}
                          />
                        </TableCell>

                        {/* Category (searchable) */}
                        <TableCell className="p-0">
                          <EditableCell
                            value={row.accountId ?? ""}
                            displayValue={row.accountName ?? row.category}
                            type="searchable"
                            isEditing={editingCell?.rowIndex === idx && editingCell?.column === "category"}
                            onStartEdit={() => setEditingCell({ rowIndex: idx, column: "category" })}
                            onSave={(v) => handleCellSave(idx, "category", v)}
                            onCancel={() => setEditingCell(null)}
                            hasError={row.errors.some((e) => e.column === "category")}
                            errorMessage={row.errors.find((e) => e.column === "category")?.message}
                            searchItems={accountSearchItems}
                            searchPlaceholder="Search accounts..."
                          />
                        </TableCell>

                        {/* Vendor */}
                        <TableCell className="p-0">
                          <EditableCell
                            value={row.vendor}
                            type="text"
                            isEditing={editingCell?.rowIndex === idx && editingCell?.column === "vendor"}
                            onStartEdit={() => setEditingCell({ rowIndex: idx, column: "vendor" })}
                            onSave={(v) => handleCellSave(idx, "vendor", v)}
                            onCancel={() => setEditingCell(null)}
                            hasWarning={row.warnings.some((w) => w.column === "vendor")}
                            warningMessage={row.warnings.find((w) => w.column === "vendor")?.message}
                          />
                        </TableCell>

                        {/* Payment Method */}
                        <TableCell className="p-0">
                          <EditableCell
                            value={row.paymentMethod}
                            displayValue={PAYMENT_METHOD_OPTIONS.find((o) => o.value === row.paymentMethod)?.label ?? row.paymentMethod}
                            type="select"
                            isEditing={editingCell?.rowIndex === idx && editingCell?.column === "payment_method"}
                            onStartEdit={() => setEditingCell({ rowIndex: idx, column: "payment_method" })}
                            onSave={(v) => handleCellSave(idx, "payment_method", v)}
                            onCancel={() => setEditingCell(null)}
                            hasError={row.errors.some((e) => e.column === "payment_method")}
                            errorMessage={row.errors.find((e) => e.column === "payment_method")?.message}
                            selectOptions={PAYMENT_METHOD_OPTIONS}
                          />
                        </TableCell>

                        {/* Owner (searchable) */}
                        <TableCell className="p-0">
                          <EditableCell
                            value={row.submitterId ?? ""}
                            displayValue={row.ownerName ?? row.owner}
                            type="searchable"
                            isEditing={editingCell?.rowIndex === idx && editingCell?.column === "owner"}
                            onStartEdit={() => setEditingCell({ rowIndex: idx, column: "owner" })}
                            onSave={(v) => handleCellSave(idx, "owner", v)}
                            onCancel={() => setEditingCell(null)}
                            hasError={row.errors.some((e) => e.column === "owner")}
                            errorMessage={row.errors.find((e) => e.column === "owner")?.message}
                            searchItems={userSearchItems}
                            searchPlaceholder="Search users..."
                          />
                        </TableCell>

                        {/* Trust toggle (per-row, only for approvers) */}
                        {isApprover && (
                          <TableCell className="text-center p-1">
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <button
                                  type="button"
                                  onClick={() => handleRowTrustToggle(idx)}
                                  className="inline-flex items-center justify-center"
                                >
                                  {row.trusted ? (
                                    <CheckCircle2 className="h-5 w-5 text-green-500" />
                                  ) : (
                                    <ArrowRight className="h-5 w-5 text-muted-foreground" />
                                  )}
                                </button>
                              </TooltipTrigger>
                              <TooltipContent>
                                <p className="text-xs">
                                  {row.trusted
                                    ? "Already paid -- will be recorded directly"
                                    : "Needs approval -- will enter approval queue"}
                                </p>
                              </TooltipContent>
                            </Tooltip>
                          </TableCell>
                        )}

                        {/* Receipt URL */}
                        <TableCell className="p-0">
                          <EditableCell
                            value={row.receiptUrl}
                            displayValue={row.receiptUrl ? "View" : ""}
                            type="text"
                            isEditing={editingCell?.rowIndex === idx && editingCell?.column === "receipt_url"}
                            onStartEdit={() => setEditingCell({ rowIndex: idx, column: "receipt_url" })}
                            onSave={(v) => handleCellSave(idx, "receipt_url", v)}
                            onCancel={() => setEditingCell(null)}
                            hasError={row.errors.some((e) => e.column === "receipt_url")}
                            errorMessage={row.errors.find((e) => e.column === "receipt_url")?.message}
                          />
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          </Card>

          {/* Actions Bar */}
          <div className="flex justify-end gap-3 pt-4">
            <Button
              variant="outline"
              onClick={() => {
                setRows([]);
                setEditingCell(null);
                setImportBatchId(null);
                setState({ step: "upload" });
              }}
            >
              <ArrowLeft className="h-4 w-4 mr-2" />
              Re-upload
            </Button>
            <Tooltip>
              <TooltipTrigger asChild>
                <span>
                  <Button
                    onClick={() => handleConfirmImport()}
                    disabled={summaryCounts.errorCount > 0 || summaryCounts.validCount === 0}
                  >
                    {summaryCounts.errorCount > 0
                      ? `Fix ${summaryCounts.errorCount} error${summaryCounts.errorCount === 1 ? "" : "s"} to continue`
                      : `Confirm Import (${summaryCounts.validCount} rows)`}
                  </Button>
                </span>
              </TooltipTrigger>
              {summaryCounts.errorCount > 0 && (
                <TooltipContent>
                  <p className="text-xs">Fix {summaryCounts.errorCount} error(s) to continue</p>
                </TooltipContent>
              )}
            </Tooltip>
          </div>
        </div>
      )}

      {/* Importing State */}
      {state.step === "importing" && (
        <Card>
          <CardContent className="py-12 space-y-6">
            <div className="text-center space-y-2">
              <p className="text-lg font-medium">Creating expense records...</p>
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
                {state.totalCreated} expense records created
              </p>
              <p className="text-sm text-muted-foreground mt-1">
                Total amount imported: {formatCurrency(state.totalAmount)}
              </p>
              {(state.autoApproved > 0 || state.submitted > 0) && (
                <p className="text-xs text-muted-foreground mt-2">
                  {state.autoApproved > 0 && `${state.autoApproved} auto-approved`}
                  {state.autoApproved > 0 && state.submitted > 0 && " | "}
                  {state.submitted > 0 && `${state.submitted} submitted for approval`}
                </p>
              )}
            </div>
            <div className="flex justify-center gap-3">
              <Button asChild>
                <Link to="/expenses">View My Expenses</Link>
              </Button>
              <Button
                variant="outline"
                onClick={() => {
                  setImportBatchId(null);
                  setRows([]);
                  setBatchTrusted(false);
                  setState({ step: "upload" });
                }}
              >
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
                onClick={() => handleConfirmImport(state.failedBatchIndex)}
              >
                Retry from failed batch
              </Button>
              <Button
                variant="outline"
                onClick={() => {
                  setImportBatchId(null);
                  setRows([]);
                  setState({ step: "upload" });
                }}
              >
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
