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
  useConvexMaterials,
  useConvexCreateMaterial,
  useConvexUpdateMaterial,
  useConvexDeleteMaterial,
} from '@/hooks/convex';
import { formatCurrency } from '@/lib/utils';
import type { Id } from '../../convex/_generated/dataModel';

const MATERIAL_UNITS = ['pcs', 'm', 'cm', 'sheets'];

export function MaterialsManager() {
  useDocumentTitle('Materials');

  // Convex hooks - data comes back as camelCase
  const rawMaterials = useConvexMaterials();
  const materials = rawMaterials ?? [];
  const isLoading = rawMaterials === undefined;

  const createMutation = useConvexCreateMaterial();
  const updateMutation = useConvexUpdateMaterial();
  const deleteMutation = useConvexDeleteMaterial();

  // Form state
  const [editingId, setEditingId] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [brand, setBrand] = useState('');
  const [procurementSource, setProcurementSource] = useState('');
  const [unitType, setUnitType] = useState('pcs');
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
    setUnitType('pcs');
    setVolumePurchased('');
    setPriceExclShipping('');
    setShippingCost('');
  };

  // Handle edit - Convex returns camelCase
  const handleEdit = (material: typeof materials[0]) => {
    setEditingId(material._id);
    setName(material.name);
    setBrand(material.brand || '');
    setProcurementSource(material.procurementSource || '');
    setUnitType(material.unitType);
    setVolumePurchased(material.volumePurchased.toString());
    setPriceExclShipping(material.priceExclShipping.toString());
    setShippingCost(material.shippingCost.toString());
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
          id: editingId as Id<"packagingMaterials">,
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
        await deleteMutation.mutate({ id: deleteId as Id<"packagingMaterials"> });
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
        title="Packaging Materials"
        description="Manage your packaging material inventory"
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
                {editingId ? 'Edit Material' : 'Add New Material'}
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
                  placeholder="e.g., Plastic Pouch"
                  required
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="brand">Brand</Label>
                <Input
                  id="brand"
                  value={brand}
                  onChange={(e) => setBrand(e.target.value)}
                  placeholder="e.g., PolyPack"
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
                    placeholder="e.g., 1000"
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
                      {MATERIAL_UNITS.map((unit) => (
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
                  ? (isSubmitting ? 'Updating...' : 'Update Material')
                  : (isSubmitting ? 'Adding...' : 'Add Material')
                }
              </Button>
            </form>
          </CardContent>
        </Card>

        {/* List */}
        <Card>
          <CardHeader>
            <CardTitle>All Materials ({materials?.length || 0})</CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <p className="text-muted-foreground">Loading...</p>
            ) : !materials || materials.length === 0 ? (
              <p className="text-muted-foreground">No materials yet. Add one to get started!</p>
            ) : (
              <div className="space-y-3 max-h-[600px] overflow-y-auto">
                {materials.map((material) => (
                  <Card key={material._id} className="relative">
                    <CardContent className="pt-6">
                      <div className="flex items-start justify-between">
                        <div className="flex-1">
                          <h3 className="font-semibold">{material.name}</h3>
                          {material.brand && (
                            <p className="text-sm text-muted-foreground">{material.brand}</p>
                          )}
                          <div className="mt-2 grid grid-cols-2 gap-2 text-sm">
                            <div>
                              <p className="text-muted-foreground">Volume</p>
                              <p className="font-medium">
                                {material.volumePurchased} {material.unitType}
                              </p>
                            </div>
                            <div>
                              <p className="text-muted-foreground">Cost/{material.baseUnit}</p>
                              <p className="font-medium">
                                {formatCurrency(material.costPerBaseUnit ?? 0)}
                              </p>
                            </div>
                          </div>
                        </div>
                        <div className="flex gap-1">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleEdit(material)}
                            className="text-primary hover:text-primary"
                          >
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => {
                              setDeleteId(material._id);
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
        title="Delete Material"
        description="Are you sure you want to delete this material? This action cannot be undone."
      />
    </div>
  );
}
