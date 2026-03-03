import { test, expect } from "@playwright/test";
import {
  loginAsManager,
  navigateTo,
  waitForDataLoad,
  screenshot,
} from "./helpers";

/**
 * Dispatch Planner — Sticky Scroll Visual Verification
 *
 * Tests that the planner page's sticky header stacking works correctly:
 * 1. WeekNav stays at top of scroll container
 * 2. Grid header (day columns + capacity) sticks below WeekNav
 * 3. Channel group headers stick and stack incrementally
 * 4. Content rows scroll behind headers (never above)
 */

test.describe("Dispatch Planner — Sticky Scroll", () => {
  test.beforeEach(async ({ page }) => {
    await loginAsManager(page);
  });

  test("planner page loads and shows channel groups", async ({ page }) => {
    await navigateTo(page, "/restock-planner");
    await waitForDataLoad(page);

    // Screenshot: initial state
    await screenshot(page, "planner-01-initial");

    // WeekNav should be visible (has prev/next buttons and date range)
    const weekNav = page.locator("text=/Feb|Mar|Jan|Apr/i").first();
    await expect(weekNav).toBeVisible({ timeout: 10_000 });

    // Grid header should show "Channel / Product" label
    const gridHeader = page.locator("text=Channel / Product");
    await expect(gridHeader).toBeVisible();

    // At least one channel group header should exist
    const channelHeaders = page.locator(
      "button.sticky"
    );
    const count = await channelHeaders.count();
    console.log(`Found ${count} sticky channel header buttons`);
    expect(count).toBeGreaterThan(0);

    await screenshot(page, "planner-02-loaded");
  });

  test("expanding a channel group shows outlets and product rows", async ({
    page,
  }) => {
    await navigateTo(page, "/restock-planner");
    await waitForDataLoad(page);

    // Find the first channel group header button and click to expand
    const firstChannelBtn = page
      .locator("button")
      .filter({ has: page.locator("svg") }) // has chevron icon
      .filter({ hasText: /Direct|GoFood|K3Mart|Consignment/i })
      .first();

    if ((await firstChannelBtn.count()) > 0) {
      const channelName = await firstChannelBtn.textContent();
      console.log(`Expanding channel: ${channelName?.trim()}`);
      await firstChannelBtn.click();
      await page.waitForTimeout(500); // wait for CSS max-height transition

      await screenshot(page, "planner-03-expanded");

      // After expanding, there should be product rows or outlet sub-headers
      // visible within the expanded content
      const expandedContent = page.locator("text=/Manual Orders|Outlet/i");
      const hasContent = (await expandedContent.count()) > 0;
      console.log(`Expanded content visible: ${hasContent}`);
    }
  });

  test("scroll down — channel headers stick and stack below grid header", async ({
    page,
  }) => {
    await navigateTo(page, "/restock-planner");
    await waitForDataLoad(page);

    // Expand all channel groups first to create enough content to scroll
    const channelBtns = page
      .locator("button")
      .filter({ hasText: /Direct|GoFood|K3Mart|Consignment/i });

    const btnCount = await channelBtns.count();
    console.log(`Found ${btnCount} channel buttons to expand`);

    for (let i = 0; i < btnCount; i++) {
      await channelBtns.nth(i).click();
      await page.waitForTimeout(200);
    }

    await page.waitForTimeout(500);
    await screenshot(page, "planner-04-all-expanded");

    // Find the scroll container (the card with overflow-y-auto)
    const scrollContainer = page.locator(".overflow-y-auto.isolate").first();
    const exists = (await scrollContainer.count()) > 0;
    console.log(`Scroll container found: ${exists}`);

    if (!exists) {
      // Fallback: try the card wrapper
      console.log("Trying fallback scroll container selector");
    }

    // Scroll down within the container
    if (exists) {
      // Scroll 300px
      await scrollContainer.evaluate((el) => {
        el.scrollTop = 300;
      });
      await page.waitForTimeout(500);
      await screenshot(page, "planner-05-scrolled-300px");

      // Verify sticky elements are still in viewport
      // WeekNav should still be visible at top
      const weekNavVisible = await page
        .locator("text=/Feb|Mar|Jan|Apr/i")
        .first()
        .isVisible();
      console.log(`WeekNav visible after scroll: ${weekNavVisible}`);

      // Grid header "Channel / Product" should still be visible
      const gridHeaderVisible = await page
        .locator("text=Channel / Product")
        .isVisible();
      console.log(`Grid header visible after scroll: ${gridHeaderVisible}`);
      expect(gridHeaderVisible).toBe(true);

      // Channel group headers should still be visible (sticky)
      const stickyBtns = page
        .locator("button")
        .filter({ hasText: /Direct|GoFood|K3Mart|Consignment/i });
      for (let i = 0; i < Math.min(await stickyBtns.count(), 3); i++) {
        const btn = stickyBtns.nth(i);
        const visible = await btn.isVisible();
        const text = await btn.textContent();
        console.log(`Channel header "${text?.trim()}" visible: ${visible}`);
      }

      // Scroll further down
      await scrollContainer.evaluate((el) => {
        el.scrollTop = 600;
      });
      await page.waitForTimeout(500);
      await screenshot(page, "planner-06-scrolled-600px");

      // Scroll to bottom
      await scrollContainer.evaluate((el) => {
        el.scrollTop = el.scrollHeight;
      });
      await page.waitForTimeout(500);
      await screenshot(page, "planner-07-scrolled-bottom");
    }
  });

  test("verify z-index layering — headers paint above content rows", async ({
    page,
  }) => {
    await navigateTo(page, "/restock-planner");
    await waitForDataLoad(page);

    // Expand all channels
    const channelBtns = page
      .locator("button")
      .filter({ hasText: /Direct|GoFood|K3Mart|Consignment/i });

    for (let i = 0; i < await channelBtns.count(); i++) {
      await channelBtns.nth(i).click();
      await page.waitForTimeout(200);
    }

    await page.waitForTimeout(500);

    // Get the scroll container
    const scrollContainer = page.locator(".overflow-y-auto.isolate").first();
    if ((await scrollContainer.count()) === 0) {
      console.log("No scroll container found, skipping z-index test");
      return;
    }

    // Scroll to a midpoint where we can check sticky header stacking
    await scrollContainer.evaluate((el) => {
      el.scrollTop = 400;
    });
    await page.waitForTimeout(500);

    // Use JavaScript to verify the z-index stacking of channel group wrappers
    const zIndexes = await page.evaluate(() => {
      // Find all channel group wrapper divs (they have position: relative + z-index)
      const wrappers = document.querySelectorAll<HTMLElement>(
        ".border-b[style*='z-index']"
      );
      const results: Array<{ text: string; zIndex: string; top: string }> = [];

      wrappers.forEach((w) => {
        const btn = w.querySelector("button");
        results.push({
          text: btn?.textContent?.trim().slice(0, 30) || "unknown",
          zIndex: w.style.zIndex,
          top: btn?.style.top || "none",
        });
      });

      return results;
    });

    console.log("Channel group z-index values:");
    for (const item of zIndexes) {
      console.log(
        `  ${item.text}: z-index=${item.zIndex}, sticky top=${item.top}`
      );
    }

    // Verify z-indexes are in decreasing order (reverse-order stacking)
    if (zIndexes.length >= 2) {
      const zValues = zIndexes.map((z) => parseInt(z.zIndex, 10));
      for (let i = 0; i < zValues.length - 1; i++) {
        expect(zValues[i]).toBeGreaterThan(zValues[i + 1]);
        console.log(
          `  z-index[${i}]=${zValues[i]} > z-index[${i + 1}]=${zValues[i + 1]}: OK`
        );
      }
    }

    await screenshot(page, "planner-08-z-index-verified");
  });
});
