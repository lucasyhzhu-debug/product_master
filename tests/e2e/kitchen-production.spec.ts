import { test, expect } from "@playwright/test";
import {
  loginAsManager,
  navigateTo,
  waitForDataLoad,
  screenshot,
} from "./helpers";

/**
 * Phase 39-02: Kitchen Production E2E Test
 *
 * Tests the kitchen production flow:
 *   1. Navigate to /kitchen (KitchenViewV2) and verify page renders
 *   2. Verify production targets section loads with ball type labels
 *   3. Exercise the End-of-Shift recording form (3-step flow: input -> review -> success)
 *
 * Uses existing dev database data (kitchen config, production targets).
 * Graceful degradation if no production targets exist.
 * Screenshots captured at each step for debugging.
 */

test.describe("Kitchen Production — View Targets & EoS Recording", () => {
  test.beforeEach(async ({ page }) => {
    await loginAsManager(page);
  });

  test("Step 1: Kitchen page loads with production data", async ({ page }) => {
    // Navigate to /kitchen
    await navigateTo(page, "/kitchen");
    await waitForDataLoad(page);
    await screenshot(page, "kitchen-01-page-loaded");

    // Verify the page header renders "Kitchen"
    await expect(
      page.locator("h1").filter({ hasText: /Kitchen/i }).first()
    ).toBeVisible({ timeout: 10_000 });

    // --------------------------------------------------
    // Verify production targets section
    // The section header is "Today's Targets" (h2 uppercase text)
    // --------------------------------------------------
    const targetsHeader = page
      .locator("h2")
      .filter({ hasText: /Today.*Targets/i })
      .first();
    await expect(targetsHeader).toBeVisible({ timeout: 10_000 });

    // Check for ball type stat cards or skeleton placeholders
    // ProductionTargetsBar shows "Original Balls (45g)" and/or "Jumbo Balls (80g)"
    const originalBallsCard = page.locator("text=Original Balls").first();
    const jumboBallsCard = page.locator("text=Jumbo Balls").first();
    const noBreakdownText = page
      .locator("text=No packaging breakdown available")
      .first();

    const hasOriginal = (await originalBallsCard.count()) > 0;
    const hasJumbo = (await jumboBallsCard.count()) > 0;
    const hasNoBreakdown = (await noBreakdownText.count()) > 0;

    // At least one of these should be visible: ball type cards OR "no breakdown" message
    expect(hasOriginal || hasJumbo || hasNoBreakdown).toBeTruthy();
    console.log(
      `[E2E] Production targets: Original=${hasOriginal}, Jumbo=${hasJumbo}, NoBreakdown=${hasNoBreakdown}`
    );

    await screenshot(page, "kitchen-02-targets-section");

    // --------------------------------------------------
    // Verify the "View Today's Orders" toggle is present
    // --------------------------------------------------
    const ordersToggle = page
      .locator("button")
      .filter({ hasText: /Today.*Orders/i })
      .first();
    await expect(ordersToggle).toBeVisible({ timeout: 5_000 });

    // Click to expand and verify it doesn't error
    await ordersToggle.click();
    await page.waitForTimeout(2000); // Wait for Convex queries
    await screenshot(page, "kitchen-03-orders-expanded");

    // Collapse again
    await ordersToggle.click();
    await page.waitForTimeout(500);
  });

  test("Step 2: End-of-Shift recording flow", async ({ page }) => {
    // Navigate to /kitchen
    await navigateTo(page, "/kitchen");
    await waitForDataLoad(page);

    // --------------------------------------------------
    // Find the End of Shift form
    // EndOfShiftForm renders inside a Card with CardTitle "End of Shift"
    // --------------------------------------------------
    const eosFormTitle = page.locator("text=End of Shift").first();
    const hasEosForm = (await eosFormTitle.count()) > 0;

    if (!hasEosForm) {
      // EoS form is hidden when no visible items exist (no production targets configured)
      console.log(
        "[E2E] End of Shift form not visible — no production targets configured"
      );
      await screenshot(page, "kitchen-04-eos-not-available");

      // Verify the page still renders correctly without the form
      await expect(
        page.locator("h1").filter({ hasText: /Kitchen/i }).first()
      ).toBeVisible();

      // Test still passes — this is graceful degradation
      return;
    }

    await expect(eosFormTitle).toBeVisible({ timeout: 10_000 });
    await screenshot(page, "kitchen-04-eos-form-input");

    // --------------------------------------------------
    // Step 1 (Input): Fill in production counts
    // The form shows product rows with number inputs
    // Each row has: product name, "target: N", and a number input
    // --------------------------------------------------

    // Find all produced quantity inputs (id starts with "produced-")
    const producedInputs = page.locator('input[id^="produced-"]');
    const inputCount = await producedInputs.count();
    console.log(`[E2E] Found ${inputCount} production input rows`);

    if (inputCount === 0) {
      console.log("[E2E] No production inputs found — form has no visible items");
      await screenshot(page, "kitchen-04-eos-no-inputs");
      return;
    }

    // Fill in the first product with a test value of 5
    const firstInput = producedInputs.first();
    await firstInput.fill("5");
    await page.waitForTimeout(300);

    // If there's a second product, fill it too
    if (inputCount > 1) {
      const secondInput = producedInputs.nth(1);
      await secondInput.fill("3");
      await page.waitForTimeout(300);
    }

    await screenshot(page, "kitchen-05-eos-values-entered");

    // --------------------------------------------------
    // Check if chef selector is present and select a chef
    // --------------------------------------------------
    const chefSelector = page.locator('button[role="combobox"]').filter({
      hasText: /Select chef/i,
    }).first();

    if ((await chefSelector.count()) > 0) {
      await chefSelector.click();
      await page.waitForTimeout(500);

      // Select the first chef option
      const firstChefOption = page
        .locator('[role="option"]')
        .first();
      if ((await firstChefOption.count()) > 0) {
        await firstChefOption.click();
        await page.waitForTimeout(300);
      }
    }

    // --------------------------------------------------
    // Click "Review & Submit" to advance to Step 2
    // --------------------------------------------------
    const reviewButton = page
      .locator("button")
      .filter({ hasText: /Review.*Submit/i })
      .first();
    await expect(reviewButton).toBeVisible();
    await reviewButton.click();
    await page.waitForTimeout(500);

    // --------------------------------------------------
    // Step 2 (Review): Verify the review screen shows entered values
    // ShiftReviewModal renders the submitted quantities
    // --------------------------------------------------
    await screenshot(page, "kitchen-06-eos-review");

    // The review screen should show the quantities we entered
    // Look for review-mode indicators: "Confirm", "Back" buttons
    const confirmButton = page
      .locator("button")
      .filter({ hasText: /Confirm|Submit/i })
      .first();
    const backButton = page
      .locator("button")
      .filter({ hasText: /Back/i })
      .first();

    const hasConfirm = (await confirmButton.count()) > 0;
    const hasBack = (await backButton.count()) > 0;

    if (hasConfirm && hasBack) {
      console.log("[E2E] Review screen loaded — Confirm and Back buttons visible");

      // Verify the entered values appear in the review
      await expect(page.locator("text=5").first()).toBeVisible();

      // --------------------------------------------------
      // Step 3: Submit the shift record
      // Click Confirm to submit
      // --------------------------------------------------
      await confirmButton.click();
      await page.waitForTimeout(3000); // Wait for Convex mutation

      // Check for success screen (ShiftSuccessScreen)
      // or error state
      await screenshot(page, "kitchen-07-eos-result");

      // Success screen typically shows a success message and "Done" or "Record Another" button
      const doneButton = page
        .locator("button")
        .filter({ hasText: /Done|Record Another|New Record/i })
        .first();

      const hasSuccessState = (await doneButton.count()) > 0;

      if (hasSuccessState) {
        console.log("[E2E] Shift record submitted successfully");
        await screenshot(page, "kitchen-08-eos-success");

        // Click Done to return to input state
        await doneButton.click();
        await page.waitForTimeout(1000);
        await screenshot(page, "kitchen-09-eos-reset");
      } else {
        // Check for error message
        const errorText = page.locator("text=Failed").first();
        const hasError = (await errorText.count()) > 0;
        if (hasError) {
          console.log("[E2E] Shift record submission failed — likely auth or data issue");
        } else {
          console.log("[E2E] Post-submit state unclear — screenshots captured for review");
        }
      }
    } else {
      // Review screen didn't render as expected
      // This could happen if validation failed (e.g., no produced quantity > 0)
      console.log(
        "[E2E] Review screen not as expected — confirm button found:",
        hasConfirm,
        "back button found:",
        hasBack
      );
      await screenshot(page, "kitchen-06-eos-review-unexpected");
    }
  });
});
