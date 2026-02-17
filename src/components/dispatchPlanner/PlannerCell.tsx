/**
 * PlannerCell - Single editable number cell for the Dispatch Planner grid.
 *
 * Features:
 * - Auto-save on blur with 300ms debounce
 * - Read-only mode for past days and K3Mart channel
 * - Faded styling for direct order production-start day cells
 * - Keyboard: Enter confirms, Escape reverts, Tab moves to next cell
 * - Compact cell with centered text
 *
 * Follows the K3Mart EditablePlannerCell pattern.
 */

import React, { useState, useRef, useCallback, useEffect } from "react";
import { cn } from "@/lib/utils";

interface PlannerCellProps {
  /** Current quantity value */
  value: number;
  /** Suggested/pre-fill value (shown as placeholder) */
  suggestedValue?: number;
  /** Whether cell is read-only (past days, K3Mart channel, direct orders) */
  isReadOnly: boolean;
  /** Whether cell is faded (direct order production-start day) */
  isFaded?: boolean;
  /** Whether this cell is for a past day */
  isPast: boolean;
  /** Called when user finishes editing (blur/enter) */
  onSave: (qty: number) => void;
}

export const PlannerCell = React.memo(
  function PlannerCell({
    value,
    suggestedValue,
    isReadOnly,
    isFaded = false,
    isPast,
    onSave,
  }: PlannerCellProps) {
    const [editValue, setEditValue] = useState<string>(
      value > 0 ? value.toString() : ""
    );
    const [isFocused, setIsFocused] = useState(false);
    const [isDirty, setIsDirty] = useState(false);
    const inputRef = useRef<HTMLInputElement>(null);
    const saveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    // Sync with external value changes
    useEffect(() => {
      if (!isFocused) {
        setEditValue(value > 0 ? value.toString() : "");
        setIsDirty(false);
      }
    }, [value, isFocused]);

    // Cleanup debounce timer
    useEffect(() => {
      return () => {
        if (saveTimeoutRef.current) {
          clearTimeout(saveTimeoutRef.current);
        }
      };
    }, []);

    const performSave = useCallback(
      (val: string) => {
        const parsed = parseInt(val, 10);
        const newValue = !isNaN(parsed) && parsed >= 0 ? parsed : 0;

        if (newValue !== value) {
          if (saveTimeoutRef.current) {
            clearTimeout(saveTimeoutRef.current);
          }
          saveTimeoutRef.current = setTimeout(() => {
            onSave(newValue);
            setIsDirty(false);
          }, 300);
        } else {
          setIsDirty(false);
        }
      },
      [value, onSave]
    );

    const handleBlur = useCallback(() => {
      setIsFocused(false);
      if (isDirty) {
        performSave(editValue);
      }
    }, [isDirty, editValue, performSave]);

    const handleFocus = useCallback(
      (e: React.FocusEvent<HTMLInputElement>) => {
        setIsFocused(true);
        e.target.select();
      },
      []
    );

    const handleChange = useCallback(
      (e: React.ChangeEvent<HTMLInputElement>) => {
        const val = e.target.value;
        if (val === "" || /^\d+$/.test(val)) {
          setEditValue(val);
          if (!isDirty) {
            setIsDirty(true);
          }
        }
      },
      [isDirty]
    );

    const handleKeyDown = useCallback(
      (e: React.KeyboardEvent<HTMLInputElement>) => {
        switch (e.key) {
          case "Enter":
            e.preventDefault();
            if (isDirty) performSave(editValue);
            inputRef.current?.blur();
            break;
          case "Escape":
            e.preventDefault();
            setEditValue(value > 0 ? value.toString() : "");
            setIsDirty(false);
            inputRef.current?.blur();
            break;
          case "Tab":
            if (isDirty) performSave(editValue);
            break;
        }
      },
      [editValue, isDirty, performSave, value]
    );

    // Display-only mode for read-only cells
    const disabled = isReadOnly || isPast;

    if (disabled) {
      return (
        <div
          className={cn(
            "h-9 min-w-[48px] flex items-center justify-center text-sm tabular-nums border border-border",
            isPast && "bg-muted/50 text-muted-foreground",
            !isPast && isReadOnly && "bg-muted text-muted-foreground",
            isFaded && "opacity-40 italic"
          )}
        >
          {value > 0 ? value : "--"}
        </div>
      );
    }

    return (
      <input
        ref={inputRef}
        type="text"
        inputMode="numeric"
        value={editValue}
        placeholder={
          suggestedValue && suggestedValue > 0
            ? String(suggestedValue)
            : ""
        }
        onChange={handleChange}
        onKeyDown={handleKeyDown}
        onBlur={handleBlur}
        onFocus={handleFocus}
        className={cn(
          "w-full h-9 min-w-[48px] text-sm tabular-nums text-center border border-border transition-all bg-background text-foreground",
          "focus:ring-2 focus:ring-primary focus:outline-none focus:border-primary cursor-text",
          isDirty && "border-amber-400",
          "placeholder:text-muted-foreground/40 placeholder:italic"
        )}
        style={{
          MozAppearance: "textfield" as any,
          WebkitAppearance: "none" as any,
          appearance: "none" as any,
        }}
      />
    );
  },
  (prevProps, nextProps) => {
    return (
      prevProps.value === nextProps.value &&
      prevProps.suggestedValue === nextProps.suggestedValue &&
      prevProps.isReadOnly === nextProps.isReadOnly &&
      prevProps.isFaded === nextProps.isFaded &&
      prevProps.isPast === nextProps.isPast
    );
  }
);

PlannerCell.displayName = "PlannerCell";
