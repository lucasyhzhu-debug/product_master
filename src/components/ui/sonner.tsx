import { Toaster as Sonner } from 'sonner';

/**
 * Theme-aware Toaster component.
 * Note: When ThemeContext is created (Plan 09-01), update this to use
 * useTheme().resolvedTheme for the theme prop instead of "light".
 */
export function Toaster() {
  return (
    <Sonner
      position="top-center"
      richColors
      closeButton
      toastOptions={{
        style: {
          background: 'hsl(var(--background))',
          color: 'hsl(var(--foreground))',
          border: '1px solid hsl(var(--border))',
        },
      }}
    />
  );
}
