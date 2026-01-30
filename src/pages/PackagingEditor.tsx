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
import { VersionNavigator, ConfirmDialog, CostTooltip } from '@/components/shared';
import { Skeleton } from '@/components/ui/skeleton';
import {
  useConvexPackaging,
  useConvexPackagingVersion,
  useConvexCreatePackaging,
  useConvexCreatePackagingVersion,
  useConvexCopyPackagingVersion,
  useConvexDeletePackaging,
} from '@/hooks/convex';
import { useConvexMaterials } from '@/hooks/convex';
import { useConvexTags } from '@/hooks/convex';
import type { Id } from '../../convex/_generated/dataModel';
import type { PackagingVersionInput, PackagingComponentInput, PackagingMaterialInput } from '@/hooks/convex/usePackaging';
import { formatCurrency } from '@/lib/utils';

interface ComponentDraft {
  id: string;
  componentName: string;
  materials: MaterialDraft[];
}

interface MaterialDraft {
  id: string;
  packagingMaterialId: Id<"packagingMaterials"> | null;
  unit: string;
  quantity: number;
}

const UNITS = ['pcs', 'm', 'cm', 'sheets'];

export function PackagingEditor() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const isNew = id === 'new';
  // Convex uses string IDs directly
  const packagingId = isNew ? undefined : (id as Id<"packagingRecipes">);

  const packaging = useConvexPackaging(packagingId);
  const rawMaterials = useConvexMaterials();
  const rawTags = useConvexTags();

  // Normalize data for loading state
  const materials = rawMaterials ?? [];
  const tags = rawTags ?? [];
  const loadingPackaging = packagingId !== undefined && packaging === undefined;

  // Track current version by its _id (not version number)
  const [currentVersionId, setCurrentVersionId] = useState<Id<"packagingVersions"> | undefined>(undefined);
  const [currentVersionIndex, setCurrentVersionIndex] = useState(0);

  const versionDetail = useConvexPackagingVersion(currentVersionId);
  const loadingVersion = currentVersionId !== undefined && versionDetail === undefined;

  const createPackaging = useConvexCreatePackaging();
  const createVersion = useConvexCreatePackagingVersion();
  const copyVersion = useConvexCopyPackagingVersion();
  const deletePackaging = useConvexDeletePackaging();

  // Form state
  const [name, setName] = useState('');
  const [versionName, setVersionName] = useState('');
  const [description, setDescription] = useState('');
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [components, setComponents] = useState<ComponentDraft[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Dialog states
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [showCopyDialog, setShowCopyDialog] = useState(false);
  const [copyVersionName, setCopyVersionName] = useState('');
  const [copyDescription, setCopyDescription] = useState('');

  // Sorted versions for navigation
  const sortedVersions = useMemo(() => {
    if (!packaging?.versions) return [];
    return [...packaging.versions].sort((a, b) => a.versionNumber - b.versionNumber);
  }, [packaging?.versions]);

  // Initialize form when packaging data loads
  useEffect(() => {
    if (packaging && !isNew) {
      setName(packaging.name);
      setSelectedTags(packaging.tags.map(t => t._id));
      if (sortedVersions.length > 0) {
        const latestVersion = sortedVersions[sortedVersions.length - 1];
        setCurrentVersionId(latestVersion._id);
        setCurrentVersionIndex(sortedVersions.length - 1);
      }
    }
  }, [packaging, isNew, sortedVersions]);

  useEffect(() => {
    if (versionDetail && !isNew) {
      setVersionName(versionDetail.versionName);
      setDescription(versionDetail.description || '');
      setComponents(
        versionDetail.components.map((c) => ({
          id: `component-${c._id}`,
          componentName: c.componentName,
          materials: c.materials.map((m) => ({
            id: `material-${m._id}`,
            packagingMaterialId: m.packagingMaterialId,
            unit: m.unit,
            quantity: m.quantity,
          })),
        }))
      );
    }
  }, [versionDetail, isNew]);

  // Initialize new packaging state
  useEffect(() => {
    if (isNew) {
      setComponents([
        {
          id: `component-${Date.now()}`,
          componentName: 'Main',
          materials: [],
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
        materials: [],
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

  const addMaterial = (componentId: string) => {
    setComponents(
      components.map((c) =>
        c.id === componentId
          ? {
              ...c,
              materials: [
                ...c.materials,
                {
                  id: `material-${Date.now()}`,
                  packagingMaterialId: null,
                  unit: 'pcs',
                  quantity: 0,
                },
              ],
            }
          : c
      )
    );
  };

  const removeMaterial = (componentId: string, materialId: string) => {
    setComponents(
      components.map((c) =>
        c.id === componentId
          ? {
              ...c,
              materials: c.materials.filter((m) => m.id !== materialId),
            }
          : c
      )
    );
  };

  const updateMaterial = (
    componentId: string,
    materialId: string,
    updates: Partial<MaterialDraft>
  ) => {
    setComponents(
      components.map((c) =>
        c.id === componentId
          ? {
              ...c,
              materials: c.materials.map((m) =>
                m.id === materialId ? { ...m, ...updates } : m
              ),
            }
          : c
      )
    );
  };

  const handleSave = async () => {
    // Validate
    if (!name.trim()) {
      alert('Packaging name is required');
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
    const componentData: PackagingComponentInput[] = components.map((c, idx) => ({
      sortOrder: idx,
      componentName: c.componentName,
      materials: c.materials
        .filter((m) => m.packagingMaterialId !== null)
        .map((m, mIdx) => ({
          packagingMaterialId: m.packagingMaterialId!,
          sortOrder: mIdx,
          unit: m.unit,
          quantity: m.quantity,
        })) as PackagingMaterialInput[],
    }));

    setIsSubmitting(true);
    try {
      if (isNew) {
        const result = await createPackaging.mutateAsync({
          name,
          tagIds: selectedTags as Id<"tags">[],
          firstVersion: {
            versionName,
            description,
            components: componentData,
          },
        });
        navigate(`/packaging/${result}`);
      } else if (packagingId) {
        await createVersion.mutateAsync({
          packagingRecipeId: packagingId,
          versionData: {
            versionName,
            description,
            components: componentData,
          },
        });
      }
    } catch (error) {
      console.error('Failed to save packaging:', error);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleCopyVersion = async () => {
    if (!versionDetail || !packagingId || !currentVersionId) return;
    try {
      await copyVersion.mutateAsync({
        packagingRecipeId: packagingId,
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
    if (!packagingId) return;
    try {
      await deletePackaging.mutateAsync(packagingId);
      navigate('/');
    } catch (error: unknown) {
      console.error('Failed to delete packaging:', error);
    }
  };

  if (!isNew && loadingPackaging) {
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
        title={isNew ? 'New Packaging' : name}
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
            <CardTitle>Packaging Details</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="name">Packaging Name</Label>
              <Input
                id="name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g., Small Box"
                disabled={!isNew}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="version-name">Version Name</Label>
              <Input
                id="version-name"
                value={versionName}
                onChange={(e) => setVersionName(e.target.value)}
                placeholder="e.g., Standard Design"
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

            {isNew && tags.length > 0 && (
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

                  {/* Materials Table */}
                  <div className="space-y-2">
                    {component.materials.length > 0 && (
                      <div className="grid grid-cols-12 gap-2 text-xs font-medium text-muted-foreground px-1">
                        <div className="col-span-5">Material</div>
                        <div className="col-span-3">Quantity</div>
                        <div className="col-span-2">Unit</div>
                        <div className="col-span-2"></div>
                      </div>
                    )}

                    {component.materials.map((mat) => (
                      <div key={mat.id} className="grid grid-cols-12 gap-2 items-center">
                        <div className="col-span-5">
                          <Select
                            value={mat.packagingMaterialId || ''}
                            onValueChange={(value) =>
                              updateMaterial(component.id, mat.id, {
                                packagingMaterialId: value as Id<"packagingMaterials">,
                              })
                            }
                          >
                            <SelectTrigger>
                              <SelectValue placeholder="Select material" />
                            </SelectTrigger>
                            <SelectContent>
                              {materials.map((material) => (
                                <SelectItem key={material._id} value={material._id}>
                                  {material.name}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="col-span-3">
                          <Input
                            type="number"
                            value={mat.quantity || ''}
                            onChange={(e) =>
                              updateMaterial(component.id, mat.id, {
                                quantity: parseFloat(e.target.value) || 0,
                              })
                            }
                            placeholder="0"
                          />
                        </div>
                        <div className="col-span-2">
                          <Select
                            value={mat.unit}
                            onValueChange={(value) =>
                              updateMaterial(component.id, mat.id, { unit: value })
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
                            onClick={() => removeMaterial(component.id, mat.id)}
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
                      onClick={() => addMaterial(component.id)}
                    >
                      <Plus className="h-4 w-4 mr-1" />
                      Add Material
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
          {isNew ? 'Create Packaging' : 'Save New Version'}
        </Button>
      </div>

      {/* Dialogs */}
      <ConfirmDialog
        open={showDeleteDialog}
        onOpenChange={setShowDeleteDialog}
        title="Delete Packaging"
        description="Are you sure you want to delete this packaging? This action cannot be undone."
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
