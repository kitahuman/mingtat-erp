'use client';

import React, { useState, useEffect, useCallback } from 'react';
import Modal from '@/components/Modal';
import {
  projectFinanceApi,
  projectCostRatesApi,
  fieldOptionsApi,
} from '@/lib/api';

const fmtMoney = (v: any): string =>
  Number(v || 0).toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

const categoryLabels: Record<string, string> = {
  worker: '工人',
  machinery: '機械',
  vehicle: '車輛',
  tool: '工具',
};

const categoryColors: Record<string, string> = {
  worker: 'bg-blue-100 text-blue-700',
  machinery: 'bg-purple-100 text-purple-700',
  vehicle: 'bg-orange-100 text-orange-700',
  tool: 'bg-teal-100 text-teal-700',
};

type RateForm = {
  id?: number;
  category: string;
  type: string;
  day_rate: string;
  ot_rate: string;
  remarks: string;
};

export default function ProjectFinancialStatement({
  projectId,
}: {
  projectId: number;
}) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [data, setData] = useState<any>(null);

  // ── Rate settings modal ──
  const [showRatesModal, setShowRatesModal] = useState(false);
  const [rates, setRates] = useState<any[]>([]);
  const [rateForms, setRateForms] = useState<RateForm[]>([]);
  const [savingRates, setSavingRates] = useState(false);
  const [workerTypeOptions, setWorkerTypeOptions] = useState<string[]>([]);
  const [machineTypeOptions, setMachineTypeOptions] = useState<string[]>([]);

  const load = useCallback(() => {
    setLoading(true);
    projectFinanceApi
      .financialStatement(projectId)
      .then((res) => {
        setData(res.data);
        setError('');
      })
      .catch((err: any) =>
        setError(err?.response?.data?.message || '載入財務報表失敗'),
      )
      .finally(() => setLoading(false));
  }, [projectId]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    fieldOptionsApi
      .getByCategory('worker_type')
      .then((r) =>
        setWorkerTypeOptions(
          (r.data || [])
            .filter((o: any) => o.is_active !== false)
            .map((o: any) => o.label),
        ),
      )
      .catch(() => {});
    fieldOptionsApi
      .getByCategory('machine_type')
      .then((r) =>
        setMachineTypeOptions(
          (r.data || [])
            .filter((o: any) => o.is_active !== false)
            .map((o: any) => o.label),
        ),
      )
      .catch(() => {});
  }, []);

  const openRatesModal = async () => {
    try {
      const res = await projectCostRatesApi.list(projectId);
      const existing = res.data || [];
      setRates(existing);

      // Build forms: existing rates + unmatched resources from statement
      const forms: RateForm[] = existing.map((r: any) => ({
        id: r.id,
        category: r.project_cost_rate_category,
        type: r.project_cost_rate_type,
        day_rate: String(Number(r.project_cost_rate_day_rate || 0)),
        ot_rate: String(Number(r.project_cost_rate_ot_rate || 0)),
        remarks: r.project_cost_rate_remarks || '',
      }));
      const existingKeys = new Set(
        forms.map((f) => `${f.category}||${f.type}`),
      );
      for (const res2 of data?.expense?.resources || []) {
        const key = `${res2.category}||${res2.type}`;
        if (!existingKeys.has(key) && res2.type) {
          existingKeys.add(key);
          forms.push({
            category: res2.category,
            type: res2.type,
            day_rate: '0',
            ot_rate: '0',
            remarks: '',
          });
        }
      }
      setRateForms(forms);
      setShowRatesModal(true);
    } catch (err: any) {
      alert(err?.response?.data?.message || '載入單價設定失敗');
    }
  };

  const updateForm = (idx: number, patch: Partial<RateForm>) => {
    setRateForms((prev) =>
      prev.map((f, i) => (i === idx ? { ...f, ...patch } : f)),
    );
  };

  const addForm = () => {
    setRateForms((prev) => [
      ...prev,
      { category: 'worker', type: '', day_rate: '0', ot_rate: '0', remarks: '' },
    ]);
  };

  const removeForm = async (idx: number) => {
    const form = rateForms[idx];
    if (form.id) {
      if (!confirm(`確定刪除「${categoryLabels[form.category] || form.category} - ${form.type}」的單價設定？`)) return;
      try {
        await projectCostRatesApi.delete(projectId, form.id);
      } catch (err: any) {
        alert(err?.response?.data?.message || '刪除失敗');
        return;
      }
    }
    setRateForms((prev) => prev.filter((_, i) => i !== idx));
  };

  const saveRates = async () => {
    const valid = rateForms.filter((f) => f.type.trim());
    if (valid.length === 0) {
      setShowRatesModal(false);
      return;
    }
    // Detect duplicate keys
    const seen = new Set<string>();
    for (const f of valid) {
      const key = `${f.category}||${f.type.trim()}`;
      if (seen.has(key)) {
        alert(`重複的項目：${categoryLabels[f.category] || f.category} - ${f.type}`);
        return;
      }
      seen.add(key);
    }
    setSavingRates(true);
    try {
      await projectCostRatesApi.batchUpsert(
        projectId,
        valid.map((f) => ({
          category: f.category,
          type: f.type.trim(),
          day_rate: Number(f.day_rate) || 0,
          ot_rate: Number(f.ot_rate) || 0,
          remarks: f.remarks.trim() || null,
        })),
      );
      setShowRatesModal(false);
      load();
    } catch (err: any) {
      alert(err?.response?.data?.message || '儲存失敗');
    } finally {
      setSavingRates(false);
    }
  };

  const typeOptionsFor = (category: string): string[] => {
    if (category === 'worker') return workerTypeOptions;
    if (category === 'machinery' || category === 'vehicle')
      return machineTypeOptions;
    return [];
  };

  if (loading) {
    return (
      <div className="py-10 text-center text-gray-500 text-sm">載入中...</div>
    );
  }
  if (error) {
    return <div className="py-10 text-center text-red-500 text-sm">{error}</div>;
  }
  if (!data) return null;

  const { income, expense, gross_profit } = data;
  const grossPositive = Number(gross_profit) >= 0;

  return (
    <div className="space-y-6">
      {/* Header + actions */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-lg font-bold text-gray-900">財務報表 Financial Statement</h2>
        <button type="button" onClick={openRatesModal} className="btn-secondary text-sm">
          單價設定
        </button>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="card">
          <div className="text-sm text-gray-500">總收入 Total Income</div>
          <div className="mt-1 text-2xl font-bold text-green-700 font-mono">
            {fmtMoney(income.total)}
          </div>
        </div>
        <div className="card">
          <div className="text-sm text-gray-500">總支出 Total Expense</div>
          <div className="mt-1 text-2xl font-bold text-red-700 font-mono">
            {fmtMoney(expense.total)}
          </div>
        </div>
        <div className="card">
          <div className="text-sm text-gray-500">毛利 Gross Profit</div>
          <div
            className={`mt-1 text-2xl font-bold font-mono ${grossPositive ? 'text-blue-700' : 'text-red-700'}`}
          >
            {fmtMoney(gross_profit)}
          </div>
        </div>
      </div>

      {/* Income breakdown */}
      <div className="card">
        <h3 className="text-base font-semibold text-gray-900 mb-3">收入 Income</h3>
        <table className="min-w-full text-sm">
          <tbody className="divide-y divide-gray-100">
            <tr>
              <td className="px-3 py-2 text-gray-700">
                IPA 已認證金額（累計）
                {income.latest_ipa && (
                  <span className="ml-2 text-xs text-gray-400">
                    最新認證期：IPA{income.latest_ipa.pa_no}
                    {income.latest_ipa.reference ? `（${income.latest_ipa.reference}）` : ''}
                  </span>
                )}
              </td>
              <td className="px-3 py-2 text-right font-mono text-gray-800 w-44">
                {fmtMoney(income.ipa_certified)}
              </td>
            </tr>
            <tr>
              <td className="px-3 py-2 text-gray-700">收款記錄 Payment In（累計）</td>
              <td className="px-3 py-2 text-right font-mono text-gray-800">
                {fmtMoney(income.payment_received)}
              </td>
            </tr>
            <tr className="bg-gray-50 font-semibold">
              <td className="px-3 py-2 text-gray-900">總收入 Total Income</td>
              <td className="px-3 py-2 text-right font-mono text-green-700">
                {fmtMoney(income.total)}
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      {/* Expense breakdown */}
      <div className="card">
        <h3 className="text-base font-semibold text-gray-900 mb-3">支出 Expense</h3>
        <table className="min-w-full text-sm">
          <tbody className="divide-y divide-gray-100">
            <tr>
              <td className="px-3 py-2 text-gray-700">
                支出記錄 Expense
                <span className="ml-2 text-xs text-gray-400">
                  共 {expense.expense_count} 筆
                </span>
              </td>
              <td className="px-3 py-2 text-right font-mono text-gray-800 w-44">
                {fmtMoney(expense.expense_total)}
              </td>
            </tr>
            <tr>
              <td className="px-3 py-2 text-gray-700">
                日報表資源成本（內部單價）
                {expense.unmatched_count > 0 && (
                  <span className="ml-2 text-xs text-amber-600">
                    有 {expense.unmatched_count} 項資源未設定單價
                  </span>
                )}
              </td>
              <td className="px-3 py-2 text-right font-mono text-gray-800">
                {fmtMoney(expense.daily_report_cost)}
              </td>
            </tr>
            {(['worker', 'machinery', 'vehicle', 'tool'] as const).map(
              (cat) =>
                Number(expense.category_costs?.[cat] || 0) > 0 && (
                  <tr key={cat} className="text-gray-500">
                    <td className="px-3 py-2 pl-8">
                      <span
                        className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium mr-2 ${categoryColors[cat]}`}
                      >
                        {categoryLabels[cat]}
                      </span>
                      成本小計
                    </td>
                    <td className="px-3 py-2 text-right font-mono">
                      {fmtMoney(expense.category_costs[cat])}
                    </td>
                  </tr>
                ),
            )}
            <tr className="bg-gray-50 font-semibold">
              <td className="px-3 py-2 text-gray-900">總支出 Total Expense</td>
              <td className="px-3 py-2 text-right font-mono text-red-700">
                {fmtMoney(expense.total)}
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      {/* Daily report resource detail */}
      <div className="card">
        <h3 className="text-base font-semibold text-gray-900 mb-3">
          日報表資源成本明細
          <span className="ml-2 text-xs font-normal text-gray-400">
            （已提交日報表 × 內部成本單價）
          </span>
        </h3>
        {(expense.resources || []).length === 0 ? (
          <div className="py-6 text-center text-gray-400 text-sm">
            暫無已提交的日報表資源記錄
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="bg-gray-50 border-b text-gray-500">
                  <th className="px-3 py-2 text-left">類別</th>
                  <th className="px-3 py-2 text-left">類型 / 內容</th>
                  <th className="px-3 py-2 text-right">數量</th>
                  <th className="px-3 py-2 text-right">OT 時數</th>
                  <th className="px-3 py-2 text-right">日單價</th>
                  <th className="px-3 py-2 text-right">OT 單價</th>
                  <th className="px-3 py-2 text-right">日成本</th>
                  <th className="px-3 py-2 text-right">OT 成本</th>
                  <th className="px-3 py-2 text-right">總成本</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {(expense.resources || []).map((res: any, idx: number) => (
                  <tr key={idx} className={res.matched ? 'hover:bg-gray-50' : 'bg-amber-50/60 hover:bg-amber-50'}>
                    <td className="px-3 py-2">
                      <span
                        className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium ${categoryColors[res.category] || 'bg-gray-100 text-gray-700'}`}
                      >
                        {categoryLabels[res.category] || res.category}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-gray-700">
                      {res.type || res.content || '-'}
                      {!res.matched && (
                        <span className="ml-2 text-xs text-amber-600">未設定單價</span>
                      )}
                    </td>
                    <td className="px-3 py-2 text-right font-mono">{res.total_quantity}</td>
                    <td className="px-3 py-2 text-right font-mono">{res.total_ot_hours}</td>
                    <td className="px-3 py-2 text-right font-mono">{fmtMoney(res.day_rate)}</td>
                    <td className="px-3 py-2 text-right font-mono">{fmtMoney(res.ot_rate)}</td>
                    <td className="px-3 py-2 text-right font-mono">{fmtMoney(res.day_cost)}</td>
                    <td className="px-3 py-2 text-right font-mono">{fmtMoney(res.ot_cost)}</td>
                    <td className="px-3 py-2 text-right font-mono font-semibold">
                      {fmtMoney(res.total_cost)}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="bg-gray-50 font-semibold border-t">
                  <td className="px-3 py-2" colSpan={8}>合計</td>
                  <td className="px-3 py-2 text-right font-mono">
                    {fmtMoney(expense.daily_report_cost)}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </div>

      {/* ── Rate settings modal ── */}
      <Modal
        isOpen={showRatesModal}
        onClose={() => setShowRatesModal(false)}
        title="內部成本單價設定"
        size="xl"
      >
        <div className="p-6 space-y-4">
          <p className="text-xs text-gray-500">
            此單價為內部成本價，用於財務報表計算日報表資源成本，與客戶價目表（RateCard）互相獨立。
          </p>
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="bg-gray-50 border-b text-gray-500">
                  <th className="px-2 py-2 text-left w-28">類別</th>
                  <th className="px-2 py-2 text-left">類型</th>
                  <th className="px-2 py-2 text-right w-32">日單價</th>
                  <th className="px-2 py-2 text-right w-32">OT 單價（/小時）</th>
                  <th className="px-2 py-2 text-left w-40">備註</th>
                  <th className="px-2 py-2 w-12"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {rateForms.map((form, idx) => {
                  const options = typeOptionsFor(form.category);
                  return (
                    <tr key={idx}>
                      <td className="px-2 py-1.5">
                        <select
                          className="input-field text-sm py-1.5"
                          value={form.category}
                          onChange={(e) => updateForm(idx, { category: e.target.value })}
                          disabled={!!form.id}
                        >
                          {Object.entries(categoryLabels).map(([v, l]) => (
                            <option key={v} value={v}>{l}</option>
                          ))}
                        </select>
                      </td>
                      <td className="px-2 py-1.5">
                        <input
                          className="input-field text-sm py-1.5"
                          value={form.type}
                          onChange={(e) => updateForm(idx, { type: e.target.value })}
                          list={options.length > 0 ? `type-options-${idx}` : undefined}
                          placeholder={form.category === 'worker' ? '工人類型' : form.category === 'tool' ? '工具名稱' : '機械/車輛類型'}
                          disabled={!!form.id}
                        />
                        {options.length > 0 && (
                          <datalist id={`type-options-${idx}`}>
                            {options.map((o) => (
                              <option key={o} value={o} />
                            ))}
                          </datalist>
                        )}
                      </td>
                      <td className="px-2 py-1.5">
                        <input
                          type="number"
                          step="0.01"
                          min="0"
                          className="input-field text-sm py-1.5 text-right"
                          value={form.day_rate}
                          onChange={(e) => updateForm(idx, { day_rate: e.target.value })}
                        />
                      </td>
                      <td className="px-2 py-1.5">
                        <input
                          type="number"
                          step="0.01"
                          min="0"
                          className="input-field text-sm py-1.5 text-right"
                          value={form.ot_rate}
                          onChange={(e) => updateForm(idx, { ot_rate: e.target.value })}
                        />
                      </td>
                      <td className="px-2 py-1.5">
                        <input
                          className="input-field text-sm py-1.5"
                          value={form.remarks}
                          onChange={(e) => updateForm(idx, { remarks: e.target.value })}
                        />
                      </td>
                      <td className="px-2 py-1.5 text-center">
                        <button
                          type="button"
                          onClick={() => removeForm(idx)}
                          className="text-red-400 hover:text-red-600"
                          title="刪除"
                        >
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                          </svg>
                        </button>
                      </td>
                    </tr>
                  );
                })}
                {rateForms.length === 0 && (
                  <tr>
                    <td colSpan={6} className="px-3 py-6 text-center text-gray-400">
                      尚未設定任何單價，點擊下方「新增一行」開始設定。
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          <button type="button" onClick={addForm} className="btn-secondary text-sm">
            + 新增一行
          </button>
          <div className="flex justify-end gap-3 pt-4 border-t">
            <button
              type="button"
              onClick={() => setShowRatesModal(false)}
              className="btn-secondary"
            >
              取消
            </button>
            <button
              type="button"
              onClick={saveRates}
              disabled={savingRates}
              className="btn-primary"
            >
              {savingRates ? '儲存中...' : '儲存'}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
