---
phase: 57-invoice-backend-business-settings
plan: 02
subsystem: ui
tags: [react, business-settings, permissions, hooks, logo-upload, invoice-preview, navigation]

# Dependency graph
requires:
  - phase: 57-01
    provides: businessSettings backend API (get, upsert, generateUploadUrl) and invoices backend API (createDraft, updateDraft, discardDraft, finalize, getByOrder, getById)
  - phase: 41-accounting-foundation
    provides: bankAccounts table for default bank account selector
provides:
  - canAccessBusinessSettings and canAccessInvoices permission flags
  - useBusinessSettings, useUpsertBusinessSettings, useBusinessSettingsUploadUrl hooks
  - useInvoice, useInvoicesByOrder, useCreateInvoiceDraft, useUpdateInvoiceDraft, useDiscardInvoiceDraft, useFinalizeInvoice hooks
  - Business Settings page at /settings/business (admin-only)
  - LogoUploader, BankAccountSelector, InvoiceHeaderPreview components
  - Header nav link for admin dropdown
affects: [58-invoice-form-print-view]

# Tech tracking
tech-stack:
  added: []
  patterns: [click-to-upload with Convex generateUploadUrl, radio card selector for bank accounts, live preview from local form state]

key-files:
  created:
    - src/hooks/convex/useBusinessSettings.ts
    - src/hooks/convex/useInvoice.ts
    - src/pages/BusinessSettings.tsx
    - src/components/settings/LogoUploader.tsx
    - src/components/settings/BankAccountSelector.tsx
    - src/components/settings/InvoiceHeaderPreview.tsx
  modified:
    - src/lib/types.ts
    - src/hooks/convex/index.ts
    - src/App.tsx
    - src/components/layout/Header.tsx

key-decisions:
  - "Empty successMessage on createDraft/updateDraft hooks (auto-save feedback deferred to Phase 58 UI, not via toasts)"
  - "Live preview reads from local form state (no API call per keystroke)"
  - "Logo upload validates 1MB max client-side before POST"

patterns-established:
  - "Settings page pattern: single-scroll stacked Card sections with live preview at bottom"
  - "Click-to-upload pattern: hidden file input, Convex generateUploadUrl, POST with Content-Type, parse storageId from JSON response"

requirements-completed: [BSET-01, BSET-02, BSET-03, BSET-04, BSET-05]

# Metrics
duration: 5min
completed: 2026-03-17
---

# Phase 57 Plan 02: Business Settings UI Summary

**Admin Business Settings page with logo upload, bank account selector, live invoice header preview, 2 permission flags, and 8 new hook exports for Phase 58 consumption**

## Performance

- **Duration:** 5 min
- **Started:** 2026-03-17T20:00:00Z
- **Completed:** 2026-03-17T20:05:00Z
- **Tasks:** 3 (2 auto + 1 checkpoint)
- **Files modified:** 11

## Accomplishments
- Added canAccessBusinessSettings (admin-only) and canAccessInvoices (manager+admin) permission flags to ROLE_PERMISSIONS
- Created useBusinessSettings and useInvoice hook files with 3 and 6 exports respectively, all wired through barrel index
- Built Business Settings page with 5 sections: Brand Identity (name + logo), Contact Info (address/phone/email), Tax Info (NPWP), Default Bank Account (radio card selector), and Invoice Header Preview (live)
- Registered /settings/business route with canAccessBusinessSettings guard and Settings nav link in admin dropdown

## Task Commits

Each task was committed atomically:

1. **Task 1: Permissions, hooks, and barrel exports** - `8e14588` (feat)
2. **Task 2: Business Settings page, components, route, and nav link** - `86cb138` (feat)
3. **Task 3: Checkpoint -- Human Verification** - approved (no commit)

## Files Created/Modified
- `src/lib/types.ts` - Added canAccessBusinessSettings and canAccessInvoices to ROLE_PERMISSIONS
- `src/hooks/convex/useBusinessSettings.ts` - Query + mutation hooks for business settings (get, upsert, generateUploadUrl)
- `src/hooks/convex/useInvoice.ts` - Query + mutation hooks for invoices (getByOrder, getById, createDraft, updateDraft, discardDraft, finalize)
- `src/hooks/convex/index.ts` - Barrel exports for both new hook files
- `src/pages/BusinessSettings.tsx` - Full settings page with 5 stacked sections and save button
- `src/components/settings/LogoUploader.tsx` - Click-to-upload with 1MB validation, Convex storage, remove button
- `src/components/settings/BankAccountSelector.tsx` - Radio card selector for active bank accounts with "None" option
- `src/components/settings/InvoiceHeaderPreview.tsx` - Live preview card mirroring invoice header layout
- `src/App.tsx` - Lazy-loaded route for /settings/business with canAccessBusinessSettings guard
- `src/components/layout/Header.tsx` - Settings nav link in admin dropdown with Settings icon
- `convex/_generated/api.d.ts` - Auto-generated (updated by Convex)

## Decisions Made
- Empty successMessage on createDraft and updateDraft hooks -- auto-save toasts would be noisy; Phase 58 will handle feedback via UI state
- Live preview reads from local form state rather than making API calls per keystroke
- Logo upload validates 1MB max on client side before POST to Convex upload URL

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- All Business Settings UI complete and human-verified
- Invoice hooks ready for Phase 58 consumption (InvoiceForm, PrintView, OrderDetail integration)
- Phase 57 fully complete (both Plan 01 backend and Plan 02 frontend)
- `npm run build` passes

## Self-Check: PASSED

All 10 created/modified files verified present. Both task commits (8e14588, 86cb138) verified in git history.

---
*Phase: 57-invoice-backend-business-settings*
*Completed: 2026-03-17*
