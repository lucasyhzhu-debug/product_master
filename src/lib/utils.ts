import { type ClassValue, clsx } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function formatCurrency(amount: number | null | undefined): string {
  if (amount == null) return "-"
  return new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount)
}

export function formatNumber(value: number | null | undefined, decimals = 2): string {
  if (value == null) return "-"
  return value.toLocaleString("id-ID", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  })
}

export function formatPercent(value: number | null | undefined): string {
  if (value == null) return "-"
  return `${value.toFixed(1)}%`
}

export function getErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof Error) return error.message
  if (typeof error === "string") return error
  return fallback
}

// Consumption stage: DB value -> UI label mapping
export const CONSUMPTION_STAGE_LABELS: Record<string, string> = {
  production: "Production",
  boxing: "Packaging",
  labeling: "Labelling",
  none: "Non-Production Component",
}

// Selectable stages (excludes legacy "none")
export const SELECTABLE_STAGES = ["production", "boxing", "labeling", "none"] as const
export type SelectableStage = typeof SELECTABLE_STAGES[number]
