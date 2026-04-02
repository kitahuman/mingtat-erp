'use client';
import { useState, useEffect } from 'react';
import Link from 'next/link';
import { projectProfitLossApi } from '@/lib/api';
import ExportButton from '@/components/ExportButton';

const STATUS_LABELS: Record<string, string> = {
  pending: '待開工',
  active: '進行中',
  completed: '已完工',
  suspended: '暫停',
  cancelled: '已取消',
};

const STATUS_COLORS: Record<string, string> = {
  pending: 'bg-yellow-100 text-yellow-800',
  active: 'bg-green-100 text-green-800',
  completed: 'bg-blue-100 text-blue-800',
  suspended: 'bg-orange-100 text-orange-800',
  cancelled: 'bg-red-100 text-red-800',
};

function formatMoney(n: number): string {
  if (n === 0) return '$0.00';
  return '$' + n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function formatPercent(n: number): string {
  return n.toFixed(1) + '%';
}

type SortField = 'project_no' | 'project_name' | 'contract_amount' | 'cumulative_certified' | 'total_cost' | 'gross_profit' | 'gross_profit_rate' | 'completion_percentage';

export default function ProfitLossOverviewPage() {
  const [data, setData] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState('');
  const [search, setSearch] = useState('');
  const [sortBy, setSortBy] = useState<SortField>('project_no');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');

  useEffect(() => {
    loadData();
  }, [statusFilter, sortBy, sortOrder]);

  const loadData = async () => {
    try {
      setLoading(true);
      const res = await projectProfitLossApi.getOverview({
        status: statusFilter || undefined,
        sort_by: sortBy,
        sort_order: sortOrder,
      });
      setData(res.data.data || []);
    } catch (err) {
      console.error('載入失敗', err);
    } finally {
      setLoading(false);
    }
  };

  const handleSort = (field: SortField) => {
    if (sortBy === field) {
      setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
    } else {
      setSortBy(field);
      setSortOrder('desc');
    }
  };

  const SortIcon = ({ field }: { field: SortField }) => {
    if (sortBy !== field) return <span className="text-gray-300 ml-1">↕</span>;
    return <span className="text-primary-600 ml-1">{sortOrder === 'asc' ? '↑' : '↓'}</span>;
  };

  const filteredData = search
    ? data.filter(
        (d) =>
          d.project_no?.toLowerCase().includes(search.toLowerCase()) ||
          d.project_name?.toLowerCase().includes(search.toLowerCase()) ||
          d.client_name?.toLowerCase().includes(search.toLowerCase()),
      )
    : data;

  // Summary totals
  const totals = filteredData.reduce(
    (acc, d) => ({
      contract_amount: acc.contract_amount + (d.contract_amount || 0),
      total_revenue: acc.total_revenue + (d.total_revenue || 0),
      total_cost: acc.total_cost + (d.total_cost || 0),
      gross_profit: acc.gross_profit + (d.gross_profit || 0),
    }),
    { contract_amount: 0, total_revenue: 0, total_cost: 0, gross_profit: 0 },
  );
  const totalGrossProfitRate = totals.total_revenue > 0
    ? (totals.gross_profit / totals.total_revenue) * 100
    : 0;

  const exportColumns = [
    { key: 'project_no', label: '工程編號' },
    { key: 'project_name', label: '工程名稱' },
    { key: 'client_name', label: '客戶' },
    { key: 'status', label: '狀態', exportRender: (v: string) => STATUS_LABELS[v] || v },
    { key: 'contract_amount', label: '合約金額' },
    { key: 'cumulative_certified', label: '累計認證' },
    { key: 'invoice_revenue', label: '發票收入' },
    { key: 'total_revenue', label: '總收入' },
    { key: 'total_cost', label: '總成本' },
    { key: 'gross_profit', label: '毛利' },
    { key: 'gross_profit_rate', label: '毛利率 (%)', exportRender: (v: number) => v.toFixed(1) },
    { key: 'completion_percentage', label: '完工 (%)', exportRender: (v: number) => v.toFixed(1) },
  ];

  return (
    <div className="p-4 md:p-6 space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">工程損益總覽</h1>
          <p className="text-sm text-gray-500 mt-1">所有工程項目的損益摘要</p>
        </div>
        <ExportButton columns={exportColumns} data={filteredData} filename="工程損益總覽" />
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        <div className="bg-white rounded-xl shadow-sm border p-4">
          <p className="text-xs text-gray-500">工程數量</p>
          <p className="text-2xl font-bold text-gray-900 mt-1">{filteredData.length}</p>
        </div>
        <div className="bg-white rounded-xl shadow-sm border p-4">
          <p className="text-xs text-gray-500">合約總額</p>
          <p className="text-lg font-bold text-gray-900 mt-1">{formatMoney(totals.contract_amount)}</p>
        </div>
        <div className="bg-white rounded-xl shadow-sm border p-4">
          <p className="text-xs text-gray-500">總收入</p>
          <p className="text-lg font-bold text-blue-600 mt-1">{formatMoney(totals.total_revenue)}</p>
        </div>
        <div className="bg-white rounded-xl shadow-sm border p-4">
          <p className="text-xs text-gray-500">總成本</p>
          <p className="text-lg font-bold text-red-600 mt-1">{formatMoney(totals.total_cost)}</p>
        </div>
        <div className="bg-white rounded-xl shadow-sm border p-4">
          <p className="text-xs text-gray-500">總毛利 / 毛利率</p>
          <p className={`text-lg font-bold mt-1 ${totals.gross_profit >= 0 ? 'text-green-600' : 'text-red-600'}`}>
            {formatMoney(totals.gross_profit)}
            <span className="text-sm font-normal ml-1">({formatPercent(totalGrossProfitRate)})</span>
          </p>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-col md:flex-row gap-3">
        <input
          type="text"
          placeholder="搜尋工程編號、名稱、客戶..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="border rounded-lg px-3 py-2 text-sm w-full md:w-72 focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
        />
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
        >
          <option value="">全部狀態</option>
          <option value="active">進行中</option>
          <option value="completed">已完工</option>
          <option value="pending">待開工</option>
          <option value="suspended">暫停</option>
        </select>
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl shadow-sm border overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 border-b">
                <th className="text-left px-4 py-3 font-medium text-gray-600 cursor-pointer hover:text-gray-900 whitespace-nowrap" onClick={() => handleSort('project_no')}>
                  工程編號 <SortIcon field="project_no" />
                </th>
                <th className="text-left px-4 py-3 font-medium text-gray-600 cursor-pointer hover:text-gray-900 whitespace-nowrap" onClick={() => handleSort('project_name')}>
                  工程名稱 <SortIcon field="project_name" />
                </th>
                <th className="text-left px-4 py-3 font-medium text-gray-600 whitespace-nowrap">客戶</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600 whitespace-nowrap">狀態</th>
                <th className="text-right px-4 py-3 font-medium text-gray-600 cursor-pointer hover:text-gray-900 whitespace-nowrap" onClick={() => handleSort('contract_amount')}>
                  合約金額 <SortIcon field="contract_amount" />
                </th>
                <th className="text-right px-4 py-3 font-medium text-gray-600 cursor-pointer hover:text-gray-900 whitespace-nowrap" onClick={() => handleSort('cumulative_certified')}>
                  累計認證 <SortIcon field="cumulative_certified" />
                </th>
                <th className="text-right px-4 py-3 font-medium text-gray-600 cursor-pointer hover:text-gray-900 whitespace-nowrap" onClick={() => handleSort('total_cost')}>
                  成本 <SortIcon field="total_cost" />
                </th>
                <th className="text-right px-4 py-3 font-medium text-gray-600 cursor-pointer hover:text-gray-900 whitespace-nowrap" onClick={() => handleSort('gross_profit')}>
                  毛利 <SortIcon field="gross_profit" />
                </th>
                <th className="text-right px-4 py-3 font-medium text-gray-600 cursor-pointer hover:text-gray-900 whitespace-nowrap" onClick={() => handleSort('gross_profit_rate')}>
                  毛利率 <SortIcon field="gross_profit_rate" />
                </th>
                <th className="text-right px-4 py-3 font-medium text-gray-600 cursor-pointer hover:text-gray-900 whitespace-nowrap" onClick={() => handleSort('completion_percentage')}>
                  完工% <SortIcon field="completion_percentage" />
                </th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={10} className="text-center py-12 text-gray-400">載入中...</td>
                </tr>
              ) : filteredData.length === 0 ? (
                <tr>
                  <td colSpan={10} className="text-center py-12 text-gray-400">暫無數據</td>
                </tr>
              ) : (
                filteredData.map((row) => (
                  <tr key={row.id} className="border-b hover:bg-gray-50 transition-colors">
                    <td className="px-4 py-3">
                      <Link href={`/profit-loss/${row.id}`} className="text-primary-600 hover:underline font-medium">
                        {row.project_no}
                      </Link>
                    </td>
                    <td className="px-4 py-3">
                      <Link href={`/profit-loss/${row.id}`} className="hover:text-primary-600">
                        {row.project_name}
                      </Link>
                    </td>
                    <td className="px-4 py-3 text-gray-600">{row.client_name}</td>
                    <td className="px-4 py-3">
                      <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_COLORS[row.status] || 'bg-gray-100 text-gray-600'}`}>
                        {STATUS_LABELS[row.status] || row.status}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right font-mono">{formatMoney(row.contract_amount)}</td>
                    <td className="px-4 py-3 text-right font-mono">{formatMoney(row.cumulative_certified)}</td>
                    <td className="px-4 py-3 text-right font-mono">{formatMoney(row.total_cost)}</td>
                    <td className={`px-4 py-3 text-right font-mono font-medium ${row.gross_profit >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                      {formatMoney(row.gross_profit)}
                    </td>
                    <td className={`px-4 py-3 text-right font-mono ${row.gross_profit_rate >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                      {formatPercent(row.gross_profit_rate)}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <div className="w-16 bg-gray-200 rounded-full h-2">
                          <div
                            className="bg-primary-600 h-2 rounded-full transition-all"
                            style={{ width: `${Math.min(row.completion_percentage, 100)}%` }}
                          />
                        </div>
                        <span className="text-xs font-mono text-gray-600 w-12 text-right">{formatPercent(row.completion_percentage)}</span>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
