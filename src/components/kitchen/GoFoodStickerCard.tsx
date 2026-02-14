/**
 * GoFoodStickerCard - Read-only depot info card for the Sticker panel.
 *
 * Shows depot stock, today's sales, and sticker status for a GoFood product.
 * Rendered ABOVE the manual sticker card for products with GoFood targets.
 */

import { FlipNumber } from './FlipNumber';
import { cn } from '@/lib/utils';

interface GoFoodStickerCardProps {
  productName: string;
  depotStock: number;
  soldToday: number;
  shippedToday: number;
  stickerDeficit: number;
  stickersAtGoldfinch: number;
  freshness: 'fresh' | 'day_old' | 'aging';
  lastSyncAt?: number;
  onSyncNow?: () => void;
}

export function GoFoodStickerCard({
  productName,
  depotStock,
  soldToday,
  shippedToday,
  stickerDeficit,
  stickersAtGoldfinch,
  freshness,
  lastSyncAt,
  onSyncNow,
}: GoFoodStickerCardProps) {
  const left = depotStock;
  const freshnessColor =
    freshness === 'fresh'
      ? 'bg-[var(--color-kitchen-success)]'
      : freshness === 'day_old'
        ? 'bg-[var(--color-kitchen-warning)]'
        : 'bg-[var(--color-kitchen-critical)]';

  const lastSyncStr = lastSyncAt
    ? new Date(lastSyncAt).toLocaleTimeString('en-US', {
        hour: 'numeric',
        minute: '2-digit',
        hour12: true,
      })
    : 'Never';

  return (
    <div className="bg-card rounded-xl shadow-sm border border-border border-l-4 overflow-hidden"
      style={{ borderLeftColor: 'var(--color-gofood)' }}>
      {/* Header */}
      <div className="px-3 py-2.5" style={{ backgroundColor: 'var(--color-gofood-light)' }}>
        <div className="flex items-center justify-between">
          <div className="min-w-0">
            <h3 className="text-base font-semibold text-foreground truncate">
              {productName}
            </h3>
            <div className="text-[10px] text-muted-foreground mt-0.5">
              Last sync {lastSyncStr}
            </div>
          </div>
          <span
            className="rounded-full px-2 py-0.5 text-[10px] font-semibold text-white shrink-0 ml-2"
            style={{ backgroundColor: 'var(--color-gofood-badge)' }}
          >
            GOFOOD
          </span>
        </div>
      </div>

      {/* Stat Row */}
      <div className="px-3 py-2.5">
        <div className="grid grid-cols-3 gap-2 text-center">
          {/* At Depot */}
          <div>
            <div className="text-xl font-bold text-foreground flex items-center justify-center">
              <FlipNumber value={depotStock} size="md" />
            </div>
            <div className="text-[10px] text-muted-foreground mt-0.5">At Depot</div>
            {shippedToday > 0 && (
              <div className="text-[9px] text-muted-foreground mt-0.5">
                +{shippedToday} today
              </div>
            )}
          </div>

          {/* Sold Today */}
          <div>
            <div className="text-xl font-bold text-foreground flex items-center justify-center">
              <FlipNumber value={soldToday} size="md" />
            </div>
            <div className="text-[10px] text-muted-foreground mt-0.5">Sold Today</div>
            <div className="text-[9px] text-muted-foreground mt-0.5">via GoFood</div>
          </div>

          {/* Left */}
          <div>
            <div className="text-xl font-bold text-foreground flex items-center justify-center">
              <FlipNumber value={left} size="md" />
            </div>
            <div className="text-[10px] text-muted-foreground mt-0.5 flex items-center justify-center gap-1">
              Left
              <span className={cn('inline-block w-2 h-2 rounded-full', freshnessColor)} />
            </div>
          </div>
        </div>
      </div>

      {/* Sticker Bar */}
      <div className="px-3 py-2 border-t border-border">
        <div className="flex items-center justify-between text-[11px] mb-1">
          <span className="text-muted-foreground font-medium">
            {stickersAtGoldfinch} stickers at Goldfinch
          </span>
        </div>
        <div className="w-full h-2 rounded-full bg-muted overflow-hidden">
          <div
            className="h-full rounded-full transition-all duration-300"
            style={{
              width: `${stickersAtGoldfinch > 0 ? Math.min((stickersAtGoldfinch / Math.max(depotStock, stickersAtGoldfinch, 1)) * 100, 100) : 0}%`,
              backgroundColor: 'var(--color-gofood)',
            }}
          />
        </div>

        {/* Deficit warning */}
        {stickerDeficit > 0 && (
          <div className="mt-1.5 text-[10px] text-[var(--color-kitchen-critical)] font-medium bg-[var(--color-kitchen-critical-bg)] rounded px-2 py-1">
            Sticker deficit: {stickerDeficit} missing
          </div>
        )}

        {/* Low stock warning */}
        {stickersAtGoldfinch < depotStock && stickersAtGoldfinch >= 0 && stickerDeficit === 0 && (
          <div className="mt-1.5 text-[10px] text-[var(--color-kitchen-warning)] font-medium bg-[var(--color-kitchen-warning-bg)] rounded px-2 py-1">
            Stickers ({stickersAtGoldfinch}) &lt; boxes ({depotStock})
          </div>
        )}
      </div>

      {/* Sync Now button */}
      {onSyncNow && (
        <div className="px-3 py-2 border-t border-border flex justify-end">
          <button
            onClick={onSyncNow}
            className="text-[11px] font-medium px-3 py-1 rounded-md hover:bg-muted transition-colors"
            style={{ color: 'var(--color-gofood)' }}
          >
            Sync Now
          </button>
        </div>
      )}
    </div>
  );
}
