'use client';

import { useState, useEffect } from 'react';
import DateInput from '@/components/DateInput';
import Link from 'next/link';
import { equipmentProfitApi } from '@/lib/api';

interface EquipmentProfitRow {
  equipment_type: string;
  equipment_id: number;
  equipment_code: string;
  machine_type: string | null;
  tonnage: number | null;
  gross_revenue: number;
  commission_percentage: number;
  company_revenue: number;
  total_expense: number;
  profit_loss: number;
}

function formatMoney(n: number): string {
  if (n === 0) return '$0.00';
  const prefix = n < 0 ? '-$' : '$';
  return prefix + Math.abs(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function getDefaultDateRange(): { from: string; to: string } {
  const now = new Date();
  const y = now.getFullYear();
  const m = now.getMonth();
  const from = new Date(y, m, 1).toISOString().split('T')[0];
  const to = new Date(y, m + 1, 0).toISOString().split('T')[0];
  return { from, to };
}

type SortField = 'equipment_code' | 'machine_type' | 'tonnage' | 'gross_revenue' | 'commission_percentage' | 'company_revenue' | 'total_expense' | 'profit_loss';

export default function EquipmentProfitPage() {
  const defaults = getDefaultDateRange();
  const [dateFrom, setDateFrom] = useState(defaults.from);
  const [dateTo, setDateTo] = useState(defaults.to);
  const [data, setData] = useState<EquipmentProfitRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState<string>('');
  const [includeInactive, setIncludeInactive] = useState(false);
  const [sortBy, setSortBy] = useState<SortField>('equipment_code');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('asc');

  useEffect(() => {
    loadData();
  }, [dateFrom, dateTo]);

  const loadData = async () => {
    try {
      setLoading(true);
      const res = await equipmentProfitApi.getReport({
        date_from: dateFrom,
        date_to: dateTo,
        equipment_type: typeFilter || undefined,
        include_inactive: includeInactive || undefined,
      });
      setData(res.data.data || []);
    } catch (err) {
      console.error('載入失敗', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [typeFilter, includeInactive]);

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

  // Filter and sort
  const filteredData = data
    .filter((d) => {
      if (search) {
        const q = search.toLowerCase();
        return (
          d.equipment_code.toLowerCase().includes(q) ||
          (d.machine_type && d.machine_type.toLowerCase().includes(q))
        );
      }
      return true;
    })
    .sort((a, b) => {
      const dir = sortOrder === 'asc' ? 1 : -1;
      const av = a[sortBy] ?? '';
      const bv = b[sortBy] ?? '';
      if (typeof av === 'number' && typeof bv === 'number') return (av - bv) * dir;
      return String(av).localeCompare(String(bv)) * dir;
    });

  // Totals
  const totals = filteredData.reduce(
    (acc, d) => ({
      gross_revenue: acc.gross_revenue + d.gross_revenue,
      company_revenue: acc.company_revenue + d.company_revenue,
      total_expense: acc.total_expense + d.total_expense,
      profit_loss: acc.profit_loss + d.profit_loss,
    }),
    { gross_revenue: 0, company_revenue: 0, total_expense: 0, profit_loss: 0 },
  );

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">機械收支報表</h1>
      </div>

      {/* Filters */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4">
        <div className="flex flex-wrap gap-4 items-end">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">開始日期</label>
            <DateInput
              value={dateFrom}
              onChange={val => setDateFrom(val || '')}
              className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">結束日期</label>
            <DateInput
              value={dateTo}
              onChange={val => setDateTo(val || '')}
              className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">設備類型</label>
            <select
              value={typeFilter}
              onChange={(e) => setTypeFilter(e.target.value)}
              className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
            >
              <option value="">全部</option>
              <option value="machinery">機械</option>
              <option value="vehicle">車輛</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">搜尋</label>
            <input
              type="text"
              placeholder="編號/車牌/類型..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-primary-500 focus:border-primary-500 w-48"
            />
          </div>
          <div className="flex items-end">
            <label className="flex items-center gap-2 cursor-pointer select-none">
              <div
                onClick={() => setIncludeInactive(!includeInactive)}
                className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none ${
                  includeInactive ? 'bg-primary-600' : 'bg-gray-300'
                }`}
              >
                <span
                  className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${
                    includeInactive ? 'translate-x-6' : 'translate-x-1'
                  }`}
                />
              </div>
              <span className="text-sm font-medium text-gray-700">顯示已停用</span>
            </label>
          </div>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4">
          <div className="text-sm text-gray-500">設備總數</div>
          <div className="text-2xl font-bold text-gray-900">{filteredData.length}</div>
        </div>
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4">
          <div className="text-sm text-gray-500">毛收入合計</div>
          <div className="text-2xl font-bold text-blue-600">{formatMoney(totals.gross_revenue)}</div>
        </div>
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4">
          <div className="text-sm text-gray-500">支出合計</div>
          <div className="text-2xl font-bold text-orange-600">{formatMoney(totals.total_expense)}</div>
        </div>
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4">
          <div className="text-sm text-gray-500">損益合計</div>
          <div className={`text-2xl font-bold ${totals.profit_loss >= 0 ? 'text-green-600' : 'text-red-600'}`}>
            {formatMoney(totals.profit_loss)}
          </div>
        </div>
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
        {loading ? (
          <div className="p-8 text-center text-gray-500">載入中...</div>
        ) : filteredData.length === 0 ? (
          <div className="p-8 text-center text-gray-500">沒有資料</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer" onClick={() => handleSort('equipment_code')}>
                    編號/車牌 <SortIcon field="equipment_code" />
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    類型
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer" onClick={() => handleSort('machine_type')}>
                    機型 <SortIcon field="machine_type" />
                  </th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer" onClick={() => handleSort('tonnage')}>
                    噸數 <SortIcon field="tonnage" />
                  </th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer" onClick={() => handleSort('gross_revenue')}>
                    毛收入 <SortIcon field="gross_revenue" />
                  </th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer" onClick={() => handleSort('commission_percentage')}>
                    分成% <SortIcon field="commission_percentage" />
                  </th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer" onClick={() => handleSort('company_revenue')}>
                    公司收入 <SortIcon field="company_revenue" />
                  </th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer" onClick={() => handleSort('total_expense')}>
                    支出 <SortIcon field="total_expense" />
                  </th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer" onClick={() => handleSort('profit_loss')}>
                    損益 <SortIcon field="profit_loss" />
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {filteredData.map((row) => (
                  <tr
                    key={`${row.equipment_type}-${row.equipment_id}`}
                    className="hover:bg-gray-50 cursor-pointer transition-colors"
                  >
                    <td className="px-4 py-3 whitespace-nowrap">
                      <Link
                        href={`/equipment-profit/${row.equipment_type}/${row.equipment_id}?date_from=${dateFrom}&date_to=${dateTo}`}
                        className="text-primary-600 hover:text-primary-800 font-medium"
                      >
                        {row.equipment_code}
                      </Link>
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                        row.equipment_type === 'machinery'
                          ? 'bg-purple-100 text-purple-800'
                          : 'bg-blue-100 text-blue-800'
                      }`}>
                        {row.equipment_type === 'machinery' ? '機械' : '車輛'}
                      </span>
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-700">
                      {row.machine_type || '-'}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-700 text-right">
                      {row.tonnage != null ? `${row.tonnage}T` : '-'}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap text-sm text-right font-medium">
                      {formatMoney(row.gross_revenue)}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap text-sm text-right">
                      {row.commission_percentage}%
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap text-sm text-right font-medium">
                      {formatMoney(row.company_revenue)}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap text-sm text-right font-medium text-orange-600">
                      {formatMoney(row.total_expense)}
                    </td>
                    <td className={`px-4 py-3 whitespace-nowrap text-sm text-right font-bold ${
                      row.profit_loss >= 0 ? 'text-green-600' : 'text-red-600'
                    }`}>
                      {formatMoney(row.profit_loss)}
                    </td>
                  </tr>
                ))}
                {/* Totals row */}
                <tr className="bg-gray-50 font-bold border-t-2 border-gray-300">
                  <td className="px-4 py-3 text-sm" colSpan={4}>合計</td>
                  <td className="px-4 py-3 text-sm text-right">{formatMoney(totals.gross_revenue)}</td>
                  <td className="px-4 py-3 text-sm text-right">-</td>
                  <td className="px-4 py-3 text-sm text-right">{formatMoney(totals.company_revenue)}</td>
                  <td className="px-4 py-3 text-sm text-right text-orange-600">{formatMoney(totals.total_expense)}</td>
                  <td className={`px-4 py-3 text-sm text-right ${totals.profit_loss >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                    {formatMoney(totals.profit_loss)}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
