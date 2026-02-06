import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useDocumentTitle } from '@/hooks/useDocumentTitle';
import { ArrowLeft, Plus, Pencil, Trash2, ArrowDown, ArrowUp, Lock, Boxes, Package } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ConfirmDialog } from '@/components/shared';
import { ProductForm } from '@/components/menuProducts/ProductForm';
import {
  useConvexPosProducts,
  useConvexLegacyProducts,
  useConvexDeleteMenuProduct,
  useConvexRemoveFromSlot,
  useConvexAssignToSlot,
  useConvexPackagingPosProducts,
  useConvexRemoveFromPackagingSlot,
  type PosProduct,
  type LegacyProduct,
  type PackagingPosProduct,
} from '@/hooks/convex/useMenuProducts';
import { formatCurrency, formatPercent } from '@/lib/utils';
import type { Id } from '../../convex/_generated/dataModel';
import { toast } from 'sonner';

export function MenuProductsManager() {
  useDocumentTitle('Product Manager');
  const navigate = useNavigate();

  // Convex hooks
  const { data: posProducts, isLoading: loadingPos } = useConvexPosProducts();
  const { data: legacyProducts, isLoading: loadingLegacy } = useConvexLegacyProducts();
  const { data: packagingPosProducts, isLoading: loadingPackagingPos } = useConvexPackagingPosProducts();
  const deleteMutation = useConvexDeleteMenuProduct();
  const removeFromSlotMutation = useConvexRemoveFromSlot();
  const assignSlotMutation = useConvexAssignToSlot();

  const removeFromPackagingSlotMutation = useConvexRemoveFromPackagingSlot();

  // Sheet state
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState<(PosProduct | LegacyProduct) | null>(null);
  const [prefilledSlot, setPrefilledSlot] = useState<number | null>(null);

  // Delete dialog
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);

  // Slot swap confirmation
  const [swapSlotData, setSwapSlotData] = useState<{
    productId: string;
    slot: number;
    currentProduct: PosProduct;
  } | null>(null);
  const [showSwapDialog, setShowSwapDialog] = useState(false);

  const isLoading = loadingPos || loadingLegacy || loadingPackagingPos;

  const handleNewProduct = () => {
    setEditingProduct(null);
    setPrefilledSlot(null);
    setIsFormOpen(true);
  };

  const handleNewProductForSlot = (slot: number) => {
    setEditingProduct(null);
    setPrefilledSlot(slot);
    setIsFormOpen(true);
  };

  const handleEdit = (product: PosProduct | LegacyProduct | PackagingPosProduct) => {
    setEditingProduct(product as PosProduct | LegacyProduct);
    setPrefilledSlot(null);
    setIsFormOpen(true);
  };

  const handleFormClose = () => {
    setIsFormOpen(false);
    setEditingProduct(null);
    setPrefilledSlot(null);
  };

  // Find first empty slot for legacy product assignment
  const getFirstEmptySlot = (): number | null => {
    const occupiedSlots = new Set(posProducts?.map((p) => p.posSlot) || []);
    for (const slot of [1, 2, 3, 4] as const) {
      if (!occupiedSlots.has(slot)) return slot;
    }
    return null;
  };

  const handleAssignToFirstEmptySlot = async (productId: string) => {
    const emptySlot = getFirstEmptySlot();
    if (!emptySlot) {
      toast.error('All POS slots are full. Remove a product first.');
      return;
    }
    try {
      await assignSlotMutation.mutateAsync({
        id: productId as Id<"menuProducts">,
        slot: emptySlot,
      });
      toast.success(`Product assigned to Slot ${emptySlot}`);
    } catch (error) {
      console.error('Failed to assign slot:', error);
    }
  };

  const handleRemoveFromPos = async (id: string) => {
    try {
      await removeFromSlotMutation.mutateAsync(id as Id<"menuProducts">);
    } catch (error) {
      // Error already handled by mutation with toast
      console.error('Failed to remove from POS:', error);
    }
  };

  const handleRemoveFromPackagingSlot = async (id: string) => {
    try {
      await removeFromPackagingSlotMutation.mutate(id as Id<"menuProducts">);
    } catch (error) {
      console.error('Failed to remove from packaging slot:', error);
    }
  };

  const handleDelete = async () => {
    if (deleteId !== null) {
      // Check if the product is fixed (cannot be deleted)
      const productToDelete = [...(posProducts || []), ...(legacyProducts || [])].find(
        (p) => p._id === deleteId
      );

      if (productToDelete?.isFixed) {
        toast.error('This product is marked as fixed and cannot be deleted');
        setShowDeleteDialog(false);
        setDeleteId(null);
        return;
      }

      try {
        await deleteMutation.mutateAsync(deleteId as Id<"menuProducts">);
        setShowDeleteDialog(false);
        setDeleteId(null);
      } catch (error) {
        // Error already handled by mutation with toast
        console.error('Failed to delete:', error);
      }
    }
  };

  const handleSwapConfirm = async () => {
    if (!swapSlotData) return;

    try {
      await assignSlotMutation.mutateAsync({
        id: swapSlotData.productId as Id<"menuProducts">,
        slot: swapSlotData.slot,
      });
      setShowSwapDialog(false);
      setSwapSlotData(null);
    } catch (error) {
      console.error('Failed to swap slot:', error);
    }
  };

  const calculateMargin = (price: number, cogs: number | undefined) => {
    if (!cogs || cogs === 0) return null;
    return ((price - cogs) / price) * 100;
  };

  const renderProductCard = (
    product: PosProduct | LegacyProduct,
    showPosActions: boolean,
    showAddToPos: boolean = false
  ) => {
    const margin = calculateMargin(product.defaultPrice, product.unitCost);
    const isPosProduct = 'posSlot' in product;
    const firstEmptySlot = getFirstEmptySlot();

    return (
      <Card key={product._id} className="relative hover:shadow-md transition-shadow">
        <CardContent className="pt-6">
          <div className="flex items-start justify-between gap-2 sm:gap-4">
            <div className="flex-1 min-w-0">
              {/* Header with name and slot badge */}
              <div className="flex items-start gap-2 mb-2 flex-wrap">
                <h3 className="font-semibold truncate flex-1 min-w-0 text-sm sm:text-base">
                  {product.name}
                </h3>
                <div className="flex gap-1 shrink-0">
                  {isPosProduct && (
                    <Badge variant="default" className="text-xs">
                      Slot {(product as PosProduct).posSlot}
                    </Badge>
                  )}
                  {product.productType === "packaging" && (
                    <Badge className="text-xs bg-blue-500">Packaging</Badge>
                  )}
                  {(!product.productType || product.productType === "food") && (
                    <Badge className="text-xs bg-green-500">Food</Badge>
                  )}
                  {product.isFixed && (
                    <Badge variant="secondary" className="text-xs flex items-center gap-1">
                      <Lock className="h-3 w-3" />
                      Fixed
                    </Badge>
                  )}
                </div>
              </div>

              {/* Code */}
              <p className="text-xs sm:text-sm text-muted-foreground mb-3 truncate">
                Code: {product.code}
              </p>

              {/* Stats Grid */}
              <div className="grid grid-cols-2 gap-2 sm:gap-3 text-xs sm:text-sm">
                <div>
                  <p className="text-muted-foreground">Weight</p>
                  <p className="font-medium">{product.grams}g</p>
                </div>
                <div>
                  <p className="text-muted-foreground">Price</p>
                  <p className="font-medium">{formatCurrency(product.defaultPrice)}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">COGS</p>
                  <p className="font-medium">{formatCurrency(product.unitCost ?? 0)}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">Margin</p>
                  <p className="font-medium">{margin ? formatPercent(margin) : '-'}</p>
                </div>
              </div>

              {/* BOM Summary */}
              {product.cachedProductionSummary && (
                <div className="mt-3 pt-3 border-t">
                  <p className="text-xs text-muted-foreground">
                    Production: {product.cachedProductionSummary}
                  </p>
                </div>
              )}
            </div>

            {/* Action Buttons */}
            <div className="flex flex-col gap-1 shrink-0">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => handleEdit(product)}
                className="text-primary hover:text-primary h-7 w-7 sm:h-8 sm:w-8 p-0"
                aria-label="Edit product"
              >
                <Pencil className="h-3 w-3 sm:h-4 sm:w-4" />
              </Button>
              {showPosActions && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => handleRemoveFromPos(product._id)}
                  className="text-orange-600 hover:text-orange-600 h-7 w-7 sm:h-8 sm:w-8 p-0"
                  title="Remove from POS"
                  aria-label="Remove from POS"
                >
                  <ArrowDown className="h-3 w-3 sm:h-4 sm:w-4" />
                </Button>
              )}
              {showAddToPos && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => handleAssignToFirstEmptySlot(product._id)}
                  className="text-green-600 hover:text-green-600 h-7 w-7 sm:h-8 sm:w-8 p-0"
                  title={firstEmptySlot ? `Add to Slot ${firstEmptySlot}` : 'All slots full'}
                  aria-label="Add to POS"
                  disabled={!firstEmptySlot}
                >
                  <ArrowUp className="h-3 w-3 sm:h-4 sm:w-4" />
                </Button>
              )}
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setDeleteId(product._id);
                  setShowDeleteDialog(true);
                }}
                className="text-destructive hover:text-destructive h-7 w-7 sm:h-8 sm:w-8 p-0"
                aria-label="Delete product"
                disabled={product.isFixed}
                title={product.isFixed ? 'Fixed products cannot be deleted' : 'Delete product'}
              >
                {product.isFixed ? (
                  <Lock className="h-3 w-3 sm:h-4 sm:w-4" />
                ) : (
                  <Trash2 className="h-3 w-3 sm:h-4 sm:w-4" />
                )}
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
    );
  };

  return (
    <div className="space-y-4 sm:space-y-6">
      {/* Page Header */}
      <div className="flex items-center gap-2 sm:gap-4 flex-wrap">
        <Button variant="ghost" size="sm" onClick={() => navigate(-1)} className="shrink-0">
          <ArrowLeft className="h-4 w-4 mr-1" />
          Back
        </Button>
        <div className="flex-1 min-w-0">
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">Product Manager</h1>
          <p className="text-sm sm:text-base text-muted-foreground">
            Manage POS menu, packaging products, and legacy products
          </p>
        </div>
        <Button
          variant="outline"
          onClick={() => navigate('/inventory')}
          className="shrink-0"
        >
          <Boxes className="h-4 w-4 mr-2" />
          <span className="hidden sm:inline">Inventory</span>
          <span className="sm:hidden">Inv</span>
        </Button>
        <Button onClick={handleNewProduct} className="shrink-0">
          <Plus className="h-4 w-4 mr-2" />
          <span className="hidden sm:inline">New Product</span>
          <span className="sm:hidden">New</span>
        </Button>
      </div>

      {isLoading ? (
        <div className="text-center py-12">
          <p className="text-muted-foreground">Loading products...</p>
        </div>
      ) : (
        <div className="space-y-6">
          {/* Food POS Menu Section (Slots 1-4) */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center justify-between">
                <span>Food POS (Slots 1-4)</span>
                <Badge variant="secondary">
                  {posProducts?.length || 0} / 4 slots
                </Badge>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
                {[1, 2, 3, 4].map((slotNumber) => {
                  const product = posProducts?.find((p) => p.posSlot === slotNumber);

                  if (product) {
                    return renderProductCard(product, true);
                  }

                  // Empty slot placeholder - clickable to create new product
                  return (
                    <Card
                      key={`empty-slot-${slotNumber}`}
                      className="border-dashed border-2 hover:border-primary/50 hover:bg-accent/50 transition-colors cursor-pointer"
                      onClick={() => handleNewProductForSlot(slotNumber)}
                    >
                      <CardContent className="pt-6">
                        <div className="flex flex-col items-center justify-center py-6 sm:py-8 text-center">
                          <div className="rounded-full bg-muted p-2 sm:p-3 mb-2 sm:mb-3">
                            <Plus className="h-5 w-5 sm:h-6 sm:w-6 text-muted-foreground" />
                          </div>
                          <Badge variant="outline" className="mb-2 text-xs">
                            Slot {slotNumber}
                          </Badge>
                          <p className="text-xs sm:text-sm text-muted-foreground">
                            Empty Slot
                          </p>
                          <p className="text-xs text-muted-foreground mt-1 hidden sm:block">
                            Click to create a product
                          </p>
                        </div>
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            </CardContent>
          </Card>

          {/* Packaging POS Section (Slots 1-4) */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center justify-between">
                <span>Packaging POS (Slots 1-4)</span>
                <Badge variant="secondary">
                  {packagingPosProducts?.length || 0} / 4 slots
                </Badge>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
                {[1, 2, 3, 4].map((slotNumber) => {
                  const product = packagingPosProducts?.find((p) => p.packagingPosSlot === slotNumber);

                  if (product) {
                    return (
                      <Card key={product._id} className="relative hover:shadow-md transition-shadow">
                        <CardContent className="pt-6">
                          <div className="flex items-start justify-between gap-2 sm:gap-4">
                            <div className="flex-1 min-w-0">
                              {/* Header with name and slot badge */}
                              <div className="flex items-start gap-2 mb-2 flex-wrap">
                                <h3 className="font-semibold truncate flex-1 min-w-0 text-sm sm:text-base">
                                  {product.name}
                                </h3>
                                <div className="flex gap-1 shrink-0">
                                  <Badge variant="default" className="text-xs">
                                    Slot {product.packagingPosSlot}
                                  </Badge>
                                  <Badge className="text-xs bg-blue-500">Packaging</Badge>
                                </div>
                              </div>

                              {/* Code */}
                              <p className="text-xs sm:text-sm text-muted-foreground mb-3 truncate">
                                Code: {product.code}
                              </p>

                              {/* Stats Grid */}
                              <div className="grid grid-cols-2 gap-2 sm:gap-3 text-xs sm:text-sm">
                                <div>
                                  <p className="text-muted-foreground">Price</p>
                                  <p className="font-medium">{formatCurrency(product.defaultPrice)}</p>
                                </div>
                                <div>
                                  <p className="text-muted-foreground">COGS</p>
                                  <p className="font-medium">{formatCurrency(product.unitCost ?? 0)}</p>
                                </div>
                              </div>
                            </div>

                            {/* Action Buttons */}
                            <div className="flex flex-col gap-1 shrink-0">
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => handleEdit(product)}
                                className="text-primary hover:text-primary h-7 w-7 sm:h-8 sm:w-8 p-0"
                                aria-label="Edit product"
                              >
                                <Pencil className="h-3 w-3 sm:h-4 sm:w-4" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => handleRemoveFromPackagingSlot(product._id)}
                                className="text-orange-600 hover:text-orange-600 h-7 w-7 sm:h-8 sm:w-8 p-0"
                                title="Remove from Packaging POS"
                                aria-label="Remove from Packaging POS"
                              >
                                <ArrowDown className="h-3 w-3 sm:h-4 sm:w-4" />
                              </Button>
                            </div>
                          </div>
                        </CardContent>
                      </Card>
                    );
                  }

                  // Empty slot placeholder
                  return (
                    <Card
                      key={`empty-packaging-slot-${slotNumber}`}
                      className="border-dashed border-2 hover:border-primary/50 hover:bg-accent/50 transition-colors"
                    >
                      <CardContent className="pt-6">
                        <div className="flex flex-col items-center justify-center py-6 sm:py-8 text-center">
                          <div className="rounded-full bg-muted p-2 sm:p-3 mb-2 sm:mb-3">
                            <Package className="h-5 w-5 sm:h-6 sm:w-6 text-muted-foreground" />
                          </div>
                          <Badge variant="outline" className="mb-2 text-xs">
                            Slot {slotNumber}
                          </Badge>
                          <p className="text-xs sm:text-sm text-muted-foreground">
                            Empty Slot
                          </p>
                          <p className="text-xs text-muted-foreground mt-1 hidden sm:block">
                            Assign packaging product
                          </p>
                        </div>
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            </CardContent>
          </Card>

          {/* Legacy Products Section */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center justify-between">
                <span>Legacy Products</span>
                <Badge variant="secondary">
                  {legacyProducts?.length || 0} products
                </Badge>
              </CardTitle>
            </CardHeader>
            <CardContent>
              {!legacyProducts || legacyProducts.length === 0 ? (
                <div className="text-center py-8">
                  <p className="text-muted-foreground">
                    No legacy products
                  </p>
                  <p className="text-sm text-muted-foreground mt-1">
                    Products removed from POS will appear here
                  </p>
                </div>
              ) : (
                <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                  {legacyProducts.map((product) => renderProductCard(product, false, true))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      )}

      {/* Product Form Sheet */}
      <ProductForm
        open={isFormOpen}
        onOpenChange={handleFormClose}
        product={editingProduct}
        prefilledSlot={prefilledSlot}
        onSlotSwapRequested={(data) => {
          setSwapSlotData(data);
          setShowSwapDialog(true);
        }}
      />

      {/* Delete Confirmation Dialog */}
      <ConfirmDialog
        open={showDeleteDialog}
        onOpenChange={setShowDeleteDialog}
        onConfirm={handleDelete}
        title="Delete Product"
        description="Are you sure you want to delete this menu product? This action cannot be undone."
        variant="destructive"
      />

      {/* Slot Swap Confirmation Dialog */}
      <ConfirmDialog
        open={showSwapDialog}
        onOpenChange={setShowSwapDialog}
        onConfirm={handleSwapConfirm}
        title="Swap POS Slot"
        description={
          swapSlotData
            ? `Slot ${swapSlotData.slot} is currently occupied by "${swapSlotData.currentProduct.name}". Do you want to swap it with the selected product? The current product will be moved to legacy.`
            : ''
        }
        confirmLabel="Swap"
        variant="default"
      />
    </div>
  );
}
