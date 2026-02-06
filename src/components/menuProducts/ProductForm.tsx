import { useState, useEffect, useMemo } from 'react';
import { Save, UtensilsCrossed, Package } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
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
import { Switch } from '@/components/ui/switch';
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
  prefilledSlot?: number | null;
  onSlotSwapRequested?: (data: {
    productId: string;
    slot: number;
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
  const [name, setName] = useState('');
  const [productType, setProductType] = useState<'food' | 'packaging'>('food');
  const [isActive, setIsActive] = useState(true);
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
      setName(product.name);
      setGramsOverride(product.grams.toString());
      setPrice(product.defaultPrice.toString());
      setPosSlot('posSlot' in product ? product.posSlot.toString() : 'none');

      // Determine product type from existing data
      const existingProductType = 'productType' in product && product.productType
        ? product.productType as 'food' | 'packaging'
        : 'food';
      setProductType(existingProductType);

      // Determine active state (check for isActive on the raw product data)
      // PosProduct and LegacyProduct don't expose isActive directly, default to true
      setIsActive(true);

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
    setName('');
    setProductType('food');
    setIsActive(true);
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

    // Calculate production costs and grams (only for food products)
    if (productType === 'food') {
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
  }, [productionRows, packagingRows, productionComponents, packagingComponents, allComponentsLoaded, productType]);

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
    const validProduction = productType === 'food'
      ? productionRows.filter((c) => c.componentTypeId !== null)
      : [];
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
        name: name.trim(),
        grams: finalGrams,
        defaultPrice: parseFloat(price),
        isActive,
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
            const targetSlot = parseInt(posSlot);
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
          const targetSlot = parseInt(posSlot);
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
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] p-0 flex flex-col overflow-hidden">
        <DialogHeader className="px-6 pt-6 pb-4 border-b shrink-0">
          <DialogTitle className="text-lg">
            {isEditing ? 'Edit Product' : 'New Product'}
          </DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="flex-1 flex flex-col overflow-hidden min-h-0">
          <ScrollArea className="flex-1 px-6 py-4">
            <div className="space-y-5">
              {/* Product Type Toggle */}
              <div className="space-y-2">
                <Label>Product Type</Label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setProductType('food')}
                    className={`flex items-center gap-2 rounded-lg border-2 p-3 transition-colors ${
                      productType === 'food'
                        ? 'border-primary bg-primary/5 text-primary'
                        : 'border-muted hover:border-muted-foreground/30'
                    }`}
                  >
                    <UtensilsCrossed className="h-4 w-4" />
                    <div className="text-left">
                      <div className="text-sm font-medium">Food</div>
                      <div className="text-xs text-muted-foreground">Production + Packaging</div>
                    </div>
                  </button>
                  <button
                    type="button"
                    onClick={() => setProductType('packaging')}
                    className={`flex items-center gap-2 rounded-lg border-2 p-3 transition-colors ${
                      productType === 'packaging'
                        ? 'border-primary bg-primary/5 text-primary'
                        : 'border-muted hover:border-muted-foreground/30'
                    }`}
                  >
                    <Package className="h-4 w-4" />
                    <div className="text-left">
                      <div className="text-sm font-medium">Packaging</div>
                      <div className="text-xs text-muted-foreground">Packaging only</div>
                    </div>
                  </button>
                </div>
              </div>

              {/* Active/Inactive Toggle */}
              <div className="flex items-center justify-between rounded-lg border p-3">
                <div>
                  <Label htmlFor="active-toggle" className="text-sm font-medium">Active</Label>
                  <p className="text-xs text-muted-foreground">
                    Inactive products are hidden from the POS
                  </p>
                </div>
                <Switch
                  id="active-toggle"
                  checked={isActive}
                  onCheckedChange={setIsActive}
                />
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

              {/* Production Components (Food only) */}
              {productType === 'food' && (
                <>
                  <Separator />
                  <ProductionComponentsSection
                    components={productionRows}
                    onChange={setProductionRows}
                    disabled={isSubmitting}
                  />
                </>
              )}

              {/* Packaging Components (Both types) */}
              <Separator />
              <PackagingComponentsSection
                components={packagingRows}
                onChange={setPackagingRows}
                disabled={isSubmitting}
              />

              {/* Auto-calculated summary */}
              {(productionRows.length > 0 || packagingRows.length > 0) && (
                <div className="rounded-lg bg-muted p-3 space-y-2">
                  {productType === 'food' && (
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-muted-foreground">Production Cost:</span>
                      <span className="font-medium">{formatCurrency(calculatedValues.productionCost)}</span>
                    </div>
                  )}
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">Packaging Cost:</span>
                    <span className="font-medium">{formatCurrency(calculatedValues.packagingCost)}</span>
                  </div>
                  <Separator />
                  <div className="flex items-center justify-between text-sm font-semibold">
                    <span>Total COGS:</span>
                    <span>{formatCurrency(calculatedValues.totalCost)}</span>
                  </div>
                  {productType === 'food' && productionRows.length > 0 && (
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

              {/* Two-column layout for Price, Weight, COGS, Margin */}
              <div className="grid grid-cols-2 gap-4">
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

                {/* Grams Override (Food only) */}
                {productType === 'food' && (
                  <div className="space-y-2">
                    <Label htmlFor="grams">Weight (grams)</Label>
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
                  </div>
                )}

                {/* COGS (Read-only) */}
                <div className="space-y-2">
                  <Label htmlFor="cogs">COGS</Label>
                  <Input
                    id="cogs"
                    value={formatCurrency(cogs)}
                    disabled
                    className="bg-muted"
                  />
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
                </div>
              </div>

              {/* POS Slot */}
              <div className="space-y-2">
                <Label htmlFor="posSlot">
                  {productType === 'food' ? 'Food POS Slot' : 'Packaging POS Slot'}
                </Label>
                <Select value={posSlot} onValueChange={setPosSlot}>
                  <SelectTrigger id="posSlot">
                    <SelectValue placeholder="Select slot" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">None (Available)</SelectItem>
                    <SelectItem value="1">Slot 1</SelectItem>
                    <SelectItem value="2">Slot 2</SelectItem>
                    <SelectItem value="3">Slot 3</SelectItem>
                    <SelectItem value="4">Slot 4</SelectItem>
                    <SelectItem value="5">Slot 5</SelectItem>
                    <SelectItem value="6">Slot 6</SelectItem>
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">
                  Assign to POS quick-access slot
                </p>
              </div>

              {/* Production Summary Badge (Food only) */}
              {productType === 'food' && productionRows.length > 0 && (
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

          <DialogFooter className="px-6 py-4 border-t shrink-0">
            <div className="flex gap-2 w-full">
              <Button
                type="button"
                variant="outline"
                onClick={handleClose}
                className="flex-1"
                disabled={isSubmitting}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                className="flex-1"
                disabled={isSubmitting}
              >
                <Save className="h-4 w-4 mr-2" />
                {isSubmitting ? 'Saving...' : isEditing ? 'Update' : 'Create'}
              </Button>
            </div>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
