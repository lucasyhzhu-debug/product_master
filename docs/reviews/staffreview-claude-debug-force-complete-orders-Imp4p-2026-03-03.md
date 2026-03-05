# Staff Review: debug-force-complete-orders-Imp4p

**Date:** 2026-03-03
**Branch:** `claude/debug-force-complete-orders-Imp4p`
**Reviewer:** Principal Engineer (AI)
**Scope:** Root cause correctness, architectural risks, broader impact of the SessionProvider sync fix.

---

## Summary of Changes

Three files changed, one file added:

| File | Change |
|------|--------|
| `src/lib/sessionBridge.ts` | NEW — module-level ref that bridges `SessionProvider` setter to `AuthContext` |
| `src/main.tsx` | Import bridge; assign `sessionSetterRef.current = setValue` inside `useLocalStorage` |
| `src/contexts/AuthContext.tsx` | Call `sessionSetterRef.current()` on login, logout, mount-restore, and server-side session invalidation |

---

## 1. Root Cause Assessment

### Is the confirmed root cause correct?

**Yes. This is the correct root cause, correctly diagnosed.**

The problem is a classic React state closure / sibling-state divergence issue:

1. `SessionProvider` holds its session ID in React state initialized via `useState` lazy initializer, which reads `localStorage["malo_session_id"]` at mount time.
2. After logout, `AuthContext` clears `localStorage["malo_session_id"]`, so on next login, `SessionProvider`'s lazy initializer finds nothing and generates a random UUID via `crypto.randomUUID()`.
3. `AuthContext.login()` then writes the real auth token to `localStorage` via `setItem()` — but this is a direct DOM API call, **not** a React state setter call. `SessionProvider`'s React state remains the stale UUID.
4. `useSessionMutation` captures `sessionId` from `SessionContext` (which is the stale UUID) via a `useMemo` closure (confirmed in `convex-helpers/react/sessions.ts` line 302: `sessionId: sessionId || (await sessionIdPromise)`). It injects this UUID as the `sessionId` arg.
5. `protectedMutation` calls `getSessionUser(ctx, sessionId)` — the UUID does not match any row in the `sessions` table — `getSessionUser` returns `null` — `protectedMutation` throws `ConvexError("Unauthorized")` — which surfaces as the reported "Server Error Called by client".

This matches the symptom precisely. The prior fix on 2026-03-02 (changing `throw new Error` to `throw new ConvexError` in `statusUpdates.ts`) was indeed a symptom fix: it made validation errors more legible but did not address the auth failure path.

### Was the prior session (2026-03-02) fix a duplicate / conflicting change?

No conflict. The `ConvexError` fix in `statusUpdates.ts` is independently correct and already merged. It addresses a different code path (handler-body validation errors, not the auth layer). Both fixes are needed and complementary.

---

## 2. Architecture Assessment: Module-Level Ref Bridge Pattern

### Is this pattern appropriate?

**Conditionally yes — it is the minimal-viable fix for the constraint, but it carries risks that should be documented.**

**Why it was chosen:**

`SessionProvider` and `AuthProvider` are siblings in the component tree (both children of `ConvexProvider`). React's built-in mechanisms for sharing state between siblings are:
1. Lift state to common parent — requires restructuring `main.tsx` significantly
2. Use a React Context shared between them — requires a new context and a third provider wrapper
3. Use a module-level singleton — the approach taken here

Option 3 is the lowest-risk-to-implement option given the constraint that `useLocalStorage` is passed as a prop to `SessionProvider` and is the only hook that has access to `setSessionId`. The module-level ref is a well-understood pattern for "escape hatch" imperative communication in React (similar to how `ref` objects work but at module scope).

**Risks and limitations:**

1. **Multiple `SessionProvider` instances would share a single ref** — not a real risk here since `SessionProvider` is only mounted once at the root, but it is an implicit assumption. If tests mount multiple providers, `sessionSetterRef.current` would always point to the most-recently-mounted one.

2. **Assignment happens on every render of `useLocalStorage`** — `sessionSetterRef.current = setValue` is set unconditionally in the body of `useLocalStorage` (line 61 of `main.tsx`). This is a side effect in the render body, which React StrictMode will execute twice during development (React 18+ double-invoke behavior). Since the assignment is idempotent (always sets to the same `setValue` function identity for the same component instance), StrictMode double-invoke is harmless here. However, this is an unconventional pattern: React convention is that render bodies should be pure / free of side effects. The assignment should be inside a `useEffect` or use `useRef` to be conventional. In practice it is harmless because the value assigned is always the hook's own closure-stable `setValue` (wrapped in `useCallback`), so repeated assignment is idempotent.

3. **Race condition on initial mount** — When the page loads with an existing auth session in `localStorage`, the execution order is:
   - `SessionProvider` renders, calls `useLocalStorage`, `sessionSetterRef.current = setValue`
   - `SessionProvider`'s `useState` lazy initializer reads `localStorage["malo_session_id"]` and finds the auth token — so `sessionId` is already correct
   - `AuthProvider` renders, `useEffect` fires (async, after paint) calling `sessionSetterRef.current(parsed.token)`

   On page load with existing session, there is no stale state issue. The `sessionSetterRef.current()` call in the mount `useEffect` is redundant but harmless. This was correctly analyzed in the debug plan.

4. **No TypeScript type narrowing for "not yet assigned" state** — `sessionSetterRef.current` is initialized to a no-op `(_id: SessionId | undefined) => {}` in `sessionBridge.ts`. This means if `AuthContext` somehow calls it before `SessionProvider` mounts (impossible in the current tree, but possible in tests), the call silently does nothing. This is safe-by-default behavior, but could cause confusing test failures.

5. **Tight coupling via shared module state** — The bridge introduces an implicit dependency between `main.tsx` (which assigns the setter) and `AuthContext.tsx` (which calls it). This coupling is not visible in the component tree or TypeScript types. Future refactors that move `SessionProvider` or `AuthContext` might not notice this dependency. The docstring in `sessionBridge.ts` is excellent and mitigates this risk considerably.

---

## 3. Broader Impact: Which Mutations / Queries Are Affected

### All `protectedMutation` usages (backend)

The following Convex mutations use `protectedMutation` and therefore require a valid `sessionId` from `SessionProvider`:

| File | Mutations |
|------|-----------|
| `convex/customers/mutations.ts` | `create`, `update`, `remove` |
| `convex/orders/mutations/statusUpdates.ts` | `forceComplete` |
| `convex/productionRecipes/mutations.ts` | `addSubComponent`, `removeSubComponent`, `updateSubComponentQuantity`, `addIngredient`, `removeIngredient`, `updateIngredientQuantity` |
| `convex/materials/mutations.ts` | `create`, `update`, `remove` |
| `convex/ingredients/mutations.ts` | `create`, `update`, `remove` |
| `convex/storageLocations/mutations.ts` | `create`, `update`, `remove` |

**All of these had the same stale-sessionId vulnerability.** The `forceComplete` mutation was discovered first because it was being actively tested in the bug report — but a manager or admin who logged out and back in (same tab, no page refresh) would have experienced silent failures on any of these operations.

### All `protectedQuery` usages (backend)

`protectedQuery` is defined in `convex/lib/functions.ts` but has **zero usages** in the rest of the `convex/` directory. This is verified by grep. Therefore, no queries are currently affected.

### All `useSessionMutation` usages (frontend)

Frontend callers that use `useSessionMutation` (directly or via `createMutationHook`):

| File | Hooks / Mutations |
|------|-------------------|
| `src/hooks/convex/useOrders.ts` | `useForceComplete` → `forceComplete` |
| `src/hooks/convex/useProductionRecipes.ts` | `useAddSubComponent`, `useRemoveSubComponent`, `useUpdateSubComponentQuantity`, `useAddIngredient`, `useRemoveIngredient`, `useUpdateIngredientQuantity` |
| `src/components/inventory/FinishedGoodsTab.tsx` | `updateLocationTypeMut` → `storageLocations.mutations.update` |
| `src/hooks/convex/createMutationHook.ts` | Factory used by `useCustomers`, `useIngredients`, `useStorageLocations` |
| `src/hooks/convex/useCustomers.ts` | `useCreateCustomer`, `useUpdateCustomer`, `useDeleteCustomer` |
| `src/hooks/convex/useIngredients.ts` | `useCreateIngredient`, `useUpdateIngredient`, `useDeleteIngredient` |
| `src/hooks/convex/useStorageLocations.ts` | `useCreateStorageLocation`, `useUpdateStorageLocation`, `useDeleteStorageLocation` |

All of these are now fixed by the bridge, since they all draw `sessionId` from the same `SessionContext` that `sessionSetterRef.current()` now keeps in sync.

### `useSessionQuery` usages

`useSessionQuery` is referenced only once in the codebase, in a comment in `AuthContext.tsx` (line 14). There are **no actual usages** of `useSessionQuery` in the frontend. This is correct and consistent — `protectedQuery` is also unused on the backend. Queries do not require auth in this codebase.

---

## 4. Correctness of the Fix at Each Auth Lifecycle Event

| Event | Before Fix | After Fix |
|-------|-----------|-----------|
| Page load with existing session | SessionProvider reads correct token from localStorage via lazy init. No issue. | Same behavior + redundant but harmless `sessionSetterRef.current()` call in useEffect. |
| Page load with no session (first time) | SessionProvider generates UUID. No protectedMutations attempted before login. No issue. | Same behavior. |
| Same-tab login (after logout) | SessionProvider holds stale UUID. `useSessionMutation` injects UUID. `getSessionUser` returns null. ConvexError("Unauthorized"). **BROKEN.** | `sessionSetterRef.current(authSession.token)` updates SessionProvider state. `useSessionMutation` injects correct token. **FIXED.** |
| Logout | SessionProvider still holds auth token. Any subsequent protectedMutation call on a new session would use the old token (token is now invalid on server, so `getSessionUser` returns null anyway — harmless but not ideal). | `sessionSetterRef.current(undefined)` clears SessionProvider state. `useSessionMutation` blocks on `sessionIdPromise` (which never resolves until new login). Clean state. |
| Server-side session invalidation (token expired/revoked) | `validationResult.valid === false` detected. `AUTH_STORAGE_KEY` and `SESSION_ID_KEY` cleared from localStorage. SessionProvider state not updated — stale valid-looking token still in React state. Any pending mutations might still fire with it (they'll fail on server, but silently). | `sessionSetterRef.current(undefined)` clears SessionProvider state. Clean state. |

---

## 5. Issues Found

### Critical

None. The fix correctly addresses the root cause.

### Important

**I-1: Side effect in render body (StrictMode concern)**

`sessionSetterRef.current = setValue;` is placed in the body of `useLocalStorage`, which runs during render. React's rule of pure renders discourages side effects in render bodies. While this assignment is idempotent in production, in React StrictMode (which this app uses — confirmed in `main.tsx` line 67), render functions are called twice to detect impure renders. Since the second invocation assigns the same value, it is harmless in practice. But a future maintainer may be confused by a side effect in a render body that is not a hook.

**Recommendation:** Move the assignment into a `useEffect` with no deps array (runs after every render, safe for this case) or use `useLayoutEffect`. This removes the subtle StrictMode concern and makes the intent clearer.

```typescript
// In useLocalStorage, replace the render-body assignment:
useEffect(() => {
  sessionSetterRef.current = setValue;
});
```

This is a low-urgency change since the current code is functionally correct.

**I-2: `useSessionMutation` closure captures stale `sessionId` in existing hook instances**

Looking at `convex-helpers/react/sessions.ts` lines 295-316, `useSessionMutation` returns a `useMemo`-derived function that captures `sessionId` at the time of the last render. After `sessionSetterRef.current(token)` is called, React will re-render `SessionProvider` with the new `sessionId`, which will re-render `AuthProvider` and all downstream components, which will re-execute `useMemo` in `useSessionMutation` — picking up the new `sessionId`. This is correct React behavior.

However, there is a narrow window between when `sessionSetterRef.current(token)` is called and when the re-render completes where a concurrent mutation call would still use the old `sessionId`. In practice this window is a single JS event loop tick (React batches state updates in React 18+), but it is worth noting that `login()` calls `sessionSetterRef.current()` before `setSession()` — which means the `SessionProvider` re-render with the correct token is triggered first, before `AuthContext` re-renders. This ordering is correct.

**I-3: No `useSessionQuery` usage, but code style doc shows manual token-passing as the auth pattern**

`docs/CODE_STYLE.md` (lines 280-303) documents the **old pattern** for protected mutations: pass `token: v.string()` in args and use `useMutation` + manual `user.token` injection. The new pattern (`protectedMutation` + `useSessionMutation`) is not documented in `CODE_STYLE.md`. This creates a discoverability gap: new developers writing mutations that need auth may follow the old documented pattern (adding `token` args manually) instead of using `protectedMutation`.

**Recommendation:** After this fix is merged, update `docs/CODE_STYLE.md` to document the `protectedMutation` + `useSessionMutation` pattern as the preferred approach.

### Minor

**m-1: Expired session edge case leaves SessionProvider with undefined**

When `sessionSetterRef.current(undefined)` is called for an expired session on mount (line 65 of `AuthContext.tsx`), `SessionProvider` state becomes `undefined`. Looking at `convex-helpers/react/sessions.ts` line 368: `if (!ctx.ssrFriendly && ctx.sessionId === undefined) throw new Error("Session ID invalid. Clear your storage?")`.

This would throw inside `useSessionId()` — which is called by `useSessionMutation`. This would surface as a React error boundary crash, not a graceful "please log in" state.

However, this path only triggers when `sessionSetterRef.current(undefined)` is called. Looking at the fix:
- Line 65 in `AuthContext.tsx`: Called when stored session is expired at page load — at this point, `SessionProvider` was initialized with the expired token as `initialValue` (since it was in localStorage at mount time), so `sessionId !== undefined` in `SessionProvider`. The `sessionSetterRef.current(undefined)` call clears it post-hoc.
- The `useSessionId` throw would only occur if a component tries to call `useSessionMutation` after the session is cleared but before the login redirect happens.

This is a pre-existing risk that the fix does not worsen (the old behavior was: SessionProvider holds expired token, mutations fire with it, server rejects them — arguably worse). The new behavior: SessionProvider holds undefined, `useSessionMutation` throws at hook call site. Whether this hits an error boundary depends on component structure.

**Recommendation:** This is worth noting but not blocking. The app's `ProtectedRoute` component should handle the `isAuthenticated: false` state before any protected mutations are callable.

**m-2: `sessionBridge.ts` comment says "useSessionQuery" but that hook is not used**

Line 14 of `AuthContext.tsx`:
```
// token here, useSessionMutation/useSessionQuery will automatically
```

`useSessionQuery` is not used anywhere in the frontend. This is a minor comment inaccuracy.

### Nitpick

**n-1: `useSessionMutation` captures `sessionIdPromise` but the bridge bypasses it**

`useSessionMutation` in convex-helpers (line 302) uses `sessionId || (await sessionIdPromise)` — if `sessionId` is falsy, it awaits a promise. With the bridge, `sessionId` will always be set before `useSessionMutation` fires (because `sessionSetterRef.current` triggers a re-render synchronously via React state). The `sessionIdPromise` fallback path is never needed. No action required, just an observation.

**n-2: `forceComplete` `moveForward` `moveBackward` `expediteOrder` use `v.optional(v.string())` for `token`**

These mutations accept `token: v.optional(v.string())` (not enforced via `protectedMutation`) but resolve `userId` from the token. They do not throw if token is missing — they just log the transition with `userId: undefined`. This inconsistency (some mutations use `protectedMutation`, others use ad-hoc optional token) predates this fix and is out of scope here.

---

## 6. Test Coverage Gap

There are no automated tests covering the logout→login→protectedMutation flow. The fix is verified only by:
1. TypeScript type check (`npm run type-check`)
2. Build (`npm run build`)
3. Manual verification (not yet confirmed per the debug plan status: "verifying")

**Recommendation:** Add a unit test that:
1. Mounts `SessionProvider` with a custom `useStorage` hook
2. Simulates logout (clear storage, call setter with undefined)
3. Simulates login (call setter with a new token)
4. Asserts that `useSessionMutation`'s captured `sessionId` matches the new token

This would prevent regression of the root cause.

---

## 7. Code Quality

**Positive observations:**

1. The `sessionBridge.ts` file is exceptionally well-documented. The docstring explains the problem, the fix, and the architectural tradeoff clearly. This is the correct level of documentation for a non-obvious pattern.

2. The no-op default `(_id: SessionId | undefined) => {}` in `sessionBridge.ts` is a safe fallback — calls before `SessionProvider` mounts silently do nothing rather than throwing.

3. The fix covers all four auth lifecycle events: login, logout, mount-restore, and server-side invalidation. This is complete coverage.

4. The auth token is correctly cast to `SessionId` (`parsed.token as SessionId`) — `SessionId` is a branded string type from convex-helpers, and the token string is the correct value to use as the session identifier.

5. Comments at each `sessionSetterRef.current()` call site explain exactly why the call is needed. No guesswork for future maintainers.

---

## 8. Recommendation

**Approve with minor follow-ups:**

1. (Important) Move `sessionSetterRef.current = setValue` into a `useEffect` to comply with React's pure-render convention.
2. (Important) Update `docs/CODE_STYLE.md` to document `protectedMutation` + `useSessionMutation` as the current auth pattern for new mutations.
3. (Minor) Add an automated test for the logout→login→mutation flow.
4. (Nitpick) Fix the comment mentioning `useSessionQuery` in `AuthContext.tsx` line 14.

None of these are blocking for merge. The fix is correct, targeted, minimal-impact, and fully covers the affected surface area (all six `protectedMutation` backends and all `useSessionMutation` frontends).

---

## Affected Surface Area Summary

**Backend mutations using `protectedMutation` (all fixed):**
- `convex/customers/mutations.ts`: `create`, `update`, `remove`
- `convex/orders/mutations/statusUpdates.ts`: `forceComplete`
- `convex/productionRecipes/mutations.ts`: `addSubComponent`, `removeSubComponent`, `updateSubComponentQuantity`, `addIngredient`, `removeIngredient`, `updateIngredientQuantity`
- `convex/materials/mutations.ts`: `create`, `update`, `remove`
- `convex/ingredients/mutations.ts`: `create`, `update`, `remove`
- `convex/storageLocations/mutations.ts`: `create`, `update`, `remove`

**Frontend hooks using `useSessionMutation` (all fixed):**
- `src/hooks/convex/useOrders.ts`: `useForceComplete`
- `src/hooks/convex/useProductionRecipes.ts`: 6 hooks
- `src/hooks/convex/useCustomers.ts`: 3 hooks (via `createMutationHook`)
- `src/hooks/convex/useIngredients.ts`: multiple hooks (via `createMutationHook`)
- `src/hooks/convex/useStorageLocations.ts`: 3 hooks (via `createMutationHook`)
- `src/components/inventory/FinishedGoodsTab.tsx`: `updateLocationTypeMut`

**Backend queries using `protectedQuery`:** Zero. No queries affected.

**`useSessionQuery` usages:** Zero. Not applicable.

**Other imports of `sessionSetterRef`:** Only `src/contexts/AuthContext.tsx` and `src/main.tsx`. No broken imports elsewhere.

---

*Review completed 2026-03-03*
