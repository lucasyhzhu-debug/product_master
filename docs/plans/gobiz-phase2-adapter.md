# Phase 2: Adapter Rewrite

## Context
Replaces the existing GoBiz adapter with journal-level sync using 3 APIs. Creates pure helpers, removes GoBiz cron, updates registry.

**Depends on Phase 1:** Uses `saveRevenueItems`, `autoMatchMenuProduct`, new schema fields (`adBurn`, `promoBurn`, `gobizOrderNumber`, `refreshToken`).

## Git Workflow
**Branch:** `feature/gobiz-journal-sync`
**Checkpoints:** Single commit after all tasks verified

## Three GoBiz APIs (from Python POC)

### API 1: Dashboard Analytics (proxy/63 - 5-metric daily aggregates)
```
POST portal.gofoodmerchant.co.id/analytics-backend/api/datasources/proxy/63/_msearch
Headers:
  authorization: Bearer {token}
  authentication-type: go-id
  x-ref-ids: total_gmv_bottomline_amount;total_gmv_topline_amount;total_commission_amount;total_ad_burn_amount;total_promo_burn_amount
  x-range-from: {ms}, x-range-to: {ms}
  x-dashboard-id: 107, x-panel-id: 22
Body: "" (empty)
Response order: [net, gross, commission, ad_burn, promo_burn]
Values in aggregations.2.buckets[0].1.value
```

### API 2: Journals/Search (transaction-level) - Future
```
POST https://api.gobiz.co.id/journals/search
Headers: authorization: Bearer {token}, authentication-type: go-id
Body: { from, size, sort, included_categories, query: [{clauses: [...]}] }
```
Note: This API requires further validation with live data. Phase 2 implements the dashboard API (proxy/63) with 5 metrics as the primary data source, with journal API support stubbed for future activation.

### API 3: Orders/Search (item details per order) - Future
```
POST https://api.gobiz.co.id/cosmo/v1/orders/search
Headers: authorization: Bearer {token}, authentication-type: go-id
Body: { query: { term: { order_number: "F-XXXXXXX" } } }
```

## Implementation Waves

### Wave 1: Pure Helpers [PARALLEL]
| Task | Files | Details |
|------|-------|---------|
| 1.1 Create `helpers.ts` | `convex/integrations/gobiz/helpers.ts` | 7 pure functions |

#### Helper Functions

| Function | Purpose | Signature |
|----------|---------|-----------|
| `wibDateToUtcRange(dateStr: string)` | WIB date to UTC `{from, to}` ms range | Returns `{from: number, to: number}` |
| `buildDashboardHeaders(token, rangeFromMs, rangeToMs)` | Dashboard API headers with 5 ref IDs | Returns `Record<string, string>` |
| `buildJournalSearchBody(utcFrom, utcTo, merchantId, from, size)` | Journal API request body (future) | Returns JSON object |
| `buildOrderSearchBody(orderNumber)` | Order API request body (future) | Returns JSON object |
| `buildJournalDedupKey(orderNumber, txnTime)` | Dedup key for journal entries | Returns string |
| `extractDashboardMetrics(response)` | Parse dashboard _msearch response to 5 metrics | Returns `{gross, net, commission, adBurn, promoBurn}` |
| `parseOrderItems(orderResponse)` | Extract items array from order response (future) | Returns item array |

### Wave 2: Config Rewrite [SEQUENTIAL, after Wave 1]
| Task | Files | Details |
|------|-------|---------|
| 2.1 Rewrite `config.ts` | `convex/integrations/gobiz/config.ts` | 3 APIs + token refresh config + TypeScript interfaces |

#### Config Structure
```typescript
export const GOBIZ_CONFIG = {
  merchantId: "G293156297",
  portalBaseUrl: "https://portal.gofoodmerchant.co.id",
  dashboardApi: {
    proxyId: 63,
    dashboardId: "107",
    panelId: "22",
    refIds: [
      "total_gmv_bottomline_amount",
      "total_gmv_topline_amount",
      "total_commission_amount",
      "total_ad_burn_amount",
      "total_promo_burn_amount",
    ],
  },
  journalApi: {
    url: "https://api.gobiz.co.id/journals/search",
    pageSize: 50,
  },
  orderApi: {
    url: "https://api.gobiz.co.id/cosmo/v1/orders/search",
  },
  tokenRefresh: {
    microAppUrl: "https://portal.gofoodmerchant.co.id/micro-app/auth",
    rotateUrl: "https://portal.gofoodmerchant.co.id/analytics-backend/api/auth/token/rotate",
    apiUrl: "https://api.gobiz.co.id/auth/token/refresh",
  },
  sync: {
    defaultDaysBack: 7,
    overlapDays: 1,
    wibOffsetHours: 7,
  },
} as const;
```

Plus TypeScript interfaces: `GoBizDashboardResponse`, `GoBizDashboardMetrics`.

### Wave 3: Adapter Rewrite [SEQUENTIAL, after Wave 2]
| Task | Files | Details |
|------|-------|---------|
| 3.1 Rewrite adapter | `convex/integrations/gobiz/adapter.ts` | Dashboard-based sync with 5 metrics |
| 3.2 Remove GoBiz cron | `convex/crons.ts` | Remove GoBiz entry, keep K3Mart |
| 3.3 Update registry | `convex/integrations/registry.ts` | Update description, reconnect steps |

#### Adapter Design

**Sync flow (per WIB day in range):**
1. Resolve token (DB first, env fallback)
2. For each day: build dashboard headers, fetch proxy/63
3. Parse response: extract 5 metrics (net, gross, commission, adBurn, promoBurn)
4. Save as `externalRevenue` record with new fields
5. On 401: attempt 3-method token refresh (cookie, rotate, API), retry once

**Token refresh (3-method cascade from POC):**
1. Cookie refresh: GET `/micro-app/auth` with refresh_token cookie
2. Token rotate: POST `/analytics-backend/api/auth/token/rotate` with cookies
3. API refresh: POST `api.gobiz.co.id/auth/token/refresh` with JSON body
4. On success: update DB via `updateToken` + store new refresh token
5. On failure: mark token expired, return error

**Exports:**
- `syncGoBizRevenue` (public action) - manual trigger
- Remove `syncGoBizRevenueCron` (dead code after cron removal)

### Wave 4: Tests [SEQUENTIAL, after Wave 3]
| Task | Files | Details |
|------|-------|---------|
| 4.1 Helper unit tests | `convex/integrations/gobiz/__tests__/helpers.test.ts` | 11+ tests |
| 4.2 Adapter integration tests | `tests/convex/gobizAdapter.test.ts` | 5+ tests |

#### Helper Test Cases
| Test | What It Verifies |
|------|-----------------|
| `wibDateToUtcRange` converts 2026-02-08 correctly | UTC: 2026-02-07T17:00 to 2026-02-08T16:59:59.999 |
| `wibDateToUtcRange` handles month boundary | Edge case: 2026-03-01 |
| `buildDashboardHeaders` includes all 5 ref IDs | Completeness |
| `buildDashboardHeaders` sets correct dashboard/panel IDs | Field mapping |
| `buildJournalSearchBody` produces valid structure | JSON structure |
| `buildOrderSearchBody` includes order number | Field mapping |
| `buildJournalDedupKey` is deterministic | Same input = same output |
| `extractDashboardMetrics` parses sample response | Correct extraction of 5 metrics |
| `extractDashboardMetrics` handles empty response | Null safety |
| `parseOrderItems` extracts items | Array parsing |
| `parseOrderItems` returns empty for no items | Empty state |

#### Adapter Integration Test Cases
| Test | What It Verifies |
|------|-----------------|
| Adapter creates sync log on start | Sync lifecycle |
| Adapter returns error when no token | Token check |
| Adapter saves revenue with new fields (adBurn, promoBurn) | New field usage |
| Crons file still has K3Mart cron, no GoBiz cron | Selective removal |
| Registry has updated GoBiz description | Metadata update |

### Wave 5: Verification [SEQUENTIAL]
| Agent | Task |
|-------|------|
| code-auditor | Type check + pattern compliance |
| Bash | `npm run build` |
| Bash | `npm run test` |

## Documentation Updates
- [ ] `docs/API_REFERENCE.md` -- new sync args, token refresh, cron removal

## Success Criteria
- [ ] 7 pure helper functions, all tested
- [ ] Config defines dashboard API + token refresh endpoints
- [ ] Adapter implements dashboard-based sync with 5 metrics
- [ ] Token refresh implements 3-method cascade
- [ ] GoBiz cron removed (K3Mart cron kept)
- [ ] Registry updated
- [ ] 11+ helper tests pass
- [ ] 5+ adapter integration tests pass
- [ ] All Phase 1 tests still pass (no regressions)
- [ ] `npm run build` passes
- [ ] `npm run test` passes (full suite)
- [ ] `docs/API_REFERENCE.md` updated

## Git Checkpoint
```
git commit -m "feat: GoBiz adapter rewrite (journal sync + order details + token refresh)"
```
