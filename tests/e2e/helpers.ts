import { type Page } from "@playwright/test";

// Test PIN set by global-setup.ts via Convex resetPin mutation
const TEST_PIN = "999999";

// ---------------------------------------------------------------------------
// Role-based login helpers
// ---------------------------------------------------------------------------

/**
 * Test roles matching the 4 E2E users created by global-setup.ts.
 */
export type TestRole = "admin" | "manager" | "kitchen" | "order_staff";

/**
 * Maps each test role to its E2E user name in the avatar grid.
 */
const ROLE_USER_NAMES: Record<TestRole, string> = {
  admin: "E2E-Admin",
  manager: "E2E-Manager",
  kitchen: "E2E-Kitchen",
  order_staff: "E2E-OrderStaff",
};

/**
 * Login as a specific role via the avatar grid + PIN pad flow.
 *
 * Prerequisites: global-setup.ts has already created/reset the E2E-{Role} user
 * with PIN 999999.
 */
export async function loginAsRole(page: Page, role: TestRole) {
  const targetName = ROLE_USER_NAMES[role];

  await page.goto("/login", { waitUntil: "networkidle" });

  // Wait for avatar grid to load (Convex query)
  await page.waitForSelector("button:has(.rounded-full)", { timeout: 15_000 });

  // Find the button matching our target user name
  const userButton = page
    .locator("button")
    .filter({ hasText: targetName })
    .first();

  if ((await userButton.count()) === 0) {
    throw new Error(
      `E2E user "${targetName}" not found in avatar grid. ` +
        `Ensure global-setup.ts has run and created the user.`
    );
  }

  await userButton.click();

  // Wait for PIN pad to appear
  await page.waitForSelector("button:has-text('Sign In')", { timeout: 5_000 });

  // Enter PIN digit by digit
  const pinDigits = TEST_PIN.split("");
  for (const digit of pinDigits) {
    await page
      .locator(".grid.grid-cols-3 button")
      .filter({ hasText: new RegExp(`^${digit}$`) })
      .click();
  }

  // Click Sign In
  await page.locator("button:has-text('Sign In')").click();

  // Wait for navigation away from login
  await page.waitForURL((url) => !url.pathname.includes("/login"), {
    timeout: 15_000,
  });

  // Wait for app to be ready
  await waitForAppReady(page);
}

/**
 * Logout by clearing storage and navigating to login.
 * Enables role switching mid-test (logout -> loginAsRole with different role).
 */
export async function logout(page: Page) {
  try {
    // Clear all client-side auth state
    await page.evaluate(() => {
      localStorage.clear();
      sessionStorage.clear();
    });
  } catch {
    // SecurityError can occur if page navigated to error/about:blank
    // Safe to ignore -- next goto will start fresh
  }

  // Navigate to login page
  await page.goto("/login", { waitUntil: "networkidle" });

  // Confirm we're on the login page by waiting for the avatar grid
  await page.waitForSelector("button:has(.rounded-full)", { timeout: 10_000 });
}

// ---------------------------------------------------------------------------
// Backward-compat login (existing 12 spec files)
// ---------------------------------------------------------------------------

/**
 * Login as a manager/admin user via the PIN-based avatar grid flow.
 *
 * @deprecated Use loginAsRole(page, 'manager') for new tests.
 * Kept for backward compatibility with existing 12 spec files.
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

// ---------------------------------------------------------------------------
// Expense form helper
// ---------------------------------------------------------------------------

/**
 * Fill the expense submission form fields.
 * Call after navigating to /expenses/new or opening the expense edit form.
 */
export async function fillExpenseForm(page: Page, data: {
  description: string;
  amount: string;
  vendorName: string;
  glCategory?: string; // text to match in select, e.g., "Office & Supplies"
  paymentMethod?: string; // "employee_paid", "company_paid", or "payment_request"
}) {
  await page.locator("#description").fill(data.description);
  await page.locator("#amount").fill(data.amount);
  await page.locator("#vendorName").fill(data.vendorName);

  if (data.glCategory) {
    await page.locator("#accountId").click();
    await page.locator('[role="option"]').filter({ hasText: data.glCategory }).click();
  }

  if (data.paymentMethod) {
    await page.locator("#paymentMethod").click();
    // Use first() to avoid strict mode violation when multiple options partially match
    // (e.g., "personal" matches "Personal Cash" and "Personal Transfer")
    await page.locator('[role="option"]').filter({ hasText: new RegExp(data.paymentMethod, "i") }).first().click();
  }
}

// ---------------------------------------------------------------------------
// General helpers
// ---------------------------------------------------------------------------

/**
 * Wait for the React app to be fully rendered (not just a white page).
 * Looks for DOM elements that indicate the app has hydrated and Convex has connected.
 */
export async function waitForAppReady(page: Page) {
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
