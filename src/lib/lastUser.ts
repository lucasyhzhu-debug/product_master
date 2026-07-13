import type { Id } from "../../convex/_generated/dataModel";

/**
 * Remembers who signed in last on this device so the login page can open
 * straight on the PIN pad. Only the user id is stored -- never a PIN or a
 * session token. The id is already public on the login page (every active
 * user is rendered in the avatar grid), so this adds no new exposure.
 *
 * Survives logout on purpose: the whole point is that the next sign-in on a
 * shared tablet starts from the same person.
 */
const LAST_USER_KEY = "malo_last_user_id";

export function getLastUserId(): Id<"users"> | null {
  try {
    const stored = localStorage.getItem(LAST_USER_KEY);
    return stored ? (stored as Id<"users">) : null;
  } catch {
    return null;
  }
}

export function setLastUserId(userId: string): void {
  try {
    localStorage.setItem(LAST_USER_KEY, userId);
  } catch {
    // Storage unavailable (private mode / quota) -- degrade to no memory.
  }
}

export function clearLastUserId(): void {
  try {
    localStorage.removeItem(LAST_USER_KEY);
  } catch {
    // Nothing to do.
  }
}
