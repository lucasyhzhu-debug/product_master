---
phase: 84
slug: qris-payment-integration
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-05-21
---

# Phase 84 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.
> Derived from `84-RESEARCH.md` § Validation Architecture. The planner refines the Per-Task map once plans/tasks are numbered.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest 1.x + `convex-test` (backend), React Testing Library (frontend), Playwright (E2E) |
| **Config file** | `vitest.config.ts` (jsdom, `convex-test` inlined); `tests/e2e/` for Playwright |
| **Quick run command** | `npm run test -- <path>` (single file, < 30s) |
| **Full suite command** | `npm run test` then `npm run build` |
| **Estimated runtime** | ~30s single-file; full suite minutes |

---

## Sampling Rate

- **After every task commit:** `npm run test -- <touched test file>` + `npm run type-check`
- **After every plan wave:** `npm run test` (full unit suite)
- **Before `/gsd-verify-work`:** Full suite green + `npm run build` (catches the bundle cap) must pass
- **Max feedback latency:** ~30 seconds (single-file quick run)

---

## Per-Task Verification Map

> Requirement IDs below are the SPEC requirements (R1–R7) from `84-SPEC.md`, not REQUIREMENTS.md REQ-IDs (none mapped). The planner maps these to concrete Task IDs during planning.

| Req | Behavior | Threat Ref | Test Type | Automated Command | File Exists | Status |
|-----|----------|-----------|-----------|-------------------|-------------|--------|
| R1 | create-QR request body shape (`type:DYNAMIC`, `external_id`=orderNumber, `amount`=finalTotal, `currency:IDR`) | — | unit (pure `buildCreateQrBody`) | `npm run test -- convex/integrations/qris/__tests__/xendit.test.ts` | ❌ W0 | ⬜ pending |
| R2 | `qrisPayments` insert/expire; `getActiveQrisPayment` returns latest non-expired | — | unit (convex-test, `t.run`) | `npm run test -- convex/qrisPayments/__tests__/mutations.test.ts` | ❌ W0 | ⬜ pending |
| R3 | create action: non-AwaitingPayment throws + writes nothing; second call expires first; finalTotal<1500 rejected | — | unit (`t.run` on internal mutation) | `npm run test -- convex/qrisPayments/__tests__/createInvoice.test.ts` | ❌ W0 | ⬜ pending |
| R4a | token mismatch/missing → 401, no state change | T-84 (webhook auth) | unit (pure `verifyCallbackToken`) | `npm run test -- convex/integrations/qris/__tests__/verifyToken.test.ts` | ❌ W0 | ⬜ pending |
| R4b | COMPLETED transitions once + reserves once; **replay does NOT re-transition/double-reserve** | T-84 (idempotency) | unit (convex-test, `t.run` ×2) | `npm run test -- convex/qrisPayments/__tests__/webhookTransition.test.ts` | ❌ W0 | ⬜ pending |
| R4c | amount ≠ row.amount OR superseded/expired → paid AND `needsReview` + reason | — | unit (`t.run`) | same file as R4b | ❌ W0 | ⬜ pending |
| R5 | button absent when flag off OR status≠AwaitingPayment; dialog flips paid reactively; Regenerate supersedes | — | RTL + Playwright | `npm run test -- src/components/orders/__tests__/QrisChargeDialog.test.tsx` | ❌ W0 | ⬜ pending |
| R6 | flag off → no QRIS path; Test→Live = env only | — | E2E / manual (env behavior) | `tests/e2e/qris-charge.spec.ts` (flag-on path) | ❌ W0 | ⬜ pending |
| R7 | NMID renders when set; absent without error; **no order_staff crash** | T-84 (role superset) | RTL (all 3 roles mount) | same as R5 | ❌ W0 | ⬜ pending |
| — | dev Test-Mode E2E: simulate-payment → order reaches `PaymentReceived` | — | Playwright (manual-gated; needs Test key) | `tests/e2e/qris-charge.spec.ts` (skip if no key) | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `convex/integrations/qris/__tests__/xendit.test.ts` — R1 request-body shape (extract pure `buildCreateQrBody`)
- [ ] `convex/integrations/qris/__tests__/verifyToken.test.ts` — R4a token compare (model on `convex/__tests__/hmac.test.ts`)
- [ ] `convex/qrisPayments/__tests__/mutations.test.ts` — R2 insert/expire/getActive
- [ ] `convex/qrisPayments/__tests__/createInvoice.test.ts` — R3 state guards (via `t.run`)
- [ ] `convex/qrisPayments/__tests__/webhookTransition.test.ts` — R4b idempotency replay + R4c needsReview
- [ ] `src/components/orders/__tests__/QrisChargeDialog.test.tsx` — R5/R7 (all 3 roles mount; reactive paid flip)
- [ ] `tests/e2e/qris-charge.spec.ts` — flag-on happy path; Test-Mode loop skipped without key
- [ ] Test-helper: a `qrisPayments` factory + a fake `order` in `AwaitingPayment`

**Testing strategy note:** Both the create-action and the webhook transition should expose **pure functions** (`buildCreateQrBody`, `verifyCallbackToken`, `decideWebhookOutcome(order, row, payload) → {transition, recordPaid, needsReview, reason}`). This sidesteps the convex-test `t.action(internal.*)` resolver bug (Pitfall 5) and makes idempotency + needsReview logic unit-testable without a live runtime. Invoke the actual mutation via `t.run`/`ctx.runMutation` for integration assertions.

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Test→Live key swap requires no code change | R6 | Env-var behavior; cannot assert in CI without a live key | Swap `XENDIT_API_KEY` Test→Live in Convex dashboard, flip `QRIS_ENABLED`, confirm button + create path work with no rebuild |
| Real Xendit callback envelope shape (header name + body wrapper) | R4 | Spike captured the *simulate* response, not a live callback (open question A1/A2) | Capture one real Test-Mode webhook early; store raw payload on a debug field; lock the parser to it |
| Full dev Test-Mode loop (simulate-payment → PaymentReceived) | — | Requires a live Test Mode key + reachable webhook URL | Run against dev deployment with Test key; simulate payment via Xendit dashboard; confirm order flips |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 30s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
