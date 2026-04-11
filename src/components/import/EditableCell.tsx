/**
 * EditableCell - Click-to-edit table cell wrapper.
 *
 * Renders display value when idle, appropriate input when active.
 * Manages focus, blur save, Enter/Escape keyboard handling.
 *
 * Pattern: Same as editingCogsId in MenuProductsManager, generalized.
 */

import { useState, useRef, useEffect } from "react";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/components/ui/select";
import {
  Tooltip,
  TooltipTrigger,
  TooltipContent,
} from "@/components/ui/tooltip";
import { SearchableSelect } from "@/components/shared/SearchableSelect";
import type { SearchableSelectItem } from "@/components/shared/SearchableSelect";
import { cn } from "@/lib/utils";

export type CellType = "text" | "number" | "date" | "select" | "searchable";

interface EditableCellProps {
  value: string;
  displayValue?: string;
  type: CellType;
  isEditing: boolean;
  onStartEdit: () => void;
  onSave: (newValue: string) => void;
  onCancel: () => void;
  hasError?: boolean;
  errorMessage?: string;
  hasWarning?: boolean;
  warningMessage?: string;
  /** For select type */
  selectOptions?: Array<{ value: string; label: string }>;
  /** For searchable type */
  searchItems?: SearchableSelectItem[];
  searchPlaceholder?: string;
  className?: string;
}

export function EditableCell({
  value,
  displayValue,
  type,
  isEditing,
  onStartEdit,
  onSave,
  onCancel,
  hasError = false,
  errorMessage,
  hasWarning = false,
  warningMessage,
  selectOptions,
  searchItems,
  searchPlaceholder,
  className,
}: EditableCellProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [localValue, setLocalValue] = useState(value);

  // Sync local value when external value changes
  useEffect(() => {
    setLocalValue(value);
  }, [value]);

  // Auto-focus input when editing starts
  useEffect(() => {
    if (isEditing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [isEditing]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      e.preventDefault();
      onSave(localValue);
    } else if (e.key === "Escape") {
      e.preventDefault();
      onCancel();
    } else if (e.key === "Tab") {
      // Let Tab propagate naturally but save
      onSave(localValue);
    }
  };

  const handleBlur = () => {
    onSave(localValue);
  };

  // --- Editing mode ---
  if (isEditing) {
    if (type === "searchable" && searchItems) {
      return (
        <div className={cn("px-3 py-1.5", className)}>
          <SearchableSelect
            items={searchItems}
            value={value}
            onSelect={(selectedValue) => onSave(selectedValue)}
            searchPlaceholder={searchPlaceholder}
          />
        </div>
      );
    }

    if (type === "select" && selectOptions) {
      return (
        <div className={cn("px-3 py-1.5", className)}>
          <Select
            value={value}
            onValueChange={(newVal) => onSave(newVal)}
          >
            <SelectTrigger className="h-8 text-sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {selectOptions.map((opt) => (
                <SelectItem key={opt.value} value={opt.value}>
                  {opt.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      );
    }

    // text, number, date
    return (
      <div className={cn("px-3 py-1.5", className)}>
        <Input
          ref={inputRef}
          type={type === "number" ? "number" : type === "date" ? "date" : "text"}
          value={localValue}
          onChange={(e) => setLocalValue(e.target.value)}
          onKeyDown={handleKeyDown}
          onBlur={handleBlur}
          className="h-8 text-sm"
          aria-invalid={hasError}
        />
      </div>
    );
  }

  // --- Idle mode ---
  const display = displayValue || value || "\u00A0"; // non-breaking space for empty cells

  const idleCell = (
    <div
      tabIndex={0}
      role="button"
      onClick={onStartEdit}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onStartEdit();
        }
      }}
      className={cn(
        "cursor-pointer px-3 py-1.5 text-sm min-h-[32px] flex items-center",
        hasError && "bg-red-50 dark:bg-red-950/30 ring-1 ring-red-500 rounded-sm",
        hasWarning && !hasError && "bg-amber-50 dark:bg-amber-950/30 ring-1 ring-amber-500 rounded-sm",
        className
      )}
      aria-invalid={hasError || undefined}
    >
      <span className="truncate">{display}</span>
    </div>
  );

  // Wrap with tooltip if there's an error or warning
  if (hasError && errorMessage) {
    return (
      <Tooltip>
        <TooltipTrigger asChild>{idleCell}</TooltipTrigger>
        <TooltipContent className="max-w-xs">
          <p className="text-xs">{errorMessage}</p>
        </TooltipContent>
      </Tooltip>
    );
  }

  if (hasWarning && warningMessage) {
    return (
      <Tooltip>
        <TooltipTrigger asChild>{idleCell}</TooltipTrigger>
        <TooltipContent className="max-w-xs">
          <p className="text-xs">{warningMessage}</p>
        </TooltipContent>
      </Tooltip>
    );
  }

  return idleCell;
}
