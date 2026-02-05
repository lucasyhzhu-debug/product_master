import { Tag } from 'lucide-react';
import type { Id } from '../../../convex/_generated/dataModel';

interface StickeringOrderCardProps {
  order: {
    _id: Id<'orders'>;
    orderNumber: string;
    customerName: string;
    totalPackages: number;
    stickerTypes: Array<{
      name: string;
      count: number;
    }>;
  };
  onApplyStickers: () => void;
  disabled?: boolean;
}

export function StickeringOrderCard({ order, onApplyStickers, disabled = false }: StickeringOrderCardProps) {
  return (
    <div className="rounded-lg overflow-hidden border-2 border-gray-300 bg-white hover:shadow-sm transition-shadow">
      {/* Header */}
      <div className="px-3.5 py-2.5 flex items-center justify-between bg-gray-50 border-b border-gray-200">
        <span className="font-mono text-base font-bold text-gray-900">{order.orderNumber}</span>
        <Tag className="h-4 w-4 text-blue-600" />
      </div>

      {/* Content */}
      <div className="p-3.5 space-y-2.5">
        <p className="text-sm font-medium text-gray-900 truncate">{order.customerName}</p>

        <div className="text-xs text-gray-600 font-medium">
          <div>
            {order.totalPackages} package{order.totalPackages > 1 ? 's' : ''}
          </div>

          {order.stickerTypes.length > 0 && (
            <div className="mt-1.5 space-y-0.5">
              {order.stickerTypes.map((sticker, idx) => (
                <div key={idx} className="flex items-center gap-1.5">
                  <span className="text-gray-400">•</span>
                  <span>
                    {sticker.count}× {sticker.name}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Apply Button */}
        <button
          onClick={onApplyStickers}
          disabled={disabled}
          className="w-full mt-2 bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white font-semibold py-2.5 px-4 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed touch-manipulation"
        >
          <Tag className="h-3.5 w-3.5 inline mr-1.5" />
          Apply Stickers
        </button>
      </div>
    </div>
  );
}
