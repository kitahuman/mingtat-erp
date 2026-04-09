'use client';

import { useState, useEffect } from 'react';
import { acceptanceReportsApi, projectsApi } from '@/lib/api';
import { fmtDate } from '@/lib/dateUtils';

const statusLabels: Record<string, string> = { draft: '草稿', submitted: '已提交' };
const statusColors: Record<string, string> = { draft: 'badge-yellow', submitted: 'badge-green' };

export default function AcceptanceReportsAdminPage() {
  const [reports, setReports] = useState<any[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [projects, setProjects] = useState<any[]>([]);
  const [filterProjectId, setFilterProjectId] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [filterDateFrom, setFilterDateFrom] = useState('');
  const [filterDateTo, setFilterDateTo] = useState('');
  const [search, setSearch] = useState('');
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const limit = 20;

  const loadData = async () => {
    try {
      setLoading(true);
      const params: any = { page, limit };
      if (filterProjectId) params.project_id = filterProjectId;
      if (filterStatus) params.status = filterStatus;
      if (filterDateFrom) params.date_from = filterDateFrom;
      if (filterDateTo) params.date_to = filterDateTo;
      if (search) params.search = search;
      const res = await acceptanceReportsApi.list(params);
      setReports(res.data?.data || []);
      setTotal(res.data?.total || 0);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    projectsApi.simple().then(res => setProjects(res.data || [])).catch(() => {});
  }, []);

  useEffect(() => {
    loadData();
  }, [page, filterProjectId, filterStatus, filterDateFrom, filterDateTo, search]);

  const totalPages = Math.ceil(total / limit);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-800">工程收貨報告管理</h1>
        <span className="text-sm text-gray-500">共 {total} 條記錄</span>
      </div>

      <div className="bg-white rounded-lg shadow-sm border p-4">
        <div className="grid grid-cols-1 md:grid-cols-5 gap-3">
          <input type="text" value={search} onChange={e => { setSearch(e.target.value); setPage(1); }} placeholder="搜尋工程/客戶/收貨項目..." className="px-3 py-2 border rounded-lg text-sm" />
          <select value={filterProjectId} onChange={e => { setFilterProjectId(e.target.value); setPage(1); }} className="px-3 py-2 border rounded-lg text-sm">
            <option value="">全部工程</option>
            {projects.map((p: any) => (<option key={p.id} value={p.id}>{p.project_no} - {p.project_name}</option>))}
          </select>
          <select value={filterStatus} onChange={e => { setFilterStatus(e.target.value); setPage(1); }} className="px-3 py-2 border rounded-lg text-sm">
            <option value="">全部狀態</option>
            <option value="draft">草稿</option>
            <option value="submitted">已提交</option>
          </select>
          <input type="date" value={filterDateFrom} onChange={e => { setFilterDateFrom(e.target.value); setPage(1); }} className="px-3 py-2 border rounded-lg text-sm" />
          <input type="date" value={filterDateTo} onChange={e => { setFilterDateTo(e.target.value); setPage(1); }} className="px-3 py-2 border rounded-lg text-sm" />
        </div>
      </div>

      <div className="bg-white rounded-lg shadow-sm border overflow-hidden">
        {loading ? (
          <div className="p-8 text-center text-gray-400">載入中...</div>
        ) : reports.length === 0 ? (
          <div className="p-8 text-center text-gray-400">暫無資料</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b">
                <tr>
                  <th className="px-4 py-3 text-left font-medium text-gray-600">報告日期</th>
                  <th className="px-4 py-3 text-left font-medium text-gray-600">驗收日期</th>
                  <th className="px-4 py-3 text-left font-medium text-gray-600">工程</th>
                  <th className="px-4 py-3 text-left font-medium text-gray-600">客戶</th>
                  <th className="px-4 py-3 text-left font-medium text-gray-600">收貨項目</th>
                  <th className="px-4 py-3 text-left font-medium text-gray-600">驗收人</th>
                  <th className="px-4 py-3 text-left font-medium text-gray-600">建立人</th>
                  <th className="px-4 py-3 text-left font-medium text-gray-600">狀態</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {reports.map(report => (
                  <tr key={report.id} className="hover:bg-gray-50 cursor-pointer transition-colors" onClick={() => setExpandedId(expandedId === report.id ? null : report.id)}>
                    <td className="px-4 py-3 whitespace-nowrap">{fmtDate(report.acceptance_report_date)}</td>
                    <td className="px-4 py-3 whitespace-nowrap">{fmtDate(report.acceptance_report_acceptance_date)}</td>
                    <td className="px-4 py-3">
                      <div className="font-medium">{report.acceptance_report_project_name}</div>
                      <div className="text-xs text-gray-400">{report.project?.project_no || ''}</div>
                    </td>
                    <td className="px-4 py-3">{report.acceptance_report_client_name}</td>
                    <td className="px-4 py-3 max-w-xs truncate">{report.acceptance_report_items}</td>
                    <td className="px-4 py-3">{report.inspector?.name_zh || '-'}</td>
                    <td className="px-4 py-3">{report.creator?.displayName || '-'}</td>
                    <td className="px-4 py-3">
                      <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium ${statusColors[report.acceptance_report_status] || 'badge-gray'}`}>
                        {statusLabels[report.acceptance_report_status] || report.acceptance_report_status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {totalPages > 1 && (
        <div className="flex items-center justify-between">
          <span className="text-sm text-gray-500">第 {page} / {totalPages} 頁</span>
          <div className="flex gap-2">
            <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page <= 1} className="px-3 py-1.5 border rounded-lg text-sm disabled:opacity-50">上一頁</button>
            <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page >= totalPages} className="px-3 py-1.5 border rounded-lg text-sm disabled:opacity-50">下一頁</button>
          </div>
        </div>
      )}
    </div>
  );
}
