---
phase: 55
slug: help-center-infrastructure
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-16
---

# Phase 55 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest 4.x |
| **Config file** | `vitest.config.ts` |
| **Quick run command** | `npx vitest run src/lib/__tests__/helpGuides.test.ts` |
| **Full suite command** | `npm run test` |
| **Estimated runtime** | ~15 seconds |

---

## Sampling Rate

- **After every task commit:** Run `npx vitest run src/lib/__tests__/helpGuides.test.ts`
- **After every plan wave:** Run `npm run test`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 15 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 55-01-01 | 01 | 1 | HELP-04, HCMP-02, HCMP-03, HCMP-04, HCMP-05, HCMP-06 | type-check | `npx tsc --noEmit` | N/A | ⬜ pending |
| 55-01-02 | 01 | 1 | HELP-03 | unit | `npx vitest run src/lib/__tests__/helpGuides.test.ts` | ❌ W0 | ⬜ pending |
| 55-01-03 | 01 | 1 | HCMP-02, HCMP-03, HCMP-05 | type-check | `npx tsc --noEmit` | N/A | ⬜ pending |
| 55-02-01 | 02 | 2 | HCMP-01 | type-check + visual | `npx tsc --noEmit` | N/A | ⬜ pending |
| 55-02-02 | 02 | 2 | HCMP-07 | type-check + visual | `npx tsc --noEmit` | N/A | ⬜ pending |
| 55-03-01 | 03 | 3 | HELP-01, HELP-02, HELP-03, HELP-05, HELP-06, HELP-08 | build + visual | `npm run build` | N/A | ⬜ pending |
| 55-03-02 | 03 | 3 | HELP-07 | build + visual | `npm run build` | N/A | ⬜ pending |
| 55-03-03 | 03 | 3 | ALL | manual | Human checkpoint | N/A | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `src/lib/__tests__/helpGuides.test.ts` — unit tests for searchGuides() pure function (created in 55-01-02)

*Existing Vitest infrastructure covers all phase requirements. No new test framework setup needed.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Staggered fade-up animation | HELP-08 | Visual animation timing | Load `/help`, verify cards animate in sequence |
| Responsive grid (1/2/3 cols) | HELP-02 | Layout breakpoints | Resize browser to mobile/tablet/desktop widths |
| Coming Soon cards dimmed | HELP-05 | Visual opacity/interaction | Verify dimmed appearance and no click response |
| WorkflowDiagram SVG rendering | HCMP-01 | Visual SVG layout | Verify nodes, edges, colors, and entrance animation |
| GuideLayout TOC active tracking | HCMP-07 | Scroll behavior | Scroll through guide, verify TOC highlights active section |
| Dark mode appearance | ALL | Theme-dependent styling | Toggle dark mode, verify CSS variable tokens render correctly |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 15s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
