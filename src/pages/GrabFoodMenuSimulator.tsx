/**
 * GrabFoodMenuSimulator - GrabFood-app-like menu management page.
 *
 * Features:
 * - Card grid with GrabFood visual fidelity (photos, prices, availability)
 * - Inline editing (name, price, description with onBlur commit)
 * - Photo upload to Convex file storage
 * - Add items from internal menu products
 * - Push changes to GrabFood with diff confirmation dialog
 * - Sync status badge
 * - Populate from existing product mappings (first use)
 */

import { useState, useMemo, useCallback } from "react";
import { Plus, Upload, Loader2, Database } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useAuth } from "@/contexts/AuthContext";
import { useGrabFoodMenu, useMenuProductsList } from "@/hooks/convex/useGrabFoodMenu";
import { getErrorMessage } from "@/lib/utils";

import { MenuItemCard } from "@/components/grabfoodMenu/MenuItemCard";
import { AddItemDialog } from "@/components/grabfoodMenu/AddItemDialog";
import { PushConfirmDialog } from "@/components/grabfoodMenu/PushConfirmDialog";
import { SyncStatusBadge } from "@/components/grabfoodMenu/SyncStatusBadge";
import type { Id } from "../../convex/_generated/dataModel";

const MERCHANT_ID = "6-C7XYAECCTNKXJ6";

export function GrabFoodMenuSimulator() {
  const { user } = useAuth();
  const token = user?.token ?? "";
  const {
    menuItems,
    syncStatus,
    createItem,
    updateItem,
    deleteItem,
    generateUploadUrl,
    savePhoto,
    populateFromMappings,
    pushMenuChanges,
  } = useGrabFoodMenu();
  const { data: menuProducts } = useMenuProductsList();

  // Dialog states
  const [addDialogOpen, setAddDialogOpen] = useState(false);
  const [pushDialogOpen, setPushDialogOpen] = useState(false);
  const [isPushing, setIsPushing] = useState(false);
  const [isPopulating, setIsPopulating] = useState(false);

  // Compute existing menu product IDs for filtering
  const existingMenuProductIds = useMemo(() => {
    if (!menuItems) return new Set<string>();
    return new Set(menuItems.map((item) => item.menuProductId));
  }, [menuItems]);

  // Compute pending changes from persisted push state
  const pendingChanges = useMemo(() => {
    if (!menuItems) {
      return {
        priceChanges: [],
        availabilityChanges: [],
        newItems: [],
        totalChanges: 0,
      };
    }

    const priceChanges: Array<{
      name: string;
      oldPrice: number;
      newPrice: number;
      grabfoodItemId: string;
    }> = [];
    const availabilityChanges: Array<{
      name: string;
      newStatus: "AVAILABLE" | "UNAVAILABLE";
      grabfoodItemId: string;
    }> = [];
    const newItems: Array<{ name: string; price: number }> = [];

    for (const item of menuItems) {
      // Items never pushed are "new items"
      if (!item.lastPushedAt) {
        if (item.grabfoodItemId) {
          // Has a GrabFood ID but never pushed from this system - treat as existing needing sync
          newItems.push({ name: item.grabfoodName, price: item.grabfoodPrice });
        } else {
          newItems.push({ name: item.grabfoodName, price: item.grabfoodPrice });
        }
        continue;
      }

      // Check price changes
      if (
        item.lastPushedPrice !== undefined &&
        item.lastPushedPrice !== null &&
        item.grabfoodPrice !== item.lastPushedPrice &&
        item.grabfoodItemId
      ) {
        priceChanges.push({
          name: item.grabfoodName,
          oldPrice: item.lastPushedPrice,
          newPrice: item.grabfoodPrice,
          grabfoodItemId: item.grabfoodItemId,
        });
      }

      // Check availability changes
      if (
        item.lastPushedAvailability !== undefined &&
        item.lastPushedAvailability !== null &&
        item.isAvailable !== item.lastPushedAvailability &&
        item.grabfoodItemId
      ) {
        availabilityChanges.push({
          name: item.grabfoodName,
          newStatus: item.isAvailable ? "AVAILABLE" : "UNAVAILABLE",
          grabfoodItemId: item.grabfoodItemId,
        });
      }
    }

    return {
      priceChanges,
      availabilityChanges,
      newItems,
      totalChanges: priceChanges.length + availabilityChanges.length + newItems.length,
    };
  }, [menuItems]);

  // Handlers
  const handleUpdate = useCallback(
    async (
      menuItemId: Id<"grabfoodMenuItems">,
      fields: {
        grabfoodName?: string;
        grabfoodDescription?: string;
        grabfoodPrice?: number;
        isAvailable?: boolean;
      }
    ) => {
      if (!token) return;
      try {
        await updateItem({ token, menuItemId, fields });
      } catch (err) {
        toast.error(getErrorMessage(err, "Failed to update item"));
      }
    },
    [token, updateItem]
  );

  const handleDelete = useCallback(
    async (menuItemId: Id<"grabfoodMenuItems">) => {
      if (!token) return;
      try {
        await deleteItem({ token, menuItemId });
        toast.success("Item removed from GrabFood menu");
      } catch (err) {
        toast.error(getErrorMessage(err, "Failed to delete item"));
      }
    },
    [token, deleteItem]
  );

  const handlePhotoUpload = useCallback(
    async (menuItemId: Id<"grabfoodMenuItems">, storageId: Id<"_storage">) => {
      if (!token) return;
      await savePhoto({ token, menuItemId, storageId });
    },
    [token, savePhoto]
  );

  const handleAddItem = useCallback(
    async (data: {
      menuProductId: Id<"menuProducts">;
      grabfoodName: string;
      grabfoodPrice: number;
      grabfoodDescription?: string;
    }) => {
      if (!token) return;
      try {
        await createItem({
          token,
          menuProductId: data.menuProductId,
          grabfoodName: data.grabfoodName,
          grabfoodPrice: data.grabfoodPrice,
          grabfoodDescription: data.grabfoodDescription,
        });
        toast.success("Item added to GrabFood menu");
      } catch (err) {
        toast.error(getErrorMessage(err, "Failed to add item"));
      }
    },
    [token, createItem]
  );

  const handlePopulate = useCallback(async () => {
    if (!token) return;
    setIsPopulating(true);
    try {
      const result = await populateFromMappings({ token });
      toast.success(`Imported ${result.created} items from product mappings`);
    } catch (err) {
      toast.error(getErrorMessage(err, "Failed to populate menu"));
    } finally {
      setIsPopulating(false);
    }
  }, [token, populateFromMappings]);

  const handlePush = useCallback(async () => {
    if (!token) return;
    setIsPushing(true);
    try {
      // Build push payload from pending changes
      const priceUpdates = pendingChanges.priceChanges.map((c) => ({
        id: c.grabfoodItemId,
        price: c.newPrice,
      }));
      const availabilityUpdates = pendingChanges.availabilityChanges.map((c) => ({
        id: c.grabfoodItemId,
        availableStatus: c.newStatus as "AVAILABLE" | "UNAVAILABLE",
      }));

      const result = await pushMenuChanges({
        token,
        merchantID: MERCHANT_ID,
        priceUpdates,
        availabilityUpdates,
      });

      if (result.success) {
        toast.success(
          `Pushed ${(result.priceUpdatesCount ?? 0) + (result.availabilityUpdatesCount ?? 0)} changes to GrabFood`
        );
        setPushDialogOpen(false);
      } else {
        toast.error(result.error ?? "Push failed");
      }
    } catch (err) {
      toast.error(getErrorMessage(err, "Failed to push changes"));
    } finally {
      setIsPushing(false);
    }
  }, [token, pendingChanges, pushMenuChanges]);

  // Loading state - all hooks called above, safe to return early now
  if (menuItems === undefined) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <Skeleton className="h-8 w-64" />
          <Skeleton className="h-9 w-32" />
        </div>
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <Skeleton key={i} className="aspect-[3/4] rounded-lg" />
          ))}
        </div>
      </div>
    );
  }

  const isEmpty = menuItems.length === 0;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-bold">
            <span className="text-[var(--color-grabfood)]">GrabFood</span>{" "}
            Menu Simulator
          </h1>
          <SyncStatusBadge syncStatus={syncStatus} />
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          {/* Populate button - only shown when menu is empty */}
          {isEmpty && (
            <Button
              variant="outline"
              size="sm"
              onClick={handlePopulate}
              disabled={isPopulating}
            >
              {isPopulating ? (
                <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
              ) : (
                <Database className="mr-1.5 h-3.5 w-3.5" />
              )}
              Populate from Mappings
            </Button>
          )}

          {/* Add Item button */}
          <Button
            variant="outline"
            size="sm"
            onClick={() => setAddDialogOpen(true)}
          >
            <Plus className="mr-1.5 h-3.5 w-3.5" />
            Add Item
          </Button>

          {/* Push to GrabFood button */}
          <Button
            size="sm"
            onClick={() => setPushDialogOpen(true)}
            disabled={pendingChanges.totalChanges === 0}
            className="bg-[var(--color-grabfood)] hover:bg-[var(--color-grabfood-accent)] text-white"
          >
            <Upload className="mr-1.5 h-3.5 w-3.5" />
            Push to GrabFood
            {pendingChanges.totalChanges > 0 && (
              <span className="ml-1.5 bg-white/20 rounded-full px-1.5 py-0.5 text-xs">
                {pendingChanges.totalChanges}
              </span>
            )}
          </Button>
        </div>
      </div>

      {/* Card Grid or Empty State */}
      {isEmpty ? (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <div className="h-16 w-16 rounded-full bg-muted flex items-center justify-center mb-4">
            <Database className="h-8 w-8 text-muted-foreground" />
          </div>
          <h3 className="text-lg font-medium mb-2">No menu items yet</h3>
          <p className="text-sm text-muted-foreground max-w-md">
            Click "Populate from Mappings" to import existing items from your
            GrabFood product mappings, or "Add Item" to add products manually.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
          {menuItems.map((item) => (
            <MenuItemCard
              key={item._id}
              item={item}
              onUpdate={handleUpdate}
              onDelete={handleDelete}
              onPhotoUpload={handlePhotoUpload}
              generateUploadUrl={generateUploadUrl}
              token={token ?? ""}
            />
          ))}
        </div>
      )}

      {/* Add Item Dialog */}
      <AddItemDialog
        open={addDialogOpen}
        onOpenChange={setAddDialogOpen}
        existingMenuProductIds={existingMenuProductIds}
        menuProducts={menuProducts}
        onAdd={handleAddItem}
      />

      {/* Push Confirmation Dialog */}
      <PushConfirmDialog
        open={pushDialogOpen}
        onOpenChange={setPushDialogOpen}
        changes={pendingChanges}
        onConfirm={handlePush}
        isPushing={isPushing}
      />
    </div>
  );
}

export default GrabFoodMenuSimulator;
