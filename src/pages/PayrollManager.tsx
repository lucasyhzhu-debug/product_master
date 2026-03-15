/**
 * PayrollManager -- Admin-only payroll entry management page.
 *
 * Two sections:
 * - Create Form: New payroll entry with JE preview confirmation
 * - History List: Filterable payroll entry history with void support
 *
 * Real-time: Convex auto-updates when entries are created/voided.
 */
import { useState, useCallback } from "react";
import { useDocumentTitle } from "@/hooks/useDocumentTitle";
import { PageHeader } from "@/components/layout/PageHeader";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { DollarSign, Ban, Upload, Inbox } from "lucide-react";
import { VoidReasonDialog } from "@/components/shared";
import { formatCurrency } from "@/lib/utils";
import { wibDateStrToUtcMs, formatDateId } from "@/lib/dateUtils";
import {
  usePayrollEntries,
  useCreatePayroll,
  useVoidPayroll,
  usePayrollUploadUrl,
  type PayrollEntry,
} from "@/hooks/convex";
import type { Id } from "../../convex/_generated/dataModel";

// ============================================================================
// Employee type filter options
// ============================================================================
const EMPLOYEE_TYPE_OPTIONS = [
  { value: "all", label: "All" },
  { value: "contractor", label: "Contractor" },
  { value: "staff", label: "Staff" },
] as const;

type EmployeeTypeFilter = "all" | "contractor" | "staff";

// ============================================================================
// Main page component
// ============================================================================

export function PayrollManager() {
  useDocumentTitle("Payroll");

  return (
    <div className="space-y-6">
      <PageHeader
        title="Payroll"
        description="Manage payroll entries and payments"
        badge={<DollarSign className="h-5 w-5 text-muted-foreground" />}
      />

      <div className="grid gap-6 lg:grid-cols-[400px_1fr]">
        <CreatePayrollForm />
        <PayrollHistory />
      </div>
    </div>
  );
}

// ============================================================================
// CreatePayrollForm -- New payroll entry form with JE preview
// ============================================================================

function CreatePayrollForm() {
  const createPayroll = useCreatePayroll();
  const generateUploadUrl = usePayrollUploadUrl();

  // Form state
  const [recipientName, setRecipientName] = useState("");
  const [employeeType, setEmployeeType] = useState<"contractor" | "staff">("contractor");
  const [frequency, setFrequency] = useState<"weekly" | "monthly">("monthly");
  const [amount, setAmount] = useState("");
  const [periodStart, setPeriodStart] = useState("");
  const [periodEnd, setPeriodEnd] = useState("");
  const [description, setDescription] = useState("");
  const [attachmentFileId, setAttachmentFileId] = useState<Id<"_storage"> | undefined>();
  const [attachmentName, setAttachmentName] = useState("");
  const [uploading, setUploading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);

  // Parsed amount for display -- use parseInt to avoid fractional IDR
  const parsedAmount = parseInt(amount, 10) || 0;

  // Validation
  const isValid =
    recipientName.trim().length > 0 &&
    parsedAmount > 0 &&
    periodStart.length > 0 &&
    periodEnd.length > 0 &&
    wibDateStrToUtcMs(periodStart) < wibDateStrToUtcMs(periodEnd) &&
    description.trim().length > 0;

  // File upload handler
  const handleFileUpload = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;

      setUploading(true);
      try {
        const uploadUrl = await generateUploadUrl();
        const response = await fetch(uploadUrl, {
          method: "POST",
          headers: { "Content-Type": file.type },
          body: file,
        });
        if (!response.ok) throw new Error("Upload failed");
        const { storageId } = await response.json();
        setAttachmentFileId(storageId as Id<"_storage">);
        setAttachmentName(file.name);
      } catch {
        // Upload error handled silently -- user can retry
        setAttachmentFileId(undefined);
        setAttachmentName("");
      } finally {
        setUploading(false);
      }
    },
    [generateUploadUrl],
  );

  // Submit handler
  const handleSubmit = useCallback(async () => {
    if (!isValid) return;
    setSubmitting(true);
    try {
      await createPayroll.mutate({
        recipientName: recipientName.trim(),
        employeeType,
        frequency,
        amount: parsedAmount,
        periodStart: wibDateStrToUtcMs(periodStart),
        periodEnd: wibDateStrToUtcMs(periodEnd),
        description: description.trim(),
        attachmentFileId,
      });
      // Reset form on success
      setRecipientName("");
      setEmployeeType("contractor");
      setFrequency("monthly");
      setAmount("");
      setPeriodStart("");
      setPeriodEnd("");
      setDescription("");
      setAttachmentFileId(undefined);
      setAttachmentName("");
      setShowConfirm(false);
    } catch {
      // Error toast handled by createMutationHook
    } finally {
      setSubmitting(false);
    }
  }, [
    isValid,
    createPayroll,
    recipientName,
    employeeType,
    frequency,
    parsedAmount,
    periodStart,
    periodEnd,
    description,
    attachmentFileId,
  ]);

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">New Payroll Entry</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Recipient Name */}
          <div className="space-y-1.5">
            <Label htmlFor="recipientName">Recipient Name</Label>
            <Input
              id="recipientName"
              value={recipientName}
              onChange={(e) => setRecipientName(e.target.value)}
              placeholder="e.g. John Doe"
            />
          </div>

          {/* Employee Type */}
          <div className="space-y-1.5">
            <Label htmlFor="employeeType">Employee Type</Label>
            <Select value={employeeType} onValueChange={(v) => setEmployeeType(v as "contractor" | "staff")}>
              <SelectTrigger id="employeeType">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="contractor">Contractor</SelectItem>
                <SelectItem value="staff">Staff</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Frequency */}
          <div className="space-y-1.5">
            <Label htmlFor="frequency">Frequency</Label>
            <Select value={frequency} onValueChange={(v) => setFrequency(v as "weekly" | "monthly")}>
              <SelectTrigger id="frequency">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="weekly">Weekly</SelectItem>
                <SelectItem value="monthly">Monthly</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Amount */}
          <div className="space-y-1.5">
            <Label htmlFor="amount">Amount (IDR)</Label>
            <Input
              id="amount"
              type="number"
              min="1"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="e.g. 5000000"
            />
            {parsedAmount > 0 && (
              <p className="text-xs text-muted-foreground">
                {formatCurrency(parsedAmount)}
              </p>
            )}
          </div>

          {/* Period Start */}
          <div className="space-y-1.5">
            <Label htmlFor="periodStart">Period Start</Label>
            <Input
              id="periodStart"
              type="date"
              value={periodStart}
              onChange={(e) => setPeriodStart(e.target.value)}
            />
          </div>

          {/* Period End */}
          <div className="space-y-1.5">
            <Label htmlFor="periodEnd">Period End</Label>
            <Input
              id="periodEnd"
              type="date"
              value={periodEnd}
              onChange={(e) => setPeriodEnd(e.target.value)}
            />
            {periodStart && periodEnd && wibDateStrToUtcMs(periodStart) >= wibDateStrToUtcMs(periodEnd) && (
              <p className="text-xs text-destructive">
                Period end must be after period start
              </p>
            )}
          </div>

          {/* Description */}
          <div className="space-y-1.5">
            <Label htmlFor="description">Description</Label>
            <Textarea
              id="description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="e.g. Monthly salary for March 2026"
              rows={3}
            />
          </div>

          {/* Attachment */}
          <div className="space-y-1.5">
            <Label htmlFor="attachment">Attachment (optional)</Label>
            <div className="flex items-center gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={uploading}
                onClick={() => document.getElementById("attachment-input")?.click()}
              >
                <Upload className="h-4 w-4 mr-1.5" />
                {uploading ? "Uploading..." : "Upload"}
              </Button>
              {attachmentName && (
                <span className="text-sm text-muted-foreground truncate max-w-[200px]">
                  {attachmentName}
                </span>
              )}
            </div>
            <input
              id="attachment-input"
              type="file"
              className="hidden"
              onChange={handleFileUpload}
              accept=".pdf,.jpg,.jpeg,.png,.webp"
            />
          </div>

          {/* Submit */}
          <Button
            className="w-full"
            disabled={!isValid || submitting || uploading}
            onClick={() => setShowConfirm(true)}
          >
            <DollarSign className="h-4 w-4 mr-1.5" />
            Create Payroll Entry
          </Button>
        </CardContent>
      </Card>

      {/* JE Preview Confirmation */}
      <AlertDialog open={showConfirm} onOpenChange={setShowConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirm Payroll Entry</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-3">
                <p>
                  This will create a payroll entry for{" "}
                  <strong>{recipientName.trim()}</strong> and a journal entry:
                </p>
                <div className="rounded-md bg-muted p-3 text-sm font-mono space-y-1">
                  <div>DR 6100 Salaries & Wages: {formatCurrency(parsedAmount)}</div>
                  <div>CR 1100 Cash: {formatCurrency(parsedAmount)}</div>
                </div>
                <p className="text-sm">
                  {employeeType === "contractor" ? "Contractor" : "Staff"} &middot;{" "}
                  {frequency === "weekly" ? "Weekly" : "Monthly"} &middot;{" "}
                  {periodStart} to {periodEnd}
                </p>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={submitting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                handleSubmit();
              }}
              disabled={submitting}
            >
              {submitting ? "Creating..." : "Confirm & Create"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

// ============================================================================
// PayrollHistory -- Filterable history list with void support
// ============================================================================

function PayrollHistory() {
  const [typeFilter, setTypeFilter] = useState<EmployeeTypeFilter>("all");
  const filterValue = typeFilter === "all" ? undefined : typeFilter;
  const entries = usePayrollEntries(filterValue);
  const voidPayroll = useVoidPayroll();

  // Void dialog state
  const [voidTarget, setVoidTarget] = useState<{
    id: Id<"payrollEntries">;
    payrollNumber: string;
  } | null>(null);

  const handleVoidPayroll = useCallback(
    async (reason: string) => {
      if (!voidTarget) return;
      await voidPayroll.mutate({ payrollId: voidTarget.id, reason });
    },
    [voidPayroll, voidTarget],
  );

  return (
    <>
      <Card>
        <CardHeader>
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
            <CardTitle className="text-lg">Payroll History</CardTitle>
            <div className="flex gap-1">
              {EMPLOYEE_TYPE_OPTIONS.map((opt) => (
                <Button
                  key={opt.value}
                  variant={typeFilter === opt.value ? "default" : "outline"}
                  size="sm"
                  onClick={() => setTypeFilter(opt.value)}
                >
                  {opt.label}
                </Button>
              ))}
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {/* Loading state */}
          {entries === undefined && (
            <div className="space-y-3">
              {Array.from({ length: 3 }).map((_, i) => (
                <Skeleton key={i} className="h-16 w-full rounded-lg" />
              ))}
            </div>
          )}

          {/* Empty state */}
          {entries !== undefined && entries.length === 0 && (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <Inbox className="h-12 w-12 text-muted-foreground mb-4" />
              <h3 className="text-lg font-medium mb-2">No payroll entries found</h3>
              <p className="text-sm text-muted-foreground">
                Created payroll entries will appear here.
              </p>
            </div>
          )}

          {/* Entries table */}
          {entries !== undefined && entries.length > 0 && (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Payroll #</TableHead>
                    <TableHead>Recipient</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Frequency</TableHead>
                    <TableHead className="text-right">Amount</TableHead>
                    <TableHead>Period</TableHead>
                    <TableHead>Description</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Created</TableHead>
                    <TableHead className="w-[80px]" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {entries.map((entry: PayrollEntry) => (
                    <PayrollRow
                      key={entry._id}
                      entry={entry}
                      onVoid={(id, num) => setVoidTarget({ id, payrollNumber: num })}
                    />
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Void Dialog */}
      <VoidReasonDialog
        title={`Void Payroll Entry ${voidTarget?.payrollNumber ?? ""}`}
        description="This will create a reversing journal entry to undo the original accounting impact."
        open={voidTarget !== null}
        onOpenChange={(open) => {
          if (!open) setVoidTarget(null);
        }}
        onConfirm={handleVoidPayroll}
      />
    </>
  );
}

// ============================================================================
// PayrollRow -- Single row in the history table
// ============================================================================

interface PayrollRowProps {
  entry: PayrollEntry;
  onVoid: (id: Id<"payrollEntries">, payrollNumber: string) => void;
}

function PayrollRow({ entry, onVoid }: PayrollRowProps) {
  const isVoided = entry.status === "voided";

  return (
    <TableRow className={isVoided ? "opacity-60" : undefined}>
      <TableCell className="font-mono text-sm">
        {entry.payrollNumber ?? "-"}
      </TableCell>
      <TableCell className="font-medium">
        {entry.recipientName ?? "-"}
      </TableCell>
      <TableCell>
        <Badge variant="outline" className={
          entry.employeeType === "staff"
            ? "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200"
            : "bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200"
        }>
          {entry.employeeType === "staff" ? "Staff" : "Contractor"}
        </Badge>
      </TableCell>
      <TableCell className="capitalize">{entry.frequency}</TableCell>
      <TableCell className="text-right font-mono">
        {formatCurrency(entry.amount)}
      </TableCell>
      <TableCell className="text-sm">
        {formatDateId(entry.periodStart)} &ndash; {formatDateId(entry.periodEnd)}
      </TableCell>
      <TableCell className="max-w-[200px] truncate text-sm text-muted-foreground">
        {entry.description}
      </TableCell>
      <TableCell>
        <Badge variant={isVoided ? "destructive" : "default"} className={
          !isVoided ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-900 dark:text-emerald-200" : ""
        }>
          {isVoided ? "Voided" : "Active"}
        </Badge>
      </TableCell>
      <TableCell className="text-sm text-muted-foreground">
        {formatDateId(entry._creationTime)}
        {entry.createdByName && (
          <span className="block text-xs">{entry.createdByName}</span>
        )}
      </TableCell>
      <TableCell>
        {!isVoided && (
          <Button
            variant="ghost"
            size="sm"
            className="text-destructive hover:text-destructive"
            onClick={() => onVoid(entry._id, entry.payrollNumber ?? "")}
          >
            <Ban className="h-4 w-4" />
          </Button>
        )}
        {isVoided && entry.voidReason && (
          <span className="text-xs text-muted-foreground block max-w-[120px] truncate" title={entry.voidReason}>
            {entry.voidReason}
          </span>
        )}
      </TableCell>
    </TableRow>
  );
}

