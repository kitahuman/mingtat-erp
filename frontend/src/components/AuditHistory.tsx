'use client';

import { useState, useEffect } from 'react';
import { auditLogsApi } from '@/lib/api';

function fmtDateTime(d: string) {
  if (!d) return '-';
  const date = new Date(d);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')} ${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
}

const ACTION_LABELS: Record<string, string> = {
  create: '新增',
  update: '修改',
  delete: '刪除',
};

const ACTION_COLORS: Record<string, string> = {
  create: 'bg-green-100 text-green-700',
  update: 'bg-blue-100 text-blue-700',
  delete: 'bg-red-100 text-red-700',
};

interface AuditHistoryProps {
  targetTable: string;
  targetId: number;
}

export default function AuditHistory({ targetTable, targetId }: AuditHistoryProps) {
  const [logs, setLogs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<number | null>(null);

  useEffect(() => {
    if (!targetTable || !targetId) return;
    setLoading(true);
    auditLogsApi.getByTarget(targetTable, targetId)
      .then(res => {
        setLogs(res.data?.data || []);
      })
      .catch(() => setLogs([]))
      .finally(() => setLoading(false));
  }, [targetTable, targetId]);

  if (loading) return <div className="text-sm text-gray-400 py-2">載入歷史記錄...</div>;
  if (logs.length === 0) return <div className="text-sm text-gray-400 py-2">暫無歷史記錄</div>;

  return (
    <div className="space-y-2">
      <h3 className="text-sm font-bold text-gray-700 mb-2">變更歷史</h3>
      {logs.map((log: any) => (
        <div key={log.id} className="border rounded-lg p-3 text-sm">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className={`px-2 py-0.5 rounded text-xs font-medium ${ACTION_COLORS[log.action] || 'bg-gray-100 text-gray-600'}`}>
                {ACTION_LABELS[log.action] || log.action}
              </span>
              <span className="text-gray-600">{log.user_name || '系統'}</span>
              <span className="text-gray-400">{fmtDateTime(log.timestamp)}</span>
            </div>
            <button
              onClick={() => setExpanded(expanded === log.id ? null : log.id)}
              className="text-xs text-primary-600 hover:underline"
            >
              {expanded === log.id ? '收起' : '詳情'}
            </button>
          </div>
          {expanded === log.id && (
            <div className="mt-2 text-xs">
              {log.changes_before && (
                <div className="mb-1">
                  <span className="font-medium text-gray-500">變更前：</span>
                  <pre className="bg-gray-50 rounded p-2 overflow-x-auto mt-1 max-h-40">
                    {JSON.stringify(log.changes_before, null, 2)}
                  </pre>
                </div>
              )}
              {log.changes_after && (
                <div>
                  <span className="font-medium text-gray-500">變更後：</span>
                  <pre className="bg-gray-50 rounded p-2 overflow-x-auto mt-1 max-h-40">
                    {JSON.stringify(log.changes_after, null, 2)}
                  </pre>
                </div>
              )}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
