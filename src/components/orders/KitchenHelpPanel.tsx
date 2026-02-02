import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronUp, ChefHat, Package, CheckCircle, Lightbulb, Info } from 'lucide-react';
import { cn } from '@/lib/utils';

const STORAGE_KEY = 'kitchenHelpMinimized';

// Button badge component for consistent styling
function ButtonBadge({ children, variant = 'primary' }: { children: React.ReactNode; variant?: 'primary' | 'dark' | 'slate' }) {
  const variantClasses = {
    primary: 'bg-blue-600 text-white shadow-blue-200',
    dark: 'bg-blue-800 text-white shadow-blue-200',
    slate: 'bg-slate-700 text-white',
  };

  return (
    <span className={cn(
      'inline-flex items-center justify-center px-1.5 py-0.5 rounded font-mono font-bold text-xs shadow-sm align-middle',
      variantClasses[variant]
    )}>
      {children}
    </span>
  );
}

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
    <div className={cn(
      'w-full rounded-xl shadow-xl overflow-hidden border transition-colors duration-300',
      'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-700',
      className
    )}>
      {/* Header */}
      <div
        className={cn(
          'p-4 md:p-6 flex justify-between items-center cursor-pointer transition-colors group',
          'bg-blue-50/50 dark:bg-slate-800/50 border-b border-slate-100 dark:border-slate-700',
          'hover:bg-blue-50 dark:hover:bg-slate-800'
        )}
        onClick={toggleMinimized}
      >
        <div className="flex items-center gap-3">
          <div className="text-blue-600 dark:text-blue-400 bg-blue-100 dark:bg-blue-900/30 p-2 rounded-full">
            <Info className="h-5 w-5" />
          </div>
          <h2 className="text-lg font-bold text-slate-800 dark:text-slate-100 tracking-tight">
            How to use Kitchen View
          </h2>
        </div>

        <ChevronUp
          className={cn(
            'h-6 w-6 transition-transform duration-200',
            'text-slate-400 group-hover:text-slate-600 dark:text-slate-500 dark:group-hover:text-slate-300',
            isMinimized && 'rotate-180'
          )}
        />
      </div>

      <AnimatePresence>
        {!isMinimized && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            {/* Body Content */}
            <div className="p-6 md:p-8">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-8 md:gap-12 relative">

                {/* Divider lines for desktop */}
                <div className="hidden md:block absolute top-4 bottom-4 left-1/3 w-px bg-slate-100 dark:bg-slate-700" />
                <div className="hidden md:block absolute top-4 bottom-4 right-1/3 w-px bg-slate-100 dark:bg-slate-700" />

                {/* Step 1 */}
                <div className="relative">
                  <div className="flex items-center gap-3 mb-3">
                    <ChefHat className="h-6 w-6 text-blue-500 dark:text-blue-400" />
                    <h3 className="text-sm font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest">
                      Step 1: Production
                    </h3>
                  </div>
                  <p className="text-slate-600 dark:text-slate-300 leading-relaxed text-sm md:text-base">
                    Tap <ButtonBadge>[+1]</ButtonBadge> or <ButtonBadge variant="dark">[+5]</ButtonBadge> buttons to record balls you've made.
                    Balls will appear in the tray, then flow to waiting orders.
                  </p>
                </div>

                {/* Step 2 */}
                <div className="relative">
                  <div className="flex items-center gap-3 mb-3">
                    <Package className="h-6 w-6 text-amber-500" />
                    <h3 className="text-sm font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest">
                      Step 2: Packing
                    </h3>
                  </div>
                  <p className="text-slate-600 dark:text-slate-300 leading-relaxed text-sm md:text-base">
                    When a package turns <span className="font-bold text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/30 px-1 rounded">YELLOW</span>, it's ready to pack.
                    Tap the yellow package to mark it as <span className="font-bold text-green-600 dark:text-green-400">PACKED</span> (turns green).
                  </p>
                </div>

                {/* Step 3 */}
                <div className="relative">
                  <div className="flex items-center gap-3 mb-3">
                    <CheckCircle className="h-6 w-6 text-green-500" />
                    <h3 className="text-sm font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest">
                      Step 3: Confirm
                    </h3>
                  </div>
                  <p className="text-slate-600 dark:text-slate-300 leading-relaxed text-sm md:text-base">
                    Once <span className="font-bold text-slate-800 dark:text-white">ALL</span> packages are green,
                    hold the <span className="font-medium text-slate-800 dark:text-slate-200 underline decoration-slate-300 underline-offset-2">confirm button</span> for 1 second to complete the order.
                  </p>
                </div>

              </div>
            </div>

            {/* Footer / Tips */}
            <div className="bg-amber-50/60 dark:bg-slate-800 border-t border-amber-100 dark:border-slate-700 p-4 md:px-8 md:py-5">
              <div className="flex flex-col md:flex-row gap-4 md:gap-8 items-start md:items-center text-xs md:text-sm text-slate-600 dark:text-slate-400">

                <div className="flex items-start gap-2 min-w-0">
                  <Lightbulb className="h-4 w-4 text-amber-500 shrink-0 mt-0.5" />
                  <span>Tap a <span className="font-bold text-green-600 dark:text-green-400">GREEN</span> package to unpack it (goes back to yellow)</span>
                </div>

                <div className="hidden md:block text-slate-300 dark:text-slate-600">|</div>

                <div className="flex items-start gap-2 min-w-0">
                  <span>Tap <ButtonBadge variant="slate">[+]</ButtonBadge> to reveal <ButtonBadge variant="dark">[-1]</ButtonBadge> for corrections</span>
                </div>

                <div className="hidden md:block text-slate-300 dark:text-slate-600">|</div>

                <div className="min-w-0 opacity-80">
                  Overflow balls stay in the tray for next order
                </div>

              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export default KitchenHelpPanel;
