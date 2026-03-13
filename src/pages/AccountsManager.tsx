/**
 * AccountsManager - Admin-only Chart of Accounts management page.
 * Uses EntityManager generic component with factory mutation hooks.
 */

import { useDocumentTitle } from '@/hooks/useDocumentTitle';
import { BookOpen, Lock } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { EntityManager } from '@/components/shared/EntityManager';
import type { EntityColumn } from '@/components/shared/EntityManager';
import {
  useAccounts,
  useCreateAccount,
  useUpdateAccount,
  useDeleteAccount,
  type Account,
} from '@/hooks/convex';
import type { Id } from '../../convex/_generated/dataModel';

/** Map account type to display label */
const TYPE_LABELS: Record<string, string> = {
  asset: 'Asset',
  liability: 'Liability',
  equity: 'Equity',
  revenue: 'Revenue',
  cogs: 'COGS',
  opex: 'OpEx',
  other: 'Other',
};

/** Map account type to badge color classes */
const TYPE_COLORS: Record<string, string> = {
  asset: 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200',
  liability: 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200',
  equity: 'bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200',
  revenue: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900 dark:text-emerald-200',
  cogs: 'bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200',
  opex: 'bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200',
  other: 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-200',
};

const columns: EntityColumn<Account>[] = [
  { key: 'code', header: 'Code', sortable: true, width: '80px' },
  { key: 'name', header: 'Name', sortable: true },
  {
    key: 'type',
    header: 'Type',
    sortable: true,
    render: (item) => (
      <Badge variant="outline" className={TYPE_COLORS[item.type] || ''}>
        {TYPE_LABELS[item.type] || item.type}
      </Badge>
    ),
  },
  { key: 'category', header: 'Category' },
  {
    key: 'status',
    header: 'Status',
    render: (item) => (
      <div className="flex items-center gap-1.5">
        {item.isSystem && (
          <Lock className="h-3.5 w-3.5 text-muted-foreground" aria-label="System account" />
        )}
        {item.isActive ? (
          <span className="text-sm text-muted-foreground">Active</span>
        ) : (
          <Badge variant="destructive">Inactive</Badge>
        )}
      </div>
    ),
  },
];

export function AccountsManager() {
  useDocumentTitle('Chart of Accounts');

  const accounts = useAccounts();
  const create = useCreateAccount();
  const update = useUpdateAccount();
  const del = useDeleteAccount();

  return (
    <EntityManager<Account>
      entityName="Account"
      entityNamePlural="Accounts"
      pageTitle="Chart of Accounts"
      pageDescription="Manage GL accounts for expense categorization and journal entries"
      icon={BookOpen}
      items={accounts}
      columns={columns}
      searchable
      searchKeys={['code', 'name', 'category']}
      searchPlaceholder="Search by code or name..."
      defaultView="table"
      formSections={[
        {
          fields: [
            {
              name: 'code',
              label: 'Account Code',
              type: 'text',
              required: true,
              placeholder: 'e.g., 6150',
              helperText: 'Must be 4 digits. Prefix determines type: 1xxx=Asset, 2xxx=Liability, 3xxx=Equity, 4xxx=Revenue, 5xxx=COGS, 6xxx=OpEx, 7xxx=Other',
              hideIf: (data: any) => data._isEditing,
            },
            {
              name: 'name',
              label: 'Account Name',
              type: 'text',
              required: true,
              placeholder: 'e.g., Vehicle Expenses',
            },
            {
              name: 'description',
              label: 'Description',
              type: 'textarea',
              placeholder: 'Optional notes about this account',
              rows: 2,
            },
            {
              name: 'isActive',
              label: 'Active',
              type: 'checkbox',
              placeholder: 'Account is active and available for new entries',
              hideIf: (data: any) => !data._isEditing,
            },
          ],
        },
      ]}
      getFormDefaults={() => ({ code: '', name: '', description: '', _isEditing: false })}
      getFormInitialData={(item) => ({
        code: item.code,
        name: item.name,
        description: item.description || '',
        isActive: item.isActive,
        _isEditing: true,
      })}
      transformFormData={(data) => {
        const { _isEditing, ...rest } = data;
        return {
          ...rest,
          // Pass empty string (not undefined) so backend can clear description
          description: rest.description?.trim() || '',
        };
      }}
      canDelete={(item) => !item.isSystem}
      onCreate={(data) => {
        const { description, ...rest } = data;
        // Only include description if non-empty
        return create.mutate({ ...rest, ...(description ? { description } : {}) });
      }}
      onUpdate={(id, data) => {
        const { code: _, ...updateData } = data;
        return update.mutate({ id: id as Id<"accounts">, ...updateData });
      }}
      onDelete={(id) => del.mutate({ id: id as Id<"accounts"> })}
    />
  );
}
