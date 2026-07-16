# CLAUDE.md

## Project Overview

**Frollie Pro** — Real-time recipe and product concept management for an Indonesian FMCG snack company. Tracks food recipes, packaging recipes, product concepts, orders, kitchen production, and inventory with full versioning, cost calculations, and margin analysis.

**Architecture:** Convex (serverless backend + real-time database) + React 19 + TypeScript + Vite

---

## Commands

```bash
# Development (two terminals)
npx convex dev               # Terminal 1: Convex backend (dev env)
npm run dev                  # Terminal 2: Vite frontend (localhost)

# Build & Verify
npm run build                # tsc + vite build (MUST pass before merge)
npm run type-check           # TypeScript only
npm run lint                 # ESLint
npm run test                 # Vitest (unit tests)
npm run test:watch           # Vitest watch mode
npm run test:coverage        # Vitest with coverage

# Deployment
npm run deploy:check         # Pre-deploy validation (dry run)
npm run deploy:safe          # Validated deploy to production

# Convex
npx convex deploy            # Deploy to production
npx convex export            # Backup database
npx convex dashboard         # Open dashboard in browser

# Seeding (run from Convex dashboard Functions tab)
# tags:seedDefaults, menuProducts:seedDefaults
```

**Environments:**
- **Production:** `prod:decisive-wombat-7` (Vercel + GitHub Actions CI)
- **Development:** `dev:exciting-fennec-671` (local `npx convex dev`)
- **CI/CD:** Push to `main` → Convex deploy → Vercel rebuild

---

## Git Workflow

**NO direct commits to main for CODE. Doc-only commits to main are allowed.**

### Doc-only paths (direct-to-main OK)
Commits that ONLY touch these paths may go straight to main:
- `.planning/**` — roadmaps, phase directories, specs, plans, discussion logs, UAT checklists
- `docs/**` — CHANGELOG, SCHEMA, API_REFERENCE, ROADMAP, design docs, review notes, superpowers specs & plans
- Root-level `*.md` — README, CLAUDE.md, etc.
- `.claude/**` — agent definitions, commands, skills, settings

**Rule of thumb:** if `npm run build` or `npm run test` would be unaffected, it's doc-only.

Mixed commits (code + docs) still require a feature branch.

### Code changes — always on a feature branch
```bash
git switch main && git pull
git switch -c feature/{name}   # or fix/{name}
# edit, test...
git add <specific-files>
git commit -m "feat: description"
npm run build                  # MUST pass before merge
git push origin feature/{name}
```

### Workflows that always produce doc-only output
GSD planning (`/gsd-plan-phase`, `/gsd-add-phase`, `/gsd-new-milestone`, `/gsd-map-codebase`), GSD discussion (`/gsd-discuss-phase`, `/gsd-note`), Superpowers brainstorming/plan-writing, code review artifacts (`/gsd-code-review`, `/staffreview`, `/triple-review`), docs updates, verification artifacts (`/gsd-verify-work`, `/gsd-validate-phase`). These commit direct to main with no feature branch.

### Branch-per-phase rule
Every GSD phase runs on its own feature branch (`feature/{slug}`). Before starting phase code work, `git branch --show-current` MUST NOT be `main`. After a phase is verified, merge to main before starting the next. Planning artifacts can land on main independently.

### After every merge to main
Update `docs/CHANGELOG.md` (ALWAYS). Also `docs/SCHEMA.md` if schema changed, `docs/API_REFERENCE.md` if backend changed, `docs/ROADMAP.md` if feature completed.

---

## Planning Requirements

Every implementation plan MUST include these 4 sections. Copy this template:

```markdown
## Git Workflow
**Branch:** `feature/{name}`
**Checkpoints:** TBD based on waves

## Implementation Waves
### Wave 1: Backend [PARALLEL]
| Agent | Task | Files |
|-------|------|-------|
### Wave 2: Frontend [PARALLEL, after Wave 1]
| Agent | Task | Files |
|-------|------|-------|
### Wave 3: Verification [SEQUENTIAL]
| Agent | Task |
|-------|------|
| code-auditor | Type check + pattern compliance |
| Bash | npm run build |

## Documentation Updates
- [ ] CHANGELOG.md
- [ ] {Other docs if applicable}

## Success Criteria
- [ ] `npm run type-check` passes
- [ ] `npm run build` succeeds
- [ ] {Feature-specific criteria}
```

**Validation gate:** Before implementing, confirm all 4 sections exist. If any is missing, add it first.

---

## File Map

See `docs/FILE_MAP.md` for the per-feature table of which backend/frontend files to touch. Updated whenever a new feature area lands.

---

## Access Control

All routes use `<ProtectedRoute>` with permission- or role-based access. Auth is PIN login with session tokens.

**Roles:** `kitchen`, `order_staff`, `manager`, `admin`

**Backend enforcement:** `requireRole(ctx, args.token, ["admin"])` from `convex/lib/auth.ts`. Add `token: v.string()` to protected mutation args.

Full per-route permission table: `docs/FILE_MAP.md` (Full Role → Route Permission Table section).

---

## Key Business Rules

1. **Unit conversion:** kg→g, l→ml, m→cm. 1 ml = 1 g for liquid calculations.
2. **Version immutability:** Saved versions cannot be edited — create new version.
3. **Linked components:** Recipes can reference other recipe versions as components.
4. **Product pinning:** Products stay on selected recipe/packaging versions. Manual update required.
5. **Reusable components:** Only single-component recipes marked as reusable appear in component selection.
6. **Deletion rules:** Recipes/packaging cannot be deleted if used in products. Error shows blocking products.
7. **Order numbers:** Format `MMDD-NNN` (e.g., `0129-001`) for bank transfer reference.
8. **Kitchen production:** Balls accumulate in trays and auto-allocate to pending orders. Source of truth: `orderItemProduction.unitsRemaining`. UI display: `orderItems.ballsFilled/packageStatus`.
9. **Order status workflow:** Draft → AwaitingPayment → Confirmed → InProduction → Boxed → Labeled → WaitingShipment/WaitingPickup → CompleteShipped/PickedUp. Any non-terminal → Cancelled.
10. **Unified BOM (source of truth for product composition):** `componentTypes` table unifies production units (balls) and packaging items (boxes, stickers). Categories: `production`, `packaging`. **All ball type/count information MUST come from BOM** (`menuProductComponents` + `componentTypes`), NOT from deprecated `menuProducts.productionType`/`productionUnits` or `orderItems.productionType`/`productionUnits`. BOM codes: `BIG_BALL` = 80g/Jumbo, `MID_BALL` = 45g/Original.
11. **Inventory FIFO:** Packaging inventory uses FIFO batch tracking. Stock reserved on order confirmation, consumed on fulfillment.
12. **Production counts source of truth:** All production count data (boxed, stickered, packed, shippedToGoldfinch) derives from `productionLog` aggregation. `productionCounts` is archived (read-only). Resets tracked via `productionResets` timestamps.
13. **"Units sold" = balls, not products:** Any metric labelled "units sold" or "production volume" MUST count BOM-resolved balls (Big + Mid), not product-level order qty. A hamper with 3 balls counts as 3. Lifetime hero card estimates balls via `avgRevenuePerBall` (dynamic, from BOM-linked items — see `getLifetimeTotalsInternal` in `convex/externalData/queries.ts`).

---

## Common Pitfalls

1. **Convex IDs are typed strings** — `Id<"tableName">`, not numbers.
2. **Convex returns undefined while loading** — always check `if (items === undefined) return <Loading />;`.
3. **camelCase in Convex** — field names are `procurementSource`, not `procurement_source`.
4. **Real-time updates** — Convex queries auto-update. No cache invalidation needed after mutations.
5. **Null yield in cost calc** — check `estimatedYieldGrams` before dividing. Return `null` if not set.
6. **Version copy depth** — deep copy components AND ingredients. Shallow copy creates shared references.
7. **Mutations are async** — always `await`.
8. **No dynamic imports in Convex** — static only. Dynamic `import()` works locally but fails silently in production (204 No Content).
9. **React hooks order** — all hooks before any conditional returns. No hooks after early returns.
10. **Auth token in mutations** — protected mutations require `token: v.string()`. Strip before db operations.
11. **NEVER use `productionType`/`productionUnits`** — deprecated on `menuProducts` and `orderItems` (e.g., `productionType="original"` maps to BIG_BALL/80g — misleading). Always derive balls from BOM: `menuProductComponents` + `componentTypes` (filter `category="production"`, read `code` for `BIG_BALL`/`MID_BALL`). **Phase 81 / D-01:** For "is this a production component?" checks in queries, use the canonical predicate `isProductionUnit(ct)` from `convex/reports/productionUnitHelpers.ts` — rule is `category === "production"` alone (no `unit === "pcs"`, no `gramsPerUnit !== undefined` requirement). 5 hand-rolled filters were consolidated in Phase 81; see also Pitfall #18 for the ESLint guard preventing reintroduction of the deleted alternatives.
12. **Branch from main before starting a new phase** — ALWAYS `git switch main && git pull` first. Never branch from another phase's feature branch. If the previous phase isn't merged, merge it or wait. Branching from another feature branch creates messy history.
13. **Count balls, not product units** — "units sold" and production volume MUST resolve BOM to count actual Big + Mid balls. A hamper with 3 balls = 3. Use `menuProductComponents` + `componentTypes` (category=`production`). Lifetime hero card uses dynamic `avgRevenuePerBall` (weighted from BOM-linked revenue items); falls back to 35K IDR/ball when no BOM-linked items exist.
14. **Keep phase directory names short (max 50 chars)** — Windows 260-char path limit + git worktree prefix causes truncation. Use `{number}-{concise-slug}` (e.g., `59-direct-debit-expense-flow`), not the full phase title.
15. **Install `xlsx` from SheetJS CDN, not npm** — npm registry `xlsx@0.18.5` is frozen + known-vulnerable (CVE-2023-30533 prototype pollution, CVE-2024-22363 ReDoS). Install: `npm install --save https://cdn.sheetjs.com/xlsx-0.20.3/xlsx-0.20.3.tgz`. Do NOT run `npm audit fix` on xlsx — it tries to downgrade. After regenerating `package-lock.json`, verify `npm ls xlsx` resolves to `0.20.3`.
16. **Vendor bundle cap — bump or split when adding heavy deps** — `vite-plugin-bundlesize` enforces hard limits in `vite.config.ts`. `npm run build` locally on Windows can succeed while Vercel fails. After Phase 72 added `xlsx@0.20.3` (~50 kB) the vendor chunk went 480 → 542.9 kB and broke prod for ~21h. When adding any heavy npm dep that lands in `vendor-*.js`: either bump the cap in `vite.config.ts` (quick) or extract to its own chunk via `manualChunks` (preferred for rarely-used heavy code). Sequence: PR adding the dep → bump cap in same PR → merge. Current caps: `index-*.js` 500kB, `vendor-react-*.js` 500kB, `vendor-*.js` 600kB.
17. **Hooks are managed globally by GSD redux — don't hand-edit them into project `.claude/settings.json`** — As of the get-shit-done-redux v1.1.0 migration (2026-05-30), GSD installs and maintains its hooks **globally** in `~/.claude/settings.json`, not per-project. The live set is **6 hooks**, all under `~/.claude/hooks/` and all verified exit-0: `gsd-check-update.js` (SessionStart); `gsd-context-monitor.js` + `gsd-read-injection-scanner.js` (PostToolUse); `gsd-prompt-guard.js` + `gsd-read-guard.js` + `gsd-workflow-guard.js` (PreToolUse, matcher `Write|Edit`). **These guard hooks ARE the active redux set — do NOT "remove" them as nonexistent** (the pre-migration version of this note wrongly claimed `gsd-{prompt,read,workflow}-guard.js` don't exist; that was the legacy install, which used `gsd-hooks-health.js` + `bash gsd-*.sh` instead). Let `/gsd-update` manage the global hook set — don't duplicate GSD hook entries into the project `.claude/settings.json`. The durable lesson still holds: any hook entry you DO add must point at a target that exists (missing `.sh`/`.js` → "No such file or directory"; uninstalled CLIs like `caliber` → spawn ENOENT; empty matcher `""` amplifies on every PostToolUse). Before committing a new hook, run its target once with dummy stdin and confirm exit 0.
18. **Don't import the deleted Phase 81 resolvers — ESLint will block them** — Phase 81 deleted 6 helpers + 3 resolvers + 1 type + 1 const in favor of canonical exports. The `no-restricted-imports` rule in `eslint.config.js` blocks reintroduction with directives pointing to the canonical replacement. Banned imports (cumulative across plans 81-02 and 81-03):

    **Platform resolution (use `convex/reports/platform.ts`):**
    - `sourceToPlatform` from `convex/lib/externalSource` → use `platformDisplay(resolvePlatform(row).platform)`
    - `toDisplayChannel`, `sourceToDisplayChannel`, `DisplayChannel`, `DISPLAY_CHANNELS` from `convex/reports/channelTaxonomy` (file deleted entirely) → use `Platform` / `resolvePlatform` / `platformDisplay`

    **WIB date helpers (use `convex/lib/periodRange.ts`):**
    - `toWibDateString` from `convex/staffAttendance/flagEngine` → use `getWibDateStr`
    - `getWibDateString`, `getWibDateStringDaysAgo` from `convex/gofoodDepot/helpers` → use `getWibDateStr`
    - `getWibDateStr` from `convex/lib/counter` (renamed to `getWibMonthDayStr` for MMDD format) → for YYYY-MM-DD use `getWibDateStr` from `convex/lib/periodRange`
    - `utcToWibDateStr` (collapsed into `getWibDateStr`) → use `getWibDateStr` from `convex/lib/periodRange`

    **Production predicate (use `convex/reports/productionUnitHelpers.ts`):**
    - Inline `category === "production" && unit === "pcs"` filters (anti-pattern; see Pitfall #11) → use `isProductionUnit(ct)`

    If lint fails with one of these messages, follow the directive — do NOT add an `// eslint-disable-next-line` override. The frontend `src/lib/dateUtils.ts` parallel `utcToWibDateStr` impl is intentionally NOT banned (D-13 — frontend seam is decoupled).

19. **Backend `roles` MUST align with the route's `requiredPermission`** — A `useSessionQuery` hook subscribes the moment its component mounts, NOT when the consuming dialog opens. If the page is reachable under a `requiredPermission` that resolves to manager+admin, but a child hook calls a `protectedQuery` with `roles: ["admin"]`, every manager mount throws `ConvexError("Unauthorized: role 'manager' not in [admin]")` and the React error boundary surfaces it as a generic "Server Error"/ChunkLoadError page crash. Recurrence pattern (2nd time in 6 weeks for user Nilson): voucher manager-override 2026-04-09, asset register depreciation preview 2026-05-19. **Preferred fix (do this first):** widen the backend `roles` to match the route's permission set — if a manager can reach the page, the backend should accept their writes/reads too. The 2026-05-19 fix widened `getDepreciationPreview` + `getAssetsWithoutAcquisitionJE` + `runDepreciation` + `disposeAsset` + `voidDepreciationMonth` + `backfillAcquisitionJEs` from `["admin"]` to `["manager", "admin"]`. **Fallback (only if the role split is intentional, e.g. payroll for owner only):** (a) default the hook `mode` to `"skip"` so non-permitted callers don't crash; (b) at the consumer pass `open ? "run" : "skip"`; (c) gate the page-level component mount on `user.role === "<required>"`. **Audit checklist** before adding a new `protectedQuery`/`protectedMutation` to an existing page: grep `<ProtectedRoute requiredPermission=` for that route's permission, check the role set it resolves to in `src/lib/types.ts`, and ensure the new function's `roles` is a superset (or matches).

20. **Order features live in TWO parallel surfaces — wire BOTH `OrderSlideOver` AND `OrderDetail`** — there are two order-detail UIs: `src/components/orders/OrderSlideOver.tsx` (the slide-over drawer on the Orders kanban board — the one staff actually use day-to-day) and `src/pages/OrderDetail.tsx` (the full-page route). They are NOT shared — each renders its own Actions section, dialogs, and buttons. Any order-level feature (a new action button, status control, dialog, badge, payment flow, etc.) added to one MUST be added to the other, or it silently won't appear in the surface the user is in. This bit Phase 84: the "Charge via QRIS" button + dialog were wired only into `OrderDetail.tsx`, so it never showed in the slide-over (where staff open orders), and only the live E2E caught it — automated tests render components in isolation and don't assert which surface the user reaches. **Rule:** when implementing or reviewing an order feature, grep BOTH files; treat a change to one as incomplete until the mirror change lands in the other. (Longer term these should share a common Actions component, but until then, mirror by hand.)

21. **Adding a 3rd+ Telegram flow — extend `KNOWN_TELEGRAM_ROLES`, do NOT hardcode env vars** — Phase 85 replaced the single `TELEGRAM_CHAT_ID` env var with a `telegramChats` registry. To add a new bot-delivery destination (e.g. `delivery-alerts`):
   1. Add `"delivery-alerts"` to `KNOWN_TELEGRAM_ROLES` in `convex/telegram/config.ts`.
   2. Write the send-action using `getChatIdByRole({ role: "delivery-alerts" })`.
   3. Operator adds bot to the new group + sends `/register@FrollieProBot`.
   4. Operator assigns role in `/admin/telegram-chats`.
   No code change needed for the chatId lookup, no new env var, no `seedChatFromEnv` call (those are for the legacy pack-list migration only).

22. **New Telegram commands MUST declare a `COMMAND_POLICY` entry** — command authorization is centralized in `convex/telegram/webhook.ts`'s `COMMAND_POLICY: Record<TelegramCommand, "open" | {requiresRole}>`. The `Record<TelegramCommand, …>` type makes a missing entry a compile error, so adding a command to `parseCommand` (`chatRegistry.ts`) forces an auth decision. Default to `{requiresRole: "<role>"}` (per-command role match, deny-by-default); use `"open"` ONLY for bootstrap/help commands (`register`, `start`). The gate checks the SENDER's chat via `getChatAuth`, which honors the same `TELEGRAM_FALLBACK_ROLE` env fallback as `getChatIdByRole` — keep the two resolvers in lockstep, or env-fallback chats will authorize inconsistently with how they're delivered to. Unauthorized senders get a one-line nudge (no dispatch, no `update_id` burned). Shipped 2026-05-30 with the `/sales` command (`docs/superpowers/plans/2026-05-30-telegram-sales-command.md`).

24. **order_staff IS fully enabled on the order-sheet subscription-credit flow — deliberate D11 carve-out** — As of Slice 1 (2026-06-30, product-owner approved), `order_staff` can complete the entire B2B credit-order path: `listActiveSubscriptionsForCustomer`, `getSubscriptionCreditContext`, `createCreditFundedOrder`, `getCreditOrderWhatsappDraft`, and `logCustomerInteraction` all accept `["order_staff", "manager", "admin"]`. `getSubscriptionCreditContext.split.effectiveUnitPrice` (the partner unit price) IS returned to order_staff — do NOT treat this as a D11 leak to "fix". The D11 carve-out is intentional because staff must price eligibles at partner rate, not retail, when splitting the cart. Operate-surface credit fns (`getOrderCreditStatus`, `splitScheduledOrderOnCredit`, `applyPartialCreditToAdHocOrder`) intentionally stay `manager+admin` — Slice 2.

23. **Subscription credit drawdown: reserve on the order row, draw at delivery — banner lives on OrderCreate only** — `createCreditFundedOrder` (and the refactored `applyPartialCreditToAdHocOrder` Path B) set `orders.subscriptionCreditApplied` (integer IDR) as a reservation at order-creation time but post NO `creditLedger` entry. Recognition fires at delivery: `recognizeSubscriptionDelivery` draws `subscriptionCreditApplied ?? totalAmount`. This means (a) `computeWeekAvailableCredit` must net out un-recognized reservations (excl. Cancelled) to prevent double-spend, and (b) `canApplyCredit` returns `false` once an order has a reservation. Eligible cart items are re-priced to the subscription's partner `unitPrice` (not retail) before computing the credit split — do NOT price eligibles at retail. The `SubscriptionCreditBanner` + `useSubscriptionCreditContext` hook live on `src/pages/OrderCreate.tsx` (new-order flow) only, NOT on `OrderSlideOver`/`OrderDetail` (those are existing-order operate surfaces). **Known gap:** partial-credit orders still collect the remainder at full `totalAmount` via QRIS/bank (the collection surface doesn't subtract `subscriptionCreditApplied`); full-cover orders are unaffected (already Paid). **Editing a credit-funded undelivered order (Slice 2):** `editUndeliveredSubscriptionOrder` re-derives `subscriptionCreditApplied = Math.min(applied, newTotalAmount)` — reducing quantity can only decrease or hold the reservation, never increase it. Only full-cover orders are editable: partial-credit orders (`0 < applied < total`) are rejected outright (keeping the cap exact and avoiding the remainder-collection gap). **Edit-control gating:** `EditUndeliveredOrderControl` gates the edit action on BOTH `subscriptionId && subscriptionWeekId`; read-only surfaces (e.g. the subscription week detail) gate on `subscriptionId` alone — do NOT collapse these into one shared boolean.

---

## CRM Design Principles

> Apply to **all CRM / customer-facing surfaces** (customer record, activity timeline, subscriptions, invoices, agreements, funding dashboard). Established 2026-06-23 — don't re-derive when building new CRM features. Full proof + audit: `docs/superpowers/specs/2026-06-23-frollie-crm-design-principles.html`, conformance audit `…-crm-principles-conformance-audit.md`, ready-to-paste schema additions `…-crm-foundational-schema-additions.md`.

**A — Navigation & linking**
- **A1** Every entity has one canonical page; references render as **links** to it (never inert text).
- **A2** Breadcrumbs mirror the **object hierarchy** (not click-history); deep-links resolve a full trail.
- **A3** The customer record is a **hub/router** to object pages, not a scroll-dump.
- **A4** Cross-object links are **bidirectional** (agreement↔subscription, invoice↔week↔orders, ledger↔week↔order) with back-reference sections on each object page.

**B — Data model & taxonomy**
- **B5** Activity timeline = a derived **union over a normalized event log** (`customerActivity`, polymorphic subject-refs); domain events (orders/invoices/ledger) project into the same shape.
- **B6** ONE shared activity taxonomy `src/lib/crmActivityTaxonomy.ts` (type→icon/color/direction, one icon per type + subtype overrides) reused across timeline/dashboard/kanban/invoice — same single-source discipline as `platformColors.ts`/`orderConstants.ts`.
- **B7** Separate **"what happened"** (activity feed) from **"what's next"** (due/tasks/reminders).
- **B8** Facets are **indexed fields** (server-side), never a client `.filter()` over an unbounded fetch.

**C — Density & money**
- **C9** Compact by default, progressive disclosure, **windowed loads** (e.g. 14d); never `.collect()` unbounded history per read/write.
- **C10** Money is first-class & traceable: signed delta + running balance + ledger link; **integer IDR**; read the **derived pool** (`deriveCreditPool`), never re-key a total.

**D — Access & states**
- **D11** **Strip, don't hide**: confidential fields (partner price, credit) omitted **server-side** per role — never client-hide (leaks over the wire), never a manager-only query on a staff-reachable surface (see Pitfall #19).
- **D12** Designed **empty / loading / error** states on every CRM surface.

---

## Documentation Index

| File | Purpose | When to Read |
|------|---------|--------------|
| `docs/FILE_MAP.md` | Per-feature file map + full permission table | Before any implementation |
| `docs/ARCHITECTURE.md` | Project structure, critical file paths | For overall layout |
| `docs/SCHEMA.md` | Database schema, data flows | Before DB changes |
| `docs/API_REFERENCE.md` | Convex queries/mutations + patterns | When modifying backend |
| `docs/CODE_STYLE.md` | TypeScript/Convex conventions | During implementation |
| `docs/WORKFLOW.md` | Git workflow, code review | Before any PR |
| `docs/CHANGELOG.md` | Version history | After merging (ALWAYS update) |
| `docs/TESTING_GUIDE.md` | Testing setup | When testing features |
| `docs/DEPLOYMENT.md` | Deployment guide | When deploying |
| `docs/ROADMAP.md` | Future plans | When planning features |
| `docs/ONBOARDING.md` | Developer onboarding | For new developers |
| `docs/SECURITY.md` | Auth, roles, permissions | For access-control changes |

---

## Environment Variables

| File | Purpose | Committed? |
|------|---------|-----------|
| `.env.local` | Local dev (`dev:exciting-fennec-671`) | No (gitignored) |
| `.env.local.production` | Production config reference | Yes |
| `.env` | Default deployment (production) | Yes |
| `.env.example` | Template for new setups | Yes |

---

<!-- GSD:profile-start -->
## Developer Profile

> Generated by GSD from session_analysis. Run `/gsd-profile-user --refresh` to update.

| Dimension | Rating | Confidence |
|-----------|--------|------------|
| Communication | terse-direct | HIGH |
| Decisions | fast-intuitive | HIGH |
| Explanations | code-only | HIGH |
| Debugging | fix-first | MEDIUM |
| UX Philosophy | pragmatic | MEDIUM |
| Vendor Choices | pragmatic-fast | LOW |
| Frustrations | instruction-adherence | MEDIUM |
| Learning | self-directed | MEDIUM |

**Directives:**
- **Communication:** Keep responses action-oriented and concise. Do not ask unnecessary clarifying questions -- interpret terse instructions and execute. When the developer says 'merge it' or 'fix it', proceed immediately without requesting confirmation or providing lengthy preambles.
- **Decisions:** Present recommendations directly rather than lengthy option comparisons. When multiple approaches exist, lead with the recommended one and briefly note alternatives. Do not delay execution waiting for the developer to deliberate -- they decide fast and expect momentum.
- **Explanations:** Provide working results with minimal explanation. Skip conceptual walkthroughs unless explicitly requested. When reporting completed work, give a brief summary of what was done and the outcome -- not a step-by-step narrative of the approach. Prioritize shipping over teaching.
- **Debugging:** When encountering bugs or errors, fix them immediately and report what was fixed. Do not present diagnostic options or ask what the developer wants to investigate -- go fix it. If the root cause is architecturally significant, mention it briefly after the fix is applied, not before.
- **UX Philosophy:** Ensure basic usability and clean layout without being asked. Make loading states visible, error messages clear, and workflows logical. Do not spend time on pixel-perfect polish or animation finesse unless explicitly requested -- focus on functional UX that does not confuse users.
- **Vendor Choices:** When a library or tool choice is needed, recommend the best option directly with a brief rationale. Try this approach -- ask if it matches their preference. Do not present exhaustive comparison tables unless the developer asks for one.
- **Frustrations:** Follow instructions precisely. When the developer says something is critical or must happen, treat it as non-negotiable. Do not omit steps, reorder priorities, or substitute approaches without explicit approval. If deviating from stated instructions for any reason, flag the deviation before proceeding.
- **Learning:** When the developer asks a question, give a direct, targeted answer. Do not expand into tutorial mode or provide background they did not ask for. When they reference past work or solutions, locate and surface the specific information rather than re-explaining from scratch.
<!-- GSD:profile-end -->

## Agent skills

### Issue tracker

GitHub Issues on `lucasyhzhu-debug/product_master` via the `gh` CLI. See `docs/agents/issue-tracker.md`.

### Triage labels

Default canonical vocabulary (`needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, `wontfix`). See `docs/agents/triage-labels.md`.

### Domain docs

Single-context layout — `CONTEXT.md` + `docs/adr/` at the repo root (lazily created by `/grill-with-docs`). See `docs/agents/domain.md`.

## graphify

This project has a graphify knowledge graph at graphify-out/.

Rules:
- Before answering architecture or codebase questions, read graphify-out/GRAPH_REPORT.md for god nodes and community structure
- If graphify-out/wiki/index.md exists, navigate it instead of reading raw files
- After modifying code files in this session, run `python3 -c "from graphify.watch import _rebuild_code; from pathlib import Path; _rebuild_code(Path('.'))"` to keep the graph current
