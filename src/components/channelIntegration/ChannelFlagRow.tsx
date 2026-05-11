/**
 * Phase 74.5.1 Plan 09 — ChannelFlagRow
 *
 * Renders one row of the 8-key flag map used by ProductInventorySettings.
 * Supports three visual modes per UI-SPEC §ProductInventorySettings:
 *   - enabled + on/off Switch
 *   - disabled with reason ("na" | "blocked" | "permanent-off")
 *
 * References:
 * - UI-SPEC §ProductInventorySettings state rules per row
 * - UI-SPEC §Inline Status Copy
 * - UI-SPEC §Shared Component Inventory
 */

import { Switch } from "@/components/ui/switch";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { SourceBadge } from "./SourceBadge";
import { formatShortWIB } from "@/lib/dateUtils";
import type { ExternalSource } from "../../../convex/lib/externalSource";
import { resolvePlatform, platformDisplay } from "../../../convex/reports/platform";
import { Info } from "lucide-react";

export type FlagState =
  | { enabled: boolean }
  | {
      disabled: true;
      reason: "na" | "blocked" | "permanent-off";
      tooltip: string;
    };

interface ChannelFlagRowProps {
  source: ExternalSource;
  state: FlagState;
  lastFlippedAt?: number;
  lastFlippedBy?: string;
  onFlip?: (next: boolean) => void;
}

function reasonLabel(reason: "na" | "blocked" | "permanent-off"): string {
  switch (reason) {
    case "na":
      return "N/A · aggregate-only source";
    case "blocked":
      return "Blocked · OAuth pending";
    case "permanent-off":
      return "Permanent off";
  }
}

export function ChannelFlagRow({
  source,
  state,
  lastFlippedAt,
  lastFlippedBy,
  onFlip,
}: ChannelFlagRowProps) {
  const disabled = "disabled" in state;
  const isOn = !disabled && state.enabled;
  const displayChannel = platformDisplay(resolvePlatform({ source }).platform);

  return (
    <div className="flex items-center justify-between gap-4 border-b border-border/60 py-3 last:border-b-0">
      <div className="flex items-center gap-3">
        <SourceBadge source={source} />
        <div className="flex flex-col">
          <span className="text-sm font-semibold">{displayChannel}</span>
          {lastFlippedAt !== undefined && (
            <span className="text-xs text-muted-foreground">
              Last flipped {formatShortWIB(lastFlippedAt)}
              {lastFlippedBy ? ` by ${lastFlippedBy}` : ""}
            </span>
          )}
        </div>
      </div>

      <div className="flex items-center gap-3">
        {disabled ? (
          <Tooltip>
            <TooltipTrigger asChild>
              <span
                role="status"
                className="inline-flex items-center gap-1 text-xs text-muted-foreground"
              >
                <Info className="h-3.5 w-3.5" aria-hidden="true" />
                {reasonLabel(state.reason)}
              </span>
            </TooltipTrigger>
            <TooltipContent side="left" className="max-w-xs">
              {state.tooltip}
            </TooltipContent>
          </Tooltip>
        ) : (
          <span
            role="status"
            aria-live="polite"
            className="text-xs text-muted-foreground tabular-nums"
          >
            {isOn ? "Deduction: on" : "Deduction: off"}
          </span>
        )}
        <Switch
          checked={isOn}
          disabled={disabled}
          onCheckedChange={(next) => onFlip?.(next)}
          aria-label={`Toggle ${displayChannel} deduction`}
          aria-describedby={
            disabled ? `channel-flag-reason-${source}` : undefined
          }
        />
        {disabled && (
          <span id={`channel-flag-reason-${source}`} className="sr-only">
            {state.tooltip}
          </span>
        )}
      </div>
    </div>
  );
}
