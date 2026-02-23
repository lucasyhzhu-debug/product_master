---
status: resolved
trigger: "Three UI issues: WhatsApp template preview text dark mode, Inventory low-stock banner dark mode, Product Manager Food POS card layout"
created: 2026-02-23T00:00:00Z
updated: 2026-02-23T00:01:00Z
---

## Current Focus

hypothesis: All three issues have been identified with clear root causes in the source code
test: Read each affected file and found exact problematic lines
expecting: Fixes will be simple CSS class additions/changes
next_action: Apply all three fixes

## Symptoms

expected:
1. WhatsApp Templates - green chat bubble preview text should be readable in dark mode
2. Inventory - low stock warning banner should adapt to dark mode
3. Product Manager Food POS cards - product name visible above tags on separate line

actual:
1. WhatsApp bubble uses `text-foreground/80` which in dark mode is white/light text on light-green `#DCF8C6` background (unreadable)
2. LowStockAlertsBanner uses `bg-gradient-to-r from-amber-50 to-amber-50/50` with `text-amber-900` - all hardcoded light colors with no dark: variants
3. Product name `h3` uses `font-semibold truncate flex-1 min-w-0 text-sm sm:text-base` with no text-foreground - it's in a flex-wrap div alongside badges so they can appear inline; name needs separate line and explicit dark-mode color

errors: No console errors - purely visual/CSS issues
reproduction: View in dark mode
started: Long-standing since dark mode was added

## Eliminated

- none

## Evidence

- timestamp: 2026-02-23T00:00:00Z
  checked: src/components/whatsappTemplates/TemplateCard.tsx line 93
  found: `<p className="relative text-sm text-foreground/80 line-clamp-2">` inside `bg-[#DCF8C6]` div
  implication: `text-foreground/80` in dark mode = light/white text on light green background = invisible

- timestamp: 2026-02-23T00:00:00Z
  checked: src/components/inventory/LowStockAlertsBanner.tsx line 20
  found: `<Card className="border-amber-300 bg-gradient-to-r from-amber-50 to-amber-50/50">`
  implication: Hardcoded light amber background with no dark: variants, also text-amber-900 and text-amber-700 are hardcoded light colors

- timestamp: 2026-02-23T00:00:00Z
  checked: src/pages/MenuProductsManager.tsx renderProductCard function lines 371-399
  found: Name `h3` and badges share same `flex items-start gap-2 mb-2 flex-wrap` div; no explicit text color on h3
  implication: On dark background, h3 may not have explicit color causing invisibility; flex-wrap allows badges to wrap next to name but not force name to separate line

## Resolution

root_cause: |
  1. TemplateCard.tsx: text-foreground/80 is a CSS variable that adapts to theme, but the green bubble bg-[#DCF8C6] is always light - need dark text explicitly
  2. LowStockAlertsBanner.tsx: All amber colors are hardcoded light-mode values with no dark: variants
  3. MenuProductsManager.tsx renderProductCard: h3 name missing text-foreground class; name and badges share flex-wrap div causing inline layout

fix: |
  1. Add text-gray-800 dark:text-gray-900 or just text-gray-900 since the bubble is always light green
  2. Add dark: variants to all amber color classes in LowStockAlertsBanner
  3. Split name into its own block-level element above badges div, add text-foreground class

verification: |
  All three changes verified by reading back the modified files.
  1. TemplateCard.tsx line 93: text-foreground/80 -> text-gray-800 (hardcoded dark text, always readable on light green bubble)
  2. LowStockAlertsBanner.tsx: All amber/red/emerald colors now have dark: variants
  3. MenuProductsManager.tsx renderProductCard: h3 now in its own block with mb-1 and text-foreground, badges on separate flex div below
files_changed:
  - src/components/whatsappTemplates/TemplateCard.tsx
  - src/components/inventory/LowStockAlertsBanner.tsx
  - src/pages/MenuProductsManager.tsx
