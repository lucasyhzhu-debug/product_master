/**
 * Feature Flag System
 *
 * Provides client-side feature flags with localStorage persistence.
 * Used for gradual rollout of features like the Order Form Redesign.
 *
 * Usage:
 *   const useRedesign = useFeatureFlag('order_form_redesign', false);
 *
 * Toggle via browser console:
 *   localStorage.setItem('ff_order_form_redesign', 'true');
 *   location.reload();
 *
 * Or use the setFeatureFlag helper:
 *   import { setFeatureFlag } from '@/lib/featureFlags';
 *   setFeatureFlag('order_form_redesign', true);
 */

import { useState, useEffect } from 'react';

/**
 * Available feature flags
 */
export type FeatureFlagName =
  | 'order_form_redesign'  // New order form with terracotta theme
  ;

/**
 * Feature flag default values
 * Set to false for gradual rollout, true for immediate availability
 */
const FEATURE_FLAG_DEFAULTS: Record<FeatureFlagName, boolean> = {
  order_form_redesign: import.meta.env.DEV,  // Enabled in localhost, disabled in production
};

/**
 * Hook to read a feature flag value
 * Returns the stored value or the default if not set
 *
 * @param flag - The feature flag name
 * @param defaultValue - Optional override for the default value
 * @returns boolean - Whether the feature is enabled
 */
export function useFeatureFlag(
  flag: FeatureFlagName,
  defaultValue?: boolean
): boolean {
  const [enabled, setEnabled] = useState<boolean>(() => {
    if (typeof window === 'undefined') {
      return defaultValue ?? FEATURE_FLAG_DEFAULTS[flag] ?? false;
    }

    const stored = localStorage.getItem(`ff_${flag}`);
    if (stored !== null) {
      return stored === 'true';
    }
    return defaultValue ?? FEATURE_FLAG_DEFAULTS[flag] ?? false;
  });

  // Listen for storage changes (allows syncing across tabs)
  useEffect(() => {
    const handleStorageChange = (event: StorageEvent) => {
      if (event.key === `ff_${flag}`) {
        setEnabled(event.newValue === 'true');
      }
    };

    window.addEventListener('storage', handleStorageChange);
    return () => window.removeEventListener('storage', handleStorageChange);
  }, [flag]);

  return enabled;
}

/**
 * Set a feature flag value
 * Persists to localStorage and optionally reloads the page
 *
 * @param flag - The feature flag name
 * @param enabled - Whether to enable or disable the feature
 * @param reload - Whether to reload the page after setting (default: true)
 */
export function setFeatureFlag(
  flag: FeatureFlagName,
  enabled: boolean,
  reload: boolean = true
): void {
  localStorage.setItem(`ff_${flag}`, String(enabled));

  // Dispatch storage event for other tabs
  window.dispatchEvent(new StorageEvent('storage', {
    key: `ff_${flag}`,
    newValue: String(enabled),
  }));

  if (reload) {
    window.location.reload();
  }
}

/**
 * Get all feature flags and their current values
 * Useful for debugging and admin dashboards
 *
 * @returns Record of flag names to their current values
 */
export function getAllFeatureFlags(): Record<FeatureFlagName, boolean> {
  const flags = Object.keys(FEATURE_FLAG_DEFAULTS) as FeatureFlagName[];

  return flags.reduce((acc, flag) => {
    const stored = localStorage.getItem(`ff_${flag}`);
    acc[flag] = stored !== null
      ? stored === 'true'
      : FEATURE_FLAG_DEFAULTS[flag];
    return acc;
  }, {} as Record<FeatureFlagName, boolean>);
}

/**
 * Reset a feature flag to its default value
 *
 * @param flag - The feature flag name
 * @param reload - Whether to reload the page after resetting (default: true)
 */
export function resetFeatureFlag(
  flag: FeatureFlagName,
  reload: boolean = true
): void {
  localStorage.removeItem(`ff_${flag}`);

  if (reload) {
    window.location.reload();
  }
}

/**
 * Reset all feature flags to their default values
 *
 * @param reload - Whether to reload the page after resetting (default: true)
 */
export function resetAllFeatureFlags(reload: boolean = true): void {
  const flags = Object.keys(FEATURE_FLAG_DEFAULTS) as FeatureFlagName[];
  flags.forEach(flag => localStorage.removeItem(`ff_${flag}`));

  if (reload) {
    window.location.reload();
  }
}
