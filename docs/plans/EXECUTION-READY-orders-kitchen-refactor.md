# 🚀 EXECUTION-READY PLAN: Orders & Kitchen Refactor

**Status:** ✅ APPROVED BY CTO - AUTO-EXECUTE
**Approval Date:** 2026-02-02
**CTO Confidence:** 10/10
**Autonomy Level:** FULL (including architectural decisions)

---

## 📋 CTO Directives (Binding)

### Decision Authority
- ✅ **Full autonomy** on all decisions (including architectural)
- ✅ Auto-fix bugs found during refactor (even if out of scope)
- ✅ Auto-split functions >400 lines
- ✅ Must maintain decision log (see template below)

### Rollback Policy
- ✅ **Auto-revert** for quality gate failures (no approval needed)
- ✅ **Auto-revert** for performance regressions
- ⚠️ **STOP & NOTIFY CTO** only if: Rollback itself fails (emergency)

### Execution Strategy
- 🔄 **SERIALIZED** execution (Phase 2 → Phase 3, not parallel)
  - Reason: Both touch `queries.ts`, avoid merge conflicts
  - Timeline: +1 week (4 weeks → 5 weeks total)

### OLD System Handling
- 🗑️ **COMPLETE REMOVAL** (not deprecation)
  - Remove `ballsRemaining` field from schema entirely
  - This is incorrect schema, not legacy - early enough to remove cleanly
  - No backward compatibility needed

### Quality Standards
- 🧪 **Pragmatic TDD**: Test-after for refactors, test-first for logic
- 🎯 **High-quality tests** > weak coverage chasing
- 🐛 **Zero critical bugs** required
- 📝 **Document unfixed bugs** found during refactor

### Manual Gates
- ⏭️ **Skip manual tests** if CTO unresponsive (flag in final report)

### Timeline
- 🎯 **Target** (not deadline): Quality over speed
- 🧠 **Context Management**: Clean context before start, maintain focus

### Documentation Requirements
- 📚 **Onboarding guide** must be created (Task 4.7 added)
- 📝 **Update CLAUDE.md** with new patterns
- 🗂️ **Document all architectural decisions** in decision log

---

## 📊 Revised Timeline (Serialized Execution)

```
Week 1-2: Phase 1 (Data Consistency) - BLOCKING
Week 2-3: Phase 2 (Query Optimization) - BLOCKING
Week 3-4: Phase 3 (Frontend & Mutations Split) - BLOCKING
Week 4-5: Phase 4 (Polish & Complete Removal)

Total: 5 weeks (was 4 weeks with parallel execution)
Trade-off: Safer execution, no merge conflicts
```

---

## 📝 Agent Decision Log Template

All agents must maintain this log during execution:

```markdown
# Decision Log: [Phase Name]
**Agent:** [agent-name]
**Date Range:** [start] - [end]

## Architectural Decisions

### Decision 1: [Title]
**Context:** [Why decision was needed]
**Options Considered:**
1. Option A - [pros/cons]
2. Option B - [pros/cons]

**Decision:** [Chosen option]
**Rationale:** [Why this option]
**Impact:** [Files changed, patterns introduced]
**Trade-offs:** [What we gave up]

---

### Decision 2: [Title]
...

## Out-of-Scope Changes

### Bug Fix 1: [Title]
**Found:** [Where/when discovered]
**Severity:** [Critical/High/Medium/Low]
**Root Cause:** [Brief analysis]
**Fix Applied:** [What was changed]
**Why Out of Scope:** [Explanation]
**Files Modified:** [List]

---

## Function Splits

### Split 1: [Function name]
**Original:** [File:line, length]
**Reason for Split:** [>400 lines / SRP violation / complexity]
**Split Into:**
1. [new_function_1] - [responsibility]
2. [new_function_2] - [responsibility]
**Location:** [new files created]

---

## Bugs Found But Not Fixed

### Bug 1: [Title]
**Location:** [File:line]
**Severity:** [Critical/High/Medium/Low]
**Description:** [What's wrong]
**Why Not Fixed:** [Out of scope / needs separate investigation / low impact]
**Recommendation:** [Create issue / fix in Phase X / ignore]

---

## Key Metrics
- Functions split: X
- Bugs fixed: Y
- Bugs documented: Z
- Architectural decisions: N
- Lines of code changed: M
```

**Storage:** `docs/decisions/phase-[N]-decision-log.md`

---

## 🗑️ Phase 4 UPDATE: Complete OLD System Removal

### Task 4.5 REVISED: Remove OLD System Entirely (Agent: convex-backend - 4 hours)

**ORIGINAL TASK:** "Deprecate OLD system (keep field, mark @deprecated)"
**REVISED TASK:** "Remove OLD system completely (delete field, clean all references)"

**Agent Prompt:**
```
COMPLETE REMOVAL of OLD ballsRemaining system.

CTO Directive: This is incorrect schema, not legacy. Remove entirely.

1. Read: convex/schema.ts
2. **DELETE** ballsRemaining field from orderItems table:
   - Remove: ballsRemaining: v.optional(v.number())
3. Search for ALL references:
   grep -r "ballsRemaining" convex/
   grep -r "ballsRemaining" src/
4. Remove/replace ALL occurrences:
   - In mutations: Remove dual-write logic
   - In queries: Remove OLD system reads
   - In helpers: Remove OLD system calculations
   - In frontend: Replace with NEW system (ballsFilled)
5. Update all TypeScript types (remove field from interfaces)
6. Test: npm run type-check (should fail if any references remain)
7. Fix all type errors (no more ballsRemaining references)
8. Test: npm run build && npm test
9. Commit: "refactor(orders): remove OLD ballsRemaining system entirely"
10. Document in decision log:
    - Why removed instead of deprecated
    - Files modified (list all)
    - Breaking changes (should be none - internal only)
```

**Files Modified (Estimated):**
- `convex/schema.ts` (remove field)
- `convex/orders/mutations.ts` (remove dual-write)
- `convex/orders/helpers/ballDistribution.ts` (remove OLD system logic)
- `convex/orders/queries.ts` (remove OLD system reads)
- `src/pages/KitchenView.tsx` (use ballsFilled only)
- `src/components/orders/*.tsx` (update any references)

**Quality Gate:** ✅ Zero references to `ballsRemaining` in codebase, build passes

**NO 5-DAY MONITORING NEEDED** - Just remove it cleanly.

---

## 📚 Task 4.7 NEW: Create Onboarding Guide (Agent: convex-backend - 1 day)

**Added per CTO directive Q15**

**Agent Prompt:**
```
Create comprehensive onboarding guide for new developers post-refactor.

1. Create: docs/ONBOARDING.md
2. Document new patterns:
   - Two-tier helper system (PURE vs CTX-DEPENDENT)
   - Mutations organized by domain (orderCrud, itemCrud, kitchen, etc.)
   - Batch fetching pattern (avoid N+1)
   - Type safety requirements (no Record<string, unknown>)
   - Test patterns (Vitest + convex-test)
   - Mobile responsive requirements (280px minimum)
3. Add "Adding a New Feature" workflow:
   - Where to add new mutation? (which file?)
   - How to write tests first?
   - How to maintain quality gates?
4. Update CLAUDE.md:
   - Add link to ONBOARDING.md
   - Update "Quick File Finder" with new mutation structure
   - Add "Post-Refactor Patterns" section
5. Update docs/CODE_STYLE.md:
   - Add "Mutations Organization" section
   - Document batch fetching pattern
   - Add "When to Create New Helper" decision tree
6. Commit: "docs: add onboarding guide for post-refactor patterns"
```

**Files Created:**
- `docs/ONBOARDING.md` (new comprehensive guide)

**Files Updated:**
- `CLAUDE.md` (add links and patterns)
- `docs/CODE_STYLE.md` (document new patterns)

**Quality Gate:** ✅ New developer can read guide and understand where to add code

---

## 🔄 Phase Execution Order (UPDATED - Serialized)

```
Pre-Flight (30 min)
    ↓
Phase 1 (Week 1-2) - Data Consistency
    ↓ [BLOCKING - must complete before Phase 2]
Phase 2 (Week 2-3) - Query Optimization
    ↓ [BLOCKING - must complete before Phase 3]
Phase 3 (Week 3-4) - Frontend & Mutations Split
    ↓ [BLOCKING - must complete before Phase 4]
Phase 4 (Week 4-5) - Polish & Complete Removal
    ↓
Task 4.7 (NEW) - Onboarding Guide
    ↓
Completion & Deployment
```

**Why Serialized:**
- Phase 2 refactors `queries.ts` (extract helpers, fix N+1)
- Phase 3 updates `queries.ts` imports (new mutations structure)
- Running parallel = guaranteed merge conflict
- Serialized = clean handoff, no conflicts

**Timeline Impact:** +1 week (4 weeks → 5 weeks)
**CTO Approved:** Quality over speed ✅

---

## 🧠 Context Management Protocol

**Per CTO Directive Q9-Q10: "Clean context before start, but keep focus and 'why'"**

### Before Starting Phase 1

```markdown
## Context Refresh Checklist

### Clear from Context (Don't Need):
- [ ] Unrelated codebase features (ingredients, recipes, products)
- [ ] Marketing/business discussions
- [ ] Previous unrelated debugging sessions
- [ ] Old implementation plans (pre-review versions)

### Keep in Context (Critical):
- [ ] CLAUDE.md (project overview, patterns)
- [ ] CODE_STYLE.md (two-tier helpers, conventions)
- [ ] SCHEMA.md (database structure, relationships)
- [ ] This execution plan (EXECUTION-READY-orders-kitchen-refactor.md)
- [ ] Staff review findings (helper architecture, schema gaps)
- [ ] Principal review findings (N+1 queries, scalability)
- [ ] CTO directives (this document)

### Focus Statement (The "Why"):
"We're refactoring Orders & Kitchen to eliminate technical debt that causes:
- Slow kitchen page loads (2.3s → <1s target)
- Data inconsistency (OLD vs NEW system drift)
- Unmaintainable code (1783-line mutations file)
- Poor query performance (N+1 patterns, 6-12 queries per request)

Goal: Fast, consistent, maintainable system with >80% test coverage."

### Execution Mode:
- Full autonomy (including architectural decisions)
- Auto-fix bugs found during refactor
- Document all decisions in decision log
- Pragmatic TDD (high-quality tests over coverage chasing)
- Quality over speed (5-week target, not deadline)
```

**Agent Reminder:** At start of each phase, re-read this context checklist.

---

## 🚨 Emergency Contact Protocol (UPDATED)

### Scenario C: Rollback Itself Fails

**When to Trigger:**
- Automated rollback command returns error
- Git revert fails due to conflicts
- Convex deploy fails during rollback
- Database state uncertain after rollback attempt

**Emergency Actions:**
1. **STOP ALL EXECUTION** immediately
2. **DO NOT attempt manual fix** (risk making worse)
3. **Create emergency report:**
   ```
   File: docs/reports/EMERGENCY-rollback-failure-[timestamp].md

   ## EMERGENCY: Rollback Failed

   **Phase:** [phase number]
   **Task:** [task ID]
   **Time:** [timestamp]
   **Last Successful Commit:** [hash]
   **Failed Rollback Command:** [exact command]
   **Error Message:** [full error]
   **Database State:** [uncertain/known-bad/unknown]
   **Current Branch:** [branch name]

   ## Immediate Actions Needed
   1. [Manual git recovery steps]
   2. [Database backup restore steps]
   3. [Convex deploy recovery steps]

   ## Contact
   **CTO:** [contact info]
   **Status:** ⚠️ BLOCKED - MANUAL INTERVENTION REQUIRED
   ```
4. **Notify CTO** via emergency protocol
5. **Wait for manual intervention** (do not proceed)

**All Other Scenarios:** Auto-revert without CTO notification (log in reports)

---

## 📊 Updated Success Metrics

### Phase 1 (Unchanged)
- ✅ Schema documented
- ✅ ≥99% data match (backfill)
- ✅ >80% test coverage (ball distribution)
- ✅ No performance regression

### Phase 2 (Updated)
- ✅ ≥50% query time reduction
- ✅ <3 DB queries per request
- ✅ >90% test coverage (helpers)
- ✅ Decision log complete

### Phase 3 (Updated)
- ✅ mutations.ts split (<400 lines per file)
- ✅ Zero `Record<string, unknown>` types
- ✅ Mobile responsive (280px) OR flagged in report if CTO unresponsive
- ✅ >70% frontend test coverage
- ✅ Decision log complete

### Phase 4 (Updated)
- ✅ OLD system **REMOVED** (not deprecated)
- ✅ Zero references to `ballsRemaining` in codebase
- ✅ WhatsApp templates consolidated
- ✅ Missing indexes added
- ✅ >80% overall test coverage
- ✅ **Onboarding guide created** (NEW)
- ✅ CLAUDE.md updated with new patterns (NEW)
- ✅ Zero critical bugs
- ✅ Bugs documented in decision log

### Completion Criteria
- ✅ All 4 phases complete
- ✅ Kitchen load time <1s (server-side)
- ✅ 4 decision logs published
- ✅ Onboarding guide complete
- ✅ All documentation updated
- ✅ Zero critical bugs (minor bugs documented)

---

## 📝 Documentation Updates Required

### CLAUDE.md Updates (Task 4.7)

**Add New Section:**
```markdown
## Post-Refactor Patterns (2026-02-02)

### Mutations Organization
Orders mutations are now organized by domain:
- `convex/orders/mutations/orderCrud.ts` - Order CRUD (create, update, remove, cancel)
- `convex/orders/mutations/itemCrud.ts` - Item management (add, remove, update)
- `convex/orders/mutations/kitchen.ts` - Kitchen operations (balls, tray, fill)
- `convex/orders/mutations/packaging.ts` - Packaging operations (pack, complete)
- `convex/orders/mutations/migrations.ts` - Data migrations

**Import pattern:**
```typescript
// ✅ Correct (specific import)
import { create } from "convex/orders/mutations/orderCrud";

// ⚠️ Deprecated (backward compatibility, will be removed)
import { create } from "convex/orders/mutations";
```

**Adding new mutation?** See [ONBOARDING.md](docs/ONBOARDING.md#adding-a-new-mutation)

### Helper System (Two-Tier)
- **Pure helpers** (no ctx): `convex/orders/helpers.ts`
  - Example: `calculateBallsNeeded()`, `calculateLineTotals()`
  - Unit testable, no database access
- **Ctx-dependent helpers** (needs db): `convex/orders/helpers/*.ts`
  - Example: `distributeBallsToOrders()`, `fetchOrdersByStatuses()`
  - Integration tested, requires Convex context

**Adding new helper?** See [CODE_STYLE.md](docs/CODE_STYLE.md#helper-functions)

### Batch Fetching Pattern
Avoid N+1 queries by fetching all data once, grouping in memory:

```typescript
// ❌ N+1 Anti-pattern
for (const order of orders) {
  const items = await ctx.db.query("orderItems")
    .withIndex("by_order", q => q.eq("orderId", order._id))
    .collect(); // N queries
}

// ✅ Batch fetch
const allItems = await ctx.db.query("orderItems").collect(); // 1 query
const itemsByOrder = groupBy(allItems, 'orderId'); // Group in memory
```

See: `convex/orders/helpers/batchFetching.ts`
```

### CODE_STYLE.md Updates (Task 4.7)

**Add Section:**
```markdown
### When to Create a New Helper

**Decision Tree:**

```
Need to extract logic?
    ↓
Does it need ctx.db access?
    ├─ NO → Add to helpers.ts (PURE)
    │   └─ Example: calculateBallsNeeded()
    └─ YES → Add to helpers/*.ts (CTX)
        └─ Example: distributeBallsToOrders()
            ↓
        Which domain?
            ├─ Ball distribution → helpers/ballDistribution.ts
            ├─ Status transitions → helpers/statusTransitions.ts
            ├─ Usage tracking → helpers/usageTracking.ts
            ├─ Batch fetching → helpers/batchFetching.ts
            └─ New domain? → Create new file + export from helpers/index.ts
```

**Mutation Organization:**

```
Adding new mutation?
    ↓
Which domain?
    ├─ Order CRUD (create, update, delete, cancel)
    │   └─ Go to: convex/orders/mutations/orderCrud.ts
    ├─ Item management (add, remove, update quantity)
    │   └─ Go to: convex/orders/mutations/itemCrud.ts
    ├─ Kitchen operations (balls, tray, distribution)
    │   └─ Go to: convex/orders/mutations/kitchen.ts
    ├─ Packaging (pack, unpack, complete)
    │   └─ Go to: convex/orders/mutations/packaging.ts
    └─ Data migrations (backfill, schema changes)
        └─ Go to: convex/orders/mutations/migrations.ts
```

If file exceeds 400 lines, split by sub-domain.
```

---

## ✅ Final Approval Confirmation

**CTO Approval Status:** ✅ APPROVED (10/10 confidence)

**Confirmed Directives:**
- ✅ Full autonomy (including architectural decisions)
- ✅ Auto-revert on failures (except rollback failure)
- ✅ Serialized execution (Phase 2 → Phase 3)
- ✅ Complete OLD system removal (not deprecation)
- ✅ Pragmatic TDD (quality over coverage)
- ✅ Skip manual gates if unresponsive (flag in report)
- ✅ Quality over speed (5-week target)
- ✅ Full-time focus (no interruptions)
- ✅ Create onboarding guide
- ✅ Zero critical bugs required

**Execution Start:**
```bash
# Agent receives this plan and begins Pre-Flight immediately
# No further human approval required unless rollback fails (Scenario C)
```

---

## 📅 Next Steps for Agent Execution

### Immediate Actions (Next 30 Minutes)

1. **Read this entire plan** (EXECUTION-READY-orders-kitchen-refactor.md)
2. **Clean context** per protocol above
3. **Read supporting docs:**
   - CLAUDE.md (project overview)
   - CODE_STYLE.md (two-tier helpers)
   - SCHEMA.md (database structure)
4. **Initialize decision log:** Create `docs/decisions/phase-1-decision-log.md`
5. **Start Pre-Flight:** Run verification queries

### Pre-Flight Execution (Automated)

See original plan (FINAL-IMPLEMENTATION-PLAN) for Pre-Flight tasks:
- PF.1: Data drift verification
- PF.2: Baseline metrics
- PF.3: Create branches
- PF.4: Backup database

### Phase 1 Kickoff (After Pre-Flight Passes)

Start Task 1.1 (schema documentation) immediately.

**Timeline:**
- Week 1-2: Phase 1
- Week 2-3: Phase 2
- Week 3-4: Phase 3
- Week 4-5: Phase 4
- Completion: Deploy, documentation, handoff

---

## 📊 Tracking & Reporting

### Daily Reports (Auto-Generated)
- `docs/reports/daily-progress-2026-02-0X.md`
- Contains: Tasks completed, gates passed, decisions made, blockers

### Phase Completion Reports
- `docs/reports/phase-[N]-completion-2026-02-0X.md`
- Contains: Full decision log, metrics, next phase readiness

### Final Report
- `docs/reports/FINAL-refactor-completion-2026-02-0X.md`
- Contains: All metrics, all decisions, all bugs found, onboarding guide link

---

**STATUS:** 🚀 EXECUTION READY - AUTO-START APPROVED

**CTO Signature:** ✅ Approved 2026-02-02
**Agent Acknowledgment:** Ready to execute with full autonomy
**Emergency Contact:** Scenario C only (rollback failure)

---

*End of Execution-Ready Plan*
*Agents: Begin Pre-Flight immediately*
*CTO: Monitor daily reports, no action needed unless emergency*
