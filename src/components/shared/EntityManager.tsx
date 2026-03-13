/**
 * EntityManager - Generic CRUD UI component with table/card toggle,
 * FormBuilder-based dialogs, delete confirmation + optional undo toast,
 * bulk selection, client-side search, and sortable columns.
 *
 * Consumed by simple CRUD pages (Locations, Ingredients, Materials, etc.)
 */

import { useState, useMemo, useCallback, type ReactNode } from 'react';
import {
  Plus,
  Search,
  Pencil,
  Trash2,
  ChevronUp,
  ChevronDown,
  List,
  LayoutGrid,
  Package,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { Card, CardContent } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';

import { PageHeader } from '@/components/layout/PageHeader';
import { FormBuilder } from './FormBuilder';
import type { FormSection } from './FormBuilder';
import { ConfirmDialog } from './ConfirmDialog';
import { EmptyState } from './EmptyState';
import { TablePageSkeleton } from './LoadingState';
import { cn } from '@/lib/utils';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface EntityColumn<T> {
  key: keyof T | string;
  header: string;
  width?: string;
  sortable?: boolean;
  render?: (item: T) => ReactNode;
}

export interface EntityManagerConfig<T extends { _id: string }> {
  // Identity
  entityName: string;
  entityNamePlural: string;

  // Data
  items: T[] | undefined;

  // Display
  columns: EntityColumn<T>[];
  icon?: LucideIcon;

  // Form (for create/edit dialog)
  formSections: FormSection<any>[];
  getFormDefaults: () => Record<string, any>;
  getFormInitialData: (item: T) => Record<string, any>;
  transformFormData?: (data: Record<string, any>) => Record<string, any>;

  // Mutations
  onCreate: (data: any) => Promise<any>;
  onUpdate: (id: string, data: any) => Promise<any>;
  onDelete: (id: string) => Promise<any>;
  onBulkDelete?: (ids: string[]) => Promise<void>;

  /** Per-item delete visibility. When provided, delete button is hidden for items where canDelete returns false. */
  canDelete?: (item: T) => boolean;

  // Page layout
  pageTitle: string;
  pageDescription?: string;
  backTo?: string;
  backLabel?: string;

  // Card view
  cardRender?: (item: T, actions: { onEdit: () => void; onDelete: () => void }) => ReactNode;

  // Behavior
  searchable?: boolean;
  searchKeys?: (keyof T)[];
  searchPlaceholder?: string;
  defaultView?: 'table' | 'cards';
  supportsUndo?: boolean;
}

// ---------------------------------------------------------------------------
// useViewPreference hook -- persists table/card toggle in localStorage
// ---------------------------------------------------------------------------

function useViewPreference(
  key: string,
  defaultView: 'table' | 'cards' = 'table'
): ['table' | 'cards', (v: 'table' | 'cards') => void] {
  const storageKey = `entityManager:${key}:view`;

  const [view, setViewState] = useState<'table' | 'cards'>(() => {
    try {
      const stored = localStorage.getItem(storageKey);
      if (stored === 'table' || stored === 'cards') return stored;
    } catch {
      // localStorage unavailable
    }
    return defaultView;
  });

  const setView = useCallback(
    (v: 'table' | 'cards') => {
      setViewState(v);
      try {
        localStorage.setItem(storageKey, v);
      } catch {
        // localStorage unavailable
      }
    },
    [storageKey]
  );

  return [view, setView];
}

// ---------------------------------------------------------------------------
// Sort state
// ---------------------------------------------------------------------------

type SortDirection = 'asc' | 'desc';

interface SortState {
  key: string;
  direction: SortDirection;
}

// ---------------------------------------------------------------------------
// EntityManager component
// ---------------------------------------------------------------------------

export function EntityManager<T extends { _id: string }>(config: EntityManagerConfig<T>) {
  const {
    entityName,
    entityNamePlural,
    items,
    columns,
    icon: Icon = Package,
    formSections,
    getFormDefaults,
    getFormInitialData,
    transformFormData,
    onCreate,
    onUpdate,
    onDelete,
    onBulkDelete,
    canDelete,
    pageTitle,
    pageDescription,
    backTo,
    backLabel,
    cardRender,
    searchable = false,
    searchKeys,
    searchPlaceholder,
    defaultView = 'table',
    supportsUndo = false,
  } = config;

  // View toggle
  const [view, setView] = useViewPreference(entityName, defaultView);

  // Dialog state
  const [formDialogOpen, setFormDialogOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<T | null>(null);

  // Delete state
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deletingItem, setDeletingItem] = useState<T | null>(null);

  // Search state
  const [searchQuery, setSearchQuery] = useState('');

  // Sort state
  const [sort, setSort] = useState<SortState | null>(null);

  // Bulk selection
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  // -------------------------------------------------------------------------
  // Computed: filtered + sorted items
  // -------------------------------------------------------------------------

  const filteredItems = useMemo(() => {
    if (!items) return undefined;
    if (!searchable || !searchQuery.trim()) return items;

    const query = searchQuery.toLowerCase();
    return items.filter((item) => {
      const keys = searchKeys ?? (Object.keys(item) as (keyof T)[]);
      return keys.some((key) => {
        const val = item[key];
        if (typeof val === 'string') return val.toLowerCase().includes(query);
        if (typeof val === 'number') return String(val).includes(query);
        return false;
      });
    });
  }, [items, searchable, searchQuery, searchKeys]);

  const sortedItems = useMemo(() => {
    if (!filteredItems || !sort) return filteredItems;

    return [...filteredItems].sort((a, b) => {
      const aVal = (a as any)[sort.key];
      const bVal = (b as any)[sort.key];

      if (aVal == null && bVal == null) return 0;
      if (aVal == null) return sort.direction === 'asc' ? -1 : 1;
      if (bVal == null) return sort.direction === 'asc' ? 1 : -1;

      let cmp = 0;
      if (typeof aVal === 'string' && typeof bVal === 'string') {
        cmp = aVal.localeCompare(bVal);
      } else if (typeof aVal === 'number' && typeof bVal === 'number') {
        cmp = aVal - bVal;
      } else {
        cmp = String(aVal).localeCompare(String(bVal));
      }

      return sort.direction === 'asc' ? cmp : -cmp;
    });
  }, [filteredItems, sort]);

  const displayItems = sortedItems;

  // -------------------------------------------------------------------------
  // Handlers
  // -------------------------------------------------------------------------

  const handleCreate = () => {
    setEditingItem(null);
    setFormDialogOpen(true);
  };

  const handleEdit = (item: T) => {
    setEditingItem(item);
    setFormDialogOpen(true);
  };

  const handleDeleteRequest = (item: T) => {
    setDeletingItem(item);
    setDeleteDialogOpen(true);
  };

  const handleDeleteConfirm = async () => {
    if (!deletingItem) return;

    // Cache item data for potential undo
    const cachedData = { ...getFormInitialData(deletingItem) };
    const itemName =
      columns.length > 0 && columns[0].render
        ? undefined
        : (deletingItem as any)[columns[0]?.key as string] ?? entityName;

    try {
      await onDelete(deletingItem._id);
      setDeleteDialogOpen(false);
      setDeletingItem(null);
      // Clear from selection
      setSelectedIds((prev) => {
        const next = new Set(prev);
        next.delete(deletingItem._id);
        return next;
      });

      if (supportsUndo) {
        toast.success(`${itemName ?? entityName} deleted`, {
          action: {
            label: 'Undo',
            onClick: async () => {
              try {
                await onCreate(transformFormData ? transformFormData(cachedData) : cachedData);
                toast.success(`${itemName ?? entityName} restored`);
              } catch {
                toast.error(`Failed to restore ${entityName.toLowerCase()}`);
              }
            },
          },
        });
      } else {
        toast.success(`${entityName} deleted`);
      }
    } catch (error) {
      console.error(`Failed to delete ${entityName}:`, error);
      toast.error(
        error instanceof Error ? error.message : `Failed to delete ${entityName.toLowerCase()}`
      );
    }
  };

  const handleFormSubmit = async (data: Record<string, any>) => {
    const transformed = transformFormData ? transformFormData(data) : data;

    try {
      if (editingItem) {
        await onUpdate(editingItem._id, transformed);
        toast.success(`${entityName} updated`);
      } else {
        await onCreate(transformed);
        toast.success(`${entityName} created`);
      }
      setFormDialogOpen(false);
      setEditingItem(null);
    } catch (error) {
      console.error(`Failed to save ${entityName}:`, error);
      toast.error(
        error instanceof Error ? error.message : `Failed to save ${entityName.toLowerCase()}`
      );
      throw error; // Re-throw so FormBuilder knows submission failed
    }
  };

  const handleSort = (key: string) => {
    setSort((prev) => {
      if (prev?.key === key) {
        return prev.direction === 'asc'
          ? { key, direction: 'desc' }
          : null; // Third click clears sort
      }
      return { key, direction: 'asc' };
    });
  };

  // Bulk selection handlers
  const handleSelectAll = (checked: boolean) => {
    if (!displayItems) return;
    if (checked) {
      const deletableItems = displayItems.filter(item => !canDelete || canDelete(item));
      setSelectedIds(new Set(deletableItems.map((item) => item._id)));
    } else {
      setSelectedIds(new Set());
    }
  };

  const handleSelectItem = (id: string, checked: boolean) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (checked) {
        next.add(id);
      } else {
        next.delete(id);
      }
      return next;
    });
  };

  const handleBulkDelete = async () => {
    if (selectedIds.size === 0) return;

    const ids = Array.from(selectedIds);

    try {
      if (onBulkDelete) {
        await onBulkDelete(ids);
      } else {
        // Fall back to individual deletes
        await Promise.all(ids.map((id) => onDelete(id)));
      }

      toast.success(`${ids.length} ${ids.length === 1 ? entityName.toLowerCase() : entityNamePlural.toLowerCase()} deleted`);
      setSelectedIds(new Set());
    } catch (error) {
      console.error(`Failed to bulk delete:`, error);
      toast.error(
        error instanceof Error ? error.message : `Failed to delete selected ${entityNamePlural.toLowerCase()}`
      );
    }
  };

  // -------------------------------------------------------------------------
  // Loading state
  // -------------------------------------------------------------------------

  if (items === undefined) {
    return <TablePageSkeleton />;
  }

  // -------------------------------------------------------------------------
  // Empty state
  // -------------------------------------------------------------------------

  if (items.length === 0) {
    return (
      <div className="space-y-6">
        <PageHeader
          title={pageTitle}
          description={pageDescription}
          backTo={backTo}
          backLabel={backLabel}
        />
        <EmptyState
          icon={Icon}
          title={`No ${entityNamePlural}`}
          description={`Get started by adding your first ${entityName.toLowerCase()}.`}
          action={{ label: `Add ${entityName}`, onClick: handleCreate }}
        />
        {/* Keep form dialog available even in empty state */}
        <FormDialog
          open={formDialogOpen}
          onOpenChange={setFormDialogOpen}
          editing={!!editingItem}
          entityName={entityName}
          formSections={formSections}
          initialData={editingItem ? getFormInitialData(editingItem) : getFormDefaults()}
          onSubmit={handleFormSubmit}
        />
      </div>
    );
  }

  // -------------------------------------------------------------------------
  // Derived state for rendering
  // -------------------------------------------------------------------------

  const allSelected = displayItems ? displayItems.length > 0 && displayItems.every((item) => selectedIds.has(item._id)) : false;
  const someSelected = selectedIds.size > 0;

  // -------------------------------------------------------------------------
  // Render
  // -------------------------------------------------------------------------

  return (
    <div className="space-y-6">
      {/* Page header with Add button + view toggle */}
      <PageHeader
        title={pageTitle}
        description={pageDescription}
        backTo={backTo}
        backLabel={backLabel}
        action={
          <div className="flex items-center gap-2">
            {/* View toggle */}
            <div className="flex items-center rounded-lg border bg-background p-0.5">
              <Button
                variant={view === 'table' ? 'secondary' : 'ghost'}
                size="sm"
                className="h-8 w-8 p-0"
                onClick={() => setView('table')}
                title="Table view"
              >
                <List className="h-4 w-4" />
              </Button>
              <Button
                variant={view === 'cards' ? 'secondary' : 'ghost'}
                size="sm"
                className="h-8 w-8 p-0"
                onClick={() => setView('cards')}
                title="Card view"
              >
                <LayoutGrid className="h-4 w-4" />
              </Button>
            </div>
            <Button onClick={handleCreate}>
              <Plus className="h-4 w-4 mr-2" />
              Add {entityName}
            </Button>
          </div>
        }
      />

      {/* Search bar */}
      {searchable && (
        <div className="relative max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder={searchPlaceholder ?? `Search ${entityNamePlural.toLowerCase()}...`}
            className="pl-10"
          />
        </div>
      )}

      {/* Bulk action bar */}
      {someSelected && (
        <div className="flex items-center gap-3 rounded-lg border bg-muted/50 px-4 py-2">
          <span className="text-sm font-medium">
            {selectedIds.size} selected
          </span>
          <Button
            variant="destructive"
            size="sm"
            onClick={handleBulkDelete}
          >
            <Trash2 className="h-4 w-4 mr-1" />
            Delete Selected
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setSelectedIds(new Set())}
          >
            Clear selection
          </Button>
        </div>
      )}

      {/* Search yields no results */}
      {displayItems && displayItems.length === 0 && searchQuery.trim() && (
        <div className="text-center py-12 text-muted-foreground">
          <Search className="h-10 w-10 mx-auto mb-3 opacity-40" />
          <p className="text-sm">No {entityNamePlural.toLowerCase()} match "{searchQuery}"</p>
        </div>
      )}

      {/* Table view */}
      {view === 'table' && displayItems && displayItems.length > 0 && (
        <div className="rounded-xl border">
          <Table>
            <TableHeader>
              <TableRow>
                {/* Checkbox column */}
                <TableHead className="w-[40px]">
                  <Checkbox
                    checked={allSelected}
                    onCheckedChange={(checked) => handleSelectAll(!!checked)}
                    aria-label="Select all"
                  />
                </TableHead>
                {columns.map((col) => (
                  <TableHead
                    key={String(col.key)}
                    style={col.width ? { width: col.width } : undefined}
                    className={col.sortable ? 'cursor-pointer select-none' : ''}
                    onClick={col.sortable ? () => handleSort(String(col.key)) : undefined}
                  >
                    <div className="flex items-center gap-1">
                      {col.header}
                      {col.sortable && sort?.key === String(col.key) && (
                        sort.direction === 'asc'
                          ? <ChevronUp className="h-3.5 w-3.5" />
                          : <ChevronDown className="h-3.5 w-3.5" />
                      )}
                    </div>
                  </TableHead>
                ))}
                {/* Actions column */}
                <TableHead className="w-[80px] text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {displayItems.map((item) => (
                <TableRow
                  key={item._id}
                  data-state={selectedIds.has(item._id) ? 'selected' : undefined}
                  className="hover:bg-accent/50"
                >
                  <TableCell>
                    <Checkbox
                      checked={selectedIds.has(item._id)}
                      onCheckedChange={(checked) => handleSelectItem(item._id, !!checked)}
                      aria-label={`Select ${entityName}`}
                    />
                  </TableCell>
                  {columns.map((col) => (
                    <TableCell key={String(col.key)}>
                      {col.render
                        ? col.render(item)
                        : String((item as any)[col.key as string] ?? '')}
                    </TableCell>
                  ))}
                  <TableCell className="text-right">
                    <div className="flex items-center justify-end gap-1">
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-8 w-8 p-0"
                        onClick={() => handleEdit(item)}
                        title={`Edit ${entityName}`}
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                      {(!canDelete || canDelete(item)) && (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-8 w-8 p-0 text-destructive hover:text-destructive"
                          onClick={() => handleDeleteRequest(item)}
                          title={`Delete ${entityName}`}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      {/* Card grid view */}
      {view === 'cards' && displayItems && displayItems.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {displayItems.map((item) =>
            cardRender ? (
              <div key={item._id} className="relative">
                {/* Selection checkbox overlay */}
                <div className="absolute top-3 left-3 z-10">
                  <Checkbox
                    checked={selectedIds.has(item._id)}
                    onCheckedChange={(checked) => handleSelectItem(item._id, !!checked)}
                    aria-label={`Select ${entityName}`}
                  />
                </div>
                {cardRender(item, {
                  onEdit: () => handleEdit(item),
                  onDelete: () => handleDeleteRequest(item),
                })}
              </div>
            ) : (
              <DefaultCard
                key={item._id}
                item={item}
                columns={columns}
                entityName={entityName}
                selected={selectedIds.has(item._id)}
                onSelect={(checked) => handleSelectItem(item._id, checked)}
                onEdit={() => handleEdit(item)}
                onDelete={() => handleDeleteRequest(item)}
                showDelete={!canDelete || canDelete(item)}
              />
            )
          )}
        </div>
      )}

      {/* Create/Edit dialog */}
      <FormDialog
        open={formDialogOpen}
        onOpenChange={(open) => {
          setFormDialogOpen(open);
          if (!open) setEditingItem(null);
        }}
        editing={!!editingItem}
        entityName={entityName}
        formSections={formSections}
        initialData={editingItem ? getFormInitialData(editingItem) : getFormDefaults()}
        onSubmit={handleFormSubmit}
      />

      {/* Delete confirmation dialog */}
      <ConfirmDialog
        open={deleteDialogOpen}
        onOpenChange={(open) => {
          setDeleteDialogOpen(open);
          if (!open) setDeletingItem(null);
        }}
        title={`Delete ${entityName}`}
        description={`Are you sure you want to delete this ${entityName.toLowerCase()}? This action cannot be undone.`}
        confirmLabel="Delete"
        variant="destructive"
        onConfirm={handleDeleteConfirm}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// FormDialog -- wraps FormBuilder inside a Dialog
// ---------------------------------------------------------------------------

interface FormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  editing: boolean;
  entityName: string;
  formSections: FormSection<any>[];
  initialData: Record<string, any>;
  onSubmit: (data: Record<string, any>) => Promise<void>;
}

function FormDialog({
  open,
  onOpenChange,
  editing,
  entityName,
  formSections,
  initialData,
  onSubmit,
}: FormDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{editing ? `Edit ${entityName}` : `Add ${entityName}`}</DialogTitle>
          <DialogDescription>
            {editing
              ? `Update the ${entityName.toLowerCase()} details below.`
              : `Fill in the details to create a new ${entityName.toLowerCase()}.`}
          </DialogDescription>
        </DialogHeader>
        <FormBuilder
          key={editing ? 'edit' : 'create'}
          sections={formSections}
          initialData={initialData}
          onSubmit={onSubmit}
          onCancel={() => onOpenChange(false)}
          submitLabel={editing ? 'Update' : 'Create'}
          cancelLabel="Cancel"
        />
      </DialogContent>
    </Dialog>
  );
}

// ---------------------------------------------------------------------------
// DefaultCard -- auto-generated card from columns config
// ---------------------------------------------------------------------------

interface DefaultCardProps<T extends { _id: string }> {
  item: T;
  columns: EntityColumn<T>[];
  entityName: string;
  selected: boolean;
  onSelect: (checked: boolean) => void;
  onEdit: () => void;
  onDelete: () => void;
  showDelete?: boolean;
}

function DefaultCard<T extends { _id: string }>({
  item,
  columns,
  entityName,
  selected,
  onSelect,
  onEdit,
  onDelete,
  showDelete = true,
}: DefaultCardProps<T>) {
  const [titleCol, ...detailCols] = columns;

  const titleValue = titleCol?.render
    ? titleCol.render(item)
    : String((item as any)[titleCol?.key as string] ?? '');

  return (
    <Card
      className={cn(
        'rounded-xl transition-shadow hover:shadow-md',
        selected && 'ring-2 ring-primary'
      )}
    >
      <CardContent className="p-4">
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-start gap-3 min-w-0">
            <Checkbox
              checked={selected}
              onCheckedChange={(checked) => onSelect(!!checked)}
              aria-label={`Select ${entityName}`}
              className="mt-1"
            />
            <div className="min-w-0">
              <div className="font-semibold truncate">{titleValue}</div>
              {detailCols.length > 0 && (
                <div className="mt-2 space-y-1">
                  {detailCols.map((col) => (
                    <div key={String(col.key)} className="text-sm text-muted-foreground">
                      <span className="font-medium">{col.header}: </span>
                      {col.render
                        ? col.render(item)
                        : String((item as any)[col.key as string] ?? '-')}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
          <div className="flex items-center gap-1 shrink-0">
            <Button
              variant="ghost"
              size="sm"
              className="h-8 w-8 p-0"
              onClick={onEdit}
              title={`Edit ${entityName}`}
            >
              <Pencil className="h-3.5 w-3.5" />
            </Button>
            {showDelete && (
              <Button
                variant="ghost"
                size="sm"
                className="h-8 w-8 p-0 text-destructive hover:text-destructive"
                onClick={onDelete}
                title={`Delete ${entityName}`}
              >
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
