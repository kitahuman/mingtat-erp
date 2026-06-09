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

export const usePageState = (initialState: PageState) => {
  const pathname = usePathname();
  const storageKey = getStorageKey(pathname);
  const [pageState, setPageState] = useState<PageState>(() => {
    if (typeof window !== 'undefined') {
      const savedState = sessionStorage.getItem(storageKey);
      return savedState ? JSON.parse(savedState) : initialState;
    }
    return initialState;
  });

  const saveState = useCallback((newState: PageState) => {
    setPageState(newState);
    if (typeof window !== 'undefined') {
      sessionStorage.setItem(storageKey, JSON.stringify(newState));
    }
  }, [storageKey]);

  // Save scroll position before navigation
  useEffect(() => {
    const handleBeforeUnload = () => {
      if (typeof window !== 'undefined') {
        const newState = { ...pageState, scrollPosition: window.scrollY };
        sessionStorage.setItem(storageKey, JSON.stringify(newState));
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
