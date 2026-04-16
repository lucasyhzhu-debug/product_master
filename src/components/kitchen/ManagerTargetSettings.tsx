/**
 * ManagerTargetSettings
 *
 * Manager-only section rendered on the kitchen page.
 * Unified form covering:
 *   - Ball targets (per tier-1 production componentType)
 *   - Component tracking (which components appear in EndOfShiftForm + display unit)
 *   - Packaging mix (PackagingMixEditor with BOM info + allocation counters)
 *
 * Two save actions: "Save as Default Daily Targets" and "Apply Override for
 * Today Only". Ball targets are the ceiling — there is no separate max
 * capacity field.
 */

import { useState, useEffect, useMemo, useRef } from "react";
import { toast } from "sonner";
import { useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { useProtectedMutation } from "@/hooks/convex/useProtectedMutation";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PackagingMixEditor, type PackagingMixRow, type BallGroupDef } from "./PackagingMixEditor";
import type { KitchenTargets } from "./ProductionTargetsBar";
import { getKitchenLeafComponents, getProductionTier1Components } from "@/lib/componentFilters";
import { resolveUnit, type ComponentUnit } from "@/lib/componentUnit";

interface ComponentTrackingEntry {
  code: string;
  tracked: boolean;
  unit: "g" | "pcs";
}

interface KitchenConfig {
  _id: Id<"kitchenConfig"> | null;
  maxProductionTarget: number;
  bigBallTarget: number;
  midBallTarget: number;
  defaultPackagingMix: Array<{ menuProductId: string; quantity: number }>;
  showJumbo: boolean;
  enabledProductionComponents: string[] | null;
  enabledKitchenComponents: string[] | null;
  otherBallTargets?: Array<{ code: string; target: number }>;
  componentTracking?: ComponentTrackingEntry[] | null;
  updatedAt: number | null;
  updatedBy: string | null;
}

interface ManagerTargetSettingsProps {
  config: KitchenConfig | undefined;
  targets: KitchenTargets | undefined;
  today: string;
}

export function ManagerTargetSettings({ config, targets, today }: ManagerTargetSettingsProps) {
  const componentsWithTiers = useQuery(api.productionRecipes.queries.getComponentsWithTiers);
  const productionComponents = useMemo(
    () => getProductionTier1Components(componentsWithTiers ?? []),
    [componentsWithTiers]
  );
  const kitchenComponentsList = useMemo(
    () => getKitchenLeafComponents(componentsWithTiers ?? []),
    [componentsWithTiers]
  );
  const updateConfig = useProtectedMutation(api.kitchenConfig.mutations.updateConfig);
  const setDailyOverride = useProtectedMutation(api.kitchenDailyOverrides.mutations.setDailyOverride);
  const clearDailyOverride = useProtectedMutation(api.kitchenDailyOverrides.mutations.clearDailyOverride);

  // One target per production ball code, keyed by componentType.code
  // (BIG_BALL / MID_BALL / HAZELNUT_REGULAR / ...).
  const [ballTargetsByCode, setBallTargetsByCode] = useState<Record<string, number>>({});
  const [packagingMix, setPackagingMix] = useState<PackagingMixRow[]>([]);
  // Unified component tracking state
  const [componentTracking, setComponentTracking] = useState<ComponentTrackingEntry[]>([]);

  // Derived: enabledComponents for backward-compat reads by ballTargetRows/PackagingMixEditor
  const enabledComponents = useMemo(
    () => componentTracking.filter((e) => e.tracked).map((e) => e.code),
    [componentTracking]
  );

  // -- Saving states --
  const [isSavingDefaults, setIsSavingDefaults] = useState(false);
  const [isSavingOverride, setIsSavingOverride] = useState(false);
  const [isClearingOverride, setIsClearingOverride] = useState(false);

  // Derive whether an override is currently active
  const overrideActive = targets?.source === "override";

  // Hydration is split into two effects because Convex re-emits the `config`
  // reference when any subscribed query updates. Depending on `config` alone
  // would reset unsaved edits. Instead:
  //   - Effect A hydrates scalars + stored componentTracking when the config
  //     identity changes (or the componentTracking reference changes).
  //   - Effect B derives componentTracking from legacy fields ONCE per config
  //     identity when no stored tracking exists. `hasHydratedLegacyRef` gates
  //     re-runs on subsequent query pushes.

  const hasHydratedLegacyRef = useRef(false);
  const lastConfigIdRef = useRef<string | null | undefined>(undefined);
  useEffect(() => {
    if (!config) return;
    const configId = config._id ? String(config._id) : null;
    const isNewConfig = configId !== lastConfigIdRef.current;
    lastConfigIdRef.current = configId;

    if (isNewConfig) {
      const nextTargets: Record<string, number> = {
        BIG_BALL: config.bigBallTarget,
        MID_BALL: config.midBallTarget,
      };
      for (const entry of config.otherBallTargets ?? []) {
        nextTargets[entry.code] = entry.target;
      }
      setBallTargetsByCode(nextTargets);
      setPackagingMix(
        (config.defaultPackagingMix ?? []).map((row) => ({
          menuProductId: String(row.menuProductId),
          quantity: row.quantity,
        }))
      );
      // Reset legacy-derivation gate so Effect B re-runs against the fresh config.
      hasHydratedLegacyRef.current = false;
    }

    if (config.componentTracking && config.componentTracking.length > 0) {
      setComponentTracking(config.componentTracking);
      hasHydratedLegacyRef.current = true;
    }
  }, [
    config,
    config?._id,
    config?.componentTracking,
    config?.bigBallTarget,
    config?.midBallTarget,
    config?.otherBallTargets,
    config?.defaultPackagingMix,
  ]);

  useEffect(() => {
    if (!config) return;
    if (hasHydratedLegacyRef.current) return;
    if (config.componentTracking && config.componentTracking.length > 0) return;
    if (productionComponents.length === 0 && kitchenComponentsList.length === 0) return;

    const enabledProd = config.enabledProductionComponents ?? productionComponents.map((c) => c.code);
    const enabledKitchen = config.enabledKitchenComponents;
    const entries: ComponentTrackingEntry[] = [];
    for (const c of productionComponents) {
      entries.push({
        code: c.code,
        tracked: enabledProd.includes(c.code),
        unit: resolveUnit(c.unit, "pcs"),
      });
    }
    for (const c of kitchenComponentsList) {
      entries.push({
        code: c.code,
        tracked: enabledKitchen === null ? true : enabledKitchen.includes(c.code),
        unit: resolveUnit(c.unit),
      });
    }
    setComponentTracking(entries);
    hasHydratedLegacyRef.current = true;
  }, [config, productionComponents, kitchenComponentsList]);

  // Ordered ball target rows — one per tier-1 pcs production componentType.
  // Disabled codes still render (so the user can enable + set a target in one
  // save action), but the input is dimmed.
  const ballTargetRows = useMemo(() => {
    const rows = productionComponents
      .filter((c) => c.unit === "pcs")
      .map((c) => {
        const isEnabled = enabledComponents.includes(c.code);
        const grams = c.gramsPerUnit;
        const label = grams ? `${c.name} (${grams}g)` : c.name;
        const value = ballTargetsByCode[c.code] ?? 0;
        const setValue = (n: number) =>
          setBallTargetsByCode((prev) => ({ ...prev, [c.code]: Math.max(0, n) }));
        return { code: c.code, label, value, setValue, isEnabled };
      });
    // Stable order: MID_BALL first, then BIG_BALL, then others alphabetical.
    rows.sort((a, b) => {
      const order = (code: string) =>
        code === "MID_BALL" ? 0 : code === "BIG_BALL" ? 1 : 2;
      const da = order(a.code);
      const db = order(b.code);
      if (da !== db) return da - db;
      return a.label.localeCompare(b.label);
    });
    return rows;
  }, [productionComponents, enabledComponents, ballTargetsByCode]);

  // Ball groups for the PackagingMixEditor — one section per tier-1 pcs code
  // in the same order as the target inputs above.
  // Title format: "{Name} Products (Ng)" when gramsPerUnit is set, else "{Name} Products".
  const ballGroups = useMemo<BallGroupDef[]>(() => {
    const byCode = new Map(productionComponents.map((c) => [c.code, c]));
    return ballTargetRows.map((r) => {
      const ct = byCode.get(r.code);
      const grams = ct?.gramsPerUnit;
      const name = ct?.name ?? r.code;
      const title = grams ? `${name} Products (${grams}g)` : `${name} Products`;
      return { code: r.code, title, target: r.value };
    });
  }, [ballTargetRows, productionComponents]);

  function toggleTracked(code: string) {
    setComponentTracking((prev) =>
      prev.map((e) => e.code === code ? { ...e, tracked: !e.tracked } : e)
    );
  }

  function setUnit(code: string, unit: "g" | "pcs") {
    setComponentTracking((prev) =>
      prev.map((e) => e.code === code ? { ...e, unit } : e)
    );
  }

  async function handleSaveDefaults() {
    const validMix = packagingMix.filter((row) => row.menuProductId && row.quantity > 0);

    // Only persist codes present in productionComponents to avoid stale codes
    // from earlier sessions.
    const validOtherCodes = new Set(
      productionComponents
        .filter((c) => c.unit === "pcs" && c.code !== "BIG_BALL" && c.code !== "MID_BALL")
        .map((c) => c.code)
    );
    const otherBallTargetsPayload = Object.entries(ballTargetsByCode)
      .filter(([code]) => validOtherCodes.has(code))
      .map(([code, target]) => ({ code, target }));

    const bigBallTarget = ballTargetsByCode.BIG_BALL ?? 0;
    const midBallTarget = ballTargetsByCode.MID_BALL ?? 0;
    const totalBalls =
      bigBallTarget +
      midBallTarget +
      otherBallTargetsPayload.reduce((sum, e) => sum + e.target, 0);

    setIsSavingDefaults(true);
    try {
      const trackedProdCodes = componentTracking
        .filter((e) => e.tracked && productionComponents.some((p) => p.code === e.code))
        .map((e) => e.code);
      const trackedKitchenCodes = componentTracking
        .filter((e) => e.tracked && kitchenComponentsList.some((k) => k.code === e.code))
        .map((e) => e.code);

      await updateConfig({
        maxProductionTarget: totalBalls || 1, // keep legacy field > 0
        bigBallTarget,
        midBallTarget,
        enabledProductionComponents: trackedProdCodes,
        enabledKitchenComponents: trackedKitchenCodes.length > 0 ? trackedKitchenCodes : undefined,
        otherBallTargets: otherBallTargetsPayload,
        componentTracking: componentTracking,
        defaultPackagingMix:
          validMix.length > 0
            ? validMix.map((row) => ({
                menuProductId: row.menuProductId as Id<"menuProducts">,
                quantity: row.quantity,
              }))
            : undefined,
      });
      toast.success("Default daily targets saved");
    } catch (error) {
      const msg = error instanceof Error ? error.message : "Failed to save defaults";
      toast.error(msg);
    } finally {
      setIsSavingDefaults(false);
    }
  }

  async function handleApplyOverride() {
    const hasAnyTarget = Object.values(ballTargetsByCode).some((t) => t > 0);
    if (!hasAnyTarget) {
      toast.error("Enter at least one ball target before applying override");
      return;
    }

    // Build overrides filtered to currently-tracked tier-1 codes so stale
    // pcs entries from a previous session can't bleed into today's override.
    const trackedCodeSet = new Set(
      componentTracking.filter((e) => e.tracked).map((e) => e.code)
    );
    const validOtherCodes = new Set(
      productionComponents
        .filter((c) => c.unit === "pcs" && c.code !== "BIG_BALL" && c.code !== "MID_BALL")
        .map((c) => c.code)
    );
    const otherBallOverrides = Object.entries(ballTargetsByCode)
      .filter(([code, target]) => target > 0 && validOtherCodes.has(code) && trackedCodeSet.has(code))
      .map(([code, target]) => ({ code, target }));

    setIsSavingOverride(true);
    try {
      await setDailyOverride({
        date: today,
        bigBallOverride: ballTargetsByCode.BIG_BALL ?? 0,
        midBallOverride: ballTargetsByCode.MID_BALL ?? 0,
        otherBallOverrides: otherBallOverrides.length > 0 ? otherBallOverrides : undefined,
        source: "manual",
      });
      toast.success("Override applied for today only");
    } catch (error) {
      const msg = error instanceof Error ? error.message : "Failed to apply override";
      toast.error(msg);
    } finally {
      setIsSavingOverride(false);
    }
  }

  async function handleClearOverride() {
    setIsClearingOverride(true);
    try {
      await clearDailyOverride({ date: today });
      toast.success("Override cleared — using dispatch plan / defaults");
    } catch (error) {
      const msg = error instanceof Error ? error.message : "Failed to clear override";
      toast.error(msg);
    } finally {
      setIsClearingOverride(false);
    }
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center justify-between">
          <span>Production Targets</span>
          {overrideActive ? (
            <Badge variant="default" className="text-xs">
              Override active
            </Badge>
          ) : (
            <Badge variant="secondary" className="text-xs">
              Using plan / defaults
            </Badge>
          )}
        </CardTitle>
      </CardHeader>

      <CardContent className="space-y-5">
        {/* One input per active+enabled tier-1 pcs componentType. Disabled
            codes render dimmed — toggle them on via Component Tracking. */}
        <div>
          <Label className="text-xs text-muted-foreground uppercase tracking-wide block mb-2">
            Ball Targets
          </Label>
          {ballTargetRows.length === 0 ? (
            <p className="text-xs text-muted-foreground italic">
              No production ball types found. Add a tier-1 production component or run seedLeafKitchenComponents.
            </p>
          ) : (
            <div
              className={[
                "grid gap-3",
                ballTargetRows.length === 1
                  ? "grid-cols-1"
                  : ballTargetRows.length === 2
                    ? "grid-cols-2"
                    : "grid-cols-2 sm:grid-cols-3",
              ].join(" ")}
            >
              {ballTargetRows.map((row) => (
                <div
                  key={row.code}
                  className={["space-y-1.5", !row.isEnabled ? "opacity-50" : ""].join(" ")}
                >
                  <Label className="text-xs text-muted-foreground">
                    {row.label}
                    {!row.isEnabled && <span className="ml-1 italic">(off)</span>}
                  </Label>
                  <Input
                    type="number"
                    min={0}
                    value={row.value === 0 ? "" : row.value}
                    placeholder="0"
                    disabled={!row.isEnabled}
                    onChange={(e) => row.setValue(Number(e.target.value))}
                    className="text-right tabular-nums"
                  />
                </div>
              ))}
            </div>
          )}
        </div>

        <div>
          <Label className="text-xs text-muted-foreground uppercase tracking-wide block mb-2">
            Component Tracking
          </Label>
          <p className="text-xs text-muted-foreground mb-3">
            Configure which components appear in the End of Shift form and their display unit.
          </p>

          {componentsWithTiers === undefined ? (
            <p className="text-xs text-muted-foreground">Loading components...</p>
          ) : (productionComponents.length === 0 && kitchenComponentsList.length === 0) ? (
            <p className="text-xs text-muted-foreground italic">
              No components found. Add production components or run seedLeafKitchenComponents.
            </p>
          ) : (
            <div className="rounded-lg border border-border overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border bg-muted/50">
                    <th className="text-left px-3 py-2 font-medium text-muted-foreground">Component</th>
                    <th className="text-center px-3 py-2 font-medium text-muted-foreground w-16">Track?</th>
                    <th className="text-center px-3 py-2 font-medium text-muted-foreground w-24">Unit</th>
                  </tr>
                </thead>
                <tbody>
                  {productionComponents.length > 0 && (
                    <>
                      <tr className="bg-muted/30">
                        <td colSpan={3} className="px-3 py-1.5 text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                          Tier 1
                        </td>
                      </tr>
                      {productionComponents.map((ct) => {
                        const entry = componentTracking.find((e) => e.code === ct.code);
                        return (
                          <ComponentTrackingRow
                            key={ct._id}
                            name={ct.name}
                            code={ct.code}
                            isTracked={entry?.tracked ?? true}
                            unit={entry?.unit ?? "pcs"}
                            onToggle={toggleTracked}
                            onSetUnit={setUnit}
                          />
                        );
                      })}
                    </>
                  )}

                  {kitchenComponentsList.length > 0 && (
                    <>
                      <tr className="bg-muted/30">
                        <td colSpan={3} className="px-3 py-1.5 text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                          Leaf Components
                        </td>
                      </tr>
                      {kitchenComponentsList.map((comp) => {
                        const entry = componentTracking.find((e) => e.code === comp.code);
                        return (
                          <ComponentTrackingRow
                            key={comp._id}
                            name={comp.name}
                            code={comp.code}
                            isTracked={entry?.tracked ?? true}
                            unit={entry?.unit ?? resolveUnit(comp.unit)}
                            onToggle={toggleTracked}
                            onSetUnit={setUnit}
                          />
                        );
                      })}
                    </>
                  )}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Packaging Mix */}
        <div>
          <Label className="text-xs text-muted-foreground uppercase tracking-wide block mb-2">
            Packaging Mix
          </Label>
          <PackagingMixEditor
            rows={packagingMix}
            onChange={setPackagingMix}
            enabledComponents={enabledComponents}
            ballGroups={ballGroups}
          />
        </div>

        {/* Action Buttons */}
        <div className="flex gap-2 pt-1">
          <Button
            onClick={handleSaveDefaults}
            disabled={isSavingDefaults}
            size="sm"
            variant="default"
            className="flex-1"
          >
            {isSavingDefaults ? "Saving..." : "Save as Default Daily Targets"}
          </Button>
          <Button
            onClick={handleApplyOverride}
            disabled={isSavingOverride}
            size="sm"
            variant="outline"
            className="flex-1"
          >
            {isSavingOverride ? "Applying..." : "Apply Override for Today Only"}
          </Button>
        </div>

        {/* Clear Override (only when active) */}
        {overrideActive && (
          <Button
            onClick={handleClearOverride}
            disabled={isClearingOverride}
            size="sm"
            variant="ghost"
            className="w-full text-muted-foreground hover:text-destructive"
          >
            {isClearingOverride ? "Clearing..." : "Clear Override"}
          </Button>
        )}

        {/* Last updated */}
        {config?.updatedBy && config.updatedAt && (
          <p className="text-xs text-muted-foreground text-center">
            Last updated by {config.updatedBy} at{" "}
            {new Date(config.updatedAt).toLocaleString("en-US", {
              month: "short",
              day: "numeric",
              hour: "2-digit",
              minute: "2-digit",
              hour12: false,
            })}
          </p>
        )}
      </CardContent>
    </Card>
  );
}

interface ComponentTrackingRowProps {
  name: string;
  code: string;
  isTracked: boolean;
  unit: ComponentUnit;
  onToggle: (code: string) => void;
  onSetUnit: (code: string, unit: ComponentUnit) => void;
}

function ComponentTrackingRow({
  name,
  code,
  isTracked,
  unit,
  onToggle,
  onSetUnit,
}: ComponentTrackingRowProps) {
  return (
    <tr className="border-t border-border">
      <td className="px-3 py-2">{name}</td>
      <td className="px-3 py-2 text-center">
        <button
          type="button"
          role="switch"
          aria-checked={isTracked}
          onClick={() => onToggle(code)}
          className={[
            "relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors",
            isTracked ? "bg-primary" : "bg-input",
          ].join(" ")}
        >
          <span
            className={[
              "pointer-events-none inline-block h-4 w-4 rounded-full bg-background shadow-lg ring-0 transition-transform",
              isTracked ? "translate-x-4" : "translate-x-0",
            ].join(" ")}
          />
        </button>
      </td>
      <td className="px-3 py-2 text-center">
        <div className="inline-flex rounded-md border border-border overflow-hidden">
          <button
            type="button"
            onClick={() => onSetUnit(code, "g")}
            className={[
              "px-2 py-0.5 text-xs font-medium transition-colors",
              unit === "g"
                ? "bg-primary text-primary-foreground"
                : "bg-background text-muted-foreground hover:bg-muted",
            ].join(" ")}
          >
            g
          </button>
          <button
            type="button"
            onClick={() => onSetUnit(code, "pcs")}
            className={[
              "px-2 py-0.5 text-xs font-medium transition-colors border-l border-border",
              unit === "pcs"
                ? "bg-primary text-primary-foreground"
                : "bg-background text-muted-foreground hover:bg-muted",
            ].join(" ")}
          >
            pcs
          </button>
        </div>
      </td>
    </tr>
  );
}
