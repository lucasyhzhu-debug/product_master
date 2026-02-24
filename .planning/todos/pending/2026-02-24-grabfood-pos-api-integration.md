---
created: 2026-02-24T07:04:18.432Z
title: GrabFood POS API integration
area: api
files:
  - convex/integrations/grabfood/config.ts
  - convex/integrations/grabfood/adapter.ts
  - convex/integrations/registry.ts
  - convex/http.ts
  - docs/GRABFOOD_API.md
---

## Problem

Frollie receives orders from multiple channels (internal WhatsApp, GoFood via GoBiz). GrabFood is a major delivery platform in Indonesia not yet integrated. Without POS integration, GrabFood orders must be manually entered — causing delays, errors, and no real-time kitchen visibility.

The POC has been prototyped in a staging sandbox (project ID: `2ca08751-a915-471c-a51c-410565946541`, Client ID: `abef9e46e03b4cefa44dbeefeb3e5247`, staging environment). The foundation files are committed to main.

## What has been done (POC — not production-ready)

- `convex/integrations/grabfood/config.ts` — full typed config + GrabFood API types
- `convex/integrations/grabfood/adapter.ts` — OAuth2 token management, order accept/reject, mark ready, pause store, menu notify, webhook HTTP handlers
- `convex/http.ts` — two webhook routes registered:
  - `POST /api/grabfood/order` — receives new customer orders pushed by Grab
  - `POST /api/grabfood/menu-sync` — receives menu sync result callbacks
- `convex/integrations/registry.ts` — "grabfood" added as PlatformId
- `docs/GRABFOOD_API.md` — complete API reference documentation (all endpoints, full data models, webhook payloads, integration checklist)

## Solution

Build out the full production GrabFood POS integration as a dedicated milestone. Key phases:

### Phase 1 — Credentials & Token Management
- Store Client ID + Secret securely via Settings UI (admin-only)
- Auto-refresh cron (every 45min) via `autoRefreshToken` internal action
- Health status visible on integrations dashboard

### Phase 2 — Incoming Order Flow
- Store incoming webhook orders in a `grabfoodOrders` table (schema addition)
- Display in Kitchen View alongside internal and GoFood orders
- Auto-accept toggle (sandbox: always auto-accept for testing)
- Manual accept/reject UI for manual acceptance mode

### Phase 3 — Menu Sync
- Push Frollie menu products to GrabFood via `PUT /partner/v1/batch/menu`
- Map Frollie `menuProducts` → GrabFood item IDs
- Trigger re-sync on menu/price changes
- Surface sync failures from webhook in dashboard

### Phase 4 — Order Lifecycle
- Mark ready → notify driver
- Edit order (mark items unavailable when out of stock)
- Cancel order with reason codes
- Track GrabFood revenue in `externalRevenue` table alongside GoFood

### Phase 5 — Testing & Go-Live
- Execute all GrabFood sandbox test cases
- Create Production project in developer portal
- Switch `baseUrl` from staging to production
- HMAC webhook signature validation

## Reference

- Full API docs: `docs/GRABFOOD_API.md`
- GrabFood developer portal: https://developer.grab.com/dashboard/grab-platform/projects/2ca08751-a915-471c-a51c-410565946541
- Official API reference: https://developer.grab.com/docs/grabfood/api/v1-1-3/
- SDK source (Go): https://github.com/grab/grabfood-api-sdk-go
- Staging webhook URL: `https://exciting-fennec-671.convex.site/api/grabfood/order`
- Production webhook URL: `https://decisive-wombat-7.convex.site/api/grabfood/order`

## Constraints

- GrabFood staging does NOT cover ID (Indonesia) for manual acceptance — auto-accept only in sandbox
- Must register webhook URL in GrabFood portal Configuration tab before orders can be received
- HMAC Secret (visible in Credentials panel) must be used to validate webhook signatures in production
- Menu item IDs must be stable — changing partner `id` breaks the GrabFood catalogue link
