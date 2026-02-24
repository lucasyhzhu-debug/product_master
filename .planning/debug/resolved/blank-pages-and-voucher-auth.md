---
status: resolved
trigger: "Investigate two production bugs: blank-page-on-navigation and manager-override-voucher-broken"
created: 2026-02-24T00:00:00Z
updated: 2026-02-24T00:10:00Z
---

## Current Focus

hypothesis: Both bugs confirmed and fixed
test: npm run build passed, npm run type-check passed
expecting: Deploy to production resolves both symptoms
next_action: Archive and commit

## Symptoms

expected: (1) Nav links load pages normally; (2) Manager Override dialog submit creates voucher
actual: (1) Blank page — no content, no spinner, no error. Hard refresh fixes.; (2) Submit button does nothing
errors: No console errors for blank page; suspected auth error for voucher
reproduction: (1) Click Orders nav after new deploy (stale chunks); (2) Open Manager Override dialog, type short reason like "b2b", click submit
started: (1) After Phase 23 deploy (lazy routes); (2) After Phase 25 deploy

## Eliminated

- hypothesis: useSessionMutation migration broke voucher auth
  evidence: useVouchers.ts and useProtectedMutation.ts were NOT touched in Phase 25. Backend createManagerOverride uses requireRole(ctx, args.token, ...) and frontend uses useProtectedMutation — both still use old token pattern. Chain is intact.
  timestamp: 2026-02-24T00:05:00Z

- hypothesis: (api as any).vouchers returns undefined
  evidence: Convex API proxy maps dotted access to slash-separated module paths. api.vouchers.mutations.createManagerOverride correctly resolves to vouchers/mutations.createManagerOverride via proxy.
  timestamp: 2026-02-24T00:05:00Z

- hypothesis: canCreateOverrideVoucher false for admin/manager users
  evidence: types.ts confirms canCreateOverrideVoucher: true for both manager and admin roles.
  timestamp: 2026-02-24T00:06:00Z

## Evidence

- timestamp: 2026-02-24T00:01:00Z
  checked: ChunkErrorBoundary.tsx render() method
  found: render() only shows error UI when (error && retried) BOTH true. On first error, getDerivedStateFromError sets {error} but retried=false, so render() returns children — blank flash before componentDidCatch fires.
  implication: Any error causes brief blank render before error handling kicks in.

- timestamp: 2026-02-24T00:02:00Z
  checked: ChunkErrorBoundary.tsx isDeployDrift detection strings
  found: Only checks Chrome strings: "Failed to fetch dynamically imported module" and "Importing a module script failed". Missing: Safari "Load failed", Firefox "error loading dynamically imported module".
  implication: On Safari/Firefox, deploy drift is treated as transient failure. Retry fires instead of auto-reload. User may see persistent blank or "Please reload" after retry fails.

- timestamp: 2026-02-24T00:02:00Z
  checked: RouteLoadingFallback.tsx
  found: Returns null for first 200ms, then shows spinner. During the ChunkErrorBoundary retry window (children re-rendered), Suspense shows null fallback — contributing to blank appearance.
  implication: Combined with boundary render bug, user sees blank for 200ms+ on every chunk load failure.

- timestamp: 2026-02-24T00:03:00Z
  checked: useVouchers.ts, convex/vouchers/mutations.ts, useProtectedMutation.ts
  found: createManagerOverride uses requireRole(ctx, args.token, ["admin", "manager"]). Frontend useCreateManagerOverride uses useProtectedMutation which injects user.token. Chain unchanged from before Phase 25. No auth regression.
  implication: Bug 2 is NOT an auth issue.

- timestamp: 2026-02-24T00:04:00Z
  checked: ManagerOverrideDialog.tsx isValid condition and button disabled state
  found: isValid requires reason.trim().length >= 5. Button has disabled={!isValid || isSubmitting}. No visible validation error message is shown when reason is too short. User sees button that appears to do nothing when disabled.
  implication: Bug 2 is a UX issue — button silently disabled when reason < 5 chars. User has no feedback about what's wrong.

- timestamp: 2026-02-24T00:04:00Z
  checked: OrderCreate.tsx Manager Override button condition
  found: {canCreateOverride && !appliedVoucher && subtotal > 0} — button correctly shows for admin/manager. Dialog opens correctly (confirmed by screenshot).
  implication: The "button to open dialog not clickable" part of bug report may refer to a valid scenario (already has voucher applied) not a code bug.

## Resolution

root_cause: |
  BUG 1: ChunkErrorBoundary had two compounding issues:
  (a) render() logic only showed error UI when error&&retried BOTH true. On first error (retried=false), render() returned children — a blank flash lasting until componentDidCatch fired. The "retry" pattern using getDerivedStateFromError+setState is also unreliable because React lazy caches rejected import() promises, causing the same error to re-throw synchronously and potentially loop.
  (b) isDeployDrift detection only checked Chromium/Chrome error strings. Safari emits "Load failed" and Firefox emits "error loading dynamically imported module" — neither matched, causing these browsers to hit the retry path instead of auto-reload. Result: Safari/Firefox users see blank page after a new deploy with no automatic recovery.

  BUG 2: ManagerOverrideDialog submit button has disabled={!isValid || isSubmitting}. The isValid check requires reason.trim().length >= 5, but the dialog showed no inline validation message when the reason was too short (e.g. "b2b" = 3 chars). Users saw a silently disabled button with no explanation, matching the "does nothing" symptom.

fix: |
  BUG 1 (src/components/shared/ChunkErrorBoundary.tsx):
  - Removed the "retry once" pattern entirely (unreliable with cached failed imports)
  - render() now shows error UI immediately whenever error is set (no retried flag needed)
  - For deploy drift: returns null (page is about to reload anyway)
  - For other errors: shows "Please reload" button as before
  - Expanded isDeployDrift detection to cover all major browsers:
    Chrome/Edge: "Failed to fetch dynamically imported module"
    Safari: "Importing a module script failed" + "Load failed"
    Firefox: "error loading dynamically imported module"
    Generic fallback: "dynamically imported module"

  BUG 2 (src/components/orders/ManagerOverrideDialog.tsx):
  - Added inline validation hint below reason textarea
  - When reason has been typed but is < 5 chars: shows red "Reason must be at least 5 characters (N/5)"
  - When reason is empty or valid: shows normal muted helper text
  - Button disable logic unchanged — the hint explains WHY it's disabled

verification: |
  - npm run type-check: PASSED (no TypeScript errors)
  - npm run build: PASSED (all chunks within size limits, 0 type errors)
  - ChunkErrorBoundary: no longer needs retried state, simpler logic
  - ManagerOverrideDialog: inline character count hint added

files_changed:
  - src/components/shared/ChunkErrorBoundary.tsx
  - src/components/orders/ManagerOverrideDialog.tsx
