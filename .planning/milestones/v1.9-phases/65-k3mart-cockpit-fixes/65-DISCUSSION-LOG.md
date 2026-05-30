# Phase 65: K3Mart Cockpit Fixes - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-03-28
**Phase:** 65-K3Mart Cockpit Fixes
**Areas discussed:** Outlet management, Price fallback chain, History reliability

---

## Outlet Management

| Option | Description | Selected |
|--------|-------------|----------|
| DB-driven with isActive flag | Keep externalOutlets table as source of truth. Mark stale outlets isActive=false. Config.ts map stays for API ID resolution but active outlets come from DB. | ✓ |
| Hardcode the 4 in config.ts | Simply remove 4 stale outlets from K3MART_OUTLET_NAMES. Quickest fix but requires code deploy if outlets change. | |
| You decide | Claude picks the approach that fits the codebase best. | |

**User's choice:** DB-driven with isActive flag (Recommended)
**Notes:** None — straightforward preference for DB-driven approach.

### Follow-up: Stale outlet handling

| Option | Description | Selected |
|--------|-------------|----------|
| Soft-delete (isActive=false) | Preserves historical data — past stock movements and sales still reference these outlets. Safest for reporting. | ✓ |
| Hard-delete | Cleaner DB but may break references in existing stock movement and revenue records. | |

**User's choice:** Soft-delete (isActive=false)
**Notes:** None

---

## Price Fallback Chain

| Option | Description | Selected |
|--------|-------------|----------|
| Fallback to productMap prices | Dashboard API → productMap config (80K/45K) → block submission if still 0. | |
| Block submission entirely | If dashboard API doesn't return a price, refuse to submit. | |
| You decide | Claude picks the safest approach. | |

**User's choice:** Other — "Let the user input the price / edit the assumed price"
**Notes:** User identified the root cause: the frontend shows the price but it's not being passed to the backend. The `items` array in `submitStockFlow` args lacks a `price` field. User wants an editable price field in the stock flow form, pre-populated from product map, that the user can confirm/override before submission.

### Follow-up: Price mismatch handling

| Option | Description | Selected |
|--------|-------------|----------|
| Block if mismatch > 10% | Refuse submission if frontend price and API price differ by more than 10%. | |
| Always use frontend price | Trust the price the user sees. Log a warning if API disagrees but don't block. | |

**User's choice:** Other — User wants the frontend price to be the source of truth (editable by user), not validated against dashboard API.
**Notes:** None

---

## History Reliability

| Option | Description | Selected |
|--------|-------------|----------|
| Error message + retry button | Show clear error with manual retry button. | |
| Fall back to local DB records only | Show movements recorded in our DB without API status updates. | |
| You decide | Claude picks the UX that fits existing cockpit patterns. | |

**User's choice:** Other — "Remove this feature altogether — keep it clean to just a dashboard and stock in/out / rotate features"
**Notes:** User wants the cockpit to be lean. History tab adds complexity and depends on a flaky API. Removing it simplifies the cockpit significantly. K3M-02 success criterion updated to reflect removal.

### Follow-up: Confirm removal

| Option | Description | Selected |
|--------|-------------|----------|
| Yes, remove it | Delete StockMovementHistory component. Update K3M-02 to reflect removal. | ✓ |
| No, keep and fix it | Fix the loading issue instead of removing. | |

**User's choice:** Yes, remove it
**Notes:** Confirmed

---

## Claude's Discretion

- Cleanup of orphaned History-related state/hooks
- Migration approach for deactivating stale outlets
- Error message wording for blocked 0-price submissions

## Deferred Ideas

None — discussion stayed within phase scope
