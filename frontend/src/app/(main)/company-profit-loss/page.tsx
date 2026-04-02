'use client';
import { useState, useEffect } from 'react';
import { companyProfitLossApi, companiesApi } from '@/lib/api';

function formatMoney(n: number): string {
  if (n === 0) return '$0.00';
  return '$' + n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function formatPercent(n: number): string {
  return n.toFixed(1) + '%';
}

const MONTHS = [
  { value: 1, label: '1月' }, { value: 2, label: '2月' }, { value: 3, label: '3月' },
  { value: 4, label: '4月' }, { value: 5, label: '5月' }, { value: 6, label: '6月' },
  { value: 7, label: '7月' }, { value: 8, label: '8月' }, { value: 9, label: '9月' },
  { value: 10, label: '10月' }, { value: 11, label: '11月' }, { value: 12, label: '12月' },
];

const QUARTERS = [
  { value: 1, label: 'Q1 (1-3月)' },
  { value: 2, label: 'Q2 (4-6月)' },
  { value: 3, label: 'Q3 (7-9月)' },
  { value: 4, label: 'Q4 (10-12月)' },
];

export default function CompanyProfitLossPage() {
  const now = new Date();
  const [period, setPeriod] = useState<string>('year');
  const [year, setYear] = useState<number>(now.getFullYear());
  const [month, setMonth] = useState<number>(now.getMonth() + 1);
  const [quarter, setQuarter] = useState<number>(Math.ceil((now.getMonth() + 1) / 3));
  const [companyId, setCompanyId] = useState<string>('');
  const [companies, setCompanies] = useState<any[]>([]);
  const [data, setData] = useState<any>(null);
  const [trendData, setTrendData] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    companiesApi.simple().then(res => setCompanies(res.data || [])).catch(() => {});
  }, []);

  useEffect(() => {
    loadData();
  }, [period, year, month, quarter, companyId]);

  const loadData = async () => {
    try {
      setLoading(true);
      const params: any = { period, year };
      if (period === 'month') params.month = month;
      if (period === 'quarter') params.quarter = quarter;
      if (companyId) params.company_id = companyId;

      const [plRes, trendRes] = await Promise.all([
        companyProfitLossApi.get(params),
        companyProfitLossApi.trend({ company_id: companyId || undefined }),
      ]);

      setData(plRes.data);
      setTrendData(trendRes.data?.data || []);
    } catch (err) {
      console.error('載入損益數據失敗', err);
    } finally {
      setLoading(false);
    }
  };

  const handlePrint = () => window.print();

  // Generate year options (current year ± 5)
  const years: number[] = [];
  for (let y = now.getFullYear() + 1; y >= now.getFullYear() - 5; y--) years.push(y);

  if (loading) {
    return (
      <div className="p-6 flex items-center justify-center min-h-[400px]">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600"></div>
      </div>
    );
  }

  const revenue = data?.revenue || {};
  const costs = data?.costs || {};
  const pl = data?.profit_loss || {};

  // Trend chart calculations
  const maxTrendVal = Math.max(...trendData.map(t => Math.max(t.revenue, t.cost)), 1);

  return (
    <div className="p-4 md:p-6 space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 print:hidden">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">公司損益表</h1>
          <p className="text-sm text-gray-500 mt-0.5">匯總所有工程及公司營運的損益數據</p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          {/* Company selector */}
          <select
            value={companyId}
            onChange={(e) => setCompanyId(e.target.value)}
            className="border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
          >
            <option value="">全部公司</option>
            {companies.map((c: any) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>

          {/* Period selector */}
          <select
            value={period}
            onChange={(e) => setPeriod(e.target.value)}
            className="border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
          >
            <option value="month">月度</option>
            <option value="quarter">季度</option>
            <option value="year">年度</option>
          </select>

          {/* Year selector */}
          <select
            value={year}
            onChange={(e) => setYear(parseInt(e.target.value))}
            className="border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
          >
            {years.map(y => (
              <option key={y} value={y}>{y}年</option>
            ))}
          </select>

          {/* Month selector */}
          {period === 'month' && (
            <select
              value={month}
              onChange={(e) => setMonth(parseInt(e.target.value))}
              className="border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
            >
              {MONTHS.map(m => (
                <option key={m.value} value={m.value}>{m.label}</option>
              ))}
            </select>
          )}

          {/* Quarter selector */}
          {period === 'quarter' && (
            <select
              value={quarter}
              onChange={(e) => setQuarter(parseInt(e.target.value))}
              className="border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
            >
              {QUARTERS.map(q => (
                <option key={q.value} value={q.value}>{q.label}</option>
              ))}
            </select>
          )}

          <button
            onClick={handlePrint}
            className="flex items-center gap-2 bg-gray-100 hover:bg-gray-200 text-gray-700 px-4 py-2 rounded-lg text-sm transition-colors"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" />
            </svg>
            列印
          </button>
        </div>
      </div>

      {/* Print Header */}
      <div className="hidden print:block mb-6">
        <h1 className="text-xl font-bold text-center">公司損益表</h1>
        <p className="text-center text-sm text-gray-600 mt-1">
          {period === 'month' && `${year}年${month}月`}
          {period === 'quarter' && `${year}年第${quarter}季`}
          {period === 'year' && `${year}年度`}
        </p>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <SummaryCard label="收入總計" value={formatMoney(revenue.total_revenue || 0)} color="blue" />
        <SummaryCard label="成本總計" value={formatMoney(costs.total_cost || 0)} color="red" />
        <SummaryCard
          label="毛利"
          value={formatMoney(pl.gross_profit || 0)}
          sub={`毛利率 ${formatPercent(pl.gross_profit_rate || 0)}`}
          color={(pl.gross_profit || 0) >= 0 ? 'green' : 'red'}
        />
        <SummaryCard
          label="營業利潤"
          value={formatMoney(pl.operating_profit || 0)}
          sub={`淨利率 ${formatPercent(pl.operating_profit_rate || 0)}`}
          color={(pl.operating_profit || 0) >= 0 ? 'green' : 'red'}
        />
      </div>

      {/* Revenue Section */}
      <div className="bg-white rounded-xl shadow-sm border overflow-hidden">
        <div className="px-6 py-4 border-b bg-blue-50">
          <h2 className="text-lg font-semibold text-blue-900">收入明細</h2>
        </div>
        <div className="p-6">
          <table className="w-full text-sm">
            <tbody>
              <ReportRow label="工程收入合計（累計認證）" value={revenue.project_revenue || 0} />
              <ReportRow label="發票收入合計" value={revenue.invoice_revenue || 0} />
              <ReportRow label="其他收入" value={revenue.other_income || 0} />
              <tr><td colSpan={2} className="py-2"><hr className="border-gray-200" /></td></tr>
              <ReportRow label="收入總計" value={revenue.total_revenue || 0} bold />
              <tr><td colSpan={2} className="py-2"><hr className="border-gray-200" /></td></tr>
              <ReportRow label="累計已收款" value={revenue.total_received || 0} />
              <ReportRow label="應收帳款" value={revenue.accounts_receivable || 0} bold highlight />
            </tbody>
          </table>
        </div>
      </div>

      {/* Cost Section */}
      <div className="bg-white rounded-xl shadow-sm border overflow-hidden">
        <div className="px-6 py-4 border-b bg-red-50">
          <h2 className="text-lg font-semibold text-red-900">成本明細</h2>
        </div>
        <div className="p-6">
          <table className="w-full text-sm">
            <tbody>
              {/* Direct Costs */}
              <tr><td colSpan={2} className="py-2 font-semibold text-gray-700">工程直接成本</td></tr>
              {(costs.direct_breakdown || []).length > 0 ? (
                (costs.direct_breakdown || []).map((item: any, i: number) => (
                  <ReportRow key={i} label={`  ${item.category}`} value={item.amount} indent />
                ))
              ) : (
                <tr><td colSpan={2} className="py-1 pl-8 text-gray-400 text-xs">暫無數據</td></tr>
              )}
              <ReportRow label="直接成本小計" value={costs.direct_cost_total || 0} bold />

              <tr><td colSpan={2} className="py-2"><hr className="border-gray-200" /></td></tr>

              {/* Indirect Costs */}
              <tr><td colSpan={2} className="py-2 font-semibold text-gray-700">工程間接成本</td></tr>
              {(costs.indirect_breakdown || []).length > 0 ? (
                (costs.indirect_breakdown || []).map((item: any, i: number) => (
                  <ReportRow key={i} label={`  ${item.category}`} value={item.amount} indent />
                ))
              ) : (
                <tr><td colSpan={2} className="py-1 pl-8 text-gray-400 text-xs">暫無數據</td></tr>
              )}
              <ReportRow label="間接成本小計" value={costs.indirect_cost_total || 0} bold />

              <tr><td colSpan={2} className="py-2"><hr className="border-gray-200" /></td></tr>

              {/* Operating Expenses */}
              <tr><td colSpan={2} className="py-2 font-semibold text-gray-700">公司營運開支</td></tr>
              {(costs.operating_breakdown || []).length > 0 ? (
                (costs.operating_breakdown || []).map((item: any, i: number) => (
                  <ReportRow key={i} label={`  ${item.category}`} value={item.amount} indent />
                ))
              ) : (
                <tr><td colSpan={2} className="py-1 pl-8 text-gray-400 text-xs">暫無數據</td></tr>
              )}
              <ReportRow label="營運開支小計" value={costs.operating_expense_total || 0} bold />

              <tr><td colSpan={2} className="py-2"><hr className="border-gray-200" /></td></tr>
              <ReportRow label="成本總計" value={costs.total_cost || 0} bold />
              <tr><td colSpan={2} className="py-2"><hr className="border-gray-200" /></td></tr>
              <ReportRow label="累計已付款" value={costs.total_paid || 0} />
              <ReportRow label="應付帳款" value={costs.accounts_payable || 0} bold highlight />
            </tbody>
          </table>
        </div>
      </div>

      {/* P&L Calculation */}
      <div className="bg-white rounded-xl shadow-sm border overflow-hidden">
        <div className="px-6 py-4 border-b bg-green-50">
          <h2 className="text-lg font-semibold text-green-900">損益計算</h2>
        </div>
        <div className="p-6">
          <table className="w-full text-sm">
            <tbody>
              <ReportRow label="收入總計" value={revenue.total_revenue || 0} />
              <ReportRow label="減：直接成本" value={-(costs.direct_cost_total || 0)} negative />
              <tr><td colSpan={2} className="py-1"><hr className="border-gray-300 border-dashed" /></td></tr>
              <ReportRowHL label="毛利" value={pl.gross_profit || 0} rate={pl.gross_profit_rate || 0} />

              <ReportRow label="減：間接成本" value={-(costs.indirect_cost_total || 0)} negative />
              <ReportRow label="減：營運開支" value={-(costs.operating_expense_total || 0)} negative />
              <tr><td colSpan={2} className="py-1"><hr className="border-gray-300 border-dashed" /></td></tr>
              <ReportRowHL label="營業利潤" value={pl.operating_profit || 0} rate={pl.operating_profit_rate || 0} />
            </tbody>
          </table>
        </div>
      </div>

      {/* Monthly Trend Chart */}
      <div className="bg-white rounded-xl shadow-sm border overflow-hidden print:break-before-page">
        <div className="px-6 py-4 border-b bg-purple-50">
          <h2 className="text-lg font-semibold text-purple-900">月度趨勢圖（近 12 個月）</h2>
        </div>
        <div className="p-6">
          {trendData.length > 0 ? (
            <>
              {/* Legend */}
              <div className="flex items-center gap-6 mb-4 text-sm">
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 rounded-full bg-blue-500"></div>
                  <span className="text-gray-600">收入</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 rounded-full bg-red-400"></div>
                  <span className="text-gray-600">成本</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 rounded-full bg-green-500"></div>
                  <span className="text-gray-600">利潤</span>
                </div>
              </div>
              {/* Chart */}
              <div className="flex items-end gap-1 h-64 border-b border-l border-gray-200 pl-1 pb-1">
                {trendData.map((item, i) => (
                  <div key={i} className="flex-1 flex flex-col items-center gap-0.5 h-full justify-end group relative">
                    {/* Tooltip */}
                    <div className="absolute bottom-full mb-2 hidden group-hover:block bg-gray-800 text-white text-xs rounded-lg p-2 whitespace-nowrap z-10">
                      <div className="font-semibold mb-1">{item.label}</div>
                      <div>收入: {formatMoney(item.revenue)}</div>
                      <div>成本: {formatMoney(item.cost)}</div>
                      <div>利潤: {formatMoney(item.profit)}</div>
                    </div>
                    <div className="flex items-end gap-px w-full justify-center" style={{ height: '100%' }}>
                      <div
                        className="bg-blue-500 rounded-t w-1/4 min-w-[4px] transition-all"
                        style={{ height: `${maxTrendVal > 0 ? (item.revenue / maxTrendVal) * 100 : 0}%`, minHeight: item.revenue > 0 ? '2px' : '0' }}
                      />
                      <div
                        className="bg-red-400 rounded-t w-1/4 min-w-[4px] transition-all"
                        style={{ height: `${maxTrendVal > 0 ? (item.cost / maxTrendVal) * 100 : 0}%`, minHeight: item.cost > 0 ? '2px' : '0' }}
                      />
                      <div
                        className={`rounded-t w-1/4 min-w-[4px] transition-all ${item.profit >= 0 ? 'bg-green-500' : 'bg-orange-500'}`}
                        style={{ height: `${maxTrendVal > 0 ? (Math.abs(item.profit) / maxTrendVal) * 100 : 0}%`, minHeight: Math.abs(item.profit) > 0 ? '2px' : '0' }}
                      />
                    </div>
                    <span className="text-[10px] text-gray-400 mt-1 whitespace-nowrap">{item.label.split('/')[1]}</span>
                  </div>
                ))}
              </div>
            </>
          ) : (
            <p className="text-center py-8 text-gray-400">暫無趨勢數據</p>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Sub-components ──────────────────────────────────────────

function SummaryCard({ label, value, sub, color }: {
  label: string;
  value: string;
  sub?: string;
  color?: 'blue' | 'green' | 'red';
}) {
  const colorClass = color === 'blue' ? 'text-blue-600'
    : color === 'green' ? 'text-green-600'
    : color === 'red' ? 'text-red-600'
    : 'text-gray-900';

  return (
    <div className="bg-white rounded-xl shadow-sm border p-4">
      <p className="text-xs text-gray-500">{label}</p>
      <p className={`text-lg font-bold mt-1 ${colorClass}`}>{value}</p>
      {sub && <p className="text-xs text-gray-400 mt-0.5">{sub}</p>}
    </div>
  );
}

function ReportRow({ label, value, bold, indent, highlight, negative }: {
  label: string;
  value: number;
  bold?: boolean;
  indent?: boolean;
  highlight?: boolean;
  negative?: boolean;
}) {
  return (
    <tr className={highlight ? 'bg-gray-50' : ''}>
      <td className={`py-1.5 ${indent ? 'pl-8' : 'pl-2'} ${bold ? 'font-semibold' : ''} text-gray-700`}>
        {label}
      </td>
      <td className={`py-1.5 text-right pr-2 font-mono ${bold ? 'font-semibold' : ''} ${negative ? 'text-red-600' : ''}`}>
        {formatMoney(value)}
      </td>
    </tr>
  );
}

function ReportRowHL({ label, value, rate }: {
  label: string;
  value: number;
  rate: number;
}) {
  const isPositive = value >= 0;
  return (
    <tr className="bg-gray-50">
      <td className="py-2 pl-2 font-bold text-gray-900">{label}</td>
      <td className={`py-2 text-right pr-2 font-mono font-bold ${isPositive ? 'text-green-600' : 'text-red-600'}`}>
        {formatMoney(value)}
        <span className="text-xs font-normal ml-2">({formatPercent(rate)})</span>
      </td>
    </tr>
  );
}
