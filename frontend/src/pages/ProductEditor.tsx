import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Trash2, Copy, Save } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { PageHeader } from '@/components/layout';
import { VersionNavigator, ConfirmDialog } from '@/components/shared';
import { Skeleton } from '@/components/ui/skeleton';
import { useProduct, useProductVersion, useCreateProduct, useCreateProductVersion, useCopyProductVersion, useDeleteProduct } from '@/hooks/useProducts';
import { useRecipes } from '@/hooks/useRecipes';
import { usePackagingRecipes } from '@/hooks/usePackaging';
import { useTags } from '@/hooks/useTags';
import { formatCurrency, formatPercent, cn } from '@/lib/utils';

export function ProductEditor() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const isNew = id === 'new';
  const productId = isNew ? 0 : parseInt(id || '0', 10);

  const { data: product, isLoading: loadingProduct } = useProduct(productId);
  const { data: recipes } = useRecipes();
  const { data: packagingList } = usePackagingRecipes();
  const { data: tags } = useTags();

  const [currentVersionNumber, setCurrentVersionNumber] = useState(1);
  const { data: versionDetail } = useProductVersion(productId, currentVersionNumber);

  const createProduct = useCreateProduct();
  const createVersion = useCreateProductVersion();
  const copyVersion = useCopyProductVersion();
  const deleteProduct = useDeleteProduct();

  // Form state
  const [name, setName] = useState('');
  const [versionName, setVersionName] = useState('');
  const [description, setDescription] = useState('');
  const [selectedTags, setSelectedTags] = useState<number[]>([]);
  const [recipeVersionId, setRecipeVersionId] = useState<number | null>(null);
  const [packagingVersionId, setPackagingVersionId] = useState<number | null>(null);
  const [retailPrice, setRetailPrice] = useState('');
  const [numPieces, setNumPieces] = useState('1');
  const [gramsPerPiece, setGramsPerPiece] = useState('');

  // Selected recipe/packaging for version selection
  const [selectedRecipeId, setSelectedRecipeId] = useState<number | null>(null);
  const [selectedPackagingId, setSelectedPackagingId] = useState<number | null>(null);

  // Dialog states
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [showCopyDialog, setShowCopyDialog] = useState(false);
  const [copyVersionName, setCopyVersionName] = useState('');
  const [copyDescription, setCopyDescription] = useState('');

  // Initialize form when product data loads
  useEffect(() => {
    if (product && !isNew) {
      setName(product.name);
      setSelectedTags(product.tags.map(t => t.id));
      if (product.versions.length > 0) {
        const latestVersion = Math.max(...product.versions.map(v => v.version_number));
        setCurrentVersionNumber(latestVersion);
      }
    }
  }, [product, isNew]);

  useEffect(() => {
    if (versionDetail && !isNew) {
      setVersionName(versionDetail.version_name);
      setDescription(versionDetail.description || '');
      setRecipeVersionId(versionDetail.recipe_version_id);
      setPackagingVersionId(versionDetail.packaging_version_id);
      setRetailPrice(versionDetail.retail_price_idr.toString());
      setNumPieces(versionDetail.num_pieces.toString());
      setGramsPerPiece(versionDetail.grams_per_piece.toString());

      // For existing products, we keep the current selections shown in the UI
      // User can change recipe/packaging when creating a new version
    }
  }, [versionDetail, isNew, recipes]);

  const selectedRecipe = recipes?.find(r => r.id === selectedRecipeId);
  const selectedPackaging = packagingList?.find(p => p.id === selectedPackagingId);

  // Compute inherited tags from recipe and packaging
  const inheritedTags = new Set<number>();
  if (selectedRecipe) {
    selectedRecipe.tags.forEach(tag => inheritedTags.add(tag.id));
  }
  if (selectedPackaging) {
    selectedPackaging.tags.forEach(tag => inheritedTags.add(tag.id));
  }

  const handleSave = async () => {
    // Validate
    if (!name.trim()) {
      alert('Product name is required');
      return;
    }
    if (!versionName.trim()) {
      alert('Version name is required');
      return;
    }
    if (!description.trim()) {
      alert('Description is required');
      return;
    }
    if (!recipeVersionId) {
      alert('Recipe is required');
      return;
    }
    if (!packagingVersionId) {
      alert('Packaging is required');
      return;
    }
    if (!retailPrice || parseFloat(retailPrice) <= 0) {
      alert('Valid retail price is required');
      return;
    }
    if (!gramsPerPiece || parseFloat(gramsPerPiece) <= 0) {
      alert('Valid grams per piece is required');
      return;
    }

    try {
      if (isNew) {
        const result = await createProduct.mutateAsync({
          name,
          tag_ids: Array.from(inheritedTags).concat(selectedTags),
          first_version: {
            version_name: versionName,
            description,
            recipe_version_id: recipeVersionId,
            packaging_version_id: packagingVersionId,
            retail_price_idr: parseFloat(retailPrice),
            num_pieces: parseInt(numPieces, 10) || 1,
            grams_per_piece: parseFloat(gramsPerPiece),
          },
        });
        navigate(`/products/${result.id}`);
      } else {
        await createVersion.mutateAsync({
          productId,
          data: {
            version_name: versionName,
            description,
            recipe_version_id: recipeVersionId,
            packaging_version_id: packagingVersionId,
            retail_price_idr: parseFloat(retailPrice),
            num_pieces: parseInt(numPieces, 10) || 1,
            grams_per_piece: parseFloat(gramsPerPiece),
          },
        });
      }
    } catch (error) {
      console.error('Failed to save product:', error);
      alert('Failed to save product');
    }
  };

  const handleCopyVersion = async () => {
    if (!versionDetail) return;
    try {
      await copyVersion.mutateAsync({
        productId,
        data: {
          copy_from_version_id: versionDetail.id,
          version_name: copyVersionName,
          description: copyDescription,
        },
      });
      setShowCopyDialog(false);
      setCopyVersionName('');
      setCopyDescription('');
    } catch (error) {
      console.error('Failed to copy version:', error);
      alert('Failed to copy version');
    }
  };

  const handleDelete = async () => {
    try {
      await deleteProduct.mutateAsync(productId);
      navigate('/products');
    } catch (error: unknown) {
      console.error('Failed to delete product:', error);
      const errorMessage = error instanceof Error ? error.message : 'Failed to delete product';
      alert(errorMessage);
    }
  };

  // COGS data
  const cogs = versionDetail?.cogs;
  const marginColor =
    cogs?.contribution_margin_pct !== null && cogs?.contribution_margin_pct !== undefined
      ? cogs.contribution_margin_pct >= 30
        ? 'text-green-600'
        : cogs.contribution_margin_pct >= 15
        ? 'text-yellow-600'
        : 'text-red-600'
      : '';

  if (!isNew && loadingProduct) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-96 w-full" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title={isNew ? 'New Product' : name}
        backTo="/"
        backLabel="Dashboard"
        action={
          !isNew && (
            <div className="flex items-center gap-2">
              <VersionNavigator
                currentVersion={currentVersionNumber}
                totalVersions={product?.versions.length || 1}
                versionName={versionDetail?.version_name || ''}
                onPrevious={() => setCurrentVersionNumber((v) => v - 1)}
                onNext={() => setCurrentVersionNumber((v) => v + 1)}
              />
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setCopyVersionName(`${versionDetail?.version_name} (Copy)`);
                  setCopyDescription(versionDetail?.description || '');
                  setShowCopyDialog(true);
                }}
              >
                <Copy className="h-4 w-4 mr-1" />
                Copy
              </Button>
              <Button
                variant="destructive"
                size="sm"
                onClick={() => setShowDeleteDialog(true)}
              >
                <Trash2 className="h-4 w-4 mr-1" />
                Delete
              </Button>
            </div>
          )
        }
      />

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Product Details */}
        <Card>
          <CardHeader>
            <CardTitle>Product Details</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="name">Product Name</Label>
              <Input
                id="name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g., Pistachio Cookies Box"
                disabled={!isNew}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="version-name">Version Name</Label>
              <Input
                id="version-name"
                value={versionName}
                onChange={(e) => setVersionName(e.target.value)}
                placeholder="e.g., Launch Version"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="description">Description</Label>
              <Textarea
                id="description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Describe this version..."
                rows={3}
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="retail-price">Retail Price (IDR)</Label>
                <Input
                  id="retail-price"
                  type="number"
                  value={retailPrice}
                  onChange={(e) => setRetailPrice(e.target.value)}
                  placeholder="e.g., 50000"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="num-pieces">Number of Pieces</Label>
                <Input
                  id="num-pieces"
                  type="number"
                  value={numPieces}
                  onChange={(e) => setNumPieces(e.target.value)}
                  placeholder="1"
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="grams-per-piece">Grams per Piece</Label>
              <Input
                id="grams-per-piece"
                type="number"
                value={gramsPerPiece}
                onChange={(e) => setGramsPerPiece(e.target.value)}
                placeholder="e.g., 25"
              />
            </div>

            <div className="space-y-2">
              <Label>Tags</Label>
              <div className="space-y-2">
                {inheritedTags.size > 0 && (
                  <div>
                    <p className="text-xs text-muted-foreground mb-2">Inherited from recipe & packaging:</p>
                    <div className="flex flex-wrap gap-1">
                      {Array.from(inheritedTags).map((tagId) => {
                        const tag = tags?.find(t => t.id === tagId);
                        return tag ? (
                          <Badge key={tag.id} variant="secondary">
                            {tag.name}
                          </Badge>
                        ) : null;
                      })}
                    </div>
                  </div>
                )}
                <p className="text-xs text-muted-foreground">Additional tags:</p>
                <div className="flex flex-wrap gap-1">
                  {tags?.map((tag) => (
                    <Badge
                      key={tag.id}
                      variant={selectedTags.includes(tag.id) ? 'default' : 'outline'}
                      className="cursor-pointer"
                      onClick={() =>
                        setSelectedTags(
                          selectedTags.includes(tag.id)
                            ? selectedTags.filter((t) => t !== tag.id)
                            : [...selectedTags, tag.id]
                        )
                      }
                    >
                      {tag.name}
                    </Badge>
                  ))}
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Recipe & Packaging Selection */}
        <Card>
          <CardHeader>
            <CardTitle>Recipe & Packaging</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Recipe Selection */}
            <div className="space-y-2">
              <Label>Recipe</Label>
              <Select
                value={selectedRecipeId?.toString() || ''}
                onValueChange={(value) => {
                  setSelectedRecipeId(parseInt(value, 10));
                  setRecipeVersionId(null);
                }}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select a recipe" />
                </SelectTrigger>
                <SelectContent>
                  {recipes?.map((recipe) => (
                    <SelectItem key={recipe.id} value={recipe.id.toString()}>
                      {recipe.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {selectedRecipeId && (
              <div className="space-y-2">
                <Label>Recipe Version</Label>
                <Select
                  value={recipeVersionId?.toString() || ''}
                  onValueChange={(value) => setRecipeVersionId(parseInt(value, 10))}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select version" />
                  </SelectTrigger>
                  <SelectContent>
                    {/* We need to fetch the recipe to get versions */}
                    <SelectItem value={selectedRecipe?.latest_version?.toString() || '1'}>
                      Version {selectedRecipe?.latest_version} - {selectedRecipe?.latest_version_name}
                    </SelectItem>
                  </SelectContent>
                </Select>
                {selectedRecipe && (
                  <p className="text-xs text-muted-foreground">
                    Cost: {formatCurrency(selectedRecipe.total_cost)}
                    {selectedRecipe.cost_per_gram !== null && (
                      <> ({formatCurrency(selectedRecipe.cost_per_gram)}/g)</>
                    )}
                  </p>
                )}
              </div>
            )}

            {/* Packaging Selection */}
            <div className="space-y-2">
              <Label>Packaging</Label>
              <Select
                value={selectedPackagingId?.toString() || ''}
                onValueChange={(value) => {
                  setSelectedPackagingId(parseInt(value, 10));
                  setPackagingVersionId(null);
                }}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select packaging" />
                </SelectTrigger>
                <SelectContent>
                  {packagingList?.map((pkg) => (
                    <SelectItem key={pkg.id} value={pkg.id.toString()}>
                      {pkg.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {selectedPackagingId && (
              <div className="space-y-2">
                <Label>Packaging Version</Label>
                <Select
                  value={packagingVersionId?.toString() || ''}
                  onValueChange={(value) => setPackagingVersionId(parseInt(value, 10))}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select version" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={selectedPackaging?.latest_version?.toString() || '1'}>
                      Version {selectedPackaging?.latest_version} - {selectedPackaging?.latest_version_name}
                    </SelectItem>
                  </SelectContent>
                </Select>
                {selectedPackaging && (
                  <p className="text-xs text-muted-foreground">
                    Cost: {formatCurrency(selectedPackaging.total_cost)}
                  </p>
                )}
              </div>
            )}

            {/* Show existing selections for non-new products */}
            {!isNew && versionDetail && (
              <div className="pt-4 border-t space-y-2">
                <p className="text-sm text-muted-foreground">Current Selections:</p>
                <p className="text-sm">
                  <strong>Recipe:</strong> {versionDetail.recipe_name} (v{versionDetail.recipe_version_name})
                </p>
                <p className="text-sm">
                  <strong>Packaging:</strong> {versionDetail.packaging_name} (v{versionDetail.packaging_version_name})
                </p>
              </div>
            )}
          </CardContent>
        </Card>

        {/* COGS Breakdown */}
        {cogs && (
          <Card className="lg:col-span-2">
            <CardHeader>
              <CardTitle>COGS Breakdown</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                <div className="space-y-1">
                  <p className="text-sm text-muted-foreground">Total Grams</p>
                  <p className="text-2xl font-bold">{cogs.total_grams}g</p>
                </div>
                <div className="space-y-1">
                  <p className="text-sm text-muted-foreground">Recipe COGS</p>
                  <p className="text-2xl font-bold">{formatCurrency(cogs.recipe_cogs)}</p>
                </div>
                <div className="space-y-1">
                  <p className="text-sm text-muted-foreground">Packaging COGS</p>
                  <p className="text-2xl font-bold">{formatCurrency(cogs.packaging_cogs)}</p>
                </div>
                <div className="space-y-1">
                  <p className="text-sm text-muted-foreground">Total COGS</p>
                  <p className="text-2xl font-bold">{formatCurrency(cogs.total_cogs)}</p>
                </div>
              </div>

              <div className="mt-6 pt-6 border-t grid gap-4 sm:grid-cols-3">
                <div className="space-y-1">
                  <p className="text-sm text-muted-foreground">Retail Price</p>
                  <p className="text-2xl font-bold">{formatCurrency(cogs.retail_price_idr)}</p>
                </div>
                <div className="space-y-1">
                  <p className="text-sm text-muted-foreground">Contribution Margin</p>
                  <p className="text-2xl font-bold">{formatCurrency(cogs.contribution_margin)}</p>
                </div>
                <div className="space-y-1">
                  <p className="text-sm text-muted-foreground">Margin %</p>
                  <p className={cn('text-2xl font-bold', marginColor)}>
                    {formatPercent(cogs.contribution_margin_pct)}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        )}
      </div>

      {/* Save Button */}
      <div className="flex justify-end">
        <Button
          size="lg"
          onClick={handleSave}
          disabled={createProduct.isPending || createVersion.isPending}
        >
          <Save className="h-4 w-4 mr-2" />
          {isNew ? 'Create Product' : 'Save New Version'}
        </Button>
      </div>

      {/* Dialogs */}
      <ConfirmDialog
        open={showDeleteDialog}
        onOpenChange={setShowDeleteDialog}
        title="Delete Product"
        description="Are you sure you want to delete this product? This action cannot be undone."
        confirmLabel="Delete"
        variant="destructive"
        onConfirm={handleDelete}
        loading={deleteProduct.isPending}
      />

      {/* Copy Version Dialog */}
      {showCopyDialog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80">
          <Card className="w-full max-w-md">
            <CardHeader>
              <CardTitle>Copy Version</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label>Version Name</Label>
                <Input
                  value={copyVersionName}
                  onChange={(e) => setCopyVersionName(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label>Description</Label>
                <Textarea
                  value={copyDescription}
                  onChange={(e) => setCopyDescription(e.target.value)}
                  rows={3}
                />
              </div>
              <div className="flex justify-end gap-2">
                <Button variant="outline" onClick={() => setShowCopyDialog(false)}>
                  Cancel
                </Button>
                <Button onClick={handleCopyVersion} disabled={copyVersion.isPending}>
                  Create Copy
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
