/**
 * MaterialsManager - CRUD page for packaging materials.
 * Uses EntityManager generic component with factory mutation hooks.
 */

import { useDocumentTitle } from '@/hooks/useDocumentTitle';
import { Package } from 'lucide-react';
import { EntityManager } from '@/components/shared/EntityManager';
import type { EntityColumn } from '@/components/shared/EntityManager';
import {
  useConvexMaterials,
  useConvexCreateMaterial,
  useConvexUpdateMaterial,
  useConvexDeleteMaterial,
} from '@/hooks/convex';
import { formatCurrency } from '@/lib/utils';
import type { Id } from '../../convex/_generated/dataModel';

type Material = NonNullable<ReturnType<typeof useConvexMaterials>>[number];

const UNITS = ['pcs', 'm', 'cm', 'sheets'];

const columns: EntityColumn<Material>[] = [
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
];

/** Convert empty strings to undefined for optional mutation fields */
function transformData(data: Record<string, any>) {
  return {
    ...data,
    brand: data.brand || undefined,
    procurementSource: data.procurementSource || undefined,
    shippingCost: data.shippingCost ?? 0,
  };
}

export function MaterialsManager() {
  useDocumentTitle('Materials');

  const materials = useConvexMaterials();
  const create = useConvexCreateMaterial();
  const update = useConvexUpdateMaterial();
  const del = useConvexDeleteMaterial();

  return (
    <EntityManager<Material>
      entityName="Material"
      entityNamePlural="Materials"
      pageTitle="Packaging Materials"
      pageDescription="Manage your packaging material inventory"
      backTo="/menu-products"
      backLabel="Back to Products"
      icon={Package}
      items={materials}
      columns={columns}
      searchable
      searchKeys={['name', 'brand']}
      searchPlaceholder="Search materials..."
      formSections={[
        {
          fields: [
            { name: 'name', label: 'Name', type: 'text', required: true, placeholder: 'e.g., Plastic Pouch' },
            { name: 'brand', label: 'Brand', type: 'text', placeholder: 'e.g., PolyPack' },
            { name: 'procurementSource', label: 'Procurement Source', type: 'text', placeholder: 'e.g., Tokopedia' },
            {
              name: 'unitType',
              label: 'Unit',
              type: 'select',
              required: true,
              options: UNITS.map((u) => ({ value: u, label: u })),
            },
            { name: 'volumePurchased', label: 'Volume Purchased', type: 'number', required: true },
            { name: 'priceExclShipping', label: 'Price (Excl. Shipping)', type: 'number', required: true, placeholder: 'IDR' },
            { name: 'shippingCost', label: 'Shipping Cost', type: 'number', placeholder: 'IDR (optional)' },
          ],
        },
      ]}
      getFormDefaults={() => ({ unitType: 'pcs', shippingCost: 0 })}
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
      onUpdate={(id, data) => update.mutate({ id: id as Id<"packagingMaterials">, ...data })}
      onDelete={(id) => del.mutate({ id: id as Id<"packagingMaterials"> })}
    />
  );
}
