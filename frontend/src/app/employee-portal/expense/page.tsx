'use client';

import { useState, useEffect } from 'react';
import { useI18n } from '@/lib/i18n/i18n-context';
import { employeePortalApi, portalSharedApi } from '@/lib/employee-portal-api';

interface ExpenseForm {
  date: string;
  category_id: string;
  item: string;
  supplier_name: string;
  total_amount: string;
  remarks: string;
  receipt_url: string;
}

const defaultForm: ExpenseForm = {
  date: new Date().toISOString().split('T')[0],
  category_id: '',
  item: '',
  supplier_name: '',
  total_amount: '',
  remarks: '',
  receipt_url: '',
};

export default function ExpensePage() {
  const { t } = useI18n();
  const [form, setForm] = useState<ExpenseForm>(defaultForm);
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState('');
  const [error, setError] = useState('');
  const [categories, setCategories] = useState<any[]>([]);
  const [uploadingReceipt, setUploadingReceipt] = useState(false);
  const [recentExpenses, setRecentExpenses] = useState<any[]>([]);
  const [tab, setTab] = useState<'form' | 'history'>('form');

  useEffect(() => {
    portalSharedApi
      .getExpenseCategories()
      .then((res) => setCategories(res.data?.data || res.data || []))
      .catch(() => {});
    loadExpenses();
  }, []);

  const loadExpenses = async () => {
    try {
      const res = await employeePortalApi.getMyExpenses({ limit: 20 });
      setRecentExpenses(res.data?.data || []);
    } catch {}
  };

  const set = (field: keyof ExpenseForm, value: string) =>
    setForm((prev) => ({ ...prev, [field]: value }));

  const handleReceiptUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadingReceipt(true);
    try {
      const res = await employeePortalApi.uploadPhoto(file);
      if (res.data.url) set('receipt_url', res.data.url);
    } catch {}
    setUploadingReceipt(false);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    setSuccess('');
    try {
      await employeePortalApi.submitExpense({
        date: form.date,
        category_id: form.category_id || undefined,
        item: form.item,
        supplier_name: form.supplier_name || undefined,
        total_amount: parseFloat(form.total_amount) || 0,
        remarks: [
          form.remarks,
          form.receipt_url ? `單據：${form.receipt_url}` : '',
        ].filter(Boolean).join('\n') || undefined,
      });
      setSuccess(t('expenseSuccess'));
      setForm({ ...defaultForm, date: form.date });
      await loadExpenses();
    } catch (err: any) {
      setError(err.response?.data?.message || t('error'));
    } finally {
      setLoading(false);
    }
  };

  const inputClass = 'w-full px-3 py-2.5 border-2 border-gray-200 rounded-xl focus:border-blue-500 focus:ring-2 focus:ring-blue-100 outline-none transition-all text-sm bg-white';
  const labelClass = 'block text-sm font-semibold text-gray-700 mb-1';

  // Flatten categories for select
  const flatCategories: any[] = [];
  categories.forEach((cat) => {
    flatCategories.push(cat);
    if (cat.children) {
      cat.children.forEach((child: any) => flatCategories.push({ ...child, _indent: true }));
    }
  });

  const formatDate = (d: string) => new Date(d).toLocaleDateString('zh-HK');
  const formatAmount = (n: any) => `HK$ ${Number(n).toLocaleString('zh-HK', { minimumFractionDigits: 2 })}`;

  return (
    <div className="p-4 pb-6">
      <h1 className="text-xl font-bold text-gray-900 mb-4">{t('expenseTitle')}</h1>

      {/* Tab */}
      <div className="bg-white rounded-2xl p-1 shadow-sm border border-gray-100 flex mb-4">
        <button
          onClick={() => setTab('form')}
          className={`flex-1 py-2.5 rounded-xl text-sm font-bold transition-all ${tab === 'form' ? 'bg-blue-700 text-white' : 'text-gray-500'}`}
        >
          + {t('submitExpense')}
        </button>
        <button
          onClick={() => setTab('history')}
          className={`flex-1 py-2.5 rounded-xl text-sm font-bold transition-all ${tab === 'history' ? 'bg-blue-700 text-white' : 'text-gray-500'}`}
        >
          📋 {t('expenseRecords')}
        </button>
      </div>

      {tab === 'form' ? (
        <>
          {success && (
            <div className="mb-4 p-3 bg-green-50 border border-green-200 rounded-xl text-green-700 text-sm font-medium text-center">
              ✅ {success}
            </div>
          )}
          {error && (
            <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-xl text-red-700 text-sm text-center">
              ❌ {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-3">
            <div className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100 space-y-3">
              <div>
                <label className={labelClass}>{t('expenseDate')}</label>
                <input
                  type="date"
                  value={form.date}
                  onChange={(e) => set('date', e.target.value)}
                  className={inputClass}
                  required
                />
              </div>

              <div>
                <label className={labelClass}>{t('expenseCategory')}</label>
                <select
                  value={form.category_id}
                  onChange={(e) => set('category_id', e.target.value)}
                  className={inputClass + ' appearance-none'}
                >
                  <option value="">{t('selectCategory')}</option>
                  {flatCategories.map((cat) => (
                    <option key={cat.id} value={cat.id}>
                      {cat._indent ? `　${cat.name}` : cat.name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className={labelClass}>{t('expenseItem')} *</label>
                <input
                  type="text"
                  value={form.item}
                  onChange={(e) => set('item', e.target.value)}
                  className={inputClass}
                  placeholder="報銷項目"
                  required
                />
              </div>

              <div>
                <label className={labelClass}>{t('expenseSupplier')}</label>
                <input
                  type="text"
                  value={form.supplier_name}
                  onChange={(e) => set('supplier_name', e.target.value)}
                  className={inputClass}
                  placeholder={t('optional')}
                />
              </div>

              <div>
                <label className={labelClass}>{t('expenseAmount')} *</label>
                <input
                  type="number"
                  value={form.total_amount}
                  onChange={(e) => set('total_amount', e.target.value)}
                  className={inputClass}
                  placeholder="0.00"
                  min="0"
                  step="0.01"
                  required
                />
              </div>

              <div>
                <label className={labelClass}>{t('remarks')}</label>
                <textarea
                  value={form.remarks}
                  onChange={(e) => set('remarks', e.target.value)}
                  className={inputClass + ' resize-none'}
                  rows={2}
                  placeholder={t('optional')}
                />
              </div>
            </div>

            {/* Receipt Upload */}
            <div className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100">
              <h3 className="font-semibold text-gray-800 text-sm mb-3">{t('expenseReceipt')}</h3>
              {form.receipt_url ? (
                <div className="relative inline-block">
                  <img src={form.receipt_url} alt="receipt" className="w-full max-h-48 object-contain rounded-xl border" />
                  <button
                    type="button"
                    onClick={() => set('receipt_url', '')}
                    className="absolute top-2 right-2 w-7 h-7 bg-red-500 text-white rounded-full text-sm flex items-center justify-center shadow"
                  >
                    ×
                  </button>
                </div>
              ) : (
                <label className="block w-full py-6 border-2 border-dashed border-gray-300 rounded-xl text-center cursor-pointer hover:border-blue-400 transition-colors">
                  <div className="text-3xl mb-1">📷</div>
                  <p className="text-sm text-gray-500 font-medium">
                    {uploadingReceipt ? t('loading') : t('expenseReceipt')}
                  </p>
                  <input
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={handleReceiptUpload}
                    disabled={uploadingReceipt}
                  />
                </label>
              )}
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full py-4 bg-blue-700 text-white font-bold rounded-2xl text-base hover:bg-blue-800 transition-colors disabled:opacity-50 shadow-md"
            >
              {loading ? t('loading') : t('submitExpense')}
            </button>
          </form>
        </>
      ) : (
        <div className="space-y-3">
          {recentExpenses.length === 0 ? (
            <div className="bg-white rounded-2xl p-8 text-center text-gray-400 shadow-sm border border-gray-100">
              <p className="text-3xl mb-2">💰</p>
              <p className="text-sm">{t('noData')}</p>
            </div>
          ) : (
            recentExpenses.map((exp) => (
              <div key={exp.id} className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100">
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <p className="font-semibold text-gray-800 text-sm">{exp.item || '-'}</p>
                    <p className="text-xs text-gray-500 mt-0.5">
                      {formatDate(exp.date)} · {exp.category?.name || '-'}
                    </p>
                    {exp.supplier_name && (
                      <p className="text-xs text-gray-400">{exp.supplier_name}</p>
                    )}
                  </div>
                  <div className="text-right ml-3">
                    <p className="font-bold text-gray-900 text-sm">{formatAmount(exp.total_amount)}</p>
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                      Number(exp.paid_amount) > 0 ? 'bg-green-100 text-green-700' : 'bg-yellow-100 text-yellow-700'
                    }`}>
                      {Number(exp.paid_amount) > 0 ? t('paid') : t('unpaid')}
                    </span>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}
