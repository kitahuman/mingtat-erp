'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { dailyReportsApi, projectsApi, partnersApi, fieldOptionsApi } from '@/lib/api';
import { fmtDate } from '@/lib/dateUtils';

const statusLabels: Record<string, string> = { draft: '草稿', submitted: '已提交' };
const statusColors: Record<string, string> = { draft: 'badge-yellow', submitted: 'badge-green' };
const shiftLabels: Record<string, string> = { day: '日更', night: '夜更' };
const categoryLabels: Record<string, string> = { worker: '工人', vehicle: '車輛/機械', machinery: '車輛/機械', tool: '工具' };

export default function DailyReportsAdminPage() {
  const router = useRouter();
  const [reports, setReports] = useState<any[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [projects, setProjects] = useState<any[]>([]);
  const [partners, setPartners] = useState<any[]>([]);
  const [contractOptions, setContractOptions] = useState<string[]>([]);
  const [filterProjectId, setFilterProjectId] = useState('');
  const [filterClientId, setFilterClientId] = useState('');
  const [filterClientName, setFilterClientName] = useState('');
  const [filterContractNo, setFilterContractNo] = useState('');
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
      if (filterClientId) params.client_id = filterClientId;
      if (filterClientName) params.client_name = filterClientName;
      if (filterContractNo) params.client_contract_no = filterContractNo;
      if (filterStatus) params.status = filterStatus;
      if (filterDateFrom) params.date_from = filterDateFrom;
      if (filterDateTo) params.date_to = filterDateTo;
      if (search) params.search = search;
      const res = await dailyReportsApi.list(params);
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
    partnersApi.simple().then(res => setPartners(res.data || [])).catch(() => {});
    fieldOptionsApi.getByCategory('client_contract_no').then(res => {
      setContractOptions((res.data || []).filter((o: any) => o.is_active !== false).map((o: any) => o.label));
    }).catch(() => {});
  }, []);

  useEffect(() => {
    loadData();
  }, [page, filterProjectId, filterClientId, filterClientName, filterContractNo, filterStatus, filterDateFrom, filterDateTo, search]);

  const totalPages = Math.ceil(total / limit);

  const handleExport = (id: number) => {
    const apiBase = process.env.NEXT_PUBLIC_API_URL || '/api';
    window.open(`${apiBase}/daily-reports/${id}/export`, '_blank');
  };

  const handleClientChange = (val: string) => {
    setFilterClientId(val);
    if (val) { setFilterClientName(''); setPage(1); }
    else setPage(1);
  };

  const handleClientNameChange = (val: string) => {
    setFilterClientName(val);
    if (val) { setFilterClientId(''); }
    setPage(1);
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-800">工程日報管理</h1>
        <span className="text-sm text-gray-500">共 {total} 條記錄</span>
      </div>

      {/* Filters */}
      <div className="bg-white rounded-lg shadow-sm border p-4 space-y-3">
        {/* Row 1: search + status + date range */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
          <input
            type="text"
            value={search}
            onChange={e => { setSearch(e.target.value); setPage(1); }}
            placeholder="搜尋工作摘要/工程/客戶/合約..."
            className="px-3 py-2 border rounded-lg text-sm"
          />
          <select
            value={filterStatus}
            onChange={e => { setFilterStatus(e.target.value); setPage(1); }}
            className="px-3 py-2 border rounded-lg text-sm"
          >
            <option value="">全部狀態</option>
            <option value="draft">草稿</option>
            <option value="submitted">已提交</option>
          </select>
          <input
            type="date"
            value={filterDateFrom}
            onChange={e => { setFilterDateFrom(e.target.value); setPage(1); }}
            className="px-3 py-2 border rounded-lg text-sm"
          />
          <input
            type="date"
            value={filterDateTo}
            onChange={e => { setFilterDateTo(e.target.value); setPage(1); }}
            className="px-3 py-2 border rounded-lg text-sm"
          />
        </div>
        {/* Row 2: project + client + contract */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
          <select
            value={filterProjectId}
            onChange={e => { setFilterProjectId(e.target.value); setPage(1); }}
            className="px-3 py-2 border rounded-lg text-sm"
          >
            <option value="">全部工程</option>
            {projects.map((p: any) => (
              <option key={p.id} value={p.id}>{p.project_no} - {p.project_name}</option>
            ))}
          </select>
          <select
            value={filterClientId}
            onChange={e => handleClientChange(e.target.value)}
            className="px-3 py-2 border rounded-lg text-sm"
          >
            <option value="">全部客戶（選擇）</option>
            {partners.map((p: any) => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
          <input
            type="text"
            value={filterClientName}
            onChange={e => handleClientNameChange(e.target.value)}
            placeholder="客戶名稱搜尋"
            className="px-3 py-2 border rounded-lg text-sm"
          />
          <select
            value={filterContractNo}
            onChange={e => { setFilterContractNo(e.target.value); setPage(1); }}
            className="px-3 py-2 border rounded-lg text-sm"
          >
            <option value="">全部客戶合約</option>
            {contractOptions.map(c => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Table */}
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
                  <th className="px-4 py-3 text-left font-medium text-gray-600">日期</th>
                  <th className="px-4 py-3 text-left font-medium text-gray-600">工程</th>
                  <th className="px-4 py-3 text-left font-medium text-gray-600">工程地點</th>
                  <th className="px-4 py-3 text-left font-medium text-gray-600">客戶</th>
                  <th className="px-4 py-3 text-left font-medium text-gray-600">客戶合約</th>
                  <th className="px-4 py-3 text-left font-medium text-gray-600">更次</th>
                  <th className="px-4 py-3 text-left font-medium text-gray-600">項目數</th>
                  <th className="px-4 py-3 text-left font-medium text-gray-600">建立人</th>
                  <th className="px-4 py-3 text-left font-medium text-gray-600">狀態</th>
                  <th className="px-4 py-3 text-left font-medium text-gray-600">操作</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {reports.map(report => (
                  <>
                    <tr
                      key={report.id}
                      className="hover:bg-gray-50 cursor-pointer transition-colors"
                      onClick={() => setExpandedId(expandedId === report.id ? null : report.id)}
                    >
                      <td className="px-4 py-3 whitespace-nowrap">{fmtDate(report.daily_report_date)}</td>
                      <td className="px-4 py-3">
                        <div className="font-medium">{report.daily_report_project_name || report.project?.project_name || '-'}</div>
                        <div className="text-xs text-gray-400">{report.project?.project_no || ''}</div>
                      </td>
                      <td className="px-4 py-3 text-sm">{report.daily_report_project_location || '-'}</td>
                      <td className="px-4 py-3 text-sm">{report.daily_report_client_name || report.client?.name || '-'}</td>
                      <td className="px-4 py-3 text-sm text-gray-500">{report.daily_report_client_contract_no || '-'}</td>
                      <td className="px-4 py-3">{shiftLabels[report.daily_report_shift_type] || report.daily_report_shift_type}</td>
                      <td className="px-4 py-3">{report.items?.length || 0}</td>
                      <td className="px-4 py-3">{report.creator?.displayName || '-'}</td>
                      <td className="px-4 py-3">
                        <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium ${statusColors[report.daily_report_status] || 'badge-gray'}`}>
                          {statusLabels[report.daily_report_status] || report.daily_report_status}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-3">
                          <button
                            onClick={(e) => { e.stopPropagation(); router.push(`/daily-reports/${report.id}/edit`); }}
                            className="text-green-600 hover:text-green-800 text-xs font-medium"
                          >
                            編輯
                          </button>
                          <button
                            onClick={(e) => { e.stopPropagation(); handleExport(report.id); }}
                            className="text-blue-600 hover:text-blue-800 text-xs font-medium"
                          >
                            列印
                          </button>
                        </div>
                      </td>
                    </tr>
                    {expandedId === report.id && (
                      <tr key={`${report.id}-detail`}>
                        <td colSpan={9} className="px-4 py-4 bg-blue-50/50">
                          <div className="space-y-3">
                            <div className="grid grid-cols-2 gap-4">
                              {report.daily_report_client_contract_no && (
                                <div className="text-sm"><strong>客戶合約：</strong>{report.daily_report_client_contract_no}</div>
                              )}
                              {report.daily_report_project_location && (
                                <div className="text-sm"><strong>工程地點：</strong>{report.daily_report_project_location}</div>
                              )}
                            </div>
                            <div>
                              <h4 className="font-medium text-gray-700 mb-1">工作摘要</h4>
                              <p className="text-sm text-gray-600 whitespace-pre-wrap">{report.daily_report_work_summary}</p>
                            </div>
                            {report.items?.length > 0 && (
                              <div>
                                <h4 className="font-medium text-gray-700 mb-2">Labour and Plant</h4>
                                <table className="w-full text-xs border rounded-lg overflow-hidden">
                                  <thead className="bg-gray-100">
                                    <tr>
                                      <th className="px-2 py-1.5 text-left">類別</th>
                                      <th className="px-2 py-1.5 text-left">工種</th>
                                      <th className="px-2 py-1.5 text-left">內容</th>
                                      <th className="px-2 py-1.5 text-right">數量</th>
                                      <th className="px-2 py-1.5 text-right">中直</th>
                                      <th className="px-2 py-1.5 text-right">OT</th>
                                      <th className="px-2 py-1.5 text-left">員工/車牌</th>
                                    </tr>
                                  </thead>
                                  <tbody className="divide-y divide-gray-100">
                                    {report.items.map((item: any) => (
                                      <tr key={item.id}>
                                        <td className="px-2 py-1.5">{categoryLabels[item.daily_report_item_category] || item.daily_report_item_category}</td>
                                        <td className="px-2 py-1.5">{item.daily_report_item_worker_type || '-'}</td>
                                        <td className="px-2 py-1.5">{item.daily_report_item_content}</td>
                                        <td className="px-2 py-1.5 text-right">{item.daily_report_item_quantity || '-'}</td>
                                        <td className="px-2 py-1.5 text-right">{item.daily_report_item_shift_quantity || '-'}</td>
                                        <td className="px-2 py-1.5 text-right">{item.daily_report_item_ot_hours || '-'}</td>
                                        <td className="px-2 py-1.5">{item.daily_report_item_name_or_plate || '-'}</td>
                                      </tr>
                                    ))}
                                  </tbody>
                                </table>
                              </div>
                            )}
                            {report.daily_report_completed_work && (
                              <div>
                                <h4 className="font-medium text-gray-700 mb-1">完成的工作</h4>
                                <p className="text-sm text-gray-600 whitespace-pre-wrap">{report.daily_report_completed_work}</p>
                              </div>
                            )}
                            {report.daily_report_memo && (
                              <div>
                                <h4 className="font-medium text-gray-700 mb-1">備忘錄</h4>
                                <p className="text-sm text-gray-600 whitespace-pre-wrap">{report.daily_report_memo}</p>
                              </div>
                            )}
                            <div className="text-xs text-gray-400">
                              建立時間: {new Date(report.daily_report_created_at).toLocaleString('zh-HK')}
                              {report.daily_report_submitted_at && ` | 提交時間: ${new Date(report.daily_report_submitted_at).toLocaleString('zh-HK')}`}
                            </div>
                          </div>
                        </td>
                      </tr>
                    )}
                  </>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between">
          <span className="text-sm text-gray-500">第 {page} / {totalPages} 頁</span>
          <div className="flex gap-2">
            <button
              onClick={() => setPage(p => Math.max(1, p - 1))}
              disabled={page <= 1}
              className="px-3 py-1.5 border rounded-lg text-sm disabled:opacity-50"
            >
              上一頁
            </button>
            <button
              onClick={() => setPage(p => Math.min(totalPages, p + 1))}
              disabled={page >= totalPages}
              className="px-3 py-1.5 border rounded-lg text-sm disabled:opacity-50"
            >
              下一頁
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
