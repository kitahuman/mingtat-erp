import { useState, useRef, useEffect, useMemo, useCallback, type CSSProperties } from 'react';
import { createPortal } from 'react-dom';

const FILTER_OPTION_ROW_HEIGHT = 32;
const FILTER_LIST_MAX_HEIGHT = 288;
const FILTER_LIST_OVERSCAN = 8;

interface ColumnFilterProps {
  columnKey: string;
  data: any[];
  activeFilters: Record<string, Set<string>>;
  onFilterChange: (columnKey: string, selectedValues: Set<string> | null) => void;
  renderValue?: (value: any, row: any) => string;
  // Server-side filter support
  serverSide?: boolean;
  onFetchOptions?: (columnKey: string) => Promise<string[]>;
  /** Optional renderer for server-side option labels while preserving raw filter values */
  optionRender?: (value: string) => string;
  /** Optional map to convert display labels to raw values for server-side filtering */
  displayToRawMap?: Record<string, string>;
}

export default function ColumnFilter({
  columnKey, data, activeFilters, onFilterChange, renderValue,
  serverSide, onFetchOptions, optionRender, displayToRawMap,
}: ColumnFilterProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [scrollTop, setScrollTop] = useState(0);
  const [mounted, setMounted] = useState(false);
  const [dropdownStyle, setDropdownStyle] = useState<CSSProperties>({});
  const dropdownRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Server-side options state
  const [serverOptions, setServerOptions] = useState<string[] | null>(null);
  const [loadingOptions, setLoadingOptions] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const onFetchOptionsRef = useRef(onFetchOptions);

  useEffect(() => {
    onFetchOptionsRef.current = onFetchOptions;
  }, [onFetchOptions]);

  useEffect(() => {
    setMounted(true);
  }, []);

  // Get all unique values for this column from the raw data (client-side mode)
  const clientUniqueValues = useMemo(() => {
    if (serverSide) return [];
    const values = new Set<string>();
    data.forEach(row => {
      const raw = row[columnKey];
      const display = renderValue ? renderValue(raw, row) : (raw != null ? String(raw) : '-');
      values.add(display);
    });
    return Array.from(values).sort((a, b) => a.localeCompare(b, 'zh-Hant'));
  }, [data, columnKey, renderValue, serverSide]);

  const allUniqueValues = serverSide && serverOptions ? serverOptions : clientUniqueValues;

  // Fetch options when dropdown opens in server-side mode.
  const loadServerOptions = useCallback(async (isCancelled: () => boolean = () => false) => {
    if (!serverSide) return;

    const fetchOptions = onFetchOptionsRef.current;
    if (!fetchOptions) return;

    setLoadingOptions(true);
    setLoadError(false);
    try {
      const options = await fetchOptions(columnKey);
      if (!isCancelled()) {
        setServerOptions(options);
      }
    } catch {
      if (!isCancelled()) {
        setServerOptions([]);
        setLoadError(true);
      }
    } finally {
      if (!isCancelled()) {
        setLoadingOptions(false);
      }
    }
  }, [serverSide, columnKey]);

  useEffect(() => {
    if (!isOpen || !serverSide) return;

    let cancelled = false;
    loadServerOptions(() => cancelled);

    return () => {
      cancelled = true;
    };
  }, [isOpen, serverSide, loadServerOptions]);

  const handleRetryLoad = useCallback(() => {
    void loadServerOptions();
  }, [loadServerOptions]);

  const getDisplayValue = useCallback((value: string) => {
    return serverSide && optionRender ? optionRender(value) : value;
  }, [serverSide, optionRender]);

  // Filter values by search term.
  const filteredValues = useMemo(() => {
    if (!searchTerm) return allUniqueValues;
    const lower = searchTerm.toLowerCase();
    return allUniqueValues.filter(v => getDisplayValue(v).toLowerCase().includes(lower));
  }, [allUniqueValues, searchTerm, getDisplayValue]);

  useEffect(() => {
    setScrollTop(0);
    if (listRef.current) {
      listRef.current.scrollTop = 0;
    }
  }, [columnKey, searchTerm, isOpen]);

  const virtualList = useMemo(() => {
    const totalRows = filteredValues.length;
    const totalHeight = totalRows * FILTER_OPTION_ROW_HEIGHT;
    const viewportHeight = Math.min(totalHeight, FILTER_LIST_MAX_HEIGHT);
    const startIndex = Math.max(
      0,
      Math.floor(scrollTop / FILTER_OPTION_ROW_HEIGHT) - FILTER_LIST_OVERSCAN,
    );
    const visibleRowCount = Math.ceil(viewportHeight / FILTER_OPTION_ROW_HEIGHT) + FILTER_LIST_OVERSCAN * 2;
    const endIndex = Math.min(totalRows, startIndex + visibleRowCount);

    return {
      totalHeight,
      viewportHeight,
      items: filteredValues.slice(startIndex, endIndex).map((value, offset) => ({
        value,
        index: startIndex + offset,
      })),
    };
  }, [filteredValues, scrollTop]);

  const updateDropdownPosition = useCallback(() => {
    if (!buttonRef.current || !isOpen) return;

    const rect = buttonRef.current.getBoundingClientRect();
    const viewportPadding = 8;
    const dropdownWidth = 240;
    const searchAndSelectAllHeight = 90;
    const dropdownHeight = Math.min(
      FILTER_LIST_MAX_HEIGHT + searchAndSelectAllHeight,
      virtualList.viewportHeight + searchAndSelectAllHeight,
    );
    const spaceBelow = window.innerHeight - rect.bottom - viewportPadding;
    const showAbove = spaceBelow < dropdownHeight && rect.top > dropdownHeight;
    const left = Math.min(
      Math.max(rect.left, viewportPadding),
      window.innerWidth - dropdownWidth - viewportPadding,
    );

    setDropdownStyle({
      position: 'fixed',
      left: `${left}px`,
      width: `${dropdownWidth}px`,
      zIndex: 99999,
      ...(showAbove
        ? { bottom: `${window.innerHeight - rect.top + 4}px`, top: 'auto' }
        : { top: `${rect.bottom + 4}px`, bottom: 'auto' }),
    });
  }, [isOpen, virtualList.viewportHeight]);

  useEffect(() => {
    if (isOpen) {
      updateDropdownPosition();
      // Delay focus to ensure the portal is fully mounted and positioned.
      // preventScroll: true stops the browser from jumping to the focused element.
      const timer = setTimeout(() => {
        inputRef.current?.focus({ preventScroll: true });
      }, 50);
      return () => clearTimeout(timer);
    }
  }, [isOpen, updateDropdownPosition]);

  useEffect(() => {
    if (!isOpen) return;

    const handleScrollOrResize = () => updateDropdownPosition();
    window.addEventListener('scroll', handleScrollOrResize, true);
    window.addEventListener('resize', handleScrollOrResize);
    return () => {
      window.removeEventListener('scroll', handleScrollOrResize, true);
      window.removeEventListener('resize', handleScrollOrResize);
    };
  }, [isOpen, updateDropdownPosition]);

  // Whether search is actively narrowing the list
  const isSearchActive = searchTerm !== '' && filteredValues.length < allUniqueValues.length;

  // Current selected values for this column
  const selectedValues = activeFilters[columnKey];
  const isFiltered = selectedValues != null;
  const isAllSelected = !isFiltered;

  // Close dropdown on click outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node) &&
          buttonRef.current && !buttonRef.current.contains(event.target as Node)) {
        setIsOpen(false);
        setSearchTerm('');
      }
    }
    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isOpen]);

  // Determine if a value should show as checked.
  // When search is active and no filter has been explicitly set (isAllSelected),
  // show all items as UNCHECKED so the user can pick only the ones they want.
  const isValueSelected = useCallback((value: string) => {
    if (isSearchActive && isAllSelected) return false;
    if (isAllSelected) return true;
    return selectedValues.has(value);
  }, [isSearchActive, isAllSelected, selectedValues]);

  // "Select All" checkbox state
  const isSelectAllChecked = useMemo(() => {
    if (isSearchActive) {
      if (isAllSelected) return false; // search active, no filter → show unchecked
      return filteredValues.length > 0 && filteredValues.every(v => selectedValues.has(v));
    }
    return isAllSelected;
  }, [isSearchActive, filteredValues, allUniqueValues, isAllSelected, selectedValues]);

  const handleToggleAll = () => {
    if (isSearchActive) {
      if (isAllSelected) {
        // No filter yet, search active → select only the visible (searched) items
        onFilterChange(columnKey, new Set(filteredValues));
      } else {
        const allFilteredSelected = filteredValues.every(v => selectedValues.has(v));
        const newSelected = new Set(selectedValues);
        if (allFilteredSelected) {
          // Uncheck all visible items
          filteredValues.forEach(v => newSelected.delete(v));
        } else {
          // Check all visible items
          filteredValues.forEach(v => newSelected.add(v));
        }

        if (newSelected.size === allUniqueValues.length) {
          onFilterChange(columnKey, null); // all selected → clear filter
        } else if (newSelected.size === 0) {
          onFilterChange(columnKey, new Set()); // none selected
        } else {
          onFilterChange(columnKey, newSelected);
        }
      }
      return;
    }

    // No search active
    if (isAllSelected) {
      onFilterChange(columnKey, new Set()); // deselect all
    } else {
      onFilterChange(columnKey, null); // select all (clear filter)
    }
  };

  const handleToggleValue = (value: string) => {
    if (isSearchActive && isAllSelected) {
      // No filter yet, search active → clicking a value selects ONLY that value
      onFilterChange(columnKey, new Set([value]));
      return;
    }

    let newSelected: Set<string>;
    if (isAllSelected) {
      // No search, clicking from "all selected" → deselect this one value
      newSelected = new Set(allUniqueValues);
      newSelected.delete(value);
    } else {
      newSelected = new Set(selectedValues);
      if (newSelected.has(value)) {
        newSelected.delete(value);
      } else {
        newSelected.add(value);
      }
    }
    if (newSelected.size === allUniqueValues.length) {
      onFilterChange(columnKey, null);
    } else {
      onFilterChange(columnKey, newSelected);
    }
  };

  const dropdown = isOpen && mounted ? createPortal(
    <div
      ref={dropdownRef}
      style={dropdownStyle}
      className="bg-white border border-gray-200 rounded-lg shadow-lg min-w-[200px] max-w-[280px]"
      onClick={(e) => e.stopPropagation()}
    >
      {/* Search */}
      <div className="p-2 border-b border-gray-100">
          <input
            ref={inputRef}
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="搜尋..."
            className="w-full px-2 py-1.5 text-xs border border-gray-200 rounded focus:outline-none focus:border-primary-400"
          />
      </div>

      {/* Select All */}
      <div className="border-b border-gray-100">
        <label className="flex items-center px-3 py-2 hover:bg-gray-50 cursor-pointer">
          <input
            type="checkbox"
            checked={isSelectAllChecked}
            onChange={handleToggleAll}
            className="mr-2 rounded border-gray-300 text-primary-600 focus:ring-primary-500"
          />
          <span className="text-xs font-medium text-gray-700">
            {isSearchActive ? '選擇搜尋結果' : '選擇全部'}
          </span>
        </label>
      </div>

      {/* Values list */}
      <div className="overflow-y-auto">
        {loadingOptions ? (
          <div className="px-3 py-4 text-xs text-gray-400 text-center">
            <div className="flex justify-center mb-1">
              <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-primary-600"></div>
            </div>
            載入中...
          </div>
        ) : loadError ? (
          <button
            type="button"
            onClick={handleRetryLoad}
            className="w-full px-3 py-4 text-xs text-red-500 text-center hover:bg-red-50"
          >
            載入失敗，點擊重試
          </button>
        ) : filteredValues.length === 0 ? (
          <div className="px-3 py-2 text-xs text-gray-400">無匹配項目</div>
        ) : (
          <div
            ref={listRef}
            className="overflow-y-auto"
            style={{ height: `${virtualList.viewportHeight}px` }}
            onScroll={(e) => setScrollTop(e.currentTarget.scrollTop)}
          >
            <div
              className="relative"
              style={{ height: `${virtualList.totalHeight}px` }}
            >
              {virtualList.items.map(({ value, index }) => (
                <label
                  key={value}
                  className="absolute left-0 right-0 flex items-center px-3 py-1.5 hover:bg-gray-50 cursor-pointer"
                  style={{
                    height: `${FILTER_OPTION_ROW_HEIGHT}px`,
                    top: `${index * FILTER_OPTION_ROW_HEIGHT}px`,
                  }}
                >
                  <input
                    type="checkbox"
                    checked={isValueSelected(value)}
                    onChange={() => handleToggleValue(value)}
                    className="mr-2 rounded border-gray-300 text-primary-600 focus:ring-primary-500"
                  />
                  <span className="text-xs text-gray-600 truncate">{getDisplayValue(value) || '(空白)'}</span>
                </label>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>,
    document.body,
  ) : null;

  return (
    <div className="inline-block">
      <button
        ref={buttonRef}
        type="button"
        onClick={(e) => { e.stopPropagation(); setIsOpen(!isOpen); setSearchTerm(''); }}
        className={`ml-1 p-0.5 rounded hover:bg-gray-200 transition-colors ${isFiltered ? 'text-primary-600' : 'text-gray-400'}`}
        title="篩選"
      >
        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z" />
        </svg>
      </button>
      {dropdown}
    </div>
  );
}
