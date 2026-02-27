/**
 * AddItemDialog - Dialog to select an internal menu product and add it to the GrabFood menu.
 * Filters out products already added. Allows overriding name, price, and description before adding.
 */
import { useState, useMemo } from "react";
import { Search } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import { formatCurrency } from "@/lib/utils";
import type { Id } from "../../../convex/_generated/dataModel";

interface MenuProduct {
  _id: Id<"menuProducts">;
  name: string;
  code?: string;
  defaultPrice: number;
}

interface AddItemDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  existingMenuProductIds: Set<string>;
  menuProducts: MenuProduct[] | undefined;
  onAdd: (data: {
    menuProductId: Id<"menuProducts">;
    grabfoodName: string;
    grabfoodPrice: number;
    grabfoodDescription?: string;
  }) => Promise<void>;
}

export function AddItemDialog({
  open,
  onOpenChange,
  existingMenuProductIds,
  menuProducts,
  onAdd,
}: AddItemDialogProps) {
  const [search, setSearch] = useState("");
  const [selectedProduct, setSelectedProduct] = useState<MenuProduct | null>(null);
  const [overrideName, setOverrideName] = useState("");
  const [overridePrice, setOverridePrice] = useState("");
  const [overrideDescription, setOverrideDescription] = useState("");
  const [isAdding, setIsAdding] = useState(false);

  // Filter products not already in the GrabFood menu
  const availableProducts = useMemo(() => {
    if (!menuProducts) return [];
    return menuProducts.filter(
      (p) => !existingMenuProductIds.has(p._id)
    );
  }, [menuProducts, existingMenuProductIds]);

  // Filter by search
  const filteredProducts = useMemo(() => {
    if (!search.trim()) return availableProducts;
    const q = search.toLowerCase();
    return availableProducts.filter(
      (p) =>
        p.name.toLowerCase().includes(q) ||
        (p.code && p.code.toLowerCase().includes(q))
    );
  }, [availableProducts, search]);

  const handleSelectProduct = (product: MenuProduct) => {
    setSelectedProduct(product);
    setOverrideName(product.name);
    setOverridePrice(String(product.defaultPrice));
    setOverrideDescription("");
  };

  const handleAdd = async () => {
    if (!selectedProduct) return;
    setIsAdding(true);
    try {
      await onAdd({
        menuProductId: selectedProduct._id,
        grabfoodName: overrideName.trim() || selectedProduct.name,
        grabfoodPrice: parseInt(overridePrice, 10) || selectedProduct.defaultPrice,
        grabfoodDescription: overrideDescription.trim() || undefined,
      });
      // Reset and close
      resetState();
      onOpenChange(false);
    } finally {
      setIsAdding(false);
    }
  };

  const resetState = () => {
    setSearch("");
    setSelectedProduct(null);
    setOverrideName("");
    setOverridePrice("");
    setOverrideDescription("");
  };

  const handleOpenChange = (isOpen: boolean) => {
    if (!isOpen) resetState();
    onOpenChange(isOpen);
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Add Item to GrabFood Menu</DialogTitle>
          <DialogDescription>
            Select a menu product to add to your GrabFood menu.
          </DialogDescription>
        </DialogHeader>

        {!selectedProduct ? (
          <div className="space-y-3">
            {/* Search */}
            <div className="relative">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search products..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-8"
              />
            </div>

            {/* Product list */}
            <ScrollArea className="h-64">
              {filteredProducts.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-8">
                  {availableProducts.length === 0
                    ? "All menu products are already added."
                    : "No products match your search."}
                </p>
              ) : (
                <div className="space-y-1">
                  {filteredProducts.map((product) => (
                    <button
                      key={product._id}
                      className="w-full text-left px-3 py-2 rounded-md hover:bg-accent transition-colors"
                      onClick={() => handleSelectProduct(product)}
                    >
                      <div className="flex justify-between items-center">
                        <div>
                          <p className="text-sm font-medium">{product.name}</p>
                          {product.code && (
                            <p className="text-xs text-muted-foreground">{product.code}</p>
                          )}
                        </div>
                        <span className="text-sm text-[var(--color-grabfood)] font-medium">
                          {formatCurrency(product.defaultPrice)}
                        </span>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </ScrollArea>
          </div>
        ) : (
          <div className="space-y-4">
            {/* Selected product info */}
            <div className="bg-muted rounded-md px-3 py-2">
              <p className="text-sm font-medium">{selectedProduct.name}</p>
              {selectedProduct.code && (
                <p className="text-xs text-muted-foreground">{selectedProduct.code}</p>
              )}
            </div>

            {/* Override fields */}
            <div className="space-y-3">
              <div>
                <Label htmlFor="gf-name" className="text-xs">GrabFood Name</Label>
                <Input
                  id="gf-name"
                  value={overrideName}
                  onChange={(e) => setOverrideName(e.target.value)}
                  className="mt-1"
                />
              </div>
              <div>
                <Label htmlFor="gf-price" className="text-xs">GrabFood Price (IDR)</Label>
                <Input
                  id="gf-price"
                  type="number"
                  value={overridePrice}
                  onChange={(e) => setOverridePrice(e.target.value)}
                  min={0}
                  className="mt-1"
                />
              </div>
              <div>
                <Label htmlFor="gf-desc" className="text-xs">Description (optional)</Label>
                <Input
                  id="gf-desc"
                  value={overrideDescription}
                  onChange={(e) => setOverrideDescription(e.target.value)}
                  placeholder="Add a description"
                  className="mt-1"
                />
              </div>
            </div>

            {/* Actions */}
            <div className="flex gap-2 justify-end">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setSelectedProduct(null)}
              >
                Back
              </Button>
              <Button
                size="sm"
                onClick={handleAdd}
                disabled={isAdding || !overrideName.trim()}
                className="bg-[var(--color-grabfood)] hover:bg-[var(--color-grabfood-accent)] text-white"
              >
                {isAdding ? "Adding..." : "Add to Menu"}
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
