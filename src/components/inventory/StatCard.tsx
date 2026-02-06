/**
 * StatCard - Inventory statistics display card
 */

import type { ReactNode } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";

interface StatCardProps {
  title: string;
  value: string | number;
  icon: ReactNode;
  variant?: "primary" | "success" | "warning" | "danger" | "terracotta" | "default";
}

const variantStyles = {
  primary: "bg-slate-900 text-white border-slate-700",
  success: "bg-slate-900 text-white border-emerald-700",
  warning: "bg-slate-900 text-white border-amber-700",
  danger: "bg-slate-900 text-white border-red-700",
  terracotta: "bg-slate-900 text-white border-[#E07856]/50",
  default: "bg-slate-900 text-white border-slate-700",
};

const iconStyles: Record<string, string> = {
  terracotta: "bg-[#E07856]/15 text-[#E07856]",
  danger: "bg-red-500/15 text-red-400",
  warning: "bg-amber-500/15 text-amber-400",
  success: "bg-emerald-500/15 text-emerald-400",
};

export function StatCard({ title, value, icon, variant = "default" }: StatCardProps) {
  return (
    <Card className={cn(
      "border-slate-700 shadow-lg",
      variantStyles[variant]
    )}>
      <CardContent className="p-6">
        <div className="flex items-center justify-between mb-3">
          <div className={cn(
            "p-2 rounded-lg",
            iconStyles[variant] || "bg-white/10"
          )}>
            {icon}
          </div>
        </div>
        <div className="space-y-1">
          <p className="text-base font-semibold text-slate-300">{title}</p>
          <p className="text-3xl font-mono font-bold tracking-tight text-white">{value}</p>
        </div>
      </CardContent>
    </Card>
  );
}
