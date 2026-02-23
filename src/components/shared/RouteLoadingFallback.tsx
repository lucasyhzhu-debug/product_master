import { useState, useEffect } from 'react';
import { UtensilsCrossed } from 'lucide-react';

/**
 * Full-page loading fallback for React.lazy route boundaries.
 * Shows nothing for the first 200ms (avoids flash-of-spinner on fast connections),
 * then displays the spinning Frollie logo icon centered on screen.
 */
export function RouteLoadingFallback() {
  const [show, setShow] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => setShow(true), 200);
    return () => clearTimeout(t);
  }, []);

  if (!show) return null;

  return (
    <div className="flex items-center justify-center min-h-screen">
      <UtensilsCrossed className="h-8 w-8 text-primary animate-spin" />
    </div>
  );
}
