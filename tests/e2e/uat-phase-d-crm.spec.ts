/**
 * UAT evidence-capture pass — Phase D CRM surface.
 * Run-id: phase-d-crm-2026-06-26
 *
 * This is NOT an assertion test. It is the orchestrator's single navigation pass:
 * it drives every in-scope flow ONCE and writes a self-contained evidence pack
 * (screenshots + per-step innerText dumps + console/network logs + steps.json)
 * under docs/reviews/uat/phase-d-crm-2026-06-26/. The two persona evaluators read
 * that pack; they never drive the browser.
 *
 * It is intentionally resilient: each step is wrapped so one failure does not abort
 * the pass — a broken step is recorded (state: "broken") and the pass continues.
 */
import { test, expect } from "@playwright/test";
import { loginAsRole, logout, waitForAppReady, waitForDataLoad } from "./helpers";
import * as fs from "fs";
import * as path from "path";

// ---- Seeded dataset (subscriptions/_devSeed:seedCrmUat) ----
const CUSTOMER_ID = "j97dq4jjy6xgxg2qp8be485vfx89cpgb";
const SUB1 = "zh78wkzfhrfe3xhg5rvjtv8c5989ds0j";
const SUB2 = "zh75kby1s6qc6z8wfdgte69zfh89c8vd";
const BAD_ID = "j9700000000000000000000000000000"; // not-found probe

const RUN_DIR = path.join("docs", "reviews", "uat", "phase-d-crm-2026-06-26");
const SCREENS = path.join(RUN_DIR, "screens");
const DUMPS = path.join(RUN_DIR, "dumps");

type StepState = "ok" | "warn" | "broken";
interface StepRec {
  n: number;
  flow: string;
  route: string;
  action: string;
  url: string;
  screenshot: string;
  dump: string;
  consoleNew: number;
  netNew: number;
  state: StepState;
  note?: string;
}

const steps: StepRec[] = [];
const consoleErrors: string[] = [];
const netFailures: string[] = [];
let currentLabel = "boot";

test.describe.configure({ mode: "serial" });

test("Phase D CRM — single evidence-capture pass", async ({ page }) => {
  test.setTimeout(600_000);

  for (const d of [SCREENS, DUMPS]) fs.mkdirSync(d, { recursive: true });

  // Global console + network capture, tagged with the active step label.
  page.on("console", (msg) => {
    if (msg.type() === "error" || msg.type() === "warning") {
      consoleErrors.push(`[${currentLabel}] ${msg.type()}: ${msg.text()}`);
    }
  });
  page.on("pageerror", (err) => {
    consoleErrors.push(`[${currentLabel}] pageerror: ${err.message}`);
  });
  page.on("response", (resp) => {
    const s = resp.status();
    if (s >= 400) {
      netFailures.push(`[${currentLabel}] ${s} ${resp.request().method()} ${resp.url()}`);
    }
  });
  page.on("requestfailed", (req) => {
    netFailures.push(`[${currentLabel}] FAILED ${req.method()} ${req.url()} — ${req.failure()?.errorText}`);
  });

  let n = 0;
  async function step(
    flow: string,
    route: string,
    action: string,
    fn: () => Promise<void>
  ) {
    n += 1;
    const slug = `${String(n).padStart(2, "0")}-${flow.toLowerCase().replace(/[^a-z0-9]+/g, "-").slice(0, 40)}`;
    currentLabel = slug;
    const consoleBefore = consoleErrors.length;
    const netBefore = netFailures.length;
    let state: StepState = "ok";
    let note: string | undefined;
    try {
      await fn();
      await page.waitForTimeout(600);
    } catch (e) {
      state = "broken";
      note = (e as Error).message?.slice(0, 300);
    }
    const shot = path.join(SCREENS, `${slug}.png`);
    try {
      await page.screenshot({ path: shot, fullPage: true });
    } catch {
      try { await page.screenshot({ path: shot }); } catch { /* give up */ }
    }
    let text = "";
    try {
      text = await page.evaluate(() => document.body?.innerText ?? "");
    } catch { /* ignore */ }
    const dumpFile = path.join(DUMPS, `${slug}.txt`);
    fs.writeFileSync(dumpFile, text.slice(0, 8000), "utf8");
    const consoleNew = consoleErrors.length - consoleBefore;
    if (state === "ok" && consoleNew > 0) state = "warn";
    steps.push({
      n, flow, route, action,
      url: page.url(),
      screenshot: path.relative(RUN_DIR, shot).replace(/\\/g, "/"),
      dump: path.relative(RUN_DIR, dumpFile).replace(/\\/g, "/"),
      consoleNew, netNew: netFailures.length - netBefore, state, note,
    });
    console.log(`[STEP ${n}] ${flow} — ${state}${note ? " — " + note : ""}`);
  }

  // ===== MANAGER PASS =====
  await step("Login as manager", "/login", "loginAsRole(manager)", async () => {
    await loginAsRole(page, "manager");
  });

  await step("CrmHome", "/crm", "navigate /crm; observe needs-funding + active subs lists", async () => {
    await page.goto("/crm", { waitUntil: "networkidle" });
    await waitForAppReady(page);
    await waitForDataLoad(page);
  });

  await step("CrmHome mobile", "/crm", "390px viewport nav check", async () => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/crm", { waitUntil: "networkidle" });
    await waitForAppReady(page);
    await waitForDataLoad(page);
  });
  await page.setViewportSize({ width: 1440, height: 900 });

  await step("CustomerDashboard hub", `/crm/customers/${CUSTOMER_ID}`, "open customer hub; credit gauge, subs, unpaid invoices, contact links", async () => {
    await page.goto(`/crm/customers/${CUSTOMER_ID}`, { waitUntil: "networkidle" });
    await waitForAppReady(page);
    await waitForDataLoad(page);
  });

  await step("Hub — Settings dialog", `/crm/customers/${CUSTOMER_ID}`, "open CRM-fields edit dialog (round-trip check)", async () => {
    const btn = page.getByRole("button", { name: /settings|edit/i }).first();
    if (await btn.count()) {
      await btn.click();
      await page.waitForTimeout(1200);
    } else {
      throw new Error("No Settings/Edit button found on hub");
    }
  });
  // close dialog if open
  await page.keyboard.press("Escape").catch(() => {});
  await page.waitForTimeout(400);

  await step("Hub — Draft WhatsApp", `/crm/customers/${CUSTOMER_ID}`, "click Draft WhatsApp reminder; capture wa.me intent + logged activity", async () => {
    const btn = page.getByRole("button", { name: /whatsapp|draft.*reminder|remind/i }).first();
    if (await btn.count()) {
      // capture any popup the click may open without leaving the page
      const popupP = page.waitForEvent("popup", { timeout: 3000 }).catch(() => null);
      await btn.click().catch(() => {});
      const popup = await popupP;
      if (popup) {
        steps.push({
          n: n, flow: "Draft WhatsApp popup URL", route: "(popup)", action: "captured popup url",
          url: popup.url(), screenshot: "", dump: "", consoleNew: 0, netNew: 0, state: "ok",
          note: `wa.me URL: ${popup.url().slice(0, 200)}`,
        });
        await popup.close().catch(() => {});
      }
      await page.waitForTimeout(800);
    } else {
      throw new Error("No Draft WhatsApp button found");
    }
  });

  await step("Hub — drawdown chart + selector", `/crm/customers/${CUSTOMER_ID}`, "switch subscription selector; verify per-sub (no roll-up)", async () => {
    // try to find a subscription selector and switch it
    const selector = page.getByRole("combobox").first();
    if (await selector.count()) {
      await selector.click().catch(() => {});
      await page.waitForTimeout(500);
      const opt = page.locator('[role="option"]').nth(1);
      if (await opt.count()) await opt.click().catch(() => {});
      await page.waitForTimeout(1000);
    }
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await page.waitForTimeout(800);
  });

  await step("Activity timeline", `/crm/customers/${CUSTOMER_ID}/activity`, "navigate timeline; default 14d", async () => {
    await page.goto(`/crm/customers/${CUSTOMER_ID}/activity`, { waitUntil: "networkidle" });
    await waitForAppReady(page);
    await waitForDataLoad(page);
  });

  await step("Activity — category filter", `/crm/customers/${CUSTOMER_ID}/activity`, "toggle a type filter", async () => {
    const filter = page.getByRole("combobox").first();
    if (await filter.count()) {
      await filter.click().catch(() => {});
      await page.waitForTimeout(400);
      const opt = page.locator('[role="option"]').nth(1);
      if (await opt.count()) await opt.click().catch(() => {});
      await page.waitForTimeout(800);
    } else {
      const tab = page.getByRole("button", { name: /payment|order|invoice|funding/i }).first();
      if (await tab.count()) await tab.click().catch(() => {});
      await page.waitForTimeout(600);
    }
  });

  await step("Activity — load older", `/crm/customers/${CUSTOMER_ID}/activity`, "click Load older to widen window", async () => {
    const btn = page.getByRole("button", { name: /load older|older|more/i }).first();
    if (await btn.count()) {
      await btn.click();
      await page.waitForTimeout(1200);
    } else {
      throw new Error("No 'Load older' control found");
    }
  });

  await step("Agreements", `/crm/customers/${CUSTOMER_ID}/agreements`, "agreement page; ID+EN versions; link-to-subscription", async () => {
    await page.goto(`/crm/customers/${CUSTOMER_ID}/agreements`, { waitUntil: "networkidle" });
    await waitForAppReady(page);
    await waitForDataLoad(page);
  });

  await step("Subscription page", `/crm/customers/${CUSTOMER_ID}/subscriptions/${SUB1}`, "read-only sub page; week back-refs; credit-ledger statement", async () => {
    await page.goto(`/crm/customers/${CUSTOMER_ID}/subscriptions/${SUB1}`, { waitUntil: "networkidle" });
    await waitForAppReady(page);
    await waitForDataLoad(page);
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await page.waitForTimeout(600);
  });

  await step("Subscription page (sub2)", `/crm/customers/${CUSTOMER_ID}/subscriptions/${SUB2}`, "second sub (proves selector distinctness)", async () => {
    await page.goto(`/crm/customers/${CUSTOMER_ID}/subscriptions/${SUB2}`, { waitUntil: "networkidle" });
    await waitForAppReady(page);
    await waitForDataLoad(page);
  });

  await step("Funding dashboard", "/crm/funding", "needs-invoice vs awaiting-payment rows; status palette", async () => {
    await page.goto("/crm/funding", { waitUntil: "networkidle" });
    await waitForAppReady(page);
    await waitForDataLoad(page);
  });

  await step("Not-found customer", `/crm/customers/${BAD_ID}`, "bad :id → friendly empty state, not a crash", async () => {
    await page.goto(`/crm/customers/${BAD_ID}`, { waitUntil: "networkidle" });
    await waitForAppReady(page);
    await page.waitForTimeout(1500);
  });

  // ===== ORDER SURFACE — customer link (Pitfall #20: both surfaces) =====
  await step("Orders board", "/orders", "kanban board with seeded orders", async () => {
    await page.goto("/orders", { waitUntil: "networkidle" });
    await waitForAppReady(page);
    await waitForDataLoad(page);
  });

  await step("Order slide-over", "/orders", "open an order card → slide-over; customer name links to /crm", async () => {
    const card = page.locator('[class*="cursor-pointer"]').filter({ hasText: /UAT Cafe|0\d{3}-\d{3}|order/i }).first();
    if (await card.count()) {
      await card.click().catch(() => {});
    } else {
      // fallback: click first kanban card-ish element
      const any = page.locator("article, [data-order-id], .rounded-lg").filter({ hasText: /UAT Cafe/i }).first();
      if (await any.count()) await any.click().catch(() => {});
    }
    await page.waitForTimeout(1500);
  });

  await step("Order full page", "/orders/:id", "OrderDetail full page; customer link parity", async () => {
    // try to find a CRM link in current DOM (slide-over), else open first order detail
    const link = page.locator(`a[href*="/crm/customers/"]`).first();
    if (await link.count()) {
      const href = await link.getAttribute("href");
      steps.push({
        n, flow: "Order→CRM link href", route: "(slide-over)", action: "read href",
        url: href ?? "", screenshot: "", dump: "", consoleNew: 0, netNew: 0, state: "ok",
        note: `customer link href: ${href}`,
      });
    }
    // navigate to an order detail page via the orders list
    const firstOrderLink = page.locator('a[href*="/orders/"]').first();
    if (await firstOrderLink.count()) {
      await firstOrderLink.click().catch(() => {});
      await page.waitForTimeout(1500);
    }
  });

  // ===== ADMIN PASS =====
  await step("Login as admin", "/login", "logout + loginAsRole(admin)", async () => {
    await logout(page);
    await loginAsRole(page, "admin");
  });

  await step("Admin — hub", `/crm/customers/${CUSTOMER_ID}`, "admin-only affordances on the hub", async () => {
    await page.goto(`/crm/customers/${CUSTOMER_ID}`, { waitUntil: "networkidle" });
    await waitForAppReady(page);
    await waitForDataLoad(page);
  });

  // ===== NEGATIVE: order_staff blocked from /crm =====
  await step("Login as order_staff", "/login", "logout + loginAsRole(order_staff)", async () => {
    await logout(page);
    await loginAsRole(page, "order_staff");
  });

  await step("order_staff blocked /crm", "/crm", "expect route guard blocks (redirect or denial), not a crash", async () => {
    await page.goto("/crm", { waitUntil: "networkidle" });
    await waitForAppReady(page);
    await page.waitForTimeout(1200);
  });

  await step("order_staff customer link", `/crm/customers/${CUSTOMER_ID}`, "deep link blocked for staff (dead link, not crash)", async () => {
    await page.goto(`/crm/customers/${CUSTOMER_ID}`, { waitUntil: "networkidle" });
    await waitForAppReady(page);
    await page.waitForTimeout(1200);
  });

  // ---- write evidence pack ----
  fs.writeFileSync(path.join(RUN_DIR, "console-errors.log"), consoleErrors.join("\n") || "(none captured)", "utf8");
  fs.writeFileSync(path.join(RUN_DIR, "network-failures.log"), netFailures.join("\n") || "(none captured)", "utf8");
  fs.writeFileSync(path.join(RUN_DIR, "steps.json"), JSON.stringify(steps, null, 2), "utf8");

  console.log(`\n=== EVIDENCE PACK WRITTEN: ${RUN_DIR} ===`);
  console.log(`steps: ${steps.length}, console errs: ${consoleErrors.length}, net failures: ${netFailures.length}`);
  expect(steps.length).toBeGreaterThan(10);
});
