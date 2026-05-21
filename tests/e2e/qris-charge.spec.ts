import { test, expect } from "@playwright/test";
import { loginAsManager, navigateTo, waitForDataLoad } from "./helpers";

/**
 * Phase 84 — QRIS Charge E2E (R6).
 *
 * Happy-path: with the QRIS flag on and an AwaitingPayment order, the "Charge via
 * QRIS" button opens the dialog, the dialog renders the active QR, and on a
 * simulated payment the order flips to PaymentReceived (reactive, no manual refresh).
 *
 * The full live Test-Mode loop (real Xendit create + simulate-payment) is gated on
 * a Test key so CI skips it cleanly; the button/dialog presence assertions run
 * whenever the dev deployment is reachable.
 *
 * RED STATE: the "Charge via QRIS" button + dialog do not exist until Plan 05
 * (84-05), and the create/webhook path until Plans 02–04. This spec is excluded
 * from vitest (vitest.config.ts excludes tests/e2e/**) and runs only under
 * Playwright; it is the Wave 0 acceptance scaffold.
 */

test.describe("QRIS Charge — AwaitingPayment → PaymentReceived", () => {
  test.beforeEach(async ({ page }) => {
    await loginAsManager(page);
  });

  test("Charge via QRIS button opens the dialog and shows the active QR", async ({ page }) => {
    await navigateTo(page, "/orders");
    await waitForDataLoad(page);

    // Open an AwaitingPayment order's detail page (first match).
    const awaiting = page.locator("text=AwaitingPayment").first();
    await awaiting.click();
    await waitForDataLoad(page);

    const chargeButton = page.getByRole("button", { name: /charge via qris/i });
    await expect(chargeButton).toBeVisible();
    await chargeButton.click();

    // Dialog renders an active QR (svg) once the create action returns.
    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();
    await expect(dialog.locator("svg")).toBeVisible();
  });

  // Live Test-Mode loop — needs a Xendit Test key + reachable webhook URL.
  test.skip(!process.env.XENDIT_API_KEY, "no Xendit Test key configured");
  test("simulate-payment flips the order to PaymentReceived (reactive)", async ({ page }) => {
    await navigateTo(page, "/orders");
    await waitForDataLoad(page);

    const awaiting = page.locator("text=AwaitingPayment").first();
    await awaiting.click();
    await waitForDataLoad(page);

    await page.getByRole("button", { name: /charge via qris/i }).click();
    const dialog = page.getByRole("dialog");
    await expect(dialog.locator("svg")).toBeVisible();

    // (Test harness triggers the Xendit simulate-payment webhook here.)
    // The dialog flips to a paid panel reactively via the Convex subscription.
    await expect(dialog.getByText(/paid/i)).toBeVisible({ timeout: 30_000 });
    await expect(page.getByText(/PaymentReceived/i).first()).toBeVisible();
  });
});
