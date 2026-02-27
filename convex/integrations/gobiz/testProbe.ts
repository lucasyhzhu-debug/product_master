"use node";

declare const process: { env: Record<string, string | undefined> };

import { internalAction } from "../../_generated/server";
import { internal } from "../../_generated/api";

export const run = internalAction({
  args: {},
  handler: async (ctx): Promise<Record<string, unknown>> => {
    const results: Record<string, unknown> = {};

    // Test the full loginWithCredentials flow by calling the GoID endpoints directly
    // This mirrors what loginWithCredentials does

    const GOBIZ_UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/145.0.7632.110 Safari/537.36";
    const PORTAL_ORIGIN = "https://portal.gofoodmerchant.co.id";

    const headers: Record<string, string> = {
      "user-agent": GOBIZ_UA,
      "origin": PORTAL_ORIGIN,
      "referer": `${PORTAL_ORIGIN}/auth/login/email`,
      "accept": "application/json, text/plain, */*",
      "content-type": "application/json",
      "Gojek-Country-Code": "ID",
      "Gojek-Timezone": "Asia/Jakarta",
      "X-AppVersion": "transaction-1.22.0-3d465258",
      "X-PhoneMake": "Windows 10 64-bit",
      "X-PhoneModel": "Chrome 145.0.7632.110 on Windows 10 64-bit",
      "X-Platform": "Web",
      "X-User-Locale": "en-US",
      "X-User-Type": "merchant",
      "x-DeviceOS": "Web",
      "x-appId": "go-biz-web-dashboard",
      "x-uniqueid": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
    };

    const email = process.env.GOBIZ_EMAIL ?? "";
    const password = process.env.GOBIZ_PASSWORD ?? "";

    // Step 1: login/request
    const s1 = await fetch("https://api.gobiz.co.id/goid/login/request", {
      method: "POST",
      headers,
      body: JSON.stringify({ email, login_type: "password", client_id: "go-biz-web-new" }),
    });
    const s1Body = await s1.json();
    results.step1 = { status: s1.status, body: s1Body };

    if (s1.status !== 201 && s1.status !== 200) {
      return { ...results, error: "Step 1 failed" };
    }

    // Step 2: token grant
    const s2 = await fetch("https://api.gobiz.co.id/goid/token", {
      method: "POST",
      headers,
      body: JSON.stringify({
        client_id: "go-biz-web-new",
        grant_type: "password",
        data: { email, password },
      }),
    });
    const s2Body = await s2.json() as Record<string, unknown>;
    results.step2 = {
      status: s2.status,
      hasAccessToken: !!s2Body.access_token,
      hasRefreshToken: !!s2Body.refresh_token,
      dblEnabled: s2Body.dbl_enabled,
    };

    if (s2Body.access_token) {
      // Save tokens to DB
      const at = String(s2Body.access_token);
      const rt = s2Body.refresh_token ? String(s2Body.refresh_token) : undefined;

      await ctx.runMutation(internal.platformCredentials.mutations.saveDirectToken, {
        platformId: "gobiz",
        bearerToken: `Bearer ${at}`,
        refreshToken: rt,
      });

      results.tokensSaved = true;
      results.accessTokenPreview = at.substring(0, 30) + "...";

      // Now test refresh with the NEW token
      const refreshResp = await fetch("https://api.gobiz.co.id/goid/token", {
        method: "POST",
        headers,
        body: JSON.stringify({
          client_id: "go-biz-web-new",
          grant_type: "refresh_token",
          data: { refresh_token: rt },
        }),
      });
      const refreshBody = await refreshResp.json() as Record<string, unknown>;
      results.refreshTest = {
        status: refreshResp.status,
        hasAccessToken: !!refreshBody.access_token,
        hasRefreshToken: !!refreshBody.refresh_token,
      };
    }

    return results;
  },
});
