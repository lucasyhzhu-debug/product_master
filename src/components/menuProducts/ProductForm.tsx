import { useState, useEffect } from 'react';
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
import {
  useConvexCreateMenuProduct,
  useConvexUpdateMenuProduct,
  useConvexAssignToSlot,
  type PosProduct,
  type LegacyProduct,
} from '@/hooks/convex/useMenuProducts';
import { formatCurrency, formatPercent } from '@/lib/utils';
import type { Id } from '../../../convex/_generated/dataModel';
import { toast } from 'sonner';

interface ProductFormProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  product?: (PosProduct | LegacyProduct) | null;
}

export function ProductForm({ open, onOpenChange, product }: ProductFormProps) {
  const createMutation = useConvexCreateMenuProduct();
  const updateMutation = useConvexUpdateMenuProduct();
  const assignSlotMutation = useConvexAssignToSlot();

  const isEditing = !!product;

  // Form state
  const [code, setCode] = useState('');
  const [name, setName] = useState('');
  const [grams, setGrams] = useState('');
  const [price, setPrice] = useState('');
  const [posSlot, setPosSlot] = useState<string>('none');
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Initialize form when product changes
  useEffect(() => {
    if (product) {
      setCode(product.code);
      setName(product.name);
      setGrams(product.grams.toString());
      setPrice(product.defaultPrice.toString());
      setPosSlot('posSlot' in product ? product.posSlot.toString() : 'none');
    } else {
      resetForm();
    }
  }, [product]);

  const resetForm = () => {
    setCode('');
    setName('');
    setGrams('');
    setPrice('');
    setPosSlot('none');
  };

  const handleClose = () => {
    onOpenChange(false);
    // Delay reset to avoid flash during closing animation
    setTimeout(resetForm, 300);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    // Validation
    if (!name.trim()) {
      toast.error('Product name is required');
      return;
    }

    if (!grams || parseFloat(grams) <= 0) {
      toast.error('Valid weight is required');
      return;
    }

    if (!price || parseFloat(price) <= 0) {
      toast.error('Valid price is required');
      return;
    }

    setIsSubmitting(true);
    try {
      const productData = {
        code: code.trim() || undefined,
        name: name.trim(),
        grams: parseFloat(grams),
        defaultPrice: parseFloat(price),
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
            await assignSlotMutation.mutateAsync({
              id: product._id as Id<"menuProducts">,
              slot: parseInt(posSlot) as 1 | 2 | 3 | 4,
            });
          }
          // Note: Removing from slot is handled separately in the main page
        }
      } else {
        // Create new product
        const newId = await createMutation.mutateAsync(productData);

        // Assign to slot if selected
        if (posSlot !== 'none') {
          await assignSlotMutation.mutateAsync({
            id: newId as Id<"menuProducts">,
            slot: parseInt(posSlot) as 1 | 2 | 3 | 4,
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
  const cogs = product?.unitCost ?? 0;
  const priceValue = parseFloat(price) || 0;
  const margin = priceValue > 0 && cogs > 0
    ? ((priceValue - cogs) / priceValue) * 100
    : null;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="w-full sm:w-96 sm:max-w-96 p-0 flex flex-col"
      >
        <SheetHeader className="px-6 py-4 border-b">
          <SheetTitle>
            {isEditing ? 'Edit Product' : 'New Product'}
          </SheetTitle>
        </SheetHeader>

        <form onSubmit={handleSubmit} className="flex-1 flex flex-col overflow-hidden">
          <ScrollArea className="flex-1 px-6 py-4">
            <div className="space-y-4">
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

              {/* Grams */}
              <div className="space-y-2">
                <Label htmlFor="grams">Weight (grams) *</Label>
                <Input
                  id="grams"
                  type="number"
                  step="0.01"
                  value={grams}
                  onChange={(e) => setGrams(e.target.value)}
                  placeholder="e.g., 50"
                  required
                />
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
                  Calculated from linked product concept
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

              {/* Ball Production Info (if exists) */}
              {product?.productionType && product?.productionUnits && (
                <div className="rounded-lg bg-muted p-3 space-y-1">
                  <p className="text-sm font-medium">Production Info</p>
                  <p className="text-xs text-muted-foreground">
                    {product.productionUnits} {product.productionType === 'bite_sized' ? 'bite-sized' : 'original'} balls per unit
                  </p>
                </div>
              )}
            </div>
          </ScrollArea>

          <SheetFooter className="px-6 py-4 border-t">
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
          </SheetFooter>
        </form>
      </SheetContent>
    </Sheet>
  );
}
