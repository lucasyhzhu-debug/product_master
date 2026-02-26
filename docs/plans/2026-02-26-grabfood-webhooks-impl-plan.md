# GrabFood Webhooks Full Integration — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Implement all 6 GrabFood inbound webhook endpoints so the App Simulator test cases work end-to-end.

**Architecture:** Monolithic `convex/integrations/grabfood/webhooks.ts` with shared HMAC validation, DB-stored secrets via `platformCredentials`, all routes in `convex/http.ts`. Frontend Settings tab gets HMAC field + copyable webhook URLs.

**Tech Stack:** Convex httpAction (non-Node runtime), Web Crypto API for HMAC-SHA256, React + shadcn/ui for Settings UI.

**Design doc:** `docs/plans/2026-02-26-grabfood-webhooks-design.md`
**API reference:** `docs/plans/2026-02-26-grabfood-webhooks-partner-config.md`

---

## Task 1: Schema Changes (platformCredentials + grabfoodOrders)

**Files:**
- Modify: `convex/schema.ts:1159-1172` (platformCredentials table)
- Modify: `convex/schema.ts:1436-1457` (grabfoodOrders table)

**Step 1: Add `hmacSecret` to platformCredentials**

In `convex/schema.ts`, find the `platformCredentials` table definition (line ~1159). Add after the `lastRefreshError` field:

```typescript
hmacSecret: v.optional(v.string()),
```

**Step 2: Add `driverInfo` to grabfoodOrders**

In `convex/schema.ts`, find the `grabfoodOrders` table definition (line ~1436). `orderState` already exists. Add after the `rawJson` field:

```typescript
driverInfo: v.optional(v.object({
  name: v.optional(v.string()),
  phone: v.optional(v.string()),
  photoURL: v.optional(v.string()),
  licensePlate: v.optional(v.string()),
})),
```

**Step 3: Verify types compile**

Run: `npx tsc --noEmit --pretty 2>&1 | tail -5`
Expected: No errors

**Step 4: Commit**

```bash
git add convex/schema.ts
git commit -m "feat(27.0.1): add hmacSecret and driverInfo to schema"
```

---

## Task 2: HMAC Secret Query + Credential Mutation Update

**Files:**
- Modify: `convex/platformCredentials/queries.ts:125-135` (add getHmacSecret)
- Modify: `convex/platformCredentials/mutations.ts` (handle hmacSecret in updateCredentials)

**Step 1: Add getHmacSecret internal query**

In `convex/platformCredentials/queries.ts`, add after the existing `getCredentialsInternal` export:

```typescript
/** Get HMAC secret for webhook validation. Used by httpAction handlers. */
export const getHmacSecret = internalQuery({
  args: {
    platformId: v.string(),
  },
  handler: async (ctx, args) => {
    const cred = await ctx.db
      .query("platformCredentials")
      .withIndex("by_platform", (q) => q.eq("platformId", args.platformId))
      .first();
    return cred?.hmacSecret ?? null;
  },
});
```

Ensure `internalQuery` is imported (it already is in this file).

**Step 2: Update credential save mutation to handle hmacSecret**

Find the mutation that saves/updates platformCredentials (check `convex/platformCredentials/mutations.ts` for `saveCredentials` or `updateCredentials`). Add `hmacSecret: v.optional(v.string())` to its args and include it in the patch/insert object.

If there's a public mutation used by the Settings tab (e.g., `saveCredentials`), add `hmacSecret` to its args validator:

```typescript
hmacSecret: v.optional(v.string()),
```

And include it in the DB write:

```typescript
...(args.hmacSecret !== undefined ? { hmacSecret: args.hmacSecret } : {}),
```

**Step 3: Verify types compile**

Run: `npx tsc --noEmit --pretty 2>&1 | tail -5`
Expected: No errors

**Step 4: Commit**

```bash
git add convex/platformCredentials/queries.ts convex/platformCredentials/mutations.ts
git commit -m "feat(27.0.1): add getHmacSecret query and hmacSecret mutation support"
```

---

## Task 3: Shared HMAC Helper Refactor in webhooks.ts

**Files:**
- Modify: `convex/integrations/grabfood/webhooks.ts:1-62` (refactor HMAC helper)

**Step 1: Add resolveHmacSecret helper function**

At the top of `webhooks.ts` (after the imports), add a helper that fetches the secret from DB:

```typescript
/** Fetch HMAC secret from platformCredentials table. */
async function resolveHmacSecret(ctx: {
  runQuery: (...args: any[]) => Promise<any>;
}): Promise<string | undefined> {
  try {
    const secret = await ctx.runQuery(
      internal.platformCredentials.queries.getHmacSecret,
      { platformId: "grabfood" }
    );
    return secret ?? undefined;
  } catch {
    return undefined;
  }
}
```

**Step 2: Update handleOrderWebhook to use resolveHmacSecret**

Replace lines 84-95 (the hardcoded `undefined` block) with:

```typescript
const hmacSecret = await resolveHmacSecret(ctx);
```

Remove the old try/catch block and TODO comment.

**Step 3: Update handleMenuSyncWebhook to use resolveHmacSecret**

Change line 143 from `validateHmacSignature(body, signatureHeader, undefined)` to:

```typescript
// Change the handler from (_ctx, request) to (ctx, request) to access runQuery
const hmacSecret = await resolveHmacSecret(ctx);
const hmacResult = await validateHmacSignature(body, signatureHeader, hmacSecret);
```

Also change the function signature from `(_ctx, request)` to `(ctx, request)`.

**Step 4: Verify types compile**

Run: `npx tsc --noEmit --pretty 2>&1 | tail -5`
Expected: No errors

**Step 5: Commit**

```bash
git add convex/integrations/grabfood/webhooks.ts
git commit -m "fix(27.0.1): source HMAC secret from DB instead of hardcoded undefined"
```

---

## Task 4: GET Menu Webhook Handler

**Files:**
- Modify: `convex/integrations/grabfood/webhooks.ts` (add handleGetMenuWebhook)
- Modify: `convex/http.ts` (register GET route)

**Step 1: Add handleGetMenuWebhook to webhooks.ts**

Add after the existing handlers:

```typescript
/**
 * Serve the current menu to GrabFood.
 * GrabFood GETs this endpoint to fetch our menu.
 * Returns Section-based (Old Structure) menu JSON.
 *
 * Register this URL in the GrabFood developer portal:
 *   https://<your-deployment>.convex.site/api/grabfood/menu
 */
export const handleGetMenuWebhook = httpAction(async (ctx, request) => {
  // HMAC validation (GrabFood may sign GET requests too)
  const signatureHeader = request.headers.get("X-Grab-Signature");
  const hmacSecret = await resolveHmacSecret(ctx);
  const hmacResult = await validateHmacSignature("", signatureHeader, hmacSecret);
  if (!hmacResult.valid && hmacResult.reason !== "no_secret") {
    console.log(`GrabFood menu GET: HMAC failed (${hmacResult.reason})`);
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }

  // Extract merchantID from query string
  const url = new URL(request.url);
  const merchantID = url.searchParams.get("merchantID") ?? "";

  try {
    // Fetch GrabFood product mappings with joined menuProduct data
    const mappings: any[] = await ctx.runQuery(
      internal.externalData.queries.listProductMappingsInternal,
      { source: "grabfood" as any }
    );

    // Build menu items from mappings
    const items = (mappings ?? []).map((m: any) => ({
      id: m.externalProductCode,
      name: m.externalProductName ?? m.menuProduct?.name ?? "Unknown",
      nameTranslation: { id: m.externalProductName ?? m.menuProduct?.name ?? "Unknown" },
      availableStatus: "AVAILABLE" as const,
      description: m.menuProduct?.description ?? "",
      price: m.menuProduct?.basePrice ?? 0,
      photos: [],
      taxable: true,
      maxStock: -1,
      modifierGroups: [],
    }));

    const menu = {
      merchantID,
      partnerMerchantID: merchantID,
      currency: { code: "IDR", symbol: "Rp", exponent: 0 },
      sellingTimes: [{
        startTime: "00:00",
        endTime: "23:59",
        id: "all-day",
        name: "All Day",
      }],
      sections: [{
        id: "main",
        name: "Frollie Menu",
        serviceHours: {
          mon: { openPeriodType: "OpenPeriod", periods: [{ startTime: "00:00", endTime: "23:59" }] },
          tue: { openPeriodType: "OpenPeriod", periods: [{ startTime: "00:00", endTime: "23:59" }] },
          wed: { openPeriodType: "OpenPeriod", periods: [{ startTime: "00:00", endTime: "23:59" }] },
          thu: { openPeriodType: "OpenPeriod", periods: [{ startTime: "00:00", endTime: "23:59" }] },
          fri: { openPeriodType: "OpenPeriod", periods: [{ startTime: "00:00", endTime: "23:59" }] },
          sat: { openPeriodType: "OpenPeriod", periods: [{ startTime: "00:00", endTime: "23:59" }] },
          sun: { openPeriodType: "OpenPeriod", periods: [{ startTime: "00:00", endTime: "23:59" }] },
        },
        categories: [{
          id: "snacks",
          name: "Snacks",
          items,
        }],
      }],
    };

    console.log(`GrabFood menu GET: serving ${items.length} items for merchant ${merchantID}`);

    return new Response(JSON.stringify(menu), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (err) {
    console.log("GrabFood menu GET error:", err);
    return new Response(JSON.stringify({ error: "Internal error" }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }
});
```

**Step 2: Register route in http.ts**

In `convex/http.ts`, update the import to include `handleGetMenuWebhook`:

```typescript
import { handleOrderWebhook, handleMenuSyncWebhook, handleGetMenuWebhook } from "./integrations/grabfood/webhooks";
```

Add the route before the existing POST routes:

```typescript
http.route({
  path: "/api/grabfood/menu",
  method: "GET",
  handler: handleGetMenuWebhook,
});
```

**Step 3: Verify types compile**

Run: `npx tsc --noEmit --pretty 2>&1 | tail -5`
Expected: No errors

**Step 4: Commit**

```bash
git add convex/integrations/grabfood/webhooks.ts convex/http.ts
git commit -m "feat(27.0.1): add GET /api/grabfood/menu webhook handler"
```

---

## Task 5: Order State Webhook Handler + Mutation

**Files:**
- Modify: `convex/grabfoodOrders/mutations.ts` (add updateOrderState)
- Modify: `convex/integrations/grabfood/webhooks.ts` (add handleOrderStateWebhook)
- Modify: `convex/http.ts` (register route)

**Step 1: Add updateOrderState mutation**

In `convex/grabfoodOrders/mutations.ts`, add after the existing exports:

```typescript
/** Update order state and optional driver info from GrabFood webhook. */
export const updateOrderState = internalMutation({
  args: {
    orderID: v.string(),
    orderState: v.string(),
    driverInfo: v.optional(v.object({
      name: v.optional(v.string()),
      phone: v.optional(v.string()),
      photoURL: v.optional(v.string()),
      licensePlate: v.optional(v.string()),
    })),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("grabfoodOrders")
      .withIndex("by_order_id", (q) => q.eq("orderID", args.orderID))
      .first();

    if (!existing) {
      console.log(`GrabFood updateOrderState: order ${args.orderID} not found, skipping`);
      return null;
    }

    const patch: Record<string, any> = { orderState: args.orderState };
    if (args.driverInfo) {
      patch.driverInfo = args.driverInfo;
    }

    await ctx.db.patch(existing._id, patch);
    console.log(`GrabFood order ${args.orderID} state → ${args.orderState}`);
    return existing._id;
  },
});
```

**Step 2: Add handleOrderStateWebhook to webhooks.ts**

```typescript
/**
 * Receive order state updates from GrabFood.
 * GrabFood pushes state changes: DRIVER_ALLOCATED, COLLECTED, DELIVERED, CANCELLED, etc.
 *
 * Register this URL in GrabFood developer portal:
 *   https://<your-deployment>.convex.site/api/grabfood/order/state
 */
export const handleOrderStateWebhook = httpAction(async (ctx, request) => {
  const body = await request.text();

  const signatureHeader = request.headers.get("X-Grab-Signature");
  const hmacSecret = await resolveHmacSecret(ctx);
  const hmacResult = await validateHmacSignature(body, signatureHeader, hmacSecret);
  if (!hmacResult.valid && hmacResult.reason !== "no_secret") {
    console.log(`GrabFood order state webhook: HMAC failed (${hmacResult.reason})`);
    return new Response("OK", { status: 200 });
  }

  let payload: any;
  try {
    payload = JSON.parse(body);
  } catch {
    console.log("GrabFood order state webhook: invalid JSON");
    return new Response("OK", { status: 200 });
  }

  const { orderID, orderState, driver, driverETA } = payload;
  console.log(`GrabFood order state: ${orderID} → ${orderState}${driverETA ? ` (ETA: ${driverETA}m)` : ""}`);

  try {
    const driverInfo = driver
      ? {
          name: driver.name ?? undefined,
          phone: driver.phone ?? undefined,
          photoURL: driver.photoURL ?? undefined,
          licensePlate: driver.licensePlate ?? undefined,
        }
      : undefined;

    await ctx.scheduler.runAfter(0, internal.grabfoodOrders.mutations.updateOrderState, {
      orderID: orderID ?? "",
      orderState: orderState ?? "UNKNOWN",
      driverInfo,
    });
  } catch (err) {
    console.log("GrabFood order state webhook: failed to schedule update:", err);
  }

  return new Response("OK", { status: 200 });
});
```

**Step 3: Register route in http.ts**

Update import to include `handleOrderStateWebhook`, add route:

```typescript
http.route({
  path: "/api/grabfood/order/state",
  method: "POST",
  handler: handleOrderStateWebhook,
});
```

**Step 4: Verify types compile**

Run: `npx tsc --noEmit --pretty 2>&1 | tail -5`
Expected: No errors

**Step 5: Commit**

```bash
git add convex/grabfoodOrders/mutations.ts convex/integrations/grabfood/webhooks.ts convex/http.ts
git commit -m "feat(27.0.1): add order state webhook with driver info tracking"
```

---

## Task 6: Enhance Menu Sync + Add Integration Status + Menu Push Handlers

**Files:**
- Modify: `convex/integrations/grabfood/webhooks.ts` (enhance menuSync, add 2 new handlers)
- Modify: `convex/http.ts` (register 2 new routes)

**Step 1: Enhance handleMenuSyncWebhook**

Replace the existing `handleMenuSyncWebhook` with:

```typescript
export const handleMenuSyncWebhook = httpAction(async (ctx, request) => {
  const body = await request.text();

  const signatureHeader = request.headers.get("X-Grab-Signature");
  const hmacSecret = await resolveHmacSecret(ctx);
  const hmacResult = await validateHmacSignature(body, signatureHeader, hmacSecret);
  if (!hmacResult.valid && hmacResult.reason !== "no_secret") {
    console.log(`GrabFood menu sync webhook: HMAC failed (${hmacResult.reason})`);
    return new Response("OK", { status: 200 });
  }

  let payload: any;
  try {
    payload = JSON.parse(body);
  } catch {
    return new Response("OK", { status: 200 });
  }

  const { requestID, merchantID, jobID, status, errors } = payload;
  console.log(`GrabFood menu sync: ${status} for merchant ${merchantID} (job: ${jobID}, req: ${requestID})`);

  // Persist to sync logs
  try {
    const errorMessage =
      (status === "FAILED" || status === "PARTIAL_FAILURE") && errors?.length
        ? JSON.stringify(errors).slice(0, 500)
        : undefined;

    await ctx.runMutation(internal.externalData.mutations.createSyncLog, {
      source: "grabfood" as any,
      syncType: "webhook" as any,
      status: status === "SUCCESS" ? ("success" as const) : ("error" as const),
      timestamp: Date.now(),
      triggeredBy: `grabfood-webhook-${requestID ?? "unknown"}`,
      ...(errorMessage ? { errorMessage } : {}),
    });
  } catch (err) {
    console.log("GrabFood menu sync: failed to persist sync log:", err);
  }

  return new Response("OK", { status: 200 });
});
```

**Step 2: Add handleIntegrationStatusWebhook**

```typescript
/**
 * Receive integration status changes from GrabFood.
 * Logs the status and updates the matching outlet record.
 */
export const handleIntegrationStatusWebhook = httpAction(async (ctx, request) => {
  const body = await request.text();

  const signatureHeader = request.headers.get("X-Grab-Signature");
  const hmacSecret = await resolveHmacSecret(ctx);
  const hmacResult = await validateHmacSignature(body, signatureHeader, hmacSecret);
  if (!hmacResult.valid && hmacResult.reason !== "no_secret") {
    console.log(`GrabFood integration status webhook: HMAC failed (${hmacResult.reason})`);
    return new Response("OK", { status: 200 });
  }

  let payload: any;
  try {
    payload = JSON.parse(body);
  } catch {
    return new Response("OK", { status: 200 });
  }

  const { grabMerchantID, partnerMerchantID, integrationStatus } = payload;
  console.log(`GrabFood integration status: ${grabMerchantID} → ${integrationStatus}`);

  // Log to sync logs
  try {
    await ctx.runMutation(internal.externalData.mutations.createSyncLog, {
      source: "grabfood" as any,
      syncType: "webhook" as any,
      status: "success" as const,
      timestamp: Date.now(),
      triggeredBy: `integration-status-${integrationStatus}`,
    });
  } catch (err) {
    console.log("GrabFood integration status: failed to log:", err);
  }

  return new Response("OK", { status: 200 });
});
```

**Step 3: Add handleMenuPushWebhook**

```typescript
/**
 * Receive menu edits pushed from GrabFood Merchant App.
 * We are the menu source of truth — log only, do not apply.
 */
export const handleMenuPushWebhook = httpAction(async (ctx, request) => {
  const body = await request.text();

  const signatureHeader = request.headers.get("X-Grab-Signature");
  const hmacSecret = await resolveHmacSecret(ctx);
  const hmacResult = await validateHmacSignature(body, signatureHeader, hmacSecret);
  if (!hmacResult.valid && hmacResult.reason !== "no_secret") {
    console.log(`GrabFood menu push webhook: HMAC failed (${hmacResult.reason})`);
    return new Response("OK", { status: 200 });
  }

  let payload: any;
  try {
    payload = JSON.parse(body);
  } catch {
    return new Response("OK", { status: 200 });
  }

  console.log("GrabFood menu push received (log only, not applied):", JSON.stringify(payload).slice(0, 200));

  // Log to sync logs for audit
  try {
    await ctx.runMutation(internal.externalData.mutations.createSyncLog, {
      source: "grabfood" as any,
      syncType: "webhook" as any,
      status: "success" as const,
      timestamp: Date.now(),
      triggeredBy: "menu-push-webhook",
    });
  } catch (err) {
    console.log("GrabFood menu push: failed to log:", err);
  }

  return new Response("OK", { status: 200 });
});
```

**Step 4: Register both new routes in http.ts**

Update the import to include all handlers:

```typescript
import {
  handleOrderWebhook,
  handleMenuSyncWebhook,
  handleGetMenuWebhook,
  handleOrderStateWebhook,
  handleIntegrationStatusWebhook,
  handleMenuPushWebhook,
} from "./integrations/grabfood/webhooks";
```

Add routes:

```typescript
http.route({
  path: "/api/grabfood/integration-status",
  method: "POST",
  handler: handleIntegrationStatusWebhook,
});

http.route({
  path: "/api/grabfood/menu/push",
  method: "POST",
  handler: handleMenuPushWebhook,
});
```

**Step 5: Verify types compile**

Run: `npx tsc --noEmit --pretty 2>&1 | tail -5`
Expected: No errors

**Step 6: Commit**

```bash
git add convex/integrations/grabfood/webhooks.ts convex/http.ts
git commit -m "feat(27.0.1): add integration-status and menu-push webhooks, enhance menu-sync"
```

---

## Task 7: Settings Tab — HMAC Secret + Webhook URLs

**Files:**
- Modify: `src/pages/GrabFoodManager.tsx:951-1040` (SettingsTab component)

**Step 1: Add HMAC Secret card**

In the `SettingsTab` function, add a new Card **between** the OAuth Credentials card and the Outlets card. This card has:
- Title: "Webhook HMAC Secret"
- Description: "Shared secret from GrabFood Developer Portal for webhook signature validation"
- A password input with show/hide toggle button
- A "Save" button that calls the existing credential save mutation with the `hmacSecret` field

Use the same pattern as the existing credential dialog but inline (no dialog needed — just a simple input + save button).

**Step 2: Add Webhook URLs card**

Add another Card **after** the HMAC card. This card displays all 6 webhook URLs as read-only text with copy buttons:

```typescript
const CONVEX_SITE_URL = import.meta.env.VITE_CONVEX_URL?.replace(".cloud", ".site") ?? "https://YOUR-DEPLOYMENT.convex.site";

const WEBHOOK_URLS = [
  { label: "Get menu endpoint", path: "/api/grabfood/menu" },
  { label: "Submit order endpoint", path: "/api/grabfood/order" },
  { label: "Push order state endpoint", path: "/api/grabfood/order/state" },
  { label: "Menu Sync Webhook", path: "/api/grabfood/menu-sync" },
  { label: "Integration status endpoint", path: "/api/grabfood/integration-status" },
  { label: "Push Grab menu endpoint", path: "/api/grabfood/menu/push" },
];
```

Each row: label on the left, full URL + Copy button (Lucide `Copy` icon) on the right. On click, `navigator.clipboard.writeText(url)` + toast "Copied!".

**Step 3: Verify types compile and build**

Run: `npm run build 2>&1 | tail -5`
Expected: Build succeeds

**Step 4: Commit**

```bash
git add src/pages/GrabFoodManager.tsx
git commit -m "feat(27.0.1): add webhook URLs and HMAC secret to Settings tab"
```

---

## Task 8: Full Build Verification

**Files:** None (verification only)

**Step 1: Run full build**

Run: `npm run build 2>&1 | tail -10`
Expected: Build succeeds with zero errors

**Step 2: Type check**

Run: `npx tsc --noEmit --pretty 2>&1 | tail -5`
Expected: No errors

**Step 3: Verify all routes registered**

Check `convex/http.ts` has all 6 GrabFood routes:
- GET `/api/grabfood/menu`
- POST `/api/grabfood/order`
- POST `/api/grabfood/order/state`
- POST `/api/grabfood/menu-sync`
- POST `/api/grabfood/integration-status`
- POST `/api/grabfood/menu/push`

**Step 4: Quick smoke test**

If dev server is running, verify Settings tab shows webhook URLs.

---

## Success Criteria

- [ ] Schema updated: `platformCredentials.hmacSecret` + `grabfoodOrders.driverInfo`
- [ ] HMAC validation reads secret from DB via `getHmacSecret` internal query
- [ ] GET `/api/grabfood/menu` returns Section-based menu JSON from mapped products
- [ ] POST `/api/grabfood/order` processes orders with DB-sourced HMAC
- [ ] POST `/api/grabfood/order/state` updates order state + driver info
- [ ] POST `/api/grabfood/menu-sync` persists sync results to syncLogs
- [ ] POST `/api/grabfood/integration-status` logs integration status changes
- [ ] POST `/api/grabfood/menu/push` logs menu push (no apply)
- [ ] Settings tab shows HMAC secret field + 6 copyable webhook URLs
- [ ] `npm run build` passes with zero errors
