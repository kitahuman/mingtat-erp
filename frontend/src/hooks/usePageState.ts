import { useEffect, useRef, useState, useCallback } from 'react';
import { usePathname } from 'next/navigation';

interface PageState {
  filters?: Record<string, any>;
  sort?: { column: string; direction: 'asc' | 'desc' };
  page?: number;
  scrollPosition?: number;
  expandedSections?: Record<string, boolean>;
  search?: string;
  statusFilter?: string;
  typeFilter?: string;
  clientFilter?: string;
  dateFrom?: string;
  dateTo?: string;
  sortBy?: string;
  sortOrder?: 'ASC' | 'DESC';
  columnFilters?: Record<string, Set<string>>;
  limit?: number;
  filterPublisher?: (string | number)[];
  filterStatus?: (string | number)[];
  filterCompany?: (string | number)[];
  filterClient?: (string | number)[];
  filterQuotation?: (string | number)[];
  filterContract?: (string | number)[];
  filterEmployee?: (string | number)[];
  filterEquipment?: string;
  filterDateFrom?: string;
  filterDateTo?: string;
}

const getStorageKey = (path: string) => `pageState:${path}`;

/**
 * Custom serializer that converts Set objects to arrays for JSON storage.
 */
function serializeState(state: PageState): string {
  return JSON.stringify(state, (key, value) => {
    if (value instanceof Set) {
      return { __type: 'Set', values: Array.from(value) };
    }
    return value;
  });
}

/**
 * Custom deserializer that restores Set objects from arrays.
 */
function deserializeState(json: string): PageState {
  const parsed = JSON.parse(json, (key, value) => {
    if (value && typeof value === 'object' && value.__type === 'Set' && Array.isArray(value.values)) {
      return new Set(value.values);
    }
    return value;
  });
  // Validate columnFilters: if any value is not a Set, reset columnFilters
  if (parsed.columnFilters && typeof parsed.columnFilters === 'object') {
    const entries = Object.entries(parsed.columnFilters);
    const allValid = entries.every(([, v]) => v instanceof Set);
    if (!allValid) {
      parsed.columnFilters = {};
    }
  }
  return parsed;
}

export const usePageState = (initialState: PageState) => {
  const pathname = usePathname();
  const storageKey = getStorageKey(pathname);
  const [pageState, setPageState] = useState<PageState>(() => {
    if (typeof window !== 'undefined') {
      const savedState = sessionStorage.getItem(storageKey);
      if (savedState) {
        try {
          return deserializeState(savedState);
        } catch {
          return initialState;
        }
      }
      return initialState;
    }
    return initialState;
  });

  const saveState = useCallback((newState: PageState) => {
    setPageState(newState);
    if (typeof window !== 'undefined') {
      sessionStorage.setItem(storageKey, serializeState(newState));
    }
  }, [storageKey]);

  // Save scroll position before navigation
  useEffect(() => {
    const handleBeforeUnload = () => {
      if (typeof window !== 'undefined') {
        const newState = { ...pageState, scrollPosition: window.scrollY };
        sessionStorage.setItem(storageKey, serializeState(newState));
      }
    };

    window.addEventListener('beforeunload', handleBeforeUnload);

    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
    };
  }, [pageState, storageKey]);

  // Restore scroll position on mount
  useEffect(() => {
    if (pageState.scrollPosition !== undefined) {
      window.scrollTo(0, pageState.scrollPosition);
    }
  }, [pageState.scrollPosition]);

  const clearState = useCallback(() => {
    setPageState(initialState);
    if (typeof window !== 'undefined') {
      sessionStorage.removeItem(storageKey);
    }
  }, [initialState, storageKey]);

  return { pageState, saveState, clearState };
};
