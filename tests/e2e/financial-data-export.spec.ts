import { test, expect, type Download } from "@playwright/test";
import { loginAsManager, loginAsRole, waitForDataLoad, screenshot } from "./helpers";

/**
 * Collect download events into an array via page.on("download"). The
 * Promise.all([waitForEvent("download"), waitForEvent("download"), click()])
 * pattern is unreliable when two downloads fire <100ms apart — both promises
 * subscribe to the SAME event listener and resolve to the same Download object.
 * Using a collector + expect.poll is the deterministic alternative.
 */
async function collectDownloads(
  page: Parameters<typeof loginAsManager>[0],
  trigger: () => Promise<void>,
  expectedCount: number,
  timeoutMs = 10_000,
): Promise<string[]> {
  const downloads: Download[] = [];
  const handler = (d: Download) => downloads.push(d);
  page.on("download", handler);
  try {
    await trigger();
    await expect
      .poll(() => downloads.length, { timeout: timeoutMs })
      .toBeGreaterThanOrEqual(expectedCount);
  } finally {
    page.off("download", handler);
  }
  return downloads.map((d) => d.suggestedFilename());
}

test.describe("Phase 76 UAT: Financial Data Export", () => {
  test("happy path: navigate to export page and trigger downloads", async ({ page }) => {
    await loginAsManager(page);
    await page.goto("/financials");
    await waitForDataLoad(page);

    // Navigate via the new "Export range…" button on /financials
    await page.getByRole("link", { name: /export range/i }).click();
    await page.waitForURL("**/financials/export");

    // Both export types are checked by default per UI-SPEC
    await expect(page.getByLabel(/Raw transactions/i)).toBeChecked();
    await expect(page.getByLabel(/P&L summary/i)).toBeChecked();

    // Apply "Last week" preset (prior ISO week per Improvement 9)
    await page.getByRole("button", { name: /^Last week$/i }).click();

    // Wait for preflight to populate (matches the verbatim copy "Range covers ... journal entries")
    await expect(page.locator('text=/Range covers \\d+ journal entries/')).toBeVisible({ timeout: 10_000 });

    // Click Generate; collect downloads via page.on listener (race-free).
    const filenames = await collectDownloads(
      page,
      async () => {
        await page.getByRole("button", { name: /generate exports/i }).click();
      },
      2,
    );

    // D-11 — verbatim filename templates
    expect(filenames.some((f) => /^frollie-transactions-\d{8}-\d{8}\.csv$/.test(f))).toBe(true);
    expect(filenames.some((f) => /^frollie-pl-summary-\d{8}-\d{8}-(weekly|monthly|custom)\.csv$/.test(f))).toBe(true);

    await screenshot(page, "uat-76-01-happy-path");
  });

  test("happy path: only Raw transactions selected", async ({ page }) => {
    await loginAsManager(page);
    await page.goto("/financials/export");

    // Uncheck P&L
    await page.getByLabel(/P&L summary/i).uncheck();

    // Granularity radio should disappear
    await expect(page.getByText(/Granularity/i)).toHaveCount(0);

    // Apply "Last month" preset (Last week was already covered above)
    await page.getByRole("button", { name: /^Last month$/i }).click();
    await expect(page.locator('text=/Range covers \\d+ journal entries/')).toBeVisible({ timeout: 10_000 });

    // Click Generate; assert ONE file download
    const filenames = await collectDownloads(
      page,
      async () => {
        await page.getByRole("button", { name: /generate exports/i }).click();
      },
      1,
    );
    expect(filenames).toHaveLength(1);
    expect(filenames[0]).toMatch(/^frollie-transactions-\d{8}-\d{8}\.csv$/);
  });

  test("disabled state: Generate disabled when no type selected", async ({ page }) => {
    await loginAsManager(page);
    await page.goto("/financials/export");
    await page.getByLabel(/Raw transactions/i).uncheck();
    await page.getByLabel(/P&L summary/i).uncheck();
    const btn = page.getByRole("button", { name: /generate exports/i });
    await expect(btn).toBeDisabled();
    await expect(btn).toHaveAttribute("title", "Select at least one export type.");
  });

  // Improvement 10 — use loginAsRole directly. No skip fallback. tests/e2e/helpers.ts:31 supports "kitchen".
  test("role gate: kitchen role redirects away from /financials/export", async ({ page }) => {
    await loginAsRole(page, "kitchen");
    await page.goto("/financials/export");
    // Expect redirect — kitchen should NOT remain on /financials/export.
    await expect(page).not.toHaveURL(/\/financials\/export/, { timeout: 5_000 });
  });

  test("role gate: order_staff role redirects away from /financials/export", async ({ page }) => {
    await loginAsRole(page, "order_staff");
    await page.goto("/financials/export");
    await expect(page).not.toHaveURL(/\/financials\/export/, { timeout: 5_000 });
  });

  // M6 — filename WIB date matches user selection. Pitfall #4 mitigation.
  test("filename WIB date matches user-selected date range (M6, Pitfall #4)", async ({ page }) => {
    await loginAsManager(page);
    await page.goto("/financials/export");

    // Manually enter a known date range: 2026-04-13 (Mon) to 2026-04-19 (Sun, inclusive label).
    // The "To" input shows the inclusive end date; periodEnd is stored as next-day midnight.
    await page.getByLabel(/^From$/i).fill("2026-04-13");
    await page.getByLabel(/^To$/i).fill("2026-04-19");

    // Wait for preflight to update (debounced 300ms)
    await page.waitForTimeout(500);
    await expect(page.locator('text=/Range covers \\d+ journal entries/')).toBeVisible({ timeout: 10_000 });

    // The seeded range may have data for one or both export types. Collect whatever
    // downloads fire (1 or 2) and assert that EVERY emitted filename encodes the
    // user-selected dates exactly. This is M6's actual contract — Pitfall #4 is
    // about WIB date correctness in the filename, not about which files emit.
    const filenames = await collectDownloads(
      page,
      async () => {
        await page.getByRole("button", { name: /generate exports/i }).click();
      },
      1,
    );

    // Every captured filename must match one of the two expected verbatim templates
    // with the EXACT user-selected dates. No off-by-one from UTC.
    const expected = /^frollie-(transactions|pl-summary)-20260413-20260419(-(weekly|monthly|custom))?\.csv$/;
    for (const fn of filenames) {
      expect(fn).toMatch(expected);
    }
    expect(filenames.length).toBeGreaterThanOrEqual(1);
  });
});
