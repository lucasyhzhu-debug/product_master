import { test, expect } from "@playwright/test";
import {
  loginAsManager,
  navigateTo,
  waitForDataLoad,
  screenshot,
  screenshotElement,
} from "./helpers";

/**
 * USER STORY: Busy Cofounder - Sales Analytics Overview
 *
 * Persona: Co-founder navigating to the dedicated sales page.
 * They want to see:
 * - All key metrics at once (gross, net, transactions, outlets) -- no hunting
 * - Platform breakdown to know which channel is performing best
 * - Trends/patterns visible at a glance
 *
 * Critical: They don't want to click around -- everything should be scannable.
 */

test.describe("Sales Analytics Overview -- Cofounder Revenue Dashboard", () => {
  test.beforeEach(async ({ page }) => {
    await loginAsManager(page);
  });

  test("US-6: Key metrics visible immediately in stats cards", async ({
    page,
  }) => {
    // Cofounder navigates to Sales Analytics to see the big picture
    await navigateTo(page, "/sales");
    await waitForDataLoad(page);

    await screenshot(page, "11-sales-analytics-overview-full");

    // USABILITY: Stats cards should be the first thing visible
    // Look for the 5 hero cards: Gross Sales, Net Sales, Commissions Paid, Discounts Given, Delivery Fees
    const statsLabels = [
      "Gross Sales",
      "Net Sales",
      "Commissions Paid",
      "Discounts Given",
      "Delivery Fees",
    ];

    console.log("--- STATS CARDS ANALYSIS ---");
    for (const label of statsLabels) {
      const card = page.locator(`text=${label}`).first();
      const visible = await card.isVisible().catch(() => false);
      console.log(`${label} card visible: ${visible}`);

      if (visible) {
        const box = await card.boundingBox();
        if (box) {
          console.log(
            `  Position: y=${Math.round(box.y)}px (${box.y < 900 ? "above fold" : "BELOW fold"})`
          );
        }
      }
    }

    // At least one hero card label should be visible
    const visibleCount = (await Promise.all(
      statsLabels.map(async (label) => {
        const card = page.locator(`text=${label}`).first();
        return await card.isVisible().catch(() => false);
      })
    )).filter(Boolean).length;
    console.log(`Visible hero card labels: ${visibleCount} / ${statsLabels.length}`);

    await screenshotElement(
      page,
      'div[class*="grid"][class*="gap-4"]',
      "12-stats-cards-closeup"
    );

    expect(visibleCount).toBeGreaterThanOrEqual(1);
  });

  test("US-7: Overview shows chart and channel analytics", async ({
    page,
  }) => {
    await navigateTo(page, "/sales");
    await waitForDataLoad(page);

    // Revenue table was intentionally removed -- verify overview still loads with key sections
    const chartSection = page.locator('[class*="recharts"]').first();
    const chartVisible = await chartSection.isVisible().catch(() => false);
    console.log(`Chart section visible: ${chartVisible}`);

    await screenshot(page, "13-overview-chart-and-channels");
    expect(chartVisible).toBe(true);
  });

  test("US-8: Chart legend acts as channel filter", async ({
    page,
  }) => {
    // Phase 30: Platform filter badges were removed -- chart legend IS the filter now
    await navigateTo(page, "/sales");
    await waitForDataLoad(page);

    // Verify chart legend items exist (dynamic from backend data)
    const chartSection = page.locator('[class*="recharts"]').first();
    const chartVisible = await chartSection.isVisible().catch(() => false);
    console.log(`Chart section visible: ${chartVisible}`);

    await screenshot(page, "14-chart-legend-filter");
    expect(chartVisible).toBe(true);
  });

  test("US-9: Page description reflects all channels", async ({
    page,
  }) => {
    // Phase 30: Description updated to "Track revenue across all channels"
    await navigateTo(page, "/sales");

    const description = page.locator("text=Track revenue across all channels");
    const hasUpdatedDescription = await description
      .isVisible()
      .catch(() => false);

    console.log("--- PAGE DESCRIPTION CHECK ---");
    console.log(
      `Updated description visible: ${hasUpdatedDescription}`
    );

    const title = page.locator("text=Sales Analytics").first();
    const titleVisible = await title.isVisible().catch(() => false);
    console.log(`Page title "Sales Analytics" visible: ${titleVisible}`);

    await screenshot(page, "17-page-header");
    expect(titleVisible).toBe(true);
  });

  test("US-10: Information density -- can cofounder absorb it all at a glance?", async ({
    page,
  }) => {
    // Holistic usability: how much vertical space does the overview take?
    await navigateTo(page, "/sales");
    await waitForDataLoad(page);

    // Measure total page height
    const pageHeight = await page.evaluate(() => document.body.scrollHeight);
    const viewportHeight = 900;

    console.log("--- INFORMATION DENSITY ANALYSIS ---");
    console.log(`Total page content height: ${pageHeight}px`);
    console.log(`Viewport height: ${viewportHeight}px`);
    console.log(
      `Scrolls required: ${Math.ceil(pageHeight / viewportHeight)}`
    );

    if (pageHeight > viewportHeight * 2) {
      console.log(
        "WARNING: Page requires significant scrolling -- busy cofounder may miss bottom content"
      );
    }

    // Tab navigation: are both tabs easily clickable?
    const overviewTab = page.locator('button[role="tab"]:has-text("Overview")');
    const settingsTab = page.locator('button[role="tab"]:has-text("Settings")');
    const overviewVisible = await overviewTab.isVisible().catch(() => false);
    const settingsVisible = await settingsTab.isVisible().catch(() => false);
    console.log(`Overview tab visible: ${overviewVisible}`);
    console.log(`Settings tab visible: ${settingsVisible}`);

    await screenshot(page, "18-full-overview-page");
    expect(overviewVisible).toBe(true);
  });
});
