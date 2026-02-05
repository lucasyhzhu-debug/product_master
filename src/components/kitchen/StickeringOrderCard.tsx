import { motion } from 'framer-motion';
import { Tag } from 'lucide-react';
import { Button } from '@/components/ui/button';
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
    <motion.div
      layout
      className="rounded-lg overflow-hidden border border-slate-600 bg-slate-700/50 hover:bg-slate-700 transition-colors"
    >
      {/* Header */}
      <div className="px-3 py-2 flex items-center justify-between bg-slate-800/50 border-b border-slate-600/50">
        <span className="font-mono text-sm font-bold text-white">{order.orderNumber}</span>
        <Tag className="h-4 w-4 text-blue-400" />
      </div>

      {/* Content */}
      <div className="p-3 space-y-2">
        <p className="text-sm text-slate-300 truncate">{order.customerName}</p>

        <div className="text-xs text-slate-400">
          <div className="flex items-center gap-2">
            <span>{order.totalPackages} package{order.totalPackages > 1 ? 's' : ''}</span>
          </div>

          {order.stickerTypes.length > 0 && (
            <div className="mt-1 space-y-0.5">
              {order.stickerTypes.map((sticker, idx) => (
                <div key={idx} className="flex items-center gap-1">
                  <span>•</span>
                  <span>
                    {sticker.count}× {sticker.name}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Apply Button */}
        <Button
          size="sm"
          onClick={onApplyStickers}
          disabled={disabled}
          className="w-full mt-2 bg-blue-600 hover:bg-blue-500 text-white"
        >
          <Tag className="h-3 w-3 mr-1" />
          Apply Stickers
        </Button>
      </div>
    </motion.div>
  );
}
