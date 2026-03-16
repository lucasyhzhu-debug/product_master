import { type ReactNode } from "react";
import { Lightbulb, AlertTriangle, Info } from "lucide-react";

const calloutConfig = {
  tip: {
    Icon: Lightbulb,
    containerStyle: {
      borderLeftColor: "var(--color-status-success)",
      backgroundColor: "var(--color-status-success-bg)",
    },
    iconStyle: { color: "var(--color-status-success)" },
  },
  warning: {
    Icon: AlertTriangle,
    containerStyle: {
      borderLeftColor: "var(--color-status-warning)",
      backgroundColor: "var(--color-status-warning-bg)",
    },
    iconStyle: { color: "var(--color-status-warning)" },
  },
  important: {
    Icon: Info,
    containerStyle: {
      borderLeftColor: "var(--color-status-error)",
      backgroundColor: "var(--color-status-error-bg)",
    },
    iconStyle: { color: "var(--color-status-error)" },
  },
} as const;

interface CalloutBoxProps {
  type: "tip" | "warning" | "important";
  children: ReactNode;
}

export function CalloutBox({ type, children }: CalloutBoxProps) {
  const config = calloutConfig[type];
  const { Icon } = config;

  return (
    <div
      className="border-l-4 rounded-r-lg p-4 flex gap-3"
      style={config.containerStyle}
    >
      <Icon className="h-5 w-5 shrink-0 mt-0.5" style={config.iconStyle} />
      <div>{children}</div>
    </div>
  );
}
