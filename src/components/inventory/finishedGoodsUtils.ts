/**
 * Shared types and platform helper functions for the FinishedGoodsTab
 * and its extracted sub-components.
 */

import type { Id } from "../../../convex/_generated/dataModel";

// ============================================================================
// TYPES
// ============================================================================

export type GroupingMode = "product" | "location" | "platform";

export type AdjustDialogState = {
  menuProductId: Id<"menuProducts">;
  menuProductName: string;
  locationId: Id<"storageLocations">;
  locationName: string;
  currentQuantity: number;
};

export type InlineTransferState = {
  menuProductId: Id<"menuProducts">;
  menuProductName: string;
  locationId: Id<"storageLocations">;
  locationName: string;
  direction: "move_to" | "receive_from";
  availableAtSource: number;
  destLocationId: string;
  quantity: string;
  isSubmitting: boolean;
};

// The data shape from getStockOverviewGrouped
export type GroupedProductRow = {
  menuProductId: string;
  menuProductName: string;
  menuProductCode: string;
  isActive: boolean;
  defaultPrice: number;
  locations: Array<{
    locationId: string;
    locationName: string;
    locationType: string;
    quantity: number;
    isLowStock: boolean;
    effectiveThreshold: number;
  }>;
  totalQuantity: number;
};

// ============================================================================
// PLATFORM HELPERS
// ============================================================================

export function bucketLocationType(locationType: string): "internal" | "gofood" | "k3mart" | "other" {
  switch (locationType) {
    case "office":
    case "kitchen":
      return "internal";
    case "depot":
      return "gofood";
    case "venue":
      return "k3mart";
    default:
      return "other";
  }
}

export function locationTypeLabel(locationType: string): string {
  switch (locationType) {
    case "office":
    case "kitchen":
      return "Internal Inventory";
    case "depot":
      return "GoFood";
    case "venue":
      return "K3Mart";
    default:
      return locationType;
  }
}
