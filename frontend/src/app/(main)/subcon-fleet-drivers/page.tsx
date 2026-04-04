'use client';
import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { subconFleetDriversApi, partnersApi } from '@/lib/api';
import CsvImportModal from '@/components/CsvImportModal';
import { useColumnConfig } from '@/hooks/useColumnConfig';
import InlineEditDataTable from '@/components/InlineEditDataTable';
import Modal from '@/components/Modal';
import { fmtDate } from '@/lib/dateUtils';

export default function SubconFleetDriversPage() {
  const router = useRouter();
  const [data, setData] = useState<any[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [subconFilter, setSubconFilter] = useState('');
  const [sortBy, setSortBy] = useState('created_at');
  const [sortOrder, setSortOrder] = useState('DESC');
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [partners, setPartners] = useState<any[]>([]);

  const defaultForm = {
    subcontractor_id: '',
    short_name: '',
    name_zh: '',
    name_en: '',
    id_number: '',
    machine_type: '',
    plate_no: '',
    phone: '',
    date_of_birth: '',
    yellow_cert_no: '',
    red_cert_no: '',
    has_d_cert: false,
    is_cert_returned: false,
    address: '',
    status: 'active'
  };
  const [form, setForm] = useState<any>({ ...defaultForm });

  const load = () => {
    setLoading(true);
    subconFleetDriversApi.list({
      page, limit: 20, search,
      subcontractor_id: subconFilter || undefined,
      sortBy, sortOrder,
    }).then(res => { 
      setData(res.data.data); 
      setTotal(res.data.total); 
    }).finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, [page, search, subconFilter, sortBy, sortOrder]);

  useEffect(() => {
    partnersApi.simple().then(res => {
      // Only show subcontractor type partners as the fleet company options
      const subconOnly = (res.data || []).filter((p: any) => p.partner_type === 'subcontractor');
      setPartners(subconOnly);
    });
  }, []);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await subconFleetDriversApi.create({
        ...form,
        subcontractor_id: Number(form.subcontractor_id),
      });
      setShowModal(false);
      setForm({ ...defaultForm });
      load();
    } catch (err: any) { 
      alert(err.response?.data?.message || '新增失敗'); 
    }
  };

  const handleInlineSave = async (id: number, formData: any) => {
    const payload = { ...formData };
    if (payload.subcontractor_id) payload.subcontractor_id = Number(payload.subcontractor_id);
    await subconFleetDriversApi.update(id, payload);
    load();
  };

  const handleInlineDelete = async (id: number) => {
    if (!confirm('確定要刪除此司機記錄嗎？')) return;
    try {
      await subconFleetDriversApi.delete(id);
      load();
    } catch (err: any) {
      alert(err.response?.data?.message || '刪除失敗');
    }
  };

  const subcontractorOptions = partners.map(p => ({ value: p.id, label: p.name }));

  const columns = [
    { key: 'subcontractor_id', label: '街車公司', sortable: true, editable: true, editType: 'select' as const, editOptions: subcontractorOptions, render: (_: any, row: any) => row.subcontractor?.name || '-', filterRender: (_: any, row: any) => row.subcontractor?.name || '-' },
    { key: 'short_name', label: '簡稱', sortable: true, editable: true, editType: 'text' as const },
    { key: 'name_zh', label: '中文姓名', sortable: true, editable: true, editType: 'text' as const },
    { key: 'name_en', label: '英文姓名', sortable: true, editable: true, editType: 'text' as const },
    { key: 'id_number', label: '身份證號碼', sortable: true, editable: true, editType: 'text' as const },
    { key: 'machine_type', label: '車類型', sortable: true, editable: true, editType: 'text' as const },
    { key: 'plate_no', label: '常用車牌', sortable: true, editable: true, editType: 'text' as const },
    { key: 'phone', label: '聯絡電話', sortable: true, editable: true, editType: 'text' as const },
    { key: 'date_of_birth', label: '出生日期', sortable: true, editable: true, editType: 'date' as const, render: (v: any) => fmtDate(v) },
    { key: 'yellow_cert_no', label: '黃證no', sortable: true, editable: true, editType: 'text' as const },
    { key: 'red_cert_no', label: '紅證no', sortable: true, editable: true, editType: 'text' as const },
    { key: 'has_d_cert', label: 'D證', sortable: true, editable: true, editType: 'select' as const, editOptions: [{ value: true, label: 'Y' }, { value: false, label: 'N' }], render: (v: any) => v ? 'Y' : 'N' },
    { key: 'is_cert_returned', label: '已還證', sortable: true, editable: true, editType: 'select' as const, editOptions: [{ value: true, label: 'Y' }, { value: false, label: 'N' }], render: (v: any) => v ? 'Y' : 'N' },
    { key: 'address', label: '聯絡地址', sortable: true, editable: true, editType: 'text' as const },
    { key: 'status', label: '狀態', sortable: true, editable: true, editType: 'select' as const, editOptions: [{ value: 'active', label: '使用中' }, { value: 'inactive', label: '停用' }], render: (v: any) => v === 'active' ? <span className="badge-green">使用中</span> : <span className="badge-gray">停用</span> },
  ];

  const {
    columnConfigs, columnWidths, visibleColumns,
    handleColumnConfigChange, handleReset, handleColumnResize,
  } = useColumnConfig('subcon-fleet-drivers', columns);

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">街車車隊管理</h1>
          <p className="text-gray-500 text-sm mt-1">管理外判街車司機資料、證件及聯繫方式</p>
        </div>
        <div className="flex gap-2">
          <CsvImportModal module="subcon-fleet-drivers" onImportComplete={load} />
          <button onClick={() => setShowModal(true)} className="btn-primary">新增司機</button>
        </div>
      </div>

      <div className="card">
        <InlineEditDataTable
          exportFilename="街車車隊司機列表"
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
          onSearch={setSearch}
          searchPlaceholder="搜尋姓名、身份證、車牌、電話..."
          loading={loading}
          sortBy={sortBy}
          sortOrder={sortOrder}
          onSort={(f, o) => { setSortBy(f); setSortOrder(o); }}
          onSave={handleInlineSave}
          onDelete={handleInlineDelete}
          filters={
            <div className="flex gap-2">
              <select value={subconFilter} onChange={e => { setSubconFilter(e.target.value); setPage(1); }} className="input-field w-auto">
                <option value="">全部街車公司</option>
                {partners.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            </div>
          }
        />
      </div>

      <Modal isOpen={showModal} onClose={() => setShowModal(false)} title="新增街車司機" size="xl">
        <form onSubmit={handleCreate} className="space-y-4 max-h-[75vh] overflow-y-auto p-1">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">街車公司 *</label>
              <select value={form.subcontractor_id} onChange={e => setForm({...form, subcontractor_id: e.target.value})} className="input-field" required>
                <option value="">請選擇</option>
                {partners.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">簡稱</label>
              <input type="text" value={form.short_name} onChange={e => setForm({...form, short_name: e.target.value})} className="input-field" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">中文姓名 *</label>
              <input type="text" value={form.name_zh} onChange={e => setForm({...form, name_zh: e.target.value})} className="input-field" required />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">英文姓名</label>
              <input type="text" value={form.name_en} onChange={e => setForm({...form, name_en: e.target.value})} className="input-field" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">香港身份證號碼</label>
              <input type="text" value={form.id_number} onChange={e => setForm({...form, id_number: e.target.value})} className="input-field" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">車類型</label>
              <input type="text" value={form.machine_type} onChange={e => setForm({...form, machine_type: e.target.value})} className="input-field" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">常用車牌</label>
              <input type="text" value={form.plate_no} onChange={e => setForm({...form, plate_no: e.target.value})} className="input-field" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">聯絡電話</label>
              <input type="text" value={form.phone} onChange={e => setForm({...form, phone: e.target.value})} className="input-field" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">出生日期</label>
              <input type="date" value={form.date_of_birth} onChange={e => setForm({...form, date_of_birth: e.target.value})} className="input-field" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">黃證no</label>
              <input type="text" value={form.yellow_cert_no} onChange={e => setForm({...form, yellow_cert_no: e.target.value})} className="input-field" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">紅證no</label>
              <input type="text" value={form.red_cert_no} onChange={e => setForm({...form, red_cert_no: e.target.value})} className="input-field" />
            </div>
            <div className="flex gap-4 items-center h-full pt-6">
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" checked={form.has_d_cert} onChange={e => setForm({...form, has_d_cert: e.target.checked})} className="rounded text-primary-600 focus:ring-primary-500 h-4 w-4" />
                <span className="text-sm text-gray-700">D證 (Y/N)</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" checked={form.is_cert_returned} onChange={e => setForm({...form, is_cert_returned: e.target.checked})} className="rounded text-primary-600 focus:ring-primary-500 h-4 w-4" />
                <span className="text-sm text-gray-700">已還證 (Y/N)</span>
              </label>
            </div>
            <div className="md:col-span-2">
              <label className="block text-sm font-medium text-gray-700 mb-1">聯絡地址</label>
              <textarea value={form.address} onChange={e => setForm({...form, address: e.target.value})} className="input-field" rows={2} />
            </div>
          </div>
          <div className="flex justify-end gap-3 mt-6">
            <button type="button" onClick={() => setShowModal(false)} className="btn-secondary">取消</button>
            <button type="submit" className="btn-primary">確認新增</button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
