'use client';

import { useState, useEffect, useCallback } from 'react';
import DateInput from '@/components/DateInput';
import Cookies from 'js-cookie';
import { useAuth } from '@/lib/auth';

interface AuditLog {
  id: number;
  user_id: number;
  user_name: string;
  action: string;
  target_table: string;
  target_id: number;
  changes_before: any;
  changes_after: any;
  ip_address: string | null;
  timestamp: string;
  user_agent: string | null;
}

interface UserOption {
  id: number;
  name: string;
}

interface UserActivity {
  user_id: number;
  user_name: string;
  today_count: number;
  week_count: number;
  last_activity_at: string | null;
}

const ACTIONS = [
  { value: '', label: '所有操作' },
  { value: 'create', label: '新增' },
  { value: 'update', label: '修改' },
  { value: 'delete', label: '刪除' },
];

const TABLES = [
  { value: '', label: '所有模組' },
  { value: 'companies', label: '公司' },
  { value: 'employees', label: '員工' },
  { value: 'vehicles', label: '車輛' },
  { value: 'machinery', label: '機械' },
  { value: 'partners', label: '合作單位' },
  { value: 'projects', label: '工程項目' },
  { value: 'contracts', label: '合約' },
  { value: 'work_logs', label: '工作紀錄' },
  { value: 'orders', label: '訂單' },
  { value: 'order', label: '訂單' },
  { value: 'invoices', label: '發票' },
  { value: 'expenses', label: '費用' },
  { value: 'payrolls', label: '糧單' },
  { value: 'employee_salary_settings', label: '薪酬配置' },
  { value: 'quotations', label: '報價單' },
  { value: 'leaves', label: '請假紀錄' },
  { value: 'rate_cards', label: '客戶價目表' },
  { value: 'fleet_rate_cards', label: '租賃價目表' },
  { value: 'subcon_rate_cards', label: '供應商價目表' },
  { value: 'subcon_fleet_drivers', label: '街車車隊' },
  { value: 'statutory_holidays', label: '法定假期' },
];

// Map DB table names to Chinese labels
const TABLE_LABEL_MAP: Record<string, string> = Object.fromEntries(
  TABLES.filter(t => t.value).map(t => [t.value, t.label])
);

function getTableLabel(tableName: string): string {
  return TABLE_LABEL_MAP[tableName] || tableName;
}

function getCountableTableLabel(tableName: string): string {
  return getTableLabel(tableName).replace(/^工作記錄$/, '工作紀錄');
}

function getMetadata(log: AuditLog): any {
  return log.changes_after?.metadata || {};
}

function getAffectedCount(log: AuditLog): number {
  const metadata = getMetadata(log);
  if (typeof metadata.affectedCount === 'number') return metadata.affectedCount;
  if (Array.isArray(metadata.affectedIds)) return metadata.affectedIds.length;
  if (Array.isArray(log.changes_after?.workLogIds)) return log.changes_after.workLogIds.length;
  if (Array.isArray(log.changes_after?.orderIds)) return log.changes_after.orderIds.length;
  return 1;
}

function getChangedFieldLabels(log: AuditLog): string[] {
  const metadata = getMetadata(log);
  if (Array.isArray(metadata.fields) && metadata.fields.length > 0) return metadata.fields;
  if (log.changes_after?.changes && typeof log.changes_after.changes === 'object') {
    return Object.keys(log.changes_after.changes);
  }
  if (log.changes_after?.fields && typeof log.changes_after.fields === 'object') {
    return Object.keys(log.changes_after.fields);
  }
  return [];
}

function getAuditLogDescription(log: AuditLog): string {
  const metadata = getMetadata(log);
  const operation = metadata.operation || '';
  const tableName = metadata.targetTable || log.target_table;
  const tableLabel = getCountableTableLabel(tableName);
  const count = getAffectedCount(log);
  const fields = getChangedFieldLabels(log);

  if (operation === 'bulk_confirm') {
    return `核對了 ${count} 筆${tableLabel}`;
  }
  if (operation === 'bulk_unconfirm') {
    return `取消核對了 ${count} 筆${tableLabel}`;
  }
  if (operation === 'bulk_update') {
    if (fields.length === 1) {
      return `批量修改了 ${fields[0]} 欄位（${count} 筆${tableLabel}）`;
    }
    return `修改了 ${count} 筆${tableLabel}`;
  }
  if (operation === 'bulk_save') {
    return `修改了 ${count} 筆${tableLabel}`;
  }

  switch (log.action) {
    case 'create':
      return `新增了 1 筆${tableLabel}`;
    case 'update':
      if (fields.length === 1) return `修改了 ${fields[0]} 欄位（1 筆${tableLabel}）`;
      return `修改了 1 筆${tableLabel}`;
    case 'delete':
      return `刪除了 1 筆${tableLabel}`;
    default:
      return `${log.action} 1 筆${tableLabel}`;
  }
}

function formatDateTime(value: string | null): string {
  return value ? new Date(value).toLocaleString('zh-HK') : '—';
}

export default function AuditLogsPage() {
  const { user } = useAuth();
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [userActivity, setUserActivity] = useState<UserActivity[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(25);
  const [loading, setLoading] = useState(false);
  const [activityLoading, setActivityLoading] = useState(false);

  // Filters
  const [filterUserName, setFilterUserName] = useState('');
  const [filterAction, setFilterAction] = useState('');
  const [filterTable, setFilterTable] = useState('');
  const [filterDateFrom, setFilterDateFrom] = useState('');
  const [filterDateTo, setFilterDateTo] = useState('');

  // Users for filter dropdown
  const [users, setUsers] = useState<UserOption[]>([]);

  // Expanded log for details
  const [expandedId, setExpandedId] = useState<number | null>(null);

  // Fetch users for dropdown
  useEffect(() => {
    const token = Cookies.get('token');
    fetch('/api/users', {
      headers: { 'Authorization': `Bearer ${token}` },
    })
      .then(r => r.json())
      .then(data => {
        const list = Array.isArray(data) ? data : (data.data || []);
        setUsers(list.map((u: any) => ({
          id: u.id,
          name: u.displayName || u.username || `用戶 ${u.id}`,
        })));
      })
      .catch(() => {});
  }, []);

  const fetchLogs = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      params.append('page', String(page));
      params.append('limit', String(limit));
      if (filterUserName) params.append('userName', filterUserName);
      if (filterAction) params.append('action', filterAction);
      if (filterTable) params.append('targetTable', filterTable);
      if (filterDateFrom) params.append('dateFrom', filterDateFrom);
      if (filterDateTo) params.append('dateTo', filterDateTo);

      const token = Cookies.get('token');
      const res = await fetch(`/api/audit-logs?${params.toString()}`, {
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      });
      const data = await res.json();
      setLogs(data.data || []);
      setTotal(data.total || 0);
    } catch (err) {
      console.error('Failed to fetch audit logs:', err);
    } finally {
      setLoading(false);
    }
  }, [page, limit, filterUserName, filterAction, filterTable, filterDateFrom, filterDateTo]);


  const fetchUserActivity = useCallback(async () => {
    setActivityLoading(true);
    try {
      const params = new URLSearchParams();
      if (filterDateFrom) params.append('dateFrom', filterDateFrom);
      if (filterDateTo) params.append('dateTo', filterDateTo);
      const token = Cookies.get('token');
      const res = await fetch(`/api/audit-logs/user-activity?${params.toString()}`, {
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      });
      const data = await res.json();
      setUserActivity(Array.isArray(data) ? data : []);
    } catch (err) {
      console.error('Failed to fetch user activity:', err);
      setUserActivity([]);
    } finally {
      setActivityLoading(false);
    }
  }, [filterDateFrom, filterDateTo]);

  useEffect(() => {
    fetchLogs();
  }, [fetchLogs]);

  useEffect(() => {
    fetchUserActivity();
  }, [fetchUserActivity]);

  const handleFilterReset = () => {
    setPage(1);
    setFilterUserName('');
    setFilterAction('');
    setFilterTable('');
    setFilterDateFrom('');
    setFilterDateTo('');
  };

  const getActionLabel = (action: string) => {
    const found = ACTIONS.find(a => a.value === action);
    return found ? found.label : action;
  };

  const getActionColor = (action: string) => {
    switch (action) {
      case 'create':
        return 'bg-green-100 text-green-800';
      case 'update':
        return 'bg-blue-100 text-blue-800';
      case 'delete':
        return 'bg-red-100 text-red-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  const totalPages = Math.ceil(total / limit);

  return (
    <div className="flex flex-col h-full bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 px-6 py-4">
        <h1 className="text-2xl font-bold text-gray-900">操作歷史</h1>
        <p className="text-sm text-gray-600 mt-1">查看所有用戶的後台操作記錄</p>
      </div>

      {/* Filters */}
      <div className="bg-white border-b border-gray-200 px-6 py-4 space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">用戶</label>
            <select
              value={filterUserName}
              onChange={e => { setFilterUserName(e.target.value); setPage(1); }}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            >
              <option value="">所有用戶</option>
              {users.map(u => (
                <option key={u.id} value={u.name}>{u.name}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">操作類型</label>
            <select
              value={filterAction}
              onChange={e => { setFilterAction(e.target.value); setPage(1); }}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            >
              {ACTIONS.map(a => (
                <option key={a.value} value={a.value}>{a.label}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">模組</label>
            <select
              value={filterTable}
              onChange={e => { setFilterTable(e.target.value); setPage(1); }}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            >
              {TABLES.map(t => (
                <option key={t.value} value={t.value}>{t.label}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">開始日期</label>
            <DateInput
              value={filterDateFrom}
              onChange={v => { setFilterDateFrom(v); setPage(1); }}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">結束日期</label>
            <DateInput
              value={filterDateTo}
              onChange={v => { setFilterDateTo(v); setPage(1); }}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>
        </div>

        <div className="flex gap-2">
          <button
            onClick={handleFilterReset}
            className="px-4 py-2 text-sm bg-gray-200 text-gray-800 rounded-lg hover:bg-gray-300 font-medium"
          >
            重置篩選
          </button>
        </div>
      </div>


      {/* User Activity Overview */}
      <div className="bg-white border-b border-gray-200 px-6 py-4">
        <div className="flex items-center justify-between mb-3">
          <div>
            <h2 className="text-lg font-semibold text-gray-900">用戶活動總覽</h2>
            <p className="text-sm text-gray-500 mt-1">按用戶顯示今日、本週及最後活動時間；日期範圍會同步套用於統計。</p>
          </div>
          {activityLoading && <span className="text-sm text-gray-500">更新中...</span>}
        </div>
        <div className="overflow-x-auto border border-gray-200 rounded-lg">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="px-4 py-2 text-left font-semibold text-gray-700">用戶名稱</th>
                <th className="px-4 py-2 text-right font-semibold text-gray-700">今日操作數</th>
                <th className="px-4 py-2 text-right font-semibold text-gray-700">本週操作數</th>
                <th className="px-4 py-2 text-left font-semibold text-gray-700">最後活動時間</th>
              </tr>
            </thead>
            <tbody>
              {userActivity.length === 0 ? (
                <tr>
                  <td colSpan={4} className="px-4 py-4 text-center text-gray-500">
                    {activityLoading ? '加載中...' : '沒有用戶活動資料'}
                  </td>
                </tr>
              ) : (
                userActivity.map(activity => (
                  <tr key={activity.user_id} className="border-b border-gray-100 last:border-b-0 hover:bg-gray-50">
                    <td className="px-4 py-2 text-gray-900 font-medium">{activity.user_name}</td>
                    <td className="px-4 py-2 text-right text-gray-800">{activity.today_count}</td>
                    <td className="px-4 py-2 text-right text-gray-800">{activity.week_count}</td>
                    <td className="px-4 py-2 text-gray-600 whitespace-nowrap">{formatDateTime(activity.last_activity_at)}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Table */}
      <div className="flex-1 overflow-auto">
        <table className="w-full text-sm">
          <thead className="bg-gray-100 border-b border-gray-200 sticky top-0">
            <tr>
              <th className="px-6 py-3 text-left font-semibold text-gray-700">時間</th>
              <th className="px-6 py-3 text-left font-semibold text-gray-700">用戶</th>
              <th className="px-6 py-3 text-left font-semibold text-gray-700">操作</th>
              <th className="px-6 py-3 text-left font-semibold text-gray-700">操作描述</th>
              <th className="px-6 py-3 text-left font-semibold text-gray-700">模組</th>
              <th className="px-6 py-3 text-left font-semibold text-gray-700">記錄 / 筆數</th>
              <th className="px-6 py-3 text-left font-semibold text-gray-700">IP 地址</th>
              <th className="px-6 py-3 text-left font-semibold text-gray-700">詳情</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={8} className="px-6 py-8 text-center text-gray-500">
                  加載中...
                </td>
              </tr>
            ) : logs.length === 0 ? (
              <tr>
                <td colSpan={8} className="px-6 py-8 text-center text-gray-500">
                  沒有找到操作記錄
                </td>
              </tr>
            ) : (
              logs.map(log => (
                <tbody key={log.id}>
                  <tr className="border-b border-gray-100 hover:bg-gray-50">
                    <td className="px-6 py-3 text-gray-900 whitespace-nowrap">
                      {new Date(log.timestamp).toLocaleString('zh-HK')}
                    </td>
                    <td className="px-6 py-3 text-gray-900">{log.user_name}</td>
                    <td className="px-6 py-3">
                      <span className={`px-2.5 py-0.5 rounded-full text-xs font-medium ${getActionColor(log.action)}`}>
                        {getActionLabel(log.action)}
                      </span>
                    </td>
                    <td className="px-6 py-3 text-gray-800 text-sm font-medium">{getAuditLogDescription(log)}</td>
                    <td className="px-6 py-3 text-gray-700 text-sm">{getTableLabel(log.target_table)}</td>
                    <td className="px-6 py-3 text-gray-600 font-mono">
                      {getAffectedCount(log) > 1 ? `${getAffectedCount(log)} 筆` : log.target_id}
                    </td>
                    <td className="px-6 py-3 text-gray-600 text-xs font-mono">{log.ip_address || '—'}</td>
                    <td className="px-6 py-3">
                      <button
                        onClick={() => setExpandedId(expandedId === log.id ? null : log.id)}
                        className="px-2.5 py-0.5 text-xs bg-blue-50 text-blue-600 rounded hover:bg-blue-100 font-medium"
                      >
                        {expandedId === log.id ? '隱藏' : '詳情'}
                      </button>
                    </td>
                  </tr>
                  {expandedId === log.id && (
                    <tr className="bg-blue-50 border-b border-gray-100">
                      <td colSpan={8} className="px-6 py-4">
                        <div className="space-y-3">
                          {log.changes_before && (
                            <div>
                              <h4 className="font-semibold text-gray-800 mb-1">變更前</h4>
                              <pre className="bg-white p-3 rounded border border-gray-200 text-xs overflow-auto max-h-48">
                                {JSON.stringify(log.changes_before, null, 2)}
                              </pre>
                            </div>
                          )}
                          {log.changes_after && (
                            <div>
                              <h4 className="font-semibold text-gray-800 mb-1">變更後</h4>
                              <pre className="bg-white p-3 rounded border border-gray-200 text-xs overflow-auto max-h-48">
                                {JSON.stringify(log.changes_after, null, 2)}
                              </pre>
                            </div>
                          )}
                          {log.user_agent && (
                            <div>
                              <h4 className="font-semibold text-gray-800 mb-1">User Agent</h4>
                              <p className="text-xs text-gray-600 break-all">{log.user_agent}</p>
                            </div>
                          )}
                        </div>
                      </td>
                    </tr>
                  )}
                </tbody>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      <div className="bg-white border-t border-gray-200 px-6 py-3 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <span className="text-sm text-gray-600">每頁顯示</span>
          <select
            value={limit}
            onChange={e => { setLimit(Number(e.target.value)); setPage(1); }}
            className="px-2 py-1 text-sm border border-gray-300 rounded"
          >
            {[10, 25, 50, 100].map(l => (
              <option key={l} value={l}>{l} 筆</option>
            ))}
          </select>
          <span className="text-sm text-gray-500">
            第 {Math.min((page - 1) * limit + 1, total)}–{Math.min(page * limit, total)} 筆，共 {total} 筆
          </span>
        </div>

        <div className="flex items-center gap-1">
          <button
            onClick={() => setPage(1)}
            disabled={page === 1}
            className="px-2 py-1 text-sm border border-gray-300 rounded disabled:opacity-40 hover:bg-gray-50"
          >
            «
          </button>
          <button
            onClick={() => setPage(Math.max(1, page - 1))}
            disabled={page === 1}
            className="px-3 py-1 text-sm border border-gray-300 rounded disabled:opacity-40 hover:bg-gray-50"
          >
            ‹ 上一頁
          </button>

          {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
            let p: number;
            if (totalPages <= 5) p = i + 1;
            else if (page <= 3) p = i + 1;
            else if (page >= totalPages - 2) p = totalPages - 4 + i;
            else p = page - 2 + i;
            return (
              <button
                key={p}
                onClick={() => setPage(p)}
                className={`px-3 py-1 text-sm border rounded ${
                  p === page
                    ? 'bg-blue-600 text-white border-blue-600'
                    : 'border-gray-300 hover:bg-gray-50'
                }`}
              >
                {p}
              </button>
            );
          })}

          <button
            onClick={() => setPage(Math.min(totalPages, page + 1))}
            disabled={page >= totalPages}
            className="px-3 py-1 text-sm border border-gray-300 rounded disabled:opacity-40 hover:bg-gray-50"
          >
            下一頁 ›
          </button>
          <button
            onClick={() => setPage(totalPages)}
            disabled={page >= totalPages}
            className="px-2 py-1 text-sm border border-gray-300 rounded disabled:opacity-40 hover:bg-gray-50"
          >
            »
          </button>
        </div>
      </div>
    </div>
  );
}
