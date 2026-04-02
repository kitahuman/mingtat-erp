'use client';
import { useState, useEffect } from 'react';
import { dashboardApi } from '@/lib/api';
import Link from 'next/link';

const roleLabels: Record<string, string> = { admin: '管理', driver: '司機', operator: '機手', worker: '雜工' };

const moduleLinks: Record<string, string> = {
  company: '/company-profiles',
  'company-profile': '/company-profiles',
  partner: '/partners',
  vehicle: '/vehicles',
  machinery: '/machinery',
  employee: '/employees',
};

function formatMoney(n: number): string {
  if (!n && n !== 0) return '$0.00';
  return '$' + n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function formatDate(d: string): string {
  if (!d) return '-';
  const date = new Date(d);
  const dd = String(date.getDate()).padStart(2, '0');
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const yyyy = date.getFullYear();
  return `${dd}/${mm}/${yyyy}`;
}

export default function DashboardPage() {
  const [stats, setStats] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    dashboardApi.stats().then(res => { setStats(res.data); setLoading(false); }).catch(() => setLoading(false));
  }, []);

  if (loading) return <div className="flex justify-center py-20"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600"></div></div>;

  const financial = stats?.financial || {};
  const monthlyTrend = stats?.monthly_trend || [];
  const topProjects = stats?.top_projects || [];
  const expensePie = stats?.expense_pie || [];
  const reminders = stats?.reminders || {};

  // Existing alert data
  const employeeAlerts = stats?.expiryAlerts?.employees || [];
  const vehicleAlerts = stats?.expiryAlerts?.vehicles || [];
  const machineryAlerts = stats?.expiryAlerts?.machinery || [];
  const companyProfileAlerts = stats?.expiryAlerts?.companyProfiles || [];
  const customFieldAlerts = stats?.expiryAlerts?.customFields || [];
  const allAlerts = [...employeeAlerts, ...vehicleAlerts, ...machineryAlerts, ...companyProfileAlerts, ...customFieldAlerts];

  const getDaysUntil = (date: string) => {
    const d = new Date(date);
    const now = new Date();
    return Math.ceil((d.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
  };

  const getAlertStyle = (days: number) => {
    if (days <= 7) return { bg: 'bg-red-50 border-red-200', text: 'text-red-700', badge: 'bg-red-100 text-red-800', icon: '🔴' };
    if (days <= 30) return { bg: 'bg-orange-50 border-orange-200', text: 'text-orange-700', badge: 'bg-orange-100 text-orange-800', icon: '🟠' };
    return { bg: 'bg-yellow-50 border-yellow-200', text: 'text-yellow-700', badge: 'bg-yellow-100 text-yellow-800', icon: '🟡' };
  };

  const formatDays = (days: number) => {
    if (days < 0) return `已過期 ${Math.abs(days)} 天`;
    if (days === 0) return '今天到期';
    return `${days} 天後到期`;
  };

  const criticalCount = allAlerts.filter((a: any) => getDaysUntil(a.expiry_date || a.date) <= 7).length;
  const warningCount = allAlerts.filter((a: any) => { const d = getDaysUntil(a.expiry_date || a.date); return d > 7 && d <= 30; }).length;
  const cautionCount = allAlerts.filter((a: any) => { const d = getDaysUntil(a.expiry_date || a.date); return d > 30 && d <= 60; }).length;

  // Trend chart
  const maxTrendVal = Math.max(...monthlyTrend.map((t: any) => Math.max(t.revenue, t.expense)), 1);

  // Expense pie total
  const expensePieTotal = expensePie.reduce((sum: number, e: any) => sum + e.amount, 0);

  // Colors for pie chart
  const pieColors = [
    'bg-blue-500', 'bg-red-400', 'bg-green-500', 'bg-yellow-500', 'bg-purple-500',
    'bg-pink-500', 'bg-indigo-500', 'bg-orange-500', 'bg-teal-500', 'bg-cyan-500',
  ];

  const renderAlertPanel = (title: string, icon: string, alerts: any[], linkBase: string, linkLabel: string) => (
    <div className="card">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-bold text-gray-900">{icon} {title}</h2>
        <Link href={linkBase} className="text-sm text-primary-600 hover:underline">{linkLabel}</Link>
      </div>
      {alerts.length > 0 ? (
        <div className="space-y-2 max-h-80 overflow-y-auto">
          {alerts.map((alert: any, i: number) => {
            const days = getDaysUntil(alert.expiry_date || alert.date);
            const style = getAlertStyle(days);
            const href = alert.module ? `${moduleLinks[alert.module] || '/'}/${alert.id}` : `${linkBase}/${alert.id}`;
            return (
              <Link key={i} href={href} className={`flex items-center justify-between p-3 rounded-lg border ${style.bg} hover:opacity-80 transition-opacity`}>
                <div className="flex items-center gap-2 min-w-0">
                  <span>{style.icon}</span>
                  <div className="min-w-0">
                    <p className={`text-sm font-medium ${style.text} truncate`}>{alert.name || alert.employee_name}</p>
                    <p className="text-xs text-gray-500">{alert.type || alert.cert_type}</p>
                  </div>
                </div>
                <span className={`text-xs font-medium px-2 py-1 rounded-full whitespace-nowrap ${style.badge}`}>
                  {formatDays(days)}
                </span>
              </Link>
            );
          })}
        </div>
      ) : (
        <p className="text-center py-6 text-green-600 bg-green-50 rounded-lg">暫無到期提醒</p>
      )}
    </div>
  );

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">儀表板</h1>
        <p className="text-gray-500 mt-1">明達建築有限公司 - 系統總覽</p>
      </div>

      {/* ═══════════════════════════════════════════════════════════ */}
      {/* Financial Summary Cards                                    */}
      {/* ═══════════════════════════════════════════════════════════ */}
      <div className="grid grid-cols-2 lg:grid-cols-6 gap-4 mb-6">
        <div className="card hover:shadow-md transition-shadow">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-500">本月收入</p>
              <p className="text-xl font-bold text-blue-600 mt-1">{formatMoney(financial.month_revenue)}</p>
            </div>
            <div className="w-10 h-10 bg-blue-500 rounded-xl flex items-center justify-center text-lg text-white">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
            </div>
          </div>
        </div>
        <div className="card hover:shadow-md transition-shadow">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-500">本月支出</p>
              <p className="text-xl font-bold text-red-600 mt-1">{formatMoney(financial.month_expense)}</p>
            </div>
            <div className="w-10 h-10 bg-red-500 rounded-xl flex items-center justify-center text-lg text-white">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 9V7a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2m2 4h10a2 2 0 002-2v-6a2 2 0 00-2-2H9a2 2 0 00-2 2v6a2 2 0 002 2zm7-5a2 2 0 11-4 0 2 2 0 014 0z" /></svg>
            </div>
          </div>
        </div>
        <div className="card hover:shadow-md transition-shadow">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-500">本月利潤</p>
              <p className={`text-xl font-bold mt-1 ${financial.month_profit >= 0 ? 'text-green-600' : 'text-orange-600'}`}>
                {formatMoney(financial.month_profit)}
              </p>
            </div>
            <div className={`w-10 h-10 ${financial.month_profit >= 0 ? 'bg-green-500' : 'bg-orange-500'} rounded-xl flex items-center justify-center text-lg text-white`}>
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" /></svg>
            </div>
          </div>
        </div>
        <div className="card hover:shadow-md transition-shadow">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-500">應收帳款</p>
              <p className="text-xl font-bold text-indigo-600 mt-1">{formatMoney(financial.accounts_receivable)}</p>
            </div>
            <div className="w-10 h-10 bg-indigo-500 rounded-xl flex items-center justify-center text-lg text-white">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 14l6-6m-5.5.5h.01m4.99 5h.01M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16l3.5-2 3.5 2 3.5-2 3.5 2z" /></svg>
            </div>
          </div>
        </div>
        <div className="card hover:shadow-md transition-shadow">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-500">應付帳款</p>
              <p className="text-xl font-bold text-amber-600 mt-1">{formatMoney(financial.accounts_payable)}</p>
            </div>
            <div className="w-10 h-10 bg-amber-500 rounded-xl flex items-center justify-center text-lg text-white">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z" /></svg>
            </div>
          </div>
        </div>
        <Link href="/projects" className="card hover:shadow-md transition-shadow">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-500">進行中工程</p>
              <p className="text-xl font-bold text-purple-600 mt-1">{financial.active_projects || 0}</p>
            </div>
            <div className="w-10 h-10 bg-purple-500 rounded-xl flex items-center justify-center text-lg text-white">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" /></svg>
            </div>
          </div>
        </Link>
      </div>

      {/* ═══════════════════════════════════════════════════════════ */}
      {/* Reminders / To-do                                          */}
      {/* ═══════════════════════════════════════════════════════════ */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-4 mb-6">
        <Link href="/bank-reconciliation" className="card border-l-4 border-blue-500 hover:shadow-md transition-shadow">
          <p className="text-sm text-gray-500">未配對銀行交易</p>
          <p className="text-2xl font-bold text-blue-600 mt-1">{reminders.unmatched_bank_tx || 0}</p>
        </Link>
        <Link href="/invoices" className="card border-l-4 border-orange-500 hover:shadow-md transition-shadow">
          <p className="text-sm text-gray-500">即將到期發票</p>
          <p className="text-2xl font-bold text-orange-600 mt-1">{(stats?.reminders?.upcoming_invoices || []).length}</p>
        </Link>
        <Link href="/contracts" className="card border-l-4 border-yellow-500 hover:shadow-md transition-shadow">
          <p className="text-sm text-gray-500">未確認 IPA</p>
          <p className="text-2xl font-bold text-yellow-600 mt-1">{reminders.unconfirmed_ipas || 0}</p>
        </Link>
        <Link href="/employees" className="card border-l-4 border-red-500 hover:shadow-md transition-shadow">
          <p className="text-sm text-gray-500">證件即將到期</p>
          <p className="text-2xl font-bold text-red-600 mt-1">{reminders.employee_cert_expiring || 0}</p>
        </Link>
        <Link href="/leaves" className="card border-l-4 border-purple-500 hover:shadow-md transition-shadow">
          <p className="text-sm text-gray-500">待處理請假</p>
          <p className="text-2xl font-bold text-purple-600 mt-1">{reminders.pending_leaves || 0}</p>
        </Link>
      </div>

      {/* ═══════════════════════════════════════════════════════════ */}
      {/* Quick Actions                                              */}
      {/* ═══════════════════════════════════════════════════════════ */}
      <div className="grid grid-cols-3 gap-4 mb-6">
        <Link
          href="/expenses"
          className="card flex items-center gap-3 hover:shadow-md transition-shadow hover:bg-gray-50"
        >
          <div className="w-10 h-10 bg-red-100 rounded-xl flex items-center justify-center text-red-600">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" /></svg>
          </div>
          <div>
            <p className="text-sm font-medium text-gray-900">新增支出</p>
            <p className="text-xs text-gray-500">記錄新的費用支出</p>
          </div>
        </Link>
        <Link
          href="/payment-in"
          className="card flex items-center gap-3 hover:shadow-md transition-shadow hover:bg-gray-50"
        >
          <div className="w-10 h-10 bg-green-100 rounded-xl flex items-center justify-center text-green-600">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" /></svg>
          </div>
          <div>
            <p className="text-sm font-medium text-gray-900">新增收款</p>
            <p className="text-xs text-gray-500">記錄新的收款紀錄</p>
          </div>
        </Link>
        <Link
          href="/profit-loss"
          className="card flex items-center gap-3 hover:shadow-md transition-shadow hover:bg-gray-50"
        >
          <div className="w-10 h-10 bg-blue-100 rounded-xl flex items-center justify-center text-blue-600">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" /></svg>
          </div>
          <div>
            <p className="text-sm font-medium text-gray-900">查看工程損益</p>
            <p className="text-xs text-gray-500">工程損益總覽</p>
          </div>
        </Link>
      </div>

      {/* ═══════════════════════════════════════════════════════════ */}
      {/* Charts: Monthly Trend + Project Ranking                    */}
      {/* ═══════════════════════════════════════════════════════════ */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
        {/* Monthly Revenue/Expense Trend */}
        <div className="card">
          <h2 className="text-lg font-bold text-gray-900 mb-4">月度收支趨勢（近 12 個月）</h2>
          {monthlyTrend.length > 0 ? (
            <>
              <div className="flex items-center gap-4 mb-3 text-xs">
                <div className="flex items-center gap-1"><div className="w-2.5 h-2.5 rounded-full bg-blue-500"></div><span className="text-gray-500">收入</span></div>
                <div className="flex items-center gap-1"><div className="w-2.5 h-2.5 rounded-full bg-red-400"></div><span className="text-gray-500">支出</span></div>
                <div className="flex items-center gap-1"><div className="w-2.5 h-2.5 rounded-full bg-green-500"></div><span className="text-gray-500">利潤</span></div>
              </div>
              <div className="flex items-end gap-1 h-48 border-b border-l border-gray-200 pl-1 pb-1">
                {monthlyTrend.map((item: any, i: number) => (
                  <div key={i} className="flex-1 flex flex-col items-center gap-0.5 h-full justify-end group relative">
                    <div className="absolute bottom-full mb-2 hidden group-hover:block bg-gray-800 text-white text-xs rounded-lg p-2 whitespace-nowrap z-10">
                      <div className="font-semibold mb-1">{item.label}</div>
                      <div>收入: {formatMoney(item.revenue)}</div>
                      <div>支出: {formatMoney(item.expense)}</div>
                      <div>利潤: {formatMoney(item.profit)}</div>
                    </div>
                    <div className="flex items-end gap-px w-full justify-center" style={{ height: '100%' }}>
                      <div className="bg-blue-500 rounded-t w-1/4 min-w-[3px]" style={{ height: `${maxTrendVal > 0 ? (item.revenue / maxTrendVal) * 100 : 0}%`, minHeight: item.revenue > 0 ? '2px' : '0' }} />
                      <div className="bg-red-400 rounded-t w-1/4 min-w-[3px]" style={{ height: `${maxTrendVal > 0 ? (item.expense / maxTrendVal) * 100 : 0}%`, minHeight: item.expense > 0 ? '2px' : '0' }} />
                      <div className={`rounded-t w-1/4 min-w-[3px] ${item.profit >= 0 ? 'bg-green-500' : 'bg-orange-500'}`} style={{ height: `${maxTrendVal > 0 ? (Math.abs(item.profit) / maxTrendVal) * 100 : 0}%`, minHeight: Math.abs(item.profit) > 0 ? '2px' : '0' }} />
                    </div>
                    <span className="text-[9px] text-gray-400 mt-1">{item.label.split('/')[1]}</span>
                  </div>
                ))}
              </div>
            </>
          ) : (
            <p className="text-center py-8 text-gray-400">暫無趨勢數據</p>
          )}
        </div>

        {/* Project Profit Ranking Top 10 */}
        <div className="card">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-bold text-gray-900">工程利潤排名（Top 10）</h2>
            <Link href="/profit-loss" className="text-sm text-primary-600 hover:underline">查看全部</Link>
          </div>
          {topProjects.length > 0 ? (
            <div className="space-y-2 max-h-[280px] overflow-y-auto">
              {topProjects.map((p: any, i: number) => {
                const maxProfit = Math.max(...topProjects.map((pp: any) => Math.abs(pp.profit)), 1);
                const barWidth = Math.abs(p.profit) / maxProfit * 100;
                return (
                  <Link key={p.id} href={`/profit-loss/${p.id}`} className="flex items-center gap-3 p-2 rounded-lg hover:bg-gray-50 transition-colors">
                    <span className="text-xs font-bold text-gray-400 w-5 text-right">{i + 1}</span>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-900 truncate">{p.project_no}</p>
                      <p className="text-xs text-gray-500 truncate">{p.project_name}</p>
                    </div>
                    <div className="w-24 flex items-center gap-1">
                      <div className="flex-1 bg-gray-100 rounded-full h-1.5">
                        <div
                          className={`h-1.5 rounded-full ${p.profit >= 0 ? 'bg-green-500' : 'bg-red-400'}`}
                          style={{ width: `${barWidth}%` }}
                        />
                      </div>
                    </div>
                    <span className={`text-sm font-mono font-medium w-28 text-right ${p.profit >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                      {formatMoney(p.profit)}
                    </span>
                  </Link>
                );
              })}
            </div>
          ) : (
            <p className="text-center py-8 text-gray-400">暫無工程數據</p>
          )}
        </div>
      </div>

      {/* ═══════════════════════════════════════════════════════════ */}
      {/* Expense Pie + Upcoming Invoices                            */}
      {/* ═══════════════════════════════════════════════════════════ */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
        {/* Expense Category Pie */}
        <div className="card">
          <h2 className="text-lg font-bold text-gray-900 mb-4">本月支出分類</h2>
          {expensePie.length > 0 ? (
            <div className="space-y-2">
              {expensePie.slice(0, 8).map((item: any, i: number) => {
                const pct = expensePieTotal > 0 ? (item.amount / expensePieTotal * 100) : 0;
                return (
                  <div key={i} className="flex items-center gap-3">
                    <div className={`w-3 h-3 rounded-full ${pieColors[i % pieColors.length]}`}></div>
                    <span className="text-sm text-gray-700 flex-1 truncate">{item.category}</span>
                    <span className="text-sm font-mono text-gray-600">{formatMoney(item.amount)}</span>
                    <span className="text-xs text-gray-400 w-12 text-right">{pct.toFixed(1)}%</span>
                  </div>
                );
              })}
              {/* Stacked bar */}
              <div className="flex h-4 rounded-full overflow-hidden mt-3">
                {expensePie.slice(0, 8).map((item: any, i: number) => {
                  const pct = expensePieTotal > 0 ? (item.amount / expensePieTotal * 100) : 0;
                  const bgClass = pieColors[i % pieColors.length];
                  return <div key={i} className={`${bgClass}`} style={{ width: `${pct}%` }} />;
                })}
              </div>
            </div>
          ) : (
            <p className="text-center py-8 text-gray-400">本月暫無支出數據</p>
          )}
        </div>

        {/* Upcoming Invoices */}
        <div className="card">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-bold text-gray-900">即將到期的發票</h2>
            <Link href="/invoices" className="text-sm text-primary-600 hover:underline">查看全部</Link>
          </div>
          {(reminders.upcoming_invoices || []).length > 0 ? (
            <div className="space-y-2 max-h-[280px] overflow-y-auto">
              {(reminders.upcoming_invoices || []).map((inv: any) => {
                const days = getDaysUntil(inv.due_date);
                const style = getAlertStyle(days);
                return (
                  <Link key={inv.id} href={`/invoices/${inv.id}`} className={`flex items-center justify-between p-3 rounded-lg border ${style.bg} hover:opacity-80 transition-opacity`}>
                    <div className="min-w-0 flex-1">
                      <p className={`text-sm font-medium ${style.text} truncate`}>{inv.invoice_no || `INV-${inv.id}`}</p>
                      <p className="text-xs text-gray-500">{inv.client?.name || '-'} | 到期: {formatDate(inv.due_date)}</p>
                    </div>
                    <div className="text-right ml-3">
                      <p className="text-sm font-mono font-medium text-gray-900">{formatMoney(inv.outstanding || inv.total_amount)}</p>
                      <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${style.badge}`}>
                        {formatDays(days)}
                      </span>
                    </div>
                  </Link>
                );
              })}
            </div>
          ) : (
            <p className="text-center py-6 text-green-600 bg-green-50 rounded-lg">暫無即將到期的發票</p>
          )}
        </div>
      </div>

      {/* ═══════════════════════════════════════════════════════════ */}
      {/* Alert Summary + Expiry Alerts (preserved from original)    */}
      {/* ═══════════════════════════════════════════════════════════ */}
      <div className="grid grid-cols-3 gap-4 mb-6">
        <div className="card border-l-4 border-red-500">
          <div className="flex items-center justify-between">
            <div><p className="text-sm text-gray-500">緊急（7天內/已過期）</p><p className="text-2xl font-bold text-red-600 mt-1">{criticalCount}</p></div>
            <span className="text-3xl">🔴</span>
          </div>
        </div>
        <div className="card border-l-4 border-orange-500">
          <div className="flex items-center justify-between">
            <div><p className="text-sm text-gray-500">警告（8-30天）</p><p className="text-2xl font-bold text-orange-600 mt-1">{warningCount}</p></div>
            <span className="text-3xl">🟠</span>
          </div>
        </div>
        <div className="card border-l-4 border-yellow-500">
          <div className="flex items-center justify-between">
            <div><p className="text-sm text-gray-500">注意（31-60天）</p><p className="text-2xl font-bold text-yellow-600 mt-1">{cautionCount}</p></div>
            <span className="text-3xl">🟡</span>
          </div>
        </div>
      </div>

      {/* Company Profile Alerts */}
      {companyProfileAlerts.length > 0 && (
        <div className="grid grid-cols-1 gap-6 mb-6">
          {renderAlertPanel('公司資料到期提醒', '🏛️', companyProfileAlerts, '/company-profiles', '查看全部')}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
        {renderAlertPanel('員工證照到期提醒', '👷', employeeAlerts, '/employees', '查看全部')}
        {renderAlertPanel('車輛到期提醒', '🚛', vehicleAlerts, '/vehicles', '查看全部')}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
        {renderAlertPanel('機械到期提醒', '⚙️', machineryAlerts, '/machinery', '查看全部')}

        {customFieldAlerts.length > 0 ? (
          <div className="card">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-bold text-gray-900">🔧 自定義欄位到期提醒</h2>
            </div>
            <div className="space-y-2 max-h-80 overflow-y-auto">
              {customFieldAlerts.map((alert: any, i: number) => {
                const days = getDaysUntil(alert.expiry_date);
                const style = getAlertStyle(days);
                const href = alert.module ? `${moduleLinks[alert.module] || '/'}/${alert.id}` : '#';
                return (
                  <Link key={i} href={href} className={`flex items-center justify-between p-3 rounded-lg border ${style.bg} hover:opacity-80 transition-opacity`}>
                    <div className="flex items-center gap-2 min-w-0">
                      <span>{style.icon}</span>
                      <div className="min-w-0">
                        <p className={`text-sm font-medium ${style.text} truncate`}>{alert.name}</p>
                        <p className="text-xs text-gray-500">{alert.type}</p>
                      </div>
                    </div>
                    <span className={`text-xs font-medium px-2 py-1 rounded-full whitespace-nowrap ${style.badge}`}>
                      {formatDays(days)}
                    </span>
                  </Link>
                );
              })}
            </div>
          </div>
        ) : (
          <div className="card">
            <h2 className="text-lg font-bold text-gray-900 mb-4">員工職位分佈</h2>
            <div className="space-y-3">
              {stats?.roleBreakdown?.map((item: any) => (
                <div key={item.role} className="flex items-center justify-between p-3 rounded-lg bg-gray-50">
                  <span className="text-sm text-gray-700">{roleLabels[item.role] || item.role}</span>
                  <div className="flex items-center gap-3">
                    <div className="w-32 bg-gray-200 rounded-full h-2">
                      <div
                        className="bg-primary-500 rounded-full h-2"
                        style={{ width: `${(parseInt(item.count) / (stats?.employees || 1)) * 100}%` }}
                      />
                    </div>
                    <span className="text-sm font-bold text-gray-900 w-8 text-right">{item.count}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Employee Breakdown - show below if custom field alerts exist */}
      {customFieldAlerts.length > 0 && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="card">
            <h2 className="text-lg font-bold text-gray-900 mb-4">員工職位分佈</h2>
            <div className="space-y-3">
              {stats?.roleBreakdown?.map((item: any) => (
                <div key={item.role} className="flex items-center justify-between p-3 rounded-lg bg-gray-50">
                  <span className="text-sm text-gray-700">{roleLabels[item.role] || item.role}</span>
                  <div className="flex items-center gap-3">
                    <div className="w-32 bg-gray-200 rounded-full h-2">
                      <div
                        className="bg-primary-500 rounded-full h-2"
                        style={{ width: `${(parseInt(item.count) / (stats?.employees || 1)) * 100}%` }}
                      />
                    </div>
                    <span className="text-sm font-bold text-gray-900 w-8 text-right">{item.count}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
