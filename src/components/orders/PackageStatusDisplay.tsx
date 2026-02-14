import * as React from 'react';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Package, PackageCheck, PackageOpen, PackageX } from 'lucide-react';
import { cn } from '@/lib/utils';

// ============================================
// Types
// ============================================

export type PackageStatus = 'empty' | 'filling' | 'filled' | 'packed';

export interface PackageItem {
  id: string;
  productName: string;
  productVariant?: string | null;
  quantity: number;
  status: PackageStatus;
  ballsFilled?: number;
  ballsPerPackage?: number;
}

interface PackageStatusDisplayProps {
  items: PackageItem[];
  compact?: boolean;
  className?: string;
}

// ============================================
// Status Configuration
// ============================================

const STATUS_CONFIG: Record<
  PackageStatus,
  {
    label: string;
    color: string;
    bgColor: string;
    icon: React.ElementType;
  }
> = {
  empty: {
    label: 'Empty',
    color: 'text-gray-500',
    bgColor: 'bg-gray-100',
    icon: PackageX,
  },
  filling: {
    label: 'Filling',
    color: 'text-orange-600',
    bgColor: 'bg-orange-100',
    icon: PackageOpen,
  },
  filled: {
    label: 'Filled',
    color: 'text-yellow-600',
    bgColor: 'bg-yellow-100',
    icon: Package,
  },
  packed: {
    label: 'Packed',
    color: 'text-green-600',
    bgColor: 'bg-green-100',
    icon: PackageCheck,
  },
};

// ============================================
// Single Package Item
// ============================================

function PackageItemCard({
  item,
  compact = false,
}: {
  item: PackageItem;
  compact?: boolean;
}) {
  const config = STATUS_CONFIG[item.status];
  const Icon = config.icon;

  // Format product display
  const productDisplay = item.productVariant
    ? `${item.productName} (${item.productVariant})`
    : item.productName;

  return (
    <Card
      className={cn(
        'overflow-hidden transition-colors',
        config.bgColor,
        compact && 'shadow-none border-0'
      )}
    >
      <CardContent className={cn('p-3', compact && 'p-2')}>
        <div className="flex items-center justify-between gap-2">
          {/* Product info */}
          <div className="flex items-center gap-2 min-w-0 flex-1">
            <Icon className={cn('h-5 w-5 shrink-0', config.color)} />
            <div className="min-w-0">
              <p className={cn('font-medium truncate', compact && 'text-sm')}>
                {item.quantity}x {productDisplay}
              </p>
              {!compact && item.ballsFilled !== undefined && item.ballsPerPackage !== undefined && (
                <p className="text-xs text-muted-foreground">
                  {item.ballsFilled}/{item.ballsPerPackage} balls
                </p>
              )}
            </div>
          </div>

          {/* Status badge */}
          <Badge
            variant="outline"
            className={cn(
              'shrink-0',
              config.color,
              'border-current'
            )}
          >
            {config.label}
          </Badge>
        </div>
      </CardContent>
    </Card>
  );
}

// ============================================
// Summary Stats Bar
// ============================================

function StatusSummary({ items }: { items: PackageItem[] }) {
  const counts = React.useMemo(() => {
    const result: Record<PackageStatus, number> = {
      empty: 0,
      filling: 0,
      filled: 0,
      packed: 0,
    };
    items.forEach((item) => {
      result[item.status]++;
    });
    return result;
  }, [items]);

  const total = items.length;

  return (
    <div className="flex items-center gap-3 text-sm">
      {(Object.keys(STATUS_CONFIG) as PackageStatus[]).map((status) => {
        if (counts[status] === 0) return null;
        const config = STATUS_CONFIG[status];
        return (
          <div key={status} className="flex items-center gap-1">
            <div className={cn('h-2 w-2 rounded-full', config.bgColor, config.color.replace('text-', 'bg-'))} />
            <span className="text-muted-foreground">
              {counts[status]}/{total}
            </span>
          </div>
        );
      })}
    </div>
  );
}

// ============================================
// Main Component
// ============================================

export function PackageStatusDisplay({
  items,
  compact = false,
  className,
}: PackageStatusDisplayProps) {
  if (items.length === 0) {
    return (
      <div className={cn('text-sm text-muted-foreground', className)}>
        No items to package
      </div>
    );
  }

  // Group items by status for organized display
  const groupedItems = React.useMemo(() => {
    const groups: Record<PackageStatus, PackageItem[]> = {
      empty: [],
      filling: [],
      filled: [],
      packed: [],
    };
    items.forEach((item) => {
      groups[item.status].push(item);
    });
    return groups;
  }, [items]);

  return (
    <div className={cn('space-y-4', compact && 'space-y-2', className)}>
      {/* Summary bar */}
      <div className="flex items-center justify-between">
        <span className={cn('font-medium', compact && 'text-sm')}>
          Package Status
        </span>
        <StatusSummary items={items} />
      </div>

      {/* Items list - prioritize non-packed items */}
      <div className={cn('space-y-2', compact && 'space-y-1')}>
        {/* Show filling/filled items first (action needed) */}
        {groupedItems.filling.map((item) => (
          <PackageItemCard key={item.id} item={item} compact={compact} />
        ))}
        {groupedItems.filled.map((item) => (
          <PackageItemCard key={item.id} item={item} compact={compact} />
        ))}
        {groupedItems.empty.map((item) => (
          <PackageItemCard key={item.id} item={item} compact={compact} />
        ))}

        {/* Show packed items last (completed) */}
        {groupedItems.packed.length > 0 && (
          <>
            {!compact && groupedItems.packed.length > 0 && (
              <div className="pt-2 border-t">
                <p className="text-xs text-muted-foreground mb-2">Completed</p>
              </div>
            )}
            {groupedItems.packed.map((item) => (
              <PackageItemCard key={item.id} item={item} compact={compact} />
            ))}
          </>
        )}
      </div>
    </div>
  );
}

export default PackageStatusDisplay;
