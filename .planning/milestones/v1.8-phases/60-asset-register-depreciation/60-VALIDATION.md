---
phase: 60
slug: asset-register-depreciation
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-18
---

# Phase 60 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest + convex-test |
| **Config file** | `vitest.config.ts` |
| **Quick run command** | `npm run test -- --reporter=verbose` |
| **Full suite command** | `npm run test` |
| **Estimated runtime** | ~30 seconds |

---

## Sampling Rate

- **After every task commit:** Run `npm run test -- --reporter=verbose`
- **After every plan wave:** Run `npm run test`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 30 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 60-01-01 | 01 | 1 | Schema + GL accounts | unit | `npm run test -- tests/fixedAssets` | ❌ W0 | ⬜ pending |
| 60-01-02 | 01 | 1 | Asset CRUD mutations | unit | `npm run test -- tests/fixedAssets` | ❌ W0 | ⬜ pending |
| 60-02-01 | 02 | 1 | Depreciation calculation | unit | `npm run test -- tests/depreciation` | ❌ W0 | ⬜ pending |
| 60-02-02 | 02 | 1 | Batch JE generation | unit | `npm run test -- tests/depreciation` | ❌ W0 | ⬜ pending |
| 60-02-03 | 02 | 1 | Duplicate prevention | unit | `npm run test -- tests/depreciation` | ❌ W0 | ⬜ pending |
| 60-03-01 | 03 | 2 | Asset Register UI | manual | browser verify | N/A | ⬜ pending |
| 60-03-02 | 03 | 2 | Catch Up dialog | manual | browser verify | N/A | ⬜ pending |
| 60-04-01 | 04 | 2 | Disposal workflow | unit | `npm run test -- tests/fixedAssets` | ❌ W0 | ⬜ pending |
| 60-04-02 | 04 | 2 | Income Statement reminder | manual | browser verify | N/A | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `tests/fixedAssets/` — test directory for asset CRUD and disposal
- [ ] `tests/depreciation/` — test directory for depreciation calc and batch JE
- [ ] Test stubs for schema validation, CRUD, depreciation math, batch JE, disposal

*Existing vitest + convex-test infrastructure covers framework needs.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Asset Register list/card toggle | UI rendering | Visual layout verification | Navigate to /assets, toggle between table and card views |
| Catch Up preview dialog | UI interaction | Dialog content and grouping | Click "Catch Up to Now", verify month grouping in preview |
| Depreciation reminder on Income Statement | Cross-page UI | Banner + inline note rendering | Navigate to Income Statement with un-posted depreciation |
| Photo/document uploads | File storage | Browser file picker integration | Upload image on asset detail, verify gallery renders |
| CSV paste for characteristics | Clipboard parsing | Browser paste event | Paste CSV rows into characteristics field |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 30s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
