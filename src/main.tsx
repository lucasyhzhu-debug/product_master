import { StrictMode, useState, useCallback } from 'react'
import { createRoot } from 'react-dom/client'
import { ConvexProvider, ConvexReactClient } from 'convex/react'
import { SessionProvider } from 'convex-helpers/react/sessions'
import type { SessionId } from 'convex-helpers/server/sessions'
import { AuthProvider } from './contexts/AuthContext'
import './index.css'
import App from './App.tsx'

// Initialize Convex client
// In development, this will be set by `npx convex dev`
// In production, set VITE_CONVEX_URL in environment
const convexUrl = import.meta.env.VITE_CONVEX_URL as string;

// Create Convex client only if URL is configured
const convex = convexUrl ? new ConvexReactClient(convexUrl) : null;

/**
 * Custom localStorage-based storage hook for SessionProvider.
 *
 * Uses localStorage (not sessionStorage) so the session ID persists
 * across tabs and browser restarts. The "malo_session_id" key is shared
 * with AuthContext -- when login writes the auth token there,
 * SessionProvider picks it up on next mount/render.
 */
function useLocalStorage(
  key: string,
  initialValue: SessionId | undefined,
): readonly [SessionId | undefined, (value: SessionId | undefined) => void] {
  const [value, setValueInternal] = useState<SessionId | undefined>(() => {
    if (typeof localStorage !== 'undefined') {
      const existing = localStorage.getItem(key);
      if (existing && existing !== 'undefined') {
        return existing as SessionId;
      }
      if (initialValue !== undefined) {
        localStorage.setItem(key, initialValue);
      }
    }
    return initialValue;
  });

  const setValue = useCallback(
    (newValue: SessionId | undefined) => {
      if (newValue !== undefined) {
        localStorage.setItem(key, newValue);
      } else {
        localStorage.removeItem(key);
      }
      setValueInternal(newValue);
    },
    [key],
  );

  return [value, setValue] as const;
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {convex ? (
      <ConvexProvider client={convex}>
        <SessionProvider
          useStorage={useLocalStorage}
          storageKey="malo_session_id"
        >
          <AuthProvider>
            <App />
          </AuthProvider>
        </SessionProvider>
      </ConvexProvider>
    ) : (
      // Fallback when Convex is not configured (legacy mode)
      <App />
    )}
  </StrictMode>,
)
