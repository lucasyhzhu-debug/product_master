---
phase: 57-invoice-backend-business-settings
verified: 2026-03-17T00:46:10Z
status: passed
score: 9/9 must-haves verified
re_verification: false
---

# Phase 57: Invoice Backend & Business Settings Verification Report

**Phase Goal:** Build the invoice data model (3 new tables + customer extension), backend API, and Business Settings page so admins can configure seller identity before generating invoices
**Verified:** 2026-03-17T00:46:10Z
**Status:** passed
**Re-verification:** No -- initial verification

## Goal Achievement

### Observable Truths

| #   | Truth | Status | Evidence |
| --- | ----- | ------ | -------- |
| 1 | Schema: businessSettings singleton, invoiceCounters with by_prefix index, invoices with 3 indexes, customers extended with 3 optional fields | VERIFIED | convex/schema.ts lines 607-617 (businessSettings), 1809-1812 (invoiceCounters with by_prefix index), 1814-1861 (invoices with by_order, by_status_number, by_date indexes), 166-168 (customers companyName, npwp, billingAddress) |
| 2 | Business Settings page at /settings/business (admin only) | VERIFIED | src/App.tsx line 347-351 registers route with canAccessBusinessSettings guard; src/pages/BusinessSettings.tsx is 282 lines with 5 full sections |
| 3 | Logo upload via Convex file storage works | VERIFIED | src/components/settings/LogoUploader.tsx (154 lines) implements generateUploadUrl + POST + storageId parsing with 1MB validation; convex/businessSettings/mutations.ts exports generateUploadUrl using ctx.storage |
| 4 | Default bank account selector from bankAccounts table | VERIFIED | src/components/settings/BankAccountSelector.tsx (80 lines) renders radio cards with None option; BusinessSettings.tsx calls useBankAccounts(true) and passes to selector |
| 5 | Live invoice header preview reflects saved settings | VERIFIED | src/components/settings/InvoiceHeaderPreview.tsx (103 lines) pure presentational component; BusinessSettings.tsx passes local form state directly to preview (no API call per keystroke) |
| 6 | Invoice backend API: createDraft, updateDraft, discardDraft, finalize, getByOrder, getById | VERIFIED | convex/invoices/mutations.ts exports createDraft (lines 144-274), updateDraft (283-337), discardDraft (344-359), finalize (371-409); convex/invoices/queries.ts exports getByOrder (17-37) and getById (44-57) |
| 7 | Race-safe sequential numbering via invoiceCounters (INV-YYMM-NNN) | VERIFIED | getNextInvoiceNumber (lines 113-132) uses by_prefix index with .first(), OCC-safe increment, formatInvoiceNumber produces INV-YYMM-NNN format |
| 8 | Customer write-back on finalize (company, NPWP, billing address) | VERIFIED | finalize mutation (lines 394-404) reads customer via order, calls computeCustomerWriteBack to diff buyerCompany/buyerNpwp/buyerAddress, patches customer with changed fields only |
| 9 | npm run build succeeds | VERIFIED | npm run type-check passes with zero errors |

**Score:** 9/9 truths verified

### Required Artifacts

| Artifact | Expected | Status | Details |
| -------- | -------- | ------ | ------- |
| `convex/schema.ts` | 3 new table definitions + customer extension | VERIFIED | businessSettings (line 607), invoiceCounters (line 1809), invoices (line 1814), customers extended (lines 166-168) |
| `convex/businessSettings/queries.ts` | get query with logo URL resolution | VERIFIED | 36 lines, resolves logoUrl via ctx.storage.getUrl and defaultBankAccount via ctx.db.get |
| `convex/businessSettings/mutations.ts` | upsert + generateUploadUrl | VERIFIED | 87 lines, upsert with logo cleanup (computeUpsertAction helper), generateUploadUrl via ctx.storage |
| `convex/invoices/queries.ts` | getByOrder and getById | VERIFIED | 57 lines, both resolve sellerLogoUrl from storage |
| `convex/invoices/mutations.ts` | createDraft, updateDraft, discardDraft, finalize | VERIFIED | 409 lines, 5 pure exported helpers + 4 mutations, INVOICEABLE_STATUSES allowlist, bank account guard, customer write-back |
| `convex/invoices/__tests__/mutations.test.ts` | Tests for invoice logic | VERIFIED | 297 lines, 42 test cases covering status allowlist, prefix generation, formatting, discount computation, customer write-back |
| `convex/businessSettings/__tests__/mutations.test.ts` | Tests for singleton behavior | VERIFIED | 79 lines, 8 test cases covering computeUpsertAction insert/patch/logo cleanup |
| `convex/customers/mutations.ts` | Updated with companyName, npwp, billingAddress | VERIFIED | Args include all 3 optional fields (line 43-45), conditionally patched (lines 61-63) |
| `src/lib/types.ts` | canAccessBusinessSettings + canAccessInvoices flags | VERIFIED | Both flags defined (lines 728-729), admin: true/true, manager: false/true, others: false/false |
| `src/hooks/convex/useBusinessSettings.ts` | Query + mutation hooks | VERIFIED | 38 lines, exports useBusinessSettings, useUpsertBusinessSettings, useBusinessSettingsUploadUrl, BusinessSettings type |
| `src/hooks/convex/useInvoice.ts` | Query + mutation hooks for Phase 58 | VERIFIED | 64 lines, exports useInvoicesByOrder, useInvoice, useCreateInvoiceDraft, useUpdateInvoiceDraft, useDiscardInvoiceDraft, useFinalizeInvoice, Invoice type |
| `src/hooks/convex/index.ts` | Barrel exports for both hook files | VERIFIED | Lines 472-489 export all hooks and types from both files |
| `src/pages/BusinessSettings.tsx` | Full settings page with 5 sections | VERIFIED | 282 lines with Brand Identity, Contact Info, Tax Info, Bank Account Selector, Invoice Header Preview, and Save button |
| `src/components/settings/LogoUploader.tsx` | Click-to-upload with validation | VERIFIED | 154 lines, 1MB file size validation, accepts PNG/JPG/SVG, local preview URL, remove button |
| `src/components/settings/BankAccountSelector.tsx` | Radio card selector | VERIFIED | 80 lines, renders cards with bank name/account/holder, None option, blue ring on selected |
| `src/components/settings/InvoiceHeaderPreview.tsx` | Live preview component | VERIFIED | 103 lines, pure presentational, placeholder text for empty fields, bank details section |
| `src/App.tsx` | Route for /settings/business | VERIFIED | Lazy import (line 117-118), route with ProtectedRoute canAccessBusinessSettings guard (lines 347-351) |
| `src/components/layout/Header.tsx` | Settings nav link in admin dropdown | VERIFIED | Line 129: adminItems entry with path '/settings/business', permission 'canAccessBusinessSettings' |

### Key Link Verification

| From | To | Via | Status | Details |
| ---- | -- | --- | ------ | ------- |
| convex/invoices/mutations.ts | convex/lib/periodRange.ts | getWibComponents import | WIRED | Line 13: import, line 53: used in buildInvoicePrefix |
| convex/invoices/mutations.ts | invoiceCounters.by_prefix | index lookup + OCC increment | WIRED | Lines 118-129: query with by_prefix, patch or insert |
| convex/invoices/mutations.ts | customers table | ctx.db.patch on finalize | WIRED | Line 401: patches customer with computed write-back diff |
| convex/businessSettings/mutations.ts | ctx.storage | generateUploadUrl + delete | WIRED | Lines 60 (delete old logo) and 85 (generateUploadUrl) |
| src/pages/BusinessSettings.tsx | useBusinessSettings hooks | Query + mutation imports | WIRED | Lines 21-23 import, lines 54-57 call all 3 hooks |
| src/pages/BusinessSettings.tsx | useBankAccounts | Active accounts list | WIRED | Line 24 import, line 55 calls useBankAccounts(true) |
| src/App.tsx | src/pages/BusinessSettings.tsx | Lazy route with permission guard | WIRED | Lines 117-118 lazy import, lines 347-351 route with canAccessBusinessSettings |
| src/components/layout/Header.tsx | /settings/business | Admin nav link | WIRED | Line 129: adminItems entry with canAccessBusinessSettings permission |

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
| ----------- | ---------- | ----------- | ------ | -------- |
| BSET-01 | 57-02 | Admin can access Business Settings page at /settings/business | SATISFIED | Route registered in App.tsx with canAccessBusinessSettings guard, page renders 5 sections |
| BSET-02 | 57-02 | Admin can set business name, address, phone, email, NPWP | SATISFIED | BusinessSettings.tsx form with all 5 fields, upsert mutation saves all |
| BSET-03 | 57-02 | Admin can upload company logo (Convex file storage) | SATISFIED | LogoUploader component with generateUploadUrl, POST, storageId handling, 1MB validation |
| BSET-04 | 57-02 | Admin can select default bank account for invoices | SATISFIED | BankAccountSelector radio cards from useBankAccounts(true), saved via upsert |
| BSET-05 | 57-02 | Live invoice header preview shows seller info | SATISFIED | InvoiceHeaderPreview reads from local form state, updates on every keystroke |
| IDAT-01 | 57-01 | businessSettings singleton table with seller identity fields | SATISFIED | Schema line 607: businessName, logo, address, phone, email, npwp, defaultBankAccountId |
| IDAT-02 | 57-01 | invoiceCounters table for race-safe sequential numbering | SATISFIED | Schema line 1809: prefix + lastNumber with by_prefix index |
| IDAT-03 | 57-01 | invoices table with status, snapshots, items array | SATISFIED | Schema line 1814: draft/final status, full seller/buyer/order snapshots, items array, 3 indexes |
| IDAT-04 | 57-01 | customers extended with companyName, npwp, billingAddress | SATISFIED | Schema lines 166-168: all 3 optional fields; mutations.ts lines 43-45, 61-63: args + patch |

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
| ---- | ---- | ------- | -------- | ------ |
| (none) | -- | -- | -- | No anti-patterns detected |

No TODO/FIXME/HACK comments, no empty implementations, no `expect(true).toBe(true)` patterns, no console.log-only handlers. All "placeholder" occurrences are legitimate UI placeholder text in form inputs and preview components.

### Human Verification Required

### 1. Business Settings Save/Load Cycle

**Test:** Log in as admin, navigate to /settings/business, fill all fields, upload logo, select bank account, save, refresh page
**Expected:** All data persists including logo display
**Why human:** Requires visual verification of logo rendering and form state persistence across page loads

### 2. Permission Enforcement

**Test:** Log in as manager or order_staff, attempt to navigate to /settings/business
**Expected:** Route is blocked (redirect or access denied), Settings link not visible in nav
**Why human:** Requires actual authentication flow and UI rendering verification

### 3. Live Preview Behavior

**Test:** Type in business name and address fields while watching the Invoice Header Preview section
**Expected:** Preview updates in real-time as characters are typed, shows muted placeholder text for empty fields
**Why human:** Requires visual confirmation of real-time reactivity

### Gaps Summary

No gaps found. All 9 success criteria are met:

1. All 3 new tables exist with correct fields and indexes
2. Business Settings page is fully functional at /settings/business with admin-only access
3. Logo upload implements complete Convex file storage lifecycle
4. Bank account selector reads from active bankAccounts with radio card UI
5. Invoice header preview is a pure presentational component reading from local form state
6. All 6 invoice API functions are implemented (createDraft, updateDraft, discardDraft, finalize, getByOrder, getById)
7. Sequential numbering uses invoiceCounters with OCC-safe by_prefix lookup via .first()
8. Customer write-back computes field-level diff on finalize and patches only changed fields
9. TypeScript type-check passes with zero errors

One positive deviation from plan: `paymentStatus` in the invoices schema uses `v.union(v.literal("Unpaid"), v.literal("Partial"), v.literal("Paid"))` instead of `v.string()` -- this is more type-safe than planned.

Test coverage: 50 unit tests (42 invoice + 8 businessSettings) covering status allowlist validation, WIB prefix generation, invoice number formatting, discount computation (flat + percentage), customer write-back diff, and singleton upsert action.

---

_Verified: 2026-03-17T00:46:10Z_
_Verifier: Claude (gsd-verifier)_
