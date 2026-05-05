'use client';

import { useState, useEffect, useMemo } from 'react';
import { useI18n } from '@/lib/i18n/i18n-context';


import { employeePortalApi, portalSharedApi } from '@/lib/employee-portal-api';

interface LineItem {
  description: string;
  quantity: string;
  unit_price: string;
  amount: string;
}

interface ExpenseForm {
  date: string;
  category_id: string;
  item: string;
  supplier_name: string;
  total_amount: string;
  payment_method: string;
  payment_ref: string;
  remarks: string;
  receipt_url: string;
  expense_payment_method: 'SELF_PAID' | 'COMPANY_PAID';
  items: LineItem[];
}

const defaultForm: ExpenseForm = {
  date: new Date().toISOString().split('T')[0],
  category_id: '',
  item: '',
  supplier_name: '',
  total_amount: '',
  payment_method: '',
  payment_ref: '',
  remarks: '',
  receipt_url: '',
  expense_payment_method: 'SELF_PAID',
  items: [],
};

export default function ExpensePage() {
  const { t, lang } = useI18n();


  const [form, setForm] = useState<ExpenseForm>({ ...defaultForm });
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState('');
  const [error, setError] = useState('');
  const [categories, setCategories] = useState<any[]>([]);
  const [paymentMethods, setPaymentMethods] = useState<any[]>([]);
  const [uploadingReceipt, setUploadingReceipt] = useState(false);
  const [recentExpenses, setRecentExpenses] = useState<any[]>([]);
  const [tab, setTab] = useState<'form' | 'history'>('form');

  useEffect(() => {
    portalSharedApi
      .getExpenseCategories()
      .then((res) => setCategories(res.data?.data || res.data || []))
      .catch(() => {});
    portalSharedApi
      .getFieldOptions('payment_method')
      .then((res) => setPaymentMethods(res.data || []))
      .catch(() => {});
    loadExpenses();
  }, []);

  const loadExpenses = async () => {
    try {
      const res = await employeePortalApi.getMyExpenses({ limit: 20 });
      setRecentExpenses(res.data?.data || []);
    } catch {}
  };

  const set = <K extends keyof ExpenseForm>(field: K, value: ExpenseForm[K]) =>
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

  // Line items helpers
  const calcAmount = (qty: string, up: string) => {
    const q = parseFloat(qty) || 0;
    const u = parseFloat(up) || 0;
    return (q * u).toFixed(2);
  };

  const addItemRow = () =>
    set('items', [...form.items, { description: '', quantity: '1', unit_price: '', amount: '' }]);

  const removeItemRow = (idx: number) =>
    set('items', form.items.filter((_, i) => i !== idx));

  const updateItemRow = (idx: number, field: keyof LineItem, val: string) => {
    const items = [...form.items];
    items[idx] = { ...items[idx], [field]: val };
    if (field === 'quantity' || field === 'unit_price') {
      items[idx].amount = calcAmount(
        field === 'quantity' ? val : items[idx].quantity,
        field === 'unit_price' ? val : items[idx].unit_price,
      );
    }
    set('items', items);
  };

  const itemsTotal = useMemo(
    () => form.items.reduce((s, i) => s + (parseFloat(i.amount) || 0), 0),
    [form.items],
  );

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    setSuccess('');
    try {
      const total = itemsTotal > 0 ? itemsTotal : parseFloat(form.total_amount) || 0;
      const remarkParts = [
        form.remarks,        form.receipt_url ? `${t('expenseReceipt')}: ${form.receipt_url}` : 
'',
      ].filter(Boolean);

      const payload: any = {
        date: form.date,
        category_id: form.category_id || undefined,
        item: form.item,
        supplier_name: form.supplier_name || undefined,
        total_amount: total,
        payment_method: form.payment_method || undefined,
        payment_ref: form.payment_ref || undefined,
        remarks: remarkParts.join('\n') || undefined,
        expense_payment_method: form.expense_payment_method,
      };

      // Add line items if any
      if (form.items.length > 0) {
        payload.items = form.items
          .filter((i) => i.description.trim())
          .map((i) => ({
            description: i.description,
            quantity: parseFloat(i.quantity) || 1,
            unit_price: parseFloat(i.unit_price) || 0,
            amount: parseFloat(i.amount) || 0,
          }));
      }

      await employeePortalApi.submitExpense(payload);
      setSuccess(t('expenseSuccess'));
      setForm({ ...defaultForm, date: form.date });
      await loadExpenses();
    } catch (err: any) {
      setError(err.response?.data?.message || t('error'));
    } finally {
      setLoading(false);
    }
  };

  const inputClass =
    'w-full px-3 py-2.5 border-2 border-gray-200 rounded-xl focus:border-blue-500 focus:ring-2 focus:ring-blue-100 outline-none transition-all text-sm bg-white';
  const labelClass = 'block text-sm font-semibold text-gray-700 mb-1';

  // Flatten categories for select
  const flatCategories: any[] = [];
  categories.forEach((cat) => {
    flatCategories.push(cat);
    if (cat.children) {
      cat.children.forEach((child: any) => flatCategories.push({ ...child, _indent: true }));
    }
  });

  const activePaymentMethods = paymentMethods.filter((m: any) => m.is_active !== false);

  const formatDate = (d: string) => {
    try { return new Date(d).toLocaleDateString(lang === 'zh' ? 'zh-HK' : 'en-US'); } catch { return d; }
  };
  const formatAmount = (n: any) =>
    `HK$ ${Number(n).toLocaleString(lang === 'zh' ? 'zh-HK' : 'en-US', { minimumFractionDigits: 2 })}`;

  const paymentMethodLabel = (method: 'SELF_PAID' | 'COMPANY_PAID') =>
    method === 'SELF_PAID' ? t('selfPaid') : t('companyPaid');

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
            {/* Basic Info */}
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
                      {cat._indent ? `　${t(cat.name as any) || cat.name}` : (t(cat.name as any) || cat.name)}
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
                  placeholder={t("expenseItemDesc")}
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
            </div>

            {/* Payment Info */}
            <div className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100 space-y-3">
              <h3 className="font-semibold text-gray-800 text-sm">{t("paymentInfo")}</h3>

              {/* Expense Payment Method (SELF_PAID / COMPANY_PAID) */}
              <div>
                <label className={labelClass}>{t("paymentType")} *</label>
                <div className="flex gap-3">
                  <label
                    className={`flex-1 flex items-center gap-2 p-3 rounded-xl border-2 cursor-pointer transition-all ${
                      form.expense_payment_method === 'SELF_PAID'
                        ? 'border-blue-500 bg-blue-50'
                        : 'border-gray-200 bg-white'
                    }`}
                  >
                    <input
                      type="radio"
                      name="expense_payment_method"
                      value="SELF_PAID"
                      checked={form.expense_payment_method === 'SELF_PAID'}
                      onChange={() => set('expense_payment_method', 'SELF_PAID')}
                      className="accent-blue-600"
                    />
                    <div>
                      <p className="text-sm font-semibold text-gray-800">{t("selfPaid")}</p>
                      <p className="text-xs text-gray-500">{t("selfPaidDesc")}</p>
                    </div>
                  </label>
                  <label
                    className={`flex-1 flex items-center gap-2 p-3 rounded-xl border-2 cursor-pointer transition-all ${
                      form.expense_payment_method === 'COMPANY_PAID'
                        ? 'border-green-500 bg-green-50'
                        : 'border-gray-200 bg-white'
                    }`}
                  >
                    <input
                      type="radio"
                      name="expense_payment_method"
                      value="COMPANY_PAID"
                      checked={form.expense_payment_method === 'COMPANY_PAID'}
                      onChange={() => set('expense_payment_method', 'COMPANY_PAID')}
                      className="accent-green-600"
                    />
                    <div>
                      <p className="text-sm font-semibold text-gray-800">{t("companyPaid")}</p>
                      <p className="text-xs text-gray-500">{t("companyPaidDesc")}</p>
                    </div>
                  </label>
                </div>
              </div>

              {/* Payment Method */}
              <div>
                <label className={labelClass}>{t('expensePaymentMethod')}</label>
                {activePaymentMethods.length > 0 ? (
                  <select
                    value={form.payment_method}
                    onChange={(e) => set('payment_method', e.target.value)}
                    className={inputClass + ' appearance-none'}
                  >
                    <option value="">{t('optional')}</option>
                    {activePaymentMethods.map((m: any) => (
                      <option key={m.id} value={m.label}>{t(m.label as any) || m.label}</option>
                    ))}
                  </select>
                ) : (
                  <input
                    type="text"
                    value={form.payment_method}
                    onChange={(e) => set('payment_method', e.target.value)}
                    className={inputClass}
                    placeholder={t("chequeCashBankTransfer")}
                  />
                )}
              </div>

              <div>
                <label className={labelClass}>{t('expensePaymentRef')}</label>
                <input
                  type="text"
                  value={form.payment_ref}
                  onChange={(e) => set('payment_ref', e.target.value)}
                  className={inputClass}
                  placeholder={t("receiptChequeNo")}
                />
              </div>
            </div>

            {/* Line Items */}
            <div className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100 space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="font-semibold text-gray-800 text-sm">{t('expenseLineItems')}</h3>
                <button
                  type="button"
                  onClick={addItemRow}
                  className="text-xs text-blue-600 font-semibold py-1 px-2 rounded-lg bg-blue-50 hover:bg-blue-100 transition-colors"
                >
                  + {t('addLineItem')}
                </button>
              </div>

              {form.items.length > 0 ? (
                <div className="space-y-2">
                  {form.items.map((item, idx) => (
                    <div key={idx} className="border border-gray-200 rounded-xl p-3 space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-medium text-gray-500">{t("itemNo").replace('{idx}', String(idx + 1))}</span>
                        <button
                          type="button"
                          onClick={() => removeItemRow(idx)}
                          className="text-red-400 hover:text-red-600 text-lg leading-none"
                        >
                          ×
                        </button>
                      </div>
                      <input
                        type="text"
                        value={item.description}
                        onChange={(e) => updateItemRow(idx, 'description', e.target.value)}
                        className={inputClass}
                        placeholder={t("itemDesc")}
                      />
                      <div className="grid grid-cols-3 gap-2">
                        <div>
                          <label className="block text-xs text-gray-500 mb-1">{t("quantity")}</label>
                          <input
                            type="number"
                            step="0.001"
                            value={item.quantity}
                            onChange={(e) => updateItemRow(idx, 'quantity', e.target.value)}
                            className={inputClass}
                          />
                        </div>
                        <div>
                          <label className="block text-xs text-gray-500 mb-1">{t("unitPrice")}</label>
                          <input
                            type="number"
                            step="0.01"
                            value={item.unit_price}
                            onChange={(e) => updateItemRow(idx, 'unit_price', e.target.value)}
                            className={inputClass}
                            placeholder="0.00"
                          />
                        </div>
                        <div>
                          <label className="block text-xs text-gray-500 mb-1">{t("amount")}</label>
                          <input
                            type="number"
                            step="0.01"
                            value={item.amount}
                            onChange={(e) => updateItemRow(idx, 'amount', e.target.value)}
                            className={inputClass}
                            placeholder={t("auto")}
                          />
                        </div>
                      </div>
                    </div>
                  ))}
                  {/* Items total */}
                  <div className="flex justify-between items-center pt-2 border-t border-gray-100">
                    <span className="text-sm font-semibold text-gray-700">{t("itemsTotal")}</span>
                    <span className="text-sm font-bold text-gray-900">{formatAmount(itemsTotal)}</span>
                  </div>
                </div>
              ) : (
                /* If no line items, show total amount field */
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
                    required={form.items.length === 0}
                  />
                </div>
              )}
            </div>

            {/* Remarks */}
            <div className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100">
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
                <div className="relative inline-block w-full">
                  <img
                    src={form.receipt_url}
                    alt="receipt"
                    className="w-full max-h-48 object-contain rounded-xl border"
                  />
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
                    {exp.payment_method && (
                      <p className="text-xs text-gray-400 mt-0.5">
                        {t("payment")}{exp.payment_method}
                        {exp.payment_ref ? ` (${exp.payment_ref})` : ''}
                      </p>
                    )}
                    {exp.expense_payment_method && (
                      <span
                        className={`inline-block text-xs px-2 py-0.5 rounded-full font-medium mt-0.5 ${
                          exp.expense_payment_method === 'SELF_PAID'
                            ? 'bg-blue-100 text-blue-700'
                            : 'bg-green-100 text-green-700'
                        }`}
                      >
                        {paymentMethodLabel(exp.expense_payment_method)}
                      </span>
                    )}
                    {exp.items && exp.items.length > 0 && (
                      <p className="text-xs text-blue-500 mt-0.5">{exp.items.length} {t("lineItems")}</p>
                    )}
                  </div>
                  <div className="text-right ml-3 shrink-0">
                    <p className="font-bold text-gray-900 text-sm">{formatAmount(exp.total_amount)}</p>
                    <span
                      className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                        exp.is_paid ? 'bg-green-100 text-green-700' : 'bg-yellow-100 text-yellow-700'
                      }`}
                    >
                      {exp.is_paid ? t('paid') : t('unpaid')}
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
