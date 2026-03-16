# Phase 55: Help Center Infrastructure & Landing Page - Research

**Researched:** 2026-03-16
**Domain:** Frontend-only — React pages, reusable components, routing, navigation integration
**Confidence:** HIGH

## Summary

Phase 55 builds a Help Center landing page, a guide registry system, 7 reusable help components, and navigation integration. This is entirely frontend — no Convex backend changes. The codebase already has all necessary dependencies (React 19, Framer Motion, shadcn/ui Accordion via Radix, Lucide icons, Tailwind CSS 4 with CSS variable tokens). The primary work is creating new files and making small modifications to 3 existing files (Header.tsx, HubPage.tsx, App.tsx).

The key technical challenges are: (1) making the Header `NavItem` type compatible with a permission-free nav item, (2) implementing Intersection Observer for active section tracking in GuideLayout (no existing codebase pattern), and (3) building the SVG WorkflowDiagram with entrance animations.

**Primary recommendation:** Follow existing codebase patterns exactly — use the `containerVariants`/`cardVariants` stagger pattern from WhatsAppTemplatesManager.tsx for animations, the `AreaCard` interface pattern from HubPage.tsx for the hub card, and the `ProtectedRoute` auth-only gate (no props) pattern from ProtectedRoute.tsx for routing.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- Help Center is entirely frontend — no new Convex tables, queries, or mutations
- Guide registry (`src/lib/helpGuides.ts`) drives the landing page and router — data-driven, not hardcoded
- Guide components are eagerly imported (not lazy) since guide pages are purely static JSX with no Convex queries
- Adding a guide = (1) create component file, (2) update registry entry — no changes to HelpCenter.tsx, GuideRouter.tsx, App.tsx, or shared components
- New files: HelpCenter.tsx, GuideRouter.tsx, helpGuides.ts, WorkflowDiagram.tsx, StepCard.tsx, CalloutBox.tsx, FaqAccordion.tsx, RoleTag.tsx, GuideSection.tsx, GuideLayout.tsx, index.ts barrel
- Modified files: App.tsx (routes), HubPage.tsx (hub card), Header.tsx (nav item + mobile)
- Navigation: Header nav `{ path: '/help', label: 'Help', icon: CircleHelp }` — no permission, visible to all authenticated
- HubPage card: title "Help & Training", icon BookOpen, color text-sky-500, visible to all
- Routes: `<ProtectedRoute>` with no `requiredPermission` or `allowedRoles` props (auth-only)
- GuideConfig interface: id, title, description, icon, accentColor, sections, readTimeMinutes, status, isNew, component
- Search: case-insensitive String.includes across titles, section headings, FAQ text
- Ctrl+K focuses search input
- "Coming Soon" cards: opacity 0.5, non-interactive
- Staggered fade-up animation on page load (Framer Motion)
- No gradients — solid backgrounds, solid accent colors
- Guide content text-base (16px), max content width 720px
- WorkflowDiagram: fixed-layout SVG, vertical only, entrance animation (sequential node fade-in, then edge stroke-dashoffset)
- StepCard: numbered circle left, title + description right, optional tip/warning, vertical dotted line between
- CalloutBox: tip (green/Lightbulb), warning (amber/AlertTriangle), important (orange/Info)
- FaqAccordion: uses shadcn Accordion with FaqGroup/FaqItem
- RoleTag: "All Staff" gray, "Manager+" blue, "Admin Only" orange
- GuideSection: anchor ID + scroll-margin-top: 80px
- GuideLayout: sticky sidebar TOC (200px) desktop, horizontal scroll tabs mobile, Intersection Observer active section tracking

### Claude's Discretion
- Exact Tailwind classes for component styling (within design system constraints)
- SVG node positioning calculations for WorkflowDiagram
- Intersection Observer threshold values for active section tracking
- Search dropdown positioning and animation
- Exact Framer Motion variants and timing
- GuideLayout sidebar responsive breakpoint

### Deferred Ideas (OUT OF SCOPE)
- Print/PDF export — guides are web-only for now
- Versioning — guide content is hardcoded in components, versioned by git
- Contextual `?` buttons — per-page help buttons that deep-link to relevant guide sections
- Accessibility audit — WorkflowDiagram SVGs should include `role="img"` and `aria-label` (future)
- Lazy loading — switch to `lazy(() => import(...))` if guides grow to include data fetching
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| HELP-01 | Any authenticated user can access Help Center at `/help` | ProtectedRoute with no props = auth-only gate (verified in ProtectedRoute.tsx lines 36-47) |
| HELP-02 | Landing page displays guide cards in responsive grid with search | Existing grid pattern from HubPage (1/2/3 cols); search is pure JS String.includes over static registry |
| HELP-03 | Search filters guides and FAQ questions case-insensitively | Static data in helpGuides.ts registry; no backend needed |
| HELP-04 | Guide registry allows adding guides with one component + one registry entry | Data-driven architecture: HELP_GUIDES array in helpGuides.ts; GuideRouter does ID lookup |
| HELP-05 | "Coming Soon" cards dimmed (opacity 0.5) and non-interactive | Conditional className + pointer-events-none based on `status` field |
| HELP-06 | GuideRouter renders guide by guideId param or "Guide not found" | useParams pattern verified in OrderDetail.tsx; registry lookup by id |
| HELP-07 | Help Center linked from Header nav (desktop + mobile) and HubPage card | Header NavItem pattern and HubPage AreaCard pattern fully documented below |
| HELP-08 | Staggered fade-up animation on page load (Framer Motion) | containerVariants/cardVariants pattern from WhatsAppTemplatesManager.tsx |
| HCMP-01 | WorkflowDiagram renders fixed-layout SVG flowcharts | Custom SVG component with FlowNode/FlowEdge interfaces; no library needed |
| HCMP-02 | StepCard renders numbered steps with icon, title, description, optional tip/warning | New component; uses existing CalloutBox-like styling patterns |
| HCMP-03 | CalloutBox renders styled callouts: tip/warning/important | Uses existing CSS variable tokens for colors (status-success, status-warning) plus orange |
| HCMP-04 | FaqAccordion renders grouped Q&A using shadcn Accordion | shadcn Accordion component exists at `src/components/ui/accordion.tsx` (Radix-based) |
| HCMP-05 | RoleTag shows small badge for step roles | Badge component exists; RoleTag is a thin wrapper with role-specific colors |
| HCMP-06 | GuideSection provides anchor ID with scroll-margin-top for deep linking | CSS `scroll-margin-top: 80px` (no existing usage in codebase; header is 56px/h-14 but 80px gives buffer) |
| HCMP-07 | GuideLayout provides sticky sidebar TOC, horizontal scroll tabs mobile, Intersection Observer | No existing Intersection Observer usage — needs new `useActiveSection` hook |
</phase_requirements>

## Standard Stack

### Core (Already Installed)

| Library | Version | Purpose | Status |
|---------|---------|---------|--------|
| React | ^19.2.0 | UI framework | Installed |
| React Router | ^7.13.0 | Client-side routing (useParams, Link, Navigate) | Installed |
| Framer Motion | (installed) | Staggered card animations, entrance effects | Installed |
| Tailwind CSS | ^4.1.18 | Utility-first styling | Installed |
| shadcn/ui | (installed) | Accordion, Badge, Card components | Installed |
| Lucide React | (installed) | CircleHelp, BookOpen, CreditCard, ChefHat icons | Installed |
| @radix-ui/react-accordion | (installed) | Powers shadcn Accordion component | Installed |

### No New Dependencies Required

This phase requires zero new npm packages. Everything needed is already in the project.

**Installation:** None needed.

## Architecture Patterns

### Recommended Project Structure

```
src/
  pages/
    HelpCenter.tsx               # Landing page
    guides/
      GuideRouter.tsx            # Route → component lookup
  lib/
    helpGuides.ts                # GuideConfig[] registry
  components/
    help/
      WorkflowDiagram.tsx        # SVG flowchart
      StepCard.tsx               # Numbered step card
      CalloutBox.tsx             # Tip/warning/important callout
      FaqAccordion.tsx           # Grouped Q&A accordion
      RoleTag.tsx                # Role badge
      GuideSection.tsx           # Section wrapper with anchor
      GuideLayout.tsx            # Shared guide layout (TOC + content)
      index.ts                   # Barrel export
```

### Pattern 1: Header NavItem — Making `permission` Optional

**What:** The current `NavItem` type in Header.tsx requires `permission: PermissionKey`. Help Center has no permission restriction — it must be visible to all authenticated users.

**Current type:**
```typescript
type NavItem = {
  path: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  permission: PermissionKey;  // REQUIRED — problem for Help
  preload?: () => void;
};
```

**Solution:** Make `permission` optional and update the filter logic.

```typescript
type NavItem = {
  path: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  permission?: PermissionKey;  // Optional — undefined means "all authenticated"
  preload?: () => void;
};

// Updated filter (currently line 137):
const visibleMainItems = user
  ? mainNavItems.filter(item => !item.permission || hasPermission(item.permission))
  : [];
```

**Impact:** This is a non-breaking change. All existing nav items already provide `permission`, so their behavior is unchanged. Only the new Help item omits it.

**Confidence:** HIGH — verified by reading Header.tsx lines 68-76 and 136-138.

### Pattern 2: HubPage AreaCard — Existing Pattern

**What:** Adding Help & Training card to HubPage using the existing `AreaCard` interface.

**Exact interface (from HubPage.tsx):**
```typescript
interface AreaCard {
  title: string;
  description: string;
  icon: React.ComponentType<{ className?: string }>;
  color: string;
  primaryPath: string;
  links: NavLink[];
  visible: (hp: ReturnType<typeof useAuth>["hasPermission"]) => boolean;
}
```

**Implementation:**
```typescript
{
  title: "Help & Training",
  description: "Step-by-step guides and FAQs for using Frollie.",
  icon: BookOpen,
  color: "text-sky-500",
  primaryPath: "/help",
  links: [
    { label: "All Guides", path: "/help" },
    { label: "Expenses Guide", path: "/help/expenses" },
  ],
  visible: () => true,  // All authenticated roles
}
```

Also add to `LINK_ICONS` map:
```typescript
"All Guides": BookOpen,
"Expenses Guide": CreditCard,
```

**Confidence:** HIGH — directly matches existing pattern.

### Pattern 3: ProtectedRoute Auth-Only Gate

**What:** Using `<ProtectedRoute>` with no `requiredPermission` or `allowedRoles` props creates an auth-only gate.

**From ProtectedRoute.tsx (verified):**
```typescript
// Lines 36-47: allowedRoles check only runs IF allowedRoles is provided
if (allowedRoles && !hasRole(...allowedRoles)) { ... }
// Permission check only runs IF requiredPermission is provided
if (requiredPermission && !hasPermission(requiredPermission)) { ... }
// If neither is provided, it only checks isAuthenticated (line 32-34)
```

**Route setup:**
```typescript
<Route path="help" element={<ProtectedRoute><HelpCenter /></ProtectedRoute>} />
<Route path="help/:guideId" element={<ProtectedRoute><GuideRouter /></ProtectedRoute>} />
```

**Decision: Eager vs Lazy loading.** Per CONTEXT.md, guide pages are eagerly imported since they are purely static JSX. HelpCenter and GuideRouter should also be eagerly imported (they are lightweight pages with no Convex queries). This follows the same pattern as HubPage (eager import in App.tsx).

**Confidence:** HIGH — verified in ProtectedRoute.tsx source.

### Pattern 4: Framer Motion Staggered Animation

**What:** Staggered fade-up animation on the landing page card grid.

**Existing pattern (from WhatsAppTemplatesManager.tsx):**
```typescript
// Container controls stagger timing
const containerVariants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: { staggerChildren: 0.08 },
  },
};

// Each child card animates individually
const cardVariants = {
  hidden: { opacity: 0, y: 20, scale: 0.95 },
  visible: {
    opacity: 1,
    y: 0,
    scale: 1,
    transition: { type: "spring", stiffness: 300, damping: 24 },
  },
};

// Usage:
<motion.div variants={containerVariants} initial="hidden" animate="visible">
  {items.map(item => (
    <motion.div key={item.id} variants={cardVariants}>
      {/* card content */}
    </motion.div>
  ))}
</motion.div>
```

**For Help Center, simplify** — use linear ease instead of spring for a calmer feel:
```typescript
const cardVariants = {
  hidden: { opacity: 0, y: 16 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.3, ease: "easeOut" } },
};
```

**Confidence:** HIGH — direct copy of existing codebase pattern.

### Pattern 5: Intersection Observer for Active Section

**What:** No existing Intersection Observer usage in the codebase. Need to build a custom `useActiveSection` hook.

**Implementation pattern:**
```typescript
function useActiveSection(sectionIds: string[]): string | null {
  const [activeId, setActiveId] = useState<string | null>(null);

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        // Find the topmost visible section
        const visible = entries
          .filter(e => e.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
        if (visible.length > 0) {
          setActiveId(visible[0].target.id);
        }
      },
      {
        rootMargin: "-80px 0px -60% 0px",  // Account for header offset; bias toward top
        threshold: 0,
      }
    );

    sectionIds.forEach(id => {
      const el = document.getElementById(id);
      if (el) observer.observe(el);
    });

    return () => observer.disconnect();
  }, [sectionIds]);

  return activeId;
}
```

**rootMargin explanation:**
- `-80px` top: accounts for sticky header height (56px actual + 24px buffer, matching scroll-margin-top: 80px)
- `-60%` bottom: only the top 40% of viewport triggers activation, so sections activate as they reach the top

**Confidence:** MEDIUM — the Intersection Observer API is well-documented, but threshold/rootMargin values may need tuning during implementation. The pattern itself is standard React.

### Pattern 6: Barrel Export

**What:** `src/components/help/index.ts` follows the same pattern as other component directories.

**Existing pattern (from vouchers/index.ts):**
```typescript
export { VoucherCard } from "./VoucherCard";
export { OverrideCard } from "./OverrideCard";
// ...
```

**Help center barrel:**
```typescript
export { WorkflowDiagram } from "./WorkflowDiagram";
export { StepCard } from "./StepCard";
export { CalloutBox } from "./CalloutBox";
export { FaqAccordion } from "./FaqAccordion";
export { RoleTag } from "./RoleTag";
export { GuideSection } from "./GuideSection";
export { GuideLayout } from "./GuideLayout";
```

Also export TypeScript interfaces from the barrel where relevant.

**Confidence:** HIGH — exact match of existing pattern.

### Anti-Patterns to Avoid

- **Do NOT use `dark:` raw color classes for semantic colors.** Per CODE_STYLE.md, use CSS variable tokens (`var(--color-status-*)`) for any semantic color. For the new CalloutBox colors (green/amber/orange), use existing status tokens where they map (`--color-status-success` for green, `--color-status-warning` for amber). For orange ("important"), a new token pair may be needed OR use Tailwind's `text-orange-500`/`bg-orange-50` with `dark:` override since there is no existing orange status token.
- **Do NOT create lazy imports for help pages.** Per locked decision, guide pages are eagerly imported.
- **Do NOT add Convex queries/mutations.** This is frontend-only.
- **Do NOT use `canAccessKitchen` or any other permission as a proxy** for "all authenticated." Make `permission` optional in NavItem type.
- **Do NOT put `useActiveSection` inside GuideLayout directly.** Extract as a reusable hook (e.g., in `src/hooks/useActiveSection.ts` or co-located in the help components) for testability.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Accordion Q&A | Custom expand/collapse | shadcn `Accordion` (Radix-based) | Keyboard nav, ARIA attributes, animation built-in |
| Icon library | SVG icons as components | Lucide React (CircleHelp, BookOpen, Lightbulb, AlertTriangle, Info, CreditCard, ChefHat, etc.) | Consistent, tree-shakeable, already in project |
| Animation | Raw CSS transitions | Framer Motion (existing dependency) | Stagger orchestration, spring physics, AnimatePresence |
| Route protection | Custom auth checks | ProtectedRoute (existing component) | Consistent auth pattern across all routes |
| Badge styling | Custom spans | shadcn Badge (existing) for RoleTag base | Consistent typography and spacing |

## Common Pitfalls

### Pitfall 1: NavItem `permission` Type Mismatch
**What goes wrong:** Adding `{ path: '/help', label: 'Help', icon: CircleHelp }` without `permission` field causes TypeScript error because `permission` is required.
**Why it happens:** NavItem type was designed when all nav items had permissions.
**How to avoid:** Make `permission` optional in the type AND update the filter on line 137 to handle `undefined`.
**Warning signs:** TypeScript error on the new nav item, or using a random permission as a workaround.

### Pitfall 2: Mobile Menu Missing Help Link
**What goes wrong:** Adding Help to `mainNavItems` covers desktop nav but the mobile Sheet menu iterates over the same array — should work. However, the mobile menu sections (Financials, Depot, Config, Admin) are separate arrays. If Help is added as a separate section, it needs its own section header.
**Why it happens:** Desktop nav and mobile menu use the same `visibleMainItems` array, so adding to `mainNavItems` covers both. No separate mobile handling needed.
**How to avoid:** Add to `mainNavItems` array — it automatically appears in both desktop nav and the "Main items" section of mobile Sheet.
**Warning signs:** Help visible on desktop but not mobile, or vice versa.

### Pitfall 3: Scroll-Margin-Top Not Working
**What goes wrong:** Clicking a TOC link scrolls the section behind the sticky header.
**Why it happens:** No existing `scroll-margin-top` usage in the codebase. The header is `h-14` (56px) but `scroll-margin-top: 80px` provides comfortable buffer.
**How to avoid:** Apply `scroll-margin-top: 80px` as inline style or Tailwind class `scroll-mt-20` on each `GuideSection` wrapper.
**Warning signs:** Section headings partially hidden behind sticky header after anchor-link navigation.

### Pitfall 4: SVG viewBox and Responsiveness
**What goes wrong:** WorkflowDiagram SVG either overflows on mobile or is too small on desktop.
**Why it happens:** Fixed SVG width without responsive container.
**How to avoid:** Use `viewBox` attribute on `<svg>` and let it scale with container width. Set `width="100%"` and a fixed `viewBox` (e.g., `viewBox="0 0 400 600"`). The SVG will scale proportionally.
**Warning signs:** SVG has hardcoded `width`/`height` instead of `viewBox`.

### Pitfall 5: Search Dropdown Z-Index Conflict
**What goes wrong:** Search results dropdown appears behind other elements or under the header.
**Why it happens:** The sticky header is `z-50`. Search dropdown needs to be at least `z-50` relative to its container.
**How to avoid:** Position search dropdown with `absolute` + appropriate `z-index` (z-20 is fine within the page content area since nothing else competes).
**Warning signs:** Dropdown hidden behind adjacent content.

### Pitfall 6: Intersection Observer Cleanup
**What goes wrong:** Memory leak or stale active section after navigating away.
**Why it happens:** Observer not disconnected on unmount.
**How to avoid:** Return `observer.disconnect()` from the `useEffect` cleanup function.
**Warning signs:** Console warnings about state updates on unmounted component.

### Pitfall 7: Dark Mode for New Components
**What goes wrong:** CalloutBox green/amber/orange backgrounds look terrible in dark mode.
**Why it happens:** Using raw Tailwind colors like `bg-green-50` without dark variants.
**How to avoid:** For green and amber, use existing CSS variable tokens (`--color-status-success-bg`, `--color-status-warning-bg`). For orange (no existing token), either: (a) add new CSS variable tokens in index.css for callout-important, or (b) use `bg-orange-50 dark:bg-orange-950/40` as a one-off since it's a purpose-built component (not a semantic status). The design spec specifically lists `dark:orange-950` as the dark background.
**Warning signs:** Blinding white/light backgrounds in dark mode.

## Code Examples

### Guide Registry (src/lib/helpGuides.ts)

```typescript
// Source: CONTEXT.md locked decision
import { CreditCard, ChefHat, Package, Wallet, UtensilsCrossed, BarChart3 } from "lucide-react";
import type { ComponentType } from "react";

export interface GuideSection {
  id: string;
  title: string;
  role?: "all" | "manager" | "admin";
}

export interface GuideConfig {
  id: string;
  title: string;
  description: string;
  icon: ComponentType<{ className?: string }>;
  accentColor: string;
  sections: GuideSection[];
  readTimeMinutes: number;
  status: "live" | "coming-soon";
  isNew?: boolean;
  component?: ComponentType;
}

export const HELP_GUIDES: GuideConfig[] = [
  {
    id: "expenses",
    title: "Expenses, Reimbursements & Payroll",
    description: "Submit claims, approve expenses, batch reimbursements, record payroll, and see how it all flows to the P&L.",
    icon: CreditCard,
    accentColor: "orange",
    sections: [
      { id: "overview", title: "Overview", role: "all" },
      { id: "submitting", title: "Submitting an Expense", role: "all" },
      // ... remaining sections
    ],
    readTimeMinutes: 15,
    status: "live",
    isNew: true,
    // component: ExpenseGuide — will be set in Phase 56
  },
  // Coming-soon entries with status: "coming-soon", empty sections, no component
];
```

### GuideRouter Pattern (src/pages/guides/GuideRouter.tsx)

```typescript
// Source: existing useParams pattern from OrderDetail.tsx
import { useParams, Link } from "react-router-dom";
import { FileQuestion } from "lucide-react";
import { HELP_GUIDES } from "@/lib/helpGuides";

export function GuideRouter() {
  const { guideId } = useParams<{ guideId: string }>();
  const guide = HELP_GUIDES.find(g => g.id === guideId);

  if (!guide || !guide.component) {
    return (
      <div className="flex flex-col items-center justify-center py-24 text-center">
        <FileQuestion className="h-12 w-12 text-muted-foreground mb-4" />
        <h2 className="text-lg font-semibold mb-2">Guide not found</h2>
        <p className="text-sm text-muted-foreground mb-6">
          The guide you're looking for doesn't exist or isn't available yet.
        </p>
        <Link to="/help" className="text-sm text-primary hover:underline">
          Back to Help Center
        </Link>
      </div>
    );
  }

  const Component = guide.component;
  return <Component />;
}
```

### FaqAccordion Using shadcn Accordion

```typescript
// Source: shadcn Accordion API from src/components/ui/accordion.tsx
import {
  Accordion,
  AccordionItem,
  AccordionTrigger,
  AccordionContent,
} from "@/components/ui/accordion";

interface FaqItem {
  question: string;
  answer: string | React.ReactNode;
}

interface FaqGroup {
  title: string;
  items: FaqItem[];
}

export function FaqAccordion({ groups }: { groups: FaqGroup[] }) {
  return (
    <div className="space-y-8">
      {groups.map((group, gi) => (
        <div key={gi}>
          <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-3">
            {group.title}
          </h3>
          <Accordion type="single" collapsible className="w-full">
            {group.items.map((item, ii) => (
              <AccordionItem key={ii} value={`${gi}-${ii}`}>
                <AccordionTrigger>{item.question}</AccordionTrigger>
                <AccordionContent>
                  {typeof item.answer === "string" ? (
                    <p className="text-muted-foreground">{item.answer}</p>
                  ) : (
                    item.answer
                  )}
                </AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        </div>
      ))}
    </div>
  );
}
```

### SVG WorkflowDiagram — Node Rendering Pattern

```typescript
// Source: Design spec + standard React SVG patterns
interface FlowNode {
  id: string;
  label: string;
  color: "gray" | "blue" | "green" | "amber" | "red" | "orange";
  x: number;
  y: number;
  description?: string;
}

const NODE_COLORS: Record<FlowNode["color"], { fill: string; stroke: string; text: string }> = {
  gray:   { fill: "#F3F4F6", stroke: "#9CA3AF", text: "#374151" },
  blue:   { fill: "#DBEAFE", stroke: "#3B82F6", text: "#1D4ED8" },
  green:  { fill: "#D1FAE5", stroke: "#10B981", text: "#065F46" },
  amber:  { fill: "#FEF3C7", stroke: "#F59E0B", text: "#92400E" },
  red:    { fill: "#FEE2E2", stroke: "#EF4444", text: "#991B1B" },
  orange: { fill: "#FFEDD5", stroke: "#F97316", text: "#9A3412" },
};

// Each node rendered as a rounded rect with text
function FlowNodeSVG({ node, index }: { node: FlowNode; index: number }) {
  const colors = NODE_COLORS[node.color];
  const width = 160;
  const height = 40;

  return (
    <g style={{ opacity: 0, animation: `fadeIn 0.3s ease ${index * 0.1}s forwards` }}>
      <rect
        x={node.x - width / 2}
        y={node.y - height / 2}
        width={width}
        height={height}
        rx={8}
        fill={colors.fill}
        stroke={colors.stroke}
        strokeWidth={1.5}
      />
      <text
        x={node.x}
        y={node.y + 1}
        textAnchor="middle"
        dominantBaseline="middle"
        fill={colors.text}
        fontSize={13}
        fontWeight={500}
      >
        {node.label}
      </text>
    </g>
  );
}
```

**Dark mode note:** SVG node colors are hardcoded (not theme tokens). For dark mode, consider adding a `.dark` CSS selector that adjusts fill/stroke via CSS, or conditionally pass dark color sets using the existing `useTheme()` hook. Given the design spec says "optimized for light mode; dark mode inherits existing app theme tokens," the simplest approach is to keep the SVG colors as-is and add a subtle `bg-muted` container that provides contrast in both modes.

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Raw Tailwind dark: classes | CSS variable tokens | v1.6 (Phase 38) | Use tokens for semantic colors; see CODE_STYLE.md |
| React.lazy for all pages | lazyWithPreload + selective eager | v1.6 (Phase 39) | Help pages should be eager (no Convex queries) |
| Permission required on all nav items | Permission optional (new in this phase) | v1.8 (Phase 55) | Enables auth-only nav items |

## Open Questions

1. **Orange "important" callout dark mode tokens**
   - What we know: Existing CSS variable tokens cover green (success) and amber (warning) but NOT orange
   - What's unclear: Whether to add new `--color-callout-important` / `--color-callout-important-bg` tokens to index.css, or use raw Tailwind `bg-orange-50 dark:bg-orange-950/40`
   - Recommendation: Add CSS variable tokens in index.css for consistency. It's a small cost (4 lines) for architectural cleanliness. However, since the design spec explicitly provides `dark:orange-950` as the dark background, using raw Tailwind is also acceptable for this purpose-built component.

2. **WorkflowDiagram dark mode SVG colors**
   - What we know: SVG fill/stroke colors are typically hardcoded hex values, not CSS variable references
   - What's unclear: Whether to use `currentColor` with CSS classes or hardcoded colors with theme-aware switching
   - Recommendation: Use hardcoded light-mode colors. The WorkflowDiagram sits inside a card with `bg-card` background which provides adequate contrast in both modes. If needed, add a `dark:invert` utility or use `useTheme()` to swap palettes — but start simple.

3. **Intersection Observer rootMargin tuning**
   - What we know: Header is 56px (`h-14`), scroll-margin-top is 80px
   - What's unclear: Exact rootMargin values for best UX
   - Recommendation: Start with `-80px 0px -60% 0px` and adjust based on testing

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | Vitest ^4.0.18 + jsdom |
| Config file | `vitest.config.ts` |
| Quick run command | `npm run test -- --reporter=verbose` |
| Full suite command | `npm run test` |

### Phase Requirements to Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| HELP-01 | Auth-only route access | manual-only | N/A — ProtectedRoute already tested | N/A |
| HELP-02 | Guide cards render in grid | unit | `npx vitest run tests/unit/helpCenter.test.tsx -x` | Wave 0 |
| HELP-03 | Search filters guides and FAQ | unit | `npx vitest run tests/unit/helpSearch.test.ts -x` | Wave 0 |
| HELP-04 | Registry-driven guide discovery | unit | `npx vitest run tests/unit/helpGuides.test.ts -x` | Wave 0 |
| HELP-05 | Coming-soon cards dimmed | unit | `npx vitest run tests/unit/helpCenter.test.tsx -x` | Wave 0 |
| HELP-06 | GuideRouter renders or 404 | unit | `npx vitest run tests/unit/guideRouter.test.tsx -x` | Wave 0 |
| HELP-07 | Nav integration | manual-only | N/A — visual verification | N/A |
| HELP-08 | Staggered animation | manual-only | N/A — animation is visual | N/A |
| HCMP-01 | WorkflowDiagram renders nodes/edges | unit | `npx vitest run tests/unit/workflowDiagram.test.tsx -x` | Wave 0 |
| HCMP-02 | StepCard renders step content | unit | `npx vitest run tests/unit/helpComponents.test.tsx -x` | Wave 0 |
| HCMP-03 | CalloutBox renders per type | unit | `npx vitest run tests/unit/helpComponents.test.tsx -x` | Wave 0 |
| HCMP-04 | FaqAccordion expands/collapses | unit | `npx vitest run tests/unit/helpComponents.test.tsx -x` | Wave 0 |
| HCMP-05 | RoleTag displays correct labels | unit | `npx vitest run tests/unit/helpComponents.test.tsx -x` | Wave 0 |
| HCMP-06 | GuideSection has anchor + scroll-margin | unit | `npx vitest run tests/unit/helpComponents.test.tsx -x` | Wave 0 |
| HCMP-07 | GuideLayout renders TOC | unit | `npx vitest run tests/unit/guideLayout.test.tsx -x` | Wave 0 |

### Sampling Rate
- **Per task commit:** `npx vitest run tests/unit/helpComponents.test.tsx tests/unit/helpCenter.test.tsx -x`
- **Per wave merge:** `npm run test`
- **Phase gate:** Full suite green before `/gsd:verify-work`

### Wave 0 Gaps
- [ ] `tests/unit/helpComponents.test.tsx` — covers HCMP-01 through HCMP-06
- [ ] `tests/unit/helpCenter.test.tsx` — covers HELP-02, HELP-03, HELP-05
- [ ] `tests/unit/helpGuides.test.ts` — covers HELP-04 (registry structure)
- [ ] `tests/unit/guideRouter.test.tsx` — covers HELP-06
- [ ] `tests/unit/guideLayout.test.tsx` — covers HCMP-07

Note: These are relatively simple component tests since all help center components are pure frontend with no Convex queries. Tests can use `@testing-library/react` for render assertions.

## Sources

### Primary (HIGH confidence)
- `src/components/layout/Header.tsx` — NavItem type, mainNavItems array, mobile Sheet menu, filter logic
- `src/pages/HubPage.tsx` — AreaCard interface, HUB_AREAS array, LINK_ICONS map, AreaNavCard component
- `src/App.tsx` — Routing pattern, ProtectedRoute usage, eager vs lazy imports
- `src/components/auth/ProtectedRoute.tsx` — Auth-only gate behavior (no props = auth-only)
- `src/components/ui/accordion.tsx` — shadcn Accordion API (Radix-based)
- `src/lib/types.ts` — ROLE_PERMISSIONS structure, PermissionKey type
- `docs/CODE_STYLE.md` — Dark mode token pattern, CSS variable usage requirement
- `src/index.css` — CSS variable tokens (status, role, brand colors), dark mode overrides
- `src/pages/WhatsAppTemplatesManager.tsx` — containerVariants/cardVariants stagger pattern
- `src/components/whatsappTemplates/TemplateCard.tsx` — cardVariants animation pattern
- `docs/superpowers/specs/2026-03-16-help-center-design.md` — Full design spec

### Secondary (MEDIUM confidence)
- Intersection Observer API — standard browser API, well-documented on MDN
- SVG rendering in React — standard pattern, no library dependencies

### Tertiary (LOW confidence)
- Intersection Observer rootMargin values — will need tuning during implementation

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — all dependencies already installed, no new packages
- Architecture: HIGH — directly follows existing codebase patterns (Header, HubPage, App, ProtectedRoute)
- Pitfalls: HIGH — identified through direct source code analysis of existing patterns
- Intersection Observer: MEDIUM — standard API but no existing codebase usage to reference
- SVG WorkflowDiagram dark mode: MEDIUM — may need iteration

**Research date:** 2026-03-16
**Valid until:** 2026-04-16 (stable — frontend-only, no external API dependencies)
