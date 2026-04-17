/**
 * Phase 74 Plan 04 — Playwright E2E smoke for the clock-in gate + kitchen
 * view + clock-out flow.
 *
 * The happy-path test is SKIPPED by default because it requires:
 *   1. The Vite dev server + `npx convex dev` running
 *   2. A seeded kitchen user (E2E-Kitchen with PIN 999999 — handled by
 *      tests/e2e/global-setup.ts)
 *
 * To run locally:
 *   PLAYWRIGHT_E2E_FULL=1 npx playwright test tests/e2e/staff-attendance.spec.ts
 *
 * The prior-day-block and manager correction flows are explicitly
 * `test.skip`ped — they require DB seeding hooks beyond what global-setup
 * provides (a user with a prior-day open shift, and a flagged-shift fixture).
 * Both flows are covered by the convex-test mutation tests and persisted
 * to the phase's HUMAN-UAT sheet for /gsd-verify-work 74.
 */

import { test, expect } from "@playwright/test";
import { loginAsRole } from "./helpers";

test.describe.configure({ mode: "serial" });

test.describe("Staff Attendance E2E", () => {
  test.skip(
    !process.env.PLAYWRIGHT_E2E_FULL,
    "Set PLAYWRIGHT_E2E_FULL=1 to run (requires dev server + seeded kitchen user)",
  );

  test("clock-in gate → kitchen view → clock-out", async ({ page }) => {
    // 1. Login as seeded kitchen user via the shared avatar-grid + PIN helper.
    await loginAsRole(page, "kitchen");

    // 2. Kitchen role lands on /kitchen/clock (gate screen) — getRoleLandingPage.
    await expect(page).toHaveURL(/\/kitchen\/clock/, { timeout: 10_000 });

    // 3. Gate screen shows one-tap Clock-In button.
    const clockInBtn = page.getByRole("button", { name: /Clock In/i });
    await expect(clockInBtn).toBeVisible({ timeout: 5_000 });

    // 4. Tap Clock-In.
    await clockInBtn.click();

    // 5. Redirected to /kitchen (KitchenViewV2).
    await expect(page).toHaveURL(/\/kitchen(\/?$|\?)/, { timeout: 5_000 });

    // 6. AttendanceStrip shows running timer + Clock-Out button.
    const clockOutBtn = page.getByRole("button", { name: /Clock Out/i });
    await expect(clockOutBtn).toBeVisible({ timeout: 5_000 });

    // 7. Tap Clock-Out.
    await clockOutBtn.click();

    // 8. Timer + button should disappear once the shift closes.
    await expect(page.getByRole("button", { name: /Clock Out/i })).toHaveCount(
      0,
      { timeout: 10_000 },
    );
  });

  test("prior-day open shift blocks clock-in (D-04)", async () => {
    test.skip(
      true,
      "Requires DB seed hook to pre-create yesterday's open shift — deferred to HUMAN-UAT (see 74-VALIDATION.md Manual-Only Verifications).",
    );
  });

  test("manager correction dialog flow (D-15..D-19)", async () => {
    test.skip(
      true,
      "Requires flagged-shift fixture seeding — deferred to HUMAN-UAT.",
    );
  });
});
