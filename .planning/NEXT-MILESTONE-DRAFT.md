# Next Milestone Draft: v1.1 "Stabilization & QoL"

> Feed this file to `/gsd:new-milestone` when ready.
> Created: 2026-02-14

---

## Phase 1: UI Brand Consolidation
> **PULLED FORWARD to v1.0 Phase 9.** Brand reference doc, page audit, and consistency fixes are now part of v1.0.
> v1.1 Phase 1 can be reduced to: verify brand reference is current, apply to any new pages added in v1.1.
- ~~Audit every page for inconsistencies~~ (done in v1.0 Phase 9)
- ~~Create universal brand reference doc~~ (done in v1.0 Phase 9)
- ~~Fix all pages to use consistent left margin~~ (done in v1.0 Phase 9)
- All UI work must use the `/frontend-design` skill as standard
- Verify brand reference is still current for v1.1 work

## Phase 2: API Audit & Auth Architecture
> **Reference docs:** `docs/apiS/gojek search transactions documentation.txt` — contains full GoBiz/GoFood API specs (token refresh, transaction search, order details, merchant search) with real request/response examples, merchant IDs, product mappings, and commission breakdowns. MUST be read during discuss-phase and research-phase.
- Document every external API (K3Mart, GoBiz, GoFood, internal sales flow)
- Map current auth flows (what's manual copy-paste, what's automated)
- Architect auto-auth (always-on or refresh-button triggered, no daily key pasting)
- Optimize API call patterns
- Document internal sales integration flow into sales reporting
- **GoFood/GoBiz API coverage** (from reference doc):
  - Token API: `POST api.gobiz.co.id/goid/token` (email/password grant, returns access+refresh tokens)
  - Transaction search: `POST api.gobiz.co.id/journals/search` (filterable by merchant_id, date range, payment type, status)
  - Order details: `POST api.gobiz.co.id/cosmo/v1/orders/search` (by order_number, returns items with product names, prices, quantities, cancellations)
  - Merchant search: `POST api.gobiz.co.id/v1/merchants/search` (returns outlet names, addresses, payment settings)
- **Merchant ID mapping:**
  - `G293156297` = Goldfinch store ("Frollie Dubai Chewy Cookie, Legato Gelato") -> display as "Legato Gf"
  - `G347061572` = Crystal store ("Frollie Dubai Chewy Cookie, Crystal") -> display as "GoFood Crystal"
- **Product mapping (GoFood name -> POS menuProduct):**
  - "Dubai Chewy Cookie - Regular Size" -> Original - Single (45k)
  - "Dubai Chewy Cookie - Regular Pack Of 3" -> Original - Triple
- **Key data fields to capture:** event_timestamp (payment time), gross_amount, merchant_share (net after commission), total_fee (GoFood commission ~19% + 11% VAT), items[], cancellations, campaign_discounts

## Phase 3: QoL Fixes Batch
- Move customer information input to top of order screen
- Move creation date and due dates to RHS
- Hide creation date from inputs, larger due-date input with day-name quick-tap (arrows, tap "Saturday" if it's Thursday)
- Due date just under subtotals on RHS of new-order page
- Show discounted total on order cards (discount amount + smaller gross sale number)
- Simplify "receive new inventory" modal (drop component code requirement, just unique name)
- Add name of who placed orders + audit trail on all status updates

## Phase 4: Kitchen Overhaul
- Due date display in kitchen system, rank by due date (show day names and dates)
- Make kitchen flow actually work for kitchen staff
- Targets easier to see and linked to actual targets and orders
- Kitchen inventory bug: brochures showing unavailable but can't be reduced/found — add manager overrides

## Phase 5: K3Mart Cockpit
- Fix cockpit to see exactly what's happening in each K3Mart outlet
- Allow manual stock in/out during the day
- Push K3Mart demand to kitchen for next delivery
- Complete weekly planning section with public holidays and weekends highlighted

## Phase 6: API Integrations (depends on Phase 2)
> **Reference docs:** `docs/apiS/gojek search transactions documentation.txt` — implementation specs for all GoFood/GoBiz API endpoints. MUST be read during discuss-phase and research-phase.
- Add second GoFood outlet location (Crystal) to sales aggregator
- Strengthen GoBiz API using logins API (token refresh endpoint documented in reference)
- Implement auto-auth architecture designed in Phase 2
- Build GoFood product-to-menuProduct mapping table (see product mappings in Phase 2 notes)
- Store transaction data: order_number, event_timestamp, gross_amount, merchant_share, items, cancellations

## Phase 7: Order Page Refactor
- Enhance/refactor order page for direct sales only

## Phase 8: Consignment Flow
- Create consignment flow for revenue recognition
- Orders can be direct or consignment
- Track consignment properly (currently partial/broken tracking)
- Integrate consignment into sales reporting

## Phase 9: Customer Management UI
- Customer details management page
- Show historical orders by customer
- Link/merge duplicate customers

## Phase 10: Sales Pipeline / CRM
- List of leads / cafes to talk to
- Track what we've said to each (outreach history)
- Simple CRM — not Salesforce

## Phase 11: Multi-Depot GoFood Kitchen
> **High priority** — GoFood adding Crystal as second depot. Current kitchen packing flow hardcodes Goldfinch as only depot.
- Support N depots for GoFood (not just Goldfinch)
- Kitchen packing UI shows which depot each order/batch ships to
- Per-depot stock tracking (not aggregated)
- Rethink kitchen flow for multi-depot routing
- Affected: PackingPanel.tsx, KitchenViewV2.tsx, k3martKitchen queries

## Phase 12: Feedback Overlay Fix & Re-enable (was 11)
> **Paused in v1.0** — disabled in Layout because element capture returns generic CSS selectors (e.g., `div.card` instead of identifying the specific component/section). Users can't tell what the feedback refers to.
- Fix element identification: capture component name, data-testid, aria-label, or nearest meaningful ancestor
- Add page section context (e.g., "Order #0214-003 > Payment Summary") instead of raw CSS selector
- Consider adding a screenshot annotation tool (draw arrows/circles on the captured element)
- Re-enable FeedbackPanelToggle, FeedbackPanel, FeedbackCaptureMode, FeedbackForm in Layout.tsx
- Backend (convex/feedback/) and hooks (useFeedback.ts) are intact — just need frontend re-integration
- Test with real feedback scenarios across all page types

## Phase 13: Infrastructure & Quality
- E2E Playwright test suite for critical user flows (order creation, kitchen production, K3Mart dispatch)
- React error boundaries for graceful component-level error handling
- CSV/Excel export for sales analytics, inventory, and orders
- Apply generic query factory to remaining ~26 query files
- Update `src/lib/types.ts` to use Convex-generated types

## Phase 14: Order UX Polish & Templates
- Order templates for repeat customers (save and reuse common order configs)
- Expedite warning on Today/Tomorrow date pills (inline text)
- Order page refactored for direct sales optimization (ORD-D01)

---

## Dependencies

```
Phase 1 (UI brand) ──> Phase 3, 4, 5, 7, 9, 10, 11 (all UI work follows brand reference)
Phase 2 (API audit) ──> Phase 6 (API implementation uses designed auth architecture)
```

## Reference Documentation
- `docs/apiS/gojek search transactions documentation.txt` — Full GoBiz/GoFood API documentation (token, transactions, orders, merchants). **WARNING: Contains hardcoded credentials (email, password, tokens) — DO NOT commit to git. Move secrets to .env.local before any implementation.**
- Phases 2 and 6 MUST read this file during `/gsd:discuss-phase` and `/gsd:research-phase`

## Notes
- Deferred from v1.0: Phases 6-10 (BOM Migration, Query Optimization, Schema Cleanup, Frontend Factories, Infrastructure) — pick up in a future milestone
- All UI phases must reference the frontend-design skill
