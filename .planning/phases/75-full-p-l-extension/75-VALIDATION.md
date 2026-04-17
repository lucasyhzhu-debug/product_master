---
phase: 75
slug: full-p-l-extension
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-04-17
---

# Phase 75 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest 4.0.18 + convex-test 0.0.41 |
| **Config file** | `vitest.config.ts` (project default; test files discovered by `**/*.test.ts`) |
| **Quick run command** | `npm run test -- --run convex/reports/__tests__/incomeStatement-capex.test.ts` |
| **Full suite command** | `npm run test` |
| **Estimated runtime** | ~40s full suite; ~3s targeted |

Build gate: `npm run build` (tsc -b && vite build) — MANDATORY before merge per CLAUDE.md.

---

## Sampling Rate

- **After every task commit:** Run targeted suite for touched area — `npm run test -- --run convex/reports/__tests__/ src/components/financials/ src/lib/__tests__/csvExport.test.ts`
- **After every plan wave:** Run full suite — `npm run test`
- **Before `/gsd-verify-work`:** Full suite must be green AND `npm run build` must succeed
- **Max feedback latency:** 10s for targeted, 40s for full suite

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 75-00-01 | 00 | 0 | FIN-01 | — | N/A (test fixture) | fixture | N/A (creates test file) | ❌ W0 | ⬜ pending |
| 75-00-02 | 00 | 0 | FIN-02 | — | N/A (test fixture) | fixture | N/A (creates test file) | ❌ W0 | ⬜ pending |
| 75-00-03 | 00 | 0 | D-15 | — | N/A (test fixture) | fixture | N/A (creates test file) | ❌ W0 | ⬜ pending |
| 75-00-04 | 00 | 0 | D-16 | — | N/A (test fixture) | fixture | N/A (creates test file) | ❌ W0 | ⬜ pending |
| 75-01-01 | 01 | 1 | FIN-01 | — | CapEx query excludes disposal proceeds (D-03) | unit | `npm run test -- --run convex/reports/__tests__/incomeStatement-capex.test.ts -t "CapEx sums"` | ❌ W0 | ⬜ pending |
| 75-01-02 | 01 | 1 | FIN-01 | — | Converted-expense CapEx uses original date (D-06) | unit | `npm run test -- ... -t "converted expense uses expenseDate"` | ❌ W0 | ⬜ pending |
| 75-01-03 | 01 | 1 | FIN-01 | — | Reclassified asset still counted (D-04) | unit | `npm run test -- ... -t "reclassified asset included"` | ❌ W0 | ⬜ pending |
| 75-01-04 | 01 | 1 | FIN-01 | — | FCF formula correctness (D-13) | unit (pure) | `npm run test -- ... -t "FCF formula"` | ❌ W0 | ⬜ pending |
| 75-01-05 | 01 | 1 | D-15 | — | Gap flags converted-expense JE when `isReversed !== true` | unit | `npm run test -- --run convex/reports/__tests__/incomeStatement-gap-missingReversals.test.ts` | ❌ W0 | ⬜ pending |
| 75-02-01 | 02 | 2 | FIN-01 | — | Page renders D/A row once between EBITDA and EBIT | component/manual | manual smoke on `/financials` | MANUAL OK | ⬜ pending |
| 75-02-02 | 02 | 2 | FIN-01 | — | Zero-CapEx period renders row with 0 + helper text (D-14) | component/manual | manual smoke | MANUAL OK | ⬜ pending |
| 75-02-03 | 02 | 2 | FIN-02 | — | Channel row label = "Contribution Margin" | component | `npm run test -- --run src/components/financials/ChannelRow.test.tsx` | ❌ W0 | ⬜ pending |
| 75-02-04 | 02 | 2 | FIN-02 | — | Channel row stops at Contribution Margin (no OpEx/D/A/CapEx/FCF) | component | same file | ❌ W0 | ⬜ pending |
| 75-03-01 | 03 | 2 | D-16 | — | CSV row order: OpEx-excl-DA, EBITDA, D/A, EBIT, NI, CapEx, FCF | unit | `npm run test -- --run src/lib/__tests__/csvExport.test.ts` | ❌ W0 | ⬜ pending |
| 75-03-02 | 03 | 2 | D-16 | — | Per-channel columns blank below Contribution Margin in CSV | unit | same file | ❌ W0 | ⬜ pending |
| 75-04-01 | 04 | 3 | FIN-01, FIN-02 | — | Build passes with new rows + query fields | integration | `npm run build` | — | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

Plan numbers (00/01/02/03/04) are indicative — the final planner may merge/split but must preserve every row above.

---

## Wave 0 Requirements

Wave 0 MUST precede implementation (backend/frontend tasks in Wave 1+) so every requirement has a failing test to flip green:

- [ ] `convex/reports/__tests__/incomeStatement-capex.test.ts` — covers FIN-01 CapEx aggregation + FCF formula (~6 tests)
- [ ] `convex/reports/__tests__/incomeStatement-gap-missingReversals.test.ts` — covers D-15 gap check (~2 tests)
- [ ] `src/lib/__tests__/csvExport.test.ts` — NEW FILE (none exists today) covering D-16 row order + channel-column scope (~4 tests)
- [ ] `src/components/financials/ChannelRow.test.tsx` — NEW FILE covering FIN-02 label rename + scope limit (~2 tests)
- [ ] Framework install: none needed — Vitest 4.0.18 + convex-test 0.0.41 + @testing-library are already in `devDependencies`.

Total new Wave 0 files: **4**, total new tests: **~14**.

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| D/A row renders once between EBITDA and EBIT with tooltip showing dep+amort split | FIN-01 / D-08, D-09 | Visual layout + tooltip interaction | On `/financials`, choose a period with depreciation posts; confirm D/A row renders exactly once; hover tooltip shows separate dep + amort amounts |
| Zero-CapEx period renders CapEx row with 0 + muted helper note | FIN-01 / D-14 | Visual/styling | Switch period to a week with no asset acquisitions; confirm CapEx row present, value 0, helper text "No asset acquisitions this period" |
| Section collapse/expand works for new FCF grouping | FIN-01 / UI | UX state machine | Collapse FCF section; reload page; confirm state persists per existing pattern |
| "Contribution Margin" label replaces prior label in per-channel UI | FIN-02 / D-10 | Label/copy change | On `/financials`, visually confirm channel rows label row as "Contribution Margin" |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all ❌ W0 references (4 new test files)
- [ ] No watch-mode flags in CI commands
- [ ] Feedback latency < 40s (full suite)
- [ ] `nyquist_compliant: true` set in frontmatter after Wave 0 verified green

**Approval:** pending
