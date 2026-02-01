import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronDown, ChefHat, Package, CheckCircle, Lightbulb, Info } from 'lucide-react';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { cn } from '@/lib/utils';

const STORAGE_KEY = 'kitchenHelpMinimized';

interface KitchenHelpPanelProps {
  className?: string;
}

export function KitchenHelpPanel({ className }: KitchenHelpPanelProps) {
  const [isMinimized, setIsMinimized] = useState<boolean | null>(null);

  // Load state from localStorage on mount
  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      // Default to expanded (false) on first visit
      setIsMinimized(stored === 'true');
    } catch {
      setIsMinimized(false);
    }
  }, []);

  // Save state to localStorage when changed
  const toggleMinimized = () => {
    const newValue = !isMinimized;
    setIsMinimized(newValue);
    try {
      localStorage.setItem(STORAGE_KEY, String(newValue));
    } catch {
      // localStorage unavailable
    }
  };

  // Don't render until we've loaded the state
  if (isMinimized === null) return null;

  return (
    <Card className={cn('bg-blue-50 dark:bg-blue-950/20 border-blue-200 dark:border-blue-800', className)}>
      <CardHeader className="py-3 cursor-pointer" onClick={toggleMinimized}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-blue-700 dark:text-blue-300">
            <Info className="h-4 w-4" />
            <span className="font-medium">How to use Kitchen View</span>
          </div>
          <ChevronDown
            className={cn(
              'h-5 w-5 text-blue-600 dark:text-blue-400 transition-transform duration-200',
              !isMinimized && 'rotate-180'
            )}
          />
        </div>
      </CardHeader>

      <AnimatePresence>
        {!isMinimized && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            <CardContent className="pt-0 pb-4">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
                {/* Step 1 */}
                <div className="space-y-2">
                  <div className="flex items-center gap-2 text-blue-700 dark:text-blue-300 font-semibold">
                    <ChefHat className="h-5 w-5" />
                    <span>STEP 1: PRODUCTION</span>
                  </div>
                  <p className="text-sm text-blue-600 dark:text-blue-400">
                    Tap <span className="font-mono bg-blue-100 dark:bg-blue-900 px-1 rounded">[+1]</span> or{' '}
                    <span className="font-mono bg-blue-100 dark:bg-blue-900 px-1 rounded">[+5]</span> buttons
                    to record balls you've made. Balls will appear in the tray, then flow to waiting orders.
                  </p>
                </div>

                {/* Step 2 */}
                <div className="space-y-2">
                  <div className="flex items-center gap-2 text-blue-700 dark:text-blue-300 font-semibold">
                    <Package className="h-5 w-5" />
                    <span>STEP 2: PACKING</span>
                  </div>
                  <p className="text-sm text-blue-600 dark:text-blue-400">
                    When a package turns <span className="font-semibold text-yellow-600">YELLOW</span>,
                    it's ready to pack. Tap the yellow package to mark it as{' '}
                    <span className="font-semibold text-green-600">PACKED</span> (turns green).
                  </p>
                </div>

                {/* Step 3 */}
                <div className="space-y-2">
                  <div className="flex items-center gap-2 text-blue-700 dark:text-blue-300 font-semibold">
                    <CheckCircle className="h-5 w-5" />
                    <span>STEP 3: CONFIRM</span>
                  </div>
                  <p className="text-sm text-blue-600 dark:text-blue-400">
                    Once <span className="font-semibold">ALL</span> packages are green,
                    hold the confirm button for 1 second to complete the order.
                  </p>
                </div>
              </div>

              {/* Tips */}
              <div className="flex items-start gap-2 pt-3 border-t border-blue-200 dark:border-blue-800">
                <Lightbulb className="h-4 w-4 text-yellow-500 mt-0.5 shrink-0" />
                <div className="text-sm text-blue-600 dark:text-blue-400 space-x-3">
                  <span>Tap a <span className="font-semibold text-green-600">GREEN</span> package to unpack it (goes back to yellow)</span>
                  <span className="text-blue-400">|</span>
                  <span>Tap <span className="font-mono bg-blue-100 dark:bg-blue-900 px-1 rounded">[+]</span> to reveal <span className="font-mono bg-blue-100 dark:bg-blue-900 px-1 rounded">[-1]</span> for corrections</span>
                  <span className="text-blue-400">|</span>
                  <span>Overflow balls stay in the tray for the next order</span>
                </div>
              </div>
            </CardContent>
          </motion.div>
        )}
      </AnimatePresence>
    </Card>
  );
}

export default KitchenHelpPanel;
