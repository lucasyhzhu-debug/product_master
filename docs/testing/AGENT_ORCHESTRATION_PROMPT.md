# Multi-Agent Test Implementation Orchestration

> **Purpose:** Prompt template for orchestrating parallel test implementation
> **Usage:** Copy this prompt to spawn parallel agents for test implementation

---

## Orchestration Overview

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           ORCHESTRATION FLOW                                │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  Step 1: INFRASTRUCTURE (Sequential - Blocking)                            │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │  • Install dependencies                                              │   │
│  │  • Create vitest.config.ts                                          │   │
│  │  • Create tests/setup.ts                                            │   │
│  │  • Update package.json scripts                                       │   │
│  │  • Create directory structure                                        │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                              ↓                                              │
│  Step 2: PARALLEL TEST IMPLEMENTATION                                       │
│  ┌─────────────┐  ┌─────────────────┐  ┌───────────────┐                   │
│  │  Agent 1    │  │    Agent 2      │  │   Agent 3     │                   │
│  │  Backend    │  │    Convex       │  │   Frontend    │                   │
│  │  Unit Tests │  │ Integration     │  │    Tests      │                   │
│  │             │  │    Tests        │  │               │                   │
│  │  48 tests   │  │    62 tests     │  │   46 tests    │                   │
│  └─────────────┘  └─────────────────┘  └───────────────┘                   │
│         │                  │                   │                            │
│         └──────────────────┼───────────────────┘                            │
│                            ↓                                                │
│  Step 3: VERIFICATION (Sequential)                                          │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │  • npm run test:run (all tests)                                     │   │
│  │  • npm run test:coverage                                            │   │
│  │  • Fix cross-domain issues                                          │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## Step 1: Infrastructure Setup Prompt

Run this FIRST before spawning parallel agents:

```
You are setting up the test infrastructure for Frollie Recipe Master.

Read the master plan at docs/testing/TESTING_MASTER.md and complete Phase 0:

1. Install test dependencies:
   npm install -D vitest @vitest/coverage-v8 @testing-library/react @testing-library/jest-dom jsdom convex-test happy-dom @testing-library/user-event

2. Create vitest.config.ts at project root (see TESTING_MASTER.md for content)

3. Create tests/setup.ts (see TESTING_MASTER.md for content)

4. Update package.json with test scripts:
   - "test": "vitest"
   - "test:run": "vitest run"
   - "test:coverage": "vitest run --coverage"
   - "test:unit": "vitest run --dir convex/lib src/lib"
   - "test:integration": "vitest run --dir tests/convex"
   - "test:frontend": "vitest run --dir src"

5. Create directory structure:
   mkdir -p convex/lib/__tests__
   mkdir -p convex/orders/__tests__
   mkdir -p src/lib/__tests__
   mkdir -p src/components/shared/__tests__
   mkdir -p src/hooks/__tests__
   mkdir -p tests/convex
   mkdir -p tests/fixtures

6. Create shared fixtures at tests/fixtures/index.ts

7. Verify setup works: npm run test:run (should pass with 0 tests)

Commit changes: "test: add testing infrastructure (vitest, testing-library)"
```

---

## Step 2: Parallel Agent Prompts

After infrastructure is ready, spawn these 3 agents IN PARALLEL:

### Agent 1: Backend Unit Tests

```
You are implementing backend unit tests for Frollie Recipe Master.

Read docs/testing/PLAN_BACKEND_UNIT.md for your complete task specification.

Your scope:
- convex/lib/__tests__/costCalculator.test.ts (24 tests)
- convex/orders/__tests__/orderHelpers.test.ts (14 tests)
- convex/orders/__tests__/whatsapp.test.ts (10 tests)

Steps:
1. Read the plan document thoroughly
2. Read the source files you're testing:
   - convex/lib/costCalculator.ts
   - convex/orders/mutations.ts (for helper functions)
   - convex/orders/whatsapp.ts
3. Extract pure helper functions from mutations.ts into convex/orders/helpers.ts
4. Implement all test cases from the plan
5. Run: npm run test:unit
6. Ensure 100% coverage on costCalculator.ts
7. Commit: "test: add backend unit tests for cost calculator and order helpers"

Business rules you MUST test:
- #1: Unit conversion (kg→g ×1000, l→ml ×1000, m→cm ×100)
- #8: Order number format MMDD-NNN

Do NOT modify any non-test files except:
- Creating convex/orders/helpers.ts (extracting pure functions)
- Creating test files in __tests__ directories
```

### Agent 2: Convex Integration Tests

```
You are implementing Convex integration tests for Frollie Recipe Master.

Read docs/testing/PLAN_CONVEX_INTEGRATION.md for your complete task specification.

Your scope:
- tests/convex/recipes.test.ts (28 tests)
- tests/convex/products.test.ts (14 tests)
- tests/convex/orders.test.ts (12 tests)
- tests/convex/tags.test.ts (8 tests)
- tests/convex/helpers.ts (shared test utilities)

Steps:
1. Read the plan document thoroughly
2. Read the source files you're testing:
   - convex/recipes/mutations.ts
   - convex/recipes/queries.ts
   - convex/products/queries.ts
   - convex/orders/mutations.ts
   - convex/tags/mutations.ts
3. Create tests/convex/helpers.ts with shared setup functions
4. Implement all test cases from the plan using convex-test
5. Run: npm run test:integration
6. Verify all business rules have explicit tests
7. Commit: "test: add Convex integration tests for recipes, products, orders"

Business rules you MUST test:
- #2: Version immutability
- #3: Linked component cost inheritance
- #4: Product pinning to versions
- #5: Reusable = single component only
- #6: Deletion blocking rules
- #7: Default tag seeding
- #8: Order number generation

Do NOT modify any non-test files. Only create files in tests/convex/.
```

### Agent 3: Frontend Tests

```
You are implementing frontend tests for Frollie Recipe Master.

Read docs/testing/PLAN_FRONTEND.md for your complete task specification.

Your scope:
- src/lib/__tests__/utils.test.ts (16 tests)
- src/components/shared/__tests__/CostTooltip.test.tsx (8 tests)
- src/components/shared/__tests__/ConfirmDialog.test.tsx (10 tests)
- src/hooks/__tests__/useConvexHooks.test.tsx (12 tests)

Steps:
1. Read the plan document thoroughly
2. Read the source files you're testing:
   - src/lib/utils.ts
   - src/components/shared/CostTooltip.tsx
   - src/components/shared/ConfirmDialog.tsx
   - src/hooks/convex/*.ts
3. Implement all test cases from the plan
4. Use @testing-library/react and userEvent for component tests
5. Mock Convex hooks appropriately
6. Run: npm run test:frontend
7. Ensure 100% coverage on src/lib/utils.ts
8. Commit: "test: add frontend tests for utilities, components, and hooks"

Testing patterns to follow:
- Query by role (accessibility-first)
- Use userEvent over fireEvent
- Test loading/error/success states
- Mock external dependencies (Convex, router)

Do NOT modify any non-test files. Only create files in __tests__ directories.
```

---

## Step 3: Verification Prompt

After all 3 agents complete, run this verification:

```
You are verifying the complete test implementation for Frollie Recipe Master.

Steps:
1. Run the full test suite:
   npm run test:run

2. Check for failures and fix any cross-domain issues

3. Run coverage report:
   npm run test:coverage

4. Verify coverage targets:
   - convex/lib/costCalculator.ts: 100%
   - src/lib/utils.ts: 100%
   - Overall: 80%+

5. Run tests 3 times to check for flakiness:
   npm run test:run && npm run test:run && npm run test:run

6. If any tests fail:
   - Identify the failing test
   - Read the test and source code
   - Fix the issue
   - Re-run tests

7. Update docs/ROADMAP.md:
   - Mark "Testing (Vitest for frontend, Convex testing utilities)" as complete

8. Final commit: "test: complete test suite with 156 tests and 80%+ coverage"
```

---

## Single-Command Orchestration

For CLI automation, use this combined prompt:

```bash
# Run infrastructure setup first
claude-code "Read docs/testing/TESTING_MASTER.md and complete Phase 0 infrastructure setup. Install dependencies, create config files, create directory structure."

# Wait for completion, then run all 3 agents in parallel
claude-code --parallel \
  "Implement backend unit tests per docs/testing/PLAN_BACKEND_UNIT.md" \
  "Implement Convex integration tests per docs/testing/PLAN_CONVEX_INTEGRATION.md" \
  "Implement frontend tests per docs/testing/PLAN_FRONTEND.md"

# Run verification
claude-code "Verify test suite: run all tests, check coverage, fix issues, update ROADMAP.md"
```

---

## Progress Tracking

Use this checklist to track parallel agent progress:

```markdown
## Test Implementation Progress

### Infrastructure (Blocking)
- [ ] Dependencies installed
- [ ] vitest.config.ts created
- [ ] tests/setup.ts created
- [ ] package.json scripts added
- [ ] Directory structure created
- [ ] Fixtures created

### Agent 1: Backend Unit Tests
- [ ] costCalculator.test.ts (24 tests)
- [ ] orderHelpers.test.ts (14 tests)
- [ ] whatsapp.test.ts (10 tests)
- [ ] helpers.ts extracted
- [ ] All tests passing
- [ ] Committed

### Agent 2: Convex Integration Tests
- [ ] recipes.test.ts (28 tests)
- [ ] products.test.ts (14 tests)
- [ ] orders.test.ts (12 tests)
- [ ] tags.test.ts (8 tests)
- [ ] helpers.ts created
- [ ] All tests passing
- [ ] Committed

### Agent 3: Frontend Tests
- [ ] utils.test.ts (16 tests)
- [ ] CostTooltip.test.tsx (8 tests)
- [ ] ConfirmDialog.test.tsx (10 tests)
- [ ] useConvexHooks.test.tsx (12 tests)
- [ ] All tests passing
- [ ] Committed

### Verification
- [ ] Full suite passes
- [ ] Coverage targets met
- [ ] No flaky tests
- [ ] ROADMAP.md updated
- [ ] Final commit made
```

---

## Error Recovery

If an agent fails:

1. **Dependency error**: Re-run infrastructure setup
2. **Import error**: Check that convex-test and testing-library are installed
3. **Type error**: Ensure TypeScript types match Convex schema
4. **Flaky test**: Add proper async handling (waitFor, act)
5. **Coverage gap**: Add missing test cases from plan

---

## Expected Final State

After successful execution:

```
tests/
├── setup.ts
├── fixtures/
│   ├── index.ts
│   ├── ingredients.ts
│   └── orders.ts
└── convex/
    ├── helpers.ts
    ├── recipes.test.ts
    ├── products.test.ts
    ├── orders.test.ts
    └── tags.test.ts

convex/
├── lib/
│   └── __tests__/
│       └── costCalculator.test.ts
└── orders/
    ├── helpers.ts (new - extracted pure functions)
    └── __tests__/
        ├── orderHelpers.test.ts
        └── whatsapp.test.ts

src/
├── lib/
│   └── __tests__/
│       └── utils.test.ts
├── components/
│   └── shared/
│       └── __tests__/
│           ├── CostTooltip.test.tsx
│           └── ConfirmDialog.test.tsx
└── hooks/
    └── __tests__/
        └── useConvexHooks.test.tsx

vitest.config.ts (new)
```

**Test count:** 156 tests across 12 files
**Coverage:** 80%+ overall, 100% on critical paths
