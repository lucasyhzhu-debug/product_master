/**
 * Remembers who signed in last on this device so the login page can open
 * straight on the PIN pad. Only the user id is stored -- never a PIN or a
 * session token. The id is already public on the login page (`getActiveUsers`
 * is unauthenticated and renders every active user in the avatar grid), so
 * this adds no exposure the page doesn't already broadcast.
 *
 * Two deliberate behaviours, both load-bearing -- don't "clean them up":
 *
 * 1. The key SURVIVES LOGOUT. That is the whole feature: the next sign-in on
 *    a shared tablet starts from the same person.
 * 2. It is only written on a SUCCESSFUL login, and tapping "Login as someone
 *    else" does NOT clear it. The memory is "last person who logged in", not
 *    "last person who touched the screen" -- otherwise any passer-by who taps
 *    the button wipes the default for the person who actually uses the device.
 *
 * Returns a plain `string`, not `Id<"users">`: the stored value is
 * device-controlled and unvalidated. Callers must resolve it against a
 * server-provided user list before treating it as a real id.
 */
const LAST_USER_KEY = "malo_last_user_id";

export function getLastUserId(): string | null {
  try {
    return localStorage.getItem(LAST_USER_KEY);
  } catch {
    // Storage unavailable (private mode / sandboxed iframe) -- no memory.
    return null;
  }
}

export function setLastUserId(userId: string): void {
  try {
    localStorage.setItem(LAST_USER_KEY, userId);
  } catch {
    // Storage unavailable or over quota -- degrade to no memory.
  }
}

export function clearLastUserId(): void {
  try {
    localStorage.removeItem(LAST_USER_KEY);
  } catch {
    // Nothing to do.
  }
}
