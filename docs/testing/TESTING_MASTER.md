# Test Implementation Master Plan

> **Purpose:** Master orchestration document for implementing comprehensive test coverage.
> **Execution:** This plan coordinates parallel test implementation across 4 domains.

---

## Executive Summary

This plan introduces testing to Frollie Recipe Master, covering:
- **156 test cases** across 4 domains
- **8 business rules** from CLAUDE.md with full coverage
- **Parallel execution** via 4 specialized agents

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                    ORCHESTRATION AGENT                          │
│                 (Coordinates all test agents)                   │
└─────────────────────────────────────────────────────────────────┘
                              │
        ┌─────────────────────┼─────────────────────┐
        │                     │                     │
        ▼                     ▼                     ▼
┌───────────────┐   ┌───────────────┐   ┌───────────────┐
│   AGENT 1     │   │   AGENT 2     │   │   AGENT 3     │
│ Backend Unit  │   │ Convex Integ  │   │  Frontend     │
│    Tests      │   │    Tests      │   │    Tests      │
└───────────────┘   └───────────────┘   └───────────────┘
        │                     │                     │
        ▼                     ▼                     ▼
  costCalculator.ts    recipes/mutations    src/lib/utils.ts
  orderHelpers.ts      orders/mutations     React components
  whatsapp.ts          products/queries     Custom hooks
```

---

## Phase 0: Infrastructure Setup (Blocking - Run First)

Before parallel execution, complete this setup:

### 0.1 Install Dependencies

```bash
npm install -D vitest @vitest/coverage-v8 @testing-library/react @testing-library/jest-dom jsdom convex-test happy-dom
```

### 0.2 Create Vitest Configuration

**File:** `vitest.config.ts`
```typescript
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./tests/setup.ts'],
    include: [
      'convex/**/*.test.ts',
      'src/**/*.test.ts',
      'src/**/*.test.tsx',
      'tests/**/*.test.ts',
    ],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      include: [
        'convex/lib/**/*.ts',
        'convex/*/mutations.ts',
        'convex/*/queries.ts',
        'src/lib/**/*.ts',
      ],
      exclude: [
        'convex/_generated/**',
        '**/*.test.ts',
      ],
    },
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
});
```

### 0.3 Create Test Setup File

**File:** `tests/setup.ts`
```typescript
import '@testing-library/jest-dom';
import { expect, afterEach } from 'vitest';
import { cleanup } from '@testing-library/react';
import * as matchers from '@testing-library/jest-dom/matchers';

expect.extend(matchers);

afterEach(() => {
  cleanup();
});
```

### 0.4 Update package.json Scripts

```json
{
  "scripts": {
    "test": "vitest",
    "test:run": "vitest run",
    "test:coverage": "vitest run --coverage",
    "test:ui": "vitest --ui",
    "test:unit": "vitest run --dir convex/lib src/lib",
    "test:integration": "vitest run --dir tests/convex",
    "test:frontend": "vitest run --dir src"
  }
}
```

### 0.5 Create Directory Structure

```bash
mkdir -p convex/lib/__tests__
mkdir -p convex/orders/__tests__
mkdir -p src/lib/__tests__
mkdir -p tests/convex
mkdir -p tests/fixtures
```

---

## Phase 1: Parallel Execution (After Infrastructure)

Execute these 3 agents in parallel:

| Agent | Plan Document | Scope | Est. Test Cases |
|-------|---------------|-------|-----------------|
| **Agent 1** | `PLAN_BACKEND_UNIT.md` | Pure functions, no DB | 48 |
| **Agent 2** | `PLAN_CONVEX_INTEGRATION.md` | Convex mutations/queries | 62 |
| **Agent 3** | `PLAN_FRONTEND.md` | React, hooks, utilities | 46 |

---

## Business Rules Coverage Matrix

| # | Business Rule | Agent | Test File |
|---|---------------|-------|-----------|
| 1 | Unit conversion (kg→g, l→ml, m→cm) | Agent 1 | `costCalculator.test.ts` |
| 2 | Version immutability | Agent 2 | `recipes.test.ts` |
| 3 | Linked components cost inheritance | Agent 2 | `recipes.test.ts` |
| 4 | Product pinning to versions | Agent 2 | `products.test.ts` |
| 5 | Reusable = single component only | Agent 2 | `recipes.test.ts` |
| 6 | Deletion blocking rules | Agent 2 | `recipes.test.ts` |
| 7 | Default tag seeding | Agent 2 | `tags.test.ts` |
| 8 | Order number MMDD-NNN format | Agent 1 | `orderHelpers.test.ts` |

---

## Test Fixtures (Shared)

**File:** `tests/fixtures/ingredients.ts`
```typescript
export const mockIngredients = {
  flour: {
    _id: 'ing_flour' as any,
    name: 'Wheat Flour',
    unitType: 'kg',
    volumePurchased: 25,
    priceExclShipping: 250000,
    shippingCost: 15000,
    costPerBaseUnit: 10.6, // (250000+15000)/25/1000 = 10.6 IDR/g
    baseUnit: 'g',
  },
  sugar: {
    _id: 'ing_sugar' as any,
    name: 'White Sugar',
    unitType: 'kg',
    volumePurchased: 50,
    priceExclShipping: 700000,
    shippingCost: 20000,
    costPerBaseUnit: 14.4, // (700000+20000)/50/1000 = 14.4 IDR/g
    baseUnit: 'g',
  },
  oil: {
    _id: 'ing_oil' as any,
    name: 'Cooking Oil',
    unitType: 'l',
    volumePurchased: 18,
    priceExclShipping: 360000,
    shippingCost: 0,
    costPerBaseUnit: 20, // 360000/18/1000 = 20 IDR/ml
    baseUnit: 'ml',
  },
};
```

**File:** `tests/fixtures/orders.ts`
```typescript
export const mockOrderItems = [
  {
    productName: 'Dubai Chocolate',
    quantity: 2,
    unitPrice: 85000,
    unitCost: 35000,
    discountAmount: 0,
  },
  {
    productName: 'Milo Nugget',
    quantity: 5,
    unitPrice: 25000,
    unitCost: 8000,
    discountAmount: 5000,
  },
];

export const mockCustomer = {
  _id: 'cust_001' as any,
  name: 'John Doe',
  phone: '+6281234567890',
  source: 'Instagram',
};
```

---

## Coverage Targets

| Domain | Target | Rationale |
|--------|--------|-----------|
| `convex/lib/costCalculator.ts` | 100% | Critical business logic |
| `convex/orders/*.ts` | 90% | Financial calculations |
| `convex/recipes/mutations.ts` | 85% | Version management |
| `convex/products/queries.ts` | 85% | COGS calculations |
| `src/lib/utils.ts` | 100% | Pure utility functions |
| Overall | 80% | Industry standard |

---

## Success Criteria

- [ ] All 156 test cases pass
- [ ] 8 business rules have explicit tests
- [ ] Coverage targets met
- [ ] `npm run test:run` exits with code 0
- [ ] No flaky tests (run 3x without failure)
- [ ] CI/CD integration ready

---

## Execution Order

```
1. [BLOCKING] Infrastructure Setup (Phase 0)
   └── Install deps, create configs, create directories

2. [PARALLEL] Agent Execution (Phase 1)
   ├── Agent 1: Backend Unit Tests
   ├── Agent 2: Convex Integration Tests
   └── Agent 3: Frontend Tests

3. [SEQUENTIAL] Verification
   ├── Run full test suite
   ├── Check coverage reports
   └── Fix any cross-domain issues
```

---

## Related Documents

- `PLAN_BACKEND_UNIT.md` - Agent 1 detailed plan
- `PLAN_CONVEX_INTEGRATION.md` - Agent 2 detailed plan
- `PLAN_FRONTEND.md` - Agent 3 detailed plan
- `AGENT_ORCHESTRATION_PROMPT.md` - Multi-agent execution prompt
