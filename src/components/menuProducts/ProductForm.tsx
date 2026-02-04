import { useState, useEffect, useMemo } from 'react';
import { Save, Plus, Trash2 } from 'lucide-react';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetFooter,
} from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { Badge } from '@/components/ui/badge';
import {
  useConvexCreateMenuProduct,
  useConvexUpdateMenuProduct,
  useConvexAssignToSlot,
  useConvexPosProducts,
  useConvexProductionUnitTypes,
  useConvexMenuProductComponents,
  type PosProduct,
  type LegacyProduct,
} from '@/hooks/convex';
import { formatCurrency, formatPercent, formatNumber } from '@/lib/utils';
import type { Id } from '../../../convex/_generated/dataModel';
import { toast } from 'sonner';

interface ProductFormProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  product?: (PosProduct | LegacyProduct) | null;
  prefilledSlot?: 1 | 2 | 3 | 4 | null;
  onSlotSwapRequested?: (data: {
    productId: string;
    slot: 1 | 2 | 3 | 4;
    currentProduct: PosProduct;
  }) => void;
}

interface ComponentRow {
  id: string; // Temporary ID for UI (not Convex ID)
  productionUnitTypeId: Id<"productionUnitTypes"> | null;
  quantity: number;
}

export function ProductForm({
  open,
  onOpenChange,
  product,
  prefilledSlot,
  onSlotSwapRequested,
}: ProductFormProps) {
  const createMutation = useConvexCreateMenuProduct();
  const updateMutation = useConvexUpdateMenuProduct();
  const assignSlotMutation = useConvexAssignToSlot();

  const isEditing = !!product;

  // Query POS products to check for slot conflicts
  const { data: posProducts } = useConvexPosProducts();

  // Query production unit types
  const { data: productionUnitTypes, isLoading: loadingUnitTypes } = useConvexProductionUnitTypes();

  // Query existing components if editing
  const productId = product?._id as Id<"menuProducts"> | undefined;
  const { data: existingComponents, isLoading: loadingComponents } = useConvexMenuProductComponents(
    isEditing ? productId : undefined
  );

  // Form state
  const [code, setCode] = useState('');
  const [name, setName] = useState('');
  const [gramsOverride, setGramsOverride] = useState(''); // User can override auto-calculated grams
  const [price, setPrice] = useState('');
  const [posSlot, setPosSlot] = useState<string>('none');
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Component state
  const [components, setComponents] = useState<ComponentRow[]>([]);

  // Initialize form when product changes
  useEffect(() => {
    if (product && !loadingComponents) {
      setCode(product.code);
      setName(product.name);
      setGramsOverride(product.grams.toString());
      setPrice(product.defaultPrice.toString());
      setPosSlot('posSlot' in product ? product.posSlot.toString() : 'none');

      // Initialize components from existing data
      if (existingComponents && existingComponents.length > 0) {
        setComponents(
          existingComponents.map((comp) => ({
            id: Math.random().toString(36).substr(2, 9),
            productionUnitTypeId: comp.productionUnitTypeId,
            quantity: comp.quantity,
          }))
        );
      } else {
        setComponents([]);
      }
    } else if (!product) {
      resetForm();
    }
  }, [product, existingComponents, loadingComponents]);

  // Set prefilled slot when it changes (for clicking empty slots)
  useEffect(() => {
    if (prefilledSlot && !product) {
      setPosSlot(prefilledSlot.toString());
    }
  }, [prefilledSlot, product]);

  const resetForm = () => {
    setCode('');
    setName('');
    setGramsOverride('');
    setPrice('');
    setPosSlot(prefilledSlot ? prefilledSlot.toString() : 'none');
    setComponents([]);
  };

  const handleClose = () => {
    onOpenChange(false);
    // Delay reset to avoid flash during closing animation
    setTimeout(resetForm, 300);
  };

  // Component management
  const handleAddComponent = () => {
    setComponents([
      ...components,
      {
        id: Math.random().toString(36).substr(2, 9),
        productionUnitTypeId: null,
        quantity: 1,
      },
    ]);
  };

  const handleRemoveComponent = (id: string) => {
    setComponents(components.filter((c) => c.id !== id));
  };

  const handleUpdateComponent = (id: string, field: 'productionUnitTypeId' | 'quantity', value: any) => {
    setComponents(
      components.map((c) =>
        c.id === id
          ? {
              ...c,
              [field]: field === 'quantity' ? parseInt(value) || 0 : value,
            }
          : c
      )
    );
  };

  // Auto-calculate COGS and grams from components
  const calculatedValues = useMemo(() => {
    if (!productionUnitTypes || components.length === 0) {
      return { totalCost: 0, totalGrams: 0, ballSummary: '' };
    }

    let totalCost = 0;
    let totalGrams = 0;
    const summaryParts: string[] = [];

    for (const component of components) {
      if (!component.productionUnitTypeId) continue;

      const unitType = productionUnitTypes.find(
        (ut) => ut._id === component.productionUnitTypeId
      );
      if (!unitType) continue;

      totalCost += unitType.unitCostIdr * component.quantity;
      totalGrams += unitType.gramsPerUnit * component.quantity;

      if (component.quantity > 0) {
        summaryParts.push(`${component.quantity} ${unitType.name}`);
      }
    }

    return {
      totalCost,
      totalGrams,
      ballSummary: summaryParts.join(', ') || 'No components',
    };
  }, [components, productionUnitTypes]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    // Validation
    if (!name.trim()) {
      toast.error('Product name is required');
      return;
    }

    if (!price || parseFloat(price) <= 0) {
      toast.error('Valid price is required');
      return;
    }

    // Validate components if provided
    const validComponents = components.filter((c) => c.productionUnitTypeId !== null);
    if (validComponents.some((c) => c.quantity <= 0)) {
      toast.error('Component quantities must be greater than 0');
      return;
    }

    setIsSubmitting(true);
    try {
      // Prepare components array for mutation
      const componentsData =
        validComponents.length > 0
          ? validComponents.map((c) => ({
              productionUnitTypeId: c.productionUnitTypeId as Id<"productionUnitTypes">,
              quantity: c.quantity,
            }))
          : undefined;

      // Use override grams if provided, otherwise use calculated
      const finalGrams =
        gramsOverride && parseFloat(gramsOverride) > 0
          ? parseFloat(gramsOverride)
          : calculatedValues.totalGrams;

      const productData = {
        code: code.trim() || undefined,
        name: name.trim(),
        grams: finalGrams,
        defaultPrice: parseFloat(price),
        components: componentsData,
      };

      if (isEditing) {
        // Update existing product
        await updateMutation.mutateAsync({
          id: product._id as Id<"menuProducts">,
          updates: productData,
        });

        // Handle slot assignment separately if changed
        const currentSlot = 'posSlot' in product ? product.posSlot?.toString() : 'none';
        if (posSlot !== currentSlot) {
          if (posSlot !== 'none') {
            const targetSlot = parseInt(posSlot) as 1 | 2 | 3 | 4;
            const occupyingProduct = posProducts?.find((p) => p.posSlot === targetSlot);

            // Check if slot is occupied and trigger swap confirmation
            if (occupyingProduct && onSlotSwapRequested) {
              onSlotSwapRequested({
                productId: product._id,
                slot: targetSlot,
                currentProduct: occupyingProduct,
              });
              handleClose();
              return;
            }

            await assignSlotMutation.mutateAsync({
              id: product._id as Id<"menuProducts">,
              slot: targetSlot,
            });
          }
          // Note: Removing from slot is handled separately in the main page
        }
      } else {
        // Create new product
        const newId = await createMutation.mutateAsync(productData);

        // Assign to slot if selected
        if (posSlot !== 'none') {
          const targetSlot = parseInt(posSlot) as 1 | 2 | 3 | 4;
          const occupyingProduct = posProducts?.find((p) => p.posSlot === targetSlot);

          // Check if slot is occupied and trigger swap confirmation
          if (occupyingProduct && onSlotSwapRequested) {
            onSlotSwapRequested({
              productId: newId as string,
              slot: targetSlot,
              currentProduct: occupyingProduct,
            });
            handleClose();
            return;
          }

          await assignSlotMutation.mutateAsync({
            id: newId as Id<"menuProducts">,
            slot: targetSlot,
          });
        }
      }

      handleClose();
    } catch (error) {
      // Error already handled by mutations with toast
      console.error('Failed to save product:', error);
    } finally {
      setIsSubmitting(false);
    }
  };

  // Calculate margin (read-only)
  // Use calculated COGS from components if available, otherwise use existing unitCost
  const cogs = components.length > 0 ? calculatedValues.totalCost : (product?.unitCost ?? 0);
  const priceValue = parseFloat(price) || 0;
  const margin = priceValue > 0 && cogs > 0
    ? ((priceValue - cogs) / priceValue) * 100
    : null;

  // Display grams: use override if set, otherwise use calculated
  const displayGrams =
    gramsOverride && parseFloat(gramsOverride) > 0
      ? parseFloat(gramsOverride)
      : calculatedValues.totalGrams;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="w-full sm:w-96 sm:max-w-96 p-0 flex flex-col overflow-hidden"
      >
        <SheetHeader className="px-4 sm:px-6 py-4 border-b">
          <SheetTitle className="text-base sm:text-lg">
            {isEditing ? 'Edit Product' : 'New Product'}
          </SheetTitle>
        </SheetHeader>

        <form onSubmit={handleSubmit} className="flex-1 flex flex-col overflow-hidden">
          <ScrollArea className="flex-1 px-4 sm:px-6 py-4">
            <div className="space-y-4 min-w-0">
              {/* Code */}
              <div className="space-y-2">
                <Label htmlFor="code">Product Code</Label>
                <Input
                  id="code"
                  value={code}
                  onChange={(e) => setCode(e.target.value)}
                  placeholder="e.g., MP001"
                />
                <p className="text-xs text-muted-foreground">
                  Optional. Internal reference code.
                </p>
              </div>

              {/* Name */}
              <div className="space-y-2">
                <Label htmlFor="name">Name *</Label>
                <Input
                  id="name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g., Pistachio Crunch"
                  required
                />
              </div>

              {/* Production Components */}
              <Separator />
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <Label>Production Components</Label>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={handleAddComponent}
                    disabled={loadingUnitTypes}
                  >
                    <Plus className="h-4 w-4 mr-1" />
                    Add
                  </Button>
                </div>

                {components.length > 0 && (
                  <div className="space-y-2">
                    {components.map((component) => (
                      <div key={component.id} className="flex gap-1 sm:gap-2 items-start">
                        <div className="flex-1 space-y-1 min-w-0">
                          <Select
                            value={component.productionUnitTypeId ?? ''}
                            onValueChange={(value) =>
                              handleUpdateComponent(component.id, 'productionUnitTypeId', value as Id<"productionUnitTypes">)
                            }
                          >
                            <SelectTrigger className="text-xs sm:text-sm">
                              <SelectValue placeholder="Select unit type" />
                            </SelectTrigger>
                            <SelectContent>
                              {productionUnitTypes?.map((unitType) => (
                                <SelectItem key={unitType._id} value={unitType._id} className="text-xs sm:text-sm">
                                  {unitType.name} ({formatNumber(unitType.gramsPerUnit, 0)}g, {formatCurrency(unitType.unitCostIdr)})
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>

                        <div className="w-16 sm:w-20">
                          <Input
                            type="number"
                            min="1"
                            value={component.quantity}
                            onChange={(e) =>
                              handleUpdateComponent(component.id, 'quantity', e.target.value)
                            }
                            placeholder="Qty"
                            className="text-xs sm:text-sm"
                          />
                        </div>

                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          onClick={() => handleRemoveComponent(component.id)}
                          className="h-9 w-9 shrink-0"
                        >
                          <Trash2 className="h-3 w-3 sm:h-4 sm:w-4 text-destructive" />
                        </Button>
                      </div>
                    ))}
                  </div>
                )}

                {components.length === 0 && (
                  <p className="text-sm text-muted-foreground text-center py-4 border border-dashed rounded-lg">
                    No components added. Click "Add" to define production units.
                  </p>
                )}
              </div>

              {/* Auto-calculated values */}
              {components.length > 0 && (
                <div className="rounded-lg bg-muted p-3 space-y-2">
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">Auto COGS:</span>
                    <span className="font-medium">{formatCurrency(calculatedValues.totalCost)}</span>
                  </div>
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">Auto Grams:</span>
                    <span className="font-medium">{formatNumber(calculatedValues.totalGrams, 1)}g</span>
                  </div>
                  <div className="flex items-start justify-between text-sm">
                    <span className="text-muted-foreground">Ball Summary:</span>
                    <span className="font-medium text-right">{calculatedValues.ballSummary}</span>
                  </div>
                </div>
              )}

              <Separator />

              {/* Grams Override */}
              <div className="space-y-2">
                <Label htmlFor="grams">Weight Override (grams)</Label>
                <Input
                  id="grams"
                  type="number"
                  step="0.01"
                  value={gramsOverride}
                  onChange={(e) => setGramsOverride(e.target.value)}
                  placeholder={
                    components.length > 0
                      ? `Auto: ${formatNumber(calculatedValues.totalGrams, 1)}g`
                      : 'e.g., 50'
                  }
                />
                <p className="text-xs text-muted-foreground">
                  {components.length > 0
                    ? 'Optional. Override auto-calculated weight.'
                    : 'Weight in grams (required if no components).'}
                </p>
              </div>

              {/* Price */}
              <div className="space-y-2">
                <Label htmlFor="price">Price (IDR) *</Label>
                <Input
                  id="price"
                  type="number"
                  step="0.01"
                  value={price}
                  onChange={(e) => setPrice(e.target.value)}
                  placeholder="e.g., 15000"
                  required
                />
              </div>

              {/* COGS (Read-only) */}
              <div className="space-y-2">
                <Label htmlFor="cogs">COGS</Label>
                <Input
                  id="cogs"
                  value={formatCurrency(cogs)}
                  disabled
                  className="bg-muted"
                />
                <p className="text-xs text-muted-foreground">
                  {components.length > 0
                    ? 'Auto-calculated from components'
                    : 'From existing product or linked concept'}
                </p>
              </div>

              {/* Margin (Calculated) */}
              <div className="space-y-2">
                <Label htmlFor="margin">Margin</Label>
                <Input
                  id="margin"
                  value={margin ? formatPercent(margin) : '-'}
                  disabled
                  className="bg-muted"
                />
                <p className="text-xs text-muted-foreground">
                  Auto-calculated: (Price - COGS) / Price
                </p>
              </div>

              {/* POS Slot */}
              <div className="space-y-2">
                <Label htmlFor="posSlot">POS Slot</Label>
                <Select value={posSlot} onValueChange={setPosSlot}>
                  <SelectTrigger id="posSlot">
                    <SelectValue placeholder="Select slot" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">None (Legacy)</SelectItem>
                    <SelectItem value="1">Slot 1</SelectItem>
                    <SelectItem value="2">Slot 2</SelectItem>
                    <SelectItem value="3">Slot 3</SelectItem>
                    <SelectItem value="4">Slot 4</SelectItem>
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">
                  Assign to POS quick-access slot (max 4)
                </p>
              </div>

              {/* Ball Production Summary */}
              {(components.length > 0 || (product?.productionType && product?.productionUnits)) && (
                <div className="rounded-lg border bg-primary/5 p-3 space-y-2">
                  <div className="flex items-center gap-2">
                    <Badge variant="secondary">Production Summary</Badge>
                  </div>
                  {components.length > 0 ? (
                    <div className="space-y-1">
                      <p className="text-sm font-medium">{calculatedValues.ballSummary}</p>
                      <p className="text-xs text-muted-foreground">
                        Total: {formatNumber(displayGrams, 1)}g at {formatCurrency(cogs)}
                      </p>
                    </div>
                  ) : product?.productionType && product?.productionUnits ? (
                    <p className="text-xs text-muted-foreground">
                      {product.productionUnits} {product.productionType === 'bite_sized' ? 'bite-sized' : 'original'} balls per unit
                    </p>
                  ) : null}
                </div>
              )}
            </div>
          </ScrollArea>

          <SheetFooter className="px-4 sm:px-6 py-4 border-t">
            <div className="flex gap-2 w-full">
              <Button
                type="button"
                variant="outline"
                onClick={handleClose}
                className="flex-1 text-xs sm:text-sm"
                disabled={isSubmitting}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                className="flex-1 text-xs sm:text-sm"
                disabled={isSubmitting}
              >
                <Save className="h-3 w-3 sm:h-4 sm:w-4 mr-1 sm:mr-2" />
                {isSubmitting ? 'Saving...' : isEditing ? 'Update' : 'Create'}
              </Button>
            </div>
          </SheetFooter>
        </form>
      </SheetContent>
    </Sheet>
  );
}
