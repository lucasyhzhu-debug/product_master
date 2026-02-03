import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useDocumentTitle } from '@/hooks/useDocumentTitle';
import { ArrowLeft, Plus, Pencil, Trash2, ArrowUp, ArrowDown } from 'lucide-react';
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
  type PosProduct,
  type LegacyProduct,
} from '@/hooks/convex/useMenuProducts';
import { formatCurrency, formatPercent } from '@/lib/utils';
import type { Id } from '../../convex/_generated/dataModel';

export function MenuProductsManager() {
  useDocumentTitle('Menu Products');
  const navigate = useNavigate();

  // Convex hooks
  const { data: posProducts, isLoading: loadingPos } = useConvexPosProducts();
  const { data: legacyProducts, isLoading: loadingLegacy } = useConvexLegacyProducts();
  const deleteMutation = useConvexDeleteMenuProduct();
  const removeFromSlotMutation = useConvexRemoveFromSlot();

  // Sheet state
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState<(PosProduct | LegacyProduct) | null>(null);

  // Delete dialog
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);

  const isLoading = loadingPos || loadingLegacy;

  const handleNewProduct = () => {
    setEditingProduct(null);
    setIsFormOpen(true);
  };

  const handleEdit = (product: PosProduct | LegacyProduct) => {
    setEditingProduct(product);
    setIsFormOpen(true);
  };

  const handleFormClose = () => {
    setIsFormOpen(false);
    setEditingProduct(null);
  };

  const handleRemoveFromPos = async (id: string) => {
    try {
      await removeFromSlotMutation.mutateAsync(id as Id<"menuProducts">);
    } catch (error) {
      // Error already handled by mutation with toast
      console.error('Failed to remove from POS:', error);
    }
  };

  const handleDelete = async () => {
    if (deleteId !== null) {
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

  const calculateMargin = (price: number, cogs: number | undefined) => {
    if (!cogs || cogs === 0) return null;
    return ((price - cogs) / price) * 100;
  };

  const renderProductCard = (
    product: PosProduct | LegacyProduct,
    showPosActions: boolean
  ) => {
    const margin = calculateMargin(product.defaultPrice, product.unitCost);
    const isPosProduct = 'posSlot' in product;

    return (
      <Card key={product._id} className="relative hover:shadow-md transition-shadow">
        <CardContent className="pt-6">
          <div className="flex items-start justify-between gap-4">
            <div className="flex-1 min-w-0">
              {/* Header with name and slot badge */}
              <div className="flex items-start gap-2 mb-2">
                <h3 className="font-semibold truncate flex-1">{product.name}</h3>
                {isPosProduct && (
                  <Badge variant="default" className="shrink-0">
                    Slot {(product as PosProduct).posSlot}
                  </Badge>
                )}
              </div>

              {/* Code */}
              <p className="text-sm text-muted-foreground mb-3">
                Code: {product.code}
              </p>

              {/* Stats Grid */}
              <div className="grid grid-cols-2 gap-3 text-sm">
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

              {/* Ball Summary */}
              {product.productionType && product.productionUnits && (
                <div className="mt-3 pt-3 border-t">
                  <p className="text-xs text-muted-foreground">
                    Production: {product.productionUnits} {product.productionType === 'bite_sized' ? 'bite-sized' : 'original'} balls
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
                className="text-primary hover:text-primary h-8 w-8 p-0"
              >
                <Pencil className="h-4 w-4" />
              </Button>
              {showPosActions && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => handleRemoveFromPos(product._id)}
                  className="text-orange-600 hover:text-orange-600 h-8 w-8 p-0"
                  title="Remove from POS"
                >
                  <ArrowDown className="h-4 w-4" />
                </Button>
              )}
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setDeleteId(product._id);
                  setShowDeleteDialog(true);
                }}
                className="text-destructive hover:text-destructive h-8 w-8 p-0"
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
    );
  };

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="sm" onClick={() => navigate(-1)}>
          <ArrowLeft className="h-4 w-4 mr-1" />
          Back
        </Button>
        <div className="flex-1">
          <h1 className="text-3xl font-bold tracking-tight">Menu Products</h1>
          <p className="text-muted-foreground">Manage POS menu and legacy products</p>
        </div>
        <Button onClick={handleNewProduct}>
          <Plus className="h-4 w-4 mr-2" />
          New Product
        </Button>
      </div>

      {isLoading ? (
        <div className="text-center py-12">
          <p className="text-muted-foreground">Loading products...</p>
        </div>
      ) : (
        <div className="space-y-6">
          {/* POS Menu Section (Slots 1-4) */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center justify-between">
                <span>POS Menu (Slots 1-4)</span>
                <Badge variant="secondary">
                  {posProducts?.length || 0} / 4 slots
                </Badge>
              </CardTitle>
            </CardHeader>
            <CardContent>
              {!posProducts || posProducts.length === 0 ? (
                <div className="text-center py-8">
                  <p className="text-muted-foreground">
                    No products assigned to POS yet
                  </p>
                  <p className="text-sm text-muted-foreground mt-1">
                    Create a product and assign it to a slot
                  </p>
                </div>
              ) : (
                <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
                  {posProducts.map((product) => renderProductCard(product, true))}
                </div>
              )}
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
                  {legacyProducts.map((product) => renderProductCard(product, false))}
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
    </div>
  );
}
