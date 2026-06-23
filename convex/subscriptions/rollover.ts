export function computeRolloverExpiry(args: {
  unconsumed: number;
  policy: "expire" | "rollover";
  rolloverExpiryWeeks: number | null;
  weeksCarried: number;
}): { action: "expire" | "carry"; amount: number } {
  const { unconsumed, policy, rolloverExpiryWeeks, weeksCarried } = args;
  if (policy === "expire") return { action: "expire", amount: unconsumed };
  if (rolloverExpiryWeeks === null) return { action: "carry", amount: unconsumed };
  if (weeksCarried >= rolloverExpiryWeeks) return { action: "expire", amount: unconsumed };
  return { action: "carry", amount: unconsumed };
}
