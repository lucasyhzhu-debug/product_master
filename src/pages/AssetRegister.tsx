/**
 * Asset Register page.
 *
 * Table/card view toggle, status filter tabs, create asset, catch up depreciation,
 * void depreciation. Admin-only controls for depreciation batch and disposal.
 *
 * Phase 60 Plan 03 - Frontend page orchestrator.
 */
import { useState, useMemo } from "react";
import {
  Plus,
  Table2,
  LayoutGrid,
  PlayCircle,
  RotateCcw,
  ImageIcon,
  Building2,
} from "lucide-react";
import { cn, formatCurrency } from "@/lib/utils";
import { useAuth } from "@/contexts/AuthContext";
import { useFixedAssets } from "@/hooks/convex/useFixedAssets";
import { ASSET_CATEGORIES } from "@/lib/assetHelpers";
import { PageHeader } from "@/components/layout/PageHeader";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { CreateAssetDialog } from "@/components/assets/CreateAssetDialog";
import { DepreciationPreviewDialog } from "@/components/assets/DepreciationPreviewDialog";
import { VoidDepreciationDialog } from "@/components/assets/VoidDepreciationDialog";
import { AssetDetailPanel } from "@/components/assets/AssetDetailPanel";

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

  // Data
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const assets = useFixedAssets(statusFilter === "all" ? undefined : statusFilter);

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

  const formatDate = (ms: number) => {
    return new Date(ms).toLocaleDateString("id-ID", {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
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
                      {formatDate(asset.acquisitionDate)}
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

      {/* Dialogs */}
      <CreateAssetDialog
        open={createOpen}
        onClose={() => setCreateOpen(false)}
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
