'use client';
import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { payrollApi, companyProfilesApi, employeesApi } from '@/lib/api';
import DataTable from '@/components/DataTable';
import Modal from '@/components/Modal';

const STATUS_LABELS: Record<string, string> = {
  draft: '草稿',
  confirmed: '已確認',
  paid: '已付款',
};
const STATUS_COLORS: Record<string, string> = {
  draft: 'bg-gray-100 text-gray-800',
  confirmed: 'bg-blue-100 text-blue-800',
  paid: 'bg-green-100 text-green-800',
};

export default function PayrollPage() {
  const router = useRouter();
  const [data, setData] = useState<any[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [limit] = useState(20);
  const [search, setSearch] = useState('');
  const [sortBy, setSortBy] = useState('id');
  const [sortOrder, setSortOrder] = useState<'ASC' | 'DESC'>('DESC');
  const [loading, setLoading] = useState(true);

  // Filters
  const [period, setPeriod] = useState(() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  });
  const [companyProfileId, setCompanyProfileId] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [companyProfiles, setCompanyProfiles] = useState<any[]>([]);

  // Generate modal
  const [showGenerate, setShowGenerate] = useState(false);
  const [genPeriod, setGenPeriod] = useState(period);
  const [genCompanyProfileId, setGenCompanyProfileId] = useState('');
  const [generating, setGenerating] = useState(false);
  const [genResult, setGenResult] = useState<string | null>(null);

  // Bulk actions
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [showBulkPay, setShowBulkPay] = useState(false);
  const [bulkPayDate, setBulkPayDate] = useState('');
  const [bulkCheque, setBulkCheque] = useState('');

  // Summary
  const [summary, setSummary] = useState<any>(null);

  useEffect(() => {
    companyProfilesApi.simple().then(res => setCompanyProfiles(res.data));
  }, []);

  const loadData = async () => {
    setLoading(true);
    try {
      const params: any = { page, limit, sortBy, sortOrder };
      if (period) params.period = period;
      if (companyProfileId) params.company_profile_id = companyProfileId;
      if (statusFilter) params.status = statusFilter;
      if (search) params.search = search;

      const [listRes, summaryRes] = await Promise.all([
        payrollApi.list(params),
        payrollApi.summary({ period, company_profile_id: companyProfileId || undefined }),
      ]);

      setData(listRes.data.data);
      setTotal(listRes.data.total);
      setSummary(summaryRes.data);
    } catch (err) {
      console.error(err);
    }
    setLoading(false);
  };

  useEffect(() => { loadData(); }, [page, period, companyProfileId, statusFilter, search, sortBy, sortOrder]);

  const handleGenerate = async () => {
    setGenerating(true);
    setGenResult(null);
    try {
      const res = await payrollApi.generate({
        period: genPeriod,
        company_profile_id: genCompanyProfileId ? Number(genCompanyProfileId) : undefined,
      });
      setGenResult(res.data.message);
      loadData();
    } catch (err: any) {
      setGenResult(err.response?.data?.message || '生成失敗');
    }
    setGenerating(false);
  };

  const handleBulkConfirm = async () => {
    if (selected.size === 0) return;
    try {
      await payrollApi.bulkConfirm(Array.from(selected));
      setSelected(new Set());
      loadData();
    } catch (err: any) {
      alert(err.response?.data?.message || '操作失敗');
    }
  };

  const handleBulkPay = async () => {
    if (selected.size === 0) return;
    try {
      await payrollApi.bulkMarkPaid(Array.from(selected), bulkPayDate || undefined, bulkCheque || undefined);
      setSelected(new Set());
      setShowBulkPay(false);
      setBulkPayDate('');
      setBulkCheque('');
      loadData();
    } catch (err: any) {
      alert(err.response?.data?.message || '操作失敗');
    }
  };

  const toggleSelect = (id: number) => {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelected(next);
  };

  const toggleSelectAll = () => {
    if (selected.size === data.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(data.map(d => d.id)));
    }
  };

  const columns = [
    { key: 'select', label: '☐', render: (_v: any, row: any) => (
      <input
        type="checkbox"
        checked={selected.has(row.id)}
        onChange={() => toggleSelect(row.id)}
        onClick={(e) => e.stopPropagation()}
        className="rounded"
      />
    )},
    { key: 'employee', label: '員工', render: (_v: any, row: any) => (
      <div>
        <div className="font-medium">{row.employee?.name_zh}</div>
        <div className="text-xs text-gray-500">{row.employee?.name_en}</div>
      </div>
    )},
    { key: 'company', label: '公司', render: (_v: any, row: any) => row.employee?.company?.internal_prefix || row.employee?.company?.name || '-' },
    { key: 'period', label: '月份', sortable: true },
    { key: 'salary_type', label: '類型', render: (_v: any, row: any) => row.salary_type === 'daily' ? '日薪' : '月薪' },
    { key: 'base_amount', label: '底薪', render: (_v: any, row: any) => `$${Number(row.base_amount).toLocaleString()}`, className: 'text-right font-mono' },
    { key: 'allowance_total', label: '津貼', render: (_v: any, row: any) => `$${Number(row.allowance_total).toLocaleString()}`, className: 'text-right font-mono' },
    { key: 'ot_total', label: 'OT', render: (_v: any, row: any) => `$${Number(row.ot_total).toLocaleString()}`, className: 'text-right font-mono' },
    { key: 'commission_total', label: '分傭', render: (_v: any, row: any) => `$${Number(row.commission_total).toLocaleString()}`, className: 'text-right font-mono' },
    { key: 'mpf_deduction', label: '強積金', render: (_v: any, row: any) => <span className="text-red-600">-${Number(row.mpf_deduction).toLocaleString()}</span>, className: 'text-right font-mono' },
    { key: 'net_amount', label: '淨額', sortable: true, render: (_v: any, row: any) => <span className="font-bold">${Number(row.net_amount).toLocaleString()}</span>, className: 'text-right font-mono' },
    { key: 'status', label: '狀態', render: (_v: any, row: any) => (
      <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_COLORS[row.status] || ''}`}>
        {STATUS_LABELS[row.status] || row.status}
      </span>
    )},
  ];

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">計糧管理</h1>
          <p className="text-sm text-gray-500">生成、確認及管理每月糧單</p>
        </div>
        <button onClick={() => { setGenPeriod(period); setShowGenerate(true); }} className="btn-primary">
          生成糧單
        </button>
      </div>

      {/* Filters */}
      <div className="card mb-4">
        <div className="flex flex-wrap gap-4 items-end">
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">月份</label>
            <input
              type="month"
              value={period}
              onChange={e => { setPeriod(e.target.value); setPage(1); }}
              className="input-field w-40"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">公司</label>
            <select
              value={companyProfileId}
              onChange={e => { setCompanyProfileId(e.target.value); setPage(1); }}
              className="input-field w-48"
            >
              <option value="">全部公司</option>
              {companyProfiles.map((cp: any) => (
                <option key={cp.id} value={cp.id}>{cp.code} - {cp.chinese_name}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">狀態</label>
            <select
              value={statusFilter}
              onChange={e => { setStatusFilter(e.target.value); setPage(1); }}
              className="input-field w-36"
            >
              <option value="">全部</option>
              <option value="draft">草稿</option>
              <option value="confirmed">已確認</option>
              <option value="paid">已付款</option>
            </select>
          </div>
        </div>
      </div>

      {/* Summary */}
      {summary && summary.count > 0 && (
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-3 mb-4">
          <div className="card !p-3 text-center">
            <p className="text-xs text-gray-500">糧單數</p>
            <p className="text-lg font-bold">{summary.count}</p>
          </div>
          <div className="card !p-3 text-center">
            <p className="text-xs text-gray-500">底薪總計</p>
            <p className="text-lg font-bold font-mono">${Number(summary.total_base).toLocaleString()}</p>
          </div>
          <div className="card !p-3 text-center">
            <p className="text-xs text-gray-500">津貼總計</p>
            <p className="text-lg font-bold font-mono">${Number(summary.total_allowance).toLocaleString()}</p>
          </div>
          <div className="card !p-3 text-center">
            <p className="text-xs text-gray-500">OT 總計</p>
            <p className="text-lg font-bold font-mono">${Number(summary.total_ot).toLocaleString()}</p>
          </div>
          <div className="card !p-3 text-center">
            <p className="text-xs text-gray-500">分傭總計</p>
            <p className="text-lg font-bold font-mono">${Number(summary.total_commission).toLocaleString()}</p>
          </div>
          <div className="card !p-3 text-center">
            <p className="text-xs text-gray-500">強積金總計</p>
            <p className="text-lg font-bold font-mono text-red-600">-${Number(summary.total_mpf).toLocaleString()}</p>
          </div>
          <div className="card !p-3 text-center">
            <p className="text-xs text-gray-500">淨額總計</p>
            <p className="text-lg font-bold font-mono text-primary-600">${Number(summary.total_net).toLocaleString()}</p>
          </div>
        </div>
      )}

      {/* Bulk actions */}
      {selected.size > 0 && (
        <div className="flex items-center gap-3 mb-4 p-3 bg-blue-50 rounded-lg border border-blue-200">
          <span className="text-sm font-medium text-blue-800">已選擇 {selected.size} 筆</span>
          <button onClick={handleBulkConfirm} className="btn-secondary text-sm !py-1">批量確認</button>
          <button onClick={() => setShowBulkPay(true)} className="btn-secondary text-sm !py-1">批量標記已付款</button>
          <button onClick={() => setSelected(new Set())} className="text-sm text-gray-500 hover:text-gray-700">取消選擇</button>
        </div>
      )}

      <DataTable
        columns={columns}
        data={data}
        total={total}
        page={page}
        limit={limit}
        onPageChange={setPage}
        onSearch={(s) => { setSearch(s); setPage(1); }}
        searchPlaceholder="搜尋員工姓名/編號..."
        onRowClick={(row) => router.push(`/payroll/${row.id}`)}
        loading={loading}
        sortBy={sortBy}
        sortOrder={sortOrder}
        onSort={(key, order) => { setSortBy(key); setSortOrder(order as 'ASC' | 'DESC'); }}
      />

      {/* Generate Modal */}
      <Modal isOpen={showGenerate} onClose={() => { setShowGenerate(false); setGenResult(null); }} title="生成糧單" size="md">
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">計糧月份 *</label>
            <input
              type="month"
              value={genPeriod}
              onChange={e => setGenPeriod(e.target.value)}
              className="input-field"
            />
            <p className="text-xs text-gray-500 mt-1">計糧週期：每月1日至月底</p>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">公司</label>
            <select
              value={genCompanyProfileId}
              onChange={e => setGenCompanyProfileId(e.target.value)}
              className="input-field"
            >
              <option value="">全部公司</option>
              {companyProfiles.map((cp: any) => (
                <option key={cp.id} value={cp.id}>{cp.code} - {cp.chinese_name}</option>
              ))}
            </select>
          </div>

          {genResult && (
            <div className="p-3 bg-blue-50 rounded-lg text-sm text-blue-800">{genResult}</div>
          )}

          <div className="flex justify-end gap-3 pt-4 border-t">
            <button onClick={() => { setShowGenerate(false); setGenResult(null); }} className="btn-secondary">關閉</button>
            <button onClick={handleGenerate} disabled={generating} className="btn-primary">
              {generating ? '生成中...' : '開始生成'}
            </button>
          </div>
        </div>
      </Modal>

      {/* Bulk Pay Modal */}
      <Modal isOpen={showBulkPay} onClose={() => setShowBulkPay(false)} title="批量標記已付款">
        <div className="space-y-4">
          <p className="text-sm text-gray-600">將 {selected.size} 筆糧單標記為已付款</p>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">付款日期</label>
            <input type="date" value={bulkPayDate} onChange={e => setBulkPayDate(e.target.value)} className="input-field" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">支票號碼</label>
            <input value={bulkCheque} onChange={e => setBulkCheque(e.target.value)} className="input-field" placeholder="選填" />
          </div>
          <div className="flex justify-end gap-3 pt-4 border-t">
            <button onClick={() => setShowBulkPay(false)} className="btn-secondary">取消</button>
            <button onClick={handleBulkPay} className="btn-primary">確認付款</button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
