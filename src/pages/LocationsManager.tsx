/**
 * LocationsManager - CRUD page for storage locations.
 * Uses EntityManager generic component with factory mutation hooks.
 */

import { useDocumentTitle } from '@/hooks/useDocumentTitle';
import { MapPin } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { EntityManager } from '@/components/shared/EntityManager';
import type { EntityColumn } from '@/components/shared/EntityManager';
import {
  useConvexStorageLocations,
  useConvexCreateStorageLocation,
  useConvexUpdateStorageLocation,
  useConvexDeleteStorageLocation,
} from '@/hooks/convex';
import type { Id } from '../../convex/_generated/dataModel';

type Location = NonNullable<ReturnType<typeof useConvexStorageLocations>>[number];

const LOCATION_TYPES = [
  { value: 'office', label: 'Office' },
  { value: 'kitchen', label: 'Kitchen' },
  { value: 'venue', label: 'Venue' },
];

const columns: EntityColumn<Location>[] = [
  { key: 'name', header: 'Name', sortable: true },
  {
    key: 'locationType',
    header: 'Type',
    sortable: true,
    render: (item) => <Badge variant="outline">{item.locationType}</Badge>,
  },
  { key: 'address', header: 'Address', render: (item) => item.address || '-' },
  {
    key: 'status',
    header: 'Status',
    render: (item) => (
      <div className="flex items-center gap-1">
        {item.isDefault && <Badge className="bg-emerald-600">Default</Badge>}
        {!item.isActive && <Badge variant="destructive">Inactive</Badge>}
        {item.isActive && !item.isDefault && <span className="text-muted-foreground">Active</span>}
      </div>
    ),
  },
];

/** Convert empty address to undefined for optional mutation field */
function transformData(data: Record<string, any>) {
  return {
    ...data,
    address: data.address?.trim() || undefined,
  };
}

export function LocationsManager() {
  useDocumentTitle('Storage Locations');

  const locations = useConvexStorageLocations(false);
  const create = useConvexCreateStorageLocation();
  const update = useConvexUpdateStorageLocation();
  const del = useConvexDeleteStorageLocation();

  return (
    <EntityManager<Location>
      entityName="Location"
      entityNamePlural="Locations"
      pageTitle="Storage Locations"
      icon={MapPin}
      items={locations}
      columns={columns}
      searchable
      searchKeys={['name', 'address']}
      searchPlaceholder="Search locations..."
      supportsUndo
      formSections={[
        {
          fields: [
            { name: 'name', label: 'Location Name', type: 'text', required: true, placeholder: 'e.g., Kitchen' },
            {
              name: 'locationType',
              label: 'Location Type',
              type: 'select',
              required: true,
              options: LOCATION_TYPES,
            },
            { name: 'address', label: 'Address', type: 'text', placeholder: '123 Main St, Jakarta' },
            { name: 'isActive', label: 'Active', type: 'checkbox', placeholder: 'Location is active' },
            { name: 'isDefault', label: 'Default', type: 'checkbox', placeholder: 'Set as default location' },
          ],
        },
      ]}
      getFormDefaults={() => ({ locationType: 'office', isActive: true, isDefault: false })}
      getFormInitialData={(item) => ({
        name: item.name,
        locationType: item.locationType,
        address: item.address || '',
        isActive: item.isActive,
        isDefault: item.isDefault || false,
      })}
      transformFormData={transformData}
      onCreate={(data) => create.mutate(data)}
      onUpdate={(id, data) => update.mutate({ id: id as Id<"storageLocations">, ...data })}
      onDelete={(id) => del.mutate({ id: id as Id<"storageLocations"> })}
    />
  );
}
