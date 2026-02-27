# GoBiz Headless Auth — HAR-Verified Password Grant Fix

**Date:** 2026-02-25
**Status:** Ready for implementation
**Supersedes:** `2026-02-24-gobiz-auto-login-design.md` (partially correct — missing headers)

---

## Problem

The `loginWithCredentials` action gets **401 Unauthorized** on the password grant path because:

1. It uses `application/x-www-form-urlencoded` — GoBiz expects `application/json`
2. It omits 8 required Gojek-specific headers that the browser sends
3. The `x-appid` header value (`go-biz-web-dashboard`) differs from the body's `client_id` (`go-biz-web-new`) — both are required

## Discovery Method

Captured a full browser login via Chrome DevTools HAR export. Analyzed with `scripts/analyze-har.cjs`. The HAR reveals a clean two-step REST flow with **no cookies, no OTP, no session state**.

## Verified Auth Flow (from HAR)

### Step 1: Login Request (challenge initiation)

```
POST https://api.gobiz.co.id/goid/login/request
Content-Type: application/json
Gojek-Country-Code: ID
Gojek-Timezone: Asia/Jakarta
X-AppVersion: transaction-1.22.0-3d465258
X-Platform: Web
X-User-Type: merchant
X-DeviceOS: Web
X-AppId: go-biz-web-dashboard
X-UniqueId: <uuid-v4>

{
  "email": "<GOBIZ_EMAIL>",
  "login_type": "password",
  "client_id": "go-biz-web-new"
}

→ 201 Created
{ "data": {}, "success": true, "errors": [] }
```

### Step 2: Token Grant (~5s after Step 1)

```
POST https://api.gobiz.co.id/goid/token
Content-Type: application/json
Gojek-Country-Code: ID
Gojek-Timezone: Asia/Jakarta
X-AppVersion: transaction-1.22.0-3d465258
X-Platform: Web
X-User-Type: merchant
X-DeviceOS: Web
X-AppId: go-biz-web-dashboard
X-UniqueId: <same-uuid-as-step-1>

{
  "client_id": "go-biz-web-new",
  "grant_type": "password",
  "data": {
    "email": "<GOBIZ_EMAIL>",
    "password": "<GOBIZ_PASSWORD>"
  }
}

→ 201 Created
{
  "access_token": "eyJ...(JWE, ~1.5KB)...",
  "refresh_token": "eyJ...(JWE, ~400B)...",
  "dbl_enabled": true
}
```

## Required Headers (constant across both requests)

| Header | Value | Notes |
|--------|-------|-------|
| `Content-Type` | `application/json` | NOT form-urlencoded |
| `Gojek-Country-Code` | `ID` | Indonesia |
| `Gojek-Timezone` | `Asia/Jakarta` | WIB |
| `X-AppVersion` | `transaction-1.22.0-3d465258` | Portal build version — may need periodic updates |
| `X-Platform` | `Web` | |
| `X-User-Type` | `merchant` | Distinguishes from consumer auth |
| `X-DeviceOS` | `Web` | |
| `X-AppId` | `go-biz-web-dashboard` | Different from body `client_id` |
| `X-UniqueId` | UUID v4 (generated once per session) | Device fingerprint |

## Implementation

**File:** `convex/integrations/gobiz/adapter.ts`

### Changes to `loginWithCredentials`

The refresh_token path (Step 1 in current code) stays as-is — it works with form-urlencoded.

The password grant path (Step 2 in current code) changes to:

1. Add `buildGojekAuthHeaders()` helper that returns the 8 headers + a generated UUID
2. POST `/goid/login/request` with JSON body (Step 1 above)
3. POST `/goid/token` with JSON body + nested `data: { email, password }` (Step 2 above)
4. Both use `application/json` content type

### Suggested helper

```typescript
function buildGojekAuthHeaders(): Record<string, string> {
  const uniqueId = crypto.randomUUID(); // or hardcode a stable UUID per install
  return {
    "Content-Type": "application/json",
    "Gojek-Country-Code": "ID",
    "Gojek-Timezone": "Asia/Jakarta",
    "X-AppVersion": "transaction-1.22.0-3d465258",
    "X-Platform": "Web",
    "X-User-Type": "merchant",
    "X-DeviceOS": "Web",
    "X-AppId": "go-biz-web-dashboard",
    "X-UniqueId": uniqueId,
  };
}
```

### Existing code that stays unchanged

- `attemptTokenRefresh()` — 3-method refresh cascade (cookie, rotate, API)
- `resolveGoBizToken()` — token resolution from DB/env
- `fetchWithAuth()` — API fetch with 401 retry
- `syncGoBizRevenue` / `autoSyncGoBizRevenue` — revenue sync actions
- Frontend: `GoBizTokenDialog.tsx` — already wired to call `loginWithCredentials`
- Schema: `platformCredentials` table — no changes needed

## Validation Plan

1. Update `testProbe.ts` with exact HAR headers + JSON format → run from Convex dashboard
2. Confirm both steps return 201
3. Update `loginWithCredentials` with the fix
4. Test via UI "Refresh Token (One-Click)" button
5. Verify the saved token works by triggering a manual GoBiz sync

## Token Notes

- **Format:** JWE (encrypted JWT, `alg: dir, enc: A128GCM`) — cannot decode client-side
- **Access token lifetime:** ~1 hour (based on previous observations)
- **Refresh token lifetime:** Days to weeks
- **No cookies:** The flow is pure REST, no cookie jar needed
- **`dbl_enabled: true`:** Double-login enabled flag (informational, not used)

## Risks

| Risk | Mitigation |
|------|------------|
| `X-AppVersion` becomes stale after GoBiz deploy | Hardcode current value; update when 400/403 appears |
| GoBiz adds OTP/CAPTCHA in future | Fall back to manual paste (already available in UI) |
| Rate limiting on login endpoint | Add exponential backoff; show "try again" message |

## Tools Created

- `scripts/analyze-har.cjs` — HAR auth flow analyzer (reusable for future platforms)
- `scripts/output/gobiz-auth-flow.json` — structured HAR analysis output
- `scripts/output/gobiz-auth-spec.json` — minimal reconstruction spec
