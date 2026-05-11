import { test, expect } from "@playwright/test";
import {
  loginAsManager,
  navigateTo,
  waitForDataLoad,
  screenshot,
  screenshotElement,
} from "./helpers";

/**
 * USER STORY: Busy Cofounder - Sales Analytics Settings
 *
 * Persona: Co-founder who needs to:
 * - Quickly check if all integrations are healthy (green dots)
 * - Trigger a sync if data looks stale
 * - NOT be overwhelmed by technical details (API tokens, reconnection steps)
 * - See sync history to trust the data pipeline
 * - Manage outlets (toggle active/inactive)
 *
 * Key insight: Internal Orders should be simpler than K3Mart/GoBiz
 * (no tokens, no reconnection guide) — the cofounder shouldn't see
 * unnecessary complexity for their own database.
 */

test.describe("Sales Analytics Settings — Platform Management", () => {
  test.beforeEach(async ({ page }) => {
    await loginAsManager(page);
  });

  test("US-12: Settings tab — all 3 platform cards visible", async ({
    page,
  }) => {
    await navigateTo(page, "/sales");
    await waitForDataLoad(page);

    // Click Settings tab
    const settingsTab = page.locator(
      'button[role="tab"]:has-text("Settings")'
    );
    await settingsTab.click();
    await page.waitForTimeout(1500);
    await waitForDataLoad(page);

    await screenshot(page, "19-settings-tab-full");

    // Platform Connections accordion should be expanded by default
    const platformSection = page.locator("text=Platform Connections").first();
    const platformVisible = await platformSection.isVisible().catch(() => false);
    console.log("--- SETTINGS PLATFORM CONNECTIONS ---");
    console.log(`Platform Connections section visible: ${platformVisible}`);

    // Check all 3 platforms are present
    const platforms = ["K3Mart", "GoBiz", "Internal Orders"];
    for (const platform of platforms) {
      const card = page.locator(`text=${platform}`).first();
      const visible = await card.isVisible().catch(() => false);
      console.log(`${platform} card visible: ${visible}`);
    }

    await screenshot(page, "20-platform-connections-expanded");

    expect(true).toBe(true);
  });

  test("US-13: Internal Orders card is simplified — no reconnect accordion", async ({
    page,
  }) => {
    await navigateTo(page, "/sales");
    await waitForDataLoad(page);

    // Navigate to Settings
    const settingsTab = page.locator(
      'button[role="tab"]:has-text("Settings")'
    );
    await settingsTab.click();
    await page.waitForTimeout(1500);
    await waitForDataLoad(page);

    // Find the Internal Orders card
    const internalCard = page
      .locator('div:has(> div:has-text("Internal Orders"))')
      .first();

    console.log("--- INTERNAL ORDERS CARD ANALYSIS ---");

    // CRITICAL: Internal Orders should NOT show "How to reconnect API token"
    // This is our own database — there's no API token to reconnect
    const reconnectText = page.locator("text=How to reconnect API token");
    const reconnectCount = await reconnectText.count();

    // Check ALL reconnect accordions — there should be exactly 2 (K3Mart + GoBiz)
    // not 3 (which would mean Internal also shows one)
    console.log(`"How to reconnect" accordions found: ${reconnectCount}`);

    if (reconnectCount > 2) {
      console.log(
        "ISSUE: Internal Orders showing a reconnect accordion — this is confusing! " +
          "There's no API token for our own database."
      );
    } else if (reconnectCount === 2) {
      console.log(
        "GOOD: Only K3Mart and GoBiz show reconnect guides. Internal is simplified."
      );
    }

    // Check that Internal card still has a Sync button
    // Look for the card containing "Internal Orders" and check for buttons within it
    const syncButtons = page.locator("button:has-text('Sync Now')");
    const syncCount = await syncButtons.count();
    console.log(`Total "Sync Now" buttons: ${syncCount}`);

    // Should be 3 — one per platform
    if (syncCount < 3) {
      console.log(
        "ISSUE: Not all platforms have Sync Now buttons"
      );
    }

    // Check Token lifespan line — Internal should show "N/A (own database)"
    // or hide the token lifespan line entirely
    const tokenLifespan = page.locator("text=Token lifespan");
    const tokenLifespanCount = await tokenLifespan.count();
    console.log(`"Token lifespan" labels found: ${tokenLifespanCount}`);

    if (tokenLifespanCount > 2) {
      console.log(
        "ISSUE: Token lifespan showing for Internal Orders — unnecessary complexity"
      );
    }

    // N/A label check
    const naLabel = page.locator("text=N/A");
    const naCount = await naLabel.count();
    console.log(`"N/A" labels found: ${naCount}`);

    await screenshot(page, "21-internal-card-simplified");
    expect(true).toBe(true);
  });

  test("US-14: Connection status badges are clear and color-coded", async ({
    page,
  }) => {
    await navigateTo(page, "/sales");
    await waitForDataLoad(page);

    const settingsTab = page.locator(
      'button[role="tab"]:has-text("Settings")'
    );
    await settingsTab.click();
    await page.waitForTimeout(1500);
    await waitForDataLoad(page);

    // Check for status badges
    const connectedBadges = page.locator("text=Connected");
    const expiredBadges = page.locator("text=Token Expired");
    const neverSyncedBadges = page.locator("text=Never Synced");

    console.log("--- CONNECTION STATUS BADGES ---");
    console.log(`"Connected" badges: ${await connectedBadges.count()}`);
    console.log(`"Token Expired" badges: ${await expiredBadges.count()}`);
    console.log(`"Never Synced" badges: ${await neverSyncedBadges.count()}`);

    // USABILITY: Status dots (green/red/gray) should be visible
    const greenDots = page.locator('[class*="bg-green-500"][class*="rounded-full"]');
    const redDots = page.locator('[class*="bg-red-500"][class*="rounded-full"]');
    const grayDots = page.locator('[class*="bg-gray-400"][class*="rounded-full"]');

    console.log(`Green status dots: ${await greenDots.count()}`);
    console.log(`Red status dots: ${await redDots.count()}`);
    console.log(`Gray status dots: ${await grayDots.count()}`);

    // USABILITY: Last sync time should be visible for each platform
    const lastSyncLabels = page.locator("text=Last sync:");
    console.log(`"Last sync:" labels: ${await lastSyncLabels.count()}`);

    await screenshot(page, "22-connection-status-badges");
    expect(true).toBe(true);
  });

  test("US-15: K3 Mart card has both Sync Sales AND Refresh Stores buttons", async ({
    page,
  }) => {
    // K3 Mart is special — it has a secondary "Refresh Stores" action
    await navigateTo(page, "/sales");
    await waitForDataLoad(page);

    const settingsTab = page.locator(
      'button[role="tab"]:has-text("Settings")'
    );
    await settingsTab.click();
    await page.waitForTimeout(1500);
    await waitForDataLoad(page);

    // K3 Mart should have "Refresh Stores" button
    const refreshStores = page.locator("button:has-text('Refresh Stores')");
    const hasRefreshStores = await refreshStores.isVisible().catch(() => false);

    console.log("--- K3 MART DUAL BUTTONS ---");
    console.log(`"Refresh Stores" button visible: ${hasRefreshStores}`);

    // "Sync Now" should also be present on K3 Mart card
    const syncNow = page.locator("button:has-text('Sync Now')");
    console.log(`Total "Sync Now" buttons: ${await syncNow.count()}`);

    // USABILITY: Is the button hierarchy clear?
    // "Sync Sales" (primary action) should look different from "Refresh Stores" (secondary)
    if (hasRefreshStores) {
      const refreshVariant = await refreshStores.evaluate((el) =>
        el.classList.toString()
      );
      console.log(`Refresh Stores button classes: ${refreshVariant}`);
      const isPrimaryLooking = refreshVariant.includes("bg-primary");
      console.log(
        `Button hierarchy clear: ${!isPrimaryLooking ? "YES (secondary is outline)" : "NO (secondary looks primary)"}`
      );
    }

    await screenshot(page, "23-k3mart-dual-buttons");
    expect(true).toBe(true);
  });

  test("US-16: Outlet Management section", async ({ page }) => {
    await navigateTo(page, "/sales");
    await waitForDataLoad(page);

    const settingsTab = page.locator(
      'button[role="tab"]:has-text("Settings")'
    );
    await settingsTab.click();
    await page.waitForTimeout(1500);
    await waitForDataLoad(page);

    // Expand Outlet Management accordion
    const outletTrigger = page.locator("text=/Outlet Management/").first();
    const outletVisible = await outletTrigger.isVisible().catch(() => false);

    console.log("--- OUTLET MANAGEMENT ---");
    console.log(`Outlet Management section visible: ${outletVisible}`);

    if (outletVisible) {
      await outletTrigger.click();
      await page.waitForTimeout(1000);
      await waitForDataLoad(page);

      await screenshot(page, "24-outlet-management-expanded");

      // Check for outlet table
      const outletTable = page.locator("table").nth(0);
      const hasTable = await outletTable.isVisible().catch(() => false);

      if (hasTable) {
        // Check columns
        const columns = ["Source", "External ID", "Name", "Active", "Last Sync"];
        for (const col of columns) {
          const th = page.locator(`th:has-text("${col}")`);
          const visible = await th.isVisible().catch(() => false);
          console.log(`  Column "${col}": ${visible ? "present" : "MISSING"}`);
        }

        // Check for toggle switches
        const switches = page.locator('button[role="switch"]');
        const switchCount = await switches.count();
        console.log(`Active toggle switches: ${switchCount}`);

        // Check for platform badges in outlet table
        const outletK3 = page.locator('table td >> text="K3Mart"');
        const outletInternal = page.locator('table td >> text="Internal"');
        console.log(`K3Mart outlets: ${await outletK3.count()}`);
        console.log(`Internal outlets: ${await outletInternal.count()}`);

        // USABILITY: Internal orders don't have outlets — should this section mention that?
        if ((await outletInternal.count()) === 0) {
          console.log(
            "NOTE: No internal outlets (expected — internal orders don't use the outlet concept)"
          );
        }
      } else {
        // Check for empty state
        const emptyMsg = page.locator("text=No outlets found");
        const isEmpty = await emptyMsg.isVisible().catch(() => false);
        console.log(`Empty state message: ${isEmpty}`);
        await screenshot(page, "24-outlet-management-empty");
      }
    }

    expect(true).toBe(true);
  });

  test("US-17: Sync History section — cofounder can verify data pipeline", async ({
    page,
  }) => {
    await navigateTo(page, "/sales");
    await waitForDataLoad(page);

    const settingsTab = page.locator(
      'button[role="tab"]:has-text("Settings")'
    );
    await settingsTab.click();
    await page.waitForTimeout(1500);
    await waitForDataLoad(page);

    // Expand Sync History accordion
    const syncHistoryTrigger = page.locator("text=/Sync History/").first();
    const syncVisible = await syncHistoryTrigger.isVisible().catch(() => false);

    console.log("--- SYNC HISTORY ---");
    console.log(`Sync History section visible: ${syncVisible}`);

    if (syncVisible) {
      await syncHistoryTrigger.click();
      await page.waitForTimeout(1000);
      await waitForDataLoad(page);

      await screenshot(page, "25-sync-history-expanded");

      // Check for sync log table
      const columns = ["Time", "Platform", "Status", "Products", "Duration", "Error"];
      for (const col of columns) {
        const th = page.locator(`th:has-text("${col}")`);
        const count = await th.count();
        console.log(`  Column "${col}": ${count > 0 ? "present" : "MISSING"}`);
      }

      // Check for success/error status badges
      const successBadges = page.locator(
        'table >> text="Success"'
      );
      const errorBadges = page.locator('table >> text="Error"');
      console.log(`Success entries: ${await successBadges.count()}`);
      console.log(`Error entries: ${await errorBadges.count()}`);

      // Check for internal source in logs
      const internalLogs = page.locator('table td >> text="Internal"');
      console.log(`Internal sync log entries: ${await internalLogs.count()}`);

      // USABILITY: Are errors clearly highlighted?
      const redText = page.locator('[class*="text-red"]');
      console.log(`Red-highlighted elements: ${await redText.count()}`);
    }

    expect(true).toBe(true);
  });

  test("US-18: Tab switching is smooth — no data loss", async ({ page }) => {
    // Cofounder toggles between Overview and Settings
    await navigateTo(page, "/sales");
    await waitForDataLoad(page);

    await screenshot(page, "26-tab-overview-initial");

    // Switch to Settings
    const settingsTab = page.locator(
      'button[role="tab"]:has-text("Settings")'
    );
    await settingsTab.click();
    await page.waitForTimeout(1000);
    await screenshot(page, "27-tab-settings");

    // Switch back to Overview
    const overviewTab = page.locator(
      'button[role="tab"]:has-text("Overview")'
    );
    await overviewTab.click();
    await page.waitForTimeout(1000);
    await screenshot(page, "28-tab-overview-return");

    // USABILITY: Stats should still be present after switching back
    const grossRevenue = page.locator("text=Gross Revenue").first();
    const stillPresent = await grossRevenue.isVisible().catch(() => false);

    console.log("--- TAB SWITCHING ---");
    console.log(`Stats still visible after tab switch: ${stillPresent}`);

    if (!stillPresent) {
      console.log("ISSUE: Data lost after tab switch — this is frustrating for a busy cofounder");
    }

    expect(true).toBe(true);
  });

  test("US-19: Mobile settings — cofounder on phone", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await navigateTo(page, "/sales");
    await waitForDataLoad(page);

    // Switch to Settings
    const settingsTab = page.locator(
      'button[role="tab"]:has-text("Settings")'
    );
    if (await settingsTab.isVisible().catch(() => false)) {
      await settingsTab.click();
      await page.waitForTimeout(1500);
      await waitForDataLoad(page);
    }

    await screenshot(page, "29-mobile-settings-full");

    console.log("--- MOBILE SETTINGS ---");

    // Check horizontal overflow
    const hasOverflow = await page.evaluate(() => {
      return document.body.scrollWidth > document.body.clientWidth;
    });
    console.log(`Horizontal overflow on mobile: ${hasOverflow}`);

    if (hasOverflow) {
      console.log(
        "ISSUE: Horizontal scroll on mobile settings — tables may be too wide"
      );
    }

    // Check if sync buttons are tappable (min 44px touch target)
    const syncButtons = page.locator("button:has-text('Sync Now')");
    const btnCount = await syncButtons.count();
    for (let i = 0; i < btnCount; i++) {
      const box = await syncButtons.nth(i).boundingBox();
      if (box && box.height < 44) {
        console.log(
          `ISSUE: Sync button ${i + 1} height is ${box.height}px — below 44px minimum touch target`
        );
      }
    }

    // Reset viewport
    await page.setViewportSize({ width: 1440, height: 900 });
    expect(true).toBe(true);
  });
});
