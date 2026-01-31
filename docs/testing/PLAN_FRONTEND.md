# Agent 3: Frontend Tests Plan

> **Scope:** React components, custom hooks, utility functions
> **Est. Test Cases:** 46
> **Parallel Safe:** Yes - isolated component tests

---

## Target Files

| File | Type | Priority |
|------|------|----------|
| `src/lib/utils.ts` | Utility functions | P1 |
| `src/lib/types.ts` | Type definitions | N/A (types only) |
| `src/hooks/convex/*.ts` | Convex hooks | P2 |
| `src/components/shared/*.tsx` | Shared components | P2 |
| `src/pages/*.tsx` | Page components | P3 |

---

## Test File 1: `src/lib/__tests__/utils.test.ts`

### Test Cases (16 total)

```typescript
import { describe, it, expect } from 'vitest';
import { cn, formatCurrency, formatNumber, formatPercent, getErrorMessage } from '../utils';

describe('cn (className merger)', () => {
  it('merges simple class names', () => {
    expect(cn('foo', 'bar')).toBe('foo bar');
  });

  it('handles conditional classes', () => {
    expect(cn('base', true && 'active', false && 'hidden')).toBe('base active');
  });

  it('merges Tailwind classes correctly', () => {
    // Later class should override earlier
    expect(cn('p-4', 'p-8')).toBe('p-8');
  });

  it('handles undefined/null gracefully', () => {
    expect(cn('foo', undefined, null, 'bar')).toBe('foo bar');
  });

  it('handles arrays of classes', () => {
    expect(cn(['foo', 'bar'], 'baz')).toBe('foo bar baz');
  });
});

describe('formatCurrency', () => {
  it('formats positive amounts in IDR', () => {
    expect(formatCurrency(1500000)).toBe('Rp 1.500.000');
  });

  it('formats zero', () => {
    expect(formatCurrency(0)).toMatch(/0/);
  });

  it('formats small amounts', () => {
    expect(formatCurrency(500)).toMatch(/500/);
  });

  it('returns "-" for null', () => {
    expect(formatCurrency(null)).toBe('-');
  });

  it('returns "-" for undefined', () => {
    expect(formatCurrency(undefined)).toBe('-');
  });

  it('handles large amounts (millions)', () => {
    const result = formatCurrency(25000000);
    expect(result).toContain('25');
    expect(result).toContain('000');
  });
});

describe('formatNumber', () => {
  it('formats with default 2 decimal places', () => {
    expect(formatNumber(1234.567)).toMatch(/1\.234,57|1,234\.57/);
  });

  it('respects custom decimal places', () => {
    expect(formatNumber(10.5, 1)).toMatch(/10[,.]5/);
  });

  it('returns "-" for null', () => {
    expect(formatNumber(null)).toBe('-');
  });

  it('handles zero', () => {
    expect(formatNumber(0)).toMatch(/0/);
  });
});

describe('formatPercent', () => {
  it('formats percentage with 1 decimal', () => {
    expect(formatPercent(50.567)).toBe('50.6%');
  });

  it('returns "-" for null', () => {
    expect(formatPercent(null)).toBe('-');
  });

  it('handles 100%', () => {
    expect(formatPercent(100)).toBe('100.0%');
  });

  it('handles 0%', () => {
    expect(formatPercent(0)).toBe('0.0%');
  });

  it('handles negative percentages', () => {
    expect(formatPercent(-15.5)).toBe('-15.5%');
  });
});

describe('getErrorMessage', () => {
  it('extracts message from Error object', () => {
    expect(getErrorMessage(new Error('Something went wrong'), 'fallback')).toBe('Something went wrong');
  });

  it('returns string errors directly', () => {
    expect(getErrorMessage('Direct string error', 'fallback')).toBe('Direct string error');
  });

  it('returns fallback for unknown types', () => {
    expect(getErrorMessage({ weird: 'object' }, 'fallback message')).toBe('fallback message');
  });

  it('returns fallback for null', () => {
    expect(getErrorMessage(null, 'fallback')).toBe('fallback');
  });

  it('returns fallback for undefined', () => {
    expect(getErrorMessage(undefined, 'fallback')).toBe('fallback');
  });
});
```

---

## Test File 2: `src/components/shared/__tests__/CostTooltip.test.tsx`

### Test Cases (8 total)

```typescript
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { CostTooltip } from '../CostTooltip';

describe('CostTooltip', () => {
  it('renders cost when value is provided', () => {
    render(<CostTooltip cost={5000} />);
    expect(screen.getByText(/5\.000|5,000/)).toBeInTheDocument();
  });

  it('renders "-" for null cost', () => {
    render(<CostTooltip cost={null} />);
    expect(screen.getByText('-')).toBeInTheDocument();
  });

  it('renders "-" for undefined cost', () => {
    render(<CostTooltip cost={undefined} />);
    expect(screen.getByText('-')).toBeInTheDocument();
  });

  it('shows tooltip on hover', async () => {
    const user = userEvent.setup();
    render(<CostTooltip cost={5000} breakdown="500g × 10 IDR/g" />);

    await user.hover(screen.getByText(/5\.000|5,000/));

    expect(await screen.findByText(/500g × 10/)).toBeInTheDocument();
  });

  it('applies custom className', () => {
    render(<CostTooltip cost={5000} className="custom-class" />);
    const element = screen.getByText(/5\.000|5,000/);
    expect(element.closest('.custom-class')).toBeInTheDocument();
  });

  it('formats large costs correctly', () => {
    render(<CostTooltip cost={1500000} />);
    expect(screen.getByText(/1\.500\.000|1,500,000/)).toBeInTheDocument();
  });

  it('handles zero cost', () => {
    render(<CostTooltip cost={0} />);
    expect(screen.getByText(/0/)).toBeInTheDocument();
  });

  it('renders without tooltip when no breakdown provided', async () => {
    const user = userEvent.setup();
    render(<CostTooltip cost={5000} />);

    await user.hover(screen.getByText(/5\.000|5,000/));

    // No tooltip should appear (or default behavior)
    // Depends on component implementation
  });
});
```

---

## Test File 3: `src/components/shared/__tests__/ConfirmDialog.test.tsx`

### Test Cases (10 total)

```typescript
import { describe, it, expect, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ConfirmDialog } from '../ConfirmDialog';

describe('ConfirmDialog', () => {
  const defaultProps = {
    open: true,
    onOpenChange: vi.fn(),
    title: 'Confirm Action',
    description: 'Are you sure you want to proceed?',
    onConfirm: vi.fn(),
  };

  it('renders title and description', () => {
    render(<ConfirmDialog {...defaultProps} />);

    expect(screen.getByText('Confirm Action')).toBeInTheDocument();
    expect(screen.getByText('Are you sure you want to proceed?')).toBeInTheDocument();
  });

  it('does not render when closed', () => {
    render(<ConfirmDialog {...defaultProps} open={false} />);

    expect(screen.queryByText('Confirm Action')).not.toBeInTheDocument();
  });

  it('calls onConfirm when confirm button clicked', async () => {
    const user = userEvent.setup();
    const onConfirm = vi.fn();
    render(<ConfirmDialog {...defaultProps} onConfirm={onConfirm} />);

    await user.click(screen.getByRole('button', { name: /confirm|yes|ok/i }));

    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  it('calls onOpenChange(false) when cancel clicked', async () => {
    const user = userEvent.setup();
    const onOpenChange = vi.fn();
    render(<ConfirmDialog {...defaultProps} onOpenChange={onOpenChange} />);

    await user.click(screen.getByRole('button', { name: /cancel|no/i }));

    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it('uses custom confirm button text', () => {
    render(<ConfirmDialog {...defaultProps} confirmText="Delete Forever" />);

    expect(screen.getByRole('button', { name: /delete forever/i })).toBeInTheDocument();
  });

  it('uses custom cancel button text', () => {
    render(<ConfirmDialog {...defaultProps} cancelText="Go Back" />);

    expect(screen.getByRole('button', { name: /go back/i })).toBeInTheDocument();
  });

  it('applies destructive variant styling', () => {
    render(<ConfirmDialog {...defaultProps} variant="destructive" />);

    const confirmButton = screen.getByRole('button', { name: /confirm|yes|ok|delete/i });
    expect(confirmButton).toHaveClass(/destructive|red|danger/);
  });

  it('disables buttons while loading', () => {
    render(<ConfirmDialog {...defaultProps} loading={true} />);

    const buttons = screen.getAllByRole('button');
    buttons.forEach(button => {
      expect(button).toBeDisabled();
    });
  });

  it('shows loading spinner when loading', () => {
    render(<ConfirmDialog {...defaultProps} loading={true} />);

    expect(screen.getByRole('progressbar') || screen.getByTestId('loading-spinner')).toBeInTheDocument();
  });

  it('closes on escape key', async () => {
    const user = userEvent.setup();
    const onOpenChange = vi.fn();
    render(<ConfirmDialog {...defaultProps} onOpenChange={onOpenChange} />);

    await user.keyboard('{Escape}');

    expect(onOpenChange).toHaveBeenCalledWith(false);
  });
});
```

---

## Test File 4: `src/hooks/__tests__/useConvexHooks.test.tsx`

### Strategy: Mock Convex Provider

```typescript
import { describe, it, expect, vi } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { ConvexProvider, ConvexReactClient } from 'convex/react';
import { useRecipes } from '../convex/useRecipes';

// Mock the Convex client
vi.mock('convex/react', async () => {
  const actual = await vi.importActual('convex/react');
  return {
    ...actual,
    useQuery: vi.fn(),
    useMutation: vi.fn(),
  };
});
```

### Test Cases (12 total)

```typescript
describe('useRecipes hook', () => {
  it('returns undefined while loading', () => {
    vi.mocked(useQuery).mockReturnValue(undefined);

    const { result } = renderHook(() => useRecipes());

    expect(result.current.recipes).toBeUndefined();
    expect(result.current.isLoading).toBe(true);
  });

  it('returns recipes when loaded', () => {
    const mockRecipes = [
      { _id: 'r1', name: 'Recipe 1' },
      { _id: 'r2', name: 'Recipe 2' },
    ];
    vi.mocked(useQuery).mockReturnValue(mockRecipes);

    const { result } = renderHook(() => useRecipes());

    expect(result.current.recipes).toEqual(mockRecipes);
    expect(result.current.isLoading).toBe(false);
  });

  it('provides createRecipe mutation', () => {
    const mockMutation = vi.fn();
    vi.mocked(useMutation).mockReturnValue(mockMutation);

    const { result } = renderHook(() => useRecipes());

    expect(result.current.createRecipe).toBe(mockMutation);
  });

  it('handles empty recipe list', () => {
    vi.mocked(useQuery).mockReturnValue([]);

    const { result } = renderHook(() => useRecipes());

    expect(result.current.recipes).toEqual([]);
    expect(result.current.isLoading).toBe(false);
  });
});

describe('useOrders hook', () => {
  it('filters by status when provided', () => {
    const { result } = renderHook(() => useOrders({ status: 'Production' }));

    // Verify useQuery was called with correct filter args
    expect(useQuery).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ status: 'Production' })
    );
  });

  it('calculates order statistics', () => {
    vi.mocked(useQuery).mockReturnValue([
      { status: 'Draft', totalAmount: 100000 },
      { status: 'Confirmed', totalAmount: 200000 },
      { status: 'Confirmed', totalAmount: 150000 },
    ]);

    const { result } = renderHook(() => useOrders());

    expect(result.current.stats.totalConfirmed).toBe(2);
    expect(result.current.stats.totalRevenue).toBe(350000);
  });
});

describe('useDashboard hook', () => {
  it('aggregates data from multiple queries', () => {
    // Test dashboard aggregation logic
  });

  it('handles partial loading states', () => {
    // Some queries loaded, others pending
  });
});
```

---

## Component Rendering Tests

### Test File 5: `src/pages/__tests__/Dashboard.test.tsx`

### Test Cases (8 total)

```typescript
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import Dashboard from '../Dashboard';

// Mock Convex hooks
vi.mock('@/hooks/convex', () => ({
  useDashboard: () => ({
    stats: {
      totalRecipes: 15,
      totalProducts: 8,
      pendingOrders: 3,
    },
    isLoading: false,
  }),
}));

const renderWithRouter = (component: React.ReactElement) => {
  return render(
    <MemoryRouter>
      {component}
    </MemoryRouter>
  );
};

describe('Dashboard', () => {
  it('renders dashboard title', () => {
    renderWithRouter(<Dashboard />);
    expect(screen.getByRole('heading', { name: /dashboard/i })).toBeInTheDocument();
  });

  it('displays recipe count', () => {
    renderWithRouter(<Dashboard />);
    expect(screen.getByText('15')).toBeInTheDocument();
    expect(screen.getByText(/recipes/i)).toBeInTheDocument();
  });

  it('displays product count', () => {
    renderWithRouter(<Dashboard />);
    expect(screen.getByText('8')).toBeInTheDocument();
  });

  it('displays pending orders', () => {
    renderWithRouter(<Dashboard />);
    expect(screen.getByText('3')).toBeInTheDocument();
  });

  it('shows loading skeleton while data loads', () => {
    vi.mocked(useDashboard).mockReturnValue({
      stats: undefined,
      isLoading: true,
    });

    renderWithRouter(<Dashboard />);
    expect(screen.getByTestId('dashboard-skeleton')).toBeInTheDocument();
  });

  it('navigates to recipes on card click', async () => {
    const user = userEvent.setup();
    renderWithRouter(<Dashboard />);

    await user.click(screen.getByText(/recipes/i).closest('a'));

    // Check navigation occurred
  });
});
```

---

## Implementation Checklist

- [ ] Create `src/lib/__tests__/utils.test.ts` (16 tests)
- [ ] Create `src/components/shared/__tests__/CostTooltip.test.tsx` (8 tests)
- [ ] Create `src/components/shared/__tests__/ConfirmDialog.test.tsx` (10 tests)
- [ ] Create `src/hooks/__tests__/useConvexHooks.test.tsx` (12 tests)
- [ ] Run `npm run test:frontend` - all pass
- [ ] Check coverage for `src/lib/utils.ts` reaches 100%

---

## Testing Library Patterns

### Component Testing Pattern
```typescript
// 1. Render with required providers
const renderComponent = (props = {}) => {
  return render(
    <ConvexProvider client={mockClient}>
      <MemoryRouter>
        <Component {...defaultProps} {...props} />
      </MemoryRouter>
    </ConvexProvider>
  );
};

// 2. Query by role (accessibility-first)
screen.getByRole('button', { name: /submit/i });
screen.getByRole('textbox', { name: /email/i });

// 3. Assert visibility and interaction
expect(element).toBeVisible();
expect(element).toHaveTextContent('Expected text');

// 4. User events (preferred over fireEvent)
const user = userEvent.setup();
await user.click(button);
await user.type(input, 'text');
```

### Hook Testing Pattern
```typescript
// 1. Render hook with wrapper
const { result } = renderHook(() => useMyHook(), {
  wrapper: ({ children }) => (
    <ConvexProvider client={mockClient}>
      {children}
    </ConvexProvider>
  ),
});

// 2. Wait for async updates
await waitFor(() => {
  expect(result.current.data).toBeDefined();
});

// 3. Test mutations
act(() => {
  result.current.mutate({ data: 'value' });
});
```

---

## Completion Criteria

```bash
# All frontend tests pass
npm run test:run -- src/

# Coverage check
npm run test:coverage -- --dir src/lib
# Expected: 100% for utils.ts
```
