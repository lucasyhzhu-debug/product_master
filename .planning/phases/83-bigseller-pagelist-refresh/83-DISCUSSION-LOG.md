# Phase 83: BigSeller pageList Refresh - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-05-21
**Phase:** 83-bigseller-pagelist-refresh
**Areas discussed:** 01a prod outcome, phase scope, 01b W1-W3 handling, 83-02 optimization selection, token-refresh retention

**Note on flow:** ADVISOR_MODE was technically active (USER-PROFILE.md present) but
NON_TECHNICAL_OWNER resolved false (no `guided`/`jargon`/`high-level` signals; profile
is terse-direct, fast-intuitive, code-only). The parallel advisor-research-agent step
was skipped — flagged explicitly to the user — because these are internal operational
decisions already grounded in 83-RESEARCH.md/HAR analysis, not vendor/library choices
that benefit from web research. Presented recommendation-first per profile.

---

## 01a prod outcome

| Option | Description | Selected |
|--------|-------------|----------|
| Yes — sync works now | code:-1 gone, orders ingesting; archives 01b W1-W3 | ✓ |
| No — still code:-1 | Escalate to 01b W1 subtractive orderState | |
| Haven't tested yet | Plan both branches, gate execution on backfill | |

**User's choice:** Yes — sync works now.
**Notes:** Resolves the 83-01a-SUMMARY decision tree down the SUCCESS branch.

---

## Phase scope (initial multiSelect)

| Option | Description | Selected |
|--------|-------------|----------|
| Token auto-refresh (01b W4) | Unconditional ~10 LOC; slide 20-day TTL forward | ✓ |
| Token freshness UI banner (01b I3) | 24h-warning + expired-blocking banner | ✓ |
| Subtractive fallback (01b W1-W3) | Only if 01a failed; data-loss caveat | ✓ (later reversed) |
| Sync optimizations (83-02) | O1-O4/O6 speed-up | ✓ |

**User's choice:** All four — but W1-W3 conflicted with "sync works now" (flagged).
**Notes:** Subtractive fallback selection was reconciled in the next area.

---

## 01b W1-W3 handling (conflict resolution)

| Option | Description | Selected |
|--------|-------------|----------|
| Archive — document only | No code; CHANGELOG notes legacy orderState still accepted; keep plan as standby | ✓ |
| Keep plan as live standby | Same outcome, framed as ready-to-execute | |
| Actually ship orderState trim | Deliberately stop ingesting canceled/new (data loss) | |

**User's choice:** Archive — document only.
**Notes:** User then messaged "wait we don't need 83-01b since 83-01a worked" — clarified below.

---

## Token-refresh retention (clarifying "we don't need 83-01b")

| Option | Description | Selected |
|--------|-------------|----------|
| Drop W1-W3, keep token refresh | Archive subtractive fallback; keep token auto-refresh + banner as own deliverable | ✓ |
| Drop all of 83-01b | Also drop token auto-refresh; keep manual repasting | |

**User's choice:** Drop W1-W3, keep token refresh.
**Notes:** Confirmed the token auto-refresh (W4) + freshness banner (I3) are unconditional
and survive — only the subtractive fallback is archived. Relabel out of the "01b" framing.

---

## 83-02 optimization selection

| Option | Description | Selected |
|--------|-------------|----------|
| O4 N+1 elimination | Batch getRevenueByIds(); pure refactor | ✓ |
| O3 adaptive polling | 15s/30s/60s ramp; saves 3-5min | ✓ |
| O6 pageSize 50→100 | One number; revert if rejected | ✓ |
| O2+O1 parallelization | Biggest win, biggest risk; do last | ✓ |

**User's choice:** All five optimizations in scope.
**Notes:** Execute low-risk first (O4 → O3 → O6 → O2 → O1). Separate PRs / triple-reviews;
O1+O2 paired.

---

## Claude's Discretion

- Branch names, plan-file naming for the relabeled token-refresh deliverable, PR sequencing within the low-risk-first order.
- Whether O6 (pageSize 100) survives — empirical; revert if BigSeller rejects.

## Deferred Ideas

- 83-01b W1-W3 subtractive fallback — archived standby; re-trigger only on future BigSeller drift (carries cancellation-data-loss caveat).
- Staffreview I2 — extend `BigSellerOrderRow` with 4 observed-but-unused HAR response fields (TODO at `helpers.ts:225`).
