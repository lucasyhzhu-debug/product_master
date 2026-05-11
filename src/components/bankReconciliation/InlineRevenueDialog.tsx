/**
 * InlineRevenueDialog — Phase 73 D-18.
 *
 * Inline-creates an externalRevenue row from an unmatched CREDIT bank line.
 * `source` is a <Select> over the 8-literal `EXTERNAL_SOURCES` union, pre-
 * selected via mapChannelToSource when possible.
 */
import { useEffect, useState } from "react";
import { toast } from "sonner";
import type { Doc } from "../../../convex/_generated/dataModel";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Loader2 } from "lucide-react";
import {
  EXTERNAL_SOURCES,
  type ExternalSource,
} from "../../../convex/lib/externalSource";
import { resolvePlatform, platformDisplay } from "../../../convex/reports/platform";
import { mapChannelToSource } from "../../../convex/bankStatements/channelMapping";
import { useInlineCreateRevenue } from "@/hooks/convex/useBankReconciliation";
import {
  utcToWibDateStr,
  wibDateStrToUtcMs,
  wibMonthBoundsFromUtcMs,
} from "@/lib/dateUtils";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  line: Doc<"bankStatementLines"> | null;
}

export function InlineRevenueDialog({ open, onOpenChange, line }: Props) {
  const submit = useInlineCreateRevenue();
  const [submitting, setSubmitting] = useState(false);
  const [source, setSource] = useState<ExternalSource | "">("");
  const [transactionDate, setTransactionDate] = useState("");
  const [revenueGross, setRevenueGross] = useState("");
  const [periodStart, setPeriodStart] = useState("");
  const [periodEnd, setPeriodEnd] = useState("");

  // Pre-fill whenever the dialog opens for a line.
  useEffect(() => {
    if (!open || !line) return;
    const txDateStr = utcToWibDateStr(line.date);
    setTransactionDate(txDateStr);
    setRevenueGross(String(line.amountIdr));
    // Derive month bounds from the WIB date (not browser-local).
    const { start, end } = wibMonthBoundsFromUtcMs(line.date);
    setPeriodStart(utcToWibDateStr(start));
    setPeriodEnd(utcToWibDateStr(end));
    // Pre-select source via channel mapping when possible.
    const mapped = mapChannelToSource(line.linkedChannel);
    setSource(mapped ?? "");
  }, [open, line]);

  async function handleSubmit() {
    if (!line) return;
    if (!source) {
      toast.error("Please choose a revenue source.");
      return;
    }
    if (!transactionDate) {
      toast.error("Transaction date is required.");
      return;
    }
    const grossNum = Number(revenueGross);
    if (!Number.isFinite(grossNum) || grossNum <= 0) {
      toast.error("Revenue amount must be positive.");
      return;
    }

    setSubmitting(true);
    try {
      await submit({
        bankLineId: line._id,
        transactionDate: wibDateStrToUtcMs(transactionDate),
        revenueGross: grossNum,
        source,
        periodStart: periodStart ? wibDateStrToUtcMs(periodStart) : undefined,
        periodEnd: periodEnd ? wibDateStrToUtcMs(periodEnd) : undefined,
      });
      toast.success("Revenue record created and linked to line");
      onOpenChange(false);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to create revenue record.";
      toast.error(msg);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>Create revenue record from bank line</DialogTitle>
          <DialogDescription>
            Log external revenue tied to this credit line (D-18).
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Source picker — 8-literal union */}
          <div className="space-y-1.5">
            <Label htmlFor="revenue-source">Source *</Label>
            <Select
              value={source || undefined}
              onValueChange={(v) => setSource(v as ExternalSource)}
              disabled={submitting}
            >
              <SelectTrigger id="revenue-source">
                <SelectValue placeholder="Choose a platform…" />
              </SelectTrigger>
              <SelectContent>
                {EXTERNAL_SOURCES.map((s) => (
                  <SelectItem key={s} value={s}>
                    {platformDisplay(resolvePlatform({ source: s }).platform)}{" "}
                    <span className="text-xs text-muted-foreground ml-1">({s})</span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              One of the 8 tracked revenue sources. Channel &ldquo;
              {line?.linkedChannel ?? "—"}&rdquo; mapped to{" "}
              {source || "(no match — pick manually)"}.
            </p>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="revenue-transactionDate">Transaction Date *</Label>
            <Input
              id="revenue-transactionDate"
              type="date"
              value={transactionDate}
              onChange={(e) => setTransactionDate(e.target.value)}
              disabled={submitting}
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="revenue-gross">Revenue Gross (IDR) *</Label>
            <Input
              id="revenue-gross"
              type="number"
              min={1}
              step={1}
              value={revenueGross}
              onChange={(e) => setRevenueGross(e.target.value)}
              disabled={submitting}
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="revenue-periodStart">Period Start</Label>
              <Input
                id="revenue-periodStart"
                type="date"
                value={periodStart}
                onChange={(e) => setPeriodStart(e.target.value)}
                disabled={submitting}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="revenue-periodEnd">Period End</Label>
              <Input
                id="revenue-periodEnd"
                type="date"
                value={periodEnd}
                onChange={(e) => setPeriodEnd(e.target.value)}
                disabled={submitting}
              />
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={submitting}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={submitting}>
            {submitting && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
            Create revenue record
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
