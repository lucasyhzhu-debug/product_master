# Security Documentation

Frollie Recipe Master internal security overview. This doc covers our threat model, how auth works, why we made certain trade-offs, and what we knowingly accept as limitations.

## 1. Threat Model

This is an internal operations tool for ~5-15 staff at an Indonesian FMCG snack company. It is **not** a public-facing application.

- **Users:** Trusted kitchen, warehouse, and office staff. Everyone knows each other.
- **Primary risk:** Accidental data corruption (wrong recipe version, bad order entry), not external attacks.
- **Infrastructure:** Deployed on Convex (managed serverless backend) + Vercel (managed frontend hosting). The platform handles network security, DDoS protection, and TLS termination -- we do not manage any of that ourselves.
- **Data sensitivity:** Recipe costs, order totals, and vendor pricing are business-confidential but not regulated (no PII, no payment card data, no health records).

Bottom line: We need "keep honest people honest" security, not "defend against nation-state actors" security.

## 2. Authentication Flow

1. Frontend calls `auth.queries.getActiveUsers` to display user avatars on the login screen. This query **excludes PIN hashes** -- it only returns `_id`, `name`, `role`, and `avatarUrl`.
2. User selects their avatar and enters a 4-6 digit PIN.
3. Backend `auth.mutations.login` verifies the PIN against a salted SHA-256 hash (see Section 3c). It also checks lockout status -- after 5 failed attempts, the account locks for 15 minutes.
4. On success: a session is created with a UUID v4 token and 8-hour expiry. Failed attempt counter resets to zero.
5. Frontend stores the session in `localStorage` under the key `malo_auth_session` (token, userId, name, role, avatarUrl, expiresAt).
   - `malo_session_id` mirrors the token for the Convex `SessionProvider`. Both keys are cleared on logout and on server-side session invalidation.
   - `malo_last_user_id` (added 2026-07-13) stores **only** the id of the last user to sign in successfully on that device, so `/login` can pre-select them and open on the PIN pad. It contains no token and no PIN, and it **deliberately survives logout** -- that is the feature. It grants nothing: the id is only ever used to (a) look up a name in the server-provided `getActiveUsers` list and (b) pass to `login`, which still validates the PIN. `getActiveUsers` is an unauthenticated query that already returns every active user's id, name, and role to anyone loading `/login`, so persisting one of those ids exposes nothing the page does not already broadcast. Tapping "Login as someone else" does not clear it -- see `src/lib/lastUser.ts`.
6. On each page load, `AuthContext` validates the stored token against the server via `auth.queries.validateSession`. If the server says the session is invalid, local state is cleared.
7. Protected mutations receive the token as a function argument. The `requireRole(ctx, token, allowedRoles)` helper in `convex/lib/auth.ts` looks up the session by token (indexed), checks expiry, checks `isActive`, and verifies the user's role is in the allowed list.
8. `ProtectedRoute` handles client-side route guards by checking permissions from `ROLE_PERMISSIONS` or explicit role lists before rendering the page.

## 3. Accepted Security Patterns

### 3a. Environment Configuration

- **Sensitive env files removed from version control.** The files `.env`, `.env.local.production`, and `.env.local.testing` have been untracked via `git rm --cached` and are now caught by `.gitignore` patterns.
- **History contains past exposure.** These files were previously committed. See Plan 02-02 for the git history scrub that addresses this.
- **Only `.env.example` remains committed** with placeholder values (`dev:your-project-name`, `https://your-project-name.convex.cloud`). It uses Required/Optional grouping so new developers know what to fill in.
- **`.gitignore` updated** with `.env.local.*` glob and no negation rules for env files (only `!.env.example` is negated).

### 3b. Token-in-Args Authentication

Convex functions are called over WebSocket (`wss://`), not HTTP. There are no request headers available in the function handler -- `ctx` does not expose an `Authorization` header.

- The session token is passed as a regular function argument (`token: v.string()`), which serves the same purpose as a bearer token in an HTTP Authorization header.
- Transport is TLS-encrypted end-to-end. The token never travels in plaintext.
- Convex does offer built-in auth via `ctx.auth`, but it requires an external identity provider (Clerk, Auth0, etc.). That is overkill for an internal PIN-based tool with 5-15 users.
- **39 mutations across 11 files** use this pattern through the shared `requireRole()` helper. The helper performs token lookup via a `by_token` index on the sessions table, expiry check, active-user check, and role membership check.

### 3c. PIN Hashing (SHA-256 + Salt)

Each PIN gets a unique salt generated via `crypto.randomUUID()`, preventing rainbow table attacks. The hash is computed with `crypto.subtle.digest("SHA-256", salt + pin)` and stored as `salt:hexhash`.

This is **not** bcrypt or scrypt, and that is a conscious choice:

- **PIN space is tiny** -- 4-6 digits means at most 1,111,100 combinations. Even bcrypt cannot make brute-forcing a 4-digit PIN "hard" if an attacker has the hash offline. The real protection comes from the 5-attempt lockout with 15-minute cooldown, which makes online brute force impractical.
- **Convex runtime does not support native modules.** bcrypt requires C bindings (`node-gyp`), which are unavailable in the Convex serverless environment. SHA-256 via the Web Crypto API is the strongest option available.
- **Reference:** `convex/lib/auth.ts` -- `hashPin()` and `verifyPin()` functions.

## 4. Known Limitations

Honest list of things we know about and consciously accept:

- **No constant-time PIN comparison.** `verifyPin()` uses `===` string comparison after hashing. Timing side-channel attacks are impractical over WebSocket transport with variable network latency, especially on an internal tool.

- **localStorage for session storage.** Tokens are stored in `localStorage`, not httpOnly cookies. XSS risk is minimal because this is an internal tool with no user-generated content (no comment fields, no markdown rendering, no third-party scripts).

- **Hardcoded K3Mart credentials.** `convex/platformCredentials/mutations.ts` contains a default email/password for K3Mart integration auto-seeding. These should be moved to environment variables or the database in a future cleanup.

- **No session cleanup cron.** Expired sessions accumulate in the `sessions` table until someone manually calls `auth.mutations.cleanupExpiredSessions`. Low impact -- the sessions table is small and Convex handles storage efficiently. A scheduled function would be a nice-to-have.

- **Deployment identifier in frontend bundle.** `VITE_CONVEX_URL` embeds the deployment name in client-side JavaScript. This is by design -- Convex requires it for the client SDK to connect. The deployment URL is semi-public information (visible in browser DevTools on any page load).

---

*Last updated: 2026-02-13*
