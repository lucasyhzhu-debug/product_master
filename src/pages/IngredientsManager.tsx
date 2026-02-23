/**
 * IngredientsManager - CRUD page for recipe ingredients.
 * Uses EntityManager generic component with factory mutation hooks.
 */

import { useState } from 'react';
import { useDocumentTitle } from '@/hooks/useDocumentTitle';
import { Leaf, Unlink } from 'lucide-react';
import { EntityManager } from '@/components/shared/EntityManager';
import type { EntityColumn } from '@/components/shared/EntityManager';
import {
  useConvexIngredients,
  useConvexCreateIngredient,
  useConvexUpdateIngredient,
  useConvexDeleteIngredient,
  useConvexCreateIngredientComponentType,
  useLinkIngredientToComponentType,
  useUnlinkIngredientFromComponentType,
} from '@/hooks/convex';
import { useQuery } from 'convex/react';
import { api } from '../../convex/_generated/api';
import { formatCurrency } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';
import type { Id } from '../../convex/_generated/dataModel';

type Ingredient = NonNullable<ReturnType<typeof useConvexIngredients>>[number];

const UNITS = ['g', 'kg', 'ml', 'l', 'pcs'];

/** Convert empty strings to undefined for optional mutation fields */
function transformData(data: Record<string, any>) {
  return {
    ...data,
    brand: data.brand || undefined,
    procurementSource: data.procurementSource || undefined,
    shippingCost: data.shippingCost ?? 0,
  };
}

function EnableTrackingButton({ ingredient }: { ingredient: Ingredient }) {
  const { user } = useAuth();
  const createIngredientComponentType = useConvexCreateIngredientComponentType();
  const [loading, setLoading] = useState(false);

  const handleEnable = async () => {
    if (!user?.token) return;
    setLoading(true);
    try {
      await createIngredientComponentType({
        ingredientId: ingredient._id,
        token: user.token,
      });
      toast.success(`Inventory tracking enabled for ${ingredient.name}`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to enable tracking');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Button variant="outline" size="sm" onClick={handleEnable} disabled={loading}>
      {loading ? 'Enabling...' : 'Enable Tracking'}
    </Button>
  );
}

function LinkIngredientButton({ ingredient }: { ingredient: Ingredient }) {
  const { user } = useAuth();
  const linkIngredient = useLinkIngredientToComponentType();
  const componentTypes = useQuery(api.componentTypes.queries.list, { activeOnly: true });
  const [open, setOpen] = useState(false);
  const [selectedId, setSelectedId] = useState<string>('');
  const [saving, setSaving] = useState(false);

  // Filter to only tracked production componentTypes
  const trackableTypes = (componentTypes ?? []).filter(
    (ct: any) => ct.trackInventory && ct.category === 'production'
  );

  const handleLink = async () => {
    if (!user?.token || !selectedId) return;
    setSaving(true);
    try {
      await linkIngredient({
        token: user.token,
        ingredientId: ingredient._id,
        componentTypeId: selectedId as Id<'componentTypes'>,
      });
      toast.success(`Linked ${ingredient.name} to inventory tracker`);
      setOpen(false);
      setSelectedId('');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to link');
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <Button variant="ghost" size="sm" className="text-xs text-blue-600 h-auto py-0.5 px-1" onClick={() => setOpen(true)}>
        Link existing
      </Button>
      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={() => setOpen(false)}>
          <div className="bg-white dark:bg-gray-900 rounded-lg p-6 w-96 shadow-xl" onClick={(e) => e.stopPropagation()}>
            <h3 className="font-semibold mb-1">Link to Inventory Tracker</h3>
            <p className="text-sm text-muted-foreground mb-4">
              Link <strong>{ingredient.name}</strong> to an existing tracked component type so simulation can read its stock.
            </p>
            <select
              className="w-full border rounded px-3 py-2 text-sm mb-4 bg-white dark:bg-gray-800"
              value={selectedId}
              onChange={(e) => setSelectedId(e.target.value)}
            >
              <option value="">Select component type...</option>
              {trackableTypes.map((ct: any) => (
                <option key={ct._id} value={ct._id as string}>{ct.name}</option>
              ))}
            </select>
            <div className="flex justify-end gap-2">
              <Button variant="outline" size="sm" onClick={() => setOpen(false)}>Cancel</Button>
              <Button size="sm" onClick={handleLink} disabled={!selectedId || saving}>
                {saving ? 'Linking...' : 'Link'}
              </Button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function UntrackButton({ ingredient }: { ingredient: Ingredient }) {
  const { user } = useAuth();
  const unlinkIngredient = useUnlinkIngredientFromComponentType();
  const [loading, setLoading] = useState(false);
  const [confirming, setConfirming] = useState(false);

  const handleUntrack = async () => {
    if (!user?.token) return;
    setLoading(true);
    try {
      await unlinkIngredient({
        token: user.token,
        ingredientId: ingredient._id,
      });
      toast.success(`Tracking removed for ${ingredient.name}`);
      setConfirming(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to untrack');
    } finally {
      setLoading(false);
    }
  };

  if (confirming) {
    return (
      <div className="flex items-center gap-1">
        <span className="text-xs text-muted-foreground">Remove tracking?</span>
        <Button
          variant="destructive"
          size="sm"
          className="h-5 px-2 text-xs"
          onClick={handleUntrack}
          disabled={loading}
        >
          {loading ? '...' : 'Yes'}
        </Button>
        <Button
          variant="ghost"
          size="sm"
          className="h-5 px-2 text-xs"
          onClick={() => setConfirming(false)}
          disabled={loading}
        >
          No
        </Button>
      </div>
    );
  }

  return (
    <Button
      variant="ghost"
      size="sm"
      className="h-5 px-1 text-xs text-muted-foreground hover:text-destructive gap-1"
      onClick={() => setConfirming(true)}
      title="Remove inventory tracking link"
    >
      <Unlink className="h-3 w-3" />
      Untrack
    </Button>
  );
}

export function IngredientsManager() {
  useDocumentTitle('Ingredients');

  const ingredients = useConvexIngredients();
  const create = useConvexCreateIngredient();
  const update = useConvexUpdateIngredient();
  const del = useConvexDeleteIngredient();

  const columns: EntityColumn<Ingredient>[] = [
    { key: 'name', header: 'Name', sortable: true },
    { key: 'brand', header: 'Brand', render: (item) => item.brand || '-' },
    {
      key: 'volume',
      header: 'Volume',
      render: (item) => `${item.volumePurchased} ${item.unitType}`,
    },
    {
      key: 'cost',
      header: 'Cost/Unit',
      render: (item) => formatCurrency(item.costPerBaseUnit ?? 0),
    },
    {
      key: 'tracking',
      header: 'Inventory',
      render: (item) =>
        item.ingredientComponentTypeId ? (
          <div className="flex items-center gap-1.5">
            <Badge variant="outline" className="text-[var(--color-status-success)] border-[var(--color-status-success)] bg-[var(--color-status-success-bg)]">
              Tracked
            </Badge>
            <UntrackButton ingredient={item} />
          </div>
        ) : (
          <div className="flex flex-col gap-1 items-start">
            <EnableTrackingButton ingredient={item} />
            <LinkIngredientButton ingredient={item} />
          </div>
        ),
    },
  ];

  return (
    <EntityManager<Ingredient>
      entityName="Ingredient"
      entityNamePlural="Ingredients"
      pageTitle="Ingredients"
      pageDescription="Manage your ingredient inventory"
      backTo="/menu-products"
      backLabel="Back to Products"
      icon={Leaf}
      items={ingredients}
      columns={columns}
      searchable
      searchKeys={['name', 'brand']}
      searchPlaceholder="Search ingredients..."
      formSections={[
        {
          fields: [
            { name: 'name', label: 'Name', type: 'text', required: true, placeholder: 'e.g., Wheat Flour' },
            { name: 'brand', label: 'Brand', type: 'text', placeholder: 'e.g., Bogasari' },
            { name: 'procurementSource', label: 'Procurement Source', type: 'text', placeholder: 'e.g., Tokopedia' },
            {
              name: 'unitType',
              label: 'Unit',
              type: 'select',
              required: true,
              options: UNITS.map((u) => ({
                value: u,
                label: u === 'g' ? 'Grams (g)' :
                       u === 'kg' ? 'Kilograms (kg)' :
                       u === 'ml' ? 'Milliliters (ml)' :
                       u === 'l' ? 'Liters (l)' : u,
              })),
            },
            { name: 'volumePurchased', label: 'Volume Purchased', type: 'number', required: true },
            { name: 'priceExclShipping', label: 'Price (Excl. Shipping)', type: 'number', required: true, placeholder: 'IDR' },
            { name: 'shippingCost', label: 'Shipping Cost', type: 'number', placeholder: 'IDR (optional)' },
          ],
        },
      ]}
      getFormDefaults={() => ({ unitType: 'g', shippingCost: 0 })}
      getFormInitialData={(item) => ({
        name: item.name,
        brand: item.brand || '',
        procurementSource: item.procurementSource || '',
        unitType: item.unitType,
        volumePurchased: item.volumePurchased,
        priceExclShipping: item.priceExclShipping,
        shippingCost: item.shippingCost,
      })}
      transformFormData={transformData}
      onCreate={(data) => create.mutate(data)}
      onUpdate={async (id, data) => { await update.mutateAsync({ id: id as Id<"ingredients">, ...data }); }}
      onDelete={(id) => del.mutate({ id: id as Id<"ingredients"> })}
    />
  );
}
