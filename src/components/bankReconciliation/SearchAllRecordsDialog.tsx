/**
 * SearchAllRecordsDialog — Phase 73 D-06.
 *
 * Widens the candidate search beyond the default ±3-day window. Tabs over
 * the 4 matched types (Expense / Revenue / Reimbursement / Payroll), each
 * tab composes the corresponding typed search hook.
 */
import { useEffect, useState } from "react";
import type { Doc } from "../../../convex/_generated/dataModel";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import {
  useSearchExpenses,
  useSearchRevenue,
  useSearchReimbursements,
  useSearchPayroll,
} from "@/hooks/convex/useBankReconciliation";
import { formatCurrency } from "@/lib/utils";
import { formatDateId } from "@/lib/dateUtils";
import type { MatchedType } from "./CandidateRow";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  line: Doc<"bankStatementLines"> | null;
  defaultType?: MatchedType;
  onCandidateSelected: (type: MatchedType, id: string) => void;
}

type TabKey = MatchedType;

export function SearchAllRecordsDialog({
  open,
  onOpenChange,
  line,
  defaultType = "expense",
  onCandidateSelected,
}: Props) {
  const [activeTab, setActiveTab] = useState<TabKey>(defaultType);
  const [searchTerm, setSearchTerm] = useState("");
  const [amountFilter, setAmountFilter] = useState("");

  useEffect(() => {
    if (!open) return;
    setActiveTab(defaultType);
    setSearchTerm("");
    setAmountFilter(line?.amountIdr ? String(line.amountIdr) : "");
  }, [open, line, defaultType]);

  const amountNum = Number(amountFilter);
  const amountArg = Number.isFinite(amountNum) && amountNum > 0 ? amountNum : undefined;
  const termArg = searchTerm.trim() || undefined;

  const expenses = useSearchExpenses({
    amountIdr: amountArg,
    searchTerm: termArg,
    skip: !open || activeTab !== "expense",
  });
  const revenue = useSearchRevenue({
    amountIdr: amountArg,
    searchTerm: termArg,
    skip: !open || activeTab !== "revenue",
  });
  const reimbursements = useSearchReimbursements({
    amountIdr: amountArg,
    searchTerm: termArg,
    skip: !open || activeTab !== "reimbursement",
  });
  const payroll = useSearchPayroll({
    amountIdr: amountArg,
    searchTerm: termArg,
    skip: !open || activeTab !== "payroll",
  });

  function renderResults(
    type: MatchedType,
    rows:
      | Array<{
          _id: string;
          amount?: number;
          amountIdr?: number;
          revenueGross?: number;
          totalAmount?: number;
          date?: number;
          expenseDate?: number;
          transactionDate?: number;
          createdAt?: number;
          description?: string;
          vendorName?: string;
          batchNumber?: string;
          source?: string;
        }>
      | undefined,
  ) {
    if (rows === undefined) {
      return (
        <p className="text-sm text-muted-foreground py-6 text-center">
          Loading…
        </p>
      );
    }
    if (rows.length === 0) {
      return (
        <p className="text-sm text-muted-foreground py-6 text-center">
          No results. Try widening the search.
        </p>
      );
    }
    return (
      <ul className="divide-y">
        {rows.map((r) => {
          const amount =
            r.amount ?? r.amountIdr ?? r.revenueGross ?? r.totalAmount ?? 0;
          const date =
            r.expenseDate ?? r.transactionDate ?? r.date ?? r.createdAt ?? 0;
          const label =
            r.description ??
            r.vendorName ??
            r.batchNumber ??
            r.source ??
            "(no label)";
          return (
            <li key={r._id}>
              <button
                type="button"
                onClick={() => {
                  onCandidateSelected(type, r._id);
                  onOpenChange(false);
                }}
                className="w-full text-left px-3 py-2 hover:bg-muted/50 flex items-center justify-between gap-3"
              >
                <div className="min-w-0">
                  <p className="text-sm font-medium truncate">{label}</p>
                  <p className="text-xs text-muted-foreground">
                    {date ? formatDateId(date) : "—"}
                  </p>
                </div>
                <span className="text-sm font-mono tabular-nums whitespace-nowrap">
                  {formatCurrency(amount)}
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Search all records</DialogTitle>
          <DialogDescription>
            Find a matching record outside the default ±3-day window.
          </DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label htmlFor="search-term">Keyword</Label>
            <Input
              id="search-term"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Vendor, description, batch…"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="amount-filter">Amount (IDR)</Label>
            <Input
              id="amount-filter"
              type="number"
              value={amountFilter}
              onChange={(e) => setAmountFilter(e.target.value)}
              placeholder="0 to ignore"
            />
          </div>
        </div>

        <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as TabKey)}>
          <TabsList>
            <TabsTrigger value="expense">Expense</TabsTrigger>
            <TabsTrigger value="revenue">Revenue</TabsTrigger>
            <TabsTrigger value="reimbursement">Reimbursement</TabsTrigger>
            <TabsTrigger value="payroll">Payroll</TabsTrigger>
          </TabsList>
          <TabsContent value="expense" className="mt-3 border rounded-md">
            {renderResults("expense", expenses)}
          </TabsContent>
          <TabsContent value="revenue" className="mt-3 border rounded-md">
            {renderResults("revenue", revenue)}
          </TabsContent>
          <TabsContent value="reimbursement" className="mt-3 border rounded-md">
            {renderResults("reimbursement", reimbursements)}
          </TabsContent>
          <TabsContent value="payroll" className="mt-3 border rounded-md">
            {renderResults("payroll", payroll)}
          </TabsContent>
        </Tabs>

        <div className="flex justify-end mt-3">
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Close
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
