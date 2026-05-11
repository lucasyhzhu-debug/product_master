# Triple Review: Phase 81-03 — C1 Platform Resolver Consolidation

**Date:** 2026-05-11
**Plan:** `.planning/phases/81-domain-vocabulary-deepening/81-03-PLAN.md`
**Commit range:** `6bf17f6f` (RED) → `95eac532` (docs)
**Branch:** `feature/81-domain-vocabulary-deepening`
**Reviewer:** Senior Engineer (post-implementation, with full repo context)
**Pre-existing artifacts:** `docs/reviews/staffreview-81-03-platform-resolver-2026-05-10.md` (1 finding I1 cleanly resolved)

---

## 1. Summary

**Overall verdict: Approve with 2 Critical fixes + 4 Important fixes before merge to main.**

The executor delivered a structurally clean refactor — single canonical module, composable return shape, ESLint guard, table-driven tests, 21 callsites swapped, 3 deletions, all four quality gates green. The pre-execution staffreview's I1 (linkedMenuProductId dead path) was resolved correctly by removing the branch entirely (Option A), with un-skip checklist + TODO markers tied to the ADR-0001 schema-field landing event.

But the gates didn't catch what they couldn't see. Two **Critical** issues:

1. **`convex/_generated/api.d.ts` is stale at HEAD** — still imports the deleted `convex/reports/channelTaxonomy.js` (and never registered `convex/reports/platform.js`). It type-checks today only because `convex/tsconfig.json` excludes `_generated/`. CI will fail or auto-regenerate on next `npx convex deploy`. This is the same Phase 76 lesson (`lessons_phase_76_triple_review.md` — "hand-edited generated files silently rot").
2. **D-02 K3 Mart→K3Mart rename is incomplete** — the plan migrated only the C1 caller list. **5 user-visible surfaces remain on "K3 Mart"** (with space): `getSyncHealthAlert` (`convex/externalData/queries.ts:971`), `integrations/registry.ts:43` (admin UI integration name), `RestockPlanner.tsx:250`, `ChannelDetailPanel.tsx:52`, `ChannelCard.tsx:29`, `SettingsTab.tsx:478`. D-02's stated scope was "everywhere (analytics charts, P&L, CSV exports, badges, color maps)" — these surfaces are not in the C1 migration table but are user-visible per D-02's spirit.

Two **Important** issues:
3. The `resolvePlatform({ source: "internal", orderChannel: o.channel })` placeholder pattern (used 3× in `unitEconomics.ts`) ships a misleading `source` arg purely to satisfy the type. The pre-staffreview's R2 (make `source` optional) was filed as "recommended before implementation" and dropped silently.
4. The `orderChannel` overload returns `"Direct"` as a fallback for unknown order channels (`ORDER_CHANNEL_TO_PLATFORM[orderChannel] ?? "Direct"`), with `confidence: "exact"`. An unknown channel returning `"Direct"` + `"exact"` is a **bait** — it conflates "known to be Direct" with "couldn't resolve, defaulted". This contradicts D-04 ("every Source must resolve cleanly"). Should return `confidence: "inferred"`.

The plan-fidelity score is high (most must_haves green); the architectural fitness is high; but the "what the gates didn't catch" pile is non-trivial.

---

## 2. Plan Fidelity (must_haves checklist)

| Must-have | Status | Notes |
|---|---|---|
| Platform literal union exported with 8 literals (no Other) | GREEN | `convex/reports/platform.ts:15-24` matches D-04 + ordering convention |
| PLATFORMS const array mirrors union | GREEN | Same source |
| `isPlatform` runtime guard | GREEN | `platform.ts:29` — covered by table test |
| `resolvePlatform({source, underlyingSource?, orderChannel?}) → {platform, confidence}` | GREEN | Composable shape per PATTERNS.md recommendation |
| BigSeller fallback (underlyingSource → BigSeller transitional + inferred) | GREEN | `platform.ts:116-125` |
| `linkedMenuProductId` lookup deferred per staffreview I1 | GREEN | Removed cleanly; Test 10 skipped with `it.skip(...)` + un-skip checklist; TODO(ADR-0001) marker in JSDoc |
| `platformDisplay(p): string` identity-on-literal | GREEN | `platform.ts:41` — forward-compat chokepoint preserved |
| All 12 C1 callsites migrated | GREEN | Verified by `grep -rc "sourceToPlatform" convex/ src/` returns 0 |
| 3 deletions (sourceToPlatform fn, channelTaxonomy.ts file, sourceToPlatform.test.ts file) | GREEN | All confirmed absent in `95eac532` tree |
| D-02 rename: `tiktok→TikTok`, color shift red→violet | GREEN | `platformColors.ts` Tokopedia entry deleted, TikTok violet survives |
| D-02 rename: `K3 Mart→K3Mart` | **YELLOW** | Resolver returns "K3Mart" cleanly, but **5 hardcoded "K3 Mart" surfaces remain** (see Critical 2) |
| ESLint rule extends Plan 02 with 5 new banned exports | GREEN | `eslint.config.js:55-92` — paths + patterns blocks present |
| Table-driven test covers every (source, underlyingSource?, orderChannel?) tuple per D-11 | GREEN | 5 describe blocks, 4 it.each tables, Test 10 correctly skipped |
| Triple-review on this plan only per D-09 | IN PROGRESS | This document |
| `npm run type-check`, `lint`, `test`, `build` all pass | GREEN | Per SUMMARY: 1825 pass, 524 lint baseline preserved, 4210-module build in 26s |

**Plan-fidelity score: 13 GREEN / 1 YELLOW / 0 RED.** The single YELLOW is the K3 Mart rename incompleteness — see Critical 2.

---

## 3. Critical Issues (must fix before merge)

### Critical 1 — `convex/_generated/api.d.ts` references deleted file

**Evidence:** at HEAD `95eac532`:
```
convex/_generated/api.d.ts:236: import type * as reports_channelTaxonomy from "../reports/channelTaxonomy.js";
convex/_generated/api.d.ts:492: "reports/channelTaxonomy": typeof reports_channelTaxonomy;
```
The file `convex/reports/channelTaxonomy.ts` is deleted in commit `b010a81c`. The generated `api.d.ts` is **not** regenerated — it still has 2 stale references.

**Why type-check passes:** `convex/tsconfig.json` has `"exclude": ["./_generated"]` — `api.d.ts` is excluded from type-check. The vite build excludes it too because nothing imports `api.reports.channelTaxonomy.*` anywhere in app code (verified: `grep -rn "api\.reports\.channelTaxonomy" src/ convex/` returns 0).

**Why this is critical:**
- On the next `npx convex dev` or `npx convex deploy` run (CI), `api.d.ts` will regenerate cleanly — but until that runs, the file shipped to the main branch is **internally inconsistent**. Anyone running `tsc --noEmit` directly on the convex tree without the exclude (e.g., a future tooling change, or an IDE that ignores tsconfig excludes) will see broken imports.
- This is the **exact pattern** of `lessons_phase_76_triple_review.md` lesson 5: "hand-edited generated files silently rot." The lesson was tagged "won't repeat" — it just did.
- Vercel CI runs `npm run build` which uses `tsc -b` against tsconfig.app.json (which includes `src/` only) + vite. Both skip `api.d.ts` self-imports. So this will land on main without breaking CI — until someone runs `npx convex dev` locally and it re-emits. Then a diff appears with no obvious cause. **This is exactly the silent drift the phase was designed to prevent.**

**Fix:** Run `npx convex dev` once locally, commit the regenerated `api.d.ts`, push as a docs/follow-up commit. The regenerate will (a) drop the `reports_channelTaxonomy` references, (b) add `reports_platform` if applicable, (c) be reproducible.

**Severity reasoning:** CRITICAL not because it breaks the build today, but because the SUMMARY claims all four gates passed and yet a generated artifact ships in a knowingly-stale state. This is a process failure: the executor knew they deleted the file and never re-ran codegen, exposing the next agent / next maintainer to a confusing diff.

---

### Critical 2 — D-02 K3 Mart→K3Mart rename is incomplete (5 surfaces missed)

**Evidence — live in HEAD:**
```
convex/externalData/queries.ts:971: for (const [source, name] of [["k3mart", "K3 Mart"], ["gobiz", "GoFood"]] as const) {
convex/integrations/registry.ts:43: name: "K3 Mart",
src/components/restock/ChannelDetailPanel.tsx:52: k3mart: "K3 Mart",
src/components/restock/ChannelCard.tsx:29: k3mart: "K3 Mart",
src/pages/RestockPlanner.tsx:250: title="K3 Mart"
src/components/salesAnalytics/SettingsTab.tsx:478: ? "K3 Mart"
tests/e2e/sales-analytics-settings.spec.ts:53: const platforms = ["K3 Mart", ...]
tests/e2e/sales-analytics-settings.spec.ts:266: const outletK3 = page.locator('table td >> text="K3 Mart"');
```

**User-visible surfaces:**
- `getSyncHealthAlert` returns `platformName: "K3 Mart"` — consumed by `IntegrationHealthCard.tsx:156` (`{health.platformName}`) — **renders in the Sales Analytics settings page sync-status card.**
- `integrations/registry.ts:43` is the integration registry — `name: "K3 Mart"` shows in `ConnectionGuide.tsx`, `IntegrationHealthCard`, `PlatformHierarchy`.
- `RestockPlanner.tsx:250` is the title of the Restock channel section.
- `ChannelDetailPanel.tsx:52` and `ChannelCard.tsx:29` use `"K3 Mart"` as the display label in restock UI.

**D-02 scope (CONTEXT.md line 32):**
> Full canonical rename ships in this phase. `"Tokopedia"` → `"TikTok"` everywhere (analytics charts, P&L, CSV exports, badges, color maps). `"K3 Mart"` → `"K3Mart"` (no space). Matches CONTEXT.md line 102 canonical names.

**The plan and PATTERNS.md narrowed D-02's "everywhere" to the 12 C1 callsites.** PATTERNS.md finding #4 says: "K3 Mart→K3Mart: No diff needed — line 32 already uses 'K3Mart'... The space exists ONLY in `sourceToPlatform("k3mart") → "K3 Mart"` (the doomed mapper)." This is verifiably wrong: `grep -rn '"K3 Mart"'` returns 8+ hits across non-platform-resolver surfaces.

**Why missed:** the plan's discovery method (PATTERNS.md C1 Caller Migration Table) only lists files that import `sourceToPlatform`/`toDisplayChannel`/`sourceToDisplayChannel`. Surfaces that hardcode the literal `"K3 Mart"` (without going through the resolver) were invisible to the PATTERNS pass. D-02 needed a separate `grep -rn '"K3 Mart"'` sweep.

**Fix:** in a follow-up commit (still on this branch before merge):
1. Sweep `grep -rn '"K3 Mart"'` across `src/` and `convex/` (excluding test snapshots that document historical behavior)
2. Replace each user-visible literal with `"K3Mart"`
3. Update e2e tests to match new spelling
4. Note in CHANGELOG that this is a user-visible label change in restock + integration health surfaces (not just analytics)

**Severity reasoning:** CRITICAL because the SUMMARY claims D-02 ships in this plan ("'K3 Mart' → 'K3Mart' (no space)"), yet the user-facing rename ships only on the analytics surface. A user looking at the restock planner and the analytics dashboard will see two different spellings of the same brand on the same screen. The plan over-promised what it delivered.

---

## 4. Important Issues (should fix before merge)

### Important 1 — `orderChannel` fallback returns `"exact"` confidence for unknown channels

**Evidence:** `convex/reports/platform.ts:110-113`:
```typescript
if (row.orderChannel) {
  const platform = ORDER_CHANNEL_TO_PLATFORM[row.orderChannel] ?? "Direct";
  return { platform, confidence: "exact" };
}
```

**Problem:** if a future `orders.channel` value is added (e.g., `"shopee_chat"`), it falls through to `"Direct"` with `confidence: "exact"`. An audit will show a Direct row with exact confidence, indistinguishable from a real Direct order.

This contradicts the plan's own design rationale — D-04 says "every Source must resolve cleanly" and the BigSeller branch correctly downgrades to `inferred` when it can't resolve. The orderChannel fallback should follow the same rule.

**Fix:** make the fallback path explicit:
```typescript
if (row.orderChannel) {
  const platform = ORDER_CHANNEL_TO_PLATFORM[row.orderChannel];
  if (platform === undefined) {
    // Unknown order channel — defensive default + inferred
    return { platform: "Direct", confidence: "inferred" };
  }
  return { platform, confidence: "exact" };
}
```

This costs ~3 lines and gives Phase 77's Data Health Dashboard a hook: rows with confidence `"inferred"` from the orderChannel branch identify drift between the schema's channel literal union and the resolver's keyspace.

**Phase 77 readiness consequence:** without this fix, Phase 77 cannot mechanically distinguish "intentionally Direct" from "couldn't resolve, defaulted to Direct." With this fix, `confidence === "inferred"` becomes a single grep target.

---

### Important 2 — `source` is required even when ignored (placeholder anti-pattern)

**Evidence:** `convex/reports/unitEconomics.ts:378, 394, 442`:
```typescript
resolvePlatform({ source: "internal", orderChannel: o.channel }).platform
```
The `source: "internal"` is a meaningless placeholder; the function ignores it because `orderChannel` is set.

The pre-staffreview filed this as Refinement 2: "make `source` optional on `ResolvePlatformRow`; orderChannel-only calls become cleaner." The recommendation was tagged "Recommended before implementation" and never executed. The SUMMARY does not mention why it was dropped.

**Why this matters:**
- Misleading at callsites — a future maintainer reading line 442 will think the `source: "internal"` is doing work and may attempt to "preserve" it during a refactor.
- Brittle — if anyone adds logic that consults `row.source` even when `orderChannel` is present, every callsite will silently start computing a different result.
- The 21-line orderChannel block (lines 374-400 in unitEconomics.ts) is now noisier than the pre-migration `toDisplayChannel(o.channel)` it replaced — net legibility regression.

**Fix:** make `source` optional:
```typescript
export type ResolvePlatformRow =
  | { source: ExternalSource; underlyingSource?: ExternalSource; orderChannel?: undefined }
  | { source?: ExternalSource; underlyingSource?: undefined; orderChannel: string };
```
or simpler, keep both optional but assert at runtime that at least one is present. Then the unitEconomics callsites become:
```typescript
resolvePlatform({ orderChannel: o.channel }).platform
```

**Severity reasoning:** IMPORTANT not CRITICAL because it doesn't break behavior, but it bakes a code-smell into 3+ callsites and ignored a pre-staffreview Refinement without recording why.

---

### Important 3 — D-02 rename impact on saved analytics URLs (Phase-76 collision risk)

**Evidence:** `src/contexts/AnalyticsFilterContext.tsx:31`:
```typescript
const channels = (params.get("channels") ?? "")
  .split(",")
  .filter(Boolean) as Platform[];
```

URL params persist user selections — a manager who bookmarked an analytics view filtered to `?channels=Tokopedia` (or even `?channels=GoFood` but expecting grabfood-collapsed data) will now have:
- `Tokopedia` filter — silently filters to nothing (Tokopedia not in PLATFORMS), shows empty chart
- `GoFood` filter — now shows only gobiz data (no longer includes grabfood per D-05)

The plan acknowledges D-05 as a behavior change in unitEconomics test (deviation #3), but doesn't address user-side persistence (URL params, localStorage, saved bookmarks).

**Fix options:**
1. **Migration-on-load** — add a one-shot URL param normalizer in `AnalyticsFilterContext.tsx`: `Tokopedia → TikTok`, leave GoFood-vs-GrabFood as-is (user must reselect, which is the right user-feedback behavior).
2. **Documented breaking change** — add to CHANGELOG under "Breaking changes" that saved URLs with `Tokopedia` filter no longer match anything; users must re-filter.
3. **Defer** — accept the silent breakage; small user base; ship a CHANGELOG note.

**Phase 76 collision analysis:** Phase 76's CSV export emits `displayName` from `incomeStatement.ts` (e.g., `[..., "GoFood", ...]`). A user who exported CSV last week with grabfood data labeled "GoFood" and exports the same period this week will get two different CSV outputs for "GoFood" (last week included grabfood, this week doesn't). For accountants reconciling period-over-period, this is a silent data shift. **CHANGELOG must call this out under "Breaking changes" with example.**

---

### Important 4 — `buildChartColorMap` parameter signature regression

**Evidence:** `src/lib/platformColors.ts:61`:
```typescript
export function buildChartColorMap(sourceToPlatform: (source: string) => string): Record<string, string> {
```
The parameter is still named `sourceToPlatform` — same name as the deleted function. This is a code-style regression: the function-typed parameter now collides with a banned import name (ESLint rule will fire if anyone tries to import `sourceToPlatform`, but the parameter looks legitimate at the callsite).

The summary notes: "buildChartColorMap parameter signature kept generic ((source: string) => string) — callers pass `(s) => platformDisplay(resolvePlatform({ source: s as ExternalSource }).platform)`." The signature is fine; the parameter NAME is the problem.

**Fix:** rename the parameter to `sourceToDisplayName` or `resolveDisplay`. ~10 char change in 1 file. Removes the visual confusion.

---

## 5. Refinements (minor, optional)

### R1 — Test 10 skipped with `it.skip(...)` rather than `describe.skip` or no test

The Test 10 block (`convex/reports/__tests__/platform.test.ts:51-60`) is a stub `it.skip(...)` with descriptive message. This is fine, but consider promoting the skip-message body into a `// TODO(ADR-0001):` block above the `it.skip` so `grep -rn "TODO(ADR-0001)"` catches all 3 sites (resolver JSDoc, resolver inline note, test file) rather than 2. SUMMARY claims 2 markers; should be 3.

### R2 — `dispatchPlanner/mutations.ts:26` already uses canonical `"K3Mart"`

Cross-reference for Critical 2 fix scope: `convex/dispatchPlanner/mutations.ts:26` already seeds `displayName: "K3Mart"` (no space). When sweeping K3 Mart→K3Mart, you'll find this site already correct — leave it. Use as a positive control.

### R3 — `platformDisplay` is identity, but every callsite still calls it

Pre-staffreview R1 noted this: `platformDisplay(resolvePlatform(...).platform)` is functionally `resolvePlatform(...).platform` since `platformDisplay` is `(p) => p`. The plan kept `platformDisplay` calls everywhere for "forward-compat chokepoint." This is a defensible call but the executor missed the opportunity to introduce a thin sugar (`displayPlatform` was added in `ProductInventorySettings.tsx:106` but only locally) that could live in `platform.ts` itself.

Future polish: export `displayPlatform(source: ExternalSource): string = platformDisplay(resolvePlatform({source}).platform)` from `platform.ts`. Saves 5 chars at every callsite, locks the chain mechanically.

---

## 6. Architectural Fitness Assessment

### Module location: `convex/reports/platform.ts` ✓

Right call. `reports/` already imports freely from `lib/`; the largest consumer (`unitEconomics.ts`) is in `reports/`. Co-locating `platform.ts` next to its consumers preserves locality. `lib/` would have been wrong — the module returns `Platform` literals which are downstream-typed (CSV column names, React component props), and `lib/` is meant for upstream domain primitives (sources, confidence, period range).

### API shape: `resolvePlatform({source, underlyingSource?, orderChannel?}): {platform, confidence}` — mostly right

**Good:**
- Composable return shape preserves Confidence-downgrade-on-fallback per D-03 without forcing `worstConfidence` into the resolver itself
- `ResolvePlatformRow` type is exported, so consumers can pass the row shape directly: `resolvePlatform(externalRevenueDoc)` works (when `underlyingSource` schema field lands)

**Concerns:**
- The `orderChannel` overload + always-required `source` produces the placeholder anti-pattern flagged in Important 2.
- Boilerplate at every callsite: `platformDisplay(resolvePlatform({ source: row.source }).platform)` — 60 chars to replace `sourceToPlatform(row.source)` (24 chars). Net legibility cost. The local sugar `displayPlatform()` in `ProductInventorySettings.tsx` is the right pattern; should be promoted to `platform.ts` (see R3).

### Phase-77 readiness: partial

Phase 77 (Data Health Dashboard) needs: "list externalRevenue rows where `resolvePlatform(row).confidence === 'inferred'`."
- `confidence === "inferred"` correctly fires on the BigSeller fallback path ✓
- `confidence === "inferred"` does NOT fire on the orderChannel-unknown fallback (Important 1) — Phase 77 will need to compute this gap separately. **Fix Important 1 to make Phase 77 a one-grep call.**
- The deferred `linkedMenuProductId` lookup means Phase 77 won't be able to attribute BigSeller rows to specific menu products until ADR-0001 schema fields land — acceptable per the deferral, but Phase 77's spec needs to explicitly note this constraint.

### Forward-compat for ADR-0001 schema field landing

The deferral of the `linkedMenuProductId` branch is clean:
- TODO markers in JSDoc + inline + test
- Un-skip checklist in SUMMARY (5 steps, well-scoped)
- Sync-only signature today; no async leakage to migrate when the lookup lands
- BUT: when the schema field lands, `resolvePlatform` will need to become `Promise<{platform, confidence}>` because the lookup needs `ctx.db.get`. **All 21 callsites will need to migrate to `await`.** The SUMMARY's un-skip checklist names this (step 4) but doesn't estimate the cascade size. Reasonable for now; just note that the "purely additive" framing for the schema-field landing is wrong — it's an additive feature with a non-trivial caller migration.

---

## 7. Plan-vs-Implementation Deviation Audit

The SUMMARY reports 3 auto-fixed deviations:

| # | Deviation | Severity assessed | My assessment | Should have escalated? |
|---|---|---|---|---|
| 1 | Stale doc comments in `unitEconomics.ts` lines 33, 72 | Cosmetic | Cosmetic — agree | No |
| 2 | Missing GrabFood + BigSeller palette entries | "Missing critical" | **CORRECT** — without these, charts render gray FALLBACK for both. Auto-fix was the right call. | No |
| 3 | Integration test `tests/convex/unitEconomics.test.ts:824` conflated grabfood→GoFood | "Bug surfaced" | **CORRECT** — D-05 surfaced a pre-existing test bug. The fix is good and the inline comment is well-written. | No |

Deviation classification looks right. None should have been escalated to a checkpoint — they were all in-scope mechanical fixes to honor the plan's intent.

**Missing deviation report:**
- The pre-staffreview R2 (make `source` optional) was silently dropped without being recorded as a deviation. **Should have been recorded** as "deviation #4 — Refinement R2 dropped, kept required `source` to minimize signature churn during the migration; revisit post-merge." The SUMMARY's `key-decisions` list doesn't mention it either.
- The `_generated/api.d.ts` regeneration step was never recorded as a task in the plan and never recorded as a deviation/skipped-step in the SUMMARY. The plan should have had a Wave 3 step "regenerate convex api.d.ts after deletions."

---

## 8. Risk Register (post-merge smoke tests)

What hasn't been verified that I'd want a smoke-test for:

1. **BigSeller fallback path in production** — the Test 10 (`linkedMenuProductId` lookup) is `it.skip`. Has a real BigSeller row been resolved through the resolver in dev? If yes, what `displayName` did it produce? Risk: a real BigSeller row hits the inferred path, gets `displayName: "BigSeller"`, gets emitted to a CSV export — accountant queries "what's BigSeller revenue" and the answer is "all of it, because we couldn't disaggregate."
2. **`Tokopedia` URL params** — saved bookmarks with `?channels=Tokopedia` silently filter to nothing post-deploy. (Important 3.)
3. **GoFood column shift in saved CSV exports** — period-over-period CSVs labeled "GoFood" now exclude grabfood rows. (Important 3.)
4. **Sales Analytics settings page** — the IntegrationHealthCard renders `platformName` from `getSyncHealthAlert`. After this merge, "K3 Mart" will show on the settings page but "K3Mart" on every analytics chart. Visual inconsistency. (Critical 2.)
5. **Restock planner** — `RestockPlanner.tsx:250` shows "K3 Mart" as a section title. Same issue. (Critical 2.)
6. **Convex API regeneration** — first `npx convex dev` run after merge will produce a non-empty diff (drops `reports_channelTaxonomy`). Anyone who pulls main and runs `convex dev` will see a "what just changed?" diff. (Critical 1.)

Recommend a manual UAT pass through:
- Sales Analytics → Settings tab → confirm IntegrationHealthCard label
- Restock planner → confirm K3Mart section title
- Save and reload an analytics URL with `?channels=Tokopedia` → confirm graceful handling
- Trigger a CSV export with grabfood data in the period → confirm channel column reads "GrabFood" not "GoFood"

---

## 9. Lessons Worth Recording (for MEMORY.md)

### Lesson 1 — Type-cascade refactors need a rename-grep sweep, not just an import-grep sweep

The plan's PATTERNS.md C1 Caller Migration Table enumerated all `import { sourceToPlatform }` callsites. It missed all `"K3 Mart"` (literal-string) callsites. **Rule:** when a refactor includes a user-visible string rename (D-02 in this plan), pair the import-grep with a literal-string-grep BEFORE finalizing the migration table. Both `grep -rn "sourceToPlatform"` and `grep -rn '"K3 Mart"'` should appear in the discovery phase. PATTERNS.md is excellent at the import surface; it doesn't see hardcoded literals.

### Lesson 2 — Generated artifacts (`_generated/api.d.ts`) need explicit regeneration as a task in delete-a-file plans

When deleting a file in `convex/`, even a pure-helper file with no `query/mutation/action` exports, the `_generated/api.d.ts` MUST be regenerated as a final task. The Phase 76 lesson exists; this plan didn't add the task. **Rule for next plan:** if the plan deletes any file under `convex/**/*.ts`, add an explicit Wave-N task: "Run `npx convex dev` once + `git add convex/_generated/api.d.ts`" with acceptance criterion `grep -c '<deleted-file-stem>' convex/_generated/api.d.ts returns 0`.

### Lesson 3 — Pre-staffreview Refinements need a "drop here" deviation log

This plan dropped the pre-staffreview's R2 (make `source` optional) silently. The reviewer flagged it as "Recommended before implementation"; the executor judged it not worth the signature churn during the migration. **Rule:** dropped pre-staffreview Refinements/Improvements should appear in the SUMMARY under a new `## Pre-Review Items Dropped` section with one-line rationale. Today's SUMMARY records 3 deviations but treats dropped review items as a separate (invisible) class.

### Lesson 4 — `confidence: "exact"` should be earned, not defaulted

`resolvePlatform({orderChannel: "shopee_chat_typo"}) → {platform: "Direct", confidence: "exact"}` is a confidence inflation bug. **Rule:** any resolver returning a Confidence value should default the unknown-input branch to `"inferred"` (or stricter), never `"exact"`. Phase 77's data-health surface needs this guarantee.

### Lesson 5 — Composable return shapes are good; mandatory required-but-ignored params are not

The `{platform, confidence}` return shape is the right call (avoids double-downgrading per D-03). But forcing `source: "internal"` as a placeholder in 3+ callsites just to satisfy the type signature undermines the composability claim. **Rule:** when an API has multiple "modes" (source-only vs orderChannel-only vs source+underlying), express the modes in the type system (discriminated union) rather than making one mode satisfy another's required field with a sentinel value.

---

## 10. Approval Conditions

**Approve for merge to main AFTER:**

1. **Critical 1** — regenerate `convex/_generated/api.d.ts` (run `npx convex dev` once, commit the result on this branch)
2. **Critical 2** — sweep `grep -rn '"K3 Mart"'` and replace user-visible literals with `"K3Mart"`; update e2e test fixtures to match
3. **Important 1** — orderChannel-unknown fallback returns `confidence: "inferred"` (3-line fix in `platform.ts`)
4. **Important 3** — CHANGELOG entry under "Breaking changes" calls out: (a) saved URLs with `?channels=Tokopedia` no longer filter; (b) period-over-period CSVs labeled "GoFood" now exclude grabfood

**Recommended before merge (not blocking):**
5. Important 2 — make `source` optional, refactor unitEconomics callsites
6. Important 4 — rename `buildChartColorMap` parameter
7. R3 — promote `displayPlatform` sugar to `platform.ts`

**Triple-review re-verify after Critical fixes:**
- `grep -c "channelTaxonomy" convex/_generated/api.d.ts` returns 0
- `grep -rn '"K3 Mart"' src/ convex/ --include="*.ts" --include="*.tsx"` returns 0 (or only in test snapshots that document historical behavior)
- `npm run type-check && npm run lint && npm run test && npm run build` all green

---

*Generated by senior-engineer triple-review*
*Verifications performed against `feature/81-domain-vocabulary-deepening` HEAD `95eac532`*
