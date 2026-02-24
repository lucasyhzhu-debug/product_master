/**
 * CustomersManager - CRUD page for customer management.
 * Uses EntityManager generic component with factory mutation hooks.
 */

import { useDocumentTitle } from '@/hooks/useDocumentTitle';
import { Users } from 'lucide-react';
import { EntityManager } from '@/components/shared/EntityManager';
import type { EntityColumn } from '@/components/shared/EntityManager';
import {
  useCustomers,
  useCreateCustomer,
  useUpdateCustomer,
  useDeleteCustomer,
} from '@/hooks/convex';
import type { Id } from '../../convex/_generated/dataModel';

type Customer = NonNullable<ReturnType<typeof useCustomers>>[number];

const columns: EntityColumn<Customer>[] = [
  { key: 'name', header: 'Name', sortable: true },
  { key: 'phone', header: 'Phone', render: (item) => item.phone || '-' },
  { key: 'source', header: 'Source', render: (item) => item.source || '-' },
  {
    key: 'notes',
    header: 'Notes',
    render: (item) =>
      item.notes
        ? item.notes.length > 50
          ? item.notes.slice(0, 50) + '...'
          : item.notes
        : '-',
  },
];

/** Convert empty strings to undefined for optional mutation fields */
function transformData(data: Record<string, any>) {
  return {
    ...data,
    phone: data.phone || undefined,
    source: data.source || undefined,
    notes: data.notes || undefined,
  };
}

export function CustomersManager() {
  useDocumentTitle('Customers');

  const customers = useCustomers();
  const create = useCreateCustomer();
  const update = useUpdateCustomer();
  const del = useDeleteCustomer();

  return (
    <EntityManager<Customer>
      entityName="Customer"
      entityNamePlural="Customers"
      pageTitle="Customers"
      pageDescription="Manage customer records"
      icon={Users}
      items={customers}
      columns={columns}
      searchable
      searchKeys={['name', 'phone']}
      searchPlaceholder="Search by name or phone..."
      formSections={[
        {
          fields: [
            { name: 'name', label: 'Name', type: 'text', required: true, placeholder: 'Customer name' },
            { name: 'phone', label: 'Phone', type: 'phone', placeholder: '08123456789' },
            { name: 'source', label: 'Source', type: 'text', placeholder: 'e.g., Instagram, Walk-in' },
            { name: 'notes', label: 'Notes', type: 'textarea', placeholder: 'Additional notes', rows: 3 },
          ],
        },
      ]}
      getFormDefaults={() => ({})}
      getFormInitialData={(item) => ({
        name: item.name,
        phone: item.phone || '',
        source: item.source || '',
        notes: item.notes || '',
      })}
      transformFormData={transformData}
      onCreate={(data) => create.mutate(data)}
      onUpdate={(id, data) => update.mutate({ id: id as Id<"customers">, ...data })}
      onDelete={(id) => del.mutate({ id: id as Id<"customers"> })}
    />
  );
}
