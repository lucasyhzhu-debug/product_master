/**
 * ComponentProductionSection (Phase 69)
 *
 * Gram-based input section for kitchen pre-cursor components (D-01, D-03, D-05).
 * Components are tracked in grams with no targets.
 * Each component has its own waste accordion entry (D-07).
 * Only shows components that are enabled in kitchenConfig (D-04).
 */

import { ChevronDown, ChevronUp } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

import { WASTE_REASONS, type WasteReason } from './index';

export interface KitchenComponent {
  _id: string;
  name: string;
  code: string;
  unit: string;
  sortOrder: number;
  tier?: number;
}

export interface ComponentWasteEntry {
  code: string;
  name: string;
  reason: WasteReason;
  grams: number;
}

interface ComponentProductionSectionProps {
  /** Available kitchen components (filtered to enabled only) */
  components: KitchenComponent[];
  /** Produced grams per component code */
  produced: Record<string, number>;
  /** Waste entries per component */
  waste: ComponentWasteEntry[];
  /** Whether waste section is expanded */
  wasteOpen: boolean;
  /** Callbacks */
  onProducedChange: (code: string, grams: number) => void;
  onWasteToggle: () => void;
  onAddWaste: (code: string, name: string) => void;
  onUpdateWaste: (index: number, field: "reason" | "grams", value: string | number) => void;
  onRemoveWaste: (index: number) => void;
}

export function ComponentProductionSection({
  components,
  produced,
  waste,
  wasteOpen,
  onProducedChange,
  onWasteToggle,
  onAddWaste,
  onUpdateWaste,
  onRemoveWaste,
}: ComponentProductionSectionProps) {
  if (components.length === 0) {
    return null;
  }

  return (
    <div className="space-y-3">
      <p className="text-sm font-medium text-muted-foreground uppercase tracking-wide">
        Components Produced
      </p>

      {/* Component input rows */}
      {components.map((comp) => {
        const grams = produced[comp.code] ?? 0;

        return (
          <div key={comp.code} className="space-y-1">
            <Label
              htmlFor={`comp-${comp.code}`}
              className="text-sm font-normal break-words"
            >
              {comp.name}
            </Label>
            <div className="flex items-center gap-2">
              <span className="flex-1" />
              <Input
                id={`comp-${comp.code}`}
                type="number"
                min={0}
                value={grams || ""}
                placeholder="0"
                onChange={(e) => onProducedChange(comp.code, Number(e.target.value))}
                className="w-24 text-right tabular-nums shrink-0"
              />
              <span className="text-xs text-muted-foreground shrink-0 min-w-[1rem]">
                {comp.unit || "g"}
              </span>
            </div>
          </div>
        );
      })}

      {/* Component waste section toggle */}
      <button
        type="button"
        className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors w-full text-left"
        onClick={onWasteToggle}
      >
        {wasteOpen ? (
          <ChevronUp className="h-4 w-4" />
        ) : (
          <ChevronDown className="h-4 w-4" />
        )}
        Any component waste?
        {waste.length > 0 && (
          <span className="ml-1 rounded-full bg-muted px-1.5 py-0.5 text-xs font-medium">
            {waste.length}
          </span>
        )}
      </button>

      {/* Component waste entries */}
      {wasteOpen && (
        <div className="space-y-3 border-l-2 border-muted pl-4">
          {waste.length === 0 && (
            <p className="text-xs text-muted-foreground">
              No component waste entries yet. Add one below.
            </p>
          )}

          {waste.map((entry, index) => (
            <div key={index} className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium">{entry.name}</span>
                <button
                  type="button"
                  className="text-xs text-muted-foreground hover:text-destructive transition-colors"
                  onClick={() => onRemoveWaste(index)}
                >
                  Remove
                </button>
              </div>
              <div className="flex gap-2 items-center">
                <Select
                  value={entry.reason}
                  onValueChange={(val) => onUpdateWaste(index, "reason", val)}
                >
                  <SelectTrigger className="flex-1 text-sm">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {WASTE_REASONS.map((r) => (
                      <SelectItem key={r.value} value={r.value}>
                        {r.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Input
                  type="number"
                  min={0}
                  value={entry.grams || ""}
                  placeholder="0"
                  onChange={(e) => onUpdateWaste(index, "grams", Number(e.target.value))}
                  className="w-20 text-right tabular-nums"
                />
                <span className="text-xs text-muted-foreground shrink-0 w-4">
                  {(() => {
                    const comp = components.find((c) => c.code === entry.code);
                    return comp?.unit || "g";
                  })()}
                </span>
              </div>
            </div>
          ))}

          {/* Add component waste buttons */}
          <div className="flex flex-wrap gap-2 pt-1">
            {components.map((comp) => (
              <button
                key={comp.code}
                type="button"
                className="text-xs rounded-full border border-dashed border-muted-foreground/50 px-2.5 py-1 text-muted-foreground hover:border-foreground hover:text-foreground transition-colors"
                onClick={() => onAddWaste(comp.code, comp.name)}
              >
                + {comp.name}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
