'use client';
import { useState, useMemo } from 'react';
import ColumnFilter from './ColumnFilter';
import ExportButton from './ExportButton';

interface Column {
  key: string;
  label: string;
  render?: (value: any, row: any) => React.ReactNode;
  exportRender?: (value: any, row: any) => string;
  className?: string;
  sortable?: boolean;
  filterable?: boolean;
  filterRender?: (value: any, row: any) => string;
}

interface DataTableProps {
  columns: Column[];
  data: any[];
  total: number;
  page: number;
  limit: number;
  onPageChange: (page: number) => void;
  onSearch?: (search: string) => void;
  searchPlaceholder?: string;
  onRowClick?: (row: any) => void;
  filters?: React.ReactNode;
  actions?: React.ReactNode;
  loading?: boolean;
  sortBy?: string;
  sortOrder?: string;
  onSort?: (field: string, order: string) => void;
  exportFilename?: string;
}

export default function DataTable({
  columns, data, total, page, limit, onPageChange, onSearch,
  searchPlaceholder = '搜尋...', onRowClick, filters, actions, loading,
  sortBy, sortOrder, onSort, exportFilename
}: DataTableProps) {
  const [searchTerm, setSearchTerm] = useState('');
  const [columnFilters, setColumnFilters] = useState<Record<string, Set<string>>>({});

  const handleSearch = () => {
    onSearch?.(searchTerm);
  };

  const handleSort = (key: string) => {
    if (!onSort) return;
    if (sortBy === key) {
      onSort(key, sortOrder === 'ASC' ? 'DESC' : 'ASC');
    } else {
      onSort(key, 'ASC');
    }
  };

  const handleFilterChange = (columnKey: string, selectedValues: Set<string> | null) => {
    setColumnFilters(prev => {
      const next = { ...prev };
      if (selectedValues === null) {
        delete next[columnKey];
      } else {
        next[columnKey] = selectedValues;
      }
      return next;
    });
  };

  // Apply client-side column filters
  const filteredData = useMemo(() => {
    const activeFilterKeys = Object.keys(columnFilters);
    if (activeFilterKeys.length === 0) return data;

    return data.filter(row => {
      return activeFilterKeys.every(key => {
        const allowed = columnFilters[key];
        const col = columns.find(c => c.key === key);
        const raw = row[key];
        const display = col?.filterRender
          ? col.filterRender(raw, row)
          : (raw != null ? String(raw) : '-');
        return allowed.has(display);
      });
    });
  }, [data, columnFilters, columns]);

  const filteredTotal = Object.keys(columnFilters).length > 0 ? filteredData.length : total;
  const totalPages = Math.ceil(filteredTotal / limit);

  // Calculate display range
  const startRow = filteredTotal === 0 ? 0 : (page - 1) * limit + 1;
  const endRow = Math.min(page * limit, filteredTotal);

  // Check if any column filter is active
  const hasActiveFilters = Object.keys(columnFilters).length > 0;

  return (
    <div>
      {/* Toolbar */}
      <div className="flex flex-col sm:flex-row gap-3 mb-4">
        {onSearch && (
          <div className="flex-1 flex gap-2">
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
              placeholder={searchPlaceholder}
              className="input-field flex-1"
            />
            <button onClick={handleSearch} className="btn-primary whitespace-nowrap">搜尋</button>
          </div>
        )}
        {filters}
        {actions}
        <ExportButton
          columns={columns}
          data={filteredData}
          filename={exportFilename || 'export'}
        />
      </div>

      {/* Active filter indicator */}
      {hasActiveFilters && (
        <div className="flex items-center gap-2 mb-3 text-xs text-gray-500">
          <span>已篩選 {filteredData.length} / {total} 筆</span>
          <button
            onClick={() => setColumnFilters({})}
            className="text-primary-600 hover:text-primary-800 font-medium"
          >
            清除所有篩選
          </button>
        </div>
      )}

      {/* Table */}
      <div className="overflow-x-auto border border-gray-200 rounded-lg">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-gray-50 border-b border-gray-200">
              {columns.map((col) => (
                <th
                  key={col.key}
                  className={`px-4 py-3 text-left font-semibold text-gray-600 ${col.className || ''} ${col.sortable && onSort ? 'cursor-pointer hover:bg-gray-100 select-none' : ''}`}
                  onClick={() => col.sortable && handleSort(col.key)}
                >
                  <div className="flex items-center gap-1">
                    <span>{col.label}</span>
                    {col.sortable && onSort && (
                      <span className="text-xs text-gray-400">
                        {sortBy === col.key ? (sortOrder === 'ASC' ? '\u25B2' : '\u25BC') : '\u25B4\u25BE'}
                      </span>
                    )}
                    {col.filterable !== false && (
                      <ColumnFilter
                        columnKey={col.key}
                        data={data}
                        activeFilters={columnFilters}
                        onFilterChange={handleFilterChange}
                        renderValue={col.filterRender}
                      />
                    )}
                  </div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={columns.length} className="px-4 py-12 text-center text-gray-500">
                <div className="flex justify-center"><div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary-600"></div></div>
              </td></tr>
            ) : filteredData.length === 0 ? (
              <tr><td colSpan={columns.length} className="px-4 py-12 text-center text-gray-500">暫無資料</td></tr>
            ) : (
              filteredData.map((row, i) => (
                <tr
                  key={row.id || i}
                  onClick={() => onRowClick?.(row)}
                  className={`border-b border-gray-100 hover:bg-blue-50 transition-colors ${onRowClick ? 'cursor-pointer' : ''}`}
                >
                  {columns.map((col) => (
                    <td key={col.key} className={`px-4 py-3 ${col.className || ''}`}>
                      {col.render ? col.render(row[col.key], row) : row[col.key] ?? '-'}
                    </td>
                  ))}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      <div className="flex items-center justify-between mt-4">
        <p className="text-sm text-gray-600">
          {filteredTotal > 0 ? (
            <>
              顯示 {startRow}-{endRow} 筆，共 {filteredTotal} 筆
              {hasActiveFilters && <span className="text-gray-400">（原始 {total} 筆）</span>}
              {totalPages > 1 ? `，第 ${page} / ${totalPages} 頁` : ''}
            </>
          ) : (
            '共 0 筆'
          )}
        </p>
        {totalPages > 1 && (
          <div className="flex gap-1">
            <button
              onClick={() => onPageChange(page - 1)}
              disabled={page <= 1}
              className="px-3 py-1 rounded border border-gray-300 text-sm disabled:opacity-50 hover:bg-gray-50"
            >
              上一頁
            </button>
            {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
              let p = i + 1;
              if (totalPages > 5) {
                if (page <= 3) p = i + 1;
                else if (page >= totalPages - 2) p = totalPages - 4 + i;
                else p = page - 2 + i;
              }
              return (
                <button
                  key={p}
                  onClick={() => onPageChange(p)}
                  className={`px-3 py-1 rounded text-sm ${p === page ? 'bg-primary-600 text-white' : 'border border-gray-300 hover:bg-gray-50'}`}
                >
                  {p}
                </button>
              );
            })}
            <button
              onClick={() => onPageChange(page + 1)}
              disabled={page >= totalPages}
              className="px-3 py-1 rounded border border-gray-300 text-sm disabled:opacity-50 hover:bg-gray-50"
            >
              下一頁
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
