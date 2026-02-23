import { useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Eye } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { formatCurrency } from '@/lib/utils';
import type { PosProduct, PackagingPosProduct } from '@/hooks/convex/useMenuProducts';

interface POSPreviewPanelProps {
  posProducts: PosProduct[] | undefined;
  packagingPosProducts: PackagingPosProduct[] | undefined;
}

export function POSPreviewPanel({ posProducts, packagingPosProducts }: POSPreviewPanelProps) {
  // Determine how many food slots to show: at least 4, or highest occupied slot
  const foodSlotCount = useMemo(() => {
    const maxOccupied = posProducts?.reduce((max, p) => Math.max(max, p.posSlot), 0) ?? 0;
    return Math.max(4, maxOccupied);
  }, [posProducts]);

  // Determine how many packaging slots to show: at least 4, or highest occupied slot
  const packagingSlotCount = useMemo(() => {
    const maxOccupied = packagingPosProducts?.reduce((max, p) => Math.max(max, p.packagingPosSlot), 0) ?? 0;
    return Math.max(4, maxOccupied);
  }, [packagingPosProducts]);

  // Build slot arrays for rendering
  const foodSlots = useMemo(() => {
    const slots: Array<PosProduct | null> = Array(foodSlotCount).fill(null);
    posProducts?.forEach((p) => {
      if (p.posSlot >= 1 && p.posSlot <= foodSlotCount) {
        slots[p.posSlot - 1] = p;
      }
    });
    return slots;
  }, [posProducts, foodSlotCount]);

  const packagingSlots = useMemo(() => {
    const slots: Array<PackagingPosProduct | null> = Array(packagingSlotCount).fill(null);
    packagingPosProducts?.forEach((p) => {
      if (p.packagingPosSlot >= 1 && p.packagingPosSlot <= packagingSlotCount) {
        slots[p.packagingPosSlot - 1] = p;
      }
    });
    return slots;
  }, [packagingPosProducts, packagingSlotCount]);

  return (
    <Card className="border-2 border-gray-100 overflow-hidden">
      {/* Header */}
      <CardHeader className="pb-3 bg-gradient-to-r from-gray-50 to-white">
        <CardTitle className="flex items-center gap-2 text-sm">
          <Eye className="h-4 w-4 text-muted-foreground" />
          <span>POS Order Preview</span>
          <span className="ml-auto flex items-center gap-1.5">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75" />
              <span className="relative inline-flex rounded-full h-2 w-2 bg-green-500" />
            </span>
            <span className="text-xs text-green-600 font-medium">LIVE</span>
          </span>
        </CardTitle>
      </CardHeader>

      <CardContent className="pt-0 space-y-4">
        {/* Food Products Grid */}
        {foodSlots.length > 0 && (
          <div>
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">
              Food
            </p>
            <div className="grid grid-cols-2 gap-2">
              <AnimatePresence mode="popLayout">
                {foodSlots.map((product, index) => (
                  <motion.div
                    key={product ? product._id : `food-empty-${index}`}
                    layout
                    initial={{ opacity: 0, scale: 0.9 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.9 }}
                    transition={{ duration: 0.2 }}
                  >
                    {product ? (
                      <button
                        type="button"
                        className="w-full flex flex-col items-start p-3 rounded-lg border bg-card text-left transition-colors cursor-default"
                      >
                        <span className="font-semibold text-xs truncate w-full">
                          {product.name}
                        </span>
                        <span className="text-[10px] text-muted-foreground">
                          {product.grams}g
                        </span>
                        <span className="text-xs font-medium">
                          {formatCurrency(product.defaultPrice)}
                        </span>
                      </button>
                    ) : (
                      <div className="w-full flex items-center justify-center p-3 rounded-lg border-2 border-dashed border-gray-200 min-h-[68px]">
                        <span className="text-[10px] text-gray-300">
                          Slot {index + 1}
                        </span>
                      </div>
                    )}
                  </motion.div>
                ))}
              </AnimatePresence>
            </div>
          </div>
        )}

        {/* Packaging Products Grid */}
        {(packagingSlots.length > 0 || (packagingPosProducts && packagingPosProducts.length > 0)) && (
          <div>
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">
              Packaging
            </p>
            <div className="grid grid-cols-2 gap-2">
              <AnimatePresence mode="popLayout">
                {packagingSlots.map((product, index) => (
                  <motion.div
                    key={product ? product._id : `pkg-empty-${index}`}
                    layout
                    initial={{ opacity: 0, scale: 0.9 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.9 }}
                    transition={{ duration: 0.2 }}
                  >
                    {product ? (
                      <button
                        type="button"
                        className="w-full flex flex-col items-start p-3 rounded-lg border bg-[var(--color-status-info-bg)]/50 border-[var(--color-status-info)]/20 text-left transition-colors cursor-default"
                      >
                        <span className="font-semibold text-xs truncate w-full">
                          {product.name}
                        </span>
                        <span className="text-xs font-medium">
                          {formatCurrency(product.defaultPrice)}
                        </span>
                      </button>
                    ) : (
                      <div className="w-full flex items-center justify-center p-3 rounded-lg border-2 border-dashed border-blue-100 min-h-[56px]">
                        <span className="text-[10px] text-blue-200">
                          Slot {index + 1}
                        </span>
                      </div>
                    )}
                  </motion.div>
                ))}
              </AnimatePresence>
            </div>
          </div>
        )}

        <Separator />

        {/* Mock Order Summary */}
        <div className="space-y-2 opacity-40">
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">
            Order Summary
          </p>
          <div className="space-y-1 text-xs text-gray-400">
            <div className="flex justify-between">
              <span>Subtotal</span>
              <span>-</span>
            </div>
            <div className="flex justify-between">
              <span>Discount</span>
              <span>-</span>
            </div>
            <Separator />
            <div className="flex justify-between font-semibold text-sm text-gray-400">
              <span>Total</span>
              <span>-</span>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
