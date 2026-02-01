import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { ConvexProvider, ConvexReactClient } from 'convex/react'
import { AuthProvider } from './contexts/AuthContext'
import './index.css'
import App from './App.tsx'

// Initialize Convex client
// In development, this will be set by `npx convex dev`
// In production, set VITE_CONVEX_URL in environment
const convexUrl = import.meta.env.VITE_CONVEX_URL as string;

// Create Convex client only if URL is configured
const convex = convexUrl ? new ConvexReactClient(convexUrl) : null;

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {convex ? (
      <ConvexProvider client={convex}>
        <AuthProvider>
          <App />
        </AuthProvider>
      </ConvexProvider>
    ) : (
      // Fallback when Convex is not configured (legacy mode)
      <App />
    )}
  </StrictMode>,
)
