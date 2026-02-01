# Phase 3: UI Components Design Document

**Visual Inventory System - Kitchen View Transformation**

This document provides detailed specifications for each UI component to be built in Phase 3. These components can be built in parallel using the `ui-component-builder` agent.

---

## Component Overview

| Component | Purpose | Priority |
|-----------|---------|----------|
| `ChannelBadge.tsx` | Display order channel with color/badge | High |
| `KitchenHelpPanel.tsx` | Collapsible tutorial panel | Medium |
| `ProductPackage.tsx` | Individual package with state colors | High |
| `InventoryTray.tsx` | Ball pile visualization with animations | High |
| `OrderBox.tsx` | Complete order card with package grid | High |

---

## 1. ChannelBadge Component

**File:** `src/components/orders/ChannelBadge.tsx`

### Purpose
Display order source channel as a colored badge with appropriate styling.

### Props Interface
```typescript
interface ChannelBadgeProps {
  channel: string | null | undefined;
  size?: 'sm' | 'md' | 'lg';
  showLabel?: boolean; // Show full name or just code
}
```

### Design Specifications
- Use `getChannelInfo()` from `src/lib/channels.ts`
- **Green channels** (whatsapp, tokopedia, grabfood): Double border effect
- **Other channels**: Single border
- Badge shows short code (WA, IG, SHP, etc.)
- Tooltip shows full name on hover

### Styling Rules
```
Double border (green channels):
- box-shadow: 0 0 0 2px {color}, 0 0 0 4px {color}40

Single border:
- border: 2px solid {color}
```

### Size Variants
- `sm`: text-xs, px-2, py-0.5 (for lists)
- `md`: text-sm, px-3, py-1 (default)
- `lg`: text-base, px-4, py-1.5 (for headers)

### Example Usage
```tsx
<ChannelBadge channel="whatsapp" />
// Renders: [WA] with green double border

<ChannelBadge channel="instagram" size="lg" showLabel />
// Renders: [IG] Instagram with purple single border
```

---

## 2. KitchenHelpPanel Component

**File:** `src/components/orders/KitchenHelpPanel.tsx`

### Purpose
Collapsible tutorial panel that explains the Kitchen View workflow.

### Props Interface
```typescript
interface KitchenHelpPanelProps {
  className?: string;
}
```

### State Management
- Uses `localStorage` key: `kitchenHelpMinimized`
- Auto-shows on first visit (no localStorage value)
- Remembers collapsed state

### Content Structure
```
Step 1: PRODUCTION
- Tap [+1] or [+5] to record balls made
- Balls appear in tray, then flow to orders

Step 2: PACKING
- When package turns YELLOW, it's ready
- Tap to mark as PACKED (turns green)

Step 3: CONFIRM
- When ALL packages are green
- Hold confirm button 1 second

Tips:
- Tap GREEN to unpack (back to yellow)
- Use [+] to reveal [-1] for corrections
- Overflow stays in tray for next order
```

### Visual Design
- Collapsible card with ChevronDown/ChevronUp icon
- Icon prefix for each step (ChefHat, Package, CheckCircle)
- Tips section with lightbulb icon
- Subtle background (bg-blue-50 dark:bg-blue-950/20)

### Animation
- Framer Motion collapse/expand with `AnimatePresence`
- Height: 0 → auto transition

---

## 3. ProductPackage Component

**File:** `src/components/orders/ProductPackage.tsx`

### Purpose
Represents a single package within an order that needs to be filled with balls.

### Props Interface
```typescript
type PackageStatus = 'empty' | 'filling' | 'filled' | 'packed';

interface ProductPackageProps {
  productName: string;
  ballType: 'original' | 'bite_sized';
  ballsRequired: number;
  ballsFilled: number;
  status: PackageStatus;
  onPack?: () => void;    // Called when tapping yellow (filled) package
  onUnpack?: () => void;  // Called when tapping green (packed) package
  disabled?: boolean;
}
```

### State Colors (Border + Background)
```
empty:   border-gray-300, bg-gray-50
filling: border-red-500, bg-red-50
filled:  border-yellow-500, bg-yellow-50, cursor-pointer
packed:  border-green-500, bg-green-50, cursor-pointer
```

### Ball Visual Design
- **Pistachio green:** #93C572
- **Chocolate brown outline:** #7B3F00
- **Original ball:** 20px (display size, smaller than tray)
- **Bite-sized ball:** 14px
- **Squished oval:** transform: scaleY(0.94)
- **Filled ball:** Full opacity
- **Empty slot:** 15% opacity (ghost)

### Layout
```
┌─────────────────┐
│  Product Name   │
│ ╭─────────────╮ │
│ │ ● ● ○       │ │  ← Balls (filled/empty)
│ ╰─────────────╯ │
│     2/3        │  ← Progress
└─{STATUS COLOR}──┘
```

### Interactions
- **Yellow package:** Shows tooltip "Tap to mark as packed", onClick → onPack()
- **Green package:** onClick → onUnpack()
- **Empty/Filling:** No click interaction

### Sounds
- Tap yellow → call `playSoftClick()` before onPack()

---

## 4. InventoryTray Component

**File:** `src/components/orders/InventoryTray.tsx`

### Purpose
Visual representation of balls in the production tray with natural pile effect.

### Props Interface
```typescript
interface InventoryTrayProps {
  ballType: 'original' | 'bite_sized';
  count: number;
  maxVisible?: number; // Default 20
  className?: string;
}
```

### Ball Visual Design
- Same colors as ProductPackage
- **Original ball:** 28px diameter
- **Bite-sized ball:** 18px diameter
- Squished oval (scaleY: 0.94)
- Drop shadow for depth
- Radial gradient for 3D effect

### Pile Layout Algorithm
```typescript
// Natural pile - pyramid-ish arrangement
function calculateBallPositions(count: number, containerWidth: number): Position[] {
  const positions: Position[] = [];
  // Bottom row: max 7 balls
  // Each row above: -1 ball, offset horizontally
  // Add slight random offset for natural feel (±2px)
}
```

### Visual States
- **Empty (0 balls):** Ghost outline balls at 10-15% opacity
- **Has balls:** Full balls with pile effect
- **Overflow:** Shows "+N more" badge

### Count Display
- Always visible at bottom
- Format: `【 12 】`
- Uses tabular-nums font

### Animations (Framer Motion)
- **Ball appearing:** Scale from 0 → 1, slight y offset
- **Ball landing:** Bounce effect (y: -10 → 0, spring)
- **Ball draining:** Fade out + translate toward order direction

---

## 5. OrderBox Component

**File:** `src/components/orders/OrderBox.tsx`

### Purpose
Complete order card with package grid, replaces `KitchenOrderCard.tsx`.

### Props Interface
```typescript
interface OrderBoxProps {
  order: {
    _id: string;
    orderNumber: string;
    channel?: string;
    dueDate?: number;
    items: Array<{
      _id: string;
      productName: string;
      productVariant?: string;
      productionType: 'original' | 'bite_sized';
      productionUnits: number;
      quantity: number;
      packageStatus: PackageStatus;
      ballsFilled: number;
    }>;
    customer?: { name: string };
  };
  onPackageStatusChange?: (itemId: string, newStatus: 'filled' | 'packed') => void;
  onComplete?: () => void;
  disabled?: boolean;
}
```

### Layout Structure
```
╔═══════════════════════════════════════════════════╗
║ [WA] #0129-001 - John Doe                         ║
║ DUE: 14:00                              [URGENT]  ║
╠═══════════════════════════════════════════════════╣
║  Total: Original 1/2 | Bite-sized 4/13            ║
║  [Awaiting balls...] or [ALL PACKED - Hold 1s]    ║
╠═══════════════════════════════════════════════════╣
║  ┌─────────┐ ┌─────────┐ ┌─────────┐             ║
║  │Package 1│ │Package 2│ │Package 3│             ║
║  └─────────┘ └─────────┘ └─────────┘             ║
╚═══════════════════════════════════════════════════╝
```

### Header Section
- ChannelBadge component
- Order number (mono font)
- Customer name
- Due time with urgency indicator

### Summary Section
- Total balls by type: "Original X/Y | Bite-sized X/Y"
- Status message or completion button
- **All packages green:** Show hold-to-confirm button

### Package Grid
- Responsive grid: 2-4 columns based on viewport
- Uses ProductPackage component for each item
- Packages sorted by: quantity desc, then productionType

### Completion Logic
- Button only active when ALL packages have status === 'packed'
- 1-second hold to confirm (same as current KitchenOrderCard)

### Urgency States
- **Normal:** Default border
- **Urgent (≤2h):** Amber border + pulse
- **Overdue:** Red border + pulse

---

## Shared Utilities

### Ball Colors (Use Everywhere)
```typescript
// src/lib/ballColors.ts or inline
export const BALL_COLORS = {
  fill: '#93C572',      // Pistachio green
  stroke: '#7B3F00',    // Chocolate brown
  strokeWidth: 2,
} as const;

export const BALL_SIZES = {
  original: 28,
  biteSized: 18,
} as const;
```

### Ball SVG Component (Shared)
```tsx
// Could be extracted to BallIcon.tsx
interface BallIconProps {
  type: 'original' | 'bite_sized';
  filled?: boolean; // true = full color, false = ghost
}
```

---

## File Structure After Phase 3

```
src/components/orders/
├── index.ts                  # Add new exports
├── ChannelBadge.tsx          # NEW
├── KitchenHelpPanel.tsx      # NEW
├── ProductPackage.tsx        # NEW
├── InventoryTray.tsx         # NEW
├── OrderBox.tsx              # NEW (replaces KitchenOrderCard usage)
├── KitchenOrderCard.tsx      # KEEP for backward compat
├── BallCompletionButtons.tsx # Will be modified in Phase 4
├── KitchenDashboard.tsx      # Already updated
└── SoundToggle.tsx           # Existing
```

---

## Dependencies

All components should use:
- shadcn/ui components (Card, Badge, Button, Tooltip)
- Tailwind CSS for styling
- Framer Motion for animations
- `src/lib/channels.ts` for channel data
- `src/lib/kitchenSounds.ts` for sounds

---

## Testing Checklist

Each component should:
- [ ] Render without crashing
- [ ] Handle undefined/null props gracefully
- [ ] Support dark mode
- [ ] Be responsive on mobile
- [ ] Have accessible focus states
- [ ] Work with screen readers (aria labels)
