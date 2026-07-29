import { useCallback } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';

/**
 * Returns the click handler for a "Go Back" button that never strands the user.
 *
 * react-router stamps `location.key === 'default'` only on the first entry of a
 * history stack — a fresh tab, a pasted URL, or a hard reload. `navigate(-1)`
 * there would leave the app entirely, so we go to `fallback` instead.
 * `window.history.length` cannot answer this question: it counts entries from
 * other sites visited in the same tab.
 *
 * The fallback uses `replace` so the error page is not left behind in history
 * for the browser's own Back button to land on again.
 */
export function useBackOrFallback(fallback: string): () => void {
  const navigate = useNavigate();
  const { key } = useLocation();

  return useCallback(() => {
    if (key === 'default') {
      navigate(fallback, { replace: true });
    } else {
      navigate(-1);
    }
  }, [navigate, key, fallback]);
}
