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
} from "./orderCrud";

// Item CRUD
export {
  addItem,
  removeItem,
  updateItemQuantity,
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
} from "./kitchen";

// Packaging Operations
export {
  markPackagePacked,
  completePackaging,
  revertToPackaging,
  markAllItemPackagesPacked,
  unmarkPackagePacked,
} from "./packaging";

// Migrations
export {
  backfillOrderItemProduction,
  migrateChannelCodes,
  backfillProductionRecords,
} from "./migrations";
