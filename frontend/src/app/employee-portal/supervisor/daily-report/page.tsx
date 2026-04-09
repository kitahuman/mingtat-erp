'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useI18n } from '@/lib/i18n/i18n-context';
import { employeePortalApi, portalSharedApi } from '@/lib/employee-portal-api';

const statusLabels: Record<string, string> = { draft: '草稿', submitted: '已提交' };
const statusColors: Record<string, string> = { draft: 'bg-yellow-100 text-yellow-700', submitted: 'bg-green-100 text-green-700' };
const shiftLabels: Record<string, string> = { day: '日更', night: '夜更' };

export default function DailyReportListPage() {
  const { t } = useI18n();
  const [reports, setReports] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [projects, setProjects] = useState<any[]>([]);
  const [filterProjectId, setFilterProjectId] = useState('');
  const [filterDateFrom, setFilterDateFrom] = useState('');
  const [filterDateTo, setFilterDateTo] = useState('');

  const loadReports = async () => {
    try {
      setLoading(true);
      const params: any = { limit: 50 };
      if (filterProjectId) params.project_id = filterProjectId;
      if (filterDateFrom) params.date_from = filterDateFrom;
      if (filterDateTo) params.date_to = filterDateTo;
      const res = await employeePortalApi.getMyDailyReports(params);
      setReports(res.data?.data || []);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    portalSharedApi.getProjectsSimple().then(res => setProjects(res.data || [])).catch(() => {});
    loadReports();
  }, []);

  useEffect(() => {
    loadReports();
  }, [filterProjectId, filterDateFrom, filterDateTo]);

  const fmtDate = (d: string) => {
    if (!d) return '-';
    return new Date(d).toLocaleDateString('zh-HK');
  };

  return (
    <div className="p-4 space-y-4 max-w-md mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Link href="/employee-portal/supervisor" className="text-blue-600 flex items-center gap-1">
            <span>‹</span> {t('back')}
          </Link>
          <h1 className="text-xl font-bold text-gray-800 ml-2">工程日報</h1>
        </div>
        <Link
          href="/employee-portal/supervisor/daily-report/new"
          className="bg-blue-600 text-white px-4 py-2 rounded-xl text-sm font-bold shadow-md active:scale-95 transition-all"
        >
          + 新增
        </Link>
      </div>

      {/* Filters */}
      <div className="bg-white rounded-2xl p-3 shadow-sm border border-gray-100 space-y-2">
        <select
          value={filterProjectId}
          onChange={e => setFilterProjectId(e.target.value)}
          className="w-full px-3 py-2 rounded-xl border border-gray-200 text-sm bg-gray-50"
        >
          <option value="">全部工程</option>
          {projects.map((p: any) => (
            <option key={p.id} value={p.id}>{p.project_no} - {p.project_name}</option>
          ))}
        </select>
        <div className="flex gap-2">
          <input
            type="date"
            value={filterDateFrom}
            onChange={e => setFilterDateFrom(e.target.value)}
            className="flex-1 px-3 py-2 rounded-xl border border-gray-200 text-sm bg-gray-50"
            placeholder="開始日期"
          />
          <input
            type="date"
            value={filterDateTo}
            onChange={e => setFilterDateTo(e.target.value)}
            className="flex-1 px-3 py-2 rounded-xl border border-gray-200 text-sm bg-gray-50"
            placeholder="結束日期"
          />
        </div>
      </div>

      {/* List */}
      {loading ? (
        <div className="text-center py-10 text-gray-400">{t('loading')}</div>
      ) : reports.length === 0 ? (
        <div className="bg-gray-50 rounded-2xl p-10 text-center border border-dashed border-gray-300">
          <p className="text-gray-500">暫無日報記錄</p>
        </div>
      ) : (
        <div className="space-y-3">
          {reports.map(report => (
            <Link
              key={report.id}
              href={`/employee-portal/supervisor/daily-report/${report.id}`}
              className="block bg-white rounded-2xl p-4 border border-gray-100 shadow-sm active:scale-[0.98] transition-all"
            >
              <div className="flex items-start justify-between mb-2">
                <div className="flex-1 min-w-0">
                  <p className="font-bold text-gray-800 truncate">
                    {report.project?.project_name || '-'}
                  </p>
                  <p className="text-xs text-gray-500 mt-0.5">
                    {report.project?.project_no || '-'}
                  </p>
                </div>
                <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${statusColors[report.daily_report_status] || 'bg-gray-100 text-gray-600'}`}>
                  {statusLabels[report.daily_report_status] || report.daily_report_status}
                </span>
              </div>
              <div className="flex items-center gap-3 text-xs text-gray-500">
                <span>{fmtDate(report.daily_report_date)}</span>
                <span className="bg-gray-100 px-2 py-0.5 rounded-full">{shiftLabels[report.daily_report_shift_type] || report.daily_report_shift_type}</span>
                <span>{report.items?.length || 0} 項</span>
              </div>
              <p className="text-sm text-gray-600 mt-2 line-clamp-2">{report.daily_report_work_summary}</p>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
