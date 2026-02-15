/**
 * TagsManager - CRUD page for recipe/product/packaging tags.
 * Uses EntityManager generic component with factory mutation hooks.
 */

import { useDocumentTitle } from '@/hooks/useDocumentTitle';
import { Tag } from 'lucide-react';
import { EntityManager } from '@/components/shared/EntityManager';
import type { EntityColumn } from '@/components/shared/EntityManager';
import {
  useConvexTags,
  useConvexCreateTag,
  useConvexUpdateTag,
  useConvexDeleteTag,
} from '@/hooks/convex';
import type { Id } from '../../convex/_generated/dataModel';

type TagItem = NonNullable<ReturnType<typeof useConvexTags>>[number];

const columns: EntityColumn<TagItem>[] = [
  { key: 'name', header: 'Tag Name', sortable: true },
];

export function TagsManager() {
  useDocumentTitle('Tags');

  const tags = useConvexTags();
  const create = useConvexCreateTag();
  const update = useConvexUpdateTag();
  const del = useConvexDeleteTag();

  return (
    <EntityManager<TagItem>
      entityName="Tag"
      entityNamePlural="Tags"
      pageTitle="Tags"
      pageDescription="Manage tags for recipes, products, and packaging"
      icon={Tag}
      items={tags}
      columns={columns}
      searchable
      searchKeys={['name']}
      searchPlaceholder="Search tags..."
      supportsUndo
      defaultView="cards"
      formSections={[
        {
          fields: [
            { name: 'name', label: 'Tag Name', type: 'text', required: true, placeholder: 'e.g., Vegan, Gluten-Free' },
          ],
        },
      ]}
      getFormDefaults={() => ({})}
      getFormInitialData={(item) => ({ name: item.name })}
      onCreate={(data) => create.mutate(data)}
      onUpdate={(id, data) => update.mutate({ id: id as Id<"tags">, ...data })}
      onDelete={(id) => del.mutate({ id: id as Id<"tags"> })}
    />
  );
}
