'use client';

import { useState, useEffect, useCallback } from 'react';
import { dailyReportStatsApi, projectsApi, partnersApi, fieldOptionsApi } from '@/lib/api';
import ExportButton from '@/components/ExportButton';

const categoryLabels: Record<string, string> = {
  worker: '工人',
  vehicle: '車輛',
  machinery: '機械',
  tool: '工具',
};

const shiftLabels: Record<string, string> = { day: '日更', night: '夜更' };

function fmtNum(v: number | null | undefined): string {
  if (v === null || v === undefined || v === 0) return '-';
  return Number(v).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 2 });
}

function fmtDate(d: string | null | undefined): string {
  if (!d) return '-';
  const m = String(d).match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return `${m[3]}/${m[2]}/${m[1]}`;
  return d;
}

export default function DailyReportStatsPage() {
  // Filter state
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [filterProjectId, setFilterProjectId] = useState('');
  const [filterClientId, setFilterClientId] = useState('');
  const [filterClientName, setFilterClientName] = useState('');
  const [filterContractNo, setFilterContractNo] = useState('');
  const [filterStatus, setFilterStatus] = useState('submitted');

  // Data state
  const [data, setData] = useState<any[]>([]);
  const [totals, setTotals] = useState<any>({});
  const [loading, setLoading] = useState(false);
  const [expandedProjects, setExpandedProjects] = useState<Set<string>>(new Set());
  const [expandedDays, setExpandedDays] = useState<Set<string>>(new Set());

  // Reference data
  const [projects, setProjects] = useState<any[]>([]);
  const [partners, setPartners] = useState<any[]>([]);
  const [contractOptions, setContractOptions] = useState<string[]>([]);

  // Load reference data
  useEffect(() => {
    projectsApi.simple().then(res => setProjects(res.data || [])).catch(() => {});
    partnersApi.simple().then(res => setPartners(res.data || [])).catch(() => {});
    fieldOptionsApi.getByCategory('client_contract_no').then(res => {
      setContractOptions((res.data || []).filter((o: any) => o.is_active !== false).map((o: any) => o.label));
    }).catch(() => {});
  }, []);

  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      const params: any = {};
      if (dateFrom) params.date_from = dateFrom;
      if (dateTo) params.date_to = dateTo;
      if (filterProjectId) params.project_id = filterProjectId;
      if (filterClientId) params.client_id = filterClientId;
      if (filterClientName) params.client_name = filterClientName;
      if (filterContractNo) params.client_contract_no = filterContractNo;
      if (filterStatus) params.status = filterStatus;

      const res = await dailyReportStatsApi.getStats(params);
      setData(res.data?.data || []);
      setTotals(res.data?.totals || {});
    } catch (err) {
      console.error('Failed to load stats:', err);
    } finally {
      setLoading(false);
    }
  }, [dateFrom, dateTo, filterProjectId, filterClientId, filterClientName, filterContractNo, filterStatus]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const toggleProject = (key: string) => {
    setExpandedProjects(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const toggleDay = (key: string) => {
    setExpandedDays(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const handleClientChange = (val: string) => {
    setFilterClientId(val);
    if (val) setFilterClientName('');
  };

  const handleClientNameChange = (val: string) => {
    setFilterClientName(val);
    if (val) setFilterClientId('');
  };

  // Export columns for flat data
  const exportColumns = [
    { key: 'date', label: '日期' },
    { key: 'project_no', label: '工程編號' },
    { key: 'project_name', label: '工程名稱' },
    { key: 'client_name', label: '客戶' },
    { key: 'client_contract_no', label: '客戶合約' },
    { key: 'shift_type', label: '更次', exportRender: (v: any) => shiftLabels[v] || v },
    { key: 'creator', label: '建立人' },
    { key: 'category', label: '類別', exportRender: (v: any) => categoryLabels[v] || v },
    { key: 'worker_type', label: '工種' },
    { key: 'content', label: '內容' },
    { key: 'quantity', label: '數量' },
    { key: 'shift_quantity', label: '中直' },
    { key: 'ot_hours', label: 'OT 時數' },
    { key: 'name_or_plate', label: '員工/車牌' },
  ];

  const fetchExportData = async (): Promise<any[]> => {
    const params: any = {};
    if (dateFrom) params.date_from = dateFrom;
    if (dateTo) params.date_to = dateTo;
    if (filterProjectId) params.project_id = filterProjectId;
    if (filterClientId) params.client_id = filterClientId;
    if (filterClientName) params.client_name = filterClientName;
    if (filterContractNo) params.client_contract_no = filterContractNo;
    if (filterStatus) params.status = filterStatus;

    const res = await dailyReportStatsApi.getExportData(params);
    return res.data || [];
  };

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-800">日報統計</h1>
          <p className="text-sm text-gray-500 mt-1">按工程彙總日報資源用量，支援展開查看每日明細</p>
        </div>
        <ExportButton
          columns={exportColumns}
          data={[]}
          filename={`日報統計_${dateFrom || 'all'}_${dateTo || 'all'}`}
          onFetchAll={fetchExportData}
        />
      </div>

      {/* Filters */}
      <div className="bg-white rounded-lg shadow-sm border p-4 space-y-3">
        <div className="grid grid-cols-1 md:grid-cols-5 gap-3">
          <div>
            <label className="block text-xs text-gray-500 mb-1">開始日期</label>
            <input
              type="date"
              value={dateFrom}
              onChange={e => setDateFrom(e.target.value)}
              className="w-full px-3 py-2 border rounded-lg text-sm"
            />
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">結束日期</label>
            <input
              type="date"
              value={dateTo}
              onChange={e => setDateTo(e.target.value)}
              className="w-full px-3 py-2 border rounded-lg text-sm"
            />
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">工程</label>
            <select
              value={filterProjectId}
              onChange={e => setFilterProjectId(e.target.value)}
              className="w-full px-3 py-2 border rounded-lg text-sm"
            >
              <option value="">全部工程</option>
              {projects.map((p: any) => (
                <option key={p.id} value={p.id}>{p.project_no} - {p.project_name}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">客戶</label>
            <select
              value={filterClientId}
              onChange={e => handleClientChange(e.target.value)}
              className="w-full px-3 py-2 border rounded-lg text-sm"
            >
              <option value="">全部客戶</option>
              {partners.map((p: any) => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">客戶合約</label>
            <select
              value={filterContractNo}
              onChange={e => setFilterContractNo(e.target.value)}
              className="w-full px-3 py-2 border rounded-lg text-sm"
            >
              <option value="">全部合約</option>
              {contractOptions.map(c => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          </div>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-5 gap-3">
          <div>
            <label className="block text-xs text-gray-500 mb-1">客戶名稱搜尋</label>
            <input
              type="text"
              value={filterClientName}
              onChange={e => handleClientNameChange(e.target.value)}
              placeholder="輸入客戶名稱..."
              className="w-full px-3 py-2 border rounded-lg text-sm"
            />
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">狀態</label>
            <select
              value={filterStatus}
              onChange={e => setFilterStatus(e.target.value)}
              className="w-full px-3 py-2 border rounded-lg text-sm"
            >
              <option value="submitted">已提交</option>
              <option value="draft">草稿</option>
              <option value="">全部</option>
            </select>
          </div>
        </div>
      </div>

      {/* Summary Cards */}
      {totals.total_reports > 0 && (
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-3">
          <SummaryCard label="工程數" value={totals.total_projects} />
          <SummaryCard label="日報數" value={totals.total_reports} />
          <SummaryCard label="工人總人次" value={fmtNum(totals.total_worker_quantity)} />
          <SummaryCard label="工人 OT 總時數" value={fmtNum(totals.total_worker_ot_hours)} />
          <SummaryCard label="工人中直總數" value={fmtNum(totals.total_worker_shift_quantity)} />
          <SummaryCard label="車輛總用量" value={fmtNum(totals.total_vehicle_quantity)} />
          <SummaryCard label="車輛 OT 總時數" value={fmtNum(totals.total_vehicle_ot_hours)} />
          <SummaryCard label="機械總用量" value={fmtNum(totals.total_machinery_quantity)} />
          <SummaryCard label="機械 OT 總時數" value={fmtNum(totals.total_machinery_ot_hours)} />
        </div>
      )}

      {/* Main Table */}
      <div className="bg-white rounded-lg shadow-sm border overflow-hidden">
        {loading ? (
          <div className="p-8 text-center text-gray-400">
            <div className="inline-block animate-spin rounded-full h-6 w-6 border-b-2 border-blue-600 mr-2"></div>
            載入中...
          </div>
        ) : data.length === 0 ? (
          <div className="p-8 text-center text-gray-400">
            暫無資料，請調整篩選條件
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b">
                <tr>
                  <th className="px-4 py-3 text-left font-medium text-gray-600 w-8"></th>
                  <th className="px-4 py-3 text-left font-medium text-gray-600">工程編號</th>
                  <th className="px-4 py-3 text-left font-medium text-gray-600">工程名稱</th>
                  <th className="px-4 py-3 text-left font-medium text-gray-600">客戶</th>
                  <th className="px-4 py-3 text-left font-medium text-gray-600">客戶合約</th>
                  <th className="px-4 py-3 text-center font-medium text-gray-600">日報數</th>
                  <th className="px-4 py-3 text-left font-medium text-gray-600">日期範圍</th>
                  <th className="px-4 py-3 text-center font-medium text-gray-600">資源項目數</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {data.map((group: any) => {
                  const projectKey = group.project_id ? String(group.project_id) : `u_${group.project_name}`;
                  const isExpanded = expandedProjects.has(projectKey);

                  return (
                    <ProjectRow
                      key={projectKey}
                      group={group}
                      projectKey={projectKey}
                      isExpanded={isExpanded}
                      expandedDays={expandedDays}
                      onToggleProject={() => toggleProject(projectKey)}
                      onToggleDay={toggleDay}
                    />
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

/* ── Summary Card ──────────────────────────────────────────── */
function SummaryCard({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="bg-white rounded-lg shadow-sm border p-4">
      <div className="text-xs text-gray-500 mb-1">{label}</div>
      <div className="text-xl font-bold text-gray-800">{value}</div>
    </div>
  );
}

/* ── Project Row (with expand) ─────────────────────────────── */
function ProjectRow({
  group,
  projectKey,
  isExpanded,
  expandedDays,
  onToggleProject,
  onToggleDay,
}: {
  group: any;
  projectKey: string;
  isExpanded: boolean;
  expandedDays: Set<string>;
  onToggleProject: () => void;
  onToggleDay: (key: string) => void;
}) {
  // Categorize summary items
  const workers = group.summary.filter((s: any) => s.category === 'worker');
  const vehicles = group.summary.filter((s: any) => s.category === 'vehicle');
  const machinery = group.summary.filter((s: any) => s.category === 'machinery');
  const tools = group.summary.filter((s: any) => s.category === 'tool');

  return (
    <>
      {/* Project header row */}
      <tr
        className="hover:bg-gray-50 cursor-pointer transition-colors"
        onClick={onToggleProject}
      >
        <td className="px-4 py-3">
          <span className={`inline-block transition-transform ${isExpanded ? 'rotate-90' : ''}`}>
            ▶
          </span>
        </td>
        <td className="px-4 py-3 font-medium text-blue-700">{group.project_no}</td>
        <td className="px-4 py-3 font-medium">{group.project_name}</td>
        <td className="px-4 py-3 text-sm text-gray-600">{group.client_name}</td>
        <td className="px-4 py-3 text-sm text-gray-500">{group.client_contract_no}</td>
        <td className="px-4 py-3 text-center">
          <span className="inline-block bg-blue-100 text-blue-800 px-2 py-0.5 rounded-full text-xs font-medium">
            {group.report_count}
          </span>
        </td>
        <td className="px-4 py-3 text-sm text-gray-500">
          {fmtDate(group.date_range?.from)} ~ {fmtDate(group.date_range?.to)}
        </td>
        <td className="px-4 py-3 text-center text-sm">{group.summary.length}</td>
      </tr>

      {/* Expanded: Summary + Daily Details */}
      {isExpanded && (
        <tr>
          <td colSpan={8} className="px-0 py-0">
            <div className="bg-blue-50/40 border-t border-b border-blue-100">
              {/* Resource Summary */}
              <div className="px-6 py-4">
                <h4 className="font-semibold text-gray-700 mb-3 flex items-center gap-2">
                  <span className="w-1 h-4 bg-blue-600 rounded-full inline-block"></span>
                  資源用量彙總
                </h4>

                {workers.length > 0 && (
                  <CategoryTable title="工人" items={workers} showWorkerType />
                )}
                {vehicles.length > 0 && (
                  <CategoryTable title="車輛" items={vehicles} />
                )}
                {machinery.length > 0 && (
                  <CategoryTable title="機械" items={machinery} />
                )}
                {tools.length > 0 && (
                  <CategoryTable title="工具" items={tools} />
                )}
              </div>

              {/* Daily Details */}
              <div className="px-6 py-4 border-t border-blue-100">
                <h4 className="font-semibold text-gray-700 mb-3 flex items-center gap-2">
                  <span className="w-1 h-4 bg-green-600 rounded-full inline-block"></span>
                  每日明細（共 {group.daily_details.length} 份日報）
                </h4>
                <div className="space-y-1">
                  {group.daily_details.map((detail: any) => {
                    const dayKey = `${projectKey}_${detail.report_id}`;
                    const isDayExpanded = expandedDays.has(dayKey);

                    return (
                      <div key={detail.report_id} className="bg-white rounded-lg border">
                        <div
                          className="flex items-center gap-4 px-4 py-2.5 cursor-pointer hover:bg-gray-50 transition-colors"
                          onClick={() => onToggleDay(dayKey)}
                        >
                          <span className={`text-xs transition-transform ${isDayExpanded ? 'rotate-90' : ''}`}>
                            ▶
                          </span>
                          <span className="font-medium text-sm">{fmtDate(detail.date)}</span>
                          <span className="text-xs px-2 py-0.5 bg-gray-100 rounded-full">
                            {shiftLabels[detail.shift_type] || detail.shift_type}
                          </span>
                          <span className="text-xs text-gray-500">建立人: {detail.creator}</span>
                          <span className="text-xs text-gray-400 ml-auto">{detail.items.length} 項</span>
                        </div>
                        {isDayExpanded && detail.items.length > 0 && (
                          <div className="px-4 pb-3">
                            <table className="w-full text-xs border rounded overflow-hidden">
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
                              <tbody className="divide-y divide-gray-50">
                                {detail.items.map((item: any, idx: number) => (
                                  <tr key={idx} className="hover:bg-gray-50">
                                    <td className="px-2 py-1.5">
                                      <span className={`inline-block px-1.5 py-0.5 rounded text-xs ${
                                        item.category === 'worker' ? 'bg-blue-100 text-blue-700' :
                                        item.category === 'vehicle' ? 'bg-orange-100 text-orange-700' :
                                        item.category === 'machinery' ? 'bg-purple-100 text-purple-700' :
                                        'bg-gray-100 text-gray-700'
                                      }`}>
                                        {categoryLabels[item.category] || item.category}
                                      </span>
                                    </td>
                                    <td className="px-2 py-1.5">{item.worker_type || '-'}</td>
                                    <td className="px-2 py-1.5">{item.content}</td>
                                    <td className="px-2 py-1.5 text-right">{fmtNum(item.quantity)}</td>
                                    <td className="px-2 py-1.5 text-right">{fmtNum(item.shift_quantity)}</td>
                                    <td className="px-2 py-1.5 text-right">{fmtNum(item.ot_hours)}</td>
                                    <td className="px-2 py-1.5">{item.name_or_plate || '-'}</td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          </td>
        </tr>
      )}
    </>
  );
}

/* ── Category Summary Table ────────────────────────────────── */
function CategoryTable({
  title,
  items,
  showWorkerType = false,
}: {
  title: string;
  items: any[];
  showWorkerType?: boolean;
}) {
  const totalQty = items.reduce((sum: number, i: any) => sum + (i.total_quantity || 0), 0);
  const totalShift = items.reduce((sum: number, i: any) => sum + (i.total_shift_quantity || 0), 0);
  const totalOt = items.reduce((sum: number, i: any) => sum + (i.total_ot_hours || 0), 0);

  return (
    <div className="mb-4">
      <div className="flex items-center gap-2 mb-2">
        <span className="text-sm font-medium text-gray-700">{title}</span>
        <span className="text-xs text-gray-400">({items.length} 項)</span>
      </div>
      <table className="w-full text-xs border rounded overflow-hidden">
        <thead className="bg-gray-100">
          <tr>
            {showWorkerType && <th className="px-3 py-1.5 text-left">工種</th>}
            <th className="px-3 py-1.5 text-left">內容</th>
            <th className="px-3 py-1.5 text-right">總數量</th>
            <th className="px-3 py-1.5 text-right">總中直</th>
            <th className="px-3 py-1.5 text-right">總 OT 時數</th>
            <th className="px-3 py-1.5 text-right">出現次數</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-50">
          {items.map((item: any, idx: number) => (
            <tr key={idx} className="hover:bg-gray-50">
              {showWorkerType && <td className="px-3 py-1.5 font-medium">{item.worker_type || '-'}</td>}
              <td className="px-3 py-1.5">{item.content}</td>
              <td className="px-3 py-1.5 text-right font-medium">{fmtNum(item.total_quantity)}</td>
              <td className="px-3 py-1.5 text-right">{fmtNum(item.total_shift_quantity)}</td>
              <td className="px-3 py-1.5 text-right">{fmtNum(item.total_ot_hours)}</td>
              <td className="px-3 py-1.5 text-right text-gray-500">{item.report_count}</td>
            </tr>
          ))}
        </tbody>
        <tfoot className="bg-gray-50 font-medium">
          <tr>
            {showWorkerType && <td className="px-3 py-1.5">合計</td>}
            <td className="px-3 py-1.5">{!showWorkerType && '合計'}</td>
            <td className="px-3 py-1.5 text-right">{fmtNum(totalQty)}</td>
            <td className="px-3 py-1.5 text-right">{fmtNum(totalShift)}</td>
            <td className="px-3 py-1.5 text-right">{fmtNum(totalOt)}</td>
            <td className="px-3 py-1.5 text-right"></td>
          </tr>
        </tfoot>
      </table>
    </div>
  );
}
