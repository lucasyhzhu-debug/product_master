/**
 * PackagingMixEditor
 *
 * Packaging mix editor for the unified Manager Settings form. Products are
 * grouped dynamically by tier-1 production componentType code (derived from
 * `productionComponents` passed in from ManagerTargetSettings) so any ball
 * type (e.g. HAZELNUT_REGULAR) gets its own section rather than being lumped
 * into "Other (no BOM data)".
 *
 * Product dropdown only shows Food POS products
 * (isActive + posSlot defined + productType=food). Sections are greyed out
 * when their ball component is disabled.
 */

import { useMemo, useState } from "react";
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

/**
 * One production tier-1 `pcs` ball code that gets a section in the mix editor.
 * Typically: BIG_BALL, MID_BALL, HAZELNUT_REGULAR, ...
 */
export interface BallGroupDef {
  code: string;
  /** Section title, e.g. "Original Products (45g)" */
  title: string;
  /** Current target for this ball code (for allocation counter) */
  target: number;
}

interface PackagingMixEditorProps {
  rows: PackagingMixRow[];
  onChange: (rows: PackagingMixRow[]) => void;
  enabledComponents: string[]; // e.g. ["BIG_BALL", "MID_BALL", "HAZELNUT_REGULAR"]
  /**
   * One section per production code, in render order. Built in
   * ManagerTargetSettings from the active+enabled tier-1 pcs components.
   */
  ballGroups: BallGroupDef[];
}

// -------------------------------------------------------
// BOM info per product: balls-per-unit for each production code
// -------------------------------------------------------

type ComponentRow = {
  componentTypeId: Id<"componentTypes">;
  quantity: number;
  componentType: {
    _id: Id<"componentTypes">;
    code: string;
    name: string;
    category: string;
  } | null;
};

interface BomInfo {
  /** code -> balls-per-unit (only codes with qty > 0) */
  ballsByCode: Record<string, number>;
  /** display labels (componentType names, preserving insertion order) */
  tags: string[];
}

function getBomInfo(
  menuProductId: string,
  allComponents: Record<string, ComponentRow[]>
): BomInfo {
  const components = allComponents[menuProductId] ?? [];
  const ballsByCode: Record<string, number> = {};
  const tags: string[] = [];
  const seenTags = new Set<string>();

  for (const comp of components) {
    const ct = comp.componentType;
    if (!ct || ct.category !== "production") continue;
    ballsByCode[ct.code] = (ballsByCode[ct.code] ?? 0) + comp.quantity;
    if (!seenTags.has(ct.name)) {
      seenTags.add(ct.name);
      tags.push(ct.name);
    }
  }

  return { ballsByCode, tags };
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
      <span className="flex-1 text-sm font-medium break-words min-w-0" title={productName}>
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
  componentCode: string;
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
  enabledComponents,
  ballGroups,
}: PackagingMixEditorProps) {
  const menuProducts = useQuery(api.menuProducts.queries.listPosProducts);

  // Filter menuProducts once; all downstream derivations use this list.
  const foodPosProducts = useMemo(
    () =>
      (menuProducts ?? [])
        .filter(
          (mp) =>
            mp.productType === "food" &&
            mp.isActive === true &&
            mp.posSlot !== undefined
        )
        .map((mp) => ({ _id: String(mp._id), name: mp.name, rawId: mp._id })),
    [menuProducts]
  );

  const allMenuProductIds = useMemo(
    () => foodPosProducts.map((mp) => mp.rawId),
    [foodPosProducts]
  );

  const allComponentsMap = useQuery(
    api.menuProductComponents.queries.getByMenuProductIds,
    allMenuProductIds.length > 0 ? { menuProductIds: allMenuProductIds } : "skip"
  );

  const [addingGroup, setAddingGroup] = useState<string | null>(null);

  const productNameMap = useMemo(
    () => new Map(foodPosProducts.map((p) => [p._id, p.name])),
    [foodPosProducts]
  );

  const bomInfoMap = useMemo(() => {
    const map = new Map<string, BomInfo>();
    if (!allComponentsMap) return map;
    for (const mp of foodPosProducts) {
      map.set(mp._id, getBomInfo(mp._id, allComponentsMap as Record<string, ComponentRow[]>));
    }
    return map;
  }, [allComponentsMap, foodPosProducts]);

  const groupOrder = useMemo(() => ballGroups.map((g) => g.code), [ballGroups]);

  // Classify rows by their PRIMARY ball code — the first groupOrder code with
  // qty > 0 in the row's BOM. Each row belongs to exactly one section.
  const { rowsByCode, unclassifiedRows } = useMemo(() => {
    const byCode: Record<string, PackagingMixRow[]> = {};
    const unclassified: PackagingMixRow[] = [];
    for (const row of rows) {
      const bom = bomInfoMap.get(row.menuProductId);
      let primary: string | null = null;
      if (bom) {
        for (const code of groupOrder) {
          if ((bom.ballsByCode[code] ?? 0) > 0) {
            primary = code;
            break;
          }
        }
      }
      if (primary) {
        (byCode[primary] ||= []).push(row);
      } else {
        unclassified.push(row);
      }
    }
    return { rowsByCode: byCode, unclassifiedRows: unclassified };
  }, [rows, bomInfoMap, groupOrder]);

  const ballsUsedByCode = useMemo(() => {
    const used: Record<string, number> = {};
    for (const row of rows) {
      const bom = bomInfoMap.get(row.menuProductId);
      if (!bom) continue;
      for (const [code, perUnit] of Object.entries(bom.ballsByCode)) {
        used[code] = (used[code] ?? 0) + row.quantity * perUnit;
      }
    }
    return used;
  }, [rows, bomInfoMap]);

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

  function getAvailableForGroup(ballCode: string) {
    return foodPosProducts.filter((mp) => {
      if (currentIds.has(mp._id)) return false;
      const bom = bomInfoMap.get(mp._id);
      if (!bom) return false;
      // Must have this ball code in its BOM
      if ((bom.ballsByCode[ballCode] ?? 0) <= 0) return false;
      // Must be PRIMARY for this code per the groupOrder rule — otherwise the
      // product would be shown in both its primary group AND this one, which
      // double-counts when the user adds it. Enforce uniqueness.
      for (const c of groupOrder) {
        if (c === ballCode) return true;
        if ((bom.ballsByCode[c] ?? 0) > 0) return false;
      }
      return false;
    });
  }

  // -- Render rows for a group --
  function renderRows(groupRows: PackagingMixRow[], code: string) {
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
      const ballsPerUnit = bom ? (bom.ballsByCode[code] ?? 0) : 0;
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
  function AddProductSelector({ code }: { code: string }) {
    const available = getAvailableForGroup(code);

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
      {ballGroups.map((group) => (
        <BallGroupSection
          key={group.code}
          title={group.title}
          componentCode={group.code}
          enabledComponents={enabledComponents}
          ballTarget={group.target}
          ballsUsed={ballsUsedByCode[group.code] ?? 0}
          onAddProduct={() => setAddingGroup(addingGroup === group.code ? null : group.code)}
          canAddMore={getAvailableForGroup(group.code).length > 0}
        >
          {renderRows(rowsByCode[group.code] ?? [], group.code)}
          {addingGroup === group.code && <AddProductSelector code={group.code} />}
        </BallGroupSection>
      ))}

      {/* Unclassified rows (no BOM data or BOM uses a code not in any ballGroup) */}
      {unclassifiedRows.length > 0 && (
        <div className="rounded-lg border border-dashed p-3 space-y-2">
          <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Other (no BOM data)
          </h4>
          {renderRows(unclassifiedRows, "")}
        </div>
      )}
    </div>
  );
}
