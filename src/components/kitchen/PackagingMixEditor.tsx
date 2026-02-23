/**
 * PackagingMixEditor
 *
 * Redesigned packaging mix editor for the unified Manager Settings form.
 * Shows products grouped by ball type (Original / Jumbo) with BOM info:
 *   - BOM food component tags (badges)
 *   - Balls-per-unit count
 *   - Quantity input
 *   - Subtotal balls consumed
 *   - Running allocation counters
 *   - Soft warning when mix total doesn't match ball targets
 *
 * Gap 5: Product dropdown only shows Food POS products
 *         (isActive + posSlot defined + productType=food)
 * Gap 7: Sections greyed out when that component is disabled
 */

import { useState } from "react";
import { Plus, X, AlertTriangle } from "lucide-react";
import { useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

// -------------------------------------------------------
// Types
// -------------------------------------------------------

export interface PackagingMixRow {
  menuProductId: string;
  quantity: number;
}

interface PackagingMixEditorProps {
  rows: PackagingMixRow[];
  onChange: (rows: PackagingMixRow[]) => void;
  originalBallTarget: number; // Current original ball target (midBallTarget)
  jumboBallTarget: number;    // Current jumbo ball target (bigBallTarget)
  enabledComponents: string[]; // ["BIG_BALL", "MID_BALL"] — from config
}

// -------------------------------------------------------
// Helper: determine ball info per product from BOM components
// -------------------------------------------------------

interface BomInfo {
  bigBallsPerUnit: number; // BIG_BALL = Jumbo 80g
  midBallsPerUnit: number; // MID_BALL = Original 45g
  tags: string[];           // display labels from componentType names
}

function getBomInfo(
  menuProductId: string,
  allComponents: Record<string, Array<{
    componentTypeId: Id<"componentTypes">;
    quantity: number;
    componentType: {
      _id: Id<"componentTypes">;
      code: string;
      name: string;
      category: string;
    } | null;
  }>>
): BomInfo {
  const components = allComponents[menuProductId] ?? [];
  let bigBallsPerUnit = 0;
  let midBallsPerUnit = 0;
  const tags: string[] = [];

  for (const comp of components) {
    const ct = comp.componentType;
    if (!ct || ct.category !== "production") continue;

    if (ct.code === "BIG_BALL") {
      bigBallsPerUnit += comp.quantity;
      tags.push(ct.name);
    } else if (ct.code === "MID_BALL") {
      midBallsPerUnit += comp.quantity;
      tags.push(ct.name);
    }
  }

  return { bigBallsPerUnit, midBallsPerUnit, tags };
}

// -------------------------------------------------------
// Sub-component: Product row
// -------------------------------------------------------

interface ProductRowProps {
  row: PackagingMixRow;
  index: number;
  ballsPerUnit: number;
  tags: string[];
  onQuantityChange: (index: number, value: number) => void;
  onRemove: (index: number) => void;
  productName: string;
}

function ProductRow({
  row,
  index,
  ballsPerUnit,
  tags,
  onQuantityChange,
  onRemove,
  productName,
}: ProductRowProps) {
  const subtotal = row.quantity * ballsPerUnit;

  return (
    <div className="flex items-center gap-2 py-1.5">
      {/* Product name */}
      <span className="flex-1 text-sm font-medium truncate" title={productName}>
        {productName}
      </span>

      {/* BOM tags */}
      <div className="flex items-center gap-1 shrink-0">
        {tags.map((tag) => (
          <Badge key={tag} variant="secondary" className="text-xs px-1.5 py-0 h-5">
            {tag}
          </Badge>
        ))}
        {ballsPerUnit > 0 && (
          <span className="text-xs text-muted-foreground ml-1 whitespace-nowrap">
            {ballsPerUnit} ball{ballsPerUnit !== 1 ? "s" : ""}/unit
          </span>
        )}
      </div>

      {/* Quantity input */}
      <Input
        type="number"
        min={0}
        value={row.quantity || ""}
        placeholder="0"
        onChange={(e) => onQuantityChange(index, Math.max(0, Number(e.target.value)))}
        className="w-16 text-right tabular-nums h-8 text-sm shrink-0"
      />

      {/* Subtotal */}
      <span className="text-xs text-muted-foreground w-16 text-right shrink-0 tabular-nums">
        = {subtotal} balls
      </span>

      {/* Remove */}
      <button
        type="button"
        className="text-muted-foreground hover:text-destructive transition-colors shrink-0"
        onClick={() => onRemove(index)}
        aria-label="Remove row"
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}

// -------------------------------------------------------
// Sub-component: Ball group section
// -------------------------------------------------------

interface BallGroupSectionProps {
  title: string;
  componentCode: string; // "BIG_BALL" | "MID_BALL"
  enabledComponents: string[];
  ballTarget: number;
  ballsUsed: number;
  children: React.ReactNode;
  onAddProduct: () => void;
  canAddMore: boolean;
}

function BallGroupSection({
  title,
  componentCode,
  enabledComponents,
  ballTarget,
  ballsUsed,
  children,
  onAddProduct,
  canAddMore,
}: BallGroupSectionProps) {
  const isEnabled = enabledComponents.includes(componentCode);
  const ballsLeft = ballTarget - ballsUsed;
  const hasWarning = ballsUsed !== ballTarget && ballTarget > 0;

  return (
    <div className={["rounded-lg border p-3 space-y-2", !isEnabled ? "opacity-50 pointer-events-none" : ""].join(" ")}>
      <div className="flex items-center justify-between">
        <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          {title}
          {!isEnabled && <span className="ml-2 normal-case font-normal">(disabled — production toggled off)</span>}
        </h4>
        {isEnabled && (
          <span className="text-xs tabular-nums">
            <span className={["font-medium", ballsLeft < 0 ? "text-destructive" : ballsLeft === 0 ? "text-green-600" : "text-amber-600"].join(" ")}>
              {ballsLeft > 0 ? `${ballsLeft} left` : ballsLeft === 0 ? "Fully allocated" : `${Math.abs(ballsLeft)} over`}
            </span>
          </span>
        )}
      </div>

      <div className="divide-y divide-border/50">
        {children}
      </div>

      {isEnabled && (
        <>
          {/* Subtotal row */}
          <div className="flex items-center justify-between pt-1 text-xs text-muted-foreground border-t border-border/50">
            <span>Subtotal</span>
            <span className="tabular-nums font-medium">
              {ballsUsed} / {ballTarget} balls
            </span>
          </div>

          {/* Warning */}
          {hasWarning && (
            <div className="flex items-center gap-1.5 text-xs text-amber-600">
              <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
              <span>
                Mix total ({ballsUsed}) does not match target ({ballTarget})
                {ballsLeft > 0 ? ` — ${ballsLeft} balls unallocated` : ` — ${Math.abs(ballsLeft)} balls over target`}
              </span>
            </div>
          )}

          {/* Add product button */}
          {canAddMore && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={onAddProduct}
              className="text-xs h-7 px-2 text-muted-foreground w-full justify-start"
            >
              <Plus className="h-3 w-3 mr-1" />
              Add product
            </Button>
          )}
        </>
      )}
    </div>
  );
}

// -------------------------------------------------------
// Main component
// -------------------------------------------------------

export function PackagingMixEditor({
  rows,
  onChange,
  originalBallTarget,
  jumboBallTarget,
  enabledComponents,
}: PackagingMixEditorProps) {
  // -- Fetch food POS products (posSlot defined, non-packaging) --
  const menuProducts = useQuery(api.menuProducts.queries.listPosProducts);

  // -- Build list of menu product IDs for batch BOM fetch --
  const allMenuProductIds = (menuProducts ?? [])
    .filter(
      (mp) =>
        mp.productType === "food" &&
        mp.isActive === true &&
        mp.posSlot !== undefined
    )
    .map((mp) => mp._id);

  // -- Batch-fetch BOM components for all food POS products --
  const allComponentsMap = useQuery(
    api.menuProductComponents.queries.getByMenuProductIds,
    allMenuProductIds.length > 0 ? { menuProductIds: allMenuProductIds } : "skip"
  );

  // -- Add row state: which ball group is adding --
  const [addingGroup, setAddingGroup] = useState<"BIG_BALL" | "MID_BALL" | null>(null);

  // -- Filter to only food POS products (Gap 5) --
  const foodPosProducts = (menuProducts ?? [])
    .filter(
      (mp) =>
        mp.productType === "food" &&
        mp.isActive === true &&
        mp.posSlot !== undefined
    )
    .map((mp) => ({ _id: String(mp._id), name: mp.name }));

  // Product name lookup
  const productNameMap = new Map(foodPosProducts.map((p) => [p._id, p.name]));

  // -- Build BOM info map --
  const bomInfoMap = new Map<string, BomInfo>();
  if (allComponentsMap) {
    for (const mp of foodPosProducts) {
      bomInfoMap.set(mp._id, getBomInfo(mp._id, allComponentsMap as Record<string, Array<{
        componentTypeId: Id<"componentTypes">;
        quantity: number;
        componentType: {
          _id: Id<"componentTypes">;
          code: string;
          name: string;
          category: string;
        } | null;
      }>>));
    }
  }

  // -- Classify rows by ball type --
  const originalRows = rows.filter((row) => {
    const bom = bomInfoMap.get(row.menuProductId);
    return bom ? bom.midBallsPerUnit > 0 && bom.bigBallsPerUnit === 0 : false;
  });

  const jumboRows = rows.filter((row) => {
    const bom = bomInfoMap.get(row.menuProductId);
    return bom ? bom.bigBallsPerUnit > 0 : false;
  });

  // Rows that don't match either (no BOM data yet or mixed) — show in both or unclassified
  const unclassifiedRows = rows.filter((row) => {
    const bom = bomInfoMap.get(row.menuProductId);
    return !bom || (bom.midBallsPerUnit === 0 && bom.bigBallsPerUnit === 0);
  });

  // -- Calculate ball totals --
  let originalBallsUsed = 0;
  let jumboBallsUsed = 0;

  for (const row of rows) {
    const bom = bomInfoMap.get(row.menuProductId);
    if (!bom) continue;
    originalBallsUsed += row.quantity * bom.midBallsPerUnit;
    jumboBallsUsed += row.quantity * bom.bigBallsPerUnit;
  }

  // -- Row manipulation helpers --
  function updateQuantity(index: number, value: number) {
    onChange(rows.map((row, i) => (i === index ? { ...row, quantity: value } : row)));
  }

  function removeRow(index: number) {
    onChange(rows.filter((_, i) => i !== index));
  }

  function addProduct(menuProductId: string) {
    onChange([...rows, { menuProductId, quantity: 0 }]);
    setAddingGroup(null);
  }

  // -- Products not yet in the mix, filtered by ball group --
  const currentIds = new Set(rows.map((r) => r.menuProductId));

  function getAvailableForGroup(ballCode: "BIG_BALL" | "MID_BALL") {
    return foodPosProducts.filter((mp) => {
      if (currentIds.has(mp._id)) return false;
      const bom = bomInfoMap.get(mp._id);
      if (!bom) return false;
      if (ballCode === "BIG_BALL") return bom.bigBallsPerUnit > 0;
      return bom.midBallsPerUnit > 0 && bom.bigBallsPerUnit === 0;
    });
  }

  // -- Render rows for a group --
  function renderRows(groupRows: PackagingMixRow[], getBallsPerUnit: (bom: BomInfo) => number) {
    if (groupRows.length === 0) {
      return (
        <p className="text-xs text-muted-foreground py-2 text-center">
          No products added yet.
        </p>
      );
    }

    return groupRows.map((row) => {
      const globalIndex = rows.indexOf(row);
      const bom = bomInfoMap.get(row.menuProductId);
      const ballsPerUnit = bom ? getBallsPerUnit(bom) : 0;
      const productName = productNameMap.get(row.menuProductId) ?? "Unknown product";

      return (
        <ProductRow
          key={row.menuProductId}
          row={row}
          index={globalIndex}
          ballsPerUnit={ballsPerUnit}
          tags={bom?.tags ?? []}
          onQuantityChange={updateQuantity}
          onRemove={removeRow}
          productName={productName}
        />
      );
    });
  }

  // -- Add product inline selector --
  function AddProductSelector({ group }: { group: "BIG_BALL" | "MID_BALL" }) {
    const available = getAvailableForGroup(group);

    if (available.length === 0) {
      return (
        <p className="text-xs text-muted-foreground py-1">
          All products already added.
        </p>
      );
    }

    return (
      <Select onValueChange={(val) => addProduct(val)}>
        <SelectTrigger className="h-8 text-sm">
          <SelectValue placeholder="Select product to add..." />
        </SelectTrigger>
        <SelectContent>
          {available.map((mp) => (
            <SelectItem key={mp._id} value={mp._id}>
              {mp.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    );
  }

  const isLoading = menuProducts === undefined || (allMenuProductIds.length > 0 && allComponentsMap === undefined);

  if (isLoading) {
    return (
      <div className="text-xs text-muted-foreground py-4 text-center">
        Loading products...
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {/* Original Products (45g / MID_BALL) */}
      <BallGroupSection
        title="Original Products (45g)"
        componentCode="MID_BALL"
        enabledComponents={enabledComponents}
        ballTarget={originalBallTarget}
        ballsUsed={originalBallsUsed}
        onAddProduct={() => setAddingGroup(addingGroup === "MID_BALL" ? null : "MID_BALL")}
        canAddMore={getAvailableForGroup("MID_BALL").length > 0}
      >
        {renderRows(originalRows, (bom) => bom.midBallsPerUnit)}
        {addingGroup === "MID_BALL" && <AddProductSelector group="MID_BALL" />}
      </BallGroupSection>

      {/* Jumbo Products (80g / BIG_BALL) */}
      <BallGroupSection
        title="Jumbo Products (80g)"
        componentCode="BIG_BALL"
        enabledComponents={enabledComponents}
        ballTarget={jumboBallTarget}
        ballsUsed={jumboBallsUsed}
        onAddProduct={() => setAddingGroup(addingGroup === "BIG_BALL" ? null : "BIG_BALL")}
        canAddMore={getAvailableForGroup("BIG_BALL").length > 0}
      >
        {renderRows(jumboRows, (bom) => bom.bigBallsPerUnit)}
        {addingGroup === "BIG_BALL" && <AddProductSelector group="BIG_BALL" />}
      </BallGroupSection>

      {/* Unclassified rows (no BOM data or mixed — show for awareness) */}
      {unclassifiedRows.length > 0 && (
        <div className="rounded-lg border border-dashed p-3 space-y-2">
          <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Other (no BOM data)
          </h4>
          {renderRows(unclassifiedRows, () => 0)}
        </div>
      )}
    </div>
  );
}
