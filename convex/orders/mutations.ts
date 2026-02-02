/**
 * DEPRECATED: This file has been split into domain-specific files
 *
 * Import from convex/orders/mutations/* instead for better organization.
 *
 * Migration guide:
 * - Order CRUD: ./mutations/orderCrud.ts
 * - Item CRUD: ./mutations/itemCrud.ts
 * - Status Updates: ./mutations/statusUpdates.ts
 * - Kitchen Operations: ./mutations/kitchen.ts
 * - Packaging: ./mutations/packaging.ts
 * - Migrations: ./migrations.ts
 *
 * All exports are re-exported below for backward compatibility.
 *
 * Phase 3 refactor completed 2026-02-02:
 * - Split 1783 lines into 6 domain files (<400 lines each)
 * - Fixed type safety (replaced Record<string, unknown>)
 * - Maintained full backward compatibility
 */

export * from "./mutations/index";
