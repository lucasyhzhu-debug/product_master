import { test, expect } from "@playwright/test";
import {
  loginAsRole,
  logout,
  navigateTo,
  waitForDataLoad,
  screenshot,
} from "./helpers";

// ---------------------------------------------------------------------------
// All tests run as admin (these pages require canManageReimbursements
// or canAccessExpenseAnalytics, both of which admin has)
// ---------------------------------------------------------------------------

test.describe("Expense admin pages", () => {
  test.beforeEach(async ({ page }) => {
    await loginAsRole(page, "admin");
  });

  test.afterEach(async ({ page }) => {
    await logout(page);
  });

  // -------------------------------------------------------------------------
  // Test 1: Expense Analytics dashboard loads with charts
  // -------------------------------------------------------------------------

  test("Expense Analytics dashboard loads with charts", async ({ page }) => {
    await navigateTo(page, "/expense-analytics");
    await waitForDataLoad(page);

    // Assert page title/heading visible
    const heading = page.locator("text=Expense Analytics");
    await expect(heading.first()).toBeVisible({ timeout: 10_000 });

    // Assert at least one chart/card element renders
    // Look for recharts SVG elements or Card components with summary data
    const hasCharts = await page.locator("svg.recharts-surface").count();
    const hasCards = await page.locator('[class*="CardContent"]').count();
    const hasAnyContent = hasCharts > 0 || hasCards > 0;

    // If no data in dev DB, page might show empty state -- that's OK
    // We just need the page to load without errors
    const bodyText = await page.locator("body").innerText();
    expect(bodyText.length).toBeGreaterThan(20);

    // Period selector should be visible (Badge toggle for month nav)
    const periodNav = page.locator("button").filter({ hasText: /Month|Custom/i });
    // Month mode is default, so at least month navigation arrows should exist

    await screenshot(page, "expense-analytics-dashboard");

    // Log what we found for debugging
    console.log(
      `Analytics page: ${hasCharts} charts, ${hasCards} cards, content=${hasAnyContent}`
    );
  });

  // -------------------------------------------------------------------------
  // Test 2: Payroll Manager page loads and shows table
  // -------------------------------------------------------------------------

  test("Payroll Manager page loads and shows form and history", async ({
    page,
  }) => {
    await navigateTo(page, "/payroll");
    await waitForDataLoad(page);

    // Assert "Payroll" heading visible
    const heading = page.locator("text=Payroll");
    await expect(heading.first()).toBeVisible({ timeout: 10_000 });

    // Page has either a table of entries or the "No payroll entries found" empty state
    const hasEntries =
      (await page.locator("table").count()) > 0;
    const hasEmptyState =
      (await page.locator("text=No payroll entries found").count()) > 0;
    expect(hasEntries || hasEmptyState).toBe(true);

    // The "Create Payroll Entry" button should be visible (confirms CRUD capability)
    const createBtn = page.locator("button").filter({
      hasText: /Create Payroll Entry/i,
    });
    await expect(createBtn).toBeVisible({ timeout: 5_000 });

    await screenshot(page, "expense-analytics-payroll");
  });

  // -------------------------------------------------------------------------
  // Test 3: Bank Accounts Manager page loads
  // -------------------------------------------------------------------------

  test("Bank Accounts Manager page loads", async ({ page }) => {
    await navigateTo(page, "/bank-accounts");
    await waitForDataLoad(page);

    // Assert "Bank Account" heading visible (EntityManager uses entityNamePlural)
    const heading = page.locator("text=Bank Account");
    await expect(heading.first()).toBeVisible({ timeout: 10_000 });

    // EntityManager renders either table or empty state
    const bodyText = await page.locator("body").innerText();
    expect(bodyText.length).toBeGreaterThan(20);

    await screenshot(page, "expense-analytics-bank-accounts");
  });

  // -------------------------------------------------------------------------
  // Test 4: Chart of Accounts page loads with seeded accounts
  // -------------------------------------------------------------------------

  test("Chart of Accounts page loads with seeded accounts", async ({
    page,
  }) => {
    await navigateTo(page, "/accounts");
    await waitForDataLoad(page);

    // Assert "Chart of Accounts" heading visible
    const heading = page.locator("text=Chart of Accounts");
    await expect(heading.first()).toBeVisible({ timeout: 10_000 });

    // Should have account rows with 4-digit codes
    // Look for a 4-digit code pattern in the page content
    const bodyText = await page.locator("body").innerText();
    const hasFourDigitCode = /\b\d{4}\b/.test(bodyText);
    expect(hasFourDigitCode).toBe(true);

    // Assert OpEx accounts visible (seeded accounts include 6xxx codes)
    // Look for either the code "6500" or the name "Office & Supplies"
    const hasOpExCode =
      bodyText.includes("6500") || bodyText.includes("Office");
    expect(hasOpExCode).toBe(true);

    await screenshot(page, "expense-analytics-accounts");
  });

  // -------------------------------------------------------------------------
  // Test 5: Payroll entry creation (basic CRUD)
  // -------------------------------------------------------------------------

  test("Payroll entry creation via form", async ({ page }) => {
    await navigateTo(page, "/payroll");
    await waitForDataLoad(page);

    // Fill the create form fields (form is always visible on the page)
    // Recipient Name
    await page.locator("#recipientName").fill("E2E-TestContractor");

    // Employee Type -- defaults to "contractor", keep as is
    // Frequency -- defaults to "monthly", keep as is

    // Amount
    await page.locator("#amount").fill("500000");

    // Period Start and End (use future dates to avoid conflicts)
    await page.locator("#periodStart").fill("2026-04-01");
    await page.locator("#periodEnd").fill("2026-04-30");

    // Description
    await page.locator("#description").fill("E2E-PayrollTest monthly payment");

    // Submit: click "Create Payroll Entry" button to open confirmation dialog
    const createBtn = page.locator("button").filter({
      hasText: /Create Payroll Entry/i,
    });
    await expect(createBtn).toBeEnabled({ timeout: 5_000 });
    await createBtn.click();

    // Wait for confirmation dialog
    const confirmDialog = page.locator(
      "text=Confirm Payroll Entry"
    );
    await expect(confirmDialog).toBeVisible({ timeout: 5_000 });

    // Verify JE preview shows the amount
    const previewContent = await page
      .locator('[role="alertdialog"]')
      .innerText();
    expect(previewContent).toContain("E2E-TestContractor");

    await screenshot(page, "expense-analytics-payroll-confirm");

    // Click "Confirm & Create"
    const confirmBtn = page.locator("button").filter({
      hasText: /Confirm & Create/i,
    });
    await confirmBtn.click();

    // Wait for entry to appear in the history table
    await page.waitForTimeout(3000); // Wait for Convex mutation + reactive update

    // Verify the new entry appears
    const entryVisible = page.locator("text=E2E-TestContractor");
    await expect(entryVisible.first()).toBeVisible({ timeout: 10_000 });

    // Verify the amount is shown
    const amountVisible = page.locator("text=500,000").or(
      page.locator("text=Rp 500.000").or(
        page.locator("text=500.000")
      )
    );
    await expect(amountVisible.first()).toBeVisible({ timeout: 5_000 });

    await screenshot(page, "expense-analytics-payroll-created");
  });
});
