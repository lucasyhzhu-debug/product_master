# Stack Research: v1.1 Stabilization & QoL

**Domain:** FMCG production management -- API integrations, order UX, kitchen workflow, consignment cockpit
**Researched:** 2026-02-15
**Confidence:** HIGH (existing codebase patterns verified, minimal new dependencies needed)

---

## Key Finding: Almost Nothing New Required

The existing stack already handles 90% of v1.1 needs. The GoBiz integration (adapter, token refresh, cron sync) is already built. K3Mart token auto-refresh is already built. The architecture for `"use node"` actions, `platformCredentials` storage, and `externalRevenue`/`externalSyncLogs` tables is already in place.

**v1.1 is primarily a feature-build milestone, not a stack-change milestone.**

---

## 1. Existing Stack (DO NOT CHANGE)

These are already installed, current, and validated. Listed for reference only.

| Technology | Version | Role in v1.1 |
|------------|---------|--------------|
| `convex` | ^1.31.7 | Backend: actions for API calls, crons for auto-sync, mutations for data storage |
| `convex-helpers` | ^0.1.112 | `customMutation`/`customQuery` factories (already integrated in v1.0 Phase 10) |
| `react` | ^19.2.0 | Frontend UI |
| `typescript` | ~5.9.3 | Type safety |
| `vite` | ^7.2.4 | Build tooling |
| `tailwindcss` | ^4.1.18 | Styling |
| `@radix-ui/*` | various | UI primitives (dialogs, selects, tabs, etc.) |
| `framer-motion` | ^11.15.0 | Animations (kitchen panel transitions) |
| `@dnd-kit/*` | various | Drag-and-drop (kitchen, order reordering) |
| `sonner` | ^2.0.7 | Toast notifications |
| `lucide-react` | ^0.564.0 | Icons |

---

## 2. New Dependencies Required

### Production Dependencies

| Library | Version | Purpose | Why Recommended | Confidence |
|---------|---------|---------|-----------------|------------|
| `date-fns` | ^4.1.0 | ISO week calculations, date formatting, day-of-week helpers | Kitchen due-date ranking needs `startOfISOWeek`, `getISOWeek`, `format`, `differenceInDays`, `addDays`. K3Mart weekly planner needs ISO week boundaries. Currently the codebase does manual date math with `new Date()` everywhere -- fragile and timezone-bug-prone. date-fns is tree-shakeable (only pay for what you import). | HIGH |

### Dev Dependencies

**None required.** All testing, linting, and build tools are already current.

### Installation

```bash
npm install date-fns@^4.1.0
```

That is the only `npm install` command needed for v1.1.

---

## 3. What NOT to Add

| Library | Why Avoid | What to Do Instead |
|---------|-----------|-------------------|
| `date-holidays` (npm) | 800KB+ package with global holiday data for 200+ countries. We only need ~20 Indonesian holidays for 2026-2027. Massive bundle bloat for a simple lookup table. | Hard-code Indonesian public holidays as a static array in `convex/lib/holidays.ts`. The Indonesian government announces holidays annually (September for next year). A static list updated once per year is simpler and more reliable than an API dependency. |
| `holidayapi.com` or any holiday API | External API dependency for data that changes once per year. Adds latency, failure modes, and possibly cost. | Same as above: static holiday array. |
| `axios` | fetch() is available in Convex `"use node"` actions and the browser. axios adds 50KB for no benefit. | Use native `fetch()` -- already used throughout `convex/integrations/gobiz/adapter.ts` and `convex/platformCredentials/actions.ts`. |
| `luxon` or `moment` | date-fns is smaller, tree-shakeable, and does everything needed. moment is deprecated. luxon is 70KB. | Use date-fns. |
| `react-calendar` or `react-datepicker` | The K3Mart weekly planner and due-date selector are custom UI. A generic calendar component would need heavy customization to show holidays, dispatch plans, and production targets. | Build custom week-view components using date-fns + existing Radix UI primitives (Popover for date picker, custom grid for weekly view). |
| `cron-parser` | The codebase already uses Convex's built-in `crons.cron()` with cron expressions. No parsing needed. | Use Convex cron system (already in `convex/crons.ts`). |
| `jsonwebtoken` | JWT decoding for K3Mart already uses manual `atob()` in `platformCredentials/actions.ts`. No verification needed (tokens are validated by test-fetching). | Continue using the existing manual JWT decode pattern. |
| `node-fetch` | Convex `"use node"` actions have `fetch()` built in. | Use native `fetch()`. |
| `ioredis` / any cache layer | Convex queries are already reactive and cached client-side. Server-side caching is unnecessary. | Rely on Convex's built-in reactivity. |
| `zod` | Convex has its own validator system (`v.string()`, `v.number()`, etc.) for backend. Adding zod creates dual validation. | Use Convex validators for backend, TypeScript types for frontend. |
| Any OAuth library (`passport`, `oauth2-client`, etc.) | The GoBiz "OAuth" is actually just email/password login returning tokens + cookie-based refresh. It is not standard OAuth2. The existing 3-method cascade in `gobiz/adapter.ts` already handles this. | Continue using the existing `attemptTokenRefresh()` cascade. |

---

## 4. Stack Patterns by Feature Area

### Feature 1: GoBiz/GoFood Auto-Auth Token Refresh

**Stack needed:** Already built. No new dependencies.

**Existing infrastructure (verified in codebase):**
- `convex/integrations/gobiz/adapter.ts` -- 3-method token refresh cascade (cookie, rotate, API), `fetchWithAuth()` with 401 retry
- `convex/integrations/gobiz/config.ts` -- All API URLs, merchant IDs, sync config
- `convex/integrations/gobiz/helpers.ts` -- Journal/order parsing, WIB date handling
- `convex/platformCredentials/` -- Token storage (DB), credential management, admin actions
- `convex/crons.ts` -- GoBiz sync runs 7x daily at WIB business hours
- `convex/externalData/` -- Revenue records, sync logs, product mappings

**What v1.1 needs to add (code, not libraries):**
1. Password-grant token refresh (`POST api.gobiz.co.id/goid/token` with email/password) as a 4th method in the cascade -- the endpoint is documented in the API reference but not yet implemented as a refresh method
2. Multi-merchant support (add `G347061572` Crystal store alongside existing `G293156297` Goldfinch)
3. GoBiz credential storage in `platformCredentials` (email/password, same pattern as K3Mart)
4. Auto-auth cron for token refresh (extend existing `crons.ts`)

**Technology pattern:** Convex `internalAction` with `"use node"` + native `fetch()` + `platformCredentials` table. Already proven with K3Mart.

### Feature 2: Order UX Improvements

**Stack needed:** Already built. No new dependencies.

**What changes:**
- Frontend layout changes only (React component restructuring)
- Due date input: use `date-fns` for day-name display (`format(date, 'EEEE')` for "Saturday"), `addDays`/`subDays` for arrow navigation
- Discount display: pure frontend calculation from existing order data
- Audit trail: add `statusUpdatedBy` field to order status update mutations (schema change, not library)

**Technology pattern:** React component refactoring + minor schema additions. All within existing stack.

### Feature 3: Kitchen Due-Date Ranking and Targets

**Stack needed:** `date-fns` (new). Everything else exists.

**Where date-fns is used:**
```typescript
import { format, differenceInCalendarDays, startOfDay, addDays, isBefore } from 'date-fns';

// Kitchen: rank orders by due date urgency
const urgency = differenceInCalendarDays(order.dueDate, Date.now());
const dayName = format(order.dueDate, 'EEEE'); // "Saturday"
const dateDisplay = format(order.dueDate, 'EEE dd MMM'); // "Sat 22 Feb"
```

**Existing infrastructure:**
- `convex/schema.ts` already has `dueDate: v.optional(v.number())` on orders
- `by_status_due_date` and `by_kitchen_visible` indexes already exist
- `convex/productionTargets/` already has target queries and mutations
- Kitchen panels already built (`src/components/kitchen/`)

**What v1.1 needs to add (code, not libraries):**
- Query sorting by `dueDate` (backend query change)
- Due date badges in kitchen panels (frontend)
- Target vs actual comparison display (frontend, data already available)

### Feature 4: K3Mart Cockpit Weekly Planning with Holiday Awareness

**Stack needed:** `date-fns` (new) + static holiday data. No external APIs.

**Where date-fns is used:**
```typescript
import { getISOWeek, startOfISOWeek, endOfISOWeek, eachDayOfInterval, isWeekend, format } from 'date-fns';

// K3Mart weekly planner
const weekStart = startOfISOWeek(selectedDate);
const weekEnd = endOfISOWeek(selectedDate);
const daysInWeek = eachDayOfInterval({ start: weekStart, end: weekEnd });
const weekNumber = `${format(weekStart, 'yyyy')}-W${String(getISOWeek(weekStart)).padStart(2, '0')}`;
```

**Holiday data approach -- static array, not API:**
```typescript
// convex/lib/holidays.ts
export const INDONESIAN_HOLIDAYS_2026: Array<{ date: string; name: string }> = [
  { date: "2026-01-01", name: "Tahun Baru" },
  { date: "2026-01-29", name: "Tahun Baru Imlek" },
  { date: "2026-02-17", name: "Isra Miraj" },
  { date: "2026-03-20", name: "Hari Raya Nyepi" },
  { date: "2026-03-21", name: "Idul Fitri" },
  { date: "2026-03-22", name: "Idul Fitri" },
  // ... ~15 more entries
];

export function isHoliday(dateStr: string): boolean {
  return INDONESIAN_HOLIDAYS_2026.some(h => h.date === dateStr);
}

export function getHolidayName(dateStr: string): string | null {
  return INDONESIAN_HOLIDAYS_2026.find(h => h.date === dateStr)?.name ?? null;
}
```

**Rationale for static over API:**
- Indonesian holidays are announced in September for the following year
- Only ~17 national holidays + ~8 cuti bersama per year
- Zero external dependency, zero latency, zero cost
- Update once per year when government announces next year's holidays
- Can include cuti bersama (collective leave) which most holiday APIs miss

**Existing infrastructure:**
- `convex/k3martCockpit/queries.ts` already has `getWeeklyDispatchPlans` with `weekNumber` parameter
- `k3martDispatchPlans` table with `by_week` index already exists
- K3Mart stock movements, outlet detail, production readiness queries all exist

---

## 5. Convex-Specific Patterns for v1.1

### Pattern: Multi-Merchant GoBiz Config

The current `GOBIZ_CONFIG.merchantId` is a single string. v1.1 needs multiple merchants:

```typescript
// convex/integrations/gobiz/config.ts (updated)
export const GOBIZ_CONFIG = {
  merchants: [
    { id: "G293156297", name: "Legato Gf", displayName: "GoFood Goldfinch" },
    { id: "G347061572", name: "GoFood Crystal", displayName: "GoFood Crystal" },
  ],
  // ... rest of config unchanged
} as const;
```

No new library needed -- just config refactoring.

### Pattern: Credential-Based Auto-Auth (Password Grant)

The GoBiz token API supports email/password grant. This should be added as a 4th refresh method in the existing cascade, using credentials from `platformCredentials`:

```typescript
// In convex/integrations/gobiz/adapter.ts (new method 4)
// Method 4: Password grant (last resort, full re-auth)
const cred = await ctx.runQuery(
  internal.platformCredentials.queries.getCredentialsInternal,
  { platformId: "gobiz" }
);
if (cred?.email && cred?.password) {
  const resp = await fetch("https://api.gobiz.co.id/goid/token", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      client_id: "go-biz-web-new",
      grant_type: "password",
      data: { email: cred.email, password: cred.password },
    }),
  });
  // ... handle response, store tokens
}
```

**Stack implication:** None. Uses existing `fetch()`, existing `platformCredentials` table, existing `updateToken` mutation.

### Pattern: Convex Cron for Token Refresh

Add a dedicated GoBiz token refresh cron (separate from sync cron):

```typescript
// convex/crons.ts (addition)
crons.interval(
  "refresh gobiz token",
  { minutes: 45 },  // Access tokens expire in ~1h
  internal.integrations.gobiz.adapter.autoRefreshGoBizToken
);
```

**Stack implication:** None. Uses existing Convex cron system.

---

## 6. Alternatives Considered

| Category | Recommended | Alternative | Why Not Alternative |
|----------|-------------|-------------|---------------------|
| Date library | date-fns ^4.1.0 | Manual `new Date()` math | Current codebase has timezone bugs in manual date handling (WIB offset calculated inline). date-fns handles edge cases (DST, month boundaries, ISO weeks). Tree-shakeable so bundle impact is minimal (~5KB for used functions). |
| Date library | date-fns ^4.1.0 | Temporal API (TC39) | Not yet shipped in all browsers. Polyfill would be larger than date-fns. |
| Holiday data | Static array | date-holidays npm | 800KB package for 20 entries per year. Absurd overhead. |
| Holiday data | Static array | Holiday API (REST) | External dependency for data that changes once per year. Adds failure mode. |
| Token refresh | Extend existing cascade | Separate auth microservice | Over-engineering. The existing pattern in `gobiz/adapter.ts` is clean, tested, and works. |
| Multi-merchant | Config array | Separate tables | Merchants are just config (ID + display name). No CRUD needed. Config constant is sufficient. |
| Weekly planner UI | Custom grid + date-fns | react-big-calendar / FullCalendar | Heavy calendar libraries designed for month/day views. We need a simple 7-column grid with dispatch quantities. Custom is simpler. |
| Due date picker | Custom with Radix Popover + date-fns | react-datepicker | Another dependency for a focused use case (pick a day within next 7 days with day-name display). Custom is 50 lines of code. |

---

## 7. Version Compatibility

| Package | Compatible With | Notes |
|---------|-----------------|-------|
| `date-fns@^4.1.0` | TypeScript ~5.9 | Full TypeScript support, ESM-first |
| `date-fns@^4.1.0` | Vite ^7 | Tree-shakeable ESM imports work natively |
| `date-fns@^4.1.0` | Convex `"use node"` actions | Can be used in both frontend and backend (Convex actions support npm imports) |
| `date-fns@^4.1.0` | React 19 | No React dependency -- pure utility library |

---

## 8. Summary

### Total new dependencies: 1

```bash
npm install date-fns@^4.1.0
```

### Why so few?

The v1.0 infrastructure milestone (Phases 6-11) built robust foundations:
- **API integration framework:** `platformCredentials`, `externalData`, integration adapters, sync logs
- **GoBiz adapter:** Already handles token refresh, journal sync, order details, auto-matching
- **K3Mart adapter:** Already handles token refresh, stock snapshots, revenue tracking
- **Kitchen infrastructure:** Production log, targets, BOM, panels
- **Cockpit infrastructure:** Dispatch plans, outlet stock, movement history, weekly views

v1.1 is about **using** this infrastructure better, not building new infrastructure.

### What v1.1 phases will actually spend time on:

| Phase | Primary Work | Stack Involvement |
|-------|-------------|-------------------|
| API Audit & Auth Architecture | Design doc + config refactoring | Zero new deps |
| QoL Fixes | React component restructuring | `date-fns` for due-date display |
| Kitchen Overhaul | Query sorting + UI redesign | `date-fns` for date formatting |
| K3Mart Cockpit | Weekly planner UI + holiday overlay | `date-fns` for ISO weeks + static holiday array |
| API Integrations | Multi-merchant + password-grant auth | Zero new deps (extend existing adapters) |

---

## Sources

**Verified in codebase (HIGH confidence):**
- `convex/integrations/gobiz/adapter.ts` -- 3-method token refresh, fetchWithAuth, journal/order sync
- `convex/integrations/gobiz/config.ts` -- API URLs, merchant ID, sync config
- `convex/integrations/k3mart/adapter.ts` -- K3Mart stock sync pattern
- `convex/platformCredentials/actions.ts` -- K3Mart auto-auth with credential-based login
- `convex/k3martCockpit/queries.ts` -- Weekly dispatch plans, outlet stock, production readiness
- `convex/productionTargets/queries.ts` -- Target system with orders/consignment/GoFood sources
- `convex/crons.ts` -- Existing cron jobs (K3Mart 12h refresh, GoBiz 7x daily sync)
- `convex/schema.ts` -- dueDate field on orders, existing indexes

**Official documentation (HIGH confidence):**
- [Convex Cron Jobs](https://docs.convex.dev/scheduling/cron-jobs) -- cron and interval scheduling
- [Convex Scheduled Functions](https://docs.convex.dev/scheduling/scheduled-functions) -- runAfter/runAt for one-off scheduling
- [date-fns npm](https://www.npmjs.com/package/date-fns) -- v4.1.0, tree-shakeable date utility

**API reference (HIGH confidence):**
- `docs/apiS/gojek search transactions documentation.txt` -- GoBiz token API (password grant), journal search, order search, merchant IDs

**Holiday data (MEDIUM confidence):**
- [Indonesia Public Holidays 2026](https://www.eskimo.travel/en/blog/indonesia-public-holidays) -- 17 national holidays + 8 cuti bersama
- [Holiday API Indonesia](https://holidayapi.com/countries/id/2026) -- Programmatic holiday data (not recommended for use, referenced for validation)

---
*Stack research for: Frollie Recipe Master v1.1 Stabilization & QoL*
*Researched: 2026-02-15*
