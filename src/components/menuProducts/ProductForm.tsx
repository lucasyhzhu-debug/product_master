import { useState, useEffect, useMemo } from 'react';
import { Save } from 'lucide-react';
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
  useConvexMenuProductComponents,
  useConvexComponentsByCategory,
  type PosProduct,
  type LegacyProduct,
} from '@/hooks/convex';
import { ProductionComponentsSection } from './ProductionComponentsSection';
import { PackagingComponentsSection } from './PackagingComponentsSection';
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
  id: string; // Temporary ID for UI
  componentTypeId: Id<"componentTypes"> | null;
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

  // Query all component types for cost calculation
  const productionComponents = useConvexComponentsByCategory("production", true);
  const packagingComponents = useConvexComponentsByCategory("packaging", true);
  const allComponentsLoaded = productionComponents !== undefined &&
                               packagingComponents !== undefined;

  // Query existing components if editing
  const productId = product?._id as Id<"menuProducts"> | undefined;
  const { data: existingComponents, isLoading: loadingComponents } = useConvexMenuProductComponents(
    isEditing ? productId : undefined
  );

  // Form state
  const [code, setCode] = useState('');
  const [name, setName] = useState('');
  const [gramsOverride, setGramsOverride] = useState('');
  const [price, setPrice] = useState('');
  const [posSlot, setPosSlot] = useState<string>('none');
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Component state (separate for production and packaging)
  const [productionRows, setProductionRows] = useState<ComponentRow[]>([]);
  const [packagingRows, setPackagingRows] = useState<ComponentRow[]>([]);

  // Initialize form when product changes
  useEffect(() => {
    if (product && !loadingComponents) {
      setCode(product.code);
      setName(product.name);
      setGramsOverride(product.grams.toString());
      setPrice(product.defaultPrice.toString());
      setPosSlot('posSlot' in product ? product.posSlot.toString() : 'none');

      // Split existing components into production and packaging
      if (existingComponents && existingComponents.length > 0) {
        const production: ComponentRow[] = [];
        const packaging: ComponentRow[] = [];

        existingComponents.forEach((comp) => {
          if (comp.componentType) {
            const row: ComponentRow = {
              id: Math.random().toString(36).substr(2, 9),
              componentTypeId: comp.componentTypeId ?? null,
              quantity: comp.quantity,
            };

            if (comp.componentType.category === 'production') {
              production.push(row);
            } else {
              packaging.push(row);
            }
          }
        });

        setProductionRows(production);
        setPackagingRows(packaging);
      } else {
        setProductionRows([]);
        setPackagingRows([]);
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
    setProductionRows([]);
    setPackagingRows([]);
  };

  const handleClose = () => {
    onOpenChange(false);
    // Delay reset to avoid flash during closing animation
    setTimeout(resetForm, 300);
  };

  // Calculate COGS and grams from components
  const calculatedValues = useMemo(() => {
    if (!allComponentsLoaded) {
      return { productionCost: 0, packagingCost: 0, totalCost: 0, totalGrams: 0, summary: '' };
    }

    const allComponents = [
      ...(productionComponents ?? []),
      ...(packagingComponents ?? []),
    ];

    let productionCost = 0;
    let packagingCost = 0;
    let totalGrams = 0;
    const summaryParts: string[] = [];

    // Calculate production costs and grams
    for (const row of productionRows) {
      if (!row.componentTypeId) continue;

      const comp = allComponents.find((c) => c._id === row.componentTypeId);
      if (!comp) continue;

      productionCost += comp.unitCostIdr * row.quantity;
      totalGrams += (comp.gramsPerUnit ?? 0) * row.quantity;

      if (row.quantity > 0) {
        summaryParts.push(`${row.quantity} ${comp.name}`);
      }
    }

    // Calculate packaging costs
    for (const row of packagingRows) {
      if (!row.componentTypeId) continue;

      const comp = allComponents.find((c) => c._id === row.componentTypeId);
      if (!comp) continue;

      packagingCost += comp.unitCostIdr * row.quantity;
    }

    return {
      productionCost,
      packagingCost,
      totalCost: productionCost + packagingCost,
      totalGrams,
      summary: summaryParts.join(', ') || 'No production components',
    };
  }, [productionRows, packagingRows, productionComponents, packagingComponents, allComponentsLoaded]);

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

    // Validate components
    const validProduction = productionRows.filter((c) => c.componentTypeId !== null);
    const validPackaging = packagingRows.filter((c) => c.componentTypeId !== null);

    if ([...validProduction, ...validPackaging].some((c) => c.quantity <= 0)) {
      toast.error('Component quantities must be greater than 0');
      return;
    }

    setIsSubmitting(true);
    try {
      // Combine all components
      const allComponents = [...validProduction, ...validPackaging];
      const componentsData = allComponents.length > 0
        ? allComponents.map((c) => ({
            componentTypeId: c.componentTypeId as Id<"componentTypes">,
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
      console.error('Failed to save product:', error);
      // Toast already shown by mutations
    } finally {
      setIsSubmitting(false);
    }
  };

  // Calculate margin
  const cogs = calculatedValues.totalCost;
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
              <ProductionComponentsSection
                components={productionRows}
                onChange={setProductionRows}
                disabled={isSubmitting}
              />

              {/* Packaging Components */}
              <Separator />
              <PackagingComponentsSection
                components={packagingRows}
                onChange={setPackagingRows}
                disabled={isSubmitting}
              />

              {/* Auto-calculated summary */}
              {(productionRows.length > 0 || packagingRows.length > 0) && (
                <div className="rounded-lg bg-muted p-3 space-y-2">
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">Production Cost:</span>
                    <span className="font-medium">{formatCurrency(calculatedValues.productionCost)}</span>
                  </div>
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">Packaging Cost:</span>
                    <span className="font-medium">{formatCurrency(calculatedValues.packagingCost)}</span>
                  </div>
                  <Separator />
                  <div className="flex items-center justify-between text-sm font-semibold">
                    <span>Total COGS:</span>
                    <span>{formatCurrency(calculatedValues.totalCost)}</span>
                  </div>
                  {productionRows.length > 0 && (
                    <>
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-muted-foreground">Auto Grams:</span>
                        <span className="font-medium">{formatNumber(calculatedValues.totalGrams, 1)}g</span>
                      </div>
                      <div className="flex items-start justify-between text-sm">
                        <span className="text-muted-foreground">Summary:</span>
                        <span className="font-medium text-right">{calculatedValues.summary}</span>
                      </div>
                    </>
                  )}
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
                    productionRows.length > 0
                      ? `Auto: ${formatNumber(calculatedValues.totalGrams, 1)}g`
                      : 'e.g., 50'
                  }
                />
                <p className="text-xs text-muted-foreground">
                  {productionRows.length > 0
                    ? 'Optional. Override auto-calculated weight.'
                    : 'Weight in grams (optional).'}
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
                  {(productionRows.length > 0 || packagingRows.length > 0)
                    ? 'Auto-calculated from components'
                    : 'No components defined'}
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

              {/* Production Summary Badge */}
              {productionRows.length > 0 && (
                <div className="rounded-lg border bg-primary/5 p-3 space-y-2">
                  <div className="flex items-center gap-2">
                    <Badge variant="secondary">Production Summary</Badge>
                  </div>
                  <div className="space-y-1">
                    <p className="text-sm font-medium">{calculatedValues.summary}</p>
                    <p className="text-xs text-muted-foreground">
                      Total: {formatNumber(displayGrams, 1)}g at {formatCurrency(calculatedValues.productionCost)}
                    </p>
                  </div>
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
