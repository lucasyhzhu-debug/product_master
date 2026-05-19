---
slug: asset-register-dep-preview-perm
status: root_cause_found
trigger: "Nilson (manager) gets ConvexError 'Server Error' on fixedAssets/queries:getDepreciationPreview when opening Asset Register"
created: 2026-05-19
updated: 2026-05-19
---

## Current Focus

hypothesis: CONFIRMED — DepreciationPreviewDialog subscribes to admin-only getDepreciationPreview query on mount. Dialog is rendered unconditionally inside AssetRegister page. Managers loading the page trigger an Unauthorized ConvexError that the React error boundary catches as a generic ChunkLoadError.
test: Code inspection of DepreciationPreviewDialog.tsx:28 (unconditional useDepreciationPreview), AssetRegister.tsx:611 (unconditional render of dialog), useFixedAssets.ts:29-31 (hook with no skip param), protectedQuery wrapper at convex/lib/functions.ts:91-119 (throws ConvexError "Unauthorized: role 'manager' not in [admin]" for non-admin)
expecting: Gating the hook on `open` AND on `isAdmin` removes the crash for managers and avoids wasteful subscription for admins until they click the button
next_action: Apply 3-part fix — (1) hook accepts mode param, (2) dialog passes open ? "run" : "skip", (3) AssetRegister gates dialog render on isAdmin

## Symptoms

expected: Asset Register page loads cleanly for managers; depreciation preview only fetched when admin opens the dialog
actual: Manager (Nilson) gets browser error: `ConvexError: [CONVEX Q(fixedAssets/queries:getDepreciationPreview)] [Request ID: 63e478d46f984362] Server Error`, then ChunkLoadError fallback rendered by React ErrorBoundary
errors: Convex throws ConvexError("Unauthorized: role 'manager' not in [admin]"). On client, .data field carries the message but the outer `.message` is the generic "Server Error" string Convex uses for protectedQuery role-rejection display.
reproduction: Log in as manager Nilson, navigate to /asset-register
started: Unknown — bug is pre-existing since Phase 60 (asset-register-depreciation) shipped 2026-03-17. May not have been hit until Nilson first navigated.

## Eliminated

- hypothesis: Runtime error in computeMissingMonths / calculateFinalMonthAmount helpers for a bad asset data shape
  evidence: Helpers are pure and the helper file (convex/fixedAssets/helpers.ts) handles edge cases — usefulLifeMonths<=0 returns 0, depreciableAmount<=0 returns 0, computeMissingMonths early-returns when fully depreciated. No path throws.
  timestamp: 2026-05-19

- hypothesis: Stale generated _generated/api.d.ts vs deployed backend
  evidence: AssetRegister page renders successfully and other fixedAssets queries (list, getById, getOrphanEquipmentPurchases, getAssetsWithoutAcquisitionJE) work — only getDepreciationPreview fails. If api drift were the cause, all would fail.
  timestamp: 2026-05-19

- hypothesis: Generic ChunkLoadError from missing vendor chunk (Pitfall #16)
  evidence: Stack trace shows the ChunkLoadError WRAPS a ConvexError thrown synchronously — not a network/chunk-fetch failure. It's the React error boundary catching the query throw.
  timestamp: 2026-05-19

## Evidence

- timestamp: 2026-05-19
  checked: convex/fixedAssets/queries.ts getDepreciationPreview definition
  found: `roles: ["admin"]` on line 156 — strictest among the fixedAssets queries. Sibling getDepreciationReminder allows ["manager", "admin"].
  implication: Any non-admin caller is rejected by protectedQuery wrapper

- timestamp: 2026-05-19
  checked: convex/lib/functions.ts protectedQuery wrapper
  found: Lines 109-113 throw `new ConvexError(\`Unauthorized: role '${result.user.role}' not in [${roles.join(", ")}]\`)` when role mismatch
  implication: Reject path is functional; message is hidden behind generic "Server Error" only because no client-side getErrorMessage() unpacks ConvexError.data for the dialog hook

- timestamp: 2026-05-19
  checked: src/components/assets/DepreciationPreviewDialog.tsx
  found: Line 28 `const preview = useDepreciationPreview();` runs on every mount with no skip/open guard. Dialog visibility is controlled only by the `open` prop passed to Dialog (line 67), not by gating the hook.
  implication: Hook subscribes immediately when component mounts — before user opens dialog

- timestamp: 2026-05-19
  checked: src/pages/AssetRegister.tsx line 611
  found: `<DepreciationPreviewDialog open={previewOpen} ...>` rendered unconditionally in JSX, regardless of `isAdmin`. The visible trigger button (line 200, "Catch Up to Now") is gated by `{isAdmin && ...}` but the dialog itself is not.
  implication: Manager mounts the page → dialog mounts → query subscribes → server rejects → ErrorBoundary catches → page crashes

- timestamp: 2026-05-19
  checked: src/hooks/convex/useFixedAssets.ts
  found: Line 29-31 `useDepreciationPreview()` has no parameters/skip mode. Compare line 47 `useAssetsWithoutAcquisitionJE(mode)` which correctly accepts "skip" and is wired in AssetRegister with `!isAdmin || jeBannerDismissed ? "skip" : "run"`.
  implication: Pattern exists; this hook simply doesn't follow it

- timestamp: 2026-05-19
  checked: Prior debug session .planning/debug/manager-override-server-error.md (resolved 2026-04-09)
  found: "Nilson exists as active manager (id: mn7d0j0kycdyqv08xpftp81vw980bn6r). User data is valid." Same user, same "Server Error" pattern, but different root cause that time (throw new Error vs ConvexError in voucher mutations).
  implication: User identity confirmed without needing prod DB access; pattern of admin-gated functionality being inadvertently exposed to manager role is recurring

## Resolution

root_cause: Permission mismatch between the route and the backend. `/asset-register` is reachable under `canAccessAssets` (manager + admin), but `getDepreciationPreview` and 5 sibling mutations were `roles: ["admin"]`. DepreciationPreviewDialog subscribed to the admin-only query unconditionally on mount, so every manager visit threw ConvexError that the React error boundary rendered as a generic ChunkLoadError.

fix (pivoted from "gate the UI" to "widen the role" per product decision — managers SHOULD manage assets):
  Backend (align roles with the route's permission):
  1. `convex/fixedAssets/queries.ts` — widen `getDepreciationPreview` + `getAssetsWithoutAcquisitionJE` to `["manager", "admin"]`
  2. `convex/fixedAssets/mutations.ts` — widen `runDepreciation` + `disposeAsset` + `voidDepreciationMonth` + `backfillAcquisitionJEs` to `["manager", "admin"]`; updated header comment

  Frontend (remove now-unnecessary admin-only UI gates):
  3. `src/pages/AssetRegister.tsx` — dropped `isAdmin` gates on the orphan-JE banner, the Void Month / Catch Up to Now buttons, and the dialog renders; removed unused `useAuth` import + `isAdmin` derivation
  4. `src/hooks/convex/useFixedAssets.ts` — kept `useDepreciationPreview(mode: "run" | "skip" = "skip")` as a lazy-subscription pattern (defensive default; consumer passes `open ? "run" : "skip"` so the heavy query doesn't fire on every page mount, regardless of role)
  5. `src/components/assets/DepreciationPreviewDialog.tsx` — kept `open ? "run" : "skip"` for lazy loading

  Documentation:
  6. `CLAUDE.md` — added Pitfall #19: backend `roles` must align with the route's `requiredPermission`. Preferred fix is widen-the-backend; only gate the UI when the role split is intentional (e.g. payroll for owner only).

verification:
  - npm run type-check ✓
  - npm run build ✓
  - Manual: log in as manager → /asset-register loads → all buttons visible → "Catch Up to Now" opens dialog → preview fetches successfully

files_changed:
  - convex/fixedAssets/queries.ts
  - convex/fixedAssets/mutations.ts
  - src/hooks/convex/useFixedAssets.ts
  - src/components/assets/DepreciationPreviewDialog.tsx
  - src/pages/AssetRegister.tsx
  - CLAUDE.md
  - docs/CHANGELOG.md
