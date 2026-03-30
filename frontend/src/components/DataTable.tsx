'use client';
import { useState } from 'react';

interface Column {
  key: string;
  label: string;
  render?: (value: any, row: any) => React.ReactNode;
  className?: string;
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
}

export default function DataTable({
  columns, data, total, page, limit, onPageChange, onSearch,
  searchPlaceholder = '搜尋...', onRowClick, filters, actions, loading
}: DataTableProps) {
  const [searchTerm, setSearchTerm] = useState('');
  const totalPages = Math.ceil(total / limit);

  const handleSearch = () => {
    onSearch?.(searchTerm);
  };

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
      </div>

      {/* Table */}
      <div className="overflow-x-auto border border-gray-200 rounded-lg">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-gray-50 border-b border-gray-200">
              {columns.map((col) => (
                <th key={col.key} className={`px-4 py-3 text-left font-semibold text-gray-600 ${col.className || ''}`}>
                  {col.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={columns.length} className="px-4 py-12 text-center text-gray-500">載入中...</td></tr>
            ) : data.length === 0 ? (
              <tr><td colSpan={columns.length} className="px-4 py-12 text-center text-gray-500">暫無資料</td></tr>
            ) : (
              data.map((row, i) => (
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
      {totalPages > 1 && (
        <div className="flex items-center justify-between mt-4">
          <p className="text-sm text-gray-600">
            共 {total} 筆，第 {page} / {totalPages} 頁
          </p>
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
        </div>
      )}
    </div>
  );
}
