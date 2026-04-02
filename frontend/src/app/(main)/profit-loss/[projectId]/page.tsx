'use client';
import { useState, useEffect, useRef } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { projectProfitLossApi, projectsApi } from '@/lib/api';

const STATUS_LABELS: Record<string, string> = {
  pending: '待開工',
  active: '進行中',
  completed: '已完工',
  suspended: '暫停',
  cancelled: '已取消',
};

function formatMoney(n: number): string {
  if (n === 0) return '$0.00';
  return '$' + n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function formatPercent(n: number): string {
  return n.toFixed(1) + '%';
}

function formatDate(d: string): string {
  if (!d) return '-';
  const date = new Date(d);
  const dd = String(date.getDate()).padStart(2, '0');
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const yyyy = date.getFullYear();
  return `${dd}/${mm}/${yyyy}`;
}

export default function ProjectProfitLossPage() {
  const params = useParams();
  const router = useRouter();
  const projectId = Number(params.projectId);
  const printRef = useRef<HTMLDivElement>(null);

  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [projects, setProjects] = useState<any[]>([]);
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');

  useEffect(() => {
    loadProjects();
  }, []);

  useEffect(() => {
    if (projectId) loadData();
  }, [projectId, dateFrom, dateTo]);

  const loadProjects = async () => {
    try {
      const res = await projectsApi.simple();
      setProjects(res.data || []);
    } catch (err) {
      console.error('載入工程列表失敗', err);
    }
  };

  const loadData = async () => {
    try {
      setLoading(true);
      const params: any = {};
      if (dateFrom) params.date_from = dateFrom;
      if (dateTo) params.date_to = dateTo;
      const res = await projectProfitLossApi.getProjectPL(projectId, params);
      setData(res.data);
    } catch (err) {
      console.error('載入損益數據失敗', err);
    } finally {
      setLoading(false);
    }
  };

  const handlePrint = () => {
    window.print();
  };

  const handleProjectChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const id = e.target.value;
    if (id) router.push(`/profit-loss/${id}`);
  };

  if (loading) {
    return (
      <div className="p-6 flex items-center justify-center min-h-[400px]">
        <div className="text-gray-400">載入中...</div>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="p-6 flex items-center justify-center min-h-[400px]">
        <div className="text-gray-400">找不到工程數據</div>
      </div>
    );
  }

  const { project, revenue, costs, profit_loss, retention, cash_flow } = data;

  return (
    <div className="p-4 md:p-6 space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 print:hidden">
        <div className="flex items-center gap-3">
          <Link href="/profit-loss" className="text-gray-400 hover:text-gray-600 transition-colors">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
          </Link>
          <div>
            <h1 className="text-2xl font-bold text-gray-900">工程損益表</h1>
            <p className="text-sm text-gray-500 mt-0.5">
              {project.project_no} - {project.project_name}
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <select
            value={projectId}
            onChange={handleProjectChange}
            className="border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-primary-500 focus:border-primary-500 min-w-[200px]"
          >
            <option value="">選擇工程...</option>
            {projects.map((p: any) => (
              <option key={p.id} value={p.id}>
                {p.project_no} - {p.project_name}
              </option>
            ))}
          </select>
          <input
            type="date"
            value={dateFrom}
            onChange={(e) => setDateFrom(e.target.value)}
            className="border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
            placeholder="開始日期"
          />
          <input
            type="date"
            value={dateTo}
            onChange={(e) => setDateTo(e.target.value)}
            className="border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
            placeholder="結束日期"
          />
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
        <h1 className="text-xl font-bold text-center">工程損益表</h1>
        <p className="text-center text-sm text-gray-600 mt-1">
          {project.project_no} - {project.project_name}
        </p>
        {(dateFrom || dateTo) && (
          <p className="text-center text-xs text-gray-500 mt-1">
            期間：{dateFrom ? formatDate(dateFrom) : '開始'} 至 {dateTo ? formatDate(dateTo) : '至今'}
          </p>
        )}
      </div>

      <div ref={printRef} className="space-y-6">
        {/* Summary Cards */}
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
          <SummaryCard
            label="合約金額"
            value={formatMoney(revenue.revised_contract_total)}
            sub={revenue.approved_vo_amount > 0 ? `含 VO ${formatMoney(revenue.approved_vo_amount)}` : undefined}
          />
          <SummaryCard
            label="累計認證"
            value={formatMoney(revenue.cumulative_certified)}
            color="blue"
          />
          <SummaryCard
            label="毛利"
            value={formatMoney(profit_loss.gross_profit)}
            color={profit_loss.gross_profit >= 0 ? 'green' : 'red'}
          />
          <SummaryCard
            label="毛利率"
            value={formatPercent(profit_loss.gross_profit_rate)}
            color={profit_loss.gross_profit_rate >= 0 ? 'green' : 'red'}
          />
          <SummaryCard
            label="完工百分比"
            value={formatPercent(profit_loss.completion_percentage)}
            progress={profit_loss.completion_percentage}
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
                <ReportRow label="合約原始金額" value={revenue.original_amount} />
                <ReportRow label="已批 VO 金額" value={revenue.approved_vo_amount} />
                <ReportRow label="修訂合約總額" value={revenue.revised_contract_total} bold />
                <tr><td colSpan={2} className="py-2"><hr className="border-gray-200" /></td></tr>
                <ReportRow label="累計認證金額（IPA Certified）" value={revenue.cumulative_certified} />
                <ReportRow label="發票收入" value={revenue.invoice_revenue} />
                <ReportRow label="累計收款金額" value={revenue.cumulative_received} />
                <ReportRow label="應收帳款（認證 + 發票 - 已收）" value={revenue.accounts_receivable} bold highlight />
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
                <tr>
                  <td colSpan={2} className="py-2 font-semibold text-gray-700">直接成本</td>
                </tr>
                {costs.direct_breakdown.length > 0 ? (
                  costs.direct_breakdown.map((item: any, i: number) => (
                    <ReportRow key={i} label={`  ${item.category}`} value={item.amount} indent />
                  ))
                ) : (
                  <tr><td colSpan={2} className="py-1 pl-8 text-gray-400 text-xs">暫無數據</td></tr>
                )}
                <ReportRow label="直接成本小計" value={costs.direct_cost_total} bold />

                <tr><td colSpan={2} className="py-2"><hr className="border-gray-200" /></td></tr>

                {/* Indirect Costs */}
                <tr>
                  <td colSpan={2} className="py-2 font-semibold text-gray-700">間接成本（營運開支）</td>
                </tr>
                {costs.indirect_breakdown.length > 0 ? (
                  costs.indirect_breakdown.map((item: any, i: number) => (
                    <ReportRow key={i} label={`  ${item.category}`} value={item.amount} indent />
                  ))
                ) : (
                  <tr><td colSpan={2} className="py-1 pl-8 text-gray-400 text-xs">暫無數據</td></tr>
                )}
                <ReportRow label="間接成本小計" value={costs.indirect_cost_total} bold />

                <tr><td colSpan={2} className="py-2"><hr className="border-gray-200" /></td></tr>
                <ReportRow label="支出總額" value={costs.total_expense} bold />
                <ReportRow label="已付款金額" value={costs.total_paid} />
                <ReportRow label="應付帳款（支出 - 已付）" value={costs.accounts_payable} bold highlight />
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
                <ReportRow label="累計認證金額" value={revenue.cumulative_certified} />
                <ReportRow label="減：直接成本" value={-costs.direct_cost_total} negative />
                <tr><td colSpan={2} className="py-1"><hr className="border-gray-300 border-dashed" /></td></tr>
                <ReportRowHL label="毛利" value={profit_loss.gross_profit} rate={profit_loss.gross_profit_rate} />
                <ReportRow label="減：間接成本" value={-costs.indirect_cost_total} negative />
                <tr><td colSpan={2} className="py-1"><hr className="border-gray-300 border-dashed" /></td></tr>
                <ReportRowHL label="淨利" value={profit_loss.net_profit} rate={profit_loss.net_profit_rate} />
                <tr><td colSpan={2} className="py-2"><hr className="border-gray-200" /></td></tr>
                <ReportRow label="完工百分比" value={null} percent={profit_loss.completion_percentage} />
              </tbody>
            </table>
          </div>
        </div>

        {/* Retention */}
        {project.contract_id && (
          <div className="bg-white rounded-xl shadow-sm border overflow-hidden">
            <div className="px-6 py-4 border-b bg-amber-50">
              <h2 className="text-lg font-semibold text-amber-900">保留金狀態</h2>
            </div>
            <div className="p-6">
              <table className="w-full text-sm">
                <tbody>
                  <ReportRow label="累計扣留" value={retention.cumulative_retained} />
                  <ReportRow label="已釋放" value={retention.total_released} />
                  <ReportRow label="未釋放餘額" value={retention.unreleased_balance} bold highlight />
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Cash Flow */}
        <div className="bg-white rounded-xl shadow-sm border overflow-hidden">
          <div className="px-6 py-4 border-b bg-purple-50">
            <h2 className="text-lg font-semibold text-purple-900">現金流摘要</h2>
          </div>
          <div className="p-6">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <div className="text-center p-4 bg-green-50 rounded-lg">
                <p className="text-xs text-gray-500 mb-1">累計已收</p>
                <p className="text-xl font-bold text-green-600">{formatMoney(cash_flow.total_received)}</p>
              </div>
              <div className="text-center p-4 bg-red-50 rounded-lg">
                <p className="text-xs text-gray-500 mb-1">累計已付</p>
                <p className="text-xl font-bold text-red-600">{formatMoney(cash_flow.total_paid)}</p>
              </div>
              <div className={`text-center p-4 rounded-lg ${cash_flow.net_cash_flow >= 0 ? 'bg-blue-50' : 'bg-orange-50'}`}>
                <p className="text-xs text-gray-500 mb-1">淨現金流</p>
                <p className={`text-xl font-bold ${cash_flow.net_cash_flow >= 0 ? 'text-blue-600' : 'text-orange-600'}`}>
                  {formatMoney(cash_flow.net_cash_flow)}
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Sub-components ──────────────────────────────────────────

function SummaryCard({ label, value, sub, color, progress }: {
  label: string;
  value: string;
  sub?: string;
  color?: 'blue' | 'green' | 'red';
  progress?: number;
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
      {progress !== undefined && (
        <div className="mt-2 w-full bg-gray-200 rounded-full h-2">
          <div
            className="bg-primary-600 h-2 rounded-full transition-all"
            style={{ width: `${Math.min(progress, 100)}%` }}
          />
        </div>
      )}
    </div>
  );
}

function ReportRow({ label, value, bold, indent, highlight, negative, percent }: {
  label: string;
  value: number | null;
  bold?: boolean;
  indent?: boolean;
  highlight?: boolean;
  negative?: boolean;
  percent?: number;
}) {
  const formatVal = (v: number | null) => {
    if (v === null) return '';
    return formatMoney(v);
  };

  return (
    <tr className={highlight ? 'bg-gray-50' : ''}>
      <td className={`py-1.5 ${indent ? 'pl-8' : 'pl-2'} ${bold ? 'font-semibold' : ''} text-gray-700`}>
        {label}
      </td>
      <td className={`py-1.5 text-right pr-2 font-mono ${bold ? 'font-semibold' : ''} ${negative ? 'text-red-600' : ''}`}>
        {percent !== undefined ? formatPercent(percent) : formatVal(value)}
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
