import { type Page } from "@playwright/test";

// Test PIN set by global-setup.ts via Convex resetPin mutation
const TEST_PIN = "999999";

/**
 * Login as a manager/admin user via the PIN-based avatar grid flow.
 *
 * Prerequisites: global-setup.ts has already:
 * - Unlocked the target user (cleared failed attempts)
 * - Reset their PIN to TEST_PIN ("999999")
 */
export async function loginAsManager(page: Page) {
  await page.goto("/login", { waitUntil: "networkidle" });

  // Wait for avatar grid to load (Convex query)
  await page.waitForSelector("button:has(.rounded-full)", { timeout: 15_000 });

  // Screenshot: Login page loaded
  await page.screenshot({
    path: "tests/e2e/screenshots/01-login-page.png",
    fullPage: true,
  });

  // Find a manager or admin user button
  const managerButton = page
    .locator("button")
    .filter({ hasText: /Manager/i })
    .first();
  const adminButton = page
    .locator("button")
    .filter({ hasText: /Admin/i })
    .first();

  const targetUser =
    (await managerButton.count()) > 0 ? managerButton : adminButton;

  if ((await targetUser.count()) === 0) {
    await page.screenshot({
      path: "tests/e2e/screenshots/01-login-no-admin-user.png",
      fullPage: true,
    });
    throw new Error(
      "No Admin or Manager user found in the avatar grid."
    );
  }

  await targetUser.click();

  // Wait for PIN pad to appear
  await page.waitForSelector("button:has-text('Sign In')", { timeout: 5_000 });

  await page.screenshot({
    path: "tests/e2e/screenshots/02-pin-entry.png",
    fullPage: true,
  });

  // Enter the test PIN (set by global-setup.ts)
  const pinDigits = TEST_PIN.split("");
  for (const digit of pinDigits) {
    await page
      .locator(".grid.grid-cols-3 button")
      .filter({ hasText: new RegExp(`^${digit}$`) })
      .click();
  }

  // Click Sign In
  await page.locator("button:has-text('Sign In')").click();

  // Wait for navigation away from login (redirect to dashboard)
  await page.waitForURL((url) => !url.pathname.includes("/login"), {
    timeout: 15_000,
  });

  // Wait for React app to render meaningful content
  // The layout should have rendered the header nav
  await waitForAppReady(page);
}

/**
 * Wait for the React app to be fully rendered (not just a white page).
 * Looks for DOM elements that indicate the app has hydrated and Convex has connected.
 */
async function waitForAppReady(page: Page) {
  // Wait for body to have meaningful content (at least some text or elements)
  await page.waitForFunction(
    () => {
      const body = document.body;
      if (!body) return false;
      // Check that there's meaningful DOM content (not just empty divs)
      return body.innerText.length > 10 || body.querySelectorAll("*").length > 20;
    },
    { timeout: 15_000 }
  );
  // Extra settle time for Convex reactive queries
  await page.waitForTimeout(3000);
}

/**
 * Navigate to a page and wait for it to stabilize.
 */
export async function navigateTo(page: Page, path: string) {
  await page.goto(path, { waitUntil: "networkidle" });
  await waitForAppReady(page);
}

/**
 * Wait for skeletons to disappear (data loaded).
 */
export async function waitForDataLoad(page: Page, timeout = 15_000) {
  try {
    await page.waitForFunction(
      () => document.querySelectorAll('[class*="animate-pulse"]').length === 0,
      { timeout }
    );
  } catch {
    // Skeletons may persist if no data — that's OK
  }
  await page.waitForTimeout(1000);
}

/**
 * Take a full-page screenshot with consistent naming.
 */
export async function screenshot(page: Page, name: string) {
  await page.screenshot({
    path: `tests/e2e/screenshots/${name}.png`,
    fullPage: true,
  });
}

/**
 * Scroll to an element and take a viewport screenshot focused on it.
 */
export async function screenshotElement(
  page: Page,
  selector: string,
  name: string
) {
  const element = page.locator(selector).first();
  if ((await element.count()) > 0) {
    await element.scrollIntoViewIfNeeded();
    await page.waitForTimeout(300);
    await element.screenshot({
      path: `tests/e2e/screenshots/${name}.png`,
    });
  }
}
