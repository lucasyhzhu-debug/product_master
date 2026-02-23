# Frollie Recipe Master -- UI Brand Reference

> **Source of truth** for all visual design decisions. Every page, component, and new feature must conform to this document.

---

## Visual Identity

- **Brand tone:** Friendly, warm, approachable -- a snack brand app, not clinical SaaS
- **Reference style:** Notion-style warm -- clean but friendly, generous white space, warm grays
- **Not:** Heavy decoration, dark enterprise dashboards, cold blue/gray palettes
- **Accent direction:** Fresh green/teal -- clean, natural, health-conscious feel

---

## Color Palette

### Brand Accent (Teal)

| Token | Light Mode | Dark Mode | Usage |
|-------|-----------|-----------|-------|
| `--color-brand` | `#0D9488` | `#14B8A6` | Primary buttons, links, active states, focus rings |
| `--color-brand-dark` | `#0F766E` | `#0D9488` | Hover states on brand elements |
| `--color-brand-darker` | `#115E59` | `#0F766E` | Active/pressed states |
| `--color-brand-light` | `rgba(13,148,136,0.1)` | `rgba(20,184,166,0.15)` | Tinted backgrounds, selected rows |
| `--color-brand-muted` | `rgba(13,148,136,0.05)` | `rgba(20,184,166,0.08)` | Subtle background tints |

### Semantic Colors (shadcn)

| Token | Light Mode | Dark Mode | Usage |
|-------|-----------|-----------|-------|
| `--color-background` | `hsl(0 0% 100%)` | `hsl(224 10% 10%)` | Page background |
| `--color-foreground` | `hsl(222.2 84% 4.9%)` | `hsl(210 40% 98%)` | Primary text |
| `--color-card` | `hsl(0 0% 100%)` | `hsl(224 10% 13%)` | Card surfaces |
| `--color-card-foreground` | `hsl(222.2 84% 4.9%)` | `hsl(210 40% 98%)` | Card text |
| `--color-popover` | `hsl(0 0% 100%)` | `hsl(224 10% 13%)` | Popover/dropdown surfaces |
| `--color-popover-foreground` | `hsl(222.2 84% 4.9%)` | `hsl(210 40% 98%)` | Popover text |
| `--color-primary` | `hsl(172 90% 30%)` | `hsl(172 60% 45%)` | Primary interactive elements (teal) |
| `--color-primary-foreground` | `hsl(0 0% 100%)` | `hsl(0 0% 100%)` | Text on primary elements |
| `--color-secondary` | `hsl(210 40% 96.1%)` | `hsl(224 10% 18%)` | Secondary surfaces |
| `--color-secondary-foreground` | `hsl(222.2 47.4% 11.2%)` | `hsl(210 40% 98%)` | Text on secondary |
| `--color-muted` | `hsl(210 40% 96.1%)` | `hsl(224 10% 18%)` | Muted backgrounds, disabled |
| `--color-muted-foreground` | `hsl(215.4 16.3% 46.9%)` | `hsl(215 16% 57%)` | Muted text, placeholders |
| `--color-accent` | `hsl(210 40% 96.1%)` | `hsl(224 10% 18%)` | Accent highlights |
| `--color-accent-foreground` | `hsl(222.2 47.4% 11.2%)` | `hsl(210 40% 98%)` | Text on accent |
| `--color-destructive` | `hsl(0 84.2% 60.2%)` | `hsl(0 63% 50%)` | Delete, error, danger actions |
| `--color-destructive-foreground` | `hsl(210 40% 98%)` | `hsl(210 40% 98%)` | Text on destructive |
| `--color-border` | `hsl(214.3 31.8% 91.4%)` | `hsl(224 10% 20%)` | All borders |
| `--color-input` | `hsl(214.3 31.8% 91.4%)` | `hsl(224 10% 20%)` | Input borders |
| `--color-ring` | `hsl(172 90% 30%)` | `hsl(172 60% 45%)` | Focus rings (teal) |

### Domain-Specific Colors (Not Theme-Dependent)

These colors are **semantic** -- they identify kitchen stations, sales channels, and operational states. They do NOT change between light and dark mode.

**Kitchen Stations:**
| Station | Primary | Light BG | Medium BG | Accent |
|---------|---------|----------|-----------|--------|
| Production | `#5B7A5E` | `#EEF2EE` | `#D4DED5` | `#3D5A3F` |
| Boxing | `#C4845C` | `#FDF5EF` | `#F5E0CE` | `#8B5E3C` |
| Stickering | `#6B4C3B` | `#F7F0EB` | `#E8D8CC` | `#4A3428` |
| Packing | `#E07856` | `#FEF2EE` | `#F5D5C8` | `#C55A3A` |

**Sales Channels:**
| Channel | Primary | Light BG | Badge |
|---------|---------|----------|-------|
| GoFood | `#2D8A6E` | `#EDF7F3` | `#15803D` |
| K3 Mart | `#B45309` | `#FEF3C7` | `#D97706` |

**Kitchen Status Colors:**
| State | Color | Background |
|-------|-------|-----------|
| Success | `#3D7A4A` | `#E8F5EA` |
| Warning | `#D4772C` | `#FFF3E0` |
| Critical | `#C0392B` | `#FDEDEC` |
| Neutral | `#718096` | `#F7FAFC` |

---

## Typography

| Role | Font | Weight | Size | Notes |
|------|------|--------|------|-------|
| **Headings (page title)** | Inter | 700-800 | `text-2xl` | `tracking-tight`, consistent across all pages |
| **Subheadings** | Inter | 600 | `text-lg` or `text-xl` | Section headers within pages |
| **Body text** | Inter | 400-500 | `text-sm` or `text-base` | Default readable text |
| **Small/caption** | Inter | 400 | `text-xs` or `text-sm` | Timestamps, metadata, helper text |
| **Monospace** | System default | 400 | `text-sm font-mono` | Order numbers, inventory codes, amounts |

**Rules:**
- **Single font family:** Inter for everything. No Playfair Display (removed in Phase 9).
- **Loaded weights:** 400, 500, 600, 700, 800 from Google Fonts.
- No inline font overrides. Use Tailwind weight utilities (`font-normal`, `font-medium`, `font-semibold`, `font-bold`, `font-extrabold`).

---

## Spacing Scale

| Tailwind | Pixels | Usage |
|----------|--------|-------|
| `gap-1`, `p-1` | 4px | Tight element gaps (icon + label) |
| `gap-2`, `p-2` | 8px | Inline element spacing, compact padding |
| `gap-3`, `p-3` | 12px | Compact section gaps, badge padding |
| `gap-4`, `p-4` | 16px | Standard element gaps, card internal padding |
| `gap-6`, `p-6`, `space-y-6` | 24px | Section spacing within page (standard page gap) |
| `gap-8`, `p-8` | 32px | Major section spacing |
| `py-12` | 48px | Page-level vertical rhythm |

**Standard page content gap:** `space-y-6` (24px) on all pages. No exceptions.

---

## Border Radius

| Token | Value | Pixels | Usage |
|-------|-------|--------|-------|
| `--radius-lg` | `0.75rem` | 12px | Cards, modals, large containers |
| `--radius-md` | `0.5rem` | 8px | Buttons, inputs, smaller cards |
| `--radius-sm` | `0.375rem` | 6px | Badges, chips, small elements |

Use `rounded-lg` (12px), `rounded-md` (8px), `rounded-sm` (6px) consistently. Warm and approachable, not sharp.

---

## Shadows

| Context | Class | Notes |
|---------|-------|-------|
| Cards | `shadow-sm` | Subtle, warm feel |
| Hover states | `shadow-md` | Transition on interaction |
| Modals/dialogs | `shadow-lg` | Clear elevation |
| Buttons | None or `shadow-sm` | Light depth only |

**Rule:** No heavy shadows. Depth comes from subtle elevation + borders, not dramatic drop shadows.

---

## Page Layout

### Container
- **Max width:** `max-w-[1400px]` centered with `mx-auto`
- **Horizontal padding:** `px-4 sm:px-6 lg:px-8`
- **Vertical padding:** `py-6`
- **Applied by:** `PageContainer` component in Layout -- NOT by individual pages

### Full-Width Exceptions
These pages opt out of standard `PageContainer` max-width:
- **KitchenViewV2** -- swipeable 4-panel layout needs full viewport width
- **OrderManager** -- split-pane desktop layout
- Use route-level opt-out mechanism, not per-page wrappers

### Header
- **Position:** Fixed (`fixed top-0 z-50`)
- **Behavior:** Hide on scroll down, show on scroll up (Framer Motion)
- **Height:** `h-14` (56px)
- **Main content offset:** `pt-14` to compensate for fixed header

### Footer
- **Visibility:** Desktop only (`hidden md:block`)
- **Content:** Navigation links, copyright, helpful info
- **Not shown on mobile** -- bottom tab bar is the mobile navigation

### Mobile Bottom Tab Bar
- **Position:** Fixed bottom (`fixed bottom-0 inset-x-0 z-50`)
- **Visibility:** Mobile only (`md:hidden`)
- **Height:** `h-14` with safe area bottom padding
- **Max items:** 5 tabs (role-filtered)
- **Main content offset:** `pb-16 md:pb-0` to prevent content overlap

**Role-based tab items:**

| Role | Tabs |
|------|------|
| `kitchen` | Kitchen, Packaging |
| `order_staff` | Orders, Kitchen, Packaging |
| `manager` | Sales, Orders, Kitchen, Inventory, More |
| `admin` | Sales, Orders, Kitchen, Inventory, More |

### Page Transitions
- **Wrapper:** `AnimatePresence` around `<Outlet />`
- **Animation:** Fade in (`opacity: 0 -> 1`), duration 150ms
- **Key:** `location.pathname` for proper enter/exit lifecycle
- **Library:** Framer Motion

---

## Component Patterns

### PageHeader

All pages MUST use the `<PageHeader>` component. No custom inline headers.

```
<PageHeader
  title="Page Title"
  description="Optional description text"
  backTo="/parent-route"    // optional back button
  action={<Button>Action</Button>}  // optional action slot
/>
```

- **Title:** `text-2xl font-bold tracking-tight`
- **Description:** `text-sm text-muted-foreground`
- **Action slot:** Right-aligned button(s)
- **Back button:** Uses `backTo` prop with arrow icon

### Cards

- Use `<Card>` from shadcn/ui
- `rounded-lg` (12px) with `shadow-sm`
- Background: `bg-card`
- Foreground: `text-card-foreground`
- Border: `border` (uses `--color-border`)

### Tables

- **Cell padding:** `py-3 px-4` (comfortable density)
- **Header:** `bg-muted/50` with `text-muted-foreground text-sm font-medium`
- **Borders:** `border-border`
- **Hover rows:** `hover:bg-muted/30`
- **Striping:** Optional, use `even:bg-muted/20` if needed

### Buttons

| Variant | Style | Usage |
|---------|-------|-------|
| Primary | Teal brand (shadcn `default` with teal `--color-primary`) | Main actions |
| Secondary | `bg-secondary` | Alternative actions |
| Destructive | `bg-destructive` | Delete, cancel, danger |
| Ghost | `hover:bg-accent` | Toolbar actions, inline links |
| Outline | `border-input bg-background hover:bg-accent` | Form actions |

- **Sizes:** default `h-10`, sm `h-9`, lg `h-11`
- **Border radius:** `rounded-md` (8px)

### Modals / Dialogs

- Use shadcn `Dialog` or `Sheet`
- `rounded-lg` (12px)
- `shadow-lg`
- Overlay: `bg-black/50`
- Content: standard `p-6` padding

### Toast Notifications

- **System:** Sonner (via existing `actionToast.ts`)
- **Position:** Contextual -- near the action trigger, not fixed corner
- **Theme-aware:** Pass `resolvedTheme` from `useTheme()` to Sonner's `theme` prop

### Loading States

- **Skeleton screens:** `Skeleton` component with `animate-pulse`
- **Color:** `bg-muted` (warm gray in light, dark gray in dark)
- **Page-level variants:**
  - `TablePageSkeleton` -- for list/table pages
  - `EditorPageSkeleton` -- for editor pages
  - `DashboardSkeleton` -- for card-heavy pages

### Empty States

- **Icon:** Lucide React at 48px (`h-12 w-12`) inside 96px circle
- **Circle background:** `bg-muted/50`
- **Icon opacity:** `opacity-60` for a gentle feel
- **Text:** Friendly, warm messaging (not "No data found")
- **CTA:** Always include an action button
- **Use `<EmptyState>` shared component**

### Icons

- **Library:** Lucide React (standardized)
- **Standard size:** 24px (`h-6 w-6`)
- **Navigation:** 20px (`h-5 w-5`)
- **Inline/small:** 16px (`h-4 w-4`)

### Kanban Board

Used for multi-status workflow views (e.g., order pipeline in Phase 14).

- **Container:** Horizontal-scrolling wrapper (`overflow-x-auto`) with `snap-x snap-mandatory` on mobile, standard horizontal scroll on desktop
- **Columns:** Each column is a vertical card stack. Header uses `text-sm font-semibold text-muted-foreground` with a count badge. Column width: `min-w-[280px] w-[320px]` on desktop, `min-w-[85vw] snap-center` on mobile
- **Column background:** `bg-muted/30` with `rounded-lg` and `p-3`
- **Cards:** Use standard `<Card>` with `shadow-sm`, `rounded-md`. Clickable cards get `hover:shadow-md cursor-pointer` transition. Card content uses standard spacing (`p-3 space-y-2`)
- **Status indicators:** Use the existing domain-specific status colors (not new colors). Each column header can have a subtle left border accent in the status color
- **Empty columns:** Show `text-muted-foreground text-sm` centered message, no empty state icon (too heavy for a column)
- **Dark mode:** All works automatically via CSS variables. Column bg uses `bg-muted/30` which resolves correctly in both modes
- **Responsive:** On mobile, columns snap-scroll horizontally. On `md:+`, show 3-4 columns visible with horizontal scroll for overflow

### Dashboard Summary Header

Used for at-a-glance KPI bars above main content (e.g., kitchen overview in Phase 15).

- **Container:** Full-width bar above main content. Uses `bg-card border-b border-border` with `p-4`
- **Layout:** CSS grid: `grid grid-cols-2 md:grid-cols-4 gap-3` for stat cards
- **Stat cards:** Each stat is a mini-card with `bg-background rounded-md p-3 border border-border`. Contains: icon (Lucide, `h-4 w-4 text-brand` or `text-muted-foreground`), label (`text-xs text-muted-foreground font-medium`), value (`text-lg font-bold text-foreground`), optional delta/subtext (`text-xs text-muted-foreground`)
- **Emphasis:** The primary KPI (e.g., "remaining balls") uses `text-brand` for its value instead of `text-foreground`
- **Dark mode:** Standard -- all via CSS variables
- **Responsive:** 2 columns on mobile, 4 on `md:+`. Values use `text-lg` not larger to stay compact

### Calendar Grid

Used for date-based schedule views (e.g., K3Mart delivery cockpit in Phase 16).

- **Container:** Standard `<Card>` wrapper with `overflow-x-auto` for narrow screens
- **Layout:** 7-column CSS grid: `grid grid-cols-7 gap-px bg-border` (gap-px + bg-border creates 1px grid lines)
- **Day headers:** `text-xs font-medium text-muted-foreground text-center py-2 bg-muted/50`
- **Day cells:** `bg-card p-2 min-h-[80px]` for content area. Date number in `text-xs font-medium` top-left corner
- **Today highlight:** `ring-2 ring-brand/50` on the cell, date number gets `bg-brand text-white rounded-full w-6 h-6 flex items-center justify-center`
- **Weekend cells:** `bg-muted/20` subtle background tint
- **Holiday cells:** `bg-amber-50 dark:bg-amber-950/20` with a small holiday indicator dot
- **Cell content:** Product quantities shown as compact pills: `text-xs bg-muted rounded-sm px-1.5 py-0.5`
- **Outlet tabs:** Use standard shadcn `Tabs` component above the grid. Active tab uses brand accent
- **Dark mode:** Weekend/holiday cell colors use dark-mode-aware values (as specified). Grid lines from `bg-border` resolve automatically
- **Responsive:** On mobile, show 3-day rolling view or horizontal scroll. Full 7-day grid on `md:+`

---

## Dark Mode

| Property | Value |
|----------|-------|
| **Toggle modes** | `light`, `dark`, `system` |
| **Default** | `system` (follows OS preference) |
| **Storage** | `localStorage('frollie-theme')` |
| **Mechanism** | `.dark` class on `<html>`, Tailwind `@custom-variant dark` |
| **Provider** | `ThemeProvider` in `src/contexts/ThemeContext.tsx` |
| **Hook** | `useTheme()` returns `{ theme, setTheme, resolvedTheme }` |

**Rules:**
- All colors MUST use CSS variables -- automatic theme switching
- Domain-specific colors (kitchen stations, GoFood, K3Mart) are NOT changed by dark mode
- Test every new component in both light and dark mode
- Never use hardcoded colors (`text-gray-900`, `bg-white`) -- use semantic tokens

**Hardcoded color replacements:**

| Avoid | Use Instead |
|-------|------------|
| `text-gray-900` | `text-foreground` |
| `text-gray-700` | `text-foreground/80` |
| `text-gray-500` | `text-muted-foreground` |
| `bg-white` | `bg-background` or `bg-card` |
| `bg-gray-100`, `bg-gray-200` | `bg-muted` |
| `border-gray-*` | `border-border` |
| `bg-black` | `bg-foreground` |

**Semantic status color replacements (most common dark mode bug source):**

The project has CSS variables for all status/state backgrounds. Use these instead of raw Tailwind color classes — they automatically resolve to the correct tint in both light and dark mode via the `.dark {}` block in `index.css`. No `dark:` Tailwind prefix needed.

| Avoid (raw Tailwind) | Use Instead (CSS token) | Token resolves to |
|----------------------|------------------------|-------------------|
| `bg-green-50`, `bg-emerald-50` | `bg-[var(--color-status-success-bg)]` | Light: `#ECFDF5` / Dark: deep green tint |
| `bg-amber-50`, `bg-yellow-50` | `bg-[var(--color-status-warning-bg)]` | Light: `#FFFBEB` / Dark: deep amber tint |
| `bg-red-50`, `bg-rose-50` | `bg-[var(--color-status-error-bg)]` | Light: `#FEF2F2` / Dark: deep red tint |
| `bg-blue-50`, `bg-sky-50` | `bg-[var(--color-status-info-bg)]` | Light: `#EFF6FF` / Dark: deep blue tint |
| `text-green-700` on status bg | `text-[var(--color-status-success)]` | Light: `#059669` / Dark: `#34D399` |
| `text-amber-700` on status bg | `text-[var(--color-status-warning)]` | Light: `#D97706` / Dark: `#FBBF24` |
| `text-red-700` on status bg | `text-[var(--color-status-error)]` | Light: `#DC2626` / Dark: `#F87171` |
| `text-blue-700` on status bg | `text-[var(--color-status-info)]` | Light: `#2563EB` / Dark: `#60A5FA` |
| `bg-purple-50`, `bg-violet-50` | `bg-[var(--color-role-admin-bg)]` | Light: `#F5F3FF` / Dark: deep violet tint |

**Domain-specific backgrounds (GoFood, K3Mart, channels) — also use tokens:**

| Avoid | Use Instead |
|-------|------------|
| `bg-green-50` for GoFood | `bg-[var(--color-gofood-light)]` |
| `bg-amber-50` for K3Mart | `bg-[var(--color-k3mart-light)]` |
| `bg-blue-50` for internal channel | `bg-[var(--color-channel-internal-bg)]` |
| `bg-purple-50` for K3Mart channel | `bg-[var(--color-channel-k3mart-bg)]` |
| `bg-red-50` for GoBiz channel | `bg-[var(--color-channel-gobiz-bg)]` |

**How the cascade works:**

```
index.css @theme { --color-status-warning-bg: #FFFBEB; }   ← light mode default
index.css .dark  { --color-status-warning-bg: hsl(40 15% 14%); }  ← dark override

Component: className="bg-[var(--color-status-warning-bg)]"
→ Light mode: renders #FFFBEB (pale amber)
→ Dark mode:  renders hsl(40 15% 14%) (deep amber tint)
→ Zero dark: Tailwind prefix needed
```

**The wrong way (requires manual dark: maintenance per component):**
```tsx
// ❌ Both classes need to be maintained separately. Easy to forget.
className="bg-amber-50 dark:bg-amber-950/40"
```

**The right way (set it once, works everywhere):**
```tsx
// ✅ Single class. Dark mode handled by CSS variable cascade in index.css.
className="bg-[var(--color-status-warning-bg)] text-[var(--color-status-warning)]"
```

---

## Responsive Breakpoints

| Breakpoint | Min Width | Tailwind Prefix | Usage |
|------------|-----------|-----------------|-------|
| Mobile | < 768px | (default) | Phones, compact views |
| Tablet | >= 768px | `md:` | Tablet landscape, side-by-side |
| Desktop | >= 1024px | `lg:` | Full desktop layout |
| Wide | >= 1280px | `xl:` | Extra spacing, wider containers |

**Rules:**
- Use Tailwind responsive prefixes ONLY -- no `window.innerWidth` checks
- Mobile-first approach: default styles for mobile, add `md:` / `lg:` for larger screens
- Bottom tab bar: visible below `md:`, hidden above
- Footer: hidden below `md:`, visible above

---

## Animations (Framer Motion)

| Interaction | Animation | Duration | Notes |
|-------------|-----------|----------|-------|
| Page transitions | Fade (`opacity: 0 -> 1`) | 150ms | `AnimatePresence` + `motion.div` |
| List item stagger | Fade + translateY | 50ms delay per item | `staggerChildren: 0.05` |
| Button hover | `scale(1.02)` | 100ms | Subtle, not bouncy |
| Modal enter | Opacity + translateY(10px -> 0) | 200ms | `ease-out` |
| Modal exit | Opacity (1 -> 0) | 150ms | `ease-in` |
| Card hover | `shadow-sm -> shadow-md` | 200ms | CSS transition, not Framer |
| Tab switch | Fade cross-dissolve | 150ms | Content area only |

**Rules:**
- Animations are **moderate** -- noticeable but not distracting
- Always use `ease-out` for enter, `ease-in` for exit
- Respect `prefers-reduced-motion` (Framer Motion handles this automatically)
- No spring animations on UI elements (save for playful micro-interactions only)

---

## Anti-Patterns (Do NOT Do)

| Anti-Pattern | Why It Breaks | Do Instead |
|--------------|---------------|------------|
| Hardcoded `text-gray-900` | Invisible in dark mode | `text-foreground` |
| `bg-amber-50` / `bg-red-50` / `bg-green-50` / `bg-blue-50` | Light-mode-only; breaks dark mode | `bg-[var(--color-status-warning-bg)]` etc. (see token table above) |
| `bg-*-50` + `dark:bg-*-950/40` per-component | Reinvents the token cascade on every component | Use CSS variable token; dark override lives in `index.css .dark {}` once |
| Per-page `p-6` padding wrapper | Inconsistent margins | Let `PageContainer` in Layout handle it |
| Custom inline `<h1>` header | Title size/style inconsistency | Use `<PageHeader>` component |
| `window.innerWidth` checks | Layout thrashing, SSR-unsafe | Tailwind responsive prefixes |
| Loading a second font family | Extra download, FOUT risk | Inter for everything (400-800 weights) |
| Heavy box shadows | Clinical SaaS feel | `shadow-sm` to `shadow-md` max |
| Bright neon accent colors | Clashes with warm tone | Muted teal (`#0D9488`) as brand accent |

---

*Last updated: 2026-02-15*
*Phase: 12-ui-brand-verification, Plan 01*
