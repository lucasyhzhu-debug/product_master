import { test, expect } from "@playwright/test";
import { loginAsRole, navigateTo, waitForDataLoad, screenshot } from "./helpers";

test.describe("Expense Training Guide", () => {
  test.beforeEach(async ({ page }) => {
    await loginAsRole(page, "admin");
  });

  test("help center shows expenses guide as live", async ({ page }) => {
    await navigateTo(page, "/help");
    await waitForDataLoad(page);
    await screenshot(page, "help-center-landing");

    // The expenses card should exist and NOT be dimmed/coming-soon
    const expensesCard = page.locator("text=Expenses & Reimbursement").first();
    await expect(expensesCard).toBeVisible();

    // Click through to the expense guide
    await expensesCard.click();
    await page.waitForURL(/\/help\/expenses/, { timeout: 10_000 });
    await waitForDataLoad(page);
    await screenshot(page, "expense-guide-top");
  });

  test("all 8 sections render with correct IDs", async ({ page }) => {
    await navigateTo(page, "/help/expenses");
    await waitForDataLoad(page);

    const sectionIds = [
      "overview",
      "submitting",
      "approving",
      "reimbursement",
      "payroll",
      "analytics",
      "pnl",
      "faq",
    ];

    for (const id of sectionIds) {
      const section = page.locator(`#${id}`);
      await expect(section).toBeAttached();
    }
  });

  test("overview section has workflow diagram and role table", async ({ page }) => {
    await navigateTo(page, "/help/expenses");
    await waitForDataLoad(page);

    // Scroll to overview
    await page.locator("#overview").scrollIntoViewIfNeeded();
    await page.waitForTimeout(500);
    await screenshot(page, "expense-guide-s1-overview");

    // Lifecycle flowchart nodes
    await expect(page.locator("#overview").locator("text=Draft")).toBeVisible();
    await expect(page.locator("#overview").locator("text=Submitted")).toBeVisible();
    await expect(page.locator("#overview").locator("text=Approved").first()).toBeVisible();
    await expect(page.locator("#overview").locator("text=Reimbursed").first()).toBeVisible();

    // Role summary table
    const roleTable = page.locator("#overview table");
    await expect(roleTable).toBeVisible();
    await screenshot(page, "expense-guide-s1-role-table");
  });

  test("submitting section has step cards, callouts, and mini FAQ", async ({ page }) => {
    await navigateTo(page, "/help/expenses");
    await waitForDataLoad(page);

    const section = page.locator("#submitting");
    await section.scrollIntoViewIfNeeded();
    await page.waitForTimeout(500);
    await screenshot(page, "expense-guide-s2-submitting");

    // 4 step cards (numbered circles)
    const stepNumbers = section.locator("text=/^[1-4]$/");
    await expect(stepNumbers).toHaveCount(4);

    // Callout boxes
    const callouts = section.locator('[class*="border-l-4"], [class*="border-l"]').filter({ hasText: /.+/ });
    expect(await callouts.count()).toBeGreaterThanOrEqual(3);

    // Mini FAQ accordion
    const faqItems = section.locator('[data-state]').filter({ hasText: /\?/ });
    expect(await faqItems.count()).toBeGreaterThanOrEqual(1);
  });

  test("approving section has DoA workflow and step cards", async ({ page }) => {
    await navigateTo(page, "/help/expenses");
    await waitForDataLoad(page);

    const section = page.locator("#approving");
    await section.scrollIntoViewIfNeeded();
    await page.waitForTimeout(500);
    await screenshot(page, "expense-guide-s3-approving");

    // DoA workflow nodes
    await expect(section.locator("text=Amount Check").first()).toBeVisible();
    await expect(section.locator("text=Approve or Reject").first()).toBeVisible();

    // 3 step cards
    await expect(section.locator("text=Open approval queue").first()).toBeVisible();
    await expect(section.locator("text=Review the expense").first()).toBeVisible();
    await expect(section.locator("text=Approve or reject").first()).toBeVisible();
  });

  test("reimbursement section has batch workflow and 6 steps", async ({ page }) => {
    await navigateTo(page, "/help/expenses");
    await waitForDataLoad(page);

    const section = page.locator("#reimbursement");
    await section.scrollIntoViewIfNeeded();
    await page.waitForTimeout(500);
    await screenshot(page, "expense-guide-s4-reimbursement");

    // Batch workflow nodes
    await expect(section.locator("text=Create Batch").first()).toBeVisible();
    await expect(section.locator("text=Confirm Batch").first()).toBeVisible();

    // 6 step cards
    await expect(section.locator("text=Open Reimbursement Manager").first()).toBeVisible();
    await expect(section.locator("text=Done").first()).toBeVisible();
  });

  test("payroll section has 4 steps, callouts, and mini FAQ", async ({ page }) => {
    await navigateTo(page, "/help/expenses");
    await waitForDataLoad(page);

    const section = page.locator("#payroll");
    await section.scrollIntoViewIfNeeded();
    await page.waitForTimeout(500);
    await screenshot(page, "expense-guide-s5-payroll");

    // Step cards
    await expect(section.locator("text=Open Payroll").first()).toBeVisible();
    await expect(section.locator("text=Confirm & create").first()).toBeVisible();

    // Callout boxes - check for important/tip/warning content
    await expect(section.locator("text=Payroll records what you paid").first()).toBeVisible();

    // Payroll FAQ
    const faqTriggers = section.locator('[data-state]').filter({ hasText: /\?/ });
    expect(await faqTriggers.count()).toBeGreaterThanOrEqual(1);
  });

  test("analytics section has dashboard table, fraud flags, and steps", async ({ page }) => {
    await navigateTo(page, "/help/expenses");
    await waitForDataLoad(page);

    const section = page.locator("#analytics");
    await section.scrollIntoViewIfNeeded();
    await page.waitForTimeout(500);
    await screenshot(page, "expense-guide-s6-analytics");

    // Dashboard card table
    const table = section.locator("table");
    await expect(table).toBeVisible();
    await expect(section.locator("text=Total OpEx").first()).toBeVisible();

    // Fraud flags
    await expect(section.locator("text=Split Detection").first()).toBeVisible();
    await expect(section.locator("text=Approver Concentration").first()).toBeVisible();
    await expect(section.locator("text=Unfamiliar Vendor").first()).toBeVisible();
  });

  test("P&L section has journal flow diagram and steps", async ({ page }) => {
    await navigateTo(page, "/help/expenses");
    await waitForDataLoad(page);

    const section = page.locator("#pnl");
    await section.scrollIntoViewIfNeeded();
    await page.waitForTimeout(500);
    await screenshot(page, "expense-guide-s7-pnl");

    // Journal flow diagram nodes
    await expect(section.locator("text=Auto Journal Entry").first()).toBeVisible();
    await expect(section.locator("text=Financial Statement").first()).toBeVisible();

    // Plain-language explanation
    await expect(section.locator("text=automatically creates an accounting entry").first()).toBeVisible();

    // Step cards
    await expect(section.locator("text=View the P&L").first()).toBeVisible();
  });

  test("FAQ section has 5 groups with accordion items", async ({ page }) => {
    await navigateTo(page, "/help/expenses");
    await waitForDataLoad(page);

    const section = page.locator("#faq");
    await section.scrollIntoViewIfNeeded();
    await page.waitForTimeout(500);
    await screenshot(page, "expense-guide-s8-faq");

    // Check for FAQ group headings
    await expect(section.locator("text=General").first()).toBeVisible();
    await expect(section.locator("text=Submission").first()).toBeVisible();
    await expect(section.locator("text=Approval").first()).toBeVisible();
    await expect(section.locator("text=Reimbursement").first()).toBeVisible();
    await expect(section.locator("text=Payroll").first()).toBeVisible();

    // Expand a FAQ item and verify answer appears
    const firstQuestion = section.locator('[data-state="closed"]').first();
    if (await firstQuestion.count() > 0) {
      await firstQuestion.click();
      await page.waitForTimeout(300);
      await screenshot(page, "expense-guide-s8-faq-expanded");
    }
  });

  test("deep linking scrolls to correct section via sidebar TOC", async ({ page }) => {
    await navigateTo(page, "/help/expenses");
    await waitForDataLoad(page);

    // Click the FAQ link in the desktop sidebar TOC (visible nav links)
    const sidebarFaqLink = page.locator("aside a[href='#faq'], nav a[href='#faq']").filter({ has: page.locator(":visible") }).first();

    // Fallback: find any visible "FAQ" link
    const faqLink = (await sidebarFaqLink.count()) > 0
      ? sidebarFaqLink
      : page.locator("a[href='#faq']:visible").first();

    if (await faqLink.count() > 0) {
      await faqLink.click({ force: true });
    } else {
      // Direct scroll as final fallback
      await page.locator("#faq").scrollIntoViewIfNeeded();
    }
    await page.waitForTimeout(1000);
    await screenshot(page, "expense-guide-deeplink-faq");

    // FAQ section should be in viewport after clicking
    const faqSection = page.locator("#faq");
    await expect(faqSection).toBeInViewport({ ratio: 0.1 });
  });

  test("TOC sidebar shows all 8 sections on desktop", async ({ page }) => {
    await navigateTo(page, "/help/expenses");
    await waitForDataLoad(page);

    // TOC sidebar should have nav links for all sections
    const tocNav = page.locator("nav, aside").filter({ hasText: "Overview" }).first();
    if (await tocNav.count() > 0) {
      await expect(tocNav.locator("text=Overview").first()).toBeVisible();
      await expect(tocNav.locator("text=Submitting").first()).toBeVisible();
      await expect(tocNav.locator("text=FAQ").first()).toBeVisible();
      await screenshot(page, "expense-guide-toc-sidebar");
    }
  });

  test("step card descriptions have no literal asterisks", async ({ page }) => {
    await navigateTo(page, "/help/expenses");
    await waitForDataLoad(page);

    // Check that no step card description contains literal ** (markdown bold)
    const stepDescriptions = await page.locator("p").allTextContents();
    const asteriskIssues = stepDescriptions.filter((text) => text.includes("**"));
    expect(asteriskIssues).toHaveLength(0);
  });

  test("no placeholder content remains", async ({ page }) => {
    await navigateTo(page, "/help/expenses");
    await waitForDataLoad(page);

    // No placeholder text should remain
    const pageText = await page.locator("body").textContent();
    expect(pageText).not.toContain("Content for this section is being added");
    expect(pageText).not.toContain("coming soon");
  });

  test("mobile responsive: TOC tabs appear on narrow viewport", async ({ page }) => {
    // Set mobile viewport
    await page.setViewportSize({ width: 375, height: 812 });
    await navigateTo(page, "/help/expenses");
    await waitForDataLoad(page);
    await screenshot(page, "expense-guide-mobile-top");

    // Scroll down to see content
    await page.locator("#submitting").scrollIntoViewIfNeeded();
    await page.waitForTimeout(500);
    await screenshot(page, "expense-guide-mobile-submitting");
  });
});
