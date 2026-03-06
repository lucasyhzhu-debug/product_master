---
phase: 38
slug: frontend-giant-file-splits
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-06
---

# Phase 38 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest ^4.0.18 |
| **Config file** | vitest.config.ts |
| **Quick run command** | `npm run type-check` |
| **Full suite command** | `npm run build` |
| **Estimated runtime** | ~30 seconds |

---

## Sampling Rate

- **After every task commit:** Run `npm run type-check`
- **After every plan wave:** Run `npm run build`
- **Before `/gsd:verify-work`:** Full build must be green + LOC verification
- **Max feedback latency:** 30 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 38-01-01 | 01 | 1 | FFS-01 | manual-only | `wc -l src/components/salesAnalytics/OverviewTab.tsx` | N/A | pending |
| 38-02-01 | 02 | 1 | FFS-02 | manual-only | `wc -l src/pages/GrabFoodManager.tsx` | N/A | pending |
| 38-03-01 | 03 | 1 | FFS-03 | manual-only | `wc -l src/components/inventory/FinishedGoodsTab.tsx` | N/A | pending |
| 38-04-01 | 04 | 1 | FFS-04 | manual-only | `wc -l src/pages/VouchersManager.tsx` | N/A | pending |
| 38-ALL | ALL | ALL | ALL | integration | `npm run build` | N/A | pending |

*Status: pending / green / red / flaky*

---

## Wave 0 Requirements

- [ ] `src/lib/dateUtils.ts` — shared WIB timezone helpers (must be created before extraction begins)
- [ ] `src/components/vouchers/` directory — must be created
- [ ] `src/components/vouchers/index.ts` — barrel file

*Existing infrastructure covers test framework requirements.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| OverviewTab under 400 LOC | FFS-01 | LOC is a build metric, not a testable behavior | `wc -l src/components/salesAnalytics/OverviewTab.tsx` — must show < 400 |
| GrabFoodManager under 600 LOC | FFS-02 | LOC is a build metric, not a testable behavior | `wc -l src/pages/GrabFoodManager.tsx` — must show < 600 |
| FinishedGoodsTab under 600 LOC | FFS-03 | LOC is a build metric, not a testable behavior | `wc -l src/components/inventory/FinishedGoodsTab.tsx` — must show < 600 |
| VouchersManager under 600 LOC | FFS-04 | LOC is a build metric, not a testable behavior | `wc -l src/pages/VouchersManager.tsx` — must show < 600 |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 30s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
