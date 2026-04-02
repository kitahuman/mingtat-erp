'use client';
import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { contractsApi, partnersApi } from '@/lib/api';
import { useColumnConfig } from '@/hooks/useColumnConfig';
import { useAuth } from '@/lib/auth';
import InlineEditDataTable from '@/components/InlineEditDataTable';
import Modal from '@/components/Modal';
import { fmtDate } from '@/lib/dateUtils';

const statusOptions = [
  { value: 'active', label: '進行中' },
  { value: 'completed', label: '已完成' },
  { value: 'cancelled', label: '已取消' },
];

const statusLabels: Record<string, string> = {
  active: '進行中', completed: '已完成', cancelled: '已取消',
};
const statusColors: Record<string, string> = {
  active: 'badge-green', completed: 'badge-gray', cancelled: 'badge-red',
};

const emptyForm = {
  contract_no: '',
  contract_name: '',
  client_id: '',
  description: '',
  sign_date: '',
  start_date: '',
  end_date: '',
  original_amount: '',
  status: 'active',
};

export default function ContractsPage() {
  const router = useRouter();
  const { hasMinRole } = useAuth();
  const [data, setData] = useState<any[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [clientFilter, setClientFilter] = useState('');
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [form, setForm] = useState<any>({ ...emptyForm });
  const [sortBy, setSortBy] = useState('id');
  const [sortOrder, setSortOrder] = useState('DESC');
  const [clients, setClients] = useState<any[]>([]);

  useEffect(() => {
    partnersApi.simple().then(res => {
      const clientPartners = (res.data || []).filter((p: any) => p.partner_type === 'client');
      setClients(clientPartners);
    });
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await contractsApi.list({
        page, limit: 20, search,
        clientId: clientFilter || undefined,
        status: statusFilter || undefined,
        sortBy, sortOrder,
      });
      setData(res.data.data);
      setTotal(res.data.total);
    } catch {}
    setLoading(false);
  }, [page, search, statusFilter, clientFilter, sortBy, sortOrder]);

  useEffect(() => { load(); }, [load]);

  const handleSort = (field: string, order: string) => {
    setSortBy(field);
    setSortOrder(order);
    setPage(1);
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await contractsApi.create({
        ...form,
        client_id: form.client_id ? Number(form.client_id) : undefined,
        original_amount: form.original_amount ? Number(form.original_amount) : 0,
      });
      setShowModal(false);
      setForm({ ...emptyForm });
      load();
    } catch (err: any) { alert(err.response?.data?.message || '建立失敗'); }
  };

  const handleInlineSave = async (id: number, formData: any) => {
    const payload: any = {
      contract_no: formData.contract_no,
      contract_name: formData.contract_name,
      status: formData.status,
      sign_date: formData.sign_date || null,
      start_date: formData.start_date || null,
      end_date: formData.end_date || null,
    };
    if (formData.original_amount !== undefined) {
      payload.original_amount = Number(formData.original_amount) || 0;
    }
    if (formData.client_id !== undefined) {
      payload.client_id = formData.client_id ? Number(formData.client_id) : undefined;
    }
    await contractsApi.update(id, payload);
    load();
  };

  const handleInlineDelete = async (id: number) => {
    try {
      await contractsApi.delete(id);
      load();
    } catch (err: any) {
      alert(err.response?.data?.message || '刪除失敗');
    }
  };

  const columns = [
    {
      key: 'contract_no', label: '合約編號', sortable: true, editable: true, editType: 'text' as const,
      render: (v: string) => <span className="font-mono font-bold text-primary-600">{v || '-'}</span>,
    },
    {
      key: 'contract_name', label: '合約名稱', sortable: true, editable: true, editType: 'text' as const,
      render: (v: string) => <span className="font-medium max-w-[200px] truncate block">{v || '-'}</span>,
    },
    {
      key: 'client', label: '客戶名稱', sortable: false, editable: false,
      render: (_: any, row: any) => row.client?.name || '-',
      filterRender: (_: any, row: any) => row.client?.name || '-',
    },
    {
      key: 'original_amount', label: '合約金額', sortable: true, editable: true, editType: 'text' as const,
      render: (v: any) => {
        const num = Number(v);
        return <span className="font-mono">{isNaN(num) ? '-' : `$${num.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}</span>;
      },
    },
    {
      key: 'sign_date', label: '簽約日期', sortable: true, editable: true, editType: 'date' as const,
      render: (v: any) => fmtDate(v),
    },
    {
      key: 'start_date', label: '開始日期', sortable: true, editable: true, editType: 'date' as const,
      render: (v: any) => fmtDate(v),
    },
    {
      key: 'end_date', label: '結束日期', sortable: true, editable: true, editType: 'date' as const,
      render: (v: any) => fmtDate(v),
    },
    {
      key: 'status', label: '狀態', sortable: true, editable: true, editType: 'select' as const,
      editOptions: statusOptions,
      render: (v: string) => <span className={statusColors[v] || 'badge-gray'}>{statusLabels[v] || v}</span>,
      filterRender: (v: string) => statusLabels[v] || v,
    },
  ];

  const {
    columnConfigs, columnWidths, visibleColumns,
    handleColumnConfigChange, handleReset, handleColumnResize,
  } = useColumnConfig('contracts', columns);

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">合約管理</h1>
          <p className="text-gray-500 mt-1">管理工程合約，追蹤合約狀態和金額</p>
        </div>
        {hasMinRole('clerk') && (
          <button onClick={() => setShowModal(true)} className="btn-primary">新增合約</button>
        )}
      </div>

      <div className="card">
        <InlineEditDataTable
          exportFilename="合約列表"
          columns={visibleColumns as any}
          columnConfigs={columnConfigs}
          onColumnConfigChange={handleColumnConfigChange}
          onColumnConfigReset={handleReset}
          columnWidths={columnWidths}
          onColumnResize={handleColumnResize}
          data={data}
          total={total}
          page={page}
          limit={20}
          onPageChange={setPage}
          onSearch={(s) => { setSearch(s); setPage(1); }}
          searchPlaceholder="搜尋合約編號、合約名稱、客戶名稱..."
          onRowClick={(row) => router.push(`/contracts/${row.id}`)}
          loading={loading}
          sortBy={sortBy}
          sortOrder={sortOrder}
          onSort={handleSort}
          onSave={handleInlineSave}
          onDelete={handleInlineDelete}
          filters={
            <div className="flex gap-2">
              <select value={clientFilter} onChange={(e) => { setClientFilter(e.target.value); setPage(1); }} className="input-field w-auto">
                <option value="">全部客戶</option>
                {clients.map((c: any) => <option key={c.id} value={c.id}>{c.code ? `${c.code} - ${c.name}` : c.name}</option>)}
              </select>
              <select value={statusFilter} onChange={(e) => { setStatusFilter(e.target.value); setPage(1); }} className="input-field w-auto">
                <option value="">全部狀態</option>
                {statusOptions.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
              </select>
            </div>
          }
        />
      </div>

      <Modal isOpen={showModal} onClose={() => setShowModal(false)} title="新增合約" size="lg">
        <form onSubmit={handleCreate} className="space-y-4">
          <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wider">基本資料</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">合約編號 *</label>
              <input value={form.contract_no} onChange={e => setForm({...form, contract_no: e.target.value})} className="input-field" required placeholder="例如 CT-2026-001" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">客戶 *</label>
              <select value={form.client_id} onChange={e => setForm({...form, client_id: e.target.value})} className="input-field" required>
                <option value="">請選擇客戶</option>
                {clients.map((c: any) => <option key={c.id} value={c.id}>{c.code ? `${c.code} - ${c.name}` : c.name}</option>)}
              </select>
            </div>
            <div className="md:col-span-2">
              <label className="block text-sm font-medium text-gray-700 mb-1">合約名稱 *</label>
              <input value={form.contract_name} onChange={e => setForm({...form, contract_name: e.target.value})} className="input-field" required placeholder="例如 荃灣商場裝修工程" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">合約金額</label>
              <input type="number" step="0.01" min="0" value={form.original_amount} onChange={e => setForm({...form, original_amount: e.target.value})} className="input-field" placeholder="0.00" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">狀態</label>
              <select value={form.status} onChange={e => setForm({...form, status: e.target.value})} className="input-field">
                {statusOptions.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
              </select>
            </div>
          </div>

          <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wider pt-2">日期資料</h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">簽約日期</label>
              <input type="date" value={form.sign_date} onChange={e => setForm({...form, sign_date: e.target.value})} className="input-field" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">開始日期</label>
              <input type="date" value={form.start_date} onChange={e => setForm({...form, start_date: e.target.value})} className="input-field" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">結束日期</label>
              <input type="date" value={form.end_date} onChange={e => setForm({...form, end_date: e.target.value})} className="input-field" />
            </div>
          </div>

          <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wider pt-2">其他</h3>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">說明</label>
            <textarea value={form.description} onChange={e => setForm({...form, description: e.target.value})} className="input-field" rows={3} placeholder="合約說明或備註" />
          </div>

          <div className="flex justify-end gap-3 pt-4 border-t">
            <button type="button" onClick={() => setShowModal(false)} className="btn-secondary">取消</button>
            <button type="submit" className="btn-primary">新增合約</button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
