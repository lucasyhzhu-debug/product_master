# RCA: Production Site Not Connected to Convex Backend

**Date:** 2026-02-10
**Severity:** Sev-1 (Production site non-functional)
**Duration:** ~7 days (since 2026-02-03 CI/CD migration)
**Impact:** Production inventory page showed zero stock values; all Convex-dependent features were non-functional

---

## Summary

The production site at `frollie-product.vercel.app` was not connecting to the Convex backend at all. The `VITE_CONVEX_URL` environment variable was missing from the `.env` file, causing the Vite build on Vercel to replace `import.meta.env.VITE_CONVEX_URL` with `undefined`. This meant the `ConvexReactClient` was never initialized, and the app ran without a backend connection.

---

## Timeline

| Date | Event |
|------|-------|
| 2026-01-30 | `.env` created with `VITE_API_URL=/api` (FastAPI era) |
| 2026-02-03 | CI/CD pipeline commit (`bcfb0da`) migrated to production Convex. `.env` was updated from `VITE_API_URL=/api` to `CONVEX_DEPLOYMENT=prod:decisive-wombat-7`. **`VITE_CONVEX_URL` was NOT added.** `.env.local.production` was correctly updated with all 3 vars. |
| 2026-02-03 to 2026-02-10 | Production site running without Convex connection. Users see component names but zero stock values. |
| 2026-02-10 | Issue discovered. Fix applied in PR #46. |

---

## Root Cause

In commit `bcfb0da` ("feat: add CI/CD pipeline and migrate to production environment"), the `.env` file was updated to replace the old FastAPI `VITE_API_URL=/api` with `CONVEX_DEPLOYMENT=prod:decisive-wombat-7`.

However, **only `CONVEX_DEPLOYMENT` was added**. The two Vite-specific variables that the frontend needs at build time were omitted:
- `VITE_CONVEX_URL=https://decisive-wombat-7.convex.cloud`
- `VITE_CONVEX_SITE_URL=https://decisive-wombat-7.convex.site`

These variables WERE correctly set in `.env.local.production` (the local reference file), but `.env.local.production` is **not used by Vercel** -- Vercel uses `.env` (which is committed to the repo) or its own dashboard environment variables.

### Why the build didn't fail

In `src/main.tsx`:
```typescript
const convexUrl = import.meta.env.VITE_CONVEX_URL as string;
const convex = convexUrl ? new ConvexReactClient(convexUrl) : null;
```

The code has a **graceful fallback** -- if `convexUrl` is falsy, it sets the client to `null` and renders the app without `ConvexProvider`. This was originally added for "legacy mode" compatibility during the FastAPI-to-Convex migration. It prevented the build from failing but silently degraded the app to a no-backend state.

### Why it wasn't caught

1. **Local dev always works**: Developers run `npx convex dev` which auto-configures `.env.local` with the correct URL. `.env.local` overrides `.env`, so the issue is invisible locally.
2. **CI/CD doesn't build frontend**: The GitHub Actions workflow deploys Convex backend and triggers a Vercel webhook, but doesn't verify the Vercel build output.
3. **Deploy-check script checks wrong file**: `scripts/deploy-check.js` validates `.env.local` (local dev config), not `.env` (Vercel build config).
4. **No smoke test**: No automated test verifies that the production site actually connects to Convex after deployment.

---

## How It Happened (Chain of Errors)

1. **Incomplete migration**: When the CI/CD pipeline was set up, the `.env` file was treated as a "Convex deployment target" config (only `CONVEX_DEPLOYMENT`), while `VITE_CONVEX_URL` was considered a "local dev" variable. In reality, `.env` is the fallback for ALL Vite builds, including Vercel's.

2. **Two-file confusion**: The project has `.env` (committed, used by Vercel) and `.env.local.production` (committed, reference only). The person doing the migration correctly updated `.env.local.production` with all variables but only put `CONVEX_DEPLOYMENT` in `.env`, not understanding that Vercel needs `VITE_*` vars in `.env` too.

3. **Silent failure**: The `null` client fallback in `main.tsx` turned what should have been a hard crash into a silent degradation. The app loads, shows UI elements, but has no data.

---

## Fix Applied

**PR #46** (`fix/production-convex-url`):
- Added `VITE_CONVEX_URL=https://decisive-wombat-7.convex.cloud` to `.env`
- Added `VITE_CONVEX_SITE_URL=https://decisive-wombat-7.convex.site` to `.env`
- Also setting these in Vercel dashboard as belt-and-suspenders

---

## Action Items

### Immediate (done)
- [x] Add `VITE_CONVEX_URL` and `VITE_CONVEX_SITE_URL` to `.env`
- [x] Set same variables in Vercel Project Environment Variables
- [x] Verify production site connects to Convex after merge

### Short-term (recommended)
- [ ] **Remove the `null` client fallback** in `src/main.tsx` -- if `VITE_CONVEX_URL` is not set, throw an error at startup instead of silently degrading. This would have caught this bug immediately.
- [ ] **Update `scripts/deploy-check.js`** to also validate `.env` (not just `.env.local`) and ensure `VITE_CONVEX_URL` is present.
- [ ] **Add a build-time check** in `vite.config.ts` that fails the build if `VITE_CONVEX_URL` is not defined.

### Long-term (recommended)
- [ ] **Add production smoke test** to CI/CD: after Vercel deploy, make an HTTP request to the production URL and verify the page includes a Convex WebSocket connection or returns expected data.
- [ ] **Consolidate env files**: Consider using only Vercel dashboard env vars for production (no committed `.env` with production values) to avoid confusion between files.
