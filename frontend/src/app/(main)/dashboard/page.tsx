'use client';
import { useState, useEffect } from 'react';
import { dashboardApi, employeesApi } from '@/lib/api';
import Link from 'next/link';

// ══════════════════════════════════════════════════════════════
// 工具函數
// ══════════════════════════════════════════════════════════════



const moduleLinks: Record<string, string> = {
  company: '/company-profiles', 'company-profile': '/company-profiles',
  partner: '/partners', vehicle: '/vehicles', machinery: '/machinery', employee: '/employees',
};

function formatMoney(n: number): string {
  if (!n && n !== 0) return '$0.00';
  return '$' + n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function formatDate(d: any): string {
  if (!d) return '-';
  const date = new Date(d);
  const dd = String(date.getDate()).padStart(2, '0');
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const yyyy = date.getFullYear();
  return `${dd}/${mm}/${yyyy}`;
}

function getDaysUntil(date: any): number {
  const d = new Date(date);
  const now = new Date();
  return Math.ceil((d.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
}

function getAlertStyle(days: number) {
  if (days < 0) return { bg: 'bg-red-50 border-red-200', text: 'text-red-700', badge: 'bg-red-100 text-red-800', icon: '🔴' };
  if (days <= 7) return { bg: 'bg-red-50 border-red-200', text: 'text-red-700', badge: 'bg-red-100 text-red-800', icon: '🔴' };
  if (days <= 30) return { bg: 'bg-orange-50 border-orange-200', text: 'text-orange-700', badge: 'bg-orange-100 text-orange-800', icon: '🟠' };
  return { bg: 'bg-yellow-50 border-yellow-200', text: 'text-yellow-700', badge: 'bg-yellow-100 text-yellow-800', icon: '🟡' };
}

function formatDays(days: number): string {
  if (days < 0) return `已過期 ${Math.abs(days)} 天`;
  if (days === 0) return '今天到期';
  return `${days} 天後到期`;
}

// ══════════════════════════════════════════════════════════════
// Tab 標籤組件（帶 badge）
// ══════════════════════════════════════════════════════════════

interface TabButtonProps {
  active: boolean;
  onClick: () => void;
  label: string;
  badge?: number;
}

function TabButton({ active, onClick, label, badge }: TabButtonProps) {
  return (
    <button
      onClick={onClick}
      className={`relative flex items-center gap-2 px-5 py-3 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
        active
          ? 'border-primary-600 text-primary-600'
          : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
      }`}
    >
      {label}
      {badge != null && badge > 0 && (
        <span className="inline-flex items-center justify-center min-w-[20px] h-5 px-1.5 rounded-full bg-red-500 text-white text-xs font-bold leading-none">
          {badge > 99 ? '99+' : badge}
        </span>
      )}
    </button>
  );
}

// ══════════════════════════════════════════════════════════════
// 到期提醒面板
// ══════════════════════════════════════════════════════════════

function AlertPanel({ title, icon, alerts, linkBase, linkLabel }: {
  title: string; icon: string; alerts: any[]; linkBase: string; linkLabel: string;
}) {
  return (
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
}

// ══════════════════════════════════════════════════════════════
// Tab 1: 工作狀況
// ══════════════════════════════════════════════════════════════

function WorkStatusTab({ data }: { data: any }) {
  const botStatus = data?.bot_status;
  const orderSummary = data?.daily_order_summary || {};
  const recentEmployees = data?.recent_employees || [];
  const dailyVehicleTrend = data?.daily_vehicle_trend || [];
  const maxTrendCount = Math.max(...dailyVehicleTrend.map((d: any) => d.count), 1);
  const activeProjectsList: any[] = data?.active_projects || [];
  const activeByReports = data?.active_projects_count_by_reports ?? activeProjectsList.length;
  const projectCountByStatus = data?.active_projects_count ?? 0;

  const getBotStatusConfig = () => {
    if (!botStatus) return { color: 'bg-yellow-400', label: '狀態未知', textColor: 'text-yellow-600', bg: 'bg-yellow-50 border-yellow-200' };
    switch (botStatus.status) {
      case 'connected': return { color: 'bg-green-400', label: 'Bot 已連線', textColor: 'text-green-700', bg: 'bg-green-50 border-green-200' };
      case 'disconnected': return { color: 'bg-red-500', label: 'Bot 離線', textColor: 'text-red-700', bg: 'bg-red-50 border-red-200' };
      default: return { color: 'bg-yellow-400', label: '狀態未知', textColor: 'text-yellow-600', bg: 'bg-yellow-50 border-yellow-200' };
    }
  };
  const botConfig = getBotStatusConfig();

  return (
    <div className="space-y-6">
      {/* 統計卡片 */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="card hover:shadow-md transition-shadow">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-500">今日車輛工作數</p>
              <p className="text-2xl font-bold text-blue-600 mt-1">{data?.daily_vehicle_count ?? 0}</p>
            </div>
            <div className="w-10 h-10 bg-blue-500 rounded-xl flex items-center justify-center text-white">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" /></svg>
            </div>
          </div>
        </div>
        <Link href="/daily-reports" className="card hover:shadow-md transition-shadow">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-500">活躍工程（近 30 天有日報）</p>
              <p className="text-2xl font-bold text-purple-600 mt-1">{activeByReports}</p>
              <p className="text-[11px] text-gray-400 mt-0.5">系統共 {projectCountByStatus} 個進行中工程</p>
            </div>
            <div className="w-10 h-10 bg-purple-500 rounded-xl flex items-center justify-center text-white">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" /></svg>
            </div>
          </div>
        </Link>
        <div className="card hover:shadow-md transition-shadow">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-500">今日 Order 總數</p>
              <p className="text-2xl font-bold text-green-600 mt-1">{orderSummary.total ?? 0}</p>
            </div>
            <div className="w-10 h-10 bg-green-500 rounded-xl flex items-center justify-center text-white">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" /></svg>
            </div>
          </div>
        </div>
        <div className="card hover:shadow-md transition-shadow">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-500">最近入職員工</p>
              <p className="text-2xl font-bold text-orange-600 mt-1">{recentEmployees.length}</p>
            </div>
            <div className="w-10 h-10 bg-orange-500 rounded-xl flex items-center justify-center text-white">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
            </div>
          </div>
        </div>
      </div>

      {/* 每日 Order 摘要 + 車輛趨勢 */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* 每日 Order 摘要 */}
        <div className="card">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-bold text-gray-900">今日 Order 摘要</h2>
            {orderSummary.order_status && (
              <span className={`text-xs px-2 py-1 rounded-full font-medium ${orderSummary.order_status === 'confirmed' ? 'bg-green-100 text-green-700' : 'bg-yellow-100 text-yellow-700'}`}>
                {orderSummary.order_status === 'confirmed' ? '已確認' : '暫定'}
              </span>
            )}
          </div>
          {orderSummary.total > 0 ? (
            <div className="space-y-3">
              <div className="flex items-center justify-between p-3 bg-blue-50 rounded-lg">
                <div className="flex items-center gap-2">
                  <span className="text-lg">⚙️</span>
                  <span className="text-sm font-medium text-gray-700">機械 Order</span>
                </div>
                <span className="text-xl font-bold text-blue-600">{orderSummary.machinery}</span>
              </div>
              <div className="flex items-center justify-between p-3 bg-green-50 rounded-lg">
                <div className="flex items-center gap-2">
                  <span className="text-lg">👷</span>
                  <span className="text-sm font-medium text-gray-700">人力 Order</span>
                </div>
                <span className="text-xl font-bold text-green-600">{orderSummary.manpower}</span>
              </div>
              <div className="flex items-center justify-between p-3 bg-orange-50 rounded-lg">
                <div className="flex items-center gap-2">
                  <span className="text-lg">🚛</span>
                  <span className="text-sm font-medium text-gray-700">運輸 Order</span>
                </div>
                <span className="text-xl font-bold text-orange-600">{orderSummary.transport}</span>
              </div>
              <div className="pt-2 border-t border-gray-100">
                <Link href="/verification" className="text-sm text-primary-600 hover:underline">查看詳細 Order →</Link>
              </div>
            </div>
          ) : (
            <div className="text-center py-8 text-gray-400">
              <p className="text-4xl mb-2">📋</p>
              <p>今日暫無 WhatsApp Order</p>
            </div>
          )}
        </div>

        {/* 近 7 天車輛工作趨勢 */}
        <div className="card">
          <h2 className="text-lg font-bold text-gray-900 mb-4">近 7 天車輛工作數趨勢</h2>
          {dailyVehicleTrend.length > 0 ? (
            <div className="flex items-end gap-2 h-40 border-b border-l border-gray-200 pl-1 pb-1">
              {dailyVehicleTrend.map((item: any, i: number) => (
                <div key={i} className="flex-1 flex flex-col items-center gap-0.5 h-full justify-end group relative">
                  <div className="absolute bottom-full mb-2 hidden group-hover:block bg-gray-800 text-white text-xs rounded-lg p-2 whitespace-nowrap z-10">
                    <div className="font-semibold">{item.date}</div>
                    <div>車輛數: {item.count}</div>
                  </div>
                  <div
                    className="bg-blue-500 rounded-t w-full min-w-[6px]"
                    style={{ height: `${maxTrendCount > 0 ? (item.count / maxTrendCount) * 100 : 0}%`, minHeight: item.count > 0 ? '4px' : '0' }}
                  />
                  <span className="text-[9px] text-gray-400 mt-1">{item.date}</span>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-center py-8 text-gray-400">暫無數據</p>
          )}
        </div>
      </div>

      {/* 工程統計（活躍工程）*/}
      <div className="card">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-bold text-gray-900">🏗️ 工程統計（最近 30 天）</h2>
          <Link href="/daily-reports" className="text-sm text-primary-600 hover:underline">查看全部日報 →</Link>
        </div>
        {activeProjectsList.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b">
                <tr className="text-left text-gray-600">
                  <th className="px-3 py-2 font-medium">工程名稱</th>
                  <th className="px-3 py-2 font-medium">客戶</th>
                  <th className="px-3 py-2 font-medium">客戶合約</th>
                  <th className="px-3 py-2 font-medium">工程地點</th>
                  <th className="px-3 py-2 font-medium whitespace-nowrap">最近日報</th>
                  <th className="px-3 py-2 font-medium text-right">日報數</th>
                  <th className="px-3 py-2 font-medium text-right">出勤人次</th>
                  <th className="px-3 py-2 font-medium text-right">人數</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {activeProjectsList.slice(0, 15).map((p: any, idx: number) => (
                  <tr key={idx} className="hover:bg-gray-50">
                    <td className="px-3 py-2">
                      {p.project_id ? (
                        <Link href={`/projects/${p.project_id}`} className="text-primary-600 hover:underline">{p.project_name}</Link>
                      ) : (
                        <span className="text-gray-700">{p.project_name}</span>
                      )}
                    </td>
                    <td className="px-3 py-2 text-gray-700">{p.client_name || '-'}</td>
                    <td className="px-3 py-2 text-gray-700">{p.client_contract_no || '-'}</td>
                    <td className="px-3 py-2 text-gray-700">{p.project_location || '-'}</td>
                    <td className="px-3 py-2 text-gray-700 whitespace-nowrap">{p.latest_report_date ? formatDate(p.latest_report_date) : '-'}</td>
                    <td className="px-3 py-2 text-right font-medium text-gray-900">{p.report_count}</td>
                    <td className="px-3 py-2 text-right text-gray-700">{p.manpower_entries}</td>
                    <td className="px-3 py-2 text-right text-gray-700">{p.unique_employees}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {activeProjectsList.length > 15 && (
              <p className="text-xs text-gray-400 mt-2">只顯示最近 15 個活躍工程，共 {activeProjectsList.length} 個。</p>
            )}
          </div>
        ) : (
          <div className="text-center py-8 text-gray-400">
            <p className="text-4xl mb-2">📋</p>
            <p>最近 30 天尚無工程日報記錄</p>
          </div>
        )}
      </div>

      {/* WhatsApp Bot 狀態 + 最近入職員工 */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* WhatsApp Bot 狀態 */}
        <div className="card">
          <h2 className="text-lg font-bold text-gray-900 mb-4">💬 WhatsApp Bot 狀態</h2>
          <div className={`flex items-center gap-3 p-4 rounded-lg border ${botConfig.bg}`}>
            <span className="relative flex h-4 w-4 flex-shrink-0">
              {botStatus?.status === 'connected' && (
                <span className={`animate-ping absolute inline-flex h-full w-full rounded-full ${botConfig.color} opacity-75`} />
              )}
              <span className={`relative inline-flex rounded-full h-4 w-4 ${botConfig.color}`} />
            </span>
            <div className="flex-1">
              <p className={`text-sm font-semibold ${botConfig.textColor}`}>{botConfig.label}</p>
              {botStatus?.last_heartbeat_at && (
                <p className="text-xs text-gray-500 mt-0.5">
                  最後心跳：{new Date(botStatus.last_heartbeat_at).toLocaleTimeString('zh-HK', { hour: '2-digit', minute: '2-digit' })}
                </p>
              )}
              {botStatus?.status === 'disconnected' && botStatus?.offline_duration_ms && (
                <p className="text-xs text-red-500 mt-0.5">
                  離線 {Math.floor(botStatus.offline_duration_ms / 60000)} 分鐘
                </p>
              )}
              {botStatus?.status === 'connected' && botStatus?.uptime != null && (
                <p className="text-xs text-gray-500 mt-0.5">
                  已運行 {Math.floor(botStatus.uptime / 60)} 分鐘
                </p>
              )}
            </div>
            <Link href="/verification" className="text-xs text-primary-600 hover:underline whitespace-nowrap">查看詳情</Link>
          </div>
          {botStatus?.status === 'disconnected' && (
            <div className="mt-3 p-3 bg-red-50 rounded-lg border border-red-200">
              <p className="text-xs text-red-600">Bot 已離線，請前往驗證模組掃碼重新連線。</p>
              <Link href="/verification" className="text-xs text-primary-600 hover:underline mt-1 inline-block">前往掃碼 →</Link>
            </div>
          )}
        </div>

        {/* 最近入職員工 */}
        <div className="card">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-bold text-gray-900">最近入職員工（30天內）</h2>
            <Link href="/employees" className="text-sm text-primary-600 hover:underline">查看全部</Link>
          </div>
          {recentEmployees.length > 0 ? (
            <div className="space-y-2 max-h-64 overflow-y-auto">
              {recentEmployees.map((emp: any) => (
                <Link key={emp.id} href={`/employees/${emp.id}`} className="flex items-center justify-between p-3 rounded-lg bg-gray-50 hover:bg-gray-100 transition-colors">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-8 h-8 bg-primary-100 rounded-full flex items-center justify-center text-primary-600 text-sm font-bold flex-shrink-0">
                      {emp.name_zh?.[0] || '?'}
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-gray-900 truncate">{emp.name_zh}</p>
                      <p className="text-xs text-gray-500">{emp.role || '-'} · {emp.company_name}</p>
                    </div>
                  </div>
                  <span className="text-xs text-gray-400 whitespace-nowrap ml-2">{formatDate(emp.join_date)}</span>
                </Link>
              ))}
            </div>
          ) : (
            <p className="text-center py-6 text-gray-400">近 30 天無新入職員工</p>
          )}
        </div>
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════
// Tab 2: 警告及提醒
// ══════════════════════════════════════════════════════════════

function AlertsTab({ data, onMpfApplied }: { data: any; onMpfApplied: (id: number) => void }) {
  const expiryAlerts = data?.expiry_alerts || {};
  const mpfAlerts = data?.mpf_alerts || [];
  const summary = data?.summary || {};

  const employeeAlerts = expiryAlerts.employees || [];
  const vehicleAlerts = expiryAlerts.vehicles || [];
  const machineryAlerts = expiryAlerts.machinery || [];
  const companyProfileAlerts = expiryAlerts.companyProfiles || [];
  const customFieldAlerts = expiryAlerts.customFields || [];

  return (
    <div className="space-y-6">
      {/* 警告摘要 */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="card border-l-4 border-red-500">
          <div className="flex items-center justify-between">
            <div><p className="text-sm text-gray-500">緊急（已過期/7天內）</p><p className="text-2xl font-bold text-red-600 mt-1">{summary.critical ?? 0}</p></div>
            <span className="text-3xl">🔴</span>
          </div>
        </div>
        <div className="card border-l-4 border-orange-500">
          <div className="flex items-center justify-between">
            <div><p className="text-sm text-gray-500">警告（8-30天）</p><p className="text-2xl font-bold text-orange-600 mt-1">{summary.warning ?? 0}</p></div>
            <span className="text-3xl">🟠</span>
          </div>
        </div>
        <div className="card border-l-4 border-yellow-500">
          <div className="flex items-center justify-between">
            <div><p className="text-sm text-gray-500">注意（31-60天）</p><p className="text-2xl font-bold text-yellow-600 mt-1">{summary.caution ?? 0}</p></div>
            <span className="text-3xl">🟡</span>
          </div>
        </div>
        <div className="card border-l-4 border-blue-500">
          <div className="flex items-center justify-between">
            <div><p className="text-sm text-gray-500">待申請 MPF</p><p className="text-2xl font-bold text-blue-600 mt-1">{summary.mpf_pending ?? 0}</p></div>
            <span className="text-3xl">📋</span>
          </div>
        </div>
      </div>

      {/* MPF 提醒 */}
      {mpfAlerts.length > 0 && (
        <div className="card">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-bold text-gray-900">📋 MPF 申請提醒</h2>
            <span className="text-xs text-gray-500">入職超過 60 天，尚未申請 MPF</span>
          </div>
          <div className="space-y-2 max-h-80 overflow-y-auto">
            {mpfAlerts.map((emp: any) => (
              <div key={emp.id} className="flex items-center justify-between p-3 rounded-lg border bg-blue-50 border-blue-200">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-8 h-8 bg-blue-100 rounded-full flex items-center justify-center text-blue-600 text-sm font-bold flex-shrink-0">
                    {emp.name?.[0] || '?'}
                  </div>
                  <div className="min-w-0">
                    <Link href={`/employees/${emp.id}`} className="text-sm font-medium text-blue-700 hover:underline truncate block">{emp.name}</Link>
                    <p className="text-xs text-gray-500">{emp.role || '-'} · {emp.company_name} · 入職 {formatDate(emp.join_date)}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2 ml-2 flex-shrink-0">
                  <span className="text-xs font-medium px-2 py-1 rounded-full bg-blue-100 text-blue-800 whitespace-nowrap">
                    已入職 {emp.days_since_join} 天
                  </span>
                  <button
                    onClick={() => onMpfApplied(emp.id)}
                    className="text-xs px-2 py-1 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors whitespace-nowrap"
                  >
                    標記已申請
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 公司資料到期提醒 */}
      {companyProfileAlerts.length > 0 && (
        <AlertPanel title="公司資料到期提醒" icon="🏛️" alerts={companyProfileAlerts} linkBase="/company-profiles" linkLabel="查看全部" />
      )}

      {/* 員工 + 車輛到期提醒 */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <AlertPanel title="員工證照到期提醒" icon="👷" alerts={employeeAlerts} linkBase="/employees" linkLabel="查看全部" />
        <AlertPanel title="車輛到期提醒" icon="🚛" alerts={vehicleAlerts} linkBase="/vehicles" linkLabel="查看全部" />
      </div>

      {/* 機械 + 自定義欄位到期提醒 */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <AlertPanel title="機械到期提醒" icon="⚙️" alerts={machineryAlerts} linkBase="/machinery" linkLabel="查看全部" />
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
          <div className="card flex items-center justify-center py-8 text-gray-400">
            <p>暫無自定義欄位到期提醒</p>
          </div>
        )}
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════
// Tab 3: 公司收支
// ══════════════════════════════════════════════════════════════

function FinancialTab({ data }: { data: any }) {
  const financial = data?.financial || {};
  const monthlyTrend = data?.monthly_trend || [];
  const topProjects = data?.top_projects || [];
  const expensePie = data?.expense_pie || [];
  const reminders = data?.reminders || {};
  const roleBreakdown = data?.role_breakdown || [];
  const totalEmployees = data?.total_employees || 1;

  const maxTrendVal = Math.max(...monthlyTrend.map((t: any) => Math.max(t.revenue, t.expense)), 1);
  const expensePieTotal = expensePie.reduce((sum: number, e: any) => sum + e.amount, 0);
  const pieColors = [
    'bg-blue-500', 'bg-red-400', 'bg-green-500', 'bg-yellow-500', 'bg-purple-500',
    'bg-pink-500', 'bg-indigo-500', 'bg-orange-500', 'bg-teal-500', 'bg-cyan-500',
  ];

  return (
    <div className="space-y-6">
      {/* 財務摘要卡片 */}
      <div className="grid grid-cols-2 lg:grid-cols-6 gap-4">
        <div className="card hover:shadow-md transition-shadow">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-500">本月收入</p>
              <p className="text-xl font-bold text-blue-600 mt-1">{formatMoney(financial.month_revenue)}</p>
            </div>
            <div className="w-10 h-10 bg-blue-500 rounded-xl flex items-center justify-center text-white">
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
            <div className="w-10 h-10 bg-red-500 rounded-xl flex items-center justify-center text-white">
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
            <div className={`w-10 h-10 ${financial.month_profit >= 0 ? 'bg-green-500' : 'bg-orange-500'} rounded-xl flex items-center justify-center text-white`}>
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
            <div className="w-10 h-10 bg-indigo-500 rounded-xl flex items-center justify-center text-white">
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
            <div className="w-10 h-10 bg-amber-500 rounded-xl flex items-center justify-center text-white">
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
            <div className="w-10 h-10 bg-purple-500 rounded-xl flex items-center justify-center text-white">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" /></svg>
            </div>
          </div>
        </Link>
      </div>

      {/* 提醒卡片 */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
        <Link href="/bank-reconciliation" className="card border-l-4 border-blue-500 hover:shadow-md transition-shadow">
          <p className="text-sm text-gray-500">未配對銀行交易</p>
          <p className="text-2xl font-bold text-blue-600 mt-1">{reminders.unmatched_bank_tx || 0}</p>
        </Link>
        <Link href="/invoices" className="card border-l-4 border-orange-500 hover:shadow-md transition-shadow">
          <p className="text-sm text-gray-500">即將到期發票</p>
          <p className="text-2xl font-bold text-orange-600 mt-1">{(reminders.upcoming_invoices || []).length}</p>
        </Link>
        <Link href="/contracts" className="card border-l-4 border-yellow-500 hover:shadow-md transition-shadow">
          <p className="text-sm text-gray-500">未確認 IPA</p>
          <p className="text-2xl font-bold text-yellow-600 mt-1">{reminders.unconfirmed_ipas || 0}</p>
        </Link>
        <Link href="/leaves" className="card border-l-4 border-purple-500 hover:shadow-md transition-shadow">
          <p className="text-sm text-gray-500">待處理請假</p>
          <p className="text-2xl font-bold text-purple-600 mt-1">{reminders.pending_leaves || 0}</p>
        </Link>
        <Link href="/profit-loss" className="card border-l-4 border-green-500 hover:shadow-md transition-shadow">
          <p className="text-sm text-gray-500">工程損益</p>
          <p className="text-2xl font-bold text-green-600 mt-1">{topProjects.length}</p>
        </Link>
      </div>

      {/* 快速操作 */}
      <div className="grid grid-cols-3 gap-4">
        <Link href="/expenses" className="card flex items-center gap-3 hover:shadow-md transition-shadow hover:bg-gray-50">
          <div className="w-10 h-10 bg-red-100 rounded-xl flex items-center justify-center text-red-600">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" /></svg>
          </div>
          <div>
            <p className="text-sm font-medium text-gray-900">新增支出</p>
            <p className="text-xs text-gray-500">記錄新的費用支出</p>
          </div>
        </Link>
        <Link href="/payment-in" className="card flex items-center gap-3 hover:shadow-md transition-shadow hover:bg-gray-50">
          <div className="w-10 h-10 bg-green-100 rounded-xl flex items-center justify-center text-green-600">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" /></svg>
          </div>
          <div>
            <p className="text-sm font-medium text-gray-900">新增收款</p>
            <p className="text-xs text-gray-500">記錄新的收款紀錄</p>
          </div>
        </Link>
        <Link href="/profit-loss" className="card flex items-center gap-3 hover:shadow-md transition-shadow hover:bg-gray-50">
          <div className="w-10 h-10 bg-blue-100 rounded-xl flex items-center justify-center text-blue-600">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" /></svg>
          </div>
          <div>
            <p className="text-sm font-medium text-gray-900">查看工程損益</p>
            <p className="text-xs text-gray-500">工程損益總覽</p>
          </div>
        </Link>
      </div>

      {/* 月度趨勢 + 工程排名 */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
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
                        <div className={`h-1.5 rounded-full ${p.profit >= 0 ? 'bg-green-500' : 'bg-red-400'}`} style={{ width: `${barWidth}%` }} />
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

      {/* 支出分類 + 即將到期發票 */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
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
              <div className="flex h-4 rounded-full overflow-hidden mt-3">
                {expensePie.slice(0, 8).map((item: any, i: number) => {
                  const pct = expensePieTotal > 0 ? (item.amount / expensePieTotal * 100) : 0;
                  return <div key={i} className={`${pieColors[i % pieColors.length]}`} style={{ width: `${pct}%` }} />;
                })}
              </div>
            </div>
          ) : (
            <p className="text-center py-8 text-gray-400">本月暫無支出數據</p>
          )}
        </div>

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
                      <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${style.badge}`}>{formatDays(days)}</span>
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

      {/* 員工職位分佈 */}
      <div className="card">
        <h2 className="text-lg font-bold text-gray-900 mb-4">員工職位分佈</h2>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {roleBreakdown.map((item: any) => (
            <div key={item.role} className="flex items-center justify-between p-3 rounded-lg bg-gray-50">
              <span className="text-sm text-gray-700">{item.role || '-'}</span>
              <div className="flex items-center gap-2">
                <div className="w-20 bg-gray-200 rounded-full h-2">
                  <div className="bg-primary-500 rounded-full h-2" style={{ width: `${(parseInt(item.count) / totalEmployees) * 100}%` }} />
                </div>
                <span className="text-sm font-bold text-gray-900 w-6 text-right">{item.count}</span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════
// 主頁面
// ══════════════════════════════════════════════════════════════

// ════════════════════════════════════════════════════════════
// WhatsApp 報工訊息 Feed Tab
// ════════════════════════════════════════════════════════════
const GROUP_COLORS: Record<string, string> = {
  '工程部': 'bg-blue-100 text-blue-800',
  '運輸部': 'bg-green-100 text-green-800',
  '機械部': 'bg-orange-100 text-orange-800',
  '公司打卡': 'bg-purple-100 text-purple-800',
};
function WhatsAppFeedTab({ messages, onRefresh }: { messages: any[]; onRefresh: () => void }) {
  const formatTime = (ts: string) => {
    if (!ts) return '';
    const d = new Date(ts);
    return d.toLocaleTimeString('zh-HK', { hour: '2-digit', minute: '2-digit' });
  };
  const getFirstLine = (text: string) => {
    if (!text) return '';
    return text.split('\n')[0].trim().substring(0, 60);
  };
  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-lg font-bold text-gray-900">💬 WhatsApp 報工訊息</h2>
          <p className="text-sm text-gray-500 mt-0.5">今日報工群組收到的訊息（共 {messages.length} 條）</p>
        </div>
        <button
          onClick={onRefresh}
          className="flex items-center gap-1.5 px-3 py-1.5 text-sm text-primary-600 border border-primary-300 rounded-lg hover:bg-primary-50 transition-colors"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
          </svg>
          刷新
        </button>
      </div>
      {messages.length === 0 ? (
        <div className="card text-center py-12 text-gray-400">
          <p className="text-4xl mb-3">💭</p>
          <p>今日尚未收到報工訊息</p>
        </div>
      ) : (
        <div className="space-y-2">
          {messages.map((msg: any) => (
            <div key={msg.id} className="card p-3 hover:shadow-md transition-shadow">
              <div className="flex items-start gap-3">
                <div className="flex-shrink-0 text-right min-w-[44px]">
                  <span className="text-sm font-mono text-gray-500">{formatTime(msg.received_at)}</span>
                </div>
                <div className="flex-shrink-0">
                  <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-semibold ${GROUP_COLORS[msg.group_label] || 'bg-gray-100 text-gray-700'}`}>
                    {msg.group_label}
                  </span>
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-gray-900 truncate">{msg.sender || '未知'}</span>
                  </div>
                  <p className="text-sm text-gray-600 mt-0.5 truncate">{getFirstLine(msg.text)}</p>
                </div>
                <details className="flex-shrink-0">
                  <summary className="text-xs text-primary-600 cursor-pointer hover:underline select-none">查看</summary>
                  <div className="absolute right-4 mt-1 z-10 bg-white border border-gray-200 rounded-lg shadow-xl p-3 max-w-sm w-72">
                    <pre className="text-xs text-gray-700 whitespace-pre-wrap break-words font-sans">{msg.text}</pre>
                  </div>
                </details>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ════════════════════════════════════════════════════════════════
// Tab 5: 打卡總覽
// ════════════════════════════════════════════════════════════════

const TYPE_LABELS: Record<string, string> = {
  clock_in: '開工',
  clock_out: '收工',
};

const TYPE_BADGE_STYLE: Record<string, string> = {
  clock_in: 'bg-green-100 text-green-800 border border-green-200',
  clock_out: 'bg-blue-100 text-blue-800 border border-blue-200',
};

function formatHKTTime(ts: any): string {
  if (!ts) return '-';
  const d = new Date(ts);
  return d.toLocaleTimeString('zh-HK', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Hong_Kong' });
}

function formatMinutes(m: number): string {
  if (m < 60) return `${m} 分鐘`;
  const h = Math.floor(m / 60);
  const mins = m % 60;
  return mins > 0 ? `${h} 小時 ${mins} 分鐘` : `${h} 小時`;
}

function AttendanceTab({ data, onRefresh }: { data: any; onRefresh: () => void }) {
  const summary = data?.summary || {};
  const records = data?.records || [];
  const notClockedIn = data?.not_clocked_in || [];
  const lateRecords = data?.late_records || [];
  const earlyLeaveRecords = data?.early_leave_records || [];

  const [showSection, setShowSection] = useState<'records' | 'not_clocked' | 'late' | 'early'>('records');

  const clockedInPct = summary.total_active_employees > 0
    ? Math.round((summary.clocked_in_count / summary.total_active_employees) * 100)
    : 0;

  return (
    <div className="space-y-6">
      {/* 標題列 */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-bold text-gray-900">今日打卡總覽</h2>
          <p className="text-sm text-gray-500 mt-0.5">共 {summary.total_records || 0} 筆打卡記錄</p>
        </div>
        <div className="flex items-center gap-3">
          <Link href="/attendances" className="text-sm text-primary-600 hover:underline">查看全部打卡記錄</Link>
          <button
            onClick={onRefresh}
            className="flex items-center gap-1.5 px-3 py-1.5 text-sm text-primary-600 border border-primary-300 rounded-lg hover:bg-primary-50 transition-colors"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
            刷新
          </button>
        </div>
      </div>

      {/* 統計卡片 */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
        <div className="card hover:shadow-md transition-shadow">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-500">在職員工數</p>
              <p className="text-2xl font-bold text-gray-900 mt-1">{summary.total_active_employees ?? 0}</p>
            </div>
            <div className="w-10 h-10 bg-gray-100 rounded-xl flex items-center justify-center text-gray-600">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
            </div>
          </div>
        </div>
        <button onClick={() => setShowSection('records')} className={`card hover:shadow-md transition-shadow text-left ${showSection === 'records' ? 'ring-2 ring-green-500' : ''}`}>
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-500">已打卡</p>
              <p className="text-2xl font-bold text-green-600 mt-1">{summary.clocked_in_count ?? 0}</p>
              <p className="text-xs text-gray-400 mt-0.5">{clockedInPct}%</p>
            </div>
            <div className="w-10 h-10 bg-green-100 rounded-xl flex items-center justify-center text-green-600">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
            </div>
          </div>
        </button>
        <button onClick={() => setShowSection('not_clocked')} className={`card hover:shadow-md transition-shadow text-left ${showSection === 'not_clocked' ? 'ring-2 ring-red-500' : ''}`}>
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-500">未打卡</p>
              <p className="text-2xl font-bold text-red-600 mt-1">{summary.not_clocked_in_count ?? 0}</p>
            </div>
            <div className="w-10 h-10 bg-red-100 rounded-xl flex items-center justify-center text-red-600">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
            </div>
          </div>
        </button>
        <button onClick={() => setShowSection('late')} className={`card hover:shadow-md transition-shadow text-left ${showSection === 'late' ? 'ring-2 ring-orange-500' : ''}`}>
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-500">遲到</p>
              <p className="text-2xl font-bold text-orange-600 mt-1">{summary.late_count ?? 0}</p>
            </div>
            <div className="w-10 h-10 bg-orange-100 rounded-xl flex items-center justify-center text-orange-600">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
            </div>
          </div>
        </button>
        <button onClick={() => setShowSection('early')} className={`card hover:shadow-md transition-shadow text-left ${showSection === 'early' ? 'ring-2 ring-purple-500' : ''}`}>
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-500">早退</p>
              <p className="text-2xl font-bold text-purple-600 mt-1">{summary.early_leave_count ?? 0}</p>
            </div>
            <div className="w-10 h-10 bg-purple-100 rounded-xl flex items-center justify-center text-purple-600">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 16l-4-4m0 0l4-4m-4 4h14m-5 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h7a3 3 0 013 3v1" /></svg>
            </div>
          </div>
        </button>
      </div>

      {/* 打卡率進度條 */}
      <div className="card">
        <div className="flex items-center justify-between mb-2">
          <span className="text-sm font-medium text-gray-700">今日打卡率</span>
          <span className="text-sm font-bold text-gray-900">{clockedInPct}%</span>
        </div>
        <div className="w-full bg-gray-200 rounded-full h-3">
          <div
            className={`h-3 rounded-full transition-all duration-500 ${
              clockedInPct >= 80 ? 'bg-green-500' : clockedInPct >= 50 ? 'bg-yellow-500' : 'bg-red-500'
            }`}
            style={{ width: `${clockedInPct}%` }}
          />
        </div>
        <div className="flex justify-between mt-1 text-xs text-gray-400">
          <span>已打卡 {summary.clocked_in_count ?? 0} 人</span>
          <span>未打卡 {summary.not_clocked_in_count ?? 0} 人</span>
        </div>
      </div>

      {/* 動態內容區域 */}
      {showSection === 'records' && (
        <div className="card">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-bold text-gray-900">今日打卡記錄</h3>
            <span className="text-sm text-gray-500">共 {records.length} 筆</span>
          </div>
          {records.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-200 text-left">
                    <th className="pb-3 pr-4 font-medium text-gray-500">員工</th>
                    <th className="pb-3 pr-4 font-medium text-gray-500">類型</th>
                    <th className="pb-3 pr-4 font-medium text-gray-500">時間</th>
                    <th className="pb-3 pr-4 font-medium text-gray-500">地點</th>
                    <th className="pb-3 font-medium text-gray-500">備註</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {records.map((rec: any) => (
                    <tr key={rec.id} className="hover:bg-gray-50">
                      <td className="py-3 pr-4">
                        <div className="flex items-center gap-2">
                          <div className="w-7 h-7 bg-primary-100 rounded-full flex items-center justify-center text-primary-600 text-xs font-bold flex-shrink-0">
                            {rec.name_zh?.[0] || '?'}
                          </div>
                          <div className="min-w-0">
                            <p className="font-medium text-gray-900 truncate">{rec.name_zh}</p>
                            <p className="text-xs text-gray-400 truncate">{rec.emp_code || ''} {rec.company_name ? `· ${rec.company_name}` : ''}{rec.is_temporary ? ' · 臨時工' : ''}</p>
                          </div>
                        </div>
                      </td>
                      <td className="py-3 pr-4">
                        <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${TYPE_BADGE_STYLE[rec.type] || 'bg-gray-100 text-gray-700'}`}>
                          {TYPE_LABELS[rec.type] || rec.type}
                          {rec.is_mid_shift && ' (中直)'}
                        </span>
                      </td>
                      <td className="py-3 pr-4 text-gray-700 whitespace-nowrap">{formatHKTTime(rec.timestamp)}</td>
                      <td className="py-3 pr-4">
                        <p className="text-gray-600 truncate max-w-[200px]" title={rec.address || ''}>
                          {rec.address || '-'}
                        </p>
                      </td>
                      <td className="py-3 text-gray-500 truncate max-w-[150px]">{rec.work_notes || '-'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="text-center py-12 text-gray-400">
              <p className="text-4xl mb-3">⏰</p>
              <p>今日尚無打卡記錄</p>
            </div>
          )}
        </div>
      )}

      {showSection === 'not_clocked' && (
        <div className="card">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-bold text-gray-900">未打卡員工</h3>
            <span className="text-sm text-gray-500">共 {notClockedIn.length} 人</span>
          </div>
          {notClockedIn.length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2">
              {notClockedIn.map((emp: any) => (
                <Link key={emp.id} href={`/employees/${emp.id}`} className="flex items-center gap-3 p-3 rounded-lg bg-red-50 border border-red-100 hover:bg-red-100 transition-colors">
                  <div className="w-8 h-8 bg-red-100 rounded-full flex items-center justify-center text-red-600 text-sm font-bold flex-shrink-0">
                    {emp.name_zh?.[0] || '?'}
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-gray-900 truncate">{emp.name_zh}</p>
                    <p className="text-xs text-gray-500 truncate">{emp.role || '-'} {emp.company_name ? `· ${emp.company_name}` : ''}</p>
                  </div>
                </Link>
              ))}
            </div>
          ) : (
            <p className="text-center py-6 text-green-600 bg-green-50 rounded-lg">所有員工已打卡</p>
          )}
        </div>
      )}

      {showSection === 'late' && (
        <div className="card">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-bold text-gray-900">遲到記錄</h3>
            <span className="text-xs text-gray-400">標準開工時間：08:00</span>
          </div>
          {lateRecords.length > 0 ? (
            <div className="space-y-2">
              {lateRecords.map((rec: any) => (
                <div key={rec.employee_id} className="flex items-center justify-between p-3 rounded-lg bg-orange-50 border border-orange-200">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-8 h-8 bg-orange-100 rounded-full flex items-center justify-center text-orange-600 text-sm font-bold flex-shrink-0">
                      {rec.name_zh?.[0] || '?'}
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-gray-900 truncate">{rec.name_zh}</p>
                      <p className="text-xs text-gray-500">{rec.role || ''} {rec.company_name ? `· ${rec.company_name}` : ''}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3 ml-2 flex-shrink-0">
                    <span className="text-sm text-gray-700">開工: {formatHKTTime(rec.clock_in_time)}</span>
                    <span className="text-xs font-medium px-2 py-1 rounded-full bg-orange-100 text-orange-800">
                      遲到 {formatMinutes(rec.minutes_late)}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-center py-6 text-green-600 bg-green-50 rounded-lg">今日無人遲到</p>
          )}
        </div>
      )}

      {showSection === 'early' && (
        <div className="card">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-bold text-gray-900">早退記錄</h3>
            <span className="text-xs text-gray-400">標準收工時間：18:00</span>
          </div>
          {earlyLeaveRecords.length > 0 ? (
            <div className="space-y-2">
              {earlyLeaveRecords.map((rec: any) => (
                <div key={rec.employee_id} className="flex items-center justify-between p-3 rounded-lg bg-purple-50 border border-purple-200">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-8 h-8 bg-purple-100 rounded-full flex items-center justify-center text-purple-600 text-sm font-bold flex-shrink-0">
                      {rec.name_zh?.[0] || '?'}
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-gray-900 truncate">{rec.name_zh}</p>
                      <p className="text-xs text-gray-500">{rec.role || ''} {rec.company_name ? `· ${rec.company_name}` : ''}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3 ml-2 flex-shrink-0">
                    <span className="text-sm text-gray-700">收工: {formatHKTTime(rec.clock_out_time)}</span>
                    <span className="text-xs font-medium px-2 py-1 rounded-full bg-purple-100 text-purple-800">
                      早退 {formatMinutes(rec.minutes_early)}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-center py-6 text-green-600 bg-green-50 rounded-lg">今日無人早退</p>
          )}
        </div>
      )}
    </div>
  );
}

// ════════════════════════════════════════════════════════════════
// 主頁面
// ════════════════════════════════════════════════════════════════

type TabId = 'work' | 'alerts' | 'financial' | 'whatsapp' | 'attendance';
export default function DashboardPage() {
  const [activeTab, setActiveTab] = useState<TabId>('work');
  const [workData, setWorkData] = useState<any>(null);
  const [alertsData, setAlertsData] = useState<any>(null);
  const [financialData, setFinancialData] = useState<any>(null);
  const [feedMessages, setFeedMessages] = useState<any[]>([]);
  const [attendanceData, setAttendanceData] = useState<any>(null);
  const [loadingWork, setLoadingWork] = useState(true);
  const [loadingAlerts, setLoadingAlerts] = useState(true);
  const [loadingFinancial, setLoadingFinancial] = useState(true);
  const [loadingFeed, setLoadingFeed] = useState(true);
  const [loadingAttendance, setLoadingAttendance] = useState(true);

  const loadFeed = () => {
    setLoadingFeed(true);
    dashboardApi.whatsappFeed()
      .then(res => setFeedMessages(res.data || []))
      .catch(() => setFeedMessages([]))
      .finally(() => setLoadingFeed(false));
  };

  const loadAttendance = () => {
    setLoadingAttendance(true);
    dashboardApi.attendanceSummary()
      .then(res => setAttendanceData(res.data))
      .catch(() => setAttendanceData({}))
      .finally(() => setLoadingAttendance(false));
  };

  // 並行載入所有 tab 數據
  useEffect(() => {
    dashboardApi.workStatus()
      .then(res => setWorkData(res.data))
      .catch(() => setWorkData({}))
      .finally(() => setLoadingWork(false));

    dashboardApi.alerts()
      .then(res => setAlertsData(res.data))
      .catch(() => setAlertsData({}))
      .finally(() => setLoadingAlerts(false));

    dashboardApi.financial()
      .then(res => setFinancialData(res.data))
      .catch(() => setFinancialData({}))
      .finally(() => setLoadingFinancial(false));

    loadFeed();
    loadAttendance();
  }, []);

  // MPF 標記已申請
  const handleMpfApplied = async (employeeId: number) => {
    try {
      await employeesApi.update(employeeId, {
        employee_mpf_applied: true,
        employee_mpf_applied_date: new Date().toISOString().split('T')[0],
      });
      // 重新載入警告數據
      setLoadingAlerts(true);
      dashboardApi.alerts()
        .then(res => setAlertsData(res.data))
        .catch(() => {})
        .finally(() => setLoadingAlerts(false));
    } catch (err) {
      console.error('Failed to mark MPF applied', err);
    }
  };

  const alertTotalCount = alertsData?.summary?.total ?? 0;
  const attendanceTotalRecords = attendanceData?.summary?.total_records ?? 0;

  return (
    <div>
      {/* 頁面標題 */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">儀表板</h1>
        <p className="text-gray-500 mt-1">明達建築有限公司 - 系統總覽</p>
      </div>

      {/* Tab 導航 */}
      <div className="border-b border-gray-200 mb-6">
        <nav className="flex gap-0 -mb-px overflow-x-auto">
          <TabButton
            active={activeTab === 'work'}
            onClick={() => setActiveTab('work')}
            label="工作狀況"
          />
          <TabButton
            active={activeTab === 'attendance'}
            onClick={() => setActiveTab('attendance')}
            label="打卡總覽"
            badge={loadingAttendance ? undefined : attendanceTotalRecords}
          />
          <TabButton
            active={activeTab === 'alerts'}
            onClick={() => setActiveTab('alerts')}
            label="警告及提醒"
            badge={loadingAlerts ? undefined : alertTotalCount}
          />
          <TabButton
            active={activeTab === 'financial'}
            onClick={() => setActiveTab('financial')}
            label="公司收支"
          />
          <TabButton
            active={activeTab === 'whatsapp'}
            onClick={() => setActiveTab('whatsapp')}
            label="💬 報工訊息"
            badge={loadingFeed ? undefined : feedMessages.length}
          />
        </nav>
      </div>

      {/* Tab 內容 */}
      {activeTab === 'work' && (
        loadingWork
          ? <div className="flex justify-center py-20"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600"></div></div>
          : <WorkStatusTab data={workData} />
      )}
      {activeTab === 'attendance' && (
        loadingAttendance
          ? <div className="flex justify-center py-20"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600"></div></div>
          : <AttendanceTab data={attendanceData} onRefresh={loadAttendance} />
      )}
      {activeTab === 'alerts' && (
        loadingAlerts
          ? <div className="flex justify-center py-20"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600"></div></div>
          : <AlertsTab data={alertsData} onMpfApplied={handleMpfApplied} />
      )}
      {activeTab === 'financial' && (
        loadingFinancial
          ? <div className="flex justify-center py-20"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600"></div></div>
          : <FinancialTab data={financialData} />
      )}
      {activeTab === 'whatsapp' && (
        loadingFeed
          ? <div className="flex justify-center py-20"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600"></div></div>
          : <WhatsAppFeedTab messages={feedMessages} onRefresh={loadFeed} />
      )}
    </div>
  );
}
