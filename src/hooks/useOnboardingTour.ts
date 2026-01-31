import { useCallback, useEffect, useRef } from 'react';
import { driver, type Driver } from 'driver.js';
import 'driver.js/dist/driver.css';
import '@/styles/driver-overrides.css';
import { DASHBOARD_TOUR_STEPS } from '@/components/onboarding/tour-steps';

const TOUR_COMPLETED_KEY = 'malo_onboarding_completed';

/**
 * Check if the user has already completed or skipped the onboarding tour.
 */
function hasCompletedTour(): boolean {
  try {
    return localStorage.getItem(TOUR_COMPLETED_KEY) === 'true';
  } catch {
    // Handle private browsing mode where localStorage may not be available
    return false;
  }
}

/**
 * Mark the onboarding tour as completed in localStorage.
 */
function markTourCompleted(): void {
  try {
    localStorage.setItem(TOUR_COMPLETED_KEY, 'true');
  } catch {
    // Silently fail in private browsing mode
  }
}

/**
 * Hook to manage the onboarding product tour using Driver.js.
 *
 * @param autoStart - If true, automatically starts the tour for first-time users
 * @returns Object with startTour and stopTour functions
 *
 * @example
 * ```tsx
 * const { startTour } = useOnboardingTour(isNewUser);
 *
 * // Manually trigger tour
 * <Button onClick={startTour}>Start Tour</Button>
 * ```
 */
export function useOnboardingTour(autoStart: boolean = false) {
  const driverRef = useRef<Driver | null>(null);

  // Initialize driver instance
  useEffect(() => {
    driverRef.current = driver({
      showProgress: true,
      showButtons: ['next', 'previous', 'close'],
      steps: DASHBOARD_TOUR_STEPS,
      overlayOpacity: 0.6,
      stagePadding: 12,
      stageRadius: 10,
      allowClose: true,
      smoothScroll: true,
      popoverOffset: 16, // Distance between popover and highlighted element
      onDestroyStarted: () => {
        // Mark tour as completed when user finishes or closes it
        markTourCompleted();
      },
    });

    return () => {
      driverRef.current?.destroy();
    };
  }, []);

  // Auto-start for first-time users
  useEffect(() => {
    if (autoStart && !hasCompletedTour()) {
      // Small delay to ensure DOM elements are rendered
      const timeout = setTimeout(() => {
        driverRef.current?.drive();
      }, 500);
      return () => clearTimeout(timeout);
    }
  }, [autoStart]);

  const startTour = useCallback(() => {
    driverRef.current?.drive();
  }, []);

  const stopTour = useCallback(() => {
    driverRef.current?.destroy();
  }, []);

  return { startTour, stopTour, hasCompletedTour };
}
