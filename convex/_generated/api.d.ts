/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as auth_mutations from "../auth/mutations.js";
import type * as auth_queries from "../auth/queries.js";
import type * as auth_seed from "../auth/seed.js";
import type * as channels_mutations from "../channels/mutations.js";
import type * as channels_queries from "../channels/queries.js";
import type * as componentTypes_mutations from "../componentTypes/mutations.js";
import type * as componentTypes_queries from "../componentTypes/queries.js";
import type * as componentTypes_seed from "../componentTypes/seed.js";
import type * as crons from "../crons.js";
import type * as customers_mutations from "../customers/mutations.js";
import type * as customers_queries from "../customers/queries.js";
import type * as dashboard_queries from "../dashboard/queries.js";
import type * as externalData_mutations from "../externalData/mutations.js";
import type * as externalData_queries from "../externalData/queries.js";
import type * as feedback_mutations from "../feedback/mutations.js";
import type * as feedback_queries from "../feedback/queries.js";
import type * as gofoodDepot_mutations from "../gofoodDepot/mutations.js";
import type * as gofoodDepot_queries from "../gofoodDepot/queries.js";
import type * as http from "../http.js";
import type * as ingredients_mutations from "../ingredients/mutations.js";
import type * as ingredients_queries from "../ingredients/queries.js";
import type * as integrations_gobiz_adapter from "../integrations/gobiz/adapter.js";
import type * as integrations_gobiz_config from "../integrations/gobiz/config.js";
import type * as integrations_gobiz_helpers from "../integrations/gobiz/helpers.js";
import type * as integrations_internal_adapter from "../integrations/internal/adapter.js";
import type * as integrations_internal_config from "../integrations/internal/config.js";
import type * as integrations_internal_queries from "../integrations/internal/queries.js";
import type * as integrations_k3mart_adapter from "../integrations/k3mart/adapter.js";
import type * as integrations_k3mart_config from "../integrations/k3mart/config.js";
import type * as integrations_k3mart_helpers from "../integrations/k3mart/helpers.js";
import type * as integrations_registry from "../integrations/registry.js";
import type * as inventory_fifo from "../inventory/fifo.js";
import type * as inventory_helpers from "../inventory/helpers.js";
import type * as inventory_mutations from "../inventory/mutations.js";
import type * as inventory_queries from "../inventory/queries.js";
import type * as k3martCockpit_helpers from "../k3martCockpit/helpers.js";
import type * as k3martCockpit_mutations from "../k3martCockpit/mutations.js";
import type * as k3martCockpit_queries from "../k3martCockpit/queries.js";
import type * as k3martKitchen_queries from "../k3martKitchen/queries.js";
import type * as lib_auth from "../lib/auth.js";
import type * as lib_costCalculator from "../lib/costCalculator.js";
import type * as lib_periodRange from "../lib/periodRange.js";
import type * as lib_stockDelta from "../lib/stockDelta.js";
import type * as materials_mutations from "../materials/mutations.js";
import type * as materials_queries from "../materials/queries.js";
import type * as menuProductComponents_mutations from "../menuProductComponents/mutations.js";
import type * as menuProductComponents_queries from "../menuProductComponents/queries.js";
import type * as menuProducts_mutations from "../menuProducts/mutations.js";
import type * as menuProducts_queries from "../menuProducts/queries.js";
import type * as migrations_bomRefactorV2 from "../migrations/bomRefactorV2.js";
import type * as migrations_categorySimplification from "../migrations/categorySimplification.js";
import type * as migrations_gobizCleanupLegacySummaries from "../migrations/gobizCleanupLegacySummaries.js";
import type * as migrations_inventorySetup from "../migrations/inventorySetup.js";
import type * as orders_deleteAll from "../orders/deleteAll.js";
import type * as orders_helpers from "../orders/helpers.js";
import type * as orders_helpers_ballDistribution from "../orders/helpers/ballDistribution.js";
import type * as orders_helpers_batchFetching from "../orders/helpers/batchFetching.js";
import type * as orders_helpers_index from "../orders/helpers/index.js";
import type * as orders_helpers_productionRecords from "../orders/helpers/productionRecords.js";
import type * as orders_helpers_statusFetching from "../orders/helpers/statusFetching.js";
import type * as orders_helpers_statusTransitions from "../orders/helpers/statusTransitions.js";
import type * as orders_helpers_usageTracking from "../orders/helpers/usageTracking.js";
import type * as orders_helpers_voucherHandling from "../orders/helpers/voucherHandling.js";
import type * as orders_kitchenQueries from "../orders/kitchenQueries.js";
import type * as orders_migrations from "../orders/migrations.js";
import type * as orders_mutations_index from "../orders/mutations/index.js";
import type * as orders_mutations_inventoryIntegration from "../orders/mutations/inventoryIntegration.js";
import type * as orders_mutations_itemCrud from "../orders/mutations/itemCrud.js";
import type * as orders_mutations_kitchen from "../orders/mutations/kitchen.js";
import type * as orders_mutations_migrations from "../orders/mutations/migrations.js";
import type * as orders_mutations_orderCrud from "../orders/mutations/orderCrud.js";
import type * as orders_mutations_packaging from "../orders/mutations/packaging.js";
import type * as orders_mutations_statusUpdates from "../orders/mutations/statusUpdates.js";
import type * as orders_queries from "../orders/queries.js";
import type * as orders_types from "../orders/types.js";
import type * as orders_validators from "../orders/validators.js";
import type * as orders_whatsapp from "../orders/whatsapp.js";
import type * as orders_whatsappHelpers from "../orders/whatsappHelpers.js";
import type * as packaging_mutations from "../packaging/mutations.js";
import type * as packaging_queries from "../packaging/queries.js";
import type * as platformCredentials_actions from "../platformCredentials/actions.js";
import type * as platformCredentials_mutations from "../platformCredentials/mutations.js";
import type * as platformCredentials_queries from "../platformCredentials/queries.js";
import type * as productionCounts_mutations from "../productionCounts/mutations.js";
import type * as productionCounts_queries from "../productionCounts/queries.js";
import type * as productionLog_queries from "../productionLog/queries.js";
import type * as productionTargets_mutations from "../productionTargets/mutations.js";
import type * as productionTargets_queries from "../productionTargets/queries.js";
import type * as productionUnitTypes_mutations from "../productionUnitTypes/mutations.js";
import type * as productionUnitTypes_queries from "../productionUnitTypes/queries.js";
import type * as products_mutations from "../products/mutations.js";
import type * as products_queries from "../products/queries.js";
import type * as recipes_mutations from "../recipes/mutations.js";
import type * as recipes_queries from "../recipes/queries.js";
import type * as reports_dailySales from "../reports/dailySales.js";
import type * as restock_mutations from "../restock/mutations.js";
import type * as restock_queries from "../restock/queries.js";
import type * as shipping_mutations from "../shipping/mutations.js";
import type * as shipping_queries from "../shipping/queries.js";
import type * as storageLocations_mutations from "../storageLocations/mutations.js";
import type * as storageLocations_queries from "../storageLocations/queries.js";
import type * as tags_mutations from "../tags/mutations.js";
import type * as tags_queries from "../tags/queries.js";
import type * as vouchers_mutations from "../vouchers/mutations.js";
import type * as vouchers_queries from "../vouchers/queries.js";
import type * as whatsappTemplates_mutations from "../whatsappTemplates/mutations.js";
import type * as whatsappTemplates_queries from "../whatsappTemplates/queries.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  "auth/mutations": typeof auth_mutations;
  "auth/queries": typeof auth_queries;
  "auth/seed": typeof auth_seed;
  "channels/mutations": typeof channels_mutations;
  "channels/queries": typeof channels_queries;
  "componentTypes/mutations": typeof componentTypes_mutations;
  "componentTypes/queries": typeof componentTypes_queries;
  "componentTypes/seed": typeof componentTypes_seed;
  crons: typeof crons;
  "customers/mutations": typeof customers_mutations;
  "customers/queries": typeof customers_queries;
  "dashboard/queries": typeof dashboard_queries;
  "externalData/mutations": typeof externalData_mutations;
  "externalData/queries": typeof externalData_queries;
  "feedback/mutations": typeof feedback_mutations;
  "feedback/queries": typeof feedback_queries;
  "gofoodDepot/mutations": typeof gofoodDepot_mutations;
  "gofoodDepot/queries": typeof gofoodDepot_queries;
  http: typeof http;
  "ingredients/mutations": typeof ingredients_mutations;
  "ingredients/queries": typeof ingredients_queries;
  "integrations/gobiz/adapter": typeof integrations_gobiz_adapter;
  "integrations/gobiz/config": typeof integrations_gobiz_config;
  "integrations/gobiz/helpers": typeof integrations_gobiz_helpers;
  "integrations/internal/adapter": typeof integrations_internal_adapter;
  "integrations/internal/config": typeof integrations_internal_config;
  "integrations/internal/queries": typeof integrations_internal_queries;
  "integrations/k3mart/adapter": typeof integrations_k3mart_adapter;
  "integrations/k3mart/config": typeof integrations_k3mart_config;
  "integrations/k3mart/helpers": typeof integrations_k3mart_helpers;
  "integrations/registry": typeof integrations_registry;
  "inventory/fifo": typeof inventory_fifo;
  "inventory/helpers": typeof inventory_helpers;
  "inventory/mutations": typeof inventory_mutations;
  "inventory/queries": typeof inventory_queries;
  "k3martCockpit/helpers": typeof k3martCockpit_helpers;
  "k3martCockpit/mutations": typeof k3martCockpit_mutations;
  "k3martCockpit/queries": typeof k3martCockpit_queries;
  "k3martKitchen/queries": typeof k3martKitchen_queries;
  "lib/auth": typeof lib_auth;
  "lib/costCalculator": typeof lib_costCalculator;
  "lib/periodRange": typeof lib_periodRange;
  "lib/stockDelta": typeof lib_stockDelta;
  "materials/mutations": typeof materials_mutations;
  "materials/queries": typeof materials_queries;
  "menuProductComponents/mutations": typeof menuProductComponents_mutations;
  "menuProductComponents/queries": typeof menuProductComponents_queries;
  "menuProducts/mutations": typeof menuProducts_mutations;
  "menuProducts/queries": typeof menuProducts_queries;
  "migrations/bomRefactorV2": typeof migrations_bomRefactorV2;
  "migrations/categorySimplification": typeof migrations_categorySimplification;
  "migrations/gobizCleanupLegacySummaries": typeof migrations_gobizCleanupLegacySummaries;
  "migrations/inventorySetup": typeof migrations_inventorySetup;
  "orders/deleteAll": typeof orders_deleteAll;
  "orders/helpers": typeof orders_helpers;
  "orders/helpers/ballDistribution": typeof orders_helpers_ballDistribution;
  "orders/helpers/batchFetching": typeof orders_helpers_batchFetching;
  "orders/helpers/index": typeof orders_helpers_index;
  "orders/helpers/productionRecords": typeof orders_helpers_productionRecords;
  "orders/helpers/statusFetching": typeof orders_helpers_statusFetching;
  "orders/helpers/statusTransitions": typeof orders_helpers_statusTransitions;
  "orders/helpers/usageTracking": typeof orders_helpers_usageTracking;
  "orders/helpers/voucherHandling": typeof orders_helpers_voucherHandling;
  "orders/kitchenQueries": typeof orders_kitchenQueries;
  "orders/migrations": typeof orders_migrations;
  "orders/mutations/index": typeof orders_mutations_index;
  "orders/mutations/inventoryIntegration": typeof orders_mutations_inventoryIntegration;
  "orders/mutations/itemCrud": typeof orders_mutations_itemCrud;
  "orders/mutations/kitchen": typeof orders_mutations_kitchen;
  "orders/mutations/migrations": typeof orders_mutations_migrations;
  "orders/mutations/orderCrud": typeof orders_mutations_orderCrud;
  "orders/mutations/packaging": typeof orders_mutations_packaging;
  "orders/mutations/statusUpdates": typeof orders_mutations_statusUpdates;
  "orders/queries": typeof orders_queries;
  "orders/types": typeof orders_types;
  "orders/validators": typeof orders_validators;
  "orders/whatsapp": typeof orders_whatsapp;
  "orders/whatsappHelpers": typeof orders_whatsappHelpers;
  "packaging/mutations": typeof packaging_mutations;
  "packaging/queries": typeof packaging_queries;
  "platformCredentials/actions": typeof platformCredentials_actions;
  "platformCredentials/mutations": typeof platformCredentials_mutations;
  "platformCredentials/queries": typeof platformCredentials_queries;
  "productionCounts/mutations": typeof productionCounts_mutations;
  "productionCounts/queries": typeof productionCounts_queries;
  "productionLog/queries": typeof productionLog_queries;
  "productionTargets/mutations": typeof productionTargets_mutations;
  "productionTargets/queries": typeof productionTargets_queries;
  "productionUnitTypes/mutations": typeof productionUnitTypes_mutations;
  "productionUnitTypes/queries": typeof productionUnitTypes_queries;
  "products/mutations": typeof products_mutations;
  "products/queries": typeof products_queries;
  "recipes/mutations": typeof recipes_mutations;
  "recipes/queries": typeof recipes_queries;
  "reports/dailySales": typeof reports_dailySales;
  "restock/mutations": typeof restock_mutations;
  "restock/queries": typeof restock_queries;
  "shipping/mutations": typeof shipping_mutations;
  "shipping/queries": typeof shipping_queries;
  "storageLocations/mutations": typeof storageLocations_mutations;
  "storageLocations/queries": typeof storageLocations_queries;
  "tags/mutations": typeof tags_mutations;
  "tags/queries": typeof tags_queries;
  "vouchers/mutations": typeof vouchers_mutations;
  "vouchers/queries": typeof vouchers_queries;
  "whatsappTemplates/mutations": typeof whatsappTemplates_mutations;
  "whatsappTemplates/queries": typeof whatsappTemplates_queries;
}>;

/**
 * A utility for referencing Convex functions in your app's public API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = api.myModule.myFunction;
 * ```
 */
export declare const api: FilterApi<
  typeof fullApi,
  FunctionReference<any, "public">
>;

/**
 * A utility for referencing Convex functions in your app's internal API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = internal.myModule.myFunction;
 * ```
 */
export declare const internal: FilterApi<
  typeof fullApi,
  FunctionReference<any, "internal">
>;

export declare const components: {};
