---
status: verifying
trigger: "Force Complete orders mutation is failing with a Convex server error when clicking the 'Force Complete' button in the order detail dialog."
created: 2026-03-03T00:00:00Z
updated: 2026-03-03T01:00:00Z
---

## Current Focus

hypothesis: CONFIRMED - SessionProvider.sessionId was stale after login (held random UUID instead of auth token), causing protectedMutation auth to fail with ConvexError("Unauthorized"), surfacing as "Server Error Called by client"
test: Fix applied - sessionSetterRef bridge syncs SessionProvider state after login/logout
expecting: forceComplete (and all protectedMutation calls) to succeed after login
next_action: Human verification that force-complete works after the fix

## Symptoms

expected: Clicking "Force Complete" button should force-complete the order, transitioning it to a completed state regardless of current progress.
actual: The Force Complete dialog appears correctly, but when the user clicks the "Force Complete" button, a server error is thrown
errors: "[CONVEX M(orders/mutations/statusUpdates:forceComplete)] [Request ID: e6b1ea7904a51bed] Server Error Called by client"
reproduction: Open an order detail page, click the Force Complete option, confirm in the dialog. Error occurs immediately.
started: Since feature was added (commit 99edc3a). Never worked.

## Eliminated

- hypothesis: Runtime error in forceComplete handler body (wrong schema field, null access, etc.)
  evidence: TypeScript compiles clean, all schema fields validated as correct, handler logic traced step-by-step with no issues found
  timestamp: 2026-03-03T00:30:00Z

- hypothesis: Import or circular dependency causing module load failure
  evidence: Other mutations in the same file (updateStatus, moveForward, etc.) would also fail if imports were broken; TypeScript confirms all imports resolve
  timestamp: 2026-03-03T00:35:00Z

- hypothesis: ConvexError vs Error distinction causing display issue
  evidence: Confirmed via Convex browser.bundle.js source: ALL server errors (including ConvexError) surface to client as "[CONVEX M(...)] Server Error Called by client" - ConvexError.data holds the actual message separately
  timestamp: 2026-03-03T00:40:00Z

## Evidence

- timestamp: 2026-03-03T00:00:00Z
  checked: convex/orders/mutations/statusUpdates.ts, convex/lib/functions.ts
  found: forceComplete uses protectedMutation which requires sessionId (from SessionProvider) + roles metadata
  implication: If sessionId sent by client doesn't match a session in the DB, getSessionUser returns null → ConvexError("Unauthorized")

- timestamp: 2026-03-03T00:10:00Z
  checked: src/main.tsx useLocalStorage hook, convex-helpers/react/sessions.ts SessionProvider source
  found: SessionProvider initializes sessionId from localStorage["malo_session_id"]. If key is EMPTY (first login / after logout), SessionProvider.idGen() generates a RANDOM UUID and writes it. SessionProvider.sessionId = randomUUID.
  implication: After logout, malo_session_id is cleared. On next login, SessionProvider has randomUUID as its state.

- timestamp: 2026-03-03T00:15:00Z
  checked: src/contexts/AuthContext.tsx login() function
  found: AuthContext.login() writes authSession.token directly to localStorage["malo_session_id"] via setItem(). Does NOT call SessionProvider's React state setter (setValue). SessionProvider's React state remains stale (randomUUID).
  implication: useSessionMutation sends randomUUID as sessionId. getSessionUser looks up randomUUID in sessions table → NOT FOUND → returns null → ConvexError("Unauthorized")

- timestamp: 2026-03-03T00:20:00Z
  checked: Convex browser.bundle.js createHybridErrorStacktrace function
  found: Error message format is "[CONVEX M(path)] ${result.errorMessage}\nCalled by client" where errorMessage = "Server Error" for ALL errors (both ConvexError and plain Error). ConvexError.data has "Unauthorized".
  implication: Confirms that ConvexError("Unauthorized") would produce exactly the error message in the bug report.

- timestamp: 2026-03-03T00:25:00Z
  checked: Why forceComplete specifically fails but other mutations seem to work
  found: Most other order mutations (create, cancel, moveForward, updateStatus) use plain mutation(), NOT protectedMutation. Only forceComplete, customers.create/update/delete, and productionRecipes.* use protectedMutation. These would ALL fail post-login-without-reload.
  implication: Bug affects all protectedMutation calls, not just forceComplete. But forceComplete was the one being actively tested.

- timestamp: 2026-03-03T00:45:00Z
  checked: AuthContext mount useEffect (line 48-66)
  found: On page LOAD (with existing session in localStorage), AuthContext.useEffect writes parsed.token to malo_session_id AND sessionSetterRef.current(parsed.token) will now be called. BUT useEffect runs AFTER SessionProvider has already initialized its React state via useState lazy initializer.
  implication: For PAGE LOADS where malo_session_id already has the auth token, SessionProvider.sessionId initializes correctly from localStorage (lazy init reads existing value). Issue only occurs after same-tab logout + login without page refresh.

## Resolution

root_cause: SessionProvider.sessionId React state is stale after same-tab login. After logout, localStorage["malo_session_id"] is cleared. On next login (same tab), SessionProvider.useState() lazy initializer finds no existing value, generates a random UUID, and SessionProvider.sessionId = randomUUID. AuthContext.login() then writes the real auth token to localStorage directly (without calling SessionProvider's setValue), leaving SessionProvider.sessionId stale. useSessionMutation injects the stale randomUUID as sessionId, which doesn't match any session in the database. getSessionUser returns null. protectedMutation throws ConvexError("Unauthorized"), which surfaces as "[CONVEX M(...)] Server Error Called by client".

fix: Created src/lib/sessionBridge.ts with a module-level sessionSetterRef that holds SessionProvider's setValue callback. main.tsx assigns it inside useLocalStorage (called by SessionProvider). AuthContext calls sessionSetterRef.current(token) after login, logout, and page-load session restore to keep SessionProvider's React state synchronized with the auth token.

verification: TypeScript type-check passes, npm run build succeeds.

files_changed:
  - src/lib/sessionBridge.ts (new file - module-level bridge between SessionProvider and AuthContext)
  - src/main.tsx (import sessionSetterRef from sessionBridge, assign in useLocalStorage)
  - src/contexts/AuthContext.tsx (call sessionSetterRef.current() on login, logout, and mount restore)
