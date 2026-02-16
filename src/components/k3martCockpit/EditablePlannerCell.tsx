/**
 * EditablePlannerCell - Single editable number cell for K3 Mart weekly planner.
 *
 * Features:
 * - Auto-save on blur via onSave callback with 300ms debounce
 * - Auto-suggest placeholder when cell is empty
 * - Status-based background colors (draft/confirmed/submitted)
 * - Past day greying (non-editable, muted appearance)
 * - Keyboard navigation between cells (arrow keys, Enter, Escape)
 * - Touch-friendly minimum width
 * - Dark mode support
 */

import React, { useState, useRef, useCallback, useEffect } from 'react';
import { cn } from '@/lib/utils';

interface EditablePlannerCellProps {
  /** Current planned quantity (0 = empty/unplanned) */
  value: number;
  /** Auto-suggested quantity based on baseline + day type */
  suggestedQty: number;
  /** Plan status for visual indicator */
  status: "draft" | "confirmed" | "submitted";
  /** Whether the cell is editable */
  isEditable: boolean;
  /** Whether this cell is for a past day (greyed out) */
  isPastDay?: boolean;
  /** Called when value changes on blur (auto-save) */
  onSave: (newValue: number) => void;
  /** Called when local edit occurs (for unsaved changes tracking) */
  onDirty: () => void;
  /** Column (day) index for keyboard navigation */
  colIndex: number;
  /** Row index for keyboard navigation */
  rowIndex: number;
}

export const EditablePlannerCell = React.memo(
  ({
    value,
    suggestedQty,
    status = "draft",
    isEditable,
    isPastDay = false,
    onSave,
    onDirty,
    colIndex,
    rowIndex,
  }: EditablePlannerCellProps) => {
    const [editValue, setEditValue] = useState<string>(value > 0 ? value.toString() : '');
    const [isFocused, setIsFocused] = useState(false);
    const [isDirty, setIsDirty] = useState(false);
    const inputRef = useRef<HTMLInputElement>(null);
    const saveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    // Sync with external value changes (e.g., after backend save confirms)
    useEffect(() => {
      if (!isFocused) {
        setEditValue(value > 0 ? value.toString() : '');
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

    const performSave = useCallback((val: string) => {
      const parsed = parseInt(val, 10);
      const newValue = !isNaN(parsed) && parsed >= 0 ? parsed : 0;

      // Only save if value actually changed
      if (newValue !== value) {
        // Debounce save by 300ms
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
    }, [value, onSave]);

    const handleBlur = useCallback(() => {
      setIsFocused(false);
      if (isDirty) {
        performSave(editValue);
      }
    }, [isDirty, editValue, performSave]);

    const handleFocus = useCallback((e: React.FocusEvent<HTMLInputElement>) => {
      setIsFocused(true);
      e.target.select();
    }, []);

    const handleChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
      const val = e.target.value;
      // Allow empty string or valid integers only
      if (val === '' || /^\d+$/.test(val)) {
        setEditValue(val);
        if (!isDirty) {
          setIsDirty(true);
          onDirty();
        }
      }
    }, [isDirty, onDirty]);

    const handleKeyDown = useCallback((e: React.KeyboardEvent<HTMLInputElement>) => {
      if (!inputRef.current) return;

      const navigateTo = (row: number, col: number) => {
        const target = document.querySelector(
          `input[data-row="${row}"][data-col="${col}"]`
        ) as HTMLInputElement;
        if (target) {
          target.focus();
          target.select();
        }
      };

      switch (e.key) {
        case 'Enter':
          e.preventDefault();
          if (isDirty) performSave(editValue);
          navigateTo(rowIndex, colIndex + 1);
          if (!document.querySelector(`input[data-row="${rowIndex}"][data-col="${colIndex + 1}"]`)) {
            inputRef.current.blur();
          }
          break;

        case 'Escape':
          e.preventDefault();
          setEditValue(value > 0 ? value.toString() : '');
          setIsDirty(false);
          inputRef.current.blur();
          break;

        case 'ArrowUp':
          e.preventDefault();
          if (isDirty) performSave(editValue);
          navigateTo(rowIndex - 1, colIndex);
          break;

        case 'ArrowDown':
          e.preventDefault();
          if (isDirty) performSave(editValue);
          navigateTo(rowIndex + 1, colIndex);
          break;

        case 'Tab':
          // Let default tab behavior work, but save first
          if (isDirty) performSave(editValue);
          break;
      }
    }, [editValue, isDirty, performSave, rowIndex, colIndex, value]);

    // Background color based on status and past day
    const bgColor = isPastDay
      ? 'bg-muted/50'
      : !isEditable
        ? 'bg-muted'
        : status === 'confirmed'
          ? 'bg-green-50 dark:bg-green-900/20'
          : status === 'submitted'
            ? 'bg-blue-50 dark:bg-blue-900/20'
            : 'bg-background';

    const textColor = isPastDay
      ? 'text-muted-foreground'
      : !isEditable
        ? 'text-muted-foreground'
        : status === 'submitted'
          ? 'text-blue-700 dark:text-blue-300'
          : status === 'confirmed'
            ? 'text-green-800 dark:text-green-300'
            : 'text-foreground';

    return (
      <input
        ref={inputRef}
        type="text"
        inputMode="numeric"
        value={editValue}
        placeholder={suggestedQty > 0 ? String(suggestedQty) : ''}
        onChange={handleChange}
        onKeyDown={handleKeyDown}
        onBlur={handleBlur}
        onFocus={handleFocus}
        disabled={!isEditable}
        data-row={rowIndex}
        data-col={colIndex}
        className={cn(
          'w-full h-9 min-w-[48px] text-sm tabular-nums text-center border border-border transition-all',
          bgColor,
          textColor,
          isEditable
            ? 'focus:ring-2 focus:ring-primary focus:outline-none focus:border-primary cursor-text'
            : 'cursor-not-allowed',
          isDirty && 'border-amber-400',
          'placeholder:text-muted-foreground/40 placeholder:italic'
        )}
        style={{
          MozAppearance: 'textfield' as any,
          WebkitAppearance: 'none' as any,
          appearance: 'none' as any,
        }}
      />
    );
  },
  (prevProps, nextProps) => {
    return (
      prevProps.value === nextProps.value &&
      prevProps.suggestedQty === nextProps.suggestedQty &&
      prevProps.status === nextProps.status &&
      prevProps.isEditable === nextProps.isEditable &&
      prevProps.isPastDay === nextProps.isPastDay &&
      prevProps.colIndex === nextProps.colIndex &&
      prevProps.rowIndex === nextProps.rowIndex
    );
  }
);

EditablePlannerCell.displayName = 'EditablePlannerCell';
