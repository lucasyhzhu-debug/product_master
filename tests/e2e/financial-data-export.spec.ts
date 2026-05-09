import { test, expect } from "@playwright/test";
import { loginAsManager, loginAsRole, waitForDataLoad, screenshot } from "./helpers";

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

    // Click Generate; assert TWO file downloads
    const [download1, download2] = await Promise.all([
      page.waitForEvent("download"),
      page.waitForEvent("download"),
      page.getByRole("button", { name: /generate exports/i }).click(),
    ]);

    // D-11 — verbatim filename templates
    const fn1 = download1.suggestedFilename();
    const fn2 = download2.suggestedFilename();
    const filenames = [fn1, fn2];
    expect(filenames.some(f => /^frollie-transactions-\d{8}-\d{8}\.csv$/.test(f))).toBe(true);
    expect(filenames.some(f => /^frollie-pl-summary-\d{8}-\d{8}-(weekly|monthly|custom)\.csv$/.test(f))).toBe(true);

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
    const [download] = await Promise.all([
      page.waitForEvent("download"),
      page.getByRole("button", { name: /generate exports/i }).click(),
    ]);
    expect(download.suggestedFilename()).toMatch(/^frollie-transactions-\d{8}-\d{8}\.csv$/);
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

    // Click Generate; both files
    const [download1, download2] = await Promise.all([
      page.waitForEvent("download"),
      page.waitForEvent("download"),
      page.getByRole("button", { name: /generate exports/i }).click(),
    ]);

    const filenames = [download1.suggestedFilename(), download2.suggestedFilename()];

    // Filename must encode the user-selected dates exactly:
    //   transactions: frollie-transactions-20260413-20260419.csv
    //   pl: frollie-pl-summary-20260413-20260419-{granularity}.csv
    expect(filenames).toEqual(expect.arrayContaining([
      expect.stringMatching(/^frollie-transactions-20260413-20260419\.csv$/),
    ]));
    expect(filenames).toEqual(expect.arrayContaining([
      expect.stringMatching(/^frollie-pl-summary-20260413-20260419-(weekly|monthly|custom)\.csv$/),
    ]));
  });
});
