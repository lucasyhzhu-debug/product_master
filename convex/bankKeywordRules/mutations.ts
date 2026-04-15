/**
 * bankKeywordRules mutations — seedDefaults + admin CRUD.
 *
 * Auth split (matches convex/accounts/mutations.ts pattern):
 * - seedDefaults: plain `mutation` so the Convex dashboard Functions tab can
 *   invoke it with no session (system-op). Token arg is optional; when
 *   supplied we still enforce admin. `resolveSeederUserId` falls back to the
 *   first admin user when no token is passed.
 * - create / update / deactivate: `protectedMutation({ roles: ["admin"] })`
 *   from `convex/lib/functions.ts` — session token extracted by wrapper;
 *   `ctx.user` is the caller Doc.
 *
 * Idempotency:
 *   seedDefaults is upsert-keyed on `ruleCode` (via `by_ruleCode` index) — a
 *   second invocation updates existing rows with current seed values without
 *   creating duplicates.
 *
 * Fail-loud seed:
 *   All 20 account refs must resolve (by `accounts.name`) before any rule is
 *   inserted. If any ref is missing the seed throws a ConvexError listing the
 *   unresolved refs — caller is expected to run `accounts:seedDefaults` first.
 *   Because the resolution loop runs before the insert loop, partial seeds are
 *   impossible on unresolved-ref failures (Convex mutations are atomic on any
 *   throw — see RESEARCH §Pattern 2).
 *
 * ruleCode validation:
 *   `create` rejects codes not matching `/^[A-Z]\d{2}$/` — prevents UI typos
 *   from polluting the canonical code space. Updates and seeds pre-date this
 *   check (seed uses hardcoded canonical codes; update does not change the
 *   code).
 */

import { ConvexError, v } from "convex/values";
import { mutation } from "../_generated/server";
import { protectedMutation } from "../lib/functions";
import { requireRole, resolveSeederUserId } from "../lib/auth";
import type { Id } from "../_generated/dataModel";
import { DEFAULT_ACCOUNT_REFS, DEFAULT_RULES } from "./defaultRules";

const RULE_CODE_REGEX = /^[A-Z]\d{2}$/;

// ---------------------------------------------------------------------------
// seedDefaults — idempotent upsert of DEFAULT_RULES
// ---------------------------------------------------------------------------

export const seedDefaults = mutation({
  args: { token: v.optional(v.string()) },
  handler: async (ctx, args) => {
    // Step 1: resolve ALL 20 account refs up front. Fail loudly if any missing —
    // never silently partial-seed.
    const accountRefMap = new Map<string, Id<"accounts">>();
    const unresolved: string[] = [];
    for (const { ref, accountName } of DEFAULT_ACCOUNT_REFS) {
      const acc = await ctx.db
        .query("accounts")
        .withIndex("by_name", (q) => q.eq("name", accountName))
        .first();
      if (!acc) {
        unresolved.push(`${ref} ("${accountName}")`);
      } else {
        accountRefMap.set(ref, acc._id);
      }
    }
    if (unresolved.length > 0) {
      throw new ConvexError(
        `bankKeywordRules seed failed: unresolved account refs ${JSON.stringify(unresolved)}. ` +
          `Run accounts:seedDefaults first or add missing accounts to CoA.`,
      );
    }

    // Step 2: resolve createdBy / updatedBy user id via shared helper.
    const userId = await resolveSeederUserId(ctx, args.token);

    // Step 3: upsert each rule keyed on ruleCode.
    const results: Array<{ ruleCode: string; action: "created" | "updated" }> = [];
    const now = Date.now();

    for (const rule of DEFAULT_RULES) {
      const existing = await ctx.db
        .query("bankKeywordRules")
        .withIndex("by_ruleCode", (q) => q.eq("ruleCode", rule.ruleCode))
        .first();

      const persist = {
        ruleCode: rule.ruleCode,
        plSection: rule.plSection,
        direction: rule.direction,
        matchType: rule.matchType,
        counterpartyPatterns: rule.counterpartyPatterns,
        descriptionPatterns: rule.descriptionPatterns,
        descriptionPatternsMode: rule.descriptionPatternsMode,
        isCatchAll: rule.isCatchAll,
        categoryAccountId: accountRefMap.get(rule.categoryRef)!,
        subCategoryTemplate: rule.subCategoryTemplate,
        jeDebitAccountId: accountRefMap.get(rule.jeDebitRef)!,
        jeCreditAccountId: accountRefMap.get(rule.jeCreditRef)!,
        linkedChannel: rule.linkedChannel,
        confidence: rule.confidence,
        priority: rule.priority,
        flags: rule.flags,
        isActive: rule.isActive,
      };

      if (existing) {
        await ctx.db.patch(existing._id, {
          ...persist,
          updatedAt: now,
          updatedBy: userId,
        });
        results.push({ ruleCode: rule.ruleCode, action: "updated" });
      } else {
        await ctx.db.insert("bankKeywordRules", {
          ...persist,
          createdBy: userId,
          createdAt: now,
        });
        results.push({ ruleCode: rule.ruleCode, action: "created" });
      }
    }

    return results;
  },
});

// ---------------------------------------------------------------------------
// Admin CRUD — protectedMutation wrapper
// ---------------------------------------------------------------------------

const PL_SECTION_VALIDATOR = v.union(
  v.literal("Revenue"),
  v.literal("COGS"),
  v.literal("OpEx"),
  v.literal("Below the Line"),
);
const DIRECTION_VALIDATOR = v.union(v.literal("debit"), v.literal("credit"), v.literal("any"));
const MATCH_TYPE_VALIDATOR = v.union(
  v.literal("counterparty"),
  v.literal("description_contains"),
  v.literal("description_exact"),
  v.literal("description_regex"),
  v.literal("counterparty_or_keyword"),
  v.literal("counterparty_and_keyword"),
  v.literal("catch_all"),
);
const MODE_VALIDATOR = v.union(v.literal("any"), v.literal("all"), v.literal("hint"));
const CONFIDENCE_VALIDATOR = v.union(v.literal("exact"), v.literal("strong"), v.literal("suggested"));

export const create = protectedMutation({
  roles: ["admin"],
  args: {
    ruleCode: v.string(),
    plSection: PL_SECTION_VALIDATOR,
    direction: DIRECTION_VALIDATOR,
    matchType: MATCH_TYPE_VALIDATOR,
    counterpartyPatterns: v.optional(v.array(v.string())),
    descriptionPatterns: v.optional(v.array(v.string())),
    descriptionPatternsMode: MODE_VALIDATOR,
    isCatchAll: v.boolean(),
    categoryAccountId: v.id("accounts"),
    subCategoryTemplate: v.optional(v.string()),
    jeDebitAccountId: v.id("accounts"),
    jeCreditAccountId: v.id("accounts"),
    linkedChannel: v.optional(v.string()),
    confidence: CONFIDENCE_VALIDATOR,
    priority: v.number(),
    flags: v.optional(v.array(v.string())),
    isActive: v.boolean(),
  },
  handler: async (ctx, args) => {
    if (!RULE_CODE_REGEX.test(args.ruleCode)) {
      throw new ConvexError(
        `Invalid ruleCode "${args.ruleCode}": must match /^[A-Z]\\d{2}$/ (e.g. R01, C03, O09, B02)`,
      );
    }
    const existing = await ctx.db
      .query("bankKeywordRules")
      .withIndex("by_ruleCode", (q) => q.eq("ruleCode", args.ruleCode))
      .first();
    if (existing) {
      throw new ConvexError(`Rule code ${args.ruleCode} already exists`);
    }
    // Uniqueness guard: a second active catch-all with overlapping direction
    // would silently shadow R01 in the match engine (see matchEngine.ts — all
    // catch-alls evaluate last, so the first match wins by priority).
    if (args.isCatchAll && args.isActive) {
      const conflicts = await ctx.db
        .query("bankKeywordRules")
        .withIndex("by_isCatchAll", (q) => q.eq("isCatchAll", true))
        .collect();
      const overlap = conflicts.find(
        (r) =>
          r.isActive &&
          (r.direction === "any" ||
            args.direction === "any" ||
            r.direction === args.direction),
      );
      if (overlap) {
        throw new ConvexError(
          `Active catch-all rule ${overlap.ruleCode} (direction=${overlap.direction}) already matches direction=${args.direction}. Deactivate it or scope one of the two to a narrower direction first.`,
        );
      }
    }
    return await ctx.db.insert("bankKeywordRules", {
      ...args,
      createdBy: ctx.user._id,
      createdAt: Date.now(),
    });
  },
});

export const update = protectedMutation({
  roles: ["admin"],
  args: {
    id: v.id("bankKeywordRules"),
    plSection: v.optional(PL_SECTION_VALIDATOR),
    direction: v.optional(DIRECTION_VALIDATOR),
    matchType: v.optional(MATCH_TYPE_VALIDATOR),
    counterpartyPatterns: v.optional(v.array(v.string())),
    descriptionPatterns: v.optional(v.array(v.string())),
    descriptionPatternsMode: v.optional(MODE_VALIDATOR),
    isCatchAll: v.optional(v.boolean()),
    categoryAccountId: v.optional(v.id("accounts")),
    subCategoryTemplate: v.optional(v.string()),
    jeDebitAccountId: v.optional(v.id("accounts")),
    jeCreditAccountId: v.optional(v.id("accounts")),
    linkedChannel: v.optional(v.string()),
    confidence: v.optional(CONFIDENCE_VALIDATOR),
    priority: v.optional(v.number()),
    flags: v.optional(v.array(v.string())),
    isActive: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const { id, ...patch } = args;
    await ctx.db.patch(id, {
      ...patch,
      updatedAt: Date.now(),
      updatedBy: ctx.user._id,
    });
    return null;
  },
});

export const deactivate = protectedMutation({
  roles: ["admin"],
  args: { id: v.id("bankKeywordRules") },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.id, {
      isActive: false,
      updatedAt: Date.now(),
      updatedBy: ctx.user._id,
    });
    return null;
  },
});

// ---------------------------------------------------------------------------
// createFromOverride — Phase 73 D-10/D-11/D-12
//
// Widens rule creation to manager+admin when invoked from the inline
// learn-from-override dialog (reviewer overrides a bank line's category; UI
// offers to save as a new rule). Plain CRUD (create/update/deactivate) stays
// admin-only per D-23 + P72 D-19.
//
// Uses requireRole(ctx, args.token, ...) rather than protectedMutation because
// the dialog path passes a session token directly from the reconciliation UI
// (same shape as other P73 mutations in convex/bankStatements/mutations.ts).
// ---------------------------------------------------------------------------

export const createFromOverride = mutation({
  args: {
    token: v.string(),
    ruleCode: v.string(),
    plSection: PL_SECTION_VALIDATOR,
    direction: DIRECTION_VALIDATOR,
    matchType: MATCH_TYPE_VALIDATOR,
    counterpartyPatterns: v.optional(v.array(v.string())),
    descriptionPatterns: v.optional(v.array(v.string())),
    descriptionPatternsMode: MODE_VALIDATOR,
    isCatchAll: v.boolean(),
    categoryAccountId: v.id("accounts"),
    subCategoryTemplate: v.optional(v.string()),
    jeDebitAccountId: v.id("accounts"),
    jeCreditAccountId: v.id("accounts"),
    linkedChannel: v.optional(v.string()),
    confidence: CONFIDENCE_VALIDATOR,
    priority: v.number(),
    flags: v.optional(v.array(v.string())),
    isActive: v.boolean(),
  },
  handler: async (ctx, args) => {
    const user = await requireRole(ctx, args.token, ["manager", "admin"]);

    if (!RULE_CODE_REGEX.test(args.ruleCode)) {
      throw new ConvexError(
        `Invalid ruleCode "${args.ruleCode}": must match /^[A-Z]\\d{2}$/ (e.g. R01, C03, O09, B02)`,
      );
    }

    const existing = await ctx.db
      .query("bankKeywordRules")
      .withIndex("by_ruleCode", (q) => q.eq("ruleCode", args.ruleCode))
      .first();
    if (existing) {
      throw new ConvexError(`Rule code ${args.ruleCode} already exists`);
    }

    // Catch-all uniqueness guard — mirrors plain create.
    if (args.isCatchAll && args.isActive) {
      const conflicts = await ctx.db
        .query("bankKeywordRules")
        .withIndex("by_isCatchAll", (q) => q.eq("isCatchAll", true))
        .collect();
      const overlap = conflicts.find(
        (r) =>
          r.isActive &&
          (r.direction === "any" ||
            args.direction === "any" ||
            r.direction === args.direction),
      );
      if (overlap) {
        throw new ConvexError(
          `Active catch-all rule ${overlap.ruleCode} (direction=${overlap.direction}) already matches direction=${args.direction}. Deactivate it or scope one of the two to a narrower direction first.`,
        );
      }
    }

    const { token: _token, ...payload } = args;
    return await ctx.db.insert("bankKeywordRules", {
      ...payload,
      createdBy: user._id,
      createdAt: Date.now(),
    });
  },
});
