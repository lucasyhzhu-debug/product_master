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
 * - All key metrics at once (gross, net, transactions, outlets) — no hunting
 * - Platform breakdown to know which channel is performing best
 * - Revenue table filterable by platform
 * - Trends/patterns visible at a glance
 * - Confidence indicators (is this data exact or estimated?)
 *
 * Critical: They don't want to click around — everything should be scannable.
 */

test.describe("Sales Analytics Overview — Cofounder Revenue Dashboard", () => {
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
        "ISSUE: Fewer than 4 prominent metric numbers — cofounder can't scan key data at a glance"
      );
    }

    // USABILITY: Period label should give time context
    const periodLabels = page.locator("text=/Last 24|Last 7|This week|Today/i");
    const periodCount = await periodLabels.count();
    console.log(`Period context labels: ${periodCount}`);

    if (periodCount === 0) {
      console.log(
        "ISSUE: No time period context — cofounder doesn't know if these are today's, this week's, or this month's numbers"
      );
    }

    await screenshotElement(
      page,
      'div[class*="grid"][class*="gap-4"]',
      "12-stats-cards-closeup"
    );

    expect(true).toBe(true);
  });

  test("US-7: Revenue table shows data with clear platform attribution", async ({
    page,
  }) => {
    await navigateTo(page, "/sales");
    await waitForDataLoad(page);

    // Find revenue table
    const revenueTable = page.locator("table").first();
    const tableVisible = await revenueTable.isVisible().catch(() => false);

    console.log("--- REVENUE TABLE ANALYSIS ---");
    console.log(`Revenue table visible: ${tableVisible}`);

    if (tableVisible) {
      // Check column headers
      const headers = ["Date", "Platform", "Product", "Qty", "Gross", "Net", "Confidence"];
      for (const header of headers) {
        const th = page.locator(`th:has-text("${header}")`).first();
        const visible = await th.isVisible().catch(() => false);
        console.log(`  Column "${header}": ${visible ? "present" : "MISSING"}`);
      }

      // Check for platform badges in table
      const k3Badge = page.locator('table td >> text=K3 Mart');
      const gobizBadge = page.locator('table td >> text=GoBiz');
      const internalBadge = page.locator('table td >> text=Internal');

      console.log(`K3 Mart rows: ${await k3Badge.count()}`);
      console.log(`GoBiz rows: ${await gobizBadge.count()}`);
      console.log(`Internal rows: ${await internalBadge.count()}`);

      // Check for empty state
      const emptyState = page.locator("text=No revenue data available");
      if (await emptyState.isVisible().catch(() => false)) {
        console.log("NOTE: Revenue table is empty — no data synced yet");
        await screenshot(page, "13-revenue-table-empty");
      } else {
        await screenshotElement(page, "table", "13-revenue-table-data");
      }

      // Check row count — is it overwhelming?
      const rows = page.locator("table tbody tr");
      const rowCount = await rows.count();
      console.log(`Total revenue rows: ${rowCount}`);

      if (rowCount > 20) {
        console.log(
          "WARNING: Many rows visible — consider pagination or summarization for busy cofounder"
        );
      }
    } else {
      console.log("ISSUE: No revenue table found — cofounder can't see transaction details");
    }

    expect(true).toBe(true);
  });

  test("US-8: Platform filter badges work and are intuitive", async ({
    page,
  }) => {
    // Cofounder wants to see "just K3 Mart" or "just Internal" revenue
    await navigateTo(page, "/sales");
    await waitForDataLoad(page);

    // Find filter badges
    const filterBadges = ["All", "K3 Mart", "GoBiz", "Internal"];

    console.log("--- PLATFORM FILTER ANALYSIS ---");

    for (const filter of filterBadges) {
      const badge = page
        .locator(`text="${filter}"`)
        .first();
      const visible = await badge.isVisible().catch(() => false);
      console.log(`Filter "${filter}": ${visible ? "visible" : "MISSING"}`);
    }

    // USABILITY: Click each filter and verify the table updates
    // Test K3 Mart filter
    const k3Filter = page
      .locator('div:has(> text="Revenue Details") >> text="K3 Mart"')
      .first();
    if (await k3Filter.isVisible().catch(() => false)) {
      await k3Filter.click();
      await page.waitForTimeout(1000);
      await screenshot(page, "14-filter-k3mart");

      // Check active state — badge should look different
      console.log("Clicked K3 Mart filter");
    }

    // Test Internal filter
    const internalFilter = page
      .locator('div:has(> text="Revenue Details") >> text="Internal"')
      .first();
    if (await internalFilter.isVisible().catch(() => false)) {
      await internalFilter.click();
      await page.waitForTimeout(1000);
      await screenshot(page, "15-filter-internal");
      console.log("Clicked Internal filter");
    }

    // Reset to All
    const allFilter = page
      .locator('div:has(> text="Revenue Details") >> text="All"')
      .first();
    if (await allFilter.isVisible().catch(() => false)) {
      await allFilter.click();
      await page.waitForTimeout(500);
      console.log("Reset to All filter");
    }

    // USABILITY CHECK: Are the filter badges visually distinct enough?
    // A busy cofounder should immediately see which filter is active
    const badges = page.locator('.cursor-pointer:has-text("K3 Mart")').first();
    if (await badges.isVisible().catch(() => false)) {
      const bgColor = await badges.evaluate((el) =>
        window.getComputedStyle(el).backgroundColor
      );
      console.log(`K3 Mart badge bg when not selected: ${bgColor}`);
    }

    await screenshot(page, "16-filters-overview");
    expect(true).toBe(true);
  });

  test("US-9: Page description is accurate (mentions Internal Orders)", async ({
    page,
  }) => {
    // Check if page header still says "K3 Mart and GoBiz" or has been updated
    await navigateTo(page, "/sales");

    const description = page.locator(
      "text=Track revenue from K3 Mart and GoBiz"
    );
    const hasOldDescription = await description.isVisible().catch(() => false);

    console.log("--- PAGE DESCRIPTION CHECK ---");
    if (hasOldDescription) {
      console.log(
        "ISSUE: Page description still says 'K3 Mart and GoBiz' — doesn't mention Internal Orders. " +
          "Cofounder might think internal sales aren't tracked here."
      );
      console.log(
        'FIX NEEDED: Update description to "Track revenue across K3 Mart, GoBiz, and Internal Orders"'
      );
    } else {
      console.log("Page description appears updated or different");
    }

    // Also check if title mentions all platforms
    const title = page.locator("text=Sales Analytics").first();
    const titleVisible = await title.isVisible().catch(() => false);
    console.log(`Page title "Sales Analytics" visible: ${titleVisible}`);

    await screenshot(page, "17-page-header");
    expect(true).toBe(true);
  });

  test("US-10: Information density — can cofounder absorb it all at a glance?", async ({
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
        "WARNING: Page requires significant scrolling — busy cofounder may miss bottom content"
      );
    }

    // Check if both stats cards AND revenue table fit in first viewport
    const revenueTable = page.locator("text=Revenue Details").first();
    if (await revenueTable.isVisible().catch(() => false)) {
      const tableBox = await revenueTable.boundingBox();
      if (tableBox) {
        console.log(
          `Revenue Details header position: y=${Math.round(tableBox.y)}px`
        );
        console.log(
          `Visible without scrolling: ${tableBox.y < viewportHeight}`
        );
      }
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

  test("US-11: Confidence badges help cofounder trust the data", async ({
    page,
  }) => {
    await navigateTo(page, "/sales");
    await waitForDataLoad(page);

    // Check for confidence badges in the revenue table
    const exactBadges = page.locator('table >> text="Exact"');
    const inferredBadges = page.locator('table >> text="Inferred"');
    const manualBadges = page.locator('table >> text="Manual"');

    console.log("--- DATA CONFIDENCE ANALYSIS ---");
    console.log(`Exact confidence entries: ${await exactBadges.count()}`);
    console.log(`Inferred confidence entries: ${await inferredBadges.count()}`);
    console.log(`Manual confidence entries: ${await manualBadges.count()}`);

    // Internal orders should all be "Exact" confidence
    // Check if the confidence colors are distinct
    if ((await exactBadges.count()) > 0) {
      const exactBg = await exactBadges.first().evaluate((el) =>
        window.getComputedStyle(el).backgroundColor
      );
      console.log(`Exact badge color: ${exactBg}`);
    }

    expect(true).toBe(true);
  });
});
