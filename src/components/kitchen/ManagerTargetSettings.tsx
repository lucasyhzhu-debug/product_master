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
import { PackagingMixEditor, type PackagingMixRow } from "./PackagingMixEditor";
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
  const componentsWithTiers = useQuery(api.productionRecipes.queries.getComponentsWithTiers);
  const productionComponents = (componentsWithTiers ?? []).filter((c) => c.tier > 0);
  // tier-0 + unit="g" = leaf ingredients tracked in grams (not pcs ball types)
  const kitchenComponentsList = (componentsWithTiers ?? []).filter((c) => c.tier === 0 && c.unit === "g");
  const allKitchenCodes = useMemo(() => kitchenComponentsList.map((c) => c.code), [kitchenComponentsList]);

  const updateConfig = useProtectedMutation(api.kitchenConfig.mutations.updateConfig);
  const setDailyOverride = useProtectedMutation(api.kitchenDailyOverrides.mutations.setDailyOverride);
  const clearDailyOverride = useProtectedMutation(api.kitchenDailyOverrides.mutations.clearDailyOverride);

  // -- Unified form state --
  const [bigBallTarget, setBigBallTarget] = useState(0);   // Jumbo (80g)
  const [midBallTarget, setMidBallTarget] = useState(0);   // Original (45g)
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

    setIsSavingDefaults(true);
    try {
      await updateConfig({
        maxProductionTarget: bigBallTarget + midBallTarget || 1, // keep legacy field > 0
        bigBallTarget,
        midBallTarget,
        enabledProductionComponents: enabledComponents,
        // Phase 69: Save kitchen component toggles
        // null or empty = all enabled (don't write field); non-empty = explicit list
        enabledKitchenComponents:
          enabledKitchenComponents && enabledKitchenComponents.length > 0
            ? enabledKitchenComponents
            : undefined,
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
    if (bigBallTarget === 0 && midBallTarget === 0) {
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
        {/* Ball Targets */}
        <div>
          <Label className="text-xs text-muted-foreground uppercase tracking-wide block mb-2">
            Ball Targets
          </Label>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Original (45g)</Label>
              <Input
                type="number"
                min={0}
                value={midBallTarget === 0 ? "" : midBallTarget}
                placeholder="0"
                onChange={(e) => setMidBallTarget(Math.max(0, Number(e.target.value)))}
                className="text-right tabular-nums"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Jumbo (80g)</Label>
              <Input
                type="number"
                min={0}
                value={bigBallTarget === 0 ? "" : bigBallTarget}
                placeholder="0"
                onChange={(e) => setBigBallTarget(Math.max(0, Number(e.target.value)))}
                className="text-right tabular-nums"
              />
            </div>
          </div>
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
                      onClick={() => {
                        if (enabledKitchenComponents === null) {
                          setEnabledKitchenComponents(allKitchenCodes.filter((c) => c !== comp.code));
                        } else {
                          toggleKitchenComponent(comp.code, !isOn);
                        }
                      }}
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
            originalBallTarget={midBallTarget}
            jumboBallTarget={bigBallTarget}
            enabledComponents={enabledComponents}
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
