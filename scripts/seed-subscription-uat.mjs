/**
 * seed-subscription-uat.mjs
 *
 * Seeds a minimal subscription lifecycle in the dev Convex deployment
 * for UAT of the "subscription operate UI" feature.
 *
 * Lifecycle seeded:
 *   customer → subscription → seedWeek → saveWeekPlan → confirmWeek
 *   → createSubscriptionWeeklyInvoice → markWeeklyInvoicePaid
 *
 * Usage:
 *   node scripts/seed-subscription-uat.mjs
 *
 * Requires VITE_CONVEX_URL (reads .env.local or uses default dev URL).
 */

import { ConvexHttpClient } from "convex/browser";
import { api } from "../convex/_generated/api.js";
import { readFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");

function loadEnv() {
  // Load base .env FIRST, then let .env.local (dev) OVERRIDE it — dev must win.
  for (const envFile of [".env", ".env.local"]) {
    try {
      const text = readFileSync(join(ROOT, envFile), "utf8");
      for (const line of text.split("\n")) {
        const m = line.match(/^([A-Z_]+)=["']?([^"'\n#]+)["']?/);
        if (m) process.env[m[1]] = m[2].trim();
      }
    } catch {
      // file not found — skip
    }
  }
}
loadEnv();

// Force the DEV deployment; SEED_CONVEX_URL still wins for flexibility.
const CONVEX_URL =
  process.env.SEED_CONVEX_URL || "https://exciting-fennec-671.convex.cloud";

// HARD SAFETY GUARD: never seed test data into production.
if (/decisive-wombat-7/.test(CONVEX_URL)) {
  console.error(
    `[seed] REFUSING to run against production (${CONVEX_URL}). Dev only.`
  );
  process.exit(1);
}
const TEST_PIN = "999999";
const ADMIN_NAME = "E2E-Admin";

console.log(`[seed] Connecting to Convex: ${CONVEX_URL}`);
const client = new ConvexHttpClient(CONVEX_URL);

// ---------------------------------------------------------------------------
// Step 1: Login as E2E-Admin
// ---------------------------------------------------------------------------

async function loginAsAdmin() {
  const users = await client.query(api.auth.queries.getActiveUsers);
  const admin = users.find((u) => u.name === ADMIN_NAME);
  if (!admin) {
    throw new Error(
      `E2E-Admin user not found. Run Playwright global-setup first:\n` +
        `  npx playwright test --project chromium --list\n` +
        `  (global-setup creates the E2E-Admin user)`
    );
  }

  const result = await client.mutation(api.auth.mutations.login, {
    userId: admin._id,
    pin: TEST_PIN,
  });

  if (!result.success) {
    throw new Error(`Login failed: ${result.error}`);
  }

  console.log(`[seed] Logged in as ${ADMIN_NAME} (session token obtained)`);
  return result.session.token;
}

// ---------------------------------------------------------------------------
// Step 2: Helpers
// ---------------------------------------------------------------------------

/** Compute the Monday (WIB epoch-ms) of the ISO week containing `now`. */
function getWeekStartMonday(now = Date.now()) {
  const d = new Date(now);
  // JS getDay(): 0=Sun, 1=Mon … 6=Sat
  const day = d.getUTCDay();
  const diffToMon = day === 0 ? -6 : 1 - day;
  const monday = new Date(d);
  monday.setUTCDate(d.getUTCDate() + diffToMon);
  monday.setUTCHours(0, 0, 0, 0);
  return monday.getTime();
}

/** Return weekStart + n days offset (same hour). */
function addDays(epochMs, n) {
  return epochMs + n * 24 * 60 * 60 * 1000;
}

// ---------------------------------------------------------------------------
// Step 3: Pick a menu product
// ---------------------------------------------------------------------------

async function getFirstMenuProductId() {
  const products = await client.query(api.menuProducts.queries.list, {
    activeOnly: true,
  });
  if (!products || products.length === 0) {
    throw new Error(
      "No active menuProducts found in dev DB. " +
        "Seed the menu products first (tags:seedDefaults or similar)."
    );
  }
  const p = products[0];
  console.log(`[seed] Using menuProduct: "${p.name}" (${p._id})`);
  return p._id;
}

// ---------------------------------------------------------------------------
// Step 4: Main seed
// ---------------------------------------------------------------------------

async function seed() {
  const sessionId = await loginAsAdmin();
  const auth = { sessionId };

  // 4a. Pick a menu product
  const menuProductId = await getFirstMenuProductId();

  // 4b. Create customer
  const ts = Date.now();
  const customerName = `UAT-Sub-Test-${ts}`;
  const customerId = await client.mutation(api.customers.mutations.create, {
    ...auth,
    name: customerName,
    phone: "08000000000",
    notes: "seeded by seed-subscription-uat.mjs",
  });
  console.log(`[seed] Created customer: "${customerName}" (${customerId})`);

  // 4c. Create subscription
  const weekStart = getWeekStartMonday();
  // Schedule template: Monday (0) and Wednesday (2) only
  const scheduleTemplate = [
    {
      dayOfWeek: 0, // Mon
      items: [{ menuProductId, qty: 2 }],
    },
    {
      dayOfWeek: 2, // Wed
      items: [{ menuProductId, qty: 2 }],
    },
  ];

  const subscriptionId = await client.mutation(
    api.subscriptions.mutations.createSubscription,
    {
      ...auth,
      customerId,
      label: `UAT-Sub-${ts}`,
      unitPrice: 35000,
      confidentialPrice: false,
      baselineDailyQty: 2,
      deliverByTime: "09:00",
      creditRolloverPolicy: "rollover",
      cogsBasis: 20000,
      startDate: weekStart,
      scheduleTemplate,
    }
  );
  console.log(`[seed] Created subscription: ${subscriptionId}`);

  // 4d. Activate subscription (createSubscription sets status="draft")
  await client.mutation(api.subscriptions.mutations.updateSubscription, {
    ...auth,
    subscriptionId,
    status: "active",
  });
  console.log(`[seed] Activated subscription`);

  // 4e. Seed week
  const subscriptionWeekId = await client.mutation(
    api.subscriptions.weeks.seedWeek,
    {
      ...auth,
      subscriptionId,
      weekStart,
      source: "template",
    }
  );
  console.log(`[seed] Seeded week: ${subscriptionWeekId} (weekStart=${new Date(weekStart).toISOString()})`);

  // 4f. Save week plan explicitly (ensures items are set)
  const monDate = weekStart; // Monday
  const wedDate = addDays(weekStart, 2); // Wednesday

  await client.mutation(api.subscriptions.weeks.saveWeekPlan, {
    ...auth,
    subscriptionWeekId,
    days: [
      {
        date: monDate,
        items: [{ menuProductId, qty: 2 }],
      },
      {
        date: wedDate,
        items: [{ menuProductId, qty: 2 }],
      },
    ],
  });
  console.log(`[seed] Saved week plan (Mon + Wed, 2 items each)`);

  // 4g. Confirm week → generates orders
  const confirmedWeekId = await client.mutation(
    api.subscriptions.scheduling.confirmWeek.confirmWeek,
    {
      ...auth,
      subscriptionWeekId,
    }
  );
  console.log(`[seed] Confirmed week (orders generated): ${confirmedWeekId ?? subscriptionWeekId}`);

  // 4h. Create weekly invoice
  const invoiceId = await client.mutation(
    api.subscriptions.invoicing.createSubscriptionWeeklyInvoice,
    {
      ...auth,
      subscriptionWeekId,
    }
  );
  console.log(`[seed] Created weekly invoice: ${invoiceId}`);

  // 4i. Mark invoice paid → funds credit pool → week enters "delivering" status
  await client.mutation(api.subscriptions.invoicing.markWeeklyInvoicePaid, {
    ...auth,
    subscriptionWeekId,
  });
  console.log(`[seed] Marked invoice paid → week credit funded`);

  // ---------------------------------------------------------------------------
  // Summary
  // ---------------------------------------------------------------------------
  console.log("\n=== SEED COMPLETE ===");
  console.log(`customerName:       ${customerName}`);
  console.log(`customerId:         ${customerId}`);
  console.log(`subscriptionId:     ${subscriptionId}`);
  console.log(`subscriptionWeekId: ${subscriptionWeekId}`);
  console.log(`invoiceId:          ${invoiceId}`);
  console.log(`weekStart:          ${new Date(weekStart).toISOString()}`);
  console.log(
    `\nCRM URL: /crm/customers/${customerId}/subscriptions/${subscriptionId}/week`
  );
  console.log(
    `Invoice URL: /crm/customers/${customerId}/subscriptions/${subscriptionId}/week/invoice`
  );

  // Write IDs to a temp file so Playwright tests can pick them up
  const seedData = {
    customerName,
    customerId,
    subscriptionId,
    subscriptionWeekId,
    invoiceId,
    weekStart,
    menuProductId,
    crmUrl: `/crm/customers/${customerId}/subscriptions/${subscriptionId}/week`,
    invoiceUrl: `/crm/customers/${customerId}/subscriptions/${subscriptionId}/week/invoice`,
  };

  // Write to a known path the spec can import
  const outPath = join(ROOT, "tests/e2e/.seed-data.json");
  const { writeFileSync } = await import("fs");
  writeFileSync(outPath, JSON.stringify(seedData, null, 2));
  console.log(`\n[seed] Seed data written to: ${outPath}`);
}

seed().catch((err) => {
  console.error("\n[seed] FAILED:", err.message || err);
  process.exit(1);
});
