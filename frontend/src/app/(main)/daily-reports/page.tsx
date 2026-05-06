'use client';

import { useState, useEffect } from 'react';
import DateInput from '@/components/DateInput';
import { useRouter } from 'next/navigation';
import { dailyReportsApi, partnersApi, fieldOptionsApi, projectsApi } from '@/lib/api';
import { fmtDate } from '@/lib/dateUtils';
import SearchableSelect from '@/components/SearchableSelect';
import { useAuth } from '@/lib/auth';

const statusLabels: Record<string, string> = { draft: '草稿', submitted: '已提交' };
const statusColors: Record<string, string> = { draft: 'badge-yellow', submitted: 'badge-green' };
const shiftLabels: Record<string, string> = { day: '日更', night: '夜更' };
const categoryLabels: Record<string, string> = { worker: '工人', vehicle: '車輛/機械', machinery: '車輛/機械', tool: '工具' };

export default function DailyReportsAdminPage() {
  const router = useRouter();
  const { isReadOnly } = useAuth();
  const [reports, setReports] = useState<any[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);

  // Filter option lists
  const [projectNameOptions, setProjectNameOptions] = useState<{ value: string; label: string }[]>([]);
  const [partnerOptions, setPartnerOptions] = useState<{ value: string; label: string }[]>([]);
  const [contractOptions, setContractOptions] = useState<{ value: string; label: string }[]>([]);
  const statusOptions = [
    { value: 'draft', label: '草稿' },
    { value: 'submitted', label: '已提交' },
  ];

  // Filter state
  const [filterProjectName, setFilterProjectName] = useState<string | null>(null);
  // Client filter: value is "id:<id>" for partner or "name:<text>" for free-text
  const [filterClient, setFilterClient] = useState<string | null>(null);
  const [filterContractNo, setFilterContractNo] = useState<string | null>(null);
  const [filterStatus, setFilterStatus] = useState<string | null>(null);
  const [filterDateFrom, setFilterDateFrom] = useState('');
  const [filterDateTo, setFilterDateTo] = useState('');
  const [search, setSearch] = useState('');
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [sortBy, setSortBy] = useState('daily_report_date');
  const [sortOrder, setSortOrder] = useState('DESC');
  const limit = 20;

  // Batch edit state
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [showBatchModal, setShowBatchModal] = useState(false);
  const [batchProjectId, setBatchProjectId] = useState<string | null>(null);
  const [batchProjectLocation, setBatchProjectLocation] = useState('');
  const [batchClientId, setBatchClientId] = useState<string | null>(null);
  const [batchClientContractNo, setBatchClientContractNo] = useState<string | null>(null);
  const [batchFieldsEnabled, setBatchFieldsEnabled] = useState<{ project: boolean; location: boolean; client: boolean; contract: boolean }>({ project: false, location: false, client: false, contract: false });
  const [batchSubmitting, setBatchSubmitting] = useState(false);
  const [projectsList, setProjectsList] = useState<any[]>([]);

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
      if (filterProjectName) params.project_name = filterProjectName;
      if (filterClient) {
        if (filterClient.startsWith('id:')) {
          params.client_id = filterClient.slice(3);
        } else if (filterClient.startsWith('name:')) {
          params.client_name = filterClient.slice(5);
        }
      }
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
    // Load project names (distinct from daily_reports + projects table)
    dailyReportsApi.projectNames().then(res => {
      const names: string[] = res.data || [];
      setProjectNameOptions(names.map(n => ({ value: n, label: n })));
    }).catch(() => {});

    // Load partners for client filter
    partnersApi.simple().then(res => {
      const list: any[] = res.data || [];
      setPartnerOptions(list.map((p: any) => ({ value: `id:${p.id}`, label: p.name })));
    }).catch(() => {});

    // Load contract options from field_options
    fieldOptionsApi.getByCategory('client_contract_no').then(res => {
      const opts = (res.data || []).filter((o: any) => o.is_active !== false);
      setContractOptions(opts.map((o: any) => ({ value: o.label, label: o.label })));
    }).catch(() => {});

    // Load projects list for batch edit modal
    projectsApi.simple().then(res => setProjectsList(res.data || [])).catch(() => {});
  }, []);

  useEffect(() => {
    loadData();
  }, [page, filterProjectName, filterClient, filterContractNo, filterStatus, filterDateFrom, filterDateTo, search, sortBy, sortOrder]);

  const totalPages = Math.ceil(total / limit);

  const handleExport = (id: number) => {
    const apiBase = process.env.NEXT_PUBLIC_API_URL || '/api';
    window.open(`${apiBase}/daily-reports/${id}/export`, '_blank');
  };

  // Batch edit helpers
  const toggleSelect = (id: number) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };
  const toggleSelectAll = () => {
    const currentPageIds = reports.map(r => r.id);
    const allSelected = currentPageIds.every(id => selectedIds.has(id));
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (allSelected) currentPageIds.forEach(id => next.delete(id));
      else currentPageIds.forEach(id => next.add(id));
      return next;
    });
  };
  const openBatchModal = () => {
    setBatchProjectId(null);
    setBatchProjectLocation('');
    setBatchClientId(null);
    setBatchClientContractNo(null);
    setBatchFieldsEnabled({ project: false, location: false, client: false, contract: false });
    setShowBatchModal(true);
  };
  const submitBatchUpdate = async () => {
    if (selectedIds.size === 0) return;
    const { project, location, client, contract } = batchFieldsEnabled;
    if (!project && !location && !client && !contract) {
      alert('請至少勾選一個要修改的欄位');
      return;
    }
    const payload: any = { ids: Array.from(selectedIds) };
    if (project) {
      if (batchProjectId) {
        const p = projectsList.find((x: any) => String(x.id) === String(batchProjectId));
        payload.project_id = Number(batchProjectId);
        payload.project_name = p?.project_name || null;
      } else {
        payload.project_id = null;
        payload.project_name = null;
      }
    }
    if (location) {
      payload.project_location = batchProjectLocation || null;
    }
    if (client) {
      if (batchClientId) {
        const p = partnerOptions.find(o => o.value === `id:${batchClientId}`);
        payload.client_id = Number(batchClientId);
        payload.client_name = p?.label || null;
      } else {
        payload.client_id = null;
        payload.client_name = null;
      }
    }
    if (contract) {
      payload.client_contract_no = batchClientContractNo || null;
    }
    try {
      setBatchSubmitting(true);
      const res = await dailyReportsApi.batchUpdate(payload);
      alert(`成功更新 ${res.data?.updated ?? selectedIds.size} 筆日報`);
      setShowBatchModal(false);
      setSelectedIds(new Set());
      loadData();
    } catch (err: any) {
      alert(err?.response?.data?.message || '批量修改失敗，請重試');
    } finally {
      setBatchSubmitting(false);
    }
  };

  const handleDelete = async (e: React.MouseEvent, report: any) => {
    e.stopPropagation();
    const label = report.daily_report_project_name || `#${report.id}`;
    const confirmed = window.confirm(`確定要刪除日報表「${label}」（${report.daily_report_date?.split('T')[0] || ''}）？\n\n此操作不可復原。`);
    if (!confirmed) return;
    try {
      await dailyReportsApi.delete(report.id);
      loadData();
    } catch {
      alert('刪除失敗，請重試');
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-800">工程日報管理</h1>
        <div className="flex items-center gap-3">
          {!isReadOnly() && selectedIds.size > 0 && (
            <button
              onClick={openBatchModal}
              className="px-3 py-1.5 bg-blue-600 text-white rounded text-sm font-medium hover:bg-blue-700"
            >
              批量修改 ({selectedIds.size})
            </button>
          )}
          <span className="text-sm text-gray-500">共 {total} 條記錄</span>
        </div>
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
          <SearchableSelect
            value={filterStatus}
            onChange={val => { setFilterStatus(val as string | null); setPage(1); }}
            options={statusOptions}
            placeholder="全部狀態"
            className="text-sm"
          />
          <DateInput
            value={filterDateFrom}
            onChange={v => { setFilterDateFrom(v); setPage(1); }}
            className="px-3 py-2 border rounded-lg text-sm"
          />
          <DateInput
            value={filterDateTo}
            onChange={v => { setFilterDateTo(v); setPage(1); }}
            className="px-3 py-2 border rounded-lg text-sm"
          />
        </div>
        {/* Row 2: project + client + contract */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <SearchableSelect
            value={filterProjectName}
            onChange={val => { setFilterProjectName(val as string | null); setPage(1); }}
            options={projectNameOptions}
            placeholder="全部工程"
            className="text-sm"
          />
          <SearchableSelect
            value={filterClient}
            onChange={val => { setFilterClient(val as string | null); setPage(1); }}
            options={partnerOptions}
            placeholder="全部客戶"
            className="text-sm"
          />
          <SearchableSelect
            value={filterContractNo}
            onChange={val => { setFilterContractNo(val as string | null); setPage(1); }}
            options={contractOptions}
            placeholder="全部客戶合約"
            className="text-sm"
          />
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
                  {!isReadOnly() && (
                    <th className="px-3 py-3 w-10">
                      <input
                        type="checkbox"
                        checked={reports.length > 0 && reports.every(r => selectedIds.has(r.id))}
                        onChange={toggleSelectAll}
                        onClick={e => e.stopPropagation()}
                      />
                    </th>
                  )}
                  <th className="px-4 py-3 text-left font-medium text-gray-600 cursor-pointer select-none" onClick={() => handleSort('daily_report_date')}>日期<SortIcon field="daily_report_date" /></th>
                  <th className="px-4 py-3 text-left font-medium text-gray-600 cursor-pointer select-none" onClick={() => handleSort('daily_report_project_name')}>工程<SortIcon field="daily_report_project_name" /></th>
                  <th className="px-4 py-3 text-left font-medium text-gray-600 cursor-pointer select-none" onClick={() => handleSort('daily_report_project_location')}>工程地點<SortIcon field="daily_report_project_location" /></th>
                  <th className="px-4 py-3 text-left font-medium text-gray-600 cursor-pointer select-none" onClick={() => handleSort('daily_report_client_name')}>客戶<SortIcon field="daily_report_client_name" /></th>
                  <th className="px-4 py-3 text-left font-medium text-gray-600 cursor-pointer select-none" onClick={() => handleSort('daily_report_client_contract_no')}>客戶合約<SortIcon field="daily_report_client_contract_no" /></th>
                  <th className="px-4 py-3 text-left font-medium text-gray-600 cursor-pointer select-none" onClick={() => handleSort('daily_report_shift_type')}>更次<SortIcon field="daily_report_shift_type" /></th>
                  <th className="px-4 py-3 text-left font-medium text-gray-600">項目數</th>
                  <th className="px-4 py-3 text-left font-medium text-gray-600">建立人</th>
                  <th className="px-4 py-3 text-left font-medium text-gray-600 cursor-pointer select-none" onClick={() => handleSort('daily_report_status')}>狀態<SortIcon field="daily_report_status" /></th>
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
                      {!isReadOnly() && (
                        <td className="px-3 py-3 w-10" onClick={e => e.stopPropagation()}>
                          <input
                            type="checkbox"
                            checked={selectedIds.has(report.id)}
                            onChange={() => toggleSelect(report.id)}
                          />
                        </td>
                      )}
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
                          <button
                            onClick={(e) => handleDelete(e, report)}
                            className="text-red-500 hover:text-red-700 text-xs font-medium"
                            title="刪除"
                          >
                            刪除
                          </button>
                        </div>
                      </td>
                    </tr>
                    {expandedId === report.id && (
                      <tr key={`${report.id}-detail`}>
                        <td colSpan={isReadOnly() ? 10 : 11} className="px-4 py-4 bg-blue-50/50">
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
                                <h4 className="font-medium text-gray-700 mb-2">日報項目</h4>
                                <div className="space-y-1">
                                  {report.items.map((item: any) => (
                                    <div key={item.id} className="flex items-center gap-3 text-sm bg-white rounded px-3 py-1.5 border border-gray-100">
                                      <span className="text-xs text-gray-400 w-16 shrink-0">{categoryLabels[item.daily_report_item_category] || item.daily_report_item_category}</span>
                                      <span className="font-medium">{item.daily_report_item_content}</span>
                                      {item.daily_report_item_name_or_plate && (
                                        <span className="text-gray-500">({item.daily_report_item_name_or_plate})</span>
                                      )}
                                      {item.daily_report_item_quantity != null && (
                                        <span className="text-blue-600">×{item.daily_report_item_quantity}</span>
                                      )}
                                      {item.daily_report_item_ot_hours != null && item.daily_report_item_ot_hours > 0 && (
                                        <span className="text-orange-500 text-xs">OT {item.daily_report_item_ot_hours}h</span>
                                      )}
                                    </div>
                                  ))}
                                </div>
                              </div>
                            )}
                            {report.attachments?.length > 0 && (
                              <div>
                                <h4 className="font-medium text-gray-700 mb-2">附件</h4>
                                <div className="flex flex-wrap gap-2">
                                  {report.attachments.map((att: any) => (
                                    <a
                                      key={att.id}
                                      href={att.daily_report_attachment_url}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      className="text-xs text-blue-600 hover:underline bg-blue-50 px-2 py-1 rounded"
                                    >
                                      {att.daily_report_attachment_name || '附件'}
                                    </a>
                                  ))}
                                </div>
                              </div>
                            )}
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
        <div className="flex justify-center items-center gap-2">
          <button
            onClick={() => setPage(p => Math.max(1, p - 1))}
            disabled={page === 1}
            className="px-3 py-1 border rounded text-sm disabled:opacity-40"
          >
            上一頁
          </button>
          <span className="text-sm text-gray-600">{page} / {totalPages}</span>
          <button
            onClick={() => setPage(p => Math.min(totalPages, p + 1))}
            disabled={page === totalPages}
            className="px-3 py-1 border rounded text-sm disabled:opacity-40"
          >
            下一頁
          </button>
        </div>
      )}

      {/* Batch Edit Modal */}
      {showBatchModal && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" onClick={() => !batchSubmitting && setShowBatchModal(false)}>
          <div className="bg-white rounded-lg shadow-xl w-full max-w-lg" onClick={e => e.stopPropagation()}>
            <div className="px-5 py-4 border-b flex items-center justify-between">
              <h3 className="font-semibold text-gray-800">批量修改日報</h3>
              <button className="text-gray-400 hover:text-gray-600" onClick={() => !batchSubmitting && setShowBatchModal(false)}>✕</button>
            </div>
            <div className="px-5 py-4 space-y-4">
              <div className="text-sm text-gray-600 bg-blue-50 border border-blue-200 rounded p-3">
                已選中 <strong>{selectedIds.size}</strong> 筆日報；只會修改下方勾選的欄位，其他欄位維持不變。已提交的日報會被阻擋。
              </div>

              {/* Project */}
              <div className="space-y-1">
                <label className="flex items-center gap-2 text-sm font-medium text-gray-700">
                  <input type="checkbox" checked={batchFieldsEnabled.project} onChange={e => setBatchFieldsEnabled(s => ({ ...s, project: e.target.checked }))} />
                  修改工程
                </label>
                {batchFieldsEnabled.project && (
                  <SearchableSelect
                    value={batchProjectId}
                    onChange={val => setBatchProjectId(val as string | null)}
                    options={projectsList.map((p: any) => ({ value: String(p.id), label: `${p.project_no || ''} - ${p.project_name}` }))}
                    placeholder="選擇工程（或留空清除）"
                    className="text-sm"
                  />
                )}
              </div>

              {/* Project location */}
              <div className="space-y-1">
                <label className="flex items-center gap-2 text-sm font-medium text-gray-700">
                  <input type="checkbox" checked={batchFieldsEnabled.location} onChange={e => setBatchFieldsEnabled(s => ({ ...s, location: e.target.checked }))} />
                  修改工程地點
                </label>
                {batchFieldsEnabled.location && (
                  <input
                    type="text"
                    value={batchProjectLocation}
                    onChange={e => setBatchProjectLocation(e.target.value)}
                    placeholder="輸入工程地點（或留空清除）"
                    className="w-full px-3 py-2 border rounded-lg text-sm"
                  />
                )}
              </div>

              {/* Client */}
              <div className="space-y-1">
                <label className="flex items-center gap-2 text-sm font-medium text-gray-700">
                  <input type="checkbox" checked={batchFieldsEnabled.client} onChange={e => setBatchFieldsEnabled(s => ({ ...s, client: e.target.checked }))} />
                  修改客戶
                </label>
                {batchFieldsEnabled.client && (
                  <SearchableSelect
                    value={batchClientId}
                    onChange={val => setBatchClientId(val as string | null)}
                    options={partnerOptions.map(o => ({ value: o.value.replace('id:', ''), label: o.label }))}
                    placeholder="選擇客戶（或留空清除）"
                    className="text-sm"
                  />
                )}
              </div>

              {/* Contract */}
              <div className="space-y-1">
                <label className="flex items-center gap-2 text-sm font-medium text-gray-700">
                  <input type="checkbox" checked={batchFieldsEnabled.contract} onChange={e => setBatchFieldsEnabled(s => ({ ...s, contract: e.target.checked }))} />
                  修改客戶合約
                </label>
                {batchFieldsEnabled.contract && (
                  <SearchableSelect
                    value={batchClientContractNo}
                    onChange={val => setBatchClientContractNo(val as string | null)}
                    options={contractOptions}
                    placeholder="選擇客戶合約（或留空清除）"
                    className="text-sm"
                  />
                )}
              </div>
            </div>
            <div className="px-5 py-3 border-t flex items-center justify-end gap-2 bg-gray-50">
              <button
                onClick={() => setShowBatchModal(false)}
                disabled={batchSubmitting}
                className="px-3 py-1.5 border rounded text-sm hover:bg-gray-100 disabled:opacity-50"
              >取消</button>
              <button
                onClick={submitBatchUpdate}
                disabled={batchSubmitting}
                className="px-3 py-1.5 bg-blue-600 text-white rounded text-sm font-medium hover:bg-blue-700 disabled:opacity-50"
              >{batchSubmitting ? '提交中...' : '確認修改'}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
