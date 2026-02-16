/**
 * Barrel export for all order mutations
 * Import from this file instead of individual mutation files
 */

// Order CRUD
export {
  create,
  cancel,
  remove,
  completeOrder,
  revertToConfirmed,
  updateOrderDiscount,
  completeBalls,
  createDraft,
  updateDraft,
  submitOrder,
  copyFromCancelled,
} from "./orderCrud";

// Item CRUD
export {
  addItem,
  removeItem,
  updateItemQuantity,
  replaceItems,
} from "./itemCrud";

// Status Updates
export {
  updateStatus,
  updatePayment,
  updateShipping,
  updateDetails,
} from "./statusUpdates";

// Kitchen Operations
export {
  addBallsToTray,
  fillPendingOrders,
  removeBallFromTray,
  boxProducts,
  stickerProducts,
  togglePackOrderLineItem,
  markOrderReady,
  sendBackToOrderDesk,
} from "./kitchen";

// Packaging Operations
export {
  markPackagePacked,
  completePackaging,
  revertToPackaging,
  markAllItemPackagesPacked,
  unmarkPackagePacked,
  fillPackage,
  unfillPackage,
} from "./packaging";

// Migrations
export {
  backfillOrderItemProduction,
  migrateChannelCodes,
  backfillProductionRecords,
} from "./migrations";

// Inventory Integration
export {
  reserveStockForOrder,
  consumeBoxingMaterials,
  consumeStickerMaterials,
  releaseReservation,
} from "./inventoryIntegration";
