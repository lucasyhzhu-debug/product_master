/**
 * Lifetime aggregation helpers for the hero card.
 * Pure functions that compute total balls and revenue from pre-fetched data.
 */
import type { Doc } from "../../_generated/dataModel";

/**
 * Fallback average revenue per ball in IDR, used only when zero BOM-linked
 * products exist (cold start / no product mappings yet).
 * Once any products are mapped, the dynamic weighted average takes over.
 */
const FALLBACK_REVENUE_PER_BALL = 35_000;

/**
 * Compute lifetime totals from pre-fetched table data.
 * Resolves BOM to count actual balls, computes dynamic avgRevenuePerBall.
 *
 * @param items - All externalRevenueItems records
 * @param revenues - All externalRevenue records
 * @param bomComponents - All menuProductComponents records
 * @param componentTypes - All componentTypes records
 */
export function computeLifetimeTotals(
  items: Doc<"externalRevenueItems">[],
  revenues: Doc<"externalRevenue">[],
  bomComponents: Doc<"menuProductComponents">[],
  componentTypes: Doc<"componentTypes">[]
): {
  totalBalls: number;
  lifetimeRevenue: number;
  lifetimeTransactions: number;
  avgRevenuePerBall: number;
} {
  // Build set of production component type IDs (BIG_BALL, MID_BALL, etc.)
  const productionComponentIds = new Set(
    componentTypes
      .filter((ct) => ct.category === "production")
      .map((ct) => ct._id as string)
  );

  // Build menuProductId -> total ball count map from BOM
  // A product with 1 BIG_BALL + 2 MID_BALL = 3 balls total
  const menuProductBallCount = new Map<string, number>();
  for (const comp of bomComponents) {
    if (productionComponentIds.has(comp.componentTypeId as string)) {
      const existing = menuProductBallCount.get(comp.menuProductId as string) ?? 0;
      menuProductBallCount.set(comp.menuProductId as string, existing + comp.quantity);
    }
  }

  // Calculate dynamic avgRevenuePerBall from BOM-linked items.
  // "Known" items have a linkedMenuProductId with production BOM components.
  // Their weighted average revenue/ball is used to estimate total balls from
  // all revenue (including unmapped items).
  let knownRevenue = 0;
  let knownBalls = 0;

  for (const item of items) {
    if (!item.linkedMenuProductId) continue;
    const ballsPerProduct = menuProductBallCount.get(item.linkedMenuProductId as string);
    if (!ballsPerProduct || ballsPerProduct <= 0) continue;
    // This item has a valid BOM mapping with production components
    knownRevenue += item.totalPrice;
    knownBalls += item.quantity * ballsPerProduct;
  }

  // Aggregate lifetime totals from externalRevenue
  let lifetimeRevenue = 0;
  let lifetimeTransactions = 0;
  for (const rev of revenues) {
    lifetimeRevenue += rev.revenueGross ?? 0;
    lifetimeTransactions += rev.transactionCount ?? 1;
  }

  // Dynamic weighted average: revenue / balls from known products.
  // Falls back to FALLBACK_REVENUE_PER_BALL when no known products exist.
  const avgRevenuePerBall = knownBalls > 0
    ? knownRevenue / knownBalls
    : FALLBACK_REVENUE_PER_BALL;

  // Estimate total balls sold from lifetime gross revenue
  const totalBalls = lifetimeRevenue > 0
    ? Math.round(lifetimeRevenue / avgRevenuePerBall)
    : 0;

  return { totalBalls, lifetimeRevenue, lifetimeTransactions, avgRevenuePerBall };
}
