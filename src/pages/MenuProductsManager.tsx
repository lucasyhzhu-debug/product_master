import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useDocumentTitle } from '@/hooks/useDocumentTitle';
import { Plus, Pencil, Trash2, ArrowDown, ArrowUp, Boxes, Package, RefreshCw, Pin } from 'lucide-react';
import { PageHeader } from '@/components/layout';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ConfirmDialog } from '@/components/shared';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { useAuth } from '@/contexts/AuthContext';
import { ProductForm } from '@/components/menuProducts/ProductForm';
import { DndContext, DragOverlay, PointerSensor, TouchSensor, useSensor, useSensors, closestCenter, type DragStartEvent, type DragEndEvent } from '@dnd-kit/core';
import { SortableContext, arrayMove, rectSortingStrategy } from '@dnd-kit/sortable';
import { POSPreviewPanel } from '@/components/menuProducts/POSPreviewPanel';
import { DraggableProductCard } from '@/components/menuProducts/DraggableProductCard';
import { SortableProductCard } from '@/components/menuProducts/SortableProductCard';
import { DroppableSlotZone } from '@/components/menuProducts/DroppableSlotZone';
import { DragOverlayCard } from '@/components/menuProducts/DragOverlayCard';
import {
  usePosProducts,
  useAvailableProducts,
  useDeleteMenuProduct,
  useRemoveFromSlot,
  useAssignToSlot,
  usePackagingPosProducts,
  useRemoveFromPackagingSlot,
  useAssignToPackagingSlot,
  useReorderSlots,
  useReorderPackagingSlots,
  useRecalculateAllCosts,
  useUpdateMenuProduct,
  type PosProduct,
  type AvailableProduct,
  type PackagingPosProduct,
  type RecalcResult,
} from '@/hooks/convex/useMenuProducts';
import { formatCurrency, formatPercent } from '@/lib/utils';
import type { Id } from '../../convex/_generated/dataModel';
import { toast } from 'sonner';

export function MenuProductsManager() {
  useDocumentTitle('Product Manager');
  const navigate = useNavigate();
  const { hasRole } = useAuth();
  const isAdmin = hasRole('admin');

  // Convex hooks
  const { data: posProducts, isLoading: loadingPos } = usePosProducts();
  const { data: availableProducts, isLoading: loadingAvailable } = useAvailableProducts();
  const { data: packagingPosProducts, isLoading: loadingPackagingPos } = usePackagingPosProducts();
  const deleteMutation = useDeleteMenuProduct();
  const removeFromSlotMutation = useRemoveFromSlot();
  const assignSlotMutation = useAssignToSlot();
  const removeFromPackagingSlotMutation = useRemoveFromPackagingSlot();
  const assignPackagingSlotMutation = useAssignToPackagingSlot();
  const reorderSlotsMutation = useReorderSlots();
  const reorderPackagingSlotsMutation = useReorderPackagingSlots();
  const recalcAllCosts = useRecalculateAllCosts();

  // DnD state
  const [activeProduct, setActiveProduct] = useState<PosProduct | AvailableProduct | PackagingPosProduct | null>(null);

  // Sheet state
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState<(PosProduct | AvailableProduct) | null>(null);
  const [prefilledSlot, setPrefilledSlot] = useState<number | null>(null);
  const [prefilledProductType, setPrefilledProductType] = useState<'food' | 'packaging' | null>(null);

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

  // Recalculate All Costs state
  const [recalcResults, setRecalcResults] = useState<RecalcResult[] | null>(null);
  const [isRecalculating, setIsRecalculating] = useState(false);

  // Phase 70 DA-03: Inline COGS override editing
  const updateMenuProduct = useUpdateMenuProduct();
  const [editingCogsId, setEditingCogsId] = useState<string | null>(null);
  const [cogsInputValue, setCogsInputValue] = useState('');

  const isLoading = loadingPos || loadingAvailable || loadingPackagingPos;

  // DnD sensors
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 250, tolerance: 5 } })
  );

  const handleNewProduct = () => {
    setEditingProduct(null);
    setPrefilledSlot(null);
    setPrefilledProductType(null);
    setIsFormOpen(true);
  };

  const handleNewProductForSlot = (slot: number, type: 'food' | 'packaging' = 'food') => {
    setEditingProduct(null);
    setPrefilledSlot(slot);
    setPrefilledProductType(type);
    setIsFormOpen(true);
  };

  const handleEdit = (product: PosProduct | AvailableProduct | PackagingPosProduct) => {
    setEditingProduct(product as PosProduct | AvailableProduct);
    setPrefilledSlot(null);
    setPrefilledProductType(null);
    setIsFormOpen(true);
  };

  const handleFormClose = () => {
    setIsFormOpen(false);
    setEditingProduct(null);
    setPrefilledSlot(null);
    setPrefilledProductType(null);
  };

  // Find the next available slot number (1-based, first gap or max+1)
  const getNextAvailableSlot = (type: 'food' | 'packaging'): number => {
    const occupiedSlots = type === 'food'
      ? new Set(posProducts?.map((p) => p.posSlot) || [])
      : new Set(packagingPosProducts?.map((p) => p.packagingPosSlot) || []);
    // Find first gap starting from 1
    let slot = 1;
    while (occupiedSlots.has(slot)) slot++;
    return slot;
  };

  const handleAssignToNextSlot = async (productId: string, type: 'food' | 'packaging') => {
    const nextSlot = getNextAvailableSlot(type);
    try {
      if (type === 'packaging') {
        await assignPackagingSlotMutation.mutateAsync({
          id: productId as Id<"menuProducts">,
          slot: nextSlot,
        });
      } else {
        await assignSlotMutation.mutateAsync({
          id: productId as Id<"menuProducts">,
          slot: nextSlot,
        });
      }
    } catch (error) {
      console.error('Failed to assign slot:', error);
    }
  };

  const handleRemoveFromPos = async (id: string) => {
    try {
      await removeFromSlotMutation.mutateAsync(id as Id<"menuProducts">);
    } catch (error) {
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
      const productToDelete = [...(posProducts || []), ...(availableProducts || [])].find(
        (p) => p._id === deleteId
      );

      if (productToDelete && (('posSlot' in productToDelete && productToDelete.posSlot !== undefined) || ('packagingPosSlot' in productToDelete && productToDelete.packagingPosSlot !== undefined))) {
        toast.error('This product has a POS slot assigned and cannot be deleted. Remove the POS slot first.');
        setShowDeleteDialog(false);
        setDeleteId(null);
        return;
      }

      try {
        await deleteMutation.mutateAsync(deleteId as Id<"menuProducts">);
        setShowDeleteDialog(false);
        setDeleteId(null);
      } catch (error) {
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

  const handleRecalculateAll = async () => {
    setIsRecalculating(true);
    try {
      const results = await recalcAllCosts.recalculate();
      setRecalcResults(results);
    } catch (error) {
      toast.error('Failed to recalculate costs');
      console.error('Recalculate all costs failed:', error);
    } finally {
      setIsRecalculating(false);
    }
  };

  // DnD handlers
  const handleDragStart = (event: DragStartEvent) => {
    const { product } = event.active.data.current ?? {};
    setActiveProduct(product ?? null);
  };

  const handleDragCancel = () => {
    setActiveProduct(null);
  };

  const handleDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event;
    setActiveProduct(null);

    if (!over || !active.data.current) return;

    const { product, section: sourceSection } = active.data.current;
    const overData = over.data.current ?? {};
    const overId = String(over.id);

    const isPackaging = product.productType === 'packaging';

    // No-op: available → available
    if (sourceSection === 'available' && (overId === 'available-zone' || overData.section === 'available')) return;
    // No-op: same item
    if (String(active.id) === overId) return;

    try {
      // === Drop on available zone = remove from POS ===
      if (overId === 'available-zone') {
        if (sourceSection === 'food-pos') {
          await removeFromSlotMutation.mutateAsync(product._id as Id<"menuProducts">);
          // Reorder remaining food products to compact slots
          const remaining = posProducts?.filter(p => p._id !== product._id) ?? [];
          if (remaining.length > 0) {
            await reorderSlotsMutation.mutate(
              remaining.map(p => p._id as Id<"menuProducts">)
            );
          }
        } else if (sourceSection === 'packaging-pos') {
          await removeFromPackagingSlotMutation.mutate(product._id as Id<"menuProducts">);
          // Reorder remaining packaging products to compact slots
          const remaining = packagingPosProducts?.filter(p => p._id !== product._id) ?? [];
          if (remaining.length > 0) {
            await reorderPackagingSlotsMutation.mutate(
              remaining.map(p => p._id as Id<"menuProducts">)
            );
          }
        }
        return;
      }

      // === Reorder within food POS (sortable) ===
      if (sourceSection === 'food-pos' && overData.section === 'food-pos' && posProducts) {
        const oldIndex = posProducts.findIndex(p => p._id === product._id);
        const newIndex = posProducts.findIndex(p => p._id === overId);
        if (oldIndex !== -1 && newIndex !== -1 && oldIndex !== newIndex) {
          const newOrder = arrayMove(posProducts, oldIndex, newIndex);
          await reorderSlotsMutation.mutate(
            newOrder.map(p => p._id as Id<"menuProducts">)
          );
        }
        return;
      }

      // === Reorder within packaging POS (sortable) ===
      if (sourceSection === 'packaging-pos' && overData.section === 'packaging-pos' && packagingPosProducts) {
        const oldIndex = packagingPosProducts.findIndex(p => p._id === product._id);
        const newIndex = packagingPosProducts.findIndex(p => p._id === overId);
        if (oldIndex !== -1 && newIndex !== -1 && oldIndex !== newIndex) {
          const newOrder = arrayMove(packagingPosProducts, oldIndex, newIndex);
          await reorderPackagingSlotsMutation.mutate(
            newOrder.map(p => p._id as Id<"menuProducts">)
          );
        }
        return;
      }

      // === Available → Food POS (insert at position) ===
      if (sourceSection === 'available' && !isPackaging) {
        // Determine if dropping on an existing food POS item or the empty slot zone
        const overSection = overData.section;
        const overSlotType = overData.slotType;

        if (overSection === 'food-pos' || overSlotType === 'food') {
          // Insert at the position of the over item
          const currentIds = posProducts?.map(p => p._id as Id<"menuProducts">) ?? [];
          const overIndex = posProducts?.findIndex(p => p._id === overId) ?? -1;
          const insertIndex = overIndex === -1 ? currentIds.length : overIndex;

          currentIds.splice(insertIndex, 0, product._id as Id<"menuProducts">);
          await reorderSlotsMutation.mutate(currentIds);
        }
        return;
      }

      // === Available → Packaging POS (insert at position) ===
      if (sourceSection === 'available' && isPackaging) {
        const overSection = overData.section;
        const overSlotType = overData.slotType;

        if (overSection === 'packaging-pos' || overSlotType === 'packaging') {
          const currentIds = packagingPosProducts?.map(p => p._id as Id<"menuProducts">) ?? [];
          const overIndex = packagingPosProducts?.findIndex(p => p._id === overId) ?? -1;
          const insertIndex = overIndex === -1 ? currentIds.length : overIndex;

          currentIds.splice(insertIndex, 0, product._id as Id<"menuProducts">);
          await reorderPackagingSlotsMutation.mutate(currentIds);
        }
        return;
      }

      // Cross-type prevention
      if (!isPackaging && overData.slotType === 'packaging') {
        toast.error('Food products cannot be assigned to packaging slots');
        return;
      }
      if (isPackaging && overData.slotType === 'food') {
        toast.error('Packaging products cannot be assigned to food slots');
        return;
      }
    } catch (error) {
      console.error('Drag-drop operation failed:', error);
    }
  };

  const calculateMargin = (price: number, cogs: number | undefined) => {
    if (!cogs || cogs === 0) return null;
    return ((price - cogs) / price) * 100;
  };

  // Phase 70 DA-03: Inline COGS override handlers
  const handleCogsOverrideSave = async (productId: string) => {
    if (editingCogsId !== productId) return; // Guard: already saved or cancelled (prevents onBlur double-fire)
    const trimmed = cogsInputValue.trim();
    setEditingCogsId(null); // Close input immediately before async work
    setCogsInputValue('');
    try {
      if (trimmed === '') {
        // Clear override -- revert to BOM
        await updateMenuProduct.mutateAsync({
          id: productId as Id<"menuProducts">,
          updates: { clearCogsOverride: true },
        });
        toast.success("COGS override cleared \u2014 using BOM");
      } else {
        const value = Number(trimmed);
        if (isNaN(value) || value < 0) {
          toast.error("COGS must be zero or a positive number");
          return;
        }
        await updateMenuProduct.mutateAsync({
          id: productId as Id<"menuProducts">,
          updates: { cogsOverrideIdr: value },
        });
        toast.success("COGS override saved");
      }
    } catch {
      // useUpdateMenuProduct already shows toast on error
    }
  };

  const handleCogsKeyDown = (e: React.KeyboardEvent, productId: string) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleCogsOverrideSave(productId);
    } else if (e.key === 'Escape') {
      setEditingCogsId(null);
      setCogsInputValue('');
    }
  };

  const startCogsEdit = (product: PosProduct | AvailableProduct) => {
    setEditingCogsId(product._id as string);
    setCogsInputValue(
      product.cogsOverrideIdr != null
        ? String(product.cogsOverrideIdr)
        : ''
    );
  };

  const renderProductCard = (
    product: PosProduct | AvailableProduct | PackagingPosProduct,
    showPosActions: boolean,
    showAddToPos: boolean = false,
    showDelete: boolean = true
  ) => {
    const effectiveCogs = (product as PosProduct | AvailableProduct).cogsOverrideIdr != null
      ? (product as PosProduct | AvailableProduct).cogsOverrideIdr
      : product.unitCost;
    const margin = calculateMargin(product.defaultPrice, effectiveCogs);
    const isPosProduct = 'posSlot' in product;
    const isPackagingPosProduct = 'packagingPosSlot' in product;
    const isFood = !product.productType || product.productType === 'food';

    return (
      <Card key={product._id} className="relative hover:shadow-md transition-shadow">
        <CardContent className="pt-6">
          <div className="flex items-start justify-between gap-2 sm:gap-4">
            <div className="flex-1 min-w-0">
              {/* Header with name and slot badge */}
              <div className="mb-2">
                <h3 className="font-semibold truncate text-sm sm:text-base text-foreground mb-1">
                  {product.name}
                </h3>
                <div className="flex gap-1 flex-wrap">
                  {isPosProduct && (
                    <Badge variant="default" className="text-xs">
                      Slot {(product as PosProduct).posSlot}
                    </Badge>
                  )}
                  {isPackagingPosProduct && (
                    <Badge variant="default" className="text-xs">
                      Slot {(product as PackagingPosProduct).packagingPosSlot}
                    </Badge>
                  )}
                  {product.productType === "packaging" && (
                    <Badge className="text-xs bg-[var(--color-status-info)] text-white">Packaging</Badge>
                  )}
                  {isFood && (
                    <Badge className="text-xs bg-[var(--color-status-success)] text-white">Food</Badge>
                  )}
                  {(('posSlot' in product && product.posSlot !== undefined) || ('packagingPosSlot' in product && product.packagingPosSlot !== undefined)) && (
                    <Badge variant="secondary" className="text-xs flex items-center gap-1">
                      <Pin className="h-3 w-3" />
                      POS
                    </Badge>
                  )}
                </div>
              </div>

              {/* Stats Grid */}
              <div className="grid grid-cols-2 gap-2 sm:gap-3 text-xs sm:text-sm">
                {isFood && 'grams' in product && (
                  <div>
                    <p className="text-muted-foreground">Weight</p>
                    <p className="font-medium">{product.grams}g</p>
                  </div>
                )}
                <div>
                  <p className="text-muted-foreground">Price</p>
                  <p className="font-medium">{formatCurrency(product.defaultPrice)}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">COGS</p>
                  {editingCogsId === (product._id as string) ? (
                    <input
                      type="number"
                      min={0}
                      step={1}
                      className="w-full rounded border border-input bg-background px-2 py-0.5 text-sm font-medium focus:outline-none focus:ring-1 focus:ring-ring"
                      value={cogsInputValue}
                      onChange={(e) => setCogsInputValue(e.target.value)}
                      onBlur={() => handleCogsOverrideSave(product._id as string)}
                      onKeyDown={(e) => handleCogsKeyDown(e, product._id as string)}
                      placeholder="Auto (BOM)"
                      autoFocus
                    />
                  ) : (
                    <p
                      className="font-medium flex items-center gap-1 cursor-pointer hover:text-primary"
                      onClick={() => startCogsEdit(product as PosProduct | AvailableProduct)}
                      title="Click to set COGS override"
                    >
                      {(product as PosProduct | AvailableProduct).cogsOverrideIdr != null
                        ? formatCurrency((product as PosProduct | AvailableProduct).cogsOverrideIdr!)
                        : formatCurrency(product.unitCost ?? 0)
                      }
                      {(product as PosProduct | AvailableProduct).cogsOverrideIdr != null && (
                        <Badge
                          variant="secondary"
                          className="text-[10px] bg-amber-50 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300"
                        >
                          Override
                        </Badge>
                      )}
                      {(product as PosProduct | AvailableProduct).cogsOverrideIdr == null && product.unitCostStaleAt && (
                        <span title="Cost recalculation in progress">
                          <RefreshCw className="h-3 w-3 text-amber-500 animate-spin" />
                        </span>
                      )}
                    </p>
                  )}
                </div>
                <div>
                  <p className="text-muted-foreground">Margin</p>
                  <p className="font-medium">{margin ? formatPercent(margin) : '-'}</p>
                </div>
              </div>

              {/* BOM Summary */}
              {'cachedProductionSummary' in product && product.cachedProductionSummary && (
                <div className="mt-3 pt-3 border-t">
                  <p className="text-xs text-muted-foreground">
                    {product.cachedProductionSummary}
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
              {showPosActions && isPosProduct && (
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
              {showPosActions && isPackagingPosProduct && (
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
              )}
              {showAddToPos && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => handleAssignToNextSlot(product._id, isFood ? 'food' : 'packaging')}
                  className="text-[var(--color-status-success)] hover:text-[var(--color-status-success)] h-7 w-7 sm:h-8 sm:w-8 p-0"
                  title={`Add to ${isFood ? 'Food' : 'Packaging'} POS`}
                  aria-label="Add to POS"
                >
                  <ArrowUp className="h-3 w-3 sm:h-4 sm:w-4" />
                </Button>
              )}
              {showDelete && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setDeleteId(product._id);
                    setShowDeleteDialog(true);
                  }}
                  className="text-destructive hover:text-destructive h-7 w-7 sm:h-8 sm:w-8 p-0"
                  aria-label="Delete product"
                  disabled={('posSlot' in product && product.posSlot !== undefined) || ('packagingPosSlot' in product && product.packagingPosSlot !== undefined)}
                  title={('posSlot' in product && product.posSlot !== undefined) || ('packagingPosSlot' in product && product.packagingPosSlot !== undefined) ? 'POS-assigned products cannot be deleted' : 'Delete product'}
                >
                  {('posSlot' in product && product.posSlot !== undefined) || ('packagingPosSlot' in product && product.packagingPosSlot !== undefined) ? (
                    <Pin className="h-3 w-3 sm:h-4 sm:w-4" />
                  ) : (
                    <Trash2 className="h-3 w-3 sm:h-4 sm:w-4" />
                  )}
                </Button>
              )}
            </div>
          </div>
        </CardContent>
      </Card>
    );
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Product Manager"
        description="Manage POS menu and packaging products"
        action={
          <div className="flex items-center gap-2 flex-wrap">
            {isAdmin && (
              <Button
                variant="outline"
                onClick={handleRecalculateAll}
                disabled={isRecalculating}
                className="shrink-0"
              >
                <RefreshCw className={`h-4 w-4 mr-2 ${isRecalculating ? 'animate-spin' : ''}`} />
                <span className="hidden sm:inline">{isRecalculating ? 'Recalculating...' : 'Recalculate Costs'}</span>
                <span className="sm:hidden">{isRecalculating ? '...' : 'Recalc'}</span>
              </Button>
            )}
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
        }
      />

      {isLoading ? (
        <div className="text-center py-12">
          <p className="text-muted-foreground">Loading products...</p>
        </div>
      ) : (
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragStart={handleDragStart}
          onDragEnd={handleDragEnd}
          onDragCancel={handleDragCancel}
        >
          <div className="grid grid-cols-1 xl:grid-cols-[1fr_380px] gap-6">
            {/* Left: management cards */}
            <div className="space-y-6">
              {/* Food POS Menu Section (Dynamic Slots) */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center justify-between">
                    <span>Food POS</span>
                    <Badge variant="secondary">
                      {posProducts?.length || 0} products
                    </Badge>
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <SortableContext
                    items={posProducts?.map(p => p._id) ?? []}
                    strategy={rectSortingStrategy}
                  >
                    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                      {posProducts?.map((product) => (
                        <SortableProductCard
                          key={product._id}
                          id={product._id}
                          product={product}
                          section="food-pos"
                        >
                          {renderProductCard(product, true, false, true)}
                        </SortableProductCard>
                      ))}

                      {/* Empty slot drop zone for adding new products */}
                      <DroppableSlotZone
                        id={`food-slot-${getNextAvailableSlot('food')}`}
                        slotType="food"
                        slotNumber={getNextAvailableSlot('food')}
                      >
                        <Card
                          className="border-dashed border-2 hover:border-primary/50 hover:bg-accent/50 transition-colors cursor-pointer"
                          onClick={() => handleNewProductForSlot(getNextAvailableSlot('food'))}
                        >
                          <CardContent className="pt-6">
                            <div className="flex flex-col items-center justify-center py-6 sm:py-8 text-center">
                              <div className="rounded-full bg-muted p-2 sm:p-3 mb-2 sm:mb-3">
                                <Plus className="h-5 w-5 sm:h-6 sm:w-6 text-muted-foreground" />
                              </div>
                              <Badge variant="outline" className="mb-2 text-xs">
                                Slot {getNextAvailableSlot('food')}
                              </Badge>
                              <p className="text-xs sm:text-sm text-muted-foreground">
                                Add Food Product
                              </p>
                            </div>
                          </CardContent>
                        </Card>
                      </DroppableSlotZone>
                    </div>
                  </SortableContext>
                </CardContent>
              </Card>

              {/* Packaging POS Section (Dynamic Slots) */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center justify-between">
                    <span>Packaging POS</span>
                    <Badge variant="secondary">
                      {packagingPosProducts?.length || 0} products
                    </Badge>
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <SortableContext
                    items={packagingPosProducts?.map(p => p._id) ?? []}
                    strategy={rectSortingStrategy}
                  >
                    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                      {packagingPosProducts?.map((product) => (
                        <SortableProductCard
                          key={product._id}
                          id={product._id}
                          product={product}
                          section="packaging-pos"
                        >
                          {renderProductCard(product, true, false, false)}
                        </SortableProductCard>
                      ))}

                      {/* Empty slot drop zone for adding new packaging products */}
                      <DroppableSlotZone
                        id={`packaging-slot-${getNextAvailableSlot('packaging')}`}
                        slotType="packaging"
                        slotNumber={getNextAvailableSlot('packaging')}
                      >
                        <Card
                          className="border-dashed border-2 hover:border-primary/50 hover:bg-accent/50 transition-colors cursor-pointer"
                          onClick={() => handleNewProductForSlot(getNextAvailableSlot('packaging'), 'packaging')}
                        >
                          <CardContent className="pt-6">
                            <div className="flex flex-col items-center justify-center py-6 sm:py-8 text-center">
                              <div className="rounded-full bg-muted p-2 sm:p-3 mb-2 sm:mb-3">
                                <Package className="h-5 w-5 sm:h-6 sm:w-6 text-muted-foreground" />
                              </div>
                              <Badge variant="outline" className="mb-2 text-xs">
                                Slot {getNextAvailableSlot('packaging')}
                              </Badge>
                              <p className="text-xs sm:text-sm text-muted-foreground">
                                Add Packaging Product
                              </p>
                            </div>
                          </CardContent>
                        </Card>
                      </DroppableSlotZone>
                    </div>
                  </SortableContext>
                </CardContent>
              </Card>

              {/* Available Products Section */}
              <DroppableSlotZone id="available-zone" slotType="available">
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center justify-between">
                      <span>Available Products</span>
                      <Badge variant="secondary">
                        {availableProducts?.length || 0} products
                      </Badge>
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    {!availableProducts || availableProducts.length === 0 ? (
                      <div className="text-center py-8">
                        <p className="text-muted-foreground">
                          No available products
                        </p>
                        <p className="text-sm text-muted-foreground mt-1">
                          Products not assigned to any POS slot will appear here
                        </p>
                      </div>
                    ) : (
                      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                        {availableProducts.map((product) => (
                          <DraggableProductCard
                            key={product._id}
                            id={`available-${product._id}`}
                            product={product}
                            section="available"
                          >
                            {renderProductCard(product, false, true, true)}
                          </DraggableProductCard>
                        ))}
                      </div>
                    )}
                  </CardContent>
                </Card>
              </DroppableSlotZone>
            </div>

            {/* Right: POS Preview Panel (xl+ only) */}
            <div className="hidden xl:block">
              <div className="sticky top-6">
                <POSPreviewPanel
                  posProducts={posProducts}
                  packagingPosProducts={packagingPosProducts}
                />
              </div>
            </div>
          </div>

          <DragOverlay dropAnimation={null}>
            {activeProduct && <DragOverlayCard product={activeProduct} />}
          </DragOverlay>
        </DndContext>
      )}

      {/* Product Form Sheet */}
      <ProductForm
        open={isFormOpen}
        onOpenChange={handleFormClose}
        product={editingProduct}
        prefilledSlot={prefilledSlot}
        prefilledProductType={prefilledProductType}
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

      {/* Cost Recalculation Results Dialog */}
      <Dialog open={recalcResults !== null} onOpenChange={() => setRecalcResults(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Cost Recalculation Complete</DialogTitle>
            <DialogDescription>
              {recalcResults && recalcResults.length === 0
                ? 'All costs are up to date. No changes were needed.'
                : `${recalcResults?.length ?? 0} product(s) updated.`}
            </DialogDescription>
          </DialogHeader>
          {recalcResults && recalcResults.length > 0 && (
            <div className="max-h-[400px] overflow-y-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b">
                    <th className="text-left py-2 pr-2">Product</th>
                    <th className="text-right py-2 px-2">Old Cost</th>
                    <th className="text-right py-2 px-2">New Cost</th>
                    <th className="text-right py-2 pl-2">Delta</th>
                  </tr>
                </thead>
                <tbody>
                  {recalcResults.map((result) => (
                    <tr key={result.productId} className="border-b last:border-0">
                      <td className="py-2 pr-2 font-medium">{result.name}</td>
                      <td className="py-2 px-2 text-right text-muted-foreground">
                        {formatCurrency(result.oldCost ?? 0)}
                      </td>
                      <td className="py-2 px-2 text-right">
                        {formatCurrency(result.newCost)}
                      </td>
                      <td className={`py-2 pl-2 text-right font-medium ${
                        result.delta > 0 ? 'text-[var(--color-status-error)]' : result.delta < 0 ? 'text-[var(--color-status-success)]' : ''
                      }`}>
                        {result.delta > 0 ? '+' : ''}{formatCurrency(result.delta)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
