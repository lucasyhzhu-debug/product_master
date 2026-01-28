import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Plus, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ConfirmDialog } from '@/components/shared';
import { useMaterials, useCreateMaterial, useDeleteMaterial } from '@/hooks/useMaterials';
import { formatCurrency } from '@/lib/utils';
import type { PackagingMaterialCreate } from '@/lib/types';

const MATERIAL_UNITS = ['pcs', 'm', 'cm', 'sheets'];

export function MaterialsManager() {
  const navigate = useNavigate();
  const { data: materials, isLoading } = useMaterials();
  const createMaterial = useCreateMaterial();
  const deleteMaterial = useDeleteMaterial();

  // Form state
  const [name, setName] = useState('');
  const [brand, setBrand] = useState('');
  const [procurementSource, setProcurementSource] = useState('');
  const [unitType, setUnitType] = useState('pcs');
  const [volumePurchased, setVolumePurchased] = useState('');
  const [priceExclShipping, setPriceExclShipping] = useState('');
  const [shippingCost, setShippingCost] = useState('');

  // Delete dialog
  const [deleteId, setDeleteId] = useState<number | null>(null);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    if (!name || !volumePurchased || !priceExclShipping) {
      alert('Please fill in all required fields');
      return;
    }

    const data: PackagingMaterialCreate = {
      name,
      brand: brand || null,
      procurement_source: procurementSource || null,
      unit_type: unitType,
      volume_purchased: parseFloat(volumePurchased),
      price_excl_shipping: parseFloat(priceExclShipping),
      shipping_cost: shippingCost ? parseFloat(shippingCost) : 0,
    };

    createMaterial.mutate(data, {
      onSuccess: () => {
        // Reset form
        setName('');
        setBrand('');
        setProcurementSource('');
        setUnitType('pcs');
        setVolumePurchased('');
        setPriceExclShipping('');
        setShippingCost('');
      },
    });
  };

  const handleDelete = () => {
    if (deleteId !== null) {
      deleteMaterial.mutate(deleteId, {
        onSuccess: () => {
          setShowDeleteDialog(false);
          setDeleteId(null);
        },
      });
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="sm" onClick={() => navigate(-1)}>
          <ArrowLeft className="h-4 w-4 mr-1" />
          Back
        </Button>
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Packaging Materials</h1>
          <p className="text-muted-foreground">Manage your packaging material inventory</p>
        </div>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        {/* Create Form */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Plus className="h-5 w-5" />
              Add New Material
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

              <Button type="submit" className="w-full" disabled={createMaterial.isPending}>
                {createMaterial.isPending ? 'Adding...' : 'Add Material'}
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
                  <Card key={material.id} className="relative">
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
                                {material.volume_purchased} {material.unit_type}
                              </p>
                            </div>
                            <div>
                              <p className="text-muted-foreground">Cost/{material.base_unit}</p>
                              <p className="font-medium">
                                {formatCurrency(material.cost_per_base_unit)}
                              </p>
                            </div>
                          </div>
                        </div>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => {
                            setDeleteId(material.id);
                            setShowDeleteDialog(true);
                          }}
                          className="text-destructive hover:text-destructive"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
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
