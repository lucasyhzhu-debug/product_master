---
phase: 51
slug: bulk-upload-of-previously-reimbursed-expenses-via-bank-transaction-mapping
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-14
---

# Phase 51 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest ^4.0.18 |
| **Config file** | `vite.config.ts` (Vitest config embedded) |
| **Quick run command** | `npx vitest run convex/journalImport/__tests__/mutations.test.ts src/lib/__tests__/csvImportValidation.test.ts` |
| **Full suite command** | `npm run test` |
| **Estimated runtime** | ~15 seconds |

---

## Sampling Rate

- **After every task commit:** Run `npm run type-check`
- **After every plan wave:** Run `npm run test`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 15 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 51-01-01 | 01 | 1 | Schema metadata | type-check | `npm run type-check` | ✅ | ⬜ pending |
| 51-01-02 | 01 | 1 | Engine metadata param | regression | `npx vitest run convex/lib/__tests__/journalEngine.test.ts` | ✅ | ⬜ pending |
| 51-02-01 | 02 | 2 | validateImportRow pure | unit | `npx vitest run convex/journalImport/__tests__/mutations.test.ts` | ❌ W0 | ⬜ pending |
| 51-02-02 | 02 | 2 | bulkCreateJournalEntries | unit | `npx vitest run convex/journalImport/__tests__/mutations.test.ts` | ❌ W0 | ⬜ pending |
| 51-02-03 | 02 | 2 | CSV parse + validate | unit | `npx vitest run src/lib/__tests__/csvImportValidation.test.ts` | ❌ W0 | ⬜ pending |
| 51-02-04 | 02 | 2 | dateToWibEpoch | unit | `npx vitest run src/lib/__tests__/csvImportValidation.test.ts` | ❌ W0 | ⬜ pending |
| 51-03-01 | 03 | 3 | Page renders | type-check | `npm run type-check` | ✅ | ⬜ pending |
| 51-03-02 | 03 | 3 | Route registration | build | `npm run build` | ✅ | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `convex/journalImport/__tests__/mutations.test.ts` — TDD tests for validateImportRow and MAX_BATCH_SIZE (written BEFORE mutations.ts)
- [ ] `src/lib/__tests__/csvImportValidation.test.ts` — TDD tests for parseAndValidateCsv and dateToWibEpoch (written BEFORE csvImportValidation.ts)
- [ ] Papa Parse install: `npm install papaparse && npm install -D @types/papaparse`

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| CSV template download | Template generation | Browser-only (Blob + URL.createObjectURL) | Navigate to /import, click Download Template, verify CSV headers |
| Import wizard flow | End-to-end UX | Multi-step UI flow | Upload test CSV → review → confirm → verify P&L |
| Resume from failure | Batch failure recovery | Requires simulated network error | Start import, disconnect mid-batch, verify completed batches persisted |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 15s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
