'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import DataTable from '@/components/DataTable';
import DateInput from '@/components/DateInput';
import Modal from '@/components/Modal';
import SearchableSelect from '@/components/SearchableSelect';
import { useRouter } from 'next/navigation';
import { companiesApi, invoiceStatementsApi, partnersApi } from '@/lib/api';
import { fmtDate } from '@/lib/dateUtils';
import { useAuth } from '@/lib/auth';
import { useColumnConfig } from '@/hooks/useColumnConfig';

const fmt$ = (v: any) =>
  `$${Number(v || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const STATUS_LABELS: Record<string, string> = {
  draft: '草稿',
  issued: '已發出',
};

const STATUS_COLORS: Record<string, string> = {
  draft: 'bg-gray-100 text-gray-700',
  issued: 'bg-blue-100 text-blue-700',
};

const defaultCreateForm = () => ({
  company_id: '',
  client_id: '',
  period_start: new Date(new Date().getFullYear(), new Date().getMonth(), 1)
    .toISOString()
    .slice(0, 10),
  period_end: new Date(new Date().getFullYear(), new Date().getMonth() + 1, 0)
    .toISOString()
    .slice(0, 10),
  statement_title: '',
});

const STATEMENT_COLUMNS = [
  {
    key: 'statement_no',
    label: '清單編號',
    sortable: true,
    className: 'px-4 font-mono font-medium text-primary-600',
    minWidth: 170,
    render: (v: any) => v || '-',
    filterRender: (v: any) => v || '-',
  },
  {
    key: 'statement_title',
    label: '標題',
    sortable: true,
    className: 'px-4',
    minWidth: 190,
    render: (v: any) => v || '-',
    filterRender: (v: any) => v || '-',
  },
  {
    key: 'client',
    label: '客戶',
    sortable: true,
    className: 'px-4 text-gray-900',
    minWidth: 170,
    render: (_: any, row: any) =>
      row.client?.code ? `${row.client.code} - ${row.client.name}` : row.client?.name || '-',
    filterRender: (_: any, row: any) =>
      row.client?.code ? `${row.client.code} - ${row.client.name}` : row.client?.name || '-',
  },
  {
    key: 'statement_period_start',
    label: '開始日期',
    sortable: true,
    className: 'px-4 text-gray-600',
    minWidth: 120,
    render: (v: any) => fmtDate(v),
    filterRender: (v: any) => fmtDate(v),
  },
  {
    key: 'statement_period_end',
    label: '結束日期',
    sortable: true,
    className: 'px-4 text-gray-600',
    minWidth: 120,
    render: (v: any) => fmtDate(v),
    filterRender: (v: any) => fmtDate(v),
  },
  {
    key: 'statement_invoice_count',
    label: '發票數量',
    sortable: true,
    className: 'px-4 text-right',
    minWidth: 110,
    render: (v: any) => Number(v || 0),
    filterRender: (v: any) => String(Number(v || 0)),
  },
  {
    key: 'statement_subtotal',
    label: '發票小計',
    sortable: true,
    className: 'px-4 text-right',
    minWidth: 130,
    render: (v: any) => fmt$(v),
    filterRender: (v: any) => fmt$(v),
  },
  {
    key: 'statement_total_amount',
    label: '總金額',
    sortable: true,
    className: 'px-4 text-right font-semibold',
    minWidth: 130,
    render: (v: any) => fmt$(v),
    filterRender: (v: any) => fmt$(v),
  },
  {
    key: 'statement_status',
    label: '狀態',
    sortable: true,
    className: 'px-4',
    minWidth: 110,
    render: (v: any) => (
      <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold ${STATUS_COLORS[v] || 'bg-gray-100 text-gray-700'}`}>
        {STATUS_LABELS[v] || v || '-'}
      </span>
    ),
    filterRender: (v: any) => STATUS_LABELS[v] || v || '-',
  },
  {
    key: 'created_at',
    label: '建立日期',
    sortable: true,
    className: 'px-4 text-gray-600',
    minWidth: 130,
    render: (v: any) => fmtDate(v),
    filterRender: (v: any) => fmtDate(v),
  },
];

export default function InvoiceStatementsPage() {
  const router = useRouter();
  const { isReadOnly } = useAuth();
  const [data, setData] = useState<any[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [clientFilter, setClientFilter] = useState('');
  const [companyFilter, setCompanyFilter] = useState('');
  const [periodFrom, setPeriodFrom] = useState('');
  const [periodTo, setPeriodTo] = useState('');
  const [sortBy, setSortBy] = useState('created_at');
  const [sortOrder, setSortOrder] = useState('DESC');
  const [columnFilters, setColumnFilters] = useState<Record<string, Set<string>>>({});
  const [showCreate, setShowCreate] = useState(false);
  const [creating, setCreating] = useState(false);
  const [createForm, setCreateForm] = useState(defaultCreateForm());
  const [matchingInvoices, setMatchingInvoices] = useState<any[]>([]);
  const [selectedInvoiceIds, setSelectedInvoiceIds] = useState<Set<number>>(new Set());
  const [matchingLoading, setMatchingLoading] = useState(false);
  const [partners, setPartners] = useState<any[]>([]);
  const [companies, setCompanies] = useState<any[]>([]);

  const {
    columnConfigs,
    columnWidths,
    visibleColumns,
    handleColumnConfigChange,
    handleReset,
    handleSavePersonal,
    handleSaveDefault,
    handleColumnResize,
  } = useColumnConfig('invoice-statements', STATEMENT_COLUMNS);

  const buildParams = useCallback(
    (override: Record<string, any> = {}) => {
      const filtersForApi: Record<string, string[]> = {};
      Object.entries(columnFilters).forEach(([key, set]) => {
        const values = Array.from(set || []);
        if (values.length) filtersForApi[key] = values;
      });
      return {
        page,
        limit: 50,
        status: statusFilter || undefined,
        client_id: clientFilter || undefined,
        company_id: companyFilter || undefined,
        period_from: periodFrom || undefined,
        period_to: periodTo || undefined,
        search: search || undefined,
        sortBy,
        sortOrder,
        filters: Object.keys(filtersForApi).length ? JSON.stringify(filtersForApi) : undefined,
        ...override,
      };
    },
    [page, statusFilter, clientFilter, companyFilter, periodFrom, periodTo, search, sortBy, sortOrder, columnFilters],
  );

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const res = await invoiceStatementsApi.list(buildParams());
      setData(res.data?.data || []);
      setTotal(res.data?.total || 0);
    } finally {
      setLoading(false);
    }
  }, [buildParams]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  useEffect(() => {
    partnersApi.simple().then((res) => setPartners(res.data || [])).catch(() => {});
    companiesApi.simple().then((res) => setCompanies(res.data || [])).catch(() => {});
  }, []);

  const fetchFilterOptions = async (columnKey: string) => {
    const res = await invoiceStatementsApi.filterOptions(columnKey, buildParams({ page: undefined }));
    return res.data || [];
  };

  const fetchMatchingInvoices = async () => {
    if (!createForm.company_id || !createForm.client_id || !createForm.period_start || !createForm.period_end) {
      setMatchingInvoices([]);
      setSelectedInvoiceIds(new Set());
      return;
    }
    setMatchingLoading(true);
    try {
      const res = await invoiceStatementsApi.matchingInvoices({
        company_id: Number(createForm.company_id),
        client_id: Number(createForm.client_id),
        period_start: createForm.period_start,
        period_end: createForm.period_end,
      });
      setMatchingInvoices(res.data || []);
      setSelectedInvoiceIds(new Set());
    } catch (error: any) {
      alert(error.response?.data?.message || '載入發票失敗');
      setMatchingInvoices([]);
      setSelectedInvoiceIds(new Set());
    } finally {
      setMatchingLoading(false);
    }
  };

  const createStatement = async () => {
    if (selectedInvoiceIds.size === 0) {
      alert('請至少勾選一張發票');
      return;
    }
    setCreating(true);
    try {
      const res = await invoiceStatementsApi.create({
        company_id: Number(createForm.company_id),
        client_id: Number(createForm.client_id),
        period_start: createForm.period_start,
        period_end: createForm.period_end,
        statement_title: createForm.statement_title || undefined,
        invoice_ids: Array.from(selectedInvoiceIds),
      });
      router.push(`/invoice-statements/${res.data.id}`);
    } catch (error: any) {
      alert(error.response?.data?.message || '建立發票清單失敗');
    } finally {
      setCreating(false);
    }
  };

  return (
    <div className="p-6">
      <div className="mb-6 flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">客戶發票清單</h1>
          <p className="mt-1 text-sm text-gray-500">管理已建立的客戶發票清單。主要建立流程可在發票列表勾選發票後建立。</p>
        </div>
        {!isReadOnly && (
          <button
            onClick={() => {
              setCreateForm(defaultCreateForm());
              setMatchingInvoices([]);
              setSelectedInvoiceIds(new Set());
              setShowCreate(true);
            }}
            className="rounded-lg bg-primary-600 px-4 py-2 text-sm font-medium text-white hover:bg-primary-700"
          >
            新增
          </button>
        )}
      </div>

      <div className="mb-6 border-b border-gray-200">
        <nav className="flex gap-6" aria-label="發票管理分頁">
          <Link
            href="/invoices"
            className="border-b-2 border-transparent px-1 pb-3 text-sm font-medium text-gray-500 hover:border-gray-300 hover:text-gray-700"
          >
            發票
          </Link>
          <Link
            href="/invoice-statements"
            className="border-b-2 border-primary-600 px-1 pb-3 text-sm font-semibold text-primary-600"
          >
            發票清單
          </Link>
        </nav>
      </div>

      <DataTable
        columns={visibleColumns as any[]}
        data={data}
        total={total}
        page={page}
        limit={50}
        onPageChange={setPage}
        onSearch={(term) => {
          setSearch(term);
          setPage(1);
        }}
        searchPlaceholder="搜尋清單編號、標題、客戶..."
        onRowClick={(row) => window.open(`/invoice-statements/${row.id}`, '_blank')}
        loading={loading}
        sortBy={sortBy}
        sortOrder={sortOrder}
        onSort={(field, order) => {
          setSortBy(field);
          setSortOrder(order);
        }}
        exportFilename="invoice-statements"
        onExportFetchAll={async () => {
          const res = await invoiceStatementsApi.list(buildParams({ page: 1, limit: 10000 }));
          return res.data?.data || [];
        }}
        columnConfigs={columnConfigs}
        onColumnConfigChange={handleColumnConfigChange}
        onColumnConfigReset={handleReset}
            onColumnConfigSavePersonal={handleSavePersonal}
            onColumnConfigSaveDefault={handleSaveDefault}
        columnWidths={columnWidths}
        onColumnResize={handleColumnResize}
        serverSideFilter
        columnFilters={columnFilters}
        onColumnFilterChange={(filters) => {
          setColumnFilters(filters);
          setPage(1);
        }}
        onFetchFilterOptions={fetchFilterOptions}
        filters={
          <div className="flex flex-wrap gap-3">
            <select value={statusFilter} onChange={(e) => { setStatusFilter(e.target.value); setPage(1); }} className="rounded-lg border border-gray-300 px-3 py-2 text-sm">
              <option value="">全部狀態</option>
              <option value="draft">草稿</option>
              <option value="issued">已發出</option>
            </select>
            <SearchableSelect
              value={companyFilter}
              onChange={(value) => { setCompanyFilter(String(value)); setPage(1); }}
              options={[{ value: '', label: '全部公司' }, ...companies.map((c) => ({ value: String(c.id), label: c.name }))]}
              placeholder="全部公司"
              className="min-w-[180px]"
            />
            <SearchableSelect
              value={clientFilter}
              onChange={(value) => { setClientFilter(String(value)); setPage(1); }}
              options={[{ value: '', label: '全部客戶' }, ...partners.map((p) => ({ value: String(p.id), label: p.code ? `${p.code} - ${p.name}` : p.name }))]}
              placeholder="全部客戶"
              className="min-w-[220px]"
            />
            <DateInput value={periodFrom} onChange={(value) => { setPeriodFrom(value); setPage(1); }} placeholder="開始日期" className="w-36" />
            <DateInput value={periodTo} onChange={(value) => { setPeriodTo(value); setPage(1); }} placeholder="結束日期" className="w-36" />
          </div>
        }
      />

      {showCreate && (
        <Modal isOpen={showCreate} onClose={() => setShowCreate(false)} title="新增發票清單" size="xl">
          <div className="space-y-4">
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">公司</label>
                <SearchableSelect
                  value={createForm.company_id}
                  onChange={(value) => setCreateForm((prev) => ({ ...prev, company_id: String(value) }))}
                  options={companies.map((c) => ({ value: String(c.id), label: c.name }))}
                  placeholder="選擇公司"
                />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">客戶</label>
                <SearchableSelect
                  value={createForm.client_id}
                  onChange={(value) => setCreateForm((prev) => ({ ...prev, client_id: String(value) }))}
                  options={partners.map((p) => ({ value: String(p.id), label: p.code ? `${p.code} - ${p.name}` : p.name }))}
                  placeholder="選擇客戶"
                />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">開始日期</label>
                <DateInput value={createForm.period_start} onChange={(value) => setCreateForm((prev) => ({ ...prev, period_start: value }))} />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">結束日期</label>
                <DateInput value={createForm.period_end} onChange={(value) => setCreateForm((prev) => ({ ...prev, period_end: value }))} />
              </div>
              <div className="md:col-span-2">
                <label className="mb-1 block text-sm font-medium text-gray-700">標題（可選）</label>
                <input
                  value={createForm.statement_title}
                  onChange={(e) => setCreateForm((prev) => ({ ...prev, statement_title: e.target.value }))}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                  placeholder="例如：2026年6月份發票清單"
                />
              </div>
            </div>

            <button
              onClick={fetchMatchingInvoices}
              disabled={matchingLoading}
              className="rounded-lg border border-primary-600 px-4 py-2 text-sm font-medium text-primary-700 hover:bg-primary-50 disabled:opacity-50"
            >
              {matchingLoading ? '載入中...' : '載入符合條件發票'}
            </button>

            <div className="overflow-hidden rounded-lg border border-gray-200">
              <div className="max-h-80 overflow-auto">
                <table className="min-w-full divide-y divide-gray-200 text-sm">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="w-12 px-3 py-2 text-left">
                        <input
                          type="checkbox"
                          checked={matchingInvoices.length > 0 && selectedInvoiceIds.size === matchingInvoices.length}
                          onChange={(e) => setSelectedInvoiceIds(e.target.checked ? new Set(matchingInvoices.map((inv) => inv.id)) : new Set())}
                        />
                      </th>
                      <th className="px-3 py-2 text-left">發票編號</th>
                      <th className="px-3 py-2 text-left">日期</th>
                      <th className="px-3 py-2 text-left">標題</th>
                      <th className="px-3 py-2 text-left">狀態</th>
                      <th className="px-3 py-2 text-right">金額</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100 bg-white">
                    {matchingInvoices.map((invoice) => (
                      <tr key={invoice.id}>
                        <td className="px-3 py-2">
                          <input
                            type="checkbox"
                            checked={selectedInvoiceIds.has(invoice.id)}
                            onChange={(e) => {
                              const next = new Set(selectedInvoiceIds);
                              e.target.checked ? next.add(invoice.id) : next.delete(invoice.id);
                              setSelectedInvoiceIds(next);
                            }}
                          />
                        </td>
                        <td className="px-3 py-2 font-mono text-primary-600">{invoice.invoice_no}</td>
                        <td className="px-3 py-2">{fmtDate(invoice.date)}</td>
                        <td className="px-3 py-2">{invoice.invoice_title || '-'}</td>
                        <td className="px-3 py-2">{STATUS_LABELS[invoice.status] || invoice.status || '-'}</td>
                        <td className="px-3 py-2 text-right">{fmt$(invoice.total_amount)}</td>
                      </tr>
                    ))}
                    {!matchingLoading && matchingInvoices.length === 0 && (
                      <tr><td colSpan={6} className="px-3 py-8 text-center text-gray-500">請先載入符合條件的發票</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
          <div className="mt-6 flex justify-end gap-3">
            <button onClick={() => setShowCreate(false)} className="rounded-lg border border-gray-300 px-4 py-2 text-sm">取消</button>
            <button onClick={createStatement} disabled={creating || selectedInvoiceIds.size === 0} className="rounded-lg bg-primary-600 px-4 py-2 text-sm font-medium text-white hover:bg-primary-700 disabled:opacity-50">
              {creating ? '建立中...' : `建立清單（${selectedInvoiceIds.size}）`}
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}
