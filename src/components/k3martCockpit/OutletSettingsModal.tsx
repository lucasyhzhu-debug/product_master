/**
 * OutletSettingsModal - Bulk outlet management modal for K3 Mart Cockpit.
 *
 * Two tabs:
 * 1. Outlets: Active/inactive toggle for all K3Mart outlets
 * 2. Product Settings: Per-outlet product selection (isHidden), custom pricing (customPrice)
 *    Shows K3Mart product name -> POS product name with real default prices.
 *
 * Admin-only access. Uses shadcn Dialog, Tabs, Switch, Select, Input.
 */

import { useState, useEffect, useMemo, useCallback } from "react";
import { Settings, Store, Package, Loader2, ArrowRight, AlertTriangle } from "lucide-react";
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
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "sonner";

interface OutletInfo {
  outletId: string;
  outletName: string;
  isActive: boolean;
}

interface OutletProduct {
  productKey: string;
  menuProductId?: string;
  productName: string;
  externalProductName?: string;
  defaultPrice: number;
  customPrice?: number;
  isHidden?: boolean;
  weekdayTarget: number;
  weekendTarget: number;
}

interface OutletSettingsModalProps {
  open: boolean;
  onClose: () => void;
  outlets: OutletInfo[];
  /** Per-outlet product settings from useOutletSettings */
  outletProducts: Record<string, OutletProduct[]>;
  onToggleOutletActive: (outletId: string, isActive: boolean) => Promise<void>;
  onSaveOutletSettings: (
    outletId: string,
    products: Array<{
      productKey: string;
      menuProductId?: string;
      weekdayTarget: number;
      weekendTarget: number;
      customPrice?: number;
      isHidden?: boolean;
    }>
  ) => Promise<void>;
}

export function OutletSettingsModal({
  open,
  onClose,
  outlets,
  outletProducts,
  onToggleOutletActive,
  onSaveOutletSettings,
}: OutletSettingsModalProps) {
  const [tab, setTab] = useState("outlets");
  const [togglingIds, setTogglingIds] = useState<Set<string>>(new Set());
  const [selectedOutletId, setSelectedOutletId] = useState<string>("");
  const [editedProducts, setEditedProducts] = useState<OutletProduct[]>([]);
  const [saving, setSaving] = useState(false);

  // When selected outlet changes, load its products
  useEffect(() => {
    if (selectedOutletId && outletProducts[selectedOutletId]) {
      setEditedProducts(
        outletProducts[selectedOutletId].map((p) => ({ ...p }))
      );
    } else {
      setEditedProducts([]);
    }
  }, [selectedOutletId, outletProducts]);

  // Default to first outlet when switching to Product Settings tab
  useEffect(() => {
    if (tab === "products" && !selectedOutletId && outlets.length > 0) {
      setSelectedOutletId(outlets[0].outletId);
    }
  }, [tab, selectedOutletId, outlets]);

  const handleToggleActive = useCallback(
    async (outletId: string, isActive: boolean) => {
      setTogglingIds((prev) => new Set(prev).add(outletId));
      try {
        await onToggleOutletActive(outletId, isActive);
        toast.success(`Outlet ${isActive ? "activated" : "deactivated"}`);
      } catch (error) {
        console.error("Toggle outlet error:", error);
        toast.error("Failed to toggle outlet status");
      } finally {
        setTogglingIds((prev) => {
          const next = new Set(prev);
          next.delete(outletId);
          return next;
        });
      }
    },
    [onToggleOutletActive]
  );

  const handleProductToggleHidden = useCallback(
    (productKey: string, visible: boolean) => {
      setEditedProducts((prev) =>
        prev.map((p) =>
          p.productKey === productKey ? { ...p, isHidden: !visible } : p
        )
      );
    },
    []
  );

  const handleCustomPricingToggle = useCallback(
    (productKey: string, enabled: boolean) => {
      setEditedProducts((prev) =>
        prev.map((p) =>
          p.productKey === productKey
            ? {
                ...p,
                customPrice: enabled ? p.defaultPrice : undefined,
              }
            : p
        )
      );
    },
    []
  );

  const handlePriceChange = useCallback(
    (productKey: string, price: number) => {
      setEditedProducts((prev) =>
        prev.map((p) =>
          p.productKey === productKey ? { ...p, customPrice: price } : p
        )
      );
    },
    []
  );

  const handleSave = useCallback(async () => {
    if (!selectedOutletId) return;

    // Validate prices
    for (const p of editedProducts) {
      if (p.customPrice !== undefined && p.customPrice <= 0) {
        toast.error(`Price must be greater than 0 for ${p.productName}`);
        return;
      }
    }

    setSaving(true);
    try {
      await onSaveOutletSettings(
        selectedOutletId,
        editedProducts.map((p) => ({
          productKey: p.productKey,
          menuProductId: p.menuProductId,
          weekdayTarget: p.weekdayTarget,
          weekendTarget: p.weekendTarget,
          customPrice: p.customPrice,
          isHidden: p.isHidden,
        }))
      );
      toast.success("Outlet settings saved");
    } catch (error) {
      console.error("Save outlet settings error:", error);
      toast.error("Failed to save settings");
    } finally {
      setSaving(false);
    }
  }, [selectedOutletId, editedProducts, onSaveOutletSettings]);

  // Check if there are unsaved changes
  const hasChanges = useMemo(() => {
    if (!selectedOutletId || !outletProducts[selectedOutletId]) return false;
    const original = outletProducts[selectedOutletId];
    return editedProducts.some((ep, i) => {
      const orig = original[i];
      if (!orig) return true;
      return (
        ep.isHidden !== orig.isHidden ||
        ep.customPrice !== orig.customPrice
      );
    });
  }, [selectedOutletId, outletProducts, editedProducts]);

  return (
    <Dialog open={open} onOpenChange={(isOpen) => !isOpen && onClose()}>
      <DialogContent className="max-w-lg max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Settings className="h-5 w-5" />
            Outlet Settings
          </DialogTitle>
        </DialogHeader>

        <Tabs value={tab} onValueChange={setTab}>
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="outlets" className="gap-1.5">
              <Store className="h-3.5 w-3.5" />
              Outlets
            </TabsTrigger>
            <TabsTrigger value="products" className="gap-1.5">
              <Package className="h-3.5 w-3.5" />
              Product Settings
            </TabsTrigger>
          </TabsList>

          {/* Tab 1: Outlets */}
          <TabsContent value="outlets" className="mt-4 space-y-3">
            <p className="text-sm text-muted-foreground">
              Toggle outlets active or inactive. Inactive outlets are hidden
              from the planning grid.
            </p>
            <Separator />
            <div className="space-y-2">
              {outlets.map((outlet) => {
                const isToggling = togglingIds.has(outlet.outletId);
                return (
                  <div
                    key={outlet.outletId}
                    className="flex items-center justify-between py-2 px-3 rounded-lg hover:bg-muted/50"
                  >
                    <div className="flex items-center gap-3">
                      <div
                        className="h-2 w-2 rounded-full"
                        style={{
                          backgroundColor: outlet.isActive
                            ? "#22c55e"
                            : "#d1d5db",
                        }}
                      />
                      <span
                        className={`text-sm font-medium ${outlet.isActive ? "" : "text-muted-foreground"}`}
                      >
                        {outlet.outletName}
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      {isToggling && (
                        <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />
                      )}
                      <Switch
                        checked={outlet.isActive}
                        onCheckedChange={(checked) =>
                          handleToggleActive(outlet.outletId, checked)
                        }
                        disabled={isToggling}
                      />
                    </div>
                  </div>
                );
              })}
              {outlets.length === 0 && (
                <div className="text-center py-8 text-sm text-muted-foreground">
                  No outlets found. Sync K3Mart data first.
                </div>
              )}
            </div>
          </TabsContent>

          {/* Tab 2: Product Settings */}
          <TabsContent value="products" className="mt-4 space-y-4">
            <p className="text-sm text-muted-foreground">
              Configure which products appear in the planning grid and set
              custom pricing per outlet.
            </p>

            {/* Outlet selector */}
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">
                Select Outlet
              </Label>
              <Select
                value={selectedOutletId}
                onValueChange={setSelectedOutletId}
              >
                <SelectTrigger className="h-9 text-sm">
                  <SelectValue placeholder="Select an outlet" />
                </SelectTrigger>
                <SelectContent>
                  {outlets.map((o) => (
                    <SelectItem
                      key={o.outletId}
                      value={o.outletId}
                      className="text-sm"
                    >
                      {o.outletName}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <Separator />

            {/* Product list */}
            {editedProducts.length === 0 ? (
              <div className="text-center py-6 text-sm text-muted-foreground">
                {selectedOutletId
                  ? "No products configured for this outlet"
                  : "Select an outlet to view products"}
              </div>
            ) : (
              <div className="space-y-3">
                {editedProducts.map((product) => {
                  const hasCustomPrice = product.customPrice !== undefined;
                  const k3martName = product.externalProductName;
                  const posName = product.productName;
                  const showBothNames = k3martName && k3martName !== posName;

                  return (
                    <div
                      key={product.productKey}
                      className="border border-border rounded-lg p-3 space-y-2"
                    >
                      {/* Product name + visibility checkbox */}
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex items-start gap-2 min-w-0">
                          <Checkbox
                            id={`visible-${product.productKey}`}
                            checked={!product.isHidden}
                            onCheckedChange={(checked) =>
                              handleProductToggleHidden(
                                product.productKey,
                                !!checked
                              )
                            }
                            className="mt-0.5"
                          />
                          <div className="min-w-0">
                            {showBothNames ? (
                              <Label
                                htmlFor={`visible-${product.productKey}`}
                                className="text-sm font-medium cursor-pointer flex items-center gap-1.5 flex-wrap"
                              >
                                <span className="text-foreground">{k3martName}</span>
                                <ArrowRight className="h-3 w-3 text-muted-foreground shrink-0" />
                                <span className="text-muted-foreground">{posName}</span>
                              </Label>
                            ) : (
                              <Label
                                htmlFor={`visible-${product.productKey}`}
                                className="text-sm font-medium cursor-pointer"
                              >
                                {posName}
                              </Label>
                            )}
                          </div>
                        </div>
                      </div>

                      {/* Pricing row */}
                      <div className="flex items-center gap-3 pl-6">
                        {product.defaultPrice > 0 ? (
                          <span className="text-xs text-muted-foreground">
                            Default: Rp{" "}
                            {product.defaultPrice.toLocaleString("id-ID")}
                          </span>
                        ) : (
                          <span className="text-xs text-amber-600 dark:text-amber-400 flex items-center gap-1">
                            <AlertTriangle className="h-3 w-3" />
                            Price not mapped
                          </span>
                        )}

                        <div className="flex items-center gap-2 ml-auto">
                          <Label
                            htmlFor={`custom-${product.productKey}`}
                            className="text-xs text-muted-foreground"
                          >
                            Custom pricing
                          </Label>
                          <Switch
                            id={`custom-${product.productKey}`}
                            checked={hasCustomPrice}
                            onCheckedChange={(checked) =>
                              handleCustomPricingToggle(
                                product.productKey,
                                checked
                              )
                            }
                          />
                        </div>
                      </div>

                      {/* Custom price input */}
                      {hasCustomPrice && (
                        <div className="pl-6 flex items-center gap-2">
                          <span className="text-xs text-muted-foreground">
                            Rp
                          </span>
                          <Input
                            type="number"
                            min="1"
                            value={product.customPrice ?? ""}
                            onChange={(e) =>
                              handlePriceChange(
                                product.productKey,
                                parseInt(e.target.value) || 0
                              )
                            }
                            className="h-8 text-sm w-32 tabular-nums"
                            placeholder="Enter price"
                          />
                          {product.customPrice !== undefined &&
                            product.customPrice <= 0 && (
                              <span className="text-xs text-red-500">
                                Must be &gt; 0
                              </span>
                            )}
                        </div>
                      )}
                    </div>
                  );
                })}

                {/* Save button */}
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
                    "Save Settings"
                  )}
                </Button>
              </div>
            )}
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
