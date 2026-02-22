# Phase 20: Kitchen Production Targets - Context

**Gathered:** 2026-02-22
**Status:** Ready for planning

<domain>
## Phase Boundary

Full kitchen view redesign: simplify to a production-focused UI (remove boxing/stickering), display today's production targets (balls by type + packaging breakdown from dispatch plan or defaults), end-of-shift recording that feeds Finished Goods Inventory, optional waste logging by reason, and shift history with manager edit capability. Targets are configurable by managers directly on the kitchen page with per-day override support.

**Original scope (KIT-09, KIT-12) expanded to include KIT-13 through KIT-18 per discussion.**

</domain>

<decisions>
## Implementation Decisions

### Kitchen View Layout
- Full-screen simplified view — pure production focus
- Layout: targets top-center of page, end-of-shift input middle-bottom of page
- Collapsible "View Today's Orders" toggle for context when needed (hidden by default)
- No order list shown by default — kitchen staff doesn't need order detail during production
- Remove boxing/stickering columns from the kitchen view entirely — these are no longer tracked separately

### Production Targets Display
- Two target numbers at top: total Original balls to make + total Jumbo balls to make (from BOM quantities)
- Below the ball totals: packaging breakdown — "30 triples, 50 singles, 60 singles (cafe)" derived from dispatch plan menu products
- No source label ("from dispatch plan" vs "default") — just show the numbers
- If plan has zero for a product type, display zero (do not fall back to default; do not hide the type)
- Target derivation: (1) ball totals from BOM via dispatch plan quantities; (2) packaging breakdown from menu products + BOM linkage

### End-of-Shift Input (new capability)
- Input fields always visible at middle-bottom of kitchen page
- Kitchen staff and managers can submit
- Input fields: units produced by product type (matching the target categories shown)
- Optional waste section: prompted with "Any waste to capture?" — categorized by reason:
  - QA/testing (quality control samples/testing)
  - Spoilage (ingredient or product spoilage)
  - Waste (general production waste)
  - Each waste reason has a quantity field (optional; can submit with zero waste)
- Two-step confirmation:
  1. Review summary screen: "You made 80 singles + 25 triples. Waste: 5 singles (QA). Inventory will be updated." → Confirm button
  2. Success screen after commit: clean summary of what was recorded, shareable with manager

### Finished Goods Inventory Integration
- Submitting end-of-shift adds produced quantities to Finished Goods Inventory at Kitchen storage location
- This replaces the manual boxing/stickering tracking — kitchen output IS the finished goods
- Waste quantities are deducted separately (not counted as produced)
- Ingredient inventory deduction happens at shift end (based on ball quantities via ingredient recipes), matching the existing BeingPrepared-triggered pattern

### Settings — Manager Access
- Manager-only settings section on the kitchen page itself (not a separate settings page)
- Configures default daily targets: Original ball count (default 110), Jumbo ball count (default 0), packaging mix
- Manager can also override today's targets directly on the kitchen page (per-day override, does not change the defaults)
- Override is for today only — no persistence beyond current day

### Shift History & Editing
- Shift production records stored per shift with date, submitted by, produced quantities, waste breakdown
- Managers can edit past shift records
- Edit triggers an impact confirmation: "This will reduce inventory by 1,800 units — confirm?" (diff between original and new values)
- History viewable by managers (accessible from kitchen page or a linked history view)

### Plan vs Default Handoff
- When a dispatch plan exists for today, targets come from plan output (ball totals + packaging breakdown from BOM)
- When no plan exists, targets come from configured defaults
- If manager applies a per-day override, that takes precedence over both plan and default
- Priority order: per-day override > dispatch plan > configured defaults

### Access Control
- Kitchen staff: can view targets, submit end-of-shift, view today's shift entry
- Managers: can view targets, submit end-of-shift, configure defaults, apply daily override, view/edit shift history
- Admin: same as manager

### Claude's Discretion
- Exact visual treatment of the packaging breakdown (cards vs table vs list)
- Loading skeleton for target display while plan data loads
- How the ingredient inventory deduction is triggered (follow existing BeingPrepared pattern)
- Design of the shift history list (inline on kitchen page or linked page)

</decisions>

<specifics>
## Specific Ideas

- Target derivation example given by user: "Make 200 Original balls into: 30 triple products, 50 original singles, 60 original singles (cafe)" — this shows the dual display: ball total first, then packaging breakdown
- Waste categories explicitly named: QA/testing, Spoilage, Waste — these are the three selectable reasons
- Edit confirmation example: "If you accidentally put 2000 units produced and edit to 200 total units — it should say 'this will reduce inventory by 1800 units — confirm?'"
- Finished goods stored at "Kitchen" storage location (already exists from Phase 17.1)

</specifics>

<deferred>
## Deferred Ideas

- None raised that are out of scope — discussion stayed within the expanded Phase 20 boundary

</deferred>

## New Requirements Identified (expand Phase 20)

The following requirements were identified during discussion and must be added to REQUIREMENTS.md and ROADMAP.md before planning:

| ID | Requirement |
|----|-------------|
| KIT-13 | Kitchen view simplified: remove boxing/stickering columns; pure production focus; collapsible order context toggle |
| KIT-14 | End-of-shift input records produced units by product type + optional waste by reason (QA/testing, spoilage, waste); submitting updates Finished Goods Inventory at Kitchen location |
| KIT-15 | Two-step end-of-shift confirmation: review summary before commit, success screen after |
| KIT-16 | Shift production records stored per shift (date, submitted by, produced qty, waste breakdown); viewable by managers |
| KIT-17 | Manager can edit past shift records; edit triggers inventory impact confirmation dialog |
| KIT-18 | Manager can override today's production targets directly on kitchen page (per-day only, does not change defaults) |

---

*Phase: 20-kitchen-production-targets*
*Context gathered: 2026-02-22*
