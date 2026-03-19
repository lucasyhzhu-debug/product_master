/**
 * Asset disposal dialog.
 *
 * Captures disposal type (sold/scrapped/written_off), date, and sale proceeds.
 * Shows gain/loss preview before confirming.
 */
import { useState, useMemo } from "react";
import { formatCurrency } from "@/lib/utils";
import { calculateDisposalGainLoss } from "@/lib/assetHelpers";
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

type DisposalType = "sold" | "scrapped" | "written_off";

interface DisposeAssetDialogProps {
  open: boolean;
  onClose: () => void;
  asset: {
    _id: string;
    name: string;
    cost: number;
    accumulatedDepreciation: number;
    netBookValue: number;
  };
}

export function DisposeAssetDialog({ open, onClose, asset }: DisposeAssetDialogProps) {
  const { mutate: disposeAsset } = useDisposeAsset();
  const [disposalType, setDisposalType] = useState<DisposalType>("scrapped");
  const [disposalDate, setDisposalDate] = useState("");
  const [saleProceeds, setSaleProceeds] = useState("0");
  const [submitting, setSubmitting] = useState(false);

  const proceedsNum = parseInt(saleProceeds || "0", 10) || 0;

  const gainLoss = useMemo(() => {
    return calculateDisposalGainLoss(
      asset.cost,
      asset.accumulatedDepreciation,
      disposalType === "sold" ? proceedsNum : 0
    );
  }, [asset.cost, asset.accumulatedDepreciation, disposalType, proceedsNum]);

  const handleConfirm = async () => {
    if (!disposalDate) return;

    setSubmitting(true);
    try {
      const dateMs = new Date(disposalDate + "T00:00:00+07:00").getTime();
      await disposeAsset({
        assetId: asset._id as any, // eslint-disable-line @typescript-eslint/no-explicit-any -- Convex Id<> branded type
        disposalType,
        disposalDate: dateMs,
        saleProceeds: disposalType === "sold" ? proceedsNum : 0,
      });
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

          {/* Gain/Loss Preview */}
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
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={submitting}>
            Cancel
          </Button>
          <Button
            variant="destructive"
            onClick={handleConfirm}
            disabled={submitting || !disposalDate}
          >
            {submitting ? "Processing..." : "Confirm Disposal"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
