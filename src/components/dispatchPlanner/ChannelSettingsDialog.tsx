/**
 * ChannelSettingsDialog - Settings dialog for the Unified Dispatch Planner.
 *
 * Four sections via Tabs:
 * 1. Channel Priorities: Reorder channels via up/down arrows
 * 2. Channel Settings: Enable/disable, commission rate, display name per channel
 * 3. Consignment Outlets: Add/edit/remove consignment outlets with product mappings
 * 4. Daily Capacity: Set daily production capacity
 *
 * Manager/Admin access. Uses shadcn Dialog, Tabs, Switch, Input, Select.
 */

import { useState, useEffect, useCallback } from "react";
import {
  Settings,
  ChevronUp,
  ChevronDown,
  Plus,
  Trash2,
  Loader2,
  Store,
  Percent,
  ChevronRight,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ConfirmDialog } from "@/components/shared/ConfirmDialog";
import { toast } from "sonner";
import {
  useDispatchChannelConfig,
  useDispatchPlannerSettings,
  useDispatchConsignmentOutlets,
  useDispatchReorderPriorities,
  useDispatchUpdateChannelConfig,
  useDispatchUpdateSettings,
  useDispatchAddConsignmentOutlet,
  useDispatchUpdateConsignmentOutlet,
  useDispatchRemoveConsignmentOutlet,
} from "@/hooks/convex/useDispatchPlanner";
import { useConvexMenuProducts } from "@/hooks/convex/useMenuProducts";
import type { Id } from "../../../convex/_generated/dataModel";

// ========================
// Types
// ========================

interface ProductMapping {
  menuProductId: string;
  externalName: string;
  externalPrice: number;
}

interface OutletFormData {
  name: string;
  commissionRate?: number;
  productMappings: ProductMapping[];
}

// ========================
// Props
// ========================

export interface ChannelSettingsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

// ========================
// Component
// ========================

export function ChannelSettingsDialog({
  open,
  onOpenChange,
}: ChannelSettingsDialogProps) {
  const [tab, setTab] = useState("priorities");

  // Data hooks
  const { data: channels, isLoading: channelsLoading } = useDispatchChannelConfig();
  const { data: settings, isLoading: settingsLoading } = useDispatchPlannerSettings();
  const { data: outlets, isLoading: outletsLoading } = useDispatchConsignmentOutlets();
  const { data: menuProducts } = useConvexMenuProducts(true);

  // Mutation hooks
  const reorderPriorities = useDispatchReorderPriorities();
  const updateChannelConfig = useDispatchUpdateChannelConfig();
  const updateSettings = useDispatchUpdateSettings();
  const addOutlet = useDispatchAddConsignmentOutlet();
  const updateOutlet = useDispatchUpdateConsignmentOutlet();
  const removeOutlet = useDispatchRemoveConsignmentOutlet();

  const isLoading = channelsLoading || settingsLoading || outletsLoading;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Settings className="h-5 w-5" />
            Dispatch Planner Settings
          </DialogTitle>
        </DialogHeader>

        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <Tabs value={tab} onValueChange={setTab}>
            <TabsList className="grid w-full grid-cols-4">
              <TabsTrigger value="priorities" className="text-xs">
                Priorities
              </TabsTrigger>
              <TabsTrigger value="channels" className="text-xs">
                Channels
              </TabsTrigger>
              <TabsTrigger value="outlets" className="text-xs">
                Outlets
              </TabsTrigger>
              <TabsTrigger value="capacity" className="text-xs">
                Capacity
              </TabsTrigger>
            </TabsList>

            {/* Tab 1: Channel Priorities */}
            <TabsContent value="priorities" className="mt-4 space-y-3">
              <p className="text-sm text-muted-foreground">
                Drag channels up or down to set dispatch priority. Higher priority
                channels get capacity first.
              </p>
              <Separator />
              <ChannelPriorityList
                channels={channels ?? []}
                onReorder={reorderPriorities}
              />
            </TabsContent>

            {/* Tab 2: Channel Settings */}
            <TabsContent value="channels" className="mt-4 space-y-3">
              <p className="text-sm text-muted-foreground">
                Configure commission rates, enable/disable channels, and set display
                names.
              </p>
              <Separator />
              <ChannelSettingsList
                channels={channels ?? []}
                onUpdate={updateChannelConfig}
              />
            </TabsContent>

            {/* Tab 3: Consignment Outlets */}
            <TabsContent value="outlets" className="mt-4 space-y-3">
              <p className="text-sm text-muted-foreground">
                Manage consignment outlets and their product mappings.
              </p>
              <Separator />
              <ConsignmentOutletManager
                outlets={outlets ?? []}
                menuProducts={menuProducts ?? []}
                onAdd={addOutlet}
                onUpdate={updateOutlet}
                onRemove={removeOutlet}
              />
            </TabsContent>

            {/* Tab 4: Daily Capacity */}
            <TabsContent value="capacity" className="mt-4 space-y-3">
              <p className="text-sm text-muted-foreground">
                Set the maximum daily production capacity in total balls.
              </p>
              <Separator />
              <DailyCapacityEditor
                currentCapacity={settings?.dailyCapacity ?? 200}
                onSave={updateSettings}
              />
            </TabsContent>
          </Tabs>
        )}
      </DialogContent>
    </Dialog>
  );
}

// ========================
// Sub-components
// ========================

/**
 * Channel Priority List with up/down reordering.
 */
function ChannelPriorityList({
  channels,
  onReorder,
}: {
  channels: Array<{
    _id: string;
    channelKey: string;
    displayName: string;
    color: string;
    priority: number;
  }>;
  onReorder: (args: { orderedKeys: string[] }) => Promise<unknown>;
}) {
  const [reordering, setReordering] = useState(false);
  const sorted = [...channels].sort((a, b) => a.priority - b.priority);

  const handleMove = useCallback(
    async (index: number, direction: "up" | "down") => {
      const newIndex = direction === "up" ? index - 1 : index + 1;
      if (newIndex < 0 || newIndex >= sorted.length) return;

      const newOrder = sorted.map((ch) => ch.channelKey);
      [newOrder[index], newOrder[newIndex]] = [newOrder[newIndex], newOrder[index]];

      setReordering(true);
      try {
        await onReorder({ orderedKeys: newOrder });
        toast.success("Channel priorities updated");
      } catch (error) {
        console.error("Reorder error:", error);
        toast.error("Failed to reorder channels");
      } finally {
        setReordering(false);
      }
    },
    [sorted, onReorder]
  );

  return (
    <div className="space-y-1">
      {sorted.map((channel, index) => (
        <div
          key={channel.channelKey}
          className="flex items-center justify-between py-2 px-3 rounded-lg hover:bg-muted/50"
        >
          <div className="flex items-center gap-3">
            <span className="text-xs font-mono text-muted-foreground w-5 text-center">
              {index + 1}
            </span>
            <div
              className="h-3 w-3 rounded-full shrink-0"
              style={{ backgroundColor: channel.color }}
            />
            <span className="text-sm font-medium">{channel.displayName}</span>
          </div>
          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7"
              disabled={index === 0 || reordering}
              onClick={() => handleMove(index, "up")}
            >
              <ChevronUp className="h-4 w-4" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7"
              disabled={index === sorted.length - 1 || reordering}
              onClick={() => handleMove(index, "down")}
            >
              <ChevronDown className="h-4 w-4" />
            </Button>
          </div>
        </div>
      ))}
      {sorted.length === 0 && (
        <div className="text-center py-6 text-sm text-muted-foreground">
          No channels configured. Run seed defaults first.
        </div>
      )}
    </div>
  );
}

/**
 * Channel Settings List -- enable/disable, commission rate, display name.
 */
function ChannelSettingsList({
  channels,
  onUpdate,
}: {
  channels: Array<{
    _id: string;
    channelKey: string;
    displayName: string;
    color: string;
    commissionRate: number;
    isEnabled: boolean;
  }>;
  onUpdate: (args: {
    channelKey: string;
    updates: {
      commissionRate?: number;
      isEnabled?: boolean;
      displayName?: string;
      color?: string;
    };
  }) => Promise<unknown>;
}) {
  const [savingKey, setSavingKey] = useState<string | null>(null);

  const handleToggle = useCallback(
    async (channelKey: string, isEnabled: boolean) => {
      setSavingKey(channelKey);
      try {
        await onUpdate({ channelKey, updates: { isEnabled } });
        toast.success(`Channel ${isEnabled ? "enabled" : "disabled"}`);
      } catch (error) {
        console.error("Toggle channel error:", error);
        toast.error("Failed to toggle channel");
      } finally {
        setSavingKey(null);
      }
    },
    [onUpdate]
  );

  const handleCommissionSave = useCallback(
    async (channelKey: string, commissionRate: number) => {
      setSavingKey(channelKey);
      try {
        await onUpdate({ channelKey, updates: { commissionRate } });
        toast.success("Commission rate updated");
      } catch (error) {
        console.error("Update commission error:", error);
        toast.error("Failed to update commission rate");
      } finally {
        setSavingKey(null);
      }
    },
    [onUpdate]
  );

  const handleNameSave = useCallback(
    async (channelKey: string, displayName: string) => {
      if (!displayName.trim()) return;
      setSavingKey(channelKey);
      try {
        await onUpdate({ channelKey, updates: { displayName: displayName.trim() } });
        toast.success("Display name updated");
      } catch (error) {
        console.error("Update name error:", error);
        toast.error("Failed to update display name");
      } finally {
        setSavingKey(null);
      }
    },
    [onUpdate]
  );

  const sorted = [...channels].sort((a, b) => (a.channelKey > b.channelKey ? 1 : -1));

  return (
    <div className="space-y-4">
      {sorted.map((channel) => (
        <ChannelSettingsRow
          key={channel.channelKey}
          channel={channel}
          saving={savingKey === channel.channelKey}
          onToggle={handleToggle}
          onCommissionSave={handleCommissionSave}
          onNameSave={handleNameSave}
        />
      ))}
    </div>
  );
}

/**
 * Individual channel settings row.
 */
function ChannelSettingsRow({
  channel,
  saving,
  onToggle,
  onCommissionSave,
  onNameSave,
}: {
  channel: {
    channelKey: string;
    displayName: string;
    color: string;
    commissionRate: number;
    isEnabled: boolean;
  };
  saving: boolean;
  onToggle: (key: string, enabled: boolean) => void;
  onCommissionSave: (key: string, rate: number) => void;
  onNameSave: (key: string, name: string) => void;
}) {
  const [editName, setEditName] = useState(channel.displayName);
  const [editRate, setEditRate] = useState(String(channel.commissionRate));

  // Sync with props when channel data updates
  useEffect(() => {
    setEditName(channel.displayName);
    setEditRate(String(channel.commissionRate));
  }, [channel.displayName, channel.commissionRate]);

  return (
    <div className="border border-border rounded-lg p-3 space-y-3">
      {/* Header: color swatch + name + toggle */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div
            className="h-3 w-3 rounded-full shrink-0"
            style={{ backgroundColor: channel.color }}
          />
          <span className="text-sm font-medium">{channel.displayName}</span>
          <span className="text-xs text-muted-foreground">({channel.channelKey})</span>
        </div>
        <div className="flex items-center gap-2">
          {saving && <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />}
          <Switch
            checked={channel.isEnabled}
            onCheckedChange={(checked) => onToggle(channel.channelKey, checked)}
            disabled={saving}
          />
        </div>
      </div>

      {/* Display name */}
      <div className="flex items-center gap-2">
        <Label className="text-xs text-muted-foreground w-20 shrink-0">Name</Label>
        <Input
          value={editName}
          onChange={(e) => setEditName(e.target.value)}
          onBlur={() => {
            if (editName.trim() && editName.trim() !== channel.displayName) {
              onNameSave(channel.channelKey, editName);
            }
          }}
          className="h-8 text-sm"
          disabled={saving}
        />
      </div>

      {/* Commission rate */}
      <div className="flex items-center gap-2">
        <Label className="text-xs text-muted-foreground w-20 shrink-0">
          <span className="flex items-center gap-1">
            <Percent className="h-3 w-3" /> Commission
          </span>
        </Label>
        <Input
          type="number"
          min="0"
          max="100"
          step="0.1"
          value={editRate}
          onChange={(e) => setEditRate(e.target.value)}
          onBlur={() => {
            const rate = parseFloat(editRate);
            if (!isNaN(rate) && rate !== channel.commissionRate) {
              onCommissionSave(channel.channelKey, rate);
            }
          }}
          className="h-8 text-sm w-24 tabular-nums"
          disabled={saving}
        />
        <span className="text-xs text-muted-foreground">%</span>
      </div>
    </div>
  );
}

/**
 * Consignment Outlet Manager -- list, add, edit, remove outlets.
 */
function ConsignmentOutletManager({
  outlets,
  menuProducts,
  onAdd,
  onUpdate,
  onRemove,
}: {
  outlets: Array<{
    _id: Id<"dispatchConsignmentOutlets">;
    name: string;
    isEnabled: boolean;
    commissionRate?: number;
    productMappings: Array<{
      menuProductId: string;
      externalName: string;
      externalPrice: number;
    }>;
  }>;
  menuProducts: Array<{ _id: string; name: string; defaultPrice: number }>;
  onAdd: (args: {
    name: string;
    productMappings: ProductMapping[];
    commissionRate?: number;
  }) => Promise<unknown>;
  onUpdate: (args: {
    outletId: Id<"dispatchConsignmentOutlets">;
    name?: string;
    productMappings?: ProductMapping[];
    commissionRate?: number;
    isEnabled?: boolean;
  }) => Promise<unknown>;
  onRemove: (args: { outletId: Id<"dispatchConsignmentOutlets"> }) => Promise<unknown>;
}) {
  const [showAddForm, setShowAddForm] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<{
    id: Id<"dispatchConsignmentOutlets">;
    name: string;
  } | null>(null);
  const [deleting, setDeleting] = useState(false);

  const handleDelete = useCallback(async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await onRemove({ outletId: deleteTarget.id });
      toast.success(`Outlet "${deleteTarget.name}" removed`);
      setDeleteTarget(null);
    } catch (error) {
      console.error("Delete outlet error:", error);
      toast.error("Failed to remove outlet");
    } finally {
      setDeleting(false);
    }
  }, [deleteTarget, onRemove]);

  return (
    <div className="space-y-3">
      {/* Existing outlets */}
      {outlets.map((outlet) => (
        <div key={outlet._id} className="border border-border rounded-lg">
          {/* Outlet header */}
          <div
            className="flex items-center justify-between p-3 cursor-pointer hover:bg-muted/50"
            onClick={() =>
              setExpandedId(expandedId === outlet._id ? null : outlet._id)
            }
          >
            <div className="flex items-center gap-2">
              <ChevronRight
                className={`h-4 w-4 transition-transform ${
                  expandedId === outlet._id ? "rotate-90" : ""
                }`}
              />
              <Store className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm font-medium">{outlet.name}</span>
              {!outlet.isEnabled && (
                <span className="text-xs text-muted-foreground bg-muted px-1.5 py-0.5 rounded">
                  Disabled
                </span>
              )}
            </div>
            <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
              <Switch
                checked={outlet.isEnabled}
                onCheckedChange={async (checked) => {
                  try {
                    await onUpdate({ outletId: outlet._id, isEnabled: checked });
                    toast.success(`Outlet ${checked ? "enabled" : "disabled"}`);
                  } catch {
                    toast.error("Failed to toggle outlet");
                  }
                }}
              />
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7 text-destructive hover:text-destructive"
                onClick={(e) => {
                  e.stopPropagation();
                  setDeleteTarget({ id: outlet._id, name: outlet.name });
                }}
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          </div>

          {/* Expanded edit form */}
          {expandedId === outlet._id && (
            <div className="border-t border-border px-3 pb-3">
              <OutletEditForm
                initialData={{
                  name: outlet.name,
                  commissionRate: outlet.commissionRate,
                  productMappings: outlet.productMappings,
                }}
                menuProducts={menuProducts}
                onSave={async (data) => {
                  try {
                    await onUpdate({
                      outletId: outlet._id,
                      name: data.name,
                      commissionRate: data.commissionRate,
                      productMappings: data.productMappings,
                    });
                    toast.success("Outlet updated");
                  } catch (error) {
                    console.error("Update outlet error:", error);
                    toast.error("Failed to update outlet");
                  }
                }}
                submitLabel="Update Outlet"
              />
            </div>
          )}
        </div>
      ))}

      {outlets.length === 0 && !showAddForm && (
        <div className="text-center py-6 text-sm text-muted-foreground">
          No consignment outlets configured yet.
        </div>
      )}

      {/* Add form */}
      {showAddForm ? (
        <div className="border border-dashed border-border rounded-lg p-3">
          <h4 className="text-sm font-medium mb-3">Add Consignment Outlet</h4>
          <OutletEditForm
            initialData={{ name: "", productMappings: [] }}
            menuProducts={menuProducts}
            onSave={async (data) => {
              try {
                await onAdd({
                  name: data.name,
                  commissionRate: data.commissionRate,
                  productMappings: data.productMappings,
                });
                toast.success(`Outlet "${data.name}" added`);
                setShowAddForm(false);
              } catch (error) {
                console.error("Add outlet error:", error);
                toast.error("Failed to add outlet");
              }
            }}
            onCancel={() => setShowAddForm(false)}
            submitLabel="Add Outlet"
          />
        </div>
      ) : (
        <Button
          variant="outline"
          size="sm"
          className="w-full"
          onClick={() => setShowAddForm(true)}
        >
          <Plus className="h-4 w-4 mr-2" />
          Add Outlet
        </Button>
      )}

      {/* Delete confirmation */}
      <ConfirmDialog
        open={!!deleteTarget}
        onOpenChange={(open) => !open && setDeleteTarget(null)}
        title="Remove Outlet"
        description={`Are you sure you want to remove "${deleteTarget?.name ?? ""}"? This will also delete all associated dispatch plans.`}
        confirmLabel="Remove"
        variant="destructive"
        loading={deleting}
        onConfirm={handleDelete}
      />
    </div>
  );
}

/**
 * Outlet edit form -- shared between Add and Edit.
 */
function OutletEditForm({
  initialData,
  menuProducts,
  onSave,
  onCancel,
  submitLabel = "Save",
}: {
  initialData: OutletFormData;
  menuProducts: Array<{ _id: string; name: string; defaultPrice: number }>;
  onSave: (data: OutletFormData) => Promise<void>;
  onCancel?: () => void;
  submitLabel?: string;
}) {
  const [name, setName] = useState(initialData.name);
  const [commissionRate, setCommissionRate] = useState(
    initialData.commissionRate !== undefined ? String(initialData.commissionRate) : ""
  );
  const [mappings, setMappings] = useState<ProductMapping[]>(
    initialData.productMappings
  );
  const [saving, setSaving] = useState(false);

  const handleAddMapping = useCallback(() => {
    setMappings((prev) => [
      ...prev,
      { menuProductId: "", externalName: "", externalPrice: 0 },
    ]);
  }, []);

  const handleRemoveMapping = useCallback((index: number) => {
    setMappings((prev) => prev.filter((_, i) => i !== index));
  }, []);

  const handleMappingChange = useCallback(
    (index: number, field: keyof ProductMapping, value: string | number) => {
      setMappings((prev) =>
        prev.map((m, i) => (i === index ? { ...m, [field]: value } : m))
      );
    },
    []
  );

  const handleSubmit = useCallback(async () => {
    if (!name.trim()) {
      toast.error("Outlet name is required");
      return;
    }

    // Validate mappings -- remove empty ones
    const validMappings = mappings.filter(
      (m) => m.menuProductId && m.externalName.trim()
    );

    setSaving(true);
    try {
      await onSave({
        name: name.trim(),
        commissionRate: commissionRate ? parseFloat(commissionRate) : undefined,
        productMappings: validMappings,
      });
    } finally {
      setSaving(false);
    }
  }, [name, commissionRate, mappings, onSave]);

  return (
    <div className="space-y-3 pt-3">
      {/* Name */}
      <div className="space-y-1">
        <Label className="text-xs text-muted-foreground">Outlet Name</Label>
        <Input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="e.g., Legato Tamtem"
          className="h-8 text-sm"
        />
      </div>

      {/* Commission rate override */}
      <div className="space-y-1">
        <Label className="text-xs text-muted-foreground">
          Commission Rate Override (%)
        </Label>
        <Input
          type="number"
          min="0"
          max="100"
          step="0.1"
          value={commissionRate}
          onChange={(e) => setCommissionRate(e.target.value)}
          placeholder="Leave empty to use channel default"
          className="h-8 text-sm w-48 tabular-nums"
        />
      </div>

      {/* Product Mappings */}
      <div className="space-y-2">
        <Label className="text-xs text-muted-foreground">Product Mappings</Label>
        {mappings.map((mapping, index) => (
          <div key={index} className="flex items-center gap-2">
            {/* Menu product selector */}
            <Select
              value={mapping.menuProductId}
              onValueChange={(val) =>
                handleMappingChange(index, "menuProductId", val)
              }
            >
              <SelectTrigger className="h-8 text-xs flex-1">
                <SelectValue placeholder="Select product" />
              </SelectTrigger>
              <SelectContent>
                {menuProducts.map((mp) => (
                  <SelectItem key={mp._id} value={mp._id} className="text-xs">
                    {mp.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            {/* External name */}
            <Input
              value={mapping.externalName}
              onChange={(e) =>
                handleMappingChange(index, "externalName", e.target.value)
              }
              placeholder="External name"
              className="h-8 text-xs flex-1"
            />

            {/* External price */}
            <Input
              type="number"
              min="0"
              value={mapping.externalPrice || ""}
              onChange={(e) =>
                handleMappingChange(
                  index,
                  "externalPrice",
                  parseInt(e.target.value) || 0
                )
              }
              placeholder="Price"
              className="h-8 text-xs w-24 tabular-nums"
            />

            {/* Remove */}
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7 shrink-0 text-destructive hover:text-destructive"
              onClick={() => handleRemoveMapping(index)}
            >
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          </div>
        ))}
        <Button
          variant="outline"
          size="sm"
          onClick={handleAddMapping}
          className="text-xs"
        >
          <Plus className="h-3.5 w-3.5 mr-1" />
          Add Product Mapping
        </Button>
      </div>

      {/* Actions */}
      <div className="flex items-center gap-2 pt-2">
        <Button
          size="sm"
          onClick={handleSubmit}
          disabled={saving || !name.trim()}
        >
          {saving ? (
            <>
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              Saving...
            </>
          ) : (
            submitLabel
          )}
        </Button>
        {onCancel && (
          <Button variant="ghost" size="sm" onClick={onCancel} disabled={saving}>
            Cancel
          </Button>
        )}
      </div>
    </div>
  );
}

/**
 * Daily Capacity Editor.
 */
function DailyCapacityEditor({
  currentCapacity,
  onSave,
}: {
  currentCapacity: number;
  onSave: (args: { dailyCapacity: number }) => Promise<unknown>;
}) {
  const [capacity, setCapacity] = useState(String(currentCapacity));
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setCapacity(String(currentCapacity));
  }, [currentCapacity]);

  const hasChanges = parseInt(capacity) !== currentCapacity;

  const handleSave = useCallback(async () => {
    const value = parseInt(capacity);
    if (isNaN(value) || value <= 0) {
      toast.error("Capacity must be a positive number");
      return;
    }

    setSaving(true);
    try {
      await onSave({ dailyCapacity: value });
      toast.success("Daily capacity updated");
    } catch (error) {
      console.error("Update capacity error:", error);
      toast.error("Failed to update capacity");
    } finally {
      setSaving(false);
    }
  }, [capacity, onSave]);

  return (
    <div className="space-y-4 py-2">
      <div className="space-y-1.5">
        <Label className="text-sm">Daily Production Capacity</Label>
        <p className="text-xs text-muted-foreground">
          Maximum number of balls (across all channels) that can be produced per day.
          The planner will show warnings when daily totals exceed this limit.
        </p>
      </div>

      <div className="flex items-center gap-3">
        <Input
          type="number"
          min="1"
          value={capacity}
          onChange={(e) => setCapacity(e.target.value)}
          className="h-10 text-lg w-32 tabular-nums font-medium"
        />
        <span className="text-sm text-muted-foreground">balls / day</span>
      </div>

      <Button
        onClick={handleSave}
        disabled={saving || !hasChanges}
        className="w-full"
      >
        {saving ? (
          <>
            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            Saving...
          </>
        ) : (
          "Save Capacity"
        )}
      </Button>
    </div>
  );
}
