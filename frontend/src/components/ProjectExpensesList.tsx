'use client';

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import Modal from '@/components/Modal';
import DateInput from '@/components/DateInput';
import {
  expensesApi,
  expenseCategoriesApi,
  companiesApi,
  partnersApi,
} from '@/lib/api';
import { fmtDate } from '@/lib/dateUtils';

const fmtMoney = (v: any): string =>
  v != null
    ? Number(v).toLocaleString('en-US', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      })
    : '-';

const statusMap: Record<string, { label: string; color: string }> = {
  unpaid: { label: '未付款', color: 'bg-yellow-100 text-yellow-700' },
  partially_paid: { label: '部分付款', color: 'bg-blue-100 text-blue-700' },
  paid: { label: '已付款', color: 'bg-green-100 text-green-700' },
  cancelled: { label: '取消', color: 'bg-gray-100 text-gray-500' },
};

const todayStr = () => {
  const d = new Date();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${m}-${dd}`;
};

export default function ProjectExpensesList({
  projectId,
  companyId,
}: {
  projectId: number;
  companyId?: number | null;
}) {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [expenses, setExpenses] = useState<any[]>([]);
  const [total, setTotal] = useState(0);

  // ── Create modal state ──
  const [showModal, setShowModal] = useState(false);
  const [saving, setSaving] = useState(false);
  const [companies, setCompanies] = useState<any[]>([]);
  const [categoryTree, setCategoryTree] = useState<any[]>([]);
  const [partners, setPartners] = useState<any[]>([]);
  const emptyForm = {
    date: todayStr(),
    company_id: companyId ? String(companyId) : '',
    supplier_name: '',
    category_id: '',
    _parent_category_id: '',
    item: '',
    total_amount: '',
    payment_status: 'unpaid',
    remarks: '',
  };
  const [form, setForm] = useState<any>(emptyForm);

  const load = useCallback(() => {
    setLoading(true);
    expensesApi
      .list({ project_id: projectId, limit: 500, sortBy: 'date', sortOrder: 'DESC' })
      .then((res) => {
        const payload = res.data;
        setExpenses(payload?.data || []);
        setTotal(payload?.total ?? (payload?.data || []).length);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [projectId]);

  useEffect(() => {
    load();
  }, [load]);

  const openCreateModal = async () => {
    setForm({ ...emptyForm, company_id: companyId ? String(companyId) : '' });
    setShowModal(true);
    if (companies.length === 0) {
      companiesApi.simple().then((r) => setCompanies(r.data || [])).catch(() => {});
    }
    if (categoryTree.length === 0) {
      expenseCategoriesApi.getTree().then((r) => setCategoryTree(r.data || [])).catch(() => {});
    }
    if (partners.length === 0) {
      partnersApi.simple().then((r) => setPartners(r.data || [])).catch(() => {});
    }
  };

  const supplierOptions = useMemo(
    () => partners.filter((p: any) => p.partner_type === 'supplier'),
    [partners],
  );

  const childCategories = useMemo(() => {
    if (!form._parent_category_id) return [];
    const parent = categoryTree.find(
      (c: any) => Number(c.id) === Number(form._parent_category_id),
    );
    return parent?.children || [];
  }, [categoryTree, form._parent_category_id]);

  const totalAmount = useMemo(
    () => expenses.reduce((s, e) => s + Number(e.total_amount || 0), 0),
    [expenses],
  );

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.company_id) {
      alert('請選擇公司');
      return;
    }
    setSaving(true);
    try {
      const payload: any = {
        date: form.date,
        company_id: Number(form.company_id),
        project_id: projectId,
        supplier_name: form.supplier_name || undefined,
        category_id: form.category_id ? Number(form.category_id) : undefined,
        item: form.item || undefined,
        total_amount: form.total_amount ? Number(form.total_amount) : 0,
        payment_status: form.payment_status,
        remarks: form.remarks || undefined,
      };
      await expensesApi.create(payload);
      setShowModal(false);
      setForm(emptyForm);
      load();
    } catch (err: any) {
      alert(err?.response?.data?.message || '新增失敗');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="card">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <h2 className="text-lg font-bold text-gray-900">
          支出記錄
          <span className="ml-2 text-sm font-normal text-gray-400">
            共 {total} 筆 ・ 合計 {fmtMoney(totalAmount)}
          </span>
        </h2>
        <button type="button" onClick={openCreateModal} className="btn-primary text-sm">
          + 新增支出
        </button>
      </div>

      {loading ? (
        <div className="py-8 text-center text-gray-500 text-sm">載入中...</div>
      ) : expenses.length === 0 ? (
        <div className="py-8 text-center text-gray-400 text-sm">
          此工程暫無支出記錄
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="bg-gray-50 border-b text-gray-500">
                <th className="px-3 py-2 text-left">日期</th>
                <th className="px-3 py-2 text-left">供應商</th>
                <th className="px-3 py-2 text-left">類別</th>
                <th className="px-3 py-2 text-left">項目</th>
                <th className="px-3 py-2 text-right">金額</th>
                <th className="px-3 py-2 text-left">付款狀態</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {expenses.map((exp: any) => {
                const st = statusMap[exp.payment_status] || {
                  label: exp.payment_status || '-',
                  color: 'bg-gray-100 text-gray-700',
                };
                const catParent = exp.category?.parent?.name || '';
                const catLabel = exp.category
                  ? catParent
                    ? `${catParent} > ${exp.category.name}`
                    : exp.category.name
                  : '-';
                return (
                  <tr
                    key={exp.id}
                    className="hover:bg-gray-50 cursor-pointer"
                    onClick={() => router.push(`/expenses/${exp.id}`)}
                  >
                    <td className="px-3 py-2 whitespace-nowrap">{fmtDate(exp.date)}</td>
                    <td className="px-3 py-2">
                      {exp.supplier?.name || exp.supplier_name || '-'}
                    </td>
                    <td className="px-3 py-2">{catLabel}</td>
                    <td className="px-3 py-2">
                      <div className="max-w-xs truncate" title={exp.item || ''}>
                        {exp.item || '-'}
                      </div>
                    </td>
                    <td className="px-3 py-2 text-right font-mono">
                      {fmtMoney(exp.total_amount)}
                    </td>
                    <td className="px-3 py-2">
                      <span
                        className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium ${st.color}`}
                      >
                        {st.label}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* ── Create expense modal ── */}
      <Modal
        isOpen={showModal}
        onClose={() => setShowModal(false)}
        title="新增支出"
        size="lg"
      >
        <form onSubmit={handleCreate} className="p-6 space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                日期 <span className="text-red-500">*</span>
              </label>
              <DateInput
                value={form.date}
                onChange={(v: any) => setForm({ ...form, date: v })}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                公司 <span className="text-red-500">*</span>
              </label>
              <select
                className="input-field"
                value={form.company_id}
                onChange={(e) => setForm({ ...form, company_id: e.target.value })}
                required
              >
                <option value="">請選擇</option>
                {companies.map((c: any) => (
                  <option key={c.id} value={c.id}>
                    {c.internal_prefix || c.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">供應商</label>
              <input
                className="input-field"
                value={form.supplier_name}
                onChange={(e) => setForm({ ...form, supplier_name: e.target.value })}
                list="project-expense-supplier-options"
                placeholder="搜尋或輸入供應商"
              />
              <datalist id="project-expense-supplier-options">
                {supplierOptions.map((p: any) => (
                  <option key={p.id} value={p.name} />
                ))}
              </datalist>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">類別</label>
              <div className="grid grid-cols-2 gap-2">
                <select
                  className="input-field"
                  value={form._parent_category_id}
                  onChange={(e) =>
                    setForm({
                      ...form,
                      _parent_category_id: e.target.value,
                      category_id: '',
                    })
                  }
                >
                  <option value="">主類別</option>
                  {categoryTree.map((c: any) => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
                <select
                  className="input-field"
                  value={form.category_id}
                  onChange={(e) => setForm({ ...form, category_id: e.target.value })}
                  disabled={!form._parent_category_id}
                >
                  <option value="">子類別</option>
                  {childCategories.map((c: any) => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
              </div>
            </div>
            <div className="sm:col-span-2">
              <label className="block text-sm font-medium text-gray-700 mb-1">項目</label>
              <input
                className="input-field"
                value={form.item}
                onChange={(e) => setForm({ ...form, item: e.target.value })}
                placeholder="支出項目描述"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                總金額 <span className="text-red-500">*</span>
              </label>
              <input
                type="number"
                step="0.01"
                min="0"
                className="input-field text-right"
                value={form.total_amount}
                onChange={(e) => setForm({ ...form, total_amount: e.target.value })}
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">付款狀態</label>
              <select
                className="input-field"
                value={form.payment_status}
                onChange={(e) => setForm({ ...form, payment_status: e.target.value })}
              >
                <option value="unpaid">未付款</option>
                <option value="partially_paid">部分付款</option>
                <option value="paid">已付款</option>
                <option value="cancelled">取消</option>
              </select>
            </div>
            <div className="sm:col-span-2">
              <label className="block text-sm font-medium text-gray-700 mb-1">備註</label>
              <textarea
                className="input-field"
                rows={2}
                value={form.remarks}
                onChange={(e) => setForm({ ...form, remarks: e.target.value })}
              />
            </div>
          </div>
          <div className="text-xs text-gray-400">
            此支出將自動關聯至當前工程項目。
          </div>
          <div className="flex justify-end gap-3 pt-4 border-t">
            <button
              type="button"
              onClick={() => setShowModal(false)}
              className="btn-secondary"
            >
              取消
            </button>
            <button type="submit" disabled={saving} className="btn-primary">
              {saving ? '儲存中...' : '建立支出'}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
