/**
 * Asset disposal dialog.
 *
 * Captures disposal type (sold/scrapped/written_off/reclassify_to_expense),
 * date, sale proceeds, and optional reclassification fields.
 * Shows gain/loss preview (standard) or NBV breakdown (reclassify) before confirming.
 */
import { useState, useMemo, useEffect } from "react";
import { useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import { formatCurrency } from "@/lib/utils";
import { calculateDisposalGainLoss } from "@/lib/assetHelpers";
import { SearchableSelect } from "@/components/shared/SearchableSelect";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
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
import { useDisposeAsset } from "@/hooks/convex/useFixedAssets";
import { toast } from "sonner";

type DisposalType = "sold" | "scrapped" | "written_off" | "reclassify_to_expense";

// Mirror of CATEGORY_TO_EXPENSE_ACCOUNT in convex/fixedAssets/helpers.ts — keep in sync
const CATEGORY_DEFAULT_EXPENSE_CODE: Record<string, string> = {
  tanah: "6200",
  bangunan: "6200",
  kendaraan: "6200",
  peralatan_kantor: "6200",
  mesin_produksi: "6200",
  mebelair: "6200",
  perkakas: "6200",
  perbaikan_sewa: "6200",
  merek_dagang: "6200",
  hak_paten: "6200",
  perangkat_lunak: "6200",
};

interface DisposeAssetDialogProps {
  open: boolean;
  onClose: () => void;
  asset: {
    _id: string;
    name: string;
    cost: number;
    accumulatedDepreciation: number;
    netBookValue: number;
    category: string;
  };
}

export function DisposeAssetDialog({ open, onClose, asset }: DisposeAssetDialogProps) {
  const { mutate: disposeAsset } = useDisposeAsset();
  const [disposalType, setDisposalType] = useState<DisposalType>("scrapped");
  const [disposalDate, setDisposalDate] = useState("");
  const [saleProceeds, setSaleProceeds] = useState("0");
  const [submitting, setSubmitting] = useState(false);

  // Reclassify-specific state
  const [targetAccountId, setTargetAccountId] = useState<string | null>(null);
  const [submitterId, setSubmitterId] = useState<string | null>(null);

  // Data queries for reclassify fields (must be before any conditional returns)
  const accounts = useQuery(api.accounts.queries.list, { activeOnly: true });
  const users = useQuery(api.auth.queries.getActiveUsers);

  const proceedsNum = parseInt(saleProceeds || "0", 10) || 0;

  const gainLoss = useMemo(() => {
    return calculateDisposalGainLoss(
      asset.cost,
      asset.accumulatedDepreciation,
      disposalType === "sold" ? proceedsNum : 0
    );
  }, [asset.cost, asset.accumulatedDepreciation, disposalType, proceedsNum]);

  // Build expense account items for SearchableSelect
  const expenseAccountItems = useMemo(() => {
    if (!accounts) return [];
    return accounts
      .filter(a => a.isActive && (a.type === "opex" || a.type === "cogs" || a.type === "other"))
      .map(a => ({ value: a._id, label: a.name, sublabel: a.code }));
  }, [accounts]);

  // Build user items for SearchableSelect
  const userItems = useMemo(() => {
    if (!users) return [];
    return users.map(u => ({ value: u._id, label: u.name }));
  }, [users]);

  // Auto-map default expense account when reclassify_to_expense is selected
  useEffect(() => {
    if (disposalType === "reclassify_to_expense" && accounts && asset.category) {
      const defaultCode = CATEGORY_DEFAULT_EXPENSE_CODE[asset.category] ?? "6200";
      const defaultAccount = accounts.find(a => a.code === defaultCode);
      if (defaultAccount) {
        setTargetAccountId(defaultAccount._id);
      }
    }
  }, [disposalType, accounts, asset.category]);

  const handleConfirm = async () => {
    if (!disposalDate) return;
    if (disposalType === "reclassify_to_expense" && (!targetAccountId || !submitterId)) return;

    setSubmitting(true);
    try {
      const dateMs = new Date(disposalDate + "T00:00:00+07:00").getTime();
      const result = await disposeAsset({
        assetId: asset._id as any, // eslint-disable-line @typescript-eslint/no-explicit-any -- Convex Id<> branded type
        disposalType,
        disposalDate: dateMs,
        saleProceeds: disposalType === "sold" ? proceedsNum : 0,
        ...(disposalType === "reclassify_to_expense" ? {
          targetExpenseAccountId: targetAccountId as any, // eslint-disable-line @typescript-eslint/no-explicit-any
          submitterId: submitterId as any, // eslint-disable-line @typescript-eslint/no-explicit-any
        } : {}),
      });

      // Contextual success toasts (I-05: dialog handles all toasts, hook successMessage is empty)
      if (disposalType === "reclassify_to_expense" && result?.expenseNumber) {
        toast.success(`Asset reclassified to expense -- ${result.expenseNumber} created`);
      } else {
        toast.success("Asset disposed successfully");
      }

      onClose();
    } catch {
      // Error toast handled by hook
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Dispose Asset</DialogTitle>
          <DialogDescription>
            {asset.name} (NBV: {formatCurrency(asset.netBookValue)})
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Disposal Type */}
          <div className="space-y-1.5">
            <Label>Disposal Type</Label>
            <Select value={disposalType} onValueChange={(v) => setDisposalType(v as DisposalType)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="sold">Sold</SelectItem>
                <SelectItem value="scrapped">Scrapped</SelectItem>
                <SelectItem value="written_off">Written Off</SelectItem>
                <SelectItem value="reclassify_to_expense">Reclassify to Expense</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Disposal Date */}
          <div className="space-y-1.5">
            <Label htmlFor="disposal-date">Disposal Date *</Label>
            <Input
              id="disposal-date"
              type="date"
              value={disposalDate}
              onChange={(e) => setDisposalDate(e.target.value)}
            />
          </div>

          {/* Sale Proceeds (only for sold) */}
          {disposalType === "sold" && (
            <div className="space-y-1.5">
              <Label htmlFor="sale-proceeds">Sale Proceeds (IDR)</Label>
              <Input
                id="sale-proceeds"
                type="number"
                value={saleProceeds}
                onChange={(e) => setSaleProceeds(e.target.value)}
              />
            </div>
          )}

          {/* Reclassify-specific fields */}
          {disposalType === "reclassify_to_expense" && (
            <>
              {/* Target Expense Account */}
              <div className="space-y-1.5">
                <Label>Expense Account</Label>
                <SearchableSelect
                  items={expenseAccountItems}
                  value={targetAccountId}
                  onSelect={(value) => { setTargetAccountId(value); }}
                  placeholder="Select expense account"
                  searchPlaceholder="Search accounts..."
                />
              </div>

              {/* Expense Owner */}
              <div className="space-y-1.5">
                <Label>Expense Owner</Label>
                <SearchableSelect
                  items={userItems}
                  value={submitterId}
                  onSelect={(value) => { setSubmitterId(value); }}
                  placeholder="Select the person responsible for this expense"
                  searchPlaceholder="Search users..."
                />
              </div>

              {/* Warning text */}
              <p className="text-xs text-amber-600 dark:text-amber-400">
                This will reverse the asset capitalization and record {formatCurrency(asset.netBookValue)} as an operating expense. This cannot be undone.
              </p>
            </>
          )}

          {/* Gain/Loss Preview (standard disposal types) */}
          {disposalType !== "reclassify_to_expense" && (
            <div className="p-3 rounded-md bg-muted/50 space-y-1 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Net Book Value</span>
                <span>{formatCurrency(asset.netBookValue)}</span>
              </div>
              {disposalType === "sold" && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Sale Proceeds</span>
                  <span>{formatCurrency(proceedsNum)}</span>
                </div>
              )}
              <div className="flex justify-between border-t pt-1 mt-1 font-medium">
                <span>{gainLoss >= 0 ? "Gain on Disposal" : "Loss on Disposal"}</span>
                <span className={gainLoss >= 0 ? "text-emerald-600" : "text-red-600"}>
                  {formatCurrency(Math.abs(gainLoss))}
                  {gainLoss < 0 && " (loss)"}
                </span>
              </div>
            </div>
          )}

          {/* NBV Breakdown Preview (reclassify) */}
          {disposalType === "reclassify_to_expense" && (
            <div className="p-3 rounded-md bg-muted/50 space-y-1 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Asset Cost</span>
                <span>{formatCurrency(asset.cost)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Accumulated Depreciation</span>
                <span>{formatCurrency(asset.accumulatedDepreciation)}</span>
              </div>
              <div className="flex justify-between border-t pt-1 mt-1 font-medium">
                <span>Net Book Value (Expense Amount)</span>
                <span>{formatCurrency(asset.netBookValue)}</span>
              </div>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={submitting}>
            Cancel
          </Button>
          <Button
            variant="destructive"
            onClick={handleConfirm}
            disabled={
              submitting ||
              !disposalDate ||
              (disposalType === "reclassify_to_expense" && (!targetAccountId || !submitterId))
            }
          >
            {submitting ? "Processing..." : "Confirm Disposal"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
