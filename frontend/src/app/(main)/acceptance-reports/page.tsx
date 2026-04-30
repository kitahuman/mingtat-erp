'use client';

import { useState, useEffect } from 'react';
import { acceptanceReportsApi, projectsApi, partnersApi, fieldOptionsApi } from '@/lib/api';
import { fmtDate } from '@/lib/dateUtils';
import { useAuth } from '@/lib/auth';

const statusLabels: Record<string, string> = { draft: '草稿', submitted: '已提交' };
const statusColors: Record<string, string> = { draft: 'badge-yellow', submitted: 'badge-green' };

export default function AcceptanceReportsAdminPage() {
  const { isReadOnly } = useAuth();
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
  const [sortBy, setSortBy] = useState('acceptance_report_date');
  const [sortOrder, setSortOrder] = useState('DESC');
  const limit = 20;

  const handleSort = (field: string) => {
    if (sortBy === field) {
      setSortOrder(o => o === 'ASC' ? 'DESC' : 'ASC');
    } else {
      setSortBy(field);
      setSortOrder('DESC');
    }
    setPage(1);
  };
  const SortIcon = ({ field }: { field: string }) => (
    <span className="ml-1 text-gray-400">{sortBy === field ? (sortOrder === 'ASC' ? '↑' : '↓') : '↕'}</span>
  );

  const loadData = async () => {
    try {
      setLoading(true);
      const params: any = { page, limit, sortBy, sortOrder };
      if (filterProjectId) params.project_id = filterProjectId;
      if (filterClientId) params.client_id = filterClientId;
      if (filterClientName) params.client_name = filterClientName;
      if (filterContractNo) params.client_contract_no = filterContractNo;
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
    partnersApi.simple().then(res => setPartners(res.data || [])).catch(() => {});
    fieldOptionsApi.getByCategory('client_contract_no').then(res => {
      setContractOptions((res.data || []).filter((o: any) => o.is_active !== false).map((o: any) => o.label));
    }).catch(() => {});
  }, []);

  useEffect(() => {
    loadData();
  }, [page, filterProjectId, filterClientId, filterClientName, filterContractNo, filterStatus, filterDateFrom, filterDateTo, search, sortBy, sortOrder]);

  const totalPages = Math.ceil(total / limit);

  const handleExport = (id: number) => {
    const apiBase = process.env.NEXT_PUBLIC_API_URL || '/api';
    window.open(`${apiBase}/acceptance-reports/${id}/export`, '_blank');
  };

  const handleClientChange = (val: string) => {
    setFilterClientId(val);
    if (val) { setFilterClientName(''); }
    setPage(1);
  };

  const handleClientNameChange = (val: string) => {
    setFilterClientName(val);
    if (val) { setFilterClientId(''); }
    setPage(1);
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-800">工程收貨報告管理</h1>
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
            placeholder="搜尋工程/客戶/合約..."
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
                  <th className="px-4 py-3 text-left font-medium text-gray-600 cursor-pointer select-none" onClick={() => handleSort('acceptance_report_date')}>報告日期<SortIcon field="acceptance_report_date" /></th>
                  <th className="px-4 py-3 text-left font-medium text-gray-600">驗收日期</th>
                  <th className="px-4 py-3 text-left font-medium text-gray-600 cursor-pointer select-none" onClick={() => handleSort('acceptance_report_project_name')}>工程<SortIcon field="acceptance_report_project_name" /></th>
                  <th className="px-4 py-3 text-left font-medium text-gray-600 cursor-pointer select-none" onClick={() => handleSort('acceptance_report_client_name')}>客戶<SortIcon field="acceptance_report_client_name" /></th>
                  <th className="px-4 py-3 text-left font-medium text-gray-600 cursor-pointer select-none" onClick={() => handleSort('acceptance_report_client_contract_no')}>客戶合約<SortIcon field="acceptance_report_client_contract_no" /></th>
                  <th className="px-4 py-3 text-left font-medium text-gray-600">收貨項目</th>
                  <th className="px-4 py-3 text-left font-medium text-gray-600">驗收人</th>
                  <th className="px-4 py-3 text-left font-medium text-gray-600">建立人</th>
                  <th className="px-4 py-3 text-left font-medium text-gray-600 cursor-pointer select-none" onClick={() => handleSort('acceptance_report_status')}>狀態<SortIcon field="acceptance_report_status" /></th>
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
                      <td className="px-4 py-3 whitespace-nowrap">{fmtDate(report.acceptance_report_date)}</td>
                      <td className="px-4 py-3 whitespace-nowrap">{fmtDate(report.acceptance_report_acceptance_date)}</td>
                      <td className="px-4 py-3">
                        <div className="font-medium">{report.acceptance_report_project_name || report.project?.project_name || '-'}</div>
                        <div className="text-xs text-gray-400">{report.project?.project_no || ''}</div>
                      </td>
                      <td className="px-4 py-3 text-sm">{report.acceptance_report_client_name || report.client?.name || '-'}</td>
                      <td className="px-4 py-3 text-sm text-gray-500">{report.acceptance_report_client_contract_no || '-'}</td>
                      <td className="px-4 py-3 max-w-xs truncate">
                        {report.acceptance_items?.length > 0
                          ? `${report.acceptance_items.length} 個項目`
                          : report.acceptance_report_items || '-'}
                      </td>
                      <td className="px-4 py-3">{report.acceptance_report_mingtat_inspector_name || report.inspector?.name_zh || '-'}</td>
                      <td className="px-4 py-3">{report.creator?.displayName || '-'}</td>
                      <td className="px-4 py-3">
                        <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium ${statusColors[report.acceptance_report_status] || 'badge-gray'}`}>
                          {statusLabels[report.acceptance_report_status] || report.acceptance_report_status}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <button
                          onClick={(e) => { e.stopPropagation(); handleExport(report.id); }}
                          className="text-blue-600 hover:text-blue-800 text-xs font-medium"
                        >
                          列印
                        </button>
                      </td>
                    </tr>
                    {expandedId === report.id && (
                      <tr key={`${report.id}-detail`}>
                        <td colSpan={10} className="px-4 py-4 bg-blue-50/50">
                          <div className="space-y-3">
                            {report.acceptance_report_site_address && (
                              <div className="text-sm"><strong>地盤地址：</strong>{report.acceptance_report_site_address}</div>
                            )}
                            {/* Dynamic items */}
                            {report.acceptance_items?.length > 0 && (
                              <div>
                                <h4 className="font-medium text-gray-700 mb-2">收貨項目</h4>
                                <table className="w-full text-xs border rounded-lg overflow-hidden">
                                  <thead className="bg-gray-100">
                                    <tr>
                                      <th className="px-2 py-1.5 text-left">#</th>
                                      <th className="px-2 py-1.5 text-left">項目描述</th>
                                      <th className="px-2 py-1.5 text-left">數量/單位</th>
                                    </tr>
                                  </thead>
                                  <tbody className="divide-y divide-gray-100">
                                    {report.acceptance_items.map((item: any, idx: number) => (
                                      <tr key={item.id}>
                                        <td className="px-2 py-1.5">{idx + 1}</td>
                                        <td className="px-2 py-1.5">{item.acceptance_report_item_description}</td>
                                        <td className="px-2 py-1.5">{item.acceptance_report_item_quantity_unit || '-'}</td>
                                      </tr>
                                    ))}
                                  </tbody>
                                </table>
                              </div>
                            )}
                            {!report.acceptance_items?.length && report.acceptance_report_items && (
                              <div>
                                <h4 className="font-medium text-gray-700 mb-1">收貨項目</h4>
                                <p className="text-sm text-gray-600 whitespace-pre-wrap">{report.acceptance_report_items}</p>
                              </div>
                            )}
                            <div>
                              <h4 className="font-medium text-gray-700 mb-1">驗收人員</h4>
                              <div className="text-sm text-gray-600">
                                <div>明達方：{report.acceptance_report_mingtat_inspector_name || report.inspector?.name_zh || '-'} ({report.acceptance_report_mingtat_inspector_title || '-'})</div>
                                <div>客戶方：{report.acceptance_report_client_inspector_name || '-'} ({report.acceptance_report_client_inspector_title || '-'})</div>
                              </div>
                            </div>
                            {report.acceptance_report_supplementary_notes && (
                              <div>
                                <h4 className="font-medium text-gray-700 mb-1">補充說明</h4>
                                <p className="text-sm text-gray-600 whitespace-pre-wrap">{report.acceptance_report_supplementary_notes}</p>
                              </div>
                            )}
                            <div className="text-xs text-gray-400">
                              建立時間: {new Date(report.acceptance_report_created_at).toLocaleString('zh-HK')}
                              {report.acceptance_report_submitted_at && ` | 提交時間: ${new Date(report.acceptance_report_submitted_at).toLocaleString('zh-HK')}`}
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
