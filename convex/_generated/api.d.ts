/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as customers_mutations from "../customers/mutations.js";
import type * as customers_queries from "../customers/queries.js";
import type * as dashboard_queries from "../dashboard/queries.js";
import type * as ingredients_mutations from "../ingredients/mutations.js";
import type * as ingredients_queries from "../ingredients/queries.js";
import type * as lib_costCalculator from "../lib/costCalculator.js";
import type * as materials_mutations from "../materials/mutations.js";
import type * as materials_queries from "../materials/queries.js";
import type * as menuProducts_mutations from "../menuProducts/mutations.js";
import type * as menuProducts_queries from "../menuProducts/queries.js";
import type * as orders_mutations from "../orders/mutations.js";
import type * as orders_queries from "../orders/queries.js";
import type * as orders_whatsapp from "../orders/whatsapp.js";
import type * as packaging_mutations from "../packaging/mutations.js";
import type * as packaging_queries from "../packaging/queries.js";
import type * as products_mutations from "../products/mutations.js";
import type * as products_queries from "../products/queries.js";
import type * as recipes_mutations from "../recipes/mutations.js";
import type * as recipes_queries from "../recipes/queries.js";
import type * as tags_mutations from "../tags/mutations.js";
import type * as tags_queries from "../tags/queries.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  "customers/mutations": typeof customers_mutations;
  "customers/queries": typeof customers_queries;
  "dashboard/queries": typeof dashboard_queries;
  "ingredients/mutations": typeof ingredients_mutations;
  "ingredients/queries": typeof ingredients_queries;
  "lib/costCalculator": typeof lib_costCalculator;
  "materials/mutations": typeof materials_mutations;
  "materials/queries": typeof materials_queries;
  "menuProducts/mutations": typeof menuProducts_mutations;
  "menuProducts/queries": typeof menuProducts_queries;
  "orders/mutations": typeof orders_mutations;
  "orders/queries": typeof orders_queries;
  "orders/whatsapp": typeof orders_whatsapp;
  "packaging/mutations": typeof packaging_mutations;
  "packaging/queries": typeof packaging_queries;
  "products/mutations": typeof products_mutations;
  "products/queries": typeof products_queries;
  "recipes/mutations": typeof recipes_mutations;
  "recipes/queries": typeof recipes_queries;
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
