# Phase 58: Invoice Form, Print View & Order Integration - Research

**Researched:** 2026-03-17
**Domain:** React form UX, WYSIWYG invoice layout, CSS print media, debounced auto-save, Indonesian date localization
**Confidence:** HIGH

## Summary

Phase 58 builds the user-facing invoice experience on top of Phase 57's backend infrastructure. It delivers 4 new React components (`InvoiceForm`, `InvoicePrintView`, `InvoiceFieldInput`, `InvoiceSidebarCard`), 1 new page component (`InvoicePage`), a `formatIndonesianDate` helper, `@media print` global styles, 2 new routes in App.tsx, and an `InvoiceSidebarCard` insertion into `OrderDetail.tsx`. No new backend code is needed -- all backend API functions (createDraft, updateDraft, discardDraft, finalize, getByOrder, getById) and hooks (useInvoice, useInvoicesByOrder, etc.) are delivered by Phase 57.

The codebase already has all building blocks: `date-fns` v4.1.0 with Indonesian locale (`date-fns/locale/id`) verified working, Tailwind v4.1.18 with built-in `print:` variant, `formatCurrency` for IDR, `ConfirmDialog` for discard confirmation, `lazyWithPreload` for code splitting, and established hook patterns from the barrel export in `src/hooks/convex/index.ts`. The `OrderDetail.tsx` (572 LOC) uses a 2/3 + 1/3 grid layout where the sidebar card will be inserted.

**Primary recommendation:** This is a frontend-only phase with zero backend work. The main complexity is the WYSIWYG invoice form with field color coding, debounced auto-save, and the `@media print` stylesheet. Use the `date-fns` `format()` function with `{ locale: id }` for Indonesian dates -- verified to produce "Senin, 16 Maret 2026" with format string `"EEEE, d MMMM yyyy"`. Use `setTimeout`-based debounce (project pattern) rather than importing a debounce library.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- Always-editable inputs styled to look like the invoice layout (not click-to-edit) -- simpler UX, no mode switching
- Color coding via background tint: light blue (`bg-blue-50`) for auto-filled, light yellow (`bg-amber-50`) for needs-input, white (`bg-white`) for user-edited
- Track field source in local state: `"auto" | "needs-input" | "edited"` -- when user types in a blue field, transition to white
- Items table is read-only from order data (qty, product name, unit price, line total) -- no inline editing
- Subtotal/discount/delivery fee/grand total computed from items + order data, not editable
- Notes field is the only free-text field always in "needs-input" (yellow) state until filled
- `@media print` styles in global `src/index.css` (consistent with existing global styles, affects all pages)
- Use Tailwind `print:` prefix where possible for component-level print hiding (e.g., `print:hidden` on nav, buttons)
- Orange accent bar at top of invoice in print mode (Frollie brand) -- thin 4px bar using `--color-brand`
- On-screen preview and print view share the same `InvoicePrintView` component -- preview renders it in a bordered card container, print strips the container
- Black-on-white for print: force `color: black`, `background: white` on invoice content area
- Invoice card placed in right sidebar ABOVE OrderItems -- it's a high-visibility action for managers
- Card only renders for `manager`/`admin` roles AND order status is PaymentReceived or later
- Three states follow the design spec exactly: no invoice, draft saved, finalized
- Multiple finalized invoices: show latest prominently with badge, expandable "N older invoices" link showing a compact list of previous invoice numbers with dates
- "Generate Invoice" button navigates to `/orders/:orderId/invoice`
- Add `formatIndonesianDate(date: Date | number): string` to existing `src/lib/dateUtils.ts`
- Uses `date-fns/locale/id` for Indonesian day and month names
- Format: "Senin, 16 Maret 2026" (day name + date + month name + year)
- Reusable across invoice form, print view, and any future Indonesian-locale pages

### Claude's Discretion
- Exact spacing and typography within invoice layout
- Loading/error states for invoice form page
- Preview toggle implementation detail (`?preview` query param vs local state)
- Auto-save debounce visual feedback styling
- InvoiceFieldInput component internal structure
- Mobile responsiveness approach for invoice form (secondary concern -- invoices are primarily desktop)

### Deferred Ideas (OUT OF SCOPE)
None -- discussion stayed within phase scope
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| INV-01 | Manager/admin can generate invoice from Order Detail for PaymentReceived+ orders | InvoiceSidebarCard in OrderDetail right sidebar, gated by `isManagerOrAdmin` + status check. Uses `useInvoicesByOrder` hook from Phase 57. Navigate to `/orders/:orderId/invoice` |
| INV-02 | Invoice form auto-fills from order data + customer data + business settings | InvoicePage calls `useCreateInvoiceDraft` which server-side auto-fills. Draft loaded via `useInvoice` hook. All backend done in Phase 57 |
| INV-03 | Field color coding: blue (auto-filled), yellow (needs input), white (user-edited) | `InvoiceFieldInput` component with `fieldSource: "auto" \| "needs-input" \| "edited"` state. Background tints: `bg-blue-50`, `bg-amber-50`, `bg-white` |
| INV-04 | Draft auto-saves on every field change (debounced 2 seconds) | `setTimeout`-based debounce in InvoiceForm (project pattern from CustomerSearch). Calls `useUpdateInvoiceDraft` mutation |
| INV-05 | Draft persists across page navigation and browser refresh | Backend stores draft in `invoices` table (Phase 57). InvoicePage checks for existing draft on mount via `useInvoicesByOrder` |
| INV-06 | Preview mode shows clean read-only render without finalizing | `InvoicePrintView` component rendered inline with border container. Toggle via `?preview` query param or local state (Claude's discretion) |
| INV-07 | Finalize assigns sequential invoice number via race-safe counter | Calls `useFinalizeInvoice` mutation (Phase 57 backend). Frontend receives `{ invoiceId, invoiceNumber }` and navigates to print view |
| INV-08 | Finalize snapshots all seller/buyer/order data (immutable record) | Handled entirely by Phase 57 `finalize` mutation. Frontend just calls the mutation |
| INV-09 | Customer record updated with company/NPWP/billing address on finalize | Handled by Phase 57 `finalize` mutation (customer write-back). No frontend work needed |
| INV-10 | Multiple finalized invoices allowed per order (revision pattern) | InvoiceSidebarCard shows latest final prominently, expandable list for older ones. "New Invoice" button creates new draft |
| INV-11 | Order Detail sidebar shows invoice card with 3 states (none/draft/final) | `InvoiceSidebarCard` component with conditional rendering based on `useInvoicesByOrder` data |
| IPRNT-01 | Print view renders finalized invoice cleanly via `window.print()` | `InvoicePrintView` at `/orders/:orderId/invoice/:invoiceNumber`. "Print" button calls `window.print()` |
| IPRNT-02 | `@media print` stylesheet hides navigation, sidebar, action buttons | Global `@media print` block in `src/index.css` + `print:hidden` Tailwind classes on non-invoice elements |
| IPRNT-03 | Indonesian date format (e.g., "Senin, 16 Maret 2026") | `formatIndonesianDate` in `src/lib/dateUtils.ts` using `date-fns` `format()` with `{ locale: id }` -- verified working |
| IPRNT-04 | Standard invoice layout: header, bill-to, order details, items table, totals, payment info, signature area, notes, footer | 9-section layout in `InvoicePrintView` component following design spec exactly |
</phase_requirements>

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| React | ^19.2.0 | UI framework, component composition | Project standard |
| React Router | ^7.13.0 | Routing (`useParams`, `useNavigate`, `useSearchParams`) | Project standard |
| Convex React | (existing) | `useQuery` for real-time invoice data | Project standard |
| date-fns | ^4.1.0 | Indonesian date formatting with `date-fns/locale/id` | Already installed, verified working |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| Tailwind CSS | ^4.1.18 | Styling + `print:` variant for print-specific hiding | All components, print styles |
| shadcn/ui | (existing) | Card, Badge, Button, Input, Textarea | Invoice form UI, sidebar card |
| Lucide React | (existing) | Icons (FileText, Printer, Eye, Trash2, Plus) | Buttons, sidebar card |
| Sonner | (existing) | Toast for finalize success | Via `createMutationHook` |

### Alternatives Considered
None -- all locked to existing project stack. No new dependencies needed.

## Architecture Patterns

### Recommended Project Structure
```
src/
├── components/
│   └── invoice/
│       ├── InvoiceForm.tsx           # WYSIWYG form with auto-save
│       ├── InvoicePrintView.tsx      # Clean print layout (9 sections)
│       ├── InvoiceFieldInput.tsx     # Styled input with color coding
│       └── InvoiceSidebarCard.tsx    # 3-state card for OrderDetail
├── pages/
│   └── InvoicePage.tsx              # Route handler (form, preview, print view)
├── lib/
│   └── dateUtils.ts                 # +formatIndonesianDate (extend existing)
├── index.css                        # +@media print block (extend existing)
└── App.tsx                          # +2 invoice routes (extend existing)
```

### Pattern 1: Field Source State Tracking
**What:** Each editable field in the invoice form tracks its "source" to determine background color.
**When to use:** WYSIWYG form where fields need visual distinction between auto-filled, needs-input, and user-edited states.
**Example:**
```typescript
// Source: Design spec field color coding requirement
type FieldSource = "auto" | "needs-input" | "edited";

interface InvoiceFormState {
  // Each field has a value and source
  buyerCompany: string;
  buyerCompanySource: FieldSource;
  buyerNpwp: string;
  buyerNpwpSource: FieldSource;
  // ... etc
}

// Background tint mapping
const SOURCE_BACKGROUNDS: Record<FieldSource, string> = {
  auto: "bg-blue-50",        // Auto-filled from data
  "needs-input": "bg-amber-50", // Needs user input
  edited: "bg-white",        // User has edited
};

// Transition: when user types in auto-filled field, source becomes "edited"
function handleFieldChange(field: string, value: string, currentSource: FieldSource) {
  const newSource = currentSource === "auto" ? "edited" : currentSource;
  // Update both value and source in state
}
```

### Pattern 2: Debounced Auto-Save
**What:** Field changes trigger a debounced mutation call (2 seconds) to persist draft.
**When to use:** Any form where changes should auto-persist without explicit save.
**Example:**
```typescript
// Source: Project pattern from CustomerSearch.tsx (setTimeout debounce)
const [saveStatus, setSaveStatus] = useState<"idle" | "saving" | "saved">("idle");
const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
const updateDraft = useUpdateInvoiceDraft();

function scheduleAutoSave(updates: Partial<InvoiceDraftFields>) {
  if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
  setSaveStatus("saving"); // Show "Saving..." indicator
  saveTimerRef.current = setTimeout(async () => {
    try {
      await updateDraft.mutate({ invoiceId, ...updates });
      setSaveStatus("saved");
    } catch {
      setSaveStatus("idle"); // Error handled by createMutationHook toast
    }
  }, 2000);
}

// Cleanup on unmount
useEffect(() => {
  return () => {
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
  };
}, []);
```

### Pattern 3: Shared InvoicePrintView for Preview and Print
**What:** Same component renders in two contexts -- preview (bordered card on screen) and print (clean full-page).
**When to use:** When on-screen preview and print output share identical layout.
**Example:**
```typescript
// InvoicePrintView renders the 9-section invoice layout
// Props: invoice data (from draft or finalized record)
// No action buttons, no colored field backgrounds -- clean render

// In InvoicePage:
// Preview mode: <div className="border rounded-lg shadow-sm mx-auto max-w-[210mm]"><InvoicePrintView ... /></div>
// Print route:  <div className="invoice-print-area"><InvoicePrintView ... /></div>
// The @media print CSS hides everything outside .invoice-print-area
```

### Pattern 4: Print-Specific CSS
**What:** Combination of global `@media print` in `src/index.css` and Tailwind `print:` utility classes.
**When to use:** Pages that need clean print output.
**Example:**
```css
/* src/index.css -- global print styles */
@media print {
  /* Hide app chrome */
  header, nav, footer, .mobile-bottom-nav,
  .feedback-panel-toggle, .no-print {
    display: none !important;
  }

  /* Force clean background */
  body, #root {
    background: white !important;
    color: black !important;
  }

  /* Invoice-specific */
  .invoice-print-area {
    margin: 0;
    padding: 0;
    box-shadow: none !important;
    border: none !important;
  }

  /* Brand accent bar at top */
  .invoice-brand-bar {
    height: 4px;
    background-color: var(--color-brand) !important;
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
  }
}
```

```tsx
// Component-level hiding with Tailwind print: prefix
<Button className="print:hidden" onClick={() => window.print()}>Print</Button>
<Header className="print:hidden" />
```

### Pattern 5: Route Structure for Invoice Pages
**What:** Two routes handle form/preview and print view, sharing the same page component.
**When to use:** When a single feature has multiple URL-based views.
**Example:**
```typescript
// src/App.tsx
const InvoicePage = lazyWithPreload(() =>
  import('./pages/InvoicePage').then(m => ({ default: m.InvoicePage }))
);

// Route 1: Form + preview (uses ?preview query param)
<Route
  path="orders/:orderId/invoice"
  element={
    <ProtectedRoute requiredPermission="canAccessInvoices">
      <InvoicePage />
    </ProtectedRoute>
  }
/>

// Route 2: Finalized print view (by invoice number)
<Route
  path="orders/:orderId/invoice/:invoiceNumber"
  element={
    <ProtectedRoute requiredPermission="canAccessInvoices">
      <InvoicePage />
    </ProtectedRoute>
  }
/>
```

### Pattern 6: Indonesian Date Formatting
**What:** `date-fns` `format()` with Indonesian locale produces "Senin, 16 Maret 2026".
**Verified:** Tested with `date-fns` v4.1.0 -- exact output confirmed.
**Example:**
```typescript
// src/lib/dateUtils.ts -- add to existing file
import { format } from "date-fns";
import { id } from "date-fns/locale";

/** Format date as Indonesian full date: "Senin, 16 Maret 2026" */
export function formatIndonesianDate(date: Date | number): string {
  const d = typeof date === "number" ? new Date(date) : date;
  return format(d, "EEEE, d MMMM yyyy", { locale: id });
}
```

### Anti-Patterns to Avoid
- **Don't import a debounce library:** Use `setTimeout`/`clearTimeout` (project pattern from CustomerSearch.tsx). No `lodash.debounce` or `use-debounce`.
- **Don't build separate preview and print components:** The CONTEXT.md explicitly states they share `InvoicePrintView`. The only difference is the container (bordered card for preview, bare for print).
- **Don't make items table editable:** Items are read-only snapshots from order data (per locked decision). Subtotal/discount/totals are computed, not editable.
- **Don't use `Intl.DateTimeFormat` for Indonesian dates:** `date-fns/locale/id` with `format()` is more reliable and produces the exact required format. The existing `toLocaleDateString("id-ID", ...)` in `formatDateId` uses abbreviated month names (e.g., "Mar"), not full names (e.g., "Maret").
- **Don't add invoice routes in a separate Layout:** Invoice routes use the standard `<Layout />` (not `fullWidth`) to maintain consistent navigation. The `@media print` CSS hides the chrome when printing.
- **Don't put `@media print` in a component-scoped CSS module:** The CONTEXT.md requires it in global `src/index.css`.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Indonesian date format | Manual day/month string arrays | `date-fns` `format()` with `{ locale: id }` | Handles all edge cases, tested, no custom month/day name arrays |
| Debounce logic | Custom debounce utility/hook | `setTimeout`/`clearTimeout` pattern (inline) | Project convention, simple enough not to need abstraction |
| IDR currency formatting | Manual string building | `formatCurrency()` from `src/lib/utils.ts` | Already handles id-ID locale, zero decimals |
| Print CSS | Component-scoped StyleSheet/styled-components | Global `@media print` in `src/index.css` + Tailwind `print:` classes | Per user decision, consistent with existing global styles |
| Confirmation dialogs | Custom modal for discard | `ConfirmDialog` from `src/components/shared/` | Established shared component, already imported in OrderDetail |
| Lazy page loading | Manual `React.lazy()` | `lazyWithPreload()` from `src/lib/lazyWithPreload` | Supports hover-prefetch, project pattern |
| Auth/role gating | Custom permission checks | `ProtectedRoute` with `requiredPermission="canAccessInvoices"` | Project pattern, `canAccessInvoices` already defined in Phase 57 |

**Key insight:** Phase 58 is entirely frontend. All backend infrastructure (hooks, mutations, queries) is provided by Phase 57. The planner should NOT include any `convex/` file modifications.

## Common Pitfalls

### Pitfall 1: Hooks Must Be Called Before Conditional Returns
**What goes wrong:** Placing `useInvoicesByOrder()` after an early return (e.g., `if (isLoading) return <Loading />`) violates React hooks rules.
**Why it happens:** OrderDetail already has early returns for loading/not-found states (lines 185-205). Invoice hooks must be called before these returns.
**How to avoid:** Call all hooks (including `useInvoicesByOrder`, `useAuth`) at the top of the component, before any conditional returns. This is already the pattern in OrderDetail (`useAuth` is called at line 98, before loading checks).
**Warning signs:** React error: "Rendered more hooks than during the previous render."

### Pitfall 2: Draft Auto-Save Fires on Initial Load
**What goes wrong:** When loading an existing draft, the form state initializes from draft data, triggering onChange handlers that schedule unnecessary auto-saves.
**Why it happens:** React useEffect sets initial form state from loaded draft, which triggers change handlers.
**How to avoid:** Use a `isInitializing` ref flag. Set to `true` during initial load, skip auto-save while true. Set to `false` after first render with draft data. Alternatively, track a `lastSavedState` and only auto-save when form state differs.
**Warning signs:** Network requests on page load when no fields have changed.

### Pitfall 3: Print CSS Specificity Wars
**What goes wrong:** Tailwind's utility classes have low specificity. `@media print` rules need `!important` to override them.
**Why it happens:** Tailwind generates utilities at low specificity. Print styles need to forcefully hide/show elements regardless of their normal styles.
**How to avoid:** Use `!important` in the global `@media print` block for critical overrides (hide nav, force white background). Use `print:hidden` Tailwind class for individual elements (this works because it generates `@media print { display: none }` which is specific enough for non-conflicting cases).
**Warning signs:** Navigation still visible in print preview, colored backgrounds printing.

### Pitfall 4: Stale Draft Data After Finalize
**What goes wrong:** After calling `finalize`, the invoice card still shows "draft" state because `useInvoicesByOrder` hasn't updated yet.
**Why it happens:** Convex queries are reactive but there may be a brief moment between mutation completion and query update.
**How to avoid:** After successful finalize, navigate immediately to the print view route (`/orders/:orderId/invoice/:invoiceNumber`). The Convex reactivity will update the sidebar card automatically when the user returns to OrderDetail.
**Warning signs:** Brief flash of "draft" state after finalizing.

### Pitfall 5: Invoice Logo URL Resolution
**What goes wrong:** The finalized invoice has a `sellerLogoStorageId` but no URL. Need to resolve it.
**Why it happens:** Convex storage IDs need `ctx.storage.getUrl()` server-side to get a signed URL.
**How to avoid:** Phase 57's `getById` and `getByOrder` queries already resolve `sellerLogoUrl` from `sellerLogoStorageId`. Use the resolved URL from the query response, don't try to resolve on the frontend.
**Warning signs:** Missing logo in print view, attempting to use storageId as image src.

### Pitfall 6: `window.print()` Timing
**What goes wrong:** Calling `window.print()` before all images (logo) have loaded results in missing images in print output.
**Why it happens:** `window.print()` doesn't wait for lazy-loaded images.
**How to avoid:** For the print view page, ensure the logo `<img>` has an `onLoad` handler. Only enable the Print button after the logo loads (or has no logo). Alternatively, use `loading="eager"` on the logo `<img>` tag.
**Warning signs:** Logo appears on screen but is blank in the print dialog.

### Pitfall 7: OrderDetail Sidebar Insertion Order
**What goes wrong:** InvoiceSidebarCard renders in the wrong position in the sidebar.
**Why it happens:** The right sidebar in OrderDetail currently has: FulfillFromInventoryButton, OrderItems, Edit button, Delivery info, Delete/Cancel buttons (lines 439-526). Invoice card needs to go ABOVE OrderItems per user decision.
**How to avoid:** Insert InvoiceSidebarCard between FulfillFromInventoryButton and OrderItems in the right sidebar JSX.
**Warning signs:** Invoice card appearing below order items or at bottom of sidebar.

## Code Examples

### formatIndonesianDate (verified working)
```typescript
// Source: Verified with date-fns v4.1.0 -- produces "Senin, 16 Maret 2026"
import { format } from "date-fns";
import { id } from "date-fns/locale";

export function formatIndonesianDate(date: Date | number): string {
  const d = typeof date === "number" ? new Date(date) : date;
  return format(d, "EEEE, d MMMM yyyy", { locale: id });
}
```

### InvoiceFieldInput Component (Claude's Discretion)
```typescript
// Styled input that shows field source via background color
interface InvoiceFieldInputProps {
  label: string;
  value: string;
  source: FieldSource;
  onChange: (value: string) => void;
  placeholder?: string;
  multiline?: boolean;
}

const SOURCE_BG: Record<FieldSource, string> = {
  auto: "bg-blue-50 border-blue-200",
  "needs-input": "bg-amber-50 border-amber-200",
  edited: "bg-white border-gray-200",
};

export function InvoiceFieldInput({ label, value, source, onChange, placeholder, multiline }: InvoiceFieldInputProps) {
  const InputComponent = multiline ? Textarea : Input;
  return (
    <div>
      <Label className="text-xs text-muted-foreground print:hidden">{label}</Label>
      <InputComponent
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className={cn(
          "print:border-none print:bg-transparent print:p-0 print:shadow-none",
          SOURCE_BG[source]
        )}
      />
      {/* Print mode: render as plain text */}
      <span className="hidden print:inline">{value || "-"}</span>
    </div>
  );
}
```

### InvoiceSidebarCard (3 states)
```typescript
// Source: Design spec Order Detail sidebar card specification
interface InvoiceSidebarCardProps {
  orderId: Id<"orders">;
  orderStatus: OrderStatus;
}

export function InvoiceSidebarCard({ orderId, orderStatus }: InvoiceSidebarCardProps) {
  const invoices = useInvoicesByOrder(orderId);
  const navigate = useNavigate();
  const { user } = useAuth();

  const isManagerOrAdmin = user?.role === "admin" || user?.role === "manager";
  const isInvoiceable = ["PaymentReceived", "BeingPrepared", "AwaitingDelivery", "Complete"].includes(orderStatus);

  // Don't render for non-manager roles or non-invoiceable statuses
  if (!isManagerOrAdmin || !isInvoiceable) return null;
  if (invoices === undefined) return null; // Loading

  const draft = invoices?.find(inv => inv.status === "draft");
  const finals = invoices?.filter(inv => inv.status === "final") ?? [];
  const latestFinal = finals[0]; // Already sorted by _creationTime desc from query

  // State 1: No invoice
  // State 2: Draft saved
  // State 3: Finalized (with optional older invoices)
  // ... render logic
}
```

### @media print Global Styles
```css
/* src/index.css -- append to end of file */
/* ============================================
   Print Styles (Invoice)
   ============================================ */

@media print {
  /* Hide app chrome */
  header, footer, nav,
  .mobile-bottom-nav,
  .feedback-panel-toggle,
  .no-print,
  [data-sonner-toaster] {
    display: none !important;
  }

  /* Reset page layout */
  body, #root {
    background: white !important;
    color: black !important;
    margin: 0 !important;
    padding: 0 !important;
  }

  /* Remove shadows and borders from print content */
  .invoice-print-area {
    box-shadow: none !important;
    border: none !important;
    margin: 0 !important;
    padding: 0 !important;
    max-width: 100% !important;
  }

  /* Force brand accent bar to print in color */
  .invoice-brand-bar {
    -webkit-print-color-adjust: exact !important;
    print-color-adjust: exact !important;
  }

  /* Ensure page breaks are clean */
  .invoice-print-area {
    page-break-inside: avoid;
  }

  /* Hide the main padding from Layout */
  main {
    padding: 0 !important;
  }
}
```

### Route Registration
```typescript
// src/App.tsx -- add lazy import
const InvoicePage = lazyWithPreload(() =>
  import('./pages/InvoicePage').then(m => ({ default: m.InvoicePage }))
);

// Inside Layout standard pages routes
<Route
  path="orders/:orderId/invoice"
  element={
    <ProtectedRoute requiredPermission="canAccessInvoices">
      <InvoicePage />
    </ProtectedRoute>
  }
/>
<Route
  path="orders/:orderId/invoice/:invoiceNumber"
  element={
    <ProtectedRoute requiredPermission="canAccessInvoices">
      <InvoicePage />
    </ProtectedRoute>
  }
/>
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `toLocaleDateString("id-ID", ...)` | `date-fns format()` with `{ locale: id }` | This phase | Full day/month names (EEEE, MMMM) vs abbreviated (EEE, MMM) |
| No print styles | `@media print` in global CSS + `print:` Tailwind prefix | This phase (first use) | Clean invoice printing via browser |
| Order Detail has no invoice UI | InvoiceSidebarCard in right sidebar | This phase | Managers see invoice status at a glance |

**Note on `--color-brand`:** The CSS variable `--color-brand` is teal (#0D9488), not orange. The CONTEXT.md refers to it as "Frollie brand" accent bar. The implementation should use `var(--color-brand)` as specified, which renders as teal.

## Open Questions

1. **Preview toggle: `?preview` query param vs local state**
   - What we know: CONTEXT.md lists this as Claude's discretion
   - Options: (a) `?preview` query param makes preview URL shareable but adds router complexity, (b) local `useState` is simpler but preview isn't bookmarkable
   - Recommendation: Use `?preview` query param (`useSearchParams`) -- it's simple with React Router and allows direct linking to preview mode. The InvoicePage already uses `useParams` for `orderId` and `invoiceNumber`.

2. **Cancelled orders: view existing invoices but no new ones**
   - What we know: Design spec says "Cancelled orders: can view existing invoices, cannot create new ones"
   - What's unclear: Should the sidebar card render for Cancelled orders if they have existing invoices?
   - Recommendation: Yes -- show existing invoices in sidebar card for Cancelled orders (view-only, no "Generate Invoice" or "New Invoice" buttons). The `isInvoiceable` check gates creation, not viewing.

3. **Auto-save feedback text position**
   - What we know: Phase 57 decision says "subtle inline status text near page top" -- "Saving..." -> "Saved just now" -> "Saved 2 min ago"
   - What's unclear: Exact placement and transition timing
   - Recommendation: Place save status text in the page header area (right-aligned, small muted text). "Saving..." during debounce wait, "Saved just now" on success, transition to "Saved N min ago" via `setInterval`. This is Claude's discretion.

## Sources

### Primary (HIGH confidence)
- `docs/superpowers/specs/2026-03-16-invoice-generation-design.md` -- authoritative design spec with exact layout, field lists, workflow, sidebar card states
- `58-CONTEXT.md` -- user decisions locking implementation choices
- `57-RESEARCH.md` + `57-01-PLAN.md` + `57-02-PLAN.md` -- Phase 57 backend API contracts and hooks
- `src/pages/OrderDetail.tsx` -- existing 572 LOC file where InvoiceSidebarCard is inserted
- `src/lib/dateUtils.ts` -- existing WIB date helpers, extend with `formatIndonesianDate`
- `src/index.css` -- existing global styles, extend with `@media print`
- `src/App.tsx` -- existing route structure, extend with 2 invoice routes

### Secondary (MEDIUM confidence)
- `date-fns` v4.1.0 Indonesian locale -- verified working via `node -e` test, produces exact required output
- Tailwind v4.1.18 `print:` variant -- [confirmed built-in](https://tailwindcss.com/blog/tailwindcss-v4)
- `src/components/orders/CustomerSearch.tsx` -- `setTimeout` debounce pattern reference

### Tertiary (LOW confidence)
- None -- all findings verified through direct codebase inspection and runtime testing

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - zero new dependencies, all libraries already installed and in use
- Architecture: HIGH - all patterns verified against existing codebase, design spec is authoritative
- Pitfalls: HIGH - based on direct code inspection of OrderDetail.tsx hook ordering, React rules, and Convex reactivity model
- Date formatting: HIGH - verified via runtime `node -e` test producing exact expected output

**Research date:** 2026-03-17
**Valid until:** 2026-04-17 (stable project, no framework changes expected)
