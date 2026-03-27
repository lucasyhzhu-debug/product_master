---
phase: 56
slug: expense-training-guide
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-16
---

# Phase 56 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest 4.x |
| **Config file** | `vitest.config.ts` |
| **Quick run command** | `npx vitest run src/lib/__tests__/helpGuides.test.ts` |
| **Full suite command** | `npm run build` |
| **Estimated runtime** | ~30 seconds (build) |

---

## Sampling Rate

- **After every task commit:** Run `npx vitest run src/lib/__tests__/helpGuides.test.ts`
- **After every plan wave:** Run `npm run build`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 30 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 56-01-01 | 01 | 1 | EGUIDE-01 | build | `npm run build` | ✅ | ⬜ pending |
| 56-01-02 | 01 | 1 | EGUIDE-02 | build+manual | `npm run build` | ✅ | ⬜ pending |
| 56-01-03 | 01 | 1 | EGUIDE-03 | build+manual | `npm run build` | ✅ | ⬜ pending |
| 56-01-04 | 01 | 1 | EGUIDE-04 | build+manual | `npm run build` | ✅ | ⬜ pending |
| 56-01-05 | 01 | 1 | EGUIDE-05 | build+manual | `npm run build` | ✅ | ⬜ pending |
| 56-01-06 | 01 | 1 | EGUIDE-06 | build+manual | `npm run build` | ✅ | ⬜ pending |
| 56-01-07 | 01 | 1 | EGUIDE-07 | build+manual | `npm run build` | ✅ | ⬜ pending |
| 56-01-08 | 01 | 1 | EGUIDE-08 | build+manual | `npm run build` | ✅ | ⬜ pending |
| 56-01-09 | 01 | 1 | EGUIDE-09 | build+manual | `npm run build` | ✅ | ⬜ pending |
| 56-02-01 | 02 | 1 | EGUIDE-01 | unit | `npx vitest run src/lib/__tests__/helpGuides.test.ts` | ✅ | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

*Existing infrastructure covers all phase requirements.* Vitest is installed, build pipeline works, help component tests exist from Phase 55.

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Lifecycle flowchart renders with correct colors | EGUIDE-02 | SVG visual verification | Navigate to `/help/expenses`, verify Overview section shows flowchart with gray/blue/green/amber/red nodes |
| TOC sidebar tracks active section on scroll | EGUIDE-01 | Scroll behavior | Scroll through guide, verify sidebar highlights change |
| Deep linking works | EGUIDE-01 | Browser navigation | Navigate to `/help/expenses#submitting`, verify page scrolls to Submitting section |
| Step cards show numbered steps with dotted line | EGUIDE-03 | Visual rendering | Check each section has numbered step cards connected by vertical dotted line |
| FAQ accordion expand/collapse | EGUIDE-09 | Interactive behavior | Click FAQ questions, verify they expand/collapse |
| Mobile responsive layout | EGUIDE-01 | Device testing | Resize browser to mobile width, verify single column layout and horizontal TOC |

*If none: "All phase behaviors have automated verification."*

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 30s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
