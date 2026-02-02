import { useEffect } from 'react';

/**
 * Sets the document title for the current page.
 * Automatically appends " | Frollie Master" suffix.
 * Resets to "Frollie Master" on unmount.
 */
export function useDocumentTitle(title: string) {
  useEffect(() => {
    const previousTitle = document.title;
    document.title = title ? `${title} | Frollie Master` : 'Frollie Master';

    return () => {
      document.title = previousTitle;
    };
  }, [title]);
}
