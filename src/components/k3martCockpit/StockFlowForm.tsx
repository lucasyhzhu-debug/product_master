/**
 * StockFlowForm - Unified stock-in/out form for K3 Mart Cockpit
 *
 * A compact inline form for submitting stock-in or stock-out requests to the K3 Mart API.
 * Uses tabs to switch between stock-in and stock-out modes.
 *
 * Features:
 * - Tab-based mode switching (stock in/out)
 * - Rotation shortcut (stock-out remaining + stock-in new quantity in one action)
 * - Confirmation dialog before every API submission
 * - Price validation (prevents zero/null price)
 * - Product selection (if multiple products)
 * - Quantity controls with +/- buttons
 * - Source selector for stock-in (Kitchen/Goldfinch/Outlet)
 * - Destination selector for stock-out (Office/Goldfinch/Outlet)
 * - Optional notes field
 * - Error handling with retry
 */

import { useState, useEffect, useCallback } from "react";
import { ArrowDownToLine, ArrowUpFromLine, Loader2, Plus, Minus, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { StockFlowConfirmDialog, type StockFlowConfirmData } from "./StockFlowConfirmDialog";

interface StockFlowFormProps {
  outletId: string;
  outletName: string;
  products: Array<{
    menuProductId: string;
    externalProductCode: string;
    productName: string;
    currentStock: number;
    price?: number;
  }>;
  /** Available sources for stock-in */
  availableSources: Array<{
    type: "kitchen" | "goldfinch" | "outlet";
    label: string;
    available: number;
    outletId?: string; // for outlet transfers
  }>;
  /** Available destinations for stock-out */
  availableDestinations: Array<{
    type: "office" | "goldfinch" | "outlet";
    label: string;
    outletId?: string;
  }>;
  /** Callback when form is submitted */
  onSubmit: (data: {
    direction: "stock_in" | "stock_out";
    menuProductId: string;
    externalProductCode: string;
    quantity: number;
    source?: "kitchen" | "goldfinch" | "outlet";
    sourceOutletId?: string;
    destination?: "office" | "goldfinch" | "outlet";
    destinationOutletId?: string;
    note: string;
  }) => Promise<void>;
  isSubmitting?: boolean;
}

type FormMode = "stock_in" | "stock_out" | "rotation";

export function StockFlowForm({
  outletId: _outletId,
  outletName,
  products,
  availableSources,
  availableDestinations,
  onSubmit,
  isSubmitting = false,
}: StockFlowFormProps) {
  // Filter out products with empty menuProductId (prevents Select crash)
  const selectableProducts = products.filter(p => p.menuProductId);

  // Form state
  const [mode, setMode] = useState<FormMode>("stock_in");
  const direction: "stock_in" | "stock_out" = mode === "rotation" ? "stock_out" : mode;
  const [selectedProductId, setSelectedProductId] = useState<string>(
    selectableProducts.length === 1 ? selectableProducts[0].menuProductId : (selectableProducts[0]?.menuProductId ?? "")
  );
  const [quantity, setQuantity] = useState<number>(1);
  const [rotationStockInQty, setRotationStockInQty] = useState<number>(30);
  const [source, setSource] = useState<string>("");
  const [destination, setDestination] = useState<string>("");
  const [note, setNote] = useState<string>("");

  // Confirmation dialog state
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [confirmData, setConfirmData] = useState<StockFlowConfirmData | null>(null);
  const [lastError, setLastError] = useState<string | null>(null);
  const [retryFn, setRetryFn] = useState<(() => void) | null>(null);

  // Get selected product (search in original products list for stock info)
  const selectedProduct = products.find((p) => p.menuProductId === selectedProductId);

  // Reset source/destination when switching directions
  useEffect(() => {
    setSource("");
    setDestination("");
    setLastError(null);
    setRetryFn(null);
    // When entering rotation mode, auto-fill stock-out qty from current stock
    if (mode === "rotation" && selectedProduct) {
      setQuantity(selectedProduct.currentStock);
      setNote("rotation stock-out/stock-in");
      setRotationStockInQty(30);
    }
  }, [mode, selectedProduct]);

  // Validation
  const validate = (): string | null => {
    if (!selectedProductId) {
      return "Please select a product";
    }
    if (mode === "rotation") {
      if (rotationStockInQty < 1) {
        return "Stock-in quantity must be at least 1";
      }
      return null;
    }
    if (quantity < 1) {
      return "Quantity must be at least 1";
    }
    if (direction === "stock_in") {
      if (!source) {
        return "Please select a source";
      }
      const selectedSource = availableSources.find((s) => s.type === source);
      if (source === "outlet" && !selectedSource?.outletId) {
        return "Please select a source outlet";
      }
    } else {
      if (!destination) {
        return "Please select a destination";
      }
      if (selectedProduct && quantity > selectedProduct.currentStock) {
        return `Insufficient stock (available: ${selectedProduct.currentStock})`;
      }
      const selectedDestination = availableDestinations.find((d) => d.type === destination);
      if (destination === "outlet" && !selectedDestination?.outletId) {
        return "Please select a destination outlet";
      }
    }
    return null;
  };

  // Show confirmation dialog before submit
  const handleShowConfirm = useCallback(() => {
    const error = validate();
    if (error) {
      toast.error(error);
      return;
    }
    if (!selectedProduct) return;

    const price = selectedProduct.price ?? 0;

    // Price validation
    if (!price || price <= 0) {
      toast.error("Price not configured for this product at this outlet. Configure in Outlet Settings.");
      return;
    }

    if (mode === "rotation") {
      setConfirmData({
        outletName,
        productName: selectedProduct.productName,
        direction: "stock_out",
        qty: selectedProduct.currentStock,
        price,
        note: "rotation stock-out/stock-in",
        isRotation: true,
        rotationStockOutQty: selectedProduct.currentStock,
        rotationStockInQty,
      });
    } else {
      setConfirmData({
        outletName,
        productName: selectedProduct.productName,
        direction,
        qty: quantity,
        price,
        note: note.trim() || undefined,
      });
    }

    setConfirmOpen(true);
  }, [selectedProduct, mode, direction, quantity, rotationStockInQty, note, outletName, availableSources, availableDestinations, source, destination, selectableProducts, selectedProductId]);

  // Actual submit (after confirmation)
  const handleConfirmedSubmit = useCallback(async () => {
    if (!selectedProduct) return;
    setConfirmOpen(false);
    setLastError(null);
    setRetryFn(null);

    try {
      if (mode === "rotation") {
        // Step 1: Stock-out of current stock
        await onSubmit({
          direction: "stock_out",
          menuProductId: selectedProduct.menuProductId,
          externalProductCode: selectedProduct.externalProductCode,
          quantity: selectedProduct.currentStock,
          note: "rotation stock-out",
        });

        // Step 2: Stock-in of new quantity
        await onSubmit({
          direction: "stock_in",
          menuProductId: selectedProduct.menuProductId,
          externalProductCode: selectedProduct.externalProductCode,
          quantity: rotationStockInQty,
          source: "kitchen",
          note: "rotation stock-in",
        });

        toast.success("Rotation completed successfully");
      } else {
        const data: Parameters<typeof onSubmit>[0] = {
          direction,
          menuProductId: selectedProduct.menuProductId,
          externalProductCode: selectedProduct.externalProductCode,
          quantity,
          note: note.trim(),
        };

        if (direction === "stock_in") {
          data.source = source as "kitchen" | "goldfinch" | "outlet";
          const selectedSource = availableSources.find((s) => s.type === source);
          if (source === "outlet" && selectedSource?.outletId) {
            data.sourceOutletId = selectedSource.outletId;
          }
        } else {
          data.destination = destination as "office" | "goldfinch" | "outlet";
          const selectedDestination = availableDestinations.find((d) => d.type === destination);
          if (destination === "outlet" && selectedDestination?.outletId) {
            data.destinationOutletId = selectedDestination.outletId;
          }
        }

        await onSubmit(data);
        toast.success(`${direction === "stock_in" ? "Stock in" : "Stock out"} request submitted`);
      }

      // Reset form on success
      setQuantity(1);
      setSource("");
      setDestination("");
      setNote("");
      setMode("stock_in");
    } catch (error) {
      console.error("Stock flow error:", error);
      const errorMsg = error instanceof Error ? error.message : "Failed to submit stock request";
      setLastError(errorMsg);
      setRetryFn(() => handleShowConfirm);
      toast.error(errorMsg);
    }
  }, [selectedProduct, mode, direction, quantity, rotationStockInQty, note, source, destination, availableSources, availableDestinations, onSubmit, handleShowConfirm]);

  // Tab change handler
  const handleTabChange = (val: string) => {
    if (val === "stock_in" || val === "stock_out") {
      setMode(val);
    }
  };

  // Shared product selector
  const renderProductSelector = (idSuffix: string) => {
    if (selectableProducts.length > 1) {
      return (
        <div className="space-y-1.5">
          <Label htmlFor={`product-select-${idSuffix}`} className="text-xs text-gray-600">
            Product
          </Label>
          <Select value={selectedProductId} onValueChange={setSelectedProductId}>
            <SelectTrigger id={`product-select-${idSuffix}`} className="h-9 text-sm">
              <SelectValue placeholder="Select product" />
            </SelectTrigger>
            <SelectContent>
              {selectableProducts.map((p) => (
                <SelectItem key={p.menuProductId} value={p.menuProductId} className="text-sm">
                  {p.productName} {idSuffix === "out" ? `(Stock: ${p.currentStock})` : ""}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      );
    }

    if (selectableProducts.length === 1) {
      return (
        <div className="flex items-center justify-between">
          <div className="text-sm font-medium">{selectableProducts[0].productName}</div>
          {idSuffix === "out" && (
            <div className="text-xs text-gray-600 tabular-nums">
              Stock: {selectableProducts[0].currentStock}
            </div>
          )}
        </div>
      );
    }

    return null;
  };

  // Shared quantity controls
  const renderQuantityControls = (idSuffix: string, max?: number) => (
    <div className="space-y-1.5">
      <Label htmlFor={`quantity-${idSuffix}`} className="text-xs text-gray-600">
        Quantity
      </Label>
      <div className="flex items-center gap-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-9 w-9 p-0"
          onClick={() => setQuantity(Math.max(1, quantity - 1))}
          disabled={quantity <= 1 || isSubmitting}
        >
          <Minus className="h-3.5 w-3.5" />
        </Button>
        <Input
          id={`quantity-${idSuffix}`}
          type="number"
          min="1"
          max={max}
          value={quantity}
          onChange={(e) => setQuantity(Math.max(1, parseInt(e.target.value) || 1))}
          className="h-9 text-sm text-center tabular-nums flex-1"
          disabled={isSubmitting}
        />
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-9 w-9 p-0"
          onClick={() => setQuantity(quantity + 1)}
          disabled={isSubmitting}
        >
          <Plus className="h-3.5 w-3.5" />
        </Button>
      </div>
      {max !== undefined && quantity > max && (
        <p className="text-xs text-red-500">
          Exceeds available stock ({max})
        </p>
      )}
    </div>
  );

  // Shared note field
  const renderNoteField = (idSuffix: string) => (
    <div className="space-y-1.5">
      <Label htmlFor={`note-${idSuffix}`} className="text-xs text-gray-600">
        Note (optional)
      </Label>
      <Textarea
        id={`note-${idSuffix}`}
        value={note}
        onChange={(e) => setNote(e.target.value.slice(0, 200))}
        placeholder="Add a note..."
        className="text-sm resize-none h-16"
        maxLength={200}
        disabled={isSubmitting}
      />
      <div className="text-[10px] text-gray-400 text-right">{note.length}/200</div>
    </div>
  );

  // Error retry bar
  const renderErrorRetry = () => {
    if (!lastError) return null;
    return (
      <div className="flex items-center gap-2 p-2 bg-red-50 border border-red-200 rounded-md">
        <span className="text-xs text-red-700 flex-1">{lastError}</span>
        {retryFn && (
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-7 text-xs border-red-300 text-red-700 hover:bg-red-100"
            onClick={retryFn}
            disabled={isSubmitting}
          >
            Retry
          </Button>
        )}
      </div>
    );
  };

  return (
    <div className="border-t border-gray-100 bg-white">
      {/* Rotation Shortcut Button */}
      <div className="px-3 pt-3 pb-1">
        <Button
          type="button"
          variant={mode === "rotation" ? "default" : "outline"}
          size="sm"
          className={cn(
            "w-full gap-2 font-semibold",
            mode === "rotation"
              ? "bg-amber-500 hover:bg-amber-600 text-white"
              : "border-amber-300 text-amber-700 hover:bg-amber-50"
          )}
          onClick={() => setMode(mode === "rotation" ? "stock_in" : "rotation")}
          disabled={isSubmitting}
        >
          <RefreshCw className="h-3.5 w-3.5" />
          Rotate Stock
        </Button>
      </div>

      {/* Rotation Mode */}
      {mode === "rotation" && (
        <div className="p-3 space-y-3">
          {renderProductSelector("rot")}

          {selectedProduct && (
            <div className="rounded-lg bg-amber-50 border border-amber-200 p-3 space-y-2">
              <div className="text-xs font-semibold text-amber-800 uppercase">Rotation Summary</div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <div className="text-[10px] text-amber-600">Stock Out (current)</div>
                  <div className="text-lg font-bold text-amber-900 tabular-nums">
                    {selectedProduct.currentStock}
                  </div>
                </div>
                <div className="space-y-1">
                  <Label htmlFor="rotation-in-qty" className="text-[10px] text-amber-600">
                    Stock In (new)
                  </Label>
                  <Input
                    id="rotation-in-qty"
                    type="number"
                    min="1"
                    value={rotationStockInQty}
                    onChange={(e) => setRotationStockInQty(Math.max(1, parseInt(e.target.value) || 1))}
                    className="h-9 text-sm text-center tabular-nums"
                    disabled={isSubmitting}
                  />
                </div>
              </div>
              <div className="text-[10px] text-amber-600 italic">
                Auto-note: &quot;rotation stock-out/stock-in&quot;
              </div>
            </div>
          )}

          {renderErrorRetry()}

          <Button
            onClick={handleShowConfirm}
            disabled={isSubmitting || !selectedProductId}
            className="w-full h-10 bg-amber-500 hover:bg-amber-600 text-white font-semibold"
          >
            {isSubmitting ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Rotating...
              </>
            ) : (
              "Confirm Rotation"
            )}
          </Button>
        </div>
      )}

      {/* Standard Stock In / Stock Out Tabs */}
      {mode !== "rotation" && (
        <Tabs value={direction} onValueChange={handleTabChange}>
          {/* Tab Headers */}
          <TabsList className="w-full grid grid-cols-2 h-10 bg-gray-50/50">
            <TabsTrigger
              value="stock_in"
              className={cn(
                "text-xs font-semibold gap-1.5",
                direction === "stock_in" && "text-green-700 bg-green-50"
              )}
            >
              <ArrowDownToLine className="h-3.5 w-3.5" />
              Stock In
            </TabsTrigger>
            <TabsTrigger
              value="stock_out"
              className={cn(
                "text-xs font-semibold gap-1.5",
                direction === "stock_out" && "text-amber-700 bg-amber-50"
              )}
            >
              <ArrowUpFromLine className="h-3.5 w-3.5" />
              Stock Out
            </TabsTrigger>
          </TabsList>

          {/* Stock In Form */}
          <TabsContent value="stock_in" className="mt-0">
            <div className="p-3 space-y-3">
              {renderProductSelector("in")}
              {renderQuantityControls("in")}

              {/* Source Selector */}
              <div className="space-y-1.5">
                <Label className="text-xs text-gray-600">Source</Label>
                <RadioGroup value={source} onValueChange={setSource} disabled={isSubmitting}>
                  <div className="space-y-2">
                    {availableSources.map((src) => (
                      <div key={src.type} className="flex items-center space-x-2">
                        <RadioGroupItem value={src.type} id={`source-${src.type}`} />
                        <Label
                          htmlFor={`source-${src.type}`}
                          className="text-sm font-normal cursor-pointer flex-1"
                        >
                          {src.label}
                          <span className="ml-2 text-xs text-gray-500 tabular-nums">
                            ({src.available} available)
                          </span>
                        </Label>
                      </div>
                    ))}
                  </div>
                </RadioGroup>
              </div>

              {renderNoteField("in")}
              {renderErrorRetry()}

              <Button
                onClick={handleShowConfirm}
                disabled={isSubmitting || !selectedProductId || !source}
                className="w-full h-10 bg-green-600 hover:bg-green-700 text-white font-semibold"
              >
                {isSubmitting ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Submitting...
                  </>
                ) : (
                  "Submit Stock In"
                )}
              </Button>
            </div>
          </TabsContent>

          {/* Stock Out Form */}
          <TabsContent value="stock_out" className="mt-0">
            <div className="p-3 space-y-3">
              {renderProductSelector("out")}
              {renderQuantityControls("out", selectedProduct?.currentStock)}

              {/* Destination Selector */}
              <div className="space-y-1.5">
                <Label className="text-xs text-gray-600">Destination</Label>
                <RadioGroup value={destination} onValueChange={setDestination} disabled={isSubmitting}>
                  <div className="space-y-2">
                    {availableDestinations.map((dest) => (
                      <div key={dest.type} className="flex items-center space-x-2">
                        <RadioGroupItem value={dest.type} id={`dest-${dest.type}`} />
                        <Label
                          htmlFor={`dest-${dest.type}`}
                          className="text-sm font-normal cursor-pointer flex-1"
                        >
                          {dest.label}
                        </Label>
                      </div>
                    ))}
                  </div>
                </RadioGroup>
              </div>

              {renderNoteField("out")}
              {renderErrorRetry()}

              <Button
                onClick={handleShowConfirm}
                disabled={isSubmitting || !selectedProductId || !destination}
                className="w-full h-10 bg-amber-600 hover:bg-amber-700 text-white font-semibold"
              >
                {isSubmitting ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Submitting...
                  </>
                ) : (
                  "Submit Stock Out"
                )}
              </Button>
            </div>
          </TabsContent>
        </Tabs>
      )}

      {/* Confirmation Dialog */}
      {confirmData && (
        <StockFlowConfirmDialog
          open={confirmOpen}
          onConfirm={handleConfirmedSubmit}
          onCancel={() => setConfirmOpen(false)}
          data={confirmData}
        />
      )}
    </div>
  );
}
