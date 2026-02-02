# Frollie Recipe Master - Refactoring & Optimization Roadmap

**Created:** 2026-02-02
**Status:** Active
**Last Updated:** 2026-02-02
**Owner:** CTO & Technical Staff

---

## Executive Summary

This roadmap outlines the systematic refactoring and optimization of the Frollie Recipe Master codebase. Each project follows a strict workflow with specialist agent assignments, quality gates, and documentation requirements.

### Key Metrics
| Metric | Before | Target | Current |
|--------|--------|--------|---------|
| Orders `mutations.ts` lines | 2,010 | 1,400 | 1,377 |
| Test coverage (helpers) | 0% | 80% | ~30% |
| Dual-write overhead | 2x | 1x | 1x |
| Query N+1 patterns | Multiple | 0 | TBD |
| Total tests | 184 | 250 | 197 |

---

## Completed Work

### Project 1: Orders Mutations Refactoring
**Branch:** `refactor/orders-mutations-helpers` | **Status:** MERGED

**Achievements:**
- Reduced `mutations.ts` from 2,010 → 1,405 lines (30%)
- Created two-tier helper architecture (pure vs ctx-dependent)
- Eliminated ~430 lines of duplicated ball distribution logic
- Documented architecture in CODE_STYLE.md

**Files Created:**
```
convex/orders/
├── helpers.ts                 # Pure functions (no ctx)
└── helpers/
    ├── index.ts               # Barrel export
    ├── ballDistribution.ts    # distributeBallsToOrders()
    ├── statusTransitions.ts   # logOrderEvent(), isTerminalStatus()
    ├── usageTracking.ts       # increment/decrementChannelUsage()
    └── productionRecords.ts   # createProductionRecordsForItem()
```

### Project 2: Dual-Write System Removal
**Branch:** `refactor/remove-dual-write` | **Status:** MERGED

**Achievements:**
- Migrated completion logic from OLD system (ballsRemaining) to NEW system (orderItemProduction)
- Removed dual-write overhead (~50% reduction in ball operation DB writes)
- Updated frontend types with deprecation markers
- Created migration documentation

### Project 3: Test Suite (Partial)
**Branch:** `test/orders-helpers` | **Status:** MERGED

**Achievements:**
- Added 13 tests for statusTransitions.ts helper
- Fixed failing whatsapp.test.ts (status label mismatch)
- Total tests: 197 (all passing)

**Remaining:**
- Ball distribution integration tests (15 tests planned)
- Usage tracking tests (6 tests planned)
- Production records tests (10 tests planned)

---

## Roadmap Projects (Remaining)

### Project 4: Query Optimization
**Priority:** MEDIUM | **Risk:** Low | **Depends On:** None

#### Problem Statement
Kitchen View maintains two parallel tracking systems:
- **OLD:** `orderItems.ballsRemaining` (deprecated)
- **NEW:** `orderItemProduction.unitsRemaining` + `orderItems.ballsFilled/packageStatus`

**Impact:**
- 2x database writes on every ball operation
- Risk of desync bugs
- Technical debt compounds over time

#### Branch Strategy
```
Branch: refactor/remove-dual-write
Base: main (after Project 1 merge)
```

#### Execution Phases

**Phase A: Verification (Wave 1)**
| Task | Agent | Tools | Output |
|------|-------|-------|--------|
| Audit all queries reading OLD system | `convex-expert` | Grep, Read | Report: `docs/reports/dual-write-audit.md` |
| Verify NEW system data completeness | `convex-expert` | Bash (Convex dashboard) | Validation script results |
| Document discrepancies | `code-auditor` | Read, Grep | Discrepancy log |

**Phase B: Query Migration (Wave 2)**
| Task | Agent | Tools | Output |
|------|-------|-------|--------|
| Update `convex/orders/queries.ts` | `convex-backend` | Read, Edit | Queries use NEW system |
| Update `src/pages/KitchenView.tsx` | `react-ui-builder` | Read, Edit | UI reads NEW fields |
| Update dashboard queries | `convex-backend` | Read, Edit | Dashboard uses NEW system |
| Test all read paths | `code-auditor` | Bash | Test report |

**Phase C: Write Migration (Wave 3)**
| Task | Agent | Tools | Output |
|------|-------|-------|--------|
| Remove OLD writes from `ballDistribution.ts` | `convex-backend` | Read, Edit | Clean mutations |
| Remove OLD writes from other mutations | `convex-backend` | Read, Edit | No dual-writes |
| Update production record helpers | `convex-backend` | Read, Edit | Consistent patterns |
| Integration testing | `code-auditor` | Bash | Test report |

**Phase D: Cleanup (Wave 4)**
| Task | Agent | Tools | Output |
|------|-------|-------|--------|
| Mark `ballsRemaining` deprecated in schema | `convex-backend` | Read, Edit | `convex/schema.ts` |
| Update SCHEMA.md | Documentation | Edit | `docs/SCHEMA.md` |
| Update CHANGELOG.md | Documentation | Edit | `docs/CHANGELOG.md` |
| Create migration guide | Documentation | Write | `docs/migrations/dual-write-removal.md` |

#### Success Criteria
- [ ] All Kitchen View functionality works with NEW system only
- [ ] No references to `ballsRemaining` in active code paths
- [ ] Database writes reduced by ~50% for ball operations
- [ ] Zero data discrepancies between systems
- [ ] All tests pass

#### Files Affected
| File | Changes |
|------|---------|
| `convex/orders/helpers/ballDistribution.ts` | Remove OLD system writes |
| `convex/orders/queries.ts` | Switch reads to NEW system |
| `src/pages/KitchenView.tsx` | Use NEW system fields |
| `convex/schema.ts` | Deprecate ballsRemaining |
| `docs/SCHEMA.md` | Document deprecation |

---

### Project 3: Comprehensive Test Suite
**Priority:** HIGH | **Risk:** Very Low | **Depends On:** Project 1

#### Problem Statement
The refactored helpers have no automated tests. Future changes risk breaking complex ball distribution logic without immediate feedback.

#### Branch Strategy
```
Branch: test/orders-helpers
Base: main (after Project 1 merge)
```

#### Execution Phases

**Phase A: Test Infrastructure Setup**
| Task | Agent | Tools | Output |
|------|-------|-------|--------|
| Research Convex testing patterns | `Explore` | WebSearch, Read | Testing strategy doc |
| Set up test runner | `convex-backend` | Bash, Write | `package.json` updates |
| Create test utilities | `convex-backend` | Write | `convex/__tests__/utils.ts` |

**Phase B: Unit Tests (Pure Helpers)**
| Task | Agent | Tools | Output |
|------|-------|-------|--------|
| Test `calculateLineTotals()` | `convex-backend` | Write | `helpers.test.ts` |
| Test `calculateOrderTotals()` | `convex-backend` | Edit | `helpers.test.ts` |
| Test `recalculateFinalTotal()` | `convex-backend` | Edit | `helpers.test.ts` |
| Test `generateOrderNumber()` | `convex-backend` | Edit | `helpers.test.ts` |

**Phase C: Integration Tests (Ctx Helpers)**
| Task | Agent | Tools | Output |
|------|-------|-------|--------|
| Test `distributeBallsToOrders()` | `convex-backend` | Write | `ballDistribution.test.ts` |
| Test `statusTransitions.ts` | `convex-backend` | Write | `statusTransitions.test.ts` |
| Test `usageTracking.ts` | `convex-backend` | Write | `usageTracking.test.ts` |
| Test `productionRecords.ts` | `convex-backend` | Write | `productionRecords.test.ts` |

**Phase D: CI Integration**
| Task | Agent | Tools | Output |
|------|-------|-------|--------|
| Add test script to package.json | `convex-backend` | Edit | `package.json` |
| Create GitHub Actions workflow | `convex-backend` | Write | `.github/workflows/test.yml` |
| Document testing patterns | Documentation | Write | `docs/testing/CONVEX_TESTING.md` |

#### Test Coverage Plan
```
Unit Tests (Pure Helpers - helpers.ts)
├── calculateLineTotals() - various quantity/price combos
├── calculateOrderTotals() - multiple items, edge cases
├── recalculateFinalTotal() - percentage vs amount discounts
└── generateOrderNumber() - date formatting, sequence

Integration Tests (Ctx Helpers - helpers/*.ts)
├── distributeBallsToOrders()
│   ├── Single order, exact ball count
│   ├── Multiple orders, priority sorting
│   ├── Overflow handling
│   ├── Status transitions (Confirmed → InProduction → Packaging)
│   └── Dual-write sync verification (until removed)
├── statusTransitions.ts
│   ├── isTerminalStatus() - all status values
│   ├── logOrderEvent() - audit trail creation
│   └── transitionToPackaging() - item completion
├── usageTracking.ts
│   ├── Increment creates record if missing
│   ├── Decrement doesn't go negative
│   └── Multiple increments accumulate
└── productionRecords.ts
    ├── Create records from menu product
    ├── Update for quantity change
    └── Cancel cascade
```

#### Files to Create
| File | Tests (Est.) |
|------|--------------|
| `convex/orders/__tests__/helpers.test.ts` | 12 tests |
| `convex/orders/__tests__/ballDistribution.test.ts` | 15 tests |
| `convex/orders/__tests__/statusTransitions.test.ts` | 8 tests |
| `convex/orders/__tests__/usageTracking.test.ts` | 6 tests |
| `convex/orders/__tests__/productionRecords.test.ts` | 10 tests |

#### Success Criteria
- [ ] 80%+ code coverage on helpers
- [ ] All edge cases for ball distribution covered
- [ ] Tests run in < 30 seconds
- [ ] CI pipeline includes test run
- [ ] Test documentation complete

---

### Project 4: Query Optimization
**Priority:** MEDIUM | **Risk:** Low | **Depends On:** None

#### Problem Statement
`convex/orders/queries.ts` has repeated patterns:
- Fetching orders with items (duplicated logic)
- Enriching orders with customer data (no reuse)
- N+1 query patterns (fetching items per order in a loop)

#### Branch Strategy
```
Branch: refactor/orders-queries
Base: main
```

#### Execution Phases

**Phase A: Analysis**
| Task | Agent | Tools | Output |
|------|-------|-------|--------|
| Audit current query patterns | `code-auditor` | Read, Grep | Query analysis report |
| Identify N+1 patterns | `convex-expert` | Read | N+1 pattern list |
| Review Convex Query Analyzer | `convex-expert` | Bash | Index recommendations |

**Phase B: Query Helpers Extraction**
| Task | Agent | Tools | Output |
|------|-------|-------|--------|
| Create `helpers/queryHelpers.ts` | `convex-backend` | Write | New helper file |
| Extract `getOrderWithItems()` | `convex-backend` | Edit | Query helper |
| Extract `getOrdersWithItems()` | `convex-backend` | Edit | Batch enrichment |
| Extract `enrichOrderWithCustomer()` | `convex-backend` | Edit | Customer data helper |
| Export from `helpers/index.ts` | `convex-backend` | Edit | Barrel export |

**Phase C: Query Refactoring**
| Task | Agent | Tools | Output |
|------|-------|-------|--------|
| Refactor `getById` / `getByIdWithItems` | `convex-backend` | Edit | Consolidated query |
| Add pagination to `list` queries | `convex-backend` | Edit | Paginated queries |
| Optimize N+1 with batch fetching | `convex-backend` | Edit | Efficient queries |

**Phase D: Index Optimization**
| Task | Agent | Tools | Output |
|------|-------|-------|--------|
| Add missing indexes to schema | `convex-backend` | Edit | `convex/schema.ts` |
| Document index usage | Documentation | Edit | `docs/SCHEMA.md` |

#### Files Affected
| File | Changes |
|------|---------|
| `convex/orders/queries.ts` | Refactor to use helpers |
| `convex/orders/helpers/queryHelpers.ts` | NEW: Query helper functions |
| `convex/orders/helpers/index.ts` | Add export |
| `convex/schema.ts` | Add indexes if needed |

#### Success Criteria
- [ ] No N+1 queries in order list views
- [ ] Single source of truth for order enrichment
- [ ] Pagination available for order lists
- [ ] Index utilization documented

---

### Project 5: Entity Mutations Refactoring
**Priority:** MEDIUM | **Risk:** Low | **Depends On:** Project 1 (patterns)

#### Problem Statement
Other mutation files have similar patterns that could benefit from the same refactoring:

| File | Lines | Key Patterns to Extract |
|------|-------|-------------------------|
| `recipes/mutations.ts` | ~600 | Version creation, cost calculation, deep copy |
| `products/mutations.ts` | ~500 | COGS calculation, version pinning |
| `packaging/mutations.ts` | ~400 | Same as recipes |

#### Branch Strategy (Sequential)
```
Branch 5a: refactor/recipes-mutations
Branch 5b: refactor/products-mutations
Branch 5c: refactor/packaging-mutations
Base: main
```

#### Execution Plan (Per Entity)

**For Each Entity (recipes → products → packaging):**

**Phase A: Analysis**
| Task | Agent | Tools | Output |
|------|-------|-------|--------|
| Audit mutation patterns | `code-auditor` | Read | Pattern analysis |
| Identify pure vs ctx-dependent | `refactor-architect` | Read | Helper categorization |

**Phase B: Helper Extraction**
| Task | Agent | Tools | Output |
|------|-------|-------|--------|
| Create pure helpers file | `convex-backend` | Write | `{entity}/helpers.ts` |
| Create ctx helpers directory | `convex-backend` | Write | `{entity}/helpers/` |
| Extract version creation logic | `convex-backend` | Edit | Version helper |
| Extract cost/copy logic | `convex-backend` | Edit | Calculation helpers |

**Phase C: Mutation Refactoring**
| Task | Agent | Tools | Output |
|------|-------|-------|--------|
| Refactor mutations to use helpers | `convex-backend` | Edit | Thin wrappers |
| Update imports | `convex-backend` | Edit | Clean imports |
| Code review | `code-auditor` | Read | Audit report |

#### Success Criteria (Per Entity)
- [ ] Mutation file reduced by 20-30%
- [ ] Consistent helper architecture with orders
- [ ] Version creation pattern extracted and reusable
- [ ] All existing functionality preserved
- [ ] TypeScript compiles without errors

---

### Project 6: Performance Optimization
**Priority:** LOW-MEDIUM | **Risk:** Low | **Depends On:** All above

#### Problem Statement
Several performance opportunities identified:
- Ball Distribution N+1 Queries
- Order List without pagination
- Denormalized count updates
- Unknown index utilization

#### Branch Strategy
```
Branch: perf/orders-optimization
Base: main (after Projects 2-5)
```

#### Execution Phases

**Phase A: Profiling**
| Task | Agent | Tools | Output |
|------|-------|-------|--------|
| Profile Kitchen View load time | `code-auditor` | Bash | Baseline metrics |
| Analyze Convex Query Analyzer | `convex-expert` | Bash | Query report |
| Identify slow paths | `Explore` | Read, Grep | Bottleneck list |

**Phase B: Quick Wins**
| Task | Agent | Tools | Output |
|------|-------|-------|--------|
| Batch query in ball distribution | `convex-backend` | Edit | Optimized query |
| Add pagination to order list | `convex-backend` | Edit | Paginated list |
| Update frontend for pagination | `react-ui-builder` | Edit | Paginated UI |

**Phase C: Index Optimization**
| Task | Agent | Tools | Output |
|------|-------|-------|--------|
| Add missing indexes | `convex-backend` | Edit | Schema updates |
| Verify index usage | `convex-expert` | Bash | Verification report |

**Phase D: Measurement**
| Task | Agent | Tools | Output |
|------|-------|-------|--------|
| Measure improvement | `code-auditor` | Bash | Performance report |
| Document optimizations | Documentation | Write | Performance guide |

#### Success Criteria
- [ ] Kitchen View loads in < 500ms
- [ ] Order list pagination working
- [ ] No queries scanning full tables
- [ ] Performance improvements documented

---

## Specialist Agent Reference

### Agent Assignments by Capability

| Agent | Primary Responsibilities | Tools |
|-------|-------------------------|-------|
| `convex-backend` | Schema, queries, mutations, helpers | Read, Write, Edit, Glob, Grep, Bash |
| `convex-expert` | Architecture review, optimization strategy | All tools |
| `react-ui-builder` | Frontend components, hooks, UI updates | Read, Write, Edit, Glob, Grep |
| `code-auditor` | READ-ONLY verification, type safety, patterns | Read, Glob, Grep, Bash |
| `refactor-architect` | Code analysis, refactoring plans | Read, Write, Edit, Glob, Grep, Bash, Task, TodoWrite |
| `Explore` | Codebase discovery, pattern search | Search tools |
| Documentation (manual) | CHANGELOG, SCHEMA, API_REFERENCE | Edit |

### Agent Orchestration Pattern

```
┌─────────────────────────────────────────────────────────────┐
│                    CTO Orchestrator                         │
│  (Coordinates phases, manages handoffs, enforces gates)     │
└─────────────────────┬───────────────────────────────────────┘
                      │
    ┌─────────────────┼─────────────────┐
    │                 │                 │
    ▼                 ▼                 ▼
┌────────┐      ┌──────────┐      ┌──────────┐
│ Wave 1 │      │  Wave 2  │      │  Wave 3  │
│ Parallel│      │ Parallel │      │ Parallel │
└────┬───┘      └────┬─────┘      └────┬─────┘
     │               │                 │
     ▼               ▼                 ▼
┌─────────────┐ ┌───────────┐ ┌───────────────┐
│code-auditor │ │convex-    │ │react-ui-      │
│(analysis)   │ │backend    │ │builder        │
└─────────────┘ │(backend)  │ │(frontend)     │
                └───────────┘ └───────────────┘
                      │
                      ▼
              ┌───────────────┐
              │ Quality Gate  │
              │ (code-auditor)│
              └───────────────┘
```

---

## Branch Management

### Naming Convention
```
{type}/{scope}-{description}

Types:
- refactor/  - Code structure changes
- test/      - Test additions
- perf/      - Performance improvements
- fix/       - Bug fixes
- feat/      - New features
- docs/      - Documentation only

Examples:
- refactor/orders-mutations-helpers
- refactor/remove-dual-write
- test/orders-helpers
- perf/orders-optimization
```

### Branch Lifecycle
```
1. CREATE
   git switch main && git pull
   git switch -c refactor/remove-dual-write

2. DEVELOP
   # Make atomic commits
   git add <specific-files>
   git commit -m "refactor(orders): remove OLD system reads"

3. VERIFY
   npm run build
   npm run type-check
   npx convex dev  # Test locally

4. REVIEW
   # Code auditor reviews
   # Run /techdebt if needed

5. MERGE
   git switch main && git pull
   git merge refactor/remove-dual-write
   git push origin main

6. CLEANUP
   git branch -d refactor/remove-dual-write
   git push origin --delete refactor/remove-dual-write
```

### Commit Message Standards
```
{type}({scope}): {description}

Types: feat, fix, refactor, test, perf, docs, chore
Scope: orders, recipes, products, packaging, kitchen, etc.

Examples:
- refactor(orders): extract ball distribution to helpers
- test(orders): add unit tests for calculateLineTotals
- perf(orders): batch query for production records
- docs: update refactoring roadmap with agent assignments

Co-Authored-By: Claude Opus 4.5 <noreply@anthropic.com>
```

---

## Documentation Requirements

### Per-Project Documentation Updates

| Document | When to Update | Content |
|----------|---------------|---------|
| `docs/CHANGELOG.md` | After merge | What changed, migration notes |
| `docs/SCHEMA.md` | Schema changes | New/modified fields, deprecations |
| `docs/CODE_STYLE.md` | Pattern changes | New patterns, conventions |
| `docs/API_REFERENCE.md` | Query/mutation changes | Function signatures, examples |
| `CLAUDE.md` | Structural changes | Quick file finder, commands |

### Handover Documents
Create handover document when:
- Completing a major implementation phase
- Context window getting full
- Switching to different work area

Location: `docs/handover/handover-{branch-name}.md`

### Reports Directory
```
docs/reports/
├── dual-write-audit.md           # Project 2 Phase A
├── query-analysis.md             # Project 4 Phase A
├── techdebt-{date}.md            # /techdebt command output
└── performance-{date}.md         # Project 6 measurements
```

---

## Execution Schedule

### Week 1: Foundation
```
Day 1-2: Project 2 - Dual-Write Removal
├── Phase A: Verification (code-auditor, convex-expert)
├── Phase B: Query Migration (convex-backend)
├── Phase C: Write Migration (convex-backend)
└── Phase D: Cleanup (convex-backend, docs)

Day 3-4: Project 3 - Test Suite
├── Phase A: Infrastructure (convex-backend)
├── Phase B: Unit Tests (convex-backend)
├── Phase C: Integration Tests (convex-backend)
└── Phase D: CI Integration (convex-backend)

Day 5: Buffer / Catch-up
```

### Week 2: Optimization
```
Day 1: Project 4 - Query Optimization
├── Phase A: Analysis (code-auditor)
├── Phase B: Helper Extraction (convex-backend)
├── Phase C: Query Refactoring (convex-backend)
└── Phase D: Index Optimization (convex-backend)

Day 2-3: Project 5a - Recipes Mutations
├── Analysis → Helper Extraction → Refactoring

Day 4: Project 5b - Products Mutations
├── Analysis → Helper Extraction → Refactoring

Day 5: Buffer / Documentation
```

### Week 3: Completion
```
Day 1: Project 5c - Packaging Mutations
├── Analysis → Helper Extraction → Refactoring

Day 2-3: Project 6 - Performance Optimization
├── Phase A: Profiling
├── Phase B: Quick Wins
├── Phase C: Index Optimization
└── Phase D: Measurement

Day 4: Final Documentation
├── Update all docs
├── Create summary report
└── Archive completed project docs

Day 5: Retrospective
├── What worked well
├── What to improve
└── Lessons learned
```

---

## Quality Gates

### Pre-Merge Checklist
Every PR must pass:

1. **Build Gate**
   ```bash
   npm run build          # Must succeed
   npm run type-check     # Zero TypeScript errors
   ```

2. **Code Audit Gate** (via `code-auditor` agent)
   - [ ] No `any` types (except documented exceptions)
   - [ ] No N+1 query patterns
   - [ ] All helpers properly typed
   - [ ] Imports follow conventions

3. **Documentation Gate**
   - [ ] CHANGELOG.md updated
   - [ ] Affected docs updated
   - [ ] Code comments where needed

4. **Test Gate** (when tests exist)
   ```bash
   npm run test           # All tests pass
   ```

### Post-Merge Verification
```bash
npx convex dev           # Verify Convex sync
npm run dev              # Verify app runs
# Manual smoke test of affected features
```

---

## Risk Mitigation

### High-Risk Areas

| Area | Risk | Mitigation |
|------|------|------------|
| Dual-write removal | Data loss/desync | Verification phase, backup data |
| Ball distribution logic | Kitchen View breaks | Comprehensive tests first |
| Query optimization | Performance regression | Baseline metrics, measure after |
| Schema changes | Migration issues | Document deprecated fields |

### Rollback Plan
Each project should be independently reversible:
```bash
# If issues discovered post-merge
git revert <merge-commit>
git push origin main

# For Convex schema changes, may need:
npx convex deploy --preview  # Test in preview first
```

---

## Success Metrics

### Technical Metrics
| Metric | Baseline | Target | Measured |
|--------|----------|--------|----------|
| `orders/mutations.ts` lines | 2,010 | < 1,500 | 1,377 |
| Test coverage (helpers) | 0% | 80% | ~30% |
| Dual-write queries | 2x | 1x | 1x |
| Kitchen View load time | TBD | < 500ms | TBD |
| Total tests | 184 | 250 | 197 |

### Quality Metrics
| Metric | Target |
|--------|--------|
| PR review turnaround | < 1 day |
| Build failures | 0 |
| Post-merge bugs | 0 |
| Documentation coverage | 100% |

---

## Change Log

| Date | Change |
|------|--------|
| 2026-02-02 | Initial roadmap created after orders refactoring |
| 2026-02-02 | Enhanced with agent assignments, branch management, documentation standards |
| 2026-02-02 | Project 2 (Dual-Write Removal) completed and merged |
| 2026-02-02 | Project 3 (Test Suite) partial completion - 13 new tests added |

---

## Appendix: Quick Commands

### Start New Project
```bash
git switch main && git pull
git switch -c refactor/project-name
```

### Spawn Specialist Agent
```
# For backend work
@convex-backend "Implement Phase B of Project 2..."

# For code audit
@code-auditor "Review convex/orders/helpers/ for type safety..."

# For exploration
@Explore "Find all references to ballsRemaining in the codebase"
```

### Create Handover
```
/handover
```

### Run Tech Debt Scan
```
/techdebt
```
