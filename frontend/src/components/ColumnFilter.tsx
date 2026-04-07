'use client';
import { useState, useRef, useEffect, useMemo, useCallback } from 'react';

interface ColumnFilterProps {
  columnKey: string;
  data: any[];
  activeFilters: Record<string, Set<string>>;
  onFilterChange: (columnKey: string, selectedValues: Set<string> | null) => void;
  renderValue?: (value: any, row: any) => string;
  // Server-side filter support
  serverSide?: boolean;
  onFetchOptions?: (columnKey: string) => Promise<string[]>;
  /** Optional map to convert display labels to raw values for server-side filtering */
  displayToRawMap?: Record<string, string>;
}

export default function ColumnFilter({
  columnKey, data, activeFilters, onFilterChange, renderValue,
  serverSide, onFetchOptions, displayToRawMap,
}: ColumnFilterProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const dropdownRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);

  // Server-side options state
  const [serverOptions, setServerOptions] = useState<string[] | null>(null);
  const [loadingOptions, setLoadingOptions] = useState(false);

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

  // Fetch server-side options when dropdown opens
  const fetchOptions = useCallback(async () => {
    if (!serverSide || !onFetchOptions) return;
    setLoadingOptions(true);
    try {
      const options = await onFetchOptions(columnKey);
      setServerOptions(options);
    } catch {
      setServerOptions([]);
    }
    setLoadingOptions(false);
  }, [serverSide, onFetchOptions, columnKey]);

  // Fetch options when dropdown opens in server-side mode
  useEffect(() => {
    if (isOpen && serverSide) {
      fetchOptions();
    }
  }, [isOpen, serverSide, fetchOptions]);

  // Filter values by search term
  const filteredValues = useMemo(() => {
    if (!searchTerm) return allUniqueValues;
    const lower = searchTerm.toLowerCase();
    return allUniqueValues.filter(v => v.toLowerCase().includes(lower));
  }, [allUniqueValues, searchTerm]);

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

  const handleToggleAll = () => {
    if (isAllSelected) {
      onFilterChange(columnKey, new Set());
    } else {
      onFilterChange(columnKey, null);
    }
  };

  const handleToggleValue = (value: string) => {
    let newSelected: Set<string>;
    if (isAllSelected) {
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

  const isValueSelected = (value: string) => {
    if (isAllSelected) return true;
    return selectedValues.has(value);
  };

  return (
    <div className="relative inline-block">
      <button
        ref={buttonRef}
        onClick={(e) => { e.stopPropagation(); setIsOpen(!isOpen); setSearchTerm(''); }}
        className={`ml-1 p-0.5 rounded hover:bg-gray-200 transition-colors ${isFiltered ? 'text-primary-600' : 'text-gray-400'}`}
        title="篩選"
      >
        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z" />
        </svg>
      </button>

      {isOpen && (
        <div
          ref={dropdownRef}
          className="absolute top-full left-0 mt-1 bg-white border border-gray-200 rounded-lg shadow-lg z-50 min-w-[200px] max-w-[280px]"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Search */}
          <div className="p-2 border-b border-gray-100">
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="搜尋..."
              className="w-full px-2 py-1.5 text-xs border border-gray-200 rounded focus:outline-none focus:border-primary-400"
              autoFocus
            />
          </div>

          {/* Select All */}
          <div className="border-b border-gray-100">
            <label className="flex items-center px-3 py-2 hover:bg-gray-50 cursor-pointer">
              <input
                type="checkbox"
                checked={isAllSelected}
                onChange={handleToggleAll}
                className="mr-2 rounded border-gray-300 text-primary-600 focus:ring-primary-500"
              />
              <span className="text-xs font-medium text-gray-700">選擇全部</span>
            </label>
          </div>

          {/* Values list */}
          <div className="max-h-[240px] overflow-y-auto">
            {loadingOptions ? (
              <div className="px-3 py-4 text-xs text-gray-400 text-center">
                <div className="flex justify-center mb-1">
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-primary-600"></div>
                </div>
                載入中...
              </div>
            ) : filteredValues.length === 0 ? (
              <div className="px-3 py-2 text-xs text-gray-400">無匹配項目</div>
            ) : (
              filteredValues.map((value) => (
                <label key={value} className="flex items-center px-3 py-1.5 hover:bg-gray-50 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={isValueSelected(value)}
                    onChange={() => handleToggleValue(value)}
                    className="mr-2 rounded border-gray-300 text-primary-600 focus:ring-primary-500"
                  />
                  <span className="text-xs text-gray-600 truncate">{value || '(空白)'}</span>
                </label>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
