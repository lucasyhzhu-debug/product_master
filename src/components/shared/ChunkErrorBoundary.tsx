import React from 'react';
import { Button } from '@/components/ui/button';

interface State {
  error: Error | null;
  isDeployDrift: boolean;
}

/**
 * Error boundary for React.lazy chunk load failures.
 *
 * Behavior:
 * 1. Deploy drift (stale chunk hash after a new deployment):
 *    - Detected via browser-specific error messages for failed dynamic imports:
 *      - Chrome/Edge: "Failed to fetch dynamically imported module"
 *      - Safari: "Load failed" (or "Importing a module script failed")
 *      - Firefox: "error loading dynamically imported module"
 *    - Auto-reloads the page to fetch fresh assets from the new deploy
 *
 * 2. Other chunk errors (transient network failure, genuine JS errors):
 *    - Shows "Please reload" prompt with a reload button
 *
 * Console logs all chunk errors for visibility.
 *
 * Design note: render() shows error UI whenever error is set (no "retry" dance).
 * Retrying a failed dynamic import is unreliable because React caches rejected
 * import() promises — the same error re-throws synchronously on every render,
 * causing an infinite loop rather than a successful retry.
 */
export class ChunkErrorBoundary extends React.Component<
  { children: React.ReactNode },
  State
> {
  state: State = { error: null, isDeployDrift: false };

  static getDerivedStateFromError(error: Error): State {
    // Detect deploy drift across all major browsers
    const msg = error.message ?? '';
    const isDeployDrift =
      // Chrome / Edge
      msg.includes('Failed to fetch dynamically imported module') ||
      // Safari (macOS / iOS)
      msg.includes('Importing a module script failed') ||
      msg.includes('Load failed') ||
      // Firefox
      msg.includes('error loading dynamically imported module') ||
      // Generic fallback for other Chromium-based browsers
      msg.includes('dynamically imported module');

    return { error, isDeployDrift };
  }

  componentDidCatch(error: Error) {
    const { isDeployDrift } = this.state;

    if (isDeployDrift) {
      console.error('[ChunkLoadError] Deploy drift detected — reloading', error);
      window.location.reload();
    } else {
      console.error('[ChunkLoadError] Non-drift chunk error', error);
    }
  }

  render() {
    const { error, isDeployDrift } = this.state;

    if (!error) {
      return this.props.children;
    }

    // Deploy drift: show nothing while reload is in progress
    if (isDeployDrift) {
      return null;
    }

    // Non-drift error: prompt the user to reload manually
    return (
      <div className="flex flex-col items-center justify-center min-h-[200px] gap-4 p-8">
        <p className="text-muted-foreground text-sm text-center">
          Something went wrong loading this page.
        </p>
        <Button variant="outline" size="sm" onClick={() => window.location.reload()}>
          Please reload
        </Button>
      </div>
    );
  }
}
