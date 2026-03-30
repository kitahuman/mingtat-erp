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

  const alerts = [
    { label: '員工證照即將到期', value: stats?.expiringEmployees || 0, href: '/employees', color: 'text-red-600' },
    { label: '車輛保險/檢查即將到期', value: stats?.expiringVehicles || 0, href: '/vehicles', color: 'text-orange-600' },
    { label: '機械驗機紙即將到期', value: stats?.expiringMachinery || 0, href: '/machinery', color: 'text-yellow-600' },
  ];

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

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Alerts */}
        <div className="card">
          <h2 className="text-lg font-bold text-gray-900 mb-4">到期提醒（30天內）</h2>
          <div className="space-y-3">
            {alerts.map((alert) => (
              <Link key={alert.label} href={alert.href} className="flex items-center justify-between p-3 rounded-lg bg-gray-50 hover:bg-gray-100 transition-colors">
                <span className="text-sm text-gray-700">{alert.label}</span>
                <span className={`text-lg font-bold ${alert.value > 0 ? alert.color : 'text-green-600'}`}>
                  {alert.value > 0 ? alert.value : '✓'}
                </span>
              </Link>
            ))}
          </div>
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
