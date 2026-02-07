# Kitchen View V2 - User Guide

**Last Updated:** 2026-02-05

---

## What You're Looking At

Each **order card** shows one customer's order. Inside each card are **package counters** for each product they ordered.

---

## Understanding the Package Counter

### Product Header
```
─────────────────────────────
  Triples
─────────────────────────────
```
The product name in **large bold text** - this is what you're filling.

### Package Info Box (Gray Background)
```
Each package needs:        3 balls
Still need to fill:        2 packages
```
- **"Each package needs"** - How many balls go into ONE package of this product
  - Singles = 1 ball
  - Doubles = 2 balls
  - Triples = 3 balls
- **"Still need to fill"** - How many packages are left unfilled

### The Counter
```
    2/5
packages filled
```
- **Left number (2)** = Packages you've already filled
- **Right number (5)** = Total packages ordered
- You need to fill **5 packages total**, you've done **2** so far

### The Buttons

**[- Remove]** (Gray button, left side)
- Removes ONE complete package worth of balls
- For Triples, removes 3 balls
- Disabled if you haven't filled any packages yet

**[+ Fill]** (Orange button, right side)
- Fills ONE complete package worth of balls
- For Triples, adds 3 balls
- Disabled once all packages are filled
- When complete, button turns green

---

## Workflow: Filling an Order

### Example: Customer orders 3 packages of Triples

**Initial State:**
```
┌─────────────────────────────────┐
│ Triples                         │
├─────────────────────────────────┤
│ Each package needs:     3 balls │
│ Still need to fill:  3 packages │
├─────────────────────────────────┤
│  [-]       0/3        [+]       │
│         packages                │
└─────────────────────────────────┘
```

**You make 3 balls and tap [+ Fill]:**
```
┌─────────────────────────────────┐
│ Triples                         │
├─────────────────────────────────┤
│ Each package needs:     3 balls │
│ Still need to fill:  2 packages │
├─────────────────────────────────┤
│  [-]       1/3        [+]       │
│         packages                │
└─────────────────────────────────┘
```
- Counter changed: 0/3 → **1/3**
- "Still need" changed: 3 → **2 packages**

**You make 3 more balls and tap [+ Fill] again:**
```
┌─────────────────────────────────┐
│ Triples                         │
├─────────────────────────────────┤
│ Each package needs:     3 balls │
│ Still need to fill:  1 package  │
├─────────────────────────────────┤
│  [-]       2/3        [+]       │
│         packages                │
└─────────────────────────────────┘
```

**You make 3 more balls and tap [+ Fill] one last time:**
```
┌───────────────────────────────────────┐
│ Triples              [Complete] ✓     │
├───────────────────────────────────────┤
│ Each package needs:         3 balls   │
├───────────────────────────────────────┤
│  [-]         3/3            [+] ✓     │
│          packages                     │
└───────────────────────────────────────┘
```
- Card turns **green**
- Counter shows **3/3** in green
- [+ Fill] button turns green and is disabled
- "Still need" section disappears

**If you made a mistake:**
- Tap **[- Remove]** to subtract one package worth of balls
- For Triples, this removes 3 balls and decrements counter: 3/3 → 2/3

---

## Key Points

### ✅ You're filling by PACKAGE, not individual balls
- Each button press = one complete package
- Triples: one press adds/removes 3 balls
- Singles: one press adds/removes 1 ball

### ✅ The counter shows PACKAGES filled, not balls
- **1/3** means "1 package out of 3 packages filled"
- NOT "1 ball out of 3 balls filled"

### ✅ Backend automatically tracks ball inventory
- When you tap [+ Fill], the system:
  1. Deducts balls from the tray inventory
  2. Adds them to this order
  3. Updates the counter
- When you tap [- Remove], it reverses this

### ✅ Complete packages are visually distinct
- Green background
- Green counter text
- "Complete" badge in corner
- [+ Fill] button disabled and green

---

## Common Questions

**Q: Why does it say "1 balls/pkg" for Triples?**
A: This means the order data is incorrect. The order was likely created before menu products were properly configured. The correct value should be:
- Singles: 1 ball/pkg
- Doubles: 2 balls/pkg
- Triples: 3 balls/pkg

**Q: Can I still fill individual balls?**
A: No. The current system fills by complete package only. Each button press adds one full package worth of balls (1 for Singles, 2 for Doubles, 3 for Triples).

**Q: What if I need to adjust by individual balls?**
A: You would need to modify the order in the admin interface or ask a manager to adjust it manually in the database.

**Q: Why was the old "(Standard)" label removed?**
A: It was hardcoded and meaningless. The backend doesn't track box types, so displaying "Standard" for everything was confusing and not helpful.

---

## Troubleshooting

### Problem: Counter shows wrong balls/pkg
**Example:** Triples shows "1 balls/pkg" instead of "3 balls/pkg"

**Cause:** Order was created before menu products had correct `productionUnits` values set.

**Solution:**
1. Cancel and recreate the order using the POS system with proper menu products
2. OR ask a developer to update the order's `productionUnits` field in the database

### Problem: Counter won't increment
**Possible causes:**
- All packages already filled (check if counter shows complete like "5/5")
- Not enough balls in tray inventory
- Order is in wrong status (not in production)
- Browser console may show an error message

**Solution:** Check the ball tray counters on the left sidebar. If inventory is 0, add balls first.

---

## Related Documentation

- [Kitchen Redesign Summary](kitchen-redesign-summary.md) - Full design rationale
- [Schema Documentation](SCHEMA.md) - Database structure
- [Order Workflow](WORKFLOW.md) - Order status lifecycle

---

**Need help?** Contact the development team or check the Convex dashboard for backend errors.
