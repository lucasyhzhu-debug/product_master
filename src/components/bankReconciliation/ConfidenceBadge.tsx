/**
 * ConfidenceBadge — visual chip for the bank line confidence tier.
 *
 * Phase 73 UI-SPEC §4 confidence palette + §9 a11y (aria-label).
 */

import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

export type Confidence = "exact" | "strong" | "suggested" | "none";

interface Props {
  confidence: Confidence;
  className?: string;
}

const PALETTE: Record<Confidence, { label: string; classes: string }> = {
  exact: {
    label: "Exact",
    classes:
      "bg-[color:var(--color-status-success-bg)] text-[color:var(--color-status-success)] border-[color:var(--color-status-success)]/30",
  },
  strong: {
    label: "Strong",
    classes:
      "bg-[color:var(--color-status-info-bg)] text-[color:var(--color-status-info)] border-[color:var(--color-status-info)]/30",
  },
  suggested: {
    label: "Suggested",
    classes:
      "bg-[color:var(--color-status-warning-bg)] text-[color:var(--color-status-warning)] border-[color:var(--color-status-warning)]/30",
  },
  none: {
    label: "Unmatched",
    classes: "bg-muted text-muted-foreground border-border",
  },
};

export function ConfidenceBadge({ confidence, className }: Props) {
  const cfg = PALETTE[confidence];
  return (
    <Badge
      variant="outline"
      aria-label={`Match confidence: ${confidence}`}
      className={cn("font-medium", cfg.classes, className)}
    >
      {cfg.label}
    </Badge>
  );
}
