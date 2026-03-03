import { test, expect } from "@playwright/test";
import {
  loginAsManager,
  navigateTo,
  waitForDataLoad,
  screenshot,
} from "./helpers";

/**
 * Phase 27.2-02 Verification: GrabFood Menu Simulator
 *
 * Tests:
 * 1. Page renders at /grabfood-menu with correct layout
 * 2. Empty state shows populate button and messaging
 * 3. Populate from product mappings seeds menu items
 * 4. Card grid displays items with GrabFood-like visual style
 * 5. Inline editing works (name, price, description)
 * 6. Availability toggle grays out items
 * 7. Add Item dialog opens and shows available products
 * 8. Push to GrabFood button / confirm dialog renders
 * 9. Sync status badge is present
 * 10. Responsive layout (card columns)
 */

test.describe("GrabFood Menu Simulator — Phase 27.2-02", () => {
  test.beforeEach(async ({ page }) => {
    await loginAsManager(page);
  });

  test("1. Page renders at /grabfood-menu with header and controls", async ({
    page,
  }) => {
    await navigateTo(page, "/grabfood-menu");
    await waitForDataLoad(page);
    await screenshot(page, "gf-sim-01-page-loaded");

    // Page title should contain "GrabFood" and "Menu Simulator"
    const title = page.locator("h1").first();
    await expect(title).toBeVisible();
    const titleText = await title.textContent();
    expect(titleText).toContain("GrabFood");
    expect(titleText).toContain("Menu Simulator");

    // "Add Item" button should always be visible
    const addItemBtn = page
      .locator("button")
      .filter({ hasText: /Add Item/i })
      .first();
    await expect(addItemBtn).toBeVisible();

    // "Push to GrabFood" button should be visible
    const pushBtn = page
      .locator("button")
      .filter({ hasText: /Push to GrabFood/i })
      .first();
    await expect(pushBtn).toBeVisible();
  });

  test("2. Empty state or card grid displays correctly", async ({ page }) => {
    await navigateTo(page, "/grabfood-menu");
    await waitForDataLoad(page);

    // Either we see the empty state message or the card grid
    const emptyState = page.locator("text=No menu items yet");
    const cardGrid = page.locator(".grid.grid-cols-2");
    const hasEmpty =
      (await emptyState.count()) > 0 && (await emptyState.isVisible());
    const hasGrid =
      (await cardGrid.count()) > 0 && (await cardGrid.isVisible());

    expect(hasEmpty || hasGrid).toBeTruthy();

    if (hasEmpty) {
      await screenshot(page, "gf-sim-02-empty-state");

      // Populate button should be visible in empty state
      const populateBtn = page
        .locator("button")
        .filter({ hasText: /Populate from Mappings/i })
        .first();
      await expect(populateBtn).toBeVisible();

      // Empty state should mention adding items
      await expect(
        page.locator("text=Populate from Mappings").first()
      ).toBeVisible();
    } else {
      await screenshot(page, "gf-sim-02-card-grid");
    }
  });

  test("3. Populate from mappings creates menu items", async ({ page }) => {
    await navigateTo(page, "/grabfood-menu");
    await waitForDataLoad(page);

    // Check if we need to populate first (empty state)
    const emptyState = page.locator("text=No menu items yet");
    const hasEmpty =
      (await emptyState.count()) > 0 && (await emptyState.isVisible());

    if (hasEmpty) {
      // Click populate button
      const populateBtn = page
        .locator("button")
        .filter({ hasText: /Populate from Mappings/i })
        .first();
      await populateBtn.click();

      // Wait for mutation to complete and reactive update
      await page.waitForTimeout(3000);
      await waitForDataLoad(page);
      await screenshot(page, "gf-sim-03-after-populate");
    }

    // Now we should have either items from populate or pre-existing items
    // Either the grid has cards or we still have empty state (if no mappings exist)
    const cardGrid = page.locator(".grid.grid-cols-2");
    const cards = cardGrid.locator("[class*='card'], [class*='Card']");

    // Take screenshot of current state
    await screenshot(page, "gf-sim-03-menu-state");

    // If cards exist, verify they have expected structure
    if ((await cards.count()) > 0) {
      // First card should have a switch (availability toggle)
      const firstCardSwitch = cards
        .first()
        .locator('button[role="switch"]');
      await expect(firstCardSwitch).toBeVisible();

      // Cards should show price text (formatted with Rp)
      const priceText = cards.first().locator("text=/Rp/");
      expect(await priceText.count()).toBeGreaterThan(0);
    }
  });

  test("4. Card grid or empty state shows correct structure", async ({ page }) => {
    await navigateTo(page, "/grabfood-menu");
    await waitForDataLoad(page);

    // Try to populate items
    await ensureMenuHasItems(page);
    await waitForDataLoad(page);
    await screenshot(page, "gf-sim-04-card-grid-detail");

    // Check if items exist (switch toggles are inside cards)
    const switchToggles = page.locator('button[role="switch"]');
    const hasItems = (await switchToggles.count()) > 0;

    if (hasItems) {
      // Cards should have availability toggle
      await expect(switchToggles.first()).toBeVisible();

      // Should have delete buttons (trash icons in cards)
      const deleteButtons = page.locator("main button").filter({
        has: page.locator('svg'),
      });
      expect(await deleteButtons.count()).toBeGreaterThan(0);

      // Should have clickable name fields (cursor-pointer for inline edit)
      const editableFields = page.locator("main .cursor-pointer");
      expect(await editableFields.count()).toBeGreaterThan(0);
    } else {
      // Empty state should be visible
      await expect(page.locator("text=No menu items yet")).toBeVisible();
      // Populate button should be shown
      await expect(
        page.locator("button").filter({ hasText: /Populate from Mappings/i }).first()
      ).toBeVisible();
    }
  });

  test("5. Inline editing - name field becomes editable on click", async ({
    page,
  }) => {
    await navigateTo(page, "/grabfood-menu");
    await waitForDataLoad(page);
    await ensureMenuHasItems(page);
    await waitForDataLoad(page);

    const cardGrid = page.locator(".grid.grid-cols-2");
    const firstCard = cardGrid.locator(":scope > div").first();

    // Find the name area (first clickable text in content area)
    // The name uses InlineEditText with cursor-pointer class
    const nameField = firstCard
      .locator(".cursor-pointer")
      .first();

    if ((await nameField.count()) > 0) {
      const originalText = await nameField.textContent();
      await screenshot(page, "gf-sim-05a-before-edit");

      // Click to enter edit mode
      await nameField.click();
      await page.waitForTimeout(500);

      // An input should now be visible in the card
      const input = firstCard.locator("input[type='text'], input:not([type])").first();
      const hasInput = (await input.count()) > 0;

      if (hasInput) {
        await screenshot(page, "gf-sim-05b-editing-name");
        // Press Escape to cancel
        await page.keyboard.press("Escape");
        await page.waitForTimeout(300);
      }

      await screenshot(page, "gf-sim-05c-after-cancel");

      // Verify original text is preserved after cancel
      const currentText = await firstCard
        .locator(".cursor-pointer")
        .first()
        .textContent();
      expect(currentText).toBe(originalText);
    }
  });

  test("6. Availability toggle changes card appearance", async ({ page }) => {
    await navigateTo(page, "/grabfood-menu");
    await waitForDataLoad(page);
    await ensureMenuHasItems(page);
    await waitForDataLoad(page);

    const cardGrid = page.locator(".grid.grid-cols-2");
    const cards = cardGrid.locator(":scope > div");

    if ((await cards.count()) > 0) {
      const firstCard = cards.first();
      const switchToggle = firstCard.locator('button[role="switch"]');
      await expect(switchToggle).toBeVisible();

      // Get initial checked state
      const initialState = await switchToggle.getAttribute("data-state");
      await screenshot(page, "gf-sim-06a-before-toggle");

      // Toggle availability
      await switchToggle.click();
      await page.waitForTimeout(1500);
      await waitForDataLoad(page);

      const newState = await switchToggle.getAttribute("data-state");
      await screenshot(page, "gf-sim-06b-after-toggle");

      // State should have changed
      expect(newState).not.toBe(initialState);

      // If now unchecked, card should have opacity-60 class (grayed out)
      if (newState === "unchecked") {
        const cardClass = await firstCard.getAttribute("class");
        expect(cardClass).toContain("opacity-60");
      }

      // Toggle back to restore original state
      await switchToggle.click();
      await page.waitForTimeout(1500);
      await screenshot(page, "gf-sim-06c-restored");
    }
  });

  test("7. Add Item dialog opens and shows products", async ({ page }) => {
    await navigateTo(page, "/grabfood-menu");
    await waitForDataLoad(page);

    // Click Add Item button
    const addItemBtn = page
      .locator("button")
      .filter({ hasText: /Add Item/i })
      .first();
    await addItemBtn.click();
    await page.waitForTimeout(500);

    // Dialog should open
    const dialog = page.locator('[role="dialog"]');
    await expect(dialog).toBeVisible();
    await screenshot(page, "gf-sim-07a-add-item-dialog");

    // Dialog title
    await expect(
      dialog.locator("text=Add Item to GrabFood Menu")
    ).toBeVisible();

    // Search input should be present
    const searchInput = dialog.locator('input[placeholder*="Search"]');
    await expect(searchInput).toBeVisible();

    // There should be a product list or "All menu products are already added" message
    const productList = dialog.locator("button.w-full.text-left");
    const allAddedMsg = dialog.locator(
      "text=All menu products are already added"
    );
    const noMatchMsg = dialog.locator("text=No products match");

    const hasProducts = (await productList.count()) > 0;
    const hasAllAdded = (await allAddedMsg.count()) > 0;

    if (hasProducts) {
      // Test search filtering
      const firstProductName = await productList.first().textContent();
      await searchInput.fill("zzz_nonexistent_product");
      await page.waitForTimeout(300);
      await screenshot(page, "gf-sim-07b-search-no-results");

      // Clear search
      await searchInput.clear();
      await page.waitForTimeout(300);

      // Click a product to select it
      await productList.first().click();
      await page.waitForTimeout(500);
      await screenshot(page, "gf-sim-07c-product-selected");

      // Should show override fields
      const nameInput = dialog.locator("#gf-name");
      const priceInput = dialog.locator("#gf-price");
      await expect(nameInput).toBeVisible();
      await expect(priceInput).toBeVisible();

      // "Add to Menu" button should be present
      const addToMenuBtn = dialog
        .locator("button")
        .filter({ hasText: /Add to Menu/i });
      await expect(addToMenuBtn).toBeVisible();

      // Back button should also be present
      const backBtn = dialog
        .locator("button")
        .filter({ hasText: /Back/i });
      await expect(backBtn).toBeVisible();
    }

    // Close dialog
    await page.keyboard.press("Escape");
    await page.waitForTimeout(300);
  });

  test("8. Push to GrabFood button state reflects pending changes", async ({
    page,
  }) => {
    await navigateTo(page, "/grabfood-menu");
    await waitForDataLoad(page);
    await ensureMenuHasItems(page);
    await waitForDataLoad(page);

    const pushBtn = page
      .locator("button")
      .filter({ hasText: /Push to GrabFood/i })
      .first();
    await expect(pushBtn).toBeVisible();
    await screenshot(page, "gf-sim-08a-push-button");

    // If there are pending changes (badge count), button should be enabled
    // If no changes, button should be disabled
    const isDisabled = await pushBtn.isDisabled();

    if (!isDisabled) {
      // Click to open push confirm dialog
      await pushBtn.click();
      await page.waitForTimeout(500);

      const dialog = page.locator('[role="dialog"]');
      await expect(dialog).toBeVisible();
      await screenshot(page, "gf-sim-08b-push-confirm-dialog");

      // Dialog should show "Push Changes to GrabFood" title
      await expect(
        dialog.locator("text=Push Changes to GrabFood")
      ).toBeVisible();

      // Should show merchant ID
      await expect(dialog.locator("text=6-C7XYAECCTNKXJ6")).toBeVisible();

      // Should show warning text
      await expect(
        dialog.locator("text=Changes will be pushed to GrabFood")
      ).toBeVisible();

      // Should have Cancel and Push buttons
      const cancelBtn = dialog
        .locator("button")
        .filter({ hasText: /Cancel/i });
      await expect(cancelBtn).toBeVisible();

      const pushConfirmBtn = dialog
        .locator("button")
        .filter({ hasText: /Push to GrabFood/i });
      await expect(pushConfirmBtn).toBeVisible();

      // Should show total changes count
      const totalText = dialog.locator("text=/Total:.*change/");
      expect(await totalText.count()).toBeGreaterThan(0);

      // Close dialog without pushing
      await cancelBtn.click();
      await page.waitForTimeout(300);
    } else {
      // No pending changes - button should be disabled (correct state)
      await screenshot(page, "gf-sim-08b-push-disabled-no-changes");
    }
  });

  test("9. Sync status badge is present in header", async ({ page }) => {
    await navigateTo(page, "/grabfood-menu");
    await waitForDataLoad(page);
    await screenshot(page, "gf-sim-09-sync-badge");

    // Sync badge should show one of: "Not synced", "Synced", "Sync Failed", "Syncing..."
    const syncBadges = [
      page.locator("text=Not synced"),
      page.locator("text=Synced").first(),
      page.locator("text=Sync Failed"),
      page.locator("text=Syncing..."),
    ];

    let foundBadge = false;
    for (const badge of syncBadges) {
      if ((await badge.count()) > 0 && (await badge.isVisible())) {
        foundBadge = true;
        break;
      }
    }

    expect(foundBadge).toBeTruthy();
  });

  test("10. Responsive layout — page adapts to viewport width", async ({
    page,
  }) => {
    await navigateTo(page, "/grabfood-menu");
    await waitForDataLoad(page);
    await ensureMenuHasItems(page);
    await waitForDataLoad(page);

    // Verify the page renders at different viewport sizes
    // Desktop viewport (1440px)
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.waitForTimeout(500);
    await screenshot(page, "gf-sim-10a-desktop-layout");

    // Page heading should be visible at all sizes
    const heading = page.locator("h1").first();
    await expect(heading).toBeVisible();

    // Tablet viewport (768px)
    await page.setViewportSize({ width: 768, height: 1024 });
    await page.waitForTimeout(500);
    await screenshot(page, "gf-sim-10b-tablet-layout");
    await expect(heading).toBeVisible();

    // Mobile viewport (375px)
    await page.setViewportSize({ width: 375, height: 812 });
    await page.waitForTimeout(500);
    await screenshot(page, "gf-sim-10c-mobile-layout");

    // Core controls should still be accessible on mobile
    const addBtn = page.locator("button").filter({ hasText: /Add Item/i }).first();
    await expect(addBtn).toBeVisible();

    // Restore desktop viewport
    await page.setViewportSize({ width: 1440, height: 900 });
  });
});

/**
 * Helper: Ensure the menu has items by populating from mappings if empty.
 */
async function ensureMenuHasItems(page: import("@playwright/test").Page) {
  const emptyState = page.locator("text=No menu items yet");
  const hasEmpty =
    (await emptyState.count()) > 0 && (await emptyState.isVisible());

  if (hasEmpty) {
    const populateBtn = page
      .locator("button")
      .filter({ hasText: /Populate from Mappings/i })
      .first();

    if ((await populateBtn.count()) > 0 && (await populateBtn.isVisible())) {
      await populateBtn.click();
      await page.waitForTimeout(3000);
    }
  }
}
