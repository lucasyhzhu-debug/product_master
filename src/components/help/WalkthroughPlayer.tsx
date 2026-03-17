import { useState, useEffect, useRef } from "react";
import { Check } from "lucide-react";
import { AnimatePresence, motion } from "framer-motion";
import { cn } from "@/lib/utils";
import { CalloutBox } from "./CalloutBox";
import type { WalkthroughWorkflow } from "./walkthrough/types";

// ---------------------------------------------------------------------------
// WalkthroughPlayer -- generic reusable walkthrough engine
// ---------------------------------------------------------------------------

interface WalkthroughPlayerProps {
  workflows: WalkthroughWorkflow[];
  defaultWorkflow?: string;
}

export function WalkthroughPlayer({
  workflows,
  defaultWorkflow,
}: WalkthroughPlayerProps) {
  const [activeWorkflowId, setActiveWorkflowId] = useState(
    defaultWorkflow ?? workflows[0]?.id ?? ""
  );
  const [activeStep, setActiveStep] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);

  const activeWorkflow =
    workflows.find((w) => w.id === activeWorkflowId) ?? workflows[0];
  const steps = activeWorkflow?.steps ?? [];
  const currentStepData = steps[activeStep];
  const breadcrumb = activeWorkflow?.getBreadcrumb(activeStep) ?? "";
  const MockComponent = activeWorkflow?.mockComponent;

  // Keyboard navigation
  useEffect(() => {
    const el = containerRef.current;
    if (!el || steps.length === 0) return;

    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "ArrowRight") {
        e.preventDefault();
        setActiveStep((prev) => Math.min(prev + 1, steps.length - 1));
      } else if (e.key === "ArrowLeft") {
        e.preventDefault();
        setActiveStep((prev) => Math.max(prev - 1, 0));
      }
    }

    el.addEventListener("keydown", handleKeyDown);
    return () => el.removeEventListener("keydown", handleKeyDown);
  }, [steps.length]);

  if (!activeWorkflow || workflows.length === 0) return null;

  return (
    <div ref={containerRef} tabIndex={-1} className="outline-none">
      {/* Tab bar */}
      <div role="tablist" className="flex gap-1 mb-4 flex-wrap">
        {workflows.map((w) => (
          <button
            key={w.id}
            role="tab"
            id={`walkthrough-tab-${w.id}`}
            aria-selected={w.id === activeWorkflowId}
            aria-controls={`walkthrough-panel-${w.id}`}
            onClick={() => {
              setActiveWorkflowId(w.id);
              setActiveStep(0);
            }}
            className={cn(
              "px-4 py-2 rounded-lg text-sm font-medium transition-colors",
              w.id === activeWorkflowId
                ? "bg-primary text-primary-foreground"
                : "bg-muted text-muted-foreground hover:bg-muted/80"
            )}
          >
            {w.label}
          </button>
        ))}
      </div>

      {/* Mobile step pills */}
      <div className="flex md:hidden overflow-x-auto whitespace-nowrap gap-2 mb-4 pb-1">
        {steps.map((step, i) => (
          <button
            key={step.id}
            onClick={() => setActiveStep(i)}
            className={cn(
              "px-3 py-1.5 rounded-full text-xs font-medium shrink-0 transition-colors",
              i === activeStep
                ? "bg-primary text-primary-foreground"
                : "bg-muted text-muted-foreground"
            )}
          >
            {i + 1}. {step.title}
          </button>
        ))}
      </div>

      {/* Main content: step nav + mock panel */}
      <div
        role="tabpanel"
        id={`walkthrough-panel-${activeWorkflowId}`}
        aria-labelledby={`walkthrough-tab-${activeWorkflowId}`}
        className="flex gap-6"
      >
        {/* Desktop step sidebar */}
        <nav
          aria-label="Steps"
          className="hidden md:flex flex-col w-56 shrink-0 gap-1"
        >
          {steps.map((step, i) => (
            <button
              key={step.id}
              onClick={() => setActiveStep(i)}
              aria-current={i === activeStep ? "step" : undefined}
              className={cn(
                "text-left px-3 py-2 rounded-md text-sm transition-colors flex items-center gap-2",
                i === activeStep &&
                  "border-l-2 border-indigo-400 bg-indigo-50 dark:bg-indigo-950/30 font-medium",
                i < activeStep && "text-muted-foreground",
                i > activeStep && "text-muted-foreground/60"
              )}
            >
              {i < activeStep && (
                <Check className="h-3.5 w-3.5 text-green-500 shrink-0" />
              )}
              <span className={i < activeStep ? "line-through decoration-muted-foreground/40" : ""}>
                {step.title}
              </span>
            </button>
          ))}
        </nav>

        {/* Mock panel + annotation */}
        <div className="flex-1 min-w-0">
          {/* Mock panel viewport */}
          <div role="region">
            <AnimatePresence mode="wait">
              <motion.div
                key={`${activeWorkflowId}-${activeStep}`}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.15 }}
              >
                {MockComponent && (
                  <MockComponent
                    currentStep={activeStep}
                    breadcrumb={breadcrumb}
                  />
                )}
              </motion.div>
            </AnimatePresence>
          </div>

          {/* Annotation area */}
          {currentStepData && (
            <div className="mt-4 space-y-3" aria-live="polite">
              <h4 className="font-semibold text-lg">{currentStepData.title}</h4>
              <p className="text-muted-foreground">
                {currentStepData.description}
              </p>
              {currentStepData.tip && (
                <CalloutBox type="tip">{currentStepData.tip}</CalloutBox>
              )}
              {currentStepData.warning && (
                <CalloutBox type="warning">
                  {currentStepData.warning}
                </CalloutBox>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
