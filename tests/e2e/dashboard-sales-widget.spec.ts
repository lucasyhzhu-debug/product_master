import { test, expect } from "@playwright/test";
import {
  loginAsManager,
  waitForDataLoad,
  screenshot,
  screenshotElement,
} from "./helpers";

/**
 * USER STORY: Busy Cofounder - Dashboard Sales Widget
 *
 * Persona: Co-founder who just opened the app. They want to immediately see:
 * - Revenue numbers at a glance (no clicking required)
 * - Platform health status (green/red dots for K3Mart, GoBiz, Internal)
 * - Quick sync buttons if data looks stale
 * - All this WITHOUT scrolling past the fold if possible
 */

test.describe("Dashboard SalesWidget — Cofounder Quick Glance", () => {
  test.beforeEach(async ({ page }) => {
    await loginAsManager(page);
  });

  test("US-1: Revenue numbers visible immediately on dashboard load", async ({
    page,
  }) => {
    // Cofounder opens dashboard — expects to see revenue data without any clicks
    await page.goto("/", { waitUntil: "networkidle" });
    await waitForDataLoad(page);

    await screenshot(page, "03-dashboard-full-loaded");

    // The SalesWidget card should exist on the page
    const salesCard = page.locator("text=Sales Integration").first();
    const salesCardVisible = await salesCard.isVisible();

    if (salesCardVisible) {
      // Scroll to the widget and screenshot it
      await screenshotElement(
        page,
        ':has-text("Sales Integration"):is(div[class*="rounded"])',
        "04-sales-widget-closeup"
      );

      // USABILITY CHECK: Revenue summary text should be present
      // Look for currency formatting (Rp or $ patterns)
      const revenueText = page.locator("text=/Rp|\\$/").first();
      const hasRevenueVisible = await revenueText.isVisible().catch(() => false);

      // USABILITY CHECK: Period label should tell the cofounder WHEN this data is from
      const periodLabel = page.locator("text=/Last|Today|hours|days/i").first();
      const hasPeriodContext =
        await periodLabel.isVisible().catch(() => false);

      // Take closeup of the revenue summary area
      await screenshot(page, "05-dashboard-revenue-area");

      // Log findings for analysis
      console.log("--- DASHBOARD SALES WIDGET ANALYSIS ---");
      console.log(`Revenue numbers visible: ${hasRevenueVisible}`);
      console.log(`Period context visible: ${hasPeriodContext}`);

      if (!hasRevenueVisible) {
        console.log(
          "ISSUE: Revenue numbers not immediately visible — cofounder has to hunt for data"
        );
      }
      if (!hasPeriodContext) {
        console.log(
          "ISSUE: No time context — cofounder doesn't know if data is current"
        );
      }
    } else {
      console.log(
        "CRITICAL: SalesWidget not visible on dashboard — cofounder can't see sales at all!"
      );
      await screenshot(page, "04-sales-widget-MISSING");
    }

    // This is a visual test — always pass so we get screenshots
    expect(true).toBe(true);
  });

  test("US-2: All 3 platform status indicators visible at once", async ({
    page,
  }) => {
    // Cofounder wants to quickly see: are all platforms healthy?
    await page.goto("/", { waitUntil: "networkidle" });
    await waitForDataLoad(page);

    // Check for the 3 platform rows
    const k3mart = page.locator("text=K3 Mart").first();
    const gobiz = page.locator("text=GoBiz").first();
    const internal = page.locator("text=Internal").first();

    const k3Visible = await k3mart.isVisible().catch(() => false);
    const gobizVisible = await gobiz.isVisible().catch(() => false);
    const internalVisible = await internal.isVisible().catch(() => false);

    console.log("--- PLATFORM VISIBILITY CHECK ---");
    console.log(`K3 Mart visible: ${k3Visible}`);
    console.log(`GoBiz visible: ${gobizVisible}`);
    console.log(`Internal visible: ${internalVisible}`);

    // USABILITY: Status dots should be visible (green/red/gray circles)
    const statusDots = page.locator('[class*="rounded-full"][class*="w-2"]');
    const dotCount = await statusDots.count();
    console.log(`Status indicator dots found: ${dotCount}`);

    if (dotCount < 3) {
      console.log(
        "ISSUE: Fewer than 3 status dots — cofounder can't assess platform health at a glance"
      );
    }

    // USABILITY: Are all 3 platforms visible without horizontal scrolling?
    // On 1440px viewport, all 3 should fit in a row
    if (k3Visible && gobizVisible && internalVisible) {
      // Check if they're in a grid layout (not stacked vertically on desktop)
      const k3Box = await k3mart.boundingBox();
      const gobizBox = await gobiz.boundingBox();
      const internalBox = await internal.boundingBox();

      if (k3Box && gobizBox && internalBox) {
        const allOnSameRow =
          Math.abs(k3Box.y - gobizBox.y) < 50 &&
          Math.abs(gobizBox.y - internalBox.y) < 50;
        console.log(`All 3 platforms in same row (desktop): ${allOnSameRow}`);

        if (!allOnSameRow) {
          console.log(
            "ISSUE: Platforms stacked vertically on desktop — takes too much vertical space, cofounder has to scroll"
          );
        }
      }
    }

    await screenshot(page, "06-platform-indicators");
    expect(true).toBe(true);
  });

  test("US-3: Sync buttons accessible without navigating away", async ({
    page,
  }) => {
    // Cofounder sees stale data, wants to quickly trigger a sync
    await page.goto("/", { waitUntil: "networkidle" });
    await waitForDataLoad(page);

    // Find sync/refresh buttons within the sales widget area
    const refreshButtons = page.locator(
      'button:has(svg[class*="lucide-refresh"])'
    );
    const refreshCount = await refreshButtons.count();

    console.log("--- SYNC ACCESSIBILITY CHECK ---");
    console.log(`Refresh/sync buttons found: ${refreshCount}`);

    if (refreshCount < 3) {
      // Try alternative: buttons with RefreshCw icon
      const altRefreshButtons = page.locator("button svg.lucide-refresh-cw");
      const altCount = await altRefreshButtons.count();
      console.log(`Alternative refresh buttons (RefreshCw): ${altCount}`);
    }

    // USABILITY: "Last sync" time should be visible near each platform
    const lastSyncTexts = page.locator("text=/ago|Never synced|Just now/i");
    const syncTimeCount = await lastSyncTexts.count();
    console.log(`Last sync timestamps visible: ${syncTimeCount}`);

    if (syncTimeCount < 3) {
      console.log(
        "ISSUE: Not all platforms show last sync time — cofounder can't tell if data is fresh"
      );
    }

    await screenshot(page, "07-sync-buttons");
    expect(true).toBe(true);
  });

  test("US-4: Widget position — visible without excessive scrolling", async ({
    page,
  }) => {
    // Key usability test: how far does the cofounder have to scroll to see sales data?
    await page.goto("/", { waitUntil: "networkidle" });
    await waitForDataLoad(page);

    const salesWidget = page
      .locator("text=Sales Integration")
      .first();
    const isVisible = await salesWidget.isVisible().catch(() => false);

    if (isVisible) {
      const box = await salesWidget.boundingBox();
      if (box) {
        const viewportHeight = 900; // Our configured viewport
        const widgetTopPosition = box.y;

        console.log("--- WIDGET POSITION ANALYSIS ---");
        console.log(`Viewport height: ${viewportHeight}px`);
        console.log(`SalesWidget top position: ${widgetTopPosition}px`);
        console.log(
          `Above the fold: ${widgetTopPosition < viewportHeight}`
        );

        if (widgetTopPosition > viewportHeight) {
          console.log(
            `ISSUE: SalesWidget is ${Math.round(widgetTopPosition - viewportHeight)}px below the fold — cofounder must scroll to see revenue data!`
          );
          console.log(
            "RECOMMENDATION: Move SalesWidget higher on the dashboard or make the hero section smaller"
          );
        } else if (widgetTopPosition > viewportHeight * 0.7) {
          console.log(
            "WARNING: SalesWidget is near the bottom of initial viewport — partially cut off"
          );
        } else {
          console.log("GOOD: SalesWidget is comfortably within initial viewport");
        }
      }
    }

    // Screenshot from the very top — what does the cofounder see first?
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.waitForTimeout(300);
    await screenshot(page, "08-first-viewport-above-fold");

    expect(true).toBe(true);
  });

  test("US-5: Mobile responsiveness — cofounder checking on phone", async ({
    page,
  }) => {
    // Cofounder pulls out phone to check sales during a meeting
    await page.setViewportSize({ width: 390, height: 844 }); // iPhone 14
    await page.goto("/", { waitUntil: "networkidle" });
    await waitForDataLoad(page);

    await screenshot(page, "09-mobile-dashboard-full");

    // Check if SalesWidget is present
    const salesWidget = page.locator("text=Sales Integration").first();
    const isVisible = await salesWidget.isVisible().catch(() => false);

    console.log("--- MOBILE RESPONSIVENESS ---");
    console.log(`SalesWidget visible on mobile: ${isVisible}`);

    if (isVisible) {
      await salesWidget.scrollIntoViewIfNeeded();
      await page.waitForTimeout(300);
      await screenshot(page, "10-mobile-sales-widget");

      // Check platform rows: on mobile they should stack (grid-cols-1)
      const platformRows = page.locator(
        '.grid [class*="rounded"][class*="border"]'
      );
      const rowCount = await platformRows.count();
      console.log(`Platform rows visible on mobile: ${rowCount}`);

      // Check for horizontal overflow (bad UX on mobile)
      const hasOverflow = await page.evaluate(() => {
        return document.body.scrollWidth > document.body.clientWidth;
      });
      console.log(`Horizontal overflow on mobile: ${hasOverflow}`);

      if (hasOverflow) {
        console.log(
          "ISSUE: Horizontal scroll on mobile — very bad UX for busy cofounder on phone"
        );
      }
    }

    // Reset viewport
    await page.setViewportSize({ width: 1440, height: 900 });
    expect(true).toBe(true);
  });
});
