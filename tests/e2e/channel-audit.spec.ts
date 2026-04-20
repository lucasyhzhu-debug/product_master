/**
 * Phase 74.5.1 Wave 0 — E2E scaffold for ChannelAuditWorkbench admin UI (R6 E2E).
 *
 * Covers Req R6 from 74.5.1-SPEC.md (E2E surface):
 *   - 5 issue-type tabs render count badges.
 *   - Resolution flow: open issue → pick action → issue disappears from tab,
 *     count decrements.
 *   - "Run full audit" button updates `Last run` timestamp within 5 seconds.
 *   - Backfill-gate banner — per-source gating copy rendered (actual
 *     enable/disable wiring is a 74.5.2 concern).
 *
 * STATUS (Wave 4 Task 11.1):
 *   `test.describe.skip` is lifted — block now runs serially. Individual tests
 *   are marked `test.fixme` pending Wave 3 landing of `ChannelAuditWorkbench.tsx`
 *   at route `/admin/channel-audit`. When the UI ships, remove the `test.fixme`
 *   markers inside each test (bodies already complete).
 */

import { test, expect } from "@playwright/test";
import { loginAsRole } from "./helpers";

test.describe.serial("R6 — ChannelAuditWorkbench", () => {
  test.beforeEach(async ({ page }) => {
    await loginAsRole(page, "admin");
  });

  test("T-R6.E2E.1 Issue-type tab count badges render with seeded issues", async ({ page }) => {
    test.fixme(true, "Pending manual UAT on running dev server (page exists; awaiting admin credentials)");
    // Precondition: backend seeded with one externalRevenueItems row of each
    // of 5 issue types (Wave 3 test-setup helper). Until the helper exists,
    // this test remains a fixme.
    await page.goto("/admin/channel-audit");
    await page.waitForLoadState("networkidle");

    for (const issueType of [
      "unmapped_sku",
      "malformed_item",
      "stale_mapping",
      "duplicate_transaction",
      "orphan_item",
    ]) {
      const tab = page.getByRole("tab", { name: new RegExp(issueType.replace("_", " "), "i") });
      await expect(tab).toBeVisible();
      // Count badge >= 1 (exact value depends on seed).
      await expect(tab.getByText(/\d+/)).toBeVisible();
    }
  });

  test("T-R6.E2E.2 Resolution flow: remap unmapped_sku → issue disappears + count decrements", async ({ page }) => {
    test.fixme(true, "Pending manual UAT on running dev server (page exists; awaiting admin credentials)");
    await page.goto("/admin/channel-audit");
    const unmappedTab = page.getByRole("tab", { name: /unmapped sku/i });
    await unmappedTab.click();

    // Capture the initial count badge value.
    const badgeBefore = await unmappedTab.getByText(/\d+/).textContent();
    const before = parseInt(badgeBefore ?? "0", 10);

    // Click the first unresolved issue row → remap dialog opens.
    await page.getByRole("row", { name: /unresolved/i }).first().click();
    await page.getByRole("combobox", { name: /menu product/i }).click();
    await page.getByRole("option").first().click();
    await page.getByRole("button", { name: /save|resolve/i }).click();

    // Issue disappears from the tab; badge decrements.
    const badgeAfter = await unmappedTab.getByText(/\d+/).textContent();
    const after = parseInt(badgeAfter ?? "0", 10);
    expect(after).toBe(before - 1);
  });

  test("T-R6.E2E.3 Run full audit button updates Last run timestamp within 5 seconds", async ({ page }) => {
    test.fixme(true, "Pending manual UAT on running dev server (page exists; awaiting admin credentials)");
    await page.goto("/admin/channel-audit");

    const runBtn = page.getByRole("button", { name: /run full audit/i });
    const tsBefore = await page.getByText(/last run:/i).textContent();

    await runBtn.click();
    // Loading state expected — either button disabled or spinner visible.
    await expect(runBtn).toBeDisabled();

    // Wait up to 5s for the timestamp to change.
    await expect
      .poll(async () => {
        const txt = await page.getByText(/last run:/i).textContent();
        return txt !== tsBefore;
      }, { timeout: 5_000 })
      .toBe(true);
  });

  test("T-R6.E2E.4 Backfill-gate copy: per-source 'Backfill blocked' status rendered per UI-SPEC", async ({ page }) => {
    test.fixme(true, "Pending manual UAT on running dev server (page exists; awaiting admin credentials)");
    // Per UI-SPEC: audit tabs surface per-source backfill gating status.
    // Wave 3 renders the text; 74.5.2 wires real enable/disable behavior.
    await page.goto("/admin/channel-audit");
    await expect(page.getByText(/backfill blocked|backfill gated|pending issues/i).first()).toBeVisible();
  });
});
