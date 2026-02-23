import React from 'react';
import { Button } from '@/components/ui/button';

interface State {
  error: Error | null;
  retried: boolean;
}

/**
 * Error boundary for React.lazy chunk load failures.
 *
 * Behavior:
 * 1. Deploy drift (stale chunk hash after a new deployment):
 *    - Detected via "Failed to fetch dynamically imported module" or
 *      "Importing a module script failed" in error.message
 *    - Auto-reloads the page immediately to fetch fresh assets
 *
 * 2. Transient network failure:
 *    - Silently retries once by resetting error state
 *    - If it fails again, shows "Please reload" prompt
 *
 * Console logs all chunk errors for visibility.
 */
export class ChunkErrorBoundary extends React.Component<
  { children: React.ReactNode },
  State
> {
  state: State = { error: null, retried: false };

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { error };
  }

  componentDidCatch(error: Error) {
    // Deploy drift: chunk hash mismatch — auto-reload for fresh assets
    const isDeployDrift =
      error.message?.includes('Failed to fetch dynamically imported module') ||
      error.message?.includes('Importing a module script failed');

    if (isDeployDrift) {
      console.error('[ChunkLoadError] Deploy drift detected — reloading', error);
      window.location.reload();
      return;
    }

    // Transient failure: retry once silently
    if (!this.state.retried) {
      console.error('[ChunkLoadError] Retrying chunk load', error);
      this.setState({ retried: true, error: null });
      return;
    }

    // Second failure: log and let render show the error UI
    console.error('[ChunkLoadError] Retry failed', error);
  }

  render() {
    if (this.state.error && this.state.retried) {
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

    return this.props.children;
  }
}
