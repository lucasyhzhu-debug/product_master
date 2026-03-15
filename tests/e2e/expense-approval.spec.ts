import { test, expect, type Page } from "@playwright/test";
import {
  loginAsRole,
  logout,
  fillExpenseForm,
  navigateTo,
  waitForDataLoad,
  screenshot,
} from "./helpers";

// ---------------------------------------------------------------------------
// Expense Approval Edge Cases
// ---------------------------------------------------------------------------
// Tests: self-approval block, DoA thresholds, rejection + resubmit, fraud flags
//
// Receipt requirement: amounts > Rp 50,000 require receipt upload (EXP-03).
// Tests 1/3/4 use 50000 (at threshold, NOT above -- no receipt needed).
// Test 2 uses 600000 (above 500K DoA threshold) and uploads a dummy receipt.

/**
 * Navigate to a page with retry on "Something went wrong" error boundary.
 * Convex pages may show error boundary on first load due to connection timing.
 */
async function navigateWithRetry(page: Page, urlPath: string, retries = 2) {
  for (let attempt = 0; attempt <= retries; attempt++) {
    await navigateTo(page, urlPath);
    // Check for Convex error boundary
    const errorBoundary = page.locator("text=Something went wrong");
    if (await errorBoundary.isVisible({ timeout: 1_000 }).catch(() => false)) {
      if (attempt < retries) {
        await page.reload({ waitUntil: "networkidle" });
        await page.waitForTimeout(3000);
      }
    } else {
      return;
    }
  }
}

/**
 * Submit an expense by clicking "Submit for Approval" and waiting for redirect.
 * The ExpenseSubmit page navigates to /expenses on success.
 */
async function submitAndWaitForRedirect(page: Page) {
  await page.locator("button").filter({ hasText: "Submit for Approval" }).click();
  await page.waitForURL((url) => url.pathname === "/expenses", {
    timeout: 20_000,
  });
  await waitForDataLoad(page);
}

/**
 * Upload a dummy receipt image via the file chooser.
 * Creates a unique PNG per call (appends timestamp bytes) to avoid FRAUD-02
 * receipt hash duplicate rejection on repeated runs.
 */
async function uploadDummyReceipt(page: Page) {
  const fileInput = page.locator('input[type="file"][accept*="image"]');

  // Minimal 1x1 white PNG + timestamp suffix for unique SHA-256 hash per run
  const basePng = Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/5+hHgAHggJ/PchI7wAAAABJRU5ErkJggg==",
    "base64"
  );
  // Append timestamp bytes to make each upload uniquely hashable
  const suffix = Buffer.from(`\n<!-- e2e-${Date.now()}-${Math.random()} -->`);
  const uniquePng = Buffer.concat([basePng, suffix]);

  await fileInput.setInputFiles({
    name: "e2e-receipt.png",
    mimeType: "image/png",
    buffer: uniquePng,
  });

  // Wait for upload to complete
  await expect(
    page.locator("text=/Receipt attached|e2e-receipt/i")
  ).toBeVisible({ timeout: 15_000 });
}

test.describe.serial("Expense Approval Edge Cases", () => {
  // =========================================================================
  // Test 1: Self-approval block
  // =========================================================================
  test("admin cannot approve their own submitted expense", async ({ page }) => {
    // Admin submits an expense (50000 = at threshold, no receipt needed)
    await loginAsRole(page, "admin");
    await navigateWithRetry(page, "/expenses/new");
    await fillExpenseForm(page, {
      description: "E2E-SelfApproval-Test",
      amount: "50000",
      vendorName: "E2E Self Test",
      glCategory: "Office & Supplies",
    });

    await submitAndWaitForRedirect(page);

    // Navigate to approval queue as the same admin
    await navigateWithRetry(page, "/expenses/approve");
    await waitForDataLoad(page);
    await screenshot(page, "approval-01-self-approval-check");

    // Admin's own expense should NOT appear in their approval queue
    // Backend filters by submittedBy !== currentUser
    await expect(
      page.locator("text=E2E-SelfApproval-Test")
    ).not.toBeVisible({ timeout: 5_000 });
  });

  // =========================================================================
  // Test 2: DoA threshold -- Manager cannot approve > 500K
  // =========================================================================
  test("manager cannot approve expense > 500K, admin can with comment", async ({ page }) => {
    // order_staff submits a 600K expense (receipt required for > 50K)
    await loginAsRole(page, "order_staff");
    await navigateWithRetry(page, "/expenses/new");
    await fillExpenseForm(page, {
      description: "E2E-DoA-HighAmount",
      amount: "600000",
      vendorName: "E2E DoA Test",
      glCategory: "Office & Supplies",
    });

    // Upload dummy receipt (required for amounts > 50K)
    await uploadDummyReceipt(page);

    await submitAndWaitForRedirect(page);

    // Manager checks approval queue -- should NOT see the 600K expense
    await logout(page);
    await loginAsRole(page, "manager");
    await navigateWithRetry(page, "/expenses/approve");
    await waitForDataLoad(page);
    await screenshot(page, "approval-02-doa-manager-view");

    // Manager's DoA threshold is 500K -- the 600K expense is filtered out
    await expect(
      page.locator("text=E2E-DoA-HighAmount")
    ).not.toBeVisible({ timeout: 5_000 });

    // Admin CAN see and approve the 600K expense
    await logout(page);
    await loginAsRole(page, "admin");
    await navigateWithRetry(page, "/expenses/approve");
    await waitForDataLoad(page);
    await screenshot(page, "approval-03-doa-admin-view");

    // 600K expense IS visible in admin's queue
    const doaCard = page.locator("text=E2E-DoA-HighAmount");
    await expect(doaCard).toBeVisible({ timeout: 10_000 });

    // Find the card and click Approve
    const expenseCard = page
      .locator('[class*="CardContent"], [class*="card"]')
      .filter({ hasText: "E2E-DoA-HighAmount" })
      .first();
    await expenseCard
      .locator("button")
      .filter({ hasText: "Approve" })
      .click();

    // Comment dialog should appear (>= 500K requires comment)
    const dialog = page.locator('[role="dialog"]');
    await expect(dialog).toBeVisible({ timeout: 5_000 });

    // Fill the comment textarea and confirm
    await dialog.locator("textarea").fill("E2E DoA approval test");
    await dialog
      .locator("button")
      .filter({ hasText: "Confirm Approve" })
      .click();

    // Wait for dialog to close
    await expect(dialog).not.toBeVisible({ timeout: 10_000 });
    await page.waitForTimeout(2000);
    await screenshot(page, "approval-04-doa-approved");
  });

  // =========================================================================
  // Test 3: Rejection flow + resubmit
  // =========================================================================
  test("admin rejects expense, submitter sees rejection status", async ({ page }) => {
    // order_staff submits an expense (50000 = at threshold, no receipt needed)
    await loginAsRole(page, "order_staff");
    await navigateWithRetry(page, "/expenses/new");
    await fillExpenseForm(page, {
      description: "E2E-Rejection-Test",
      amount: "50000",
      vendorName: "E2E Reject Test",
      glCategory: "Office & Supplies",
    });

    await submitAndWaitForRedirect(page);

    // Admin rejects it
    await logout(page);
    await loginAsRole(page, "admin");
    await navigateWithRetry(page, "/expenses/approve");
    await waitForDataLoad(page);

    // Find the expense card
    const rejectionCard = page
      .locator('[class*="CardContent"], [class*="card"]')
      .filter({ hasText: "E2E-Rejection-Test" })
      .first();
    await expect(rejectionCard).toBeVisible({ timeout: 10_000 });

    // Click Reject
    await rejectionCard
      .locator("button")
      .filter({ hasText: "Reject" })
      .click();

    // Fill rejection reason in dialog
    const rejectDialog = page.locator('[role="dialog"]');
    await expect(rejectDialog).toBeVisible({ timeout: 5_000 });
    await rejectDialog.locator("textarea").fill("E2E test rejection: invalid vendor");

    // Confirm reject
    await rejectDialog
      .locator("button")
      .filter({ hasText: "Confirm Reject" })
      .click();

    // Wait for dialog to close
    await expect(rejectDialog).not.toBeVisible({ timeout: 10_000 });
    await page.waitForTimeout(2000);
    await screenshot(page, "approval-05-rejected");

    // order_staff sees rejection status
    await logout(page);
    await loginAsRole(page, "order_staff");
    await navigateWithRetry(page, "/expenses");
    await waitForDataLoad(page);
    await screenshot(page, "approval-06-submitter-sees-rejection");

    // The rejected expense should show "Rejected" status badge
    const rejectedBadge = page.locator("text=Rejected").first();
    await expect(rejectedBadge).toBeVisible({ timeout: 10_000 });
  });

  // =========================================================================
  // Test 4: Fraud flag visibility (late submission)
  // =========================================================================
  test("late submission fraud flag badge appears for old expense date", async ({ page }) => {
    // Calculate a date guaranteed to be > 14 days ago (use 20 days)
    const now = new Date();
    const lateDate = new Date(now.getTime() - 20 * 24 * 60 * 60 * 1000);
    const lateDateStr = lateDate.toISOString().split("T")[0]; // YYYY-MM-DD format

    // order_staff submits expense with old date (50000 = at threshold, no receipt)
    await loginAsRole(page, "order_staff");
    await navigateWithRetry(page, "/expenses/new");
    await fillExpenseForm(page, {
      description: "E2E-LateSubmission-Test",
      amount: "50000",
      vendorName: "E2E Late Test",
      glCategory: "Office & Supplies",
    });

    // Set the expense date to 20 days ago
    await page.locator("#expenseDate").fill(lateDateStr);

    await submitAndWaitForRedirect(page);

    // Admin views the approval queue and checks for Late flag
    await logout(page);
    await loginAsRole(page, "admin");
    await navigateWithRetry(page, "/expenses/approve");
    await waitForDataLoad(page);

    // Find the late expense card
    const lateCard = page
      .locator('[class*="CardContent"], [class*="card"]')
      .filter({ hasText: "E2E-LateSubmission-Test" })
      .first();
    await expect(lateCard).toBeVisible({ timeout: 10_000 });
    await screenshot(page, "approval-07-fraud-flag-late");

    // Assert: "Late" fraud flag badge is visible
    // FraudFlags component renders "Late (>14 days)" text
    const lateBadge = lateCard.locator("text=/Late/i").first();
    await expect(lateBadge).toBeVisible({ timeout: 5_000 });

    // Approve the late expense to clean up the queue (< 500K = direct approve)
    await lateCard
      .locator("button")
      .filter({ hasText: "Approve" })
      .click();

    await page.waitForTimeout(3000);
    await screenshot(page, "approval-08-late-approved");
  });
});
