# Phase 67: Inventory Drift & Daily Stock Update - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-03-28
**Phase:** 67-Inventory Drift & Daily Stock Update
**Areas discussed:** Stock drift diagnosis, Daily stock update UX, Adjustment recording

---

## Stock Drift Diagnosis

### Which system is drifting

| Option | Description | Selected |
|--------|-------------|----------|
| Product inventory | productInventory.quantity counts for boxes of finished product at locations. | |
| Packaging inventory | componentStock totals for boxes, stickers. FIFO batch tracking with cache. | |
| Both are drifting | Both systems have drift issues. | |
| Not sure — investigate | Let researcher investigate. | |

**User's choice:** Other — Both are drifting, but the root cause is lack of accurate sales data from untracked channels (GrabFood, Grab, direct POS). Production data is accurate. K3Mart POS is accurate. The delta comes from sales the system can't see.
**Notes:** User provided detailed breakdown: "production will drive down ingredients and packaging components — this is still fine. End of day daily staff counts for each location should update it. K3Mart inventory should just be linked to stock-in vs sold (accurate from POS). The delta starts when making sales on POS which I don't track — GrabSales, direct POS at Legato."

### Inventory model philosophy

| Option | Description | Selected |
|--------|-------------|----------|
| Manual count as source of truth | Daily count IS the stock number. No auto-subtract for untracked sales. | |
| Known vs estimated split | Show two numbers: produced (accurate) and estimated remaining. | |
| Usage bar (approximate) | Consumption gauge instead of exact numbers. | |
| You decide | Claude picks. | |

**User's choice:** Other — Hybrid approach. Production drives packaging deductions (accurate). K3Mart stays automated (POS). Other locations use daily manual count. Products only for this phase; packaging deferred.
**Notes:** User wants products-only scope for this phase.

### Packaging component refresh

| Option | Description | Selected |
|--------|-------------|----------|
| Bulk set screen | Same UI as daily stock update — pick location, see all components, enter counts. | ✓ |
| Individual edits | Edit each component's stock individually. | |

**User's choice:** Bulk set screen (Recommended) — but deferred to future phase.
**Notes:** Products only for Phase 67.

---

## Daily Stock Update UX

### Who and when

| Option | Description | Selected |
|--------|-------------|----------|
| Kitchen/order staff at end of day | Staff counts before closing. | |
| Managers only | Only managers do counts. | |
| Any role at any time | No restrictions. | ✓ |

**User's choice:** Any role at any time
**Notes:** None

### Scope of update screen

| Option | Description | Selected |
|--------|-------------|----------|
| Unified screen with tabs | Products + Packaging in one screen. | |
| Separate screens | Two different pages. | |
| Products only (packaging later) | Start with product inventory. | ✓ |

**User's choice:** Products only (packaging later)
**Notes:** None

### Layout

| Option | Description | Selected |
|--------|-------------|----------|
| Grid: location selector + product rows | Pick location, see table, enter counts, submit all. | ✓ |
| Card per product | One card per product, swipe through. | |
| You decide | Claude picks mobile-friendly option. | |

**User's choice:** Grid: location selector + product rows (Recommended)
**Notes:** None

---

## Adjustment Recording

### Reason/note requirement

| Option | Description | Selected |
|--------|-------------|----------|
| Optional note | Record who, when, delta. Optional note for context. | ✓ |
| Required reason | Every adjustment needs a reason code. | |
| No reason needed | Just record the delta. | |

**User's choice:** Optional note (Recommended)
**Notes:** None

---

## Claude's Discretion

- Navigation placement for stock count screen
- "Last counted" timestamp display
- Delta highlighting for large discrepancies
- Mobile responsiveness approach

## Deferred Ideas

- Packaging component one-time refresh (same bulk pattern, future phase)
- Usage bar / consumption gauge (visual alternative to exact counts)
