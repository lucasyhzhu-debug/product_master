import { useState, useEffect, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useDocumentTitle } from '@/hooks/useDocumentTitle';
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
import {
  useConvexProduct,
  useConvexProductVersion,
  useConvexCreateProduct,
  useConvexCreateProductVersion,
  useConvexCopyProductVersion,
  useConvexDeleteProduct,
} from '@/hooks/convex';
import { useConvexRecipes, useConvexPackagingList, useConvexTags } from '@/hooks/convex';
import type { Id } from '../../convex/_generated/dataModel';
import type { ProductVersionInput } from '@/hooks/convex/useProducts';
import { formatCurrency, formatPercent, cn } from '@/lib/utils';

export function ProductEditor() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const isNew = id === 'new';
  useDocumentTitle(isNew ? 'New Product' : 'Edit Product');
  // Convex uses string IDs directly
  const productId = isNew ? undefined : (id as Id<"products">);

  const product = useConvexProduct(productId);
  const rawRecipes = useConvexRecipes();
  const rawPackagingList = useConvexPackagingList();
  const rawTags = useConvexTags();

  // Normalize data for loading state - memoize to avoid dependency changes
  const recipes = useMemo(() => rawRecipes ?? [], [rawRecipes]);
  const packagingList = useMemo(() => rawPackagingList ?? [], [rawPackagingList]);
  const tags = useMemo(() => rawTags ?? [], [rawTags]);
  const loadingProduct = productId !== undefined && product === undefined;

  // Track current version by its _id (not version number)
  const [currentVersionId, setCurrentVersionId] = useState<Id<"productVersions"> | undefined>(undefined);
  const [currentVersionIndex, setCurrentVersionIndex] = useState(0);

  const versionDetail = useConvexProductVersion(currentVersionId);

  const createProduct = useConvexCreateProduct();
  const createVersion = useConvexCreateProductVersion();
  const copyVersion = useConvexCopyProductVersion();
  const deleteProduct = useConvexDeleteProduct();

  // Form state
  const [name, setName] = useState('');
  const [versionName, setVersionName] = useState('');
  const [description, setDescription] = useState('');
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [recipeVersionId, setRecipeVersionId] = useState<Id<"recipeVersions"> | null>(null);
  const [packagingVersionId, setPackagingVersionId] = useState<Id<"packagingVersions"> | null>(null);
  const [retailPrice, setRetailPrice] = useState('');
  const [numPieces, setNumPieces] = useState('1');
  const [gramsPerPiece, setGramsPerPiece] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Selected recipe/packaging for version selection
  const [selectedRecipeId, setSelectedRecipeId] = useState<Id<"recipes"> | null>(null);
  const [selectedPackagingId, setSelectedPackagingId] = useState<Id<"packagingRecipes"> | null>(null);

  // Dialog states
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [showCopyDialog, setShowCopyDialog] = useState(false);
  const [copyVersionName, setCopyVersionName] = useState('');
  const [copyDescription, setCopyDescription] = useState('');

  // Sorted versions for navigation
  const sortedVersions = useMemo(() => {
    if (!product?.versions) return [];
    return [...product.versions].sort((a, b) => a.versionNumber - b.versionNumber);
  }, [product?.versions]);

  // Initialize form when product data loads
  useEffect(() => {
    if (product && !isNew) {
      setName(product.name);
      setSelectedTags(product.tags.map(t => t._id));
      if (sortedVersions.length > 0) {
        const latestVersion = sortedVersions[sortedVersions.length - 1];
        setCurrentVersionId(latestVersion._id);
        setCurrentVersionIndex(sortedVersions.length - 1);
      }
    }
  }, [product, isNew, sortedVersions]);

  useEffect(() => {
    if (versionDetail && !isNew) {
      setVersionName(versionDetail.versionName);
      setDescription(versionDetail.description || '');
      setRecipeVersionId(versionDetail.recipeVersionId);
      setPackagingVersionId(versionDetail.packagingVersionId);
      setRetailPrice(versionDetail.retailPriceIdr.toString());
      setNumPieces(versionDetail.numPieces.toString());
      setGramsPerPiece(versionDetail.gramsPerPiece.toString());
    }
  }, [versionDetail, isNew]);

  const handleVersionNavigate = (direction: 'prev' | 'next') => {
    const newIndex = direction === 'prev' ? currentVersionIndex - 1 : currentVersionIndex + 1;
    if (newIndex >= 0 && newIndex < sortedVersions.length) {
      setCurrentVersionIndex(newIndex);
      setCurrentVersionId(sortedVersions[newIndex]._id);
    }
  };

  const selectedRecipe = recipes.find(r => r._id === selectedRecipeId);
  const selectedPackaging = packagingList.find(p => p._id === selectedPackagingId);

  // Compute inherited tags from recipe and packaging
  // Convex tags come as { _id, name } objects in the recipe/packaging
  const inheritedTags = useMemo(() => {
    const inherited = new Set<string>();
    if (selectedRecipe?.tags) {
      selectedRecipe.tags.forEach(tag => {
        if (typeof tag === 'string') {
          // Tag is a string name, find the matching tag ID
          const foundTag = tags.find(t => t.name === tag);
          if (foundTag) inherited.add(foundTag._id);
        } else if (tag._id) {
          inherited.add(tag._id);
        }
      });
    }
    if (selectedPackaging?.tags) {
      selectedPackaging.tags.forEach(tag => {
        if (typeof tag === 'string') {
          const foundTag = tags.find(t => t.name === tag);
          if (foundTag) inherited.add(foundTag._id);
        } else if (tag._id) {
          inherited.add(tag._id);
        }
      });
    }
    return inherited;
  }, [selectedRecipe, selectedPackaging, tags]);

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

    const versionData: ProductVersionInput = {
      versionName,
      description,
      recipeVersionId,
      packagingVersionId,
      retailPriceIdr: parseFloat(retailPrice),
      numPieces: parseInt(numPieces, 10) || 1,
      gramsPerPiece: parseFloat(gramsPerPiece),
    };

    setIsSubmitting(true);
    try {
      if (isNew) {
        const result = await createProduct.mutateAsync({
          name,
          tagIds: Array.from(inheritedTags).concat(selectedTags) as Id<"tags">[],
          firstVersion: versionData,
        });
        navigate(`/products/${result}`);
      } else if (productId) {
        await createVersion.mutateAsync({
          productId,
          versionData,
        });
      }
    } catch (error) {
      console.error('Failed to save product:', error);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleCopyVersion = async () => {
    if (!versionDetail || !productId || !currentVersionId) return;
    try {
      await copyVersion.mutateAsync({
        productId,
        copyFromVersionId: currentVersionId,
        versionName: copyVersionName,
        description: copyDescription,
      });
      setShowCopyDialog(false);
      setCopyVersionName('');
      setCopyDescription('');
    } catch (error) {
      console.error('Failed to copy version:', error);
    }
  };

  const handleDelete = async () => {
    if (!productId) return;
    try {
      await deleteProduct.mutateAsync(productId);
      navigate('/');
    } catch (error: unknown) {
      console.error('Failed to delete product:', error);
    }
  };

  // COGS data
  const cogs = versionDetail?.cogs;
  const marginColor =
    cogs?.contributionMarginPct !== null && cogs?.contributionMarginPct !== undefined
      ? cogs.contributionMarginPct >= 30
        ? 'text-green-600'
        : cogs.contributionMarginPct >= 15
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
                currentVersion={currentVersionIndex + 1}
                totalVersions={sortedVersions.length}
                versionName={versionDetail?.versionName || ''}
                onPrevious={() => handleVersionNavigate('prev')}
                onNext={() => handleVersionNavigate('next')}
              />
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setCopyVersionName(`${versionDetail?.versionName} (Copy)`);
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
                        const tag = tags.find(t => t._id === tagId);
                        return tag ? (
                          <Badge key={tag._id} variant="secondary">
                            {tag.name}
                          </Badge>
                        ) : null;
                      })}
                    </div>
                  </div>
                )}
                <p className="text-xs text-muted-foreground">Additional tags:</p>
                <div className="flex flex-wrap gap-1">
                  {tags.map((tag) => (
                    <Badge
                      key={tag._id}
                      variant={selectedTags.includes(tag._id) ? 'default' : 'outline'}
                      className="cursor-pointer"
                      onClick={() =>
                        setSelectedTags(
                          selectedTags.includes(tag._id)
                            ? selectedTags.filter((t) => t !== tag._id)
                            : [...selectedTags, tag._id]
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
                value={selectedRecipeId || ''}
                onValueChange={(value) => {
                  setSelectedRecipeId(value as Id<"recipes">);
                  setRecipeVersionId(null);
                }}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select a recipe" />
                </SelectTrigger>
                <SelectContent>
                  {recipes.map((recipe) => (
                    <SelectItem key={recipe._id} value={recipe._id}>
                      {recipe.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {selectedRecipeId && selectedRecipe && (
              <div className="space-y-2">
                <Label>Recipe Version</Label>
                <Select
                  value={recipeVersionId || ''}
                  onValueChange={(value) => setRecipeVersionId(value as Id<"recipeVersions">)}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select version" />
                  </SelectTrigger>
                  <SelectContent>
                    {selectedRecipe.versions?.map((version) => (
                      <SelectItem key={version._id} value={version._id}>
                        Version {version.versionNumber} - {version.versionName}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">
                  Cost: {formatCurrency(selectedRecipe.latestVersionCost ?? 0)}
                  {selectedRecipe.latestCostPerGram !== null && (
                    <> ({formatCurrency(selectedRecipe.latestCostPerGram)}/g)</>
                  )}
                </p>
              </div>
            )}

            {/* Packaging Selection */}
            <div className="space-y-2">
              <Label>Packaging</Label>
              <Select
                value={selectedPackagingId || ''}
                onValueChange={(value) => {
                  setSelectedPackagingId(value as Id<"packagingRecipes">);
                  setPackagingVersionId(null);
                }}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select packaging" />
                </SelectTrigger>
                <SelectContent>
                  {packagingList.map((pkg) => (
                    <SelectItem key={pkg._id} value={pkg._id}>
                      {pkg.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {selectedPackagingId && selectedPackaging && (
              <div className="space-y-2">
                <Label>Packaging Version</Label>
                <Select
                  value={packagingVersionId || ''}
                  onValueChange={(value) => setPackagingVersionId(value as Id<"packagingVersions">)}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select version" />
                  </SelectTrigger>
                  <SelectContent>
                    {selectedPackaging.versions?.map((version) => (
                      <SelectItem key={version._id} value={version._id}>
                        Version {version.versionNumber} - {version.versionName}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">
                  Cost: {formatCurrency(selectedPackaging.latestVersionCost ?? 0)}
                </p>
              </div>
            )}

            {/* Show existing selections for non-new products */}
            {!isNew && versionDetail && (
              <div className="pt-4 border-t space-y-2">
                <p className="text-sm text-muted-foreground">Current Selections:</p>
                <p className="text-sm">
                  <strong>Recipe:</strong> {versionDetail.recipeName} (v{versionDetail.recipeVersionName})
                </p>
                <p className="text-sm">
                  <strong>Packaging:</strong> {versionDetail.packagingName} (v{versionDetail.packagingVersionName})
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
                  <p className="text-2xl font-bold">{cogs.totalGrams}g</p>
                </div>
                <div className="space-y-1">
                  <p className="text-sm text-muted-foreground">Recipe COGS</p>
                  <p className="text-2xl font-bold">{formatCurrency(cogs.recipeCogs)}</p>
                </div>
                <div className="space-y-1">
                  <p className="text-sm text-muted-foreground">Packaging COGS</p>
                  <p className="text-2xl font-bold">{formatCurrency(cogs.packagingCogs)}</p>
                </div>
                <div className="space-y-1">
                  <p className="text-sm text-muted-foreground">Total COGS</p>
                  <p className="text-2xl font-bold">{formatCurrency(cogs.totalCogs)}</p>
                </div>
              </div>

              <div className="mt-6 pt-6 border-t grid gap-4 sm:grid-cols-3">
                <div className="space-y-1">
                  <p className="text-sm text-muted-foreground">Retail Price</p>
                  <p className="text-2xl font-bold">{formatCurrency(versionDetail.retailPriceIdr)}</p>
                </div>
                <div className="space-y-1">
                  <p className="text-sm text-muted-foreground">Contribution Margin</p>
                  <p className="text-2xl font-bold">{formatCurrency(cogs.contributionMargin)}</p>
                </div>
                <div className="space-y-1">
                  <p className="text-sm text-muted-foreground">Margin %</p>
                  <p className={cn('text-2xl font-bold', marginColor)}>
                    {formatPercent(cogs.contributionMarginPct)}
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
          disabled={isSubmitting}
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
                <Button onClick={handleCopyVersion}>
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
