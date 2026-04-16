/**
 * EndOfShiftForm
 *
 * Three-step end-of-shift form:
 *   Step 1 - "input":   Produced quantities per product + optional waste section
 *   Step 2 - "review":  Review summary before committing (ShiftReviewModal)
 *   Step 3 - "success": Post-submission confirmation (ShiftSuccessScreen)
 *
 * Validates:
 *   - At least one produced quantity > 0 before advancing to review
 *   - Waste quantity cannot exceed produced quantity for the same product
 *
 * Per-component toggle support:
 *   - enabledComponents: which ball type codes are enabled
 *   - productBallTypes: map of menuProductId -> ball type code(s) from BOM
 *   - Rows hidden if ALL ball types for that product are disabled
 *   - Rows flagged if SOME ball types for that product are disabled
 *
 * On confirm, calls submitShiftRecord mutation via useProtectedMutation.
 */

import { useState, useCallback, useMemo } from "react";
import { ChevronDown, ChevronUp, AlertTriangle } from "lucide-react";
import { toast } from "sonner";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { useProtectedMutation } from "@/hooks/convex/useProtectedMutation";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
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
import { ShiftReviewModal } from "./ShiftReviewModal";
import { ShiftSuccessScreen } from "./ShiftSuccessScreen";
import { ComponentProductionSection } from "./ComponentProductionSection";
import type { ComponentWasteEntry } from "./ComponentProductionSection";
import type { KitchenTargets } from "./ProductionTargetsBar";
import { resolveUnit, type ComponentUnit } from "@/lib/componentUnit";

// -------------------------------------------------------
// Types
// -------------------------------------------------------

import { WASTE_REASONS, type WasteReason } from './index';

interface WasteEntry {
  menuProductId: string;
  menuProductName: string;
  reason: WasteReason;
  quantity: number;
}

interface ProducedItem {
  menuProductId: string;
  menuProductName: string;
  quantity: number;
}

type Step = "input" | "review" | "success";

interface EndOfShiftFormProps {
  targets: KitchenTargets | undefined;
  today: string;
  /** Array of enabled component codes, e.g. ["BIG_BALL", "MID_BALL"] */
  enabledComponents?: string[];
  /** Map of menuProductId -> ball type codes used by that product (from BOM) */
  productBallTypes?: Record<string, string[]>;
  /** Active users for chef selector */
  users?: Array<{ _id: string; name: string }>;
  /** Available kitchen components (tier-0 leaves from componentTypes) */
  kitchenComponents?: Array<{
    _id: string;
    name: string;
    code: string;
    unit: string;
    sortOrder: number;
    tier?: number;
  }>;
  /** Enabled kitchen component codes from config */
  enabledKitchenComponentCodes?: string[];
  /** Configured unit per component code from componentTracking */
  unitByCode?: Record<string, ComponentUnit>;
}

// -------------------------------------------------------
// Component
// -------------------------------------------------------

export function EndOfShiftForm({
  targets,
  today,
  enabledComponents,
  productBallTypes,
  users,
  kitchenComponents,
  enabledKitchenComponentCodes,
  unitByCode,
}: EndOfShiftFormProps) {
  const submitShiftRecord = useProtectedMutation(
    api.kitchenShiftRecords.mutations.submitShiftRecord
  );

  // -------------------------------------------------------
  // State
  // -------------------------------------------------------

  const [step, setStep] = useState<Step>("input");

  // Produced quantities: menuProductId -> number
  const [produced, setProduced] = useState<Record<string, number>>({});

  // Waste section visibility
  const [wasteOpen, setWasteOpen] = useState(false);

  // Waste entries: array of {menuProductId, menuProductName, reason, quantity}
  const [wasteEntries, setWasteEntries] = useState<WasteEntry[]>([]);

  // Submission state
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Submitted data (for success screen)
  const [submittedProduced, setSubmittedProduced] = useState<ProducedItem[]>([]);
  const [submittedWaste, setSubmittedWaste] = useState<WasteEntry[]>([]);

  // Chef selector
  const [selectedChefId, setSelectedChefId] = useState<string>("");

  // Inline error from mutation failure on review screen
  const [confirmError, setConfirmError] = useState<string | null>(null);

  const [componentProduced, setComponentProduced] = useState<Record<string, number>>({});
  const [componentWasteOpen, setComponentWasteOpen] = useState(false);
  const [componentWaste, setComponentWaste] = useState<ComponentWasteEntry[]>([]);

  const packagingItems = targets?.packagingBreakdown ?? [];

  // Filter items based on enabled ball-type components.
  const visibleItems = useMemo(
    () =>
      packagingItems.filter((item) => {
        if (!enabledComponents || !productBallTypes) return true;
        const ballTypes = productBallTypes[item.menuProductId] ?? [];
        if (ballTypes.length === 0) return true;
        return ballTypes.some((bt) => enabledComponents.includes(bt));
      }),
    [packagingItems, enabledComponents, productBallTypes]
  );

  // Products with mixed ball type visibility (some enabled, some disabled).
  const flaggedItemIds = useMemo(
    () =>
      new Set<string>(
        packagingItems
          .filter((item) => {
            if (!enabledComponents || !productBallTypes) return false;
            const ballTypes = productBallTypes[item.menuProductId] ?? [];
            if (ballTypes.length <= 1) return false;
            return (
              ballTypes.some((bt) => enabledComponents.includes(bt)) &&
              ballTypes.some((bt) => !enabledComponents.includes(bt))
            );
          })
          .map((item) => item.menuProductId)
      ),
    [packagingItems, enabledComponents, productBallTypes]
  );

  const visibleWasteEntries = useMemo(
    () =>
      wasteEntries.filter((entry) => {
        if (!enabledComponents || !productBallTypes) return true;
        const ballTypes = productBallTypes[entry.menuProductId] ?? [];
        if (ballTypes.length === 0) return true;
        return ballTypes.some((bt) => enabledComponents.includes(bt));
      }),
    [wasteEntries, enabledComponents, productBallTypes]
  );

  // Filter kitchen components by enabled codes and apply the configured unit
  // from unitByCode. Only emit a new object when the configured unit differs
  // from the componentType's native unit.
  const visibleKitchenComponents = useMemo(() => {
    const base = kitchenComponents ?? [];
    const allowAll = !enabledKitchenComponentCodes || enabledKitchenComponentCodes.length === 0;
    return base
      .filter((comp) => allowAll || enabledKitchenComponentCodes.includes(comp.code))
      .map((comp) => {
        const configured = unitByCode?.[comp.code];
        return configured && configured !== comp.unit ? { ...comp, unit: configured } : comp;
      });
  }, [kitchenComponents, enabledKitchenComponentCodes, unitByCode]);

  function getProducedQty(menuProductId: string): number {
    return produced[menuProductId] ?? 0;
  }

  function setProducedQty(menuProductId: string, qty: number) {
    setProduced((prev) => ({ ...prev, [menuProductId]: Math.max(0, qty) }));
  }

  function addWasteEntry(menuProductId: string, menuProductName: string) {
    setWasteEntries((prev) => [
      ...prev,
      { menuProductId, menuProductName, reason: "qa_testing", quantity: 0 },
    ]);
  }

  function updateWasteEntry(
    index: number,
    field: "reason" | "quantity",
    value: string | number
  ) {
    setWasteEntries((prev) =>
      prev.map((entry, i) =>
        i === index
          ? {
              ...entry,
              [field]:
                field === "quantity"
                  ? Math.max(0, Number(value))
                  : (value as WasteReason),
            }
          : entry
      )
    );
  }

  function removeWasteEntry(index: number) {
    setWasteEntries((prev) => prev.filter((_, i) => i !== index));
  }

  // -------------------------------------------------------
  // Validation
  // -------------------------------------------------------

  function validate(): string | null {
    const hasAnyBallProduced = visibleItems.some(
      (item) => getProducedQty(item.menuProductId) > 0
    );
    const hasAnyComponentProduced = visibleKitchenComponents.some(
      (c) => (componentProduced[c.code] ?? 0) > 0
    );
    if (!hasAnyBallProduced && !hasAnyComponentProduced) {
      return "Enter at least one produced quantity (balls or components) before reviewing.";
    }

    // Check waste <= produced for each product
    for (const entry of wasteEntries) {
      if (entry.quantity <= 0) continue;
      const producedQty = getProducedQty(entry.menuProductId);
      if (entry.quantity > producedQty) {
        return `Waste for "${entry.menuProductName}" cannot exceed produced quantity (${producedQty}).`;
      }
    }

    for (const entry of componentWaste) {
      if (entry.grams <= 0) continue;
      const producedGrams = componentProduced[entry.code] ?? 0;
      if (entry.grams > producedGrams) {
        return `Component waste for "${entry.name}" (${entry.grams}g) cannot exceed produced (${producedGrams}g).`;
      }
    }

    return null;
  }

  // -------------------------------------------------------
  // Derived: produced + waste lists for review/success
  // -------------------------------------------------------

  function buildProducedList(): ProducedItem[] {
    return visibleItems
      .filter((item) => getProducedQty(item.menuProductId) > 0)
      .map((item) => ({
        menuProductId: item.menuProductId,
        menuProductName: item.name,
        quantity: getProducedQty(item.menuProductId),
      }));
  }

  function buildWasteList(): WasteEntry[] {
    return visibleWasteEntries.filter((e) => e.quantity > 0);
  }

  // -------------------------------------------------------
  // Handlers
  // -------------------------------------------------------

  function handleReview() {
    const error = validate();
    if (error) {
      toast.error(error);
      return;
    }
    setConfirmError(null); // Clear any previous confirm error
    setStep("review");
  }

  const handleConfirm = useCallback(async () => {
    const producedList = buildProducedList();
    const wasteList = buildWasteList();

    // Resolve chef info
    const selectedUser = users?.find((u) => u._id === selectedChefId);
    const chefName = selectedUser?.name;
    const chefUserId = selectedChefId || undefined;

    // Build unit map so both produced and waste entries report their configured unit.
    const unitByCodeMap = new Map<string, ComponentUnit>(
      visibleKitchenComponents.map((c) => [c.code, resolveUnit(c.unit)])
    );
    const componentProducedList = visibleKitchenComponents
      .filter((c) => (componentProduced[c.code] ?? 0) > 0)
      .map((c) => ({
        kitchenComponentCode: c.code,
        kitchenComponentName: c.name,
        grams: componentProduced[c.code]!,
        unit: resolveUnit(c.unit),
      }));

    const componentWasteList = componentWaste
      .filter((e) => e.grams > 0)
      .map((e) => ({
        kitchenComponentCode: e.code,
        kitchenComponentName: e.name,
        reason: e.reason as "qa_testing" | "spoilage" | "waste",
        grams: e.grams,
        unit: unitByCodeMap.get(e.code) ?? "g",
      }));

    setIsSubmitting(true);
    try {
      await submitShiftRecord({
        date: today,
        produced: producedList.map((p) => ({
          menuProductId: p.menuProductId as Id<"menuProducts">,
          quantity: p.quantity,
        })),
        waste: wasteList.map((w) => ({
          menuProductId: w.menuProductId as Id<"menuProducts">,
          reason: w.reason,
          quantity: w.quantity,
        })),
        ...(chefName ? { chefName } : {}),
        ...(chefUserId ? { chefUserId: chefUserId as Id<"users"> } : {}),
        ...(componentProducedList.length > 0 ? { componentProduced: componentProducedList } : {}),
        ...(componentWasteList.length > 0 ? { componentWaste: componentWasteList } : {}),
      });

      // Store for success screen before resetting
      setSubmittedProduced(producedList);
      setSubmittedWaste(wasteList);
      setStep("success");
    } catch (error) {
      const msg =
        error instanceof Error ? error.message : "Failed to submit shift record";
      setConfirmError(msg); // Inline error instead of toast
    } finally {
      setIsSubmitting(false);
    }
  }, [produced, wasteEntries, today, submitShiftRecord, selectedChefId, users, visibleItems, componentProduced, componentWaste, visibleKitchenComponents]);

  function handleDone() {
    // Reset form to initial state
    setProduced({});
    setWasteEntries([]);
    setWasteOpen(false);
    setSubmittedProduced([]);
    setSubmittedWaste([]);
    setSelectedChefId("");
    setComponentProduced({});
    setComponentWaste([]);
    setComponentWasteOpen(false);
    setStep("input");
  }

  // -------------------------------------------------------
  // Render: Success
  // -------------------------------------------------------

  if (step === "success") {
    // Include unit so pcs sub-components render with their native unit.
    const successComponentProduced = visibleKitchenComponents
      .filter((c) => (componentProduced[c.code] ?? 0) > 0)
      .map((c) => ({
        kitchenComponentName: c.name,
        grams: componentProduced[c.code]!,
        unit: c.unit,
      }));

    return (
      <ShiftSuccessScreen
        produced={submittedProduced}
        waste={submittedWaste}
        targets={packagingItems}
        onDone={handleDone}
        componentProduced={successComponentProduced.length > 0 ? successComponentProduced : undefined}
      />
    );
  }

  // -------------------------------------------------------
  // Render: Review
  // -------------------------------------------------------

  if (step === "review") {
    // Local name differs from the `unitByCode` prop above to avoid shadowing.
    const unitByCodeMap = new Map(visibleKitchenComponents.map((c) => [c.code, c.unit]));
    const reviewComponentProduced = visibleKitchenComponents
      .filter((c) => (componentProduced[c.code] ?? 0) > 0)
      .map((c) => ({
        kitchenComponentName: c.name,
        grams: componentProduced[c.code]!,
        unit: c.unit,
      }));
    const reviewComponentWaste = componentWaste
      .filter((e) => e.grams > 0)
      .map((e) => ({
        kitchenComponentName: e.name,
        grams: e.grams,
        reason: e.reason,
        unit: unitByCodeMap.get(e.code),
      }));

    return (
      <ShiftReviewModal
        produced={buildProducedList()}
        waste={buildWasteList()}
        targets={packagingItems}
        onConfirm={handleConfirm}
        onBack={() => setStep("input")}
        isSubmitting={isSubmitting}
        error={confirmError}
        componentProduced={reviewComponentProduced.length > 0 ? reviewComponentProduced : undefined}
        componentWaste={reviewComponentWaste.length > 0 ? reviewComponentWaste : undefined}
      />
    );
  }

  // -------------------------------------------------------
  // Render: Input
  // -------------------------------------------------------

  if (visibleItems.length === 0 && visibleKitchenComponents.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-base">End of Shift</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            No products in today's target plan and no kitchen components enabled.
            Add a dispatch plan, configure a default packaging mix, or enable
            kitchen components in Manager Settings.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">End of Shift</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Chef selector */}
        {users && users.length > 0 && (
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">Chef (actual cook)</Label>
            <Select value={selectedChefId} onValueChange={setSelectedChefId}>
              <SelectTrigger className="h-8 text-sm">
                <SelectValue placeholder="Select chef..." />
              </SelectTrigger>
              <SelectContent>
                {users.map((u) => (
                  <SelectItem key={u._id} value={u._id}>
                    {u.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}

        {/* Produced quantities */}
        {visibleItems.length > 0 && (
          <>
            <div className="space-y-3">
              <p className="text-sm font-medium text-muted-foreground uppercase tracking-wide">
                Balls Produced
              </p>
              {visibleItems.map((item) => {
                const isFlagged = flaggedItemIds.has(item.menuProductId);
                const qty = getProducedQty(item.menuProductId);
                const delta = qty > 0 ? qty - item.quantity : null;

                return (
                  <div key={item.menuProductId} className="space-y-1">
                    {/* Row 1: Product name (full width, wraps freely) */}
                    <Label
                      htmlFor={`produced-${item.menuProductId}`}
                      className="text-sm font-normal break-words"
                    >
                      {item.name}
                      {isFlagged && (
                        <span className="flex items-center gap-1 text-xs text-amber-600 dark:text-amber-400 mt-0.5">
                          <AlertTriangle className="h-3 w-3" />
                          Mixed ball types — one type disabled
                        </span>
                      )}
                    </Label>

                    {/* Row 2: Target + input + delta in a single line */}
                    <div className="flex items-center gap-2">
                      {/* Target label */}
                      <span className="text-xs text-muted-foreground whitespace-nowrap shrink-0">
                        target: {item.quantity}
                      </span>

                      {/* Spacer */}
                      <span className="flex-1" />

                      {/* Produced input */}
                      <Input
                        id={`produced-${item.menuProductId}`}
                        type="number"
                        min={0}
                        value={qty || ""}
                        placeholder="0"
                        onChange={(e) =>
                          setProducedQty(item.menuProductId, Number(e.target.value))
                        }
                        className="w-20 text-right tabular-nums shrink-0"
                      />

                      {/* Live delta — only shown when quantity > 0; invisible reserves space */}
                      <span
                        className={`text-xs font-medium tabular-nums whitespace-nowrap shrink-0 ${
                          delta === null
                            ? "invisible"
                            : delta >= 0
                              ? "text-emerald-600 dark:text-emerald-400"
                              : "text-amber-600 dark:text-amber-400"
                        }`}
                      >
                        {delta === null
                          ? ""
                          : delta === 0
                            ? "on target"
                            : delta > 0
                              ? `+${delta} over`
                              : `${delta} under`}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Waste section toggle */}
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
              Any waste to capture?
              {wasteEntries.length > 0 && (
                <span className="ml-1 rounded-full bg-muted px-1.5 py-0.5 text-xs font-medium">
                  {wasteEntries.length}
                </span>
              )}
            </button>

            {/* Waste entries */}
            {wasteOpen && (
              <div className="space-y-3 border-l-2 border-muted pl-4">
                {visibleWasteEntries.length === 0 && (
                  <p className="text-xs text-muted-foreground">
                    No waste entries yet. Add one below.
                  </p>
                )}

                {wasteEntries.map((entry, index) => {
                  // Skip entries for disabled-component products (preserve original index for callbacks)
                  const ballTypes = productBallTypes?.[entry.menuProductId] ?? [];
                  const isDisabled =
                    enabledComponents &&
                    productBallTypes &&
                    ballTypes.length > 0 &&
                    ballTypes.every((bt) => !enabledComponents.includes(bt));
                  if (isDisabled) return null;
                  return (
                  <div key={index} className="space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium">
                        {entry.menuProductName}
                      </span>
                      <button
                        type="button"
                        className="text-xs text-muted-foreground hover:text-destructive transition-colors"
                        onClick={() => removeWasteEntry(index)}
                      >
                        Remove
                      </button>
                    </div>
                    <div className="flex gap-2">
                      <Select
                        value={entry.reason}
                        onValueChange={(val) =>
                          updateWasteEntry(index, "reason", val)
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
                        value={entry.quantity || ""}
                        placeholder="0"
                        onChange={(e) =>
                          updateWasteEntry(index, "quantity", Number(e.target.value))
                        }
                        className="w-20 text-right tabular-nums"
                      />
                    </div>
                  </div>
                  );
                })}

                {/* Add waste entry buttons */}
                <div className="flex flex-wrap gap-2 pt-1">
                  {visibleItems.map((item) => (
                    <button
                      key={item.menuProductId}
                      type="button"
                      className="text-xs rounded-full border border-dashed border-muted-foreground/50 px-2.5 py-1 text-muted-foreground hover:border-foreground hover:text-foreground transition-colors"
                      onClick={() =>
                        addWasteEntry(item.menuProductId, item.name)
                      }
                    >
                      + {item.name}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </>
        )}

        {/* Component production section */}
        {visibleKitchenComponents.length > 0 && (
          <div className="border-t border-border pt-4">
            <ComponentProductionSection
              components={visibleKitchenComponents}
              produced={componentProduced}
              waste={componentWaste}
              wasteOpen={componentWasteOpen}
              onProducedChange={(code, grams) =>
                setComponentProduced((prev) => ({ ...prev, [code]: Math.max(0, grams) }))
              }
              onWasteToggle={() => setComponentWasteOpen((v) => !v)}
              onAddWaste={(code, name) =>
                setComponentWaste((prev) => [
                  ...prev,
                  { code, name, reason: "qa_testing" as const, grams: 0 },
                ])
              }
              onUpdateWaste={(index, field, value) =>
                setComponentWaste((prev) =>
                  prev.map((e, i) =>
                    i === index
                      ? {
                          ...e,
                          [field]:
                            field === "grams"
                              ? Math.max(0, Number(value))
                              : value,
                        }
                      : e
                  )
                )
              }
              onRemoveWaste={(index) =>
                setComponentWaste((prev) => prev.filter((_, i) => i !== index))
              }
            />
          </div>
        )}

        {/* Review button */}
        <Button onClick={handleReview} className="w-full">
          Review &amp; Submit
        </Button>
      </CardContent>
    </Card>
  );
}
