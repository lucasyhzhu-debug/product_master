import { useEffect } from 'react';

/**
 * Sets the document title for the current page.
 * Automatically appends " | Frollie Pro" suffix.
 * Resets to "Frollie Pro" on unmount.
 */
export function useDocumentTitle(title: string) {
  useEffect(() => {
    const previousTitle = document.title;
    document.title = title ? `${title} | Frollie Pro` : 'Frollie Pro';

    return () => {
      document.title = previousTitle;
    };
  }, [title]);
}
