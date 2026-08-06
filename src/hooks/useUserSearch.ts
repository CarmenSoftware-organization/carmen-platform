import { useEffect, useRef, useState } from 'react';
import { useDebouncedValue } from './useDebouncedValue';
import userService from '../services/userService';
import { parseApiError } from '../utils/errorParser';
import type { User, UserOption } from '../types';

const DEBOUNCE_MS = 400;
const PAGE_SIZE = 20;

const displayName = (u: User): string => {
  const parts = [u.firstname, u.middlename, u.lastname].filter(Boolean);
  return parts.length ? parts.join(' ') : (u.name || u.email || u.id);
};

/**
 * Turns a free-text query into a list of matching users.
 *
 * Search runs server-side: `userService.getAll` declares
 * `defaultSearchFields = ['username', 'email']`, so this finds users by either
 * regardless of how many users exist — the caller never needs a full user list.
 *
 * `enabled` is normally "the dropdown is open". While it is false no request
 * goes out and the previous results are kept rather than cleared, so reopening
 * a dropdown shows what it showed before instead of flashing empty.
 *
 * A query that has already been fetched is not refetched, and a slow response
 * from an older query can never overwrite a newer one (generation counter).
 */
export function useUserSearch(
  query: string,
  enabled: boolean,
): { results: UserOption[]; loading: boolean; error: string } {
  const [debouncedQuery] = useDebouncedValue(query, DEBOUNCE_MS);
  const [results, setResults] = useState<UserOption[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  // Incremented on every request; a response whose generation is stale is dropped.
  const generationRef = useRef(0);
  // The query whose results are currently held — guards against refetching it.
  const fetchedQueryRef = useRef<string | null>(null);

  useEffect(() => {
    if (!enabled) return;
    if (fetchedQueryRef.current === debouncedQuery) return;

    fetchedQueryRef.current = debouncedQuery;
    const generation = ++generationRef.current;
    setLoading(true);
    setError('');

    userService
      .getAll({ page: 1, perpage: PAGE_SIZE, search: debouncedQuery })
      .then((response) => {
        if (generation !== generationRef.current) return;
        const list = (response.data || []) as User[];
        setResults(
          list.map((u) => ({ id: u.id, name: displayName(u), email: u.email })),
        );
      })
      .catch((err: unknown) => {
        if (generation !== generationRef.current) return;
        setResults([]);
        setError(parseApiError(err).message);
        // A failed query must be retryable: forget that we fetched it.
        fetchedQueryRef.current = null;
      })
      .finally(() => {
        if (generation !== generationRef.current) return;
        setLoading(false);
      });
  }, [debouncedQuery, enabled]);

  return { results, loading, error };
}
