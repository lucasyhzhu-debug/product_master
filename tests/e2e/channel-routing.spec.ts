/**
 * Phase 74.5.1 Wave 0 — E2E scaffold for ChannelRoutingManager admin UI (R7).
 *
 * Covers Req R7 from 74.5.1-SPEC.md:
 *   - CRUD round-trip for routing rules (create / edit / delete).
 *   - Duplicate (source, outletId?, menuProductId?) combination shows validation error.
 *   - Admin role required — unauthenticated / non-admin users are blocked.
 *
 * RED STATE: Entire describe block is `.skip` until Wave 3 lands
 * `ChannelRoutingManager.tsx` at route `/admin/channel-routing`. When the UI
 * is green, Wave 3 executor flips `test.describe.skip` → `test.describe.serial`.
 *
 * Pattern reference: tests/e2e/bigseller-sync.spec.ts for loginAsManager +
 * navigateTo; tests/e2e/bank-rules-perms.spec.ts for role-gate assertions.
 */

import { test, expect } from "@playwright/test";
import { loginAsRole } from "./helpers";

test.describe.skip("R7 — ChannelRoutingManager CRUD (Wave 3 unblocks when /admin/channel-routing ships)", () => {
  test.beforeEach(async ({ page }) => {
    await loginAsRole(page, "admin");
  });

  test("T-R7.1 CRUD round-trip: create → verify → edit → verify → delete → verify", async ({ page }) => {
    await page.goto("/admin/channel-routing");
    await page.waitForLoadState("networkidle");

    // Create: click "Add routing rule" → fill form → save
    await page.getByRole("button", { name: /add routing rule/i }).click();
    await page.getByLabel(/source/i).selectOption("shopee");
    await page.getByLabel(/default location/i).selectOption({ label: "Warehouse A" });
    await page.getByLabel(/is default/i).check();
    await page.getByRole("button", { name: /save/i }).click();

    // Verify row appears in table
    const row = page.getByRole("row", { name: /shopee.*Warehouse A/i });
    await expect(row).toBeVisible();

    // Edit: open edit, change location, save
    await row.getByRole("button", { name: /edit/i }).click();
    await page.getByLabel(/default location/i).selectOption({ label: "Warehouse B" });
    await page.getByRole("button", { name: /save/i }).click();
    await expect(page.getByRole("row", { name: /shopee.*Warehouse B/i })).toBeVisible();

    // Delete: delete, confirm, verify row removed
    await page.getByRole("row", { name: /shopee.*Warehouse B/i }).getByRole("button", { name: /delete/i }).click();
    await page.getByRole("button", { name: /confirm/i }).click();
    await expect(page.getByRole("row", { name: /shopee.*Warehouse B/i })).toHaveCount(0);
  });

  test("T-R7.2 duplicate combination shows inline validation error", async ({ page }) => {
    await page.goto("/admin/channel-routing");

    // Create initial rule for (source=shopee, outlet=X, product=Y)
    await page.getByRole("button", { name: /add routing rule/i }).click();
    await page.getByLabel(/source/i).selectOption("shopee");
    await page.getByLabel(/outlet/i).selectOption({ label: "Test Outlet X" });
    await page.getByLabel(/product/i).selectOption({ label: "Test Product Y" });
    await page.getByRole("button", { name: /save/i }).click();

    // Try to create the exact same combination again
    await page.getByRole("button", { name: /add routing rule/i }).click();
    await page.getByLabel(/source/i).selectOption("shopee");
    await page.getByLabel(/outlet/i).selectOption({ label: "Test Outlet X" });
    await page.getByLabel(/product/i).selectOption({ label: "Test Product Y" });
    await page.getByRole("button", { name: /save/i }).click();

    // Inline error expected
    await expect(page.getByText(/rule already exists for this combination/i)).toBeVisible();
  });

  test("T-R7.3 Admin gate: unauthenticated visit to /admin/channel-routing redirects to login", async ({ page, context }) => {
    // Clear any existing auth
    await context.clearCookies();
    await page.goto("/admin/channel-routing");
    // <ProtectedRoute> redirects unauthenticated users to /login
    await expect(page).toHaveURL(/\/login/);
  });

  test("T-R7.4 Non-admin role (manager) cannot access /admin/channel-routing", async ({ page }) => {
    await loginAsRole(page, "manager");
    await page.goto("/admin/channel-routing");
    // Manager is blocked — either redirected or shown an unauthorized page.
    // Wave 3 implementation decides the exact surface; test just asserts NOT
    // on the routing manager body.
    await expect(page.getByRole("heading", { name: /channel routing/i })).toHaveCount(0);
  });
});
