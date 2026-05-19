# Staff Review — `fix/asset-register-dep-preview-perm`

**Date:** 2026-05-19
**Branch:** `fix/asset-register-dep-preview-perm`
**Base:** `6f8375ef` (origin/main)
**Head:** `1eca83de`
**Reviewer:** Senior engineer (staffreview)
**Scope:** Single-commit hotfix, 3 source files, +19/-12 LOC. One debug-session doc (+87 LOC).

---

## Summary

This is a correct, minimal, defense-in-depth hotfix for a real production crash: managers loading `/asset-register` triggered an `Unauthorized` `ConvexError` from `getDepreciationPreview` (admin-only) because `DepreciationPreviewDialog` subscribed to that query unconditionally on mount, and the page rendered the dialog unconditionally for all roles. The React error boundary swallowed the throw as a generic `ChunkLoadError` — a classic "Server Error" silent failure mode the team already learned about in the 2026-04-09 voucher debug (`manager-override-server-error.md`).

The fix itself is fine. **The more important finding is that this bug class is structurally inevitable in the current architecture.** The Convex auth model throws `ConvexError("Unauthorized: ...")` on the server, the `useSessionQuery` consumer subscribes eagerly on mount, and the React error boundary turns role mismatches into page crashes. The frontend has no automatic relationship between a route's permission gate (`canAccessAssets`: manager+admin) and the role gate of every query the route subscribes to. The only thing preventing this from being a widespread outage is **route-level admin gating** on most admin features — `AssetRegister` is special because it's a *mixed-permission* page (manager+admin route hosting admin-only sub-features).

The hotfix does the right thing for *this* bug. The team should now do exactly one of two follow-ups: (a) introduce a `useAdminQuery` wrapper that auto-skips for non-admins, OR (b) add a CLAUDE.md pitfall and a lint/audit script to keep this from happening again. My recommendation is (b) plus a one-time audit of mixed-permission pages — full `useAdminQuery` infrastructure is over-engineering for a codebase with only ~3-5 mixed pages.

**Verdict:** Ship as-is. Add one MEMORY/CLAUDE.md pitfall entry. Schedule a 1-hour audit of other mixed-permission routes within the next phase.

---

## Critical Issues

**None.** The fix is correct, the diagnosis is documented, and the failure mode is contained.

---

## Important Improvements

### I-1: The bug class is repeatable — add a CLAUDE.md pitfall NOW, before memory fades

This is the second "Server Error" debug session in 6 weeks for the same user (Nilson, manager) on a feature that *appeared* to work in dev (where admin is the default test role). The 2026-04-09 session blamed `throw new Error` redaction; this one blames eager hook subscription to admin-only queries. Both share a deeper root cause: **the frontend has no compile-time link between a route's permitted roles and the role-gate of every query that route subscribes to.**

The debug session (`asset-register-dep-preview-perm.md`) is a forensic artifact. It will be archived and forgotten. The actionable lesson — *"when a manager+admin route renders any admin-only feature, every admin-only query hook must accept a `skip` mode and the consumer must gate on `isAdmin`"* — must live in CLAUDE.md Common Pitfalls or MEMORY.md, where future agents read it at invocation time. Per the developer's own retired-feedback note: "discipline rules now live where the agent reads them at invocation time, not in memory the agent has proven it skips."

**Action:** Add Pitfall #19 to `CLAUDE.md` titled "Mixed-permission pages must gate admin-only query subscriptions" with the rule, the failing-pattern snippet, and the fix-pattern snippet from this hotfix.

### I-2: The codebase has exactly one other mixed-permission page that needs an audit — but it's *safe* today (verify and document)

I spot-checked the consumer side of every admin-only query in `convex/` (queries only — mutations don't fire on mount):

| Query | Role | Frontend hook | Route gate | Status |
|-------|------|---------------|------------|--------|
| `fixedAssets.queries.getDepreciationPreview` | admin | `useDepreciationPreview` (dialog) | `canAccessAssets` (mgr+admin) | **Was buggy — fixed in this PR** |
| `fixedAssets.queries.getAssetsWithoutAcquisitionJE` | admin | `useAssetsWithoutAcquisitionJE` (banner) | `canAccessAssets` (mgr+admin) | **Already correctly gated** with `!isAdmin || jeBannerDismissed ? "skip" : "run"` at `AssetRegister.tsx:95` |
| `bankAccounts.queries.list` / `getById` | admin | `useBankAccounts` / `useBankAccount` | `canManageReimbursements` (admin-only) | Safe — route blocks non-admins |
| `expenses.queries.listAllExpenses` | admin | `useAllExpenses` | `canApproveExpenses` (mgr+admin) | Safe — caller passes `enabled=isAdmin` at `MyExpenses.tsx:71` |
| `payroll.queries.list` / `getById` | admin | `usePayrollEntries` / `usePayrollEntry` | `canManageReimbursements` (admin-only) | Safe — route blocks non-admins |
| `reimbursements.queries.listAwaitingPayment` / `listBatches` / `getBatchById` / `getBatchItems` / `getPendingBatchForEmployee` | admin | `useAwaitingPayment` etc. | `canManageReimbursements` (admin-only) | Safe — route blocks non-admins |

**Asset Register is the only mixed-permission page** (manager+admin route, hosting admin-only sub-features) in the current codebase. The fix is complete for the known surface. Document this audit result so it's not re-run from scratch when the next mixed page lands.

### I-3: The page-level `{isAdmin && (<>…</>)}` is now load-bearing — it deserves a comment

Layer 3 of the fix (`AssetRegister.tsx:611-622`) is the most important layer (it eliminates the subscription entirely, not just gates it on `open`). Without a comment, a future contributor refactoring this JSX to move the dialogs out of the conditional — perhaps to "clean up the JSX" or to support a new "preview-only" manager mode — will re-introduce the bug. The hook-level `skip` (layer 2) would still protect against the literal `open=true` case, but a future component might forget that.

**Action:** Add a one-line comment above the `{isAdmin && (` block: `// Both dialogs subscribe to admin-only queries — keep mount gated by isAdmin (see Pitfall #19).`

### I-4: Hidden secondary win — admin page loads now don't fetch depreciation preview on every page load

Pre-fix, `useDepreciationPreview()` subscribed for **every admin visit**, regardless of whether they clicked "Catch Up to Now". The query loops over every active depreciable asset, computes missing months, and runs `calculateFinalMonthAmount` for each — non-trivial backend work. Post-fix, this only fires when the dialog opens (`open ? "run" : "skip"`).

For admins, this is a real efficiency win — they were paying for an unused query subscription on every Asset Register page load. The fix should be called out in CHANGELOG as a performance improvement, not just a bug fix.

**Action:** When updating CHANGELOG, mention "also eliminates eager subscription of `getDepreciationPreview` on every admin visit — query now fires only when the Catch Up dialog opens."

---

## Minor Refinements

### M-1: Defense-in-depth is justified here, but the three layers serve different purposes — document them

The three-layer fix is *not* over-correction; each layer has a distinct role:

1. **Layer 1 (hook signature):** Makes the skip semantics explicit and reusable. Future callers don't need to remember to wrap with `if (!isAdmin) "skip"`.
2. **Layer 2 (dialog's `open` gate):** Even for admins, avoids wasteful subscription before user opens dialog (the secondary win in I-4).
3. **Layer 3 (page `{isAdmin && ...}`):** Belt-and-braces — prevents the component from even mounting for non-admins. This is the layer that fixes the *crash* specifically; layers 1 and 2 fix it only because the dialog mounts with `open=false` initially.

Strictly speaking, **only layer 3 is required for the crash fix**. Layer 2 + layer 1 alone *would* also fix the crash, but only because `open` starts `false`. If someone in future passes `open={true}` initially (e.g., auto-open via URL param like `?openDeprecationPreview=1`), layer 3 is the only layer that still protects managers.

Layer 1 + layer 2 are good hygiene. Layer 3 is the real fix. Don't mistake the three layers for redundancy.

### M-2: No automated regression test was added — for a 3-line fix on a known-isolated surface, this is acceptable, but note the lack

The fix has no RTL test asserting "manager mounting AssetRegister does not trigger getDepreciationPreview". The debug doc lists only manual verification. For a hotfix this small with clear evidence in the debug doc, that's fine. But:

- The exact RTL test would be ~10 lines: render `<AssetRegister />` with a mocked manager user, assert `useSessionQuery` was not called with the admin query.
- The bug went undetected from Phase 60 (2026-03-17) until Nilson hit it (2026-05-19) — **62 days in production**. A test would have caught this in CI.

I would not block the hotfix on this. But the next time a mixed-permission page is added, a regression test should be the norm.

### M-3: The "Server Error" message visibility problem is the *third-order* root cause and remains unfixed

Per the 2026-04-09 debug (`manager-override-server-error.md`), `ConvexError.data` is preserved on production but the raw `.message` shows "Server Error". That session updated `getErrorMessage` to unpack `ConvexError.data`, but **only for explicit `catch` callers**. When `useSessionQuery` throws inside a React render, the error reaches the `ErrorBoundary`, which displays whatever generic fallback it's configured to show — in this case, a ChunkLoadError page.

A proper fix would be: the top-level ErrorBoundary unpacks `ConvexError.data` for any `ConvexError` it catches and shows the actual reason ("Unauthorized: role 'manager' not in [admin]"). That would have turned a 62-day silent bug into a 1-day "why am I seeing this auth error on /asset-register?" Slack ping. Out of scope for this hotfix, but worth a backlog item.

### M-4: The skip-mode parameter convention is now established across 3 hooks in this file — formalize it

`useDepreciationPreview`, `useOrphanEquipmentPurchases`, and `useAssetsWithoutAcquisitionJE` all use the same `(mode: "run" | "skip" = "run")` signature. This is a pattern, but it's an *unwritten* one — there's no docstring or section comment in `useFixedAssets.ts` saying "all admin-only hooks should follow this signature." If this pattern is meant to spread to other admin-only hooks, document it in `docs/CODE_STYLE.md` or as a section comment in the hook file.

A small refactor: define a shared type alias once at the top of the file.

```ts
type QueryMode = "run" | "skip";
```

Then `useDepreciationPreview(mode: QueryMode = "run")` everywhere. Reduces typo risk and signals "this is a convention, not a one-off."

---

## Strengths

### S-1: The debug doc is excellent

`.planning/debug/asset-register-dep-preview-perm.md` is the strongest part of this branch. It explicitly enumerates eliminated hypotheses (with evidence), records the exact files/lines checked, cites the prior session for user-identity confirmation, and produces a 3-part fix plan grounded in the evidence. This is the gold standard for `/gsd-debug` output and should be referenced in the skill docs as an example.

The cross-reference to the 2026-04-09 session (same user, same "Server Error" pattern, different root cause) is particularly sharp — it shows the diagnostician learned from prior forensics rather than starting from scratch.

### S-2: The fix mirrors an *existing* in-file pattern rather than inventing a new abstraction

Layers 1-2 follow the exact signature of `useOrphanEquipmentPurchases` and `useAssetsWithoutAcquisitionJE` (also in this file). The reviewer (and Nilson, when he reads the fix) immediately recognize the pattern. No new hook abstraction, no new context provider, no new helper — just a missing instance of an established convention. This is the right scope for a hotfix.

### S-3: The fix is single-commit, single-purpose, with a clear conventional commit message

`fix(asset-register): gate admin-only depreciation preview query for managers` — exact and scannable. No drive-by refactors, no doc churn outside the debug session, no "while I'm here" cleanups. Easy to review, easy to revert if something downstream breaks.

### S-4: Defense-in-depth without paranoia

Three layers of gating on a 3-line bug could easily tip into over-engineering. Here it doesn't, because each layer guards against a different future regression (see M-1). The fact that all three layers are 1-3 lines each keeps the cost low while the protection is high.

---

## Recommendations

In priority order:

1. **(Now, in this PR)** Add the layer-3 comment from I-3. ~30 seconds.
2. **(Now, in this PR or doc-only follow-up to main)** Add Pitfall #19 to `CLAUDE.md` capturing the lesson. ~5 minutes.
3. **(Now, in CHANGELOG)** Mention the perf win from I-4. ~1 minute.
4. **(Next phase)** Refactor the three hooks in `useFixedAssets.ts` to share a `QueryMode` type alias (M-4). ~5 minutes.
5. **(Backlog item)** Capture the ErrorBoundary-doesn't-unpack-ConvexError issue from M-3. The next "Server Error" mystery will thank you.
6. **(Optional, low priority)** When the *second* mixed-permission page lands in v2.1+, introduce a `useAdminQuery` wrapper. Don't pre-build it now — wait for a second instance to confirm the abstraction fits.
7. **(Skip)** A `useAdminQuery` wrapper today. The audit in I-2 shows only one mixed-permission page exists, and the per-call gating is fine. The wrapper would solve a problem that doesn't have a second instance yet.
8. **(Skip)** An ESLint rule. The rule would be "all admin-only query hooks must accept a `mode` parameter" — too specific to write, too easy to false-positive. The CLAUDE.md pitfall is sufficient deterrence for the AI agents doing 99% of the writing.

---

## Closing note

This is a small, well-scoped hotfix from a well-run debug session. The bug it fixes is symptomatic of a structural pattern that has now happened twice with the same user — the lesson must escape the debug doc and land somewhere agents actually read. Do that, ship, and move on.
