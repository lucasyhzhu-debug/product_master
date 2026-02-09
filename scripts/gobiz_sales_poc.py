"""
GoBiz Sales Analytics - Proof of Concept
Pulls gross sales, net sales, and commission from GoFood merchant portal.

Usage:
    Option A (access token only - lasts ~1 hour):
        1. Log into https://portal.gofoodmerchant.co.id/analytics/sales-gofood
        2. Open browser DevTools > Network tab
        3. Find the _msearch request, copy the Bearer token from Authorization header
        4. Run: python scripts/gobiz_sales_poc.py --token "Bearer eyJ..."

    Option B (with refresh token - auto-renews for days):
        1. Log into the portal, open DevTools > Application > Cookies
        2. Copy both access_token and refresh_token cookie values
        3. Run: python scripts/gobiz_sales_poc.py --refresh-token "eyJ..."
           (It will use the refresh token to get a fresh access token automatically)

    Option C (credentials file - most convenient):
        1. Create scripts/.gobiz_creds.json with:
           {"access_token": "eyJ...", "refresh_token": "eyJ..."}
        2. Run: python scripts/gobiz_sales_poc.py
           (Auto-loads and auto-refreshes)

Token lifetime:
    - Access token: ~1 hour (3600 seconds)
    - Refresh token: ~days/weeks (session-based, up to 9 months)
"""

import requests
import json
import os
import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path

# === Configuration ===
BASE_URL = "https://portal.gofoodmerchant.co.id/analytics-backend/api/datasources/proxy/63/_msearch"
PORTAL_BASE = "https://portal.gofoodmerchant.co.id"
PARAMS = {"max_concurrent_shard_requests": 5}

# Credentials file path (next to this script)
CREDS_FILE = Path(__file__).parent / ".gobiz_creds.json"

# WIB timezone (UTC+7)
WIB = timezone(timedelta(hours=7))

# The ref IDs that map to each metric (order matters - matches response order)
REF_IDS = [
    "total_gmv_bottomline_amount",  # Net sales
    "total_gmv_topline_amount",     # Gross sales
    "total_commission_amount",      # Commission
    "total_ad_burn_amount",         # Ad spend
    "total_promo_burn_amount",      # Promo spend
]


# ========================================================================
# Token Management
# ========================================================================

class TokenManager:
    """Manages GoBiz access and refresh tokens with auto-renewal."""

    def __init__(self):
        self.access_token = None
        self.refresh_token = None
        self._load_tokens()

    def _load_tokens(self):
        """Load tokens from CLI args, env vars, or credentials file."""

        # Priority 1: CLI arguments
        args = sys.argv[1:]
        for i, arg in enumerate(args):
            if arg == "--token" and i + 1 < len(args):
                self.access_token = args[i + 1]
            elif arg == "--refresh-token" and i + 1 < len(args):
                self.refresh_token = args[i + 1]

        # Priority 2: Environment variables
        if not self.access_token:
            self.access_token = os.environ.get("GOBIZ_TOKEN", "").strip() or None
        if not self.refresh_token:
            self.refresh_token = os.environ.get("GOBIZ_REFRESH_TOKEN", "").strip() or None

        # Priority 3: Credentials file
        if not self.access_token and not self.refresh_token:
            self._load_from_file()

        # Priority 4: Interactive prompt
        if not self.access_token and not self.refresh_token:
            print("No tokens found. Options:")
            print("  1. Paste access token (Bearer eyJ... from Authorization header)")
            print("  2. Paste refresh token (eyJ... from refresh_token cookie)")
            choice = input("Paste token > ").strip()
            if choice.startswith("Bearer ") or len(choice) > 500:
                # Likely an access token (they're long JWE tokens)
                self.access_token = choice
            else:
                self.refresh_token = choice

        # Normalize access token format
        if self.access_token and not self.access_token.startswith("Bearer "):
            self.access_token = f"Bearer {self.access_token}"

    def _load_from_file(self):
        """Load tokens from .gobiz_creds.json file."""
        if CREDS_FILE.exists():
            try:
                creds = json.loads(CREDS_FILE.read_text())
                self.access_token = creds.get("access_token")
                self.refresh_token = creds.get("refresh_token")
                if self.access_token:
                    print(f"  Loaded access token from {CREDS_FILE.name}")
                if self.refresh_token:
                    print(f"  Loaded refresh token from {CREDS_FILE.name}")
            except (json.JSONDecodeError, IOError) as e:
                print(f"  Warning: Could not read {CREDS_FILE.name}: {e}")

    def _save_to_file(self):
        """Save current tokens to .gobiz_creds.json for reuse."""
        creds = {}
        if self.access_token:
            # Strip "Bearer " prefix for storage
            token_val = self.access_token
            if token_val.startswith("Bearer "):
                token_val = token_val[7:]
            creds["access_token"] = token_val
        if self.refresh_token:
            creds["refresh_token"] = self.refresh_token
        creds["updated_at"] = datetime.now(WIB).isoformat()

        try:
            CREDS_FILE.write_text(json.dumps(creds, indent=2))
            print(f"  Saved tokens to {CREDS_FILE.name}")
        except IOError as e:
            print(f"  Warning: Could not save {CREDS_FILE.name}: {e}")

    def refresh_access_token(self):
        """
        Use the refresh token to get a new access token.

        The GoBiz portal stores tokens as cookies and uses a cookie-based
        refresh flow. We replicate this by sending the refresh_token cookie
        to the portal and extracting the new access_token from Set-Cookie.
        """
        if not self.refresh_token:
            print("  No refresh token available. Cannot auto-renew.")
            return False

        print("  Attempting token refresh...", end=" ", flush=True)

        # Method 1: Try the portal's cookie-based refresh
        # The portal frontend refreshes by hitting the analytics page with cookies
        cookies = {
            "refresh_token": self.refresh_token,
            "auth_method": "goid",
            "language": "en",
        }
        if self.access_token:
            token_val = self.access_token
            if token_val.startswith("Bearer "):
                token_val = token_val[7:]
            cookies["access_token"] = token_val

        try:
            # Try hitting the auth micro-app to trigger a token refresh
            resp = requests.get(
                f"{PORTAL_BASE}/micro-app/auth",
                cookies=cookies,
                headers={
                    "accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
                    "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/144.0.0.0 Safari/537.36",
                },
                allow_redirects=False,
                timeout=15,
            )

            # Check if new tokens came back in Set-Cookie headers
            new_access = None
            new_refresh = None
            for cookie in resp.cookies:
                if cookie.name == "access_token":
                    new_access = cookie.value
                elif cookie.name == "refresh_token":
                    new_refresh = cookie.value

            if new_access:
                self.access_token = f"Bearer {new_access}"
                if new_refresh:
                    self.refresh_token = new_refresh
                self._save_to_file()
                print("OK (via cookie refresh)")
                return True

            # Method 2: Try the Grafana proxy login endpoint
            # Some Grafana-based portals have a /login endpoint that accepts refresh tokens
            resp2 = requests.post(
                f"{PORTAL_BASE}/analytics-backend/api/auth/token/rotate",
                cookies=cookies,
                headers={
                    "content-type": "application/json",
                    "origin": PORTAL_BASE,
                    "referer": f"{PORTAL_BASE}/analytics/sales-gofood",
                    "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/144.0.0.0 Safari/537.36",
                },
                timeout=15,
            )

            for cookie in resp2.cookies:
                if cookie.name == "access_token":
                    new_access = cookie.value

            if new_access:
                self.access_token = f"Bearer {new_access}"
                self._save_to_file()
                print("OK (via token rotate)")
                return True

            # Method 3: Try GoBiz API refresh endpoint
            resp3 = requests.post(
                "https://api.gobiz.co.id/auth/token/refresh",
                json={"refresh_token": self.refresh_token},
                headers={
                    "content-type": "application/json",
                    "origin": PORTAL_BASE,
                    "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/144.0.0.0 Safari/537.36",
                },
                timeout=15,
            )

            if resp3.status_code == 200:
                data = resp3.json()
                if "access_token" in data:
                    self.access_token = f"Bearer {data['access_token']}"
                    if "refresh_token" in data:
                        self.refresh_token = data["refresh_token"]
                    self._save_to_file()
                    print("OK (via API refresh)")
                    return True

            print(f"FAILED (no new token received)")
            print(f"    Auth page: HTTP {resp.status_code}")
            print(f"    Token rotate: HTTP {resp2.status_code}")
            print(f"    API refresh: HTTP {resp3.status_code}")
            return False

        except requests.RequestException as e:
            print(f"FAILED ({e})")
            return False

    def get_bearer_token(self):
        """Get the current bearer token string."""
        return self.access_token

    def summary(self):
        """Print token status summary."""
        if self.access_token:
            t = self.access_token
            print(f"  Access token:  {t[:30]}...{t[-10:]}")
        else:
            print("  Access token:  (none)")
        if self.refresh_token:
            r = self.refresh_token
            print(f"  Refresh token: {r[:20]}...{r[-10:]}")
        else:
            print("  Refresh token: (none)")


# ========================================================================
# Date & Request Helpers
# ========================================================================

def get_date_range_ms(date_obj):
    """
    Get start/end timestamps in milliseconds for a given date (WIB).
    Start = midnight WIB, End = 23:59:59.999 WIB
    """
    start = datetime(date_obj.year, date_obj.month, date_obj.day, 0, 0, 0, tzinfo=WIB)
    end = datetime(date_obj.year, date_obj.month, date_obj.day, 23, 59, 59, 999000, tzinfo=WIB)
    start_ms = int(start.timestamp() * 1000)
    end_ms = int(end.timestamp() * 1000)
    return start_ms, end_ms


def get_comparison_range_ms(date_obj):
    """Get comparison range (previous day) timestamps in milliseconds."""
    prev_day = date_obj - timedelta(days=1)
    return get_date_range_ms(prev_day)


def build_headers(token, range_from_ms, range_to_ms, comp_from_ms, comp_to_ms):
    """Build the request headers matching the GoBiz portal format."""
    return {
        "accept": "*/*",
        "accept-language": "en-US,en;q=0.9",
        "authentication-type": "go-id",
        "authorization": token,
        "content-type": "application/json, application/x-ndjson",
        "origin": PORTAL_BASE,
        "referer": f"{PORTAL_BASE}/analytics/sales-gofood?date_range=this_week",
        "x-comp-range-from": str(comp_from_ms),
        "x-comp-range-offset": "",
        "x-comp-range-to": str(comp_to_ms),
        "x-custom-ad-slot": "",
        "x-custom-interval": "1d",
        "x-custom-merchant-id": "",
        "x-dashboard-id": "107",
        "x-grafana-org-id": "1",
        "x-panel-id": "22",
        "x-range-from": str(range_from_ms),
        "x-range-to": str(range_to_ms),
        "x-ref-ids": ";".join(REF_IDS),
        "x-setting-interval": "1d",
    }


# ========================================================================
# Data Fetching & Parsing
# ========================================================================

def fetch_day_data(token_manager, date_obj, retry_on_401=True):
    """Fetch sales data for a single day. Auto-refreshes token on 401."""
    token = token_manager.get_bearer_token()
    if not token:
        print("ERROR: No access token available.")
        return None

    range_from_ms, range_to_ms = get_date_range_ms(date_obj)
    comp_from_ms, comp_to_ms = get_comparison_range_ms(date_obj)

    headers = build_headers(token, range_from_ms, range_to_ms, comp_from_ms, comp_to_ms)

    response = requests.post(
        BASE_URL,
        params=PARAMS,
        headers=headers,
        data="",
        timeout=30,
    )

    if response.status_code == 401 and retry_on_401:
        print("TOKEN EXPIRED!", flush=True)
        if token_manager.refresh_access_token():
            # Retry with new token
            print(f"  Retrying {date_obj.strftime('%Y-%m-%d')}...", end=" ", flush=True)
            return fetch_day_data(token_manager, date_obj, retry_on_401=False)
        else:
            print("  Could not refresh token. Get a fresh token from the browser.")
            sys.exit(1)

    if response.status_code == 401:
        print("ERROR: Token still invalid after refresh attempt.")
        sys.exit(1)

    if response.status_code != 200:
        print(f"ERROR: HTTP {response.status_code} for {date_obj.strftime('%Y-%m-%d')}")
        print(f"Response: {response.text[:500]}")
        return None

    data = response.json()
    return parse_response(data, date_obj)


def parse_response(data, date_obj):
    """
    Parse the _msearch response.
    Response order matches REF_IDS order:
      [0] = net sales (bottomline)
      [1] = gross sales (topline)
      [2] = commission
      [3] = ad burn
      [4] = promo burn
    """
    responses = data.get("responses", [])

    result = {
        "date": date_obj.strftime("%Y-%m-%d"),
        "day": date_obj.strftime("%A"),
        "net_sales": 0.0,
        "gross_sales": 0.0,
        "commission": 0.0,
        "ad_burn": 0.0,
        "promo_burn": 0.0,
    }

    metric_keys = ["net_sales", "gross_sales", "commission", "ad_burn", "promo_burn"]

    for i, key in enumerate(metric_keys):
        if i < len(responses):
            resp = responses[i]
            if resp.get("status") == 200:
                buckets = resp.get("aggregations", {}).get("2", {}).get("buckets", [])
                if buckets:
                    result[key] = buckets[0].get("1", {}).get("value", 0.0)

    return result


# ========================================================================
# Output Formatting
# ========================================================================

def format_idr(amount):
    """Format as Indonesian Rupiah."""
    return f"Rp {amount:,.0f}"


def print_results(results):
    """Print results as a formatted table."""
    print("\n" + "=" * 85)
    print("  GoBiz GoFood Sales Report - Last 5 Days")
    print("=" * 85)
    print(
        f"  {'Date':<14} {'Day':<10} {'Gross Sales':>15} {'Commission':>15} {'Net Sales':>15}"
    )
    print("-" * 85)

    total_gross = 0
    total_net = 0
    total_commission = 0

    for r in results:
        total_gross += r["gross_sales"]
        total_net += r["net_sales"]
        total_commission += r["commission"]

        print(
            f"  {r['date']:<14} {r['day']:<10} "
            f"{format_idr(r['gross_sales']):>15} "
            f"{format_idr(r['commission']):>15} "
            f"{format_idr(r['net_sales']):>15}"
        )

        # Show ad/promo if non-zero
        if r["ad_burn"] > 0 or r["promo_burn"] > 0:
            extras = []
            if r["ad_burn"] > 0:
                extras.append(f"Ad: {format_idr(r['ad_burn'])}")
            if r["promo_burn"] > 0:
                extras.append(f"Promo: {format_idr(r['promo_burn'])}")
            print(f"  {'':>26} ({', '.join(extras)})")

    print("-" * 85)
    print(
        f"  {'TOTAL':<14} {'':10} "
        f"{format_idr(total_gross):>15} "
        f"{format_idr(total_commission):>15} "
        f"{format_idr(total_net):>15}"
    )

    if total_gross > 0:
        commission_pct = (total_commission / total_gross) * 100
        net_pct = (total_net / total_gross) * 100
        print(f"\n  Commission rate: {commission_pct:.1f}% of gross sales")
        print(f"  Net retention:   {net_pct:.1f}% of gross sales")

    print("=" * 85 + "\n")


# ========================================================================
# Main
# ========================================================================

def main():
    print("GoBiz GoFood Sales Fetcher v2 (with auto-refresh)")
    print("-" * 50)

    tm = TokenManager()
    tm.summary()

    # If we only have a refresh token (no access token), refresh first
    if not tm.access_token and tm.refresh_token:
        print("\n  No access token — attempting refresh first...")
        if not tm.refresh_access_token():
            print("  Refresh failed. Please provide an access token.")
            sys.exit(1)

    if not tm.access_token:
        print("\nERROR: No token available. See usage instructions at top of script.")
        sys.exit(1)

    # Calculate last 5 days
    today = datetime.now(WIB).date()
    dates = [today - timedelta(days=i) for i in range(5, 0, -1)]

    print(f"\nFetching data for {dates[0]} to {dates[-1]} (WIB)...\n")

    results = []
    for date_obj in dates:
        day_str = date_obj.strftime("%Y-%m-%d (%A)")
        print(f"  Fetching {day_str}...", end=" ", flush=True)
        result = fetch_day_data(tm, date_obj)
        if result:
            print(f"OK - Gross: {format_idr(result['gross_sales'])}, Net: {format_idr(result['net_sales'])}")
            results.append(result)
        else:
            print("FAILED")

    if results:
        print_results(results)
    else:
        print("\nNo data retrieved. Check your token and try again.")


if __name__ == "__main__":
    main()
