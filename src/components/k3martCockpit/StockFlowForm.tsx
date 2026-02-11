/**
 * StockFlowForm - Unified stock-in/out form for K3 Mart Cockpit
 *
 * A compact inline form for submitting stock-in or stock-out requests to the K3 Mart API.
 * Uses tabs to switch between stock-in and stock-out modes.
 *
 * Features:
 * - Tab-based mode switching (stock in/out)
 * - Product selection (if multiple products)
 * - Quantity controls with +/- buttons
 * - Source selector for stock-in (Kitchen/Goldfinch/Outlet)
 * - Destination selector for stock-out (Office/Goldfinch/Outlet)
 * - Optional notes field
 * - Validation (quantity > 0, stock availability)
 */

import { useState, useEffect } from "react";
import { ArrowDownToLine, ArrowUpFromLine, Loader2, Plus, Minus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

interface StockFlowFormProps {
  outletId: string;
  outletName: string;
  products: Array<{
    menuProductId: string;
    externalProductCode: string;
    productName: string;
    currentStock: number;
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

export function StockFlowForm({
  outletId: _outletId,
  outletName: _outletName,
  products,
  availableSources,
  availableDestinations,
  onSubmit,
  isSubmitting = false,
}: StockFlowFormProps) {
  // Filter out products with empty menuProductId (prevents Select crash)
  const selectableProducts = products.filter(p => p.menuProductId);

  // Form state
  const [direction, setDirection] = useState<"stock_in" | "stock_out">("stock_in");
  const [selectedProductId, setSelectedProductId] = useState<string>(
    selectableProducts.length === 1 ? selectableProducts[0].menuProductId : (selectableProducts[0]?.menuProductId ?? "")
  );
  const [quantity, setQuantity] = useState<number>(1);
  const [source, setSource] = useState<string>("");
  const [destination, setDestination] = useState<string>("");
  const [note, setNote] = useState<string>("");

  // Get selected product (search in original products list for stock info)
  const selectedProduct = products.find((p) => p.menuProductId === selectedProductId);

  // Reset source/destination when switching directions
  useEffect(() => {
    setSource("");
    setDestination("");
  }, [direction]);

  // Validation
  const validate = (): string | null => {
    if (!selectedProductId) {
      return "Please select a product";
    }
    if (quantity < 1) {
      return "Quantity must be at least 1";
    }
    if (direction === "stock_in") {
      if (!source) {
        return "Please select a source";
      }
      // Check if source is outlet and no outlet selected
      const selectedSource = availableSources.find((s) => s.type === source);
      if (source === "outlet" && !selectedSource?.outletId) {
        return "Please select a source outlet";
      }
    } else {
      if (!destination) {
        return "Please select a destination";
      }
      // Check if stock-out quantity exceeds current stock
      if (selectedProduct && quantity > selectedProduct.currentStock) {
        return `Insufficient stock (available: ${selectedProduct.currentStock})`;
      }
      // Check if destination is outlet and no outlet selected
      const selectedDestination = availableDestinations.find((d) => d.type === destination);
      if (destination === "outlet" && !selectedDestination?.outletId) {
        return "Please select a destination outlet";
      }
    }
    return null;
  };

  // Handle submit
  const handleSubmit = async () => {
    const error = validate();
    if (error) {
      toast.error(error);
      return;
    }

    if (!selectedProduct) return;

    try {
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

      // Reset form on success
      setQuantity(1);
      setSource("");
      setDestination("");
      setNote("");
      toast.success(`${direction === "stock_in" ? "Stock in" : "Stock out"} request submitted`);
    } catch (error) {
      console.error("Stock flow error:", error);
      toast.error("Failed to submit stock request");
    }
  };

  return (
    <div className="border-t border-gray-100 bg-white">
      <Tabs value={direction} onValueChange={(val) => setDirection(val as "stock_in" | "stock_out")}>
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
            {/* Product Selector (if multiple) */}
            {selectableProducts.length > 1 && (
              <div className="space-y-1.5">
                <Label htmlFor="product-select" className="text-xs text-gray-600">
                  Product
                </Label>
                <Select value={selectedProductId} onValueChange={setSelectedProductId}>
                  <SelectTrigger id="product-select" className="h-9 text-sm">
                    <SelectValue placeholder="Select product" />
                  </SelectTrigger>
                  <SelectContent>
                    {selectableProducts.map((p) => (
                      <SelectItem key={p.menuProductId} value={p.menuProductId} className="text-sm">
                        {p.productName}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            {/* Product Display (if single product) */}
            {selectableProducts.length === 1 && (
              <div className="text-sm font-medium">{selectableProducts[0].productName}</div>
            )}

            {/* Quantity Controls */}
            <div className="space-y-1.5">
              <Label htmlFor="quantity" className="text-xs text-gray-600">
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
                  id="quantity"
                  type="number"
                  min="1"
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
            </div>

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

            {/* Note */}
            <div className="space-y-1.5">
              <Label htmlFor="note-in" className="text-xs text-gray-600">
                Note (optional)
              </Label>
              <Textarea
                id="note-in"
                value={note}
                onChange={(e) => setNote(e.target.value.slice(0, 200))}
                placeholder="Add a note..."
                className="text-sm resize-none h-16"
                maxLength={200}
                disabled={isSubmitting}
              />
              <div className="text-[10px] text-gray-400 text-right">{note.length}/200</div>
            </div>

            {/* Submit Button */}
            <Button
              onClick={handleSubmit}
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
            {/* Product Selector (if multiple) */}
            {selectableProducts.length > 1 && (
              <div className="space-y-1.5">
                <Label htmlFor="product-select-out" className="text-xs text-gray-600">
                  Product
                </Label>
                <Select value={selectedProductId} onValueChange={setSelectedProductId}>
                  <SelectTrigger id="product-select-out" className="h-9 text-sm">
                    <SelectValue placeholder="Select product" />
                  </SelectTrigger>
                  <SelectContent>
                    {selectableProducts.map((p) => (
                      <SelectItem key={p.menuProductId} value={p.menuProductId} className="text-sm">
                        {p.productName} (Stock: {p.currentStock})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            {/* Product Display (if single product) */}
            {selectableProducts.length === 1 && (
              <div className="flex items-center justify-between">
                <div className="text-sm font-medium">{selectableProducts[0].productName}</div>
                <div className="text-xs text-gray-600 tabular-nums">
                  Stock: {selectableProducts[0].currentStock}
                </div>
              </div>
            )}

            {/* Quantity Controls */}
            <div className="space-y-1.5">
              <Label htmlFor="quantity-out" className="text-xs text-gray-600">
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
                  id="quantity-out"
                  type="number"
                  min="1"
                  max={selectedProduct?.currentStock}
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
              {selectedProduct && quantity > selectedProduct.currentStock && (
                <p className="text-xs text-red-500">
                  Exceeds available stock ({selectedProduct.currentStock})
                </p>
              )}
            </div>

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

            {/* Note */}
            <div className="space-y-1.5">
              <Label htmlFor="note-out" className="text-xs text-gray-600">
                Note (optional)
              </Label>
              <Textarea
                id="note-out"
                value={note}
                onChange={(e) => setNote(e.target.value.slice(0, 200))}
                placeholder="Add a note..."
                className="text-sm resize-none h-16"
                maxLength={200}
                disabled={isSubmitting}
              />
              <div className="text-[10px] text-gray-400 text-right">{note.length}/200</div>
            </div>

            {/* Submit Button */}
            <Button
              onClick={handleSubmit}
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
    </div>
  );
}
