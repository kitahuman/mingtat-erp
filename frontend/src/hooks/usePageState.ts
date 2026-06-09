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
  columnFilters?: Record<string, string[]>;
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
 * Serialize state directly; page state must remain JSON-serializable for sessionStorage.
 */
function serializeState(state: PageState): string {
  return JSON.stringify(state);
}

/**
 * Deserialize state and normalize columnFilters to string arrays.
 * Older sessions may contain the previous Set wrapper format, so accept it once
 * and convert it to the new JSON-serializable representation.
 */
function deserializeState(json: string): PageState {
  const parsed = JSON.parse(json);
  if (parsed.columnFilters && typeof parsed.columnFilters === 'object' && !Array.isArray(parsed.columnFilters)) {
    const normalized: Record<string, string[]> = {};
    let allValid = true;
    for (const [key, value] of Object.entries(parsed.columnFilters)) {
      if (Array.isArray(value)) {
        normalized[key] = value.map(String);
      } else if (value && typeof value === 'object' && (value as any).__type === 'Set' && Array.isArray((value as any).values)) {
        normalized[key] = (value as any).values.map(String);
      } else {
        allValid = false;
        break;
      }
    }
    parsed.columnFilters = allValid ? normalized : {};
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

  // Keep a ref to the latest state so we can always read the freshest value
  // inside callbacks without needing pageState in their dependency arrays.
  const stateRef = useRef(pageState);
  stateRef.current = pageState;

  /**
   * saveState accepts either a new state object OR a functional updater
   * (prev => newState), similar to React's setState. This prevents stale
   * closure issues when multiple setters are called in the same event handler.
   */
  const saveState = useCallback((updater: PageState | ((prev: PageState) => PageState)) => {
    setPageState((prev) => {
      const newState = typeof updater === 'function' ? updater(prev) : updater;
      if (typeof window !== 'undefined') {
        sessionStorage.setItem(storageKey, serializeState(newState));
      }
      return newState;
    });
  }, [storageKey]);

  // Save scroll position before navigation
  useEffect(() => {
    const handleBeforeUnload = () => {
      if (typeof window !== 'undefined') {
        const currentState = stateRef.current;
        const newState = { ...currentState, scrollPosition: window.scrollY };
        sessionStorage.setItem(storageKey, serializeState(newState));
      }
    };

    window.addEventListener('beforeunload', handleBeforeUnload);

    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
    };
  }, [storageKey]);

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
