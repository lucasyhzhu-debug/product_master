import { type ComponentType } from "react";
import { CalloutBox } from "./CalloutBox";

interface StepCardProps {
  step: number;
  title: string;
  description: string;
  icon?: ComponentType<{ className?: string }>;
  tip?: string;
  warning?: string;
  isLast?: boolean;
}

export function StepCard({
  step,
  title,
  description,
  icon: Icon,
  tip,
  warning,
  isLast,
}: StepCardProps) {
  return (
    <div className="relative flex gap-4">
      {/* Number circle + connector line */}
      <div className="relative flex flex-col items-center">
        <div className="w-8 h-8 rounded-full flex items-center justify-center bg-primary text-primary-foreground text-sm font-bold shrink-0">
          {step}
        </div>
        {!isLast && (
          <div
            className="absolute top-10 bottom-0 border-l-2 border-dashed"
            style={{
              borderColor: "var(--color-muted-foreground)",
              opacity: 0.3,
            }}
          />
        )}
      </div>

      {/* Content */}
      <div className="pb-8 flex-1 min-w-0">
        <div className="flex items-center gap-2">
          {Icon && (
            <Icon className="h-4 w-4 text-muted-foreground shrink-0" />
          )}
          <h3 className="font-semibold">{title}</h3>
        </div>
        <p className="text-muted-foreground text-sm mt-1">{description}</p>
        {tip && (
          <div className="mt-3">
            <CalloutBox type="tip">{tip}</CalloutBox>
          </div>
        )}
        {warning && (
          <div className="mt-3">
            <CalloutBox type="warning">{warning}</CalloutBox>
          </div>
        )}
      </div>
    </div>
  );
}
