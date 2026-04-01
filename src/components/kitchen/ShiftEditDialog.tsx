/**
 * ShiftEditDialog
 *
 * Edit dialog for a past shift record (KIT-17). Manager/admin only.
 *
 * Flow:
 *   1. Form pre-populated with existing produced + waste values
 *   2. On "Review Changes" — compute inventory impact per product
 *   3. Show confirmation dialog with ALL non-zero deltas
 *   4. On confirm — call updateShiftRecord mutation
 *   5. On success — toast + close dialog
 *
 * Requirements: KIT-17
 */

import { useState, useMemo } from "react";
import { X, AlertTriangle, ChevronDown, ChevronUp } from "lucide-react";
import { toast } from "sonner";
import { useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { useProtectedMutation } from "@/hooks/convex/useProtectedMutation";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { ShiftRecord, ComponentProducedEntry, ComponentWasteEntry } from "./ShiftHistoryList";

// -------------------------------------------------------
// Types
// -------------------------------------------------------

import { WASTE_REASONS, type WasteReason } from './index';

interface ProducedRow {
  menuProductId: string;
  menuProductName: string;
  quantity: number;
}

interface WasteRow {
  menuProductId: string;
  menuProductName: string;
  reason: WasteReason;
  quantity: number;
}

interface InventoryDelta {
  menuProductId: string;
  menuProductName: string;
  oldNet: number;
  newNet: number;
  delta: number;
}

interface ShiftEditDialogProps {
  record: ShiftRecord;
  open: boolean;
  onClose: () => void;
}

// -------------------------------------------------------
// Constants
// -------------------------------------------------------

// -------------------------------------------------------
// Component
// -------------------------------------------------------

export function ShiftEditDialog({ record, open, onClose }: ShiftEditDialogProps) {
  const updateShiftRecord = useProtectedMutation(
    api.kitchenShiftRecords.mutations.updateShiftRecord
  );

  // Query available kitchen components so managers can add to old records (M1)
  const kitchenComponents = useQuery(api.kitchenComponents.queries.list, {
    activeOnly: true,
  });
  const kitchenConfig = useQuery(api.kitchenConfig.queries.getConfig);

  // -------------------------------------------------------
  // State — pre-populated from record
  // -------------------------------------------------------

  // Build initial produced rows from record (one row per product in original record)
  const [producedRows, setProducedRows] = useState<ProducedRow[]>(() =>
    record.produced.map((p) => ({
      menuProductId: p.menuProductId,
      menuProductName: p.menuProductName,
      quantity: p.quantity,
    }))
  );

  // Build initial waste rows
  const [wasteRows, setWasteRows] = useState<WasteRow[]>(() =>
    record.waste.map((w) => ({
      menuProductId: w.menuProductId,
      menuProductName: w.menuProductName,
      reason: (w.reason as WasteReason) ?? "waste",
      quantity: w.quantity,
    }))
  );

  // Component production rows (Phase 69)
  const [componentProducedRows, setComponentProducedEntrys] = useState<ComponentProducedEntry[]>(() =>
    (record.componentProduced ?? []).map((c) => ({
      kitchenComponentCode: c.kitchenComponentCode,
      kitchenComponentName: c.kitchenComponentName,
      grams: c.grams,
    }))
  );

  const [componentWasteRows, setComponentWasteEntrys] = useState<ComponentWasteEntry[]>(() =>
    (record.componentWaste ?? []).map((c) => ({
      kitchenComponentCode: c.kitchenComponentCode,
      kitchenComponentName: c.kitchenComponentName,
      reason: (c.reason as WasteReason) ?? "waste",
      grams: c.grams,
    }))
  );

  const [componentWasteOpen, setComponentWasteOpen] = useState(
    (record.componentWaste ?? []).length > 0
  );

  const [editNote, setEditNote] = useState("");
  const [chefName, setChefName] = useState(record.chefName ?? "");
  const [wasteOpen, setWasteOpen] = useState(record.waste.length > 0);

  // Confirmation dialog state
  const [showConfirm, setShowConfirm] = useState(false);
  const [deltas, setDeltas] = useState<InventoryDelta[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Available components not yet in the produced rows (M1: add to old records)
  const addableComponents = useMemo(() => {
    if (!kitchenComponents) return [];
    const enabledCodes = kitchenConfig?.enabledKitchenComponents;
    const existingCodes = new Set(componentProducedRows.map((r) => r.kitchenComponentCode));
    return kitchenComponents
      .filter((c) => {
        if (existingCodes.has(c.code)) return false;
        if (enabledCodes && !enabledCodes.includes(c.code)) return false;
        return true;
      })
      .sort((a, b) => a.sortOrder - b.sortOrder);
  }, [kitchenComponents, kitchenConfig, componentProducedRows]);

  // -------------------------------------------------------
  // Produced row handlers
  // -------------------------------------------------------

  function updateProducedQty(index: number, qty: number) {
    setProducedRows((prev) =>
      prev.map((row, i) => (i === index ? { ...row, quantity: Math.max(0, qty) } : row))
    );
  }

  // -------------------------------------------------------
  // Waste row handlers
  // -------------------------------------------------------

  function addWasteRow(menuProductId: string, menuProductName: string) {
    setWasteRows((prev) => [
      ...prev,
      { menuProductId, menuProductName, reason: "qa_testing", quantity: 0 },
    ]);
  }

  function updateWasteRow(
    index: number,
    field: "reason" | "quantity",
    value: string | number
  ) {
    setWasteRows((prev) =>
      prev.map((row, i) =>
        i === index
          ? {
              ...row,
              [field]:
                field === "quantity"
                  ? Math.max(0, Number(value))
                  : (value as WasteReason),
            }
          : row
      )
    );
  }

  function removeWasteRow(index: number) {
    setWasteRows((prev) => prev.filter((_, i) => i !== index));
  }

  // -------------------------------------------------------
  // Compute inventory impact
  // -------------------------------------------------------

  function computeDeltas(): InventoryDelta[] {
    // Build old net map from original record
    const oldNetMap = new Map<string, { name: string; net: number }>();
    for (const p of record.produced) {
      const key = p.menuProductId;
      const existing = oldNetMap.get(key) ?? { name: p.menuProductName, net: 0 };
      oldNetMap.set(key, { name: existing.name, net: existing.net + p.quantity });
    }
    for (const w of record.waste) {
      const key = w.menuProductId;
      const existing = oldNetMap.get(key) ?? { name: w.menuProductName, net: 0 };
      oldNetMap.set(key, { name: existing.name, net: existing.net - w.quantity });
    }

    // Build new net map from form state
    const newNetMap = new Map<string, { name: string; net: number }>();
    for (const p of producedRows) {
      if (p.quantity <= 0) continue;
      const key = p.menuProductId;
      const existing = newNetMap.get(key) ?? { name: p.menuProductName, net: 0 };
      newNetMap.set(key, { name: existing.name, net: existing.net + p.quantity });
    }
    for (const w of wasteRows) {
      if (w.quantity <= 0) continue;
      const key = w.menuProductId;
      const existing = newNetMap.get(key) ?? { name: w.menuProductName, net: 0 };
      newNetMap.set(key, { name: existing.name, net: existing.net - w.quantity });
    }

    // Collect all product IDs
    const allIds = new Set([...oldNetMap.keys(), ...newNetMap.keys()]);
    const result: InventoryDelta[] = [];

    for (const id of allIds) {
      const oldEntry = oldNetMap.get(id);
      const newEntry = newNetMap.get(id);
      const oldNet = oldEntry?.net ?? 0;
      const newNet = newEntry?.net ?? 0;
      const delta = newNet - oldNet;
      const name = oldEntry?.name ?? newEntry?.name ?? id;

      result.push({
        menuProductId: id,
        menuProductName: name,
        oldNet,
        newNet,
        delta,
      });
    }

    return result;
  }

  // -------------------------------------------------------
  // Handlers
  // -------------------------------------------------------

  function handleReviewChanges() {
    // Validate component waste <= produced (I2: client-side validation)
    for (const wasteRow of componentWasteRows) {
      if (wasteRow.grams <= 0) continue;
      const producedGrams = componentProducedRows
        .filter((r) => r.kitchenComponentCode === wasteRow.kitchenComponentCode)
        .reduce((sum, r) => sum + r.grams, 0);
      if (wasteRow.grams > producedGrams) {
        toast.error(
          `Component waste for "${wasteRow.kitchenComponentName}" (${wasteRow.grams}g) cannot exceed produced (${producedGrams}g).`
        );
        return;
      }
    }

    const computed = computeDeltas();
    setDeltas(computed);
    setShowConfirm(true);
  }

  async function handleConfirm() {
    setIsSubmitting(true);
    try {
      await updateShiftRecord({
        recordId: record._id as Id<"kitchenShiftRecords">,
        produced: producedRows
          .filter((p) => p.quantity > 0)
          .map((p) => ({
            menuProductId: p.menuProductId as Id<"menuProducts">,
            quantity: p.quantity,
          })),
        waste: wasteRows
          .filter((w) => w.quantity > 0)
          .map((w) => ({
            menuProductId: w.menuProductId as Id<"menuProducts">,
            reason: w.reason,
            quantity: w.quantity,
          })),
        editNote: editNote.trim() || undefined,
        chefName: chefName.trim() || undefined,
        componentProduced: componentProducedRows
          .filter((c) => c.grams > 0)
          .map((c) => ({
            kitchenComponentCode: c.kitchenComponentCode,
            kitchenComponentName: c.kitchenComponentName,
            grams: c.grams,
          })),
        componentWaste: componentWasteRows
          .filter((c) => c.grams > 0)
          .map((c) => ({
            kitchenComponentCode: c.kitchenComponentCode,
            kitchenComponentName: c.kitchenComponentName,
            reason: c.reason as "qa_testing" | "spoilage" | "waste",
            grams: c.grams,
          })),
      });

      toast.success("Shift record updated");
      setShowConfirm(false);
      onClose();
    } catch (error) {
      const msg = error instanceof Error ? error.message : "Failed to update shift record";
      toast.error(msg);
      // Keep dialog open on error
    } finally {
      setIsSubmitting(false);
    }
  }

  // -------------------------------------------------------
  // Render: Confirmation dialog
  // -------------------------------------------------------

  if (showConfirm) {
    const nonZeroDeltas = deltas.filter((d) => d.delta !== 0);
    const zeroDeltas = deltas.filter((d) => d.delta === 0);

    return (
      <Dialog open={open} onOpenChange={(v) => !v && setShowConfirm(false)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-amber-500" />
              Confirm Inventory Changes
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-3 py-2">
            <p className="text-sm text-muted-foreground">
              Saving this edit will adjust finished goods inventory at the Kitchen location:
            </p>

            <div className="space-y-2 rounded-lg border border-border p-3">
              {nonZeroDeltas.length === 0 && (
                <p className="text-sm text-muted-foreground text-center">
                  No inventory changes — quantities are the same as original.
                </p>
              )}

              {nonZeroDeltas.map((d) => (
                <div key={d.menuProductId} className="flex items-center justify-between text-sm">
                  <span className="font-medium">{d.menuProductName}</span>
                  <Badge
                    variant={d.delta > 0 ? "default" : "destructive"}
                    className="text-xs"
                  >
                    {d.delta > 0 ? `+${d.delta}` : d.delta} units
                  </Badge>
                </div>
              ))}

              {zeroDeltas.length > 0 && nonZeroDeltas.length > 0 && (
                <div className="pt-2 border-t border-border/50">
                  {zeroDeltas.map((d) => (
                    <div key={d.menuProductId} className="flex items-center justify-between text-sm text-muted-foreground">
                      <span>{d.menuProductName}</span>
                      <span className="text-xs">no change</span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Component changes summary (I3) */}
            {componentProducedRows.some((c) => c.grams > 0) && (
              <div className="space-y-2 rounded-lg border border-border p-3">
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                  Component Changes
                </p>
                {componentProducedRows
                  .filter((c) => c.grams > 0)
                  .map((c) => (
                    <div key={c.kitchenComponentCode} className="flex items-center justify-between text-sm">
                      <span>{c.kitchenComponentName}</span>
                      <span className="font-medium tabular-nums">{c.grams}g</span>
                    </div>
                  ))}
                {componentWasteRows
                  .filter((c) => c.grams > 0)
                  .map((c, i) => (
                    <div key={`${c.kitchenComponentCode}-waste-${i}`} className="flex items-center justify-between text-sm text-destructive/80">
                      <span>{c.kitchenComponentName} (waste)</span>
                      <span className="font-medium tabular-nums">-{c.grams}g</span>
                    </div>
                  ))}
              </div>
            )}

            {editNote && (
              <div className="rounded-md bg-muted/50 px-3 py-2">
                <p className="text-xs text-muted-foreground">Edit note:</p>
                <p className="text-sm">{editNote}</p>
              </div>
            )}
          </div>

          <DialogFooter className="flex gap-2 sm:justify-end">
            <Button
              variant="outline"
              onClick={() => setShowConfirm(false)}
              disabled={isSubmitting}
              size="sm"
            >
              Cancel
            </Button>
            <Button
              onClick={handleConfirm}
              disabled={isSubmitting}
              size="sm"
            >
              {isSubmitting ? "Saving..." : "Confirm Edit"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    );
  }

  // -------------------------------------------------------
  // Render: Edit form
  // -------------------------------------------------------

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-md max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Edit Shift Record</DialogTitle>
        </DialogHeader>

        <div className="space-y-5 py-1">
          {/* Produced quantities */}
          <div className="space-y-3">
            <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
              Produced
            </Label>
            {producedRows.length === 0 && (
              <p className="text-sm text-muted-foreground">No produced items in this record.</p>
            )}
            {producedRows.map((row, index) => (
              <div key={row.menuProductId} className="flex items-center gap-3">
                <span className="flex-1 text-sm">{row.menuProductName}</span>
                <Input
                  type="number"
                  min={0}
                  value={row.quantity || ""}
                  placeholder="0"
                  onChange={(e) => updateProducedQty(index, Number(e.target.value))}
                  className="w-24 text-right tabular-nums"
                />
              </div>
            ))}
          </div>

          {/* Waste section */}
          <div className="space-y-3">
            <button
              type="button"
              className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors w-full text-left"
              onClick={() => setWasteOpen((v) => !v)}
            >
              {wasteOpen ? (
                <ChevronUp className="h-4 w-4" />
              ) : (
                <ChevronDown className="h-4 w-4" />
              )}
              Waste entries
              {wasteRows.length > 0 && (
                <span className="ml-1 rounded-full bg-muted px-1.5 py-0.5 text-xs font-medium">
                  {wasteRows.length}
                </span>
              )}
            </button>

            {wasteOpen && (
              <div className="space-y-3 border-l-2 border-muted pl-4">
                {wasteRows.length === 0 && (
                  <p className="text-xs text-muted-foreground">No waste entries.</p>
                )}

                {wasteRows.map((row, index) => (
                  <div key={`${row.menuProductId}-${row.reason}-${index}`} className="space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium">{row.menuProductName}</span>
                      <button
                        type="button"
                        className="text-xs text-muted-foreground hover:text-destructive transition-colors"
                        onClick={() => removeWasteRow(index)}
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    </div>
                    <div className="flex gap-2">
                      <Select
                        value={row.reason}
                        onValueChange={(val) => updateWasteRow(index, "reason", val)}
                      >
                        <SelectTrigger className="flex-1 text-sm">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {WASTE_REASONS.map((r) => (
                            <SelectItem key={r.value} value={r.value}>
                              {r.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <Input
                        type="number"
                        min={0}
                        value={row.quantity || ""}
                        placeholder="0"
                        onChange={(e) => updateWasteRow(index, "quantity", Number(e.target.value))}
                        className="w-20 text-right tabular-nums"
                      />
                    </div>
                  </div>
                ))}

                {/* Add waste entry buttons */}
                <div className="flex flex-wrap gap-2 pt-1">
                  {producedRows.map((p) => (
                    <button
                      key={p.menuProductId}
                      type="button"
                      className="text-xs rounded-full border border-dashed border-muted-foreground/50 px-2.5 py-1 text-muted-foreground hover:border-foreground hover:text-foreground transition-colors"
                      onClick={() => addWasteRow(p.menuProductId, p.menuProductName)}
                    >
                      + {p.menuProductName}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Component production section */}
          {(componentProducedRows.length > 0 || addableComponents.length > 0) && (
            <div className="space-y-3">
              <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                Components Produced
              </Label>
              {componentProducedRows.map((row, index) => (
                <div key={row.kitchenComponentCode} className="flex items-center gap-3">
                  <span className="flex-1 text-sm">{row.kitchenComponentName}</span>
                  <Input
                    type="number"
                    min={0}
                    value={row.grams || ""}
                    placeholder="0"
                    onChange={(e) =>
                      setComponentProducedEntrys((prev) =>
                        prev.map((r, i) =>
                          i === index ? { ...r, grams: Math.max(0, Number(e.target.value)) } : r
                        )
                      )
                    }
                    className="w-24 text-right tabular-nums"
                  />
                  <span className="text-xs text-muted-foreground w-4">g</span>
                </div>
              ))}
              {/* Add component buttons for components not yet tracked (M1) */}
              {addableComponents.length > 0 && (
                <div className="flex flex-wrap gap-2 pt-1">
                  {addableComponents.map((c) => (
                    <button
                      key={c.code}
                      type="button"
                      className="text-xs rounded-full border border-dashed border-muted-foreground/50 px-2.5 py-1 text-muted-foreground hover:border-foreground hover:text-foreground transition-colors"
                      onClick={() =>
                        setComponentProducedEntrys((prev) => [
                          ...prev,
                          {
                            kitchenComponentCode: c.code,
                            kitchenComponentName: c.name,
                            grams: 0,
                          },
                        ])
                      }
                    >
                      + {c.name}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Component waste section */}
          {(componentProducedRows.length > 0 || componentWasteRows.length > 0) && (
            <div className="space-y-3">
              <button
                type="button"
                className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors w-full text-left"
                onClick={() => setComponentWasteOpen((v) => !v)}
              >
                {componentWasteOpen ? (
                  <ChevronUp className="h-4 w-4" />
                ) : (
                  <ChevronDown className="h-4 w-4" />
                )}
                Component waste
                {componentWasteRows.length > 0 && (
                  <span className="ml-1 rounded-full bg-muted px-1.5 py-0.5 text-xs font-medium">
                    {componentWasteRows.length}
                  </span>
                )}
              </button>

              {componentWasteOpen && (
                <div className="space-y-3 border-l-2 border-muted pl-4">
                  {componentWasteRows.length === 0 && (
                    <p className="text-xs text-muted-foreground">No component waste entries.</p>
                  )}

                  {componentWasteRows.map((row, index) => (
                    <div key={`${row.kitchenComponentCode}-${index}`} className="space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-medium">{row.kitchenComponentName}</span>
                        <button
                          type="button"
                          className="text-xs text-muted-foreground hover:text-destructive transition-colors"
                          onClick={() =>
                            setComponentWasteEntrys((prev) => prev.filter((_, i) => i !== index))
                          }
                        >
                          <X className="h-3.5 w-3.5" />
                        </button>
                      </div>
                      <div className="flex gap-2 items-center">
                        <Select
                          value={row.reason}
                          onValueChange={(val) =>
                            setComponentWasteEntrys((prev) =>
                              prev.map((r, i) =>
                                i === index ? { ...r, reason: val as WasteReason } : r
                              )
                            )
                          }
                        >
                          <SelectTrigger className="flex-1 text-sm">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {WASTE_REASONS.map((r) => (
                              <SelectItem key={r.value} value={r.value}>
                                {r.label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <Input
                          type="number"
                          min={0}
                          value={row.grams || ""}
                          placeholder="0"
                          onChange={(e) =>
                            setComponentWasteEntrys((prev) =>
                              prev.map((r, i) =>
                                i === index ? { ...r, grams: Math.max(0, Number(e.target.value)) } : r
                              )
                            )
                          }
                          className="w-20 text-right tabular-nums"
                        />
                        <span className="text-xs text-muted-foreground w-4">g</span>
                      </div>
                    </div>
                  ))}

                  {/* Add component waste buttons */}
                  <div className="flex flex-wrap gap-2 pt-1">
                    {componentProducedRows.map((c) => (
                      <button
                        key={c.kitchenComponentCode}
                        type="button"
                        className="text-xs rounded-full border border-dashed border-muted-foreground/50 px-2.5 py-1 text-muted-foreground hover:border-foreground hover:text-foreground transition-colors"
                        onClick={() =>
                          setComponentWasteEntrys((prev) => [
                            ...prev,
                            {
                              kitchenComponentCode: c.kitchenComponentCode,
                              kitchenComponentName: c.kitchenComponentName,
                              reason: "qa_testing",
                              grams: 0,
                            },
                          ])
                        }
                      >
                        + {c.kitchenComponentName}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Chef name */}
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">Chef (actual cook)</Label>
            <Input
              value={chefName}
              onChange={(e) => setChefName(e.target.value)}
              placeholder="Chef name..."
              className="h-8 text-sm"
            />
          </div>

          {/* Edit note */}
          <div className="space-y-1.5">
            <Label className="text-xs font-medium text-muted-foreground">
              Edit note (optional)
            </Label>
            <Input
              value={editNote}
              onChange={(e) => setEditNote(e.target.value)}
              placeholder="Reason for edit..."
              className="text-sm"
            />
          </div>
        </div>

        <DialogFooter className="flex gap-2 sm:justify-end">
          <Button variant="outline" onClick={onClose} size="sm">
            Cancel
          </Button>
          <Button onClick={handleReviewChanges} size="sm">
            Review Changes
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
