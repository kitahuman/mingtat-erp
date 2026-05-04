'use client';
import { useState, useMemo, useRef, useCallback, useEffect } from 'react';
import ColumnFilter from './ColumnFilter';
import ExportButton from './ExportButton';
import ColumnCustomizer, { ColumnConfig } from './ColumnCustomizer';

interface Column {
  key: string;
  label: string;
  render?: (value: any, row: any) => React.ReactNode;
  exportRender?: (value: any, row: any) => string;
  className?: string;
  sortable?: boolean;
  filterable?: boolean;
  filterRender?: (value: any, row: any) => string;
  _width?: number;
  minWidth?: number; // explicit override
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
  onExportFetchAll?: () => Promise<any[]>;
  // Column customization props
  columnConfigs?: ColumnConfig[];
  onColumnConfigChange?: (configs: ColumnConfig[]) => void;
  onColumnConfigReset?: () => void;
  columnWidths?: Record<string, number>;
  onColumnResize?: (key: string, width: number) => void;
  // Server-side column filter props
  serverSideFilter?: boolean;
  columnFilters?: Record<string, Set<string>>;
  onColumnFilterChange?: (filters: Record<string, Set<string>>) => void;
  onFetchFilterOptions?: (columnKey: string) => Promise<string[]>;
}

/**
 * 根據欄位 key 名稱和 label 自動推算合理的最小寬度（px）
 * 確保手機上表格欄位不會被壓縮
 */
function getColMinWidth(key: string, label: string, explicitWidth?: number): number {
  // 如果有明確設定的寬度，使用該寬度
  if (explicitWidth) return explicitWidth;

  const k = key.toLowerCase();
  const l = label;

  // ── 操作按鈕欄 ──────────────────────────────────────────
  if (k === 'actions' || k === '_actions') return 100;

  // ── ID / 編號類 ──────────────────────────────────────────
  if (k === 'id') return 60;
  if (k.endsWith('_code') || k === 'emp_code' || k === 'machine_code' || k === 'code') return 90;
  if (k.endsWith('_no') || k === 'work_order_no' || k === 'quotation_no' || k === 'contract_no' || k === 'receipt_no' || k === 'cheque_number' || k === 'br_number') return 110;
  if (k === 'plate_no' || k === 'plate_number') return 100;
  if (k === 'id_number') return 130; // 香港身份證

  // ── 日期類（最重要！防止日期被截斷）──────────────────────
  if (k.endsWith('_date') || k.endsWith('_expiry') || k.endsWith('_at') || k === 'period' || k === 'date_of_birth') return 115;
  if (k.endsWith('_time') || k === 'start_time' || k === 'end_time') return 90;

  // ── 姓名類 ──────────────────────────────────────────────
  if (k === 'name_zh' || k === 'chinese_name') return 110;
  if (k === 'name_en' || k === 'english_name') return 130;
  if (k === 'name') return 110;
  if (k === 'display_name' || k === 'contact_person') return 110;

  // ── 公司 / 合作單位 / 員工 ────────────────────────────────
  if (k === 'company' || k === 'owner_company' || k === 'company_type') return 120;
  if (k === 'subcontractor' || k === 'subcontractor_id') return 120;
  if (k === 'employee' || k === 'publisher') return 110;
  if (k === 'client') return 110;
  if (k === 'project' || k === 'project_name' || k === 'project_no') return 120;

  // ── 金額類 ──────────────────────────────────────────────
  if (k.startsWith('allowance_') || k.startsWith('ot_rate') || k === 'ot_rate_standard') return 100;
  if (k === 'base_salary' || k === 'base_amount' || k === 'net_amount' || k === 'total_amount') return 100;
  if (k === 'unit_price' || k === 'day_rate' || k === 'night_rate' || k === 'mid_shift_rate') return 100;
  if (k === 'mpf_deduction' || k === 'ot_total' || k === 'allowance_total') return 100;
  if (k.endsWith('_amount') || k.endsWith('_salary') || k.endsWith('_rate') || k.endsWith('_total')) return 100;

  // ── 類型 / 狀態 / 標籤類 ──────────────────────────────────
  if (k === 'status') return 90;
  if (k === 'role' || k === 'salary_type' || k === 'machine_type' || k === 'machine_type' || k === 'partner_type' || k === 'quotation_type') return 100;
  if (k === 'day_night' || k === 'service_type') return 90;
  if (k === 'tonnage' || k === 'tonnage') return 80;

  // ── 布林值（Y/N）類 ──────────────────────────────────────
  if (k === 'is_confirmed' || k === 'is_paid' || k === 'is_piece_rate' || k === 'exclude_fuel' || k === 'has_d_cert' || k === 'is_cert_returned') return 80;
  if (k.startsWith('is_') || k.startsWith('has_')) return 80;

  // ── 聯絡資料 ──────────────────────────────────────────────
  if (k === 'phone' || k === 'mobile') return 110;
  if (k === 'email') return 150;
  if (k === 'address') return 160;

  // ── 地點 / 路線 ──────────────────────────────────────────
  if (k === 'origin' || k === 'destination' || k === 'start_location' || k === 'end_location') return 120;

  // ── 車輛 / 機械 ──────────────────────────────────────────
  if (k === 'brand' || k === 'model') return 100;
  if (k === 'equipment_number') return 110;

  // ── 數量 / 單位 ──────────────────────────────────────────
  if (k === 'quantity' || k === 'ot_quantity' || k === 'goods_quantity') return 80;
  if (k === 'unit' || k === 'ot_unit' || k === 'wage_unit') return 80;

  // ── 其他文字類 ──────────────────────────────────────────
  if (k === 'description' || k === 'remarks' || k === 'termination_reason') return 140;
  if (k === 'contract_name' || k === 'quotation') return 130;
  if (k === 'subsidiaries' || k === 'internal_prefix' || k === 'english_code') return 100;
  if (k === 'source_quotation') return 120;

  // ── 證書號碼 ──────────────────────────────────────────────
  if (k === 'yellow_cert_no' || k === 'red_cert_no') return 110;

  // ── 根據 label 長度估算（fallback）──────────────────────
  // 每個中文字約 14px，加上 padding 32px
  const labelWidth = l.length * 14 + 32;
  return Math.max(80, Math.min(labelWidth, 160));
}

export default function DataTable({
  columns, data, total, page, limit, onPageChange, onSearch,
  searchPlaceholder = '搜尋...', onRowClick, filters, actions, loading,
  sortBy, sortOrder, onSort, exportFilename, onExportFetchAll,
  columnConfigs, onColumnConfigChange, onColumnConfigReset,
  columnWidths, onColumnResize,
  serverSideFilter, columnFilters: externalColumnFilters,
  onColumnFilterChange, onFetchFilterOptions,
}: DataTableProps) {
  const [searchTerm, setSearchTerm] = useState('');
  // Internal column filters state (used in client-side mode)
  const [internalColumnFilters, setInternalColumnFilters] = useState<Record<string, Set<string>>>({});
  const resizingRef = useRef<{ key: string; startX: number; startWidth: number } | null>(null);

  // Use external or internal column filters depending on mode
  const isServerSide = !!(serverSideFilter && onColumnFilterChange);
  const columnFilters = isServerSide ? (externalColumnFilters || {}) : internalColumnFilters;

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
    if (isServerSide) {
      // Server-side mode: update external state and trigger re-fetch
      const next = { ...columnFilters };
      if (selectedValues === null) {
        delete next[columnKey];
      } else {
        next[columnKey] = selectedValues;
      }
      onColumnFilterChange!(next);
    } else {
      // Client-side mode: update internal state
      setInternalColumnFilters(prev => {
        const next = { ...prev };
        if (selectedValues === null) {
          delete next[columnKey];
        } else {
          next[columnKey] = selectedValues;
        }
        return next;
      });
    }
  };

  // Column resize handlers
  const handleResizeStart = useCallback((e: React.MouseEvent, key: string) => {
    e.preventDefault();
    e.stopPropagation();
    const th = (e.target as HTMLElement).closest('th');
    const startWidth = th?.offsetWidth || 120;
    resizingRef.current = { key, startX: e.clientX, startWidth };

    const handleMouseMove = (e: MouseEvent) => {
      if (!resizingRef.current) return;
      const diff = e.clientX - resizingRef.current.startX;
      const newWidth = Math.max(60, resizingRef.current.startWidth + diff);
      onColumnResize?.(resizingRef.current.key, newWidth);
    };

    const handleMouseUp = () => {
      resizingRef.current = null;
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
  }, [onColumnResize]);

  // Apply client-side column filters (only in client-side mode)
  const filteredData = useMemo(() => {
    if (isServerSide) return data; // Server-side mode: data is already filtered
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
  }, [data, columnFilters, columns, isServerSide]);

  const filteredTotal = isServerSide ? total : (Object.keys(columnFilters).length > 0 ? filteredData.length : total);
  const totalPages = Math.ceil(filteredTotal / limit);

  // Calculate display range
  const startRow = filteredTotal === 0 ? 0 : (page - 1) * limit + 1;
  const endRow = Math.min(page * limit, filteredTotal);

  // Check if any column filter is active
  const hasActiveFilters = Object.keys(columnFilters).length > 0;

  // Determine if column customization is enabled
  const hasColumnCustomization = !!columnConfigs && !!onColumnConfigChange;

  // Calculate total min-width for the table (sum of all column min-widths)
  const tableMinWidth = useMemo(() => {
    return columns.reduce((sum, col) => {
      const explicit = col._width || (columnWidths && columnWidths[col.key]);
      return sum + getColMinWidth(col.key, col.label, explicit || col.minWidth);
    }, 0);
  }, [columns, columnWidths]);

  // Clear all filters handler
  const handleClearAllFilters = () => {
    if (isServerSide) {
      onColumnFilterChange!({});
    } else {
      setInternalColumnFilters({});
    }
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
        {/* Filters - wrap on mobile */}
        {filters && (
          <div className="flex flex-wrap gap-2 items-center">
            {filters}
          </div>
        )}
        {actions}
        <div className="flex gap-2 items-center shrink-0">
          <ExportButton
            columns={columns}
            data={filteredData}
            filename={exportFilename || 'export'}
            onFetchAll={onExportFetchAll}
          />
          {hasColumnCustomization && (
            <ColumnCustomizer
              columns={columnConfigs!}
              onChange={onColumnConfigChange!}
              onReset={onColumnConfigReset || (() => {})}
            />
          )}
        </div>
      </div>

      {/* Active filter indicator */}
      {hasActiveFilters && (
        <div className="flex items-center gap-2 mb-3 text-xs text-gray-500">
          <span>
            {isServerSide
              ? `已套用 ${Object.keys(columnFilters).length} 個欄位篩選，共 ${total} 筆結果`
              : `已篩選 ${filteredData.length} / ${total} 筆`
            }
          </span>
          <button
            onClick={handleClearAllFilters}
            className="text-primary-600 hover:text-primary-800 font-medium"
          >
            清除所有篩選
          </button>
        </div>
      )}

      {/* Table - always scrollable horizontally */}
      <div className={`overflow-x-auto border border-gray-200 rounded-lg ${filteredData.length === 0 ? 'min-h-[360px]' : ''}`}>
        <table
          className="w-full text-sm"
          style={{
            tableLayout: onColumnResize ? 'fixed' : 'auto',
            minWidth: `${Math.max(tableMinWidth, 600)}px`,
          }}
        >
          <thead>
            <tr className="bg-gray-50 border-b border-gray-200">
              {columns.map((col) => {
                const explicitW = col._width || (columnWidths && columnWidths[col.key]);
                const minW = getColMinWidth(col.key, col.label, explicitW || col.minWidth);
                return (
                  <th
                    key={col.key}
                    className={`px-3 py-3 text-left font-semibold text-gray-600 relative ${col.className || ''} ${col.sortable && onSort ? 'cursor-pointer hover:bg-gray-100 select-none' : ''}`}
                    style={
                      explicitW
                        ? { width: `${explicitW}px`, minWidth: `${explicitW}px` }
                        : { minWidth: `${minW}px` }
                    }
                    onClick={() => col.sortable && handleSort(col.key)}
                  >
                    <div className="flex items-center gap-1 whitespace-nowrap">
                      <span>{col.label}</span>
                      {col.sortable && onSort && (
                        <span className="text-xs text-gray-400 shrink-0">
                          {sortBy === col.key ? (sortOrder === 'ASC' ? '▲' : '▼') : '▴▾'}
                        </span>
                      )}
                      {col.filterable !== false && (
                        <ColumnFilter
                          columnKey={col.key}
                          data={data}
                          activeFilters={columnFilters}
                          onFilterChange={handleFilterChange}
                          renderValue={col.filterRender}
                          serverSide={isServerSide}
                          onFetchOptions={onFetchFilterOptions}
                        />
                      )}
                    </div>
                    {/* Resize handle */}
                    {onColumnResize && (
                      <div
                        className="absolute right-0 top-0 bottom-0 w-1.5 cursor-col-resize hover:bg-blue-400 transition-colors"
                        onMouseDown={(e) => handleResizeStart(e, col.key)}
                        onClick={(e) => e.stopPropagation()}
                      />
                    )}
                  </th>
                );
              })}
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
                  {columns.map((col) => {
                    const explicitW = col._width || (columnWidths && columnWidths[col.key]);
                    const minW = getColMinWidth(col.key, col.label, explicitW || col.minWidth);
                    return (
                      <td
                        key={col.key}
                        className={`px-3 py-3 ${col.className || ''}`}
                        style={
                          explicitW
                            ? { width: `${explicitW}px`, maxWidth: `${explicitW}px`, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }
                            : { minWidth: `${minW}px`, whiteSpace: 'nowrap' }
                        }
                      >
                        {col.render ? col.render(row[col.key], row) : row[col.key] ?? '-'}
                      </td>
                    );
                  })}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      <div className="flex flex-col sm:flex-row items-center justify-between mt-4 gap-2">
        <p className="text-sm text-gray-600">
          {filteredTotal > 0 ? (
            <>
              顯示 {startRow}-{endRow} 筆，共 {filteredTotal} 筆
              {hasActiveFilters && !isServerSide && <span className="text-gray-400">（原始 {total} 筆）</span>}
              {totalPages > 1 ? `，第 ${page} / ${totalPages} 頁` : ''}
            </>
          ) : (
            '共 0 筆'
          )}
        </p>
        {totalPages > 1 && (
          <div className="flex gap-1 flex-wrap justify-center">
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
