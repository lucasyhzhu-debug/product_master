# Phase 79: Shopee Item-Level Revenue — Discussion Log

**Date:** 2026-04-14
**Mode:** Interactive (6 gray areas, batched)

---

## Area 1: Unit Price Derivation

**Q:** How should unit price be derived for each externalRevenueItems row (BigSeller doesn't expose per-SKU price)?

**Options presented:**
1. Pro-rate by menuProduct.price × qty (Recommended)
2. Flat split: orderAmount / totalQty
3. Flat split by skuNum share, exclude shipping

**User chose:** Option 1 + custom elaboration

**User notes:**
> "option 1 and you can probably tell the pricing based on the historical single product purchases - so you can use them as effective baselines for future purchases with multi sku transactions - but most transactions are single sku * multiple units so it's easy to manage"

**Decision recorded as:** D-01, D-02, D-03, D-04 — pro-rate by menuProduct.price × qty with historical single-SKU price oracle as preferred baseline, flat-share fallback.

---

## Area 2: Customer Data Capture

**Q:** Customer data capture — what's the scope and linking strategy? (BigSeller pageList lacks buyer details; researcher must verify if order-detail endpoint exposes them)

**Options presented:**
1. Name + phone + address, manual link (Recommended)
2. Name + phone only, auto-link by phone match
3. Capture only, no linking this phase
4. Skip customer capture if pageList API lacks it

**User chose:** Option 4 + override

**User notes:**
> "4; if you see it let's include it linked to the transaction only, we're not creating a specific customer database here just extend the transaction data columns to capture what's being captured somewhere"

**Decision recorded as:** D-05, D-06, D-07 — transaction-bound capture only (columns on bigsellerOrders), no customers table link, defer if API requires per-order extra calls.

---

## Area 3: Retroactive Mapping Cascade

**Q:** When admin maps a SKU → menuProduct, how should the cascade work?

**Options presented:**
1. Update all past + future items with that SKU (Recommended)
2. Future-only; historical requires separate backfill button
3. Respect manual overrides (skip items with manually-set linkedMenuProductId)

**User chose:** Option 1

**Decision recorded as:** D-08, D-09, D-10 — cascade past + future, parent linkedMenuProductId = dominant SKU by qty, no manual-override flag this phase.

---

## Area 4: Daily Cron

**Q:** Daily 7-day re-sync cron — when to run and how to handle conflicts with user's manual sync?

**Options presented:**
1. 03:00 WIB, skip if sync in progress (Recommended)
2. 03:00 WIB, queue behind manual sync
3. 06:00 WIB, abort if manual sync running

**User chose:** Option 1

**Decision recorded as:** D-11, D-12, D-13 — 03:00 WIB, skip on conflict with error log, no retry/queue.

---

## Area 5: "Pending SKU" UI

**Q:** 'Pending SKU from Shopee' display — threshold and behavior?

**Options presented:**
1. Within 48h of orderTime → 'Pending', after → '--' (Recommended)
2. Within 48h → 'Pending', after → 'No SKU data' + warn
3. Always 'Pending' until SKU arrives or never

**User chose:** Custom — tightened to 24h

**User notes:**
> "try to refresh it daily actually i'd like to see the orders within 24 hours"

**Decision recorded as:** D-14, D-15, D-16 — 24h threshold (not 48h), "Pending SKU from Shopee" inside 24h, "--" after, recovery via Re-check button.

---

## Area 6: Historical Backfill

**Q:** Historical bigsellerOrders → externalRevenueItems backfill — trigger and scope?

**Options presented:**
1. Admin button on Settings page, all orders with non-empty skuVoList (Recommended)
2. Auto-run once on deploy via migration
3. Admin button + include empty-skuVoList orders (creates 'unknown SKU' placeholder)

**User chose:** Option 1 + elaboration

**User notes:**
> "option 1 and this button should be very clear inside the bigsellr interface plus we should have the ability to re-run it to update the empty rows later (or just re-check the empty rows button)"

**Decision recorded as:** D-17, D-18, D-19, D-20 — backfill button in BigSellerSyncPanel (not Settings), separate "Re-check empty rows" button for stuck rows, both idempotent with progress toast.

---

## Ready for Context

**Q:** That covers all 6 gray areas (unit price, customer capture, remap cascade, cron, pending threshold, backfill). Ready to write CONTEXT.md?

**User chose:** Create context

---

## Area 7 (added after first context write): Inventory Integration

**User raised:** "this should also need to interact with inventory - make sure it's also interacting with inventory when we recognise the pieces (it should right? since it's using the same table as gojek)"

**Clarification provided:** externalRevenueItems is revenue-attribution only. Inventory deduction is a separate mutation (`processGofoodSales`) called from the GoBiz adapter, not triggered by item insertion. Shopee/TikTok currently deduct nothing.

**Q1:** Should Shopee/TikTok item recognition also deduct finished-goods inventory?

**Options:** (1) Yes, from default location; (2) Yes, from configurable location; (3) No, keep Phase 79 revenue-only

**User chose:** Option 3 + urgent architectural flag

**User notes:**
> "option 3 - but please flag this as an urgent thing to do because I want to be able to choose where to pull inventory across ALL our channels and it should be a consolidated centralised mutation way to do this (not 1 channel - one function mutation)"

**Q2:** Historical backfill inventory behavior?

**User chose:** Revenue items only — skip historical inventory deduction

**Decisions recorded as:** D-21, D-22, D-23 — Phase 79 remains revenue-only; unified cross-channel inventory deduction flagged as urgent follow-up phase.

---

*End of discussion log. Canonical decisions live in 79-CONTEXT.md.*
