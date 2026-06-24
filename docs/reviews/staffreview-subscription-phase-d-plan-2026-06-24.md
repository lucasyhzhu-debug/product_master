# Staff Review: Phase D — CRM Surface PLAN

**Date:** 2026-06-24
**Plan:** `docs/superpowers/plans/2026-06-24-subscription-phase-d-crm-surface.md`
**Reviewers:** Staff Developer (Implementation) + Principal Developer (Architecture)
**Plan Structure:** ✅ Validated (Task List, Execution Strategy, File Structure, per-task TDD, Testing, Docs, Success Criteria, Git Workflow, Rollback all present).
**Focus (per pipeline step 5):** verify the assumptions the plan flagged against actual code.

---

## 1. Summary
**Overall Assessment:** Approve with revisions. One Critical (cross-runtime import boundary) + three Improvements, all grounded and fixable inline. Every flagged assumption was checked against the merged tree.

## 2. Critical Issues (Must Fix)

| # | Issue | Category | Location |
|---|-------|----------|----------|
| C1 | Convex code cannot import from `src/` — T20/T22 plan to import the event→category mapper from `src/lib/crmActivityTaxonomy` will break the convex build | Architecture/Build | T1, T20, T22 |

### C1 — `convex/` cannot import `src/`
Grep confirms **zero** convex→src imports (the convex bundler isolates the backend). T20's `buildCustomerTimeline`/`eventTypeToCategory` and T1's mapper were specced in `src/lib/crmActivityTaxonomy.ts`, but T20 runs in convex.
**Recommendation:** Put the **pure event→category mapper in a convex-importable module** `convex/lib/activityEvents.ts` (`EVENT_TYPES`, `EventType`, `ActivityCategory = "order"|"finance"|"message"|"document"|"schedule"|"milestone"`, `eventTypeToCategory`). BOTH runtimes import it: convex (T19/T20/T21) directly; frontend (T1/T22) imports the same pure file (Vite bundles plain TS from `convex/`). `src/lib/crmActivityTaxonomy.ts` keeps ONLY the visuals (`ACTIVITY_TAXONOMY`, `getActivityVisual`) and re-exports `ActivityCategory` as its `ActivityType`. Folded into the plan below.

## 3. Improvements (Recommended)

| # | Improvement | Impact | Effort |
|---|-------------|--------|--------|
| I1 | T12 nav entry shape | M | L |
| I2 | T6 drop the stale "no status" fallback | L | L |
| I3 | Make `useSessionQuery`/`useSessionMutation` explicit | L | L |

### I1 — Nav entry shape (verified)
`Header.tsx` config entries are `{ path, label, icon, permission: 'canAccessX', preload?, rolesAllowed? }` (e.g. `src/components/layout/Header.tsx:113`). T12 said `{ label, to, permission }`.
**Fix:** `{ path: '/crm', label: 'CRM', icon: Contact, permission: 'canAccessCrm' }` (import a lucide icon, e.g. `Contact`/`Users`). Mirror into `MobileBottomNav.tsx moreItems`.

### I2 — `subscriptions.status` confirmed
`subscriptions.status = draft|active|terminating|ended` (schema). T6's `s.status === "active"` is **correct** — remove the "if there's no `status` … derive from startDate/endDate" verify-first hedge (it's misleading; the field exists). Milestones (T20/T21) correctly use `startDate`/`terminationNoticeDate` (both exist, optional) + `endDate` + status transitions.

### I3 — Hook names
Frontend reads use `useSessionQuery`, writes `useSessionMutation` (from `convex-helpers/react/sessions`, e.g. `CrmFundingDashboardPage.tsx:24`), NOT `useQuery`. Plan already implies this; state it explicitly in the UI tasks.

## 4. Refinements (Optional)
- UI tasks use contracts (props/consumed-hooks/states) rather than full JSX bodies — intentional (backend + pure fns get full code; UI follows existing shadcn/Tailwind patterns). Acceptable for skilled subagent execution; the close-out `/triple-review` + `/simplify` covers polish.
- `deriveCreditPool` import path `convex/subscriptions/creditMath` verified ✓. `recharts ^3.7.0` present ✓ (no bundle-cap surprise; already chunked).

## 5. Duplication Analysis
Reuse verified: `getFundingDashboard`/`CrmFundingDashboardPage` (T13 reuses, no rebuild), `getWeekPool`/`deriveCreditPool` (T6/T26 read derived pool), `getByCustomer`+`stripOrder` (Slice-0, T18 is frontend-only link), `protectedQuery`/`protectedMutation`. No duplication of `businessSettings.generateUploadUrl` (T7 fresh wrapper).

## 6. Phase/Wave Accuracy
Waves correct; barriers (T9 codegen, W1→W2, T28) right. Critical path realistic. Shared-file serialization (`src/App.tsx`, nav, `CustomerDashboard.tsx`) correctly called out.

## 7. Specialist Agents
`convex-backend` (T3–T8,T19–T25), `react-ui-builder` (T10–T18,T22–T27), `tdd-test-architect` (pure-fn + RTL), `code-auditor` (T28). Main session: `/triple-review`, `/simplify`, `/browse` UX-UAT.

## 8. Git Workflow
Branch off synced main after Slice 0 ✅; commit-per-task ✅; codegen barrier commits ✅; squash-merge ✅; build/type-check/test/codegen pre-merge ✅; split-brain `gh run list` check ✅.

## 9. Documentation
CHANGELOG (T29, always), API_REFERENCE (T29), FILE_MAP (T29), CLAUDE.md taxonomy rule (optional). No SCHEMA.md (no schema).

## 10. Testing Plan
**Verdict:** Adequate. Pure-fn-first (T1,T2,T4,T20,T24), convex-test for every backend fn incl. `order_staff` Unauthorized, RTL for every page/component incl. loading+empty states, UX-UAT live. Add: a **parity test** that `convex/lib/activityEvents.eventTypeToCategory` and the frontend category list agree (guards the C1 split).

## 11. Edge Cases
- [ ] No current week → empty gauge/chart (T3 returns null; T6/T26/T25 guard) ✓
- [ ] 0 subs / 0 agreements / 0 orders → empty states ✓
- [ ] Timeline >14d + cursor + tiebreaker ✓ (T20/T21/T22)
- [ ] Deleted menuProduct → snapshot productName ✓ (T21 reads order-level snapshot)
- [ ] Manager mounts CRM hook pre-dialog → roles ⊇ canAccessCrm ✓ (all roles m+a)

## 12. Approval Conditions
**To approve:** fix C1 (convex-importable mapper). **Recommended:** I1, I2, I3.

*Generated by /staffreview*
