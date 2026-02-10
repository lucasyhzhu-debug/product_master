/**
 * Ball Type Configuration
 *
 * Shared ball type definitions and configuration for the kitchen UI.
 * Centralizes the mapping between UI ball types and production unit codes.
 *
 * IMPORTANT: The corrected mapping is:
 *   - "original" (45g) -> MID_BALL (smaller ball)
 *   - "bite_sized" / "jumbo" (80g) -> BIG_BALL (larger ball)
 *
 * The DB field names remain unchanged:
 *   - originalBallCount  -> tracks "original" (45g, MID_BALL) inventory
 *   - biteSizedBallCount -> tracks "jumbo" (80g, BIG_BALL) inventory
 */

// UI-facing ball type (matches DB field naming convention)
export type BallType = 'original' | 'bite_sized' | 'jumbo';

// Canonical/normalized ball type used in production system
export type NormalizedBallType = 'big' | 'mid';

export interface BallConfig {
  fill: string;
  stroke: string;
  name: string;
  displayName: string;
  grams: number;
  productionUnitCode: string;
  svgRx: number;
  svgRy: number;
  highlightRx: number;
  highlightRy: number;
  highlightCx: number;
  highlightCy: number;
}

/**
 * SVG display sizes for ball rendering.
 * "big" = physically larger ball (80g) = larger SVG ellipse
 * "mid" = physically smaller ball (45g) = smaller SVG ellipse
 */
export const BALL_DISPLAY_SIZES = {
  big: { svgRx: 12, svgRy: 11, highlightRx: 3.5, highlightRy: 2.5, highlightCx: 9, highlightCy: 8 },
  mid: { svgRx: 9, svgRy: 8.5, highlightRx: 2.5, highlightRy: 2, highlightCx: 10, highlightCy: 7 },
} as const;

/**
 * Ball configuration keyed by UI ball type.
 *
 * - "original" = 45g = MID_BALL = smaller SVG
 * - "bite_sized" = 80g = BIG_BALL = larger SVG (alias: "jumbo")
 * - "jumbo" = same as "bite_sized"
 */
export const BALL_CONFIG: Record<string, BallConfig> = {
  original: {
    fill: '#93C572',
    stroke: '#7B3F00',
    name: 'Original Balls',
    displayName: 'Original',
    grams: 45,
    productionUnitCode: 'MID_BALL',
    ...BALL_DISPLAY_SIZES.mid,
  },
  bite_sized: {
    fill: '#93C572',
    stroke: '#7B3F00',
    name: 'Jumbo Balls',
    displayName: 'Jumbo',
    grams: 80,
    productionUnitCode: 'BIG_BALL',
    ...BALL_DISPLAY_SIZES.big,
  },
  jumbo: {
    fill: '#93C572',
    stroke: '#7B3F00',
    name: 'Jumbo Balls',
    displayName: 'Jumbo',
    grams: 80,
    productionUnitCode: 'BIG_BALL',
    ...BALL_DISPLAY_SIZES.big,
  },
};

/**
 * Normalize a ball type string to its canonical form.
 *
 * Corrected mapping:
 *   - "original" / "mid" -> "mid" (45g, MID_BALL)
 *   - "bite_sized" / "jumbo" / "big" -> "big" (80g, BIG_BALL)
 */
export function normalizeBallType(ballType: string): NormalizedBallType {
  switch (ballType) {
    case 'original':
    case 'mid':
      return 'mid';
    case 'bite_sized':
    case 'jumbo':
    case 'big':
      return 'big';
    default:
      throw new Error(`Invalid ball type: ${ballType}`);
  }
}

/**
 * Get the production unit code for a ball type.
 * "original" -> "MID_BALL" (45g)
 * "bite_sized" / "jumbo" -> "BIG_BALL" (80g)
 */
export function getProductionUnitCode(ballType: string): string {
  const normalized = normalizeBallType(ballType);
  return normalized === 'big' ? 'BIG_BALL' : 'MID_BALL';
}

/**
 * Get the tray inventory field name for a ball type.
 * DB field names are unchanged from the original schema:
 *   - "original" -> "originalBallCount"
 *   - "bite_sized" / "jumbo" -> "biteSizedBallCount"
 */
export function getTrayFieldName(ballType: BallType): 'originalBallCount' | 'biteSizedBallCount' {
  return ballType === 'original' ? 'originalBallCount' : 'biteSizedBallCount';
}
