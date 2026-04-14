'use client';
import { useState, useEffect, useCallback, useRef } from 'react';

// ── Types ──────────────────────────────────────────────────────

export interface FilterDef<V = string> {
  /** Unique key used as the query parameter name */
  key: string;
  /** Initial value (defaults to '') */
  initial?: V;
}

export interface UseListPageOptions<T> {
  /** API function that accepts params and returns { data: { data: T[], total: number } } */
  fetchFn: (
    params: Record<string, unknown>,
  ) => Promise<{ data: { data: T[]; total: number } | T[] }>;
  /** Items per page (default: 50) */
  pageSize?: number;
  /** Filter definitions — each filter becomes a state variable */
  filters?: FilterDef[];
  /** Extra static params to always include in API calls */
  extraParams?: Record<string, unknown>;
  /** Debounce delay for search input in ms (default: 300) */
  searchDebounce?: number;
  /** Whether to fetch on mount (default: true) */
  fetchOnMount?: boolean;
}

export interface UseListPageReturn<T> {
  // ── Data ──
  data: T[];
  total: number;
  loading: boolean;
  error: string | null;

  // ── Pagination ──
  page: number;
  pageSize: number;
  totalPages: number;
  setPage: (p: number) => void;
  goNext: () => void;
  goPrev: () => void;

  // ── Search ──
  search: string;
  setSearch: (s: string) => void;

  // ── Filters ──
  filterValues: Record<string, string>;
  setFilter: (key: string, value: string) => void;
  resetFilters: () => void;

  // ── Actions ──
  refresh: () => void;
}

// ── Hook Implementation ────────────────────────────────────────

export function useListPage<T = unknown>(
  options: UseListPageOptions<T>,
): UseListPageReturn<T> {
  const {
    fetchFn,
    pageSize: defaultPageSize = 50,
    filters = [],
    extraParams = {},
    searchDebounce = 300,
    fetchOnMount = true,
  } = options;

  // ── State ──
  const [data, setData] = useState<T[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [search, setSearchRaw] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');

  // Build initial filter values
  const initialFilters: Record<string, string> = {};
  for (const f of filters) {
    initialFilters[f.key] = (f.initial as string) ?? '';
  }
  const [filterValues, setFilterValues] =
    useState<Record<string, string>>(initialFilters);

  // ── Debounced search ──
  const debounceRef = useRef<ReturnType<typeof setTimeout>>();
  const setSearch = useCallback(
    (s: string) => {
      setSearchRaw(s);
      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(() => {
        setDebouncedSearch(s);
        setPage(1); // reset to page 1 on new search
      }, searchDebounce);
    },
    [searchDebounce],
  );

  // ── Filter setter ──
  const setFilter = useCallback((key: string, value: string) => {
    setFilterValues((prev) => ({ ...prev, [key]: value }));
    setPage(1); // reset to page 1 on filter change
  }, []);

  const resetFilters = useCallback(() => {
    setFilterValues(initialFilters);
    setSearchRaw('');
    setDebouncedSearch('');
    setPage(1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Fetch ──
  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params: Record<string, unknown> = {
        page,
        limit: defaultPageSize,
        ...extraParams,
      };
      if (debouncedSearch) params.search = debouncedSearch;
      // Add active filters
      for (const [key, val] of Object.entries(filterValues)) {
        if (val !== '' && val !== undefined) {
          params[key] = val;
        }
      }
      const res = await fetchFn(params);
      // Handle both { data: { data, total } } and { data: T[] } shapes
      const resData = res.data;
      if (
        resData &&
        'data' in resData &&
        Array.isArray((resData as { data: T[] }).data)
      ) {
        const shaped = resData as { data: T[]; total: number };
        setData(shaped.data);
        setTotal(shaped.total ?? shaped.data.length);
      } else if (Array.isArray(resData)) {
        setData(resData as T[]);
        setTotal((resData as T[]).length);
      } else {
        setData([]);
        setTotal(0);
      }
    } catch (err: unknown) {
      const message =
        err instanceof Error ? err.message : 'Failed to fetch data';
      setError(message);
      console.error('[useListPage] fetch error:', err);
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, defaultPageSize, debouncedSearch, filterValues, fetchFn]);

  useEffect(() => {
    if (fetchOnMount || page > 1 || debouncedSearch) {
      fetchData();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fetchData]);

  // ── Pagination helpers ──
  const totalPages = Math.max(1, Math.ceil(total / defaultPageSize));
  const goNext = useCallback(
    () => setPage((p) => Math.min(p + 1, totalPages)),
    [totalPages],
  );
  const goPrev = useCallback(() => setPage((p) => Math.max(p - 1, 1)), []);

  return {
    data,
    total,
    loading,
    error,
    page,
    pageSize: defaultPageSize,
    totalPages,
    setPage,
    goNext,
    goPrev,
    search,
    setSearch,
    filterValues,
    setFilter,
    resetFilters,
    refresh: fetchData,
  };
}

export default useListPage;
