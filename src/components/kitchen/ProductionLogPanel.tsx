import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Target } from 'lucide-react';
import { BALL_CONFIG, type BallType } from '@/lib/ballTypes';
import { cn } from '@/lib/utils';
import { FlipNumber } from './FlipNumber';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';

interface ProductionCountItem {
  menuProductId: string;
  menuProductName: string;
  menuProductCode?: string;
  posSlot?: number;
  productType?: string;
  ballType?: 'big' | 'mid';
  ballCount?: number;
  boxed: number;
  stickered: number;
  packed: number;
  availableForStickering: number;
  availableForPacking: number;
}

interface ProductionLogPanelProps {
  trayInventory: {
    originalBallCount: number;
    biteSizedBallCount: number;
    totalProducedOriginal: number;
    totalProducedBiteSized: number;
  } | undefined;
  kitchenStats: {
    bigBallsNeeded: number;
    bigBallsCompleted: number;
    midBallsNeeded: number;
    midBallsCompleted: number;
    ordersPending: number;
    ordersCompletedToday: number;
  } | undefined;
  productionTargets: Array<{
    productionUnitTypeId: string;
    unitTypeName: string;
    unitTypeCode: string;
    autoTargetQuantity: number;
    manualOverride?: number;
    effectiveTarget: number;
  }> | undefined;
  productionCounts?: Array<ProductionCountItem>;
  productTargets?: Array<{
    menuProductId: string;
    source: string;
    quantity: number;
  }>;
  orderProductDemand?: Array<{
    menuProductId: string;
    quantity: number;
  }>;
  depotStockMap?: Map<string, number>; // menuProductId -> depot quantity
  k3MartStockMap?: Map<string, number>; // menuProductId -> K3 Mart outlet stock
  onAddBalls: (ballType: 'original' | 'bite_sized', count: number, event?: React.MouseEvent) => void;
  onSetProductTarget?: (menuProductId: string, source: string, quantity: number) => void;
  disabled?: boolean;
}

interface BallCounterSectionProps {
  ballType: BallType;
  count: number;
  totalProduced?: number;
  target?: number;
  onAdd: (count: number, event?: React.MouseEvent) => void;
  disabled?: boolean;
}

function BallCounterSection({
  ballType,
  count,
  totalProduced = 0,
  target,
  onAdd,
  disabled = false,
}: BallCounterSectionProps) {
  const config = BALL_CONFIG[ballType];
  const [inputValue, setInputValue] = useState('');

  const parsedVal = parseInt(inputValue, 10);
  const isNegative = !isNaN(parsedVal) && parsedVal < 0;
  const hasValidInput = inputValue && !isNaN(parsedVal) && parsedVal !== 0;
  // Disable "Remove" when tray is already 0
  const isDisabledNegative = isNegative && count === 0;

  const handleSubmit = (event?: React.MouseEvent) => {
    if (hasValidInput && !isDisabledNegative) {
      onAdd(parsedVal, event);
      setInputValue('');
    }
  };

  // Delta based on cumulative production (not tray count, which drops after boxing)
  const delta = target !== undefined && target > 0 ? totalProduced - target : null;

  return (
    <div className="bg-card rounded-xl border border-border shadow-sm p-3 space-y-2">
      {/* Counter Display */}
      <div className="text-center space-y-0.5">
        <div className="text-4xl font-bold tracking-tight text-[#1A202C] flex items-center justify-center">
          <FlipNumber value={count} size="lg" />
        </div>
        <div className="text-xs font-medium text-gray-600">
          {config.displayName} ({config.grams}g) in tray
        </div>
        {/* Delta vs target — uses cumulative production, not tray count */}
        {delta !== null && (
          <div className={cn(
            'text-[10px] font-semibold tabular-nums mt-0.5',
            delta < 0 ? 'text-amber-600' : delta === 0 ? 'text-green-600' : 'text-blue-600'
          )}>
            {delta < 0
              ? `Need ${Math.abs(delta)} more (${totalProduced}/${target} made)`
              : delta === 0
                ? `On target (${totalProduced}/${target} made)`
                : `+${delta} surplus (${totalProduced}/${target} made)`}
          </div>
        )}
      </div>

      {/* Input + Add/Remove Button */}
      <div className="flex items-center gap-2">
        <input
          type="number"
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') handleSubmit(); }}
          placeholder="Qty"
          disabled={disabled}
          className={cn(
            'w-full h-11 rounded-lg border-2 px-3 text-center text-base font-bold',
            isNegative
              ? 'border-red-300 focus:border-red-500 focus:ring-red-500'
              : 'border-gray-200 focus:border-[#5B7A5E] focus:ring-[#5B7A5E]',
            'focus:outline-none focus:ring-1',
            'disabled:opacity-50 disabled:cursor-not-allowed',
            '[appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none'
          )}
        />
        <button
          onClick={(e) => handleSubmit(e)}
          disabled={disabled || !hasValidInput || isDisabledNegative}
          className={cn(
            'h-11 px-5 rounded-lg font-bold text-base shrink-0',
            'touch-manipulation active:scale-95 transition-all duration-100',
            'disabled:opacity-50 disabled:cursor-not-allowed',
            isNegative
              ? 'bg-red-500 hover:bg-red-600 text-white'
              : 'bg-[#5B7A5E] hover:bg-[#4A6A4E] text-white',
          )}
        >
          {isNegative ? 'Remove' : 'Add'}
        </button>
      </div>
    </div>
  );
}

/**
 * Animated pipeline arrow — on hover, dots flow downward suggesting
 * material moving from one production stage to the next.
 */
function FlowArrow({ active = false }: { active?: boolean }) {
  return (
    <div className="flex justify-center py-1 relative" style={{ height: 32 }}>
      <motion.div
        className="absolute left-1/2 -translate-x-1/2 rounded-full"
        style={{ width: 2, height: 24, top: 4 }}
        animate={{ backgroundColor: active ? '#5B7A5E' : '#D1D5DB' }}
        transition={{ duration: 0.3 }}
      />
      <motion.svg
        width="12" height="8" viewBox="0 0 12 8"
        className="absolute left-1/2 -translate-x-1/2"
        style={{ bottom: 0 }}
        animate={{ fill: active ? '#5B7A5E' : '#D1D5DB' }}
        transition={{ duration: 0.3 }}
      >
        <path d="M6 8L0 0h12L6 8z" />
      </motion.svg>
      <AnimatePresence>
        {active && (
          <>
            {[0, 1, 2].map((i) => (
              <motion.div
                key={i}
                className="absolute left-1/2 -translate-x-1/2 rounded-full"
                style={{ width: 5, height: 5, backgroundColor: '#5B7A5E' }}
                initial={{ top: 0, opacity: 0, scale: 0.4 }}
                animate={{
                  top: [0, 28],
                  opacity: [0, 1, 1, 0],
                  scale: [0.4, 1, 1, 0.4],
                }}
                transition={{
                  duration: 0.9,
                  delay: i * 0.3,
                  repeat: Infinity,
                  ease: 'easeInOut',
                }}
              />
            ))}
          </>
        )}
      </AnimatePresence>
    </div>
  );
}

/**
 * Editable cell for consignment/gofood target columns.
 * Tap to open inline input, Enter/blur to save.
 */
function EditableTargetCell({
  value,
  onSave,
  disabled,
  accentColor,
}: {
  value: number;
  onSave: (qty: number) => void;
  disabled: boolean;
  accentColor: string;
}) {
  const [editing, setEditing] = useState(false);
  const [inputValue, setInputValue] = useState(String(value || ''));

  const handleSubmit = () => {
    const val = parseInt(inputValue, 10);
    if (!isNaN(val) && val >= 0) {
      onSave(val);
    }
    setEditing(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') handleSubmit();
    if (e.key === 'Escape') {
      setInputValue(String(value || ''));
      setEditing(false);
    }
  };

  if (editing) {
    return (
      <input
        type="number"
        min="0"
        value={inputValue}
        onChange={(e) => setInputValue(e.target.value)}
        onKeyDown={handleKeyDown}
        onBlur={handleSubmit}
        autoFocus
        disabled={disabled}
        className={cn(
          'w-full h-6 rounded border px-1 text-center text-[11px] font-bold tabular-nums',
          'focus:outline-none focus:ring-1',
          '[appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none'
        )}
        style={{ borderColor: accentColor, '--tw-ring-color': accentColor } as React.CSSProperties}
      />
    );
  }

  return (
    <button
      onClick={() => { setInputValue(String(value || '')); setEditing(true); }}
      disabled={disabled}
      className={cn(
        'w-full h-6 rounded text-[11px] font-bold tabular-nums text-center transition-colors',
        value > 0
          ? 'hover:opacity-80'
          : 'bg-gray-50 text-gray-400 hover:bg-gray-100',
        'disabled:opacity-50 disabled:cursor-not-allowed'
      )}
      style={value > 0 ? { backgroundColor: `${accentColor}15`, color: accentColor } : undefined}
    >
      {value || '-'}
    </button>
  );
}

export function ProductionLogPanel({
  trayInventory,
  kitchenStats,
  productionTargets,
  productionCounts,
  productTargets,
  orderProductDemand,
  depotStockMap,
  k3MartStockMap,
  onAddBalls,
  onSetProductTarget,
  disabled = false,
}: ProductionLogPanelProps) {
  // Hooks must be called before any early return (React rules)
  const [hoveredSection, setHoveredSection] = useState<number | null>(null);

  // Loading state
  if (trayInventory === undefined) {
    return (
      <div className="h-full bg-[#F8F6F3] px-3 py-4 space-y-4">
        <div className="bg-card rounded-xl border border-border p-6 text-center">
          <div className="text-gray-500">Loading production data...</div>
        </div>
      </div>
    );
  }

  // Food POS products for tables
  const foodPosProducts = productionCounts
    ?.filter((p) => p.posSlot != null)
    .sort((a, b) => (a.posSlot ?? 0) - (b.posSlot ?? 0)) ?? [];

  // Build lookup maps for the 3 sources
  const orderDemandMap = new Map(
    orderProductDemand?.map((d) => [d.menuProductId, d.quantity]) ?? []
  );
  const consignmentMap = new Map(
    productTargets
      ?.filter((t) => t.source === 'consignment')
      .map((t) => [t.menuProductId, t.quantity]) ?? []
  );
  const gofoodMap = new Map(
    productTargets
      ?.filter((t) => t.source === 'gofood')
      .map((t) => [t.menuProductId, t.quantity]) ?? []
  );

  // Compute per-product totals and ball totals from all 3 sources
  // Uses ballType/ballCount from backend (derived from BOM: menuProductComponents + componentTypes)
  let bigBallTotal = 0;
  let midBallTotal = 0;
  const productTotals = new Map<string, number>();

  for (const p of foodPosProducts) {
    const orders = orderDemandMap.get(p.menuProductId) ?? 0;
    const consignment = consignmentMap.get(p.menuProductId) ?? 0;
    const gofood = gofoodMap.get(p.menuProductId) ?? 0;
    const total = orders + consignment + gofood;
    productTotals.set(p.menuProductId, total);

    if (p.ballType && p.ballCount && total > 0) {
      if (p.ballType === 'big') bigBallTotal += total * p.ballCount;
      else midBallTotal += total * p.ballCount;
    }
  }

  // Use productionTargets as baseline — take MAX of per-product demand and unit-type targets
  const midBallFromUnitTargets = productionTargets?.find(
    t => t.unitTypeCode === 'MID_BALL'
  )?.effectiveTarget ?? 0;
  const bigBallFromUnitTargets = productionTargets?.find(
    t => t.unitTypeCode === 'BIG_BALL'
  )?.effectiveTarget ?? 0;

  const midBallTarget = Math.max(midBallTotal, midBallFromUnitTargets);
  const bigBallTarget = Math.max(bigBallTotal, bigBallFromUnitTargets);

  // Compute balls/hour production speed
  // Total balls consumed by boxing = sum of (boxed * ballCount) per product
  let totalBallsConsumed = 0;
  for (const p of foodPosProducts) {
    if (p.ballCount && p.boxed > 0) {
      totalBallsConsumed += p.boxed * p.ballCount;
    }
  }
  // Assume ~8 hour workday starting at 8am local time
  const now = new Date();
  const shiftStartHour = 8;
  const hoursElapsed = Math.max(
    (now.getHours() + now.getMinutes() / 60) - shiftStartHour,
    0.5 // minimum 30 min to avoid division issues
  );
  const ballsPerHour = totalBallsConsumed > 0
    ? Math.round(totalBallsConsumed / hoursElapsed)
    : 0;

  const sectionHoverProps = (index: number) => ({
    onMouseEnter: () => setHoveredSection(index),
    onMouseLeave: () => setHoveredSection(null),
    onTouchStart: () => setHoveredSection(index),
    onTouchEnd: () => setHoveredSection(null),
  });

  return (
    <TooltipProvider delayDuration={300}>
      <div className="h-full bg-[#F8F6F3] px-3 py-4 space-y-1.5 overflow-y-auto">
        {/* Section 1: Today's Targets — 3-source table */}
        <div className="space-y-1.5" {...sectionHoverProps(0)}>
          <h2 className="text-xs font-bold text-gray-500 uppercase tracking-wider px-0.5 flex items-center gap-1">
            <Target className="h-3 w-3" />
            Today&apos;s Targets
          </h2>
          <div className="bg-card rounded-xl border border-border shadow-sm overflow-hidden">
            {foodPosProducts.length > 0 ? (
              <table className="w-full text-[11px]">
                <thead>
                  <tr className="bg-[#F8F6F3] border-b border-border">
                    <th className="text-left px-2 py-1.5 font-semibold text-gray-600">Product</th>
                    <th className="text-center px-1 py-1.5 font-semibold text-blue-700 w-10">
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <span className="cursor-help">Ord</span>
                        </TooltipTrigger>
                        <TooltipContent side="top"><p>Orders due today/tomorrow</p></TooltipContent>
                      </Tooltip>
                    </th>
                    <th className="text-center px-1 py-1.5 font-semibold text-amber-700 w-12">
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <span className="cursor-help">K3M</span>
                        </TooltipTrigger>
                        <TooltipContent side="top"><p>K3 Mart consignment targets (editable)</p></TooltipContent>
                      </Tooltip>
                    </th>
                    <th className="text-center px-1 py-1.5 font-semibold text-green-700 w-12">
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <span className="cursor-help">GoF</span>
                        </TooltipTrigger>
                        <TooltipContent side="top"><p>GoFood targets (editable)</p></TooltipContent>
                      </Tooltip>
                    </th>
                    {k3MartStockMap && k3MartStockMap.size > 0 && (
                      <th className="text-center px-1 py-1.5 font-semibold text-gray-500 w-10">
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <span className="cursor-help">Stk</span>
                          </TooltipTrigger>
                          <TooltipContent side="top"><p>K3 Mart outlet stock (read-only)</p></TooltipContent>
                        </Tooltip>
                      </th>
                    )}
                    <th className="text-center px-1 py-1.5 font-bold text-gray-900 w-10">Tot</th>
                  </tr>
                </thead>
                <tbody>
                  {foodPosProducts.map((p) => {
                    const orders = orderDemandMap.get(p.menuProductId) ?? 0;
                    const consignment = consignmentMap.get(p.menuProductId) ?? 0;
                    const gofood = gofoodMap.get(p.menuProductId) ?? 0;
                    const total = productTotals.get(p.menuProductId) ?? 0;

                    return (
                      <tr key={p.menuProductId} className="border-b border-gray-100 last:border-b-0">
                        <td className="px-2 py-1 font-medium text-gray-900 truncate max-w-[80px]">
                          {p.menuProductName}
                        </td>
                        {/* Orders: read-only */}
                        <td className="text-center px-1 py-1 tabular-nums text-blue-700">
                          {orders || <span className="text-gray-300">-</span>}
                        </td>
                        {/* Consignment: editable */}
                        <td className="px-0.5 py-0.5">
                          {onSetProductTarget ? (
                            <EditableTargetCell
                              value={consignment}
                              onSave={(qty) => onSetProductTarget(p.menuProductId, 'consignment', qty)}
                              disabled={disabled}
                              accentColor="#B45309"
                            />
                          ) : (
                            <div className="text-center tabular-nums text-amber-700">
                              {consignment || <span className="text-gray-300">-</span>}
                            </div>
                          )}
                        </td>
                        {/* GoFood: editable */}
                        <td className="px-0.5 py-0.5">
                          {onSetProductTarget ? (
                            <EditableTargetCell
                              value={gofood}
                              onSave={(qty) => onSetProductTarget(p.menuProductId, 'gofood', qty)}
                              disabled={disabled}
                              accentColor="#15803D"
                            />
                          ) : (
                            <div className="text-center tabular-nums text-green-700">
                              {gofood || <span className="text-gray-300">-</span>}
                            </div>
                          )}
                        </td>
                        {/* K3 Mart outlet stock (read-only) */}
                        {k3MartStockMap && k3MartStockMap.size > 0 && (
                          <td className="text-center px-1 py-1 tabular-nums text-gray-400 text-[10px]">
                            {k3MartStockMap.get(p.menuProductId) ?? <span className="text-gray-300">-</span>}
                          </td>
                        )}
                        {/* Total */}
                        <td className="text-center px-1 py-1 font-bold tabular-nums text-gray-900">
                          {total || <span className="text-gray-300">0</span>}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            ) : (
              <div className="p-3 text-xs text-gray-500 text-center">No products configured</div>
            )}

            {/* Ball totals computed from all 3 sources */}
            <div className="border-t border-border px-3 py-2">
              <div className="grid grid-cols-2 gap-3">
                <div className="text-center">
                  <div className="text-xl font-bold text-[#1A202C] flex items-center justify-center">
                    <FlipNumber value={midBallTarget} size="md" />
                  </div>
                  <div className="text-[10px] text-gray-600">Original (45g)</div>
                </div>
                <div className="text-center">
                  <div className="text-xl font-bold text-[#1A202C] flex items-center justify-center">
                    <FlipNumber value={bigBallTarget} size="md" />
                  </div>
                  <div className="text-[10px] text-gray-600">Jumbo (80g)</div>
                </div>
              </div>
            </div>
          </div>
        </div>

        <FlowArrow active={hoveredSection === 0} />

        {/* Section 2: Produced Goods (Ball Tray) */}
        <div className="space-y-1.5" {...sectionHoverProps(1)}>
          <div className="flex items-center justify-between px-0.5">
            <h2 className="text-xs font-bold text-gray-500 uppercase tracking-wider">Produced Goods (Ball Tray)</h2>
            {ballsPerHour > 0 && (
              <span className="text-[10px] font-bold tabular-nums text-[#5B7A5E] bg-[#5B7A5E]/10 px-1.5 py-0.5 rounded-full">
                {ballsPerHour} balls/hr
              </span>
            )}
          </div>

          <BallCounterSection
            ballType="original"
            count={trayInventory.originalBallCount}
            totalProduced={trayInventory.totalProducedOriginal ?? 0}
            target={midBallTarget}
            onAdd={(count, event) => onAddBalls('original', count, event)}
            disabled={disabled}
          />

          <BallCounterSection
            ballType="bite_sized"
            count={trayInventory.biteSizedBallCount}
            totalProduced={trayInventory.totalProducedBiteSized ?? 0}
            target={bigBallTarget}
            onAdd={(count, event) => onAddBalls('bite_sized', count, event)}
            disabled={disabled}
          />
        </div>

        <FlowArrow active={hoveredSection === 1} />

        {/* Section 3: Finished Products */}
        <div className="space-y-1.5" {...sectionHoverProps(2)}>
          <h2 className="text-xs font-bold text-gray-500 uppercase tracking-wider px-0.5">Finished Products</h2>
          <div className="bg-card rounded-xl border border-border shadow-sm overflow-hidden">
            {foodPosProducts.length > 0 ? (
              <table className="w-full text-xs">
                <thead>
                  <tr className="bg-[#F8F6F3] border-b border-border">
                    <th className="text-left px-2.5 py-1.5 font-semibold text-gray-700">Name</th>
                    <th className="text-center px-1.5 py-1.5 font-semibold text-gray-700">Box</th>
                    <th className="text-center px-1.5 py-1.5 font-semibold text-gray-700">Stk</th>
                    <th className="text-center px-1.5 py-1.5 font-semibold text-gray-700">Pak</th>
                  </tr>
                </thead>
                <tbody>
                  {foodPosProducts.map((p) => {
                    const depotQty = depotStockMap?.get(p.menuProductId);
                    return (
                      <tr key={p.menuProductId} className="border-b border-border last:border-b-0">
                        <td className="px-2.5 py-1.5">
                          <div className="font-medium text-gray-900">{p.menuProductName}</div>
                          {depotQty != null && depotQty > 0 && (
                            <div className="text-[9px] font-semibold mt-0.5" style={{ color: 'var(--color-gofood)' }}>
                              GF depot: {depotQty}
                            </div>
                          )}
                        </td>
                        <td className="text-center px-1.5 py-1.5 tabular-nums">{p.boxed}</td>
                        <td className="text-center px-1.5 py-1.5 tabular-nums">{p.stickered}</td>
                        <td className="text-center px-1.5 py-1.5 tabular-nums">{p.packed}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            ) : (
              <div className="p-3 text-xs text-gray-500 text-center">No products yet</div>
            )}
          </div>
        </div>

        <FlowArrow active={hoveredSection === 2} />

        {/* Section 4: Order Summary */}
        <div className="space-y-1.5" {...sectionHoverProps(3)}>
          <h2 className="text-xs font-bold text-gray-500 uppercase tracking-wider px-0.5">Order Summary</h2>
          <div className="grid grid-cols-2 gap-2">
            <div className="bg-card rounded-xl border border-border shadow-sm p-3 text-center space-y-0.5">
              <div className="text-2xl font-bold text-[#1A202C] flex items-center justify-center">
                <FlipNumber value={kitchenStats?.ordersPending ?? 0} size="md" />
              </div>
              <div className="text-[10px] text-gray-600 font-medium">Orders Pending</div>
            </div>

            <div className="bg-card rounded-xl border border-border shadow-sm p-3 text-center space-y-0.5">
              <div className="text-2xl font-bold text-[#3D7A4A] flex items-center justify-center">
                <FlipNumber value={kitchenStats?.ordersCompletedToday ?? 0} size="md" />
              </div>
              <div className="text-[10px] text-gray-600 font-medium">Completed Today</div>
            </div>
          </div>
        </div>
      </div>
    </TooltipProvider>
  );
}
