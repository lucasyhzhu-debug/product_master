/**
 * SearchableSelect - Popover-based filterable dropdown.
 *
 * Used for category (account names) and owner (user names) column editing
 * in the bulk import editable preview table. Also reusable elsewhere.
 *
 * Pattern: Popover + Input for search + scrollable filtered list.
 * No virtualization needed -- max ~54 accounts or ~10 users.
 */

import { useState, useRef, useEffect } from "react";
import { Popover, PopoverTrigger, PopoverContent } from "@/components/ui/popover";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { ChevronsUpDown } from "lucide-react";
import { cn } from "@/lib/utils";

export interface SearchableSelectItem {
  value: string;
  label: string;
  sublabel?: string;
}

interface SearchableSelectProps {
  items: SearchableSelectItem[];
  value: string | null;
  onSelect: (value: string, label: string) => void;
  placeholder?: string;
  searchPlaceholder?: string;
  triggerClassName?: string;
  disabled?: boolean;
}

export function SearchableSelect({
  items,
  value,
  onSelect,
  placeholder = "Select...",
  searchPlaceholder = "Search...",
  triggerClassName,
  disabled = false,
}: SearchableSelectProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  // Auto-focus search input when popover opens
  useEffect(() => {
    if (open) {
      // Small delay to let popover render
      const timer = setTimeout(() => inputRef.current?.focus(), 50);
      return () => clearTimeout(timer);
    } else {
      setQuery("");
    }
  }, [open]);

  const filtered = items.filter((item) =>
    item.label.toLowerCase().includes(query.toLowerCase())
  );

  const selectedLabel = value
    ? items.find((item) => item.value === value)?.label ?? value
    : null;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          disabled={disabled}
          className={cn(
            "w-full justify-between text-sm font-normal",
            !selectedLabel && "text-muted-foreground",
            triggerClassName
          )}
        >
          <span className="truncate">{selectedLabel ?? placeholder}</span>
          <ChevronsUpDown className="ml-1 h-3.5 w-3.5 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[--radix-popover-trigger-width] p-2" align="start">
        <Input
          ref={inputRef}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={searchPlaceholder}
          className="mb-2 h-8 text-sm"
        />
        <div className="max-h-48 overflow-y-auto" role="listbox">
          {filtered.length === 0 ? (
            <div className="px-2 py-3 text-center text-xs text-muted-foreground">
              No results found
            </div>
          ) : (
            filtered.map((item) => (
              <div
                key={item.value}
                role="option"
                aria-selected={item.value === value}
                className={cn(
                  "cursor-pointer rounded-sm p-2 text-sm hover:bg-accent",
                  item.value === value && "bg-accent"
                )}
                onClick={() => {
                  onSelect(item.value, item.label);
                  setOpen(false);
                }}
              >
                <div>{item.label}</div>
                {item.sublabel && (
                  <div className="text-xs text-muted-foreground">{item.sublabel}</div>
                )}
              </div>
            ))
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
