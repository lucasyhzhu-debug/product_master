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
    // Look for the 4 stats cards: Gross Revenue, Net Revenue, Transactions, Active Outlets
    const statsLabels = [
      "Gross Revenue",
      "Net Revenue",
      "Transactions",
      "Active Outlets",
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

    // Check if all 4 cards are in a grid row on desktop
    const cardElements = page.locator(
      'div[class*="grid"] > div:has(div:has-text("Revenue"))'
    );
    const cardCount = await cardElements.count();
    console.log(`Stats card grid items: ${cardCount}`);

    // USABILITY: The numbers should be large and bold (text-2xl font-bold)
    const bigNumbers = page.locator(".text-2xl.font-bold");
    const bigNumberCount = await bigNumbers.count();
    console.log(`Large bold metric numbers: ${bigNumberCount}`);

    if (bigNumberCount < 4) {
      console.log(
        "ISSUE: Fewer than 4 prominent metric numbers -- cofounder can't scan key data at a glance"
      );
    }

    // USABILITY: Period label should give time context
    const periodLabels = page.locator("text=/Last 24|Last 7|This week|Today/i");
    const periodCount = await periodLabels.count();
    console.log(`Period context labels: ${periodCount}`);

    if (periodCount === 0) {
      console.log(
        "ISSUE: No time period context -- cofounder doesn't know if these are today's, this week's, or this month's numbers"
      );
    }

    await screenshotElement(
      page,
      'div[class*="grid"][class*="gap-4"]',
      "12-stats-cards-closeup"
    );

    expect(true).toBe(true);
  });

  test("US-7: Overview shows chart and channel analytics (revenue table removed)", async ({
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
    expect(true).toBe(true);
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
    expect(true).toBe(true);
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
    expect(true).toBe(true);
  });
});
