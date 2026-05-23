#!/usr/bin/env npx tsx
/**
 * K3Mart Token Refresh via Playwright
 *
 * Fallback script that automates browser-based login to K3Mart and captures
 * the JWT token. Used when the HTTP-based Convex action fails (e.g., CSRF,
 * IP blocking, complex auth flow).
 *
 * Usage:
 *   npm run refresh-k3mart-token
 *   HEADED=1 npm run refresh-k3mart-token   # Debug mode with visible browser
 *
 * Environment variables:
 *   K3MART_EMAIL       - K3Mart login email
 *   K3MART_PASSWORD    - K3Mart login password
 *   HEADED             - Set to "1" for visible browser (debug mode)
 *   CONVEX_DEPLOY_KEY  - For updating Convex env var (optional)
 */

import { chromium, type Page, type BrowserContext } from "playwright";
import { execSync } from "child_process";
import * as path from "path";
import * as fs from "fs";
import { fileURLToPath } from "url";

// ESM shim — `package.json` is `"type": "module"`, so `__dirname` is undefined.
const __dirname = path.dirname(fileURLToPath(import.meta.url));

const K3MART_URL = "https://umkm.k3mart.id";
const SCREENSHOT_DIR = path.join(__dirname, "debug-screenshots");

async function ensureScreenshotDir() {
  if (!fs.existsSync(SCREENSHOT_DIR)) {
    fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });
  }
}

async function takeScreenshot(page: Page, name: string) {
  await ensureScreenshotDir();
  const filepath = path.join(SCREENSHOT_DIR, `${name}.png`);
  await page.screenshot({ path: filepath, fullPage: true });
  console.log(`  Screenshot saved: ${filepath}`);
}

async function main() {
  const email = process.env.K3MART_EMAIL;
  const password = process.env.K3MART_PASSWORD;

  if (!email || !password) {
    console.error("ERROR: K3MART_EMAIL and K3MART_PASSWORD environment variables are required.");
    process.exit(1);
  }

  const headed = process.env.HEADED === "1";
  console.log(`Mode: ${headed ? "HEADED (visible browser)" : "headless"}`);
  console.log(`Login email: ${email}`);

  const browser = await chromium.launch({ headless: !headed });
  const context: BrowserContext = await browser.newContext();
  const page = await context.newPage();

  let capturedToken: string | null = null;

  // Intercept network requests to capture JWT
  page.on("request", (request) => {
    const authHeader = request.headers()["authorization"];
    if (authHeader && authHeader.startsWith("JWT ")) {
      const token = authHeader.slice(4);
      if (token.length > 50 && !capturedToken) {
        capturedToken = token;
        console.log(`\n  TOKEN CAPTURED! (length: ${token.length})`);
      }
    }
  });

  try {
    // Navigate to login page
    console.log("\n1. Navigating to K3Mart...");
    await page.goto(K3MART_URL, { waitUntil: "networkidle" });
    await takeScreenshot(page, "01-login-page");

    // Fill login form
    console.log("2. Filling login form...");

    // Try common email input selectors
    const emailInput = page.locator(
      'input[type="email"], input[name="email"], input[placeholder*="email" i], input[placeholder*="Email" i]'
    ).first();
    await emailInput.fill(email);

    const passwordInput = page.locator(
      'input[type="password"], input[name="password"]'
    ).first();
    await passwordInput.fill(password);

    await takeScreenshot(page, "02-form-filled");

    // Click login button
    console.log("3. Clicking login button...");
    const loginButton = page.locator(
      'button[type="submit"], button:has-text("Login"), button:has-text("Masuk"), button:has-text("Sign In")'
    ).first();
    await loginButton.click();

    // Wait for navigation/dashboard
    console.log("4. Waiting for dashboard...");
    await page.waitForURL("**/dashboard**", { timeout: 15000 }).catch(() => {
      // URL might not change; wait for network instead
    });
    await page.waitForLoadState("networkidle");
    await takeScreenshot(page, "03-after-login");

    // If token not captured from requests, try to find it in localStorage/cookies
    if (!capturedToken) {
      console.log("5. Token not captured from requests, checking storage...");

      const localStorage = await page.evaluate(() => {
        const entries: Record<string, string> = {};
        for (let i = 0; i < window.localStorage.length; i++) {
          const key = window.localStorage.key(i);
          if (key) entries[key] = window.localStorage.getItem(key) ?? "";
        }
        return entries;
      });

      // Look for JWT-like values in localStorage
      for (const [key, value] of Object.entries(localStorage)) {
        if (value && value.length > 50 && value.split(".").length === 3) {
          capturedToken = value;
          console.log(`  Token found in localStorage['${key}'] (length: ${value.length})`);
          break;
        }
      }

      // Check cookies
      if (!capturedToken) {
        const cookies = await context.cookies();
        for (const cookie of cookies) {
          if (cookie.value.length > 50 && cookie.value.split(".").length === 3) {
            capturedToken = cookie.value;
            console.log(`  Token found in cookie '${cookie.name}' (length: ${cookie.value.length})`);
            break;
          }
        }
      }

      // Last resort: trigger an API call to capture from network
      if (!capturedToken) {
        console.log("  Triggering API call to capture token...");
        await page.evaluate(() => {
          // Navigate to a page that triggers API calls
          window.location.href = "/dashboard";
        });
        await page.waitForLoadState("networkidle");
        await new Promise((r) => setTimeout(r, 3000));
      }
    }

    if (!capturedToken) {
      await takeScreenshot(page, "04-no-token-found");
      console.error("\nERROR: Could not capture JWT token.");
      process.exit(1);
    }

    console.log(`\nSUCCESS: Token captured (${capturedToken.length} chars)`);
    console.log(`Token preview: ${capturedToken.substring(0, 50)}...`);

    // Update Convex env var if deploy key is available
    if (process.env.CONVEX_DEPLOY_KEY) {
      console.log("\n6. Updating Convex environment variable...");
      try {
        execSync(
          `npx convex env set K3MART_API_TOKEN -- "${capturedToken}"`,
          {
            stdio: "pipe",
            env: {
              ...process.env,
              CONVEX_DEPLOY_KEY: process.env.CONVEX_DEPLOY_KEY,
            },
          }
        );
        console.log("  Convex K3MART_API_TOKEN updated.");
      } catch (err) {
        console.error("  Failed to update Convex env var:", err);
      }
    } else {
      console.log("\nNote: CONVEX_DEPLOY_KEY not set, skipping Convex env update.");
      console.log("Token value (copy manually if needed):");
      console.log(capturedToken);
    }

    process.exit(0);
  } catch (error) {
    await takeScreenshot(page, "error-state");
    console.error("\nERROR:", error);
    process.exit(1);
  } finally {
    await browser.close();
  }
}

main();
