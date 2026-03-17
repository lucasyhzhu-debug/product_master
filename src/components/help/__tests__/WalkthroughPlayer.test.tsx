import { render, screen, fireEvent, act } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { WalkthroughPlayer } from "../WalkthroughPlayer";
import type { WalkthroughWorkflow } from "../walkthrough/types";

// Mock framer-motion to avoid AnimatePresence blocking in JSDOM
vi.mock("framer-motion", () => ({
  AnimatePresence: ({ children }: { children: React.ReactNode }) => children,
  motion: {
    div: ({
      children,
      ...props
    }: React.HTMLAttributes<HTMLDivElement> & { children?: React.ReactNode }) => (
      <div {...props}>{children}</div>
    ),
  },
}));

// Minimal mock component for testing
function MockPanel({
  currentStep,
  breadcrumb,
}: {
  currentStep: number;
  breadcrumb: string;
}) {
  return (
    <div data-testid="mock-panel">
      Step {currentStep} | {breadcrumb}
    </div>
  );
}

function createTestWorkflows(
  overrides?: Partial<WalkthroughWorkflow>[]
): WalkthroughWorkflow[] {
  return [
    {
      id: "workflow-a",
      label: "Workflow A",
      steps: [
        {
          id: "a-1",
          title: "Step A1",
          description: "Desc A1",
          tip: "Tip for A1",
        },
        {
          id: "a-2",
          title: "Step A2",
          description: "Desc A2",
          warning: "Warning for A2",
        },
        { id: "a-3", title: "Step A3", description: "Desc A3" },
      ],
      mockComponent: MockPanel,
      getBreadcrumb: (step: number) => `Breadcrumb A > Step ${step}`,
      ...overrides?.[0],
    },
    {
      id: "workflow-b",
      label: "Workflow B",
      steps: [
        { id: "b-1", title: "Step B1", description: "Desc B1" },
        { id: "b-2", title: "Step B2", description: "Desc B2" },
      ],
      mockComponent: MockPanel,
      getBreadcrumb: (step: number) => `Breadcrumb B > Step ${step}`,
      ...overrides?.[1],
    },
  ];
}

describe("WalkthroughPlayer", () => {
  it("resets step to 0 when switching tabs", () => {
    render(<WalkthroughPlayer workflows={createTestWorkflows()} />);
    // Navigate to step A3 (index 2) via mobile pill (visible in JSDOM)
    fireEvent.click(screen.getByText("3. Step A3"));
    expect(screen.getByTestId("mock-panel").textContent).toContain("Step 2");
    // Switch to Workflow B
    fireEvent.click(screen.getByText("Workflow B"));
    expect(screen.getByTestId("mock-panel").textContent).toContain("Step 0");
  });

  it("ArrowRight does not advance past last step", () => {
    const { container } = render(
      <WalkthroughPlayer workflows={createTestWorkflows()} />
    );
    const wrapper = container.firstElementChild as HTMLElement;
    // Fire ArrowRight 5 times (workflow A has 3 steps, max index = 2)
    for (let i = 0; i < 5; i++) {
      fireEvent.keyDown(wrapper, { key: "ArrowRight" });
    }
    expect(screen.getByTestId("mock-panel").textContent).toContain("Step 2");
  });

  it("ArrowLeft does not go below step 0", () => {
    const { container } = render(
      <WalkthroughPlayer workflows={createTestWorkflows()} />
    );
    const wrapper = container.firstElementChild as HTMLElement;
    fireEvent.keyDown(wrapper, { key: "ArrowLeft" });
    expect(screen.getByTestId("mock-panel").textContent).toContain("Step 0");
  });

  it("renders CalloutBox for tip", () => {
    render(<WalkthroughPlayer workflows={createTestWorkflows()} />);
    // Step A1 (default) has tip
    expect(screen.getByText("Tip for A1")).toBeInTheDocument();
  });

  it("renders CalloutBox for warning", () => {
    render(<WalkthroughPlayer workflows={createTestWorkflows()} />);
    // Navigate to Step A2 which has warning
    fireEvent.click(screen.getByText("2. Step A2"));
    expect(screen.getByText("Warning for A2")).toBeInTheDocument();
  });

  it("does not render CalloutBox when step has neither tip nor warning", () => {
    render(<WalkthroughPlayer workflows={createTestWorkflows()} />);
    // Navigate to Step A3 which has no tip/warning
    fireEvent.click(screen.getByText("3. Step A3"));
    expect(screen.queryByText("Tip for A1")).not.toBeInTheDocument();
    expect(screen.queryByText("Warning for A2")).not.toBeInTheDocument();
  });

  it("clicking a step button updates mock panel (free navigation)", () => {
    render(<WalkthroughPlayer workflows={createTestWorkflows()} />);
    fireEvent.click(screen.getByText("3. Step A3"));
    expect(screen.getByTestId("mock-panel").textContent).toContain("Step 2");
  });

  it("uses getBreadcrumb from workflow data", () => {
    const workflows = createTestWorkflows([
      { getBreadcrumb: () => "Custom Crumb" },
    ]);
    render(<WalkthroughPlayer workflows={workflows} />);
    expect(screen.getByTestId("mock-panel").textContent).toContain(
      "Custom Crumb"
    );
  });
});
