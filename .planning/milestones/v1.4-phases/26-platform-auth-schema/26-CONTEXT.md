# Phase 26: Platform Auth & Schema Foundation - Context

**Gathered:** 2026-02-25
**Status:** Ready for planning

<domain>
## Phase Boundary

Establish authentication flows for three new platforms (GoBiz one-click refresh, BigSeller paste-once JWT, GrabFood on-demand resolve), deploy all new schema tables (grabfoodOrders, bigsellerOrders, consignmentOutlets, consignmentSettlements), extend source unions across 4 existing tables, and build a unified credential health panel. This is the foundation that Phases 27-30 all depend on.

**Key constraint:** All platform auth and schema work must be designed for extensibility — new platforms (ShopeeFood, TikTok Shop, additional POS systems like Legato/Tamtem) should require adding a registry entry, not rewriting UI or auth logic.

</domain>

<decisions>
## Implementation Decisions

### Credential Panel UX
- Extend existing Sales Analytics Settings panel (not a new page)
- Status row per platform: icon + platform name + status badge (green/yellow/red) + last activity timestamp + primary action button
- Registry-driven rendering: the panel iterates over the platform registry and renders rows dynamically — adding a new platform means adding a registry entry, not new UI code
- Row layout is consistent across all platforms despite different auth mechanics

### Token Expiry Alerts
- BigSeller expiry thresholds: Green (> 7 days), Yellow (3-7 days), Red (< 3 days)
- Alert style: badge only in the credential settings panel — no toasts, banners, or page-load notifications
- Expired state: red badge + sync buttons disabled for that platform + prominent "Paste new token" action
- Thresholds are configurable per-platform in the registry (future platforms may have different token lifecycles)

### Platform Registry Architecture
- Extend existing `PlatformMeta` in `convex/integrations/registry.ts` with new fields:
  - `authStrategy`: `'password_grant'` (GoBiz) | `'paste_token'` (BigSeller) | `'client_credentials'` (GrabFood) | `'pos_login'` (K3Mart, future POS) | meaningful name for internal (not "none" — researcher to determine best name, e.g., `'internal_db'` or `'session_auth'`)
  - `category`: `'delivery'` (GoBiz, GrabFood) | `'marketplace'` (BigSeller/Shopee/Tokopedia) | `'pos'` (K3Mart, future Legato/Tamtem POS) | `'internal'`
  - `dataTypes`: extend union with `'orders'` (GrabFood and BigSeller sync order-level data, not just revenue aggregates)
  - Health config per platform: `hasExpiry` (boolean), `yellowThresholdDays`, `redThresholdDays`, `healthCheckType` (`'token_expiry'` | `'last_sync'` | `'always_green'`)
- `PlatformId` type in registry is the single source of truth — schema unions, credential lookups, and UI all derive from it
- Add new platforms to registry: `'grabfood'`, `'bigseller'`, `'consignment'`
- K3Mart and future consignment POS systems (Legato, Tamtem) are first-class registry entries with `authStrategy: 'pos_login'`

### Platform Credential Flows
- **GoBiz:** Primary auth via password grant (`POST https://api.gobiz.co.id/goid/token` with email/password from Convex env vars). One-click "Refresh Token" button. Keep existing cookie-paste as fallback in case password grant fails.
- **BigSeller:** Paste-once flow with JWT decode preview — after pasting `muc_token`, dialog shows decoded expiry date and "X days remaining" before user confirms save. Token auto-extends on each sync use.
- **GrabFood:** Verify existing `resolveToken()` in `convex/integrations/grabfood/adapter.ts` works correctly, then integrate into the registry pattern as `authStrategy: 'client_credentials'`. Credential panel shows "Connected" (green) when client credentials are configured via env vars.
- Update `reconnectSteps` for all platforms to reflect new auth strategies:
  - GoBiz: "Click Refresh Token (one-click)" + cookie paste fallback instructions
  - BigSeller: "Paste muc_token from browser"
  - GrabFood: "Automatic — configured via environment variables"
  - K3Mart: keep existing POS login flow
  - New consignment platforms: "Configure POS login credentials"

### Schema & Data Model
- **4 new tables** (platform-prefixed for raw data, standalone for consignment domain):
  - `grabfoodOrders` — raw GrabFood order data (per-order detail, dedup on orderID)
  - `bigsellerOrders` — raw BigSeller order data with SKU breakdowns
  - `consignmentOutlets` — outlet CRUD with configurable rev share %, supports both automated (K3Mart syncs data from POS API) and manual (Goldfinch/Tamtem enter settlements manually) modes
  - `consignmentSettlements` — settlement records per outlet per period
- **Source union extension:** Add `v.literal("grabfood")`, `v.literal("bigseller")`, `v.literal("consignment")` to ALL 4 affected tables (`externalRevenue`, `externalRevenueItems`, `externalSyncLogs`, `externalOutlets`) — deploy all 3 sources upfront in Phase 26 so subsequent phases don't need schema migrations
- K3Mart is also a consignment outlet — it should appear in `consignmentOutlets` but with automated settlement data synced from K3Mart API (rev share % calculated from API data), while other outlets have manually input rev share %
- `PlatformId` type expansion drives schema union literals — when a platform is added to the registry, its literal must also be added to schema unions

### Claude's Discretion
- Exact `PlatformMeta` interface field names and TypeScript typing approach
- Internal auth strategy naming (choose meaningful name for internal/own-database auth)
- Index design for new tables (optimize for expected query patterns)
- Credential panel component implementation details (shadcn components, animations)
- GrabFood resolveToken() verification approach
- How to derive schema union literals from PlatformId type (runtime vs build-time)
- Migration approach for adding K3Mart to consignmentOutlets alongside its existing externalOutlets presence

</decisions>

<specifics>
## Specific Ideas

- "Every platform is slightly different — make sure we're doing this in a flexible way that allows for new platforms in the future"
- K3Mart's POS login strategy should be reusable for other POS systems (Legato POS, Tamtem POS) in future milestones
- The existing `convex/integrations/registry.ts` pattern (platform metadata + adapter per platform) is a good foundation to extend, not replace
- BigSeller paste dialog should decode and preview expiry before saving — admin confirms after seeing "28 days remaining"
- GoBiz password grant replaces the manual browser DevTools cookie-paste flow (but keep cookie paste as fallback)
- Internal data source auth is NOT "none" — it uses our own Convex session auth system, which is a meaningful strategy

</specifics>

<deferred>
## Deferred Ideas

- None — discussion stayed within phase scope

</deferred>

---

*Phase: 26-platform-auth-schema*
*Context gathered: 2026-02-25*
