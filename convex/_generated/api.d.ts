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
import type * as customers_mutations from "../customers/mutations.js";
import type * as customers_queries from "../customers/queries.js";
import type * as dashboard_queries from "../dashboard/queries.js";
import type * as feedback_mutations from "../feedback/mutations.js";
import type * as feedback_queries from "../feedback/queries.js";
import type * as ingredients_mutations from "../ingredients/mutations.js";
import type * as ingredients_queries from "../ingredients/queries.js";
import type * as lib_auth from "../lib/auth.js";
import type * as lib_costCalculator from "../lib/costCalculator.js";
import type * as materials_mutations from "../materials/mutations.js";
import type * as materials_queries from "../materials/queries.js";
import type * as menuProductComponents_mutations from "../menuProductComponents/mutations.js";
import type * as menuProductComponents_queries from "../menuProductComponents/queries.js";
import type * as menuProducts_mutations from "../menuProducts/mutations.js";
import type * as menuProducts_queries from "../menuProducts/queries.js";
import type * as orders_deleteAll from "../orders/deleteAll.js";
import type * as orders_helpers from "../orders/helpers.js";
import type * as orders_helpers_ballDistribution from "../orders/helpers/ballDistribution.js";
import type * as orders_helpers_index from "../orders/helpers/index.js";
import type * as orders_helpers_productionRecords from "../orders/helpers/productionRecords.js";
import type * as orders_helpers_statusTransitions from "../orders/helpers/statusTransitions.js";
import type * as orders_helpers_usageTracking from "../orders/helpers/usageTracking.js";
import type * as orders_mutations from "../orders/mutations.js";
import type * as orders_queries from "../orders/queries.js";
import type * as orders_whatsapp from "../orders/whatsapp.js";
import type * as orders_whatsappHelpers from "../orders/whatsappHelpers.js";
import type * as packaging_mutations from "../packaging/mutations.js";
import type * as packaging_queries from "../packaging/queries.js";
import type * as productionUnitTypes_mutations from "../productionUnitTypes/mutations.js";
import type * as productionUnitTypes_queries from "../productionUnitTypes/queries.js";
import type * as products_mutations from "../products/mutations.js";
import type * as products_queries from "../products/queries.js";
import type * as recipes_mutations from "../recipes/mutations.js";
import type * as recipes_queries from "../recipes/queries.js";
import type * as shipping_mutations from "../shipping/mutations.js";
import type * as shipping_queries from "../shipping/queries.js";
import type * as tags_mutations from "../tags/mutations.js";
import type * as tags_queries from "../tags/queries.js";

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
  "customers/mutations": typeof customers_mutations;
  "customers/queries": typeof customers_queries;
  "dashboard/queries": typeof dashboard_queries;
  "feedback/mutations": typeof feedback_mutations;
  "feedback/queries": typeof feedback_queries;
  "ingredients/mutations": typeof ingredients_mutations;
  "ingredients/queries": typeof ingredients_queries;
  "lib/auth": typeof lib_auth;
  "lib/costCalculator": typeof lib_costCalculator;
  "materials/mutations": typeof materials_mutations;
  "materials/queries": typeof materials_queries;
  "menuProductComponents/mutations": typeof menuProductComponents_mutations;
  "menuProductComponents/queries": typeof menuProductComponents_queries;
  "menuProducts/mutations": typeof menuProducts_mutations;
  "menuProducts/queries": typeof menuProducts_queries;
  "orders/deleteAll": typeof orders_deleteAll;
  "orders/helpers": typeof orders_helpers;
  "orders/helpers/ballDistribution": typeof orders_helpers_ballDistribution;
  "orders/helpers/index": typeof orders_helpers_index;
  "orders/helpers/productionRecords": typeof orders_helpers_productionRecords;
  "orders/helpers/statusTransitions": typeof orders_helpers_statusTransitions;
  "orders/helpers/usageTracking": typeof orders_helpers_usageTracking;
  "orders/mutations": typeof orders_mutations;
  "orders/queries": typeof orders_queries;
  "orders/whatsapp": typeof orders_whatsapp;
  "orders/whatsappHelpers": typeof orders_whatsappHelpers;
  "packaging/mutations": typeof packaging_mutations;
  "packaging/queries": typeof packaging_queries;
  "productionUnitTypes/mutations": typeof productionUnitTypes_mutations;
  "productionUnitTypes/queries": typeof productionUnitTypes_queries;
  "products/mutations": typeof products_mutations;
  "products/queries": typeof products_queries;
  "recipes/mutations": typeof recipes_mutations;
  "recipes/queries": typeof recipes_queries;
  "shipping/mutations": typeof shipping_mutations;
  "shipping/queries": typeof shipping_queries;
  "tags/mutations": typeof tags_mutations;
  "tags/queries": typeof tags_queries;
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
