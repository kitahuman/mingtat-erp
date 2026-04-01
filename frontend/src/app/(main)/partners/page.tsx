'use client';
import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { partnersApi } from '@/lib/api';
import CsvImportModal from '@/components/CsvImportModal';
import { useColumnConfig } from '@/hooks/useColumnConfig';
import { useAuth } from '@/lib/auth';
import InlineEditDataTable from '@/components/InlineEditDataTable';
import Modal from '@/components/Modal';

const partnerTypes = [
  { value: 'client', label: '客戶' },
  { value: 'supplier', label: '供應商' },
  { value: 'subcontractor', label: '判頭/街車' },
  { value: 'insurance', label: '保險公司' },
  { value: 'repair_shop', label: '維修廠' },
  { value: 'other', label: '其他' },
];

const typeLabels: Record<string, string> = {
  client: '客戶', supplier: '供應商', subcontractor: '判頭/街車',
  insurance: '保險公司', repair_shop: '維修廠', other: '其他'
};

const SUBSIDIARY_OPTIONS = ['DCL', 'DTC', 'DDL', 'DTL', 'MCL', '卓嵐'];

const emptyForm = {
  code: '', english_code: '', name: '', name_en: '', partner_type: 'client',
  contact_person: '', phone: '', mobile: '', email: '', fax: '',
  address: '', notes: '', bank_name: '', bank_account: '',
  invoice_title: '', invoice_description: '',
  quotation_remarks: '', invoice_remarks: '',
  is_subsidiary: false, subsidiaries: [] as string[],
};

export default function PartnersPage() {
  const router = useRouter();
  const { hasMinRole } = useAuth();
  const [data, setData] = useState<any[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState('');
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [form, setForm] = useState<any>({ ...emptyForm });
  const [sortBy, setSortBy] = useState('code');
  const [sortOrder, setSortOrder] = useState('ASC');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await partnersApi.list({
        page, limit: 20, search,
        partner_type: typeFilter || undefined,
        sortBy, sortOrder,
      });
      setData(res.data.data);
      setTotal(res.data.total);
    } catch {}
    setLoading(false);
  }, [page, search, typeFilter, sortBy, sortOrder]);

  useEffect(() => { load(); }, [load]);

  const handleSort = (field: string, order: string) => {
    setSortBy(field);
    setSortOrder(order);
    setPage(1);
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await partnersApi.create(form);
      setShowModal(false);
      setForm({ ...emptyForm });
      load();
    } catch (err: any) { alert(err.response?.data?.message || '建立失敗'); }
  };

  const toggleSubsidiary = (val: string) => {
    const subs = form.subsidiaries || [];
    if (subs.includes(val)) {
      setForm({ ...form, subsidiaries: subs.filter((s: string) => s !== val) });
    } else {
      setForm({ ...form, subsidiaries: [...subs, val] });
    }
  };

  const handleInlineSave = async (id: number, formData: any) => {
    await partnersApi.update(id, {
      code: formData.code,
      english_code: formData.english_code,
      name: formData.name,
      name_en: formData.name_en,
      partner_type: formData.partner_type,
      contact_person: formData.contact_person,
      phone: formData.phone,
      mobile: formData.mobile,
      email: formData.email,
      fax: formData.fax,
      address: formData.address,
    });
    load();
  };

  const columns = [
    { key: 'code', label: '代碼', sortable: true, editable: true, editType: 'text' as const, render: (v: string) => <span className="font-medium">{v || '-'}</span> },
    { key: 'english_code', label: '英文代碼', sortable: true, editable: true, editType: 'text' as const, render: (v: string) => v ? <span className="font-mono text-primary-600">{v}</span> : '-' },
    { key: 'name', label: '名稱', sortable: true, editable: true, editType: 'text' as const, render: (v: string) => <span className="font-medium">{v}</span> },
    { key: 'name_en', label: '英文名稱', sortable: true, editable: true, editType: 'text' as const, render: (v: string) => v || '-' },
    { key: 'partner_type', label: '類型', sortable: true, editable: true, editType: 'select' as const, editOptions: partnerTypes, render: (v: string) => {
      const colors: Record<string, string> = {
        client: 'badge-blue', supplier: 'badge-green', subcontractor: 'badge-yellow',
        insurance: 'badge-purple', repair_shop: 'badge-gray', other: 'badge-gray'
      };
      return <span className={colors[v] || 'badge-gray'}>{typeLabels[v] || v}</span>;
    }, filterRender: (v: string) => typeLabels[v] || v },
    { key: 'subsidiaries', label: '旗下公司', sortable: true, editable: false, render: (v: string[] | string) => {
      if (!v) return '-';
      const arr = Array.isArray(v) ? v : (typeof v === 'string' ? v.split(',').filter(Boolean) : []);
      if (arr.length === 0) return '-';
      return (
        <div className="flex flex-wrap gap-1">
          {arr.map((s: string) => (
            <span key={s} className="inline-block px-1.5 py-0.5 text-xs rounded bg-gray-100 text-gray-700">{s.trim()}</span>
          ))}
        </div>
      );
    }, filterRender: (v: string[] | string) => {
      if (!v) return '-';
      const arr = Array.isArray(v) ? v : (typeof v === 'string' ? v.split(',').filter(Boolean) : []);
      return arr.length > 0 ? arr.join(', ') : '-';
    }},
    { key: 'contact_person', label: '聯絡人', sortable: true, editable: true, editType: 'text' as const, render: (v: string) => v || '-' },
    { key: 'phone', label: '電話', sortable: true, editable: true, editType: 'text' as const, render: (v: string) => v || '-' },
    { key: 'mobile', label: '手提電話', sortable: true, editable: true, editType: 'text' as const, render: (v: string) => v || '-' },
    { key: 'email', label: '電郵', sortable: true, editable: true, editType: 'text' as const, render: (v: string) => v || '-' },
  ];

  const {
    columnConfigs, columnWidths, visibleColumns,
    handleColumnConfigChange, handleReset, handleColumnResize,
  } = useColumnConfig('partners', columns);


  const handleInlineDelete = async (id: number) => {
    await partnersApi.delete(id);
    loadPartners();
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">合作單位管理</h1>
          <p className="text-gray-500 mt-1">管理客戶、供應商、判頭及其他合作夥伴</p>
        </div>
        {hasMinRole('clerk') && (
          <div className="flex gap-2">
            <CsvImportModal module="partners" onImportComplete={load} />
            <button onClick={() => setShowModal(true)} className="btn-primary">新增合作單位</button>
          </div>
        )}
      </div>

      <div className="card">
        <InlineEditDataTable
          exportFilename="合作夥伴列表"
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
          searchPlaceholder="搜尋代碼、英文代碼、名稱、聯絡人或電話..."
          onRowClick={(row) => router.push(`/partners/${row.id}`)}
          loading={loading}
          sortBy={sortBy}
          sortOrder={sortOrder}
          onSort={handleSort}
          onSave={handleInlineSave}
        onDelete={handleInlineDelete}
          filters={
            <select value={typeFilter} onChange={(e) => { setTypeFilter(e.target.value); setPage(1); }} className="input-field w-auto">
              <option value="">全部類型</option>
              {partnerTypes.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
            </select>
          }
        />
      </div>

      <Modal isOpen={showModal} onClose={() => setShowModal(false)} title="新增合作單位" size="lg">
        <form onSubmit={handleCreate} className="space-y-4">
          {/* Basic Info */}
          <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wider">基本資料</h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div><label className="block text-sm font-medium text-gray-700 mb-1">代碼</label><input value={form.code} onChange={e => setForm({...form, code: e.target.value})} className="input-field" /></div>
            <div><label className="block text-sm font-medium text-gray-700 mb-1">英文代碼</label><input value={form.english_code} onChange={e => setForm({...form, english_code: e.target.value})} className="input-field" placeholder="用於發票編號" /></div>
            <div><label className="block text-sm font-medium text-gray-700 mb-1">類型 *</label>
              <select value={form.partner_type} onChange={e => setForm({...form, partner_type: e.target.value})} className="input-field">
                {partnerTypes.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
              </select>
            </div>
            <div><label className="block text-sm font-medium text-gray-700 mb-1">名稱 *</label><input value={form.name} onChange={e => setForm({...form, name: e.target.value})} className="input-field" required /></div>
            <div><label className="block text-sm font-medium text-gray-700 mb-1">英文名稱</label><input value={form.name_en} onChange={e => setForm({...form, name_en: e.target.value})} className="input-field" /></div>
            <div className="flex items-end">
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" checked={form.is_subsidiary} onChange={e => setForm({...form, is_subsidiary: e.target.checked})} className="rounded border-gray-300 text-primary-600 focus:ring-primary-500" />
                <span className="text-sm font-medium text-gray-700">旗下公司</span>
              </label>
            </div>
          </div>

          {/* Subsidiaries */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">業務往來旗下公司</label>
            <div className="flex flex-wrap gap-2">
              {SUBSIDIARY_OPTIONS.map(opt => (
                <label key={opt} className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full border cursor-pointer text-sm transition-colors ${
                  (form.subsidiaries || []).includes(opt)
                    ? 'bg-primary-50 border-primary-300 text-primary-700'
                    : 'bg-white border-gray-300 text-gray-600 hover:border-gray-400'
                }`}>
                  <input type="checkbox" checked={(form.subsidiaries || []).includes(opt)} onChange={() => toggleSubsidiary(opt)} className="sr-only" />
                  {(form.subsidiaries || []).includes(opt) && <span>&#10003;</span>}
                  {opt}
                </label>
              ))}
            </div>
          </div>

          {/* Contact Info */}
          <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wider pt-2">聯絡資料</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div><label className="block text-sm font-medium text-gray-700 mb-1">聯絡人</label><input value={form.contact_person} onChange={e => setForm({...form, contact_person: e.target.value})} className="input-field" /></div>
            <div><label className="block text-sm font-medium text-gray-700 mb-1">電話</label><input value={form.phone} onChange={e => setForm({...form, phone: e.target.value})} className="input-field" /></div>
            <div><label className="block text-sm font-medium text-gray-700 mb-1">手提電話</label><input value={form.mobile} onChange={e => setForm({...form, mobile: e.target.value})} className="input-field" /></div>
            <div><label className="block text-sm font-medium text-gray-700 mb-1">電郵</label><input type="email" value={form.email} onChange={e => setForm({...form, email: e.target.value})} className="input-field" /></div>
            <div><label className="block text-sm font-medium text-gray-700 mb-1">傳真</label><input value={form.fax} onChange={e => setForm({...form, fax: e.target.value})} className="input-field" /></div>
            <div><label className="block text-sm font-medium text-gray-700 mb-1">地址</label><input value={form.address} onChange={e => setForm({...form, address: e.target.value})} className="input-field" /></div>
          </div>

          {/* Bank & Invoice */}
          <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wider pt-2">銀行及發票資料</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div><label className="block text-sm font-medium text-gray-700 mb-1">銀行名</label><input value={form.bank_name} onChange={e => setForm({...form, bank_name: e.target.value})} className="input-field" /></div>
            <div><label className="block text-sm font-medium text-gray-700 mb-1">銀行帳號</label><input value={form.bank_account} onChange={e => setForm({...form, bank_account: e.target.value})} className="input-field" /></div>
            <div><label className="block text-sm font-medium text-gray-700 mb-1">發票抬頭</label><input value={form.invoice_title} onChange={e => setForm({...form, invoice_title: e.target.value})} className="input-field" /></div>
            <div><label className="block text-sm font-medium text-gray-700 mb-1">發票描述</label><input value={form.invoice_description} onChange={e => setForm({...form, invoice_description: e.target.value})} className="input-field" /></div>
          </div>

          {/* Remarks */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div><label className="block text-sm font-medium text-gray-700 mb-1">報價備註</label><textarea value={form.quotation_remarks} onChange={e => setForm({...form, quotation_remarks: e.target.value})} className="input-field" rows={2} /></div>
            <div><label className="block text-sm font-medium text-gray-700 mb-1">發票備註</label><textarea value={form.invoice_remarks} onChange={e => setForm({...form, invoice_remarks: e.target.value})} className="input-field" rows={2} /></div>
          </div>
          <div><label className="block text-sm font-medium text-gray-700 mb-1">備註</label><textarea value={form.notes} onChange={e => setForm({...form, notes: e.target.value})} className="input-field" rows={2} /></div>

          <div className="flex justify-end gap-3 pt-4 border-t">
            <button type="button" onClick={() => setShowModal(false)} className="btn-secondary">取消</button>
            <button type="submit" className="btn-primary">建立</button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
