import { useState, useEffect, useRef } from 'react';

/**
 * Custom hook to detect scroll direction for header hide/show behavior.
 * Uses requestAnimationFrame for performance.
 *
 * @returns isVisible - true when header should be shown (scroll up or at top)
 */
export function useScrollDirection() {
  const [isVisible, setIsVisible] = useState(true);
  const lastScrollY = useRef(0);
  const ticking = useRef(false);

  useEffect(() => {
    const updateScrollDir = () => {
      const scrollY = window.scrollY;
      // Always show at top of page
      if (scrollY < 10) {
        setIsVisible(true);
      } else if (scrollY > lastScrollY.current + 5) {
        setIsVisible(false); // scrolling down
      } else if (scrollY < lastScrollY.current - 5) {
        setIsVisible(true); // scrolling up
      }
      lastScrollY.current = scrollY;
      ticking.current = false;
    };

    const onScroll = () => {
      if (!ticking.current) {
        requestAnimationFrame(updateScrollDir);
        ticking.current = true;
      }
    };

    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  return isVisible;
}
