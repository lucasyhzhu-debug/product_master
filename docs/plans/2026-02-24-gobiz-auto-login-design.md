# GoBiz Auto-Login via Password Grant

**Date:** 2026-02-24
**Status:** Approved — saved for future implementation

---

## Problem

Refreshing the GoBiz API token requires manually logging into the GoBiz portal, opening browser DevTools, copying the token JSON, and pasting it into the app. This is error-prone and time-consuming.

## Solution

Call the GoBiz password grant endpoint directly from a Convex action. Store credentials as environment variables. One-click token refresh from the Settings UI.

## Discovery

The GoBiz portal login resolves to a standard OAuth2 password grant:

```
POST https://api.gobiz.co.id/goid/token
Content-Type: application/json

{
  "client_id": "go-biz-web-new",
  "grant_type": "password",
  "data": {
    "email": "<gobiz_email>",
    "password": "<gobiz_password>"
  }
}
```

Response:
```json
{
  "access_token": "eyJ...",
  "refresh_token": "eyJ...",
  "dbl_enabled": true
}
```

Both tokens are returned directly in JSON. No browser, iframe, or OAuth redirect needed.

## Architecture

```
[Settings UI] --> click "Refresh Token" --> [Convex Action: loginWithCredentials]
                                                |
                                                v
                                    POST https://api.gobiz.co.id/goid/token
                                    { client_id, grant_type: "password", data: { email, password } }
                                                |
                                                v
                                    { access_token, refresh_token }
                                                |
                                                v
                                    [Save to platformCredentials table]
                                                |
                                                v
                                    [Return success + optional: trigger sync]
```

## Components

### 1. Environment Variables (set in Convex dashboard)

| Variable | Purpose |
|----------|---------|
| `GOBIZ_EMAIL` | GoBiz login email |
| `GOBIZ_PASSWORD` | GoBiz login password |

Set once. Both required for auto-login to work.

### 2. Backend — `loginWithCredentials` action

**File:** `convex/integrations/gobiz/adapter.ts`

- New `internalAction` that reads email/password from `process.env`
- POSTs to `https://api.gobiz.co.id/goid/token` with password grant payload
- On success: saves `access_token` + `refresh_token` to `platformCredentials` via existing `saveDirectToken` mutation
- On failure: returns structured error (invalid credentials, network error, rate limit)
- Exposed to frontend via an admin-only wrapper mutation using `requireRole(["admin"])`

### 3. Frontend — Settings UI update

**File:** `src/components/salesAnalytics/GoBizTokenDialog.tsx` (or `SettingsTab.tsx`)

- Add "Login to GoBiz" button alongside existing manual paste
- Button calls the admin-only action
- Loading spinner during request → success toast with token expiry info
- If env vars not set: button disabled with tooltip "Set GOBIZ_EMAIL and GOBIZ_PASSWORD in Convex dashboard"
- Keep existing manual paste flow as fallback

## Error Handling

| Scenario | Behavior |
|----------|----------|
| Wrong credentials | Return clear error message, don't retry |
| Network timeout | 10s timeout, retry once, then surface error |
| Rate limited by GoBiz | Surface rate limit error, suggest waiting |
| Missing env vars | Button disabled with tooltip |
| GoBiz API changed | Fall back to manual paste (always available) |

## Security

- Credentials stored in Convex environment variables (encrypted at rest by Convex)
- Never exposed to the browser — action runs server-side only
- Admin-only access via `requireRole(["admin"])`
- No credentials in source code, git, or client bundles

## Files to Modify

| File | Change |
|------|--------|
| `convex/integrations/gobiz/adapter.ts` | Add `loginWithCredentials` internalAction |
| `convex/integrations/gobiz/mutations.ts` or equivalent | Add admin-only wrapper that calls the action |
| `src/components/salesAnalytics/GoBizTokenDialog.tsx` | Add "Login to GoBiz" button |
| Convex dashboard | Set `GOBIZ_EMAIL` and `GOBIZ_PASSWORD` env vars |

## Existing Infrastructure Reused

- `platformCredentials` table and `saveDirectToken` mutation (already stores tokens)
- `requireRole(["admin"])` auth pattern
- `resolveGoBizToken()` for reading tokens (unchanged)
- Token refresh cascade in `adapter.ts` (unchanged — still works after initial login)

## Notes

- The `client_id: "go-biz-web-new"` is the public client ID used by the GoBiz web portal — not a secret
- Token lifetime: access ~1 hour, refresh days-to-weeks
- After initial login, the existing refresh cascade (3 methods) keeps the session alive
- This replaces the need for any cron-based token refresh — login on-demand when needed
