/**
 * ExpenseSubmitForm — shared form body for ExpenseSubmit page AND
 * InlineExpenseDialog (Phase 73 D-17, I4 mandate).
 *
 * This component renders the full expense submission form: fields,
 * validation, receipt upload, and (optionally) a submit button. The
 * parent (page OR dialog) wires the actual submit action via onSubmit.
 *
 * mode="page" renders with a trailing [Save Draft] + [Submit for Approval]
 *             button pair and a fraud/receipt banner.
 * mode="dialog" renders without an internal submit button — the dialog
 *             provides its own footer and calls submitFromExternal() via
 *             the imperative ref.
 *
 * The form owns its state; initialValues pre-fills from either a draft
 * (page mode) or a bank line (dialog mode D-17 auto-fill).
 */
import {
  useState,
  useEffect,
  useCallback,
  useRef,
  useImperativeHandle,
  forwardRef,
  useMemo,
} from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { AlertTriangle, Copy } from "lucide-react";
import { useAccounts } from "@/hooks/convex/useAccounts";
import {
  useExpenseUploadUrl,
  useCheckReceiptHash,
} from "@/hooks/convex/useExpenses";
import { ReceiptUpload } from "@/components/expenses/ReceiptUpload";
import { utcToWibDateStr, wibDateStrToUtcMs } from "@/lib/dateUtils";
import { RECEIPT_THRESHOLD } from "../../../convex/expenses/helpers";
import type { Id } from "../../../convex/_generated/dataModel";

export const PAYMENT_METHODS = [
  {
    value: "employee_paid",
    label: "Reimburse Employee",
    description:
      "I paid for this myself and need the company to pay me back",
  },
  {
    value: "company_paid",
    label: "Paid by Company",
    description:
      "The company bank account was already charged (e.g., direct debit, linked Shopee/BCA)",
  },
  {
    value: "payment_request",
    label: "Payment Request",
    description: "I need the company to pay this vendor directly from the bank account",
  },
] as const;

export type PaymentMethod = (typeof PAYMENT_METHODS)[number]["value"];

export const EXPENSE_TYPE_OPTIONS = [
  { value: "cogs", label: "Cost of Goods Sold" },
  { value: "opex", label: "Operating Expenses" },
  { value: "other", label: "Other Income/Expense" },
] as const;

export interface ExpenseSubmitFormValues {
  description: string;
  amount: string;
  expenseType: "cogs" | "opex" | "other" | "";
  accountId: string;
  expenseDate: string;
  vendorName: string;
  paymentMethod: PaymentMethod;
  transactionReference: string;
  receiptFileId?: Id<"_storage">;
  receiptImageHash?: string;
  sharedReceiptAcknowledged?: boolean;
}

export interface ExpenseSubmitFormProps {
  initialValues?: Partial<ExpenseSubmitFormValues>;
  mode: "page" | "dialog";
  disabled?: boolean;
  /** Called when external parent triggers validate+submit. Returns resolved args if valid. */
  onValuesChange?: (values: ExpenseSubmitFormValues) => void;
  /** Banner shown at top (used by page mode for duplicate warning). */
  banner?: React.ReactNode;
  /** Hide the payment-method select. In dialog mode we force company_paid. */
  hidePaymentMethod?: boolean;
}

export interface ExpenseSubmitFormHandle {
  /** Validate form and return values + a flag. Used by dialog mode. */
  validate(): { ok: true; values: ExpenseSubmitFormValues } | { ok: false; error: string };
  /** Returns raw form values (no validation). */
  getValues(): ExpenseSubmitFormValues;
  /** Converts form values to mutation-ready args (amount as number, expenseDate as epoch ms). */
  buildArgs():
    | { ok: true; args: BuildArgs }
    | { ok: false; error: string };
}

export type BuildArgs = {
  description: string;
  amount: number;
  accountId: Id<"accounts">;
  expenseDate: number;
  vendorName: string;
  paymentMethod: PaymentMethod;
  transactionReference?: string;
  receiptFileId?: Id<"_storage">;
  receiptImageHash?: string;
  sharedReceiptAcknowledged?: true;
};

function getDefaultDate(): string {
  return utcToWibDateStr(Date.now());
}

const INITIAL: ExpenseSubmitFormValues = {
  description: "",
  amount: "",
  expenseType: "",
  accountId: "",
  expenseDate: getDefaultDate(),
  vendorName: "",
  paymentMethod: "employee_paid",
  transactionReference: "",
};

export const ExpenseSubmitForm = forwardRef<
  ExpenseSubmitFormHandle,
  ExpenseSubmitFormProps
>(function ExpenseSubmitForm(props, ref) {
  const { initialValues, disabled, onValuesChange, banner, hidePaymentMethod, mode } = props;

  const allAccounts = useAccounts(true);
  const accounts = useMemo(
    () => allAccounts?.filter((a) => ["opex", "cogs", "other"].includes(a.type)),
    [allAccounts],
  );
  const generateUploadUrl = useExpenseUploadUrl();

  // --- Form state ---------------------------------------------------------
  const [form, setForm] = useState<ExpenseSubmitFormValues>(() => ({
    ...INITIAL,
    ...(initialValues ?? {}),
  }));
  const initialAppliedRef = useRef(false);

  // Pre-fill when initialValues arrive asynchronously (e.g., edit mode page
  // fetches the existing draft + account list is still loading).
  useEffect(() => {
    if (!initialValues) return;
    if (initialAppliedRef.current) return;
    // Only apply once accounts are loaded for expenseType derivation
    if (accounts === undefined) return;
    setForm((prev) => ({ ...prev, ...initialValues }));
    initialAppliedRef.current = true;
  }, [initialValues, accounts]);

  useEffect(() => {
    onValuesChange?.(form);
  }, [form, onValuesChange]);

  const duplicateReceipt = useCheckReceiptHash(form.receiptImageHash, undefined);

  const updateField = useCallback(
    <K extends keyof ExpenseSubmitFormValues>(
      field: K,
      value: ExpenseSubmitFormValues[K],
    ) => {
      setForm((prev) => ({ ...prev, [field]: value }));
    },
    [],
  );

  const filteredAccounts = useMemo(
    () =>
      form.expenseType
        ? (accounts ?? []).filter((a) => a.type === form.expenseType)
        : [],
    [accounts, form.expenseType],
  );

  const validate = useCallback(
    (): { ok: true; values: ExpenseSubmitFormValues } | { ok: false; error: string } => {
      if (!form.description.trim()) return { ok: false, error: "Description is required" };
      if (!form.amount || Number(form.amount) <= 0)
        return { ok: false, error: "Amount must be positive" };
      if (!Number.isInteger(Number(form.amount)))
        return { ok: false, error: "Amount must be a whole number (IDR, no decimals)" };
      if (!form.expenseType) return { ok: false, error: "Expense Type is required" };
      if (!form.accountId) return { ok: false, error: "GL Account is required" };
      if (!form.expenseDate) return { ok: false, error: "Expense date is required" };
      if (!form.vendorName.trim()) return { ok: false, error: "Vendor name is required" };
      if (
        (form.paymentMethod === "company_paid" ||
          form.paymentMethod === "payment_request") &&
        !form.receiptFileId
      ) {
        return { ok: false, error: "Receipt is required for company-paid expenses" };
      }
      if (mode === "dialog" && !form.receiptFileId) {
        return {
          ok: false,
          error:
            "A receipt file is required before submitting. This expense has already left the bank — we still need proof of purchase.",
        };
      }
      return { ok: true, values: form };
    },
    [form, mode],
  );

  const buildArgs = useCallback(():
    | { ok: true; args: BuildArgs }
    | { ok: false; error: string } => {
    const v = validate();
    if (!v.ok) return v;
    const f = v.values;
    const args: BuildArgs = {
      description: f.description.trim(),
      amount: Number(f.amount),
      accountId: f.accountId as Id<"accounts">,
      expenseDate: wibDateStrToUtcMs(f.expenseDate),
      vendorName: f.vendorName.trim(),
      paymentMethod: f.paymentMethod,
      ...(f.transactionReference.trim() && {
        transactionReference: f.transactionReference.trim(),
      }),
      ...(f.receiptFileId && { receiptFileId: f.receiptFileId }),
      ...(f.receiptImageHash && { receiptImageHash: f.receiptImageHash }),
      ...(f.sharedReceiptAcknowledged && { sharedReceiptAcknowledged: true as const }),
    };
    return { ok: true, args };
  }, [validate]);

  useImperativeHandle(
    ref,
    () => ({
      validate,
      buildArgs,
      getValues: () => form,
    }),
    [validate, buildArgs, form],
  );

  const handleReceiptUpload = useCallback(
    (result: { storageId: Id<"_storage">; hash: string }) => {
      setForm((prev) => ({
        ...prev,
        receiptFileId: result.storageId,
        receiptImageHash: result.hash,
        sharedReceiptAcknowledged: undefined,
      }));
    },
    [],
  );

  const handleReceiptRemove = useCallback(() => {
    setForm((prev) => ({
      ...prev,
      receiptFileId: undefined,
      receiptImageHash: undefined,
      sharedReceiptAcknowledged: undefined,
    }));
  }, []);

  const handleAcknowledgeSharedReceipt = useCallback(() => {
    setForm((prev) => ({ ...prev, sharedReceiptAcknowledged: true }));
  }, []);

  // ------------------------------------------------------------------------
  // Render
  // ------------------------------------------------------------------------
  const amountNum = Number(form.amount) || 0;
  const showReceiptWarning = amountNum > RECEIPT_THRESHOLD && !form.receiptFileId;

  return (
    <div className="space-y-4">
      {banner}

      {/* Description */}
      <div className="space-y-2">
        <Label htmlFor="description">Description *</Label>
        <Input
          id="description"
          placeholder="What was this expense for?"
          value={form.description}
          onChange={(e) => updateField("description", e.target.value)}
          disabled={disabled}
        />
      </div>

      {/* Amount + Date */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="amount">Amount (IDR) *</Label>
          <Input
            id="amount"
            type="number"
            placeholder="0"
            min={1}
            step={1}
            value={form.amount}
            onChange={(e) => updateField("amount", e.target.value)}
            disabled={disabled}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="expenseDate">Expense Date *</Label>
          <Input
            id="expenseDate"
            type="date"
            value={form.expenseDate}
            onChange={(e) => updateField("expenseDate", e.target.value)}
            disabled={disabled}
          />
        </div>
      </div>

      {/* Expense Type + GL Account */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="expenseType">Expense Type *</Label>
          <Select
            value={form.expenseType}
            onValueChange={(v) =>
              setForm((prev) => ({
                ...prev,
                expenseType: v as "cogs" | "opex" | "other",
                accountId: "",
              }))
            }
            disabled={disabled}
          >
            <SelectTrigger id="expenseType">
              <SelectValue placeholder="Select type..." />
            </SelectTrigger>
            <SelectContent>
              {EXPENSE_TYPE_OPTIONS.map((opt) => (
                <SelectItem key={opt.value} value={opt.value}>
                  {opt.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label htmlFor="accountId">GL Account *</Label>
          <Select
            value={form.accountId}
            onValueChange={(v) => updateField("accountId", v)}
            disabled={disabled || !form.expenseType}
          >
            <SelectTrigger id="accountId">
              <SelectValue placeholder="Select account..." />
            </SelectTrigger>
            <SelectContent>
              {filteredAccounts.map((a) => (
                <SelectItem key={a._id} value={a._id}>
                  {a.code} - {a.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Vendor + Payment Method */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="vendorName">Vendor *</Label>
          <Input
            id="vendorName"
            placeholder="Vendor or store name"
            value={form.vendorName}
            onChange={(e) => updateField("vendorName", e.target.value)}
            disabled={disabled}
          />
        </div>
        {!hidePaymentMethod && (
          <div className="space-y-2">
            <Label htmlFor="paymentMethod">Payment Method</Label>
            <Select
              value={form.paymentMethod}
              onValueChange={(v) => updateField("paymentMethod", v as PaymentMethod)}
              disabled={disabled}
            >
              <SelectTrigger id="paymentMethod">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {PAYMENT_METHODS.map((pm) => (
                  <SelectItem key={pm.value} value={pm.value}>
                    <div className="flex flex-col">
                      <span>{pm.label}</span>
                      <span className="text-xs text-muted-foreground">{pm.description}</span>
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}
      </div>

      {/* Transaction ref (company_paid only) */}
      {form.paymentMethod === "company_paid" && (
        <div className="space-y-1.5">
          <Label htmlFor="transactionReference">Transaction Reference</Label>
          <Input
            id="transactionReference"
            placeholder="Bank ref number, Shopee order ID, BCA transaction ID..."
            value={form.transactionReference}
            onChange={(e) =>
              setForm((prev) => ({ ...prev, transactionReference: e.target.value }))
            }
            disabled={disabled}
          />
          <p className="text-xs text-muted-foreground">
            Optional: Enter the bank reference or transaction ID
          </p>
        </div>
      )}

      {/* Receipt */}
      <div className="space-y-2">
        <Label>
          Receipt{" "}
          {form.paymentMethod === "company_paid" || form.paymentMethod === "payment_request"
            ? "(required)"
            : amountNum > RECEIPT_THRESHOLD
              ? "(required for > Rp 50,000)"
              : "(optional)"}
        </Label>
        <ReceiptUpload
          generateUploadUrl={generateUploadUrl}
          onUpload={handleReceiptUpload}
          onRemove={handleReceiptRemove}
          currentFileId={form.receiptFileId}
          disabled={disabled}
        />
        {(form.paymentMethod === "company_paid" ||
          form.paymentMethod === "payment_request") &&
          !form.receiptFileId && (
            <p className="text-xs text-amber-600 dark:text-amber-400 flex items-center gap-1">
              <AlertTriangle className="h-3 w-3" />
              Receipt is required for all company-paid expenses
            </p>
          )}
        {form.paymentMethod === "employee_paid" && showReceiptWarning && (
          <p className="text-xs text-amber-600 dark:text-amber-400 flex items-center gap-1">
            <AlertTriangle className="h-3 w-3" />
            Receipt is required for expenses over Rp 50,000
          </p>
        )}
        {duplicateReceipt && !form.sharedReceiptAcknowledged && (
          <div className="rounded-md border border-amber-300 bg-amber-50 dark:border-amber-800 dark:bg-amber-950 p-3 space-y-2">
            <div className="flex items-start gap-2 text-sm text-amber-800 dark:text-amber-200">
              <Copy className="h-4 w-4 shrink-0 mt-0.5" />
              <div>
                <p className="font-medium">This receipt is already used</p>
                <p className="text-xs mt-0.5">
                  This receipt photo is attached to expense{" "}
                  <span className="font-mono font-medium">{duplicateReceipt.expenseNumber}</span>
                  {duplicateReceipt.description && (
                    <span> ({duplicateReceipt.description})</span>
                  )}
                  . If this receipt covers multiple line items for different expense categories, you can confirm reuse below.
                </p>
              </div>
            </div>
            <button
              type="button"
              className="text-xs font-medium text-amber-700 dark:text-amber-300 underline underline-offset-2 hover:text-amber-900 dark:hover:text-amber-100"
              onClick={handleAcknowledgeSharedReceipt}
            >
              Yes, I confirm this receipt covers multiple expenses
            </button>
          </div>
        )}
        {duplicateReceipt && form.sharedReceiptAcknowledged && (
          <p className="text-xs text-emerald-600 dark:text-emerald-400 flex items-center gap-1">
            Shared receipt confirmed -- same receipt as {duplicateReceipt.expenseNumber}. Approver
            will be notified.
          </p>
        )}
      </div>
    </div>
  );
});
