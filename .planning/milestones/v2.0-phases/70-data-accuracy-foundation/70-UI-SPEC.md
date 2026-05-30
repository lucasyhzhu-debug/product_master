# Phase 70: Data Accuracy Foundation - UI Design Contract

---
status: draft
phase: 70
name: data-accuracy-foundation
created: 2026-04-10
---

## Summary

Phase 70 modifies three existing pages (SalesAnalytics SettingsTab, MenuProductsManager, UsersManager). No new pages or routes. All changes are additive extensions of existing UI patterns. The visual footprint is small: one sync button upgrade, one inline-editable column, and one dialog section expansion.

## Design System Detection

| Property | Value | Source |
|----------|-------|--------|
| Tool | shadcn/ui (no `components.json` -- manual installation) | Codebase grep |
| Styling | Tailwind CSS v4 via `@theme` block in `src/index.css` | `src/index.css` lines 1-133 |
| Font | Inter, system-ui fallback | `--font-sans` in `src/index.css` line 6 |
| Icons | Lucide React | Import statements across all pages |
| Toasts | Sonner (`toast.success`, `toast.error`) | Import statements across all pages |
| Theme | Light + dark mode via `.dark` class variant | `src/index.css` lines 136-243 |

## Spacing

8-point grid scale (existing project convention):

| Token | Value | Usage in this phase |
|-------|-------|---------------------|
| `gap-1` | 4px | Icon-to-text spacing in badges |
| `gap-2` | 8px | Form field internal spacing, grid gaps |
| `gap-3` | 12px | Stats grid gaps (existing MenuProductsManager pattern) |
| `gap-4` | 16px | Card padding, dialog section spacing |
| `space-y-4` | 16px | Vertical stacking in dialog form groups |
| `space-y-6` | 24px | Page-level section spacing |
| `py-4` | 16px | Dialog body padding (existing pattern) |
| `pt-2` | 8px | Separator spacing above action buttons |

No exceptions needed for this phase. All touch targets are standard form inputs (44px+ height via shadcn defaults).

## Typography

Existing project typography (no changes needed for this phase):

| Level | Size | Weight | Line Height | Usage |
|-------|------|--------|-------------|-------|
| Page title | 20px (`text-xl`) | 600 (semibold) | 1.2 | PageHeader title |
| Card title | 16px (`text-base`) | 600 (semibold) | 1.2 | CardTitle, dialog headers |
| Body | 14px (`text-sm`) | 400 (normal) | 1.5 | Form labels, descriptions, table cells |
| Caption | 12px (`text-xs`) | 400 (normal) | 1.5 | Badge text, muted descriptions, status indicators |

Font weights: 400 (normal) and 600 (semibold) only.

## Color

60/30/10 split (existing project convention, no changes):

| Allocation | Color | CSS Variable | Elements |
|------------|-------|-------------|----------|
| 60% dominant | White / Dark bg | `--color-background` | Page background, dialog background |
| 30% secondary | Muted gray | `--color-card`, `--color-muted` | Card surfaces, form input backgrounds, muted text |
| 10% accent | Teal `#0D9488` | `--color-brand`, `--color-primary` | Primary buttons, focus rings, active states |

### Semantic colors used in this phase

| Purpose | Light Mode | Dark Mode | CSS Variable | Elements |
|---------|-----------|-----------|-------------|----------|
| Success feedback | `#059669` | `#34D399` | `--color-status-success` | Sync success toast, COGS override active indicator |
| Warning | `#D97706` | `#FBBF24` | `--color-status-warning` | Stale cost spinner (existing) |
| Error/destructive | `#DC2626` | `#F87171` | `--color-status-error`, `--color-destructive` | Sync error toast, validation errors |
| Info | `#2563EB` | `#60A5FA` | `--color-status-info` | "Auto (BOM)" placeholder text tint |
| Muted foreground | `hsl(215.4 16.3% 46.9%)` | `hsl(215 16% 57%)` | `--color-muted-foreground` | Placeholder text, secondary labels |

### COGS Override Visual Treatment

When `cogsOverrideIdr` is set on a menu product, the COGS display cell uses a distinct visual to signal "override active, not BOM-calculated":

- **Override active:** Display the override value in `text-foreground` with a small `Badge variant="secondary"` reading "Override" next to the formatted currency value. Background: `bg-amber-50 dark:bg-amber-900/20` on the cell/badge area.
- **Override not set (BOM fallback):** Display BOM-calculated `unitCost` value as-is (existing behavior). Show muted placeholder "Auto (BOM)" text in the editable area when cell is focused/hovered for editing.

## Component Inventory

### Existing Components (reuse as-is)

| Component | Import Path | Used Where in Phase 70 |
|-----------|-------------|----------------------|
| `Button` | `@/components/ui/button` | Sync trigger, dialog actions |
| `Input` | `@/components/ui/input` | COGS override field, employee fields (hireDate, salary, bank name) |
| `Label` | `@/components/ui/label` | Form field labels in edit dialog |
| `Dialog` / `DialogContent` / `DialogHeader` / `DialogTitle` / `DialogDescription` / `DialogFooter` | `@/components/ui/dialog` | UsersManager edit dialog expansion |
| `Card` / `CardContent` / `CardHeader` / `CardTitle` | `@/components/ui/card` | MenuProductsManager product cards |
| `Badge` | `@/components/ui/badge` | "Override" indicator on COGS |
| `Skeleton` | `@/components/ui/skeleton` | Loading states (existing) |
| `PageHeader` | `@/components/layout/PageHeader` | Page titles (existing) |
| `PlatformSyncPanel` | `@/components/salesAnalytics/PlatformSyncPanel` | Internal sync expanded section (existing) |
| `IntegrationHealthCard` | `@/components/salesAnalytics/IntegrationHealthCard` | Platform health (existing) |
| `toast` (Sonner) | `sonner` | Success/error feedback |

### New Components

None. All UI changes are inline modifications to existing components.

### Third-Party Registry

None. No third-party shadcn registries used.

## Copywriting

### DA-01/DA-02: Revenue Sync (Sales Analytics Settings Tab)

| Element | Copy | Notes |
|---------|------|-------|
| Sync button label (existing) | "Sync Now" | Already exists in `PlatformSyncPanel`. No change. |
| Backfill button label (new) | "Backfill All Orders" | New button in internal expanded section. Triggers full resync. |
| Backfill button tooltip | "Re-sync all historical orders. Safe to run multiple times." | Title attribute on button. |
| Sync success toast (existing) | "Synced {N} new orders ({N} duplicates skipped)" | Already exists. No change. |
| Backfill success toast | "Backfilled {N} orders ({N} duplicates skipped)" | Same pattern as existing sync toast. |
| Sync error toast (existing) | "Internal sync failed: {error}" | Already exists. No change. |
| Backfill in-progress label | "Backfilling..." | Button disabled state text while running. |

### DA-03: COGS Override (MenuProductsManager)

| Element | Copy | Notes |
|---------|------|-------|
| COGS override column header | "COGS Override" | New label in stats grid (below existing "COGS" line). |
| Override placeholder (empty) | "Auto (BOM)" | Shown as muted text when no override is set. Communicates that BOM drives COGS. |
| Override active badge | "Override" | Small `Badge variant="secondary"` next to the COGS value when override is active. |
| Override saved toast | "COGS override saved" | After successful inline save. |
| Override cleared toast | "COGS override cleared -- using BOM" | After user clears the override value. |
| Override validation error | "COGS must be a positive number" | If user enters negative or non-numeric value. |

### DA-04: Employee Profile (UsersManager Edit Dialog)

| Element | Copy | Notes |
|---------|------|-------|
| Section header | "Employment Details" | Separator label for new field group in edit dialog. |
| Hire date label | "Hire Date" | `<Label>` for date input. |
| Hire date placeholder | "Select date" | Native date input placeholder. |
| Base salary label | "Monthly Salary (IDR)" | `<Label>` for salary input. |
| Base salary placeholder | "e.g. 3,500,000" | Placeholder showing expected format. |
| Bank account holder name label | "Bank Account Holder Name" | `<Label>` for text input. |
| Bank account holder name placeholder | "Legal name for bank transfers" | Clarifies this is the legal/bank name, not display name. |
| Bank account holder name helper | "May differ from display name above" | Muted helper text below input. `text-xs text-muted-foreground`. |
| Save success toast (existing) | "User updated successfully" | Already exists. No change needed -- same mutation. |

### Empty States

No new empty states needed. All three pages already have their own empty state handling. The new fields are optional additions to existing records.

### Error States

| Context | Error Copy | Recovery Action |
|---------|-----------|----------------|
| Sync failure (DA-01) | "Internal sync failed: {server error}" | Existing pattern -- toast.error with server message. User retries via button. |
| Backfill failure (DA-02) | "Backfill failed: {server error}" | Same toast.error pattern. User retries via button. |
| COGS override invalid input | "COGS must be a positive number" | Inline validation -- input border turns `border-destructive`, message below input in `text-destructive text-xs`. |
| Employee field save failure | "Failed to update user" | Existing toast.error pattern. Dialog stays open for retry. |

### Destructive Actions

| Action | Confirmation Approach | Copy |
|--------|----------------------|------|
| Clear COGS override | No confirmation dialog. Clearing the field and saving (blur/enter) reverts to BOM. Reversible by re-entering a value. | Toast: "COGS override cleared -- using BOM" |

No other destructive actions in this phase. Backfill is idempotent (dedup by orderNumber). Employee field edits are standard saves.

## Interaction Contracts

### DA-01/DA-02: Revenue Sync + Backfill

**Location:** Sales Analytics > Settings tab > Internal platform expanded section

**Existing behavior (no change):** `PlatformSyncPanel` with "Sync Now" button triggers incremental sync.

**New behavior:** Add a secondary "Backfill All Orders" button below the existing sync panel within the internal expanded section.

| Interaction | Behavior |
|-------------|----------|
| Click "Backfill All Orders" | Button enters disabled state with spinner + "Backfilling..." text. Calls `syncInternalOrders({ triggeredBy: "settings", forceFullSync: true })`. |
| Backfill completes (success) | Button re-enables. Toast: "Backfilled {N} orders ({N} duplicates skipped)". |
| Backfill completes (error) | Button re-enables. Toast.error with server error message. |
| Backfill while sync running | Backfill button disabled if sync is in progress (and vice versa). Single `syncingInternal` state governs both. |

**Layout:** Inside the existing `{health.platformId === "internal" && isCurrentExpanded}` block, below the existing `PlatformSyncPanel`. Use `Button variant="outline" size="sm"` for the backfill button to visually subordinate it to the primary sync action.

### DA-03: COGS Override Inline Editing

**Location:** MenuProductsManager > Product card > Stats grid

**Pattern:** Follow the existing read-only stats grid pattern (Price, COGS, Margin columns). The COGS override is NOT a separate inline-editable cell in a table -- the MenuProductsManager uses a card-based layout, not a table. The override is set via the existing ProductForm dialog (Edit button on card).

**Revised approach (matching existing architecture):** Add `cogsOverrideIdr` as a field in the `ProductForm` component (`src/components/menuProducts/ProductForm.tsx`), and display the override status on the product card.

| Interaction | Behavior |
|-------------|----------|
| View product card | Stats grid shows "COGS" row. If override active: display override value + "Override" badge (amber background). If no override: display BOM-calculated `unitCost` as-is (existing behavior). |
| Edit product (click Edit button) | Opens existing `ProductForm` dialog. New "COGS Override" field appears in the form below the price field. |
| Enter override value | Standard number `Input` with IDR formatting. Placeholder: "Auto (BOM)". |
| Clear override | Delete the value from the input field. On save, sends `cogsOverrideIdr: undefined` to mutation. |
| Save with override | Toast: "COGS override saved". Card updates reactively (Convex real-time). |
| Save with cleared override | Toast: product saved (existing). Card reverts to showing BOM-calculated cost. |

**Card display spec:**

```
COGS
Rp 12,500 [Override]     <-- when cogsOverrideIdr is set
                              Badge is variant="secondary", amber-tinted

COGS
Rp 10,200 [spinner]      <-- when no override, BOM-calculated (existing behavior)
```

### DA-04: Employee Profile Fields in Edit Dialog

**Location:** UsersManager > Edit User Dialog

**Pattern:** Extend existing `DialogContent` with a new section below the Avatar URL field. Use a visual separator (`border-t pt-4 mt-4`) and section header.

| Interaction | Behavior |
|-------------|----------|
| Open edit dialog | Existing fields (Name, Role, Avatar URL) load as before. New "Employment Details" section appears below with Hire Date, Monthly Salary, and Bank Account Holder Name fields. Fields pre-populate from user record (if previously set). |
| Hire date input | Native `<Input type="date" />`. Pre-populate with ISO date string converted from epoch ms. No future date restriction (admin may pre-enter). |
| Salary input | `<Input type="number" />` with `min={0}` and `step={1}`. Display as raw number (not formatted). Placeholder: "e.g. 3500000". |
| Bank holder name input | `<Input type="text" />` with `maxLength={100}`. Placeholder: "Legal name for bank transfers". Helper text below: "May differ from display name above". |
| Save | Existing "Save Changes" button. Sends all fields (existing + new) via `updateUser` mutation. Toast: "User updated successfully" (existing). |
| All fields empty | Valid state. All three new fields are optional. |

**Dialog layout spec:**

```
[Edit User Dialog]
  DialogTitle: "Edit User"
  DialogDescription: "Update user details and employment information."

  --- Existing fields ---
  Name:       [____________]
  Role:       [v Kitchen Staff   ]
  Avatar URL: [____________]

  --- border-t pt-4 mt-4 ---
  Employment Details                    <-- text-sm font-medium text-muted-foreground
  Hire Date:                [____-__-__]
  Monthly Salary (IDR):     [__________]   placeholder: "e.g. 3,500,000"
  Bank Account Holder Name: [__________]   placeholder: "Legal name for bank transfers"
                            May differ from display name above   <-- text-xs text-muted-foreground

  [Cancel]  [Save Changes]
```

## Layout Specifications

### Sales Analytics Settings Tab (Internal Section)

No layout changes. The backfill button is appended inside the existing expanded internal section:

```
[IntegrationHealthCard: Internal Orders]
  [v expanded]
  +-----------------------------------------+
  |  [PlatformSyncPanel: "Sync Now" button] |  <-- existing
  |                                         |
  |  [Backfill All Orders]                  |  <-- new, Button variant="outline" size="sm"
  |  "Re-sync all historical orders..."     |  <-- text-xs text-muted-foreground hint
  +-----------------------------------------+
```

### MenuProductsManager Product Card

Existing card layout with one visual addition:

```
+--------------------------------------------+
| Product Name                               |
| [Food] [Slot 3] [POS]                     |
|                                            |
| Weight    | Price        | COGS     | Margin |
| 80g       | Rp 35,000   | Rp 12,500| 64.3%  |
|           |             | [Override]|        |  <-- new badge when override active
+--------------------------------------------+
```

The "Override" badge appears only when `cogsOverrideIdr` is set. It is a `Badge variant="secondary"` with `className="text-[10px] bg-amber-50 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300"`.

### UsersManager Edit Dialog

DialogContent width: unchanged (shadcn default `sm:max-w-[425px]`).

New section adds approximately 180px of vertical height to the dialog. Dialog is already scrollable if content overflows on small screens.

## Responsive Behavior

All three modified views already have responsive handling:

| View | Mobile (<640px) | Desktop (>=640px) |
|------|-----------------|-------------------|
| SettingsTab | Full-width cards, stacked | Same -- single column layout |
| MenuProductsManager cards | 2-column stats grid with `text-xs` | 2-column stats grid with `text-sm` |
| UsersManager edit dialog | Full-screen dialog (shadcn default) | Centered modal at 425px width |

No additional responsive breakpoints needed. All new elements use existing responsive patterns.

## Accessibility

| Element | Requirement | Implementation |
|---------|-------------|----------------|
| Backfill button | Disabled state communicated to screen readers | `disabled` prop + `aria-busy="true"` during sync |
| COGS override badge | Informational, not interactive | Static `Badge` with text "Override" (read naturally by screen readers) |
| Hire date input | Label association | `<Label htmlFor="edit-hireDate">` + `<Input id="edit-hireDate">` |
| Salary input | Label association + input type | `<Label htmlFor="edit-salary">` + `<Input id="edit-salary" type="number">` |
| Bank holder name | Label + helper text | `<Label htmlFor="edit-bankHolder">` + `<Input id="edit-bankHolder" aria-describedby="bankHolder-help">` + `<p id="bankHolder-help">` |
| Override form field (ProductForm) | Label association | `<Label htmlFor="cogsOverride">` + `<Input id="cogsOverride">` |

All existing keyboard navigation patterns (Tab order, Enter to submit, Escape to close dialog) remain unchanged.

## Loading & Transition States

| State | Visual Treatment |
|-------|-----------------|
| Backfill in progress | Button shows `RefreshCw` icon spinning + "Backfilling..." text. Button disabled. |
| Sync in progress (existing) | Same pattern via `PlatformSyncPanel` built-in spinner. |
| COGS override saving (via ProductForm) | Existing "Saving..." disabled button state in ProductForm. |
| Employee fields saving | Existing "Saving..." disabled button state in edit dialog. |
| Product card COGS stale (existing) | `RefreshCw` spinning amber icon next to COGS value (already implemented). |

No skeleton loading changes. All three pages already handle `=== undefined` loading states.

## Validation Rules

### DA-03: COGS Override

| Field | Type | Constraints | Error Message |
|-------|------|-------------|---------------|
| `cogsOverrideIdr` | `number \| undefined` | Optional. If provided: must be >= 0. Empty/cleared = `undefined` (reverts to BOM). | "COGS must be zero or a positive number" |

### DA-04: Employee Profile Fields

| Field | Type | Constraints | Error Message |
|-------|------|-------------|---------------|
| `hireDate` | `number \| undefined` (epoch ms) | Optional. No range restrictions. Frontend converts `<input type="date">` value to epoch ms. | None (native date input handles format). |
| `baseSalaryIdr` | `number \| undefined` | Optional. If provided: must be >= 0. | "Salary must be zero or a positive number" |
| `bankAccountHolderName` | `string \| undefined` | Optional. Trimmed. Max 100 characters. | "Name must be 100 characters or fewer" |

Validation is applied on form submit (not on every keystroke). Uses same inline validation pattern as existing UsersManager (check before mutation call, `toast.error` on failure).

## No New Routes

This phase modifies three existing pages. No new routes, no new pages, no changes to `src/App.tsx`.

| Modified Page | Route | Access |
|---------------|-------|--------|
| Sales Analytics (SettingsTab) | `/analytics` | `canAccessDashboard` (Manager, Admin) |
| Menu Products Manager | `/menu-products` | `canAccessMenuProducts` (Admin) |
| Users Manager | `/users` | `canAccessUsers` (Admin) |

---

*Phase: 70-data-accuracy-foundation*
*UI-SPEC created: 2026-04-10*
*Status: draft -- pending checker validation*
