/**
 * MenuTab - GrabFood menu item availability toggles with batch publish.
 * Extracted from GrabFoodManager.tsx for maintainability.
 */

import { useState, useEffect, useCallback } from "react";
import {
  RefreshCw,
  Loader2,
} from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";

import { formatCurrency } from "@/lib/utils";
import { useGrabFoodActions } from "@/hooks/convex/useGrabFood";

interface MenuItem {
  id: string;
  name: string;
  price?: number;
  availableStatus: "AVAILABLE" | "UNAVAILABLE";
}

export interface MenuTabProps {
  merchantID: string;
  isAdmin: boolean;
}

export function MenuTab({ merchantID, isAdmin }: MenuTabProps) {
  const actions = useGrabFoodActions();
  const [loading, setLoading] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [menuItems, setMenuItems] = useState<MenuItem[]>([]);
  const [pendingChanges, setPendingChanges] = useState<
    Map<string, "AVAILABLE" | "UNAVAILABLE">
  >(new Map());

  const fetchMenu = useCallback(async () => {
    if (!merchantID) return;
    setLoading(true);
    try {
      const result = await actions.getMenuItems(merchantID);
      if (result.success && result.menu) {
        // Parse menu response -- categories > items structure
        const items: MenuItem[] = [];
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const menu = result.menu as any;

        if (menu.categories && Array.isArray(menu.categories)) {
          for (const cat of menu.categories) {
            if (cat.items && Array.isArray(cat.items)) {
              for (const item of cat.items) {
                items.push({
                  id: item.id ?? item.itemID ?? "",
                  name: item.name ?? "Unknown",
                  price: item.price ?? item.sellingPrice ?? undefined,
                  availableStatus: item.availableStatus ?? "AVAILABLE",
                });
              }
            }
          }
        }

        setMenuItems(items);
        setPendingChanges(new Map());
      } else {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const error = (result as any).error ?? "Failed to fetch menu";
        toast.error(error);
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to fetch menu");
    } finally {
      setLoading(false);
    }
  }, [merchantID, actions]);

  // Fetch on mount / merchantID change
  useEffect(() => {
    if (merchantID) {
      fetchMenu();
    }
  }, [merchantID]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleToggle = (item: MenuItem) => {
    const newStatus =
      (pendingChanges.get(item.id) ?? item.availableStatus) === "AVAILABLE"
        ? "UNAVAILABLE"
        : "AVAILABLE";

    // If toggling back to original, remove from pending
    if (newStatus === item.availableStatus) {
      const next = new Map(pendingChanges);
      next.delete(item.id);
      setPendingChanges(next);
    } else {
      setPendingChanges(new Map(pendingChanges).set(item.id, newStatus));
    }
  };

  const handlePublish = async () => {
    if (pendingChanges.size === 0 || !merchantID) return;
    setPublishing(true);
    try {
      const items = Array.from(pendingChanges.entries()).map(([id, status]) => ({
        id,
        availableStatus: status,
      }));
      const result = await actions.batchUpdateAvailability(merchantID, items);
      if (result.success) {
        toast.success(`Published ${items.length} menu changes`);
        setPendingChanges(new Map());
        // Refresh menu to get updated state
        await fetchMenu();
      } else {
        toast.error(result.error ?? "Failed to publish changes");
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to publish");
    } finally {
      setPublishing(false);
    }
  };

  const getEffectiveStatus = (item: MenuItem) =>
    pendingChanges.get(item.id) ?? item.availableStatus;

  if (!merchantID) {
    return (
      <Card>
        <CardContent className="py-8 text-center text-muted-foreground">
          Select an outlet to view menu items.
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header with refresh + publish */}
      <div className="flex items-center justify-between">
        <Button
          variant="outline"
          size="sm"
          onClick={fetchMenu}
          disabled={loading}
        >
          {loading ? (
            <Loader2 className="h-4 w-4 animate-spin mr-1" />
          ) : (
            <RefreshCw className="h-4 w-4 mr-1" />
          )}
          Refresh Menu
        </Button>
        {pendingChanges.size > 0 && (
          <Button
            onClick={handlePublish}
            disabled={publishing}
            className="min-h-[44px]"
          >
            {publishing ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin mr-1" />
                Publishing...
              </>
            ) : (
              <>
                Publish Changes
                <Badge variant="secondary" className="ml-2">
                  {pendingChanges.size}
                </Badge>
              </>
            )}
          </Button>
        )}
      </div>

      {/* Menu items list */}
      <Card>
        <CardContent className="p-0">
          {loading && menuItems.length === 0 ? (
            <div className="space-y-3 p-4">
              {Array.from({ length: 5 }).map((_, i) => (
                <Skeleton key={i} className="h-12 w-full" />
              ))}
            </div>
          ) : menuItems.length === 0 ? (
            <div className="py-8 text-center text-muted-foreground">
              No menu items found. Click Refresh Menu to fetch from GrabFood.
            </div>
          ) : (
            <div className="divide-y">
              {menuItems.map((item) => {
                const effectiveStatus = getEffectiveStatus(item);
                const isAvailable = effectiveStatus === "AVAILABLE";
                const hasChange = pendingChanges.has(item.id);

                return (
                  <div
                    key={item.id}
                    className={`flex items-center justify-between px-4 py-3 ${
                      hasChange ? "bg-blue-50 dark:bg-blue-950/20" : ""
                    }`}
                  >
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-sm truncate">{item.name}</p>
                      <div className="flex items-center gap-2 mt-0.5">
                        <span className="text-xs text-muted-foreground font-mono">
                          {item.id}
                        </span>
                        {item.price != null && (
                          <span className="text-xs text-muted-foreground">
                            {formatCurrency(item.price ?? 0)}
                          </span>
                        )}
                        {hasChange && (
                          <Badge variant="outline" className="text-xs text-blue-600 border-blue-300">
                            changed
                          </Badge>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-2 ml-4">
                      <span className="text-xs text-muted-foreground">
                        {isAvailable ? "Available" : "Unavailable"}
                      </span>
                      <Switch
                        checked={isAvailable}
                        onCheckedChange={() => handleToggle(item)}
                        disabled={!isAdmin}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
