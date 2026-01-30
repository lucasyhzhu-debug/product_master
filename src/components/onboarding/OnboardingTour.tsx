import { useOnboardingTour } from '@/hooks/useOnboardingTour';

interface OnboardingTourProps {
  /**
   * Whether to automatically start the tour for first-time users.
   * Tour will only auto-start if localStorage flag is not set.
   */
  autoStart?: boolean;
  /**
   * External condition to trigger auto-start (e.g., empty database).
   * Both autoStart and shouldStart must be true for auto-start.
   */
  shouldStart?: boolean;
}

/**
 * Onboarding tour component that renders nothing visible.
 * Driver.js handles all the UI rendering.
 *
 * @example
 * ```tsx
 * // Auto-start for first-time users when database is empty
 * <OnboardingTour
 *   autoStart
 *   shouldStart={products.length === 0 && recipes.length === 0}
 * />
 * ```
 */
export function OnboardingTour({
  autoStart = true,
  shouldStart = false,
}: OnboardingTourProps) {
  // Initialize the tour hook - it handles auto-start internally
  useOnboardingTour(autoStart && shouldStart);

  // This component doesn't render anything visible
  // Driver.js handles all the tour UI
  return null;
}
