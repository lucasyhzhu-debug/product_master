/**
 * IngredientsManager - CRUD page for recipe ingredients.
 * Uses EntityManager generic component with factory mutation hooks.
 */

import { useState } from 'react';
import { useDocumentTitle } from '@/hooks/useDocumentTitle';
import { Leaf } from 'lucide-react';
import { EntityManager } from '@/components/shared/EntityManager';
import type { EntityColumn } from '@/components/shared/EntityManager';
import {
  useConvexIngredients,
  useConvexCreateIngredient,
  useConvexUpdateIngredient,
  useConvexDeleteIngredient,
  useConvexCreateIngredientComponentType,
} from '@/hooks/convex';
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
          <Badge variant="outline" className="text-emerald-600 border-emerald-300 bg-emerald-50">
            Tracked
          </Badge>
        ) : (
          <EnableTrackingButton ingredient={item} />
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
      onUpdate={(id, data) => update.mutate({ id: id as Id<"ingredients">, ...data })}
      onDelete={(id) => del.mutate({ id: id as Id<"ingredients"> })}
    />
  );
}
