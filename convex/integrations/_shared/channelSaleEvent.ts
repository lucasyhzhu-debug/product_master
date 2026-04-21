// Phase 74.5.1: Canonical sale event emitted by every adapter's normalize() function.
// Downstream: saveRevenueItems + processChannelSaleInternal consume this shape.
//
// Fields rationale (RESEARCH.md §Code Example 2):
// - `occurredAt` is the BUSINESS timestamp (revenue.transactionDate fallback chain) — NOT Date.now().
// - `externalTransactionId` + `externalItemId` form the composite dedup/audit key (productInventoryTransactions.externalRef).
// - `outletId` + `menuProductId` feed resolveChannelRoute's 5-tier precedence.
// - `unitPrice` + `totalPrice` preserve revenue-side numbers for journal postings + reporting.

import type { Id } from "../../_generated/dataModel";
import type { ExternalSource } from "../../lib/externalSource";

export interface ChannelSaleEvent {
  /** Source channel literal (8-source union). Required. */
  readonly source: ExternalSource;

  /**
   * Business event time (epoch ms).
   * Fallback chain in buildEventFromRow: revenue.transactionDate ?? revenue.periodStart ?? revenue._creationTime.
   * Used as productInventoryTransactions.createdAt — preserves historical timestamps during backfill.
   */
  readonly occurredAt: number;

  /** External platform transaction ID (Shopee SP-xxx, GoFood order no, K3Mart dedup key, etc.). Required. */
  readonly externalTransactionId: string;

  /** Per-item ID within the transaction (SKU or item index). Optional — some sources don't provide it. */
  readonly externalItemId?: string;

  /** Outlet reference, when resolvable to an externalOutlets doc. Feeds routing Tier 1/2. */
  readonly outletId?: Id<"externalOutlets">;

  /** Linked menu product (post-SKU resolution). Feeds routing Tier 1/3 AND deduction target. */
  readonly menuProductId?: Id<"menuProducts">;

  /** Raw external product code (for audit + debugging). */
  readonly externalProductCode?: string;

  /** Raw external product name (for audit + display). */
  readonly externalProductName?: string;

  /** Unit count sold. Must be > 0 for deduction; 0-or-negative items are flagged as malformed_item. */
  readonly quantity: number;

  /** Per-unit price (currency as-is; IDR for this project). */
  readonly unitPrice: number;

  /** Line total. If missing/mismatched with unitPrice*quantity, flagged as malformed_item. */
  readonly totalPrice: number;
}
