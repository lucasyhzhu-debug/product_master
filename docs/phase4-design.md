# Phase 4: Page Integration Design Document

**Visual Inventory System - Kitchen View Integration**

This document provides detailed specifications for integrating the Phase 3 components into the existing pages. These tasks should be executed **sequentially** using the `react-ui-builder` agent.

---

## Integration Overview

| Task | File | Complexity |
|------|------|------------|
| 1. Refactor BallCompletionButtons | `src/components/orders/BallCompletionButtons.tsx` | Medium |
| 2. Restructure KitchenView | `src/pages/KitchenView.tsx` | High |
| 3. Update OrderManager | `src/pages/OrderManager.tsx` | Low |

**Order matters:** Complete in sequence as later tasks depend on earlier ones.

---

## Task 1: Refactor BallCompletionButtons

**File:** `src/components/orders/BallCompletionButtons.tsx`

### Current Behavior
- Hold-to-add buttons (1 second delay)
- +1 and +5 for each ball type
- No undo functionality

### New Requirements

1. **Remove hold delay** - Instant tap for production buttons
2. **Add hidden [-1] undo button** - Revealed via [+] toggle
3. **Rename labels** - "Original" and "Bite-sized" (not Big/Mid)
4. **Update colors** - Pistachio green (#93C572) with chocolate outline
5. **Visual ball icons** - Show actual ball style on buttons

### New Props Interface
```typescript
interface BallCompletionButtonsProps {
  onComplete: (ballType: 'original' | 'bite_sized', count: number) => void;
  onUndo?: (ballType: 'original' | 'bite_sized') => void;
  trayInventory?: {
    originalBallCount: number;
    biteSizedBallCount: number;
  };
  disabled?: boolean;
}
```

### Layout Design
```
┌─── ORIGINAL ZONE ────────────┐  ┌─── BITE-SIZED ZONE ──────────┐
│ [+1] [+5]  [+]               │  │ [+1] [+5]  [+]                │
│             └─[-1]           │  │             └─[-1]            │
└──────────────────────────────┘  └───────────────────────────────┘

When [+] is tapped, [-1] slides out:
┌─── ORIGINAL ZONE ────────────┐
│ [+1] [+5]  [-1]  [−]         │  ← [−] hides the undo button
└──────────────────────────────┘
```

### Undo Button Behavior
- **Greyed out** when tray count is 0
- **Instant tap** (no hold)
- **Silent** (no sound on undo)
- Uses `onUndo` callback

### Button Styling
```tsx
// Production button (+1, +5)
<Button
  variant="outline"
  className="bg-[#93C572]/10 border-[#93C572] hover:bg-[#93C572]/20"
  onClick={() => onComplete('original', 1)}
>
  <BallIcon type="original" className="mr-2" />
  +1
</Button>

// Undo button (-1)
<Button
  variant="ghost"
  size="sm"
  disabled={trayInventory?.originalBallCount === 0}
  className="text-muted-foreground"
  onClick={() => onUndo?.('original')}
>
  -1
</Button>
```

### Animation
- [+] toggle: Framer Motion slide for [-1] reveal
- Button tap: Brief scale effect (0.95 → 1)

---

## Task 2: Restructure KitchenView

**File:** `src/pages/KitchenView.tsx`

### Current Structure
```
PageHeader + SoundToggle
KitchenDashboard (stats)
BallCompletionButtons
Pending Orders (KitchenOrderCard grid)
Completed Today (collapsible)
```

### New Structure
```
PageHeader + SoundToggle
KitchenHelpPanel (collapsible tutorial)
KitchenDashboard (stats with new labels)
┌─────────────────────────────────────────────┐
│  PRODUCTION ZONE (side-by-side)             │
│  ┌─────────────────┐ ┌─────────────────┐   │
│  │ ORIGINAL        │ │ BITE-SIZED      │   │
│  │ [+1] [+5] [+]   │ │ [+1] [+5] [+]   │   │
│  │ ┌─────────────┐ │ │ ┌─────────────┐ │   │
│  │ │ TRAY        │ │ │ │ TRAY        │ │   │
│  │ │ (balls)     │ │ │ │ (balls)     │ │   │
│  │ └─────────────┘ │ │ └─────────────┘ │   │
│  └─────────────────┘ └─────────────────┘   │
└─────────────────────────────────────────────┘
Pending Orders (OrderBox grid) ← NEW component
Completed Today (collapsible, OrderBox)
```

### New Hooks/Queries Needed
```typescript
// Add to imports
import { useQuery, useMutation } from 'convex/react';
import { api } from '../../convex/_generated/api';

// Tray inventory query
const trayInventory = useQuery(api.orders.getTrayInventory);

// Tray mutations
const addBallsToTray = useMutation(api.orders.addBallsToTray);
const removeBallFromTray = useMutation(api.orders.removeBallFromTray);

// Package status mutations
const markPackagePacked = useMutation(api.orders.markPackagePacked);
const unmarkPackagePacked = useMutation(api.orders.unmarkPackagePacked);
```

### New Handler Functions

```typescript
// Replace handleCompleteBalls with tray-based flow
const handleAddBallsToTray = async (
  ballType: 'original' | 'bite_sized',
  count: number
) => {
  try {
    // Play clunk sounds for balls landing in tray
    playClunk();

    const result = await addBallsToTray({ ballType, count });

    // Brief delay for visual effect
    await new Promise(r => setTimeout(r, 200));

    // Play ding sounds for balls draining to orders
    for (let i = 0; i < Math.min(result.ballsUsed, 5); i++) {
      setTimeout(() => playDing(), i * 100);
    }

    // Celebrate completed orders
    if (result.completedOrderIds.length > 0) {
      confetti({ particleCount: 100, spread: 70, origin: { y: 0.6 } });
      playCompletionFanfare();
    }

    // Toast notification
    let message = `+${count} ${ballType === 'original' ? 'Original' : 'Bite-sized'}`;
    if (result.ballsUsed > 0) {
      message += ` → ${result.ballsUsed} applied to orders`;
    }
    if (result.overflow > 0) {
      message += ` (${result.overflow} in tray)`;
    }
    toast.success(message);

  } catch (error) {
    toast.error('Failed to add balls');
    console.error(error);
  }
};

const handleRemoveBall = async (ballType: 'original' | 'bite_sized') => {
  try {
    await removeBallFromTray({ ballType });
    // No sound for undo (silent operation)
  } catch (error) {
    toast.error('Failed to remove ball');
    console.error(error);
  }
};

const handlePackageStatusChange = async (
  itemId: Id<"orderItems">,
  newStatus: 'filled' | 'packed'
) => {
  try {
    if (newStatus === 'packed') {
      playSoftClick();
      await markPackagePacked({ orderItemId: itemId });
    } else {
      await unmarkPackagePacked({ orderItemId: itemId });
    }
  } catch (error) {
    toast.error('Failed to update package');
    console.error(error);
  }
};
```

### Production Zone Layout

```tsx
{/* Production Zone - Side by Side */}
<div className="grid grid-cols-1 md:grid-cols-2 gap-6">
  {/* Original Zone */}
  <Card>
    <CardHeader className="pb-2">
      <CardTitle className="text-lg flex items-center gap-2">
        <BallIcon type="original" />
        Original
      </CardTitle>
    </CardHeader>
    <CardContent className="space-y-4">
      <BallCompletionButtons
        ballType="original"
        onComplete={(count) => handleAddBallsToTray('original', count)}
        onUndo={() => handleRemoveBall('original')}
        trayCount={trayInventory?.originalBallCount ?? 0}
        disabled={!canEditKitchen}
      />
      <InventoryTray
        ballType="original"
        count={trayInventory?.originalBallCount ?? 0}
      />
    </CardContent>
  </Card>

  {/* Bite-sized Zone */}
  <Card>
    <CardHeader className="pb-2">
      <CardTitle className="text-lg flex items-center gap-2">
        <BallIcon type="bite_sized" />
        Bite-sized
      </CardTitle>
    </CardHeader>
    <CardContent className="space-y-4">
      <BallCompletionButtons
        ballType="bite_sized"
        onComplete={(count) => handleAddBallsToTray('bite_sized', count)}
        onUndo={() => handleRemoveBall('bite_sized')}
        trayCount={trayInventory?.biteSizedBallCount ?? 0}
        disabled={!canEditKitchen}
      />
      <InventoryTray
        ballType="bite_sized"
        count={trayInventory?.biteSizedBallCount ?? 0}
      />
    </CardContent>
  </Card>
</div>
```

### Orders Section

Replace `KitchenOrderCard` with `OrderBox`:

```tsx
{pendingOrders?.map((order) => (
  <OrderBox
    key={order._id}
    order={order}
    onPackageStatusChange={handlePackageStatusChange}
    onComplete={() => handleCompleteOrder(order._id)}
    disabled={!canEditKitchen}
  />
))}
```

### Import Updates

```typescript
// Remove
import { BallCompletionButtons, KitchenOrderCard } from '@/components/orders';

// Add
import {
  KitchenHelpPanel,
  InventoryTray,
  OrderBox,
  BallCompletionButtons,  // Refactored version
  SoundToggle,
  KitchenDashboard,
} from '@/components/orders';
import { playClunk, playSoftClick, playDing, playCompletionFanfare } from '@/lib/kitchenSounds';
```

---

## Task 3: Update OrderManager

**File:** `src/pages/OrderManager.tsx`

### Current Behavior
- Channel selection via dropdown/input

### New Requirement
- Replace channel dropdown with clickable ChannelBadge selector

### Changes Required

1. Import ChannelBadge and channel utilities:
```typescript
import { ChannelBadge } from '@/components/orders';
import { CHANNELS, ChannelKey, getChannelOptions } from '@/lib/channels';
```

2. Replace channel input with badge selector:
```tsx
{/* Channel Selector */}
<div className="space-y-2">
  <Label>Channel</Label>
  <div className="flex flex-wrap gap-2">
    {getChannelOptions().map(({ value, label }) => (
      <button
        key={value}
        type="button"
        onClick={() => setChannel(value)}
        className={cn(
          'transition-all',
          channel === value && 'ring-2 ring-offset-2 ring-primary'
        )}
      >
        <ChannelBadge channel={value} size="md" />
      </button>
    ))}
  </div>
</div>
```

3. Update form state type:
```typescript
const [channel, setChannel] = useState<ChannelKey>('whatsapp');
```

### Visual Design
- Badges arranged in flex-wrap grid
- Selected badge has ring highlight
- Hover effect on unselected badges

---

## Data Flow Summary

```
User taps [+5 Original]
    ↓
handleAddBallsToTray('original', 5)
    ↓
playClunk() sound
    ↓
addBallsToTray mutation
    ↓
Convex updates kitchenInventory + auto-drains to orders
    ↓
getTrayInventory query updates (reactive)
    ↓
InventoryTray re-renders with new count
    ↓
OrderBox re-renders with updated ballsFilled/packageStatus
    ↓
playDing() sounds for each ball applied
```

---

## Component Dependencies

```
KitchenView
├── KitchenHelpPanel
├── KitchenDashboard
├── Card (shadcn)
│   ├── BallCompletionButtons
│   └── InventoryTray
└── OrderBox
    ├── ChannelBadge
    └── ProductPackage[]
```

---

## Hooks to Create/Update

### New Hook: `useTrayInventory`

**File:** `src/hooks/convex/useTrayInventory.ts`

```typescript
import { useQuery, useMutation } from 'convex/react';
import { api } from '../../../convex/_generated/api';

export function useTrayInventory() {
  const inventory = useQuery(api.orders.getTrayInventory);
  const addBalls = useMutation(api.orders.addBallsToTray);
  const removeBall = useMutation(api.orders.removeBallFromTray);

  return {
    inventory,
    addBalls,
    removeBall,
    isLoading: inventory === undefined,
  };
}
```

### New Hook: `usePackageStatus`

**File:** `src/hooks/convex/usePackageStatus.ts`

```typescript
import { useMutation } from 'convex/react';
import { api } from '../../../convex/_generated/api';

export function usePackageStatus() {
  const markPacked = useMutation(api.orders.markPackagePacked);
  const unmarkPacked = useMutation(api.orders.unmarkPackagePacked);

  return { markPacked, unmarkPacked };
}
```

---

## Testing Checklist

### BallCompletionButtons
- [ ] Instant tap adds balls (no hold delay)
- [ ] [+] reveals [-1] button
- [ ] [-1] is greyed when tray empty
- [ ] Labels show "Original" / "Bite-sized"
- [ ] Colors match spec (pistachio green)

### KitchenView
- [ ] Help panel shows on first visit
- [ ] Help panel state persists (localStorage)
- [ ] Trays show ball counts
- [ ] Balls animate when added
- [ ] Balls drain to orders after brief delay
- [ ] Sounds play correctly (clunk, ding, soft click)
- [ ] Orders use OrderBox component
- [ ] Package states update correctly

### OrderManager
- [ ] Channel badges display correctly
- [ ] Selection works with click
- [ ] Selected badge has visual highlight
- [ ] All 11 channels available

---

## Migration Notes

1. **KitchenOrderCard** - Keep file for backward compatibility but stop using in KitchenView
2. **Old ball completion logic** - Refactored to use tray system
3. **Data migration** - Not needed; tray starts empty each day
