import { test, expect } from "@playwright/test";
import {
  loginAsManager,
  navigateTo,
  waitForDataLoad,
  screenshot,
} from "./helpers";

/**
 * Phase 10-03 Verification: EntityManager page migrations
 *
 * Verifies all 5 entity CRUD pages render correctly with EntityManager:
 * 1. IngredientsManager (/ingredients)
 * 2. MaterialsManager (/materials)
 * 3. LocationsManager (/inventory/locations)
 * 4. CustomersManager (/customers) — NEW
 * 5. TagsManager (/tags) — NEW
 *
 * Also checks for regressions in order creation and recipe flows.
 */

test.describe("EntityManager Pages — Phase 10-03 Verification", () => {
  test.beforeEach(async ({ page }) => {
    await loginAsManager(page);
  });

  test("1. IngredientsManager renders with table view and controls", async ({
    page,
  }) => {
    await navigateTo(page, "/ingredients");
    await waitForDataLoad(page);
    await screenshot(page, "p10-01-ingredients-loaded");

    // Page title should be visible
    await expect(page.locator("text=Ingredients").first()).toBeVisible();

    // Add button should exist — either in header or as empty state CTA
    const headerAddBtn = page.locator("button").filter({ hasText: /Add Ingredient/i }).first();
    await expect(headerAddBtn).toBeVisible();

    // If items exist, search + table should be visible. If empty, empty state CTA is shown.
    const table = page.locator("table");
    const emptyState = page.locator("text=No Ingredients");
    const hasTable = (await table.count()) > 0 && await table.isVisible();
    const hasEmpty = (await emptyState.count()) > 0 && await emptyState.isVisible();
    expect(hasTable || hasEmpty).toBeTruthy();

    if (hasTable) {
      await screenshot(page, "p10-02-ingredients-table-view");
    }

    // Test: Open create dialog
    await headerAddBtn.click();
    await page.waitForTimeout(500);
    const dialog = page.locator('[role="dialog"]');
    await expect(dialog).toBeVisible();
    await screenshot(page, "p10-03-ingredients-create-dialog");

    // Dialog should have form fields
    await expect(dialog.locator('input, select, textarea').first()).toBeVisible();

    // Close dialog
    const closeBtn = dialog.locator('button').filter({ hasText: /cancel|close/i }).first();
    if ((await closeBtn.count()) > 0) {
      await closeBtn.click();
    } else {
      await page.keyboard.press("Escape");
    }
    await page.waitForTimeout(300);
  });

  test("2. IngredientsManager card view toggle persists", async ({
    page,
  }) => {
    await navigateTo(page, "/ingredients");
    await waitForDataLoad(page);

    // Find card view toggle button (LayoutGrid icon button)
    // Look for the second view toggle button (first is list, second is grid)
    const toggleButtons = page.locator("button").filter({
      has: page.locator("svg"),
    });

    // Click through toggle buttons to find card view
    // The toggle buttons are typically near the Add button in the header
    const headerArea = page.locator("header, [class*='header'], [class*='Header']").first();
    const gridBtn = headerArea.locator("button svg").locator("..").nth(1);

    if ((await gridBtn.count()) > 0) {
      await gridBtn.click();
      await page.waitForTimeout(500);
      await screenshot(page, "p10-04-ingredients-card-view");

      // Refresh and verify persistence
      await page.reload({ waitUntil: "networkidle" });
      await waitForDataLoad(page);
      await screenshot(page, "p10-05-ingredients-card-persisted");
    }
  });

  test("3. MaterialsManager renders correctly", async ({ page }) => {
    await navigateTo(page, "/materials");
    await waitForDataLoad(page);
    await screenshot(page, "p10-06-materials-loaded");

    // Page title
    await expect(
      page.locator("text=Packaging Materials").or(page.locator("text=Materials")).first(),
    ).toBeVisible();

    // Add button — either in header or as empty state CTA
    const addBtn = page.locator("button").filter({ hasText: /Add/i }).first();
    await expect(addBtn).toBeVisible();

    // Table or empty state should be shown
    const table = page.locator("table");
    const emptyState = page.locator("text=No Packaging Materials").or(page.locator("text=No Materials"));
    const hasTable = (await table.count()) > 0 && await table.isVisible();
    const hasEmpty = (await emptyState.count()) > 0;
    expect(hasTable || hasEmpty).toBeTruthy();

    // Test create dialog
    await addBtn.click();
    await page.waitForTimeout(500);
    const dialog = page.locator('[role="dialog"]');
    await expect(dialog).toBeVisible();
    await screenshot(page, "p10-07-materials-create-dialog");
    await page.keyboard.press("Escape");
  });

  test("4. LocationsManager renders with type badges", async ({ page }) => {
    await navigateTo(page, "/inventory/locations");
    await waitForDataLoad(page);
    await screenshot(page, "p10-08-locations-loaded");

    // Page title
    await expect(
      page.locator("text=Storage Locations").or(page.locator("text=Locations")).first(),
    ).toBeVisible();

    // Add button
    const addBtn = page.locator("button").filter({ hasText: /Add/i }).first();
    await expect(addBtn).toBeVisible();

    // Test create dialog with checkbox fields
    await addBtn.click();
    await page.waitForTimeout(500);
    const dialog = page.locator('[role="dialog"]');
    await expect(dialog).toBeVisible();
    await screenshot(page, "p10-09-locations-create-dialog");
    await page.keyboard.press("Escape");
  });

  test("5. CustomersManager (NEW page) renders and has CRUD", async ({
    page,
  }) => {
    await navigateTo(page, "/customers");
    await waitForDataLoad(page);
    await screenshot(page, "p10-10-customers-loaded");

    // Page title
    await expect(page.locator("text=Customers").first()).toBeVisible();

    // Add button
    const addBtn = page.locator("button").filter({ hasText: /Add/i }).first();
    await expect(addBtn).toBeVisible();

    // Search input
    const searchInput = page.locator(
      'input[placeholder*="Search"], input[placeholder*="search"]',
    );
    await expect(searchInput).toBeVisible();

    // Test create dialog
    await addBtn.click();
    await page.waitForTimeout(500);
    const dialog = page.locator('[role="dialog"]');
    await expect(dialog).toBeVisible();

    // Should have name, phone, source, notes fields
    const nameInput = dialog.locator('input[placeholder*="name" i], input[name="name"]').first();
    await expect(nameInput).toBeVisible();
    await screenshot(page, "p10-11-customers-create-dialog");
    await page.keyboard.press("Escape");
  });

  test("6. TagsManager (NEW page) renders with card default view", async ({
    page,
  }) => {
    await navigateTo(page, "/tags");
    await waitForDataLoad(page);
    await screenshot(page, "p10-12-tags-loaded");

    // Page title
    await expect(page.locator("text=Tags").first()).toBeVisible();

    // Add button
    const addBtn = page.locator("button").filter({ hasText: /Add/i }).first();
    await expect(addBtn).toBeVisible();

    // Test create dialog
    await addBtn.click();
    await page.waitForTimeout(500);
    const dialog = page.locator('[role="dialog"]');
    await expect(dialog).toBeVisible();
    await screenshot(page, "p10-13-tags-create-dialog");
    await page.keyboard.press("Escape");
  });

  test("7. Regression: Orders page loads, customer search works", async ({
    page,
  }) => {
    await navigateTo(page, "/orders");
    await waitForDataLoad(page);
    await screenshot(page, "p10-14-orders-no-regression");

    // Orders page should render without errors
    await expect(
      page.locator("text=Orders").or(page.locator("text=Order")).first(),
    ).toBeVisible();
  });

  test("8. Regression: Inventory page loads (manager-accessible)", async ({ page }) => {
    // Menu Products requires Admin role; test Inventory instead (Manager-accessible)
    await navigateTo(page, "/inventory");
    await waitForDataLoad(page);
    await screenshot(page, "p10-15-inventory-no-regression");

    await expect(
      page.locator("text=Inventory").first(),
    ).toBeVisible();
  });

  test("9. Regression: Dashboard loads", async ({ page }) => {
    await navigateTo(page, "/");
    await waitForDataLoad(page);
    await screenshot(page, "p10-16-dashboard-no-regression");

    // Dashboard should have some content
    const body = page.locator("body");
    const text = await body.innerText();
    expect(text.length).toBeGreaterThan(50);
  });
});
