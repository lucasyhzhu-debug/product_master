/**
 * Manual Journal Entry page.
 *
 * Template-based balance sheet transaction recording. 6 pre-wired templates
 * allow admins/managers to create journal entries without manual double-entry.
 *
 * Layout: PageHeader > Template cards grid > Inline accordion form > Period-filtered entries table.
 */
import { useState, useMemo, useCallback } from "react";
import {
  Wrench,
  Coins,
  Users,
  Building,
  Landmark,
  FileCheck,
  ChevronLeft,
  ChevronRight,
  Loader2,
} from "lucide-react";
import { AnimatePresence, motion } from "framer-motion";
import { PageHeader } from "@/components/layout/PageHeader";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  useManualJournalEntries,
  useCreateManualJournalEntry,
} from "@/hooks/convex/useManualJournal";
import { MONTH_NAMES } from "@/lib/financialHelpers";
import {
  type ExpensePeriodMode,
  getCurrentWibMonth,
  computePeriodRange,
  prevMonth,
  nextMonth,
  isCurrentOrFutureMonth,
  wibMidnightToUtc,
} from "@/lib/expenseAnalyticsPeriod";
import {
  utcToWibDateStr,
  wibDateStrToUtcMs,
  formatDateId,
} from "@/lib/dateUtils";
import { formatCurrency, cn } from "@/lib/utils";

// ---------------------------------------------------------------------------
// Template card configuration (must stay in sync with backend TEMPLATE_TYPES)
// ---------------------------------------------------------------------------

type TemplateType =
  | "equipment_purchase"
  | "loan_repayment"
  | "dividend_payment"
  | "capital_injection"
  | "receive_loan"
  | "tax_payment";

interface TemplateCardConfig {
  type: TemplateType;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  debitLabel: string;
  creditLabel: string;
  badgeColor: string;
}

const TEMPLATE_CARDS: TemplateCardConfig[] = [
  {
    type: "equipment_purchase",
    label: "Equipment Purchase",
    icon: Wrench,
    debitLabel: "1500 Fixed Assets",
    creditLabel: "1100 Cash",
    badgeColor: "bg-blue-100 text-blue-700",
  },
  {
    type: "loan_repayment",
    label: "Loan Repayment",
    icon: Coins,
    debitLabel: "2500 Loans Payable",
    creditLabel: "1100 Cash",
    badgeColor: "bg-green-100 text-green-700",
  },
  {
    type: "dividend_payment",
    label: "Dividend Payment",
    icon: Users,
    debitLabel: "3200 Retained Earnings",
    creditLabel: "1100 Cash",
    badgeColor: "bg-yellow-100 text-yellow-700",
  },
  {
    type: "capital_injection",
    label: "Capital Injection",
    icon: Building,
    debitLabel: "1100 Cash",
    creditLabel: "3100 Owner's Capital",
    badgeColor: "bg-purple-100 text-purple-700",
  },
  {
    type: "receive_loan",
    label: "Receive a Loan",
    icon: Landmark,
    debitLabel: "1100 Cash",
    creditLabel: "2500 Loans Payable",
    badgeColor: "bg-violet-100 text-violet-700",
  },
  {
    type: "tax_payment",
    label: "Tax Payment",
    icon: FileCheck,
    debitLabel: "2400 Tax Payable",
    creditLabel: "1100 Cash",
    badgeColor: "bg-pink-100 text-pink-700",
  },
];

// Map template type -> card config for table badge rendering
const TEMPLATE_MAP = new Map(TEMPLATE_CARDS.map((c) => [c.type, c]));

// ---------------------------------------------------------------------------
// ManualJournalEntry page
// ---------------------------------------------------------------------------

export function ManualJournalEntry() {
  // ---- Template selection state ----
  const [selectedTemplate, setSelectedTemplate] = useState<string | null>(null);

  // ---- Form state ----
  const todayWib = useMemo(() => utcToWibDateStr(Date.now()), []);
  const [formDate, setFormDate] = useState(todayWib);
  const [formAmount, setFormAmount] = useState("");
  const [formDescription, setFormDescription] = useState("");
  const [isSaving, setIsSaving] = useState(false);

  // ---- Period state (copied from ExpenseAnalytics) ----
  const [periodMode, setPeriodMode] = useState<ExpensePeriodMode>("month");
  const initMonth = useMemo(() => getCurrentWibMonth(), []);
  const [monthYear, setMonthYear] = useState(initMonth.year);
  const [monthIndex, setMonthIndex] = useState(initMonth.month);
  const [customStart, setCustomStart] = useState<number>(
    wibMidnightToUtc(initMonth.year, initMonth.month, 1)
  );
  const [customEnd, setCustomEnd] = useState<number>(
    wibMidnightToUtc(initMonth.year, initMonth.month + 1, 1)
  );

  const { periodStart, periodEnd } = useMemo(
    () =>
      computePeriodRange(periodMode, monthYear, monthIndex, customStart, customEnd),
    [periodMode, monthYear, monthIndex, customStart, customEnd]
  );

  // ---- All hooks before any conditional returns ----
  const entries = useManualJournalEntries(periodStart, periodEnd);
  const createEntry = useCreateManualJournalEntry();

  // ---- Month navigation callbacks ----
  const goToPreviousMonth = useCallback(() => {
    const prev = prevMonth(monthYear, monthIndex);
    setMonthYear(prev.year);
    setMonthIndex(prev.month);
  }, [monthYear, monthIndex]);

  const goToNextMonth = useCallback(() => {
    const next = nextMonth(monthYear, monthIndex);
    setMonthYear(next.year);
    setMonthIndex(next.month);
  }, [monthYear, monthIndex]);

  const goToCurrentMonth = useCallback(() => {
    const { year, month } = getCurrentWibMonth();
    setMonthYear(year);
    setMonthIndex(month);
  }, []);

  const isCurrentMonth = useMemo(
    () => isCurrentOrFutureMonth(monthYear, monthIndex),
    [monthYear, monthIndex]
  );

  const monthLabel = `${MONTH_NAMES[monthIndex]} ${monthYear}`;

  // ---- Template card click ----
  const handleCardClick = useCallback(
    (type: string) => {
      if (selectedTemplate === type) {
        setSelectedTemplate(null);
      } else {
        setSelectedTemplate(type);
        // Reset form fields when switching templates
        setFormDate(utcToWibDateStr(Date.now()));
        setFormAmount("");
        setFormDescription("");
      }
    },
    [selectedTemplate]
  );

  // ---- Save handler ----
  const handleSave = useCallback(async () => {
    if (!selectedTemplate) return;

    const amount = parseInt(formAmount, 10);
    if (!amount || amount <= 0) return;
    if (!formDescription.trim()) return;

    setIsSaving(true);
    try {
      await createEntry.mutate({
        templateType: selectedTemplate,
        date: wibDateStrToUtcMs(formDate),
        amount,
        description: formDescription.trim(),
      });
      // Success: collapse form, reset fields
      setSelectedTemplate(null);
      setFormDate(utcToWibDateStr(Date.now()));
      setFormAmount("");
      setFormDescription("");
    } catch {
      // Error toast handled by createMutationHook -- keep form open
    } finally {
      setIsSaving(false);
    }
  }, [selectedTemplate, formAmount, formDescription, formDate, createEntry]);

  // ---- Get selected template config ----
  const selectedConfig = selectedTemplate
    ? TEMPLATE_CARDS.find((c) => c.type === selectedTemplate)
    : null;

  return (
    <div>
      <PageHeader
        title="Manual Journal Entry"
        description="Record balance sheet transactions using pre-wired templates"
      />

      {/* Template cards grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 mb-6">
        {TEMPLATE_CARDS.map((card) => {
          const Icon = card.icon;
          const isSelected = selectedTemplate === card.type;
          return (
            <Card
              key={card.type}
              className={cn(
                "cursor-pointer transition-all hover:shadow-md",
                isSelected
                  ? "ring-2 ring-primary border-primary shadow-md"
                  : "hover:shadow-sm"
              )}
              onClick={() => handleCardClick(card.type)}
            >
              <CardContent className="p-4 flex items-center gap-3">
                <div
                  className={cn(
                    "p-2 rounded-lg",
                    isSelected ? "bg-primary/10" : "bg-muted"
                  )}
                >
                  <Icon className="h-5 w-5" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium">{card.label}</p>
                  <p className="text-xs text-muted-foreground truncate">
                    DR {card.debitLabel} / CR {card.creditLabel}
                  </p>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Inline accordion form */}
      <AnimatePresence mode="wait">
        {selectedConfig && (
          <motion.div
            key={selectedConfig.type}
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden mb-6"
          >
            <Card>
              <CardContent className="p-4 space-y-4">
                {/* Form fields */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div>
                    <label className="text-xs font-medium text-muted-foreground mb-1 block">
                      Date
                    </label>
                    <input
                      type="date"
                      className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
                      value={formDate}
                      onChange={(e) => setFormDate(e.target.value)}
                    />
                  </div>
                  <div>
                    <label className="text-xs font-medium text-muted-foreground mb-1 block">
                      Amount (IDR)
                    </label>
                    <Input
                      type="number"
                      min="1"
                      step="1"
                      placeholder="Amount (IDR)"
                      value={formAmount}
                      onChange={(e) => setFormAmount(e.target.value)}
                    />
                  </div>
                  <div>
                    <label className="text-xs font-medium text-muted-foreground mb-1 block">
                      Description
                    </label>
                    <Input
                      placeholder="e.g. Bought new mixer"
                      value={formDescription}
                      onChange={(e) => setFormDescription(e.target.value)}
                      required
                    />
                  </div>
                </div>

                {/* DR/CR preview */}
                <p className="text-xs text-muted-foreground">
                  DR {selectedConfig.debitLabel} / CR {selectedConfig.creditLabel}
                </p>

                {/* Action buttons */}
                <div className="flex items-center gap-2">
                  <Button
                    size="sm"
                    onClick={handleSave}
                    disabled={
                      isSaving ||
                      !formAmount ||
                      parseInt(formAmount, 10) <= 0 ||
                      !formDescription.trim()
                    }
                  >
                    {isSaving && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}
                    Save
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setSelectedTemplate(null)}
                    disabled={isSaving}
                  >
                    Cancel
                  </Button>
                </div>
              </CardContent>
            </Card>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Recent entries section */}
      <div className="space-y-4">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="text-lg font-semibold mr-2">Recent Entries</h2>

          {/* Mode toggle */}
          <div className="flex items-center gap-1">
            {(["month", "custom"] as const).map((mode) => (
              <Badge
                key={mode}
                variant={periodMode === mode ? "default" : "outline"}
                className="cursor-pointer text-xs capitalize"
                onClick={() => setPeriodMode(mode)}
              >
                {mode === "month" ? "Monthly" : "Custom Range"}
              </Badge>
            ))}
          </div>

          {/* Month navigation */}
          {periodMode === "month" && (
            <div className="flex items-center gap-1">
              <Button
                variant="outline"
                size="icon"
                className="h-7 w-7"
                onClick={goToPreviousMonth}
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <span className="text-sm font-medium min-w-[130px] text-center">
                {monthLabel}
              </span>
              <Button
                variant="outline"
                size="icon"
                className="h-7 w-7"
                onClick={goToNextMonth}
                disabled={isCurrentMonth}
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className="text-xs h-7"
                onClick={goToCurrentMonth}
              >
                Today
              </Button>
            </div>
          )}

          {/* Custom date inputs */}
          {periodMode === "custom" && (
            <div className="flex items-center gap-2">
              <input
                type="date"
                className="h-7 rounded-md border border-input bg-background px-2 text-xs"
                value={utcToWibDateStr(customStart)}
                onChange={(e) => {
                  if (e.target.value) setCustomStart(wibDateStrToUtcMs(e.target.value));
                }}
              />
              <span className="text-xs text-muted-foreground">to</span>
              <input
                type="date"
                className="h-7 rounded-md border border-input bg-background px-2 text-xs"
                value={utcToWibDateStr(customEnd)}
                onChange={(e) => {
                  if (e.target.value) setCustomEnd(wibDateStrToUtcMs(e.target.value));
                }}
              />
            </div>
          )}
        </div>

        {/* Entries table */}
        {entries === undefined ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : entries.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground text-sm">
            No manual journal entries for{" "}
            {periodMode === "month" ? monthLabel : "the selected period"}. Use the
            templates above to create one.
          </div>
        ) : (
          <div className="border rounded-lg overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[110px]">Entry #</TableHead>
                  <TableHead className="w-[100px]">Date</TableHead>
                  <TableHead className="w-[140px]">Type</TableHead>
                  <TableHead>Description</TableHead>
                  <TableHead className="text-right w-[130px]">Amount</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {entries.map((entry) => {
                  const tplConfig = entry.templateType
                    ? TEMPLATE_MAP.get(entry.templateType as TemplateType)
                    : undefined;
                  return (
                    <TableRow key={entry._id}>
                      <TableCell className="font-mono text-xs text-blue-600">
                        {entry.entryNumber}
                      </TableCell>
                      <TableCell className="text-xs">
                        {formatDateId(entry.date)}
                      </TableCell>
                      <TableCell>
                        {tplConfig ? (
                          <Badge
                            variant="secondary"
                            className={cn("text-xs", tplConfig.badgeColor)}
                          >
                            {tplConfig.label}
                          </Badge>
                        ) : (
                          <span className="text-xs text-muted-foreground">
                            {entry.templateType}
                          </span>
                        )}
                      </TableCell>
                      <TableCell>
                        <span className="truncate max-w-[200px] block text-sm">
                          {entry.description}
                        </span>
                      </TableCell>
                      <TableCell className="text-right text-sm font-medium">
                        {formatCurrency(entry.totalAmount)}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        )}
      </div>
    </div>
  );
}
