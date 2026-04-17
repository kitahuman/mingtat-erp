'use client';

import { useState, useEffect, useCallback } from 'react';
import Cookies from 'js-cookie';
import { useAuth } from '@/lib/auth';

interface DeletedByUser {
  id: number;
  displayName: string | null;
  username: string;
}

interface DeletedRecord {
  id: number;
  table: string;
  name_zh?: string;
  emp_code?: string;
  plate_number?: string;
  machine_type?: string;
  machine_code?: string;
  code?: string;
  name?: string;
  contract_no?: string;
  contract_name?: string;
  project_no?: string;
  project_name?: string;
  quotation_no?: string;
  quotation_date?: string;
  rate_card_type?: string;
  item?: string;
  date?: string;
  invoice_no?: string;
  service_type?: string;
  scheduled_date?: string;
  daily_report_date?: string;
  deleted_at: string;
  deleted_by_user?: DeletedByUser | null;
}

const TABLE_LABELS: Record<string, string> = {
  companies: '公司',
  employees: '員工',
  vehicles: '車輛',
  machinery: '機械',
  partners: '合作單位',
  contracts: '合約',
  projects: '工程項目',
  quotations: '報價單',
  rate_cards: '價目表',
  expenses: '費用',
  invoices: '發票',
  work_logs: '工作記錄',
  daily_reports: '工程日報',
};

const TABLES = [
  { value: 'all', label: '所有表' },
  { value: 'companies', label: '公司' },
  { value: 'employees', label: '員工' },
  { value: 'vehicles', label: '車輛' },
  { value: 'machinery', label: '機械' },
  { value: 'partners', label: '合作單位' },
  { value: 'contracts', label: '合約' },
  { value: 'projects', label: '工程項目' },
  { value: 'quotations', label: '報價單' },
  { value: 'rate_cards', label: '價目表' },
  { value: 'expenses', label: '費用' },
  { value: 'invoices', label: '發票' },
  { value: 'work_logs', label: '工作記錄' },
  { value: 'daily_reports', label: '工程日報' },
];

export default function RecycleBinPage() {
  const { isReadOnly } = useAuth();
  const [records, setRecords] = useState<DeletedRecord[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(25);
  const [loading, setLoading] = useState(false);
  const [filterTable, setFilterTable] = useState('all');
  const [restoring, setRestoring] = useState<number | null>(null);
  const [deleting, setDeleting] = useState<number | null>(null);

  const fetchRecords = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      params.append('page', String(page));
      params.append('limit', String(limit));
      if (filterTable !== 'all') params.append('table', filterTable);

      const token = Cookies.get('token');
      const res = await fetch(`/api/recycle-bin?${params.toString()}`, {
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      });
      const data = await res.json();
      setRecords(data.data || []);
      setTotal(data.total || 0);
    } catch (err) {
      console.error('Failed to fetch deleted records:', err);
    } finally {
      setLoading(false);
    }
  }, [page, limit, filterTable]);

  useEffect(() => {
    fetchRecords();
  }, [fetchRecords]);

  const handleRestore = async (table: string, id: number) => {
    if (!confirm('確定要恢復此記錄嗎？')) return;

    setRestoring(id);
    try {
      const token = Cookies.get('token');
      const res = await fetch('/api/recycle-bin/restore', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({ table, id }),
      });

      if (res.ok) {
        alert('記錄已恢復');
        fetchRecords();
      } else {
        alert('恢復失敗');
      }
    } catch (err) {
      console.error('Failed to restore record:', err);
      alert('恢復失敗');
    } finally {
      setRestoring(null);
    }
  };

  const handlePermanentDelete = async (table: string, id: number) => {
    if (!confirm('確定要永久刪除此記錄嗎？此操作無法撤銷。')) return;

    setDeleting(id);
    try {
      const token = Cookies.get('token');
      const res = await fetch('/api/recycle-bin/permanent', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({ table, id }),
      });

      if (res.ok) {
        alert('記錄已永久刪除');
        fetchRecords();
      } else {
        alert('刪除失敗');
      }
    } catch (err) {
      console.error('Failed to delete record:', err);
      alert('刪除失敗');
    } finally {
      setDeleting(null);
    }
  };

  const getRecordName = (record: DeletedRecord): string => {
    return (
      record.name_zh ||
      record.name ||
      record.plate_number ||
      record.machine_code ||
      record.code ||
      record.contract_no ||
      record.project_no ||
      record.quotation_no ||
      record.invoice_no ||
      record.item ||
      `ID: ${record.id}`
    );
  };

  const getDeletedByName = (record: DeletedRecord): string => {
    if (!record.deleted_by_user) return '—';
    return record.deleted_by_user.displayName || record.deleted_by_user.username;
  };

  const totalPages = Math.ceil(total / limit);

  return (
    <div className="flex flex-col h-full bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 px-6 py-4">
        <h1 className="text-2xl font-bold text-gray-900">垃圾桶</h1>
        <p className="text-sm text-gray-600 mt-1">查看和管理已刪除的記錄</p>
      </div>

      {/* Filters */}
      <div className="bg-white border-b border-gray-200 px-6 py-4">
        <div className="flex items-center gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">表名</label>
            <select
              value={filterTable}
              onChange={e => { setFilterTable(e.target.value); setPage(1); }}
              className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            >
              {TABLES.map(t => (
                <option key={t.value} value={t.value}>{t.label}</option>
              ))}
            </select>
          </div>
          <button
            onClick={() => { setFilterTable('all'); setPage(1); }}
            className="mt-6 px-4 py-2 text-sm bg-gray-200 text-gray-800 rounded-lg hover:bg-gray-300 font-medium"
          >
            重置篩選
          </button>
        </div>
      </div>

      {/* Table */}
      <div className="flex-1 overflow-auto">
        <table className="w-full text-sm">
          <thead className="bg-gray-100 border-b border-gray-200 sticky top-0">
            <tr>
              <th className="px-6 py-3 text-left font-semibold text-gray-700">表名</th>
              <th className="px-6 py-3 text-left font-semibold text-gray-700">記錄名稱</th>
              <th className="px-6 py-3 text-left font-semibold text-gray-700">刪除時間</th>
              <th className="px-6 py-3 text-left font-semibold text-gray-700">刪除者</th>
              <th className="px-6 py-3 text-left font-semibold text-gray-700">操作</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={5} className="px-6 py-8 text-center text-gray-500">
                  加載中...
                </td>
              </tr>
            ) : records.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-6 py-8 text-center text-gray-500">
                  垃圾桶是空的
                </td>
              </tr>
            ) : (
              records.map(record => (
                <tr key={`${record.table}-${record.id}`} className="border-b border-gray-100 hover:bg-gray-50">
                  <td className="px-6 py-3 text-gray-900 font-medium">
                    {TABLE_LABELS[record.table] || record.table}
                  </td>
                  <td className="px-6 py-3 text-gray-900">
                    {getRecordName(record)}
                  </td>
                  <td className="px-6 py-3 text-gray-600 text-sm">
                    {new Date(record.deleted_at).toLocaleString('zh-HK')}
                  </td>
                  <td className="px-6 py-3 text-gray-600 text-sm">
                    {getDeletedByName(record)}
                  </td>
                  <td className="px-6 py-3">
                    <div className="flex gap-2">
                      <button
                        onClick={() => handleRestore(record.table, record.id)}
                        disabled={restoring === record.id}
                        className="px-3 py-1.5 text-xs bg-green-50 text-green-600 rounded hover:bg-green-100 disabled:opacity-50 font-medium"
                      >
                        {restoring === record.id ? '恢復中...' : '恢復'}
                      </button>
                      <button
                        onClick={() => handlePermanentDelete(record.table, record.id)}
                        disabled={deleting === record.id}
                        className="px-3 py-1.5 text-xs bg-red-50 text-red-600 rounded hover:bg-red-100 disabled:opacity-50 font-medium"
                      >
                        {deleting === record.id ? '刪除中...' : '永久刪除'}
                      </button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      <div className="bg-white border-t border-gray-200 px-6 py-3 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <span className="text-sm text-gray-600">每頁顯示</span>
          <select
            value={limit}
            onChange={e => { setLimit(Number(e.target.value)); setPage(1); }}
            className="px-2 py-1 text-sm border border-gray-300 rounded"
          >
            {[10, 25, 50, 100].map(l => (
              <option key={l} value={l}>{l} 筆</option>
            ))}
          </select>
          <span className="text-sm text-gray-500">
            第 {Math.min((page - 1) * limit + 1, total)}–{Math.min(page * limit, total)} 筆，共 {total} 筆
          </span>
        </div>

        <div className="flex items-center gap-1">
          <button
            onClick={() => setPage(1)}
            disabled={page === 1}
            className="px-2 py-1 text-sm border border-gray-300 rounded disabled:opacity-40 hover:bg-gray-50"
          >
            «
          </button>
          <button
            onClick={() => setPage(Math.max(1, page - 1))}
            disabled={page === 1}
            className="px-3 py-1 text-sm border border-gray-300 rounded disabled:opacity-40 hover:bg-gray-50"
          >
            ‹ 上一頁
          </button>

          {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
            let p: number;
            if (totalPages <= 5) p = i + 1;
            else if (page <= 3) p = i + 1;
            else if (page >= totalPages - 2) p = totalPages - 4 + i;
            else p = page - 2 + i;
            return (
              <button
                key={p}
                onClick={() => setPage(p)}
                className={`px-3 py-1 text-sm border rounded ${
                  p === page
                    ? 'bg-blue-600 text-white border-blue-600'
                    : 'border-gray-300 hover:bg-gray-50'
                }`}
              >
                {p}
              </button>
            );
          })}

          <button
            onClick={() => setPage(Math.min(totalPages, page + 1))}
            disabled={page >= totalPages}
            className="px-3 py-1 text-sm border border-gray-300 rounded disabled:opacity-40 hover:bg-gray-50"
          >
            下一頁 ›
          </button>
          <button
            onClick={() => setPage(totalPages)}
            disabled={page >= totalPages}
            className="px-2 py-1 text-sm border border-gray-300 rounded disabled:opacity-40 hover:bg-gray-50"
          >
            »
          </button>
        </div>
      </div>
    </div>
  );
}
