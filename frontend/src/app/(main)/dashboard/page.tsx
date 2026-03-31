'use client';
import { useState, useEffect } from 'react';
import { dashboardApi } from '@/lib/api';
import Link from 'next/link';

const roleLabels: Record<string, string> = { admin: '管理', driver: '司機', operator: '機手', worker: '雜工' };

export default function DashboardPage() {
  const [stats, setStats] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    dashboardApi.stats().then(res => { setStats(res.data); setLoading(false); }).catch(() => setLoading(false));
  }, []);

  if (loading) return <div className="flex justify-center py-20"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600"></div></div>;

  const cards = [
    { label: '公司', value: stats?.companies || 0, icon: '🏢', href: '/companies', color: 'bg-blue-500' },
    { label: '員工', value: stats?.employees || 0, icon: '👷', href: '/employees', color: 'bg-green-500' },
    { label: '車輛', value: stats?.vehicles || 0, icon: '🚛', href: '/vehicles', color: 'bg-orange-500' },
    { label: '機械', value: stats?.machinery || 0, icon: '⚙️', href: '/machinery', color: 'bg-purple-500' },
  ];

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

  // Collect all expiry alerts from the new API format
  const employeeAlerts = stats?.expiryAlerts?.employees || [];
  const vehicleAlerts = stats?.expiryAlerts?.vehicles || [];
  const machineryAlerts = stats?.expiryAlerts?.machinery || [];

  const criticalCount = [...employeeAlerts, ...vehicleAlerts, ...machineryAlerts].filter((a: any) => {
    const days = getDaysUntil(a.expiry_date || a.date);
    return days <= 7;
  }).length;

  const warningCount = [...employeeAlerts, ...vehicleAlerts, ...machineryAlerts].filter((a: any) => {
    const days = getDaysUntil(a.expiry_date || a.date);
    return days > 7 && days <= 30;
  }).length;

  const cautionCount = [...employeeAlerts, ...vehicleAlerts, ...machineryAlerts].filter((a: any) => {
    const days = getDaysUntil(a.expiry_date || a.date);
    return days > 30 && days <= 60;
  }).length;

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">儀表板</h1>
        <p className="text-gray-500 mt-1">明達建築有限公司 - 主檔管理系統總覽</p>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        {cards.map((card) => (
          <Link key={card.label} href={card.href} className="card hover:shadow-md transition-shadow">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-500">{card.label}</p>
                <p className="text-3xl font-bold text-gray-900 mt-1">{card.value}</p>
              </div>
              <div className={`w-12 h-12 ${card.color} rounded-xl flex items-center justify-center text-2xl`}>
                {card.icon}
              </div>
            </div>
          </Link>
        ))}
      </div>

      {/* Alert Summary */}
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

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
        {/* Employee Expiry Alerts */}
        <div className="card">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-bold text-gray-900">👷 員工證照到期提醒</h2>
            <Link href="/employees" className="text-sm text-primary-600 hover:underline">查看全部</Link>
          </div>
          {employeeAlerts.length > 0 ? (
            <div className="space-y-2 max-h-80 overflow-y-auto">
              {employeeAlerts.map((alert: any, i: number) => {
                const days = getDaysUntil(alert.expiry_date || alert.date);
                const style = getAlertStyle(days);
                return (
                  <Link key={i} href={`/employees/${alert.id || alert.employee_id}`} className={`flex items-center justify-between p-3 rounded-lg border ${style.bg} hover:opacity-80 transition-opacity`}>
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
            <p className="text-center py-6 text-green-600 bg-green-50 rounded-lg">✓ 暫無到期提醒</p>
          )}
        </div>

        {/* Vehicle Expiry Alerts */}
        <div className="card">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-bold text-gray-900">🚛 車輛到期提醒</h2>
            <Link href="/vehicles" className="text-sm text-primary-600 hover:underline">查看全部</Link>
          </div>
          {vehicleAlerts.length > 0 ? (
            <div className="space-y-2 max-h-80 overflow-y-auto">
              {vehicleAlerts.map((alert: any, i: number) => {
                const days = getDaysUntil(alert.expiry_date || alert.date);
                const style = getAlertStyle(days);
                return (
                  <Link key={i} href={`/vehicles/${alert.id || alert.vehicle_id}`} className={`flex items-center justify-between p-3 rounded-lg border ${style.bg} hover:opacity-80 transition-opacity`}>
                    <div className="flex items-center gap-2 min-w-0">
                      <span>{style.icon}</span>
                      <div className="min-w-0">
                        <p className={`text-sm font-medium font-mono ${style.text} truncate`}>{alert.name || alert.plate_number}</p>
                        <p className="text-xs text-gray-500">{alert.type || alert.expiry_type}</p>
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
            <p className="text-center py-6 text-green-600 bg-green-50 rounded-lg">✓ 暫無到期提醒</p>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Machinery Expiry Alerts */}
        <div className="card">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-bold text-gray-900">⚙️ 機械到期提醒</h2>
            <Link href="/machinery" className="text-sm text-primary-600 hover:underline">查看全部</Link>
          </div>
          {machineryAlerts.length > 0 ? (
            <div className="space-y-2 max-h-80 overflow-y-auto">
              {machineryAlerts.map((alert: any, i: number) => {
                const days = getDaysUntil(alert.expiry_date || alert.date);
                const style = getAlertStyle(days);
                return (
                  <Link key={i} href={`/machinery/${alert.id || alert.machinery_id}`} className={`flex items-center justify-between p-3 rounded-lg border ${style.bg} hover:opacity-80 transition-opacity`}>
                    <div className="flex items-center gap-2 min-w-0">
                      <span>{style.icon}</span>
                      <div className="min-w-0">
                        <p className={`text-sm font-medium font-mono ${style.text} truncate`}>{alert.name || alert.machine_code}</p>
                        <p className="text-xs text-gray-500">{alert.type || alert.expiry_type}</p>
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
            <p className="text-center py-6 text-green-600 bg-green-50 rounded-lg">✓ 暫無到期提醒</p>
          )}
        </div>

        {/* Employee Breakdown */}
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
    </div>
  );
}
