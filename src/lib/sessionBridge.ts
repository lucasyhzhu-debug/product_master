/**
 * Session bridge: connects AuthContext to SessionProvider.
 *
 * Problem:
 *   SessionProvider's React state (sessionId) is initialized BEFORE login.
 *   It generates a random UUID and stores it in localStorage["malo_session_id"].
 *   After login, AuthContext overwrites localStorage["malo_session_id"] with the
 *   real auth token, but SessionProvider's React state is stale (still the UUID).
 *   useSessionMutation then injects the wrong sessionId, causing every
 *   protectedMutation call to fail with ConvexError("Unauthorized"), which
 *   surfaces to the user as "[CONVEX M(...)] Server Error Called by client".
 *
 * Fix:
 *   This module-level ref holds SessionProvider's setValue callback.
 *   main.tsx assigns it inside useLocalStorage (the useStorage hook passed to
 *   SessionProvider). AuthContext calls it after login/logout to keep both
 *   SessionProvider's React state and localStorage in sync.
 *
 * Why a module-level ref (not useRef or context):
 *   AuthContext and SessionProvider are siblings in the tree (not parent/child),
 *   so they cannot share state through props or React context without a
 *   restructure. A module-level singleton ref is the minimal, zero-overhead
 *   bridge between them.
 */
import type { SessionId } from "convex-helpers/server/sessions";

export const sessionSetterRef = {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  current: (_: SessionId | undefined) => {},
};
