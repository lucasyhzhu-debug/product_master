#!/usr/bin/env node
/**
 * GoBiz HAR Auth Flow Analyzer
 *
 * Parses a Chrome HAR file and extracts the complete authentication flow
 * for GoBiz/GoFood portal login. Outputs a step-by-step blueprint showing
 * exactly which requests are made, what tokens/cookies flow between them,
 * and what the reconstruction would look like as fetch() calls.
 *
 * Usage:
 *   node scripts/analyze-har.cjs <path-to-har-file>
 *
 * Example:
 *   node scripts/analyze-har.cjs ~/Downloads/portal.gofoodmerchant.co.id.har
 *
 * Output:
 *   - Console: color-coded auth flow summary
 *   - File: scripts/output/gobiz-auth-flow.json (structured blueprint)
 */

const fs = require("fs");
const path = require("path");

// ─── Config ──────────────────────────────────────────────────────────────────

const AUTH_DOMAINS = [
  "api.gobiz.co.id",
  "portal.gofoodmerchant.co.id",
  "accounts.go-jek.com",
  "goid.gojek.com",
  "api.gojek.com",
];

const AUTH_PATH_PATTERNS = [
  /\/goid\//,
  /\/auth\//,
  /\/login/,
  /\/token/,
  /\/oauth/,
  /\/session/,
  /\/otp/,
  /\/verify/,
  /\/use_cases/,
  /\/micro-app\/auth/,
  /\/analytics-backend\/api\/auth/,
];

const SENSITIVE_HEADERS = [
  "cookie",
  "set-cookie",
  "authorization",
  "x-uniqueid",
  "x-appid",
  "x-appversion",
  "x-platform",
  "x-deviceos",
  "x-user-type",
  "gojek-country-code",
  "gojek-timezone",
];

// ─── Helpers ─────────────────────────────────────────────────────────────────

function isAuthRelated(url) {
  try {
    const parsed = new URL(url);
    const domainMatch = AUTH_DOMAINS.some(
      (d) => parsed.hostname === d || parsed.hostname.endsWith("." + d)
    );
    const pathMatch = AUTH_PATH_PATTERNS.some((p) => p.test(parsed.pathname));
    return domainMatch && pathMatch;
  } catch {
    return false;
  }
}

function isAnyTrackedDomain(url) {
  try {
    const parsed = new URL(url);
    return AUTH_DOMAINS.some(
      (d) => parsed.hostname === d || parsed.hostname.endsWith("." + d)
    );
  } catch {
    return false;
  }
}

function parseCookies(cookieHeader) {
  if (!cookieHeader) return {};
  const cookies = {};
  cookieHeader.split(";").forEach((pair) => {
    const [key, ...val] = pair.trim().split("=");
    if (key) cookies[key.trim()] = val.join("=").trim();
  });
  return cookies;
}

function parseSetCookies(headers) {
  const cookies = {};
  for (const h of headers) {
    if (h.name.toLowerCase() === "set-cookie") {
      const [main] = h.value.split(";");
      const [key, ...val] = main.split("=");
      if (key) {
        cookies[key.trim()] = {
          value: val.join("=").trim(),
          full: h.value,
        };
      }
    }
  }
  return cookies;
}

function extractRelevantHeaders(headers) {
  const result = {};
  for (const h of headers) {
    if (SENSITIVE_HEADERS.includes(h.name.toLowerCase())) {
      result[h.name.toLowerCase()] = h.value;
    }
  }
  return result;
}

function redactToken(value, showChars = 20) {
  if (!value || value.length <= showChars + 10) return value;
  return value.substring(0, showChars) + "..." + value.substring(value.length - 10);
}

function safeJsonParse(text) {
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

// ─── Main Analysis ───────────────────────────────────────────────────────────

function analyzeHar(harPath) {
  console.log(`\n🔍 Analyzing HAR file: ${harPath}\n`);

  const raw = fs.readFileSync(harPath, "utf-8");
  const har = JSON.parse(raw);
  const entries = har.log.entries;

  console.log(`   Total requests in HAR: ${entries.length}`);

  // ── Step 1: Filter to auth-related and tracked-domain requests ──

  const authEntries = [];
  const allTrackedEntries = [];

  for (const entry of entries) {
    const url = entry.request.url;

    if (isAnyTrackedDomain(url)) {
      allTrackedEntries.push(entry);
    }

    if (isAuthRelated(url)) {
      authEntries.push(entry);
    }
  }

  console.log(`   Auth-related requests: ${authEntries.length}`);
  console.log(`   All tracked-domain requests: ${allTrackedEntries.length}`);

  // ── Step 2: Extract detailed flow for each auth request ──

  const flow = [];

  for (let i = 0; i < authEntries.length; i++) {
    const entry = authEntries[i];
    const req = entry.request;
    const res = entry.response;

    const url = new URL(req.url);
    const step = {
      index: i + 1,
      method: req.method,
      url: req.url,
      path: url.pathname,
      host: url.hostname,
      status: res.status,
      statusText: res.statusText,
      timestamp: entry.startedDateTime,
      timeTaken: entry.time,

      // Request details
      requestHeaders: extractRelevantHeaders(req.headers),
      requestContentType: req.headers.find(
        (h) => h.name.toLowerCase() === "content-type"
      )?.value,
      requestCookies: parseCookies(
        req.headers.find((h) => h.name.toLowerCase() === "cookie")?.value
      ),
      requestBody: null,
      requestBodyParsed: null,

      // Response details
      responseHeaders: extractRelevantHeaders(res.headers),
      responseContentType: res.content?.mimeType,
      responseCookiesSet: parseSetCookies(res.headers),
      responseBody: null,
      responseBodyParsed: null,
      responseRedirect: res.redirectURL || null,
    };

    // Parse request body
    if (req.postData) {
      step.requestBody = req.postData.text;
      if (req.postData.mimeType?.includes("json")) {
        step.requestBodyParsed = safeJsonParse(req.postData.text);
      } else if (req.postData.mimeType?.includes("form-urlencoded")) {
        step.requestBodyParsed = Object.fromEntries(
          new URLSearchParams(req.postData.text)
        );
      } else if (req.postData.params) {
        step.requestBodyParsed = {};
        for (const p of req.postData.params) {
          step.requestBodyParsed[p.name] = p.value;
        }
      }
    }

    // Parse response body
    if (res.content?.text) {
      step.responseBody = res.content.text;
      if (res.content.mimeType?.includes("json")) {
        step.responseBodyParsed = safeJsonParse(res.content.text);
      }
    }

    flow.push(step);
  }

  // ── Step 3: Analyze token/cookie flow between steps ──

  const tokenFlow = [];

  for (let i = 1; i < flow.length; i++) {
    const prev = flow[i - 1];
    const curr = flow[i];
    const connections = [];

    // Check if any set-cookie from prev appears in curr's request cookies
    for (const [cookieName, cookieData] of Object.entries(
      prev.responseCookiesSet
    )) {
      if (curr.requestCookies[cookieName]) {
        connections.push({
          type: "cookie_forward",
          name: cookieName,
          from: `Step ${prev.index} response (set-cookie)`,
          to: `Step ${curr.index} request (cookie)`,
        });
      }
    }

    // Check if response body tokens appear in next request
    if (prev.responseBodyParsed) {
      const prevTokens = findTokensInObject(prev.responseBodyParsed);
      for (const [key, value] of Object.entries(prevTokens)) {
        // Check in request body
        if (curr.requestBodyParsed) {
          for (const [bKey, bValue] of Object.entries(curr.requestBodyParsed)) {
            if (typeof bValue === "string" && bValue === value) {
              connections.push({
                type: "token_forward",
                name: `${key} → ${bKey}`,
                from: `Step ${prev.index} response body`,
                to: `Step ${curr.index} request body`,
              });
            }
          }
        }
        // Check in authorization header
        const authHeader = curr.requestHeaders["authorization"];
        if (authHeader && authHeader.includes(value)) {
          connections.push({
            type: "token_forward",
            name: `${key} → Authorization header`,
            from: `Step ${prev.index} response body`,
            to: `Step ${curr.index} request header`,
          });
        }
      }
    }

    if (connections.length > 0) {
      tokenFlow.push({ betweenSteps: [prev.index, curr.index], connections });
    }
  }

  // ── Step 4: Print human-readable summary ──

  console.log("\n" + "═".repeat(70));
  console.log("  GOBIZ AUTH FLOW — STEP BY STEP");
  console.log("═".repeat(70));

  for (const step of flow) {
    const statusColor =
      step.status >= 200 && step.status < 300
        ? "✅"
        : step.status >= 300 && step.status < 400
          ? "↪️ "
          : "❌";

    console.log(
      `\n${statusColor} Step ${step.index}: ${step.method} ${step.path}`
    );
    console.log(`   Host: ${step.host}`);
    console.log(`   Status: ${step.status} ${step.statusText}`);
    console.log(`   Time: ${step.timestamp}`);

    if (step.requestContentType) {
      console.log(`   Content-Type: ${step.requestContentType}`);
    }

    // Show relevant request headers
    const headerKeys = Object.keys(step.requestHeaders).filter(
      (k) => k !== "cookie"
    );
    if (headerKeys.length > 0) {
      console.log(`   Headers: ${headerKeys.join(", ")}`);
    }

    // Show request cookies (names only)
    const cookieNames = Object.keys(step.requestCookies);
    if (cookieNames.length > 0) {
      console.log(`   Cookies sent: ${cookieNames.join(", ")}`);
    }

    // Show request body (redacted)
    if (step.requestBodyParsed) {
      const redacted = {};
      for (const [k, v] of Object.entries(step.requestBodyParsed)) {
        if (
          typeof v === "string" &&
          (k.includes("password") || k.includes("token") || k.includes("secret"))
        ) {
          redacted[k] = redactToken(v, 8);
        } else if (typeof v === "object" && v !== null) {
          // Recurse one level for nested objects like data: { email, password }
          const inner = {};
          for (const [ik, iv] of Object.entries(v)) {
            if (
              typeof iv === "string" &&
              (ik.includes("password") || ik.includes("token"))
            ) {
              inner[ik] = redactToken(iv, 8);
            } else {
              inner[ik] = iv;
            }
          }
          redacted[k] = inner;
        } else {
          redacted[k] = v;
        }
      }
      console.log(`   Request Body: ${JSON.stringify(redacted, null, 2).split("\n").join("\n   ")}`);
    }

    // Show set-cookie names
    const setCookieNames = Object.keys(step.responseCookiesSet);
    if (setCookieNames.length > 0) {
      console.log(`   Cookies set: ${setCookieNames.join(", ")}`);
    }

    // Show response body (redacted, first 500 chars)
    if (step.responseBodyParsed) {
      const bodyStr = JSON.stringify(step.responseBodyParsed, null, 2);
      const preview =
        bodyStr.length > 500 ? bodyStr.substring(0, 500) + "\n   ..." : bodyStr;
      console.log(`   Response: ${preview.split("\n").join("\n   ")}`);
    } else if (step.responseRedirect) {
      console.log(`   Redirect → ${step.responseRedirect}`);
    }
  }

  // Print token flow connections
  if (tokenFlow.length > 0) {
    console.log("\n" + "═".repeat(70));
    console.log("  TOKEN/COOKIE FLOW BETWEEN STEPS");
    console.log("═".repeat(70));

    for (const tf of tokenFlow) {
      console.log(
        `\n  Between Step ${tf.betweenSteps[0]} → Step ${tf.betweenSteps[1]}:`
      );
      for (const conn of tf.connections) {
        console.log(`    🔗 ${conn.type}: ${conn.name}`);
        console.log(`       From: ${conn.from}`);
        console.log(`       To:   ${conn.to}`);
      }
    }
  }

  // ── Step 5: Generate reconstruction blueprint ──

  console.log("\n" + "═".repeat(70));
  console.log("  RECONSTRUCTION BLUEPRINT (fetch() pseudocode)");
  console.log("═".repeat(70));

  for (const step of flow) {
    if (step.method === "GET" && !step.requestBody) {
      console.log(`\n// Step ${step.index}: ${step.method} ${step.path}`);
      console.log(`const resp${step.index} = await fetch("${step.url}", {`);
      console.log(`  method: "GET",`);
      console.log(`  headers: ${JSON.stringify(step.requestHeaders, null, 4)},`);
      console.log(`  redirect: "manual",`);
      console.log(`});`);
    } else if (step.method === "POST") {
      console.log(`\n// Step ${step.index}: ${step.method} ${step.path}`);
      console.log(`const resp${step.index} = await fetch("${step.url}", {`);
      console.log(`  method: "POST",`);
      console.log(`  headers: {`);
      if (step.requestContentType) {
        console.log(
          `    "content-type": "${step.requestContentType}",`
        );
      }
      for (const [k, v] of Object.entries(step.requestHeaders)) {
        if (k !== "cookie") {
          console.log(`    "${k}": "${redactToken(v)}",`);
        }
      }
      console.log(`  },`);
      if (step.requestBodyParsed) {
        console.log(
          `  body: ${JSON.stringify(step.requestBodyParsed, null, 4)},`
        );
      }
      console.log(`});`);
      console.log(`// → ${step.status} ${step.statusText}`);
    }
  }

  // ── Step 6: Save structured output ──

  const outputDir = path.join(__dirname, "output");
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  const output = {
    analyzedAt: new Date().toISOString(),
    harFile: path.basename(harPath),
    totalRequests: entries.length,
    authRequests: authEntries.length,
    flow: flow.map((step) => ({
      ...step,
      // Redact sensitive values in output file
      requestBody: undefined,
      responseBody: undefined,
    })),
    tokenFlow,
    summary: {
      endpoints: [...new Set(flow.map((s) => `${s.method} ${s.path}`))],
      hostsContacted: [...new Set(flow.map((s) => s.host))],
      cookiesInvolved: [
        ...new Set(
          flow.flatMap((s) => [
            ...Object.keys(s.requestCookies),
            ...Object.keys(s.responseCookiesSet),
          ])
        ),
      ],
      statusCodes: [...new Set(flow.map((s) => s.status))],
    },
  };

  const outputPath = path.join(outputDir, "gobiz-auth-flow.json");
  fs.writeFileSync(outputPath, JSON.stringify(output, null, 2));
  console.log(`\n\n📁 Structured output saved to: ${outputPath}`);

  // Also save a "reconstruction spec" — minimal data needed to rebuild
  const specPath = path.join(outputDir, "gobiz-auth-spec.json");
  const spec = flow.map((step) => ({
    step: step.index,
    method: step.method,
    url: step.url,
    contentType: step.requestContentType,
    requestBodyKeys: step.requestBodyParsed
      ? Object.keys(step.requestBodyParsed)
      : null,
    requestHeaderKeys: Object.keys(step.requestHeaders),
    status: step.status,
    responseBodyKeys: step.responseBodyParsed
      ? Object.keys(step.responseBodyParsed)
      : null,
    cookiesSent: Object.keys(step.requestCookies),
    cookiesReceived: Object.keys(step.responseCookiesSet),
  }));
  fs.writeFileSync(specPath, JSON.stringify(spec, null, 2));
  console.log(`📁 Auth spec saved to: ${specPath}`);

  console.log("\n✅ Analysis complete!\n");
}

// ─── Token Finder ────────────────────────────────────────────────────────────

function findTokensInObject(obj, prefix = "") {
  const tokens = {};
  if (!obj || typeof obj !== "object") return tokens;

  for (const [key, value] of Object.entries(obj)) {
    const fullKey = prefix ? `${prefix}.${key}` : key;
    if (typeof value === "string" && value.length > 20) {
      // Likely a token
      if (
        key.includes("token") ||
        key.includes("Token") ||
        key.includes("jwt") ||
        key.includes("session") ||
        key.includes("access") ||
        key.includes("refresh") ||
        key.includes("auth") ||
        value.startsWith("eyJ") // JWT
      ) {
        tokens[fullKey] = value;
      }
    } else if (typeof value === "object" && value !== null) {
      Object.assign(tokens, findTokensInObject(value, fullKey));
    }
  }
  return tokens;
}

// ─── Entry Point ─────────────────────────────────────────────────────────────

const harPath = process.argv[2];

if (!harPath) {
  console.log("Usage: node scripts/analyze-har.cjs <path-to-har-file>");
  console.log("");
  console.log("Steps to get a HAR file:");
  console.log("  1. Open Chrome → F12 (DevTools) → Network tab");
  console.log('  2. Check "Preserve log" checkbox');
  console.log("  3. Clear cookies for *.gobiz.co.id and *.gofoodmerchant.co.id");
  console.log("  4. Navigate to portal.gofoodmerchant.co.id and log in");
  console.log('  5. Right-click Network tab → "Save all as HAR with content"');
  console.log("  6. Run this script with the saved HAR file path");
  process.exit(1);
}

if (!fs.existsSync(harPath)) {
  console.error(`Error: File not found: ${harPath}`);
  process.exit(1);
}

analyzeHar(harPath);
