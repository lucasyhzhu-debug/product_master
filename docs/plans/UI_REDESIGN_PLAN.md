# DESIGNER_WORKFLOW - Figma Design Handoff System

> **Status**: Planned (not yet implemented)
> **Created**: 2026-02-04
> **Effort**: ~12-16 hours total
> **Prerequisites**: None (can be executed independently)

---

## Executive Summary

Set up a bidirectional design workflow between code and Figma:
1. **Code → Figma**: Export current UI for designer to redesign
2. **Figma → Code**: Import redesigned components back into codebase

### Tools Overview

| Tool | Purpose | Native? | Account Needed? | Cost |
|------|---------|---------|-----------------|------|
| **Storybook** | Component gallery (local dev tool) | No (npm) | No | Free |
| **Chromatic** | Hosts Storybook online for designer | No (external) | Yes | Free tier |
| **Design Tokens** | Design decisions as JSON data | Partial | No | Free |
| **Tokens Studio** | Figma plugin for token sync | No (Figma) | Yes (Figma) | Free tier |
| **Style Dictionary** | Converts tokens to CSS | No (npm) | No | Free |

---

## Component Inventory (~70 components)

| Category | Count | Storybook Priority |
|----------|-------|-------------------|
| shadcn/ui Base | 21 | Medium |
| Shared Utilities | 8 | High |
| Card Components | 5 | High |
| **Order Management** | **20+** | **Critical** |
| Layout | 3 | High |
| Auth | 3 | Low |
| Dashboard | 2 | Medium |
| Feedback | 6 | Low |
| Onboarding | 1 | Low |
| Menu Products | 1 | Low |

### Critical Design Tokens (from `src/index.css`)
- **Colors**: HSL-based system (primary, secondary, destructive, muted)
- **Ball colors**: Pistachio `#93C572`, Chocolate `#7B3F00`
- **Radius**: lg=8px, md=6px, sm=4px
- **Status colors**: Empty=gray, Filling=orange, Filled=yellow, Packed=green

---

## Implementation Phases

### Phase 1: Storybook Setup (Foundation)
**Effort**: 2-3 hours

```bash
npx storybook@latest init
npm install --save-dev @storybook/addon-themes chromatic
```

**Files to create/modify:**
- `.storybook/main.ts` - Vite compatibility, addons
- `.storybook/preview.ts` - Import Tailwind, theme decorator
- `package.json` - New scripts

---

### Phase 2: Priority Component Stories
**Effort**: 4-6 hours

#### Tier 1 (Critical - Order Management)
- [ ] `src/components/orders/ProductPackage.stories.tsx` - 4 status states
- [ ] `src/components/orders/InventoryTray.stories.tsx` - Ball display
- [ ] `src/components/orders/FlyingBall.stories.tsx` - Animation preview
- [ ] `src/components/orders/OrderForm.stories.tsx` - Complex form states
- [ ] `src/components/orders/ChannelBadge.stories.tsx` - All channel variants

#### Tier 2 (High - Shared Components)
- [ ] `src/components/shared/Carousel.stories.tsx` - Scroll, empty states
- [ ] `src/components/shared/CostTooltip.stories.tsx` - Cost breakdown
- [ ] `src/components/shared/TagFilterBar.stories.tsx` - Filter interactions
- [ ] `src/components/shared/ConfirmDialog.stories.tsx` - Variants
- [ ] `src/components/shared/EmptyState.stories.tsx` - Icon + message

#### Tier 3 (High - Cards)
- [ ] `src/components/recipes/RecipeCard.stories.tsx` - Data display
- [ ] `src/components/products/ProductCard.stories.tsx` - Margin colors
- [ ] `src/components/packaging/PackagingCard.stories.tsx` - Version display

---

### Phase 3: Design Token Export
**Effort**: 2-3 hours

**Files to create:**
```
tokens/
├── colors.json      # HSL color system
├── spacing.json     # Tailwind spacing scale
├── typography.json  # Font families, sizes
├── radius.json      # Border radius tokens
├── brand.json       # Ball colors, status colors
└── README.md        # Sync instructions
```

---

### Phase 4: Designer Handoff Package
**Effort**: 1-2 hours

**Files to create:**
- `docs/design-handoff/README.md` - Instructions for designer
- `docs/design-handoff/component-inventory.md` - Component list with states

**Deliverables to designer:**
1. Chromatic URL (live Storybook)
2. Design tokens JSON
3. Screenshot package (all pages/states)
4. Component inventory document

---

### Phase 5: Figma → Code Integration
**Effort**: 2-3 hours

**Files to create:**
- `style-dictionary.config.js` - Token transformation config
- `.github/workflows/chromatic.yml` - Storybook deployment
- `.github/workflows/tokens.yml` - Token transformation CI

**Style Dictionary config:**
```js
module.exports = {
  source: ['tokens/**/*.json'],
  platforms: {
    css: {
      transformGroup: 'css',
      buildPath: 'src/styles/',
      files: [{ destination: 'tokens.css', format: 'css/variables' }]
    }
  }
}
```

**Chromatic CI** (`.github/workflows/chromatic.yml`):
```yaml
name: Chromatic
on: push
jobs:
  chromatic:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0
      - uses: actions/setup-node@v4
      - run: npm ci
      - run: npx chromatic --project-token=${{ secrets.CHROMATIC_TOKEN }}
```

---

## Full Workflow Diagram

```
┌─────────────────────────────────────────────────────────────────┐
│                    CODE → FIGMA (Current UI)                    │
├─────────────────────────────────────────────────────────────────┤
│  1. Storybook documents all components                          │
│  2. Chromatic hosts live Storybook                              │
│  3. Design tokens exported to tokens/ folder                    │
│  4. Designer imports tokens via Tokens Studio                   │
│  5. Designer browses Chromatic for component reference          │
└─────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│                    DESIGNER WORKS IN FIGMA                      │
├─────────────────────────────────────────────────────────────────┤
│  • Uses shadcn/ui Figma kit as base                             │
│  • Full visual refresh (colors, typography, spacing)            │
│  • Updates tokens in Tokens Studio                              │
│  • Creates component specs in Figma Dev Mode                    │
└─────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│                    FIGMA → CODE (New Design)                    │
├─────────────────────────────────────────────────────────────────┤
│  1. Tokens Studio auto-syncs to GitHub (tokens/ folder)         │
│  2. GitHub Action runs Style Dictionary                         │
│  3. CSS variables regenerated in src/styles/tokens.css          │
│  4. Developer updates Tailwind/component styles                 │
│  5. Chromatic shows visual diff for review                      │
└─────────────────────────────────────────────────────────────────┘
```

---

## Designer Instructions

### What Designer Receives:
1. Storybook URL (live component playground)
2. Design tokens JSON (colors, spacing, typography)
3. Screenshot package (all pages/states)
4. Component inventory document

### What Designer Should Deliver:
1. **Figma file with Dev Mode enabled**
2. **Updated tokens via Tokens Studio** (synced to GitHub)
3. **Component specifications** per component
4. **Responsive breakpoints** (mobile, tablet, desktop)

### Constraints for Designer:
- Use shadcn/ui Figma kit as base (maintains component structure)
- Keep same component hierarchy (don't restructure)
- Focus on visual styling, not structural changes
- Document any new components needed

---

## File Changes Summary

### New Files:
```
.storybook/
├── main.ts
├── preview.ts

src/components/*/
├── [Component].stories.tsx (13 priority stories)

tokens/
├── colors.json
├── spacing.json
├── typography.json
├── radius.json
├── brand.json
├── README.md

docs/design-handoff/
├── README.md
├── component-inventory.md

style-dictionary.config.js

.github/workflows/
├── chromatic.yml        # Storybook deploy
├── tokens.yml           # Token transformation
```

### Modified Files:
```
package.json
  + "storybook": "storybook dev -p 6006"
  + "build-storybook": "storybook build"
  + "chromatic": "chromatic"
  + "tokens": "style-dictionary build"
```

---

## Verification Checklist

1. [ ] **Storybook working**: `npm run storybook` opens at localhost:6006
2. [ ] **All priority stories render**: Check 13 component stories
3. [ ] **Tokens export valid**: JSON validates, Figma can import
4. [ ] **Handoff doc complete**: Designer can understand current UI
5. [ ] **Token sync works**: Change in Figma → GitHub push → CSS update
6. [ ] **Chromatic deployed**: Designer can access URL

---

## Decisions Made

| Question | Decision |
|----------|----------|
| **Storybook hosting** | Chromatic (free tier, visual regression testing) |
| **Token sync** | Tokens Studio → GitHub (auto-sync) |
| **Redesign scope** | Full visual refresh (colors, typography, spacing, styling) |

---

## External Accounts Required

1. **Chromatic** (chromatic.com) - Sign up, create project, get token
2. **Tokens Studio** (tokens.studio) - Designer installs Figma plugin
3. **GitHub Secrets** - Add `CHROMATIC_TOKEN` to repo secrets

---

## How to Execute This Plan

Run this command to start implementation:
```
"Execute the DESIGNER_WORKFLOW plan in docs/plans/DESIGNER_WORKFLOW.md"
```

Or phase-by-phase:
```
"Execute Phase 1 (Storybook Setup) from DESIGNER_WORKFLOW plan"
```
