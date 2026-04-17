'use client';
import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { subconPayrollApi, partnersApi, companiesApi, subconRateCardsApi } from '@/lib/api';
import SearchableSelect from '@/components/SearchableSelect';
import { fmtDate } from '@/lib/dateUtils';
import { useAuth } from '@/lib/auth';

type Option = { value: any; label: string };
type ExtraItem = { name: string; amount: string };

// ─── Build grouped summary from work_logs ────────────────────
function buildGroups(workLogs: any[]): any[] {
  const map = new Map<string, any>();
  for (const wl of workLogs) {
    const key = [
      wl._matched_rate_card_id ?? 'unmatched',
      wl.client?.name ?? '',
      wl.client_contract_no ?? '',
      wl.day_night ?? '',
      wl.start_location ?? '',
      wl.end_location ?? '',
      wl.tonnage ?? '',
      wl.machine_type ?? '',
      wl._matched_rate ?? '',
      wl._matched_unit ?? '',
    ].join('|');

    if (!map.has(key)) {
      map.set(key, {
        _matched_rate_card_id: wl._matched_rate_card_id,
        client_name: wl.client?.name ?? '-',
        client_contract_no: wl.client_contract_no ?? '-',
        day_night: wl.day_night ?? '-',
        start_location: wl.start_location ?? '',
        end_location: wl.end_location ?? '',
        tonnage: wl.tonnage ?? '',
        machine_type: wl.machine_type ?? '',
        matched_rate: wl._matched_rate,
        matched_unit: wl._matched_unit,
        price_match_status: wl._price_match_status,
        count: 0,
        total_quantity: 0,
        total_amount: 0,
      });
    }
    const g = map.get(key)!;
    g.count += 1;
    g.total_quantity += Number(wl.quantity) || 0;
    g.total_amount += Number(wl._total_amount) || 0;
  }
  return Array.from(map.values());
}

// ─── Grouped Display Component ────────────────────────────────
function GroupedView({ groups, extraItems }: { groups: any[]; extraItems: ExtraItem[] }) {
  if (!groups || groups.length === 0) {
    return <p className="text-sm text-gray-400 text-center py-4">沒有工作記錄</p>;
  }
  const workTotal = groups.reduce((s: number, g: any) => s + (Number(g.total_amount) || 0), 0);
  const extraTotal = extraItems.reduce((s, e) => s + (Number(e.amount) || 0), 0);
  const grandTotal = workTotal + extraTotal;

  return (
    <div className="overflow-x-auto border rounded-lg">
      <table className="w-full text-sm">
        <thead className="bg-gray-50">
          <tr>
            <th className="px-3 py-2 text-left font-medium text-gray-600">客戶</th>
            <th className="px-3 py-2 text-left font-medium text-gray-600">客戶合約</th>
            <th className="px-3 py-2 text-left font-medium text-gray-600">日/夜</th>
            <th className="px-3 py-2 text-left font-medium text-gray-600">路線</th>
            <th className="px-3 py-2 text-left font-medium text-gray-600">噸數/機種</th>
            <th className="px-3 py-2 text-right font-medium text-gray-600">單價</th>
            <th className="px-3 py-2 text-right font-medium text-gray-600">數量</th>
            <th className="px-3 py-2 text-right font-medium text-gray-600">小計</th>
          </tr>
        </thead>
        <tbody>
          {groups.map((g: any, idx: number) => {
            const route = [g.start_location, g.end_location].filter(Boolean).join(' → ');
            const hasPrice = g.price_match_status === 'matched' && g.matched_rate != null;
            return (
              <tr key={idx} className={idx % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                <td className="px-3 py-2 font-medium">{g.client_name}</td>
                <td className="px-3 py-2 text-gray-600 text-xs">{g.client_contract_no}</td>
                <td className="px-3 py-2">
                  <span className={`px-1.5 py-0.5 rounded text-xs font-medium ${
                    g.day_night === '夜' ? 'bg-indigo-100 text-indigo-700' :
                    g.day_night === '中直' ? 'bg-purple-100 text-purple-700' :
                    'bg-yellow-100 text-yellow-700'
                  }`}>{g.day_night}</span>
                </td>
                <td className="px-3 py-2 text-gray-600 text-xs">{route || '-'}</td>
                <td className="px-3 py-2 text-gray-600 text-xs">
                  {[g.tonnage, g.machine_type].filter(Boolean).join(' / ') || '-'}
                </td>
                <td className="px-3 py-2 text-right font-mono">
                  {hasPrice
                    ? `$${Number(g.matched_rate).toLocaleString()}/${g.matched_unit || '車'}`
                    : <span className="text-orange-500 text-xs">未匹配</span>}
                </td>
                <td className="px-3 py-2 text-right font-mono">{g.total_quantity > 0 ? g.total_quantity : g.count}車</td>
                <td className="px-3 py-2 text-right font-mono font-bold">
                  {hasPrice ? `$${Number(g.total_amount).toLocaleString()}` : <span className="text-orange-500">-</span>}
                </td>
              </tr>
            );
          })}
          {/* Extra items */}
          {extraItems.filter(e => e.name || e.amount).map((e, idx) => (
            <tr key={`extra-${idx}`} className="bg-blue-50">
              <td colSpan={7} className="px-3 py-2 text-blue-700 font-medium">
                <span className="text-xs bg-blue-100 text-blue-600 px-1.5 py-0.5 rounded mr-2">其他</span>
                {e.name || '（未命名）'}
              </td>
              <td className="px-3 py-2 text-right font-mono font-bold text-blue-700">
                {e.amount ? `$${Number(e.amount).toLocaleString()}` : '-'}
              </td>
            </tr>
          ))}
        </tbody>
        <tfoot className="border-t-2 border-gray-300">
          <tr className="bg-gray-50">
            <td colSpan={7} className="px-3 py-2 font-bold text-right text-gray-600">工作記錄小計</td>
            <td className="px-3 py-2 text-right font-mono font-bold">${workTotal.toLocaleString()}</td>
          </tr>
          {extraTotal > 0 && (
            <tr className="bg-gray-50">
              <td colSpan={7} className="px-3 py-2 font-bold text-right text-blue-600">其他費用小計</td>
              <td className="px-3 py-2 text-right font-mono font-bold text-blue-600">${extraTotal.toLocaleString()}</td>
            </tr>
          )}
          <tr className="bg-primary-50">
            <td colSpan={7} className="px-3 py-2 font-bold text-right text-primary-700">總計</td>
            <td className="px-3 py-2 text-right font-mono font-bold text-primary-700 text-base">
              ${grandTotal.toLocaleString()}
            </td>
          </tr>
        </tfoot>
      </table>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────
export default function SubconPayrollPage() {
  const router = useRouter();

  // ── Selection state ──
  const { isReadOnly } = useAuth();
  const [subcons, setSubcons] = useState<Option[]>([]);
  const [companies, setCompanies] = useState<Option[]>([]);
  const [selectedSubcon, setSelectedSubcon] = useState<number | null>(null);
  const [selectedCompany, setSelectedCompany] = useState<number | null>(null);
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');

  // ── Result state ──
  const [loading, setLoading] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [result, setResult] = useState<any>(null);
  const [error, setError] = useState('');

  // ── Tab state ──
  const [activeTab, setActiveTab] = useState<'grouped' | 'detail' | 'unmatched'>('grouped');

  // ── Extra items state ──
  const [extraItems, setExtraItems] = useState<ExtraItem[]>([{ name: '', amount: '' }]);

  // ── Load reference data ──
  useEffect(() => {
    Promise.all([
      partnersApi.simple(),
      companiesApi.simple(),
    ]).then(([pt, cp]) => {
      const subconList = (pt.data || [])
        .filter((p: any) => p.partner_type === 'subcontractor')
        .map((p: any) => ({ value: p.id, label: p.name }));
      setSubcons(subconList);
      setCompanies((cp.data || []).map((c: any) => ({ value: c.id, label: c.internal_prefix ? c.internal_prefix + ' ' + c.name : c.name })));
    }).catch(console.error);
  }, []);

  const handlePreview = async () => {
    if (!selectedSubcon || !dateFrom || !dateTo) {
      setError('請選擇供應商和日期範圍');
      return;
    }
    setLoading(true);
    setError('');
    setResult(null);
    try {
      const res = await subconPayrollApi.preview({
        subcon_id: selectedSubcon,
        date_from: dateFrom,
        date_to: dateTo,
        company_id: selectedCompany || undefined,
      });
      setResult(res.data);
      setActiveTab('grouped');
    } catch (err: any) {
      setError(err.response?.data?.message || '計算失敗');
    } finally {
      setLoading(false);
    }
  };

  const handleConfirm = async () => {
    if (!selectedSubcon || !dateFrom || !dateTo || !result) return;

    const validExtras = extraItems
      .filter(e => e.name && e.amount)
      .map(e => ({ name: e.name, amount: Number(e.amount) }));

    if (!confirm(`確定要確認此糧單嗎？\n總金額：$${grandTotal.toLocaleString()}\n確認後將自動產生支出記錄。`)) {
      return;
    }

    setConfirming(true);
    setError('');
    try {
      const res = await subconPayrollApi.confirm({
        subcon_id: selectedSubcon,
        date_from: dateFrom,
        date_to: dateTo,
        company_id: selectedCompany || undefined,
        extra_items: validExtras.length > 0 ? validExtras : undefined,
      });
      // Navigate to the detail page
      router.push(`/subcon-payroll/${res.data.id}`);
    } catch (err: any) {
      setError(err.response?.data?.message || '確認失敗');
    } finally {
      setConfirming(false);
    }
  };

  const handleAddRateCard = async (wl: any) => {
    try {
      await subconRateCardsApi.create({
        subcon_id: selectedSubcon,
        client_id: wl.client_id || null,
        company_id: wl.company_id || null,
        client_contract_no: wl.client_contract_no || '',
        service_type: wl.service_type || '',
        day_night: wl.day_night || '日',
        tonnage: wl.tonnage || '',
        machine_type: wl.machine_type || '',
        origin: wl.start_location || '',
        destination: wl.end_location || '',
        rate: 0,
        unit: '車',
        status: 'active',
      });
      alert('已新增供應商價目表項目，請到供應商價目表頁面設定費率後重新計算。');
    } catch (err: any) {
      alert('新增失敗：' + (err.response?.data?.message || err.message));
    }
  };

  // ── Extra items helpers ──
  const updateExtraItem = (idx: number, field: keyof ExtraItem, value: string) => {
    setExtraItems(prev => prev.map((e, i) => i === idx ? { ...e, [field]: value } : e));
  };
  const addExtraItem = () => setExtraItems(prev => [...prev, { name: '', amount: '' }]);
  const removeExtraItem = (idx: number) => setExtraItems(prev => prev.filter((_, i) => i !== idx));

  // ── Derived data ──
  const groups = result ? buildGroups(result.work_logs || []) : [];
  const extraTotal = extraItems.reduce((s, e) => s + (Number(e.amount) || 0), 0);
  const workTotal = result?.summary?.total_amount || 0;
  const grandTotal = workTotal + extraTotal;

  return (
    <div className="p-6 max-w-full">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">供應商計糧</h1>
        <button
          onClick={() => router.push('/subcon-payroll/records')}
          className="text-sm text-primary-600 hover:text-primary-700 border border-primary-300 rounded px-3 py-1.5 hover:bg-primary-50"
        >
          查看糧單記錄
        </button>
      </div>

      {/* ── Selection Panel ── */}
      <div className="bg-white rounded-lg shadow p-6 mb-6">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 items-end">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">供應商（判頭/街車）</label>
            <SearchableSelect
              options={subcons}
              value={selectedSubcon}
              onChange={(v) => setSelectedSubcon(v as number)}
              placeholder="選擇供應商..."
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">公司（可選）</label>
            <SearchableSelect
              options={companies}
              value={selectedCompany}
              onChange={(v) => setSelectedCompany(v as number | null)}
              placeholder="全部公司"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">日期範圍</label>
            <div className="flex gap-2">
              <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)}
                className="border rounded px-2 py-1.5 text-sm flex-1" />
              <span className="self-center text-gray-400">至</span>
              <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)}
                className="border rounded px-2 py-1.5 text-sm flex-1" />
            </div>
          </div>
          <div>
            <button onClick={handlePreview} disabled={loading}
              className="w-full bg-primary-600 text-white px-4 py-2 rounded hover:bg-primary-700 disabled:opacity-50 text-sm font-medium">
              {loading ? '計算中...' : '計算'}
            </button>
          </div>
        </div>
        {error && <p className="text-red-500 text-sm mt-2">{error}</p>}
      </div>

      {/* ── Extra Items Panel ── */}
      <div className="bg-white rounded-lg shadow p-6 mb-6">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-bold text-gray-700">其他項目費用</h2>
          <button onClick={addExtraItem}
            className="text-xs text-primary-600 hover:text-primary-700 border border-primary-300 rounded px-2 py-1 hover:bg-primary-50">
            + 新增項目
          </button>
        </div>
        <div className="space-y-2">
          {extraItems.map((item, idx) => (
            <div key={idx} className="flex gap-3 items-center">
              <input
                type="text"
                value={item.name}
                onChange={e => updateExtraItem(idx, 'name', e.target.value)}
                placeholder="項目名稱（例如：油費、維修費）"
                className="border rounded px-2 py-1.5 text-sm flex-1"
              />
              <div className="flex items-center gap-1">
                <span className="text-sm text-gray-500">$</span>
                <input
                  type="number"
                  value={item.amount}
                  onChange={e => updateExtraItem(idx, 'amount', e.target.value)}
                  placeholder="金額"
                  className="border rounded px-2 py-1.5 text-sm w-32"
                />
              </div>
              {extraItems.length > 1 && (
                <button onClick={() => removeExtraItem(idx)}
                  className="text-red-400 hover:text-red-600 text-lg leading-none">&times;</button>
              )}
            </div>
          ))}
        </div>
        {extraTotal > 0 && (
          <p className="text-sm text-right text-blue-600 mt-2 font-medium">
            其他費用合計：${extraTotal.toLocaleString()}
          </p>
        )}
      </div>

      {/* ── Results ── */}
      {result && (
        <>
          {/* Summary Cards */}
          <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-6">
            <div className="bg-white rounded-lg shadow p-4 text-center">
              <p className="text-sm text-gray-500">供應商</p>
              <p className="text-lg font-bold">{result.subcon?.name}</p>
            </div>
            <div className="bg-white rounded-lg shadow p-4 text-center">
              <p className="text-sm text-gray-500">車隊車輛</p>
              <p className="text-lg font-bold">{result.drivers?.length || 0}</p>
            </div>
            <div className="bg-white rounded-lg shadow p-4 text-center">
              <p className="text-sm text-gray-500">工作記錄</p>
              <p className="text-lg font-bold">{result.summary?.total || 0}</p>
            </div>
            <div className="bg-white rounded-lg shadow p-4 text-center">
              <p className="text-sm text-gray-500">已匹配 / 未匹配</p>
              <p className="text-lg font-bold">
                <span className="text-green-600">{result.summary?.matched || 0}</span>
                {' / '}
                <span className="text-red-500">{result.summary?.unmatched || 0}</span>
              </p>
            </div>
            <div className="bg-white rounded-lg shadow p-4 text-center">
              <p className="text-sm text-gray-500">總金額（含其他費用）</p>
              <p className="text-lg font-bold text-primary-600">
                ${grandTotal.toLocaleString(undefined, { minimumFractionDigits: 2 })}
              </p>
            </div>
          </div>

          {/* Confirm Button */}
          <div className="mb-6 flex justify-end">
            <button
              onClick={handleConfirm}
              disabled={confirming || grandTotal === 0}
              className="bg-green-600 text-white px-6 py-2.5 rounded-lg hover:bg-green-700 disabled:opacity-50 font-medium text-sm shadow-sm flex items-center gap-2"
            >
              {confirming ? (
                <>
                  <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" /></svg>
                  確認中...
                </>
              ) : (
                '確認糧單'
              )}
            </button>
          </div>

          {/* Tabs */}
          <div className="bg-white rounded-lg shadow">
            <div className="border-b flex">
              <button
                onClick={() => setActiveTab('grouped')}
                className={`px-6 py-3 text-sm font-medium border-b-2 transition-colors ${
                  activeTab === 'grouped' ? 'border-primary-600 text-primary-600' : 'border-transparent text-gray-500 hover:text-gray-700'
                }`}
              >
                歸組結算 ({groups.length})
              </button>
              <button
                onClick={() => setActiveTab('detail')}
                className={`px-6 py-3 text-sm font-medium border-b-2 transition-colors ${
                  activeTab === 'detail' ? 'border-primary-600 text-primary-600' : 'border-transparent text-gray-500 hover:text-gray-700'
                }`}
              >
                逐筆明細 ({result.work_logs?.length || 0})
              </button>
              <button
                onClick={() => setActiveTab('unmatched')}
                className={`px-6 py-3 text-sm font-medium border-b-2 transition-colors ${
                  activeTab === 'unmatched' ? 'border-primary-600 text-primary-600' : 'border-transparent text-gray-500 hover:text-gray-700'
                }`}
              >
                未匹配摘要 ({result.unmatched_summary?.length || 0})
              </button>
            </div>

            {/* Grouped Tab */}
            {activeTab === 'grouped' && (
              <div className="p-4">
                <GroupedView groups={groups} extraItems={extraItems.filter(e => e.name || e.amount)} />
              </div>
            )}

            {/* Detail Tab */}
            {activeTab === 'detail' && (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-3 py-2 text-left font-medium text-gray-600">#</th>
                      <th className="px-3 py-2 text-left font-medium text-gray-600">日期</th>
                      <th className="px-3 py-2 text-left font-medium text-gray-600">車牌</th>
                      <th className="px-3 py-2 text-left font-medium text-gray-600">司機</th>
                      <th className="px-3 py-2 text-left font-medium text-gray-600">客戶</th>
                      <th className="px-3 py-2 text-left font-medium text-gray-600">客戶合約</th>
                      <th className="px-3 py-2 text-left font-medium text-gray-600">服務</th>
                      <th className="px-3 py-2 text-left font-medium text-gray-600">路線</th>
                      <th className="px-3 py-2 text-left font-medium text-gray-600">噸數</th>
                      <th className="px-3 py-2 text-left font-medium text-gray-600">機種</th>
                      <th className="px-3 py-2 text-left font-medium text-gray-600">日/夜</th>
                      <th className="px-3 py-2 text-right font-medium text-gray-600">數量</th>
                      <th className="px-3 py-2 text-right font-medium text-gray-600">費率</th>
                      <th className="px-3 py-2 text-right font-medium text-gray-600">基本</th>
                      <th className="px-3 py-2 text-right font-medium text-gray-600">OT</th>
                      <th className="px-3 py-2 text-right font-medium text-gray-600">中直</th>
                      <th className="px-3 py-2 text-right font-medium text-gray-600">合計</th>
                      <th className="px-3 py-2 text-left font-medium text-gray-600">狀態</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {(result.work_logs || []).map((wl: any, i: number) => (
                      <tr key={wl.id} className={wl._price_match_status === 'unmatched' ? 'bg-red-50' : 'hover:bg-gray-50'}>
                        <td className="px-3 py-2 text-gray-400">{i + 1}</td>
                        <td className="px-3 py-2 whitespace-nowrap">{fmtDate(wl.scheduled_date)}</td>
                        <td className="px-3 py-2 font-medium">{wl.equipment_number || '-'}</td>
                        <td className="px-3 py-2">{wl._driver?.name_zh || wl.employee?.name_zh || '-'}</td>
                        <td className="px-3 py-2">{wl.client?.name || '-'}</td>
                        <td className="px-3 py-2">{wl.client_contract_no || '-'}</td>
                        <td className="px-3 py-2">{wl.service_type || '-'}</td>
                        <td className="px-3 py-2 whitespace-nowrap">
                          {[wl.start_location, wl.end_location].filter(Boolean).join(' → ') || '-'}
                        </td>
                        <td className="px-3 py-2">{wl.tonnage || '-'}</td>
                        <td className="px-3 py-2">{wl.machine_type || '-'}</td>
                        <td className="px-3 py-2">{wl.day_night || '-'}</td>
                        <td className="px-3 py-2 text-right">{wl.quantity ?? '-'}</td>
                        <td className="px-3 py-2 text-right">
                          {wl._matched_rate != null ? `$${Number(wl._matched_rate).toFixed(0)}/${wl._matched_unit || '車'}` : '-'}
                        </td>
                        <td className="px-3 py-2 text-right">{wl._line_amount ? `$${Number(wl._line_amount).toFixed(0)}` : '-'}</td>
                        <td className="px-3 py-2 text-right">{wl._ot_line_amount ? `$${Number(wl._ot_line_amount).toFixed(0)}` : '-'}</td>
                        <td className="px-3 py-2 text-right">{wl._mid_shift_line_amount ? `$${Number(wl._mid_shift_line_amount).toFixed(0)}` : '-'}</td>
                        <td className="px-3 py-2 text-right font-medium">
                          {wl._total_amount ? `$${Number(wl._total_amount).toFixed(0)}` : '-'}
                        </td>
                        <td className="px-3 py-2">
                          {wl._price_match_status === 'matched' ? (
                            <span className="text-green-600 text-xs">&#10003; 已匹配</span>
                          ) : (
                            <div className="flex items-center gap-1">
                              <span className="text-red-500 text-xs">&#10007; 未匹配</span>
                              <button
                                onClick={() => handleAddRateCard(wl)}
                                className="text-xs text-blue-600 hover:underline ml-1"
                                title="新增供應商價目表項目"
                              >
                                +新增
                              </button>
                            </div>
                          )}
                        </td>
                      </tr>
                    ))}
                    {(result.work_logs || []).length === 0 && (
                      <tr>
                        <td colSpan={18} className="px-3 py-8 text-center text-gray-400">
                          沒有找到工作記錄
                        </td>
                      </tr>
                    )}
                  </tbody>
                  {(result.work_logs || []).length > 0 && (
                    <tfoot className="bg-gray-50 font-medium">
                      <tr>
                        <td colSpan={13} className="px-3 py-2 text-right">合計：</td>
                        <td className="px-3 py-2 text-right">
                          ${(result.work_logs || []).reduce((s: number, w: any) => s + (Number(w._line_amount) || 0), 0).toLocaleString()}
                        </td>
                        <td className="px-3 py-2 text-right">
                          ${(result.work_logs || []).reduce((s: number, w: any) => s + (Number(w._ot_line_amount) || 0), 0).toLocaleString()}
                        </td>
                        <td className="px-3 py-2 text-right">
                          ${(result.work_logs || []).reduce((s: number, w: any) => s + (Number(w._mid_shift_line_amount) || 0), 0).toLocaleString()}
                        </td>
                        <td className="px-3 py-2 text-right text-primary-600">
                          ${(result.summary?.total_amount || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                        </td>
                        <td></td>
                      </tr>
                    </tfoot>
                  )}
                </table>
              </div>
            )}

            {/* Unmatched Summary Tab */}
            {activeTab === 'unmatched' && (
              <div className="p-6">
                {(result.unmatched_summary || []).length === 0 ? (
                  <p className="text-center text-gray-400 py-4">全部已匹配，沒有未匹配項目</p>
                ) : (
                  <div className="space-y-3">
                    <p className="text-sm text-gray-600 mb-4">
                      以下是未匹配的原因摘要。您可以到「供應商價目表」新增對應的費率項目後重新計算。
                    </p>
                    <table className="w-full text-sm">
                      <thead className="bg-gray-50">
                        <tr>
                          <th className="px-4 py-2 text-left font-medium text-gray-600">未匹配原因</th>
                          <th className="px-4 py-2 text-right font-medium text-gray-600">筆數</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y">
                        {(result.unmatched_summary || []).map((item: any, i: number) => (
                          <tr key={i} className="hover:bg-gray-50">
                            <td className="px-4 py-2 text-red-600">{item.reason}</td>
                            <td className="px-4 py-2 text-right font-medium">{item.count}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
