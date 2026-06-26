# Staff Review: Subscription Creation & Onboarding UI — Plan

**Date:** 2026-06-26
**Plan:** `docs/superpowers/plans/2026-06-26-subscription-creation-onboarding.md`
**Reviewers:** Staff Developer (Implementation) + Principal Developer (Architecture)
**Plan Structure:** ✅ Validated (Goal, File Structure, Task List, Execution Strategy/Waves, per-task TDD, Testing, Success Criteria, Rollback via spec all present)

---

## 1. Summary

**Overall Assessment:** Approve (with Improvement 1 applied inline)

Strong, TDD, real-signature plan grounded in the actual codebase; 7 tasks across 4 clean waves with no shared-file collisions and codegen isolated to Wave 0. One Improvement is load-bearing: the Task 4 agreement-upload wiring was mis-specified against the real `AgreementUpload` contract — fixed inline. No Critical issues. Evidence-before-mitigation gate: N/A (greenfield feature, not a flake/race fix).

## 2. Critical Issues (Must Fix)

None.

## 3. Improvements (Recommended)

| # | Improvement | Impact | Effort |
|---|-------------|--------|--------|
| 1 | Correct the Task 4 agreement upload→create chain to the real `AgreementUpload` contract | H | L |
| 2 | Task 4 Step 3 is prose, not a full code block (test-locked) — acknowledge | L | — |

### Improvement 1: Agreement upload→create wiring (verified against real code)
Task 4 said "reusing `AgreementUpload` (pass `customerId`; on upload-complete set the returned id)". Verified the real contract (`src/components/crm/AgreementUpload.tsx:41`):
```ts
interface AgreementUploadProps {
  generateUploadUrl: () => Promise<string>;
  onUploaded: (storageId: Id<"_storage">, fileName: string, lang: "id"|"en", fileSize: number) => void;
  mode: "create" | "add-version";
  disabled?: boolean;
}
```
`AgreementUpload` takes **no `customerId`** and `onUploaded` returns a **`storageId`, not an agreementId**. To get an `agreementId` the form must then call `createSupplyAgreement` (`convex/crm/agreements.ts:32`), whose args are `{ customerId, subscriptionId?, fileStorageId, fileName, fileSize, status: "draft"|"signed"|"expired"|"terminated", signedDate?, governingLaw?, signatories?, keyTerms?, lang: "id"|"en" }` and which returns the new agreement id. So the upload path is:
```tsx
const generateAgreementUploadUrl = useSessionMutation(api.crm.agreements.generateAgreementUploadUrl);
const createSupplyAgreement = useSessionMutation(api.crm.agreements.createSupplyAgreement);
// ...
<AgreementUpload
  mode="create"
  generateUploadUrl={generateAgreementUploadUrl}
  onUploaded={async (storageId, fileName, lang, fileSize) => {
    const id = await createSupplyAgreement({
      customerId, fileStorageId: storageId, fileName, fileSize, status: "draft", lang,
    });
    setAgreementId(id);
  }}
/>
```
**Recommendation:** Applied inline to Task 4 Step 3 + verify-first list. Without it the executor would mis-wire a nonexistent `customerId` prop and try to read an `agreementId` that the uploader never returns.

### Improvement 2: Task 4 implementation is prose, not a full code block
The writing-plans rule prefers a complete code block for code steps. Task 4 Step 3 describes the form (exact labels, `data-testid`s, validation predicates, submit arg shape, rollover branch) rather than pasting ~250 lines. This is acceptable here because the **three Task-4 tests fully lock the contract** (label `getByLabelText` substrings, `weekly-qty-preview`/`weekly-credit-preview` testids, and the exact `createSubscription` arg object), so the implementation is test-driven and deterministic. Left at implementer discretion; not expanded to avoid a disproportionate inline form dump.

## 4. Refinements (Optional)
- Pin `generateAgreementUploadUrl` and `createSupplyAgreement` as `useSessionMutation` (both are `protectedMutation`). (Folded into Improvement 1's snippet.)
- `startDate` "next Monday" computed client-side from a `Date` is acceptable for a date input; the backend stores ms. WIB nuance is immaterial at date granularity — note only.
- Map `api.menuProducts.queries.list` results (full `menuProducts` docs) to `{ _id, name }` before passing to `ScheduleTemplateEditor` (it only needs those two).

## 5. Duplication Analysis
### Existing code to leverage
| Code | Location | How to use |
|------|----------|------------|
| `AgreementUpload` | `src/components/crm/AgreementUpload.tsx` | upload path (per Improvement 1) |
| `ProductLineEditor` | `src/components/crm/ProductLineEditor.tsx` | product-dropdown idiom (don't reuse the priced line — Task 2 builds a focused line, correct) |
| `formatCurrency` | `src/lib/utils.ts:8` | preview money (plan uses it) |
| `STATUS_BADGE` idiom | `SubscriptionPage.tsx:96` | Draft badge in Task 5 |
| `Breadcrumbs` | `src/components/crm/Breadcrumbs.tsx` | NewSubscriptionPage trail |

### Potential duplication risks
- None significant. The new `createCustomer` deliberately exists because no single mutation carries the full field union (verified).

## 6. Phase / Wave Accuracy
| Wave | Assessment | Notes |
|------|------------|-------|
| 0 (T1) | Good | codegen isolated correctly |
| 1 (T2,T3) | Good | disjoint files |
| 2 (T4,T6) | Good | disjoint files |
| 3 (T5) | Good | integration seam solo |
| 4 (T7) | Good | verification gate |
**Ordering issues:** none. **Missing phases:** none.

## 7. Specialist Agent Recommendations
| Phase | Recommended Agent | Rationale |
|-------|-------------------|-----------|
| T1 | `convex-backend` | additive mutation + codegen |
| T2–T6 | `react-ui-builder` | shadcn form/component work |
| tests | `tdd-test-architect` | T1–T6 test code |
| T7 | `code-auditor` | access (Pitfall #19) + pattern audit |

## 8. Git Workflow Assessment
| Check | Status |
|-------|--------|
| Feature branch specified | ✅ (implementation branch off main at execution) |
| Branch naming follows convention | ✅ |
| Merge strategy documented | ✅ squash (pipeline) |
| Commit-per-task | ✅ |
| Pre-push build/typecheck | ✅ (T7) |
| Rollback | ✅ additive; revert commits (+ codegen) |
| Deployment order | ✅ backend(T1)→FE; Convex before Vercel |

## 9. Documentation Checkpoints
CHANGELOG + FILE_MAP + ROADMAP (remove slice) + API_REFERENCE (createCustomer) — all listed in the plan, at execution/merge time. ✅

## 10. Testing Plan Assessment
**Verdict:** Adequate.
| Layer | What | Test type | Status |
|-------|------|-----------|--------|
| Backend | `createCustomer` valid + auth-reject | convex-test | planned (T1) |
| Frontend | ScheduleTemplateEditor add/remove/qty | RTL | planned (T2) |
| Frontend | NewCustomerDialog name-required + create+nav | RTL | planned (T3) |
| Frontend | SubscriptionForm validation + preview math + submit shape | RTL | planned (T4) |
| Frontend | Activate guard + activate call | RTL | planned (T6) |
| Integration | create→activate→kanban + live agreement upload | persona-UAT | pending: needs live env |

Money preview has a known-value test (150 × 29000 = 4.350.000). Auth rejection covered (T1). Empty/loading/error states covered (AC13). Persona-UAT correctly flagged non-headless.

## 11. Edge Cases to Address
- [ ] Agreement upload failure mid-`createSupplyAgreement` → toast error, leave `agreementId` unset (form still submittable without an agreement). Add to Task 4.
- [ ] Switching rollover→expire clears `rolloverExpiryWeeks` before submit (already in plan).
- [ ] All-zero-qty schedule → `weeklyQty` 0 → Activate blocked (covered by T6 guard).

## 12. Approval Conditions
**To approve:** none blocking.
**Apply before implementation:** Improvement 1 (agreement chain) — applied inline. Improvement 2 acknowledged (test-locked).

---

*Generated by /staffreview*
