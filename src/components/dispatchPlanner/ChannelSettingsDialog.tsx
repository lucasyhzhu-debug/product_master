/**
 * ChannelSettingsDialog - Settings dialog for the Unified Dispatch Planner.
 *
 * Two sections via Tabs:
 * 1. Channels: Priority reorder + enable/disable + display name per channel
 * 2. Outlets: Add/edit/remove consignment outlets with product mappings
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
  useDispatchConsignmentOutlets,
  useDispatchReorderPriorities,
  useDispatchUpdateChannelConfig,
  useDispatchAddConsignmentOutlet,
  useDispatchUpdateConsignmentOutlet,
  useDispatchRemoveConsignmentOutlet,
} from "@/hooks/convex/useDispatchPlanner";
import { useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";

// ========================
// Types
// ========================

interface ProductMapping {
  menuProductId: Id<"menuProducts">;
  externalName: string;
  externalPrice: number;
}

interface OutletFormData {
  name: string;
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
  const [tab, setTab] = useState("channels");

  // Data hooks
  const { data: channels, isLoading: channelsLoading } = useDispatchChannelConfig();
  const { data: outlets, isLoading: outletsLoading } = useDispatchConsignmentOutlets();
  const rawMenuProducts = useQuery(api.menuProducts.queries.list, { activeOnly: true });
  const menuProducts = rawMenuProducts?.map((mp) => ({
    _id: mp._id as unknown as string,
    name: mp.name,
    defaultPrice: mp.defaultPrice,
  }));

  // Mutation hooks
  const reorderPriorities = useDispatchReorderPriorities();
  const updateChannelConfig = useDispatchUpdateChannelConfig();
  const addOutlet = useDispatchAddConsignmentOutlet();
  const updateOutlet = useDispatchUpdateConsignmentOutlet();
  const removeOutlet = useDispatchRemoveConsignmentOutlet();

  const isLoading = channelsLoading || outletsLoading;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Settings className="h-5 w-5" />
            Restock Planner Settings
          </DialogTitle>
        </DialogHeader>

        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <Tabs value={tab} onValueChange={setTab}>
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="channels" className="text-xs">
                Channels
              </TabsTrigger>
              <TabsTrigger value="outlets" className="text-xs">
                Outlets
              </TabsTrigger>
            </TabsList>

            {/* Tab 1: Channels (priority reorder + enable/disable + name) */}
            <TabsContent value="channels" className="mt-4 space-y-3">
              <p className="text-sm text-muted-foreground">
                Reorder channels by priority (higher = gets capacity first),
                enable/disable, and edit display names.
              </p>
              <Separator />
              <ChannelList
                channels={channels ?? []}
                onReorder={reorderPriorities}
                onUpdate={updateChannelConfig}
              />
            </TabsContent>

            {/* Tab 2: Consignment Outlets */}
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
 * Combined Channel List -- priority reorder + enable/disable + name edit.
 * Merges the former ChannelPriorityList and ChannelSettingsList into one.
 */
function ChannelList({
  channels,
  onReorder,
  onUpdate,
}: {
  channels: Array<{
    _id: string;
    channelKey: string;
    displayName: string;
    color: string;
    priority: number;
    isEnabled: boolean;
  }>;
  onReorder: (args: { orderedKeys: string[] }) => Promise<unknown>;
  onUpdate: (args: {
    channelKey: string;
    updates: {
      isEnabled?: boolean;
      displayName?: string;
    };
  }) => Promise<unknown>;
}) {
  const [busy, setBusy] = useState(false);
  const sorted = [...channels].sort((a, b) => a.priority - b.priority);

  const handleMove = useCallback(
    async (index: number, direction: "up" | "down") => {
      const newIndex = direction === "up" ? index - 1 : index + 1;
      if (newIndex < 0 || newIndex >= sorted.length) return;

      const newOrder = sorted.map((ch) => ch.channelKey);
      [newOrder[index], newOrder[newIndex]] = [newOrder[newIndex], newOrder[index]];

      setBusy(true);
      try {
        await onReorder({ orderedKeys: newOrder });
        toast.success("Channel priorities updated");
      } catch (error) {
        console.error("Reorder error:", error);
        toast.error("Failed to reorder channels");
      } finally {
        setBusy(false);
      }
    },
    [sorted, onReorder]
  );

  const handleToggle = useCallback(
    async (channelKey: string, isEnabled: boolean) => {
      setBusy(true);
      try {
        await onUpdate({ channelKey, updates: { isEnabled } });
        toast.success(`Channel ${isEnabled ? "enabled" : "disabled"}`);
      } catch (error) {
        console.error("Toggle channel error:", error);
        toast.error("Failed to toggle channel");
      } finally {
        setBusy(false);
      }
    },
    [onUpdate]
  );

  const handleNameSave = useCallback(
    async (channelKey: string, displayName: string) => {
      if (!displayName.trim()) return;
      setBusy(true);
      try {
        await onUpdate({ channelKey, updates: { displayName: displayName.trim() } });
        toast.success("Display name updated");
      } catch (error) {
        console.error("Update name error:", error);
        toast.error("Failed to update display name");
      } finally {
        setBusy(false);
      }
    },
    [onUpdate]
  );

  return (
    <div className="space-y-1">
      {sorted.map((channel, index) => (
        <ChannelListRow
          key={channel.channelKey}
          channel={channel}
          index={index}
          total={sorted.length}
          busy={busy}
          onMove={handleMove}
          onToggle={handleToggle}
          onNameSave={handleNameSave}
        />
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
 * Individual channel row in the combined list.
 */
function ChannelListRow({
  channel,
  index,
  total,
  busy,
  onMove,
  onToggle,
  onNameSave,
}: {
  channel: {
    channelKey: string;
    displayName: string;
    color: string;
    isEnabled: boolean;
  };
  index: number;
  total: number;
  busy: boolean;
  onMove: (index: number, direction: "up" | "down") => void;
  onToggle: (key: string, enabled: boolean) => void;
  onNameSave: (key: string, name: string) => void;
}) {
  const [editName, setEditName] = useState(channel.displayName);

  useEffect(() => {
    setEditName(channel.displayName);
  }, [channel.displayName]);

  return (
    <div className="flex items-center gap-2 py-2 px-3 rounded-lg hover:bg-muted/50">
      {/* Priority number */}
      <span className="text-xs font-mono text-muted-foreground w-5 text-center shrink-0">
        {index + 1}
      </span>

      {/* Color swatch */}
      <div
        className="h-3 w-3 rounded-full shrink-0"
        style={{ backgroundColor: channel.color }}
      />

      {/* Editable display name */}
      <Input
        value={editName}
        onChange={(e) => setEditName(e.target.value)}
        onBlur={() => {
          if (editName.trim() && editName.trim() !== channel.displayName) {
            onNameSave(channel.channelKey, editName);
          }
        }}
        className="h-7 text-sm flex-1"
        disabled={busy}
      />

      {/* Up/down arrows */}
      <Button
        variant="ghost"
        size="icon"
        className="h-7 w-7 shrink-0"
        disabled={index === 0 || busy}
        onClick={() => onMove(index, "up")}
      >
        <ChevronUp className="h-4 w-4" />
      </Button>
      <Button
        variant="ghost"
        size="icon"
        className="h-7 w-7 shrink-0"
        disabled={index === total - 1 || busy}
        onClick={() => onMove(index, "down")}
      >
        <ChevronDown className="h-4 w-4" />
      </Button>

      {/* Enable/disable toggle */}
      <Switch
        checked={channel.isEnabled}
        onCheckedChange={(checked) => onToggle(channel.channelKey, checked)}
        disabled={busy}
      />
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
    _id: Id<"consignmentOutlets">;
    name: string;
    isEnabled?: boolean;
    isActive?: boolean;
    productMappings?: ProductMapping[];
  }>;
  menuProducts: Array<{ _id: string; name: string; defaultPrice: number }>;
  onAdd: (args: {
    name: string;
    productMappings: ProductMapping[];
  }) => Promise<unknown>;
  onUpdate: (args: {
    outletId: Id<"consignmentOutlets">;
    name?: string;
    productMappings?: ProductMapping[];
    isEnabled?: boolean;
  }) => Promise<unknown>;
  onRemove: (args: { outletId: Id<"consignmentOutlets"> }) => Promise<unknown>;
}) {
  const [showAddForm, setShowAddForm] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<{
    id: Id<"consignmentOutlets">;
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
              {!(outlet.isEnabled ?? outlet.isActive ?? true) && (
                <span className="text-xs text-muted-foreground bg-muted px-1.5 py-0.5 rounded">
                  Disabled
                </span>
              )}
            </div>
            <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
              <Switch
                checked={outlet.isEnabled ?? outlet.isActive ?? true}
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
                  productMappings: outlet.productMappings ?? [],
                }}
                menuProducts={menuProducts}
                onSave={async (data) => {
                  try {
                    await onUpdate({
                      outletId: outlet._id,
                      name: data.name,
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
  const [mappings, setMappings] = useState<ProductMapping[]>(
    initialData.productMappings
  );
  const [saving, setSaving] = useState(false);

  const handleAddMapping = useCallback(() => {
    setMappings((prev) => [
      ...prev,
      { menuProductId: "" as Id<"menuProducts">, externalName: "", externalPrice: 0 },
    ]);
  }, []);

  const handleRemoveMapping = useCallback((index: number) => {
    setMappings((prev) => prev.filter((_, i) => i !== index));
  }, []);

  const handleMappingChange = useCallback(
    (index: number, field: keyof ProductMapping, value: string | number | Id<"menuProducts">) => {
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
        productMappings: validMappings,
      });
    } finally {
      setSaving(false);
    }
  }, [name, mappings, onSave]);

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

      {/* Product Mappings */}
      <div className="space-y-2">
        <Label className="text-xs text-muted-foreground">Product Mappings</Label>
        {mappings.map((mapping, index) => (
          <div key={index} className="flex items-center gap-2">
            {/* Menu product selector */}
            <Select
              value={mapping.menuProductId as string}
              onValueChange={(val) =>
                handleMappingChange(index, "menuProductId", val as Id<"menuProducts">)
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

