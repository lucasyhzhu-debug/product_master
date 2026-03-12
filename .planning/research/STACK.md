# Stack Research

**Domain:** Expense management, double-entry accounting, receipt upload with fraud controls, and financial reporting extension
**Researched:** 2026-03-12
**Confidence:** HIGH -- verified against existing codebase patterns, official Web API documentation, and Convex file storage docs

---

## What This Document Covers

v1.7 (Expense & Accounting) adds five capability areas to the existing Convex + React 19 stack:

1. **Chart of Accounts backbone** -- PSAK-aligned 36-account CoA with seeded defaults
2. **Expense submission with receipt upload** -- file upload to Convex `_storage`, client-side SHA-256 hashing via Web Crypto API
3. **Approval workflow with Delegation of Authority** -- broadcast routing, concurrency guards, fraud controls
4. **Reimbursement batching** -- batch creation, bank transfer tracking, journal entry generation
5. **P&L extension + Expense Analytics** -- OpEx breakdown, EBIT, Net Income, category charts

---

## Existing Stack -- What's Already There (DO NOT Re-Add)

| Already Have | Version | Relevant Capability for v1.7 |
|---|---|---|
| Convex | ^1.31.7 | `_storage` file storage, `generateUploadUrl`, `storage.getUrl()`, mutation serialization (concurrency guard), `protectedMutation` pattern |
| React | ^19.2.0 | File input, hooks, `React.lazy` code splitting |
| TypeScript | ~5.9.3 | Type safety, ES2022 target, `DOM` lib types include Web Crypto API |
| Vite | ^7.2.4 | Build tool, dev server (HTTPS available for Web Crypto) |
| Recharts | ^3.7.0 | `BarChart`, `AreaChart`, `PieChart`, `LineChart`, `ResponsiveContainer` -- all chart types needed for Expense Analytics |
| date-fns | ^4.1.0 | Date arithmetic for period filtering, late submission checks |
| Tailwind CSS | ^4.1.18 | Styling |
| shadcn/ui (Radix UI) | various | `<Table>`, `<Dialog>`, `<Tabs>`, `<Progress>`, `<Badge>`, `<Card>`, `<Select>`, `<RadioGroup>`, `<Accordion>` |
| Sonner | ^2.0.7 | Toast notifications for approval/rejection/upload feedback |
| Lucide React | ^0.564.0 | Icons including `Upload`, `Receipt`, `CheckCircle`, `XCircle`, `AlertTriangle`, `Banknote` |
| Framer Motion | ^11.15.0 | Animations for status transitions |
| convex-helpers | ^0.1.112 | Utility patterns for Convex |

**Existing file upload infrastructure:**
- `convex/feedback/mutations.ts` -- `generateUploadUrl` mutation (unauthenticated, for feedback screenshots)
- `convex/grabfoodMenu/mutations.ts` -- `generateUploadUrl` mutation (authenticated, for menu photos)
- `src/components/grabfoodMenu/PhotoUpload.tsx` -- Complete client-side upload component: file validation, `fetch(uploadUrl, { method: "POST" })`, storageId extraction
- `convex/feedback/queries.ts` -- `ctx.storage.getUrl(storageId)` pattern for serving stored files

**Existing ID generation pattern:**
- `convex/orders/helpers.ts` -- `generateOrderNumber(date, existingOrdersToday)` using `MMDD-NNN` format
- Orders query existing records to determine sequence number (count-based)
- v1.7 introduces a `counters` table for atomic increment instead (design spec Section 3)

**Existing auth pattern:**
- `convex/lib/auth.ts` -- `requireRole(ctx, args.token, ["admin"])` for all protected mutations
- All roles defined: `kitchen`, `order_staff`, `manager`, `admin`

---

## Recommended Stack Additions

### New Dependencies Required

**None.** Zero new npm packages needed for v1.7.

Every v1.7 requirement is satisfied by existing stack + browser-native Web APIs.

### Decision Matrix -- Why No New Libraries

| Requirement | How to Solve | New Library? |
|---|---|---|
| Receipt image upload | Convex `_storage` + `generateUploadUrl` -- already implemented in GrabFood menu | No |
| SHA-256 receipt hashing | Web Crypto API `crypto.subtle.digest("SHA-256", arrayBuffer)` -- browser-native, ES2022 lib types | No |
| Hex string conversion from hash | `Array.from(new Uint8Array(hashBuffer)).map(b => b.toString(16).padStart(2, "0")).join("")` -- no library needed | No |
| Expense form with receipt preview | shadcn/ui `<Dialog>` + `<Card>` + native `<input type="file" accept="image/*">` | No |
| Approval queue UI | shadcn/ui `<Tabs>` + `<Card>` + `<Badge>` + `<Table>` | No |
| Status timeline visualization | Tailwind CSS + Lucide icons -- simple vertical timeline component | No |
| Chart of Accounts management | shadcn/ui `<Table>` + `<Dialog>` for CRUD | No |
| Expense Analytics: Spend by Category | Recharts `<PieChart>` + `<Pie>` + `<Cell>` -- available in ^3.7.0 | No |
| Expense Analytics: Monthly Trend | Recharts `<LineChart>` + `<Line>` -- available in ^3.7.0 | No |
| Expense Analytics: Spend by Employee | Recharts `<BarChart>` + `<Bar>` -- already used in SalesAnalytics | No |
| P&L extension (OpEx section) | Extend existing `IncomeStatement` component with `journalEntryLines` aggregation | No |
| Counter table for ID generation | New `counters` table with atomic mutation increment -- Convex mutation serialization handles race conditions | No |
| Date period filtering | date-fns `startOfWeek`, `endOfWeek`, `subDays`, `differenceInDays` -- already in project | No |
| Duplicate detection (amount + date window) | Convex index query on `expenses` table -- pure backend logic | No |
| Receipt hash dedup | Convex index `by_receipt_hash` on `expenses` table -- query before insert | No |
| Immutable journal entries | No update mutation -- architectural decision, not a library | No |
| Debit/credit balance validation | Simple arithmetic check `totalDebits === totalCredits` in mutation | No |
| Reimbursement batch grouping | Convex query with `.filter()` grouping by employee -- pure backend | No |
| File size validation | `file.size > MAX_FILE_SIZE` -- browser-native File API | No |
| Image type validation | `file.type` check + `accept="image/jpeg,image/png,image/webp"` attribute | No |

---

## Key Technology Decisions

### 1. Web Crypto API for SHA-256 Receipt Hashing

**Decision:** Use browser-native `crypto.subtle.digest("SHA-256", arrayBuffer)` for receipt deduplication.

**Why:** Web Crypto API is available in all modern browsers (baseline since January 2020). It runs in a secure context (HTTPS), which Vite dev server and Vercel production both provide. The TypeScript `DOM` lib (already in `tsconfig.app.json`) includes full type definitions. No polyfill needed for ES2022 target.

**Implementation pattern:**
```typescript
async function computeReceiptHash(file: File): Promise<string> {
  const buffer = await file.arrayBuffer();
  const hashBuffer = await crypto.subtle.digest("SHA-256", buffer);
  // Use Array.from for ES2022 compatibility (NOT Uint8Array.toHex which requires ES2025+)
  return Array.from(new Uint8Array(hashBuffer))
    .map(b => b.toString(16).padStart(2, "0"))
    .join("");
}
```

**Why client-side, not server-side:** The design spec explicitly requires client-side hashing to avoid reading large files in Convex mutation context. Convex mutations have execution time limits -- reading a multi-MB receipt image into memory for hashing would be wasteful. The hash is computed in the browser and passed as a string argument alongside the storageId.

**Compatibility note:** Do NOT use `Uint8Array.prototype.toHex()` for hex conversion. This method only achieved baseline browser support in September 2025 and the project targets ES2022. Use the `Array.from().map().join()` pattern instead, which works in all browsers.

### 2. Convex `_storage` for Receipt Files

**Decision:** Use existing Convex file storage with the same 3-step upload pattern as GrabFood menu photos.

**Why:** The pattern is already proven in the codebase:
1. Call `generateUploadUrl` mutation to get a short-lived upload URL (expires in 1 hour)
2. `POST` the file to the URL, get back `{ storageId }`
3. Pass `storageId` to the expense submission mutation

**What's different from GrabFood photos:**
- Receipt upload adds SHA-256 hash computation between steps 1 and 3
- Receipt upload requires auth (use `requireRole` pattern from `grabfoodMenu/mutations.ts`, not the unauthenticated `feedback/mutations.ts` pattern)
- File types: `image/jpeg, image/png, image/webp` (same as GrabFood)
- File size limit: 5MB (same as GrabFood `PhotoUpload.tsx`)

**Serving receipt URLs:** Use `ctx.storage.getUrl(receiptFileId)` in queries, following `feedback/queries.ts`. URLs are temporary and regenerated on each query -- this is correct for receipts (no permanent public URL needed).

### 3. Counters Table for Atomic ID Generation

**Decision:** Introduce a `counters` table with compound index for atomic sequential ID generation.

**Why:** The existing order number system counts existing records to determine the next sequence number. This works for orders because order creation is relatively infrequent. For expenses, approvals, and journal entries happening in parallel, the count-based approach risks race conditions. The `counters` table with `prefix + date` compound index and Convex mutation serialization guarantees unique sequential numbers.

**Pattern:**
```typescript
// counters table: { prefix: string, date: string, lastSequence: number }
// Index: by_prefix_date on [prefix, date]
// Mutation reads counter, increments, writes back -- serialized by Convex
```

This is a standard counter/sequence pattern in event-sourced systems. Convex mutation serialization means two simultaneous mutations on the same counter document will be serialized automatically -- no distributed locks needed.

### 4. Recharts for Expense Analytics Charts

**Decision:** Reuse Recharts ^3.7.0 (already installed) for all Expense Analytics visualizations.

**Verified chart types available in Recharts 3.x:**
| Chart Type Needed | Recharts Component | Used in Codebase? |
|---|---|---|
| Spend by Category (pie) | `<PieChart>` + `<Pie>` + `<Cell>` | **New** -- not yet used, but verified available |
| Monthly Trend (line) | `<LineChart>` + `<Line>` | **New** -- not yet used, but verified available |
| Spend by Employee (bar) | `<BarChart>` + `<Bar>` | YES -- `SalesChart.tsx` uses stacked bars |
| Period comparison (area) | `<AreaChart>` + `<Area>` | YES -- `SalesChart.tsx` uses area for monthly |

All imports follow the same pattern as `SalesChart.tsx`:
```typescript
import { PieChart, Pie, Cell, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from "recharts";
```

**No Recharts upgrade needed.** The ^3.7.0 version already installed supports all required chart types. PieChart has been available since Recharts 1.x.

### 5. No Additional Form Library

**Decision:** Use existing shadcn/ui form components (inputs, selects, radio groups) with controlled React state. Do NOT add react-hook-form, formik, or zod for expense forms.

**Why:** The codebase consistently uses controlled components with `useState` for forms (OrderCreate, RecipeEditor, ProductEditor). Adding a form library for one feature would create inconsistency. The expense form has ~8 fields -- not complex enough to justify a form library.

---

## Patterns to Follow

### Receipt Upload Component Pattern

Follow `src/components/grabfoodMenu/PhotoUpload.tsx` structure, extended with SHA-256 hashing:

```typescript
// Pseudocode -- actual implementation follows PhotoUpload.tsx pattern
const handleReceiptUpload = async (file: File) => {
  // 1. Validate file size and type
  if (file.size > MAX_FILE_SIZE) { toast.error("..."); return; }

  // 2. Compute SHA-256 hash (client-side, before upload)
  const hash = await computeReceiptHash(file);

  // 3. Check for duplicate hash (optional pre-check via query)
  // ... or let the mutation reject on duplicate

  // 4. Get upload URL from Convex
  const uploadUrl = await generateUploadUrl({ token });

  // 5. Upload file
  const response = await fetch(uploadUrl, { method: "POST", body: file, headers: { "Content-Type": file.type } });
  const { storageId } = await response.json();

  // 6. Return storageId + hash to parent form
  onUploadComplete(storageId, hash);
};
```

### Journal Entry Creation Pattern

All journal entries follow the same mutation structure. Create a shared helper:

```typescript
// convex/journalEntries/helpers.ts
export function validateJournalBalance(lines: { debitAmount: number; creditAmount: number }[]): void {
  const totalDebits = lines.reduce((sum, l) => sum + l.debitAmount, 0);
  const totalCredits = lines.reduce((sum, l) => sum + l.creditAmount, 0);
  if (Math.abs(totalDebits - totalCredits) > 0.01) {
    throw new Error(`Journal entry does not balance: debits=${totalDebits}, credits=${totalCredits}`);
  }
}
```

### Counter Table Pattern

```typescript
// convex/lib/counters.ts
export async function getNextSequence(ctx: MutationCtx, prefix: string): Promise<string> {
  const now = new Date();
  const dateKey = `${String(now.getMonth() + 1).padStart(2, "0")}${String(now.getDate()).padStart(2, "0")}`;

  const existing = await ctx.db
    .query("counters")
    .withIndex("by_prefix_date", q => q.eq("prefix", prefix).eq("date", dateKey))
    .unique();

  const nextSeq = existing ? existing.lastSequence + 1 : 1;

  if (existing) {
    await ctx.db.patch(existing._id, { lastSequence: nextSeq });
  } else {
    await ctx.db.insert("counters", { prefix, date: dateKey, lastSequence: nextSeq });
  }

  return `${prefix}-${dateKey}-${String(nextSeq).padStart(3, "0")}`;
}
```

---

## What NOT to Add

| Avoid | Why | Use Instead |
|---|---|---|
| `crypto-js` or `js-sha256` | Unnecessary dependency -- Web Crypto API provides native SHA-256 in all modern browsers with better performance (hardware-accelerated) | `crypto.subtle.digest("SHA-256", buffer)` |
| `uuid` or `nanoid` for expense IDs | Design spec requires sequential `MMDD-NNN` format IDs for human readability (bank transfer references) | `counters` table with atomic increment |
| `react-hook-form` or `formik` | Not used anywhere in codebase; expense form has ~8 fields -- controlled `useState` is sufficient and consistent | Controlled components with `useState` |
| `zod` for form validation | Backend already validates via Convex argument validators (`v.string()`, `v.number()`, etc.); frontend validation is simple range/presence checks | Inline validation before mutation call |
| `react-dropzone` | ~30KB for a styled dropzone; receipt upload is a single file select, not drag-and-drop batch upload | Native `<input type="file" accept="image/*">` |
| `sharp` or `jimp` for image processing | No image processing needed -- receipts stored as-is, no resizing/compression | Direct upload to `_storage` |
| `nivo`, `Victory`, `Chart.js` | Recharts ^3.7.0 is already installed and covers all needed chart types (pie, line, bar, area) | Recharts (existing) |
| `@tanstack/react-table` | Expense tables are simple read-only lists with status filters -- no complex sorting/grouping needed | shadcn `<Table>` (existing) |
| `xlsx` / SheetJS | No spreadsheet export needed for v1.7; the existing CSV export pattern on `/financials` covers P&L export | No export library |
| Additional CSS animation library | Status transition animations are simple fade/slide -- Framer Motion (already installed) or Tailwind transitions handle this | Framer Motion or Tailwind `transition-*` |
| Any state management library (Redux, Zustand, Jotai) | Convex provides real-time reactive queries -- approval queue auto-updates when another user approves/rejects; no client-side state sync needed | Convex `useQuery` reactivity |
| External file storage (S3, R2, Cloudflare Images) | Convex `_storage` handles receipt images natively with temporary URLs; no CDN or public URL needed for internal receipts | Convex `_storage` |
| `bcrypt` or password hashing library | No new auth flows; existing PIN-based auth unchanged | Existing `convex/lib/auth.ts` |

---

## Alternatives Considered

| Recommended | Alternative | When Alternative Makes Sense |
|---|---|---|
| Web Crypto API (browser-native SHA-256) | `crypto-js` npm package | Only if you need SHA-256 in a non-secure context (HTTP, no HTTPS). Not applicable -- Vite dev and Vercel production both use HTTPS. |
| `Array.from().map().join()` hex conversion | `Uint8Array.prototype.toHex()` | When targeting ES2025+ and dropping support for browsers before Sept 2025. Project targets ES2022 -- not safe yet. |
| Convex `_storage` for receipts | Cloudflare R2 via `@convex-dev/r2` component | Only if receipts need public CDN URLs, custom domains, or > 1GB files. Internal receipts < 5MB with temporary URLs -- `_storage` is simpler. |
| `counters` table (atomic increment) | Count-based sequence (like orders) | For low-frequency ID generation where race conditions are unlikely. Expenses/JEs may be created in parallel during batch operations -- counter table is safer. |
| Inline form validation | Zod schema validation | When forms have 20+ fields with complex cross-field validation rules. Expense form has ~8 fields with simple rules -- inline is clearer. |
| Controlled `useState` forms | react-hook-form | When forms have many fields, frequent re-renders are a problem, or you need field-level validation feedback. Not the case here -- consistency with existing codebase patterns is more valuable. |

---

## Version Compatibility

| Technology | Version | Compatibility Notes |
|---|---|---|
| Web Crypto API | Browser-native | Baseline since Jan 2020. TypeScript `DOM` lib (in `tsconfig.app.json`: `"lib": ["ES2022", "DOM", "DOM.Iterable"]`) includes `crypto.subtle` types. No polyfill needed. |
| Recharts | ^3.7.0 | `PieChart`, `LineChart` available since Recharts 1.x. No version bump needed. Tree-shakeable -- importing `PieChart` does not pull in unused chart types. |
| Convex `_storage` | ^1.31.7 | `generateUploadUrl`, `storage.getUrl()` available since early Convex versions. 5MB receipt files well within limits (no file size limit on storage, 2-min upload timeout). |
| date-fns | ^4.1.0 | `differenceInDays`, `subDays`, `startOfWeek` all available. Used for late submission check (14-day window) and duplicate detection (7-day window). |
| shadcn/ui Radix primitives | various | `<Tabs>` (for My Expenses / Approvals / All Expenses views), `<RadioGroup>` (for payment method), `<Select>` (for GL account picker) all already installed. |

---

## Installation

```bash
# No new packages to install for v1.7.
# The entire feature set uses existing dependencies + browser-native APIs.

# Verify existing stack is healthy
npm run type-check
npm run build
npm run test
```

---

## Schema Additions Summary (for Stack Context)

10 new tables, 1 modified table. All use existing Convex patterns:

| Table | Key Stack Integration |
|---|---|
| `accounts` | Seeded via `accounts:seedDefaults` (follows `tags:seedDefaults` pattern) |
| `expenses` | `receiptFileId: v.optional(v.id("_storage"))` -- Convex file storage |
| `expenseStatusHistory` | Immutable audit trail (follows order audit trail pattern) |
| `reimbursementBatches` | Links to `bankAccounts` table and `users` table |
| `reimbursementBatchItems` | Junction table (follows `menuProductComponents` pattern) |
| `journalEntries` | Source-linked entries with reversal chain |
| `journalEntryLines` | Denormalized `entryDate` for Convex index queries (cannot span tables) |
| `bankAccounts` | Simple CRUD entity |
| `payrollEntries` | Admin-only, auto-generates journal entry on creation |
| `counters` | Atomic sequence generation for EXP/RMB/JE numbers |
| `users` (modified) | +`bankAccountNumber`, +`bankName` optional fields |

---

## Sources

- Web Crypto API `SubtleCrypto.digest()`: [MDN documentation](https://developer.mozilla.org/en-US/docs/Web/API/SubtleCrypto/digest) -- baseline since Jan 2020, SHA-256 support confirmed -- HIGH confidence
- `Uint8Array.toHex()` browser support: [Can I Use](https://caniuse.com/mdn-javascript_builtins_uint8array_tohex) -- baseline Sept 2025, too new for ES2022 target -- HIGH confidence
- Convex file storage upload pattern: [Convex docs](https://docs.convex.dev/file-storage/upload-files) -- 3-step upload (generateUploadUrl, POST, save storageId) confirmed -- HIGH confidence
- Convex file storage overview: [Convex docs](https://docs.convex.dev/file-storage) -- `_storage` table, `storage.getUrl()`, temporary URLs confirmed -- HIGH confidence
- Recharts PieChart examples: [Recharts docs](https://recharts.github.io/en-US/examples/TwoLevelPieChart/) -- PieChart, Pie, Cell components confirmed available -- HIGH confidence
- Recharts npm: [npm registry](https://www.npmjs.com/package/recharts) -- ^3.7.0 current -- HIGH confidence
- Existing codebase patterns: `src/components/grabfoodMenu/PhotoUpload.tsx` (upload), `convex/feedback/mutations.ts` (generateUploadUrl), `convex/feedback/queries.ts` (storage.getUrl), `convex/orders/helpers.ts` (ID generation), `src/components/salesAnalytics/SalesChart.tsx` (Recharts usage) -- verified directly -- HIGH confidence
- Design spec: `docs/superpowers/specs/2026-03-12-expense-accounting-system-design.md` -- all requirements cross-referenced -- HIGH confidence

---

*Stack research for: Frollie Recipe Master v1.7 -- Expense & Accounting*
*Researched: 2026-03-12*
