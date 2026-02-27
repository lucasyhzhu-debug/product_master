---
status: verifying
trigger: "dispatch-planner-sticky-scroll - headers z-index and channel group sticky stacking"
created: 2026-02-26T00:00:00Z
updated: 2026-02-27T00:00:00Z
---

## Current Focus

hypothesis: CONFIRMED - Three-part root cause: (1) All channel headers share the same stickyTop value so they overlap instead of stacking incrementally, (2) the `relative z-0` wrapper on the body creates a separate stacking context that confines channel headers' z-20 below the grid header's z-30 -- but more critically, content rows from LATER channel groups can overlap EARLIER channel groups' sticky headers because later DOM siblings paint above earlier ones at the same z-level, (3) no explicit z-index isolation between channel group content and headers across groups.
test: Implement three-part fix -- pass channel index to ChannelGroup so headers stack incrementally, give each channel group wrapper a reverse-order z-index so earlier groups' headers stay above later groups' content, and remove the z-0 body wrapper.
expecting: Channel headers stick and stack below each other, product rows always scroll behind headers
next_action: Implement fix in PlannerGrid.tsx and ChannelGroup.tsx

## Symptoms

expected:
- Channel group headers (Direct Sales, GoFood, K3Mart) should be sticky and STACK on top of each other as you scroll down
- When scrolling, "Direct Sales" header sticks at top, rows scroll underneath and disappear behind it
- When GoFood section reaches the top, its header stacks BELOW the Direct Sales header
- When K3Mart section reaches the top, its header stacks below GoFood
- Product/data rows should NEVER appear above any header
- Headers should have proper z-index so content is always hidden behind them

actual:
- Product rows appear ABOVE the channel group headings when scrolling
- The "Direct Sales" tab text moves up into the main header area when scrolling
- No proper stacking behavior -- headers don't stack on top of each other
- Rows are not hidden behind headers as you scroll

errors: No console errors -- purely CSS/layout issue

reproduction: Open Dispatch Planner page, scroll down in the planner grid

started: Current behavior in the codebase

## Eliminated

- hypothesis: Simple z-index bump (z-10->z-20, z-20->z-30, z-30->z-40) would fix layering
  evidence: Previous 4 attempts only adjusted z-index values without addressing stacking context isolation or incremental top offsets. User confirmed issue persists.
  timestamp: 2026-02-26

- hypothesis: overflow:hidden on ancestor breaks sticky positioning
  evidence: Traced full DOM ancestry from channel headers to viewport. No overflow:hidden/auto/scroll on any ancestor (PageContainer, main, Layout div). Header is fixed, not creating scroll container.
  timestamp: 2026-02-27

## Evidence

- timestamp: 2026-02-27
  checked: Full DOM ancestry and stacking context analysis
  found: |
    1. WeekNav: sticky top-14 z-40 (in card wrapper)
    2. Grid header: sticky z-30 at top=stickyTopOffset (sibling of body wrapper)
    3. Body wrapper: relative z-0 (creates stacking context)
    4. Channel headers: sticky z-20 (inside z-0 stacking context)
    5. Content rows: no position, no z-index
    All channel headers get the SAME stickyTop value (channelStickyTop = stickyTopOffset + headerHeight)
  implication: Headers cannot stack incrementally because they all stick at the same pixel position

- timestamp: 2026-02-27
  checked: CSS stacking rules for sibling elements within same stacking context
  found: |
    When multiple siblings have same z-index, later DOM elements paint above earlier ones.
    Channel Group 2's entire div (including content rows) is a later sibling than Channel Group 1's sticky header.
    While z-20 positioned headers should beat non-positioned content, the channel group WRAPPER divs
    (border-b class) have no explicit position/z-index, creating ambiguity.
    Each channel group's wrapper should have a z-index that decreases by DOM order to ensure
    earlier groups' sticky headers are always above later groups' content.
  implication: Need reverse-order z-index on channel group wrappers + incremental top offsets for stacking

- timestamp: 2026-02-27
  checked: Framer Motion animation wrapper in ChannelGroup
  found: motion.div has overflow-hidden and receives transform/will-change during animation, which creates stacking contexts
  implication: May interfere with z-index during transitions but not the primary issue

- timestamp: 2026-02-27
  checked: Channel header element type
  found: Channel header is a <button> element with sticky positioning
  implication: button with sticky should work fine in modern browsers

## Resolution

root_cause: Three interacting CSS issues: (1) All channel group headers share the same `stickyTop` pixel value, so they overlap at the same position instead of stacking incrementally below each other. (2) The `relative z-0` body wrapper creates a stacking context that contains all channel headers and content, but channel group WRAPPER divs have no explicit stacking order -- later DOM siblings naturally paint above earlier siblings, allowing later groups' content to overlap earlier groups' sticky headers. (3) Channel headers at z-20 within the z-0 context technically outrank non-positioned content, but the channel group wrapper divs themselves need reverse-order z-indexing to ensure proper cross-group layering.
fix: |
  Applied three-part fix:
  1. Added CHANNEL_HEADER_HEIGHT constant (36px) and channelIndex/totalChannels props to ChannelGroup.
     Each channel header now sticks at stickyTop + (channelIndex * 36px), creating incremental stacking.
  2. Each channel group wrapper div gets `position: relative` + reverse-order z-index via style prop:
     zIndex = 20 + (totalChannels - channelIndex). First channel has highest z, ensuring its sticky
     header always paints above later channels' content rows.
  3. Removed `z-0` from body wrapper div in PlannerGrid (kept `relative` only). The z-0 was creating
     a stacking context that confined all channel headers, preventing proper cross-group layering.
  PlannerGrid now passes channelIndex={index} and totalChannels={channels.length} to each ChannelGroup.
verification: TypeScript type check passes (npx tsc --noEmit). Visual verification needed by user.
files_changed:
  - src/components/dispatchPlanner/PlannerGrid.tsx
  - src/components/dispatchPlanner/ChannelGroup.tsx
