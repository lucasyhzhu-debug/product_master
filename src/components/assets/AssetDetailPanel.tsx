/**
 * Asset detail panel (sheet / side panel).
 *
 * Shows all asset fields, photo gallery, characteristics, depreciation summary,
 * recent depreciation history, edit/dispose actions.
 */
import { useState, useCallback } from "react";
import { Pencil, ImageIcon, FileText } from "lucide-react";
import { formatCurrency } from "@/lib/utils";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { useFixedAsset, useUpdateAsset } from "@/hooks/convex/useFixedAssets";
import { useAuth } from "@/contexts/AuthContext";
import { DisposeAssetDialog } from "./DisposeAssetDialog";

const STATUS_BADGE: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline" }> = {
  active: { label: "Active", variant: "default" },
  fully_depreciated: { label: "Fully Depreciated", variant: "secondary" },
  disposed: { label: "Disposed", variant: "outline" },
};

interface AssetDetailPanelProps {
  assetId: string | undefined;
  open: boolean;
  onClose: () => void;
}

export function AssetDetailPanel({ assetId, open, onClose }: AssetDetailPanelProps) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const asset = useFixedAsset(assetId as any);
  const { user } = useAuth();
  const { mutate: updateAsset } = useUpdateAsset();
  const isAdmin = user?.role === "admin";

  const [editing, setEditing] = useState(false);
  const [editName, setEditName] = useState("");
  const [editLocation, setEditLocation] = useState("");
  const [disposeOpen, setDisposeOpen] = useState(false);

  const startEditing = useCallback(() => {
    if (!asset) return;
    setEditName(asset.name);
    setEditLocation(asset.location || "");
    setEditing(true);
  }, [asset]);

  const saveEdit = useCallback(async () => {
    if (!asset) return;
    try {
      await updateAsset({
        assetId: asset._id as any, // eslint-disable-line @typescript-eslint/no-explicit-any -- Convex Id<> branded type
        name: editName.trim() || undefined,
        location: editLocation.trim() || undefined,
      });
      setEditing(false);
    } catch {
      // Error toast handled by hook
    }
  }, [asset, editName, editLocation, updateAsset]);

  if (!open) return null;

  if (asset === undefined) {
    return (
      <Sheet open={open} onOpenChange={(v) => !v && onClose()}>
        <SheetContent className="w-[420px] sm:max-w-[420px] overflow-y-auto">
          <SheetHeader>
            <SheetTitle>Asset Details</SheetTitle>
          </SheetHeader>
          <div className="py-12 text-center text-sm text-muted-foreground">
            Loading...
          </div>
        </SheetContent>
      </Sheet>
    );
  }

  if (asset === null) {
    return (
      <Sheet open={open} onOpenChange={(v) => !v && onClose()}>
        <SheetContent className="w-[420px] sm:max-w-[420px]">
          <SheetHeader>
            <SheetTitle>Asset Not Found</SheetTitle>
          </SheetHeader>
          <div className="py-12 text-center text-sm text-muted-foreground">
            This asset may have been deleted.
          </div>
        </SheetContent>
      </Sheet>
    );
  }

  const depreciableAmount = asset.cost - asset.salvageValue;
  const depreciationProgress =
    depreciableAmount > 0
      ? Math.min(100, Math.round((asset.accumulatedDepreciation / depreciableAmount) * 100))
      : 0;

  const statusBadge = STATUS_BADGE[asset.status] || { label: asset.status, variant: "outline" as const };

  const formatDate = (ms: number) => {
    const d = new Date(ms);
    return d.toLocaleDateString("id-ID", { year: "numeric", month: "short", day: "numeric" });
  };

  return (
    <>
      <Sheet open={open} onOpenChange={(v) => !v && onClose()}>
        <SheetContent className="w-[420px] sm:max-w-[420px] overflow-y-auto">
          <SheetHeader className="mb-4">
            <div className="flex items-start justify-between">
              <div>
                <SheetTitle className="text-lg">{asset.name}</SheetTitle>
                <div className="flex items-center gap-2 mt-1">
                  <span className="text-xs text-muted-foreground">{asset.assetNumber}</span>
                  <Badge variant={statusBadge.variant} className="text-xs">
                    {statusBadge.label}
                  </Badge>
                </div>
              </div>
              {asset.status !== "disposed" && (
                <Button variant="ghost" size="icon" className="h-8 w-8" onClick={startEditing}>
                  <Pencil className="h-4 w-4" />
                </Button>
              )}
            </div>
          </SheetHeader>

          {/* Photo Gallery */}
          {asset.attachmentUrls && asset.attachmentUrls.length > 0 && (
            <div className="mb-4">
              <div className="grid grid-cols-3 gap-2">
                {asset.attachmentUrls.map((url, i) =>
                  url ? (
                    <a
                      key={i}
                      href={url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="aspect-square rounded-md overflow-hidden border bg-muted"
                    >
                      <img
                        src={url}
                        alt={`Attachment ${i + 1}`}
                        className="w-full h-full object-cover"
                      />
                    </a>
                  ) : (
                    <div key={i} className="aspect-square rounded-md border bg-muted flex items-center justify-center">
                      <ImageIcon className="h-6 w-6 text-muted-foreground" />
                    </div>
                  )
                )}
              </div>
            </div>
          )}

          {/* Editing form */}
          {editing ? (
            <div className="space-y-3 mb-4 p-3 border rounded-md bg-muted/30">
              <div className="space-y-1.5">
                <Label htmlFor="edit-name">Name</Label>
                <Input
                  id="edit-name"
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="edit-location">Location</Label>
                <Input
                  id="edit-location"
                  value={editLocation}
                  onChange={(e) => setEditLocation(e.target.value)}
                />
              </div>
              <div className="flex gap-2">
                <Button size="sm" onClick={saveEdit}>Save</Button>
                <Button size="sm" variant="outline" onClick={() => setEditing(false)}>Cancel</Button>
              </div>
            </div>
          ) : null}

          {/* Asset info grid */}
          <div className="space-y-2 text-sm mb-4">
            <InfoRow label="Category" value={asset.categoryLabel} />
            <InfoRow label="Acquisition Date" value={formatDate(asset.acquisitionDate)} />
            <InfoRow label="Cost" value={formatCurrency(asset.cost)} />
            <InfoRow label="Salvage Value" value={formatCurrency(asset.salvageValue)} />
            <InfoRow label="Useful Life" value={`${asset.usefulLifeMonths} months`} />
            {asset.location && <InfoRow label="Location" value={asset.location} />}
            {asset.disposalDate && (
              <>
                <InfoRow label="Disposal Date" value={formatDate(asset.disposalDate)} />
                <InfoRow label="Disposal Type" value={asset.disposalType || "-"} />
                {asset.saleProceeds !== undefined && asset.saleProceeds > 0 && (
                  <InfoRow label="Sale Proceeds" value={formatCurrency(asset.saleProceeds)} />
                )}
              </>
            )}
          </div>

          <Separator className="my-3" />

          {/* Depreciation summary */}
          {asset.depreciable && (
            <div className="mb-4 space-y-3">
              <h3 className="text-sm font-semibold">Depreciation</h3>
              <div className="space-y-2">
                <InfoRow label="Monthly Amount" value={formatCurrency(asset.monthlyDepreciation)} />
                <InfoRow label="Accumulated" value={formatCurrency(asset.accumulatedDepreciation)} />
                <InfoRow label="Net Book Value" value={formatCurrency(asset.netBookValue)} />
                {asset.lastDepreciationMonth && (
                  <InfoRow label="Last Posted" value={asset.lastDepreciationMonth} />
                )}
              </div>
              <div className="space-y-1">
                <div className="flex justify-between text-xs text-muted-foreground">
                  <span>Depreciation Progress</span>
                  <span>{depreciationProgress}%</span>
                </div>
                <Progress value={depreciationProgress} className="h-2" />
              </div>
            </div>
          )}

          {/* Characteristics */}
          {asset.characteristics && asset.characteristics.length > 0 && (
            <div className="mb-4">
              <h3 className="text-sm font-semibold mb-2">Characteristics</h3>
              <div className="space-y-1">
                {asset.characteristics.map((c: { key: string; value: string }, i: number) => (
                  <div key={i} className="flex justify-between text-sm">
                    <span className="text-muted-foreground">{c.key}</span>
                    <span className="font-medium">{c.value}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Depreciation History */}
          {asset.depreciationHistory && asset.depreciationHistory.length > 0 && (
            <div className="mb-4">
              <Separator className="my-3" />
              <h3 className="text-sm font-semibold mb-2">Recent Depreciation JEs</h3>
              <div className="space-y-1.5">
                {asset.depreciationHistory.map((je: { _id: string; entryNumber: string; date: number; description: string }) => (
                  <div key={je._id} className="flex items-center gap-2 text-xs">
                    <FileText className="h-3 w-3 text-muted-foreground shrink-0" />
                    <span className="font-mono">{je.entryNumber}</span>
                    <span className="text-muted-foreground">{formatDate(je.date)}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Actions */}
          {isAdmin && asset.status !== "disposed" && (
            <div className="mt-4 pt-4 border-t">
              <Button
                variant="destructive"
                size="sm"
                onClick={() => setDisposeOpen(true)}
              >
                Dispose Asset
              </Button>
            </div>
          )}
        </SheetContent>
      </Sheet>

      {/* Dispose dialog */}
      {disposeOpen && (
        <DisposeAssetDialog
          open={disposeOpen}
          onClose={() => setDisposeOpen(false)}
          asset={{
            _id: asset._id,
            name: asset.name,
            cost: asset.cost,
            accumulatedDepreciation: asset.accumulatedDepreciation,
            netBookValue: asset.netBookValue,
            category: asset.category,
          }}
        />
      )}
    </>
  );
}

/** Simple key-value row for asset details */
function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium text-right">{value}</span>
    </div>
  );
}
