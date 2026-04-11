---
phase: 78
phase_name: Product Inventory Substitution
status: draft
design_system: shadcn/ui (Tailwind CSS 4, no components.json)
created: 2026-04-11
---

# UI-SPEC: Phase 78 — Product Inventory Substitution

## Design System

| Property | Value | Source |
|----------|-------|--------|
| Tool | shadcn/ui primitives (manual, no preset) | Codebase scan |
| Styling | Tailwind CSS 4 with `@theme` custom properties | `src/index.css` |
| Icons | Lucide React | `CLAUDE.md` |
| Toasts | Sonner | `CLAUDE.md` |
| Font | Inter, system-ui fallback | `src/index.css` `--font-sans` |
| Border Radius | `--radius-lg: 0.75rem`, `--radius-md: 0.5rem`, `--radius-sm: 0.375rem` | `src/index.css` |

## Spacing

8-point scale. All spacing values in this phase:

| Token | Value | Used For |
|-------|-------|----------|
| `gap-1` | 4px | Icon-to-text gap in inline labels |
| `gap-1.5` | 6px | Tight row spacing in sub-row table |
| `gap-2` | 8px | Icon-to-label gap in section headers, grid column gap |
| `py-2` / `px-3` | 8px / 12px | Table cell padding (matches existing InventoryAvailabilityPanel) |
| `space-y-2` | 8px | Form field vertical spacing within Inventory Fulfillment section |
| `space-y-3` | 12px | Section vertical spacing inside Card |
| `p-3` | 12px | Preview box inner padding |
| `space-y-5` | 20px | Between major form sections (matches ProductForm existing `space-y-5`) |

No exceptions to the 4px base grid.

## Typography

| Role | Size | Weight | Line Height | Usage |
|------|------|--------|-------------|-------|
| Section header | 14px (`text-sm`) | 600 (`font-semibold`) | 1.5 | "Inventory Fulfillment" section title |
| Body / form labels | 14px (`text-sm`) | 500 (`font-medium`) | 1.5 | "Fulfill from", "Units per product" labels |
| Helper text | 12px (`text-xs`) | 400 (normal) | 1.5 | Preview text, description text, sub-row labels |
| Table header | 14px (`text-sm`) | 500 (`font-medium`) | 1.5 | Availability table column headers (matches existing) |
| Table cell | 14px (`text-sm`) | 400 (normal) | 1.5 | Availability table body text |
| Status badge | 12px (`text-xs`) | 500 (`font-medium`) | 1.5 | OK / Short status indicators (matches existing) |

Weights used: 400 (normal) + 500 (medium) + 600 (semibold). Note: existing codebase uses all three; this phase follows that established pattern.

## Color

### 60/30/10 Split

| Ratio | Role | Token | Value |
|-------|------|-------|-------|
| 60% | Page/dialog background | `--color-background` | `hsl(0 0% 100%)` light / `hsl(224 10% 10%)` dark |
| 30% | Muted surfaces (preview box, summary) | `bg-muted` / `bg-muted/50` | `hsl(210 40% 96.1%)` light / `hsl(224 10% 18%)` dark |
| 10% | Accent / interactive | `--color-primary` (teal) | `hsl(172 90% 30%)` light / `hsl(172 60% 45%)` dark |

### Semantic Colors Used in This Phase

| Color | Token | Elements |
|-------|-------|----------|
| Green (success) | `text-green-700 dark:text-green-400` | "OK" status badge, "All items available" summary, sufficient sub-row |
| Red (error) | `text-red-700 dark:text-red-400`, `bg-red-50 dark:bg-red-950/30` | "Short N" status badge, insufficient row background |
| Blue (info) | `text-blue-600`, `bg-blue-50`, `border-blue-200` | Preview text box, FulfillFromInventory card accent |
| Amber (warning) | `text-amber-600`, `border-amber-300` | Substitute sub-row label ("via 3x Dubai Single") |
| Muted | `text-muted-foreground` | Description text, disabled states |

### Accent Reserved For

- Primary CTA button ("Save" / "Confirm Fulfillment") — teal
- Active state of location toggle buttons — `bg-blue-600`
- Collapsible section icon — `text-muted-foreground`
- Preview box border — `border-blue-200 dark:border-blue-800`

## Component Inventory

### Touch-Point 1: ProductForm — "Inventory Fulfillment" Section

**Location:** Inside `ProductForm` dialog, between the Price/Weight/COGS grid and the POS Slot section. Conditional on `productType === 'food'`.

**shadcn components used:**
- `Separator` — visual divider above section
- `Select`, `SelectTrigger`, `SelectValue`, `SelectContent`, `SelectItem` — "Fulfill from" dropdown
- `Input` — "Units per product" number input
- `Label` — field labels

**Lucide icon:** `ArrowRightLeft` (section header icon)

**Layout:**
```
[Separator]
[ArrowRightLeft icon] Inventory Fulfillment          <- section header, text-sm font-semibold
  When direct stock is insufficient, fulfill         <- text-xs text-muted-foreground
  from another product's inventory.

  [grid cols-2 gap-4]
    Fulfill from          Units per product
    [Select dropdown]     [Number input]

  [Preview box if configured]                        <- rounded-lg border border-blue-200 bg-blue-50 p-3
    1 Dubai Triple will draw 3x Dubai Single         <- text-xs text-blue-600
    from inventory when direct stock is insufficient
```

**States:**
| State | Appearance |
|-------|-----------|
| Not configured (default) | Dropdown shows "None", multiplier input empty and disabled |
| Configured | Dropdown shows source product name, multiplier shows number, preview box visible |
| Clearing config | User sets dropdown to "None", preview box hides, `clearFulfillFrom` sent on save |

**Dropdown content:**
- First option: `value="none"` label "None"
- Filtered list: food products only, excluding self, excluding products that already have `fulfillFromProductId` set
- Each option: product name as label, `_id` (Convex string) as value

**Input constraints:**
- `type="number"`, `min="2"`, `step="1"`
- Placeholder: "e.g., 3"
- Disabled when dropdown is "None"

### Touch-Point 2: InventoryAvailabilityPanel — Split Sub-Rows

**Location:** Inside the existing availability table within the `FulfillFromInventoryButton` card.

**Existing pattern preserved:** Non-substitution products render exactly as they do today — single row with Product, Needed, Available, Status columns.

**New pattern for substitution products:**

```
+-----------+--------+-----------+----------+
| Product   | Needed | Available | Status   |
+-----------+--------+-----------+----------+
| Dubai Triple (header row, colSpan=4)      |
|   Direct stock         | 2 | 1 | Short 1  |  <- bg-red-50 if short
|   via 3x Dubai Single  | 3 | 5 | OK       |  <- only shown if shortfall > 0
|   -------- Overall -------- | -- | OK/Short |  <- border-t border-dashed
+-----------+--------+-----------+----------+
| Nutella Single                             |  <- standard single row
|           | 2      | 5         | OK        |
+-----------+--------+-----------+----------+
```

**Sub-row styling:**

| Row Type | Background | Text Size | Font Weight |
|----------|-----------|-----------|-------------|
| Product header | `bg-muted/30` | `text-sm` | `font-medium` |
| Direct stock sub-row | transparent (or `bg-red-50` if short) | `text-xs` | normal |
| Substitute sub-row | transparent | `text-xs` | normal |
| Overall verdict | transparent, `border-t border-dashed` | `text-xs` | `font-medium` |

**Substitute label:** `"via {multiplier}x {sourceProductName}"` in `text-amber-600 dark:text-amber-400`

**Status icons (unchanged):**
- Sufficient: `<CheckCircle2 className="h-3.5 w-3.5" />` + "OK" in green
- Short: `<XCircle className="h-3.5 w-3.5" />` + "Short N" in red

### Touch-Point 3: FulfillFromInventoryButton — Enhanced Toast

**Component:** Sonner toast via `toast.success()`

**Current pattern:** Lines joined by `\n`, duration 6000ms.

**Enhanced toast content:**

For each deduction in the `deductions` array:
- **Direct deduction:** `"{productName} x{used} (direct) -> {remaining} remaining"`
- **Substitution deduction:** `"{productName} x{used} (via {substituteUsed}x {substituteProductName}) -> {remaining} remaining"`

**Toast configuration:**
```typescript
toast.success('Order fulfilled from inventory!', {
  description: lines.join('\n'),
  duration: 6000,
});
```

**No UI changes** to the toast component itself — Sonner handles rendering. The only change is the `description` string content.

## Copywriting

### Labels

| Element | Copy | Notes |
|---------|------|-------|
| Section header | "Inventory Fulfillment" | ProductForm section title |
| Section description | "When direct stock is insufficient, fulfill from another product's inventory." | Below section header |
| Dropdown label | "Fulfill from" | Left column label |
| Dropdown default | "None" | First option when no source configured |
| Multiplier label | "Units per product" | Right column label |
| Multiplier placeholder | "e.g., 3" | Input placeholder |

### Preview Text (Dynamic)

| Condition | Copy |
|-----------|------|
| Source selected + multiplier set | "1 {productName} will draw {multiplier}x {sourceProductName} from inventory when direct stock is insufficient" |
| Source selected, no multiplier | Do not show preview box |
| No source selected | Do not show preview box |

### Availability Panel Sub-Row Labels

| Element | Copy |
|---------|------|
| Direct stock row | "Direct stock" |
| Substitute row | "via {multiplier}x {sourceProductName}" |
| Overall row | "Overall" |

### Toast Messages

| Scenario | Title | Description Lines |
|----------|-------|-------------------|
| Fulfillment success (direct only) | "Order fulfilled from inventory!" | "{name} x{used} (direct) -> {remaining} remaining" per item |
| Fulfillment success (with substitution) | "Order fulfilled from inventory!" | Mix of direct and substitution lines as described above |
| Fulfillment success (no deductions) | "Order fulfilled from inventory! Status: Awaiting Delivery" | (no description — unchanged from current) |

### Empty States

| Context | Copy |
|---------|------|
| No location selected | "Select a location to check availability." (unchanged) |
| No fulfillable items | "No fulfillable items found on this order." (unchanged) |
| Dropdown has no eligible products | Dropdown shows only "None" — no additional empty state text needed |

### Error States

| Context | Copy |
|---------|------|
| Insufficient stock (mutation) | "Insufficient stock at this location:" + per-item list (unchanged) |
| Generic mutation error | Error message from server (unchanged) |
| Validation: multiplier < 2 | Handled server-side; ProductForm input uses `min="2"` to prevent client-side |

## Interaction Contracts

### ProductForm Interactions

| Interaction | Behavior |
|-------------|----------|
| Open form for food product | "Inventory Fulfillment" section visible, collapsed state not applicable (always visible within ScrollArea) |
| Open form for packaging product | "Inventory Fulfillment" section hidden |
| Switch product type food -> packaging | Section disappears; state preserved in memory but not sent on save |
| Switch product type packaging -> food | Section appears; state restored from memory |
| Select source product | Multiplier input becomes enabled; if multiplier empty, no preview shown |
| Set multiplier >= 2 | Preview box appears with dynamic text |
| Clear source to "None" | Multiplier input becomes disabled, preview box hides |
| Save with source + multiplier | `fulfillFromProductId` and `fulfillMultiplier` sent in update payload |
| Save with "None" (was previously set) | `clearFulfillFrom: true` sent in update payload |

### AvailabilityPanel Interactions

| Interaction | Behavior |
|-------------|----------|
| Location selected, loading | Skeleton rows (unchanged) |
| Non-substitution product | Single standard row (unchanged from current) |
| Substitution product, all direct stock sufficient | Header row + "Direct stock" sub-row showing OK, no substitute sub-row |
| Substitution product, direct stock insufficient | Header row + "Direct stock" sub-row (Short), "via Nx Source" sub-row, "Overall" verdict row |
| Substitution product, both insufficient | Header row + both sub-rows (both Short), "Overall" verdict row (Short) |

### FulfillButton Interactions

| Interaction | Behavior |
|-------------|----------|
| Click "Confirm Fulfillment" | Existing flow unchanged; enhanced toast on success |
| Success with substitution deductions | Toast shows per-source breakdown with "(direct)" and "(via Nx Source)" labels, 6000ms |
| Success without substitution | Toast shows standard "(direct)" labels, 6000ms |
| Insufficient stock error | Alert panel shows shortages (unchanged) |

## Loading & Skeleton States

No new loading states introduced. All existing patterns preserved:
- AvailabilityPanel: `<Skeleton className="h-8 w-full" />` rows while `availability === undefined` (unchanged)
- ProductForm: existing component loading gate (`loadingComponents`) handles initial render

## Accessibility

| Element | Requirement |
|---------|------------|
| Dropdown (Select) | Radix Select primitive handles keyboard nav, ARIA roles, focus management natively |
| Number input | Standard `<input type="number">` with `min`, `step`, associated `<Label>` via `htmlFor` |
| Preview box | Static text, no ARIA role needed (informational) |
| Sub-rows in table | Standard `<tr>/<td>` elements within existing `<table>` — screen readers parse naturally |
| Status icons | Paired with text labels ("OK", "Short N") — icons are decorative, text is the accessible content |
| Toast | Sonner handles `role="status"` and `aria-live="polite"` |

## Registry

| Source | Components Used | Safety Gate |
|--------|----------------|-------------|
| shadcn/ui (official) | Select, Input, Label, Separator, Skeleton, Card, Button, Alert, Badge, ScrollArea | N/A (official) |
| Third-party | None | N/A |

## Dark Mode

All new UI elements use Tailwind's dark mode variant classes consistent with existing patterns:
- Preview box: `bg-blue-50 dark:bg-blue-950/20`, `border-blue-200 dark:border-blue-800`, `text-blue-600 dark:text-blue-400`
- Substitute label: `text-amber-600 dark:text-amber-400`
- Status colors: `text-green-700 dark:text-green-400`, `text-red-700 dark:text-red-400`
- Short row background: `bg-red-50 dark:bg-red-950/30`

No new CSS custom properties needed.
