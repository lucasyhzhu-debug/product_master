# Phase 9: UI Brand Consolidation - Research

**Researched:** 2026-02-14
**Domain:** Frontend UI/UX — Tailwind CSS v4, Framer Motion, Dark Mode, Layout Architecture, Mobile Navigation
**Confidence:** HIGH

## Summary

Phase 9 is a frontend-only effort to establish a brand reference document and enforce visual consistency across all 21 pages (19 from index.ts + Login + Dashboard accessed via routes). The codebase currently uses Tailwind CSS v4.1.18 (with `@theme` directive), shadcn/ui primitives (23 components), Framer Motion 11.15, Sonner 2.0.7 for toasts, and Lucide React for icons. The app has a `Layout.tsx` shell with a `Header.tsx` top nav, but no footer, no mobile bottom tab bar, no dark mode support (only 65 `dark:` occurrences across 17 files, mostly in non-page components), and no page transition animations.

The primary technical challenge is that page-level styling is highly inconsistent: some pages use `PageHeader` (15 pages), others use custom inline headers (Dashboard, OrderManager, IngredientsManager, MaterialsManager, KitchenViewV2, MenuProductsManager). Top-level wrapper divs vary between `space-y-6`, `space-y-8`, `space-y-4 md:space-y-6`, `p-6`, and no padding at all (relying on `Layout.tsx`'s `container py-6`). The `container` class from Layout provides centering but its max-width is Tailwind's default. Title sizes range from `text-2xl` to `text-3xl`. The current color palette is "terracotta" (#E07856) — the user wants to shift to "fresh green/teal" while keeping a warm, Notion-style feel.

**Primary recommendation:** Create a centralized theme/token system in `index.css` with light/dark CSS variables, build 4 new layout components (PageContainer, Footer, MobileBottomNav, updated Header with scroll-hide), create a brand reference doc, then systematically audit and fix all 21 pages to use the standardized patterns.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- Derive palette and typography from what's currently in the app — formalize as standard, not redesign
- Visual tone: friendly brand app — warm, rounded, approachable (not clinical SaaS)
- Reference style: Notion-style warm — clean but friendly, lots of white space, warm grays
- Accent color direction: fresh green/teal (clean, natural feel for a snack brand)
- Dark mode: support both light and dark themes (system preference toggle)
- Border radius: medium (8-12px) — noticeably rounded, warm and approachable
- Shadows: subtle drop shadows on cards and modals — depth without heaviness
- Animations: moderate — page transitions, list item stagger, button hover feedback, modal enter/exit (Framer Motion)
- Icons: keep default Lucide React, standardize at 24px
- Loading states: skeleton screens (gray shimmer placeholders matching content layout)
- Empty states: friendly illustration + helpful message + CTA button
- Toast placement: contextual — positioned near the action trigger point, not fixed corner
- Table density: comfortable — more padding, easier to read
- Fully responsive: must work well on phones, tablets, and desktop
- Include component-level guidelines (cards, tables, modals, button hierarchy) — not just fundamentals
- Cover: color palette, typography, spacing scale, margin rules, component patterns, page layout conventions
- Navigation: top header nav bar (horizontal)
- Header scroll behavior: hide on scroll down, show immediately on scroll up
- Content width: max-width container (centered, ~1200-1400px)
- Page margins: uniform horizontal padding on all pages — no exceptions
- Search/filter bar: below page header, between title and list content
- Footer: moderately detailed — navigation links, copyright, helpful info
- Page transitions: fade in/out between pages
- Mobile navigation: bottom tab bar with key items (tab selection is Claude's discretion based on role permissions)

### Claude's Discretion
- Typography selection (warm/friendly direction)
- Page header component design
- Bottom tab bar items and role-based layout
- Exact spacing scale values
- Skeleton screen component design
- Empty state illustrations approach

### Deferred Ideas (OUT OF SCOPE)
- Centralized notification bell — notification icon near account/logout button that consolidates key alerts (pending orders, low stock, etc.) with actionable links. Belongs in its own phase (requires notification aggregation system, read/unread state, entity linking).
</user_constraints>

## Standard Stack

### Core (Already Installed — No New Dependencies)
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| Tailwind CSS | ^4.1.18 | Utility-first styling, `@theme` CSS variables, `dark:` variant | Already in use; v4 has native dark mode + `@custom-variant` support |
| Framer Motion | ^11.15.0 | Page transitions, list stagger, hover/tap feedback, modal enter/exit | Already installed; 17 files already use it |
| shadcn/ui | (via Radix) | 23 UI primitives (Button, Card, Dialog, etc.) | Already in use; provides accessible, composable components |
| Sonner | ^2.0.7 | Toast notifications | Already installed; contextual toasts via existing `actionToast.ts` |
| Lucide React | ^0.563.0 | Icon library | Already installed; user locks at 24px standardization |
| React Router | ^7.13.0 | Client-side routing, `AnimatePresence` integration | Already in use for all 21 routes |

### Supporting (No New Dependencies Needed)
| Library | Version | Purpose | Notes |
|---------|---------|---------|-------|
| class-variance-authority | ^0.7.1 | Variant-based component styling | Already used in shadcn `Button` |
| tailwind-merge | ^3.4.0 | Safe className merging | Already used via `cn()` utility |
| clsx | ^2.1.1 | Conditional class composition | Already used via `cn()` utility |

### No New Dependencies Required
This phase requires zero new npm packages. Everything needed is already installed:
- Dark mode: Tailwind CSS v4 `@custom-variant dark` + CSS variables
- Page transitions: Framer Motion `AnimatePresence`
- Scroll-aware header: `useMotionValueEvent` from Framer Motion (already available)
- Mobile bottom nav: Custom component with Tailwind + Lucide icons
- Skeleton screens: Already have `Skeleton` shadcn component
- Empty states: Already have `EmptyState` shared component (needs enhancement)

## Architecture Patterns

### Current Layout Architecture
```
index.html (loads Inter + Playfair Display fonts)
  └── main.tsx (ConvexProvider → SessionProvider → AuthProvider)
      └── App.tsx (BrowserRouter → Routes)
          ├── /login → Login (no Layout wrapper)
          └── / → Layout.tsx (Header + <main class="container py-6"> + Outlet)
              ├── /kitchen → KitchenViewV2
              ├── /orders → OrderManager
              ├── /sales → SalesAnalytics
              └── ... (18 more routes)
```

### Recommended Layout Architecture (After Phase 9)
```
index.html (load brand fonts: Inter + friendly heading font)
  └── main.tsx (ThemeProvider → ConvexProvider → ...)
      └── App.tsx (BrowserRouter → Routes)
          ├── /login → Login (standalone, no Layout)
          └── / → Layout.tsx
              ├── Header (scroll-hide on mobile)
              ├── <main> with AnimatePresence page transitions
              │   └── PageContainer (max-w-[1400px], uniform px)
              │       └── Outlet (each page)
              ├── Footer (desktop)
              └── MobileBottomNav (mobile only, role-aware)
```

### Pattern 1: Dark Mode with Tailwind CSS v4

**What:** Use `@custom-variant` to support class-based dark mode toggling alongside `prefers-color-scheme`. Define all colors as CSS variables with light/dark pairs.

**How it works in the current codebase:**
The app already uses CSS variables for colors in `@theme {}` block in `index.css`. Currently there is NO dark mode — only light theme variables exist. Tailwind CSS v4 natively supports the `dark:` variant via `prefers-color-scheme`. To enable manual toggling (user's system preference + manual override), add:

```css
/* index.css — top of file */
@import "tailwindcss";
@custom-variant dark (&:where(.dark, .dark *));
```

Then define dark mode token overrides:
```css
/* Light theme tokens are in @theme {} */
/* Dark theme overrides: */
.dark {
  --color-background: hsl(222.2 84% 4.9%);
  --color-foreground: hsl(210 40% 98%);
  --color-card: hsl(222.2 84% 8%);
  --color-card-foreground: hsl(210 40% 98%);
  --color-primary: hsl(160 60% 45%);  /* green/teal accent */
  --color-primary-foreground: hsl(0 0% 100%);
  /* ... all other semantic tokens */
}
```

**Theme toggle mechanism:** Create a `ThemeProvider` context that:
1. Reads `localStorage` for saved preference
2. Falls back to `prefers-color-scheme` media query
3. Applies `.dark` class to `<html>` element
4. Provides `theme` and `setTheme` via context

### Pattern 2: Scroll-Hide Header

**What:** Header hides on scroll-down, shows immediately on scroll-up. Common mobile-friendly pattern.

**Implementation with Framer Motion:**
```typescript
// useScrollDirection.ts — custom hook
import { useState, useEffect, useRef } from 'react';

export function useScrollDirection() {
  const [isVisible, setIsVisible] = useState(true);
  const lastScrollY = useRef(0);
  const ticking = useRef(false);

  useEffect(() => {
    const updateScrollDir = () => {
      const scrollY = window.scrollY;
      // Always show at top
      if (scrollY < 10) {
        setIsVisible(true);
      } else if (scrollY > lastScrollY.current + 5) {
        setIsVisible(false); // scrolling down
      } else if (scrollY < lastScrollY.current - 5) {
        setIsVisible(true); // scrolling up
      }
      lastScrollY.current = scrollY;
      ticking.current = false;
    };

    const onScroll = () => {
      if (!ticking.current) {
        requestAnimationFrame(updateScrollDir);
        ticking.current = true;
      }
    };

    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  return isVisible;
}
```

```tsx
// Header.tsx update
import { motion } from 'framer-motion';
import { useScrollDirection } from '@/hooks/useScrollDirection';

export function Header() {
  const isVisible = useScrollDirection();

  return (
    <motion.header
      initial={{ y: 0 }}
      animate={{ y: isVisible ? 0 : -100 }}
      transition={{ duration: 0.2, ease: 'easeInOut' }}
      className="fixed top-0 z-50 w-full ..."
    >
      {/* existing header content */}
    </motion.header>
  );
}
```

**Note:** Current header uses `sticky top-0`. Must change to `fixed top-0` for scroll-hide to work properly, and add corresponding top padding to main content.

### Pattern 3: Page Transitions with AnimatePresence

**What:** Fade in/out between route changes.

**Implementation:**
```tsx
// Layout.tsx — wrap Outlet with AnimatePresence
import { AnimatePresence, motion } from 'framer-motion';
import { useLocation, Outlet } from 'react-router-dom';

export function Layout() {
  const location = useLocation();

  return (
    <div className="min-h-screen bg-background">
      <Header />
      <main className="pt-14"> {/* offset for fixed header */}
        <AnimatePresence mode="wait">
          <motion.div
            key={location.pathname}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
          >
            <PageContainer>
              <Outlet />
            </PageContainer>
          </motion.div>
        </AnimatePresence>
      </main>
      <Footer />
      <MobileBottomNav />
    </div>
  );
}
```

**Critical caveat with React Router v7:** `<Outlet />` does not naturally re-key on route change. The `key={location.pathname}` on the wrapper `motion.div` forces unmount/remount, which makes `AnimatePresence` exit animations work. However, this means each page fully remounts on navigation. For this app (Convex auto-caches queries), this is acceptable.

### Pattern 4: Mobile Bottom Tab Bar (Role-Aware)

**What:** Fixed bottom navigation on mobile screens (`md:hidden`), with items filtered by user role permissions.

**Recommended tab items by role:**

| Role | Tabs |
|------|------|
| `kitchen` | Kitchen, Packaging |
| `order_staff` | Orders, Kitchen, Packaging |
| `manager` | Sales, Orders, Kitchen, Inventory |
| `admin` | Sales, Orders, Kitchen, Inventory, More... |

The "More" tab opens a sheet/drawer with remaining items (Config, Admin sections).

```tsx
// MobileBottomNav.tsx
export function MobileBottomNav() {
  const { user, hasPermission } = useAuth();
  if (!user) return null;

  const tabs = [
    { path: '/sales', icon: TrendingUp, label: 'Sales', permission: 'canAccessSalesAnalytics' },
    { path: '/orders', icon: ShoppingCart, label: 'Orders', permission: 'canAccessOrders' },
    { path: '/kitchen', icon: UtensilsCrossed, label: 'Kitchen', permission: 'canAccessKitchen' },
    { path: '/inventory', icon: Warehouse, label: 'Inventory', permission: 'canAccessInventory' },
  ].filter(tab => hasPermission(tab.permission));

  return (
    <nav className="fixed bottom-0 inset-x-0 z-50 bg-background border-t md:hidden">
      <div className="flex items-center justify-around h-14 safe-area-bottom">
        {tabs.map(tab => (
          <NavLink key={tab.path} to={tab.path} ... />
        ))}
      </div>
    </nav>
  );
}
```

### Pattern 5: Uniform Page Container

**What:** Every page rendered inside `<Outlet />` should have consistent max-width, horizontal padding, and vertical spacing. Currently, `Layout.tsx` applies `container py-6` to `<main>`, but individual pages add their own `p-6`, `space-y-6`, `space-y-8`, or nothing — causing inconsistencies.

**Approach:** Create a `PageContainer` component and use it in `Layout.tsx` (not in each page), then remove per-page outer padding.

```tsx
// PageContainer.tsx
export function PageContainer({ children }: { children: React.ReactNode }) {
  return (
    <div className="mx-auto max-w-[1400px] px-4 sm:px-6 lg:px-8 py-6">
      {children}
    </div>
  );
}
```

### Anti-Patterns to Avoid
- **Hardcoded colors (`text-gray-900`, `bg-gray-100`):** Use semantic tokens (`text-foreground`, `bg-muted`). The codebase has many hardcoded grays that will break in dark mode.
- **Per-page padding wrappers:** Don't add `p-6` or `px-4` inside page components — let `PageContainer` in `Layout.tsx` handle uniform padding.
- **Custom inline title markup:** Don't use inline `<h1 className="text-3xl font-bold">` — use `PageHeader` component for consistency.
- **Direct `window.innerWidth` checks:** Only 1 file does this (OrderManager.tsx). Use Tailwind responsive classes (`md:hidden`, `lg:flex`) or a `useMediaQuery` hook instead.

## Current State Audit

### Page Wrapper Patterns (INCONSISTENT)
| Page | Outer Wrapper | Header Pattern | PageHeader Used? |
|------|--------------|----------------|-----------------|
| Dashboard | `space-y-8` | Custom hero section | No |
| SalesAnalytics | `p-6` | `<PageHeader>` | Yes |
| OrderManager | `space-y-4 md:space-y-6 pb-6` | Custom `<h1>` + terracotta underline | No |
| KitchenViewV2 | Custom full-height layout | Custom `<h1>` | No |
| K3MartCockpit | `space-y-6` | `<PageHeader>` | Yes |
| InventoryManager | (none — relies on Layout container) | `<PageHeader>` | Yes |
| IngredientsManager | `space-y-6` | Custom `<h1>` + Back button | No |
| MaterialsManager | `space-y-6` | Custom `<h1>` + Back button | No |
| MenuProductsManager | Custom | Custom `<h1>` | No |
| RecipeEditor | `space-y-6` | `<PageHeader>` with back | Yes |
| PackagingEditor | (relies on Layout) | `<PageHeader>` with back | Yes |
| ProductEditor | `space-y-6` | `<PageHeader>` with back | Yes |
| PackagingView | `space-y-6` | `<PageHeader>` | Yes |
| LocationsManager | `space-y-6` | `<PageHeader>` | Yes |
| ProductionComponentsManager | (relies on Layout) | `<PageHeader>` | Yes |
| UsersManager | (relies on Layout) | `<PageHeader>` | Yes |
| VouchersManager | (relies on Layout) | `<PageHeader>` | Yes |
| WhatsAppTemplatesManager | `p-6` | `<PageHeader>` | Yes |
| Login | Full-screen gradient | Custom brand header | N/A |
| OrderDetail | (relies on Layout) | `<PageHeader>` with back | Yes |
| RestockPlanner | `container py-6 space-y-6` | `<PageHeader>` | Yes |

### Title Size Inconsistencies
| Size | Pages |
|------|-------|
| `text-3xl font-bold` | IngredientsManager, MaterialsManager, Dashboard |
| `text-2xl font-bold` | PageHeader (standard), Login |
| `text-2xl sm:text-3xl` | MenuProductsManager |
| `text-2xl md:text-3xl` | OrderManager |
| `text-xl sm:text-2xl` | KitchenViewV2 |

### Hardcoded Color Usage (Will Break Dark Mode)
| Pattern | Occurrences | Fix |
|---------|-------------|-----|
| `text-gray-900` | Multiple pages | `text-foreground` |
| `text-gray-700` | Multiple pages | `text-foreground/80` |
| `bg-gray-100/200` | Multiple pages | `bg-muted` |
| `bg-white` | Several components | `bg-background` or `bg-card` |
| `border-gray-*` | Several components | `border-border` |

### Current Font Setup
- **Sans (body):** Inter (400, 500, 600) — loaded from Google Fonts in `index.html`
- **Heading:** Playfair Display (500, 600, 700) — loaded from Google Fonts, used only in OrderManager (`order-heading` class)
- **Monospace:** System default — used extensively in inventory dialogs, order numbers

**Recommendation for typography (Claude's discretion):**
- **Body/UI:** Keep Inter — it's clean, warm, highly readable, good for data-heavy UI
- **Heading:** Replace Playfair Display with **Nunito** or **DM Sans** — friendlier, rounded, matches "warm/approachable" direction better than a serif. Playfair Display is too formal/editorial for a snack brand app. Alternatively, use Inter with heavier weight (700-800) for headings to maintain font-loading simplicity.
- **Monospace:** Keep system default for order numbers and numeric inputs

### Existing Shared Components
| Component | Location | Status |
|-----------|----------|--------|
| `EmptyState` | `src/components/shared/EmptyState.tsx` | Exists but basic — icon + title + description + optional CTA. Needs enhancement for friendly illustration approach. |
| `LoadingState` | `src/components/shared/LoadingState.tsx` | Exists — `LoadingCards` (horizontal skeleton cards) and `LoadingPage`. Need page-specific skeleton variants. |
| `Skeleton` | `src/components/ui/skeleton.tsx` | Standard shadcn — `animate-pulse rounded-md bg-primary/10`. Works for dark mode. |
| `PageHeader` | `src/components/layout/PageHeader.tsx` | Exists — title, description, back button, action slot. Used by 15/21 pages. |
| `Layout` | `src/components/layout/Layout.tsx` | Basic shell — Header + `container py-6` main + feedback overlay. No footer, no mobile nav. |
| `Header` | `src/components/layout/Header.tsx` | Top nav with desktop links + mobile Sheet drawer. No scroll-hide. |

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Dark mode toggle | Custom localStorage + class toggling | `ThemeProvider` pattern (same as shadcn/ui docs) | Edge cases: SSR flash, system preference sync, media query listener cleanup |
| Scroll direction detection | Inline scroll listener in Header | `useScrollDirection` hook with `requestAnimationFrame` | Debouncing, passive listeners, cleanup, threshold tuning |
| CSS color system | Hardcoded hex values per-component | Tailwind CSS variables in `@theme` + `.dark` class override | Single source of truth, automatic `dark:` support, consistency |
| Responsive breakpoints | `window.innerWidth` checks | Tailwind responsive prefixes (`md:`, `lg:`) | SSR-safe, declarative, no layout thrashing |
| Contextual toasts | New toast system | Existing `actionToast.ts` (already implemented) | Already solves the "toast near click point" requirement |
| Page transition animation | Custom mount/unmount logic | Framer Motion `AnimatePresence` + `motion.div` | Handles exit animations, concurrent mode, key-based remounting |

**Key insight:** The existing codebase already has 90% of the tools needed. The work is standardization and enforcement, not building new infrastructure.

## Common Pitfalls

### Pitfall 1: Tailwind v4 Dark Mode Variable Scoping
**What goes wrong:** Defining dark mode variables inside `@theme {}` block instead of a `.dark` class. `@theme` variables are design tokens resolved at build time — they cannot be conditionally overridden at runtime.
**Why it happens:** Tailwind v4 changed from `tailwind.config.js` to CSS-first config. The `@theme` block looks like the right place for all theme values.
**How to avoid:** Define base (light) tokens in `@theme {}`. Define dark overrides in a `.dark {}` CSS rule that overrides the same CSS custom properties. The `@theme` block creates the token names; `.dark` overrides their values at runtime.
**Warning signs:** Colors not changing when `.dark` class is toggled on `<html>`.

### Pitfall 2: Fixed Header Height Coordination
**What goes wrong:** When changing header from `sticky` to `fixed` for scroll-hide behavior, page content slides under the header.
**Why it happens:** `sticky` keeps the element in document flow; `fixed` removes it. The `<main>` needs compensating top padding.
**How to avoid:** Add `pt-14` (56px = header height `h-14`) to main content wrapper. When mobile bottom nav is visible, add `pb-14` for bottom safe area.
**Warning signs:** Content hidden behind header on page load.

### Pitfall 3: AnimatePresence with React Router Outlet
**What goes wrong:** Exit animations don't fire because `<Outlet />` doesn't signal component removal to `AnimatePresence`.
**Why it happens:** `AnimatePresence` tracks direct children by `key`. `<Outlet />` always renders the same element; only its _content_ changes.
**How to avoid:** Wrap `<Outlet />` in a `motion.div` with `key={location.pathname}`. This forces a full remount on every route change, giving `AnimatePresence` the enter/exit lifecycle it needs.
**Warning signs:** Pages instantly swap with no animation; exit animation never plays.

### Pitfall 4: Hardcoded Colors Breaking Dark Mode
**What goes wrong:** Dark mode looks terrible because many components use `text-gray-900`, `bg-white`, `border-gray-200` instead of semantic tokens.
**Why it happens:** Original development didn't plan for dark mode. Developers used Tailwind color utilities directly.
**How to avoid:** Systematic audit using grep for `gray-`, `white`, `black` in className props. Replace with semantic tokens: `foreground`, `background`, `muted`, `border`, `card`, etc.
**Warning signs:** Text invisible on dark backgrounds, cards blending into page, borders disappearing.

### Pitfall 5: Mobile Bottom Nav Overlapping Content
**What goes wrong:** Bottom content on pages is hidden behind the fixed bottom nav bar.
**Why it happens:** Fixed positioning removes the nav from document flow.
**How to avoid:** Add bottom padding to `<main>` content area when on mobile: `pb-16 md:pb-0`. Also ensure modals/sheets have proper z-index layering above the bottom nav.
**Warning signs:** Last list items or action buttons cut off on mobile.

### Pitfall 6: KitchenView Has Custom Full-Height Layout
**What goes wrong:** Applying standard `PageContainer` max-width and padding breaks KitchenViewV2's swipeable 4-panel layout.
**Why it happens:** KitchenViewV2 is designed as a full-viewport mobile-first experience with custom swipe handling.
**How to avoid:** Allow opt-out from standard `PageContainer`. Use a `fullWidth` prop or a separate `FullWidthLayout` variant. KitchenViewV2 and possibly OrderManager (split-pane on desktop) need this escape hatch.
**Warning signs:** Kitchen view panels squeezed into narrow container, swipe gestures broken.

### Pitfall 7: Font Loading Performance
**What goes wrong:** Adding new Google Fonts or additional weights causes layout shift (FOUT/FOIT).
**Why it happens:** External font files take time to download.
**How to avoid:** Preconnect (already done in `index.html`), use `font-display: swap` (already in Google Fonts URL param `display=swap`), minimize font weight variants, consider using Inter for both body and headings to avoid loading a second font family.
**Warning signs:** Text flashing between system font and custom font on page load.

## Code Examples

### Theme Provider Context
```typescript
// src/contexts/ThemeContext.tsx
import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';

type Theme = 'light' | 'dark' | 'system';

interface ThemeContextType {
  theme: Theme;
  setTheme: (theme: Theme) => void;
  resolvedTheme: 'light' | 'dark';
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setTheme] = useState<Theme>(() => {
    const stored = localStorage.getItem('frollie-theme');
    return (stored as Theme) || 'system';
  });

  const [resolvedTheme, setResolvedTheme] = useState<'light' | 'dark'>('light');

  useEffect(() => {
    const root = document.documentElement;
    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');

    const applyTheme = () => {
      const resolved = theme === 'system'
        ? (mediaQuery.matches ? 'dark' : 'light')
        : theme;
      setResolvedTheme(resolved);
      root.classList.toggle('dark', resolved === 'dark');
    };

    applyTheme();
    localStorage.setItem('frollie-theme', theme);

    if (theme === 'system') {
      mediaQuery.addEventListener('change', applyTheme);
      return () => mediaQuery.removeEventListener('change', applyTheme);
    }
  }, [theme]);

  return (
    <ThemeContext.Provider value={{ theme, setTheme, resolvedTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useTheme must be used within ThemeProvider');
  return ctx;
}
```

### Green/Teal Accent Color Palette
```css
/* Recommended brand accent colors — derived from user's "fresh green/teal" direction */
/* Light theme */
@theme {
  /* Brand accent — fresh green/teal */
  --color-brand: #0D9488;           /* teal-600 — primary actions */
  --color-brand-dark: #0F766E;      /* teal-700 — hover state */
  --color-brand-darker: #115E59;    /* teal-800 — active/pressed */
  --color-brand-light: rgba(13, 148, 136, 0.1);  /* teal bg tint */
  --color-brand-muted: rgba(13, 148, 136, 0.05); /* subtle teal tint */

  /* Warm neutrals (Notion-style) */
  --color-warm-50: #FAFAF9;
  --color-warm-100: #F5F5F4;
  --color-warm-200: #E7E5E4;
  --color-warm-300: #D6D3D1;
  --color-warm-400: #A8A29E;
  --color-warm-500: #78716C;
  --color-warm-600: #57534E;
  --color-warm-700: #44403C;
  --color-warm-800: #292524;
  --color-warm-900: #1C1917;
}
```

### Sonner Dark Mode Integration
```tsx
// src/components/ui/sonner.tsx — updated for dark mode
import { Toaster as Sonner } from 'sonner';
import { useTheme } from '@/contexts/ThemeContext';

export function Toaster() {
  const { resolvedTheme } = useTheme();

  return (
    <Sonner
      position="top-center"
      richColors
      closeButton
      theme={resolvedTheme}
    />
  );
}
```

### Page-Specific Skeleton Example
```tsx
// Example: Table page skeleton (for Ingredients, Materials, etc.)
export function TablePageSkeleton() {
  return (
    <div className="space-y-6">
      {/* Header skeleton */}
      <div className="flex items-center justify-between">
        <div>
          <Skeleton className="h-8 w-48" />
          <Skeleton className="h-4 w-64 mt-2" />
        </div>
        <Skeleton className="h-10 w-32" />
      </div>
      {/* Search bar skeleton */}
      <Skeleton className="h-10 w-full max-w-md" />
      {/* Table rows skeleton */}
      <div className="space-y-3">
        {Array.from({ length: 5 }).map((_, i) => (
          <Skeleton key={i} className="h-16 w-full rounded-lg" />
        ))}
      </div>
    </div>
  );
}
```

## Discretion Recommendations

### Typography Selection
**Recommendation:** Use **Inter** for everything — body AND headings. Drop Playfair Display entirely.

**Rationale:**
1. Inter is already loaded and covers all needed weights (400-800)
2. Removes a second font download (Playfair Display = 3 weights = ~90KB)
3. Inter at weight 700-800 is distinctly different from weight 400-500, providing visual hierarchy
4. Matches "Notion-style" reference — Notion uses a single sans-serif family
5. "Warm/friendly" comes from rounded corners, spacing, and colors — not from a serif heading font

If a distinct heading font is desired, **Nunito** (Google Fonts, variable weight) is the best warm/rounded option. But I recommend starting with Inter-only and adding a heading font later if needed.

### Page Header Component Design
**Recommendation:** Enhance the existing `PageHeader` component to become the universal standard:
```tsx
interface PageHeaderProps {
  title: string;
  description?: string;
  backTo?: string;
  backLabel?: string;
  action?: ReactNode;       // existing
  children?: ReactNode;     // existing
  badge?: ReactNode;        // NEW: status badge next to title
  search?: ReactNode;       // NEW: search bar slot (below header)
}
```

All 21 pages should use `PageHeader`. The 6 pages with custom headers need migration.

### Bottom Tab Bar Items
**Recommendation based on role access patterns:**

| Role | Tab 1 | Tab 2 | Tab 3 | Tab 4 | Tab 5 |
|------|-------|-------|-------|-------|-------|
| `kitchen` | Kitchen | Packaging | — | — | — |
| `order_staff` | Orders | Kitchen | Packaging | — | — |
| `manager` | Sales | Orders | Kitchen | Inventory | More |
| `admin` | Sales | Orders | Kitchen | Inventory | More |

"More" opens a bottom sheet with: K3 Mart, Config (Production, WhatsApp), Admin (Products, Vouchers, Users).

Max 5 items to prevent crowding. Kitchen role gets only 2 items (clean, focused).

### Spacing Scale
**Recommendation:** Use Tailwind's default 4px-base scale, formalized:
- `4px` (1) — tight element gaps
- `8px` (2) — inline element spacing
- `12px` (3) — compact section gaps
- `16px` (4) — standard element gaps
- `24px` (6) — section spacing within page
- `32px` (8) — major section spacing
- `48px` (12) — page-level vertical rhythm

Standard page content gap: `space-y-6` (24px). No page should use `space-y-8` for main content (Dashboard currently does).

### Skeleton Screen Design
**Recommendation:** Create 3 skeleton templates that cover all 21 pages:
1. **TablePageSkeleton** — for list/table pages (Ingredients, Materials, Users, Vouchers, Locations, Components, Inventory)
2. **EditorPageSkeleton** — for editor pages (RecipeEditor, PackagingEditor, ProductEditor)
3. **DashboardSkeleton** — for card-heavy pages (Dashboard, SalesAnalytics, K3MartCockpit)

Each skeleton should use `animate-pulse` with `bg-muted` (warm gray shimmer in light mode, dark gray shimmer in dark mode).

### Empty State Illustrations
**Recommendation:** Use Lucide icons at large size (48px) inside a colored circle, paired with a friendly message. Do NOT commission custom illustrations — that's design debt for a fast-moving app.

Current `EmptyState` component is almost there. Enhance:
- Larger icon circle (96px diameter, `bg-muted/50`)
- Softer, warmer wording in descriptions
- Always include a CTA button
- Add subtle `opacity-60` to the icon for a gentler feel

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `tailwind.config.js` darkMode | `@custom-variant dark` in CSS | Tailwind CSS v4 (Jan 2025) | Config is now CSS-first |
| `prefers-color-scheme` only | Class-based `.dark` with system fallback | Best practice 2024+ | Manual toggle + system sync |
| `next-themes` for dark mode | Custom `ThemeProvider` (5-line context) | N/A for non-Next.js apps | No dependency needed |
| Hamburger menu on mobile | Bottom tab bar | 2023+ mobile UX pattern | Thumb-reachable navigation |
| `sticky` headers | Scroll-hide headers with `fixed` | 2023+ mobile pattern | More content visible while scrolling |

## Open Questions

1. **RestockPlanner page — legacy or active?**
   - What we know: RestockPlanner exists but `/restock` redirects to `/k3mart-cockpit`. It's still exported from `pages/index.ts`.
   - What's unclear: Should RestockPlanner be included in the 21-page audit or is it effectively dead code?
   - Recommendation: Include in audit but deprioritize. If it's unreachable via nav, document it as legacy.

2. **KitchenViewV2 and OrderManager — opt out of PageContainer?**
   - What we know: KitchenViewV2 uses a custom full-height swipeable layout. OrderManager uses a custom split-pane layout on desktop.
   - What's unclear: Should these pages use the standard `PageContainer` max-width or go full-width?
   - Recommendation: Allow an opt-out mechanism. These 2 pages should set `fullWidth` or use a different layout route group. The remaining 19 pages use standard `PageContainer`.

3. **Terracotta color usage — keep or replace?**
   - What we know: Terracotta (#E07856) is deeply embedded — 30+ custom CSS classes, order card hover effects, scrollbar styling, focus rings. The user wants "fresh green/teal" accent.
   - What's unclear: Is terracotta completely replaced by teal, or do some terracotta elements remain (e.g., kitchen station colors)?
   - Recommendation: Replace terracotta as the primary brand accent with teal. Keep kitchen station colors as-is (they're semantic, not brand). Phase the terracotta removal by first adding teal as `--color-brand`, then systematically replacing `terracotta` references.

4. **Login page — include in brand system or keep standalone?**
   - What we know: Login has its own full-screen gradient layout, custom header, and avatar-grid + PIN flow.
   - What's unclear: Should it adopt the brand color scheme (teal accents, warm grays) or remain a special case?
   - Recommendation: Apply brand colors and typography but keep the standalone layout (no header/footer/bottom nav since user is unauthenticated).

## Sources

### Primary (HIGH confidence)
- `/websites/tailwindcss` (Context7) — dark mode `@custom-variant`, `@theme` directive, container queries, breakpoints
- `/websites/motion_dev` (Context7) — `AnimatePresence`, `layoutId`, exit animations, page transitions
- `/websites/sonner_emilkowal_ski` (Context7) — Toaster position, theme, offsets, custom styling
- Codebase analysis — `src/index.css`, all 21 page files, layout components, shared components, `package.json`

### Secondary (MEDIUM confidence)
- Scroll-hide header pattern — widely documented pattern, implementation verified against Framer Motion API docs
- Mobile bottom tab bar UX pattern — established mobile design pattern (iOS/Android native apps)

### Tertiary (LOW confidence)
- None. All findings verified against codebase and official library documentation.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — all libraries already installed, versions verified from `package.json`
- Architecture: HIGH — patterns verified against codebase structure and library APIs
- Dark mode implementation: HIGH — Tailwind CSS v4 `@custom-variant` verified via Context7
- Page audit: HIGH — every page file read and categorized
- Pitfalls: HIGH — based on direct codebase observation (hardcoded colors, inconsistent wrappers)

**Research date:** 2026-02-14
**Valid until:** 2026-03-14 (stable — no dependency upgrades expected)
