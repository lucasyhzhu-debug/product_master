/**
 * ManagerTargetSettings
 *
 * Manager-only section rendered on the kitchen page. Two sub-sections:
 *   1. Default Targets — permanent config (bigBallTarget, midBallTarget, defaultPackagingMix)
 *   2. Today's Override — per-day override without changing defaults
 *
 * Requirements: KIT-09, KIT-18
 */

import { useState, useEffect } from "react";
import { Settings, X, Plus } from "lucide-react";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { KitchenTargets } from "./ProductionTargetsBar";

// -------------------------------------------------------
// Types
// -------------------------------------------------------

interface PackagingMixRow {
  menuProductId: string;
  quantity: number;
}

interface KitchenConfig {
  _id: Id<"kitchenConfig"> | null;
  maxProductionTarget: number;
  bigBallTarget: number;
  midBallTarget: number;
  defaultPackagingMix: Array<{ menuProductId: string; quantity: number }>;
  updatedAt: number | null;
  updatedBy: string | null;
}

interface ManagerTargetSettingsProps {
  config: KitchenConfig | undefined;
  targets: KitchenTargets | undefined;
  today: string;
}

// -------------------------------------------------------
// Sub-component: Packaging Mix Editor
// -------------------------------------------------------

interface PackagingMixEditorProps {
  rows: PackagingMixRow[];
  onChange: (rows: PackagingMixRow[]) => void;
  menuProducts: Array<{ _id: string; name: string }>;
}

function PackagingMixEditor({ rows, onChange, menuProducts }: PackagingMixEditorProps) {
  function addRow() {
    onChange([...rows, { menuProductId: "", quantity: 0 }]);
  }

  function updateRow(index: number, field: "menuProductId" | "quantity", value: string | number) {
    onChange(
      rows.map((row, i) =>
        i === index ? { ...row, [field]: field === "quantity" ? Math.max(0, Number(value)) : value } : row
      )
    );
  }

  function removeRow(index: number) {
    onChange(rows.filter((_, i) => i !== index));
  }

  return (
    <div className="space-y-2">
      {rows.length === 0 && (
        <p className="text-xs text-muted-foreground">
          No packaging mix configured. Add items below.
        </p>
      )}
      {rows.map((row, index) => (
        <div key={index} className="flex items-center gap-2">
          <Select
            value={row.menuProductId}
            onValueChange={(val) => updateRow(index, "menuProductId", val)}
          >
            <SelectTrigger className="flex-1 text-sm h-8">
              <SelectValue placeholder="Select product..." />
            </SelectTrigger>
            <SelectContent>
              {menuProducts.map((mp) => (
                <SelectItem key={mp._id} value={mp._id}>
                  {mp.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Input
            type="number"
            min={0}
            value={row.quantity || ""}
            placeholder="0"
            onChange={(e) => updateRow(index, "quantity", e.target.value)}
            className="w-20 text-right tabular-nums h-8 text-sm"
          />
          <button
            type="button"
            className="text-muted-foreground hover:text-destructive transition-colors shrink-0"
            onClick={() => removeRow(index)}
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      ))}
      <Button
        type="button"
        variant="ghost"
        size="sm"
        onClick={addRow}
        className="text-xs h-7 px-2 text-muted-foreground"
      >
        <Plus className="h-3 w-3 mr-1" />
        Add product
      </Button>
    </div>
  );
}

// -------------------------------------------------------
// Main component
// -------------------------------------------------------

export function ManagerTargetSettings({ config, targets, today }: ManagerTargetSettingsProps) {
  // -- Queries & mutations --
  const menuProducts = useQuery(api.menuProducts.queries.list, { activeOnly: true });
  const updateConfig = useProtectedMutation(api.kitchenConfig.mutations.updateConfig);
  const setDailyOverride = useProtectedMutation(api.kitchenDailyOverrides.mutations.setDailyOverride);
  const clearDailyOverride = useProtectedMutation(api.kitchenDailyOverrides.mutations.clearDailyOverride);

  // -- Default targets form state --
  const [maxTarget, setMaxTarget] = useState(200);
  const [bigBallDefault, setBigBallDefault] = useState(0);
  const [midBallDefault, setMidBallDefault] = useState(0);
  const [defaultPackagingMix, setDefaultPackagingMix] = useState<PackagingMixRow[]>([]);
  const [isSavingDefaults, setIsSavingDefaults] = useState(false);

  // -- Override form state --
  const [bigBallOverride, setBigBallOverride] = useState<string>("");
  const [midBallOverride, setMidBallOverride] = useState<string>("");
  const [isSavingOverride, setIsSavingOverride] = useState(false);
  const [isClearingOverride, setIsClearingOverride] = useState(false);

  // Derive whether an override is currently active
  const overrideActive = targets?.source === "override";

  // Pre-populate defaults form from config
  useEffect(() => {
    if (config) {
      setMaxTarget(config.maxProductionTarget);
      setBigBallDefault(config.bigBallTarget);
      setMidBallDefault(config.midBallTarget);
      setDefaultPackagingMix(
        (config.defaultPackagingMix ?? []).map((row) => ({
          menuProductId: String(row.menuProductId),
          quantity: row.quantity,
        }))
      );
    }
  }, [config]);

  // -------------------------------------------------------
  // Handlers: Save defaults
  // -------------------------------------------------------

  async function handleSaveDefaults() {
    if (maxTarget <= 0) {
      toast.error("Max production target must be positive");
      return;
    }

    const validMix = defaultPackagingMix.filter(
      (row) => row.menuProductId && row.quantity > 0
    );

    setIsSavingDefaults(true);
    try {
      await updateConfig({
        maxProductionTarget: maxTarget,
        bigBallTarget: bigBallDefault,
        midBallTarget: midBallDefault,
        defaultPackagingMix:
          validMix.length > 0
            ? validMix.map((row) => ({
                menuProductId: row.menuProductId as Id<"menuProducts">,
                quantity: row.quantity,
              }))
            : undefined,
      });
      toast.success("Default targets saved");
    } catch (error) {
      const msg = error instanceof Error ? error.message : "Failed to save defaults";
      toast.error(msg);
    } finally {
      setIsSavingDefaults(false);
    }
  }

  // -------------------------------------------------------
  // Handlers: Apply / Clear override
  // -------------------------------------------------------

  async function handleApplyOverride() {
    const bigVal = bigBallOverride !== "" ? Number(bigBallOverride) : undefined;
    const midVal = midBallOverride !== "" ? Number(midBallOverride) : undefined;

    if (bigVal === undefined && midVal === undefined) {
      toast.error("Enter at least one override value");
      return;
    }

    setIsSavingOverride(true);
    try {
      await setDailyOverride({
        date: today,
        bigBallOverride: bigVal,
        midBallOverride: midVal,
      });
      toast.success("Override applied for today");
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
      setBigBallOverride("");
      setMidBallOverride("");
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

  const safeMenuProducts = (menuProducts ?? [])
    .filter((mp) => mp.productType === "food")
    .map((mp) => ({
      _id: String(mp._id),
      name: mp.name,
    }));

  return (
    <div className="space-y-4">
      {/* Sub-section 1: Default Targets */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Settings className="h-4 w-4 text-muted-foreground" />
            Default Daily Targets
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Ball targets */}
          <div className="grid grid-cols-3 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Max capacity</Label>
              <Input
                type="number"
                min={1}
                value={maxTarget || ""}
                placeholder="200"
                onChange={(e) => setMaxTarget(Number(e.target.value))}
                className="text-right tabular-nums"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Original balls</Label>
              <Input
                type="number"
                min={0}
                value={midBallDefault === 0 ? "" : midBallDefault}
                placeholder="0"
                onChange={(e) => setMidBallDefault(Number(e.target.value))}
                className="text-right tabular-nums"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Jumbo balls</Label>
              <Input
                type="number"
                min={0}
                value={bigBallDefault === 0 ? "" : bigBallDefault}
                placeholder="0"
                onChange={(e) => setBigBallDefault(Number(e.target.value))}
                className="text-right tabular-nums"
              />
            </div>
          </div>

          {/* Packaging mix */}
          <div className="space-y-2">
            <Label className="text-xs text-muted-foreground uppercase tracking-wide">
              Default Packaging Mix
            </Label>
            <PackagingMixEditor
              rows={defaultPackagingMix}
              onChange={setDefaultPackagingMix}
              menuProducts={safeMenuProducts}
            />
          </div>

          <Button
            onClick={handleSaveDefaults}
            disabled={isSavingDefaults}
            size="sm"
            className="w-full"
          >
            {isSavingDefaults ? "Saving..." : "Save Defaults"}
          </Button>

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

      {/* Sub-section 2: Today's Override */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center justify-between">
            <span>Override Today's Targets</span>
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
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Original balls</Label>
              <Input
                type="number"
                min={0}
                value={midBallOverride}
                placeholder={String(config?.midBallTarget ?? 0)}
                onChange={(e) => setMidBallOverride(e.target.value)}
                className="text-right tabular-nums"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Jumbo balls</Label>
              <Input
                type="number"
                min={0}
                value={bigBallOverride}
                placeholder={String(config?.bigBallTarget ?? 0)}
                onChange={(e) => setBigBallOverride(e.target.value)}
                className="text-right tabular-nums"
              />
            </div>
          </div>

          <div className="flex gap-2">
            <Button
              onClick={handleApplyOverride}
              disabled={isSavingOverride}
              size="sm"
              className="flex-1"
            >
              {isSavingOverride ? "Applying..." : "Apply Override"}
            </Button>
            {overrideActive && (
              <Button
                onClick={handleClearOverride}
                disabled={isClearingOverride}
                size="sm"
                variant="outline"
                className="flex-1"
              >
                {isClearingOverride ? "Clearing..." : "Clear Override"}
              </Button>
            )}
          </div>

          <p className="text-xs text-muted-foreground">
            Override applies to today only and does not change default settings.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
