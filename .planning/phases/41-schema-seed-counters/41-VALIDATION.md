---
phase: 41
slug: schema-seed-counters
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-12
---

# Phase 41 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest ^4.0.18 + convex-test |
| **Config file** | `vitest.config.ts` |
| **Quick run command** | `npm run test` |
| **Full suite command** | `npm run test` |
| **Estimated runtime** | ~30 seconds |

---

## Sampling Rate

- **After every task commit:** Run `npm run type-check`
- **After every plan wave:** Run `npm run test && npm run build`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 30 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 41-01-01 | 01 | 1 | COA-04 | unit | `npx vitest run convex/accounts/__tests__/seed.test.ts -x` | ❌ W0 | ⬜ pending |
| 41-01-02 | 01 | 1 | COA-05 | unit | `npx vitest run convex/accounts/__tests__/seed.test.ts -x` | ❌ W0 | ⬜ pending |
| 41-01-03 | 01 | 1 | EXP-06 | unit | `npx vitest run convex/lib/__tests__/counter.test.ts -x` | ❌ W0 | ⬜ pending |
| 41-01-04 | 01 | 1 | JE-04 | schema | `npm run type-check` | N/A | ⬜ pending |
| 41-01-05 | 01 | 1 | JE-05 | unit | `npx vitest run convex/lib/__tests__/counter.test.ts -x` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `convex/accounts/__tests__/seed.test.ts` — stubs for COA-04, COA-05 (seed idempotency, isSystem deletion guard)
- [ ] `convex/lib/__tests__/counter.test.ts` — stubs for EXP-06, JE-05 (counter format, daily reset, WIB date, sequential increment)

*Note: Counter atomicity (race conditions) guaranteed by Convex OCC — no unit test needed. Pure formatting logic testable as pure function.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| JE-04 denormalization | JE-04 | Schema structure verified via type-check; runtime denormalization verified in Phase 43 (JE creation) | Schema compiles with `entryDate` field on `journalEntryLines` |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 30s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
