import { useState, useEffect } from 'react';
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
import { VersionNavigator, ConfirmDialog, CostTooltip } from '@/components/shared';
import { Skeleton } from '@/components/ui/skeleton';
import { useRecipe, useRecipeVersion, useCreateRecipe, useCreateRecipeVersion, useCopyRecipeVersion, useDeleteRecipe } from '@/hooks/useRecipes';
import { useIngredients } from '@/hooks/useIngredients';
import { useTags } from '@/hooks/useTags';
import { formatCurrency } from '@/lib/utils';
import type { RecipeComponentCreate, ComponentIngredientCreate } from '@/lib/types';

interface ComponentDraft {
  id: string;
  component_name: string;
  linked_recipe_version_id: number | null;
  ingredients: IngredientDraft[];
}

interface IngredientDraft {
  id: string;
  ingredient_id: number | null;
  unit: string;
  quantity: number;
}

const UNITS = ['g', 'kg', 'ml', 'l', 'pcs'];

export function RecipeEditor() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const isNew = id === 'new';
  const recipeId = isNew ? 0 : parseInt(id || '0', 10);

  const { data: recipe, isLoading: loadingRecipe } = useRecipe(recipeId);
  const { data: ingredients } = useIngredients();
  const { data: tags } = useTags();

  const [currentVersionNumber, setCurrentVersionNumber] = useState(1);
  const { data: versionDetail, isLoading: loadingVersion } = useRecipeVersion(recipeId, currentVersionNumber);

  const createRecipe = useCreateRecipe();
  const createVersion = useCreateRecipeVersion();
  const copyVersion = useCopyRecipeVersion();
  const deleteRecipe = useDeleteRecipe();

  // Form state
  const [name, setName] = useState('');
  const [versionName, setVersionName] = useState('');
  const [description, setDescription] = useState('');
  const [estimatedYield, setEstimatedYield] = useState<string>('');
  const [isReusable, setIsReusable] = useState(false);
  const [selectedTags, setSelectedTags] = useState<number[]>([]);
  const [components, setComponents] = useState<ComponentDraft[]>([]);

  // Dialog states
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [showCopyDialog, setShowCopyDialog] = useState(false);
  const [copyVersionName, setCopyVersionName] = useState('');
  const [copyDescription, setCopyDescription] = useState('');

  // Initialize form when version data loads
  useEffect(() => {
    if (recipe && !isNew) {
      setName(recipe.name);
      setSelectedTags(recipe.tags.map(t => t.id));
      if (recipe.versions.length > 0) {
        const latestVersion = Math.max(...recipe.versions.map(v => v.version_number));
        setCurrentVersionNumber(latestVersion);
      }
    }
  }, [recipe, isNew]);

  useEffect(() => {
    if (versionDetail && !isNew) {
      setVersionName(versionDetail.version_name);
      setDescription(versionDetail.description || '');
      setEstimatedYield(versionDetail.estimated_yield_grams?.toString() || '');
      setIsReusable(versionDetail.is_reusable_component);
      setComponents(
        versionDetail.components.map((c) => ({
          id: `component-${c.id}`,
          component_name: c.component_name,
          linked_recipe_version_id: c.linked_recipe_version_id,
          ingredients: c.ingredients.map((i) => ({
            id: `ingredient-${i.id}`,
            ingredient_id: i.ingredient_id,
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
          component_name: 'Main',
          linked_recipe_version_id: null,
          ingredients: [],
        },
      ]);
    }
  }, [isNew]);

  const addComponent = () => {
    setComponents([
      ...components,
      {
        id: `component-${Date.now()}`,
        component_name: `Component ${components.length + 1}`,
        linked_recipe_version_id: null,
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
                  ingredient_id: null,
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

    // Build component data
    const componentData: RecipeComponentCreate[] = components.map((c, idx) => ({
      sort_order: idx,
      component_name: c.component_name,
      linked_recipe_version_id: c.linked_recipe_version_id,
      ingredients: c.ingredients
        .filter((i) => i.ingredient_id !== null)
        .map((i, iIdx) => ({
          ingredient_id: i.ingredient_id!,
          sort_order: iIdx,
          unit: i.unit,
          quantity: i.quantity,
        })) as ComponentIngredientCreate[],
    }));

    try {
      if (isNew) {
        const result = await createRecipe.mutateAsync({
          name,
          tag_ids: selectedTags,
          first_version: {
            version_name: versionName,
            description,
            estimated_yield_grams: estimatedYield ? parseFloat(estimatedYield) : null,
            is_reusable_component: isReusable,
            components: componentData,
          },
        });
        navigate(`/recipes/${result.id}`);
      } else {
        await createVersion.mutateAsync({
          recipeId,
          data: {
            version_name: versionName,
            description,
            estimated_yield_grams: estimatedYield ? parseFloat(estimatedYield) : null,
            is_reusable_component: isReusable,
            components: componentData,
          },
        });
      }
    } catch (error) {
      console.error('Failed to save recipe:', error);
      alert('Failed to save recipe');
    }
  };

  const handleCopyVersion = async () => {
    if (!versionDetail) return;
    try {
      await copyVersion.mutateAsync({
        recipeId,
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
      await deleteRecipe.mutateAsync(recipeId);
      navigate('/recipes');
    } catch (error: unknown) {
      console.error('Failed to delete recipe:', error);
      const errorMessage = error instanceof Error ? error.message : 'Failed to delete recipe';
      alert(errorMessage);
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
                currentVersion={currentVersionNumber}
                totalVersions={recipe?.versions.length || 1}
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

            {isNew && tags && (
              <div className="space-y-2">
                <Label>Tags</Label>
                <div className="flex flex-wrap gap-1">
                  {tags.map((tag) => (
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
            )}

            {/* Cost Summary */}
            {versionDetail && (
              <div className="pt-4 border-t">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium">Total Cost</span>
                  <div className="flex items-center gap-2">
                    <span className="font-bold">{formatCurrency(versionDetail.total_cost)}</span>
                    {versionDetail.components.length > 0 && (
                      <CostTooltip
                        items={versionDetail.components.map((c) => ({
                          label: c.component_name,
                          cost: c.subtotal_cost,
                        }))}
                        total={versionDetail.total_cost}
                      />
                    )}
                  </div>
                </div>
                {versionDetail.cost_per_gram !== null && (
                  <div className="flex items-center justify-between mt-2">
                    <span className="text-sm text-muted-foreground">Cost per gram</span>
                    <span className="font-medium">{formatCurrency(versionDetail.cost_per_gram)}</span>
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
                      value={component.component_name}
                      onChange={(e) =>
                        updateComponent(component.id, { component_name: e.target.value })
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
                          <Select
                            value={ing.ingredient_id?.toString() || ''}
                            onValueChange={(value) =>
                              updateIngredient(component.id, ing.id, {
                                ingredient_id: parseInt(value, 10),
                              })
                            }
                          >
                            <SelectTrigger>
                              <SelectValue placeholder="Select ingredient" />
                            </SelectTrigger>
                            <SelectContent>
                              {ingredients?.map((ingredient) => (
                                <SelectItem key={ingredient.id} value={ingredient.id.toString()}>
                                  {ingredient.name}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
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
          disabled={createRecipe.isPending || createVersion.isPending}
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
        loading={deleteRecipe.isPending}
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
