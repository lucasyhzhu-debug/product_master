import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Plus, Minus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

// Ball colors from design spec
const BALL_COLORS = {
  fill: '#93C572',      // Pistachio green
  stroke: '#7B3F00',    // Chocolate brown
} as const;

type BallType = 'original' | 'bite_sized';

interface BallCompletionButtonsProps {
  onComplete: (ballType: BallType, count: number) => void;
  onUndo?: (ballType: BallType) => void;
  trayInventory?: {
    originalBallCount: number;
    biteSizedBallCount: number;
  };
  disabled?: boolean;
  /** When set, renders only buttons for this ball type */
  filterBallType?: BallType;
}

interface BallZoneProps {
  ballType: BallType;
  onAdd: (count: number) => void;
  onUndo?: () => void;
  trayCount: number;
  disabled?: boolean;
  hideLabel?: boolean;
}

// Ball icon SVG
function BallIcon({ size = 20, type }: { size?: number; type: BallType }) {
  const displaySize = type === 'original' ? size : size * 0.7;
  return (
    <svg
      width={displaySize}
      height={displaySize * 0.94}
      viewBox={`0 0 ${displaySize} ${displaySize * 0.94}`}
      className="shrink-0"
    >
      <ellipse
        cx={displaySize / 2}
        cy={(displaySize * 0.94) / 2}
        rx={displaySize / 2 - 1.5}
        ry={(displaySize * 0.94) / 2 - 1.5}
        fill={BALL_COLORS.fill}
        stroke={BALL_COLORS.stroke}
        strokeWidth={2}
      />
      <ellipse
        cx={displaySize * 0.35}
        cy={displaySize * 0.3}
        rx={displaySize * 0.12}
        ry={displaySize * 0.08}
        fill="rgba(255,255,255,0.35)"
      />
    </svg>
  );
}

function BallZone({ ballType, onAdd, onUndo, trayCount, disabled, hideLabel }: BallZoneProps) {
  const [showUndo, setShowUndo] = useState(false);

  const label = ballType === 'original' ? 'Original' : 'Bite-sized';
  const canUndo = trayCount > 0 && onUndo;

  return (
    <div className="space-y-2">
      {/* Label - hidden when used in filtered single-zone mode */}
      {!hideLabel && (
        <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
          <BallIcon type={ballType} size={16} />
          <span>{label}</span>
        </div>
      )}

      {/* Buttons row - touch-friendly sizing */}
      <div className="flex items-center gap-1.5 sm:gap-2">
        {/* +1 Button */}
        <Button
          variant="outline"
          size="lg"
          className={cn(
            'flex-1 h-12 sm:h-14 text-base sm:text-lg font-bold transition-all active:scale-95',
            'bg-[#93C572]/10 border-[#93C572] hover:bg-[#93C572]/20 hover:border-[#93C572]'
          )}
          onClick={() => onAdd(1)}
          disabled={disabled}
        >
          <BallIcon type={ballType} size={18} />
          <span className="ml-1.5 sm:ml-2">+1</span>
        </Button>

        {/* +5 Button */}
        <Button
          variant="outline"
          size="lg"
          className={cn(
            'flex-1 h-12 sm:h-14 text-base sm:text-lg font-bold transition-all active:scale-95',
            'bg-[#93C572]/10 border-[#93C572] hover:bg-[#93C572]/20 hover:border-[#93C572]'
          )}
          onClick={() => onAdd(5)}
          disabled={disabled}
        >
          <BallIcon type={ballType} size={18} />
          <span className="ml-1.5 sm:ml-2">+5</span>
        </Button>

        {/* Toggle/Undo Section */}
        <AnimatePresence mode="wait">
          {showUndo ? (
            <motion.div
              key="undo"
              initial={{ width: 0, opacity: 0 }}
              animate={{ width: 'auto', opacity: 1 }}
              exit={{ width: 0, opacity: 0 }}
              transition={{ duration: 0.15 }}
              className="flex items-center gap-0.5 sm:gap-1 overflow-hidden"
            >
              {/* -1 Button */}
              <Button
                variant="ghost"
                size="lg"
                className={cn(
                  'h-12 sm:h-14 px-2 sm:px-4 text-base sm:text-lg font-bold',
                  !canUndo && 'opacity-40'
                )}
                onClick={() => onUndo?.()}
                disabled={disabled || !canUndo}
              >
                <Minus className="h-3.5 w-3.5 sm:h-4 sm:w-4 mr-0.5 sm:mr-1" />
                1
              </Button>

              {/* Hide button */}
              <Button
                variant="ghost"
                size="icon"
                className="h-12 sm:h-14 w-8 sm:w-10 text-muted-foreground"
                onClick={() => setShowUndo(false)}
              >
                <Minus className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
              </Button>
            </motion.div>
          ) : (
            <motion.div
              key="toggle"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.15 }}
            >
              {/* Show undo button */}
              <Button
                variant="ghost"
                size="icon"
                className="h-12 sm:h-14 w-8 sm:w-10 text-muted-foreground hover:text-foreground"
                onClick={() => setShowUndo(true)}
                disabled={disabled}
              >
                <Plus className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
              </Button>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}

export default function BallCompletionButtons({
  onComplete,
  onUndo,
  trayInventory,
  disabled = false,
  filterBallType,
}: BallCompletionButtonsProps) {
  // When filterBallType is set, only render that zone
  const showOriginal = !filterBallType || filterBallType === 'original';
  const showBiteSized = !filterBallType || filterBallType === 'bite_sized';

  // Single zone mode: no grid layout, hide label (parent already shows it)
  if (filterBallType) {
    return filterBallType === 'original' ? (
      <BallZone
        ballType="original"
        onAdd={(count) => onComplete('original', count)}
        onUndo={onUndo ? () => onUndo('original') : undefined}
        trayCount={trayInventory?.originalBallCount ?? 0}
        disabled={disabled}
        hideLabel
      />
    ) : (
      <BallZone
        ballType="bite_sized"
        onAdd={(count) => onComplete('bite_sized', count)}
        onUndo={onUndo ? () => onUndo('bite_sized') : undefined}
        trayCount={trayInventory?.biteSizedBallCount ?? 0}
        disabled={disabled}
        hideLabel
      />
    );
  }

  // Default: show both zones in grid
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
      {showOriginal && (
        <BallZone
          ballType="original"
          onAdd={(count) => onComplete('original', count)}
          onUndo={onUndo ? () => onUndo('original') : undefined}
          trayCount={trayInventory?.originalBallCount ?? 0}
          disabled={disabled}
        />
      )}
      {showBiteSized && (
        <BallZone
          ballType="bite_sized"
          onAdd={(count) => onComplete('bite_sized', count)}
          onUndo={onUndo ? () => onUndo('bite_sized') : undefined}
          trayCount={trayInventory?.biteSizedBallCount ?? 0}
          disabled={disabled}
        />
      )}
    </div>
  );
}
