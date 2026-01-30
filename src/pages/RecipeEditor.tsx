import { useState, useEffect, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Plus, Trash2, Copy, Save } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';
import { Badge } from '@/components/ui/badge';
import { PageHeader } from '@/components/layout';
import { VersionNavigator, ConfirmDialog, CostTooltip, IngredientModal } from '@/components/shared';
import { IngredientSelector } from '@/components/recipes/IngredientSelector';
import { Skeleton } from '@/components/ui/skeleton';
import {
  useConvexRecipe,
  useConvexRecipeVersion,
  useConvexCreateRecipe,
  useConvexCreateRecipeVersion,
  useConvexCopyRecipeVersion,
  useConvexDeleteRecipe,
} from '@/hooks/convex';
import { useConvexIngredients, useConvexCreateIngredient } from '@/hooks/convex';
import { useConvexTags } from '@/hooks/convex';
import type { Id } from '../../convex/_generated/dataModel';
import type { ComponentIngredientInput, RecipeComponentInput } from '@/hooks/convex/useRecipes';
import { formatCurrency } from '@/lib/utils';

interface ComponentDraft {
  id: string;
  componentName: string;
  linkedRecipeVersionId: Id<"recipeVersions"> | null;
  ingredients: IngredientDraft[];
}

interface IngredientDraft {
  id: string;
  ingredientId: Id<"ingredients"> | null;
  unit: string;
  quantity: number;
}

const UNITS = ['g', 'kg', 'ml', 'l', 'pcs'];

export function RecipeEditor() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const isNew = id === 'new';
  // Convex uses string IDs directly
  const recipeId = isNew ? undefined : (id as Id<"recipes">);

  const recipe = useConvexRecipe(recipeId);
  const rawIngredients = useConvexIngredients();
  const rawTags = useConvexTags();

  // Normalize data for loading state
  const ingredients = rawIngredients ?? [];
  const tags = rawTags ?? [];
  const loadingRecipe = recipeId !== undefined && recipe === undefined;

  // Track current version by its _id (not version number)
  const [currentVersionId, setCurrentVersionId] = useState<Id<"recipeVersions"> | undefined>(undefined);
  const [currentVersionIndex, setCurrentVersionIndex] = useState(0);

  const versionDetail = useConvexRecipeVersion(currentVersionId);
  const loadingVersion = currentVersionId !== undefined && versionDetail === undefined;

  const createRecipe = useConvexCreateRecipe();
  const createVersion = useConvexCreateRecipeVersion();
  const copyVersion = useConvexCopyRecipeVersion();
  const deleteRecipe = useConvexDeleteRecipe();
  const createIngredient = useConvexCreateIngredient();

  // Form state
  const [name, setName] = useState('');
  const [versionName, setVersionName] = useState('');
  const [description, setDescription] = useState('');
  const [estimatedYield, setEstimatedYield] = useState<string>('');
  const [isReusable, setIsReusable] = useState(false);
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [components, setComponents] = useState<ComponentDraft[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Dialog states
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [showCopyDialog, setShowCopyDialog] = useState(false);
  const [showIngredientModal, setShowIngredientModal] = useState(false);
  const [copyVersionName, setCopyVersionName] = useState('');
  const [copyDescription, setCopyDescription] = useState('');

  // Sorted versions for navigation
  const sortedVersions = useMemo(() => {
    if (!recipe?.versions) return [];
    return [...recipe.versions].sort((a, b) => a.versionNumber - b.versionNumber);
  }, [recipe?.versions]);

  // Initialize form when recipe data loads
  useEffect(() => {
    if (recipe && !isNew) {
      setName(recipe.name);
      setSelectedTags(recipe.tags.map(t => t._id));
      if (sortedVersions.length > 0) {
        const latestVersion = sortedVersions[sortedVersions.length - 1];
        setCurrentVersionId(latestVersion._id);
        setCurrentVersionIndex(sortedVersions.length - 1);
      }
    }
  }, [recipe, isNew, sortedVersions]);

  useEffect(() => {
    if (versionDetail && !isNew) {
      setVersionName(versionDetail.versionName);
      setDescription(versionDetail.description || '');
      setEstimatedYield(versionDetail.estimatedYieldGrams?.toString() || '');
      setIsReusable(versionDetail.isReusableComponent);
      setComponents(
        versionDetail.components.map((c) => ({
          id: `component-${c._id}`,
          componentName: c.componentName,
          linkedRecipeVersionId: c.linkedRecipeVersionId ?? null,
          ingredients: c.ingredients.map((i) => ({
            id: `ingredient-${i._id}`,
            ingredientId: i.ingredientId,
            unit: i.unit,
            quantity: i.quantity,
          })),
        }))
      );
    }
  }, [versionDetail, isNew]);

  // Initialize new recipe state
  useEffect(() => {
    if (isNew) {
      setComponents([
        {
          id: `component-${Date.now()}`,
          componentName: 'Main',
          linkedRecipeVersionId: null,
          ingredients: [],
        },
      ]);
    }
  }, [isNew]);

  const handleVersionNavigate = (direction: 'prev' | 'next') => {
    const newIndex = direction === 'prev' ? currentVersionIndex - 1 : currentVersionIndex + 1;
    if (newIndex >= 0 && newIndex < sortedVersions.length) {
      setCurrentVersionIndex(newIndex);
      setCurrentVersionId(sortedVersions[newIndex]._id);
    }
  };

  const addComponent = () => {
    setComponents([
      ...components,
      {
        id: `component-${Date.now()}`,
        componentName: `Component ${components.length + 1}`,
        linkedRecipeVersionId: null,
        ingredients: [],
      },
    ]);
  };

  const removeComponent = (componentId: string) => {
    setComponents(components.filter((c) => c.id !== componentId));
  };

  const updateComponent = (componentId: string, updates: Partial<ComponentDraft>) => {
    setComponents(
      components.map((c) => (c.id === componentId ? { ...c, ...updates } : c))
    );
  };

  const addIngredient = (componentId: string) => {
    setComponents(
      components.map((c) =>
        c.id === componentId
          ? {
              ...c,
              ingredients: [
                ...c.ingredients,
                {
                  id: `ingredient-${Date.now()}`,
                  ingredientId: null,
                  unit: 'g',
                  quantity: 0,
                },
              ],
            }
          : c
      )
    );
  };

  const removeIngredient = (componentId: string, ingredientId: string) => {
    setComponents(
      components.map((c) =>
        c.id === componentId
          ? {
              ...c,
              ingredients: c.ingredients.filter((i) => i.id !== ingredientId),
            }
          : c
      )
    );
  };

  const updateIngredient = (
    componentId: string,
    ingredientId: string,
    updates: Partial<IngredientDraft>
  ) => {
    setComponents(
      components.map((c) =>
        c.id === componentId
          ? {
              ...c,
              ingredients: c.ingredients.map((i) =>
                i.id === ingredientId ? { ...i, ...updates } : i
              ),
            }
          : c
      )
    );
  };

  const handleSave = async () => {
    // Validate
    if (!name.trim()) {
      alert('Recipe name is required');
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
    if (components.length === 0) {
      alert('At least one component is required');
      return;
    }

    // Build component data - using Convex camelCase format
    const componentData: RecipeComponentInput[] = components.map((c, idx) => ({
      sortOrder: idx,
      componentName: c.componentName,
      linkedRecipeVersionId: c.linkedRecipeVersionId ?? undefined,
      ingredients: c.ingredients
        .filter((i) => i.ingredientId !== null)
        .map((i, iIdx) => ({
          ingredientId: i.ingredientId!,
          sortOrder: iIdx,
          unit: i.unit,
          quantity: i.quantity,
        })) as ComponentIngredientInput[],
    }));

    setIsSubmitting(true);
    try {
      if (isNew) {
        const result = await createRecipe.mutateAsync({
          name,
          tagIds: selectedTags as Id<"tags">[],
          firstVersion: {
            versionName,
            description,
            estimatedYieldGrams: estimatedYield ? parseFloat(estimatedYield) : undefined,
            isReusableComponent: isReusable,
            components: componentData,
          },
        });
        navigate(`/recipes/${result}`);
      } else if (recipeId) {
        await createVersion.mutateAsync({
          recipeId,
          versionData: {
            versionName,
            description,
            estimatedYieldGrams: estimatedYield ? parseFloat(estimatedYield) : undefined,
            isReusableComponent: isReusable,
            components: componentData,
          },
        });
      }
    } catch (error) {
      console.error('Failed to save recipe:', error);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleCopyVersion = async () => {
    if (!versionDetail || !recipeId || !currentVersionId) return;
    try {
      await copyVersion.mutateAsync({
        recipeId,
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
    if (!recipeId) return;
    try {
      await deleteRecipe.mutateAsync(recipeId);
      navigate('/');
    } catch (error: unknown) {
      console.error('Failed to delete recipe:', error);
    }
  };

  const handleCreateIngredient = async (ingredient: {
    name: string;
    brand?: string | null;
    procurement_source?: string | null;
    unit_type: string;
    volume_purchased: number;
    price_excl_shipping: number;
    shipping_cost?: number;
  }) => {
    try {
      await createIngredient.mutateAsync({
        name: ingredient.name,
        brand: ingredient.brand ?? undefined,
        procurementSource: ingredient.procurement_source ?? undefined,
        unitType: ingredient.unit_type,
        volumePurchased: ingredient.volume_purchased,
        priceExclShipping: ingredient.price_excl_shipping,
        shippingCost: ingredient.shipping_cost ?? 0,
      });
      setShowIngredientModal(false);
    } catch (error) {
      console.error('Failed to create ingredient:', error);
    }
  };

  if (!isNew && loadingRecipe) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-96 w-full" />
      </div>
    );
  }

  // Normalize ingredients for IngredientSelector - it expects objects with `id` and `name`
  const ingredientsForSelector = ingredients.map(ing => ({
    id: ing._id as unknown as number, // The selector expects number but we pass string
    _id: ing._id,
    name: ing.name,
    brand: ing.brand,
  }));

  return (
    <div className="space-y-6">
      <PageHeader
        title={isNew ? 'New Recipe' : name}
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

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Metadata Section */}
        <Card className="lg:col-span-1">
          <CardHeader>
            <CardTitle>Recipe Details</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="name">Recipe Name</Label>
              <Input
                id="name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g., Pistachio Butter Cookie"
                disabled={!isNew}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="version-name">Version Name</Label>
              <Input
                id="version-name"
                value={versionName}
                onChange={(e) => setVersionName(e.target.value)}
                placeholder="e.g., Original Recipe"
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

            <div className="space-y-2">
              <Label htmlFor="yield">Estimated Yield (grams)</Label>
              <Input
                id="yield"
                type="number"
                value={estimatedYield}
                onChange={(e) => setEstimatedYield(e.target.value)}
                placeholder="e.g., 500"
              />
            </div>

            <div className="flex items-center space-x-2">
              <input
                type="checkbox"
                id="reusable"
                checked={isReusable}
                onChange={(e) => setIsReusable(e.target.checked)}
                className="h-4 w-4"
              />
              <Label htmlFor="reusable">Reusable as component</Label>
            </div>

            {tags.length > 0 && (
              <div className="space-y-2">
                <Label>Tags</Label>
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
            )}

            {/* Cost Summary */}
            {versionDetail && (
              <div className="pt-4 border-t">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium">Total Cost</span>
                  <div className="flex items-center gap-2">
                    <span className="font-bold">{formatCurrency(versionDetail.totalCost ?? 0)}</span>
                    {versionDetail.components.length > 0 && (
                      <CostTooltip
                        items={versionDetail.components.map((c) => ({
                          label: c.componentName,
                          cost: c.subtotalCost ?? 0,
                        }))}
                        total={versionDetail.totalCost ?? 0}
                      />
                    )}
                  </div>
                </div>
                {versionDetail.costPerGram !== null && (
                  <div className="flex items-center justify-between mt-2">
                    <span className="text-sm text-muted-foreground">Cost per gram</span>
                    <span className="font-medium">{formatCurrency(versionDetail.costPerGram)}</span>
                  </div>
                )}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Components Section */}
        <Card className="lg:col-span-2">
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle>Components</CardTitle>
            <Button variant="outline" size="sm" onClick={addComponent}>
              <Plus className="h-4 w-4 mr-1" />
              Add Component
            </Button>
          </CardHeader>
          <CardContent className="space-y-6">
            {loadingVersion && !isNew ? (
              <div className="space-y-4">
                <Skeleton className="h-32 w-full" />
                <Skeleton className="h-32 w-full" />
              </div>
            ) : (
              components.map((component) => (
                <div key={component.id} className="border rounded-lg p-4 space-y-4">
                  <div className="flex items-center justify-between">
                    <Input
                      value={component.componentName}
                      onChange={(e) =>
                        updateComponent(component.id, { componentName: e.target.value })
                      }
                      className="max-w-xs font-medium"
                    />
                    {components.length > 1 && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => removeComponent(component.id)}
                      >
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    )}
                  </div>

                  <Separator />

                  {/* Ingredients Table */}
                  <div className="space-y-2">
                    {component.ingredients.length > 0 && (
                      <div className="grid grid-cols-12 gap-2 text-xs font-medium text-muted-foreground px-1">
                        <div className="col-span-5">Ingredient</div>
                        <div className="col-span-3">Quantity</div>
                        <div className="col-span-2">Unit</div>
                        <div className="col-span-2"></div>
                      </div>
                    )}

                    {component.ingredients.map((ing) => (
                      <div key={ing.id} className="grid grid-cols-12 gap-2 items-center">
                        <div className="col-span-5">
                          <IngredientSelector
                            ingredients={ingredientsForSelector}
                            selectedId={ing.ingredientId ?? null}
                            onSelect={(id) =>
                              updateIngredient(component.id, ing.id, {
                                ingredientId: id as Id<"ingredients">,
                              })
                            }
                            onCreateNew={() => setShowIngredientModal(true)}
                          />
                        </div>
                        <div className="col-span-3">
                          <Input
                            type="number"
                            value={ing.quantity || ''}
                            onChange={(e) =>
                              updateIngredient(component.id, ing.id, {
                                quantity: parseFloat(e.target.value) || 0,
                              })
                            }
                            placeholder="0"
                          />
                        </div>
                        <div className="col-span-2">
                          <Select
                            value={ing.unit}
                            onValueChange={(value) =>
                              updateIngredient(component.id, ing.id, { unit: value })
                            }
                          >
                            <SelectTrigger>
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {UNITS.map((unit) => (
                                <SelectItem key={unit} value={unit}>
                                  {unit}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="col-span-2 flex justify-end">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => removeIngredient(component.id, ing.id)}
                          >
                            <Trash2 className="h-4 w-4 text-destructive" />
                          </Button>
                        </div>
                      </div>
                    ))}

                    <Button
                      variant="outline"
                      size="sm"
                      className="w-full mt-2"
                      onClick={() => addIngredient(component.id)}
                    >
                      <Plus className="h-4 w-4 mr-1" />
                      Add Ingredient
                    </Button>
                  </div>
                </div>
              ))
            )}
          </CardContent>
        </Card>
      </div>

      {/* Save Button */}
      <div className="flex justify-end">
        <Button
          size="lg"
          onClick={handleSave}
          disabled={isSubmitting}
        >
          <Save className="h-4 w-4 mr-2" />
          {isNew ? 'Create Recipe' : 'Save New Version'}
        </Button>
      </div>

      {/* Dialogs */}
      <ConfirmDialog
        open={showDeleteDialog}
        onOpenChange={setShowDeleteDialog}
        title="Delete Recipe"
        description="Are you sure you want to delete this recipe? This action cannot be undone."
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

      {/* Ingredient Modal */}
      <IngredientModal
        open={showIngredientModal}
        onOpenChange={setShowIngredientModal}
        onSubmit={handleCreateIngredient}
      />
    </div>
  );
}
