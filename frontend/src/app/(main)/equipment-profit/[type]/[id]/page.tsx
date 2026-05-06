'use client';

import { useState, useEffect } from 'react';
import DateInput from '@/components/DateInput';

import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { equipmentProfitApi } from '@/lib/api';

interface WorkLogRow {
  id: number;
  scheduled_date: string | null;
  service_type: string | null;
  machine_type: string | null;
  equipment_number: string | null;
  day_night: string | null;
  start_location: string | null;
  end_location: string | null;
  quantity: number | null;
  unit: string | null;
  ot_quantity: number | null;
  ot_unit: string | null;
  matched_rate: number | null;
  matched_ot_rate: number | null;
  line_amount: number;
  client_name: string | null;
  employee_name: string | null;
}

interface ExpenseRow {
  id: number;
  date: string;
  item: string | null;
  category_name: string | null;
  supplier_name: string | null;
  total_amount: number;
  remarks: string | null;
}

interface DetailData {
  equipment_type: string;
  equipment_id: number;
  equipment_code: string;
  machine_type: string | null;
  tonnage: number | null;
  brand: string | null;
  model: string | null;
  status: string;
  owner_company: string | null;
  commission_percentage: number;
  gross_revenue: number;
  company_revenue: number;
  total_expense: number;
  profit_loss: number;
  work_logs: WorkLogRow[];
  expenses: ExpenseRow[];
}

function formatMoney(n: number): string {
  if (n === 0) return '$0.00';
  const prefix = n < 0 ? '-$' : '$';
  return prefix + Math.abs(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export default function EquipmentProfitDetailPage() {
  const params = useParams();
  const router = useRouter();
  const searchParams = useSearchParams();
  const type = params.type as string;
  const id = Number(params.id);

  const dateFromParam = searchParams.get('date_from') || '';
  const dateToParam = searchParams.get('date_to') || '';

  const [dateFrom, setDateFrom] = useState(dateFromParam);
  const [dateTo, setDateTo] = useState(dateToParam);
  const [data, setData] = useState<DetailData | null>(null);
  const [loading, setLoading] = useState(true);
  const [commission, setCommission] = useState<string>('100');
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState('');

  useEffect(() => {
    loadData();
  }, [type, id, dateFrom, dateTo]);

  const loadData = async () => {
    try {
      setLoading(true);
      const res = await equipmentProfitApi.getDetails(type, id, {
        date_from: dateFrom || undefined,
        date_to: dateTo || undefined,
      });
      const d = res.data.data as DetailData;
      setData(d);
      setCommission(String(d.commission_percentage));
    } catch (err) {
      console.error('載入失敗', err);
    } finally {
      setLoading(false);
    }
  };

  const handleSaveCommission = async () => {
    const val = parseFloat(commission);
    if (isNaN(val) || val < 0 || val > 100) {
      setSaveMsg('請輸入 0-100 的數字');
      return;
    }
    try {
      setSaving(true);
      await equipmentProfitApi.updateCommission(type, id, val);
      setSaveMsg('已儲存');
      loadData();
      setTimeout(() => setSaveMsg(''), 2000);
    } catch (err) {
      console.error('儲存失敗', err);
      setSaveMsg('儲存失敗');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <div className="p-8 text-center text-gray-500">載入中...</div>;
  }

  if (!data) {
    return <div className="p-8 text-center text-red-500">找不到資料</div>;
  }

  return (
    <div className="space-y-6">
      {/* Header with back button */}
      <div className="flex items-center gap-4">
        <button
          onClick={() => router.push(`/equipment-profit?date_from=${dateFrom}&date_to=${dateTo}`)}
          className="text-gray-500 hover:text-gray-700 transition-colors"
        >
          <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
        </button>
        <div>
          <h1 className="text-2xl font-bold text-gray-900">
            {data.equipment_code}
            <span className={`ml-3 inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
              type === 'machinery' ? 'bg-purple-100 text-purple-800' : 'bg-blue-100 text-blue-800'
            }`}>
              {type === 'machinery' ? '機械' : '車輛'}
            </span>
          </h1>
          <p className="text-sm text-gray-500 mt-1">
            {data.machine_type || '-'} {data.tonnage != null ? `| ${data.tonnage}T` : ''} {data.brand ? `| ${data.brand}` : ''} {data.model ? data.model : ''}
          </p>
        </div>
      </div>

      {/* Date filter */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4">
        <div className="flex flex-wrap gap-4 items-end">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">開始日期</label>
            <DateInput
              value={dateFrom}
              onChange={val => setDateFrom(val || '')}
              className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">結束日期</label>
            <DateInput
              value={dateTo}
              onChange={val => setDateTo(val || '')}
              className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
            />
          </div>
        </div>
      </div>

      {/* Equipment Info + Commission + Summary */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Equipment Info */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-5">
          <h3 className="text-sm font-semibold text-gray-500 uppercase mb-3">基本資料</h3>
          <dl className="space-y-2 text-sm">
            <div className="flex justify-between">
              <dt className="text-gray-500">編號/車牌</dt>
              <dd className="font-medium text-gray-900">{data.equipment_code}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-gray-500">機型</dt>
              <dd className="font-medium text-gray-900">{data.machine_type || '-'}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-gray-500">噸數</dt>
              <dd className="font-medium text-gray-900">{data.tonnage != null ? `${data.tonnage}T` : '-'}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-gray-500">品牌</dt>
              <dd className="font-medium text-gray-900">{data.brand || '-'}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-gray-500">型號</dt>
              <dd className="font-medium text-gray-900">{data.model || '-'}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-gray-500">所屬公司</dt>
              <dd className="font-medium text-gray-900">{data.owner_company || '-'}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-gray-500">狀態</dt>
              <dd>
                <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
                  data.status === 'active' ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-800'
                }`}>
                  {data.status === 'active' ? '使用中' : data.status}
                </span>
              </dd>
            </div>
          </dl>
        </div>

        {/* Commission Setting */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-5">
          <h3 className="text-sm font-semibold text-gray-500 uppercase mb-3">分成比例設定</h3>
          <div className="flex items-center gap-3 mb-3">
            <input
              type="number"
              min="0"
              max="100"
              step="0.01"
              value={commission}
              onChange={(e) => setCommission(e.target.value)}
              className="border border-gray-300 rounded-lg px-3 py-2 text-sm w-24 focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
            />
            <span className="text-sm text-gray-500">%</span>
            <button
              onClick={handleSaveCommission}
              disabled={saving}
              className="bg-primary-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-primary-700 disabled:opacity-50 transition-colors"
            >
              {saving ? '儲存中...' : '儲存'}
            </button>
          </div>
          {saveMsg && (
            <p className={`text-sm ${saveMsg === '已儲存' ? 'text-green-600' : 'text-red-600'}`}>{saveMsg}</p>
          )}
          <p className="text-xs text-gray-400 mt-2">
            公司收入 = 毛收入 × 分成比例%
          </p>
        </div>

        {/* P&L Summary */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-5">
          <h3 className="text-sm font-semibold text-gray-500 uppercase mb-3">損益摘要</h3>
          <dl className="space-y-3 text-sm">
            <div className="flex justify-between">
              <dt className="text-gray-500">毛收入</dt>
              <dd className="font-bold text-blue-600">{formatMoney(data.gross_revenue)}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-gray-500">分成比例</dt>
              <dd className="font-medium">{data.commission_percentage}%</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-gray-500">公司收入</dt>
              <dd className="font-bold text-blue-600">{formatMoney(data.company_revenue)}</dd>
            </div>
            <div className="flex justify-between border-t pt-2">
              <dt className="text-gray-500">支出合計</dt>
              <dd className="font-bold text-orange-600">{formatMoney(data.total_expense)}</dd>
            </div>
            <div className="flex justify-between border-t pt-2">
              <dt className="text-gray-500 font-semibold">損益</dt>
              <dd className={`text-lg font-bold ${data.profit_loss >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                {formatMoney(data.profit_loss)}
              </dd>
            </div>
          </dl>
        </div>
      </div>

      {/* Work Logs Table */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-200">
          <h3 className="text-lg font-semibold text-gray-900">
            出勤收入明細
            <span className="ml-2 text-sm font-normal text-gray-500">({data.work_logs.length} 筆)</span>
          </h3>
        </div>
        {data.work_logs.length === 0 ? (
          <div className="p-6 text-center text-gray-500">此期間沒有出勤記錄</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase">日期</th>
                  <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase">服務類型</th>
                  <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase">客戶</th>
                  <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase">司機</th>
                  <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase">日/夜</th>
                  <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase">起點</th>
                  <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase">終點</th>
                  <th className="px-3 py-3 text-right text-xs font-medium text-gray-500 uppercase">數量</th>
                  <th className="px-3 py-3 text-right text-xs font-medium text-gray-500 uppercase">單價</th>
                  <th className="px-3 py-3 text-right text-xs font-medium text-gray-500 uppercase">OT數量</th>
                  <th className="px-3 py-3 text-right text-xs font-medium text-gray-500 uppercase">OT單價</th>
                  <th className="px-3 py-3 text-right text-xs font-medium text-gray-500 uppercase">金額</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {data.work_logs.map((wl) => (
                  <tr key={wl.id} className="hover:bg-gray-50">
                    <td className="px-3 py-2 whitespace-nowrap text-sm">{wl.scheduled_date || '-'}</td>
                    <td className="px-3 py-2 whitespace-nowrap text-sm">{wl.service_type || '-'}</td>
                    <td className="px-3 py-2 whitespace-nowrap text-sm">{wl.client_name || '-'}</td>
                    <td className="px-3 py-2 whitespace-nowrap text-sm">{wl.employee_name || '-'}</td>
                    <td className="px-3 py-2 whitespace-nowrap text-sm">{wl.day_night || '-'}</td>
                    <td className="px-3 py-2 whitespace-nowrap text-sm">{wl.start_location || '-'}</td>
                    <td className="px-3 py-2 whitespace-nowrap text-sm">{wl.end_location || '-'}</td>
                    <td className="px-3 py-2 whitespace-nowrap text-sm text-right">{wl.quantity ?? '-'}</td>
                    <td className="px-3 py-2 whitespace-nowrap text-sm text-right">{wl.matched_rate != null ? formatMoney(wl.matched_rate) : '-'}</td>
                    <td className="px-3 py-2 whitespace-nowrap text-sm text-right">{wl.ot_quantity ?? '-'}</td>
                    <td className="px-3 py-2 whitespace-nowrap text-sm text-right">{wl.matched_ot_rate != null ? formatMoney(wl.matched_ot_rate) : '-'}</td>
                    <td className="px-3 py-2 whitespace-nowrap text-sm text-right font-medium">{formatMoney(wl.line_amount)}</td>
                  </tr>
                ))}
                <tr className="bg-gray-50 font-bold border-t-2 border-gray-300">
                  <td className="px-3 py-2 text-sm" colSpan={11}>合計</td>
                  <td className="px-3 py-2 text-sm text-right">{formatMoney(data.gross_revenue)}</td>
                </tr>
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Expenses Table */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-200">
          <h3 className="text-lg font-semibold text-gray-900">
            支出明細
            <span className="ml-2 text-sm font-normal text-gray-500">({data.expenses.length} 筆)</span>
          </h3>
        </div>
        {data.expenses.length === 0 ? (
          <div className="p-6 text-center text-gray-500">此期間沒有支出記錄</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">日期</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">項目</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">分類</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">供應商</th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">金額</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">備註</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {data.expenses.map((exp) => (
                  <tr key={exp.id} className="hover:bg-gray-50">
                    <td className="px-4 py-2 whitespace-nowrap text-sm">{exp.date}</td>
                    <td className="px-4 py-2 text-sm">{exp.item || '-'}</td>
                    <td className="px-4 py-2 whitespace-nowrap text-sm">{exp.category_name || '-'}</td>
                    <td className="px-4 py-2 whitespace-nowrap text-sm">{exp.supplier_name || '-'}</td>
                    <td className="px-4 py-2 whitespace-nowrap text-sm text-right font-medium text-orange-600">{formatMoney(exp.total_amount)}</td>
                    <td className="px-4 py-2 text-sm text-gray-500">{exp.remarks || '-'}</td>
                  </tr>
                ))}
                <tr className="bg-gray-50 font-bold border-t-2 border-gray-300">
                  <td className="px-4 py-2 text-sm" colSpan={4}>合計</td>
                  <td className="px-4 py-2 text-sm text-right text-orange-600">{formatMoney(data.total_expense)}</td>
                  <td></td>
                </tr>
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
