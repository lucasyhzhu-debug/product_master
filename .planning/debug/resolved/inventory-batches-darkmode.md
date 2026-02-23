---
status: resolved
trigger: "inventory-batches-darkmode"
created: 2026-02-23T00:00:00Z
updated: 2026-02-23T00:00:00Z
---

## Current Focus

hypothesis: BatchCard uses `bg-emerald-50/50` for FIFO-next state and `bg-red-50/30` for expired state — these are light-mode colors with no `dark:` variants. In dark mode, the semi-transparent light color blends with the dark surface, creating a washed-out mid-gray that makes text invisible.
test: Read BatchCard.tsx and inspect the Card className
expecting: Fix by replacing light-mode bg colors with dark-mode-aware alternatives
next_action: Apply fix to BatchCard.tsx

## Symptoms

expected: Batch cards should have dark-themed background with visible text in dark mode.
actual: Batch card shows medium-gray background (~gray-400/500 tone) making text invisible. FIFO Next badge is visible but card body text is not.
errors: None — purely visual CSS issue.
reproduction: /inventory → click product (e.g. Jumbo Size) → scroll to "Batches (FIFO Order)" → observe washed-out gray card.
started: Long-standing issue, likely since batch section was built.

## Eliminated

- hypothesis: Text color classes are the primary issue
  evidence: The background color `bg-emerald-50/50` is the root cause — it's a light green at 50% opacity which blends with the dark background to create a gray wash
  timestamp: 2026-02-23T00:00:00Z

## Evidence

- timestamp: 2026-02-23T00:00:00Z
  checked: src/components/inventory/BatchCard.tsx lines 49-55
  found: |
    Card className uses:
    - isFifoNext + !isExpired: "border-emerald-300 bg-emerald-50/50"
    - isExpired: "border-red-200 bg-red-50/30 opacity-60"
    - default: "border-border bg-muted/20"

    `bg-emerald-50/50` = emerald-50 at 50% opacity. In dark mode this
    renders as a semi-transparent very light green over dark surface = gray wash.
    `bg-red-50/30` same problem for expired state.
    The default case "bg-muted/20" is theme-aware and fine.
  implication: Need dark: variants for the colored backgrounds

## Resolution

root_cause: |
  `BatchCard.tsx` uses `bg-emerald-50/50` (FIFO next state) and `bg-red-50/30`
  (expired state) without `dark:` variants. These light-mode background colors
  at low opacity create a gray wash in dark mode, making all card text invisible.

fix: |
  Replace:
    isFifoNext: "border-emerald-300 bg-emerald-50/50"
    → "border-emerald-300 bg-emerald-50/50 dark:bg-emerald-950/30 dark:border-emerald-800"

    isExpired: "border-red-200 bg-red-50/30 opacity-60"
    → "border-red-200 bg-red-50/30 dark:bg-red-950/30 dark:border-red-900 opacity-60"

verification: Visual inspection of className changes — no build step needed.
files_changed:
  - src/components/inventory/BatchCard.tsx
