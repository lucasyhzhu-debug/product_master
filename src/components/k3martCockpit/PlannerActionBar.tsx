/**
 * PlannerActionBar - Action buttons for the weekly dispatch planner.
 *
 * Provides Save/Confirm/Submit buttons with state indicators for the K3 Mart
 * weekly planner interface.
 */

import React from 'react';
import { Save, CheckCircle, Send, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

interface PlannerActionBarProps {
  /** Has the plan been modified since last save? */
  hasUnsavedChanges: boolean;
  /** Today's date string for display */
  todayLabel: string;
  /** Tomorrow's date string for display */
  tomorrowLabel: string;
  /** Whether confirm tomorrow is possible (has draft plans for tomorrow) */
  canConfirmTomorrow: boolean;
  /** Whether submit today is possible (has confirmed plans for today) */
  canSubmitToday: boolean;
  /** Number of outlets with confirmed plans for today */
  confirmedOutletCount: number;
  /** Total outlets */
  totalOutletCount: number;
  onSavePlan: () => void;
  onConfirmTomorrow: () => void;
  onSubmitToday: () => void;
  isSaving?: boolean;
  isConfirming?: boolean;
  isSubmitting?: boolean;
}

export const PlannerActionBar = React.memo(function PlannerActionBar({
  hasUnsavedChanges,
  todayLabel,
  tomorrowLabel,
  canConfirmTomorrow,
  canSubmitToday,
  confirmedOutletCount,
  totalOutletCount,
  onSavePlan,
  onConfirmTomorrow,
  onSubmitToday,
  isSaving = false,
  isConfirming = false,
  isSubmitting = false,
}: PlannerActionBarProps) {
  return (
    <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 p-4 border-t bg-muted/30">
      {/* Left: Unsaved changes indicator */}
      <div className="flex items-center gap-2 min-h-[36px]">
        {hasUnsavedChanges && (
          <>
            <div className="h-2 w-2 rounded-full bg-amber-500 animate-pulse" />
            <span className="text-sm text-muted-foreground">Unsaved changes</span>
          </>
        )}
      </div>

      {/* Right: Action buttons */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 w-full sm:w-auto">
        {/* Save Plan */}
        <Button
          onClick={onSavePlan}
          disabled={!hasUnsavedChanges || isSaving}
          variant="outline"
          className="w-full sm:w-auto"
        >
          {isSaving ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Save className="h-4 w-4" />
          )}
          Save Plan
        </Button>

        {/* Confirm Tomorrow */}
        <Button
          onClick={onConfirmTomorrow}
          disabled={!canConfirmTomorrow || isConfirming}
          className="w-full sm:w-auto bg-blue-600 hover:bg-blue-700 text-white"
        >
          {isConfirming ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <CheckCircle className="h-4 w-4" />
          )}
          Confirm {tomorrowLabel}
        </Button>

        {/* Submit Today */}
        <Button
          onClick={onSubmitToday}
          disabled={!canSubmitToday || isSubmitting}
          className={cn(
            'w-full sm:w-auto bg-amber-600 hover:bg-amber-700 text-white',
            'disabled:opacity-50'
          )}
        >
          {isSubmitting ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Send className="h-4 w-4" />
          )}
          Submit {todayLabel} ({confirmedOutletCount}/{totalOutletCount})
        </Button>
      </div>
    </div>
  );
});
