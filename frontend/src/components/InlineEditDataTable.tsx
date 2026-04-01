'use client';
import { useState, useCallback } from 'react';
import DataTable from './DataTable';
import { ColumnConfig } from './ColumnCustomizer';

export interface InlineColumn {
  key: string;
  label: string;
  sortable?: boolean;
  className?: string;
  render?: (value: any, row: any) => React.ReactNode;
  exportRender?: (value: any, row: any) => string;
  filterRender?: (value: any, row: any) => string;
  _width?: number;
  // Inline edit config
  editable?: boolean;       // default: true (set false to explicitly disable)
  editType?: 'text' | 'number' | 'select' | 'date';
  editOptions?: { value: string | number; label: string }[];
  editRender?: (value: any, onChange: (val: any) => void, row: any) => React.ReactNode;
}

interface InlineEditDataTableProps {
  columns: InlineColumn[];
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
  // Column customization
  columnConfigs?: ColumnConfig[];
  onColumnConfigChange?: (configs: ColumnConfig[]) => void;
  onColumnConfigReset?: () => void;
  columnWidths?: Record<string, number>;
  onColumnResize?: (key: string, width: number) => void;
  // Inline edit
  onSave: (id: number, data: any) => Promise<void>;
  onDelete?: (id: number) => Promise<void>;
  idField?: string;
}

/** Auto-detect if a field key looks like a date field */
function isDateKey(key: string): boolean {
  return /(_date|_expiry|_at|_birthday|date$|expiry$)/i.test(key);
}

/** Format date value for date input (YYYY-MM-DD) */
function toDateInputValue(val: any): string {
  if (!val) return '';
  if (typeof val === 'string') {
    // Already YYYY-MM-DD
    if (/^\d{4}-\d{2}-\d{2}$/.test(val)) return val;
    // ISO format
    try {
      const d = new Date(val);
      if (!isNaN(d.getTime())) return d.toISOString().substring(0, 10);
    } catch {}
    return val.substring(0, 10);
  }
  return '';
}

export default function InlineEditDataTable({
  columns, data, total, page, limit, onPageChange, onSearch,
  searchPlaceholder, onRowClick, filters, actions, loading,
  sortBy, sortOrder, onSort, exportFilename,
  columnConfigs, onColumnConfigChange, onColumnConfigReset,
  columnWidths, onColumnResize,
  onSave, onDelete, idField = 'id',
}: InlineEditDataTableProps) {
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editForm, setEditForm] = useState<any>({});
  const [saving, setSaving] = useState(false);

  const startEdit = useCallback((row: any) => {
    setEditingId(row[idField]);
    setEditForm({ ...row });
  }, [idField]);

  const cancelEdit = useCallback(() => {
    setEditingId(null);
    setEditForm({});
  }, []);

  const handleSave = useCallback(async () => {
    if (editingId === null) return;
    setSaving(true);
    try {
      await onSave(editingId, editForm);
      setEditingId(null);
      setEditForm({});
    } catch (err: any) {
      alert(err?.response?.data?.message || '儲存失敗');
    }
    setSaving(false);
  }, [editingId, editForm, onSave]);

  const handleDelete = useCallback(async (id: number) => {
    if (!onDelete) return;
    if (!confirm('確定要刪除此記錄嗎？')) return;
    try {
      await onDelete(id);
    } catch (err: any) {
      alert(err?.response?.data?.message || '刪除失敗');
    }
  }, [onDelete]);

  const handleFieldChange = useCallback((key: string, value: any) => {
    setEditForm((prev: any) => ({ ...prev, [key]: value }));
  }, []);

  // Build display columns with inline edit support
  const displayColumns = columns.map(col => {
    // Determine effective editable: default true unless explicitly false
    const isEditable = col.editable !== false;
    // Auto-detect edit type if not specified
    const effectiveEditType = col.editType || (isDateKey(col.key) ? 'date' : 'text');

    return {
      ...col,
      render: (value: any, row: any) => {
        const isEditing = row[idField] === editingId;

        if (isEditing && isEditable) {
          // Custom edit renderer
          if (col.editRender) {
            return col.editRender(
              editForm[col.key],
              (val: any) => handleFieldChange(col.key, val),
              editForm
            );
          }

          // Standard edit types
          switch (effectiveEditType) {
            case 'select':
              return (
                <select
                  value={editForm[col.key] ?? ''}
                  onChange={(e) => handleFieldChange(col.key, e.target.value)}
                  className="w-full px-2 py-1 text-sm border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-primary-500"
                  onClick={(e) => e.stopPropagation()}
                >
                  <option value="">-</option>
                  {col.editOptions?.map(opt => (
                    <option key={opt.value} value={opt.value}>{opt.label}</option>
                  ))}
                </select>
              );
            case 'number':
              return (
                <input
                  type="number"
                  value={editForm[col.key] ?? ''}
                  onChange={(e) => handleFieldChange(col.key, e.target.value === '' ? null : Number(e.target.value))}
                  className="w-full px-2 py-1 text-sm border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-primary-500"
                  onClick={(e) => e.stopPropagation()}
                />
              );
            case 'date':
              return (
                <input
                  type="date"
                  value={toDateInputValue(editForm[col.key])}
                  onChange={(e) => handleFieldChange(col.key, e.target.value || null)}
                  className="w-full px-2 py-1 text-sm border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-primary-500"
                  onClick={(e) => e.stopPropagation()}
                />
              );
            default: // text
              return (
                <input
                  type="text"
                  value={editForm[col.key] ?? ''}
                  onChange={(e) => handleFieldChange(col.key, e.target.value)}
                  className="w-full px-2 py-1 text-sm border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-primary-500"
                  onClick={(e) => e.stopPropagation()}
                />
              );
          }
        }

        // Normal display mode - format dates automatically
        if (!isEditing && isDateKey(col.key) && value && !col.render) {
          return toDateInputValue(value) || '-';
        }

        return col.render ? col.render(value, row) : (value ?? '-');
      },
    };
  });

  // Add action column
  const actionColumn = {
    key: '_actions',
    label: '操作',
    className: 'w-40 text-center',
    filterable: false,
    render: (_: any, row: any) => {
      const isEditing = row[idField] === editingId;
      if (isEditing) {
        return (
          <div className="flex gap-1 justify-center" onClick={(e) => e.stopPropagation()}>
            <button
              onClick={handleSave}
              disabled={saving}
              className="px-2 py-1 text-xs bg-green-600 text-white rounded hover:bg-green-700 disabled:opacity-50"
            >
              {saving ? '...' : '儲存'}
            </button>
            <button
              onClick={cancelEdit}
              className="px-2 py-1 text-xs bg-gray-400 text-white rounded hover:bg-gray-500"
            >
              取消
            </button>
            {onDelete && (
              <button
                onClick={() => handleDelete(row[idField])}
                className="px-2 py-1 text-xs bg-red-500 text-white rounded hover:bg-red-600"
              >
                刪除
              </button>
            )}
          </div>
        );
      }
      return (
        <div className="flex gap-1 justify-center" onClick={(e) => e.stopPropagation()}>
          <button
            onClick={() => startEdit(row)}
            className="px-2 py-1 text-xs bg-blue-600 text-white rounded hover:bg-blue-700"
          >
            編輯
          </button>
          {onDelete && (
            <button
              onClick={() => handleDelete(row[idField])}
              className="px-2 py-1 text-xs bg-red-500 text-white rounded hover:bg-red-600"
            >
              刪除
            </button>
          )}
        </div>
      );
    },
  };

  const allColumns = [...displayColumns, actionColumn];

  return (
    <DataTable
      columns={allColumns}
      data={data}
      total={total}
      page={page}
      limit={limit}
      onPageChange={onPageChange}
      onSearch={onSearch}
      searchPlaceholder={searchPlaceholder}
      onRowClick={editingId ? undefined : onRowClick}
      filters={filters}
      actions={actions}
      loading={loading}
      sortBy={sortBy}
      sortOrder={sortOrder}
      onSort={onSort}
      exportFilename={exportFilename}
      columnConfigs={columnConfigs}
      onColumnConfigChange={onColumnConfigChange}
      onColumnConfigReset={onColumnConfigReset}
      columnWidths={columnWidths}
      onColumnResize={onColumnResize}
    />
  );
}
