/**
 * Tests for customer search — phone normalization and companyName matching.
 *
 * Verifies that search matches:
 *  1. A number stored in `whatsapp` (not just `phone`)
 *  2. +62 prefix normalized to 0-prefix (same identity)
 *  3. Name and companyName substring matches still work
 */

import { convexTest } from "convex-test";
import { expect, test } from "vitest";
import schema from "../../schema";
import { api } from "../../_generated/api";

const modules = import.meta.glob("/convex/**/*.ts");

test("matches a number stored in whatsapp, not phone", async () => {
  const t = convexTest(schema, modules);
  await t.run(async (ctx) => {
    await ctx.db.insert("customers", { name: "Cafe A", whatsapp: "0812-3456-7890", createdBy: "x" });
  });
  const r = await t.query(api.customers.queries.search, { query: "081234567890" });
  expect(r.map((c) => c.name)).toContain("Cafe A");
});

test("normalizes +62 vs 0 prefix to one identity", async () => {
  const t = convexTest(schema, modules);
  await t.run(async (ctx) => {
    await ctx.db.insert("customers", { name: "Cafe B", phone: "+6281122334455", createdBy: "x" });
  });
  const r = await t.query(api.customers.queries.search, { query: "081122334455" });
  expect(r.map((c) => c.name)).toContain("Cafe B");
});

test("still matches name and companyName substrings", async () => {
  const t = convexTest(schema, modules);
  await t.run(async (ctx) => {
    await ctx.db.insert("customers", { name: "Marchella", companyName: "Amsterdam Thin Co", createdBy: "x" });
  });
  expect((await t.query(api.customers.queries.search, { query: "amsterdam" })).length).toBe(1);
});
