/**
 * UAT re-verification — asserts the Phase D CRM punch-list fixes are live.
 * Run after the fixes + `convex dev --once`. Seed: UAT Cafe B2B.
 */
import { test, expect } from "@playwright/test";
import { loginAsRole, waitForAppReady, waitForDataLoad } from "./helpers";
import * as fs from "fs";
import * as path from "path";

const CUSTOMER_ID = "j97dq4jjy6xgxg2qp8be485vfx89cpgb";
const SUB1 = "zh78wkzfhrfe3xhg5rvjtv8c5989ds0j";
const BAD_ID = "j9700000000000000000000000000000";
const OUT = path.join("docs", "reviews", "uat", "phase-d-crm-2026-06-26", "verify");

test("Phase D CRM — punch-list fixes verified", async ({ page }) => {
  test.setTimeout(180_000);
  fs.mkdirSync(OUT, { recursive: true });
  const consoleErrors: string[] = [];
  page.on("console", (m) => {
    if (m.type() === "error" || m.type() === "warning") consoleErrors.push(`${m.type()}: ${m.text()}`);
  });
  page.on("pageerror", (e) => consoleErrors.push(`pageerror: ${e.message}`));

  await loginAsRole(page, "manager");

  // --- FIX 1: not-found no longer crashes ---
  await page.goto(`/crm/customers/${BAD_ID}`, { waitUntil: "networkidle" });
  await waitForAppReady(page);
  await page.waitForTimeout(1500);
  const notFoundText = await page.evaluate(() => document.body.innerText);
  await page.screenshot({ path: path.join(OUT, "01-not-found.png"), fullPage: true });
  expect(notFoundText).not.toContain("Something went wrong loading this page");
  expect(notFoundText.toLowerCase()).toContain("not found");

  // --- FIX 4: hub clean console (no DOM-nesting / duplicate-key) ---
  consoleErrors.length = 0;
  await page.goto(`/crm/customers/${CUSTOMER_ID}`, { waitUntil: "networkidle" });
  await waitForAppReady(page);
  await waitForDataLoad(page);
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  await page.waitForTimeout(1500);
  await page.screenshot({ path: path.join(OUT, "02-hub.png"), fullPage: true });
  const hubErrors = [...consoleErrors];
  fs.writeFileSync(path.join(OUT, "hub-console.log"), hubErrors.join("\n") || "(clean)");
  const domNesting = hubErrors.filter((e) => /cannot be a descendant|cannot contain a nested/i.test(e));
  const dupKey = hubErrors.filter((e) => /two children with the same key/i.test(e));
  const chartSize = hubErrors.filter((e) => /width\(-1\)|height\(-1\)/i.test(e));
  expect(domNesting, "DOM-nesting errors").toHaveLength(0);
  expect(dupKey, "duplicate-key errors").toHaveLength(0);
  expect(chartSize, "recharts size warnings").toHaveLength(0);

  // --- FIX 2: ledger BY shows a name, links show human numbers ---
  await page.goto(`/crm/customers/${CUSTOMER_ID}/subscriptions/${SUB1}`, { waitUntil: "networkidle" });
  await waitForAppReady(page);
  await waitForDataLoad(page);
  await page.waitForTimeout(1000);
  await page.screenshot({ path: path.join(OUT, "03-subscription-ledger.png"), fullPage: true });
  const ledgerText = await page.evaluate(() => document.body.innerText);
  // No raw 30+ char Convex id leaking in the visible text.
  expect(ledgerText).not.toMatch(/mn7619tbcw44tmvys0a/);
  // Human invoice number is used as link text (A1).
  expect(ledgerText).toMatch(/INV-UAT-2606-00\d/);

  // --- FIX 3: breadcrumb shows the customer name (A2) ---
  expect(ledgerText).toContain("UAT Cafe B2B");

  // --- FIX 3b: funding dashboard surfaces the unpaid invoice (no false "All caught up") ---
  await page.goto(`/crm/funding`, { waitUntil: "networkidle" });
  await waitForAppReady(page);
  await waitForDataLoad(page);
  await page.waitForTimeout(1000);
  await page.screenshot({ path: path.join(OUT, "04-funding.png"), fullPage: true });
  const fundingText = await page.evaluate(() => document.body.innerText);
  // The unpaid amendment invoice must now appear here.
  expect(fundingText).toMatch(/INV-UAT-2606-003|Unpaid invoice/i);

  console.log("ALL PUNCH-LIST FIXES VERIFIED");
});
