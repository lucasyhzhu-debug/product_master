import { useState, useEffect, useMemo } from 'react';
import { Save, UtensilsCrossed, Package, RefreshCw, ArrowRightLeft } from 'lucide-react';
import { useQuery as useConvexQuery } from 'convex/react';
import { api as convexApi } from '../../../convex/_generated/api';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
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
  useCreateMenuProduct,
  useUpdateMenuProduct,
  useAssignToSlot,
  useAssignToPackagingSlot,
  usePosProducts,
  usePackagingPosProducts,
  useMenuProductComponents,
  useComponentsByCategory,
  type PosProduct,
  type AvailableProduct,
} from '@/hooks/convex';
import { ProductionComponentsSection } from './ProductionComponentsSection';
import { PackagingComponentsSection } from './PackagingComponentsSection';
import { formatCurrency, formatPercent, formatNumber } from '@/lib/utils';
import type { Id } from '../../../convex/_generated/dataModel';
import { toast } from 'sonner';

interface ProductFormProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  product?: (PosProduct | AvailableProduct) | null;
  prefilledSlot?: number | null;
  prefilledProductType?: 'food' | 'packaging' | null;
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
  consumptionStage?: "production" | "boxing" | "labeling" | "none";
}

export function ProductForm({
  open,
  onOpenChange,
  product,
  prefilledSlot,
  prefilledProductType,
  onSlotSwapRequested,
}: ProductFormProps) {
  const createMutation = useCreateMenuProduct();
  const updateMutation = useUpdateMenuProduct();
  const assignSlotMutation = useAssignToSlot();
  const assignPackagingSlotMutation = useAssignToPackagingSlot();

  const isEditing = !!product;

  // Query POS products to check for slot conflicts (separate namespaces)
  const { data: posProducts } = usePosProducts();
  const { data: packagingPosProducts } = usePackagingPosProducts();

  // Query all component types for cost calculation
  const productionComponents = useComponentsByCategory("production", true);
  const packagingComponents = useComponentsByCategory("packaging", true);
  const allComponentsLoaded = productionComponents !== undefined &&
                               packagingComponents !== undefined;

  // Single raw query used for both duplicate name detection (all products) and
  // substitution dropdown (active food products). Client-side filtering below.
  const rawMenuProducts = useConvexQuery(convexApi.menuProducts.queries.list, {});

  // Query existing components if editing
  const productId = product?._id as Id<"menuProducts"> | undefined;
  const { data: existingComponents, isLoading: loadingComponents } = useMenuProductComponents(
    isEditing ? productId : undefined
  );

  // Form state
  const [name, setName] = useState('');
  const [productType, setProductType] = useState<'food' | 'packaging'>('food');
  const [isActive, setIsActive] = useState(true);
  const [gramsOverride, setGramsOverride] = useState('');
  const [price, setPrice] = useState('');
  const [isFree, setIsFree] = useState(false);
  const [posSlot, setPosSlot] = useState<string>('none');
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Phase 78: Inventory substitution state
  const [fulfillFromProductId, setFulfillFromProductId] = useState<string>('none');
  const [fulfillMultiplier, setFulfillMultiplier] = useState<string>('');

  // Component state (separate for production and packaging)
  const [productionRows, setProductionRows] = useState<ComponentRow[]>([]);
  const [packagingRows, setPackagingRows] = useState<ComponentRow[]>([]);

  // Initialize form when product changes
  useEffect(() => {
    if (product && !loadingComponents) {
      setName(product.name);
      setGramsOverride((product.grams ?? 0).toString());
      setPrice((product.defaultPrice ?? 0).toString());
      setIsFree(product.defaultPrice === 0);
      // Determine product type from existing data
      const existingProductType = 'productType' in product && product.productType
        ? product.productType as 'food' | 'packaging'
        : 'food';
      setProductType(existingProductType);

      // Read correct slot based on product type
      // Use != null to handle both undefined and null, while preserving slot 0 as valid
      if (existingProductType === 'packaging' && 'packagingPosSlot' in product) {
        setPosSlot(product.packagingPosSlot != null ? product.packagingPosSlot.toString() : 'none');
      } else {
        setPosSlot('posSlot' in product && product.posSlot != null ? product.posSlot.toString() : 'none');
      }

      // Determine active state (check for isActive on the raw product data)
      // PosProduct and LegacyProduct don't expose isActive directly, default to true
      setIsActive(true);

      // Phase 78: Initialize substitution fields
      if (product.fulfillFromProductId) {
        setFulfillFromProductId(product.fulfillFromProductId);
        setFulfillMultiplier(product.fulfillMultiplier?.toString() ?? '');
      } else {
        setFulfillFromProductId('none');
        setFulfillMultiplier('');
      }

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
              consumptionStage: comp.consumptionStage ?? undefined,
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

  // Set prefilled slot and product type when clicking empty slots
  useEffect(() => {
    if (prefilledSlot && !product) {
      setPosSlot(prefilledSlot.toString());
    }
    if (prefilledProductType && !product) {
      setProductType(prefilledProductType);
    }
  }, [prefilledSlot, prefilledProductType, product]);

  const resetForm = () => {
    setName('');
    setProductType('food');
    setIsActive(true);
    setGramsOverride('');
    setPrice('');
    setIsFree(false);
    setPosSlot(prefilledSlot ? prefilledSlot.toString() : 'none');
    setFulfillFromProductId('none');
    setFulfillMultiplier('');
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

    if (!isFree && (!price || parseFloat(price) <= 0)) {
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

    // Phase 78: Validate substitution multiplier is a valid integer >= 2
    if (fulfillFromProductId !== 'none') {
      const multiplierInt = parseInt(fulfillMultiplier);
      if (isNaN(multiplierInt) || multiplierInt < 2 || !Number.isInteger(multiplierInt)) {
        toast.error('Substitution multiplier must be an integer of 2 or more');
        return;
      }
    }

    setIsSubmitting(true);
    try {
      // Combine all components
      const allComponents = [...validProduction, ...validPackaging];
      const componentsData = allComponents.length > 0
        ? allComponents.map((c) => ({
            componentTypeId: c.componentTypeId as Id<"componentTypes">,
            quantity: c.quantity,
            ...(c.consumptionStage ? { consumptionStage: c.consumptionStage } : {}),
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
        defaultPrice: isFree ? 0 : parseFloat(price),
        isActive,
        components: componentsData,
        productType,
      };

      // Determine which slot mutation and product list to use based on product type
      const isPackaging = productType === 'packaging';
      const slotMutation = isPackaging ? assignPackagingSlotMutation : assignSlotMutation;
      const slotProducts = isPackaging ? packagingPosProducts : posProducts;
      const findOccupant = (targetSlot: number) =>
        isPackaging
          ? slotProducts?.find((p: { packagingPosSlot?: number; _id?: string }) =>
              'packagingPosSlot' in p && (p as { packagingPosSlot: number }).packagingPosSlot === targetSlot)
          : slotProducts?.find((p: { posSlot?: number; _id?: string }) =>
              'posSlot' in p && (p as { posSlot: number }).posSlot === targetSlot);

      if (isEditing) {
        // Phase 78: Build substitution update fields
        const substitutionUpdates = fulfillFromProductId !== 'none'
          ? { fulfillFromProductId: fulfillFromProductId as Id<"menuProducts">, fulfillMultiplier: parseInt(fulfillMultiplier) }
          : (product && 'fulfillFromProductId' in product && product.fulfillFromProductId
              ? { clearFulfillFrom: true as const }
              : {});

        // Update existing product
        await updateMutation.mutateAsync({
          id: product._id as Id<"menuProducts">,
          updates: { ...productData, ...substitutionUpdates },
        });

        // Handle slot assignment separately if changed
        const currentSlot = isPackaging
          ? ('packagingPosSlot' in product ? product.packagingPosSlot?.toString() : 'none')
          : ('posSlot' in product ? product.posSlot?.toString() : 'none');
        if (posSlot !== currentSlot) {
          if (posSlot !== 'none') {
            const targetSlot = parseInt(posSlot);
            const occupyingProduct = findOccupant(targetSlot);

            if (occupyingProduct && onSlotSwapRequested) {
              onSlotSwapRequested({
                productId: product._id,
                slot: targetSlot,
                currentProduct: occupyingProduct as PosProduct,
              });
              handleClose();
              return;
            }

            await slotMutation.mutateAsync({
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
          const occupyingProduct = findOccupant(targetSlot);

          if (occupyingProduct && onSlotSwapRequested) {
            onSlotSwapRequested({
              productId: newId as string,
              slot: targetSlot,
              currentProduct: occupyingProduct as PosProduct,
            });
            handleClose();
            return;
          }

          await slotMutation.mutateAsync({
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

  // Phase 78: Eligible substitution source products — food only, not self,
  // not already configured as a substitutor, active (query already filters).
  const eligibleSubstitutionProducts = useMemo(() => {
    if (!rawMenuProducts) return [];
    const currentId = product?._id;
    return rawMenuProducts.filter((p) => {
      if (!p.isActive) return false;
      if (p.productType !== 'food') return false;
      if (currentId && p._id === currentId) return false;
      if (p.fulfillFromProductId) return false;
      return true;
    });
  }, [rawMenuProducts, product]);

  // Check for duplicate product name (against all products, including inactive)
  const duplicateProduct = useMemo(() => {
    if (!name.trim() || !rawMenuProducts) return null;
    const trimmedName = name.trim().toLowerCase();
    const currentId = product?._id;
    return rawMenuProducts.find(
      (p) => p.name.toLowerCase() === trimmedName && p._id !== currentId
    ) ?? null;
  }, [name, rawMenuProducts, product]);

  // Calculate margin
  const cogs = calculatedValues.totalCost;
  const priceValue = isFree ? 0 : (parseFloat(price) || 0);
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
          <DialogDescription>
            {isEditing ? 'Update product details and component configuration.' : 'Create a new menu product with pricing and components.'}
          </DialogDescription>
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
                  className={duplicateProduct ? 'border-amber-500 focus-visible:ring-amber-500' : ''}
                />
                {duplicateProduct && (
                  <p className="text-xs text-amber-600 font-medium">
                    A product named "{duplicateProduct.name}" already exists. Consider using a different name.
                  </p>
                )}
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
                      <span className="font-medium flex items-center gap-1">
                        {formatCurrency(calculatedValues.productionCost)}
                        {product?.unitCostStaleAt && (
                          <span title="Cost recalculation in progress">
                            <RefreshCw className="h-3 w-3 text-amber-500 animate-spin" />
                          </span>
                        )}
                      </span>
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
                  <div className="flex items-center justify-between">
                    <Label htmlFor="price">Price (IDR) {!isFree && '*'}</Label>
                    <div className="flex items-center gap-1.5">
                      <Checkbox
                        id="isFree"
                        checked={isFree}
                        onCheckedChange={(checked) => {
                          setIsFree(checked === true);
                          if (checked) setPrice('0');
                        }}
                      />
                      <Label htmlFor="isFree" className="text-xs font-normal cursor-pointer">Free</Label>
                    </div>
                  </div>
                  <Input
                    id="price"
                    type="number"
                    step="0.01"
                    value={isFree ? '0' : price}
                    onChange={(e) => setPrice(e.target.value)}
                    placeholder="e.g., 15000"
                    disabled={isFree}
                    className={isFree ? 'opacity-50' : ''}
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
                  <Label htmlFor="cogs" className="flex items-center gap-1">
                    COGS
                    {product?.unitCostStaleAt && (
                      <span title="Cost recalculation in progress">
                        <RefreshCw className="h-3 w-3 text-amber-500 animate-spin" />
                      </span>
                    )}
                  </Label>
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

              {/* Phase 78: Inventory Fulfillment (Food only, edit mode) */}
              {productType === 'food' && isEditing && (
                <>
                  <Separator />
                  <div className="space-y-3">
                    <div className="flex items-center gap-2">
                      <ArrowRightLeft className="h-4 w-4 text-muted-foreground" />
                      <span className="text-sm font-semibold">Inventory Fulfillment</span>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      When direct stock is insufficient, fulfill from another product's inventory.
                    </p>

                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label htmlFor="fulfillFrom" className="text-sm font-semibold">Fulfill from</Label>
                        <Select
                          value={fulfillFromProductId}
                          onValueChange={(val) => {
                            setFulfillFromProductId(val);
                            if (val === 'none') {
                              setFulfillMultiplier('');
                            }
                          }}
                        >
                          <SelectTrigger id="fulfillFrom">
                            <SelectValue placeholder="None" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="none">None</SelectItem>
                            {eligibleSubstitutionProducts.map((p) => (
                              <SelectItem key={p._id} value={p._id as string}>
                                {p.name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>

                      <div className="space-y-2">
                        <Label htmlFor="fulfillMultiplier" className="text-sm font-semibold">Units per product</Label>
                        <Input
                          id="fulfillMultiplier"
                          type="number"
                          min="2"
                          step="1"
                          value={fulfillMultiplier}
                          onChange={(e) => setFulfillMultiplier(e.target.value)}
                          placeholder="e.g., 3"
                          disabled={fulfillFromProductId === 'none'}
                        />
                      </div>
                    </div>

                    {fulfillFromProductId !== 'none' && fulfillMultiplier && parseInt(fulfillMultiplier) >= 2 && (
                      <div className="rounded-lg border border-blue-200 dark:border-blue-800 bg-blue-50 dark:bg-blue-950/20 p-3">
                        <p className="text-xs text-blue-600 dark:text-blue-400">
                          1 {name || 'this product'} will draw {fulfillMultiplier}x{' '}
                          {eligibleSubstitutionProducts.find(p => (p._id as string) === fulfillFromProductId)?.name ?? 'source product'}{' '}
                          from inventory when direct stock is insufficient
                        </p>
                      </div>
                    )}
                  </div>
                </>
              )}

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
