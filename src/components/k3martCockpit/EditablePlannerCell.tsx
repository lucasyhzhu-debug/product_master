import React, { useState, useRef, useCallback, useEffect } from 'react';
import { cn } from '@/lib/utils';

interface EditablePlannerCellProps {
  /** Current planned quantity */
  value: number;
  /** Auto-suggested quantity based on target/stock calculation */
  suggestedQty: number;
  /** Whether this cell's plan is a stock-out (vs stock-in) */
  isStockOut: boolean;
  /** Plan status for visual indicator */
  status?: "draft" | "confirmed" | "submitted" | "approved" | "rejected" | "canceled";
  /** Whether this day is weekend */
  isWeekend: boolean;
  /** Whether this day is a holiday */
  isHoliday: boolean;
  /** Whether the cell is editable (not submitted/approved) */
  isEditable: boolean;
  /** Called when value changes */
  onChange: (newValue: number) => void;
  /** Column (day) index for keyboard navigation */
  colIndex: number;
  /** Row (outlet) index for keyboard navigation */
  rowIndex: number;
}

export const EditablePlannerCell = React.memo(
  ({
    value,
    suggestedQty,
    isStockOut,
    status = "draft",
    isWeekend,
    isHoliday,
    isEditable,
    onChange,
    colIndex,
    rowIndex,
  }: EditablePlannerCellProps) => {
    const [editValue, setEditValue] = useState<string>(value.toString());
    const [isFocused, setIsFocused] = useState(false);
    const inputRef = useRef<HTMLInputElement>(null);

    // Sync with external value changes
    useEffect(() => {
      if (!isFocused) {
        setEditValue(value.toString());
      }
    }, [value, isFocused]);

    const handleCommit = useCallback(() => {
      const parsed = parseInt(editValue, 10);
      if (!isNaN(parsed) && parsed >= 0) {
        onChange(parsed);
      } else {
        // Revert to original value if invalid
        setEditValue(value.toString());
      }
    }, [editValue, onChange, value]);

    const handleKeyDown = useCallback((e: React.KeyboardEvent<HTMLInputElement>) => {
      if (!inputRef.current) return;

      switch (e.key) {
        case 'Enter':
          e.preventDefault();
          handleCommit();
          // Move to next cell (right)
          const nextCell = document.querySelector(
            `input[data-row="${rowIndex}"][data-col="${colIndex + 1}"]`
          ) as HTMLInputElement;
          if (nextCell) {
            nextCell.focus();
            nextCell.select();
          } else {
            inputRef.current.blur();
          }
          break;

        case 'Escape':
          e.preventDefault();
          setEditValue(value.toString());
          inputRef.current.blur();
          break;

        case 'ArrowUp':
          e.preventDefault();
          handleCommit();
          const upCell = document.querySelector(
            `input[data-row="${rowIndex - 1}"][data-col="${colIndex}"]`
          ) as HTMLInputElement;
          if (upCell) {
            upCell.focus();
            upCell.select();
          }
          break;

        case 'ArrowDown':
          e.preventDefault();
          handleCommit();
          const downCell = document.querySelector(
            `input[data-row="${rowIndex + 1}"][data-col="${colIndex}"]`
          ) as HTMLInputElement;
          if (downCell) {
            downCell.focus();
            downCell.select();
          }
          break;

        case 'ArrowLeft':
          // Only navigate if cursor is at start
          if (inputRef.current.selectionStart === 0 && inputRef.current.selectionEnd === 0) {
            e.preventDefault();
            handleCommit();
            const leftCell = document.querySelector(
              `input[data-row="${rowIndex}"][data-col="${colIndex - 1}"]`
            ) as HTMLInputElement;
            if (leftCell) {
              leftCell.focus();
              leftCell.select();
            }
          }
          break;

        case 'ArrowRight':
          // Only navigate if cursor is at end
          if (
            inputRef.current.selectionStart === editValue.length &&
            inputRef.current.selectionEnd === editValue.length
          ) {
            e.preventDefault();
            handleCommit();
            const rightCell = document.querySelector(
              `input[data-row="${rowIndex}"][data-col="${colIndex + 1}"]`
            ) as HTMLInputElement;
            if (rightCell) {
              rightCell.focus();
              rightCell.select();
            }
          }
          break;
      }
    }, [editValue, handleCommit, rowIndex, colIndex, value]);

    const handleChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
      const val = e.target.value;
      // Allow empty string or valid integers only
      if (val === '' || /^\d+$/.test(val)) {
        setEditValue(val);
      }
    }, []);

    const handleBlur = useCallback(() => {
      setIsFocused(false);
      handleCommit();
    }, [handleCommit]);

    const handleFocus = useCallback((e: React.FocusEvent<HTMLInputElement>) => {
      setIsFocused(true);
      e.target.select();
    }, []);

    // Determine background color
    const getBgColor = () => {
      if (!isEditable) return 'bg-gray-100';
      if (isHoliday) return 'bg-orange-50';
      if (isWeekend) return 'bg-amber-50';
      return 'bg-white';
    };

    // Determine border style
    const getBorderStyle = () => {
      if (isStockOut) return 'border-dashed border-red-300';
      return 'border-gray-200';
    };

    // Status indicator dot color
    const getStatusDotColor = () => {
      switch (status) {
        case 'confirmed':
          return 'bg-blue-500';
        case 'submitted':
          return 'bg-amber-500';
        case 'approved':
          return 'bg-green-500';
        case 'rejected':
          return 'bg-red-500';
        case 'canceled':
          return 'bg-gray-400';
        default:
          return null;
      }
    };

    const showSuggestion = suggestedQty > 0 && value !== suggestedQty;
    const statusDotColor = getStatusDotColor();

    return (
      <div className="relative group">
        <input
          ref={inputRef}
          type="text"
          inputMode="numeric"
          value={editValue}
          onChange={handleChange}
          onKeyDown={handleKeyDown}
          onBlur={handleBlur}
          onFocus={handleFocus}
          disabled={!isEditable}
          data-row={rowIndex}
          data-col={colIndex}
          className={cn(
            'w-12 h-9 text-sm tabular-nums text-center border transition-all',
            getBgColor(),
            getBorderStyle(),
            isEditable
              ? 'focus:ring-2 focus:ring-blue-400 focus:outline-none cursor-text'
              : 'text-gray-500 cursor-not-allowed',
            isStockOut && isEditable && 'bg-red-50/30'
          )}
          style={{
            // Remove spinner arrows
            MozAppearance: 'textfield',
            WebkitAppearance: 'none',
            appearance: 'none',
          }}
        />

        {/* Status indicator dot */}
        {statusDotColor && (
          <div
            className={cn(
              'absolute bottom-0.5 right-0.5 w-1 h-1 rounded-full',
              statusDotColor
            )}
          />
        )}

        {/* Suggestion tooltip */}
        {showSuggestion && (
          <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1 px-2 py-1 bg-gray-900 text-white text-xs rounded whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-10">
            Suggest: {suggestedQty}
            <div className="absolute top-full left-1/2 -translate-x-1/2 border-4 border-transparent border-t-gray-900" />
          </div>
        )}

        <style>{`
          input[type="number"]::-webkit-inner-spin-button,
          input[type="number"]::-webkit-outer-spin-button {
            -webkit-appearance: none;
            margin: 0;
          }
        `}</style>
      </div>
    );
  },
  (prevProps, nextProps) => {
    // Custom comparator: re-render only if these props change
    // Skip onChange comparison (stable callback via useCallback in parent)
    return (
      prevProps.value === nextProps.value &&
      prevProps.suggestedQty === nextProps.suggestedQty &&
      prevProps.isStockOut === nextProps.isStockOut &&
      prevProps.status === nextProps.status &&
      prevProps.isWeekend === nextProps.isWeekend &&
      prevProps.isHoliday === nextProps.isHoliday &&
      prevProps.isEditable === nextProps.isEditable &&
      prevProps.colIndex === nextProps.colIndex &&
      prevProps.rowIndex === nextProps.rowIndex
    );
  }
);

EditablePlannerCell.displayName = 'EditablePlannerCell';
