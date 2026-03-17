# Phase 58: Invoice Form, Print View & Order Integration - Context

**Gathered:** 2026-03-17
**Status:** Ready for planning

<domain>
## Phase Boundary

Build the WYSIWYG invoice form page, print view, and Order Detail sidebar card so managers/admins can generate, preview, finalize, and print invoices from any qualifying order. Phase 57 provides the backend (schema, API, Business Settings page, hooks).

Comprehensive design spec: `docs/superpowers/specs/2026-03-16-invoice-generation-design.md`

</domain>

<decisions>
## Implementation Decisions

### Form field interaction
- Always-editable inputs styled to look like the invoice layout (not click-to-edit) — simpler UX, no mode switching
- Color coding via background tint: light blue (`bg-blue-50`) for auto-filled, light yellow (`bg-amber-50`) for needs-input, white (`bg-white`) for user-edited
- Track field source in local state: `"auto" | "needs-input" | "edited"` — when user types in a blue field, transition to white
- Items table is read-only from order data (qty, product name, unit price, line total) — no inline editing
- Subtotal/discount/delivery fee/grand total computed from items + order data, not editable
- Notes field is the only free-text field always in "needs-input" (yellow) state until filled

### Print view & CSS approach
- `@media print` styles in global `src/index.css` (consistent with existing global styles, affects all pages)
- Use Tailwind `print:` prefix where possible for component-level print hiding (e.g., `print:hidden` on nav, buttons)
- Orange accent bar at top of invoice in print mode (Frollie brand) — thin 4px bar using `--color-brand`
- On-screen preview and print view share the same `InvoicePrintView` component — preview renders it in a bordered card container, print strips the container
- Black-on-white for print: force `color: black`, `background: white` on invoice content area

### Sidebar card in OrderDetail
- Invoice card placed in right sidebar ABOVE OrderItems — it's a high-visibility action for managers
- Card only renders for `manager`/`admin` roles AND order status is PaymentReceived or later
- Three states follow the design spec exactly: no invoice, draft saved, finalized
- Multiple finalized invoices: show latest prominently with badge, expandable "N older invoices" link showing a compact list of previous invoice numbers with dates
- "Generate Invoice" button navigates to `/orders/:orderId/invoice`

### Indonesian date formatting
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
- Mobile responsiveness approach for invoice form (secondary concern — invoices are primarily desktop)

</decisions>

<code_context>
## Existing Code Insights

### Reusable Assets
- `OrderDetail.tsx` (572 LOC): Right sidebar with 2/3+1/3 grid — invoice card inserts into right column
- `ConfirmDialog`: Shared component for discard draft confirmation
- `formatCurrency` in `src/lib/utils.ts`: IDR formatting with `id-ID` locale
- `src/lib/dateUtils.ts`: WIB timezone helpers — extend with Indonesian date formatter
- `useAuth` context: Role checking for conditional rendering (`isManagerOrAdmin` pattern already in OrderDetail)
- `PageHeader` + `Card`/`CardContent`/`CardHeader` from shadcn: Standard page structure
- `Badge` component: For invoice number display, draft/final status badges
- `LoadingCards` shared component: Loading states

### Established Patterns
- Route registration: `src/App.tsx` with `ProtectedRoute` wrapper and `React.lazy` for code splitting
- Hooks barrel export: `src/hooks/convex/index.ts` re-exports all hooks
- Status-based conditional rendering: OrderDetail already gates sections by `order.status`
- Role-based conditional rendering: `isManagerOrAdmin` check pattern in OrderDetail
- Navigation: `useNavigate` from react-router-dom for page transitions

### Integration Points
- `src/App.tsx`: Add 2 routes (`/orders/:orderId/invoice`, `/orders/:orderId/invoice/:invoiceNumber`)
- `src/pages/OrderDetail.tsx`: Add `InvoiceSidebarCard` component to right sidebar
- `src/index.css`: Add `@media print` global styles
- `src/lib/dateUtils.ts`: Add `formatIndonesianDate` helper
- `src/components/invoice/`: New directory for 4 components (InvoiceForm, InvoicePrintView, InvoiceFieldInput, InvoiceSidebarCard)
- `src/pages/InvoicePage.tsx`: New page component (handles form + preview + print view routing)

</code_context>

<specifics>
## Specific Ideas

- Design spec provides exact layout (9-section invoice), field lists, 3 sidebar card states, and workflow — follow as authoritative source
- Interactive mockups at `docs/mockups/invoice-workflow-mockup.html` show full visual intent
- Frollie is non-PKP UMKM — no VAT line on invoice, "invoice biasa" only
- Business name: "PT Malo Group Bahagia"
- Phase 57 context: auto-save uses inline text feedback, not toasts; discard requires ConfirmDialog

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 58-invoice-form-print-view-order-integration*
*Context gathered: 2026-03-17*
