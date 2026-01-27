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
import { usePackagingRecipe, usePackagingVersion, useCreatePackagingRecipe, useCreatePackagingVersion, useCopyPackagingVersion, useDeletePackagingRecipe } from '@/hooks/usePackaging';
import { useMaterials } from '@/hooks/useMaterials';
import { useTags } from '@/hooks/useTags';
import { formatCurrency } from '@/lib/utils';
import type { PackagingComponentCreate, PackagingComponentMaterialCreate } from '@/lib/types';

interface ComponentDraft {
  id: string;
  component_name: string;
  materials: MaterialDraft[];
}

interface MaterialDraft {
  id: string;
  packaging_material_id: number | null;
  unit: string;
  quantity: number;
}

const UNITS = ['pcs', 'm', 'cm', 'sheets'];

export function PackagingEditor() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const isNew = id === 'new';
  const packagingId = isNew ? 0 : parseInt(id || '0', 10);

  const { data: packaging, isLoading: loadingPackaging } = usePackagingRecipe(packagingId);
  const { data: materials } = useMaterials();
  const { data: tags } = useTags();

  const [currentVersionNumber, setCurrentVersionNumber] = useState(1);
  const { data: versionDetail, isLoading: loadingVersion } = usePackagingVersion(packagingId, currentVersionNumber);

  const createPackaging = useCreatePackagingRecipe();
  const createVersion = useCreatePackagingVersion();
  const copyVersion = useCopyPackagingVersion();
  const deletePackaging = useDeletePackagingRecipe();

  // Form state
  const [name, setName] = useState('');
  const [versionName, setVersionName] = useState('');
  const [description, setDescription] = useState('');
  const [selectedTags, setSelectedTags] = useState<number[]>([]);
  const [components, setComponents] = useState<ComponentDraft[]>([]);

  // Dialog states
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [showCopyDialog, setShowCopyDialog] = useState(false);
  const [copyVersionName, setCopyVersionName] = useState('');
  const [copyDescription, setCopyDescription] = useState('');

  // Initialize form when version data loads
  useEffect(() => {
    if (packaging && !isNew) {
      setName(packaging.name);
      setSelectedTags(packaging.tags.map(t => t.id));
      if (packaging.versions.length > 0) {
        const latestVersion = Math.max(...packaging.versions.map(v => v.version_number));
        setCurrentVersionNumber(latestVersion);
      }
    }
  }, [packaging, isNew]);

  useEffect(() => {
    if (versionDetail && !isNew) {
      setVersionName(versionDetail.version_name);
      setDescription(versionDetail.description || '');
      setComponents(
        versionDetail.components.map((c) => ({
          id: `component-${c.id}`,
          component_name: c.component_name,
          materials: c.materials.map((m) => ({
            id: `material-${m.id}`,
            packaging_material_id: m.packaging_material_id,
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
          component_name: 'Main',
          materials: [],
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
                  packaging_material_id: null,
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

    // Build component data
    const componentData: PackagingComponentCreate[] = components.map((c, idx) => ({
      sort_order: idx,
      component_name: c.component_name,
      materials: c.materials
        .filter((m) => m.packaging_material_id !== null)
        .map((m, mIdx) => ({
          packaging_material_id: m.packaging_material_id!,
          sort_order: mIdx,
          unit: m.unit,
          quantity: m.quantity,
        })) as PackagingComponentMaterialCreate[],
    }));

    try {
      if (isNew) {
        const result = await createPackaging.mutateAsync({
          name,
          tag_ids: selectedTags,
          first_version: {
            version_name: versionName,
            description,
            components: componentData,
          },
        });
        navigate(`/packaging/${result.id}`);
      } else {
        await createVersion.mutateAsync({
          packagingId,
          data: {
            version_name: versionName,
            description,
            components: componentData,
          },
        });
      }
    } catch (error) {
      console.error('Failed to save packaging:', error);
      alert('Failed to save packaging');
    }
  };

  const handleCopyVersion = async () => {
    if (!versionDetail) return;
    try {
      await copyVersion.mutateAsync({
        packagingId,
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
      await deletePackaging.mutateAsync(packagingId);
      navigate('/packaging');
    } catch (error: unknown) {
      console.error('Failed to delete packaging:', error);
      const errorMessage = error instanceof Error ? error.message : 'Failed to delete packaging';
      alert(errorMessage);
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
                currentVersion={currentVersionNumber}
                totalVersions={packaging?.versions.length || 1}
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
                            value={mat.packaging_material_id?.toString() || ''}
                            onValueChange={(value) =>
                              updateMaterial(component.id, mat.id, {
                                packaging_material_id: parseInt(value, 10),
                              })
                            }
                          >
                            <SelectTrigger>
                              <SelectValue placeholder="Select material" />
                            </SelectTrigger>
                            <SelectContent>
                              {materials?.map((material) => (
                                <SelectItem key={material.id} value={material.id.toString()}>
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
          disabled={createPackaging.isPending || createVersion.isPending}
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
        loading={deletePackaging.isPending}
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
