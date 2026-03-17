# Invoice Generation Feature — Design Spec

**Date:** 2026-03-16
**Status:** Draft
**Author:** Claude + Irfan

---

## Overview

Add a "Generate Invoice" feature for orders, enabling B2B customers to receive formal Indonesian commercial invoices (invoice biasa). Invoices are created through a WYSIWYG form that mirrors the final printed layout, with auto-filled fields from order/customer/business data and highlighted fields for new input. Includes a Business Settings page for managing seller identity.

### Context

- Frollie is a non-PKP UMKM (under IDR 4.8B/year threshold)
- Issues "invoice biasa" (regular commercial invoices), NOT "faktur pajak" (tax invoices)
- No VAT/PPN charged — non-PKP businesses cannot charge VAT
- No government-mandated electronic format required
- Documents must be retained for 5 years

### Out of Scope

- Faktur pajak / e-Faktur integration (PKP only)
- PDF generation library (browser print-to-PDF is sufficient)
- Invoice listing/search page (v1 accesses invoices from their order)
- Email/WhatsApp sharing of invoices
- Bulk invoice generation

---

## Data Model

### New Table: `businessSettings` (singleton)

| Field | Type | Notes |
|-------|------|-------|
| `businessName` | `string` | e.g. "PT Malo Group Bahagia" |
| `logoStorageId` | `optional(id("_storage"))` | Convex file storage for logo |
| `address` | `optional(string)` | Business address |
| `phone` | `optional(string)` | Business phone |
| `email` | `optional(string)` | Business email |
| `npwp` | `optional(string)` | Seller NPWP (optional for non-PKP) |
| `defaultBankAccountId` | `optional(id("bankAccounts"))` | Default bank for invoices |
| `updatedBy` | `id("users")` | Last editor |
| `updatedAt` | `number` | Last edit timestamp |

No indexes needed (singleton — at most one row).

All `*By` fields (e.g., `updatedBy`, `generatedBy`) are set server-side from `ctx.user._id`, never passed from the client.

### New Table: `invoiceCounters`

| Field | Type | Notes |
|-------|------|-------|
| `prefix` | `string` | e.g. "2603" (YYMM) |
| `lastNumber` | `number` | Last assigned sequential number |

**Index:** `by_prefix` → `["prefix"]` — unique lookup per month.

Used for race-safe invoice numbering. The `finalize` mutation reads and increments the counter atomically within the same Convex transaction (OCC serializes concurrent writes to the same document).

### New Table: `invoices`

| Field | Type | Notes |
|-------|------|-------|
| `status` | `union("draft", "final")` | Draft = editable, Final = immutable |
| `invoiceNumber` | `optional(string)` | Assigned on finalize: `INV-YYMM-NNN` |
| `orderId` | `id("orders")` | Link to source order |
| `generatedAt` | `optional(number)` | Finalization timestamp |
| `generatedBy` | `id("users")` | Creator |
| `updatedAt` | `number` | Last edit (for draft tracking) |
| **Seller snapshot** | | |
| `sellerName` | `string` | From businessSettings |
| `sellerAddress` | `optional(string)` | |
| `sellerPhone` | `optional(string)` | |
| `sellerEmail` | `optional(string)` | |
| `sellerNpwp` | `optional(string)` | |
| `sellerLogoStorageId` | `optional(id("_storage"))` | |
| `bankName` | `string` | From `bankAccounts.bankName` (e.g. "BCA") |
| `bankAccountNumber` | `string` | From `bankAccounts.accountNumber` |
| `bankAccountName` | `string` | From `bankAccounts.name` (account holder / label, e.g. "PT Malo Group Bahagia") |
| **Buyer snapshot** | | |
| `buyerName` | `string` | Customer name |
| `buyerCompany` | `optional(string)` | |
| `buyerNpwp` | `optional(string)` | |
| `buyerAddress` | `optional(string)` | Billing address |
| `buyerPhone` | `optional(string)` | |
| `poNumber` | `optional(string)` | PO reference |
| **Order snapshot** | | |
| `orderNumber` | `string` | |
| `orderDate` | `number` | |
| `dueDate` | `optional(number)` | |
| `items` | `array(object)` | See exact validator below |
| `subtotal` | `number` | |
| `discountAmount` | `optional(number)` | Computed IDR discount value (resolved from order's `orderLevelDiscount` + `orderLevelDiscountType`) |
| `discountLabel` | `optional(string)` | Human-readable label: "10%" for percentage discounts, omitted for flat amounts |
| `deliveryFee` | `optional(number)` | |
| `finalTotal` | `number` | |
| `paymentStatus` | `string` | |
| `paymentMethod` | `optional(string)` | |
| `notes` | `optional(string)` | Invoice-specific notes |

**Exact Convex validator for `items`:**
```typescript
items: v.array(v.object({
  productName: v.string(),
  variant: v.optional(v.string()),
  qty: v.number(),
  unitPrice: v.number(),
  lineTotal: v.number(),
}))
```

**Indexes:**
- `by_order` → `["orderId"]` — lookup invoices for an order
- `by_status_number` → `["status", "invoiceNumber"]` — lookup finalized invoices by number (drafts have undefined invoiceNumber)
- `by_date` → `["generatedAt"]` — listing/history (forward-looking, not used in v1)

### Modified Table: `customers`

Add 3 optional fields:

| Field | Type |
|-------|------|
| `companyName` | `optional(string)` |
| `npwp` | `optional(string)` |
| `billingAddress` | `optional(string)` |

No new indexes needed (looked up by existing `_id`).

---

## Invoice Numbering

Format: **`INV-YYMM-NNN`** (e.g., `INV-2603-001`)

- `YY` = 2-digit year, `MM` = 2-digit month, `NNN` = 3-digit sequential within that month
- Only assigned on **finalize** — drafts have no invoice number
- **Race-safe numbering** via `invoiceCounters` table: the `finalize` mutation reads the counter for the current YYMM prefix, increments it, and writes back — all within the same Convex transaction (OCC serializes concurrent writes to the same counter document)
- If no counter exists for the current month, create one with `lastNumber: 1`
- Sequential with no gaps within a month (important for Indonesian accounting practice)
- Finalized invoices cannot be deleted or voided. To correct an invoice, create a new revision (next sequential number) for the same order.
- Multiple invoices for the same order get sequential numbers (revision pattern)

---

## Pages & Routes

### New Pages

#### 1. Business Settings — `/settings/business`

- **Access:** Admin only
- **Sections:**
  - Brand Identity: business name + logo upload (Convex `_storage`)
  - Contact Information: address, phone, email (optional)
  - Tax Information: seller NPWP (optional, with non-PKP note)
  - Default Bank Account: radio-select from existing `bankAccounts` table
  - Invoice Header Preview: live preview of how seller info appears on invoices
- **Actions:** Save Settings, Cancel

#### 2. Invoice Form — `/orders/:orderId/invoice`

- **Access:** Manager, Admin
- **Prerequisite:** Order must be in PaymentReceived status or later (PaymentReceived, BeingPrepared, AwaitingDelivery, or Complete). Cancelled orders: can view existing invoices, cannot create new ones.
- **Behavior:**
  - If draft exists for this order → load draft data into form
  - If no draft → auto-fill from order + customer + business settings, create draft record
  - WYSIWYG layout: form IS the invoice
  - Field color coding:
    - Blue: auto-filled from order/customer/settings data
    - Yellow: needs user input (company, NPWP, billing address, PO number)
    - White: user-edited (overridden auto-fill)
  - Auto-saves draft on every field change (debounced 2 seconds)
- **Actions:**
  - Save & Close → persist draft, navigate back to Order Detail
  - Preview → switch to read-only clean render (same page, `?preview` param)
  - Generate Invoice → finalize (snapshot, assign number, update customer, status→final)
  - Cancel → navigate back to Order Detail (draft still saved)

#### 3. Invoice Print View — `/orders/:orderId/invoice/:invoiceNumber`

- **Access:** Manager, Admin
- Clean render of finalized invoice — no form controls, no colored fields
- `@media print` stylesheet for browser print
- **Actions:**
  - Print (Ctrl+P) → `window.print()`
  - Save as PDF → `window.print()` (browser handles PDF conversion)
  - Back to Order → navigate to Order Detail

### Modified Pages

#### Order Detail (`src/pages/OrderDetail.tsx`)

Add an **Invoice card** to the right sidebar with three states:

**State 1 — No Invoice:**
- "No invoice generated for this order"
- "Generate Invoice" button (orange, full-width)

**State 2 — Draft Saved:**
- Draft badge, last edited timestamp, editor name
- "Continue Editing" button + "Discard" button

**State 3 — Finalized:**
- Invoice number badge (e.g., INV-2603-001), generation date, buyer info
- "View" button + "Re-print" button
- "+ New Invoice" link for creating a revision
- If multiple finals exist, show latest prominently with count of older ones

**Visibility:** Invoice card only shown for `manager` and `admin` roles, and only when order status is PaymentReceived or later. `order_staff` sees no invoice UI on Order Detail by design.

---

## Components

### New Components

| Component | Location | Purpose |
|-----------|----------|---------|
| `InvoiceForm` | `src/components/invoice/InvoiceForm.tsx` | WYSIWYG form layout |
| `InvoicePrintView` | `src/components/invoice/InvoicePrintView.tsx` | Clean print layout |
| `InvoiceFieldInput` | `src/components/invoice/InvoiceFieldInput.tsx` | Styled input with auto/new/edited states |
| `InvoiceSidebarCard` | `src/components/invoice/InvoiceSidebarCard.tsx` | Order Detail sidebar card (3 states) |
| `BusinessSettingsForm` | `src/components/settings/BusinessSettingsForm.tsx` | Settings page form |
| `LogoUploader` | `src/components/settings/LogoUploader.tsx` | Image upload + preview |
| `BankAccountSelector` | `src/components/settings/BankAccountSelector.tsx` | Radio card selector |
| `InvoiceHeaderPreview` | `src/components/settings/InvoiceHeaderPreview.tsx` | Live preview block |

### New Hooks

| Hook | Location | Purpose |
|------|----------|---------|
| `useBusinessSettings` | `src/hooks/convex/useBusinessSettings.ts` | Query/mutate business settings |
| `useInvoice` | `src/hooks/convex/useInvoice.ts` | Query/create/update/finalize invoices |

### New Pages

| Page | Location |
|------|----------|
| `BusinessSettingsPage` | `src/pages/BusinessSettings.tsx` |
| `InvoicePage` | `src/pages/InvoicePage.tsx` |

---

## Backend API

### Business Settings (`convex/businessSettings/`)

| Function | Type | Access | Purpose |
|----------|------|--------|---------|
| `queries.get` | Query | admin, manager | Read singleton settings |
| `mutations.upsert` | Mutation | admin | Create or update settings |
| `mutations.generateUploadUrl` | Mutation (`protectedMutation`) | admin | Returns `ctx.storage.generateUploadUrl()` for logo upload |

### Invoices (`convex/invoices/`)

| Function | Type | Access | Purpose |
|----------|------|--------|---------|
| `queries.getByOrder` | Query | admin, manager | All invoices for an order (drafts + finals) |
| `queries.getById` | Query | admin, manager | Single invoice by ID |
| `mutations.createDraft` | Mutation | admin, manager | Auto-fill from order/customer/settings, create draft |
| `mutations.updateDraft` | Mutation | admin, manager | Save field changes (called on debounced auto-save) |
| `mutations.discardDraft` | Mutation | admin, manager | Delete draft record |
| `mutations.finalize` | Mutation | admin, manager | Snapshot data, assign number, status→final, update customer |

### Customer Updates

| Function | Change |
|----------|--------|
| `customers/mutations.ts` | Accept optional `companyName`, `npwp`, `billingAddress` in update |

---

## Workflow

### Invoice Generation Flow

```
Order Detail ──[Generate Invoice]──► Draft exists?
                                        │
                              ┌─── YES ─┤─── NO ───┐
                              │                      │
                         Load Draft          Auto-fill & Create Draft
                              │                      │
                              └──────────┬───────────┘
                                         │
                                  Invoice Form Page
                                  (WYSIWYG, auto-saves)
                                         │
                          ┌──────────────┼──────────────┐
                     Save & Close     Preview      Generate Invoice
                          │              │               │
                    Back to Order   Clean render    Finalize:
                    (draft kept)    (still draft)   - Snapshot all data
                                                   - Assign INV-YYMM-NNN
                                                   - Update customer record
                                                   - status → "final"
                                                          │
                                                    Print View
                                                   (immutable)
```

### Invoice Lifecycle

- **No Invoice** → default state for all orders
- **Draft** → created on first "Generate Invoice" click; editable, auto-saves; one draft per order at a time; can be discarded (deletes record)
- **Final** → immutable; invoice number assigned; data snapshotted; customer record updated with new fields; can create a new invoice for the same order (revision with next sequential number)

**Key rule:** One draft, many finals per order.

### Auto-save Behavior

- Frontend debounces field changes (2 second delay)
- Calls `invoices.updateDraft` mutation with changed fields
- Draft persists across page navigation and browser refresh
- No explicit "save" needed (Save & Close button just navigates back)

### Customer Data Write-back

On finalize, if the buyer has new data (company, NPWP, billing address) that differs from the customer record:
- Update the `customers` record with the new fields
- Next invoice for this customer will auto-fill these fields in blue

---

## Print Approach

- Dedicated `@media print` CSS stylesheet
- **Hides:** navigation, sidebar, action buttons, colored field backgrounds, step indicators, legend
- **Shows:** clean black-on-white invoice with Frollie orange accent bar at top
- `window.print()` triggered by both "Print" and "Save as PDF" buttons
- No external PDF library — browser's native print-to-PDF is sufficient for this use case

---

## Access Control

| Action | Roles |
|--------|-------|
| View Business Settings | admin, manager |
| Edit Business Settings | admin |
| Generate / view / print invoices | manager, admin |
| Discard draft | manager, admin |

**Order status gate:** Invoice generation only available for orders in PaymentReceived status or later (not Draft or AwaitingPayment). Cancelled orders allow viewing existing invoices but not creating new ones.

**Frontend permission keys** (add to `ROLE_PERMISSIONS` in `src/lib/types.ts`):
- `canAccessInvoices` → `true` for manager, admin
- `canAccessBusinessSettings` → `true` for admin

All backend mutations/queries use `protectedMutation` / `protectedQuery` with explicit `roles` arrays (not the old `requireRole` pattern).

---

## Navigation

- Add "Business Settings" link in admin section of sidebar/nav
- Invoice pages accessed from Order Detail (no separate invoice listing page in v1)
- Routes to add to `src/App.tsx`:
  - `/settings/business` → `BusinessSettingsPage`
  - `/orders/:orderId/invoice` → `InvoicePage` (handles form + preview via `?preview` param)
  - `/orders/:orderId/invoice/:invoiceNumber` → `InvoicePage` (finalized print view)

---

## Invoice Layout (Summary)

The invoice follows standard Indonesian commercial invoice format:

1. **Header:** Seller logo + name + address + contact + NPWP (from Business Settings) | "INVOICE" title + invoice number + date
2. **Bill To:** Buyer name, company (optional), NPWP (optional), billing address, phone
3. **Order Details:** Order number, order date (with day name), due date (with day name), PO number (optional)
4. **Items Table:** #, Product name + variant, Qty, Unit Price, Line Total
5. **Totals:** Subtotal, Discount (if any), Delivery Fee (if any), Grand Total
6. **Payment Info:** Bank name, account number, account name, payment status, payment method
7. **Signature/Stamp Area:** Dashed box for authorized signature (Indonesian business convention)
8. **Notes:** Optional free-text notes
9. **Footer:** Thank you message + business name

Date format: Indonesian day name + date (e.g., "Senin, 16 Maret 2026").

---

## Success Criteria

- [ ] `npm run type-check` passes
- [ ] `npm run build` succeeds
- [ ] Business Settings page: saves and loads all fields correctly, logo upload works
- [ ] Invoice form auto-fills from order + customer + business settings
- [ ] Color coding: blue for auto-filled, yellow for needs-input fields
- [ ] Draft auto-save works (debounced 2s, persists across navigation)
- [ ] Draft loads correctly when returning to an order with a saved draft
- [ ] Discard draft deletes the record and returns to "No Invoice" state
- [ ] Preview shows clean read-only view without finalizing
- [ ] Finalize assigns sequential invoice number (`INV-YYMM-NNN`)
- [ ] Finalize snapshots all seller/buyer/order data (immutable record)
- [ ] Customer record updated with company/NPWP/billing address on finalize
- [ ] Next invoice for same customer auto-fills the saved fields
- [ ] Multiple finalized invoices allowed per order (revisions)
- [ ] Print view renders cleanly via `window.print()`
- [ ] Order Detail sidebar shows correct invoice card state (none/draft/final)
- [ ] Access control enforced (admin/manager only, PaymentReceived+ orders only)
- [ ] Invoice numbering is race-safe (concurrent finalizations get unique numbers)
- [ ] Auto-save shows "Saving..." feedback indicator

---

## Visual Mockups

Interactive mockups created during design:
- `docs/mockups/invoice-form-mockup.html` — initial invoice form concept
- `docs/mockups/invoice-settings-mockup.html` — business settings + updated invoice form + print preview (3 tabs)
- `docs/mockups/invoice-workflow-mockup.html` — full workflow, order detail states, invoice lifecycle, screen-by-screen flow (4 tabs)
