import { StrictMode, useState, useCallback } from 'react'
import { createRoot } from 'react-dom/client'
import { ConvexProvider, ConvexReactClient } from 'convex/react'
import { SessionProvider } from 'convex-helpers/react/sessions'
import type { SessionId } from 'convex-helpers/server/sessions'
import { AuthProvider } from './contexts/AuthContext'
import { ThemeProvider } from './contexts/ThemeContext'
import { sessionSetterRef } from './lib/sessionBridge'
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
 * AuthContext also calls sessionSetterRef.current() to update the
 * SessionProvider's React state in the same render cycle.
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

  // Expose the setter so AuthContext can update SessionProvider state after login.
  // We use a module-level ref (not useRef) because this hook is called by
  // SessionProvider and we need AuthContext (a sibling) to access it.
  // Must be assigned during render (not useEffect) because children effects
  // run before parent effects — AuthContext's mount effect needs this set.
  // eslint-disable-next-line react-hooks/immutability
  sessionSetterRef.current = setValue;

  return [value, setValue] as const;
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ThemeProvider>
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
    </ThemeProvider>
  </StrictMode>,
)
