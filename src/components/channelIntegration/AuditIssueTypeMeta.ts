/**
 * Phase 74.5.1 Plan 10 — Audit issue type metadata.
 *
 * Extracted from AuditIssueTypeBadge.tsx to satisfy react-refresh's
 * only-export-components rule (post-review polish R1). The Badge component
 * is now the sole export from the companion .tsx file.
 *
 * The hover tooltip copy is LOAD-BEARING — it matches the legend text in
 * `.planning/phases/74.5.1-channel-routing-spine/74.5.1-UI-SPEC.md`
 * §Audit Issue Type Legends exactly. Changing the copy here must also
 * update the UI-SPEC.
 */

export type AuditIssueType =
  | "unmapped_sku"
  | "stale_mapping"
  | "malformed_item"
  | "duplicate_transaction"
  | "orphan_item";

export type AuditIssueSeverity = "warn" | "block";

export interface AuditIssueTypeMeta {
  label: string;
  tooltip: string;
  severity: AuditIssueSeverity;
}

export const TYPE_META: Record<AuditIssueType, AuditIssueTypeMeta> = {
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

/** Exposed for consumers that need the raw label/severity metadata. */
export function getAuditIssueTypeMeta(type: AuditIssueType): AuditIssueTypeMeta {
  return TYPE_META[type];
}
