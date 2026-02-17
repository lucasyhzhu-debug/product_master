import { test, expect } from "@playwright/test";

test("Debug: login then check dashboard rendering", async ({ page }) => {
  // Capture ALL console messages from the start
  const consoleMessages: string[] = [];
  page.on("console", (msg) => {
    consoleMessages.push(`[${msg.type()}] ${msg.text()}`);
  });

  const pageErrors: string[] = [];
  page.on("pageerror", (err) => {
    pageErrors.push(err.message);
  });

  // Step 1: Login
  await page.goto("/login", { waitUntil: "networkidle" });
  await page.waitForSelector("button:has(.rounded-full)", { timeout: 15_000 });

  const managerButton = page.locator("button").filter({ hasText: /Manager/i }).first();
  await managerButton.click();
  await page.waitForSelector("button:has-text('Sign In')", { timeout: 5_000 });

  for (const digit of "999999".split("")) {
    await page
      .locator(".grid.grid-cols-3 button")
      .filter({ hasText: new RegExp(`^${digit}$`) })
      .click();
  }
  await page.locator("button:has-text('Sign In')").click();

  // Wait for redirect
  await page.waitForURL((url) => !url.pathname.includes("/login"), {
    timeout: 15_000,
  });

  console.log("=== POST-LOGIN ===");
  console.log("URL:", page.url());

  // Check root immediately
  const rootHtml1 = await page.evaluate(() => {
    const root = document.getElementById("root");
    return root ? root.innerHTML.substring(0, 500) : "NO ROOT";
  });
  console.log("Root (immediate):", rootHtml1 || "(empty)");

  // Wait and check again
  await page.waitForTimeout(2000);
  const rootHtml2 = await page.evaluate(() => {
    const root = document.getElementById("root");
    return root ? root.innerHTML.substring(0, 500) : "NO ROOT";
  });
  console.log("Root (2s):", rootHtml2 || "(empty)");

  await page.waitForTimeout(5000);
  const rootHtml3 = await page.evaluate(() => {
    const root = document.getElementById("root");
    return root ? root.innerHTML.substring(0, 500) : "NO ROOT";
  });
  console.log("Root (7s):", rootHtml3 || "(empty)");

  // Dump errors
  console.log("=== ERRORS ===");
  console.log("Page errors:", JSON.stringify(pageErrors, null, 2));
  console.log(
    "Console errors/warnings:",
    JSON.stringify(
      consoleMessages.filter((m) => m.startsWith("[error]") || m.startsWith("[warning")),
      null,
      2
    )
  );
  console.log(
    "All console (last 30):",
    JSON.stringify(consoleMessages.slice(-30), null, 2)
  );

  // Check window.__REACT_ERROR
  const reactErrors = await page.evaluate(() => {
    // @ts-ignore
    return window.__REACT_DEVTOOLS_GLOBAL_HOOK__?.checkDCE ? "DCE check present" : "no devtools hook";
  });
  console.log("React devtools:", reactErrors);

  await page.screenshot({ path: "tests/e2e/screenshots/debug-post-login.png" });

  expect(true).toBe(true);
});
