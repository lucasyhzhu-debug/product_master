# Phase 2: Quick Fixes -- Security & Docs - Research

**Researched:** 2026-02-13
**Domain:** Git history scrubbing, environment config security, security documentation
**Confidence:** HIGH

## Summary

This phase addresses three concrete security concerns: (1) sensitive environment files (`.env`, `.env.local.production`, `.env.local.testing`) are tracked in git with production Convex deployment identifiers exposed in 508 commits of history, (2) the token-in-args authentication pattern needs formal documentation as an accepted design decision, and (3) SHA-256 PIN hashing with salt needs documentation as acceptable for this internal tool.

The codebase already has solid security foundations: salted SHA-256 hashing, 5-attempt lockout with 15-minute cooldown, 8-hour session expiry, PIN hash exclusion from query results, and role-based access control. The work is primarily cleanup (git history scrub, gitignore fixes, untracking files) and documentation (SECURITY.md).

**Primary recommendation:** Use `git-filter-repo` (already installed on this machine, v2.47.0) instead of BFG Repo-Cleaner since Java is not available. The scrub targets three files containing Convex deployment identifiers. After scrub, rotate the `CONVEX_DEPLOY_KEY` GitHub secret and coordinate team re-clones.

---

<user_constraints>

## User Constraints (from CONTEXT.md)

### Locked Decisions
- **Documentation format:** Standalone `docs/SECURITY.md` -- single file, no inline code comments. Brief rationale per item (2-3 sentences each). Include brief threat model section. Audience: internal team, casual tone.
- **Git history handling:** Rewrite git history using BFG Repo-Cleaner (or equivalent) to scrub `.env` and `.env.local.production` from all past commits. Force-push to main after scrub. Rotate all exposed secrets after scrubbing. Run secrets scan (truffleHog or similar). Update `.gitignore` to prevent future commits.
- **Security doc scope:** SECURITY.md covers env files, token-in-args, PIN hashing, plus brief auth flow documentation and "Known Limitations" section. Does NOT cover data access matrix or deployment security.
- **Env template design:** Single `.env.example` file. Include example values showing format. Group variables as Required vs Optional. `.gitignore` is sufficient prevention -- no pre-commit hook or CI check needed.

### Claude's Discretion
- Exact BFG/git-filter-repo invocation and workflow
- Which secrets scanner to use for the broader scan
- Ordering of sections within SECURITY.md
- How to structure the auth flow documentation (narrative vs bullet points)

### Deferred Ideas (OUT OF SCOPE)
None -- discussion stayed within phase scope

</user_constraints>

---

## Standard Stack

### Core
| Tool | Version | Purpose | Why Standard |
|------|---------|---------|--------------|
| git-filter-repo | 2.47.0 | Git history rewriting | Installed on machine; recommended replacement for both git-filter-branch and BFG; does NOT require Java |
| TruffleHog | 3.93.x | Secrets scanning | Industry-standard, 800+ secret types, verifies credentials against live APIs |

### Supporting
| Tool | Version | Purpose | When to Use |
|------|---------|---------|-------------|
| git rm --cached | (built-in) | Untrack files without deleting | Remove tracked env files from index |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| git-filter-repo | BFG Repo-Cleaner 1.15.0 | User decision specified BFG, but Java is NOT installed on this machine. git-filter-repo is the modern recommended alternative, already installed (v2.47.0). Functionally equivalent for this use case. |

**Installation:**
```bash
# git-filter-repo already installed via:
python -m pip install git-filter-repo
# Location: C:\Users\Irfan\AppData\Local\Python\pythoncore-3.14-64\Scripts\git-filter-repo.exe

# TruffleHog for Windows: download binary from GitHub releases
# https://github.com/trufflesecurity/trufflehog/releases
# Look for: trufflehog_<version>_windows_amd64.tar.gz
# Or use Docker: docker run --rm -v "$(pwd):/repo" trufflesecurity/trufflehog git file:///repo
```

---

## Architecture Patterns

### Current Auth Flow (for SECURITY.md documentation)

```
Login Flow:
1. Frontend shows user list (getActiveUsers query -- no PIN hashes exposed)
2. User selects avatar, enters 4-6 digit PIN
3. Frontend calls login mutation with { userId, pin }
4. Backend: verifyPin() with salted SHA-256, checks lockout status
5. On success: creates session (UUID v4 token, 8h expiry), resets failed attempts
6. Frontend stores session in localStorage as JSON (token, userId, name, role, expiresAt)

Auth Token Flow:
7. All protected mutations receive { token: v.string(), ...args }
8. Backend calls requireRole(ctx, token, allowedRoles) which:
   - Looks up session by token via "by_token" index
   - Checks expiry, active status, role membership
   - Returns user doc or throws ConvexError

Session Validation:
9. AuthContext validates session on mount via validateSession query
10. Server-side invalidation clears local state
11. ProtectedRoute checks permissions client-side for UI routing
```

### Token-in-Args Pattern (Rationale for SECURITY.md)

Convex provides a built-in auth system (`ctx.auth.getUserIdentity()`) that works with external providers (Clerk, Auth0, WorkOS) using JWT validation. This project uses a custom PIN-based auth system instead because:

1. **Internal tool context** -- The app is used by ~5-15 staff in a single FMCG company. External auth providers add complexity and cost for minimal benefit.
2. **PIN login UX** -- Kitchen/warehouse staff need fast avatar+PIN login, not email/password/SSO flows.
3. **Convex runtime constraint** -- No native module support (bcrypt unavailable), so custom auth was built using Web Crypto API.

The token-in-args pattern is functionally equivalent to bearer tokens in HTTP headers. Convex functions are called over WebSocket, and the token serves the same purpose as an Authorization header. The transport is TLS-encrypted (wss://).

**39 mutations across 11 files** use `requireRole(ctx, token, roles)`.
**43 occurrences** of `token: v.string()` in mutation args.

### PIN Hashing Pattern (Rationale for SECURITY.md)

```typescript
// convex/lib/auth.ts -- current implementation
export async function hashPin(pin: string): Promise<string> {
  const salt = crypto.randomUUID();  // Random salt per PIN
  const encoder = new TextEncoder();
  const data = encoder.encode(salt + pin);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  // Returns "salt:hash" format
}
```

Security properties:
- **Salted**: Each PIN gets a unique UUID salt, preventing rainbow tables
- **SHA-256 via Web Crypto**: Not bcrypt/scrypt, but acceptable because:
  - PIN space is 4-6 digits (10,000-1,000,000 combinations)
  - Rate limiting: 5 attempts then 15-minute lockout
  - Internal tool: no external access, trusted network
  - Convex runtime does not support bcrypt (native modules unavailable)
- **Lockout mechanism**: `MAX_FAILED_ATTEMPTS=5`, `LOCKOUT_DURATION_MS=15min`

### Anti-Patterns to Avoid
- **Do NOT add bcrypt/argon2** -- Convex runtime does not support native modules; this is a known platform constraint, not a shortcoming
- **Do NOT remove token from args** -- Would require migrating to external auth provider (Clerk/Auth0), which is out of scope and inappropriate for PIN-based internal tool
- **Do NOT add pre-commit hooks for this phase** -- User explicitly decided `.gitignore` is sufficient

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Git history rewrite | Manual git-filter-branch | git-filter-repo | filter-branch is deprecated, slow, error-prone |
| Secrets scanning | grep for patterns | TruffleHog | 800+ detector types, verifies live credentials, handles encoding/obfuscation |

**Key insight:** Git history scrubbing is a one-time operation but easy to get wrong. Using established tools prevents data loss and ensures thorough cleaning.

---

## Common Pitfalls

### Pitfall 1: Gitignore Does Not Untrack Already-Tracked Files
**What goes wrong:** Adding `.env` to `.gitignore` has no effect if the file is already tracked. Git continues tracking it.
**Why it happens:** `.gitignore` only prevents NEW files from being added. Once tracked, files must be explicitly removed from the index.
**How to avoid:** After updating `.gitignore`, run `git rm --cached <file>` for each tracked file that should now be ignored.
**Warning signs:** `git status` still shows env files as tracked despite `.gitignore` entries.

**Current state:** `.env`, `.env.local.production`, and `.env.local.testing` are ALL currently tracked (`git ls-files` confirms). The `.gitignore` has `.env` on line 4 but then NEGATES it with `!.env.local.production` on line 11 and the `*.local` pattern on line 48 conflicts with `.env*.local` on line 86.

### Pitfall 2: git-filter-repo Requires Fresh Clone
**What goes wrong:** `git-filter-repo` refuses to run on a repo that is your working copy (safety measure).
**Why it happens:** History rewriting is destructive; the tool enforces you work on a fresh `--mirror` or `--bare` clone.
**How to avoid:** Clone a mirror copy first: `git clone --mirror <url> repo.git`, run filter-repo on the mirror, then push.
**Warning signs:** Error message about "expected freshly cloned repo".

### Pitfall 3: Force-Push Invalidates All Open PRs
**What goes wrong:** After history rewrite and force-push, all commit SHAs change. Open PRs become unmergeable.
**Why it happens:** Git identifies commits by SHA; rewriting history creates entirely new commit objects.
**How to avoid:** Close/merge all open PRs before the scrub. Coordinate with the team (small team in this case).
**Warning signs:** GitHub shows "unable to merge" on previously-clean PRs.

### Pitfall 4: Forgetting to Rotate Secrets After Scrub
**What goes wrong:** Scrubbing history removes the file from git, but the secret values are still compromised if anyone ever cloned the repo.
**Why it happens:** False sense of security -- "we removed it from history" doesn't undo exposure.
**How to avoid:** Treat all previously-committed secrets as compromised. Rotate them immediately after scrub.
**Warning signs:** Old secrets still work after the scrub.

### Pitfall 5: The .gitignore Negation Conflict
**What goes wrong:** The current `.gitignore` has `!.env.local.production` which explicitly UN-ignores this file.
**Why it happens:** The original intent was to allow `.env.local.production` to be committed as a "reference" file. But it contains actual production secrets.
**How to avoid:** Remove all `!.env.local.*` negation lines from `.gitignore`. The `.env.example` template replaces the need for committed env files.
**Current `.gitignore` lines that need fixing:**
  - Line 11: `!.env.local.production` -- REMOVE (negates the ignore)
  - Line 12: `!.env.local.testing` -- REMOVE (negates the ignore)
  - Line 48: `*.local` -- Already catches `.env.local` files
  - Line 86: `.env*.local` -- Additional catch for env files

---

## Code Examples

### git-filter-repo: Remove Specific Files from History

```bash
# Step 1: Work from a fresh mirror clone (REQUIRED)
git clone --mirror https://github.com/lucasyhzhu-debug/product_master.git product_master_mirror.git
cd product_master_mirror.git

# Step 2: Remove the three env files from ALL history
# Note: git-filter-repo path syntax uses full paths from repo root
python -m git_filter_repo --invert-paths \
  --path .env \
  --path .env.local.production \
  --path .env.local.testing

# Step 3: Force-push all refs back to origin
git push --force --all
git push --force --tags

# Step 4: Clean up
cd ..
rm -rf product_master_mirror.git
```

### Untrack Files from Current Index (Before History Rewrite)

```bash
# Remove files from git tracking WITHOUT deleting from disk
git rm --cached .env .env.local.production .env.local.testing
git commit -m "chore(security): untrack env files with secrets"
```

### Updated .gitignore (Relevant Section)

```gitignore
# =============================================================================
# ENVIRONMENT FILES WITH SECRETS - NEVER COMMIT
# =============================================================================
.env
.env.local
.env.local.*
.env.production.local
api/.env

# Keep example/template files (these are safe to commit)
!.env.example
```

Key change: Remove `!.env.local.production` and `!.env.local.testing` negation lines.

### TruffleHog Scan Command

```bash
# Option A: Download binary and scan local repo
trufflehog git file://. --since-commit HEAD~100 --fail

# Option B: Docker (if available)
docker run --rm -v "${PWD}:/repo" trufflesecurity/trufflehog:latest git file:///repo

# Option C: Scan full history
trufflehog git file://. --fail
```

### Updated .env.example Template

```bash
# =============================================================================
# FROLLIE RECIPE MASTER - Environment Configuration
# =============================================================================
# Copy this file to .env.local and fill in your values:
#   cp .env.example .env.local
# =============================================================================

# --- Required ---

# Convex deployment identifier
# Get this by running: npx convex dev
CONVEX_DEPLOYMENT=dev:your-project-name

# Convex cloud URL (provided when you create a deployment)
VITE_CONVEX_URL=https://your-project-name.convex.cloud

# --- Optional ---

# Convex site URL (for HTTP actions)
# VITE_CONVEX_SITE_URL=https://your-project-name.convex.site
```

---

## Codebase Findings

### Files Currently Tracked That Contain Secrets

| File | Content | Risk |
|------|---------|------|
| `.env` | `CONVEX_DEPLOYMENT=prod:decisive-wombat-7`, Convex cloud URLs | MEDIUM: Exposes production deployment identifier |
| `.env.local.production` | Same production deployment info | MEDIUM: Duplicate of .env |
| `.env.local.testing` | `CONVEX_DEPLOYMENT=dev:exciting-fennec-671`, dev cloud URLs | LOW: Dev environment only |

### Additional Security Finding: Hardcoded K3Mart Credentials

**File:** `convex/platformCredentials/mutations.ts` (lines 6-9)
```typescript
const K3MART_DEFAULTS = {
  email: "<redacted>",
  password: "<redacted>",  // historical literal scrubbed before repo went public; now sourced from Convex env
};
```

This is a hardcoded email and password for K3Mart platform integration. While this is outside the explicit phase scope (env files, token pattern, PIN hashing), the secrets scanner will flag it. The planner should note this as a finding to report but NOT fix in this phase (to avoid scope creep). It should be logged in SECURITY.md "Known Limitations" section.

### GitHub Secrets Used (for rotation planning)

| Secret | Used In | Purpose |
|--------|---------|---------|
| `CONVEX_DEPLOY_KEY` | `.github/workflows/deploy.yml` | Convex production deployment |
| `VERCEL_DEPLOY_HOOK` | `.github/workflows/deploy.yml` | Triggers Vercel rebuild |
| `K3MART_EMAIL` | `.github/workflows/refresh-k3mart-token.yml` | K3Mart login |
| `K3MART_PASSWORD` | `.github/workflows/refresh-k3mart-token.yml` | K3Mart login |

**Secrets to rotate after history scrub:**
- `CONVEX_DEPLOY_KEY` -- Primary concern, as the Convex deployment identifier was exposed
- `VERCEL_DEPLOY_HOOK` -- The webhook URL itself was never committed, only referenced as `${{ secrets.VERCEL_DEPLOY_HOOK }}`
- Note: The actual `CONVEX_DEPLOY_KEY` value was never committed to the repo (it's in GitHub Secrets). What was committed is the deployment identifier (`prod:decisive-wombat-7`), which is needed to connect to the deployment but is not itself a secret key. However, best practice after a security scrub is to rotate the deploy key anyway.

### Existing Auth Security Properties (for SECURITY.md)

| Property | Implementation | Location |
|----------|---------------|----------|
| PIN hashing | SHA-256 + random UUID salt | `convex/lib/auth.ts:hashPin()` |
| PIN verification | Constant-time comparison not used (but low-risk) | `convex/lib/auth.ts:verifyPin()` |
| Failed attempt tracking | Counter per user, incremented on failure | `convex/auth/mutations.ts:login` |
| Account lockout | 5 attempts, 15-min lockout | `convex/lib/auth.ts` constants |
| Session tokens | UUID v4, stored in sessions table | `convex/auth/mutations.ts:login` |
| Session expiry | 8 hours | `convex/lib/auth.ts:SESSION_DURATION_MS` |
| Session validation | Server-side check on every protected operation | `convex/lib/auth.ts:requireRole()` |
| PIN hash exclusion | Queries explicitly map fields, omitting pinHash | `convex/auth/queries.ts` |
| Role-based access | 4 roles, permission checks on mutations + routes | `convex/lib/auth.ts`, `ProtectedRoute.tsx` |
| Session cleanup | Manual mutation (no cron yet) | `convex/auth/mutations.ts:cleanupExpiredSessions` |

### SECURITY.md Recommended Structure

```markdown
# Security Documentation

## Threat Model
[Internal FMCG operations tool framing]

## Authentication Flow
[PIN login -> session token -> role-based access]

## Accepted Security Patterns

### Environment Configuration
[.env files removed, .env.example template, gitignore protection]

### Token-in-Args Authentication
[Why it's used, how it works, why it's acceptable]

### PIN Hashing (SHA-256 + Salt)
[Why not bcrypt, why it's acceptable for this context]

## Known Limitations
[Honest list of trade-offs]
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| git-filter-branch | git-filter-repo | 2020+ | filter-branch deprecated by Git project; filter-repo is 10-100x faster |
| BFG Repo-Cleaner (Java) | git-filter-repo (Python) | 2020+ | filter-repo handles more edge cases, no Java dependency |
| Manual grep for secrets | TruffleHog 3.x | 2023+ | 800+ detectors, live verification, fewer false positives |

---

## Open Questions

1. **Convex deployment identifier rotation**
   - What we know: `prod:decisive-wombat-7` is the deployment name, exposed in `.env`. The `CONVEX_DEPLOY_KEY` (actual secret) lives only in GitHub Secrets and was never committed.
   - What's unclear: Whether just the deployment identifier (not the deploy key) being public is actually a security risk. Convex deployment names are likely discoverable from the frontend URL anyway.
   - Recommendation: Still rotate `CONVEX_DEPLOY_KEY` as best practice. Note in SECURITY.md that the deployment identifier is semi-public (embedded in frontend bundle as `VITE_CONVEX_URL`).

2. **K3Mart hardcoded credentials in source code**
   - What we know: `convex/platformCredentials/mutations.ts` contains hardcoded email/password. This is in tracked source code, not env files.
   - What's unclear: Whether this should be addressed in this phase or deferred.
   - Recommendation: Document in SECURITY.md "Known Limitations" but defer code fix. The secrets scanner will flag it -- acknowledge it explicitly.

3. **verifyPin timing attack surface**
   - What we know: The current implementation uses `===` string comparison, not constant-time comparison.
   - What's unclear: Whether this is exploitable over Convex's WebSocket transport with variable latency.
   - Recommendation: Note in "Known Limitations" but don't fix (extremely low risk for internal tool over WebSocket).

---

## Sources

### Primary (HIGH confidence)
- **Codebase inspection** -- Direct reading of `.gitignore`, `.env`, `.env.local.production`, `.env.local.testing`, `convex/lib/auth.ts`, `convex/auth/mutations.ts`, `convex/auth/queries.ts`, `convex/platformCredentials/mutations.ts`, `.github/workflows/deploy.yml`, `.github/workflows/refresh-k3mart-token.yml`, `src/contexts/AuthContext.tsx`, `src/components/auth/ProtectedRoute.tsx`, `convex/schema.ts`
- **Git history analysis** -- `git log`, `git ls-files`, `git show` to confirm tracked files and exposure scope
- **Convex docs (Context7 /llmstxt/convex_dev_llms_txt)** -- Confirmed custom auth vs built-in auth patterns

### Secondary (MEDIUM confidence)
- [BFG Repo-Cleaner official site](https://rtyley.github.io/bfg-repo-cleaner/) -- Usage commands and limitations verified via WebFetch
- [git-filter-repo GitHub](https://github.com/newren/git-filter-repo) -- Modern alternative to BFG, verified installed on machine
- [TruffleHog GitHub](https://github.com/trufflesecurity/trufflehog) -- Secrets scanner capabilities and installation
- [Chocolatey TruffleHog package](https://community.chocolatey.org/packages/trufflehog) -- Windows installation option

### Tertiary (LOW confidence)
- None -- all findings verified against codebase or official sources

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH -- git-filter-repo confirmed installed, TruffleHog well-documented
- Architecture: HIGH -- All code paths read directly, auth flow fully traced
- Pitfalls: HIGH -- Gitignore conflicts verified via `git ls-files` and `git check-ignore`
- Documentation scope: HIGH -- All existing security properties catalogued from source

**Research date:** 2026-02-13
**Valid until:** 2026-03-13 (stable domain, no version dependencies)
