import type { ComponentType } from "react";

export interface WalkthroughStep {
  id: string;
  title: string;
  description: string;
  tip?: string;
  warning?: string;
}

export interface MockPanelProps {
  currentStep: number;
  breadcrumb: string;
}

export interface WalkthroughWorkflow {
  id: string;
  label: string;
  steps: WalkthroughStep[];
  mockComponent: ComponentType<MockPanelProps>;
  getBreadcrumb: (step: number) => string;
}
