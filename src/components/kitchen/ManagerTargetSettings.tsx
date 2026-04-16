/**
 * ManagerTargetSettings
 *
 * Manager-only section rendered on the kitchen page.
 * Unified single-form design (Phase 21-09):
 *   - Ball targets (Original + Jumbo) at the top
 *   - Per-component production toggles (replaces single showJumbo toggle)
 *   - Packaging mix (new PackagingMixEditor with BOM info + allocation counters)
 *   - Two save actions: "Save as Default Daily Targets" and "Apply Override for Today Only"
 *   - Clear Override button when override is active
 *
 * Max Capacity field removed — ball targets are the ceiling.
 * Two-card (Default + Override) layout replaced with single unified card.
 *
 * Requirements: KIT-09, KIT-18
 */

import { useState, useEffect, useMemo } from "react";
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

// -------------------------------------------------------
// Types
// -------------------------------------------------------

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
  updatedAt: number | null;
  updatedBy: string | null;
}

interface ManagerTargetSettingsProps {
  config: KitchenConfig | undefined;
  targets: KitchenTargets | undefined;
  today: string;
}

// -------------------------------------------------------
// Main component
// -------------------------------------------------------

export function ManagerTargetSettings({ config, targets, today }: ManagerTargetSettingsProps) {
  // -- Queries & mutations --
  // paq: Unified source for both toggle sections (tier-1+ = Production, tier-0 = Kitchen)
  // Round-2 fix: filter `isActive` to exclude soft-deactivated dedupe shadows
  // (convex/componentTypes/dedupe.ts soft-deactivates dups via isActive=false).
  // Without this filter, each duplicate shadow renders a second toggle sharing
  // the same `code`, so flipping one appears to flip both.
  const componentsWithTiers = useQuery(api.productionRecipes.queries.getComponentsWithTiers);
  const productionComponents = useMemo(() => {
    const base = (componentsWithTiers ?? []).filter((c) => c.tier > 0 && c.isActive);
    const seen = new Set<string>();
    const unique: typeof base = [];
    for (const c of base) {
      if (seen.has(c.code)) continue;
      seen.add(c.code);
      unique.push(c);
    }
    return unique;
  }, [componentsWithTiers]);
  // Kitchen components = active production componentTypes that are referenced
  // as a CHILD of some tier-1+ recipe (isRecipeChild=true). This matches the
  // /components/production page's leaf grouping INTENT without pulling in
  // top-level balls like Jumbo/BIG_BALL (which are direct menu-product
  // components, not recipe children → they belong to PRODUCTION COMPONENTS).
  // Round-4 fix: was filtering `tier===0 && unit==='g'`, which excluded
  // pcs-unit sub-components (Filling Pistachio, Outer Marshmallow, nutella_filling).
  const kitchenComponentsList = useMemo(() => {
    const base = (componentsWithTiers ?? []).filter(
      (c) => c.isActive && c.isRecipeChild
    );
    const seen = new Set<string>();
    const unique: typeof base = [];
    for (const c of base) {
      if (seen.has(c.code)) continue;
      seen.add(c.code);
      unique.push(c);
    }
    return unique;
  }, [componentsWithTiers]);
  const allKitchenCodes = useMemo(() => kitchenComponentsList.map((c) => c.code), [kitchenComponentsList]);

  const updateConfig = useProtectedMutation(api.kitchenConfig.mutations.updateConfig);
  const setDailyOverride = useProtectedMutation(api.kitchenDailyOverrides.mutations.setDailyOverride);
  const clearDailyOverride = useProtectedMutation(api.kitchenDailyOverrides.mutations.clearDailyOverride);

  // -- Unified form state --
  const [bigBallTarget, setBigBallTarget] = useState(0);   // Jumbo (80g)
  const [midBallTarget, setMidBallTarget] = useState(0);   // Original (45g)
  // Round-2 follow-up: targets for non-BIG/MID production codes (e.g. HAZELNUT_REGULAR)
  const [otherBallTargets, setOtherBallTargets] = useState<Record<string, number>>({});
  const [packagingMix, setPackagingMix] = useState<PackagingMixRow[]>([]);
  const [enabledComponents, setEnabledComponents] = useState<string[]>(["BIG_BALL", "MID_BALL"]);
  // Phase 69: Enabled kitchen component codes (null = all enabled)
  const [enabledKitchenComponents, setEnabledKitchenComponents] = useState<string[] | null>(null);

  // -- Saving states --
  const [isSavingDefaults, setIsSavingDefaults] = useState(false);
  const [isSavingOverride, setIsSavingOverride] = useState(false);
  const [isClearingOverride, setIsClearingOverride] = useState(false);

  // Derive whether an override is currently active
  const overrideActive = targets?.source === "override";

  // Pre-populate form from config
  useEffect(() => {
    if (config) {
      setBigBallTarget(config.bigBallTarget);
      setMidBallTarget(config.midBallTarget);
      const nextOther: Record<string, number> = {};
      for (const entry of config.otherBallTargets ?? []) {
        nextOther[entry.code] = entry.target;
      }
      setOtherBallTargets(nextOther);
      setPackagingMix(
        (config.defaultPackagingMix ?? []).map((row) => ({
          menuProductId: String(row.menuProductId),
          quantity: row.quantity,
        }))
      );
      // null means all enabled — resolve default from ["BIG_BALL", "MID_BALL"]
      setEnabledComponents(config.enabledProductionComponents ?? ["BIG_BALL", "MID_BALL"]);
      // Phase 69: Kitchen component toggles
      setEnabledKitchenComponents(config.enabledKitchenComponents);
    }
  }, [config]);

  // -------------------------------------------------------
  // Derive the ordered list of ball target rows to render.
  // Each active + enabled tier-1 production `pcs` componentType gets one row.
  // BIG_BALL / MID_BALL keep their dedicated state for backward compat; every
  // other code reads/writes via `otherBallTargets[code]`.
  // -------------------------------------------------------

  const ballTargetRows = useMemo(() => {
    // Filter productionComponents to tier-1 pcs ball types that are enabled.
    // Non-enabled codes still surface (so the user can enable + set a target
    // in one save action), but rendered disabled.
    const rows = productionComponents
      .filter((c) => c.unit === "pcs")
      .map((c) => {
        const isEnabled = enabledComponents.includes(c.code);
        // Build label — use gramsPerUnit if present for consistency with
        // the legacy "Original (45g)" / "Jumbo (80g)" labels.
        const grams = c.gramsPerUnit;
        const label = grams ? `${c.name} (${grams}g)` : c.name;
        const value =
          c.code === "BIG_BALL"
            ? bigBallTarget
            : c.code === "MID_BALL"
              ? midBallTarget
              : (otherBallTargets[c.code] ?? 0);
        const setValue = (n: number) => {
          const v = Math.max(0, n);
          if (c.code === "BIG_BALL") setBigBallTarget(v);
          else if (c.code === "MID_BALL") setMidBallTarget(v);
          else setOtherBallTargets((prev) => ({ ...prev, [c.code]: v }));
        };
        return { code: c.code, label, value, setValue, isEnabled };
      });
    // Stable order: BIG_BALL / MID_BALL first (if present), then others alphabetical.
    rows.sort((a, b) => {
      const order = (code: string) =>
        code === "MID_BALL" ? 0 : code === "BIG_BALL" ? 1 : 2;
      const da = order(a.code);
      const db = order(b.code);
      if (da !== db) return da - db;
      return a.label.localeCompare(b.label);
    });
    return rows;
  }, [productionComponents, enabledComponents, bigBallTarget, midBallTarget, otherBallTargets]);

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

  // -------------------------------------------------------
  // Per-component toggle handler
  // -------------------------------------------------------

  function toggleComponent(code: string) {
    setEnabledComponents((prev) =>
      prev.includes(code) ? prev.filter((c) => c !== code) : [...prev, code]
    );
  }

  // -------------------------------------------------------
  // Phase 69: Kitchen component toggle handler
  // -------------------------------------------------------

  function toggleKitchenComponent(code: string, enabled: boolean) {
    const currentEnabled = enabledKitchenComponents === null ? allKitchenCodes : enabledKitchenComponents;

    const newEnabled = enabled
      ? [...currentEnabled, code]
      : currentEnabled.filter((c) => c !== code);

    setEnabledKitchenComponents(newEnabled);
  }

  // -------------------------------------------------------
  // Handler: Save as Default Daily Targets
  // -------------------------------------------------------

  async function handleSaveDefaults() {
    const validMix = packagingMix.filter((row) => row.menuProductId && row.quantity > 0);

    // Round-2 follow-up: Build otherBallTargets payload (non-BIG/MID codes).
    // Only include codes present in productionComponents to avoid persisting
    // stale codes from earlier sessions.
    const validOtherCodes = new Set(
      productionComponents
        .filter((c) => c.unit === "pcs" && c.code !== "BIG_BALL" && c.code !== "MID_BALL")
        .map((c) => c.code)
    );
    const otherBallTargetsPayload = Object.entries(otherBallTargets)
      .filter(([code]) => validOtherCodes.has(code))
      .map(([code, target]) => ({ code, target }));

    // Total balls across ALL codes (not just BIG+MID) so legacy
    // maxProductionTarget stays > 0 when a user only uses non-BIG/MID codes.
    const totalBalls =
      bigBallTarget +
      midBallTarget +
      otherBallTargetsPayload.reduce((sum, e) => sum + e.target, 0);

    setIsSavingDefaults(true);
    try {
      await updateConfig({
        maxProductionTarget: totalBalls || 1, // keep legacy field > 0
        bigBallTarget,
        midBallTarget,
        enabledProductionComponents: enabledComponents,
        // Phase 69: Save kitchen component toggles
        // null or empty = all enabled (don't write field); non-empty = explicit list
        enabledKitchenComponents:
          enabledKitchenComponents && enabledKitchenComponents.length > 0
            ? enabledKitchenComponents
            : undefined,
        otherBallTargets: otherBallTargetsPayload,
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

  // -------------------------------------------------------
  // Handler: Apply Override for Today Only
  // -------------------------------------------------------

  async function handleApplyOverride() {
    const hasAnyTarget =
      bigBallTarget > 0 ||
      midBallTarget > 0 ||
      Object.values(otherBallTargets).some((t) => t > 0);
    if (!hasAnyTarget) {
      toast.error("Enter at least one ball target before applying override");
      return;
    }

    setIsSavingOverride(true);
    try {
      await setDailyOverride({
        date: today,
        bigBallOverride: bigBallTarget,
        midBallOverride: midBallTarget,
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

  // -------------------------------------------------------
  // Handler: Clear Override
  // -------------------------------------------------------

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

  // -------------------------------------------------------
  // Render
  // -------------------------------------------------------

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
        {/* Ball Targets — one input per active+enabled tier-1 pcs componentType
            (e.g. Original/MID_BALL, Jumbo/BIG_BALL, Nutella-Regular/HAZELNUT_REGULAR).
            Disabled codes render dimmed — toggle them on via Production Components. */}
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

        {/* Per-Component Production Toggles */}
        <div>
          <Label className="text-xs text-muted-foreground uppercase tracking-wide block mb-2">
            Production Components
          </Label>
          <div className="flex flex-wrap gap-3">
            {(productionComponents ?? []).map((ct) => {
              const isOn = enabledComponents.includes(ct.code);
              return (
                <label
                  key={ct._id}
                  className="flex items-center gap-2 cursor-pointer select-none"
                >
                  <button
                    type="button"
                    role="switch"
                    aria-checked={isOn}
                    onClick={() => toggleComponent(ct.code)}
                    className={[
                      "relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors",
                      isOn ? "bg-primary" : "bg-input",
                    ].join(" ")}
                  >
                    <span
                      className={[
                        "pointer-events-none inline-block h-4 w-4 rounded-full bg-background shadow-lg ring-0 transition-transform",
                        isOn ? "translate-x-4" : "translate-x-0",
                      ].join(" ")}
                    />
                  </button>
                  <span className="text-sm">{ct.name}</span>
                </label>
              );
            })}
            {componentsWithTiers === undefined && (
              <p className="text-xs text-muted-foreground">Loading components...</p>
            )}
          </div>
        </div>

        {/* Kitchen Component Toggles (tier-0 leaves) */}
        {kitchenComponentsList.length > 0 && (
          <div>
            <Label className="text-xs text-muted-foreground uppercase tracking-wide block mb-2">
              Kitchen Components
            </Label>
            <p className="text-xs text-muted-foreground mb-2">
              Toggle which pre-cursor components appear in the shift form.
            </p>
            <div className="flex flex-wrap gap-3">
              {kitchenComponentsList.map((comp) => {
                const isOn = enabledKitchenComponents === null
                  ? true
                  : enabledKitchenComponents.includes(comp.code);
                return (
                  <label
                    key={comp._id}
                    className="flex items-center gap-2 cursor-pointer select-none"
                  >
                    <button
                      type="button"
                      role="switch"
                      aria-checked={isOn}
                      onClick={() => toggleKitchenComponent(comp.code, !isOn)}
                      className={[
                        "relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors",
                        isOn ? "bg-primary" : "bg-input",
                      ].join(" ")}
                    >
                      <span
                        className={[
                          "pointer-events-none inline-block h-4 w-4 rounded-full bg-background shadow-lg ring-0 transition-transform",
                          isOn ? "translate-x-4" : "translate-x-0",
                        ].join(" ")}
                      />
                    </button>
                    <span className="text-sm">{comp.name}</span>
                  </label>
                );
              })}
            </div>
          </div>
        )}
        {componentsWithTiers !== undefined && kitchenComponentsList.length === 0 && (
          <p className="text-xs text-muted-foreground italic">
            No leaf kitchen components found. Run seedLeafKitchenComponents from the dashboard.
          </p>
        )}

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
