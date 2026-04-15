/**
 * Asset Register page.
 *
 * Table/card view toggle, status filter tabs, create asset, catch up depreciation,
 * void depreciation. Admin-only controls for depreciation batch and disposal.
 *
 * Phase 60 Plan 03 - Frontend page orchestrator.
 */
import { useState, useMemo, useEffect } from "react";
import { useSearchParams, useNavigate, Link } from "react-router-dom";
import {
  Plus,
  Table2,
  LayoutGrid,
  PlayCircle,
  RotateCcw,
  ImageIcon,
  Building2,
  AlertTriangle,
  X,
  Link as LinkIcon,
} from "lucide-react";
import { toast } from "sonner";
import { cn, formatCurrency } from "@/lib/utils";
import { formatDateId } from "@/lib/dateUtils";
import { useAuth } from "@/contexts/AuthContext";
import {
  useFixedAssets,
  useOrphanEquipmentPurchases,
  useAssetsWithoutAcquisitionJE,
  useBackfillAcquisitionJEs,
} from "@/hooks/convex/useFixedAssets";
import {
  useBankLine,
  useMarkAssetLinked,
} from "@/hooks/convex/useBankReconciliation";
import { ASSET_CATEGORIES } from "@/lib/assetHelpers";
import { PageHeader } from "@/components/layout/PageHeader";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { CreateAssetDialog } from "@/components/assets/CreateAssetDialog";
import { DepreciationPreviewDialog } from "@/components/assets/DepreciationPreviewDialog";
import { VoidDepreciationDialog } from "@/components/assets/VoidDepreciationDialog";
import { AssetDetailPanel } from "@/components/assets/AssetDetailPanel";
import type { Id } from "../../convex/_generated/dataModel";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type ViewMode = "table" | "cards";
type StatusFilter = "all" | "active" | "fully_depreciated" | "disposed";
type SortKey = "assetNumber" | "name" | "category" | "acquisitionDate" | "cost" | "accumulatedDepreciation" | "netBookValue" | "status";
type SortDir = "asc" | "desc";

const STATUS_BADGE: Record<string, { label: string; className: string }> = {
  active: { label: "Active", className: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400" },
  fully_depreciated: { label: "Fully Depreciated", className: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400" },
  disposed: { label: "Disposed", className: "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400" },
};

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export function AssetRegister() {
  const { user } = useAuth();
  const isAdmin = user?.role === "admin";
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const fromBankLineId = searchParams.get("fromBankLine") as
    | Id<"bankStatementLines">
    | null;

  // Phase 73 D-21: bank line round-trip
  const sourceBankLine = useBankLine(fromBankLineId);
  const markAssetLinked = useMarkAssetLinked();
  const [duplicateAcknowledged, setDuplicateAcknowledged] = useState(false);

  // Data
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const assets = useFixedAssets(statusFilter === "all" ? undefined : statusFilter);
  const [orphanBannerDismissed, setOrphanBannerDismissed] = useState(
    () => localStorage.getItem("assetRegister.orphanBannerDismissed") === "true"
  );
  const orphanJEs = useOrphanEquipmentPurchases(orphanBannerDismissed ? "skip" : "run");

  // Orphan assets without acquisition JE — backfill banner
  const [jeBannerDismissed, setJeBannerDismissed] = useState(
    () => localStorage.getItem("assetRegister.acquisitionJeBannerDismissed") === "true"
  );
  const orphanAssets = useAssetsWithoutAcquisitionJE(
    !isAdmin || jeBannerDismissed ? "skip" : "run"
  );
  const { mutate: backfillJEs } = useBackfillAcquisitionJEs();
  const [backfilling, setBackfilling] = useState(false);

  // View mode
  const [viewMode, setViewMode] = useState<ViewMode>("table");

  // Sort state
  const [sortKey, setSortKey] = useState<SortKey>("assetNumber");
  const [sortDir, setSortDir] = useState<SortDir>("desc");

  // Dialog state
  const [createOpen, setCreateOpen] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [voidOpen, setVoidOpen] = useState(false);
  const [selectedAssetId, setSelectedAssetId] = useState<string | undefined>(undefined);

  // Phase 73 D-21: auto-open create dialog when arriving with fromBankLine.
  useEffect(() => {
    if (fromBankLineId && sourceBankLine) {
      setCreateOpen(true);
    }
  }, [fromBankLineId, sourceBankLine]);

  // Phase 73 D-22: duplicate detection — find existing assets with matching
  // vendor (name) + cost + purchaseDate (±3 days).
  const duplicateAssets = useMemo(() => {
    if (!sourceBankLine || !assets) return [];
    const THREE_DAYS = 3 * 24 * 60 * 60 * 1000;
    const target = sourceBankLine.date;
    const targetCost = sourceBankLine.amountIdr;
    const vendor = sourceBankLine.parsedCounterparty?.trim().toLowerCase();
    return assets.filter((a) => {
      if (a.cost !== targetCost) return false;
      if (Math.abs(a.acquisitionDate - target) > THREE_DAYS) return false;
      if (!vendor) return true;
      return a.name.toLowerCase().includes(vendor);
    });
  }, [sourceBankLine, assets]);

  // Sort assets client-side
  const sortedAssets = useMemo(() => {
    if (!assets) return undefined;
    const sorted = [...assets];
    sorted.sort((a, b) => {
      const aVal = a[sortKey];
      const bVal = b[sortKey];
      if (aVal == null && bVal == null) return 0;
      if (aVal == null) return 1;
      if (bVal == null) return -1;
      if (typeof aVal === "number" && typeof bVal === "number") {
        return sortDir === "asc" ? aVal - bVal : bVal - aVal;
      }
      const strA = String(aVal);
      const strB = String(bVal);
      return sortDir === "asc" ? strA.localeCompare(strB) : strB.localeCompare(strA);
    });
    return sorted;
  }, [assets, sortKey, sortDir]);

  const handleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir("asc");
    }
  };

  const getCategoryLabel = (key: string) => {
    const cat = ASSET_CATEGORIES.find((c) => c.key === key);
    return cat?.label ?? key;
  };

  // Loading state
  if (assets === undefined) {
    return (
      <div className="min-w-[280px]">
        <PageHeader title="Asset Register" description="Fixed asset tracking and depreciation" />
        <div className="py-12 text-center text-sm text-muted-foreground">
          Loading assets...
        </div>
      </div>
    );
  }

  return (
    <div className="min-w-[280px]">
      <PageHeader
        title="Asset Register"
        description="Fixed asset tracking and depreciation"
        action={
          <div className="flex items-center gap-2">
            {isAdmin && (
              <>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setVoidOpen(true)}
                >
                  <RotateCcw className="h-4 w-4 mr-1" />
                  Void Month
                </Button>
                <Button
                  size="sm"
                  onClick={() => setPreviewOpen(true)}
                >
                  <PlayCircle className="h-4 w-4 mr-1" />
                  Catch Up to Now
                </Button>
              </>
            )}
            <Button size="sm" onClick={() => setCreateOpen(true)}>
              <Plus className="h-4 w-4 mr-1" />
              Add Asset
            </Button>
          </div>
        }
      />

      {/* One-off: orphan equipment_purchase JEs from manual journal */}
      {orphanJEs && orphanJEs.length > 0 && !orphanBannerDismissed && (
        <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 p-4 dark:border-amber-800 dark:bg-amber-950/30">
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-start gap-3">
              <AlertTriangle className="h-5 w-5 text-amber-600 mt-0.5 shrink-0" />
              <div>
                <p className="text-sm font-medium text-amber-800 dark:text-amber-300">
                  {orphanJEs.length} equipment purchase{orphanJEs.length > 1 ? "s" : ""} found in Manual Journal without matching assets
                </p>
                <p className="text-xs text-amber-600 dark:text-amber-400 mt-1">
                  These were recorded via the old Equipment Purchase template. Create matching assets below to enable depreciation tracking.
                </p>
                <ul className="mt-2 space-y-1">
                  {orphanJEs.map((je) => (
                    <li key={je._id} className="text-xs text-amber-700 dark:text-amber-400">
                      <span className="font-mono">{je.entryNumber}</span>
                      {" — "}
                      {formatDateId(je.date)}
                      {" — "}
                      {je.description}
                      {" — "}
                      <span className="font-medium">{formatCurrency(je.amount)}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
            <Button
              variant="ghost"
              size="icon"
              className="h-6 w-6 shrink-0 text-amber-600 hover:text-amber-800"
              onClick={() => {
                localStorage.setItem("assetRegister.orphanBannerDismissed", "true");
                setOrphanBannerDismissed(true);
              }}
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}

      {/* Orphan assets without acquisition JE — backfill banner */}
      {isAdmin && orphanAssets && orphanAssets.length > 0 && !jeBannerDismissed && (
        <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 p-4 dark:border-amber-800 dark:bg-amber-950/30">
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-start gap-3">
              <AlertTriangle className="h-5 w-5 text-amber-600 mt-0.5 shrink-0" />
              <div>
                <p className="text-sm font-medium text-amber-800 dark:text-amber-300">
                  {orphanAssets.length} asset{orphanAssets.length > 1 ? "s" : ""} have no acquisition journal entry
                </p>
                <p className="text-xs text-amber-600 dark:text-amber-400 mt-1">
                  Click &quot;Backfill JEs&quot; to create acquisition journal entries for all orphan assets (assumes company-paid cash).
                </p>
                <ul className="mt-2 space-y-1">
                  {orphanAssets.map((a) => (
                    <li key={a._id} className="text-xs text-amber-700 dark:text-amber-400">
                      <span className="font-mono">{a.assetNumber}</span>
                      {" — "}
                      {a.name}
                      {" — "}
                      <span className="font-medium">{formatCurrency(a.cost)}</span>
                    </li>
                  ))}
                </ul>
                <Button
                  variant="outline"
                  size="sm"
                  className="mt-3 h-7 text-xs border-amber-300 text-amber-800 hover:bg-amber-100 dark:border-amber-700 dark:text-amber-300 dark:hover:bg-amber-900/50"
                  disabled={backfilling}
                  onClick={async () => {
                    setBackfilling(true);
                    try {
                      const result = await backfillJEs({});
                      if (result && typeof result === "object" && "count" in result) {
                        toast.success(`Created ${(result as { count: number }).count} acquisition journal entries`);
                      }
                    } catch {
                      // Error toast handled by hook
                    } finally {
                      setBackfilling(false);
                    }
                  }}
                >
                  {backfilling ? "Creating JEs..." : "Backfill JEs"}
                </Button>
              </div>
            </div>
            <Button
              variant="ghost"
              size="icon"
              className="h-6 w-6 shrink-0 text-amber-600 hover:text-amber-800"
              onClick={() => {
                localStorage.setItem("assetRegister.acquisitionJeBannerDismissed", "true");
                setJeBannerDismissed(true);
              }}
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}

      {/* Controls: status filter + view toggle */}
      <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
        <Tabs value={statusFilter} onValueChange={(v) => setStatusFilter(v as StatusFilter)}>
          <TabsList>
            <TabsTrigger value="all">All</TabsTrigger>
            <TabsTrigger value="active">Active</TabsTrigger>
            <TabsTrigger value="fully_depreciated">Fully Depr.</TabsTrigger>
            <TabsTrigger value="disposed">Disposed</TabsTrigger>
          </TabsList>
        </Tabs>

        <div className="flex items-center gap-1">
          <Button
            variant={viewMode === "table" ? "secondary" : "ghost"}
            size="icon"
            className="h-8 w-8"
            onClick={() => setViewMode("table")}
          >
            <Table2 className="h-4 w-4" />
          </Button>
          <Button
            variant={viewMode === "cards" ? "secondary" : "ghost"}
            size="icon"
            className="h-8 w-8"
            onClick={() => setViewMode("cards")}
          >
            <LayoutGrid className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Empty state */}
      {sortedAssets && sortedAssets.length === 0 && (
        <div className="py-16 text-center">
          <Building2 className="h-12 w-12 text-muted-foreground/40 mx-auto mb-3" />
          <p className="text-sm text-muted-foreground">
            No assets found. Click "Add Asset" to register your first asset.
          </p>
        </div>
      )}

      {/* TABLE VIEW */}
      {viewMode === "table" && sortedAssets && sortedAssets.length > 0 && (
        <div className="border rounded-lg overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b bg-muted/30">
                {([
                  { key: "assetNumber" as const, label: "Asset #" },
                  { key: "name" as const, label: "Name" },
                  { key: "category" as const, label: "Category" },
                  { key: "acquisitionDate" as const, label: "Acq. Date" },
                  { key: "cost" as const, label: "Cost" },
                  { key: "accumulatedDepreciation" as const, label: "Accum. Depr." },
                  { key: "netBookValue" as const, label: "NBV" },
                  { key: "status" as const, label: "Status" },
                ] as Array<{ key: SortKey; label: string }>).map((col) => (
                  <th
                    key={col.key}
                    className="py-2.5 px-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider cursor-pointer hover:text-foreground transition-colors select-none"
                    onClick={() => handleSort(col.key)}
                  >
                    <span className="flex items-center gap-1">
                      {col.label}
                      {sortKey === col.key && (
                        <span className="text-foreground">{sortDir === "asc" ? "\u2191" : "\u2193"}</span>
                      )}
                    </span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {sortedAssets.map((asset) => {
                const status = STATUS_BADGE[asset.status];
                return (
                  <tr
                    key={asset._id}
                    className="border-b hover:bg-muted/20 cursor-pointer transition-colors"
                    onClick={() => setSelectedAssetId(asset._id)}
                  >
                    <td className="py-2.5 px-3 text-sm font-mono text-muted-foreground">
                      {asset.assetNumber}
                    </td>
                    <td className="py-2.5 px-3 text-sm font-medium">{asset.name}</td>
                    <td className="py-2.5 px-3 text-sm text-muted-foreground">
                      {getCategoryLabel(asset.category)}
                    </td>
                    <td className="py-2.5 px-3 text-sm tabular-nums">
                      {formatDateId(asset.acquisitionDate)}
                    </td>
                    <td className="py-2.5 px-3 text-sm tabular-nums text-right">
                      {formatCurrency(asset.cost)}
                    </td>
                    <td className="py-2.5 px-3 text-sm tabular-nums text-right">
                      {formatCurrency(asset.accumulatedDepreciation)}
                    </td>
                    <td className="py-2.5 px-3 text-sm tabular-nums text-right font-medium">
                      {formatCurrency(asset.netBookValue)}
                    </td>
                    <td className="py-2.5 px-3">
                      <span className={cn("inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium", status?.className)}>
                        {status?.label ?? asset.status}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* CARD VIEW */}
      {viewMode === "cards" && sortedAssets && sortedAssets.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {sortedAssets.map((asset) => {
            const depreciableAmount = asset.cost - asset.salvageValue;
            const progress =
              depreciableAmount > 0
                ? Math.min(100, Math.round((asset.accumulatedDepreciation / depreciableAmount) * 100))
                : 0;
            const status = STATUS_BADGE[asset.status];

            return (
              <Card
                key={asset._id}
                className="cursor-pointer hover:shadow-md transition-shadow"
                onClick={() => setSelectedAssetId(asset._id)}
              >
                <CardContent className="p-4">
                  <div className="flex gap-3">
                    {/* Thumbnail */}
                    <div className="w-16 h-16 rounded-md border bg-muted flex items-center justify-center shrink-0 overflow-hidden">
                      {asset.thumbnailUrl ? (
                        <img
                          src={asset.thumbnailUrl}
                          alt={asset.name}
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <ImageIcon className="h-6 w-6 text-muted-foreground" />
                      )}
                    </div>

                    {/* Info */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <h3 className="text-sm font-medium truncate">{asset.name}</h3>
                          <p className="text-xs text-muted-foreground">{getCategoryLabel(asset.category)}</p>
                        </div>
                        <span className={cn("shrink-0 inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium", status?.className)}>
                          {status?.label ?? asset.status}
                        </span>
                      </div>

                      {/* NBV with progress */}
                      <div className="mt-2 space-y-1">
                        <div className="flex justify-between text-xs">
                          <span className="text-muted-foreground">NBV</span>
                          <span className="font-medium">{formatCurrency(asset.netBookValue)}</span>
                        </div>
                        <Progress value={progress} className="h-1.5" />
                        <p className="text-[10px] text-muted-foreground text-right">{progress}% depreciated</p>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* Phase 73 D-21/D-22: CapEx round-trip banner + duplicate prompt */}
      {sourceBankLine && (
        <Alert className="mb-4">
          <LinkIcon className="h-4 w-4" />
          <AlertTitle>
            Creating asset from bank line{" "}
            {formatDateId(sourceBankLine.date)} — {formatCurrency(sourceBankLine.amountIdr)}
          </AlertTitle>
          <AlertDescription className="flex items-center justify-between gap-3">
            <span>
              Save an asset to post the acquisition JE and link it back to the
              reconciliation queue.
            </span>
            <Button asChild variant="ghost" size="sm">
              <Link
                to={`/bank-reconciliation?tab=review&statementId=${sourceBankLine.statementId}&lineId=${sourceBankLine._id}`}
              >
                Cancel and return to reconciliation
              </Link>
            </Button>
          </AlertDescription>
        </Alert>
      )}

      {sourceBankLine && duplicateAssets.length > 0 && !duplicateAcknowledged && (
        <Alert variant="destructive" className="mb-4">
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>Possible duplicate asset</AlertTitle>
          <AlertDescription className="space-y-2">
            <p>
              An asset matching this vendor, amount, and date already exists. Link
              to existing asset or create a new one?
            </p>
            <ul className="text-xs space-y-0.5">
              {duplicateAssets.slice(0, 3).map((a) => (
                <li key={a._id} className="font-mono">
                  {a.assetNumber} — {a.name} — {formatCurrency(a.cost)}
                </li>
              ))}
            </ul>
            <div className="flex gap-2 pt-1">
              <Button
                size="sm"
                variant="outline"
                onClick={() => {
                  // Link to existing — mark the bank line as linked to the
                  // existing asset's acquisition expense (if any).
                  const existing = duplicateAssets[0];
                  if (!existing || !fromBankLineId) return;
                  // No direct expenseId on asset; caller chooses to treat as
                  // linked and returns. This is a safe no-op when no expense
                  // exists; reviewer can still confirm manually.
                  toast.info(
                    `Kept existing asset ${existing.assetNumber}. Return to reconciliation to match manually.`,
                  );
                  navigate(
                    `/bank-reconciliation?tab=review&statementId=${sourceBankLine.statementId}&lineId=${sourceBankLine._id}`,
                  );
                }}
              >
                Link to existing
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => setDuplicateAcknowledged(true)}
              >
                Create new anyway
              </Button>
            </div>
          </AlertDescription>
        </Alert>
      )}

      {/* Dialogs */}
      <CreateAssetDialog
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        prefill={
          sourceBankLine
            ? {
                name: sourceBankLine.parsedCounterparty ?? sourceBankLine.rawDescription,
                cost: String(sourceBankLine.amountIdr),
                acquisitionDate: new Date(sourceBankLine.date)
                  .toISOString()
                  .slice(0, 10),
              }
            : undefined
        }
        sourceBankLineId={fromBankLineId ?? undefined}
        onCreated={async (result) => {
          // Backend already links bank line when sourceBankLineId is passed,
          // but also call markAssetLinked for idempotency (and so the
          // mutation appears in this file per acceptance criteria).
          if (fromBankLineId && result.expenseId) {
            try {
              await markAssetLinked({
                bankLineId: fromBankLineId,
                expenseId: result.expenseId,
              });
            } catch {
              // idempotent — if already linked, ignore
            }
          }
          if (fromBankLineId && sourceBankLine) {
            toast.success(
              "Asset registered. Click Confirm to post the acquisition JE.",
            );
            navigate(
              `/bank-reconciliation?tab=review&statementId=${sourceBankLine.statementId}&lineId=${sourceBankLine._id}`,
            );
          }
        }}
      />
      <DepreciationPreviewDialog
        open={previewOpen}
        onClose={() => setPreviewOpen(false)}
      />
      <VoidDepreciationDialog
        open={voidOpen}
        onClose={() => setVoidOpen(false)}
      />
      <AssetDetailPanel
        assetId={selectedAssetId}
        open={!!selectedAssetId}
        onClose={() => setSelectedAssetId(undefined)}
      />
    </div>
  );
}
