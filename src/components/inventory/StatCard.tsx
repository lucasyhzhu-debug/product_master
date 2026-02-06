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
  variant?: "primary" | "success" | "warning" | "danger" | "default";
}

const variantStyles = {
  primary: "bg-gradient-to-br from-slate-700 to-slate-800 text-slate-100",
  success: "bg-gradient-to-br from-emerald-900/40 to-emerald-800/30 text-emerald-100 border-emerald-800",
  warning: "bg-gradient-to-br from-amber-900/40 to-amber-800/30 text-amber-100 border-amber-800",
  danger: "bg-gradient-to-br from-red-900/40 to-red-800/30 text-red-100 border-red-800",
  default: "bg-gradient-to-br from-slate-700 to-slate-800 text-slate-100",
};

export function StatCard({ title, value, icon, variant = "default" }: StatCardProps) {
  return (
    <Card className={cn(
      "border-slate-700 shadow-lg",
      variantStyles[variant]
    )}>
      <CardContent className="p-6">
        <div className="flex items-center justify-between mb-3">
          <div className="p-2 rounded-lg bg-white/10">
            {icon}
          </div>
        </div>
        <div className="space-y-1">
          <p className="text-base font-semibold text-slate-100">{title}</p>
          <p className="text-3xl font-mono font-bold tracking-tight">{value}</p>
        </div>
      </CardContent>
    </Card>
  );
}
