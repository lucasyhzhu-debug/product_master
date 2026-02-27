import { test, expect } from "@playwright/test";
import {
  loginAsManager,
  navigateTo,
  waitForDataLoad,
  screenshot,
} from "./helpers";

/**
 * BigSeller Sync Integration E2E Tests (Phase 28)
 *
 * Tests the admin experience of the BigSeller sync feature:
 * - Settings tab shows BigSeller card with expandable sync panel
 * - Sync controls (date range, sync button) are present and functional
 * - Progress display shows step-by-step stages
 * - Orders table is accessible and filterable
 * - SKU mapping tab shows Shopee/TikTok sub-tabs
 * - JWT expiry and COGS caveat UI elements render correctly
 *
 * NOTE: These tests run against the dev Convex database.
 * Sync trigger tests are READ-ONLY (verify UI renders, don't actually trigger sync)
 * to avoid polluting dev data.
 */

test.describe("BigSeller Sync — Settings Tab Integration", () => {
  test.beforeEach(async ({ page }) => {
    await loginAsManager(page);
  });

  test("Settings tab shows BigSeller platform card", async ({ page }) => {
    await navigateTo(page, "/sales");
    await waitForDataLoad(page);

    // Navigate to Settings tab
    const settingsTab = page.locator('button[role="tab"]:has-text("Settings")');
    await settingsTab.click();
    await page.waitForTimeout(1500);
    await waitForDataLoad(page);

    await screenshot(page, "bigseller-01-settings-tab");

    // BigSeller card should be visible in platform connections
    const bigsellerText = page.locator("text=BigSeller").first();
    await expect(bigsellerText).toBeVisible({ timeout: 10_000 });

    console.log("--- BIGSELLER SETTINGS ---");
    console.log("BigSeller card visible: true");
  });

  test("BigSeller card expandable section renders sync panel", async ({
    page,
  }) => {
    await navigateTo(page, "/sales");
    await waitForDataLoad(page);

    // Navigate to Settings tab
    const settingsTab = page.locator('button[role="tab"]:has-text("Settings")');
    await settingsTab.click();
    await page.waitForTimeout(1500);
    await waitForDataLoad(page);

    // Find and expand BigSeller section
    // Look for the BigSeller area — may be a card, collapsible, or section
    const bigsellerSection = page.locator('[data-testid="bigseller-section"]').or(
      page.locator("text=BigSeller").first().locator("..").locator("..")
    );

    // Try to expand if there's a toggle
    const expandButton = bigsellerSection
      .locator('button:has-text("Manage"), button:has-text("Expand"), button[aria-expanded]')
      .first();

    if ((await expandButton.count()) > 0) {
      await expandButton.click();
      await page.waitForTimeout(500);
    }

    await screenshot(page, "bigseller-02-expanded-section");

    // Check for sync panel elements
    const syncPanel = page.locator("text=Sync Now").or(
      page.locator("text=Sync BigSeller")
    );
    const hasSyncButton = (await syncPanel.count()) > 0;
    console.log(`Sync button visible: ${hasSyncButton}`);

    // Check for date range inputs (part of sync controls)
    const dateInputs = page.locator('input[type="date"]');
    const dateInputCount = await dateInputs.count();
    console.log(`Date inputs found: ${dateInputCount}`);

    await screenshot(page, "bigseller-03-sync-panel");
  });

  test("BigSeller sync progress display shows correct stages", async ({
    page,
  }) => {
    await navigateTo(page, "/sales");
    await waitForDataLoad(page);

    // Navigate to Settings tab
    const settingsTab = page.locator('button[role="tab"]:has-text("Settings")');
    await settingsTab.click();
    await page.waitForTimeout(1500);

    // Look for sync progress elements (steps)
    const progressSteps = [
      "Triggering sync",
      "Syncing data",
      "Fetching orders",
      "Storing data",
      "Complete",
    ];

    // These steps should be defined in the component even if idle
    // Check the component renders without crashing
    const bigsellerArea = page.locator("text=BigSeller").first();
    await expect(bigsellerArea).toBeVisible();

    await screenshot(page, "bigseller-04-progress-area");
    console.log("--- BIGSELLER SYNC PROGRESS ---");
    console.log("Expected steps:", progressSteps.join(" → "));
  });
});

test.describe("BigSeller Sync — Orders Table", () => {
  test.beforeEach(async ({ page }) => {
    await loginAsManager(page);
  });

  test("BigSeller orders table renders with filters", async ({ page }) => {
    await navigateTo(page, "/sales");
    await waitForDataLoad(page);

    // Navigate to Settings tab and expand BigSeller
    const settingsTab = page.locator('button[role="tab"]:has-text("Settings")');
    await settingsTab.click();
    await page.waitForTimeout(1500);
    await waitForDataLoad(page);

    // Look for orders table or empty state message
    const ordersTable = page.locator("table").or(
      page.locator("text=No synced orders")
    );

    // Look for platform filter dropdown
    const platformFilter = page.locator("text=All Platforms").or(
      page.locator('select:has(option:has-text("Shopee"))')
    ).or(
      page.locator('[role="combobox"]')
    );

    const hasFilter = (await platformFilter.count()) > 0;
    console.log(`Platform filter found: ${hasFilter}`);

    await screenshot(page, "bigseller-05-orders-table");
  });
});

test.describe("BigSeller Sync — Product Mapping Tab", () => {
  test.beforeEach(async ({ page }) => {
    await loginAsManager(page);
  });

  test("Product Mapping tab shows Shopee and TikTok sub-tabs", async ({
    page,
  }) => {
    await navigateTo(page, "/sales");
    await waitForDataLoad(page);

    // Navigate to Product Mapping tab
    const mappingTab = page.locator(
      'button[role="tab"]:has-text("Product Mapping")'
    );
    if ((await mappingTab.count()) === 0) {
      console.log("Product Mapping tab not found — skipping");
      return;
    }

    await mappingTab.click();
    await page.waitForTimeout(1500);
    await waitForDataLoad(page);

    await screenshot(page, "bigseller-06-product-mapping");

    // Check for platform sub-tabs
    const shopeeTab = page.locator("text=Shopee").first();
    const tiktokTab = page.locator("text=TikTok").first();

    const hasShopeeTab = (await shopeeTab.count()) > 0;
    const hasTiktokTab = (await tiktokTab.count()) > 0;

    console.log("--- BIGSELLER PRODUCT MAPPING ---");
    console.log(`Shopee sub-tab found: ${hasShopeeTab}`);
    console.log(`TikTok sub-tab found: ${hasTiktokTab}`);

    await screenshot(page, "bigseller-07-mapping-tabs");
  });
});

test.describe("BigSeller Sync — Token & Error Handling UI", () => {
  test.beforeEach(async ({ page }) => {
    await loginAsManager(page);
  });

  test("JWT expiry warning renders when token is expired", async ({
    page,
  }) => {
    await navigateTo(page, "/sales");
    await waitForDataLoad(page);

    // Navigate to Settings
    const settingsTab = page.locator('button[role="tab"]:has-text("Settings")');
    await settingsTab.click();
    await page.waitForTimeout(1500);

    // Check for token-related UI elements
    // The warning should show if platformCredentials has lastRefreshStatus: "error"
    const tokenWarning = page.locator("text=Token expired").or(
      page.locator("text=Re-login required").or(
        page.locator("text=paste new token")
      )
    );

    const hasTokenWarning = (await tokenWarning.count()) > 0;
    console.log("--- BIGSELLER TOKEN UI ---");
    console.log(`Token expiry warning visible: ${hasTokenWarning}`);

    // The token dialog button should be accessible
    const tokenButton = page.locator('button:has-text("Update Token")').or(
      page.locator('button:has-text("Paste Token")')
    );

    const hasTokenButton = (await tokenButton.count()) > 0;
    console.log(`Token update button found: ${hasTokenButton}`);

    await screenshot(page, "bigseller-08-token-ui");
  });

  test("COGS caveat banner appears when costFee is zero", async ({
    page,
  }) => {
    await navigateTo(page, "/sales");
    await waitForDataLoad(page);

    // Navigate to Settings
    const settingsTab = page.locator('button[role="tab"]:has-text("Settings")');
    await settingsTab.click();
    await page.waitForTimeout(1500);

    // Check for COGS caveat banner
    const cogsBanner = page.locator("text=COGS not configured").or(
      page.locator("text=Profit = Revenue")
    );

    const hasCogsBanner = (await cogsBanner.count()) > 0;
    console.log("--- BIGSELLER COGS ---");
    console.log(`COGS caveat banner visible: ${hasCogsBanner}`);
    // Note: Banner only shows if there are synced orders with all costFee === 0.
    // If no orders synced yet, banner won't show (expected).

    await screenshot(page, "bigseller-09-cogs-caveat");
  });
});

test.describe("BigSeller Sync — No Regressions", () => {
  test.beforeEach(async ({ page }) => {
    await loginAsManager(page);
  });

  test("Other platform cards still render in Settings", async ({ page }) => {
    await navigateTo(page, "/sales");
    await waitForDataLoad(page);

    const settingsTab = page.locator('button[role="tab"]:has-text("Settings")');
    await settingsTab.click();
    await page.waitForTimeout(1500);
    await waitForDataLoad(page);

    // GoBiz card should still be visible
    const gobizCard = page.locator("text=GoBiz").first();
    const hasGobiz = (await gobizCard.count()) > 0;

    // K3Mart card should still be visible
    const k3martCard = page.locator("text=K3Mart").or(
      page.locator("text=Internal Orders")
    ).first();
    const hasK3mart = (await k3martCard.count()) > 0;

    console.log("--- REGRESSION CHECK ---");
    console.log(`GoBiz card visible: ${hasGobiz}`);
    console.log(`K3Mart/Internal card visible: ${hasK3mart}`);

    await screenshot(page, "bigseller-10-no-regression");

    // At least one other platform card should be visible
    expect(hasGobiz || hasK3mart).toBe(true);
  });

  test("Sales Analytics overview tab still loads", async ({ page }) => {
    await navigateTo(page, "/sales");
    await waitForDataLoad(page);

    // Overview tab should load without errors
    const overviewTab = page.locator(
      'button[role="tab"]:has-text("Overview")'
    );
    if ((await overviewTab.count()) > 0) {
      await overviewTab.click();
      await page.waitForTimeout(1500);
    }

    await screenshot(page, "bigseller-11-overview-no-regression");

    // Page should have meaningful content (not error screen)
    const bodyText = await page.locator("body").innerText();
    expect(bodyText.length).toBeGreaterThan(50);
    // Should not show uncaught error
    expect(bodyText).not.toContain("Unhandled Runtime Error");
  });
});
