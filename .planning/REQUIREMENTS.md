# Requirements: Frollie Recipe Master

**Defined:** 2026-02-25
**Milestone:** v1.4 Sales & Channel Integration
**Core Value:** Production reliability — single source of truth for recipes, orders, kitchen production, and inventory

## v1.4 Requirements

Requirements for milestone v1.4. Each maps to roadmap phases (26+).

### Platform Authentication

- [x] **AUTH-01**: Admin can one-click refresh GoBiz token via password grant (email/password stored in Convex env vars, no browser paste required)
- [x] **AUTH-02**: Admin can paste BigSeller muc_token once; system stores it with 30-day expiry countdown, auto-refreshes on each sync, and shows dashboard warning when < 5 days remaining
- [x] **AUTH-03**: GrabFood OAuth2 token resolves on-demand when any GrabFood action is triggered (no cron, no manual paste — fetches fresh token lazily via resolveToken())
- [x] **AUTH-04**: Unified credential health panel in Sales Analytics Settings shows connection status (green/yellow/red) for all 3 platforms (GoBiz, GrabFood, BigSeller) — extends existing settings panel

### GrabFood POS Integration

- [x] **GF-06**: Admin can manually trigger GrabFood order history sync (button pull, not cron) that fetches paginated orders via GET /partner/v1/orders per outlet, stores in grabfoodOrders table, and bridges to externalRevenue for analytics
- [x] **GF-07**: Manager can view GrabFood store status (OPEN/CLOSED/PAUSED) per outlet, and one-click pause (30/60/120 min) or unpause any outlet from internal system
- [x] **GF-08**: Manager can toggle GrabFood menu item availability (AVAILABLE/UNAVAILABLE) via batch API; requires initial grabItemID mapping setup per outlet

### BigSeller Integration

- [x] **BS-01**: Admin can manually trigger BigSeller sync (button, not cron); system calls sync/task/create.json, scheduler-chain polls every 60s until taskStatus="complete", then pulls per-order data via pageList with full pagination
- [x] **BS-02**: Per-order data stored in bigsellerOrders table with SKU breakdown (skuVoList), platform (shopee/tokopedia), shop-level breakdown, and all fee fields; bridges to externalRevenue for analytics
- [x] **BS-03**: Admin can map BigSeller SKU codes (e.g., FRO-DubChe-Reg1) to internal menuProducts for unified per-product reporting across channels

### Consignment Settlements

- [ ] **CON-01**: Admin can manage consignment outlets (CRUD) with configurable rev sharing percentage per outlet (e.g., Goldfinch 10%, Tamtem 10%)
- [ ] **CON-02**: Admin can enter consignment settlement records: select outlet, enter period (date range), enter total revenue; system auto-calculates rev sharing and payment to Frollie based on outlet's configured percentage
- [ ] **CON-03**: Admin can mark settlement as paid with payment date; system tracks payment status per settlement period
- [ ] **CON-04**: Consignment page shows running totals per outlet and settlement history with status

### GrabFood Webhooks & Partner Configuration

- [x] **WH-01**: All 6 GrabFood inbound webhook endpoints (GET menu, submit order, order state, menu sync, integration status, menu push) return HTTP 200 and log events to externalSyncLogs with syncType "webhook"
- [x] **WH-02**: HMAC-SHA256 validation reads shared secret from platformCredentials table (not env vars); HMAC failures logged as syncLog entries with status "error"
- [x] **WH-03**: GET /menu endpoint dynamically builds GrabFood Section-based menu JSON from externalProductMappings where source="grabfood", with per-mapping price override and availability toggle
- [x] **WH-04**: Admin can enter HMAC secret in Webhooks tab and view/copy all 6 webhook URLs for GrabFood Developer Portal configuration
- [x] **WH-05**: Admin can set GrabFood-specific price and toggle availability per product mapping in Settings tab

### Sales Analytics

- [ ] **ANLY-01**: Each consignment outlet (Goldfinch, Tamtem) appears as its own segment in Sales Analytics stacked bar charts; segments only shown when revenue data exists for that outlet
- [ ] **ANLY-02**: Sales Analytics displays a lifetime units sold headline counter with per-product breakdown table across all channels
- [ ] **ANLY-03**: Unified multi-channel Sales Analytics view with all channels (GoFood × 3, GrabFood, Shopee, Tokopedia, K3Mart, Direct, Consignment outlets) in one stacked bar chart with multi-select channel filter

## Future Requirements

Acknowledged but deferred to v1.5+.

### GrabFood (v1.5+)

- **GF-09**: GrabFood menu sync status tracking (trace job result after batch update) — add after item toggle works
- **GF-10**: GrabFood operating hours management via API — use GrabFood portal for now
- **GF-11**: GrabFood webhook real-time order intake — requires Facilitator Model partnership

### BigSeller (v1.5+)

- **BS-04**: Automated daily BigSeller cron sync — deferred; manual trigger sufficient; 8-min sync + one-at-a-time constraint requires careful scheduling
- **BS-05**: BigSeller inventory sync to Shopee/Tokopedia (stock push) — deferred until COGS configured in BigSeller
- **BS-06**: BigSeller period-over-period comparison (growthRatio from API) — nice-to-have after base data flows

### Analytics (v1.5+)

- **ANLY-04**: Pre-aggregated lifetime sales cache table — defer until ~50K externalRevenue rows
- **ANLY-05**: Export Sales Analytics to CSV/Excel — separate reporting feature
- **ANLY-06**: Per-channel COGS and true profitability view — requires BigSeller COGS setup + ingredient cost attribution

### Testing (v1.5+)

- **E2E-01 to E2E-04**: Playwright E2E tests — deferred from v1.3

## Out of Scope

Explicitly excluded. Documented to prevent scope creep.

| Feature | Reason |
|---------|--------|
| GrabFood Facilitator Model (order acceptance) | Requires GrabFood partnership; massive scope |
| GrabFood campaign management | Requires special partner scope; use GrabFood portal |
| GrabFood dine-in vouchers | Frollie outlets are delivery-only |
| BigSeller inventory sync | COGS not configured; premature |
| BigSeller daily cron auto-sync | Manual trigger sufficient; one-sync-at-a-time constraint |
| BigSeller auto-login (CAPTCHA blocks it) | Login form has visual CAPTCHA; paste-once with 30-day auto-refresh is acceptable |
| Automated settlement reconciliation | Production system, not accounting; export summaries |
| Full double-entry accounting | Out of scope per PROJECT.md |
| Per-unit consignment serialization | Batch tracking sufficient at this price point |
| Consignment Excel upload (full CON-01–05 from v1.3) | Replaced by simpler manual settlement entry form |
| Consignment inventory deduction | Consignment is separate domain; don't touch productInventory |
| E2E Playwright tests | Deferred to v1.5; API integrations are v1.4 priority |

## Architecture Decisions (v1.4)

| Decision | Rationale |
|----------|-----------|
| Option A: Lean Completion | Cron pull for data sync, manual trigger buttons, no real-time webhooks |
| No cron jobs for data sync | All syncs are manual-trigger (button press). No automatic background pulls. |
| GrabFood token refresh on-demand | resolveToken() fetches lazily when action used. No 45-min cron. Already scaffolded. |
| GoBiz auto-login via password grant | Discovered password grant endpoint; no CAPTCHA. Store email/password in env vars. |
| BigSeller "paste once, forget" | CAPTCHA blocks auto-login. JWT cookie lasts 30 days, auto-refreshes on use. |
| BigSeller skip daily stats table | Derive aggregates from per-order data. No separate bigsellerDailyStats table. |
| Consignment manual form (not Excel) | Simple settlement entry replaces complex CON-01–05 Excel upload. Rev share % per outlet. |
| Extend existing credential health panel | Sales Analytics Settings already has platform connections. Add GrabFood + BigSeller. |

## Traceability

Which phases cover which requirements. Updated during roadmap creation.

| Requirement | Phase | Status |
|-------------|-------|--------|
| AUTH-01 | Phase 26 | Complete |
| AUTH-02 | Phase 26 | Complete |
| AUTH-03 | Phase 26 | Complete |
| AUTH-04 | Phase 26 | Complete |
| GF-06 | Phase 27 | Complete |
| GF-07 | Phase 27 | Complete |
| GF-08 | Phase 27 | Complete |
| WH-01 | Phase 27.1 | Complete |
| WH-02 | Phase 27.1 | Complete |
| WH-03 | Phase 27.1 | Complete |
| WH-04 | Phase 27.1 | Complete |
| WH-05 | Phase 27.1 | Complete |
| BS-01 | Phase 28 | Complete |
| BS-02 | Phase 28 | Complete |
| BS-03 | Phase 28 | Complete |
| CON-01 | Phase 29 | Pending |
| CON-02 | Phase 29 | Pending |
| CON-03 | Phase 29 | Pending |
| CON-04 | Phase 29 | Pending |
| ANLY-01 | Phase 30 | Pending |
| ANLY-02 | Phase 30 | Pending |
| ANLY-03 | Phase 30 | Pending |

**Coverage:**
- v1.4 requirements: 22 total
- Mapped to phases: 22/22
- Unmapped: 0

---
*Requirements defined: 2026-02-25*
*Last updated: 2026-02-25 — traceability mapped after roadmap creation*
