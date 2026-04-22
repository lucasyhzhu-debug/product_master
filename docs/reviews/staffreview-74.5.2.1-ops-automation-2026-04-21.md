# Staff Review: Phase 74.5.2.1 — Ops Automation (3-plan scaffold)

**Date:** 2026-04-21
**Plans reviewed:**
- `.planning/phases/74.5.2.1-ops-automation/74.5.2.1-README.md`
- `.planning/phases/74.5.2.1-ops-automation/74.5.2.1-01-gobiz-auto-flip-PLAN.md`
- `.planning/phases/74.5.2.1-ops-automation/74.5.2.1-02-k3mart-composite-toggle-PLAN.md`
- `.planning/phases/74.5.2.1-ops-automation/74.5.2.1-03-close-deferred-items-PLAN.md`

**Reviewers:** Staff Developer (Implementation) + Principal Developer (Architecture)

---

## 0. Plan Structure Validation

Each plan is missing CLAUDE.md-mandated sections. The README partly covers them at the phase level, but individual plans should be self-contained for executor agents.

| Section | README | Plan 01 | Plan 02 | Plan 03 |
|---------|--------|---------|---------|---------|
| Git Workflow (branch name) | ⚠ Implicit | ❌ Missing | ❌ Missing | ❌ Missing |
| Implementation Waves (table) | ⚠ Prose only | ❌ (frontmatter only) | ❌ (frontmatter only) | ❌ (frontmatter only) |
| Documentation Updates (checklist) | ❌ Missing | ❌ Missing | ❌ Missing | ⚠ Is itself docs work |
| Success Criteria | ✅ | ✅ | ✅ | ✅ |

**Plan Structure Additions (added by this review — apply before implementation):**

Add the following to **README.md** (phase-level):

```markdown
## Git Workflow
**Branch:** `feature/74.5.2.1-ops-automation`
**Checkpoints:**
- After Wave 1 (Plans 01 + 02 parallel): `feat(74.5.2.1): auto-flip gobiz + K3Mart composite`
- After Wave 2 (Plan 03): `docs(74.5.2.1): close deferred items + runbook`
**Merge:** PR to main after triple-review (per CLAUDE.md mandatory gate).

## Implementation Waves
### Wave 1 [PARALLEL]
| Agent | Task | Files |
|-------|------|-------|
| convex-backend | Plan 01 — mutation + tests + CI step | `convex/productInventory/channelFlags.ts` (see Critical Issue 2), `convex/productInventory/__tests__/*`, `.github/workflows/deploy.yml` |
| react-ui-builder + convex-backend | Plan 02 — mutation + hook + UI | `convex/productInventory/channelFlags.ts`, `src/hooks/convex/useChannelRouting.ts`, `src/pages/ProductInventorySettings.tsx` |

### Wave 2 [SEQUENTIAL, after Wave 1]
| Agent | Task | Files |
|-------|------|-------|
| convex-backend + docs | Plan 03 — doc + deferred-items + roadmap | `.planning/phases/74.5.2-unified-deduct-cutover/deferred-items.md`, `docs/CHANNEL_INTEGRATION.md`, `docs/CHANGELOG.md`, `.planning/ROADMAP.md` |

### Wave 3 [SEQUENTIAL]
| Agent | Task |
|-------|------|
| code-auditor | Type check + pattern compliance |
| Bash | `npm run type-check && npm run build && npm test` |
| triple-review | Mandatory per CLAUDE.md feedback (non-negotiable) |

## Documentation Updates
- [ ] `docs/CHANGELOG.md` — Phase 74.5.2.1 entry
- [ ] `docs/CHANNEL_INTEGRATION.md` — replace manual flag-flip procedures (Plan 03)
- [ ] `.planning/phases/74.5.2-unified-deduct-cutover/deferred-items.md` — add Resolution subsections (Plan 03)
- [ ] `.planning/ROADMAP.md` — mark 74.5.2.1 complete, add 74.5.3 forward-reference (Plan 03)
```

---

## 1. Summary

**Overall Assessment:** **Major Rework**

The phase is well-scoped (correct ~3h bite-sized follow-up, clean separation from 74.5.3 feature work) but the plans contain **three factual errors** that would produce broken code, wrong docs, or file collisions if executed as-written:

1. Plan 02 claims `useChannelFlags` is a new hook — **it already exists** in `src/hooks/convex/useChannelRouting.ts`.
2. Plan 02 claims `channelDeductionEnabled` is a `v.record(...)` loose map — **it is a strict `v.object` with 8 enumerated keys**; the proposed spread pattern will fail schema validation on first use.
3. Plan 03 claims it closes deferred items **#4 and #5** — actual item #4 is "Migration drain-loop no test coverage" (unrelated). The plan would incorrectly mark an open quad-review finding as resolved.

All three are fixable in <30 min of plan revision; none requires rethinking the phase.

---

## 2. Critical Issues (Must Fix)

| # | Issue | Category | Location |
|---|-------|----------|----------|
| C1 | Deferred-item numbering wrong — Plan 03 targets items #4/#5 but actual #4 is unrelated | Docs correctness | Plan 03 Task 1; README §Scope item 3 |
| C2 | `useChannelFlags` already exists — Plan 02 would create a naming collision | Duplication | Plan 02 Task 3 |
| C3 | `channelDeductionEnabled` schema is strict `v.object`, NOT `v.record` | Schema logic | Plan 02 Pitfall #4 |
| C4 | Plan 02 throws on missing settings row — diverges from existing `setChannelDeductionFlag` upsert pattern | Logic/UX | Plan 02 Task 1 |
| C5 | Plan 01 flag-flip fails schema validation if `channelDeductionEnabled` is undefined (missing 7 sibling keys) | Schema logic | Plan 01 Task 1 |
| C6 | Plan 01 `no-settings-row → skipped` silently succeeds — flag never flipped, CI green, prod under-deducts | Safety | Plan 01 Task 1 |
| C7 | `flipK3MartBundle` placed in wrong file — belongs with existing `channelFlags.ts`, not `mutations.ts` | Duplication / domain separation | Plan 02 Task 1 |
| C8 | Composite toggle has no destructive-confirmation step — inconsistent with existing single-flag FLIP pattern | UX/Safety | Plan 02 Task 4 |

### Issue C1: Wrong deferred-item numbering

**Evidence** — `grep -n "^## [0-9]" .planning/phases/74.5.2-unified-deduct-cutover/deferred-items.md`:

```
1: build errors (gofoodSaleToChannelSale.ts) — already RESOLVED
2: Sticker auto-deduction gap
3: Shim pattern governance
4: Migration drain-loop has no test coverage  ← NOT gobiz auto-flip
5: K3Mart bundle composite flip UI             ← correct
6: Token-in-query-args pattern
```

Plan 03 Task 1 says: *"For items #4 and #5, append a Resolution subsection"* and the README §Scope item 3 says *"mark items #4 (gobiz auto-flip) and #5 (K3Mart composite) as RESOLVED"*.

Item #4 is **migration drain-loop test coverage** — an independent open issue. Marking it RESOLVED here is factually wrong, would mislead any future auditor, and **Plan 03's CHANGELOG entry repeats the error**.

**Note further**: "gobiz auto-flip" isn't *any* numbered deferred-item in that file. It's a runbook operational reminder from `docs/CHANNEL_INTEGRATION.md:246`. It cannot be retroactively numbered.

**Recommendation:**
- Plan 03 Task 1 — **only mark item #5 as RESOLVED** (K3Mart composite — correct mapping).
- For the gobiz auto-flip, either:
  - **(a)** Append a NEW item **#7 "Gobiz auto-flip post-deploy (RESOLVED same-phase by 74.5.2.1 Plan 01)"** as a self-logging provenance record, OR
  - **(b)** Document solely in `CHANNEL_INTEGRATION.md` §GoFood atomic cutover + CHANGELOG, with no deferred-items.md change.
- Recommendation **(b)** is cleaner — don't pollute the deferred-items file with a non-deferred item.
- Update README §Scope item 3 accordingly.

### Issue C2: `useChannelFlags` already exists — file-name collision

**Evidence** — `src/hooks/convex/useChannelRouting.ts:41`:

```ts
export function useChannelFlags(token: string | undefined) {
  const flags = useQuery(
    api.productInventory.channelFlags.getChannelDeductionFlags,
    token ? { token } : "skip",
  );
  const setFlag = useMutation(
    api.productInventory.channelFlags.setChannelDeductionFlag,
  );
  return { flags, setFlag };
}
```

Plan 02 Task 3 says: *"Create `src/hooks/convex/useChannelFlags.ts` (NEW — or MODIFY if the file already exists)"* and defines a new `useFlipK3MartBundle` hook there.

The existing hook `useChannelFlags` is **imported by** `ProductInventorySettings.tsx:53`:

```ts
import { useChannelFlags } from "@/hooks/convex/useChannelRouting";
```

Creating a new file `useChannelFlags.ts` beside `useChannelRouting.ts` would not literally collide (different filenames), but it **fragments the hook domain** and invites a future developer to `import { useChannelFlags } from "@/hooks/convex/useChannelFlags"` — subtly wrong.

**Recommendation:** Add `useFlipK3MartBundle` to the **existing** `src/hooks/convex/useChannelRouting.ts`, ideally extending the existing `useChannelFlags` hook:

```ts
export function useChannelFlags(token: string | undefined) {
  const flags = useQuery(api.productInventory.channelFlags.getChannelDeductionFlags, token ? { token } : "skip");
  const setFlag = useMutation(api.productInventory.channelFlags.setChannelDeductionFlag);
  const flipK3MartBundle = useMutation(api.productInventory.channelFlags.flipK3MartBundle);
  return { flags, setFlag, flipK3MartBundle };
}
```

Barrel-export index update is unchanged.

### Issue C3: `channelDeductionEnabled` is a strict object, not a record

**Evidence** — `convex/schema.ts:1057`:

```ts
channelDeductionEnabled: v.optional(v.object({
  bigseller: v.boolean(),
  consignment: v.boolean(),
  gobiz: v.boolean(),
  grabfood: v.boolean(),
  internal: v.boolean(),
  k3mart: v.boolean(),
  shopee: v.boolean(),
  tiktok: v.boolean(),
})),
```

Plan 02 Pitfall #4 says: *"`channelDeductionEnabled` is already `v.optional(v.record(v.string(), v.boolean()))` or equivalent loose-map type; no schema edit needed."*

This is factually wrong. The validator is `v.object` with the 8 keys enumerated, closed-set.

**Consequence:** Plan 02's proposed handler —

```ts
const nextFlags = {
  ...(settings.channelDeductionEnabled ?? {}),
  k3mart: args.enable,
  consignment: args.enable,
};
```

— produces `{ k3mart: …, consignment: … }` (2 keys) when `channelDeductionEnabled` is undefined on an existing settings row. Convex's `ctx.db.patch(settings._id, { channelDeductionEnabled: nextFlags })` then fails with a validation error because the other 6 keys are required.

**Recommendation:** Mirror the existing `setChannelDeductionFlag` pattern — import or co-locate `DEFAULT_FLAGS` and spread it first:

```ts
const current = settings?.channelDeductionEnabled ?? DEFAULT_FLAGS;
const nextFlags = {
  ...DEFAULT_FLAGS,
  ...current,
  k3mart: args.enable,
  consignment: args.enable,
};
```

This also fixes C5 (same issue shape in Plan 01).

### Issue C4: Plan 02 diverges from existing upsert behavior

**Evidence** — existing `setChannelDeductionFlag` in `convex/productInventory/channelFlags.ts:73-110` creates the settings row on first flip via `ctx.db.insert("productInventorySettings", { …, channelDeductionEnabled: next, … })`.

Plan 02 Task 1's `flipK3MartBundle` instead: `if (!settings) throw new Error("productInventorySettings row not found — call initializeSettings first");`

Two problems:
1. Inconsistent behavior between the two admin mutations — single-flag flips auto-create the row; composite flip requires explicit init first.
2. On a fresh prod, admins must call an internal-only mutation (`initializeSettings`) to bootstrap — but there's no admin UI exposing it. Composite flip will fail with an opaque error.

**Recommendation:** Mirror `setChannelDeductionFlag` — perform the same upsert: if no settings row, `ctx.db.insert` with defaults + the two flipped flags. Also sets `updatedBy: user.name` and `updatedAt: Date.now()` consistent with the existing pattern (Plan 02 omits both).

### Issue C5: Plan 01 flag-flip fails schema validation if sibling keys are missing

**Evidence** — Plan 01 Task 1: *"Otherwise: patch `channelDeductionEnabled: { ...existing, gobiz: true }`"*.

Same failure mode as C3. If the settings row exists but `channelDeductionEnabled` is undefined (pre-74.5.1 row), `{ ...undefined, gobiz: true }` = `{ gobiz: true }` — missing 7 keys — patch fails.

**Recommendation:** Same fix — use `{ ...DEFAULT_FLAGS, ...existing, gobiz: true }`. Export `DEFAULT_FLAGS` from `channelFlags.ts` (it's already defined there) and import in the new mutation.

### Issue C6: Silent `skipped: no-settings-row` is a safety hole

**Evidence** — Plan 01 Task 1: *"If no row exists: return `{ skipped: 'no-settings-row' }`"*.

If the `productInventorySettings` row is ever missing in prod (the Convex CLI reports success, exit 0), the CI step prints the return value to the log, the Vercel deploy proceeds, and gobiz inventory deduction is silently OFF. This is the exact failure mode the whole automation is meant to prevent.

**Recommendation:** Three options, in order of preference:
1. **(a)** Insert the settings row on-demand — same upsert pattern as `setChannelDeductionFlag`. Makes the mutation fully self-healing. (Preferred.)
2. **(b)** `throw new Error("productInventorySettings row missing — call initializeSettings first")` and let the CI step fail loudly.
3. **(c)** Return `{ skipped: … }` BUT add a CI step check on the JSON output — e.g., `jq -e '.flipped == true or .already_on == true'` — to fail if neither branch ran.

Prefer (a). Option (c) introduces JSON fragility. Option (b) works but requires a manual recovery (call `initializeSettings`) before re-running.

### Issue C7: `flipK3MartBundle` placed in wrong file

**Evidence** — `convex/productInventory/channelFlags.ts:1-14` explicitly calls out domain separation: *"kept in its own file (not `channelRouting.ts`) because the flag map lives on `productInventorySettings`"*.

Plan 02 Task 1 places the new mutation in `convex/productInventory/mutations.ts` — a grab-bag file containing `initializeSettings`, `addAdjustment`, `fulfillFromInventory`, etc. This violates the established "channel flag mutations → `channelFlags.ts`" separation.

**Recommendation:** Export `flipK3MartBundle` from `convex/productInventory/channelFlags.ts` next to `setChannelDeductionFlag`. Same file, same `DEFAULT_FLAGS` import, same `requireRole` import. Shorter diff, cleaner grep, matches stated design intent.

Same reasoning applies to **Plan 01** — `ensureGobizChannelDeductionOn` belongs in `channelFlags.ts` (it's an internal flag-flip), not a new `startupMigrations.ts` file. The name "startupMigrations" is misleading: this is a post-deploy idempotent flag-setter, not a schema migration.

### Issue C8: No destructive confirmation on composite toggle

**Evidence** — `ProductInventorySettings.tsx:127-164` — every single-flag flip shows an AlertDialog requiring the admin to type `FLIP` verbatim before the mutation runs. This gate applies even to *turning a flag OFF* during rollback.

Plan 02's composite toggle flips **two flags at once**, with higher blast radius, and has zero confirmation — just `const handleClick = async () => { await flip({ enable: !bothOn, token: user!.token }); toast.success(...) }`.

**Recommendation:** Reuse the existing AlertDialog pattern. Confirmation text can be `FLIP` (reuses existing copy + state plumbing) or `K3MART` (more specific). Minimum: require a destructive-action confirm — don't ship a one-click bomb.

---

## 3. Improvements (Recommended)

| # | Improvement | Impact | Effort |
|---|-------------|--------|--------|
| I1 | Name Plan 01's file descriptively, not "startupMigrations" | Medium | Low |
| I2 | Specify test strategy concretely (direct-handler shim vs t.mutation) | Medium | Low |
| I3 | Comment in both mutation + workflow: "remove when D74.5.2-L8 retires `channelDeductionEnabled`" | Medium | Low |
| I4 | Plan 02 composite UI should reuse `ChannelFlagRow` or structured card primitives | Low | Low |
| I5 | Plan 01 should include a CHANGELOG entry — not just Plan 03 | Medium | Low |
| I6 | Add a smoke test: post-flip, query `getChannelDeductionFlags` and assert shape | Medium | Low |

### Improvement I1: File naming

Plan 01 creates `convex/productInventory/startupMigrations.ts`. The word "migrations" implies data reshaping or schema evolution; this is neither — it's an idempotent flag-flip. Future developers will look in migrations directories and not find it.

**Recommendation:** Don't create a new file. Add `ensureGobizChannelDeductionOn` as an `internalMutation` export in `convex/productInventory/channelFlags.ts`. Directly beside the existing `setChannelDeductionFlag` + `DEFAULT_FLAGS`. Saves ~20 LOC and one import line.

If a separate file is mandatory (orchestration preference), name it `deployHooks.ts` or `postDeployFlipGobiz.ts` — something describing the purpose, not a false category ("migrations").

### Improvement I2: Test strategy — concrete, not conditional

Plans 01 and 02 both say *"use the D74.5.2-L1 direct-handler shim pattern if module resolution needs it"*. Given the phase's own precedent (4 files already use the shim; `channelSale.test.ts` works without it only because of layer structure), the ambiguity wastes executor time.

**Recommendation:** Commit explicitly:
- **Plan 01:** `internalMutation` → export `_ensureGobizChannelDeductionOnForTest` direct-handler shim (matches D74.5.2-L1 precedent).
- **Plan 02:** Public `mutation` → try `t.mutation(api.productInventory.channelFlags.flipK3MartBundle, ...)` FIRST (public mutations usually resolve); fall back to shim only if needed.

### Improvement I3: Document the `channelDeductionEnabled` retirement path

Per `docs/CHANNEL_INTEGRATION.md:410`, `channelDeductionEnabled` is scheduled for removal in 74.5.3+ "after 72h GoFood soak". Plan 01 adds a CI step that depends on this field permanently.

**Recommendation:** Add a one-line comment to both the new mutation and the CI step:

```ts
// TODO(74.5.3+): remove this mutation + the deploy.yml step when
// `channelDeductionEnabled` field is dropped per D74.5.2-L8.
```

Also append a bullet to deferred-items.md note #8 or similar: "When `channelDeductionEnabled` is dropped, also remove `ensureGobizChannelDeductionOn` + deploy.yml post-step."

### Improvement I4: Composite UI should use existing primitives

Plan 02 Task 4's sketch builds a new Card + Button + out-of-sync pill from raw components. The existing `ChannelFlagRow` component (`src/components/channelIntegration/ChannelFlagRow.tsx`) encapsulates toggle + status copy. Depending on `ChannelFlagRow`'s API, either extend it with a `mode: "composite"` variant, or at minimum adopt the same visual language (FlagState typing, status pill colors).

### Improvement I5: CHANGELOG entry source

Plan 01 owns real behavior changes (flag auto-flip) but delegates its CHANGELOG line to Plan 03. If Plan 03 fails or slips, Plan 01's prod behavior changes without a CHANGELOG record. CLAUDE.md says CHANGELOG is "ALWAYS required after merging".

**Recommendation:** Move the CHANGELOG entry to be written alongside Plan 01/02 merges directly, not as a Plan-03-dependent step. Plan 03 then only updates the CHANGELOG if follow-up doc/roadmap consolidation is needed.

### Improvement I6: Smoke test the flag flip

Neither plan includes an assertion that post-mutation, the flag map is **readable and well-formed via the public query**. Given C3/C5 are subtle schema-validation bugs, a test that round-trips through `getChannelDeductionFlags` would catch them:

```ts
test("post-flip: getChannelDeductionFlags returns full 8-key object", async () => {
  // ...flip...
  const flags = await t.query(api.productInventory.channelFlags.getChannelDeductionFlags, { token: adminToken });
  expect(Object.keys(flags).sort()).toEqual(
    ["bigseller", "consignment", "gobiz", "grabfood", "internal", "k3mart", "shopee", "tiktok"]
  );
  expect(flags.gobiz).toBe(true);
});
```

---

## 4. Refinements (Minor Suggestions)

- Plan 03 §Task 4 roadmap entry uses literal `2026-04-{DD}` placeholder. Automate via commit-time sed or checklist item rather than trusting the executor to remember.
- Plan 03's K3Mart runbook replacement (CHANNEL_INTEGRATION.md:208) should quote/link the button label used in the UI (verbatim string match with `ProductInventorySettings.tsx`). Avoids drift if UI copy changes.
- Plan 02 `useFlipK3MartBundle` return type annotation `as (...) => Promise<...>` fights TypeScript rather than leveraging generated `api` types. Prefer `useMutation(api.productInventory.channelFlags.flipK3MartBundle)` and let inference work.
- All three plans omit the `triple-review` step per CLAUDE.md feedback (`feedback_triple_review_mandatory.md` — "NEVER skip triple-review"). Add to README Wave 3.

---

## 5. Duplication Analysis

### Existing Code to Leverage

| Existing Code | Location | How to Use |
|---------------|----------|------------|
| `DEFAULT_FLAGS` 8-key constant | `convex/productInventory/channelFlags.ts:29` | Import in both new mutations; spread first in flag objects |
| `setChannelDeductionFlag` upsert pattern | `convex/productInventory/channelFlags.ts:73` | Template for both `ensureGobizChannelDeductionOn` and `flipK3MartBundle` — same insert-if-missing behavior |
| `useChannelFlags(token)` React hook | `src/hooks/convex/useChannelRouting.ts:41` | Extend return with `flipK3MartBundle` — don't create a new hook file |
| `ChannelFlagRow` component + `FlagState` type | `src/components/channelIntegration/ChannelFlagRow.tsx` | Reuse for composite toggle visual consistency |
| `AlertDialog` + "type FLIP" destructive-confirm UX | `ProductInventorySettings.tsx:127-164` | Wrap composite click the same way |
| `requireRole(ctx, token, ["admin"])` | `convex/lib/auth.ts:128` | Use verbatim in both mutations (already planned) |
| `initializeSettings` internalMutation | `convex/productInventory/mutations.ts:181` | Reference for upsert defaults; do not *require* as precondition |
| Direct-handler shim pattern (D74.5.2-L1) | `channelAudit.ts`, `backfill.ts`, `gofoodSaleToChannelSale.ts`, `consignment/queries.ts` | Template for test shims; don't reinvent |

### Potential Duplication Risks

- **`useChannelFlags.ts` (Plan 02 Task 3)** would duplicate `useChannelFlags` exported from `useChannelRouting.ts`. Confirmed collision by `grep`.
- **`startupMigrations.ts` (Plan 01 Task 1)** replicates `DEFAULT_FLAGS` + upsert shape already in `channelFlags.ts`.

---

## 6. Phase/Wave Accuracy

| Plan | Assessment | Notes |
|------|------------|-------|
| README §Scope | ⚠ Item numbering wrong (see C1); scope boundaries otherwise crisp | Plan correctly defers sticker-BOM to 74.5.3 |
| Plan 01 | ⚠ Schema-validation bug (C5), safety hole (C6), wrong file (C7) | Three small corrections, same file — ~30min fix |
| Plan 02 | ❌ Wrong schema claim (C3), wrong target file (C7), hook collision (C2), diverges from existing upsert (C4), no destructive-confirm (C8) | Needs significant rework before execution |
| Plan 03 | ❌ Wrong deferred-item numbers (C1) — primary output is factually incorrect | Needs rework |

**Ordering assessment:** Wave 1 parallel (Plans 01 + 02) + Wave 2 sequential (Plan 03) is correct. Plan 03 depends on the SHAs of Plans 01/02 merging first.

**Missing phase:** none — the 3-plan structure is right.

---

## 7. Specialist Agent Recommendations

| Plan | Recommended Agent | Rationale |
|------|-------------------|-----------|
| Plan 01 mutation + tests | `convex-backend` | Single-file Convex work with shim tests |
| Plan 01 workflow YAML | `cto-orchestrator` (brief) or inline by operator | `.github/workflows/deploy.yml` isn't in convex-backend's typical path |
| Plan 02 backend | `convex-backend` | Mutation + test shim |
| Plan 02 frontend | `react-ui-builder` | UI card + composite toggle + destructive-confirm reuse |
| Plan 03 | `cto-orchestrator` (docs coordinator) | Multi-file doc updates; atomic commit sequencing |

**Wave 3 gates (already listed in additions above):** `code-auditor`, `Bash` (npm run build + test), `triple-review`.

---

## 8. Git Workflow Assessment

### Branch Strategy
| Assessment | Status |
|------------|--------|
| Feature branch specified | ❌ No (added to README above: `feature/74.5.2.1-ops-automation`) |
| Branch naming convention | ⚠ Implicit — add to README |
| Merge strategy documented | ❌ No — add "PR to main after triple-review" |

### Commit Strategy
| Phase | Expected Commits | Commit Type | Notes |
|-------|------------------|-------------|-------|
| Plan 01 | 1 atomic | `feat(74.5.2.1): auto-enable gobiz channel deduction post-deploy` | Mutation + tests + workflow in one commit — OK |
| Plan 02 | 1–2 atomic | `feat(74.5.2.1): K3Mart composite flag toggle` (+ optional `test(...)` split) | Backend + hook + UI in one commit is fine |
| Plan 03 | 1 atomic | `docs(74.5.2.1): close deferred items + runbook` | SHAs filled from Plans 01/02 |

### Recommended Commit Checkpoints
1. After Plan 01 merges → `feat(74.5.2.1): auto-enable gobiz channel deduction post-deploy`
2. After Plan 02 merges → `feat(74.5.2.1): K3Mart composite flag toggle`
3. After Plan 03 merges → `docs(74.5.2.1): close deferred items + runbook + changelog`

### Pre-Push Verification
- [ ] Plan includes `npm run build` check — ✅ all 3 plans
- [ ] Plan includes `npm run type-check` verification — ✅ all 3 plans
- [ ] Plan includes local testing before push — ✅ Plans 01/02 (`npm test -- --run ...`)

### CI/CD Considerations
| Concern | Assessment |
|---------|------------|
| Rollback strategy | ✅ Plan 01 § Rollback, Plan 02 § Rollback — both documented |
| Deployment order | ✅ deploy-convex before trigger-vercel (correct) — but plan conflates "jobs" with "steps"; see C11 below |
| Data backup needed | No — idempotent flag patches only |
| Migration safety | ✅ No schema change |

### Git Workflow Issues Found

- **G1:** Plan 01 says *"Add a new step AFTER the existing Convex deploy step, BEFORE the Vercel deploy step"* — but `.github/workflows/deploy.yml` uses **separate jobs** `deploy-convex` and `trigger-vercel`, not steps-within-one-job. Clarify: the new step goes INSIDE the `deploy-convex` job (after the "Deploy to Convex Production" step); Vercel triggering is automatically gated by `needs: [... deploy-convex]`. The step-failure path (flag-flip fails → deploy-convex fails → trigger-vercel skipped) is the correct safety behavior.
- **G2:** Plan 01 doesn't specify whether this step should run on `workflow_dispatch` with `deploy_convex=false`. Since `deploy-convex` is gated `if: needs.check-convex-changes.outputs.convex_changed == 'true'`, the new step inside that job is implicitly gated the same way. That's fine — if Convex didn't deploy, no flag state can change — but call this out in the plan.
- **G3:** No plans list a branch-creation instruction (e.g., `git switch main && git pull && git switch -c feature/74.5.2.1-ops-automation`). CLAUDE.md is explicit: "Branch from main before starting a new phase." Add to README.

---

## 9. Documentation Checkpoints

| Phase | Documentation Update Required |
|-------|-------------------------------|
| Plan 01 | Inline TODO comment re: D74.5.2-L8 retirement; one CHANGELOG line |
| Plan 02 | Inline TODO comment if applicable; one CHANGELOG line |
| Plan 03 | Owns full docs sweep — CHANNEL_INTEGRATION.md, deferred-items.md, CHANGELOG.md, ROADMAP.md |

### CHANGELOG.md Entry (Draft)

```markdown
## 2026-04-{DD} — Phase 74.5.2.1 (Ops Automation)

**Closes 74.5.2 operational follow-ups (auto-flip + K3Mart composite UI).**

### Added
- `ensureGobizChannelDeductionOn` internal mutation (`convex/productInventory/channelFlags.ts`) — idempotent post-deploy flag-flip; inserts the `productInventorySettings` row on-demand if missing.
- `.github/workflows/deploy.yml` post-Convex-deploy step invoking the mutation via `npx convex run`. Eliminates the manual ops ritual from the 74.5.2 runbook.
- `flipK3MartBundle` admin mutation (`convex/productInventory/channelFlags.ts`) — atomic two-flag patch satisfying D74.5.2-L14.
- K3Mart bundle composite toggle on `/admin/product-inventory-settings` with out-of-sync detection and destructive-confirm (type `FLIP`).

### Changed
- Runbook (`docs/CHANNEL_INTEGRATION.md`) §GoFood atomic cutover + §K3Mart bundle flip — manual procedures replaced by automation references.
- Deferred item #5 from Phase 74.5.2 marked RESOLVED (K3Mart composite UI shipped).

### Notes
- `channelDeductionEnabled` field retirement (D74.5.2-L8) will require removing `ensureGobizChannelDeductionOn` + the deploy-workflow step. Flag file and both code sites carry TODO markers.
```

---

## 10. Testing Plan Assessment

**Overall Testing Verdict:** **Insufficient** — coverage is planned for new code but misses round-trip validation and the destructive-confirm path.

### Planned Tests
| Layer | What's Tested | Test Type | Status |
|-------|---------------|-----------|--------|
| Backend (Plan 01) | `ensureGobiz*` idempotency, no-settings-row, siblings preserved | convex-test (direct-handler shim) | ⚠ Planned but missing 8-key output shape assertion |
| Backend (Plan 02) | `flipK3MartBundle` flip-on, flip-off, auth-reject, siblings preserved | convex-test | ⚠ Planned, but missing no-settings-row case after C4 fix |
| Frontend (Plan 02) | K3Mart composite UI rendering | — | ❌ Missing |
| Integration | End-to-end CI invocation | — | ❌ Missing (can only test on a real deploy) |

### Missing Test Coverage (Must Add)

| # | Missing Test | Why It Matters | Suggested Approach |
|---|--------------|----------------|-------------------|
| M1 | Post-flip: `getChannelDeductionFlags` returns full 8-key object | C3/C5 bugs fail silently without round-trip | See I6 code sketch |
| M2 | Plan 02: no-settings-row → upsert succeeds (after C4 fix) | Fresh prod path |  Seed empty DB, flip, assert row exists with `{ ...DEFAULT_FLAGS, k3mart: true, consignment: true }` |
| M3 | Plan 02: React component test for destructive-confirm flow | C8 regression guard | RTL: render `ProductInventorySettings`, click composite, assert AlertDialog appears, type `FLIP`, assert mutation called |
| M4 | Plan 02: "out-of-sync" state renders when `k3mart=true, consignment=false` | UX claim in Plan 02 Task 4 | RTL with mocked `useQuery` returning asymmetric flags |
| M5 | Plan 01: workflow syntax check | Catches YAML indentation / secret-name typos pre-merge | Run `actionlint .github/workflows/deploy.yml` in CI |

### Test Execution Checkpoints

1. After Plan 01 backend: `npm test -- --run convex/productInventory/__tests__/` (all existing + new backend tests PASS)
2. After Plan 02 backend: same
3. After Plan 02 frontend: `npm test -- --run src/pages/` + `npm run build`
4. Before merge: full `npm run test && npm run build` + triple-review + (optional) `actionlint`

### Regression Risk

- Existing `setChannelDeductionFlag` tests should still pass — new mutation doesn't touch its code path.
- Existing `ProductInventorySettings.tsx` single-flag flip flow must remain functional — RTL smoke test recommended.
- Any downstream consumer of `channelDeductionEnabled` (e.g., `processChannelSaleInternal` gate) — no API change, just two flags flipping together. Confirm by code audit.

---

## 11. Edge Cases to Address

The plans should explicitly handle:

- [ ] `productInventorySettings` row missing entirely (Plan 01 C6; Plan 02 C4)
- [ ] `channelDeductionEnabled` undefined on existing settings row (C3/C5)
- [ ] Flag already `true` → idempotent no-op with explicit return shape (Plan 01 covers this)
- [ ] Composite flip when flags currently out-of-sync (one ON, one OFF) — both flags should end up as `enable`
- [ ] Concurrent admin clicks on composite button — Convex mutation is transactional; second click runs after first; idempotent outcome
- [ ] CI step retries on transient Convex errors — currently single-shot; network blip could fail deploy. Consider `--retry 2` if `npx convex run` supports it, or wrap in a bash retry loop.
- [ ] Composite toggle while another admin has `setChannelDeductionFlag` in flight — last-writer-wins on the patch; acceptable but note in UI-SPEC

---

## 12. Approval Conditions

**For Approval, address:**

1. **C1** — Fix Plan 03 deferred-item numbering (only item #5 is K3Mart-related; gobiz isn't in that file)
2. **C2** — Extend existing `useChannelFlags` hook; do not create a new file
3. **C3 + C5** — Use `DEFAULT_FLAGS`-first spread pattern in both new mutations
4. **C4 + C6** — Upsert settings row on-demand (mirror existing `setChannelDeductionFlag`)
5. **C7** — Place both new mutations in `convex/productInventory/channelFlags.ts`
6. **C8** — Wire composite toggle through the existing destructive-confirm AlertDialog

**Strongly recommended before implementation:**

7. **I1** — Drop the "startupMigrations" filename; co-locate in `channelFlags.ts`
8. **I2** — Commit to direct-handler shim pattern for Plan 01 tests (don't leave "if needed")
9. **I3** — TODO markers referencing D74.5.2-L8 retirement
10. **Plan structure additions above** — Git Workflow + Waves + Docs sections in README

**Minor (at implementer discretion):** Refinements §4, Improvements I4–I6, plus `actionlint` for deploy.yml (M5).

---

*Generated by /staffreview skill*
*Staff Developer Review + Principal Developer Review*
