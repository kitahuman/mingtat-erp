'use client';

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import DateInput from '@/components/DateInput';
import { useRouter } from 'next/navigation';
import {
  dailyReportsApi,
  partnersApi,
  fieldOptionsApi,
  projectsApi,
  verificationApi,
} from '@/lib/api';
import { fmtDate } from '@/lib/dateUtils';
import SearchableSelect from '@/components/SearchableSelect';
import ColumnFilter from '@/components/ColumnFilter';
import ColumnCustomizer from '@/components/ColumnCustomizer';
import { useColumnConfig } from '@/hooks/useColumnConfig';
import { usePageState } from '@/hooks/usePageState';
import { useAuth } from '@/lib/auth';
import { useRefetchOnFocus } from '@/hooks/useRefetchOnFocus';

const statusLabels: Record<string, string> = {
  draft: '草稿',
  submitted: '已提交',
};
const statusColors: Record<string, string> = {
  draft: 'badge-yellow',
  submitted: 'badge-green',
};
const shiftLabels: Record<string, string> = { day: '日更', night: '夜更' };
const categoryLabels: Record<string, string> = {
  worker: '工人',
  vehicle: '車輛/機械',
  machinery: '車輛/機械',
  tool: '工具',
};

// ── Standard list columns ───────────────────────────────────
// key = column identity for ColumnCustomizer / useColumnConfig
// sortField = backend sort field (undefined = not sortable)
// filterField = backend column-filter field (undefined = not filterable)
const COLUMNS: Array<{
  key: string;
  label: string;
  sortField?: string;
  filterField?: string;
}> = [
  { key: 'date', label: '日期', sortField: 'daily_report_date', filterField: 'daily_report_date' },
  { key: 'project', label: '工程', sortField: 'daily_report_project_name', filterField: 'daily_report_project_name' },
  { key: 'location', label: '工程地點', sortField: 'daily_report_project_location', filterField: 'daily_report_project_location' },
  { key: 'client', label: '客戶', sortField: 'daily_report_client_name', filterField: 'daily_report_client_name' },
  { key: 'contract_no', label: '客戶合約', sortField: 'daily_report_client_contract_no', filterField: 'daily_report_client_contract_no' },
  { key: 'shift', label: '更次', sortField: 'daily_report_shift_type', filterField: 'daily_report_shift_type' },
  { key: 'item_count', label: '項目數' },
  { key: 'creator', label: '建立人', sortField: 'creator', filterField: 'creator' },
  { key: 'status', label: '狀態', sortField: 'daily_report_status', filterField: 'daily_report_status' },
  { key: 'verification', label: '核對' },
];

// Filter-value display helpers for status / shift columns
const statusOptionRender = (value: string) => statusLabels[value] || value;
const shiftOptionRender = (value: string) => shiftLabels[value] || value;

// ── 核對狀態 Badge ──────────────────────────────────────────
function VerificationStatusBadge({ reportId }: { reportId: number }) {
  const [status, setStatus] = useState<{ matched: number; quantityMatched: number; diff: number; total: number } | null>(null);

  useEffect(() => {
    let cancelled = false;
    verificationApi.getDailyReportVerification(reportId)
      .then((res) => {
        if (cancelled) return;
        const items = res.data as Array<{ status: string }>;
        const matched = items.filter((i) => i.status === 'matched').length;
        const quantityMatched = items.filter((i) => i.status === 'quantity_matched').length;
        const diff = items.filter((i) => i.status === 'diff').length;
        setStatus({ matched, quantityMatched, diff, total: items.length });
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [reportId]);

  if (!status || status.total === 0) return <span className="text-gray-300 text-xs">—</span>;

  const positiveCount = status.matched + status.quantityMatched;
  const allExact = status.matched === status.total;
  const allPositive = positiveCount === status.total;
  const partial = positiveCount > 0 && !allPositive;

  return (
    <span
      className={`inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full ${
        allExact
          ? 'bg-green-100 text-green-700'
          : allPositive
            ? 'bg-orange-100 text-orange-700'
            : partial || status.diff > 0
              ? 'bg-amber-100 text-amber-700'
              : 'bg-red-100 text-red-700'
      }`}
      title={`精確 ${status.matched} / 數量 ${status.quantityMatched} / 不符 ${status.diff} / 總共 ${status.total}`}
    >
      {allExact ? '✅' : allPositive ? '≈' : partial || status.diff > 0 ? '⚠️' : '❌'}
      {positiveCount}/{status.total}
    </span>
  );
}

export default function DailyReportsAdminPage() {
  const router = useRouter();
  const { isReadOnly } = useAuth();
  const [reports, setReports] = useState<any[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);

  // ── Page state (sessionStorage persisted) ──────────────────
  const { pageState, saveState } = usePageState({
    page: 1,
    limit: 25,
    sorts: [],
    search: '',
    columnFilters: {},
    filterDateFrom: '',
    filterDateTo: '',
    filters: {
      projectName: null,
      client: null,
      contractNo: null,
      status: null,
    },
  });

  const {
    page = 1,
    limit = 25,
    search = '',
    columnFilters = {},
    filterDateFrom = '',
    filterDateTo = '',
  } = pageState;
  const topFilters = (pageState.filters || {}) as {
    projectName?: string | null;
    client?: string | null;
    contractNo?: string | null;
    status?: string | null;
  };
  const filterProjectName = topFilters.projectName ?? null;
  const filterClient = topFilters.client ?? null;
  const filterContractNo = topFilters.contractNo ?? null;
  const filterStatus = topFilters.status ?? null;

  // Multi-column sort state (empty array = backend default)
  const sorts = useMemo<Array<{ field: string; order: 'ASC' | 'DESC' }>>(() => {
    if (Array.isArray(pageState.sorts)) {
      return pageState.sorts as Array<{ field: string; order: 'ASC' | 'DESC' }>;
    }
    // Legacy migration: old sessionStorage may still contain sortBy/sortOrder
    if (pageState.sortBy) {
      return [
        {
          field: pageState.sortBy,
          order: (pageState.sortOrder === 'ASC' ? 'ASC' : 'DESC') as 'ASC' | 'DESC',
        },
      ];
    }
    return [];
  }, [pageState.sorts, pageState.sortBy, pageState.sortOrder]);

  const activeColumnFilters = useMemo<Record<string, Set<string>>>(
    () =>
      Object.fromEntries(
        Object.entries(columnFilters).map(([key, values]) => [key, new Set(values)]),
      ),
    [columnFilters],
  );

  // State setters (persist through saveState)
  const setPage = (newPage: number) => saveState((prev) => ({ ...prev, page: newPage }));
  const setLimit = (newLimit: number) =>
    saveState((prev) => ({ ...prev, limit: newLimit, page: 1 }));
  const setSearch = (v: string) => saveState((prev) => ({ ...prev, search: v, page: 1 }));
  const setSorts = (newSorts: Array<{ field: string; order: 'ASC' | 'DESC' }>) =>
    saveState((prev) => {
      const { sortBy: _sb, sortOrder: _so, ...rest } = prev;
      return { ...rest, sorts: newSorts };
    });
  const setColumnFilters = (newFilters: Record<string, string[]>) =>
    saveState((prev) => ({ ...prev, columnFilters: newFilters, page: 1 }));
  const setFilterDateFrom = (v: string) =>
    saveState((prev) => ({ ...prev, filterDateFrom: v, page: 1 }));
  const setFilterDateTo = (v: string) =>
    saveState((prev) => ({ ...prev, filterDateTo: v, page: 1 }));
  const setTopFilter = (key: string, value: string | null) =>
    saveState((prev) => ({
      ...prev,
      filters: { ...(prev.filters || {}), [key]: value },
      page: 1,
    }));

  const resetFilters = () =>
    saveState((prev) => ({
      ...prev,
      page: 1,
      search: '',
      sorts: [],
      columnFilters: {},
      filterDateFrom: '',
      filterDateTo: '',
      filters: { projectName: null, client: null, contractNo: null, status: null },
    }));

  const hasActiveFilters =
    Boolean(search) ||
    Boolean(filterProjectName) ||
    Boolean(filterClient) ||
    Boolean(filterContractNo) ||
    Boolean(filterStatus) ||
    Boolean(filterDateFrom) ||
    Boolean(filterDateTo) ||
    sorts.length > 0 ||
    Object.keys(columnFilters).length > 0;

  // ── Column config (ColumnCustomizer) ───────────────────────
  const {
    columnConfigs,
    visibleColumns,
    handleColumnConfigChange,
    handleReset: handleColumnReset,
    handleSavePersonal,
    handleSaveDefault,
  } = useColumnConfig('daily-reports', COLUMNS);

  // ── Filter option lists (top filter bar) ───────────────────
  const [projectNameOptions, setProjectNameOptions] = useState<
    { value: string; label: string }[]
  >([]);
  const [partnerOptions, setPartnerOptions] = useState<
    { value: string; label: string }[]
  >([]);
  const [contractOptions, setContractOptions] = useState<
    { value: string; label: string }[]
  >([]);
  const statusOptions = [
    { value: 'draft', label: '草稿' },
    { value: 'submitted', label: '已提交' },
  ];

  const [expandedId, setExpandedId] = useState<number | null>(null);

  // Batch edit state
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [showBatchModal, setShowBatchModal] = useState(false);
  const [batchProjectId, setBatchProjectId] = useState<string | null>(null);
  const [batchProjectLocation, setBatchProjectLocation] = useState('');
  const [batchClientId, setBatchClientId] = useState<string | null>(null);
  const [batchClientContractNo, setBatchClientContractNo] = useState<
    string | null
  >(null);
  const [batchFieldsEnabled, setBatchFieldsEnabled] = useState<{
    project: boolean;
    location: boolean;
    client: boolean;
    contract: boolean;
  }>({ project: false, location: false, client: false, contract: false });
  const [batchSubmitting, setBatchSubmitting] = useState(false);
  const [projectsList, setProjectsList] = useState<any[]>([]);
  const [informalProjectNames, setInformalProjectNames] = useState<string[]>(
    [],
  );

  // ── Sorting handlers ────────────────────────────────────────
  // Click unsorted column  → append to sort list (accumulate)
  // Click already-sorted column → toggle ASC/DESC
  // Click the sort badge (×) → remove that column from sort list
  const handleSort = useCallback(
    (field: string) => {
      const existingIdx = sorts.findIndex((s) => s.field === field);
      let newSorts: Array<{ field: string; order: 'ASC' | 'DESC' }>;
      if (existingIdx >= 0) {
        newSorts = sorts.map((s, i) =>
          i === existingIdx
            ? { ...s, order: s.order === 'ASC' ? 'DESC' : 'ASC' }
            : s,
        );
      } else {
        newSorts = [...sorts, { field, order: 'ASC' }];
      }
      setSorts(newSorts);
      setPage(1);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [sorts],
  );

  const handleRemoveSort = useCallback(
    (field: string) => {
      setSorts(sorts.filter((s) => s.field !== field));
      setPage(1);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [sorts],
  );

  // ── Request params ──────────────────────────────────────────
  const buildListParams = useCallback(
    (
      overrides: Record<string, unknown> = {},
      {
        skipColumnFilters = false,
        excludeColumnFilter,
      }: { skipColumnFilters?: boolean; excludeColumnFilter?: string } = {},
    ) => {
      const params: Record<string, unknown> = {
        sorts,
        ...overrides,
      };
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
      if (!skipColumnFilters) {
        for (const [col, vals] of Object.entries(columnFilters)) {
          if (col === excludeColumnFilter) continue;
          if (Array.isArray(vals) && vals.length > 0) {
            params[`filter_${col}`] = JSON.stringify(vals);
          }
        }
      }
      return params;
    },
    [
      sorts,
      filterProjectName,
      filterClient,
      filterContractNo,
      filterStatus,
      filterDateFrom,
      filterDateTo,
      search,
      columnFilters,
    ],
  );

  const normalizeProjectNames = (data: any): string[] => {
    const list = Array.isArray(data) ? data : [];
    return list
      .map((item: any) => (typeof item === 'string' ? item : item?.name))
      .filter(
        (name: any): name is string =>
          typeof name === 'string' && name.trim().length > 0,
      )
      .map((name: string) => name.trim());
  };

  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      const params = buildListParams({ page, limit });
      const res = await dailyReportsApi.listPost(params);
      setReports(res.data?.data || []);
      setTotal(res.data?.total || 0);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, [buildListParams, page, limit]);

  const loadFilterOptionLists = useCallback(() => {
    // Load formal projects and informal project names from daily reports.
    Promise.all([
      projectsApi.simple().catch(() => ({ data: [] })),
      dailyReportsApi.projectNames().catch(() => ({ data: [] })),
    ])
      .then(([projectsRes, namesRes]) => {
        const projects: any[] = projectsRes.data || [];
        const informalNames = normalizeProjectNames(namesRes.data);
        const formalNames = projects
          .map((p: any) => p.project_name)
          .filter(Boolean) as string[];
        const allNames = Array.from(
          new Set([...formalNames, ...informalNames]),
        ).sort((a, b) => a.localeCompare(b, 'zh-HK'));

        setProjectsList(projects);
        setInformalProjectNames(informalNames);
        setProjectNameOptions(allNames.map((n) => ({ value: n, label: n })));
      })
      .catch(() => {});

    // Load partners for client filter
    partnersApi
      .simple()
      .then((res) => {
        const list: any[] = res.data || [];
        setPartnerOptions(
          list.map((p: any) => ({ value: `id:${p.id}`, label: p.name })),
        );
      })
      .catch(() => {});

    // Load contract options from field_options
    fieldOptionsApi
      .getByCategory('client_contract_no')
      .then((res) => {
        const opts = (res.data || []).filter((o: any) => o.is_active !== false);
        setContractOptions(
          opts.map((o: any) => ({ value: o.label, label: o.label })),
        );
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    loadFilterOptionLists();
  }, [loadFilterOptionLists]);

  useRefetchOnFocus(loadFilterOptionLists);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const totalPages = Math.max(1, Math.ceil(total / limit));

  const handleExport = (id: number) => {
    const apiBase = process.env.NEXT_PUBLIC_API_URL || '/api';
    window.open(`${apiBase}/daily-reports/${id}/export`, '_blank');
  };

  // Batch edit helpers
  const toggleSelect = (id: number) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };
  const toggleSelectAll = () => {
    const currentPageIds = reports.map((r) => r.id);
    const allSelected = currentPageIds.every((id) => selectedIds.has(id));
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (allSelected) currentPageIds.forEach((id) => next.delete(id));
      else currentPageIds.forEach((id) => next.add(id));
      return next;
    });
  };
  const openBatchModal = () => {
    setBatchProjectId(null);
    setBatchProjectLocation('');
    setBatchClientId(null);
    setBatchClientContractNo(null);
    setBatchFieldsEnabled({
      project: false,
      location: false,
      client: false,
      contract: false,
    });
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
      if (batchProjectId?.startsWith('formal:')) {
        const projectId = batchProjectId.slice('formal:'.length);
        const p = projectsList.find(
          (x: any) => String(x.id) === String(projectId),
        );
        payload.project_id = Number(projectId);
        payload.project_name = p?.project_name || null;
      } else if (batchProjectId?.startsWith('informal:')) {
        payload.project_id = null;
        payload.project_name = batchProjectId.slice('informal:'.length) || null;
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
        const p = partnerOptions.find((o) => o.value === `id:${batchClientId}`);
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
    const confirmed = window.confirm(
      `確定要刪除日報表「${label}」（${report.daily_report_date?.split('T')[0] || ''}）？\n\n此操作不可復原。`,
    );
    if (!confirmed) return;
    try {
      await dailyReportsApi.delete(report.id);
      loadData();
    } catch {
      alert('刪除失敗，請重試');
    }
  };

  // ── Cell renderer ───────────────────────────────────────────
  const renderCell = (colKey: string, report: any) => {
    switch (colKey) {
      case 'date':
        return (
          <span className="whitespace-nowrap">
            {fmtDate(report.daily_report_date)}
          </span>
        );
      case 'project':
        return (
          <div>
            <div className="font-medium">
              {report.daily_report_project_name ||
                report.project?.project_name ||
                '-'}
            </div>
            <div className="text-xs text-gray-400">
              {report.project?.project_no || ''}
            </div>
          </div>
        );
      case 'location':
        return report.daily_report_project_location || '-';
      case 'client':
        return report.daily_report_client_name || report.client?.name || '-';
      case 'contract_no':
        return (
          <span className="text-gray-500">
            {report.daily_report_client_contract_no || '-'}
          </span>
        );
      case 'shift':
        return (
          shiftLabels[report.daily_report_shift_type] ||
          report.daily_report_shift_type
        );
      case 'item_count':
        return report.items?.length || 0;
      case 'creator':
        return report.creator?.displayName || '-';
      case 'status':
        return (
          <span
            className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium ${statusColors[report.daily_report_status] || 'badge-gray'}`}
          >
            {statusLabels[report.daily_report_status] ||
              report.daily_report_status}
          </span>
        );
      case 'verification':
        return <VerificationStatusBadge reportId={report.id} />;
      default:
        return null;
    }
  };

  const visibleColCount =
    (visibleColumns as any[]).length + (isReadOnly() ? 1 : 2); // + checkbox + actions

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
          <ColumnCustomizer
            columns={columnConfigs}
            onChange={handleColumnConfigChange}
            onReset={handleColumnReset}
            onSavePersonal={handleSavePersonal}
            onSaveDefault={handleSaveDefault}
          />
        </div>
      </div>

      {/* Filters */}
      <div className="bg-white rounded-lg shadow-sm border p-4 space-y-3">
        {/* Row 1: search + status + date range */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="搜尋工作摘要/工程/客戶/合約..."
            className="px-3 py-2 border rounded-lg text-sm"
          />
          <SearchableSelect
            value={filterStatus}
            onChange={(val) => setTopFilter('status', val as string | null)}
            options={statusOptions}
            placeholder="全部狀態"
            className="text-sm"
          />
          <DateInput
            value={filterDateFrom}
            onChange={(v) => setFilterDateFrom(v)}
            className="px-3 py-2 border rounded-lg text-sm"
          />
          <DateInput
            value={filterDateTo}
            onChange={(v) => setFilterDateTo(v)}
            className="px-3 py-2 border rounded-lg text-sm"
          />
        </div>
        {/* Row 2: project + client + contract + reset */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
          <SearchableSelect
            value={filterProjectName}
            onChange={(val) =>
              setTopFilter('projectName', val as string | null)
            }
            options={projectNameOptions}
            placeholder="全部工程"
            className="text-sm"
          />
          <SearchableSelect
            value={filterClient}
            onChange={(val) => setTopFilter('client', val as string | null)}
            options={partnerOptions}
            placeholder="全部客戶"
            className="text-sm"
          />
          <SearchableSelect
            value={filterContractNo}
            onChange={(val) =>
              setTopFilter('contractNo', val as string | null)
            }
            options={contractOptions}
            placeholder="全部客戶合約"
            className="text-sm"
          />
          <div className="flex items-center">
            <button
              onClick={resetFilters}
              disabled={!hasActiveFilters}
              className="px-3 py-2 border rounded-lg text-sm text-gray-600 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed"
              title="清除所有篩選、搜尋與排序"
            >
              重設篩選
            </button>
          </div>
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
                        checked={
                          reports.length > 0 &&
                          reports.every((r) => selectedIds.has(r.id))
                        }
                        onChange={toggleSelectAll}
                        onClick={(e) => e.stopPropagation()}
                      />
                    </th>
                  )}
                  {(visibleColumns as any[]).map((col: any) => {
                    const sortField = col.sortField as string | undefined;
                    const filterField = col.filterField as string | undefined;
                    const sortIdx = sortField
                      ? sorts.findIndex((s) => s.field === sortField)
                      : -1;
                    const isActive = sortIdx >= 0;
                    const activeOrder = isActive ? sorts[sortIdx].order : null;
                    return (
                      <th
                        key={col.key}
                        onClick={
                          sortField ? () => handleSort(sortField) : undefined
                        }
                        title={
                          sortField
                            ? isActive
                              ? '點擊切換排序方向；點擊序號可移除該欄排序'
                              : '點擊加入排序'
                            : undefined
                        }
                        className={`px-4 py-3 text-left font-medium text-gray-600 whitespace-nowrap ${
                          sortField
                            ? 'cursor-pointer select-none hover:bg-gray-100'
                            : ''
                        } ${isActive ? 'bg-blue-50 text-blue-700' : ''}`}
                      >
                        <span className="flex items-center gap-0.5">
                          {col.label}
                          {sortField && !isActive && (
                            <span className="ml-0.5 text-[10px] text-gray-300">
                              ▲▼
                            </span>
                          )}
                          {sortField && isActive && (
                            <span className="ml-0.5 flex items-center gap-0.5">
                              <span className="text-[10px] text-blue-600">
                                {activeOrder === 'ASC' ? '▲' : '▼'}
                              </span>
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleRemoveSort(sortField);
                                }}
                                title="移除此欄排序"
                                className="inline-flex items-center gap-0.5 px-1 py-0 rounded text-[9px] font-bold bg-blue-100 text-blue-700 hover:bg-red-100 hover:text-red-600 transition-colors leading-tight"
                              >
                                {sorts.length > 1
                                  ? String.fromCharCode(0x2460 + sortIdx)
                                  : null}
                                <span className="text-[8px] leading-none">
                                  ×
                                </span>
                              </button>
                            </span>
                          )}
                          {filterField && (
                            <ColumnFilter
                              columnKey={filterField}
                              data={reports}
                              activeFilters={activeColumnFilters}
                              onFilterChange={(key, vals) => {
                                if (vals === null) {
                                  const newFilters = { ...columnFilters };
                                  delete newFilters[key];
                                  setColumnFilters(newFilters);
                                } else {
                                  setColumnFilters({
                                    ...columnFilters,
                                    [key]: Array.from(
                                      vals instanceof Set
                                        ? vals
                                        : new Set(vals as any),
                                    ),
                                  });
                                }
                              }}
                              serverSide={true}
                              optionRender={
                                filterField === 'daily_report_status'
                                  ? statusOptionRender
                                  : filterField === 'daily_report_shift_type'
                                    ? shiftOptionRender
                                    : undefined
                              }
                              onFetchOptions={async (key) => {
                                const res = await dailyReportsApi.filterOptions(
                                  key,
                                  buildListParams(
                                    {},
                                    { excludeColumnFilter: key },
                                  ),
                                );
                                return res.data as string[];
                              }}
                            />
                          )}
                        </span>
                      </th>
                    );
                  })}
                  <th className="px-4 py-3 text-left font-medium text-gray-600">
                    操作
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {reports.map((report) => (
                  <React.Fragment key={report.id}>
                    <tr
                      className="hover:bg-gray-50 cursor-pointer transition-colors"
                      onClick={() =>
                        setExpandedId(
                          expandedId === report.id ? null : report.id,
                        )
                      }
                    >
                      {!isReadOnly() && (
                        <td
                          className="px-3 py-3 w-10"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <input
                            type="checkbox"
                            checked={selectedIds.has(report.id)}
                            onChange={() => toggleSelect(report.id)}
                          />
                        </td>
                      )}
                      {(visibleColumns as any[]).map((col: any) => (
                        <td
                          key={col.key}
                          className={`px-4 py-3 ${col.key === 'verification' ? 'text-center' : ''}`}
                        >
                          {renderCell(col.key, report)}
                        </td>
                      ))}
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-3">
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              router.push(`/daily-reports/${report.id}/edit`);
                            }}
                            className="text-green-600 hover:text-green-800 text-xs font-medium"
                          >
                            編輯
                          </button>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              handleExport(report.id);
                            }}
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
                      <tr>
                        <td
                          colSpan={visibleColCount}
                          className="px-4 py-4 bg-blue-50/50"
                        >
                          <div className="space-y-3">
                            <div className="grid grid-cols-2 gap-4">
                              {report.daily_report_client_contract_no && (
                                <div className="text-sm">
                                  <strong>客戶合約：</strong>
                                  {report.daily_report_client_contract_no}
                                </div>
                              )}
                              {report.daily_report_project_location && (
                                <div className="text-sm">
                                  <strong>工程地點：</strong>
                                  {report.daily_report_project_location}
                                </div>
                              )}
                            </div>
                            <div>
                              <h4 className="font-medium text-gray-700 mb-1">
                                工作摘要
                              </h4>
                              <p className="text-sm text-gray-600 whitespace-pre-wrap">
                                {report.daily_report_work_summary}
                              </p>
                            </div>
                            {report.items?.length > 0 && (
                              <div>
                                <h4 className="font-medium text-gray-700 mb-2">
                                  日報項目
                                </h4>
                                <div className="space-y-1">
                                  {report.items.map((item: any) => (
                                    <div
                                      key={item.id}
                                      className="flex items-center gap-3 text-sm bg-white rounded px-3 py-1.5 border border-gray-100"
                                    >
                                      <span className="text-xs text-gray-400 w-16 shrink-0">
                                        {categoryLabels[
                                          item.daily_report_item_category
                                        ] || item.daily_report_item_category}
                                      </span>
                                      <span className="font-medium">
                                        {item.daily_report_item_content}
                                      </span>
                                      {item.daily_report_item_name_or_plate && (
                                        <span className="text-gray-500">
                                          (
                                          {item.daily_report_item_name_or_plate}
                                          )
                                        </span>
                                      )}
                                      {item.daily_report_item_quantity !=
                                        null && (
                                        <span className="text-blue-600">
                                          ×{item.daily_report_item_quantity}
                                        </span>
                                      )}
                                      {item.daily_report_item_ot_hours !=
                                        null &&
                                        item.daily_report_item_ot_hours > 0 && (
                                          <span className="text-orange-500 text-xs">
                                            OT {item.daily_report_item_ot_hours}
                                            h
                                          </span>
                                        )}
                                    </div>
                                  ))}
                                </div>
                              </div>
                            )}
                            {report.attachments?.length > 0 && (
                              <div>
                                <h4 className="font-medium text-gray-700 mb-2">
                                  附件
                                </h4>
                                <div className="flex flex-wrap gap-2">
                                  {report.attachments.map((att: any) => (
                                    <a
                                      key={att.id}
                                      href={att.daily_report_attachment_url}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      className="text-xs text-blue-600 hover:underline bg-blue-50 px-2 py-1 rounded"
                                    >
                                      {att.daily_report_attachment_name ||
                                        '附件'}
                                    </a>
                                  ))}
                                </div>
                              </div>
                            )}
                          </div>
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Pagination */}
      <div className="flex justify-between items-center">
        <div className="flex items-center gap-2 text-sm text-gray-600">
          <span>每頁</span>
          <select
            value={limit}
            onChange={(e) => setLimit(Number(e.target.value))}
            className="border rounded px-2 py-1 text-sm"
          >
            {[25, 50, 100].map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
          <span>筆</span>
        </div>
        {totalPages > 1 && (
          <div className="flex items-center gap-2">
            <button
              onClick={() => setPage(Math.max(1, page - 1))}
              disabled={page === 1}
              className="px-3 py-1 border rounded text-sm disabled:opacity-40"
            >
              上一頁
            </button>
            <span className="text-sm text-gray-600">
              {page} / {totalPages}
            </span>
            <button
              onClick={() => setPage(Math.min(totalPages, page + 1))}
              disabled={page === totalPages}
              className="px-3 py-1 border rounded text-sm disabled:opacity-40"
            >
              下一頁
            </button>
          </div>
        )}
        <div className="text-sm text-gray-400">共 {total} 筆</div>
      </div>

      {/* Batch Edit Modal */}
      {showBatchModal && (
        <div
          className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4"
          onClick={() => !batchSubmitting && setShowBatchModal(false)}
        >
          <div
            className="bg-white rounded-lg shadow-xl w-full max-w-lg"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="px-5 py-4 border-b flex items-center justify-between">
              <h3 className="font-semibold text-gray-800">批量修改日報</h3>
              <button
                className="text-gray-400 hover:text-gray-600"
                onClick={() => !batchSubmitting && setShowBatchModal(false)}
              >
                ✕
              </button>
            </div>
            <div className="px-5 py-4 space-y-4">
              <div className="text-sm text-gray-600 bg-blue-50 border border-blue-200 rounded p-3">
                已選中 <strong>{selectedIds.size}</strong>{' '}
                筆日報；只會修改下方勾選的欄位，其他欄位維持不變。已提交的日報會被阻擋。
              </div>

              {/* Project */}
              <div className="space-y-1">
                <label className="flex items-center gap-2 text-sm font-medium text-gray-700">
                  <input
                    type="checkbox"
                    checked={batchFieldsEnabled.project}
                    onChange={(e) =>
                      setBatchFieldsEnabled((s) => ({
                        ...s,
                        project: e.target.checked,
                      }))
                    }
                  />
                  修改工程
                </label>
                {batchFieldsEnabled.project && (
                  <SearchableSelect
                    value={batchProjectId}
                    onChange={(val) => setBatchProjectId(val as string | null)}
                    options={[
                      ...projectsList.map((p: any) => ({
                        value: `formal:${p.id}`,
                        label: `${p.project_no} - ${p.project_name}`,
                      })),
                      ...informalProjectNames.map((name: string) => ({
                        value: `informal:${name}`,
                        label: name,
                      })),
                    ]}
                    placeholder="選擇工程（或留空清除）"
                    className="text-sm"
                  />
                )}
              </div>

              {/* Project location */}
              <div className="space-y-1">
                <label className="flex items-center gap-2 text-sm font-medium text-gray-700">
                  <input
                    type="checkbox"
                    checked={batchFieldsEnabled.location}
                    onChange={(e) =>
                      setBatchFieldsEnabled((s) => ({
                        ...s,
                        location: e.target.checked,
                      }))
                    }
                  />
                  修改工程地點
                </label>
                {batchFieldsEnabled.location && (
                  <input
                    type="text"
                    value={batchProjectLocation}
                    onChange={(e) => setBatchProjectLocation(e.target.value)}
                    placeholder="輸入工程地點（或留空清除）"
                    className="w-full px-3 py-2 border rounded-lg text-sm"
                  />
                )}
              </div>

              {/* Client */}
              <div className="space-y-1">
                <label className="flex items-center gap-2 text-sm font-medium text-gray-700">
                  <input
                    type="checkbox"
                    checked={batchFieldsEnabled.client}
                    onChange={(e) =>
                      setBatchFieldsEnabled((s) => ({
                        ...s,
                        client: e.target.checked,
                      }))
                    }
                  />
                  修改客戶
                </label>
                {batchFieldsEnabled.client && (
                  <SearchableSelect
                    value={batchClientId}
                    onChange={(val) => setBatchClientId(val as string | null)}
                    options={partnerOptions.map((o) => ({
                      value: o.value.replace('id:', ''),
                      label: o.label,
                    }))}
                    placeholder="選擇客戶（或留空清除）"
                    className="text-sm"
                  />
                )}
              </div>

              {/* Contract */}
              <div className="space-y-1">
                <label className="flex items-center gap-2 text-sm font-medium text-gray-700">
                  <input
                    type="checkbox"
                    checked={batchFieldsEnabled.contract}
                    onChange={(e) =>
                      setBatchFieldsEnabled((s) => ({
                        ...s,
                        contract: e.target.checked,
                      }))
                    }
                  />
                  修改客戶合約
                </label>
                {batchFieldsEnabled.contract && (
                  <SearchableSelect
                    value={batchClientContractNo}
                    onChange={(val) =>
                      setBatchClientContractNo(val as string | null)
                    }
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
              >
                取消
              </button>
              <button
                onClick={submitBatchUpdate}
                disabled={batchSubmitting}
                className="px-3 py-1.5 bg-blue-600 text-white rounded text-sm font-medium hover:bg-blue-700 disabled:opacity-50"
              >
                {batchSubmitting ? '提交中...' : '確認修改'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
