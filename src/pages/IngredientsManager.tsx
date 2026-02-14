import { useState } from 'react';
import { useDocumentTitle } from '@/hooks/useDocumentTitle';
import { Plus, Trash2, Pencil, X } from 'lucide-react';
import { PageHeader } from '@/components/layout';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ConfirmDialog } from '@/components/shared';
import {
  useConvexIngredients,
  useConvexCreateIngredient,
  useConvexUpdateIngredient,
  useConvexDeleteIngredient,
} from '@/hooks/convex';
import { formatCurrency } from '@/lib/utils';
import type { Id } from '../../convex/_generated/dataModel';

const INGREDIENT_UNITS = ['g', 'kg', 'ml', 'l', 'pcs'];

export function IngredientsManager() {
  useDocumentTitle('Ingredients');

  // Convex hooks - data comes back as camelCase
  const rawIngredients = useConvexIngredients();
  const ingredients = rawIngredients ?? [];
  const isLoading = rawIngredients === undefined;

  const createMutation = useConvexCreateIngredient();
  const updateMutation = useConvexUpdateIngredient();
  const deleteMutation = useConvexDeleteIngredient();

  // Form state
  const [editingId, setEditingId] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [brand, setBrand] = useState('');
  const [procurementSource, setProcurementSource] = useState('');
  const [unitType, setUnitType] = useState('g');
  const [volumePurchased, setVolumePurchased] = useState('');
  const [priceExclShipping, setPriceExclShipping] = useState('');
  const [shippingCost, setShippingCost] = useState('');

  // Delete dialog
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const resetForm = () => {
    setEditingId(null);
    setName('');
    setBrand('');
    setProcurementSource('');
    setUnitType('g');
    setVolumePurchased('');
    setPriceExclShipping('');
    setShippingCost('');
  };

  // Handle edit - Convex returns camelCase
  const handleEdit = (ingredient: typeof ingredients[0]) => {
    setEditingId(ingredient._id);
    setName(ingredient.name);
    setBrand(ingredient.brand || '');
    setProcurementSource(ingredient.procurementSource || '');
    setUnitType(ingredient.unitType);
    setVolumePurchased(ingredient.volumePurchased.toString());
    setPriceExclShipping(ingredient.priceExclShipping.toString());
    setShippingCost(ingredient.shippingCost.toString());
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!name || !volumePurchased || !priceExclShipping) {
      alert('Please fill in all required fields');
      return;
    }

    setIsSubmitting(true);
    try {
      // Convex mutations expect camelCase
      const data = {
        name,
        brand: brand || undefined,
        procurementSource: procurementSource || undefined,
        unitType,
        volumePurchased: parseFloat(volumePurchased),
        priceExclShipping: parseFloat(priceExclShipping),
        shippingCost: shippingCost ? parseFloat(shippingCost) : 0,
      };

      if (editingId !== null) {
        await updateMutation.mutate({
          id: editingId as Id<"ingredients">,
          ...data,
        });
      } else {
        await createMutation.mutate(data);
      }
      resetForm();
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async () => {
    if (deleteId !== null) {
      try {
        await deleteMutation.mutate({ id: deleteId as Id<"ingredients"> });
        setShowDeleteDialog(false);
        setDeleteId(null);
      } catch {
        // Error is handled by the mutation with toast
      }
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Ingredients"
        description="Manage your ingredient inventory"
        backTo="/menu-products"
        backLabel="Back to Products"
      />

      <div className="grid gap-6 md:grid-cols-2">
        {/* Create/Edit Form */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                {editingId ? <Pencil className="h-5 w-5" /> : <Plus className="h-5 w-5" />}
                {editingId ? 'Edit Ingredient' : 'Add New Ingredient'}
              </div>
              {editingId && (
                <Button variant="ghost" size="sm" onClick={resetForm}>
                  <X className="h-4 w-4 mr-1" />
                  Cancel
                </Button>
              )}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="name">Name *</Label>
                <Input
                  id="name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g., Wheat Flour"
                  required
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="brand">Brand</Label>
                <Input
                  id="brand"
                  value={brand}
                  onChange={(e) => setBrand(e.target.value)}
                  placeholder="e.g., Bogasari"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="source">Procurement Source</Label>
                <Input
                  id="source"
                  value={procurementSource}
                  onChange={(e) => setProcurementSource(e.target.value)}
                  placeholder="e.g., Tokopedia, Local Supplier"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="volume">Volume Purchased *</Label>
                  <Input
                    id="volume"
                    type="number"
                    step="0.01"
                    value={volumePurchased}
                    onChange={(e) => setVolumePurchased(e.target.value)}
                    placeholder="e.g., 25"
                    required
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="unit">Unit *</Label>
                  <Select value={unitType} onValueChange={setUnitType}>
                    <SelectTrigger id="unit">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {INGREDIENT_UNITS.map((unit) => (
                        <SelectItem key={unit} value={unit}>
                          {unit}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="price">Price (Excl. Shipping) *</Label>
                <Input
                  id="price"
                  type="number"
                  step="0.01"
                  value={priceExclShipping}
                  onChange={(e) => setPriceExclShipping(e.target.value)}
                  placeholder="IDR"
                  required
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="shipping">Shipping Cost</Label>
                <Input
                  id="shipping"
                  type="number"
                  step="0.01"
                  value={shippingCost}
                  onChange={(e) => setShippingCost(e.target.value)}
                  placeholder="IDR (optional)"
                />
              </div>

              <Button
                type="submit"
                className="w-full"
                disabled={isSubmitting}
              >
                {editingId
                  ? (isSubmitting ? 'Updating...' : 'Update Ingredient')
                  : (isSubmitting ? 'Adding...' : 'Add Ingredient')
                }
              </Button>
            </form>
          </CardContent>
        </Card>

        {/* List */}
        <Card>
          <CardHeader>
            <CardTitle>All Ingredients ({ingredients?.length || 0})</CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <p className="text-muted-foreground">Loading...</p>
            ) : !ingredients || ingredients.length === 0 ? (
              <p className="text-muted-foreground">No ingredients yet. Add one to get started!</p>
            ) : (
              <div className="space-y-3 max-h-[600px] overflow-y-auto">
                {ingredients.map((ingredient) => (
                  <Card key={ingredient._id} className="relative">
                    <CardContent className="pt-6">
                      <div className="flex items-start justify-between">
                        <div className="flex-1">
                          <h3 className="font-semibold">{ingredient.name}</h3>
                          {ingredient.brand && (
                            <p className="text-sm text-muted-foreground">{ingredient.brand}</p>
                          )}
                          <div className="mt-2 grid grid-cols-2 gap-2 text-sm">
                            <div>
                              <p className="text-muted-foreground">Volume</p>
                              <p className="font-medium">
                                {ingredient.volumePurchased} {ingredient.unitType}
                              </p>
                            </div>
                            <div>
                              <p className="text-muted-foreground">Cost/{ingredient.baseUnit}</p>
                              <p className="font-medium">
                                {formatCurrency(ingredient.costPerBaseUnit ?? 0)}
                              </p>
                            </div>
                          </div>
                        </div>
                        <div className="flex gap-1">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleEdit(ingredient)}
                            className="text-primary hover:text-primary"
                          >
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => {
                              setDeleteId(ingredient._id);
                              setShowDeleteDialog(true);
                            }}
                            className="text-destructive hover:text-destructive"
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <ConfirmDialog
        open={showDeleteDialog}
        onOpenChange={setShowDeleteDialog}
        onConfirm={handleDelete}
        title="Delete Ingredient"
        description="Are you sure you want to delete this ingredient? This action cannot be undone."
      />
    </div>
  );
}
