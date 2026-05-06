'use client';
import { useState, useEffect, useCallback } from 'react';
import DateInput from '@/components/DateInput';
import { useRouter } from 'next/navigation';
import { contractsApi, partnersApi } from '@/lib/api';
import { useColumnConfig } from '@/hooks/useColumnConfig';
import { useAuth } from '@/lib/auth';
import InlineEditDataTable from '@/components/InlineEditDataTable';
import Modal from '@/components/Modal';
import Combobox from '@/components/Combobox';
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

interface ClientOption {
  value: string | number;
  label: string;
}

interface Client {
  id: number;
  code?: string | null;
  name: string;
  partner_type?: string | null;
}

interface ContractForm {
  contract_name: string;
  client_id: string;
  description: string;
  sign_date: string;
  start_date: string;
  end_date: string;
  original_amount: string;
  status: string;
}

const emptyForm: ContractForm = {
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
  const { hasMinRole , isReadOnly } = useAuth();
  const [data, setData] = useState<any[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [clientFilter, setClientFilter] = useState('');
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [form, setForm] = useState<ContractForm>({ ...emptyForm });
  const [sortBy, setSortBy] = useState('id');
  const [sortOrder, setSortOrder] = useState('DESC');
  const [clients, setClients] = useState<Client[]>([]);

  // Merge state
  const [mergeMode, setMergeMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [showMergeModal, setShowMergeModal] = useState(false);
  const [primaryId, setPrimaryId] = useState<number | null>(null);
  const [merging, setMerging] = useState(false);

  useEffect(() => {
    partnersApi.simple().then(res => {
      const clientPartners = (res.data || []).filter((p: Client) => p.partner_type === 'client');
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

  const clientOptions: ClientOption[] = clients.map(client => ({
    value: client.id,
    label: client.code ? `${client.code} - ${client.name}` : client.name,
  }));

  const handleClientChange = (value: string | null) => {
    if (value === null || clientOptions.some(option => String(option.value) === value)) {
      setForm(prev => ({ ...prev, client_id: value ?? '' }));
    }
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.client_id) {
      alert('請選擇客戶');
      return;
    }
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

  const toggleMergeMode = () => {
    setMergeMode(v => !v);
    setSelectedIds(new Set());
    setPrimaryId(null);
  };

  const handleCheck = (id: number, checked: boolean) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (checked) next.add(id);
      else next.delete(id);
      return next;
    });
  };

  const openMergeModal = () => {
    if (selectedIds.size < 2) { alert('請至少勾選 2 個合約才能合併'); return; }
    setPrimaryId(Array.from(selectedIds)[0]);
    setShowMergeModal(true);
  };

  const handleMerge = async () => {
    if (!primaryId) return;
    const mergeIds = Array.from(selectedIds).filter(id => id !== primaryId);
    if (mergeIds.length === 0) { alert('請選擇不同的主合約'); return; }
    setMerging(true);
    try {
      const res = await contractsApi.merge(primaryId, mergeIds);
      setShowMergeModal(false);
      setMergeMode(false);
      setSelectedIds(new Set());
      setPrimaryId(null);
      await load();
      alert(res.data?.message || '合併成功');
    } catch (err: any) {
      alert(err.response?.data?.message || '合併失敗');
    } finally {
      setMerging(false);
    }
  };

  const columns = [
    ...(mergeMode ? [{
      key: '_merge_check', label: '', sortable: false, width: 40,
      render: (_: any, row: any) => (
        <input type="checkbox" checked={selectedIds.has(row.id)}
          onChange={e => handleCheck(row.id, e.target.checked)}
          onClick={e => e.stopPropagation()}
          className="w-4 h-4 accent-blue-600" />
      )
    }] : []),
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
        <div className="flex gap-2">
          {hasMinRole('clerk') && (
            <>
              {mergeMode ? (
                <>
                  <button onClick={openMergeModal} className="btn-primary bg-blue-600 border-blue-600">確認合併 ({selectedIds.size})</button>
                  <button onClick={toggleMergeMode} className="btn-secondary">取消合併</button>
                </>
              ) : (
                <button onClick={toggleMergeMode} className="btn-secondary">合併功能</button>
              )}
              <button onClick={() => setShowModal(true)} className="btn-primary">新增合約</button>
            </>
          )}
        </div>
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
          onRowClick={(row) => mergeMode ? handleCheck(row.id, !selectedIds.has(row.id)) : router.push(`/contracts/${row.id}`)}
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
              <label className="block text-sm font-medium text-gray-700 mb-1">合約編號</label>
              <div className="input-field bg-gray-50 text-gray-500 flex items-center min-h-[38px]">
                系統自動生成（例如 CT-2026-001）
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">客戶 *</label>
              <Combobox
                value={form.client_id || null}
                onChange={handleClientChange}
                options={clientOptions}
                placeholder="搜尋客戶..."
                clearable
                className="w-full"
              />
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
              <DateInput value={form.sign_date} onChange={val => setForm({...form, sign_date: val || ''})} className="input-field" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">開始日期</label>
              <DateInput value={form.start_date} onChange={val => setForm({...form, start_date: val || ''})} className="input-field" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">結束日期</label>
              <DateInput value={form.end_date} onChange={val => setForm({...form, end_date: val || ''})} className="input-field" />
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

      <Modal isOpen={showMergeModal} onClose={() => setShowMergeModal(false)} title="合併合約確認" size="md">
        <div className="space-y-4">
          <div className="p-3 bg-blue-50 border border-blue-200 rounded text-sm text-blue-700">
            合併後，被選中的其他合約將會被標記為「已合併」，所有關聯的工程項目、工作紀錄、報價單、收支等數據都將遷移至主合約。
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">請選擇主合約 (數據將遷移至此)：</label>
            <div className="space-y-2 max-h-60 overflow-y-auto border rounded p-2">
              {data.filter(item => selectedIds.has(item.id)).map(item => (
                <label key={item.id} className="flex items-center gap-3 p-2 hover:bg-gray-50 rounded cursor-pointer border border-transparent has-[:checked]:border-blue-300 has-[:checked]:bg-blue-50">
                  <input type="radio" name="primaryContract" checked={primaryId === item.id} onChange={() => setPrimaryId(item.id)} className="w-4 h-4 text-blue-600" />
                  <div>
                    <div className="font-bold text-sm">{item.contract_no}</div>
                    <div className="text-xs text-gray-500">{item.contract_name}</div>
                  </div>
                </label>
              ))}
            </div>
          </div>
          <div className="pt-4 flex justify-end gap-3 border-t">
            <button onClick={() => setShowMergeModal(false)} className="btn-secondary">取消</button>
            <button onClick={handleMerge} disabled={merging || !primaryId} className="btn-primary bg-blue-600 border-blue-600">
              {merging ? '合併中...' : '確認合併'}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
