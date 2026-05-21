"use client";

import { useEffect, useMemo, useState } from 'react';
import RoleGuard from '@/components/RoleGuard';
import { companiesApi, fixedExpenseReportApi } from '@/lib/api';

interface Company {
  id: number;
  name: string;
}

interface MonthlyAmount {
  month: number;
  amount: number;
}

interface FixedExpenseCategoryRow {
  category_id: number;
  category_name: string;
  parent_id: number | null;
  monthly_amounts: MonthlyAmount[];
  total_amount: number;
}

interface FixedExpenseReportData {
  year: number;
  company_id: number | null;
  months: number[];
  categories: FixedExpenseCategoryRow[];
  totals: {
    monthly_amounts: MonthlyAmount[];
    total_amount: number;
  };
}

const monthLabels = Array.from({ length: 12 }, (_, index) => `${index + 1}月`);

function formatCurrency(value: number): string {
  return `$${Number(value || 0).toLocaleString('en-US', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  })}`;
}

export default function FixedExpensesReportPage() {
  const currentYear = new Date().getFullYear();
  const [companies, setCompanies] = useState<Company[]>([]);
  const [companyId, setCompanyId] = useState<string>('');
  const [year, setYear] = useState<number>(currentYear);
  const [data, setData] = useState<FixedExpenseReportData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const yearOptions = useMemo(
    () => Array.from({ length: 11 }, (_, index) => currentYear - 5 + index),
    [currentYear],
  );

  const loadCompanies = async () => {
    try {
      const res = await companiesApi.simple();
      setCompanies(res.data || []);
    } catch {
      setCompanies([]);
    }
  };

  const loadReport = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fixedExpenseReportApi.getMonthlyStats({
        year,
        companyId: companyId ? Number(companyId) : undefined,
      });
      setData(res.data);
    } catch (err: any) {
      setError(err.response?.data?.message || '載入固定支出統計失敗');
      setData(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadCompanies();
  }, []);

  useEffect(() => {
    loadReport();
  }, [year, companyId]);

  return (
    <RoleGuard pageKey="fixed-expense-report">
      <div className="space-y-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">固定支出統計</h1>
            <p className="text-gray-500 text-sm mt-1">
              依固定支出類別統計每月支出金額；未選公司時會合計全部公司。
            </p>
          </div>
          <div className="flex flex-col sm:flex-row gap-3">
            <select
              value={companyId}
              onChange={(e) => setCompanyId(e.target.value)}
              className="input-field min-w-[220px]"
            >
              <option value="">全部公司</option>
              {companies.map((company) => (
                <option key={company.id} value={company.id}>
                  {company.name}
                </option>
              ))}
            </select>
            <select
              value={year}
              onChange={(e) => setYear(Number(e.target.value))}
              className="input-field min-w-[140px]"
            >
              {yearOptions.map((option) => (
                <option key={option} value={option}>
                  {option} 年
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="card">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-lg font-semibold text-gray-900">{year} 年固定支出月度統計</h2>
              <p className="text-sm text-gray-500 mt-1">
                金額按支出日期歸入對應月份，並只納入已標記為固定支出的支出類別。
              </p>
            </div>
            <button onClick={loadReport} className="btn-secondary" disabled={loading}>
              重新整理
            </button>
          </div>

          {error && (
            <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              {error}
            </div>
          )}

          {loading ? (
            <div className="flex justify-center py-12">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600"></div>
            </div>
          ) : !data || data.categories.length === 0 ? (
            <div className="py-12 text-center text-gray-400">
              暫無固定支出類別或統計資料。請先在支出類別管理中勾選「固定支出」。
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm" style={{ minWidth: '1180px' }}>
                <thead>
                  <tr className="bg-gray-50 border-b">
                    <th className="sticky left-0 bg-gray-50 z-10 px-3 py-3 text-left font-semibold text-gray-700 min-w-[180px]">
                      固定支出類別
                    </th>
                    {monthLabels.map((label) => (
                      <th key={label} className="px-3 py-3 text-right font-semibold text-gray-700 whitespace-nowrap">
                        {label}
                      </th>
                    ))}
                    <th className="px-3 py-3 text-right font-semibold text-gray-700 whitespace-nowrap">
                      全年合計
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {data.categories.map((row) => (
                    <tr key={row.category_id} className="border-b hover:bg-gray-50">
                      <td className="sticky left-0 bg-white z-10 px-3 py-3 font-medium text-gray-900">
                        {row.category_name}
                      </td>
                      {row.monthly_amounts.map((item) => (
                        <td key={item.month} className="px-3 py-3 text-right tabular-nums text-gray-700">
                          {formatCurrency(item.amount)}
                        </td>
                      ))}
                      <td className="px-3 py-3 text-right tabular-nums font-semibold text-gray-900">
                        {formatCurrency(row.total_amount)}
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="bg-primary-50 border-t-2 border-primary-200">
                    <td className="sticky left-0 bg-primary-50 z-10 px-3 py-3 font-bold text-primary-900">
                      合計
                    </td>
                    {data.totals.monthly_amounts.map((item) => (
                      <td key={item.month} className="px-3 py-3 text-right tabular-nums font-bold text-primary-900">
                        {formatCurrency(item.amount)}
                      </td>
                    ))}
                    <td className="px-3 py-3 text-right tabular-nums font-bold text-primary-900">
                      {formatCurrency(data.totals.total_amount)}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
          )}
        </div>
      </div>
    </RoleGuard>
  );
}
