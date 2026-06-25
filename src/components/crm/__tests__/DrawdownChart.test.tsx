/**
 * T27 — TDD tests for DrawdownChart + SubscriptionSelector.
 *
 * RED → GREEN cycle:
 *   1. Failing test written first (components not yet implemented).
 *   2. Implementation added; tests pass.
 *
 * DrawdownChart tests:
 *   - Loading state (undefined query) shows skeleton.
 *   - Null result → empty-state message.
 *   - Empty points array → empty-state message.
 *   - Title names the selected subscription (subscriptionLabel).
 *   - Title is a link to the subscription page (A1).
 *   - Solid delivered bar present (dataKey="deliveredPcs", name="Delivered").
 *   - Lighter planned bar present (dataKey="plannedPcs", fillOpacity<1).
 *   - Credit-remaining line present (dataKey="creditRemaining").
 *   - leftoverFlag=true → "Unspent credit" badge shown.
 *   - leftoverFlag=false → no "Unspent credit".
 *   - Switching subscriptionId prop → useSessionQuery called with new subscriptionId.
 *
 * SubscriptionSelector tests:
 *   - Renders option labels for each subscription.
 *   - Calls onChange with the selected subscription ID.
 *   - Returns null when subscriptions is empty.
 *
 * Mock strategy:
 *   - useSessionQuery: returns a controlled value set per test.
 *   - Recharts: stubs that render data-testid elements for assertion.
 *   - @/components/ui/select: native <select>/<option> stub (avoids Radix portal).
 *   - MemoryRouter wraps DrawdownChart (it uses <Link>).
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

// ---------------------------------------------------------------------------
// Recharts mock — stubs that expose data-testid attributes for assertions.
// ResponsiveContainer collapses to a plain div (JSDOM has no resize observer).
// Bar and Line render visible elements with their dataKey/name/fillOpacity.
// ---------------------------------------------------------------------------

vi.mock("recharts", () => ({
  ResponsiveContainer: ({
    children,
  }: {
    children: React.ReactNode;
  }) => <div data-testid="responsive-container">{children}</div>,

  ComposedChart: ({
    children,
  }: {
    children: React.ReactNode;
  }) => <div data-testid="composed-chart">{children}</div>,

  Bar: ({
    dataKey,
    name,
    fillOpacity,
  }: {
    dataKey: string;
    name: string;
    fillOpacity?: number;
  }) => (
    <div
      data-testid={`bar-${dataKey}`}
      data-name={name}
      data-fill-opacity={fillOpacity ?? 1}
    />
  ),

  Line: ({
    dataKey,
    name,
  }: {
    dataKey: string;
    name: string;
  }) => <div data-testid={`line-${dataKey}`} data-name={name} />,

  XAxis: () => null,
  YAxis: () => null,
  CartesianGrid: () => null,
  Tooltip: () => null,
  Legend: () => null,

  ReferenceLine: ({
    x,
  }: {
    x?: string | number;
  }) => (
    <div data-testid="today-reference-line" data-x={x} />
  ),
}));

// ---------------------------------------------------------------------------
// Shadcn Select mock — replaces Radix Portal with a plain native select.
// ---------------------------------------------------------------------------

vi.mock("@/components/ui/select", () => ({
  Select: ({
    children,
    value,
    onValueChange,
  }: {
    children: React.ReactNode;
    value: string;
    onValueChange: (v: string) => void;
  }) => (
    <select
      data-testid="subscription-select"
      value={value}
      onChange={(e) => onValueChange(e.target.value)}
    >
      {children}
    </select>
  ),
  SelectTrigger: ({ children }: { children: React.ReactNode }) => (
    <>{children}</>
  ),
  SelectValue: () => null,
  SelectContent: ({ children }: { children: React.ReactNode }) => (
    <>{children}</>
  ),
  SelectItem: ({
    children,
    value,
  }: {
    children: React.ReactNode;
    value: string;
  }) => <option value={value}>{children}</option>,
}));

// ---------------------------------------------------------------------------
// useSessionQuery mock
// ---------------------------------------------------------------------------

let mockQueryReturnValue: unknown = undefined;
const useSessionQueryMock = vi.fn(() => mockQueryReturnValue);

vi.mock("convex-helpers/react/sessions", () => ({
  useSessionQuery: (...args: unknown[]) => useSessionQueryMock(...args),
  useSessionMutation: vi.fn(() => vi.fn()),
}));

// ---------------------------------------------------------------------------
// api mock — canonical NESTED path api.crm.drawdown.getCustomerDrawdown.
// We mock the module so the component receives a predictable string ref instead
// of the anyApi Proxy (which pretty-format cannot serialize on assertion diff).
// ---------------------------------------------------------------------------

vi.mock("../../../../convex/_generated/api", () => ({
  api: {
    crm: {
      drawdown: {
        getCustomerDrawdown: "crm__drawdown__getCustomerDrawdown_ref",
      },
    },
  },
}));

// ---------------------------------------------------------------------------
// Imports (after mocks)
// ---------------------------------------------------------------------------

import { DrawdownChart } from "../DrawdownChart";
import { SubscriptionSelector } from "../SubscriptionSelector";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const CUSTOMER_ID = "cust_abc123" as const;
const SUB_ID_A = "sub_aaaa111" as const;
const SUB_ID_B = "sub_bbbb222" as const;

// A single DrawdownPoint representing a past day (Monday WIB ~2026-06-23)
const PAST_POINT = {
  date: 1_750_636_800_000, // Mon 2026-06-23 UTC (WIB midnight = Monday)
  deliveredPcs: 5,
  plannedPcs: 6,
  creditRemaining: 450_000,
  isPast: true,
};

// A future day (Tuesday)
const FUTURE_POINT = {
  date: 1_750_723_200_000, // Tue 2026-06-24
  deliveredPcs: 0,
  plannedPcs: 6,
  creditRemaining: 300_000,
  isPast: false,
};

const SERIES_WITH_DATA = {
  week: {
    _id: "week_001",
    _creationTime: 1_750_000_000_000,
    subscriptionId: SUB_ID_A,
    weekStart: 1_750_636_800_000,
    status: "delivering",
    plannedDays: [],
  },
  series: {
    points: [PAST_POINT, FUTURE_POINT],
    leftoverFlag: false,
  },
};

const SERIES_WITH_LEFTOVER = {
  ...SERIES_WITH_DATA,
  series: {
    points: [PAST_POINT, FUTURE_POINT],
    leftoverFlag: true,
  },
};

// ---------------------------------------------------------------------------
// Render helper
// ---------------------------------------------------------------------------

function renderChart(props: {
  subscriptionId?: string;
  subscriptionLabel?: string | null;
  customerId?: string;
}) {
  return render(
    <MemoryRouter>
      <DrawdownChart
        subscriptionId={(props.subscriptionId ?? SUB_ID_A) as typeof SUB_ID_A}
        subscriptionLabel={props.subscriptionLabel}
        customerId={(props.customerId ?? CUSTOMER_ID) as typeof CUSTOMER_ID}
      />
    </MemoryRouter>,
  );
}

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

beforeEach(() => {
  vi.clearAllMocks();
  mockQueryReturnValue = undefined;
  useSessionQueryMock.mockImplementation(() => mockQueryReturnValue);
});

// ---------------------------------------------------------------------------
// DrawdownChart tests
// ---------------------------------------------------------------------------

describe("DrawdownChart — loading state", () => {
  it("shows skeleton when query returns undefined", () => {
    mockQueryReturnValue = undefined;
    const { container } = renderChart({});
    // ChartFrame renders data-chart-skeleton in loading mode
    expect(container.querySelector("[data-chart-skeleton]")).not.toBeNull();
  });

  it("does NOT render the chart in loading state", () => {
    mockQueryReturnValue = undefined;
    renderChart({});
    expect(screen.queryByTestId("composed-chart")).not.toBeInTheDocument();
  });
});

describe("DrawdownChart — empty / null states (D12)", () => {
  it("shows empty-state message when result is null", () => {
    mockQueryReturnValue = null;
    renderChart({});
    expect(
      screen.getByText(/no drawdown data for the current week/i),
    ).toBeInTheDocument();
  });

  it("shows empty-state message when points array is empty", () => {
    mockQueryReturnValue = {
      week: { _id: "week_001", weekStart: 0, status: "delivering", plannedDays: [] },
      series: { points: [], leftoverFlag: false },
    };
    renderChart({});
    expect(
      screen.getByText(/no drawdown data for the current week/i),
    ).toBeInTheDocument();
  });

  it("does NOT render the chart in empty state", () => {
    mockQueryReturnValue = null;
    renderChart({});
    expect(screen.queryByTestId("composed-chart")).not.toBeInTheDocument();
  });
});

describe("DrawdownChart — title names the subscription (A1)", () => {
  it("shows the subscriptionLabel in the title", () => {
    mockQueryReturnValue = SERIES_WITH_DATA;
    renderChart({ subscriptionLabel: "Mon–Fri box" });
    expect(screen.getByText(/Mon–Fri box/i)).toBeInTheDocument();
  });

  it("falls back to truncated ID when no label provided", () => {
    mockQueryReturnValue = SERIES_WITH_DATA;
    renderChart({ subscriptionId: SUB_ID_A, subscriptionLabel: null });
    // Last 6 chars of "sub_aaaa111" = "aaa111"
    expect(screen.getByText(/aaa111/)).toBeInTheDocument();
  });

  it("title is a link to the subscription page (A1)", () => {
    mockQueryReturnValue = SERIES_WITH_DATA;
    renderChart({
      subscriptionId: SUB_ID_A,
      subscriptionLabel: "Mon–Fri box",
      customerId: CUSTOMER_ID,
    });
    const link = screen.getByRole("link", { name: /Credit drawdown/i });
    expect((link as HTMLAnchorElement).href).toContain(
      `/crm/customers/${CUSTOMER_ID}/subscriptions/${SUB_ID_A}`,
    );
  });
});

describe("DrawdownChart — bar + line series", () => {
  it("renders solid Delivered bar (dataKey=deliveredPcs)", () => {
    mockQueryReturnValue = SERIES_WITH_DATA;
    renderChart({});
    const bar = screen.getByTestId("bar-deliveredPcs");
    expect(bar).toBeInTheDocument();
    expect(bar.getAttribute("data-name")).toBe("Delivered");
  });

  it("renders lighter Planned bar with fillOpacity < 1", () => {
    mockQueryReturnValue = SERIES_WITH_DATA;
    renderChart({});
    const bar = screen.getByTestId("bar-plannedPcs");
    expect(bar).toBeInTheDocument();
    expect(bar.getAttribute("data-name")).toBe("Planned");
    // fillOpacity must be less than 1 to visually distinguish from the solid bar
    const opacity = Number(bar.getAttribute("data-fill-opacity"));
    expect(opacity).toBeLessThan(1);
  });

  it("renders credit-remaining Line on right axis", () => {
    mockQueryReturnValue = SERIES_WITH_DATA;
    renderChart({});
    const line = screen.getByTestId("line-creditRemaining");
    expect(line).toBeInTheDocument();
    expect(line.getAttribute("data-name")).toBe("Credit remaining");
  });
});

describe("DrawdownChart — leftover-credit flag", () => {
  it("shows 'Unspent credit' badge when leftoverFlag is true", () => {
    mockQueryReturnValue = SERIES_WITH_LEFTOVER;
    renderChart({});
    expect(screen.getByText(/Unspent credit/i)).toBeInTheDocument();
  });

  it("does NOT show 'Unspent credit' badge when leftoverFlag is false", () => {
    mockQueryReturnValue = SERIES_WITH_DATA; // leftoverFlag: false
    renderChart({});
    expect(screen.queryByText(/Unspent credit/i)).not.toBeInTheDocument();
  });

  it("leftover flag is NOT shown in empty state even if data were to have it", () => {
    // Safety check: empty state never shows leftoverFlag
    mockQueryReturnValue = null;
    renderChart({});
    expect(screen.queryByText(/Unspent credit/i)).not.toBeInTheDocument();
  });
});

describe("DrawdownChart — query arg changes when subscriptionId prop changes", () => {
  // Avoid toHaveBeenCalledWith on the api ref (anyApi returns a Proxy that
  // pretty-format can't serialize). Instead, inspect mock.calls directly and
  // check only the second argument (the query variables).
  function getDrawdownSubscriptionIds(): string[] {
    return useSessionQueryMock.mock.calls
      .filter(
        (call) =>
          call.length >= 2 &&
          call[1] !== null &&
          typeof call[1] === "object" &&
          "subscriptionId" in (call[1] as object),
      )
      .map((call) => (call[1] as { subscriptionId: string }).subscriptionId);
  }

  it("calls useSessionQuery with the current subscriptionId", () => {
    mockQueryReturnValue = SERIES_WITH_DATA;
    renderChart({ subscriptionId: SUB_ID_A });
    expect(getDrawdownSubscriptionIds()).toContain(SUB_ID_A);
  });

  it("re-calls useSessionQuery with the new subscriptionId when prop changes", () => {
    mockQueryReturnValue = SERIES_WITH_DATA;
    const { rerender } = render(
      <MemoryRouter>
        <DrawdownChart
          subscriptionId={SUB_ID_A as typeof SUB_ID_A}
          customerId={CUSTOMER_ID as typeof CUSTOMER_ID}
        />
      </MemoryRouter>,
    );

    expect(getDrawdownSubscriptionIds()).toContain(SUB_ID_A);

    useSessionQueryMock.mockClear();

    rerender(
      <MemoryRouter>
        <DrawdownChart
          subscriptionId={SUB_ID_B as typeof SUB_ID_B}
          customerId={CUSTOMER_ID as typeof CUSTOMER_ID}
        />
      </MemoryRouter>,
    );

    expect(getDrawdownSubscriptionIds()).toContain(SUB_ID_B);
  });
});

// ---------------------------------------------------------------------------
// SubscriptionSelector tests
// ---------------------------------------------------------------------------

describe("SubscriptionSelector — option labels", () => {
  it("renders an option for each subscription with its label", () => {
    const subs = [
      { _id: SUB_ID_A as typeof SUB_ID_A, label: "Mon–Fri box" },
      { _id: SUB_ID_B as typeof SUB_ID_B, label: "Weekend plan" },
    ];
    render(
      <SubscriptionSelector
        subscriptions={subs}
        value={SUB_ID_A as typeof SUB_ID_A}
        onChange={vi.fn()}
      />,
    );
    expect(screen.getByText("Mon–Fri box")).toBeInTheDocument();
    expect(screen.getByText("Weekend plan")).toBeInTheDocument();
  });

  it("renders truncated ID fallback when label is null", () => {
    const subs = [{ _id: SUB_ID_A as typeof SUB_ID_A, label: null }];
    render(
      <SubscriptionSelector
        subscriptions={subs}
        value={SUB_ID_A as typeof SUB_ID_A}
        onChange={vi.fn()}
      />,
    );
    // Last 6 chars of "sub_aaaa111"
    expect(screen.getByText(/aaa111/)).toBeInTheDocument();
  });

  it("returns null when subscriptions is empty", () => {
    const { container } = render(
      <SubscriptionSelector
        subscriptions={[]}
        value={SUB_ID_A as typeof SUB_ID_A}
        onChange={vi.fn()}
      />,
    );
    expect(container.firstChild).toBeNull();
  });
});

describe("SubscriptionSelector — onChange callback", () => {
  it("calls onChange with the selected subscription ID when changed", () => {
    const onChangeMock = vi.fn();
    const subs = [
      { _id: SUB_ID_A as typeof SUB_ID_A, label: "Mon–Fri box" },
      { _id: SUB_ID_B as typeof SUB_ID_B, label: "Weekend plan" },
    ];
    render(
      <SubscriptionSelector
        subscriptions={subs}
        value={SUB_ID_A as typeof SUB_ID_A}
        onChange={onChangeMock}
      />,
    );
    const selectEl = screen.getByTestId("subscription-select");
    fireEvent.change(selectEl, { target: { value: SUB_ID_B } });
    expect(onChangeMock).toHaveBeenCalledWith(SUB_ID_B);
  });
});
