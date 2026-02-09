# GoBiz GoFood Sales Script - Handover Guide

## What This Script Does

Pulls **daily sales data** from the GoFood Merchant Portal (GoBiz) analytics API and displays:
- **Gross Sales** (total_gmv_topline_amount) -- what customers paid
- **Net Sales** (total_gmv_bottomline_amount) -- what you receive after deductions
- **Commission** (total_commission_amount) -- GoFood's cut (~21.1%)
- **Ad Burn** and **Promo Burn** -- if any ad/promo spend exists

Currently fetches the **last 5 days** of data.

---

## File Location

```
product_master/
  scripts/
    gobiz_sales_poc.py          <-- The main script
    .gobiz_creds.json           <-- Token storage (auto-created, gitignored)
```

---

## Prerequisites

- **Python 3.8+** (already installed on your machine)
- **`requests` library** -- install if missing:
  ```bash
  pip install requests
  ```
- **Active GoBiz account** logged into https://portal.gofoodmerchant.co.id

---

## How to Get Your Tokens

### Step 1: Log into GoBiz Portal
1. Open Chrome and go to https://portal.gofoodmerchant.co.id
2. Log in with your GoID credentials
3. Navigate to **Analytics > Sales GoFood** (or any analytics page)

### Step 2: Get the Access Token (quick method)
1. Press **F12** to open Chrome DevTools
2. Go to the **Network** tab
3. Look for a request to `_msearch` (reload the page if needed)
4. Click on that request
5. In the **Headers** tab, find `authorization` under Request Headers
6. Copy the full value starting with `Bearer eyJ...`

### Step 3: Get the Refresh Token (for long-lived sessions)
1. In Chrome DevTools, go to **Application** tab (not Network)
2. In the left sidebar, expand **Cookies** > `https://portal.gofoodmerchant.co.id`
3. Find and copy the value of:
   - `access_token` -- the long JWE string
   - `refresh_token` -- a shorter JWE string

---

## How to Run the Script

### Option A: Quick Run with Access Token (~1 hour validity)

Open a terminal in the `product_master` folder and run:

```bash
python scripts/gobiz_sales_poc.py --token "Bearer eyJhbGci..."
```

Replace the token with the one you copied from Step 2.

### Option B: Run with Refresh Token (auto-renews for days/weeks)

```bash
python scripts/gobiz_sales_poc.py --token "Bearer eyJhbGci..." --refresh-token "eyJhbGci..."
```

This way, if the access token expires mid-run, it will automatically try to refresh it.

### Option C: Credentials File (most convenient, recommended)

1. Create a file at `scripts/.gobiz_creds.json` with this content:

```json
{
  "access_token": "eyJhbGciOiJkaXIi...paste-full-access-token-here...",
  "refresh_token": "eyJhbGciOiJkaXIi...paste-full-refresh-token-here..."
}
```

> **Note:** For the access_token, do NOT include the `Bearer ` prefix -- just the token itself.

2. Then simply run:

```bash
python scripts/gobiz_sales_poc.py
```

The script will auto-load tokens from the file. When it successfully refreshes, it saves the new tokens back to the file automatically.

### Option D: Environment Variables

```bash
# Windows (CMD)
set GOBIZ_TOKEN=Bearer eyJhbGci...
set GOBIZ_REFRESH_TOKEN=eyJhbGci...
python scripts/gobiz_sales_poc.py

# Windows (PowerShell)
$env:GOBIZ_TOKEN="Bearer eyJhbGci..."
$env:GOBIZ_REFRESH_TOKEN="eyJhbGci..."
python scripts/gobiz_sales_poc.py

# Linux/Mac
export GOBIZ_TOKEN="Bearer eyJhbGci..."
export GOBIZ_REFRESH_TOKEN="eyJhbGci..."
python scripts/gobiz_sales_poc.py
```

---

## Expected Output

```
GoBiz GoFood Sales Fetcher v2 (with auto-refresh)
--------------------------------------------------
  Access token:  Bearer eyJhbGciOiJkaXIiLCJjdHk...CBm8RuTmXw
  Refresh token: eyJhbGciOiJkaXIiLCJj...jEepUMF2ZQ

Fetching data for 2026-02-03 to 2026-02-07 (WIB)...

  Fetching 2026-02-03 (Tuesday)... OK - Gross: Rp 0, Net: Rp 0
  Fetching 2026-02-05 (Thursday)... OK - Gross: Rp 380,000, Net: Rp 299,858
  Fetching 2026-02-06 (Friday)... OK - Gross: Rp 500,000, Net: Rp 394,550
  Fetching 2026-02-07 (Saturday)... OK - Gross: Rp 815,000, Net: Rp 643,116

=====================================================================================
  GoBiz GoFood Sales Report - Last 5 Days
=====================================================================================
  Date           Day            Gross Sales      Commission       Net Sales
-------------------------------------------------------------------------------------
  2026-02-05     Thursday        Rp 380,000       Rp 80,142      Rp 299,858
  2026-02-06     Friday          Rp 500,000      Rp 105,450      Rp 394,550
  2026-02-07     Saturday        Rp 815,000      Rp 171,884      Rp 643,116
-------------------------------------------------------------------------------------
  TOTAL                        Rp 1,695,000      Rp 357,476    Rp 1,337,524

  Commission rate: 21.1% of gross sales
  Net retention:   78.9% of gross sales
=====================================================================================
```

---

## Token Lifetimes

| Token | Lifetime | Notes |
|-------|----------|-------|
| **Access Token** | ~1 hour (3600 seconds) | Expires quickly, needs refresh |
| **Refresh Token** | Days to weeks (up to 9 months) | Long-lived, renews the access token |

- When the access token expires, the script automatically tries to refresh it using the refresh token
- If refresh succeeds, new tokens are saved to `.gobiz_creds.json`
- If refresh fails (e.g., refresh token also expired), you'll need to log into the portal again and grab fresh tokens

---

## Troubleshooting

| Problem | Solution |
|---------|----------|
| `ERROR: Token expired or invalid (HTTP 401)` | Access token expired. Grab a fresh one from DevTools, or ensure refresh token is provided |
| `TOKEN EXPIRED! ... FAILED` | Both tokens expired. Log into the portal again and copy fresh tokens |
| `ModuleNotFoundError: No module named 'requests'` | Run `pip install requests` |
| All days show `Rp 0` | Those days had no orders (e.g., shop was closed) |
| `Connection error` | Check internet connection; the portal may be temporarily down |

---

## How It Works (Technical)

1. The script calls the GoBiz analytics Elasticsearch backend at:
   ```
   POST https://portal.gofoodmerchant.co.id/analytics-backend/api/datasources/proxy/63/_msearch
   ```

2. The date range and metrics are passed via **custom HTTP headers** (not query body):
   - `x-range-from` / `x-range-to` -- timestamp range in milliseconds (WIB timezone)
   - `x-ref-ids` -- semicolon-separated metric IDs to fetch
   - `x-dashboard-id: 107` -- the GoFood sales dashboard
   - `x-panel-id: 22` -- the sales summary panel

3. The API returns 5 Elasticsearch aggregation responses (one per metric) in the order matching `x-ref-ids`:
   - `[0]` = Net sales (bottomline)
   - `[1]` = Gross sales (topline)
   - `[2]` = Commission
   - `[3]` = Ad burn
   - `[4]` = Promo burn

4. Each response has `aggregations.2.buckets[0].1.value` containing the daily total

---

## Security Notes

- `.gobiz_creds.json` is **gitignored** -- it will never be committed to the repository
- Tokens are session-based and tied to your GoBiz account
- The refresh token can generate new access tokens, so treat it like a password
- If you suspect tokens are compromised, log out of the GoBiz portal (this invalidates the session)

---

## Future Improvements (TODO)

- [ ] Add CSV export option for the data
- [ ] Support custom date ranges (e.g., `--from 2026-01-01 --to 2026-01-31`)
- [ ] Integrate with Frollie Recipe Master to auto-sync GoFood revenue data
- [ ] Add scheduled/cron job support for daily automated pulls
- [ ] Test and verify the auto-refresh mechanism when the access token actually expires
