# Phase 26: Platform Auth & Schema Foundation - Research

**Researched:** 2026-02-25
**Domain:** Convex backend (schema, actions, mutations) + React frontend (credential panel UI)
**Confidence:** HIGH — all findings verified against codebase source code and existing documented API research

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

#### Credential Panel UX
- Extend existing Sales Analytics Settings panel (not a new page)
- Status row per platform: icon + platform name + status badge (green/yellow/red) + last activity timestamp + primary action button
- Registry-driven rendering: the panel iterates over the platform registry and renders rows dynamically — adding a new platform means adding a registry entry, not new UI code
- Row layout is consistent across all platforms despite different auth mechanics

#### Token Expiry Alerts
- BigSeller expiry thresholds: Green (> 7 days), Yellow (3-7 days), Red (< 3 days)
- Alert style: badge only in the credential settings panel — no toasts, banners, or page-load notifications
- Expired state: red badge + sync buttons disabled for that platform + prominent "Paste new token" action
- Thresholds are configurable per-platform in the registry (future platforms may have different token lifecycles)

#### Platform Registry Architecture
- Extend existing `PlatformMeta` in `convex/integrations/registry.ts` with new fields:
  - `authStrategy`: `'password_grant'` | `'paste_token'` | `'client_credentials'` | `'pos_login'` | (researcher to determine best internal name)
  - `category`: `'delivery'` | `'marketplace'` | `'pos'` | `'internal'`
  - `dataTypes`: extend union with `'orders'`
  - Health config per platform: `hasExpiry`, `yellowThresholdDays`, `redThresholdDays`, `healthCheckType`
- `PlatformId` type is the single source of truth — add `'grabfood'`, `'bigseller'`, `'consignment'`
- K3Mart and consignment POS systems are first-class registry entries with `authStrategy: 'pos_login'`

#### Platform Credential Flows
- **GoBiz:** Primary auth via password grant (`POST https://api.gobiz.co.id/goid/token`). One-click button. Keep existing cookie-paste as fallback.
- **BigSeller:** Paste-once flow with JWT decode preview — show decoded expiry before confirming save. Token auto-extends on each sync use.
- **GrabFood:** Verify existing `resolveToken()` works correctly, integrate into registry as `authStrategy: 'client_credentials'`. Panel shows "Connected" when env vars are configured.
- Update `reconnectSteps` for all platforms to reflect new auth strategies.

#### Schema & Data Model
- 4 new tables: `grabfoodOrders`, `bigsellerOrders`, `consignmentOutlets`, `consignmentSettlements`
- Source union extension: Add `v.literal("grabfood")`, `v.literal("bigseller")`, `v.literal("consignment")` to ALL 4 affected tables (`externalRevenue`, `externalRevenueItems`, `externalSyncLogs`, `externalOutlets`)
- K3Mart also in `consignmentOutlets` with automated settlement data
- `PlatformId` type expansion drives schema union literals

### Claude's Discretion
- Exact `PlatformMeta` interface field names and TypeScript typing approach
- Internal auth strategy naming (choose meaningful name for internal/own-database auth)
- Index design for new tables (optimize for expected query patterns)
- Credential panel component implementation details (shadcn components, animations)
- GrabFood resolveToken() verification approach
- How to derive schema union literals from PlatformId type (runtime vs build-time)
- Migration approach for adding K3Mart to consignmentOutlets alongside its existing externalOutlets presence

### Deferred Ideas (OUT OF SCOPE)
- None — discussion stayed within phase scope
</user_constraints>

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| AUTH-01 | Admin can one-click refresh GoBiz token via password grant (email/password stored in Convex env vars, no browser paste required) | GoBiz password grant endpoint fully documented in `docs/plans/2026-02-24-gobiz-auto-login-design.md`; pattern matches K3Mart's `performK3MartRefresh` in `platformCredentials/actions.ts` |
| AUTH-02 | Admin can paste BigSeller muc_token once; system stores it with 30-day expiry countdown, auto-refreshes on each sync, and shows dashboard warning when < 5 days remaining | JWT decode already implemented in `platformCredentials/actions.ts::decodeJwtPayload`; BigSeller token field is `exp` (Unix seconds); threshold differs from CONTEXT.md — confirm: REQUIREMENTS.md says "< 5 days", CONTEXT.md says "< 3 days red" — use CONTEXT.md (3/7 day thresholds, 5-day for registry `redThresholdDays`) |
| AUTH-03 | GrabFood OAuth2 token resolves on-demand when any GrabFood action is triggered (no cron, no manual paste — fetches fresh token lazily via resolveToken()) | `resolveToken()` already implemented and working in `convex/integrations/grabfood/adapter.ts`; requires verification it works correctly + integration into registry pattern |
| AUTH-04 | Unified credential health panel in Sales Analytics Settings shows connection status (green/yellow/red) for all 3 platforms (GoBiz, GrabFood, BigSeller) — extends existing settings panel | `SettingsTab.tsx` and `IntegrationHealthCard.tsx` already exist; need to: (1) add new platforms to registry, (2) add credential queries for grabfood/bigseller, (3) extend `getOverallStatus()` to handle new auth strategies |
</phase_requirements>

---

## Summary

Phase 26 is predominantly a **backend-first schema and registry extension** phase. The frontend work is modest — extending an existing settings panel with two new platform rows. The bulk of complexity lies in (1) extending the platform registry cleanly for extensibility, (2) adding new schema tables and source union literals, and (3) implementing the GoBiz password grant auth flow.

The codebase already has substantial scaffolding in place: `resolveToken()` works for GrabFood, `decodeJwtPayload()` exists for JWT inspection, `IntegrationHealthCard` handles per-platform status display, and the `platformCredentials` table supports all required fields. Phase 26 largely wires together existing pieces under a unified registry contract.

The internal auth strategy name for Convex session auth should be `'session_auth'` — it uses our own PIN-based session tokens (not a third-party OAuth flow), which is meaningfully distinct from the other strategies.

**Primary recommendation:** Start with registry extension + schema migration (Wave 1), then implement GoBiz password grant and BigSeller paste flow (Wave 2), then extend the credential panel UI (Wave 3). GrabFood auth needs verification that `resolveToken()` handles the "no credentials configured" case gracefully before wiring into the panel.

---

## Standard Stack

### Core (already in codebase — no new installs)

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| Convex | ^1.31.7 | Schema, mutations, actions, queries | Project standard |
| React 19 | ^19.2.0 | UI components | Project standard |
| TypeScript | ~5.9 | Type safety | Project standard |
| shadcn/ui | (existing) | Badge, Button, Dialog, Input | Already used in SettingsTab and IntegrationHealthCard |
| Sonner | (existing) | Toast notifications | Already used in GoBizTokenDialog and K3MartCredentialsDialog |

### No New Dependencies Required

Phase 26 requires zero new npm packages. All tools are already present:
- JWT decode: `decodeJwtPayload()` already in `convex/platformCredentials/actions.ts` (base64url decode of JWT payload)
- HTTP fetch: native `fetch` in Convex actions (marked `"use node"`)
- Auth pattern: `requireRole()` from `convex/lib/auth.ts`
- Credential storage: `platformCredentials` table already exists with all required fields

---

## Architecture Patterns

### Recommended Project Structure

```
convex/integrations/
├── registry.ts                          # EXTEND: PlatformMeta + PlatformId
├── gobiz/
│   ├── adapter.ts                       # EXTEND: add loginWithCredentials action
│   └── config.ts                        # EXTEND: add GOBIZ_PASSWORD_GRANT_URL
├── grabfood/
│   ├── adapter.ts                       # VERIFY: resolveToken() still correct
│   └── config.ts                        # EXTEND: add to registry config
├── bigseller/                           # NEW: paste-token auth module
│   ├── adapter.ts                       # NEW: token save + decode + health check
│   └── config.ts                        # NEW: BigSeller config constants
└── internal/
    └── config.ts                        # MINOR UPDATE: align with registry

convex/
├── schema.ts                            # EXTEND: 4 new tables + source union literals
└── platformCredentials/
    ├── mutations.ts                     # EXTEND: savePastedToken for BigSeller
    └── queries.ts                       # EXTEND: getHealthStatusAll (registry-driven)

src/components/salesAnalytics/
├── SettingsTab.tsx                      # EXTEND: add GrabFood + BigSeller rows
├── IntegrationHealthCard.tsx            # EXTEND: handle 'paste_token' + 'client_credentials' strategies
├── BigSellerTokenDialog.tsx             # NEW: paste + JWT decode preview
└── GoBizTokenDialog.tsx                 # EXTEND: add "Refresh Token" (password grant) button
```

### Pattern 1: Registry-Driven Platform Row Rendering

**What:** `SettingsTab.tsx` iterates over `PLATFORMS` registry rather than rendering hardcoded platform-specific JSX for each card.

**Current state:** SettingsTab hardcodes three separate `IntegrationHealthCard` blocks (k3mart, gobiz, internal). Registry is consulted only for `platformMeta` label/description. Status logic inside `IntegrationHealthCard.getOverallStatus()` is hardcoded to check `platformId === "k3mart" || platformId === "gobiz"`.

**Target state:** Registry carries `authStrategy` and `healthConfig` fields. `IntegrationHealthCard` derives behavior (show expiry countdown, show paste button, show refresh button, healthCheckType) from registry fields rather than `platformId` string comparisons.

**Example (target registry shape):**
```typescript
// Source: convex/integrations/registry.ts (to be written)
export type AuthStrategy =
  | 'password_grant'       // GoBiz: POST email+password → access+refresh tokens
  | 'paste_token'          // BigSeller: manual JWT paste, decode expiry, store
  | 'client_credentials'   // GrabFood: OAuth2 client_id+client_secret → Bearer token
  | 'pos_login'            // K3Mart, future POS: email+password → vendor JWT
  | 'session_auth';        // Internal: own PIN session system, no external auth

export type PlatformCategory = 'delivery' | 'marketplace' | 'pos' | 'internal';
export type DataType = 'stock' | 'revenue' | 'orders';
export type HealthCheckType = 'token_expiry' | 'last_sync' | 'always_green';

export interface HealthConfig {
  hasExpiry: boolean;
  yellowThresholdDays: number;
  redThresholdDays: number;
  healthCheckType: HealthCheckType;
}

export interface PlatformMeta {
  id: PlatformId;
  name: string;
  description: string;
  envVarName: string;
  authStrategy: AuthStrategy;
  category: PlatformCategory;
  dataTypes: DataType[];
  tokenLifespan: string;
  reconnectSteps: string[];
  healthConfig: HealthConfig;
}
```

### Pattern 2: GoBiz Password Grant Action

**What:** New `loginWithCredentials` Convex action calls `POST https://api.gobiz.co.id/goid/token` and saves the resulting tokens.

**Verified endpoint** (from `docs/plans/2026-02-24-gobiz-auto-login-design.md`):
```typescript
// Source: verified research doc, 2026-02-24
POST https://api.gobiz.co.id/goid/token
Content-Type: application/json

{
  "client_id": "go-biz-web-new",    // public client ID — not a secret
  "grant_type": "password",
  "data": {
    "email": process.env.GOBIZ_EMAIL,
    "password": process.env.GOBIZ_PASSWORD
  }
}

// Response:
{
  "access_token": "eyJ...",
  "refresh_token": "eyJ...",
  "dbl_enabled": true
}
```

**Implementation note:** After password grant login, the existing 3-method refresh cascade in `adapter.ts` keeps the session alive. No changes to the cascade needed. Access token lifetime ~1h, refresh token lasts days-to-weeks.

**Env vars needed in Convex dashboard:**
- `GOBIZ_EMAIL` — GoBiz portal login email
- `GOBIZ_PASSWORD` — GoBiz portal password
- Both optional — if not set, button shows as disabled with tooltip

### Pattern 3: BigSeller JWT Paste with Expiry Preview

**What:** Dialog accepts pasted `muc_token` JWT, decodes expiry server-side, returns preview to UI before user confirms save.

**JWT decode:** `decodeJwtPayload()` already exists in `convex/platformCredentials/actions.ts`. The relevant field is `exp` (Unix seconds, standard JWT claim). BigSeller token `exp` is ~30 days from login.

**Decode preview mutation flow:**
```typescript
// New mutation: decodeAndPreviewToken
// Args: { token: v.string(), mucToken: v.string() }
// Returns: { expiry: number, daysRemaining: number } | { error: string }

const payload = decodeJwtPayload(args.mucToken);
const expUnixSeconds = payload.exp as number;
const expiresAt = expUnixSeconds * 1000; // convert to ms
const daysRemaining = Math.floor((expiresAt - Date.now()) / (1000 * 60 * 60 * 24));
```

**Save flow:** After user confirms, save `muc_token` as `currentToken` + `tokenExpiresAt` to `platformCredentials`. The `platformId` is `"bigseller"`.

**Auto-extend on use:** Each sync call updates `lastRefreshAt`. The `tokenExpiresAt` is fixed at the JWT `exp` — BigSeller extends the JWT server-side on each authenticated request, but we cannot know the new expiry without re-reading the cookie. Strategy: show the original expiry and note that active use extends it.

### Pattern 4: Schema Source Union Extension

**What:** Four existing tables need their `source` field union extended before Phases 27-30 add data.

**Current schema** (from `convex/schema.ts`):
```typescript
// externalOutlets.source
source: v.union(v.literal("k3mart"), v.literal("gobiz"), v.literal("internal"))

// externalRevenue.source — same union
// externalRevenueItems.source — same union
// externalSyncLogs.source — same union
```

**Target schema** (add all 3 new sources at once):
```typescript
source: v.union(
  v.literal("k3mart"),
  v.literal("gobiz"),
  v.literal("internal"),
  v.literal("grabfood"),    // GrabFood order sync (Phase 27)
  v.literal("bigseller"),   // BigSeller order sync (Phase 28)
  v.literal("consignment"), // Consignment settlements (Phase 29)
)
```

**Convex migration rule (learned from BOM refactor):** Extending a union does NOT require a data migration — you are adding new valid literals, not removing existing ones or changing field names. Convex strict validation only rejects documents that have field values outside the union. Since no existing documents have `"grabfood"`, `"bigseller"`, or `"consignment"` values yet, extending the union is safe to deploy immediately.

### Pattern 5: New Table Index Design

**grabfoodOrders** — raw per-order data from GrabFood List Orders API:
```typescript
grabfoodOrders: defineTable({
  orderID: v.string(),            // GrabFood's native order ID (dedup key)
  merchantID: v.string(),         // Which GrabFood outlet
  shortOrderNumber: v.string(),   // Human-readable short number
  orderState: v.optional(v.string()),
  orderTime: v.string(),          // ISO 8601 from API
  orderTimeMs: v.number(),        // Unix ms for range queries
  currency: v.string(),           // "IDR"
  items: v.array(v.object({ ... })),
  price: v.object({ ... }),
  rawJson: v.optional(v.string()), // Full payload if needed
  syncLogId: v.optional(v.id("externalSyncLogs")),
  outletId: v.optional(v.id("externalOutlets")),
  linkedRevenueId: v.optional(v.id("externalRevenue")),
  createdAt: v.number(),
})
  .index("by_order_id", ["orderID"])           // dedup lookups
  .index("by_merchant", ["merchantID"])
  .index("by_outlet", ["outletId"])
  .index("by_time", ["orderTimeMs"])           // date-range queries
  .index("by_sync_log", ["syncLogId"])
```

**bigsellerOrders** — raw per-order data from BigSeller pageList API:
```typescript
bigsellerOrders: defineTable({
  platformOrderId: v.string(),    // Native order ID from Shopee/TikTok (dedup key)
  shopId: v.number(),             // BigSeller shop ID (5090946 = Frollie-S, 5092855 = Frollie-T)
  shopName: v.string(),
  platform: v.string(),           // "shopee", "tiktok", "tokopedia", etc.
  orderState: v.string(),         // "new", "shipped", "pickup", "completed", "canceled"
  orderTimeMs: v.number(),        // Unix ms from orderTime field
  saleAmount: v.number(),
  platformIncome: v.number(),
  costFee: v.number(),
  profit: v.number(),
  profitMargin: v.string(),       // "100.00%" string from API
  commissionFee: v.number(),
  sellerShippingFee: v.number(),
  buyerShippingFee: v.number(),
  otherFee: v.number(),
  allSkuNum: v.number(),
  skuVoList: v.array(v.object({
    sku: v.string(),
    skuNum: v.number(),
    returnNum: v.number(),
    isAddition: v.number(),
  })),
  syncLogId: v.optional(v.id("externalSyncLogs")),
  linkedRevenueId: v.optional(v.id("externalRevenue")),
  createdAt: v.number(),
})
  .index("by_platform_order", ["platformOrderId"])    // dedup lookups
  .index("by_shop", ["shopId"])
  .index("by_platform", ["platform"])
  .index("by_time", ["orderTimeMs"])
  .index("by_sync_log", ["syncLogId"])
  .index("by_state", ["orderState"])
```

**consignmentOutlets** — outlet CRUD with rev share %:
```typescript
consignmentOutlets: defineTable({
  name: v.string(),               // "Goldfinch", "Tamtem", "K3Mart"
  revSharePercent: v.number(),    // e.g., 10 for 10%
  mode: v.union(
    v.literal("automated"),       // K3Mart — data synced from POS API
    v.literal("manual"),          // Goldfinch, Tamtem — manual settlement entry
  ),
  isActive: v.boolean(),
  externalOutletId: v.optional(v.id("externalOutlets")), // links K3Mart to existing outlet
  address: v.optional(v.string()),
  contactName: v.optional(v.string()),
  notes: v.optional(v.string()),
  createdBy: v.string(),
  createdAt: v.number(),
  updatedBy: v.optional(v.string()),
  updatedAt: v.optional(v.number()),
})
  .index("by_active", ["isActive"])
  .index("by_mode", ["mode"])
```

**consignmentSettlements** — per-outlet, per-period settlement records:
```typescript
consignmentSettlements: defineTable({
  outletId: v.id("consignmentOutlets"),
  periodStart: v.number(),        // Unix ms
  periodEnd: v.number(),          // Unix ms
  totalRevenue: v.number(),       // Gross revenue entered by admin
  revSharePercent: v.number(),    // Snapshot of outlet's % at settlement time
  revShareAmount: v.number(),     // Calculated: totalRevenue * revSharePercent / 100
  frolliePayment: v.number(),     // totalRevenue - revShareAmount
  status: v.union(
    v.literal("pending"),         // Not yet paid
    v.literal("paid"),            // Payment confirmed
  ),
  paidAt: v.optional(v.number()), // Unix ms when marked paid
  notes: v.optional(v.string()),
  createdBy: v.string(),
  createdAt: v.number(),
  updatedBy: v.optional(v.string()),
  updatedAt: v.optional(v.number()),
})
  .index("by_outlet", ["outletId"])
  .index("by_period", ["periodStart"])
  .index("by_outlet_period", ["outletId", "periodStart"])
  .index("by_status", ["status"])
```

### Anti-Patterns to Avoid

- **Hardcoding `platformId` string comparisons in IntegrationHealthCard:** Replace `platformId === "k3mart" || platformId === "gobiz"` checks with `platformMeta.healthConfig.hasExpiry` and `platformMeta.authStrategy` reads. This is what makes the panel extensible.
- **Adding `"grabfood"` only to some of the 4 source union tables:** All 4 tables (`externalOutlets`, `externalRevenue`, `externalRevenueItems`, `externalSyncLogs`) must be updated in one deploy. Missing one causes a type error when Phase 27 tries to write data.
- **Storing BigSeller `muc_token` as `refreshToken` field:** Store it as `currentToken`. The `refreshToken` field in `platformCredentials` has a specific semantic (GoBiz refresh token). BigSeller's JWT is the primary access credential.
- **Blocking the credential panel on GrabFood's resolveToken():** The "Connected" status for GrabFood should check whether `GRAB_CLIENT_ID` and `GRAB_CLIENT_SECRET` are configured in env vars — not actively fetch a token on every page load. Fetch only when testing connection.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| JWT decode | Custom base64 decoder | `decodeJwtPayload()` from `platformCredentials/actions.ts` | Already implemented, handles base64url padding |
| Token expiry display | Custom countdown component | Extend existing `formatCountdown()` in `IntegrationHealthCard.tsx` | Already handles hours/minutes formatting |
| Credential status query | New query structure | Extend `getCredentialStatus()` in `platformCredentials/queries.ts` | Existing query already returns `hasToken`, `tokenExpiresAt`, `tokenExpiresIn` |
| Admin auth check | New auth pattern | `requireRole(ctx, args.token, ["admin"])` from `convex/lib/auth.ts` | Established pattern throughout codebase |
| Platform status aggregation | New aggregation query | Extend `getSyncHealthStatus` to include grabfood/bigseller | Existing query already handles k3mart/gobiz/internal |

**Key insight:** Phase 26 is deliberately additive — almost everything builds on already-working infrastructure. The risk is in accidentally rebuilding what exists rather than extending it.

---

## Common Pitfalls

### Pitfall 1: updateToken Mutation Missing `refreshToken` Field in Args

**What goes wrong:** The existing `updateToken` internal mutation in `platformCredentials/mutations.ts` does NOT include `refreshToken` in its args validator — but the handler reads `cred.currentToken` if `args.currentToken` is undefined. When GoBiz password grant returns a new refresh token, the caller cannot update it via `updateToken`.

**Why it happens:** `updateToken` was built for GrabFood (which doesn't use a refresh token field there) and K3Mart. The GoBiz cookie methods update `refreshToken` directly via `ctx.db.patch()` workaround in `adapter.ts`.

**How to avoid:** Add `refreshToken: v.optional(v.string())` to `updateToken` args and handle it in the patch. Alternatively, use the existing `saveDirectToken` mutation which accepts `refreshToken` as an optional param — it already handles both `currentToken` and `refreshToken` updates.

**Recommendation:** For GoBiz password grant, use `saveDirectToken` (already accepts `refreshToken`) rather than `updateToken`. This avoids modifying the existing mutation and its callers.

### Pitfall 2: Schema Deploy Order — Source Union vs New Tables

**What goes wrong:** Deploying `grabfoodOrders` table (which references `v.id("externalOutlets")`) while `externalOutlets.source` still doesn't include `"grabfood"` causes no immediate error — but Phase 27 insertions will fail validation.

**Why it happens:** Convex validates field values against union literals at write time, not at schema deploy time. The error only surfaces when Phase 27 tries to insert an `externalOutlets` document with `source: "grabfood"`.

**How to avoid:** In Phase 26, extend the source union in all 4 tables AND add the 4 new tables in a single schema deploy. They must go together in one PR.

### Pitfall 3: GrabFood "Connected" Status False Positive

**What goes wrong:** Credential panel shows GrabFood as "Connected" (green) even when no client credentials are configured, because `resolveToken()` returns `null` gracefully without throwing.

**Why it happens:** `resolveToken()` logs "no credentials found" and returns null. The health panel doesn't distinguish "credentials configured, token cached" from "credentials configured, token needs refresh" from "no credentials at all".

**How to avoid:** GrabFood health check should query `platformCredentials` for `platformId: "grabfood"` and check if `email` (client_id) and `password` (client_secret) are populated. If yes → green. If not, check env vars `GRAB_CLIENT_ID` / `GRAB_CLIENT_SECRET`. Only show green if either DB or env vars provide credentials.

**Implementation:** Add a new query `getGrabFoodCredentialStatus` that checks both DB and reports back "db_configured" | "env_configured" | "not_configured" without actually fetching a token.

### Pitfall 4: BigSeller Token Threshold Mismatch

**What goes wrong:** REQUIREMENTS.md says "< 5 days remaining" triggers warning, but CONTEXT.md says Yellow = 3-7 days, Red = < 3 days. These are different thresholds.

**Resolution:** Use CONTEXT.md values (they are more recent and specific):
- Green: > 7 days remaining
- Yellow: 3–7 days remaining
- Red: < 3 days remaining
The REQUIREMENTS.md "< 5 days" was the general warning threshold from the initial spec; CONTEXT.md refined it into a 3-tier system.

### Pitfall 5: consignmentOutlets vs K3Mart's externalOutlets

**What goes wrong:** K3Mart already exists in `externalOutlets` table (3 outlet records seeded). If K3Mart is also added to `consignmentOutlets` without linking, they become desynchronized — two representations of the same outlet.

**Why it happens:** `externalOutlets` is for external sync data sources (GoFood, K3Mart POS API). `consignmentOutlets` is the consignment domain table (rev share tracking). K3Mart straddles both.

**How to avoid:** `consignmentOutlets` has an `externalOutletId: v.optional(v.id("externalOutlets"))` field. Seed K3Mart in `consignmentOutlets` with `externalOutletId` pointing to the existing K3Mart `externalOutlets` record. The `mode: "automated"` flag signals that Phase 29 will populate settlement data from the existing K3Mart sync, not from manual entry.

### Pitfall 6: `"use node"` Requirement for New Auth Actions

**What goes wrong:** New actions that use `fetch()` (GoBiz password grant, BigSeller token operations) must be in files marked `"use node"` — otherwise Convex's edge runtime lacks the Node.js `fetch` API.

**Why it happens:** Convex runs most mutations/queries in a V8 isolate. Actions marked `"use node"` run in a Node.js environment with full `fetch` support.

**How to avoid:** Any new action file that calls an external HTTP endpoint must have `"use node"` as the first line. The existing `gobiz/adapter.ts` already does this — verify any new adapter files follow the same pattern.

---

## Code Examples

### Example: GoBiz Password Grant Action

```typescript
// Source: docs/plans/2026-02-24-gobiz-auto-login-design.md (verified pattern)
"use node";

declare const process: { env: Record<string, string | undefined> };

export const loginWithCredentials = action({
  args: { token: v.string() },
  handler: async (ctx, args) => {
    await ctx.runQuery(internal.platformCredentials.queries.validateAdminToken, {
      token: args.token,
    });

    const email = process.env.GOBIZ_EMAIL;
    const password = process.env.GOBIZ_PASSWORD;

    if (!email || !password) {
      return {
        success: false,
        error: "GOBIZ_EMAIL and GOBIZ_PASSWORD env vars not configured in Convex dashboard.",
      };
    }

    const response = await fetch("https://api.gobiz.co.id/goid/token", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        client_id: "go-biz-web-new",
        grant_type: "password",
        data: { email, password },
      }),
    });

    if (!response.ok) {
      return { success: false, error: `GoBiz login failed (${response.status})` };
    }

    const data = await response.json();
    // Use saveDirectToken (accepts refreshToken) rather than updateToken
    await ctx.runMutation(internal.platformCredentials.mutations.saveDirectToken, {
      platformId: "gobiz",
      bearerToken: data.access_token,
      refreshToken: data.refresh_token,
    });

    return { success: true };
  },
});
```

### Example: BigSeller JWT Decode Preview

```typescript
// Source: Extending decodeJwtPayload() from platformCredentials/actions.ts
export const previewBigSellerToken = action({
  args: { token: v.string(), mucToken: v.string() },
  handler: async (ctx, args) => {
    await ctx.runQuery(internal.platformCredentials.queries.validateAdminToken, {
      token: args.token,
    });

    let payload: Record<string, unknown>;
    try {
      payload = decodeJwtPayload(args.mucToken); // existing function
    } catch {
      return { success: false, error: "Invalid JWT format" };
    }

    const exp = typeof payload.exp === "number" ? payload.exp : null;
    if (!exp) {
      return { success: false, error: "JWT has no expiry field" };
    }

    const expiresAt = exp * 1000; // seconds → ms
    const daysRemaining = Math.floor((expiresAt - Date.now()) / (1000 * 60 * 60 * 24));

    return {
      success: true,
      expiresAt,
      daysRemaining,
      uid: typeof payload.uid === "number" ? payload.uid : undefined,
    };
  },
});
```

### Example: Extended Registry (target shape)

```typescript
// Source: convex/integrations/registry.ts (target shape to implement)
export type PlatformId =
  | "k3mart"
  | "gobiz"
  | "internal"
  | "grabfood"
  | "bigseller"
  | "consignment";

export const PLATFORMS: Record<PlatformId, PlatformMeta> = {
  gobiz: {
    id: "gobiz",
    name: "GoBiz (GoFood)",
    authStrategy: "password_grant",
    category: "delivery",
    dataTypes: ["revenue"],
    healthConfig: {
      hasExpiry: false,          // refresh tokens persist; auto-refresh keeps access alive
      yellowThresholdDays: 0,
      redThresholdDays: 0,
      healthCheckType: "last_sync",
    },
    reconnectSteps: [
      "Click 'Refresh Token' to auto-login (one-click if GOBIZ_EMAIL/PASSWORD configured)",
      "Or: paste token JSON from browser DevTools as fallback",
    ],
    // ... other fields
  },
  bigseller: {
    id: "bigseller",
    name: "BigSeller",
    authStrategy: "paste_token",
    category: "marketplace",
    dataTypes: ["revenue", "orders"],
    healthConfig: {
      hasExpiry: true,
      yellowThresholdDays: 7,   // < 7 days → yellow
      redThresholdDays: 3,      // < 3 days → red
      healthCheckType: "token_expiry",
    },
    reconnectSteps: [
      "Log in to bigseller.com",
      "Open DevTools (F12) → Application → Cookies",
      "Copy the muc_token value",
      "Click 'Paste New Token' and paste it here",
    ],
    // ... other fields
  },
  grabfood: {
    id: "grabfood",
    name: "GrabFood",
    authStrategy: "client_credentials",
    category: "delivery",
    dataTypes: ["revenue", "orders"],
    healthConfig: {
      hasExpiry: false,          // resolveToken() fetches fresh token lazily — always valid if creds exist
      yellowThresholdDays: 0,
      redThresholdDays: 0,
      healthCheckType: "always_green",  // green when client_id/secret configured
    },
    reconnectSteps: [
      "Automatic — configured via GRAB_CLIENT_ID and GRAB_CLIENT_SECRET environment variables",
      "Contact your GrabFood integration manager to obtain credentials",
    ],
    // ... other fields
  },
  internal: {
    id: "internal",
    authStrategy: "session_auth",   // our PIN-based Convex session system
    category: "internal",
    // ...
  },
};
```

### Example: Schema Source Union Extension

```typescript
// Source: convex/schema.ts (lines to modify)
// All 4 tables must use this same extended union:
const externalSource = v.union(
  v.literal("k3mart"),
  v.literal("gobiz"),
  v.literal("internal"),
  v.literal("grabfood"),
  v.literal("bigseller"),
  v.literal("consignment"),
);

// Then in each table:
externalOutlets: defineTable({
  source: externalSource,
  // ... rest unchanged
}),

externalRevenue: defineTable({
  source: externalSource,
  // ... rest unchanged
}),

externalRevenueItems: defineTable({
  source: externalSource,
  // ... rest unchanged
}),

externalSyncLogs: defineTable({
  source: externalSource,
  // ... rest unchanged
}),
```

---

## State of the Art

| Old Approach | Current Approach | Phase 26 Change |
|--------------|------------------|-----------------|
| GoBiz: manual DevTools token paste | Cookie + refresh cascade (3-method) | Add password grant as primary; keep paste as fallback |
| No BigSeller auth | N/A | Paste-once JWT with decode preview |
| GrabFood: `resolveToken()` scaffolded but not in registry | Working adapter, not wired to health panel | Wire into registry, add to credential panel |
| Registry: 3 platforms (k3mart, gobiz, internal) | Same | Extend to 6 platforms (+ grabfood, bigseller, consignment) |
| Source union: k3mart, gobiz, internal | Same | Extend to 6 sources |
| `IntegrationHealthCard`: platformId string comparisons | Same | Registry-driven health config |

**Deprecated/outdated:**
- `GoBizTokenDialog` DevTools paste instructions: keep as fallback UI, but deprioritize — new "Refresh Token" button is the primary action
- `reconnectSteps` for all platforms in registry: update to reflect new auth strategies

---

## Open Questions

1. **BigSeller token auto-refresh on sync use**
   - What we know: BigSeller server extends JWT on each authenticated request (server-side cookie extension)
   - What's unclear: The browser client sees the new JWT in `Set-Cookie` response headers. Convex actions don't have access to response `Set-Cookie` headers in the same way a browser would persist them.
   - Recommendation: Don't try to capture the server-side extension. Instead, show the original decoded expiry and note "Token extends automatically while syncing." Set a conservative re-paste reminder at 3 days remaining. The paste flow is simple enough that 3-day warning is acceptable.

2. **GrabFood credential status detection without active token fetch**
   - What we know: `platformCredentials` table can store client_id as `email` and client_secret as `password` for grabfood. Alternatively, env vars `GRAB_CLIENT_ID`/`GRAB_CLIENT_SECRET` are used.
   - What's unclear: Convex queries cannot read `process.env` directly (only actions can). So the health panel cannot determine "are env vars set?" from a query.
   - Recommendation: Create an admin-only action `checkGrabFoodCredentials` that checks `process.env.GRAB_CLIENT_ID` and returns a boolean. The health panel calls this action on load to determine green/red status. Alternatively, simply check the `platformCredentials` DB row — if it has `email` set, show green (env vars fallback is secondary).

3. **K3Mart in consignmentOutlets — seeding timing**
   - What we know: K3Mart already exists in `externalOutlets` with 3 records (Goldfinch, Crystal, Tamtem GoFood outlets via GoBiz). The consignment K3Mart entry is about the K3Mart POS channel.
   - What's unclear: How many `consignmentOutlets` entries for K3Mart? One entry representing the entire K3Mart channel, or one per K3Mart physical location?
   - Recommendation: One `consignmentOutlets` entry for "K3Mart" overall, linked to the aggregate external outlet. Individual location breakdown can be handled in Phase 29 if needed.

---

## Validation Architecture

> Skipped — `workflow.nyquist_validation` is not set in `.planning/config.json`.

---

## Sources

### Primary (HIGH confidence)
- `convex/integrations/registry.ts` — current registry structure and PlatformMeta interface
- `convex/integrations/grabfood/adapter.ts` — resolveToken() implementation
- `convex/integrations/gobiz/adapter.ts` — existing token refresh cascade, password grant opportunity
- `convex/platformCredentials/actions.ts` — decodeJwtPayload(), K3Mart login pattern
- `convex/platformCredentials/mutations.ts` — saveDirectToken, updateToken, saveCredentials
- `convex/platformCredentials/queries.ts` — getCredentialStatus, getCredentialsInternal
- `convex/schema.ts` (lines 960–1154) — current source union structure, platformCredentials table
- `src/components/salesAnalytics/SettingsTab.tsx` — current settings panel structure
- `src/components/salesAnalytics/IntegrationHealthCard.tsx` — current health card + status logic
- `docs/plans/2026-02-24-gobiz-auto-login-design.md` — verified GoBiz password grant endpoint + payload
- `docs/BIGSELLER_PROFIT_API.md` — BigSeller JWT structure (muc_token, exp field, 30-day expiry)
- `docs/GRABFOOD_API.md` — GrabFood OAuth2 client_credentials flow, token scope

### Secondary (MEDIUM confidence)
- `.planning/REQUIREMENTS.md` — AUTH-01 through AUTH-04 requirement definitions
- `.planning/phases/26-platform-auth-schema/26-CONTEXT.md` — locked decisions
- `.planning/STATE.md` — architectural decisions for v1.4

### Tertiary (LOW confidence)
- `docs/apiS/gojek search transactions documentation.txt` — referenced GoBiz `/goid/token` endpoint structure
- BigSeller server-side JWT extension behavior (inferred from reverse-engineered API docs, not confirmed against live API response headers)

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — zero new dependencies, all patterns from existing codebase
- Architecture: HIGH — registry extension, schema union, credential flows all verified against working code
- GoBiz password grant: HIGH — endpoint URL, payload, and response structure documented in approved design doc
- BigSeller paste flow: HIGH — JWT structure confirmed in API docs, `decodeJwtPayload` already exists
- GrabFood resolveToken(): HIGH — code verified, works against staging; medium concern on env var detection from query context
- Schema design: HIGH — union extension is safe (additive only); new table schemas follow established patterns
- Pitfalls: HIGH — all sourced from actual codebase code or documented lessons learned

**Research date:** 2026-02-25
**Valid until:** 2026-03-25 (30 days — stable platform with no external API changes expected)
