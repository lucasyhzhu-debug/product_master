import { test, expect } from "@playwright/test";
import {
  loginAsRole,
  logout,
  screenshot,
  type TestRole,
} from "./helpers";

// ---------------------------------------------------------------------------
// Route definitions for the 9 expense pages
// ---------------------------------------------------------------------------

/** Routes accessible by ALL authenticated roles (canSubmitExpenses) */
const SUBMIT_ROUTES = ["/expenses", "/expenses/new"] as const;

/** Routes requiring canApproveExpenses (manager, admin) */
const APPROVE_ROUTES = ["/expenses/approve"] as const;

/** Routes requiring canAccessExpenseAnalytics (manager, admin) */
const ANALYTICS_ROUTES = ["/expense-analytics"] as const;

/** Routes requiring canManageReimbursements (admin only) */
const ADMIN_ONLY_ROUTES = [
  "/reimbursements",
  "/bank-accounts",
  "/payroll",
  "/accounts",
  "/import",
] as const;

/** All 9 expense routes */
const ALL_ROUTES = [
  ...SUBMIT_ROUTES,
  ...APPROVE_ROUTES,
  ...ANALYTICS_ROUTES,
  ...ADMIN_ONLY_ROUTES,
] as const;

/** Redirect targets per role when blocked (from getRoleLandingPage) */
const BLOCKED_REDIRECT: Record<Exclude<TestRole, "admin">, string> = {
  kitchen: "/kitchen",
  order_staff: "/orders",
  manager: "/", // NOTE: root "/", NOT "/home"
};

// Slug-ify route for screenshot naming (e.g., "/expenses/new" -> "expenses-new")
function routeSlug(route: string): string {
  return route.replace(/^\//, "").replace(/\//g, "-") || "root";
}

// ---------------------------------------------------------------------------
// Admin role: full access to all 9 routes
// ---------------------------------------------------------------------------

test.describe("Admin role - full access", () => {
  test.beforeEach(async ({ page }) => {
    await loginAsRole(page, "admin");
  });

  test.afterEach(async ({ page }) => {
    await logout(page);
  });

  for (const route of ALL_ROUTES) {
    test(`can access ${route}`, async ({ page }) => {
      await page.goto(route, { waitUntil: "networkidle" });

      // Should stay on the route (no redirect away)
      await page.waitForURL(
        (url) => url.pathname.includes(route.replace(/\/$/, "")),
        { timeout: 10_000 }
      );

      // Page should have meaningful content (not blank/error)
      const bodyText = await page.locator("body").innerText();
      expect(bodyText.length).toBeGreaterThan(10);

      await screenshot(page, `expense-access-admin-${routeSlug(route)}`);
    });
  }
});

// ---------------------------------------------------------------------------
// Manager role: partial access (submit + approve + analytics, blocked from admin-only)
// ---------------------------------------------------------------------------

test.describe("Manager role - partial access", () => {
  test.beforeEach(async ({ page }) => {
    await loginAsRole(page, "manager");
  });

  test.afterEach(async ({ page }) => {
    await logout(page);
  });

  // Manager CAN access: /expenses, /expenses/new, /expenses/approve, /expense-analytics
  const managerAllowed = [...SUBMIT_ROUTES, ...APPROVE_ROUTES, ...ANALYTICS_ROUTES];

  for (const route of managerAllowed) {
    test(`can access ${route}`, async ({ page }) => {
      await page.goto(route, { waitUntil: "networkidle" });

      await page.waitForURL(
        (url) => url.pathname.includes(route.replace(/\/$/, "")),
        { timeout: 10_000 }
      );

      const bodyText = await page.locator("body").innerText();
      expect(bodyText.length).toBeGreaterThan(10);

      await screenshot(page, `expense-access-manager-${routeSlug(route)}`);
    });
  }

  // Manager is BLOCKED from admin-only routes -> redirects to "/"
  for (const route of ADMIN_ONLY_ROUTES) {
    test(`blocked from ${route} -> redirects to /`, async ({ page }) => {
      await page.goto(route, { waitUntil: "networkidle" });

      await page.waitForURL(
        (url) => url.pathname === "/",
        { timeout: 10_000 }
      );

      await screenshot(page, `expense-access-manager-blocked-${routeSlug(route)}`);
    });
  }
});

// ---------------------------------------------------------------------------
// Order staff role: submit only, blocked from approve + analytics + admin
// ---------------------------------------------------------------------------

test.describe("Order staff role - submit only", () => {
  test.beforeEach(async ({ page }) => {
    await loginAsRole(page, "order_staff");
  });

  test.afterEach(async ({ page }) => {
    await logout(page);
  });

  // Order staff CAN access: /expenses, /expenses/new
  for (const route of SUBMIT_ROUTES) {
    test(`can access ${route}`, async ({ page }) => {
      await page.goto(route, { waitUntil: "networkidle" });

      await page.waitForURL(
        (url) => url.pathname.includes(route.replace(/\/$/, "")),
        { timeout: 10_000 }
      );

      const bodyText = await page.locator("body").innerText();
      expect(bodyText.length).toBeGreaterThan(10);

      await screenshot(page, `expense-access-orderstaff-${routeSlug(route)}`);
    });
  }

  // Order staff is BLOCKED from approve + analytics + admin routes -> redirects to "/orders"
  const orderStaffBlocked = [...APPROVE_ROUTES, ...ANALYTICS_ROUTES, ...ADMIN_ONLY_ROUTES];

  for (const route of orderStaffBlocked) {
    test(`blocked from ${route} -> redirects to /orders`, async ({ page }) => {
      await page.goto(route, { waitUntil: "networkidle" });

      await page.waitForURL(
        (url) => url.pathname === "/orders",
        { timeout: 10_000 }
      );

      await screenshot(
        page,
        `expense-access-orderstaff-blocked-${routeSlug(route)}`
      );
    });
  }
});

// ---------------------------------------------------------------------------
// Kitchen role: submit only, blocked from approve + analytics + admin
// ---------------------------------------------------------------------------

test.describe("Kitchen role - submit only", () => {
  test.beforeEach(async ({ page }) => {
    await loginAsRole(page, "kitchen");
  });

  test.afterEach(async ({ page }) => {
    await logout(page);
  });

  // Kitchen CAN access: /expenses, /expenses/new
  for (const route of SUBMIT_ROUTES) {
    test(`can access ${route}`, async ({ page }) => {
      await page.goto(route, { waitUntil: "networkidle" });

      await page.waitForURL(
        (url) => url.pathname.includes(route.replace(/\/$/, "")),
        { timeout: 10_000 }
      );

      const bodyText = await page.locator("body").innerText();
      expect(bodyText.length).toBeGreaterThan(10);

      await screenshot(page, `expense-access-kitchen-${routeSlug(route)}`);
    });
  }

  // Kitchen is BLOCKED from approve + analytics + admin routes -> redirects to "/kitchen"
  const kitchenBlocked = [...APPROVE_ROUTES, ...ANALYTICS_ROUTES, ...ADMIN_ONLY_ROUTES];

  for (const route of kitchenBlocked) {
    test(`blocked from ${route} -> redirects to /kitchen`, async ({ page }) => {
      await page.goto(route, { waitUntil: "networkidle" });

      await page.waitForURL(
        (url) => url.pathname === "/kitchen",
        { timeout: 10_000 }
      );

      await screenshot(
        page,
        `expense-access-kitchen-blocked-${routeSlug(route)}`
      );
    });
  }
});
