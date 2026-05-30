---
phase: 78
slug: product-inventory-substitution
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-04-11
---

# Phase 78 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest + convex-test |
| **Config file** | `vitest.config.ts` |
| **Quick run command** | `npx vitest tests/convex/productSubstitution.test.ts --run` |
| **Full suite command** | `npx vitest --run` |
| **Estimated runtime** | ~30 seconds |

---

## Sampling Rate

- **After every task commit:** Run `npx vitest tests/convex/productSubstitution.test.ts --run`
- **After every plan wave:** Run `npx vitest --run`
- **Before `/gsd-verify-work`:** Full suite must be green
- **Max feedback latency:** 30 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 78-01-01 | 01 | 1 | SUB-01, SUB-02 | T-78-01 | Validate fulfillFromProductId is real active product, multiplier >= 2, no chains | unit + integration | `npx vitest tests/convex/productSubstitution.test.ts --run` | ❌ W0 | ⬜ pending |
| 78-01-02 | 01 | 1 | SUB-02, SUB-04 | T-78-03 | fulfillFromInventory resolves substitution, processGofoodSales handles substitution | integration | `npx vitest tests/convex/productSubstitution.test.ts --run` | ❌ W0 | ⬜ pending |
| 78-02-01 | 02 | 2 | SUB-01, SUB-03 | T-78-05 | Dropdown uses Convex _id not numeric id | manual + type-check | `npx tsc --noEmit` | ✅ | ⬜ pending |
| 78-02-02 | 02 | 2 | SUB-03 | T-78-06 | Availability panel shows substitution details | manual + build | `npm run build` | ✅ | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `tests/convex/productSubstitution.test.ts` — stubs for SUB-01 through SUB-04 (created in Plan 01 Task 1)
- [ ] Test helpers: either use `tests/convex/helpers.ts:createBasicOrder` or fix inline helper with required schema fields

*Existing vitest + convex-test infrastructure covers framework requirements.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| ProductForm shows "Inventory Fulfillment" section for food products only | SUB-01 | Visual UI verification | Edit a food product, confirm section appears. Edit a packaging product, confirm section is hidden. |
| AvailabilityPanel split sub-rows render correctly | SUB-03 | Visual UI verification | Open order detail with substitution-configured product, verify direct vs substitute rows display |
| Fulfillment toast shows deduction breakdown | SUB-02 | Visual UI verification | Fulfill an order with substitution, verify toast shows "via Nx {source}" |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 30s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
