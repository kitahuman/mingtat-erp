'use client';
import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { subconPayrollApi, partnersApi } from '@/lib/api';
import SearchableSelect from '@/components/SearchableSelect';
import Link from 'next/link';

const STATUS_LABELS: Record<string, string> = {
  draft: '草稿',
  confirmed: '已確認',
  paid: '已付款',
  partially_paid: '部分付款',
  cancelled: '已取消',
};

const STATUS_COLORS: Record<string, string> = {
  draft: 'bg-gray-100 text-gray-800',
  confirmed: 'bg-blue-100 text-blue-800',
  paid: 'bg-green-100 text-green-800',
  partially_paid: 'bg-yellow-100 text-yellow-800',
  cancelled: 'bg-red-100 text-red-800',
};

type Option = { value: any; label: string };

export default function SubconPayrollRecordsPage() {
  const router = useRouter();
  const [data, setData] = useState<any[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);

  // Filters
  const [subcons, setSubcons] = useState<Option[]>([]);
  const [selectedSubcon, setSelectedSubcon] = useState<number | null>(null);
  const [month, setMonth] = useState('');
  const [statusFilter, setStatusFilter] = useState('');

  useEffect(() => {
    partnersApi.simple().then(res => {
      const list = (res.data || [])
        .filter((p: any) => p.partner_type === 'subcontractor')
        .map((p: any) => ({ value: p.id, label: p.name }));
      setSubcons(list);
    }).catch(console.error);
  }, []);

  const loadData = async () => {
    setLoading(true);
    try {
      const params: any = { page, limit: 20 };
      if (selectedSubcon) params.subcon_id = selectedSubcon;
      if (month) params.month = month;
      if (statusFilter) params.status = statusFilter;
      const res = await subconPayrollApi.list(params);
      setData(res.data.data || []);
      setTotal(res.data.total || 0);
    } catch (err) {
      console.error(err);
    }
    setLoading(false);
  };

  useEffect(() => { loadData(); }, [page, selectedSubcon, month, statusFilter]);

  const handleDelete = async (id: number, name: string) => {
    if (!confirm(`確定要刪除 ${name} 的糧單嗎？此操作將同時刪除關聯的支出記錄。`)) return;
    try {
      await subconPayrollApi.remove(id);
      loadData();
    } catch (err: any) {
      alert(err.response?.data?.message || '刪除失敗');
    }
  };

  const formatMonth = (dateStr: string) => {
    if (!dateStr) return '-';
    const d = new Date(dateStr);
    return `${d.getFullYear()}年${d.getMonth() + 1}月`;
  };

  const totalPages = Math.ceil(total / 20);

  return (
    <div className="p-6 max-w-full">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">判頭糧單記錄</h1>
        <Link href="/subcon-payroll"
          className="text-sm text-primary-600 hover:text-primary-700 border border-primary-300 rounded px-3 py-1.5 hover:bg-primary-50">
          新增糧單
        </Link>
      </div>

      {/* Filters */}
      <div className="bg-white rounded-lg shadow p-4 mb-6">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 items-end">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">供應商</label>
            <SearchableSelect
              options={subcons}
              value={selectedSubcon}
              onChange={(v) => { setSelectedSubcon(v as number | null); setPage(1); }}
              placeholder="全部供應商"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">月份</label>
            <input
              type="month"
              value={month}
              onChange={e => { setMonth(e.target.value); setPage(1); }}
              className="border rounded px-2 py-1.5 text-sm w-full"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">狀態</label>
            <select
              value={statusFilter}
              onChange={e => { setStatusFilter(e.target.value); setPage(1); }}
              className="border rounded px-2 py-1.5 text-sm w-full"
            >
              <option value="">全部</option>
              <option value="confirmed">已確認</option>
              <option value="paid">已付款</option>
              <option value="partially_paid">部分付款</option>
              <option value="cancelled">已取消</option>
            </select>
          </div>
          <div>
            <button
              onClick={() => { setSelectedSubcon(null); setMonth(''); setStatusFilter(''); setPage(1); }}
              className="text-sm text-gray-500 hover:text-gray-700 border rounded px-3 py-1.5 w-full"
            >
              清除篩選
            </button>
          </div>
        </div>
      </div>

      {/* Table */}
      <div className="bg-white rounded-lg shadow overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-4 py-3 text-left font-medium text-gray-600">#</th>
              <th className="px-4 py-3 text-left font-medium text-gray-600">供應商</th>
              <th className="px-4 py-3 text-left font-medium text-gray-600">月份</th>
              <th className="px-4 py-3 text-right font-medium text-gray-600">總金額</th>
              <th className="px-4 py-3 text-center font-medium text-gray-600">明細筆數</th>
              <th className="px-4 py-3 text-center font-medium text-gray-600">狀態</th>
              <th className="px-4 py-3 text-left font-medium text-gray-600">確認時間</th>
              <th className="px-4 py-3 text-center font-medium text-gray-600">操作</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {loading ? (
              <tr>
                <td colSpan={8} className="px-4 py-8 text-center text-gray-400">載入中...</td>
              </tr>
            ) : data.length === 0 ? (
              <tr>
                <td colSpan={8} className="px-4 py-8 text-center text-gray-400">沒有糧單記錄</td>
              </tr>
            ) : (
              data.map((row: any) => (
                <tr key={row.id} className="hover:bg-gray-50 cursor-pointer" onClick={() => router.push(`/subcon-payroll/${row.id}`)}>
                  <td className="px-4 py-3 text-gray-400">{row.id}</td>
                  <td className="px-4 py-3 font-medium">{row.subcontractor?.name || '-'}</td>
                  <td className="px-4 py-3">{formatMonth(row.subcon_payroll_month)}</td>
                  <td className="px-4 py-3 text-right font-mono font-bold">
                    ${Number(row.subcon_payroll_total_amount).toLocaleString()}
                  </td>
                  <td className="px-4 py-3 text-center">{row._count?.items || 0}</td>
                  <td className="px-4 py-3 text-center">
                    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_COLORS[row.subcon_payroll_status] || 'bg-gray-100 text-gray-800'}`}>
                      {STATUS_LABELS[row.subcon_payroll_status] || row.subcon_payroll_status}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-gray-500 text-xs">
                    {row.subcon_payroll_confirmed_at
                      ? new Date(row.subcon_payroll_confirmed_at).toLocaleString('zh-HK')
                      : '-'}
                  </td>
                  <td className="px-4 py-3 text-center" onClick={e => e.stopPropagation()}>
                    <button
                      onClick={() => handleDelete(row.id, row.subcontractor?.name || '')}
                      className="text-red-500 hover:text-red-700 text-xs"
                      title="刪除"
                    >
                      刪除
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between px-4 py-3 border-t bg-gray-50">
            <p className="text-sm text-gray-500">共 {total} 筆</p>
            <div className="flex gap-1">
              <button
                onClick={() => setPage(p => Math.max(1, p - 1))}
                disabled={page === 1}
                className="px-3 py-1 text-sm border rounded disabled:opacity-50"
              >
                上一頁
              </button>
              <span className="px-3 py-1 text-sm">{page} / {totalPages}</span>
              <button
                onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                disabled={page === totalPages}
                className="px-3 py-1 text-sm border rounded disabled:opacity-50"
              >
                下一頁
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
