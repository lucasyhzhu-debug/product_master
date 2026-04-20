/**
 * Phase 74.5.1 Plan 10 — AuditIssueTypeBadge
 *
 * Shared badge for the 5 audit issue types. Renders a shadcn Badge with
 * variant driven by severity (warn → secondary, block → destructive).
 *
 * The hover tooltip copy is LOAD-BEARING — it matches the legend text in
 * `.planning/phases/74.5.1-channel-routing-spine/74.5.1-UI-SPEC.md`
 * §Audit Issue Type Legends exactly. Changing the copy here must also
 * update the UI-SPEC.
 *
 * No raw hex colors — the Badge `variant` prop resolves to theme tokens.
 */

import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Badge } from "@/components/ui/badge";

export type AuditIssueType =
  | "unmapped_sku"
  | "stale_mapping"
  | "malformed_item"
  | "duplicate_transaction"
  | "orphan_item";

const TYPE_META: Record<
  AuditIssueType,
  { label: string; tooltip: string; severity: "warn" | "block" }
> = {
  unmapped_sku: {
    label: "Unmapped SKU",
    tooltip:
      "Item has a product name but no linkedMenuProductId. Cannot deduct.",
    severity: "warn",
  },
  stale_mapping: {
    label: "Stale mapping",
    tooltip:
      "Item was mapped to a menu product that has since been renamed, delinked, or disabled.",
    severity: "warn",
  },
  malformed_item: {
    label: "Malformed item",
    tooltip: "Quantity \u22640, totalPrice <0, or required field missing.",
    severity: "block",
  },
  duplicate_transaction: {
    label: "Duplicate tx",
    tooltip:
      "Same (source, externalTransactionId, externalItemId) appears twice.",
    severity: "block",
  },
  orphan_item: {
    label: "Orphan item",
    tooltip:
      "externalRevenueItem.revenueId points to deleted or missing externalRevenue parent.",
    severity: "block",
  },
};

interface AuditIssueTypeBadgeProps {
  type: AuditIssueType;
  className?: string;
}

export function AuditIssueTypeBadge({
  type,
  className,
}: AuditIssueTypeBadgeProps) {
  const meta = TYPE_META[type];
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Badge
          variant={meta.severity === "block" ? "destructive" : "secondary"}
          className={className}
          aria-label={`${meta.label}: ${meta.tooltip}`}
        >
          {meta.label}
        </Badge>
      </TooltipTrigger>
      <TooltipContent className="max-w-xs">{meta.tooltip}</TooltipContent>
    </Tooltip>
  );
}

/** Exposed for consumers that need the raw label/severity metadata. */
export function getAuditIssueTypeMeta(type: AuditIssueType) {
  return TYPE_META[type];
}
